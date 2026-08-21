"""A sick gateway must not make the displays it serves look unreachable.

Taken from a real queue-log export (v0.1.327, 4 displays on one ESP32
gateway sitting at ~22 kB free heap). The gateway accepted each upload and
then failed to spawn its 12 kB transfer task:

    Gateway accepted transfer job 4a83a56fc98b4ac7; free heap 22200 bytes.
    -> transfer_task_start_failed

The display was never contacted - it was answering at -51 dBm the whole
time. But the queue recorded the failure against the *display*, which armed
the offline backoff, and the Home Assistant Bluetooth fallback that
automation.py submits immediately afterwards was then skipped:

    Automatic update skipped: display is unreachable or failed recently
    (0s ago; backing off for 59s).

Every one of the 38 failures in that export followed this shape, so nothing
reached four of the five displays for two hours while the fifth - on a
healthy gateway - updated every ten minutes without a miss.
"""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
import time
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_gateway_isolation_test"


def _load_queue_module():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package

    homeassistant = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = object
    helpers = types.ModuleType("homeassistant.helpers")
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = object
    sys.modules.update(
        {
            "homeassistant": homeassistant,
            "homeassistant.core": core,
            "homeassistant.helpers": helpers,
            "homeassistant.helpers.storage": storage,
        }
    )

    const = types.ModuleType(f"{PACKAGE}.const")
    const.DOMAIN = "dratek_eink"
    const.PANEL_VERSION = "test"
    sys.modules[const.__name__] = const

    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.queue", COMPONENT / "queue.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


queue_module = _load_queue_module()

ADDRESS = "FF:FF:94:20:10:78"


class FakeHass:
    def __init__(self):
        self.data = {}

    def async_create_task(self, coro, name):
        return asyncio.create_task(coro, name=name)


def _make_queue():
    queue = queue_module.TransferQueue(FakeHass())
    queue._loaded = True

    async def save_history():
        return None

    queue._save_history = save_history
    # The local-range probe imports homeassistant.components.bluetooth, which
    # the stub package above does not provide; its own except-branch already
    # answers True, but keep the intent explicit.
    queue._is_local_device_in_range = lambda address: True
    return queue


def _job(job_id: str, resource: str, transport_type: str) -> dict:
    return {
        "id": job_id,
        "resource": resource,
        "transport_type": transport_type,
        "transport_name": resource,
        "address": ADDRESS,
        "operation": "entity_update",
        "status": "queued",
        "created_at": 0,
        "started_at": None,
        "finished_at": None,
        "error": "",
        "log": [],
    }


class GatewayFailureIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def _run_gateway_failure(self, queue, error: str, gateway_side: bool):
        job = _job("gw", "gateway:sick", "gateway")
        queue._jobs = [job]

        async def runner(_add_log):
            return {"ok": False, "error": error, "gateway_side": gateway_side, "log": []}

        return await queue._execute(job, runner)

    async def test_out_of_heap_gateway_does_not_blacklist_the_display(self):
        queue = _make_queue()
        await self._run_gateway_failure(queue, "transfer_task_start_failed", True)

        self.assertNotIn(ADDRESS, queue._last_failure_at)
        self.assertEqual(queue._automatic_skip_reason(ADDRESS), "")

    async def test_the_bluetooth_fallback_actually_runs_after_a_gateway_failure(self):
        # The whole point: automation.py submits a local job straight after the
        # gateway path fails. That job used to be skipped before it started.
        queue = _make_queue()
        await self._run_gateway_failure(queue, "transfer_task_start_failed", True)

        fallback = _job("local", "local", "local")
        queue._jobs = [fallback]
        ran = False

        async def runner(_add_log):
            nonlocal ran
            ran = True
            return {"ok": True}

        result = await queue._execute(fallback, runner)

        self.assertTrue(ran, "the Bluetooth fallback was skipped instead of run")
        self.assertEqual(fallback["status"], "succeeded")
        self.assertIsNot(result.get("skipped"), True)

    async def test_a_display_side_failure_still_arms_the_offline_backoff(self):
        # ble_transfer_failed means the gateway did reach out and the display
        # did not answer. That backoff is correct and must stay.
        queue = _make_queue()
        await self._run_gateway_failure(queue, "ble_transfer_failed", False)

        self.assertIn(ADDRESS, queue._last_failure_at)
        self.assertIn("unreachable or failed recently", queue._automatic_skip_reason(ADDRESS))

    async def test_a_gateway_failure_backs_off_the_gateway_instead(self):
        queue = _make_queue()
        await self._run_gateway_failure(queue, "transfer_task_start_failed", True)

        self.assertTrue(queue._is_gateway_backing_off("gateway:sick"))

    async def test_a_successful_transfer_clears_the_gateway_backoff(self):
        queue = _make_queue()
        await self._run_gateway_failure(queue, "transfer_task_start_failed", True)

        job = _job("gw2", "gateway:sick", "gateway")
        queue._jobs = [job]

        async def runner(_add_log):
            return {"ok": True}

        await queue._execute(job, runner)

        self.assertFalse(queue._is_gateway_backing_off("gateway:sick"))


class GatewayRouteSelectionTests(unittest.IsolatedAsyncioTestCase):
    def test_a_backed_off_gateway_loses_to_a_healthy_one(self):
        queue = _make_queue()
        queue._gateway_failure_at["gateway:sick"] = time.monotonic()
        routes = [
            {"id": "sick", "rssi": -51},   # stronger, but out of heap
            {"id": "healthy", "rssi": -70},
        ]

        self.assertEqual(queue._select_gateway_route(routes)["id"], "healthy")

    def test_a_backed_off_gateway_is_still_used_when_it_is_the_only_one(self):
        # Skipping it outright would strand a display nothing else can hear.
        queue = _make_queue()
        queue._gateway_failure_at["gateway:sick"] = time.monotonic()
        routes = [{"id": "sick", "rssi": -51}]

        self.assertEqual(queue._select_gateway_route(routes)["id"], "sick")

    def test_the_backoff_expires(self):
        queue = _make_queue()
        queue._gateway_failure_at["gateway:sick"] = (
            time.monotonic() - queue_module.GATEWAY_BACKOFF_SECONDS - 1
        )
        routes = [{"id": "sick", "rssi": -51}, {"id": "healthy", "rssi": -70}]

        self.assertEqual(queue._select_gateway_route(routes)["id"], "sick")

    def test_rssi_still_decides_between_two_healthy_gateways(self):
        queue = _make_queue()
        routes = [{"id": "a", "rssi": -70}, {"id": "b", "rssi": -40}]

        self.assertEqual(queue._select_gateway_route(routes)["id"], "b")


if __name__ == "__main__":
    unittest.main()
