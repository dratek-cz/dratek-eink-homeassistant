"""One HTTP request at a time per gateway, because that is all an ESP32 has.

Measured against three live gateways on 2026-09-10. Probed one at a time, every
one answered /api/status in about 100 ms. Probed concurrently, two of the three
stopped answering *every* request for as long as the requests kept coming, then
recovered once they stopped - while still replying to ICMP the whole time.

That is the Arduino WebServer: synchronous, one connection, no queue. And
nothing in this module coordinated. The monitor's status sweep, the route
lookup's BLE scan, a transfer's upload and that transfer's own once-a-second
progress poll could all be in flight at one box at once, which a shelf-wide
send made permanent. What the panel showed was four gateways powered on, two of
them marked offline, an OTA upload stuck at 20%, and no way to do anything with
any of them - every action queued behind status polls that were each spending
their full eight-second timeout on a box that was only busy answering us.

So the lock is not fairness, it is the hardware's capability written down.
"""

from __future__ import annotations

import asyncio
import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
GATEWAY = (COMPONENT / "gateway.py").read_text(encoding="utf-8")


class EveryRequestTakesTheLockTests(unittest.TestCase):
    def test_no_gateway_request_is_made_outside_the_lock(self) -> None:
        # The whole point is that there is no second path to the box. A new
        # call site added without the lock puts the jam straight back.
        calls = re.findall(r"session\.(?:get|post|request)\(", GATEWAY)
        held = GATEWAY.count("_gateway_http_lock(hass")
        self.assertGreaterEqual(len(calls), 7, "call sites disappeared; re-check this test")
        # One definition plus one hold per call site.
        self.assertEqual(held, len(calls) + 1)

    def test_the_lock_is_per_box_not_global(self) -> None:
        # A global lock would make four gateways take turns, which is exactly
        # the parallelism the gateway pool exists to provide.
        block = GATEWAY[GATEWAY.index("def _gateway_http_lock("):]
        block = block[: block.index("\n\n\n")]
        self.assertIn('setdefault(\n        "gateway_http_locks", {}\n    )', block)
        self.assertIn("locks.get(key)", block)
        self.assertIn("removeprefix(\"http://\")", block)

    def test_a_progress_poll_holds_it_per_request_not_per_transfer(self) -> None:
        # Holding it for a whole transfer would lock every other caller out for
        # minutes - including the status probe that decides "online".
        send = GATEWAY[GATEWAY.index("async def async_send_gateway_payload("):]
        poll = send.index("status_url, timeout=10")
        loop = send.index("while time.monotonic() < deadline:")
        self.assertLess(loop, poll, "the lock must be taken inside the poll loop")


class BusyIsNotOfflineTests(unittest.IsolatedAsyncioTestCase):
    def _remember(self):
        namespace: dict[str, object] = {}
        block = GATEWAY[GATEWAY.index("def _remember_gateway_status("):]
        block = block[: block.index("\n\n\ndef ")]
        exec(compile("import time\n" + block, "<gateway>", "exec"), namespace)
        return namespace["_remember_gateway_status"]

    def test_a_busy_gateway_keeps_the_status_it_had(self) -> None:
        remember = self._remember()
        gateway = {"status": {"ok": True, "chip": "esp32s3", "ip": "192.168.1.130"}}

        still_online = remember(gateway, {"busy": True, "ok": False, "message": "busy"})

        self.assertTrue(still_online, "busy must not be reported as a failed probe")
        self.assertTrue(gateway["status"]["ok"], "a busy gateway was marked offline")
        self.assertEqual(gateway["status"]["chip"], "esp32s3")

    def test_a_real_failure_still_marks_it_offline(self) -> None:
        remember = self._remember()
        gateway = {"status": {"ok": True, "chip": "esp32", "ip": "192.168.1.159"}}

        ok = remember(gateway, {"ok": False, "message": "Connection refused"})

        self.assertFalse(ok)
        self.assertFalse(gateway["status"]["ok"])
        # The identity survives a failed probe, as it always did.
        self.assertEqual(gateway["status"]["chip"], "esp32")

    def test_a_busy_gateway_that_was_never_reachable_stays_offline(self) -> None:
        remember = self._remember()
        gateway: dict = {}

        self.assertFalse(remember(gateway, {"busy": True, "ok": False}))


class ProbeWaitTests(unittest.TestCase):
    def test_the_status_probe_gives_up_waiting_instead_of_queueing(self) -> None:
        probe = GATEWAY[GATEWAY.index("async def _async_probe_gateway_url("):]
        probe = probe[: probe.index("\n\n\nasync def ")]
        self.assertIn("asyncio.wait_for(lock.acquire()", probe)
        self.assertIn("GATEWAY_BUSY_WAIT_SECONDS", probe)
        self.assertIn('"busy": True', probe)
        self.assertIn("lock.release()", probe)

    def test_the_wait_is_shorter_than_the_request_timeout(self) -> None:
        # Waiting longer for a turn than for an answer would be backwards.
        busy = int(re.search(r"GATEWAY_BUSY_WAIT_SECONDS = (\d+)", GATEWAY).group(1))
        default = int(re.search(r"DEFAULT_TIMEOUT = (\d+)", GATEWAY).group(1))
        self.assertLess(busy, default)


if __name__ == "__main__":
    unittest.main()
