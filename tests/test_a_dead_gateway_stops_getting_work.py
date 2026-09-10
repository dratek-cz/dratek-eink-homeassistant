"""A gateway that never completes anything must stop being handed displays.

From a real 24-minute broadcast (export 1789041159909, backend v1.0.7), per
gateway:

    192.168.1.129     7 succeeded    0 failed   100%
    192.168.1.130    11 succeeded    0 failed   100%
    192.168.1.159     0 succeeded   49 failed     0%
    192.168.1.188    29 succeeded    4 failed    87%

Forty-nine attempts on one gateway, not one of them completed - every single
failure the same "Cannot connect to host 192.168.1.159:80". Meanwhile two
gateways that failed nothing at all were handed seven and eleven jobs between
them. Work kept arriving at the dead one for the whole run: bucketed by two
minutes, it received 1, 2, 8, 10, 4, 5, 6, 4, 2, 3, 3, 1.

The backoff was already there and already correct in shape - a gateway that
fails on its own account is deprioritised, and _select_gateway_route's second
pass still allows it so a display only that gateway can hear is never
stranded. What was wrong was the *duration*: a flat 180 s against a box
measured unreachable about a quarter of the time in bursts far longer than
that. It came back into rotation every three minutes, all run, and each return
cost a display its turn.

So the window doubles per consecutive failure, capped, and one success clears
it. Three failures instead of forty-nine.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_gateway_failure_isolation import queue_module, _make_queue  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
QUEUE_SOURCE = (ROOT / "custom_components" / "dratek_eink" / "queue.py").read_text(
    encoding="utf-8"
)

BASE = queue_module.GATEWAY_BACKOFF_SECONDS
CAP = queue_module.GATEWAY_BACKOFF_MAX_SECONDS
SICK = "gateway@192.168.1.159"
WELL = "gateway@192.168.1.130"


class EscalatingBackoffTests(unittest.TestCase):
    def setUp(self) -> None:
        self.queue = _make_queue()

    def _fail(self, resource: str, times: int) -> None:
        for _ in range(times):
            self.queue._gateway_failure_at[resource] = queue_module.time.monotonic()
            self.queue._gateway_failure_streak[resource] = (
                self.queue._gateway_failure_streak.get(resource, 0) + 1
            )

    def test_the_window_doubles_with_each_failure(self) -> None:
        self._fail(SICK, 1)
        self.assertEqual(BASE, self.queue._gateway_backoff_window(SICK))
        self._fail(SICK, 1)
        self.assertEqual(BASE * 2, self.queue._gateway_backoff_window(SICK))
        self._fail(SICK, 1)
        self.assertEqual(BASE * 4, self.queue._gateway_backoff_window(SICK))

    def test_it_is_capped(self) -> None:
        self._fail(SICK, 49)  # what the export actually recorded
        self.assertEqual(float(CAP), self.queue._gateway_backoff_window(SICK))

    def test_forty_nine_failures_do_not_overflow_anything(self) -> None:
        # 2 ** 49 as a plain int would be fine in Python but is a smell; the
        # shift is clamped, so assert the clamp holds well past the cap.
        self._fail(SICK, 400)
        self.assertEqual(float(CAP), self.queue._gateway_backoff_window(SICK))

    def test_a_success_clears_the_streak_completely(self) -> None:
        self._fail(SICK, 5)
        self.queue._gateway_failure_at.pop(SICK, None)
        self.queue._gateway_failure_streak.pop(SICK, None)
        # Back to a clean sheet: the next failure starts at the base window.
        self._fail(SICK, 1)
        self.assertEqual(
            BASE,
            self.queue._gateway_backoff_window(SICK),
            "a gateway that recovered must not carry its old streak",
        )

    def test_the_streak_is_dropped_when_the_backoff_expires(self) -> None:
        self._fail(SICK, 3)
        self.queue._gateway_failure_at[SICK] = (
            queue_module.time.monotonic() - CAP - 1
        )
        self.assertFalse(self.queue._is_gateway_backing_off(SICK))
        self.assertNotIn(SICK, self.queue._gateway_failure_streak)
        self.assertNotIn(SICK, self.queue._gateway_failure_at)

    def test_one_gateway_s_streak_does_not_touch_another(self) -> None:
        self._fail(SICK, 4)
        self._fail(WELL, 1)
        self.assertEqual(BASE * 8, self.queue._gateway_backoff_window(SICK))
        self.assertEqual(BASE, self.queue._gateway_backoff_window(WELL))


class RoutingConsequenceTests(unittest.TestCase):
    """What the escalation is actually for."""

    def setUp(self) -> None:
        self.queue = _make_queue()

    def _route(self, ip: str, rssi: float) -> dict:
        return {"id": ip, "name": ip, "endpoint": ip, "rssi": rssi}

    def test_the_healthy_gateway_wins_even_when_it_is_weaker(self) -> None:
        # The dead gateway in the export was chosen because it was strongest.
        # Signal is not evidence that a box can accept a transfer.
        sick = self._route("192.168.1.159", -45.0)
        well = self._route("192.168.1.130", -70.0)
        for _ in range(3):
            resource = queue_module.gateway_resource(sick)
            self.queue._gateway_failure_at[resource] = queue_module.time.monotonic()
            self.queue._gateway_failure_streak[resource] = (
                self.queue._gateway_failure_streak.get(resource, 0) + 1
            )
        chosen = self.queue._select_gateway_route([sick, well])
        self.assertEqual(
            "192.168.1.130",
            chosen["id"],
            "a gateway with three consecutive failures must not keep winning on RSSI",
        )

    def test_a_display_only_the_sick_gateway_hears_is_still_written(self) -> None:
        # The whole reason the backoff is an ordering rule and not an exclusion.
        # Escalating the window must not turn it into one.
        sick = self._route("192.168.1.159", -45.0)
        resource = queue_module.gateway_resource(sick)
        for _ in range(20):
            self.queue._gateway_failure_at[resource] = queue_module.time.monotonic()
            self.queue._gateway_failure_streak[resource] = (
                self.queue._gateway_failure_streak.get(resource, 0) + 1
            )
        chosen = self.queue._select_gateway_route([sick])
        self.assertIsNotNone(chosen, "the only gateway that hears this display was dropped")
        self.assertEqual("192.168.1.159", chosen["id"])


class BookkeepingTests(unittest.TestCase):
    def test_the_streak_is_pruned_after_the_timestamps_not_before(self) -> None:
        # A count without the timestamp it is measured from is dead weight, and
        # filtering it against the unpruned dict would leave exactly that.
        prune = QUEUE_SOURCE[QUEUE_SOURCE.index("    def _prune(self)") :]
        prune = prune[: prune.index("\n    def ", 1)]
        at = prune.index("self._gateway_failure_at = {")
        streak = prune.index("self._gateway_failure_streak = {")
        self.assertLess(at, streak)

    def test_both_dictionaries_are_written_together_on_failure(self) -> None:
        body = QUEUE_SOURCE[QUEUE_SOURCE.index("if gateway_side_failure:") :]
        body = body[:1400]
        self.assertIn("self._gateway_failure_at[failed_resource]", body)
        self.assertIn("self._gateway_failure_streak[failed_resource]", body)

    def test_a_success_clears_both(self) -> None:
        body = QUEUE_SOURCE[QUEUE_SOURCE.index('elif job.get("status") == "succeeded":') :]
        body = body[:700]
        self.assertIn("_gateway_failure_at.pop", body)
        self.assertIn("_gateway_failure_streak.pop", body)

    def test_the_cap_is_meaningfully_longer_than_the_base(self) -> None:
        self.assertGreaterEqual(CAP, BASE * 4)
        # And not so long that a gateway recovering after a bad patch is
        # sidelined for the rest of the day.
        self.assertLessEqual(CAP, 3600)


if __name__ == "__main__":
    unittest.main()
