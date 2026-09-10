"""The queue picks the radio when the transfer comes up, not when it is queued.

A shelf-wide send queues a hundred displays in one burst. Deciding each one's
transport at that moment means the whole shelf is dealt out inside a couple of
seconds, from one snapshot of which gateway happened to look free - and nothing
afterwards can move a job onto a radio that has since gone idle. A gateway
standing right next to the displays could sit out an entire run on the strength
of how it looked during that one second, while Home Assistant's own adapter and
two other gateways did all the work.

So a job carrying a route chooser binds at dispatch: ask what is best now, take
that radio if it is free, otherwise wait for any radio to be handed back and ask
again. The waiting-for-a-display retry gets this for free - its next attempt is
a dispatch like any other, so a display that was out of range when it was queued
and wakes up beside a gateway an hour later is written by that gateway.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_gateway_failure_isolation import queue_module, _make_queue  # noqa: E402


ADDRESS = "FF:FF:92:81:64:85"
# What a caller must report for the queue to hold the job: nothing was written,
# the display was simply not there (see DISPLAY_UNREACHABLE_ERROR_MARKERS).
UNREACHABLE = {"ok": False, "error": "Could not connect to the display.", "log": []}


def _runner(name, attempts, result=None):
    async def run(_add_log):
        attempts.append(name)
        return dict(result or {"ok": True})
    return run


class DispatchTimeRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._poll = queue_module.DISPLAY_WAIT_POLL_SECONDS
        queue_module.DISPLAY_WAIT_POLL_SECONDS = 0.02

    def tearDown(self) -> None:
        queue_module.DISPLAY_WAIT_POLL_SECONDS = self._poll

    async def _run_queued(self, queue, **kwargs):
        submitted = await queue.async_submit(
            address=ADDRESS, operation="design", wait_for_completion=False, **kwargs
        )
        self.assertIs(submitted.get("queued"), True)
        return await queue._job_tasks[submitted["queue_job_id"]]

    async def test_the_route_is_chosen_at_dispatch_not_at_submit(self):
        queue = _make_queue()
        attempts: list[str] = []

        async def bind():
            # Stands in for the gateway that only becomes the right answer after
            # the job was already queued somewhere else.
            return ("gateway@192.168.1.130", "gateway", "dratek-gw",
                    _runner("gateway", attempts))

        result = await self._run_queued(
            queue,
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            runner=_runner("local", attempts),
            rebind=bind,
        )

        # Never touched the transport it was submitted with.
        self.assertEqual(attempts, ["gateway"])
        self.assertIs(result.get("ok"), True)
        job = queue._jobs[-1]
        self.assertEqual(job["resource"], "gateway@192.168.1.130")
        self.assertEqual(job["transport_name"], "dratek-gw")
        self.assertTrue(
            any("Route chosen when the transfer came up" in line for line in job["log"]),
            "the switch has to be visible in the job's own log",
        )

    async def test_a_job_waits_for_a_busy_radio_and_takes_it_when_freed(self):
        # The whole point of choosing late: a second job must be able to land on
        # a radio that only came free after it was queued.
        queue = _make_queue()
        order: list[str] = []
        release_first = asyncio.Event()

        async def slow(_add_log):
            order.append("first-start")
            await release_first.wait()
            order.append("first-end")
            return {"ok": True}

        async def quick(_add_log):
            order.append("second")
            return {"ok": True}

        async def bind_slow():
            return ("gateway@a", "gateway", "gw-a", slow)

        async def bind_quick():
            return ("gateway@a", "gateway", "gw-a", quick)

        first = await queue.async_submit(
            resource="gateway@a", transport_type="gateway", transport_name="gw-a",
            address="FF:FF:00:00:00:01", operation="design",
            runner=slow, wait_for_completion=False, rebind=bind_slow,
        )
        second = await queue.async_submit(
            resource="gateway@a", transport_type="gateway", transport_name="gw-a",
            address="FF:FF:00:00:00:02", operation="design",
            runner=quick, wait_for_completion=False, rebind=bind_quick,
        )
        await asyncio.sleep(0.05)
        self.assertEqual(order, ["first-start"], "the radio must serialise them")

        release_first.set()
        await queue._job_tasks[first["queue_job_id"]]
        await queue._job_tasks[second["queue_job_id"]]

        self.assertEqual(order, ["first-start", "first-end", "second"])

    async def test_a_held_job_is_routed_again_when_it_next_comes_up(self):
        queue = _make_queue()
        attempts: list[str] = []
        seen = {"count": 0}

        async def bind():
            seen["count"] += 1
            if seen["count"] == 1:
                return ("local", "local", "Home Assistant Bluetooth",
                        _runner("local", attempts, UNREACHABLE))
            return ("gateway@b", "gateway", "gw-b", _runner("gateway", attempts))

        result = await self._run_queued(
            queue,
            resource="local", transport_type="local",
            transport_name="Home Assistant Bluetooth",
            runner=_runner("local", attempts, UNREACHABLE),
            rebind=bind,
        )

        self.assertEqual(attempts, ["local", "gateway"])
        self.assertIs(result.get("ok"), True)
        self.assertEqual(queue._jobs[-1]["resource"], "gateway@b")

    async def test_a_failing_chooser_falls_back_to_the_submitted_route(self):
        # Choosing talks to the gateways and that can fail. A stale route is
        # worse than a fresh one and far better than none.
        queue = _make_queue()
        attempts: list[str] = []

        async def bind():
            raise RuntimeError("gateway scan timed out")

        result = await self._run_queued(
            queue,
            resource="local", transport_type="local",
            transport_name="Home Assistant Bluetooth",
            runner=_runner("local", attempts),
            rebind=bind,
        )

        self.assertEqual(attempts, ["local"])
        self.assertIs(result.get("ok"), True)
        self.assertEqual(queue._jobs[-1]["resource"], "local")
        self.assertTrue(
            any("Could not choose a route" in line for line in queue._jobs[-1]["log"]),
            "a failed lookup has to say so rather than pass silently",
        )

    async def test_a_job_without_a_chooser_keeps_its_submitted_route(self):
        # Pinned gateways and every other caller that names its own transport.
        queue = _make_queue()
        attempts: list[str] = []

        result = await self._run_queued(
            queue,
            resource="gateway@pinned", transport_type="gateway",
            transport_name="pinned", runner=_runner("pinned", attempts),
        )

        self.assertEqual(attempts, ["pinned"])
        self.assertIs(result.get("ok"), True)
        self.assertEqual(queue._jobs[-1]["resource"], "gateway@pinned")


if __name__ == "__main__":
    unittest.main()


class GatewayLabelTests(unittest.TestCase):
    """A queue row has to say which piece of hardware is busy.

    Two gateways can carry the same stored name - auto-named while they briefly
    reported the same hostname, or named alike by hand. They still serialise
    correctly, on separate locks keyed by endpoint, but the queue then reads as
    one radio writing two displays at once. Measured on a real export: 74 rows
    all labelled "dratek-eink-gateway-221209092026", and underneath them two
    locks, gateway@192.168.1.129 and gateway@192.168.1.130, 36 transfers each -
    two different boxes with different MACs doing exactly the right thing.
    """

    def _label(self):
        namespace: dict[str, object] = {}
        source = (
            Path(__file__).resolve().parents[1]
            / "custom_components" / "dratek_eink" / "queue.py"
        ).read_text(encoding="utf-8")
        block = source[source.index("def gateway_transport_name("):]
        block = block[: block.index("\n\n\nclass ")]
        exec(compile("from typing import Any\n" + block, "<queue>", "exec"), namespace)
        return namespace["gateway_transport_name"]

    def test_two_gateways_sharing_a_name_are_told_apart(self):
        label = self._label()
        a = label({"name": "dratek-gw", "endpoint": "192.168.1.129"})
        b = label({"name": "dratek-gw", "endpoint": "192.168.1.130"})
        self.assertNotEqual(a, b)
        self.assertIn("192.168.1.129", a)
        self.assertIn("192.168.1.130", b)

    def test_a_name_that_already_says_the_address_is_left_alone(self):
        label = self._label()
        self.assertEqual(
            label({"name": "gw 192.168.1.129", "endpoint": "192.168.1.129"}),
            "gw 192.168.1.129",
        )

    def test_a_route_with_nothing_to_say_still_gets_a_name(self):
        label = self._label()
        self.assertEqual(label({}), "DRATEK eInk gateway")


class PendingRouteTests(unittest.IsolatedAsyncioTestCase):
    """A queued job must not claim a radio it has not been given.

    The route stamped at submit is only a fallback for a chooser that fails and
    a placeholder for the lock key - _hold_route asks again when the transfer
    comes up. Showing it in the queue said the decision was already taken, so a
    hundred rows appeared pre-assigned within a second of being queued while
    the real choice was still minutes away.
    """

    async def test_a_queued_job_says_its_route_is_undecided(self):
        queue = _make_queue()
        attempts: list[str] = []
        release = asyncio.Event()

        async def bound(_add_log):
            attempts.append("gateway")
            await release.wait()
            return {"ok": True}

        async def bind():
            return ("gateway@a", "gateway", "gw-a", bound)

        submitted = await queue.async_submit(
            resource="local", transport_type="local",
            transport_name="Trasa se určí při zápisu",
            address=ADDRESS, operation="design",
            runner=_runner("local", attempts), wait_for_completion=False,
            rebind=bind,
        )
        job = next(j for j in queue._jobs if j["id"] == submitted["queue_job_id"])
        # Before it runs.
        self.assertTrue(job["route_pending"])

        await asyncio.sleep(0.05)
        # Bound now, and no longer pending.
        self.assertFalse(job["route_pending"])
        self.assertEqual(job["resource"], "gateway@a")
        self.assertEqual(job["transport_name"], "gw-a")
        release.set()
        await queue._job_tasks[submitted["queue_job_id"]]

    async def test_a_job_that_names_its_own_transport_is_never_pending(self):
        queue = _make_queue()
        submitted = await queue.async_submit(
            resource="gateway@pinned", transport_type="gateway",
            transport_name="pinned", address=ADDRESS, operation="design",
            runner=_runner("pinned", []), wait_for_completion=False,
        )
        job = next(j for j in queue._jobs if j["id"] == submitted["queue_job_id"])
        self.assertFalse(job["route_pending"])
        await queue._job_tasks[submitted["queue_job_id"]]

    async def test_the_snapshot_carries_it_so_the_panel_can_say_so(self):
        queue = _make_queue()
        submitted = await queue.async_submit(
            resource="local", transport_type="local",
            transport_name="Trasa se určí při zápisu",
            address=ADDRESS, operation="design",
            runner=_runner("local", []), wait_for_completion=False,
            rebind=None,
        )
        snapshot = await queue.async_snapshot()
        self.assertIn("route_pending", snapshot["jobs"][0])
        await queue._job_tasks[submitted["queue_job_id"]]
