"""A gateway that misses one packet must not lose the shelf.

Reported from the shelf, three times in different words: the gateways keep
disconnecting and dropping out of the list, and Home Assistant ends up writing
every display itself while four working gateways stand idle.

Measured on that shelf, with all four boxes on firmware 0.1.75 and answering
/api/status in 0.1-0.5 s:

  * idle, under continuous ping: 0 losses in 25 s, and 2 in 60 s at worst
  * the instant all four were scanned in parallel - exactly what the scheduler
    did every 30 s - it cost one lost packet on *every one of the four*, in the
    same second

That shape is the problem. These boxes share one 2.4 GHz band with each other
and with the hundred displays they are scanning for, and each ESP32 shares a
single radio between its Wi-Fi and its BLE. So the losses are not independent:
they arrive together, on all gateways at once, and they arrive precisely when
the integration itself has put every radio to work.

Two pieces of code turned that into the reported symptom.

1. _async_gateway_routes loaded the gateway list *inside* the same wait_for as
   the scans, and its failure path set ``gateways = []``. That reads as local
   damage and is not. ``configured_gateways`` is built from that list, and both
   fallbacks - the 30-minute discovery cache and the previously confirmed route
   cache - look every candidate up in it and skip what is missing. One slow
   scan therefore disabled the two mechanisms that exist to cover a missed
   scan, leaving ``routes`` empty, and the tail of the block then wrote that
   empty dict over ``_gateway_route_cache``, destroying the memory of the
   routes too. A latch, not a blip: everything fell back to Home Assistant's
   local adapter and stayed there until a clean scan of *every* gateway
   succeeded.

2. The monitor sweep called a gateway unavailable on a single failed probe,
   once every 30 seconds - the one request most likely to be the lost one.

The fixes are the two things this file pins: the list survives a scan failure,
each gateway's scan is bounded on its own, the starts are spread out, and a
failed probe is asked a second time before the gateway is called offline.
"""

from __future__ import annotations

import ast
import asyncio
import re
import time
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
AUTOMATION = (COMPONENT / "automation.py").read_text(encoding="utf-8")
GATEWAY = (COMPONENT / "gateway.py").read_text(encoding="utf-8")


def _method_source(source: str, name: str) -> str:
    start = source.index(f"async def {name}(self")
    rest = source[start:]
    following = re.search(r"\n    (?:async )?def ", rest[1:])
    return rest[: following.start() + 1] if following else rest


def _method_node(source: str, name: str) -> ast.AsyncFunctionDef:
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return node
    raise AssertionError(f"{name} not found")


class TheGatewayListSurvivesAScanFailureTests(unittest.TestCase):
    """The latch described in this file's docstring, item 1."""

    def test_the_list_is_loaded_before_and_outside_the_scan_timeout(self) -> None:
        body = _method_source(AUTOMATION, "_async_gateway_routes")
        load = body.index("gateways = await async_load_gateways(self.hass)")
        scan = body.index("self._async_scan_gateways(gateways)")
        self.assertLess(load, scan, "the gateway list must be read before the scans")

        # And not inside the wait_for that bounds them: whatever that call
        # cancels, it must not be able to cancel the store read.
        wait_for = body.index("timeout=GATEWAY_ROUTE_LOOKUP_TIMEOUT_SECONDS")
        self.assertLess(load, wait_for)

    def test_a_scan_failure_does_not_empty_the_gateway_list(self) -> None:
        node = _method_node(AUTOMATION, "_async_gateway_routes")

        # Find the try whose body performs the scans, and read what its
        # handlers assign when that fails.
        for attempt in [n for n in ast.walk(node) if isinstance(n, ast.Try)]:
            guarded = ast.dump(ast.Module(body=attempt.body, type_ignores=[]))
            if "_async_scan_gateways" not in guarded:
                continue
            assigned = {
                target.id
                for handler in attempt.handlers
                for statement in ast.walk(
                    ast.Module(body=handler.body, type_ignores=[])
                )
                if isinstance(statement, (ast.Assign, ast.AnnAssign))
                for target in (
                    statement.targets
                    if isinstance(statement, ast.Assign)
                    else [statement.target]
                )
                if isinstance(target, ast.Name)
            }
            self.assertEqual(
                assigned,
                {"scan_results"},
                "the scan-failure path must clear only the scan results - clearing "
                "`gateways` disables both route fallbacks; see this file's docstring",
            )
            return
        raise AssertionError("no try/except found around the gateway scans")

    def test_both_fallbacks_still_depend_on_that_list(self) -> None:
        # The test above only matters because of this. If a future change stops
        # resolving fallback routes through configured_gateways, that test is
        # guarding nothing and should be revisited rather than deleted.
        body = _method_source(AUTOMATION, "_async_gateway_routes")
        self.assertIn("configured_gateways = {", body)
        self.assertGreaterEqual(
            body.count("configured_gateways.get(gateway_id)"),
            2,
            "the discovery cache and the route cache both resolve through it",
        )


class OneSlowGatewayCostsOnlyItsOwnResultTests(unittest.TestCase):
    """_async_scan_gateways, driven for real against stubs."""

    def _run(self, scanner, gateways, stagger=0.0, ceiling=0.0, per_scan=13):
        node = _method_node(AUTOMATION, "_async_scan_gateways")
        namespace: dict[str, Any] = {
            "asyncio": asyncio,
            "Any": Any,
            "async_scan_gateway": scanner,
            "GATEWAY_ROUTE_SCAN_SECONDS": 6,
            "GATEWAY_ROUTE_SCAN_TIMEOUT_SECONDS": per_scan,
            "GATEWAY_SCAN_STAGGER_SECONDS": stagger,
            "GATEWAY_SCAN_STAGGER_CEILING_SECONDS": ceiling,
        }
        exec(compile(ast.Module(body=[node], type_ignores=[]), "<auto>", "exec"), namespace)

        class FakeManager:
            hass = object()

        method = namespace["_async_scan_gateways"]
        return asyncio.run(method(FakeManager(), gateways))

    def test_a_hung_gateway_does_not_cancel_the_others(self) -> None:
        async def scanner(hass, gateway_id, seconds):
            if gateway_id == "slow":
                await asyncio.sleep(30)  # never finishes inside its ceiling
            return {"ok": True, "devices": [{"address": f"AA:{gateway_id}"}]}

        results = self._run(
            scanner,
            [{"id": "a"}, {"id": "slow"}, {"id": "b"}],
            per_scan=0.2,
        )
        self.assertEqual(len(results), 3)
        self.assertTrue(results[0].get("ok"), "a healthy gateway lost its result")
        self.assertIsInstance(
            results[1],
            Exception,
            "the hung gateway must fail on its own, not raise out of the gather",
        )
        self.assertTrue(results[2].get("ok"), "a healthy gateway lost its result")

    def test_a_gateway_that_raises_is_reported_not_propagated(self) -> None:
        async def scanner(hass, gateway_id, seconds):
            if gateway_id == "bad":
                raise RuntimeError("connection reset")
            return {"ok": True, "devices": []}

        results = self._run(scanner, [{"id": "bad"}, {"id": "good"}])
        self.assertIsInstance(results[0], Exception)
        self.assertTrue(results[1].get("ok"))

    def test_results_stay_aligned_with_the_gateways_that_produced_them(self) -> None:
        # _async_gateway_routes zips this against its own filtered list, so the
        # order and the filtering rule have to match exactly. A gateway with no
        # id is dropped by both.
        async def scanner(hass, gateway_id, seconds):
            return {"ok": True, "who": gateway_id}

        results = self._run(scanner, [{"id": "one"}, {"name": "no id"}, {"id": "two"}])
        self.assertEqual([r["who"] for r in results], ["one", "two"])

    def test_the_scans_do_not_all_start_in_the_same_instant(self) -> None:
        starts: list[float] = []
        began = time.monotonic()

        async def scanner(hass, gateway_id, seconds):
            starts.append(time.monotonic() - began)
            return {"ok": True, "devices": []}

        self._run(
            scanner,
            [{"id": str(index)} for index in range(4)],
            stagger=0.05,
            ceiling=0.2,
        )
        self.assertEqual(len(starts), 4)
        spread = starts[-1] - starts[0]
        self.assertGreater(
            spread,
            0.05,
            "every gateway started at once - see this file's docstring for what "
            "that measured on the shelf",
        )

    def test_the_stagger_is_capped_so_it_cannot_outgrow_the_lookup_budget(self) -> None:
        # A shelf gains gateways. Without a ceiling, the nth gateway's start
        # would eventually be pushed past GATEWAY_ROUTE_LOOKUP_TIMEOUT_SECONDS
        # and it would never be scanned at all.
        body = _method_source(AUTOMATION, "_async_scan_gateways")
        self.assertIn("min(", body)
        self.assertIn("GATEWAY_SCAN_STAGGER_CEILING_SECONDS", body)

        stagger = float(
            re.search(r"GATEWAY_SCAN_STAGGER_SECONDS = ([\d.]+)", AUTOMATION).group(1)
        )
        ceiling = float(
            re.search(r"GATEWAY_SCAN_STAGGER_CEILING_SECONDS = ([\d.]+)", AUTOMATION).group(1)
        )
        per_scan = int(
            re.search(r"GATEWAY_ROUTE_SCAN_TIMEOUT_SECONDS = (\d+)", AUTOMATION).group(1)
        )
        lookup = int(
            re.search(r"GATEWAY_ROUTE_LOOKUP_TIMEOUT_SECONDS = (\d+)", AUTOMATION).group(1)
        )
        cache = int(re.search(r"GATEWAY_ROUTE_CACHE_SECONDS = (\d+)", AUTOMATION).group(1))
        self.assertGreater(stagger, 0)
        self.assertLessEqual(
            ceiling + per_scan,
            lookup,
            "the last gateway to start must still fit inside the lookup backstop",
        )
        self.assertLessEqual(
            lookup, cache, "the lock-held section must fit inside one cache window"
        )

    def test_one_gateway_scan_is_bounded_below_the_whole_lookup(self) -> None:
        scan_seconds = int(
            re.search(r"GATEWAY_ROUTE_SCAN_SECONDS = (\d+)", AUTOMATION).group(1)
        )
        per_scan = int(
            re.search(r"GATEWAY_ROUTE_SCAN_TIMEOUT_SECONDS = (\d+)", AUTOMATION).group(1)
        )
        # async_scan_gateway bounds its own HTTP call at seconds + 5; a ceiling
        # under that would abandon gateways that were about to answer.
        self.assertGreater(per_scan, scan_seconds + 5)


class OneLostPacketIsNotAVerdictTests(unittest.TestCase):
    """The monitor sweep, item 2 in this file's docstring."""

    def test_a_failed_probe_is_asked_again_before_anything_else(self) -> None:
        body = GATEWAY[GATEWAY.index("async def _async_refresh_gateway_set("):]
        body = body[: body.index("\n# What a probe is allowed to write back")]
        first_verdict = body.index("if not unavailable:")
        retry = body.index("second_look = await asyncio.gather(")
        discovery = body.index("async_discover_gateways(hass, seconds=4)")
        self.assertLess(first_verdict, retry)
        self.assertLess(
            retry,
            discovery,
            "a dropped frame must be retried before mDNS discovery is spent on it",
        )
        self.assertIn("GATEWAY_RETRY_DELAY_SECONDS", body)

    def test_the_retry_only_costs_anything_when_something_failed(self) -> None:
        # It sits behind the `if not unavailable: return` above it, so a sweep
        # in which every gateway answered pays nothing for this.
        body = GATEWAY[GATEWAY.index("async def _async_refresh_gateway_set("):]
        body = body[: body.index("second_look = await asyncio.gather(")]
        self.assertIn("if not unavailable:\n        return", body)

    def test_only_a_gateway_that_failed_twice_reaches_discovery(self) -> None:
        body = GATEWAY[GATEWAY.index("async def _async_refresh_gateway_set("):]
        body = body[: body.index("\n# What a probe is allowed to write back")]
        self.assertIn("unavailable = still_missing", body)
        # And a gateway that answered the second time is recorded as seen
        # rather than merely skipped.
        retry_block = body[body.index("second_look = await asyncio.gather(") :]
        self.assertIn("_remember_gateway_status(gateway, status)", retry_block)

    def test_the_retry_delay_is_short_enough_not_to_stall_the_sweep(self) -> None:
        delay = float(
            re.search(r"GATEWAY_RETRY_DELAY_SECONDS = ([\d.]+)", GATEWAY).group(1)
        )
        self.assertGreater(delay, 0, "retrying in the same instant retries the same blip")
        self.assertLessEqual(delay, 5)


if __name__ == "__main__":
    unittest.main()
