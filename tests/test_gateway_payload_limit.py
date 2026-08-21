"""An oversized image must not be offered to a gateway that cannot hold it.

An 800x480 BWR panel packs to 96 000 bytes and, when the display does not
advertise the 0x4000 raw-data flag, frames to 100 504 as the vendor QuickLZ
stream. A plain ESP32 gateway accepts 98 KiB - 100 352 bytes. Over by 152.

The firmware answered that with "invalid_payload_size", which reads like the
integration built something malformed. It had not: the chip simply cannot
hold an image that large. Raising the ceiling would not help either, because
an ESP32 shares ~320 KB of DRAM with Wi-Fi, NimBLE and the web server and one
in service reports a largest free block around 25 KB - the failure would just
move to "insufficient_contiguous_memory".

So the check happens before the upload, and is flagged gateway_side, which
lets the queue fall back to another gateway or to Home Assistant's Bluetooth
(see test_gateway_failure_isolation) instead of blaming a display that was
never contacted.
"""

from __future__ import annotations

import ast
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
GATEWAY = COMPONENT / "gateway.py"
FIRMWARE = ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"


def _load(name: str):
    """Execute one top-level function from gateway.py without its imports."""
    tree = ast.parse(GATEWAY.read_text(encoding="utf-8"))
    wanted = {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in {"gateway_chip", "gateway_payload_limit"}
    }
    assigns = [
        node for node in tree.body
        if isinstance(node, ast.Assign)
        and any(getattr(t, "id", "") == "GATEWAY_MAX_UPLOAD_BYTES" for t in node.targets)
    ]
    module = ast.Module(body=assigns + list(wanted.values()), type_ignores=[])
    namespace: dict = {"Any": object}
    exec(compile(module, str(GATEWAY), "exec"), namespace)
    return namespace[name]


gateway_chip = _load("gateway_chip")
gateway_payload_limit = _load("gateway_payload_limit")

# 800x480 BWR, vendor-framed - the payload that started this.
LARGE_PANEL_PAYLOAD = 100_504


class PayloadLimitTests(unittest.TestCase):
    def test_the_limits_match_the_firmware(self) -> None:
        firmware = FIRMWARE.read_text(encoding="utf-8")
        esp32s3 = re.search(
            r"CONFIG_IDF_TARGET_ESP32S3.*?MAX_UPLOAD_PAYLOAD_BYTES = (\d+)UL \* (\d+)UL",
            firmware,
            re.S,
        )
        esp32 = re.search(
            r'CHIP_FAMILY = "esp32";\s*static const size_t MAX_UPLOAD_PAYLOAD_BYTES = (\d+)UL \* (\d+)UL',
            firmware,
        )
        self.assertIsNotNone(esp32s3, "the ESP32-S3 ceiling was not found in the firmware")
        self.assertIsNotNone(esp32, "the ESP32 ceiling was not found in the firmware")
        self.assertEqual(gateway_payload_limit("esp32s3"), int(esp32s3.group(1)) * int(esp32s3.group(2)))
        self.assertEqual(gateway_payload_limit("esp32"), int(esp32.group(1)) * int(esp32.group(2)))

    def test_the_large_panel_is_over_the_esp32_ceiling(self) -> None:
        # 152 bytes over. The whole point of the check.
        self.assertGreater(LARGE_PANEL_PAYLOAD, gateway_payload_limit("esp32"))
        self.assertLessEqual(LARGE_PANEL_PAYLOAD, gateway_payload_limit("esp32s3"))

    def test_an_unknown_chip_is_never_blocked(self) -> None:
        # Guessing would strand an ESP32-S3 - which handles this panel fine -
        # behind the smaller ceiling just because its status was not read yet.
        for chip in ("", None, "esp32c6", "  "):
            self.assertIsNone(gateway_payload_limit(chip))


class ChipResolutionTests(unittest.TestCase):
    def test_a_probed_gateway_reports_from_its_status(self) -> None:
        self.assertEqual(gateway_chip({"status": {"ok": True, "chip": "esp32s3"}}), "esp32s3")

    def test_a_discovery_result_reports_from_the_top_level(self) -> None:
        self.assertEqual(gateway_chip({"chip": "ESP32"}), "esp32")

    def test_status_wins_over_a_stale_top_level_value(self) -> None:
        self.assertEqual(gateway_chip({"chip": "esp32", "status": {"chip": "esp32s3"}}), "esp32s3")

    def test_an_unprobed_gateway_reports_nothing(self) -> None:
        for gateway in ({}, {"status": None}, {"status": {}}, {"status": {"chip": ""}}):
            self.assertEqual(gateway_chip(gateway), "")


class PreflightWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = GATEWAY.read_text(encoding="utf-8")
        tree = ast.parse(self.source)
        node = next(
            item for item in tree.body
            if isinstance(item, ast.AsyncFunctionDef) and item.name == "async_send_gateway_payload"
        )
        self.body = ast.get_source_segment(self.source, node) or ""

    def test_the_check_runs_before_the_upload(self) -> None:
        guard = self.body.index("payload_exceeds_gateway_limit")
        upload = self.body.index("Streaming binary transfer job to gateway")
        self.assertLess(guard, upload, "the oversized payload must never reach the wire")

    def test_the_refusal_is_flagged_as_gateway_side(self) -> None:
        # Otherwise the queue would arm the display's offline backoff and skip
        # the very fallback that can still deliver this image.
        block = self.body[self.body.index("payload_exceeds_gateway_limit") :][:300]
        self.assertIn('"gateway_side": True', block)

    def test_the_log_line_names_both_numbers(self) -> None:
        self.assertIn("but this {chip or 'unknown'} gateway accepts at ", self.body)
        self.assertIn("{payload_limit}", self.body)


if __name__ == "__main__":
    unittest.main()
