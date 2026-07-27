"""Regression tests for releasing BLE before the eInk render phase."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TransferCompletionTests(unittest.TestCase):
    def test_local_transfer_does_not_wait_for_optional_render_confirmation(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        self.assertIn("Releasing Bluetooth while", source)
        self.assertNotIn("while True:\n                try:\n                    response", source)

    def test_gateway_releases_ble_after_the_last_acknowledged_block(self):
        source = (
            ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
        ).read_text(encoding="utf-8")

        marker = 'addLog(log, "All image blocks were acknowledged by BLE.");'
        completion = source.index(marker)
        next_function = source.index("void failOta", completion)
        completion_section = source[completion:next_function]

        self.assertIn("client->disconnect();", completion_section)
        self.assertIn("the eInk panel is rendering", completion_section)
        self.assertNotIn("waitForPacket", completion_section)


if __name__ == "__main__":
    unittest.main()
