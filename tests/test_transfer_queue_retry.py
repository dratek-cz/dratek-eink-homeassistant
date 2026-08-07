"""Regression tests for automatic Bluetooth queue recovery."""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_queue_test"


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


class FakeHass:
    def __init__(self):
        self.tasks = []

    def async_create_task(self, coro, name):
        task = asyncio.create_task(coro, name=name)
        self.tasks.append(task)
        return task


class TransferQueueRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_safety_timeout_reports_the_last_transfer_step(self):
        queue = queue_module.TransferQueue(object())
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        job = {
            "id": "timeout",
            "resource": "local",
            "transport_type": "local",
            "transport_name": "Bluetooth",
            "address": "FF:FF:94:20:10:78",
            "operation": "design",
            "status": "queued",
            "created_at": 0,
            "started_at": None,
            "finished_at": None,
            "error": "",
            "log": [],
        }
        queue._jobs = [job]

        async def runner(add_log):
            add_log("Display accepted block 11/124 (8%).")
            raise TimeoutError()

        result = await queue._execute(job, runner)

        self.assertIn("exceeded the 600s safety timeout", result["error"])
        self.assertIn("Last step: Display accepted block 11/124 (8%).", result["error"])

    async def test_empty_platform_exception_is_returned_with_its_type(self):
        queue = queue_module.TransferQueue(object())
        queue._loaded = True
        queue._jobs = []

        async def save_history():
            return None

        queue._save_history = save_history
        job = {
            "id": "empty-error",
            "resource": "local",
            "transport_type": "local",
            "transport_name": "Bluetooth",
            "address": "FF:FF:94:20:10:78",
            "operation": "design",
            "status": "queued",
            "created_at": 0,
            "started_at": None,
            "finished_at": None,
            "error": "",
            "log": [],
        }
        queue._jobs.append(job)

        async def runner(_add_log):
            raise RuntimeError()

        result = await queue._execute(job, runner)

        self.assertFalse(result["ok"])
        self.assertEqual(
            result["error"],
            "RuntimeError: Bluetooth transfer failed without a platform error message.",
        )
        self.assertEqual(job["error"], result["error"])

    async def test_automatic_update_retries_after_connection_slot_error(self):
        queue = queue_module.TransferQueue(object())
        queue_module.AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS = 0
        job = {"operation": "entity_update", "status": "writing"}
        attempts = 0
        log: list[str] = []

        async def runner(add_log):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError(
                    "No backend with an available connection slot that can reach address "
                    "FF:FF:92:81:46:32 was found"
                )
            add_log("Transfer completed.")
            return {"ok": True}

        result = await queue._run_with_automatic_bluetooth_retry(job, runner, log.append)

        self.assertTrue(result["ok"])
        self.assertEqual(attempts, 2)
        self.assertEqual(job["status"], "writing")
        self.assertTrue(any("temporarily unavailable" in line for line in log))

    async def test_manual_update_receives_automatic_retry(self):
        queue = queue_module.TransferQueue(object())
        job = {"operation": "design", "status": "writing"}
        attempts = 0

        async def runner(_add_log):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("No backend with an available connection slot was found")
            return {"ok": True}

        result = await queue._run_with_automatic_bluetooth_retry(job, runner, lambda _line: None)
        self.assertTrue(result["ok"])
        self.assertEqual(attempts, 2)


    async def test_editor_transfers_can_be_queued_while_another_is_writing(self):
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        first_started = asyncio.Event()
        release_first = asyncio.Event()
        order = []

        async def first_runner(_add_log):
            order.append("first-start")
            first_started.set()
            await release_first.wait()
            order.append("first-end")
            return {"ok": True}

        async def second_runner(_add_log):
            order.append("second-start")
            order.append("second-end")
            return {"ok": True}

        first_result = await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="aa:bb:cc:dd:ee:ff",
            operation="design",
            runner=first_runner,
            wait_for_completion=False,
        )
        await first_started.wait()
        second_result = await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="aa:bb:cc:dd:ee:ff",
            operation="design",
            runner=second_runner,
            wait_for_completion=False,
        )

        snapshot = await queue.async_snapshot()
        self.assertTrue(first_result["queued"])
        self.assertTrue(second_result["queued"])
        self.assertNotEqual(first_result["queue_job_id"], second_result["queue_job_id"])
        self.assertEqual(snapshot["writing"], 1)
        self.assertEqual(snapshot["queued"], 1)
        self.assertEqual(snapshot["backend_version"], "test")

        release_first.set()
        await asyncio.gather(*hass.tasks)

        self.assertEqual(order, ["first-start", "first-end", "second-start", "second-end"])
        self.assertTrue(all(job["status"] == "succeeded" for job in queue._jobs))

    async def test_retry_cooldown_does_not_block_other_displays_on_the_transport(self):
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        original_delay = queue_module.AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS
        queue_module.AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS = 0.3
        self.addCleanup(
            setattr,
            queue_module,
            "AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS",
            original_delay,
        )

        cooldown_started = asyncio.Event()
        other_started = asyncio.Event()
        attempts = 0

        async def automatic_runner(_add_log):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                cooldown_started.set()
                raise RuntimeError(
                    "No backend with an available connection slot was found"
                )
            return {"ok": True}

        async def other_runner(_add_log):
            other_started.set()
            return {"ok": True}

        await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="aa:bb:cc:dd:ee:01",
            operation="entity_update",
            runner=automatic_runner,
            wait_for_completion=False,
        )
        await asyncio.wait_for(cooldown_started.wait(), timeout=1)

        await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="aa:bb:cc:dd:ee:02",
            operation="design",
            runner=other_runner,
            wait_for_completion=False,
        )

        # Every local display shares the "local" transport. Waiting out the retry
        # cooldown while holding that lock would stall all of them, so the second
        # display has to start well before the 0.3s cooldown elapses.
        await asyncio.wait_for(other_started.wait(), timeout=0.2)

        await asyncio.gather(*hass.tasks)
        self.assertEqual(attempts, 2)

    async def test_two_gateways_can_write_to_different_displays_in_parallel(self):
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        both_started = asyncio.Event()
        release_transfers = asyncio.Event()
        active_gateways = set()

        def gateway_runner(gateway_id):
            async def runner(_add_log):
                active_gateways.add(gateway_id)
                if len(active_gateways) == 2:
                    both_started.set()
                await release_transfers.wait()
                return {"ok": True}

            return runner

        first_result = await queue.async_submit(
            resource="gateway:gateway-a",
            transport_type="gateway",
            transport_name="Gateway A",
            address="aa:bb:cc:dd:ee:01",
            operation="design",
            runner=gateway_runner("gateway-a"),
            wait_for_completion=False,
        )
        second_result = await queue.async_submit(
            resource="gateway:gateway-b",
            transport_type="gateway",
            transport_name="Gateway B",
            address="aa:bb:cc:dd:ee:02",
            operation="design",
            runner=gateway_runner("gateway-b"),
            wait_for_completion=False,
        )

        await asyncio.wait_for(both_started.wait(), timeout=1)
        snapshot = await queue.async_snapshot()
        self.assertTrue(first_result["queued"])
        self.assertTrue(second_result["queued"])
        self.assertEqual(snapshot["writing"], 2)
        self.assertEqual(snapshot["queued"], 0)

        release_transfers.set()
        await asyncio.gather(*hass.tasks)
        self.assertTrue(all(job["status"] == "succeeded" for job in queue._jobs))


if __name__ == "__main__":
    unittest.main()
