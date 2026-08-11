"""Regression tests for automatic Bluetooth queue recovery."""

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
        # A real HomeAssistant always has this, and TransferQueue now reaches
        # for it: the shared radio slot every physical transfer holds lives in
        # hass.data. A double without it fails the transfer before the runner
        # is ever called, which reads as a hung test rather than a broken one.
        self.data = {}

    def async_create_task(self, coro, name):
        task = asyncio.create_task(coro, name=name)
        self.tasks.append(task)
        return task


class TransferQueueRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_safety_timeout_reports_the_last_transfer_step(self):
        queue = queue_module.TransferQueue(FakeHass())
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
        queue = queue_module.TransferQueue(FakeHass())
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
        queue = queue_module.TransferQueue(FakeHass())
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
        queue = queue_module.TransferQueue(FakeHass())
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

    async def test_two_gateways_take_turns_instead_of_transmitting_at_once(self):
        """Independent transports still share one 2.4 GHz band.

        Two gateways used to write in parallel, because in software they really
        are independent: different transport locks, different displays. The
        radio is not. A gateway transmitting on top of another transfer does not
        make it fail, it makes it lose connection events - which is how a
        ten-second transfer quietly became a five-minute one on the one
        installation that had gateways attached.

        Both transfers are still accepted immediately and both still complete;
        they just no longer overlap. That is the throughput being traded away on
        purpose. See radio.py.
        """
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        active_gateways: set[str] = set()
        peak_concurrent = 0

        def gateway_runner(gateway_id):
            async def runner(_add_log):
                nonlocal peak_concurrent
                active_gateways.add(gateway_id)
                peak_concurrent = max(peak_concurrent, len(active_gateways))
                # Long enough that a genuinely parallel second transfer would
                # be observed inside this window.
                await asyncio.sleep(0.05)
                active_gateways.discard(gateway_id)
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

        # Neither submission blocks on the other: queueing is still immediate.
        self.assertTrue(first_result["queued"])
        self.assertTrue(second_result["queued"])

        await asyncio.gather(*hass.tasks)

        self.assertEqual(
            peak_concurrent,
            1,
            "two gateways transmitted into the same band at the same time",
        )
        self.assertTrue(all(job["status"] == "succeeded" for job in queue._jobs))


class QueueCancelJobTests(unittest.IsolatedAsyncioTestCase):
    """async_cancel_job may only ever interrupt a job still waiting its turn."""

    @staticmethod
    async def _noop_save_history():
        return None

    async def test_cancel_while_queued_finalizes_as_skipped(self):
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True
        queue._save_history = self._noop_save_history

        first_started = asyncio.Event()
        release_first = asyncio.Event()

        async def first_runner(_add_log):
            first_started.set()
            await release_first.wait()
            return {"ok": True}

        async def second_runner(_add_log):
            return {"ok": True}

        await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="AA:AA:AA:AA:AA:AA",
            operation="design",
            runner=first_runner,
            wait_for_completion=False,
        )
        await first_started.wait()
        # Same address as the first job, so it contends for the same device
        # lock and stays "queued" - never reaches _execute's "writing" line.
        second_result = await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="AA:AA:AA:AA:AA:AA",
            operation="design",
            runner=second_runner,
            wait_for_completion=False,
        )
        second_job_id = second_result["queue_job_id"]
        second_task = queue._job_tasks[second_job_id]
        # Let the second task actually run its first step (reach the point
        # where it is genuinely suspended waiting on the shared device lock)
        # before cancelling it - cancelling a task that hasn't started yet
        # sets Task._must_cancel instead, which throws CancelledError in
        # before _run() ever executes, a different (and untested) code path.
        await asyncio.sleep(0)
        snapshot = await queue.async_snapshot()
        self.assertEqual(1, snapshot["queued"])

        self.assertTrue(queue.async_cancel_job(second_job_id))
        # First job is still deliberately blocked, so the only pending work is
        # the cancellation itself - awaiting it directly avoids racing against
        # release_first's wakeup for scheduling order.
        result = await second_task

        second_job = next(j for j in queue._jobs if j["id"] == second_job_id)
        self.assertEqual("skipped", second_job["status"])
        self.assertEqual("skipped", result["queue_status"])
        self.assertIn("Transfer cancelled by user before it started.", second_job["log"])

        release_first.set()
        await asyncio.gather(*hass.tasks, return_exceptions=True)

    async def test_cancel_while_writing_is_refused(self):
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True
        queue._save_history = self._noop_save_history

        started = asyncio.Event()
        release = asyncio.Event()

        async def runner(_add_log):
            started.set()
            await release.wait()
            return {"ok": True}

        result = await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address="AA:AA:AA:AA:AA:AA",
            operation="design",
            runner=runner,
            wait_for_completion=False,
        )
        await started.wait()
        job_id = result["queue_job_id"]
        snapshot = await queue.async_snapshot()
        self.assertEqual(1, snapshot["writing"])

        # A physical transfer may be mid-block - never abort it, same rule
        # _preempt_automatic_update already follows for the same reason.
        self.assertFalse(queue.async_cancel_job(job_id))

        release.set()
        await asyncio.gather(*hass.tasks)

        job = next(j for j in queue._jobs if j["id"] == job_id)
        self.assertEqual("succeeded", job["status"])

    async def test_cancel_of_unknown_job_id_returns_false(self):
        hass = FakeHass()
        queue = queue_module.TransferQueue(hass)
        queue._loaded = True
        self.assertFalse(queue.async_cancel_job("does-not-exist"))


class CancelledJobDoesNotWedgeAutomationTests(unittest.IsolatedAsyncioTestCase):
    """A cancelled transfer used to silence a display's automatic updates for good.

    CancelledError is a BaseException, so it escaped _execute's `except
    Exception` with the job still marked "writing". _prune keeps every active
    job forever and _automatic_skip_reason counts any of them as an active
    transfer, so from then on every automatic update for that address was
    merged away - the display refreshed once and then never again. The refresh
    task is cancelled by async_set_config on every manual upload, which is the
    ordinary way a user hits this.
    """

    ADDRESS = "FF:FF:94:20:10:78"

    def _queue(self):
        queue = self.__class__.queue_for_test = queue_module.TransferQueue(FakeHass())
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        return queue

    async def _submit_automatic(self, queue, runner):
        return await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address=self.ADDRESS,
            operation="entity_update",
            runner=runner,
        )

    async def test_a_cancelled_transfer_is_finalised_instead_of_left_writing(self):
        queue = self._queue()
        writing = asyncio.Event()

        async def blocking_runner(_add_log):
            writing.set()
            await asyncio.sleep(3600)
            return {"ok": True}

        task = asyncio.create_task(self._submit_automatic(queue, blocking_runner))
        await writing.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task

        job = queue._jobs[-1]
        self.assertNotIn(job["status"], {"queued", "writing"}, "the job is still counted as active")
        self.assertIsNotNone(job["finished_at"])

    async def test_the_next_automatic_update_still_runs(self):
        queue = self._queue()
        writing = asyncio.Event()

        async def blocking_runner(_add_log):
            writing.set()
            await asyncio.sleep(3600)
            return {"ok": True}

        task = asyncio.create_task(self._submit_automatic(queue, blocking_runner))
        await writing.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task

        ran = asyncio.Event()

        async def second_runner(_add_log):
            ran.set()
            return {"ok": True, "log": []}

        result = await self._submit_automatic(queue, second_runner)

        self.assertTrue(ran.is_set(), "the next automatic update was merged away instead of running")
        self.assertNotIn("skipped", result)

    async def test_a_job_outliving_its_own_timeout_stops_blocking_new_updates(self):
        # The backstop for a runner that dies some other way: nothing legitimate
        # outlives the transfer timeout, so such a job must stop counting as an
        # active transfer rather than wedging the address for the whole session.
        queue = self._queue()
        queue._jobs = [{
            "id": "zombie", "resource": "local", "transport_type": "local",
            "transport_name": "Bluetooth", "address": self.ADDRESS,
            "operation": "entity_update", "status": "writing",
            "created_at": 0, "started_at": 0, "finished_at": None, "error": "", "log": [],
        }]
        self.assertEqual("", queue._automatic_skip_reason(self.ADDRESS))

        # A transfer that started just now is of course still active.
        queue._jobs[0]["started_at"] = int(time.time())
        self.assertIn("active transfer", queue._automatic_skip_reason(self.ADDRESS))

    async def test_failed_automatic_update_triggers_backoff(self):
        queue = self._queue()

        async def failing_runner(_add_log):
            return {"ok": False, "error": "Display unreachable."}

        result = await self._submit_automatic(queue, failing_runner)
        self.assertFalse(result.get("ok"))
        skip_reason = queue._automatic_skip_reason(self.ADDRESS)
        self.assertIn("unreachable or failed recently", skip_reason)

    async def test_manual_upload_bypasses_failure_backoff(self):
        queue = self._queue()

        async def failing_runner(_add_log):
            return {"ok": False, "error": "Display unreachable."}

        await self._submit_automatic(queue, failing_runner)
        self.assertIn("unreachable or failed recently", queue._automatic_skip_reason(self.ADDRESS))

        ran = asyncio.Event()

        async def manual_runner(_add_log):
            ran.set()
            return {"ok": True, "log": []}

        result = await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address=self.ADDRESS,
            operation="design",
            runner=manual_runner,
        )
        self.assertTrue(ran.is_set())
        self.assertEqual(result.get("queue_status"), "succeeded")
        self.assertEqual("", queue._automatic_skip_reason(self.ADDRESS))


if __name__ == "__main__":
    unittest.main()

