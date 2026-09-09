"""A job held for a sleeping display must not keep the route it was given.

A shelf-wide send queues a hundred displays in one burst, and each one's
transport is chosen there and then from a three-second BLE scan. Displays
advertise intermittently, so a display that happened to be quiet in that window
is routed to Home Assistant's own adapter - the fallback taken when no gateway
reports hearing it.

That answer is fine for the first attempt and wrong for every one after it. The
job may then wait up to a day for the display to come back, and when it does
come back it is very often two metres from a gateway that can write it in ten
seconds, while the job still tries the local adapter that never reached it.

So the queue asks again before each retry of a waiting job. Only of a waiting
job: a transfer that failed part way through a stream is a real failure and is
reported as one, not quietly re-routed.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_gateway_failure_isolation import queue_module, _make_queue  # noqa: E402


ADDRESS = "FF:FF:92:81:64:85"
# What a caller must report for the queue to hold the job: nothing was written,
# the display was simply not there (see DISPLAY_UNREACHABLE_ERROR_MARKERS).
UNREACHABLE = {"ok": False, "error": "Could not connect to the display.", "log": []}


class WaitingJobReroutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        # The wait between attempts is a minute in production and is woken early
        # by discovery. Neither is the subject here, so it is shortened rather
        # than mocked out - the real waiting code still runs.
        self._poll = queue_module.DISPLAY_WAIT_POLL_SECONDS
        queue_module.DISPLAY_WAIT_POLL_SECONDS = 0.02

    def tearDown(self) -> None:
        queue_module.DISPLAY_WAIT_POLL_SECONDS = self._poll

    async def _run_queued(self, queue, **kwargs):
        """Submit the way a design send does - queued - and await the outcome."""
        submitted = await queue.async_submit(
            address=ADDRESS, operation="design", wait_for_completion=False, **kwargs
        )
        self.assertIs(submitted.get("queued"), True)
        return await queue._job_tasks[submitted["queue_job_id"]]

    async def test_a_waiting_job_asks_for_its_route_again(self):
        queue = _make_queue()
        attempts: list[str] = []

        async def local_runner(_add_log):
            attempts.append("local")
            return dict(UNREACHABLE)

        async def gateway_runner(_add_log):
            attempts.append("gateway")
            return {"ok": True}

        async def rebind():
            # Stands in for the gateway that only starts hearing this display
            # once it wakes up, well after the job was queued on local BLE.
            return ("gateway@192.168.1.130", "gateway", "dratek-gw", gateway_runner)

        result = await self._run_queued(
            queue,
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            runner=local_runner,
            rebind=rebind,
        )

        self.assertEqual(attempts, ["local", "gateway"])
        self.assertIs(result.get("ok"), True)
        job = queue._jobs[-1]
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(job["resource"], "gateway@192.168.1.130")
        self.assertEqual(job["transport_name"], "dratek-gw")
        self.assertTrue(
            any("Routing re-checked while waiting" in line for line in job["log"]),
            "the switch has to be visible in the job's own log",
        )

    async def test_a_failing_lookup_keeps_the_route_the_job_already_has(self):
        # A scan can fail, and a stale route is worse than a fresh one but much
        # better than none: the retry still has somewhere to go.
        queue = _make_queue()
        attempts: list[str] = []

        async def local_runner(_add_log):
            attempts.append("local")
            return {"ok": True} if len(attempts) > 1 else dict(UNREACHABLE)

        async def rebind():
            raise RuntimeError("gateway scan timed out")

        result = await self._run_queued(
            queue,
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            runner=local_runner,
            rebind=rebind,
        )

        self.assertEqual(attempts, ["local", "local"])
        self.assertIs(result.get("ok"), True)
        self.assertEqual(queue._jobs[-1]["resource"], "local")
        self.assertTrue(
            any("Could not re-check routing" in line for line in queue._jobs[-1]["log"]),
            "a failed lookup has to say so rather than pass silently",
        )

    async def test_a_real_failure_is_reported_not_rerouted(self):
        # The rebinder exists for held jobs only. Something that broke part way
        # through a stream means the display was there and a fault is real.
        queue = _make_queue()
        rebound = False

        async def rebind():
            nonlocal rebound
            rebound = True
            return None

        async def runner(_add_log):
            return {"ok": False, "error": "Transfer failed part way through.", "log": []}

        await self._run_queued(
            queue,
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            runner=runner,
            rebind=rebind,
        )

        self.assertFalse(rebound, "a real failure must be reported, not re-routed")
        self.assertEqual(queue._jobs[-1]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
