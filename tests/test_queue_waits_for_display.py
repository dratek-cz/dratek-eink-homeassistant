"""An upload to a display that is not answering waits in the queue.

A display can be out of range, asleep behind a closed door, or simply between
advertisements for longer than a scan window. Sending a design to it used to
fail the job outright, so the work was lost and the only recourse was to notice
and press send again once the display came back.

It now behaves like a print queue: the job is held as "queued", re-attempted
when discovery hears the display again (or once a minute regardless), and can
be cancelled from the queue for as long as it is waiting. The hold is narrow on
purpose - only a manual upload, only one submitted in the background, and only
when the failure says the transfer never reached the display at all.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import sys
import time
import unittest

# The queue module is loaded through the fake-package loader in
# test_transfer_queue_retry (Home Assistant is not installed); reuse it rather
# than standing up a second copy, which would give the two modules separate
# constants and make patching one of them silently ineffective.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_transfer_queue_retry import FakeHass, queue_module  # noqa: E402


class WaitingUploadTests(unittest.IsolatedAsyncioTestCase):
    ADDRESS = "FF:FF:94:20:10:78"
    UNREACHABLE = {"ok": False, "error": "Could not connect to the display."}

    def _queue(self):
        queue = queue_module.TransferQueue(FakeHass())
        queue._loaded = True

        async def save_history():
            return None

        queue._save_history = save_history
        # Keep the poll floor out of the way; every test here drives the job
        # through the discovery wake-up instead of waiting out a real minute.
        queue_module.DISPLAY_WAIT_POLL_SECONDS = 30
        return queue

    async def _submit_design(self, queue, runner, **kwargs):
        return await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address=self.ADDRESS,
            operation="design",
            runner=runner,
            wait_for_completion=False,
            **kwargs,
        )

    async def _wait_until(self, predicate, timeout=2.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            await asyncio.sleep(0.01)
        return False

    async def test_an_unreachable_display_holds_the_job_instead_of_failing_it(self):
        queue = self._queue()
        attempts = 0

        async def runner(_add_log):
            nonlocal attempts
            attempts += 1
            return dict(self.UNREACHABLE)

        result = await self._submit_design(queue, runner)
        self.assertTrue(result["queued"])

        job = queue._jobs[-1]
        self.assertTrue(
            await self._wait_until(lambda: job.get("waiting_for_display") is True),
            "the job should be waiting for the display",
        )
        # Still queued - which is what keeps it visible as pending work and
        # keeps its cancel button live.
        self.assertEqual(job["status"], "queued")
        self.assertIsNone(job["finished_at"])
        self.assertGreaterEqual(attempts, 1)

        queue.async_cancel_job(job["id"])
        self.assertTrue(
            await self._wait_until(lambda: job["status"] not in {"queued", "writing"}),
            "cancelling a waiting job must finish it",
        )

    async def test_the_display_coming_back_sends_the_held_upload(self):
        queue = self._queue()
        attempts = 0

        async def runner(_add_log):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                return dict(self.UNREACHABLE)
            return {"ok": True}

        await self._submit_design(queue, runner)
        job = queue._jobs[-1]
        self.assertTrue(await self._wait_until(lambda: job.get("waiting_for_display") is True))

        # This is what discovery calls the moment it hears the display.
        queue.async_notify_display_seen(self.ADDRESS)

        self.assertTrue(
            await self._wait_until(lambda: job["status"] == "succeeded"),
            f"the held upload should have gone out; status={job['status']}",
        )
        self.assertEqual(attempts, 2)
        # And the badge is cleared, so the queue does not keep saying it waits.
        self.assertNotIn("waiting_for_display", job)

    async def test_a_cancelled_waiting_job_is_never_written(self):
        queue = self._queue()
        attempts = 0

        async def runner(_add_log):
            nonlocal attempts
            attempts += 1
            return dict(self.UNREACHABLE)

        await self._submit_design(queue, runner)
        job = queue._jobs[-1]
        self.assertTrue(await self._wait_until(lambda: job.get("waiting_for_display") is True))

        self.assertTrue(queue.async_cancel_job(job["id"]))
        self.assertTrue(await self._wait_until(lambda: job["status"] not in {"queued", "writing"}))

        attempts_at_cancel = attempts
        # Even if the display turns up straight afterwards, a cancelled job
        # must stay cancelled.
        queue.async_notify_display_seen(self.ADDRESS)
        await asyncio.sleep(0.05)
        self.assertEqual(attempts, attempts_at_cancel)
        self.assertIsNotNone(job["finished_at"])

    async def test_a_failure_part_way_through_a_stream_is_a_real_failure(self):
        # The display answered - something else broke. Holding that would hide
        # a genuine fault behind an upload that looks like it is still coming.
        queue = self._queue()
        attempts = 0

        async def runner(_add_log):
            nonlocal attempts
            attempts += 1
            return {"ok": False, "error": "Image block 42 write failed: disconnected"}

        await self._submit_design(queue, runner)
        job = queue._jobs[-1]
        self.assertTrue(await self._wait_until(lambda: job["status"] == "failed"))
        self.assertNotIn("waiting_for_display", job)
        self.assertEqual(attempts, 1)

    async def test_a_gateway_side_failure_is_not_held(self):
        # ws_sending.py already falls back to another route for these, and the
        # display was never contacted.
        queue = self._queue()

        async def runner(_add_log):
            return {
                "ok": False,
                "error": "transfer_task_start_failed",
                "gateway_side": True,
            }

        await self._submit_design(queue, runner)
        job = queue._jobs[-1]
        self.assertTrue(await self._wait_until(lambda: job["status"] == "failed"))
        self.assertNotIn("waiting_for_display", job)

    async def test_an_automatic_update_is_not_held(self):
        # An automatic refresh has its own next tick; a held one would put a
        # stale image on the panel whenever the display came back.
        queue = self._queue()

        async def runner(_add_log):
            return dict(self.UNREACHABLE)

        await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Bluetooth",
            address=self.ADDRESS,
            operation="entity_update",
            runner=runner,
            wait_for_completion=False,
        )
        job = queue._jobs[-1]
        self.assertTrue(await self._wait_until(lambda: job["status"] == "failed"))
        self.assertNotIn("waiting_for_display", job)

    async def test_a_caller_waiting_on_the_result_is_never_held(self):
        # The "send text" websocket command awaits its job. Holding it would
        # hang the call for a day instead of queueing anything.
        queue = self._queue()

        async def runner(_add_log):
            return dict(self.UNREACHABLE)

        result = await asyncio.wait_for(
            queue.async_submit(
                resource="local",
                transport_type="local",
                transport_name="Bluetooth",
                address=self.ADDRESS,
                operation="text",
                runner=runner,
                wait_for_completion=True,
            ),
            timeout=5,
        )
        self.assertIs(result["ok"], False)
        self.assertEqual(queue._jobs[-1]["status"], "failed")

    async def test_the_wait_gives_up_once_the_deadline_passes(self):
        queue = self._queue()
        original = queue_module.DISPLAY_WAIT_MAX_SECONDS
        queue_module.DISPLAY_WAIT_MAX_SECONDS = 0
        try:
            async def runner(_add_log):
                return dict(self.UNREACHABLE)

            await self._submit_design(queue, runner)
            job = queue._jobs[-1]
            self.assertTrue(await self._wait_until(lambda: job["status"] == "failed"))
            self.assertNotIn("waiting_for_display", job)
            self.assertIn("neozval", job["error"])
        finally:
            queue_module.DISPLAY_WAIT_MAX_SECONDS = original


class WaitingUploadWiringTests(unittest.TestCase):
    """The parts that cannot be exercised without Home Assistant itself."""

    def test_the_scan_wakes_a_waiting_job(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source = (
            root / "custom_components" / "dratek_eink" / "ws_devices.py"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "get_transfer_queue(hass).async_notify_display_seen(address)", source
        )
        # It must sit on the "seen in this scan" branch, not the retained one.
        seen_branch = source.split('device["temporarily_unseen"] = False')[1]
        self.assertIn("async_notify_display_seen", seen_branch.split("for address,")[0])

    def test_the_queue_tab_explains_a_held_upload_and_keeps_cancel(self) -> None:
        root = Path(__file__).resolve().parents[1]
        mixin = (
            root / "custom_components" / "dratek_eink" / "frontend" / "panel"
            / "panel-queue.mixin.js"
        ).read_text(encoding="utf-8")
        self.assertIn("_queueJobIsWaitingForDisplay(job) {", mixin)
        self.assertIn("Čeká na displej", mixin)
        # The cancel button is still gated on "queued", which is exactly the
        # status a held job keeps - that is the point of holding it there.
        self.assertIn('status === "queued" ? `<button', mixin)
        self.assertIn("Zrušit čekající nahrání", mixin)


if __name__ == "__main__":
    unittest.main()
