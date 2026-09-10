"""A failed write in a shelf-wide broadcast returns to the end of the queue.

From a real 100-display run on v1.0.6 (export 1789036065568), with the routing
latch already fixed so the work was properly spread over four gateways:

    succeeded 67   failed 33
    34  dratek-eink-4c646c        (192.168.1.188)
    33  dratek-eink-gateway-...   (192.168.1.159)
    16  ...129    15  ...130    2  Home Assistant Bluetooth

Twenty-eight of the thirty-three failures were one error:

    Cannot connect to host 192.168.1.188:80 ... Connect call failed

The gateways drop off the network in correlated bursts - measured from
outside, ICMP and HTTP fail together, and on at least one box
wifi_disconnect_count did not move while it was unreachable, so it believed it
was connected the whole time. That is being chased separately in the firmware.
What it means for the queue is the point here: on a shelf this size, a write
failing because its radio blinked is *ordinary*, and a third of the shelf
finishing in a "failed" row that nobody can act on is not an acceptable
outcome for a broadcast.

So a submission may now carry a retry budget. When such a job fails, the same
work is appended to the **end** of the queue.

The end, not the front, and that is the whole design:

  * a display that just failed is the least likely to succeed if retried at
    once - its radio is busy, the gateway serving it is backing off, or the
    panel is still refreshing from the previous job. Ninety other displays
    later, all three have passed.
  * one unreachable display can never stall the shelf queued behind it.

Opt-in per submission, because "try it again later" is only right when
something is going to write the whole shelf anyway. A single manual upload
that fails should say so.
"""

from __future__ import annotations

import asyncio
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_gateway_failure_isolation import queue_module, _make_queue  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
ADDRESS = "FF:FF:92:81:70:01"


async def _drain() -> None:
    """Let the queue's background job tasks run to completion."""
    for _ in range(60):
        pending = [
            task
            for task in asyncio.all_tasks()
            if task is not asyncio.current_task() and not task.done()
        ]
        if not pending:
            return
        await asyncio.wait(pending, timeout=2)


class RequeueBehaviourTests(unittest.IsolatedAsyncioTestCase):
    async def _submit(self, queue, outcomes, retry_budget, address=ADDRESS):
        """Submit one job whose runner fails/succeeds per `outcomes`."""
        attempts = {"n": 0}

        async def runner(_add_log):
            index = attempts["n"]
            attempts["n"] += 1
            ok = outcomes[index] if index < len(outcomes) else True
            if ok:
                return {"ok": True, "address": address, "log": []}
            return {
                "ok": False,
                "address": address,
                "error": "Cannot connect to host 192.168.1.188:80",
                "log": [],
            }

        await queue.async_submit(
            resource="gateway@192.168.1.188",
            transport_type="gateway",
            transport_name="dratek-eink-4c646c (192.168.1.188)",
            address=address,
            operation="design",
            runner=runner,
            wait_for_completion=False,
            retry_budget=retry_budget,
        )
        await _drain()
        return attempts["n"]

    async def test_a_failed_job_is_queued_again(self):
        queue = _make_queue()
        tries = await self._submit(queue, [False, True], retry_budget=3)
        self.assertEqual(2, tries, "the work was not attempted a second time")
        self.assertEqual(
            ["failed", "succeeded"], [job["status"] for job in queue._jobs]
        )

    async def test_the_retry_runs_behind_work_that_was_already_queued(self):
        # The property, stated in runs rather than in list positions: _prune
        # reorders _jobs by completion, so an index into it is not queue order.
        #
        # Two displays on the same gateway, so the resource lock serialises
        # them in submission order. A fails, B is submitted straight after. If
        # A's retry went to the front it would run before B; at the back it
        # runs after.
        queue = _make_queue()
        order: list[str] = []

        def runner_for(tag, outcomes):
            state = {"n": 0}

            async def runner(_add_log):
                index = state["n"]
                state["n"] += 1
                order.append(f"{tag}{index + 1}")
                ok = outcomes[index] if index < len(outcomes) else True
                if ok:
                    return {"ok": True, "address": ADDRESS, "log": []}
                return {"ok": False, "address": ADDRESS, "error": "gw down", "log": []}

            return runner

        async def submit(tag, address, runner, budget):
            await queue.async_submit(
                resource="gateway@192.168.1.188",
                transport_type="gateway",
                transport_name="dratek-eink-4c646c (192.168.1.188)",
                address=address,
                operation="design",
                runner=runner,
                wait_for_completion=False,
                retry_budget=budget,
            )

        await submit("A", "FF:FF:00:00:00:0A", runner_for("A", [False, True]), 3)
        await submit("B", "FF:FF:00:00:00:0B", runner_for("B", [True]), 0)
        await _drain()

        self.assertEqual(
            ["A1", "B1", "A2"],
            order,
            "A's retry must wait behind B, which was already in the queue",
        )

    async def test_the_budget_is_spent_and_then_the_job_stays_failed(self):
        queue = _make_queue()
        tries = await self._submit(queue, [False] * 10, retry_budget=2)
        self.assertEqual(3, tries, "one attempt plus two retries")
        self.assertTrue(all(job["status"] == "failed" for job in queue._jobs))
        self.assertEqual([1, 2, 3], [job["attempt"] for job in queue._jobs])
        self.assertEqual([2, 1, 0], [job["retry_budget"] for job in queue._jobs])

    async def test_without_a_budget_nothing_is_retried(self):
        queue = _make_queue()
        tries = await self._submit(queue, [False, True], retry_budget=0)
        self.assertEqual(1, tries, "a plain submission must fail once and stop")
        self.assertEqual(1, len(queue._jobs))

    async def test_a_success_never_requeues(self):
        queue = _make_queue()
        tries = await self._submit(queue, [True], retry_budget=3)
        self.assertEqual(1, tries)
        self.assertEqual(1, len(queue._jobs))

    async def test_the_retry_says_which_attempt_it_is(self):
        # Otherwise the queue tab shows what looks like a duplicate row for the
        # same display and nobody can tell a retry from a double submission.
        queue = _make_queue()
        await self._submit(queue, [False, True], retry_budget=3)
        first, second = queue._jobs
        self.assertIn("konec fronty", " ".join(first["log"]))
        self.assertTrue(
            any("2. pokus" in line for line in second["log"]),
            f"the retry does not identify itself: {second['log']}",
        )

    async def test_a_cancelled_transfer_is_not_brought_back(self):
        queue = _make_queue()
        attempts = {"n": 0}

        async def runner(_add_log):
            attempts["n"] += 1
            return {
                "ok": False,
                "address": ADDRESS,
                "error": "Transfer cancelled.",
                "log": [],
            }

        await queue.async_submit(
            resource="gateway@192.168.1.188",
            transport_type="gateway",
            transport_name="gw",
            address=ADDRESS,
            operation="design",
            runner=runner,
            wait_for_completion=False,
            retry_budget=3,
        )
        await _drain()
        self.assertEqual(
            1, attempts["n"], "a transfer the user cancelled must stay cancelled"
        )

    async def test_a_retry_is_not_awaited_by_the_original_caller(self):
        # A caller that waited for the first attempt is waiting for a result it
        # can show now. Blocking it until the retry finishes - potentially an
        # hour later, behind the rest of the shelf - would hang the websocket
        # call that submitted it.
        queue = _make_queue()

        async def runner(_add_log):
            return {"ok": False, "address": ADDRESS, "error": "boom", "log": []}

        result = await asyncio.wait_for(
            queue.async_submit(
                resource="gateway@192.168.1.188",
                transport_type="gateway",
                transport_name="gw",
                address=ADDRESS,
                operation="design",
                runner=runner,
                wait_for_completion=True,
                retry_budget=2,
            ),
            timeout=10,
        )
        self.assertIs(False, result.get("ok"))
        await _drain()


class RequeuePlumbingTests(unittest.TestCase):
    """The budget has to reach the queue from the panel, through every path."""

    def test_every_submit_path_in_the_send_route_carries_it(self) -> None:
        source = (COMPONENT / "ws_sending.py").read_text(encoding="utf-8")
        body = source[source.index("async def _async_submit_routed_transfer(") :]
        body = body[: body.index("\n@websocket_api.require_admin")]
        submits = len(re.findall(r"queue\.async_submit(?:_gateway_routes)?\(", body))
        self.assertEqual(
            submits,
            body.count("retry_budget=retry_budget"),
            "a submit path in the routed sender drops the retry budget - a "
            "display routed that way would silently never be retried",
        )
        self.assertGreaterEqual(submits, 3, "the submit paths moved")

    def test_the_broadcast_asks_for_retries(self) -> None:
        mixin = (
            COMPONENT / "frontend" / "panel" / "panel-brand-logo.mixin.js"
        ).read_text(encoding="utf-8")
        self.assertIn("retry_budget: BRAND_LOGO_RETRY_BUDGET", mixin)
        budget = int(
            re.search(r"BRAND_LOGO_RETRY_BUDGET = (\d+)", mixin).group(1)
        )
        self.assertGreater(budget, 0)

    def test_the_chunked_commit_forwards_it(self) -> None:
        devices = (
            COMPONENT / "frontend" / "panel" / "panel-devices.mixin.js"
        ).read_text(encoding="utf-8")
        self.assertIn("retry_budget: Number(payload.retry_budget) || 0", devices)

    def test_the_websocket_accepts_and_caps_it(self) -> None:
        source = (COMPONENT / "ws_sending.py").read_text(encoding="utf-8")
        self.assertIn('vol.Optional("retry_budget", default=0): int', source)
        # Capped server-side: a browser is not allowed to ask for a display to
        # cycle through the queue indefinitely.
        self.assertIn("MAX_RETRY_BUDGET", source)
        cap = int(re.search(r"MAX_RETRY_BUDGET = (\d+)", source).group(1))
        mixin = (
            COMPONENT / "frontend" / "panel" / "panel-brand-logo.mixin.js"
        ).read_text(encoding="utf-8")
        asked = int(re.search(r"BRAND_LOGO_RETRY_BUDGET = (\d+)", mixin).group(1))
        self.assertLessEqual(
            asked, cap, "the broadcast asks for more retries than the server allows"
        )


if __name__ == "__main__":
    unittest.main()
