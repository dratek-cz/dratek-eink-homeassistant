"""A dropped gateway upload must say so, not raise KeyError: 'job_id'.

From a real queue-log export (v0.1.327):

    Gateway upload attempt 1/2 failed:
    Gateway status after disconnect is unavailable:
    Retrying the same idempotent transfer job.
    Gateway upload attempt 2/2 failed:
    Gateway send failed: 'job_id'

Both attempts failed against a gateway that had just restarted, but aiohttp's
ServerDisconnectedError carries no message, so `upload_error = str(exc)` was
"". The `if upload_error:` guard therefore did not fire, execution fell
through to `data["job_id"]` on the dict initialised empty above the loop, and
the user was shown a bare Python KeyError instead of "the gateway dropped the
connection" - which also hid the failure from anything trying to classify it.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
GATEWAY = ROOT / "custom_components" / "dratek_eink" / "gateway.py"


def _load_function(name: str):
    """Execute one top-level function from gateway.py in isolation.

    gateway.py pulls in Home Assistant, PIL and four sibling modules, none of
    which these helpers touch. Compiling just the one function keeps this a
    real behavioural test without standing up that whole import graph.
    """
    tree = ast.parse(GATEWAY.read_text(encoding="utf-8"))
    node = next(
        item
        for item in tree.body
        if isinstance(item, ast.FunctionDef) and item.name == name
    )
    namespace: dict = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(GATEWAY), "exec"), namespace)
    return namespace[name]


class ExceptionMessageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.message = _load_function("_exception_message")

    def test_an_empty_exception_falls_back_to_its_type(self) -> None:
        class ServerDisconnectedError(Exception):
            pass

        self.assertEqual(
            self.message(ServerDisconnectedError()), "ServerDisconnectedError"
        )

    def test_a_whitespace_only_message_also_falls_back(self) -> None:
        self.assertEqual(self.message(RuntimeError("   ")), "RuntimeError")

    def test_a_real_message_is_kept_verbatim(self) -> None:
        error = OSError("Cannot connect to host 192.168.1.130:80")
        self.assertEqual(
            self.message(error), "Cannot connect to host 192.168.1.130:80"
        )


class UploadFailureDetectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = GATEWAY.read_text(encoding="utf-8")
        tree = ast.parse(self.source)
        node = next(
            item
            for item in tree.body
            if isinstance(item, ast.AsyncFunctionDef)
            and item.name == "async_send_gateway_payload"
        )
        self.body = ast.get_source_segment(self.source, node) or ""

    def test_failure_is_tracked_by_a_flag_not_by_message_truthiness(self) -> None:
        self.assertIn("upload_failed = True", self.body)
        self.assertIn("if upload_failed:", self.body)
        self.assertNotIn("if upload_error:", self.body)

    def test_the_guard_precedes_the_job_id_lookup(self) -> None:
        guard = self.body.index("if upload_failed:")
        # The statement itself, not the comment above the guard that quotes it.
        lookup = self.body.index('job_id = str(data["job_id"])')
        self.assertLess(guard, lookup, "the empty dict must never reach data['job_id']")

    def test_both_failure_logs_use_the_readable_message(self) -> None:
        self.assertIn("upload_error = _exception_message(exc)", self.body)
        self.assertIn("_exception_message(status_exc)", self.body)

    def test_a_dropped_upload_is_reported_as_a_gateway_side_failure(self) -> None:
        # This is what stops TransferQueue blaming the display for it.
        guard = self.body.index("if upload_failed:")
        block = self.body[guard : guard + 400]
        self.assertIn('"gateway_side": True', block)
        self.assertIn("Gateway closed the connection during the upload.", block)


class GatewaySideClassificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = GATEWAY.read_text(encoding="utf-8")

    def test_out_of_heap_is_listed_as_a_gateway_side_error(self) -> None:
        # The firmware reports this when xTaskCreate for the 12 kB transfer
        # task fails; it never opened a Bluetooth connection.
        self.assertIn("transfer_task_start_failed", self.source)
        start = self.source.index("GATEWAY_SIDE_JOB_ERRORS = frozenset(")
        block = self.source[start : self.source.index(")", start)]
        for error in (
            "transfer_task_start_failed",
            "gateway_transfer_lost_after_restart",
            "gateway_firmware_update_required",
        ):
            self.assertIn(error, block)

    def test_a_failed_ble_transfer_is_not_treated_as_gateway_side(self) -> None:
        # ble_transfer_failed means the display itself did not answer, so the
        # display backoff should still be armed for it.
        self.assertIn(
            '"gateway_side": error in GATEWAY_SIDE_JOB_ERRORS,', self.source
        )

    def test_the_firmware_still_reports_the_error_this_relies_on(self) -> None:
        firmware = (
            ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
        ).read_text(encoding="utf-8")
        self.assertIn('transferJob.error = "transfer_task_start_failed";', firmware)
        self.assertIn('transferJob.error = ok ? "" : "ble_transfer_failed";', firmware)


if __name__ == "__main__":
    unittest.main()
