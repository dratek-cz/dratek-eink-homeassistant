"""Every gateway route has to carry the address it will be sent to.

queue.gateway_resource keys the transfer lock on a route's ``endpoint`` and
falls back to the stored record's id when there isn't one. That fallback is
there for callers who genuinely cannot know the host - but it means a route
built without an endpoint gets a *different* lock from a route built with one,
for the very same gateway. One radio, two locks, and the queue runs both at
once.

_async_gateway_routes builds routes in three places: from a live scan, from the
discovery cache when a scan came back empty, and from the manager's own route
cache. Only the first was stamped at first, and a real queue log showed the
consequence within a day - a logo broadcast fired eight sends in one second,
some displays were routed from the live scan and some from the cache, and three
of them reached the ESP32 while it was already busy:

    ba5c9e85a02d  FF:FF:94:20:10:78  dílna -> 192.168.1.130  gateway_busy
    2bbf316b767a  FF:FF:99:80:41:52  dílna -> 192.168.1.130  gateway_busy
    db4740719222  FF:FF:92:81:46:32  dílna -> 192.168.1.130  gateway_busy

All three failed within a second of being created, which is how it was clear
they had never waited on a lock at all.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
AUTOMATION = COMPONENT / "automation.py"
QUEUE = COMPONENT / "queue.py"


def _gateway_routes_body() -> str:
    """The source of _async_gateway_routes, up to the next method."""
    source = AUTOMATION.read_text(encoding="utf-8")
    start = source.index("async def _async_gateway_routes(self, address: str)")
    rest = source[start:]
    following = re.search(r"\n    (?:async )?def ", rest[1:])
    return rest[: following.start() + 1] if following else rest


class RouteEndpointTests(unittest.TestCase):
    def test_every_builder_stamps_an_endpoint(self) -> None:
        body = _gateway_routes_body()
        appends = re.findall(r"routes\.setdefault\([^)]*\)\.append\(", body)
        self.assertGreaterEqual(
            len(appends), 3, "the route builders moved - re-check this test finds them all"
        )
        # Each append is followed by the dict it appends; every one of them has
        # to name the endpoint. Counted rather than parsed, because the three
        # differ in shape (one inline, two wrapped).
        self.assertEqual(
            len(appends),
            body.count('"endpoint"'),
            "a gateway route is built without an endpoint - see this file's docstring",
        )

    def test_the_endpoint_comes_from_the_gateway_record(self) -> None:
        body = _gateway_routes_body()
        self.assertEqual(3, body.count("gateway_send_endpoint(gateway)"))
        source = AUTOMATION.read_text(encoding="utf-8")
        self.assertIn("gateway_send_endpoint,", source)

    def test_a_carried_over_route_is_repaired_not_trusted(self) -> None:
        """A route cached by an older build has no endpoint of its own.

        Spreading it with ``**prev_route`` alone would carry that gap forward
        for as long as the cache lives, and the gateway may have moved since.
        """
        body = _gateway_routes_body()
        spread = body.index("**prev_route,")
        self.assertIn(
            '"endpoint": gateway_send_endpoint(gateway)',
            body[spread:spread + 400],
        )

    def test_the_fallback_only_exists_for_an_unknown_gateway(self) -> None:
        """queue.gateway_resource may key by id, but only as a last resort.

        The pinned paths resolve the record first and only fall back to the
        bare id when the gateway is not in the store at all - at which point
        there is no host to key on and serialising against itself is the best
        available answer.
        """
        queue_source = QUEUE.read_text(encoding="utf-8")
        self.assertIn('return f"gateway@{endpoint}"', queue_source)
        self.assertIn("return f\"gateway:{str(route.get('id') or '')}\"", queue_source)
        for name in ("ws_sending.py", "automation.py"):
            source = (COMPONENT / name).read_text(encoding="utf-8")
            with self.subTest(module=name):
                self.assertIn("await async_gateway_route(", source)


class IndicatorCooldownTests(unittest.TestCase):
    """An indicator command must not sit out an e-ink refresh.

    The queue waits out a physical screen refresh before writing to a display
    again, and arms that wait when a job finishes. An RGB LED command repaints
    nothing, so a queue log showed "Waiting 6.0s for physical e-ink screen
    refresh to complete" in front of one - and every failed indicator attempt
    then made the next real write wait too.
    """

    def test_indicator_operations_skip_the_refresh_cooldown(self) -> None:
        source = QUEUE.read_text(encoding="utf-8")
        self.assertIn('INDICATOR_OPERATIONS = frozenset({"rgb_led", "flash_identify"})', source)
        self.assertIn(
            'repaints = job.get("operation") not in INDICATOR_OPERATIONS', source
        )
        # Neither waited for...
        self.assertIn(
            "last_finish = self._last_finish_at.get(normalized_address) if repaints else None",
            source,
        )
        # ...nor armed for the job after it.
        self.assertIn(
            'if job.get("status") != "skipped" and repaints:', source
        )


if __name__ == "__main__":
    unittest.main()
