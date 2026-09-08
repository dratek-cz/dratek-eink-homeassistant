"""A job queued behind others must not spend its safety timeout standing still.

Taken from a real shelf-wide send: 100 displays, one gateway, which writes them
one at a time at ten to twenty seconds each. 43 of the 100 failed with
"Transfer exceeded the 600s safety timeout" at exactly 600 seconds after they
were created, and their logs held nothing but the routing line - they had never
been attempted. The timeout wrapped the wait for the transport lock, so being
Nth in line was itself what failed them.
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
PACKAGE = "dratek_queue_backlog_test"


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
    sys.modules.update({
        "homeassistant": homeassistant,
        "homeassistant.core": core,
        "homeassistant.helpers": helpers,
        "homeassistant.helpers.storage": storage,
    })

    const = types.ModuleType(f"{PACKAGE}.const")
    const.DOMAIN = "dratek_eink"
    const.PANEL_VERSION = "test"
    const.LOCAL_ROUTE_ID = "local"
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
        self.data = {}

    def async_create_task(self, coro, name):
        task = asyncio.create_task(coro, name=name)
        self.tasks.append(task)
        return task


def _job(index: int, resource: str = "gateway:dilna") -> dict:
    return {
        "id": f"job-{index}",
        "resource": resource,
        "transport_type": "gateway",
        "transport_name": "dílna",
        "address": f"FF:FF:92:81:00:{index:02X}",
        "operation": "design",
        "status": "queued",
        "created_at": 0,
        "started_at": None,
        "transfer_started_at": None,
        "finished_at": None,
        "error": "",
        "log": [],
    }


def _queue() -> "queue_module.TransferQueue":
    queue = queue_module.TransferQueue(FakeHass())
    queue._loaded = True

    async def save_history():
        return None

    queue._save_history = save_history
    return queue


class QueueWaitIsNotTransferTimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_job_held_behind_the_gateway_is_still_written(self) -> None:
        """The reproduction, compressed: one transport, two jobs, one lock.

        The first job holds the gateway for longer than the whole safety
        timeout. The second must still be attempted when its turn comes -
        under the old arrangement its budget was already spent waiting.
        """
        queue = _queue()
        first, second = _job(1), _job(2)
        queue._jobs = [first, second]
        written: list[str] = []
        release = asyncio.Event()

        async def slow_runner(add_log):
            add_log("Display accepted block 40/40 (100%).")
            written.append("first")
            await release.wait()
            return {"ok": True, "log": []}

        async def quick_runner(add_log):
            written.append("second")
            return {"ok": True, "log": []}

        held = asyncio.create_task(queue._execute(first, slow_runner))
        while "first" not in written:
            await asyncio.sleep(0)
        queued = asyncio.create_task(queue._execute(second, quick_runner))

        # Longer than TRANSFER_JOB_TIMEOUT_SECONDS of wall clock, without
        # actually sleeping for it: the timeout is driven by the event loop's
        # clock, so advancing that is enough to prove the point.
        loop = asyncio.get_running_loop()
        real_time = loop.time
        offset = queue_module.TRANSFER_JOB_TIMEOUT_SECONDS + 120
        loop.time = lambda: real_time() + offset  # type: ignore[method-assign]
        try:
            await asyncio.sleep(0)
            self.assertFalse(queued.done(), "the queued job must simply wait its turn")
            release.set()
            await held
            await queued
        finally:
            loop.time = real_time  # type: ignore[method-assign]

        self.assertEqual(["first", "second"], written)
        self.assertEqual("succeeded", second["status"])
        self.assertEqual("", second["error"])

    async def test_the_timeout_still_cuts_a_transfer_that_hangs(self) -> None:
        """The safety net itself must survive being moved."""
        queue = _queue()
        job = _job(3)
        queue._jobs = [job]

        async def hanging_runner(add_log):
            add_log("Streaming binary transfer job to gateway 192.168.1.130.")
            raise TimeoutError()

        result = await queue._execute(job, hanging_runner)

        self.assertEqual("failed", job["status"])
        self.assertIn("exceeded the 600s safety timeout", result["error"])
        self.assertIn("Streaming binary transfer job", result["error"])

    async def test_the_clock_starts_when_the_transport_is_actually_held(self) -> None:
        queue = _queue()
        job = _job(4)
        queue._jobs = [job]
        queue._locks["gateway:dilna"] = asyncio.Lock()

        async def runner(add_log):
            return {"ok": True, "log": []}

        before = int(time.time())
        await queue._execute(job, runner)
        self.assertGreaterEqual(job["transfer_started_at"], before)

    async def test_a_job_waiting_its_turn_is_not_judged_stale(self) -> None:
        """_is_active_job's yardstick is the transfer, not the queue.

        Measuring from pick-up declared every job past ten minutes of backlog
        dead - and on a hundred-display send the ones furthest back have waited
        longest while being perfectly valid. A job that has not reached its
        transport yet is judged by whether it is still being worked on.
        """
        queue = _queue()

        waiting = _job(5)
        waiting["status"] = "queued"
        waiting["started_at"] = int(time.time()) - 4000
        waiting["transfer_started_at"] = None
        alive = asyncio.get_running_loop().create_future()
        queue._job_tasks[waiting["id"]] = asyncio.create_task(
            asyncio.wait_for(alive, timeout=None)
        )
        try:
            self.assertTrue(queue._is_active_job(waiting), "a queued job is waiting, not stalled")

            # The zombie this backstop exists for: no live task behind it, so
            # it must stop wedging its display however recently it was picked up.
            zombie = _job(12)
            zombie["status"] = "writing"
            zombie["started_at"] = int(time.time())
            zombie["transfer_started_at"] = None
            self.assertFalse(queue._is_active_job(zombie))
        finally:
            alive.set_result(None)
            await queue._job_tasks[waiting["id"]]

        stalled = _job(6)
        stalled["status"] = "writing"
        stalled["transfer_started_at"] = (
            int(time.time()) - queue_module.TRANSFER_JOB_TIMEOUT_SECONDS - 120
        )
        self.assertFalse(queue._is_active_job(stalled))

        finished = _job(7)
        finished["status"] = "succeeded"
        self.assertFalse(queue._is_active_job(finished))

    async def test_a_long_wait_is_written_into_the_job_log(self) -> None:
        """"Nothing happened for ten minutes" should read as a queue position."""
        queue = _queue()
        job = _job(8)
        queue._jobs = [job]

        async def runner(add_log):
            return {"ok": True, "log": []}

        # The wait is measured with time.monotonic(), so that is what has to
        # move - the job really does acquire the lock immediately here.
        ticks = iter([0.0, 90.0])
        real_monotonic = queue_module.time.monotonic
        queue_module.time.monotonic = lambda: next(ticks, 90.0)
        try:
            await queue._execute(job, runner)
        finally:
            queue_module.time.monotonic = real_monotonic

        self.assertTrue(
            any("Waited 90s" in line and "gateway:dilna" in line for line in job["log"]),
            job["log"],
        )


class SucceededMeansTheSameOnBothRadiosTests(unittest.IsolatedAsyncioTestCase):
    """43 of 43 gateway transfers confirmed; 0 of 13 local ones did.

    The queue drew all 56 identically, which is the whole of "the queue says it
    went out and the display is blank".
    """

    async def test_a_confirmed_transfer_is_recorded_as_confirmed(self) -> None:
        queue = _queue()
        job = _job(9)
        queue._jobs = [job]

        async def runner(add_log):
            return {"ok": True, "log": [
                "Display accepted block 40/40 (100%).",
                queue_module.DISPLAY_RECEIPT_CONFIRMED_MARKER,
                "Gateway transfer job completed successfully.",
            ]}

        await queue._execute(job, runner)
        self.assertEqual("succeeded", job["status"])
        self.assertIs(True, job["confirmed"])

    async def test_an_unconfirmed_local_write_is_marked_as_such(self) -> None:
        queue = _queue()
        job = _job(10, resource="local")
        job["transport_type"] = "local"
        job["transport_name"] = "Home Assistant Bluetooth"
        queue._jobs = [job]

        async def runner(add_log):
            return {"ok": True, "log": [
                "Bluetooth queued block 40/40 (100%).",
                "All image blocks were handed off and the Bluetooth connection was kept "
                "open for the controller; no optional 05 08 confirmation was sent.",
                "Transfer completed.",
            ]}

        await queue._execute(job, runner)
        self.assertEqual("succeeded", job["status"])
        self.assertIs(False, job["confirmed"])

    async def test_the_diagnostic_entity_carries_it(self) -> None:
        queue = _queue()
        job = _job(11)
        queue._jobs = [job]

        async def runner(add_log):
            return {"ok": True, "log": [queue_module.DISPLAY_RECEIPT_CONFIRMED_MARKER]}

        await queue._execute(job, runner)
        self.assertIs(True, queue.last_transfer_diagnostic["confirmed"])


if __name__ == "__main__":
    unittest.main()
