"""Regression tests for display-driven BLE image transfer completion."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TransferCompletionTests(unittest.TestCase):
    def test_local_transfer_obeys_each_requested_block(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        transfer_loop = source.index("while True:", source.index("The display is the flow-control authority"))
        completion = source.index("Full-screen image transfer completed", transfer_loop)
        section = source[transfer_loop:completion]

        self.assertIn('response[1] == 8', section)
        self.assertIn('int.from_bytes(response[2:6], "little")', section)
        self.assertIn("_next_block(payload, block_size, block_number)", section)
        self.assertIn("await self._wait_for_next_transfer_response(", section)
        self.assertIn("Display requested retransmission", section)

    def test_local_transfer_accepts_models_without_optional_completion_confirmation(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        confirmed = source.index("Display confirmed that the complete image was received.")
        optional = source.index("this model does not send the optional 05 08 confirmation")
        disconnect_log = source.index("Full-screen image transfer completed; releasing Bluetooth.")

        self.assertLess(confirmed, disconnect_log)
        self.assertLess(optional, disconnect_log)
        self.assertIn("OPTIONAL_COMPLETION_TIMEOUT = 2", source)
        self.assertIn("if len(sent_blocks) != total_blocks:", source)
        self.assertNotIn("WRITE_ACK_SDK_TYPES", source)

    def test_block_size_is_decoded_as_little_endian_uint16(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        self.assertIn('int.from_bytes(data[1:3], "little")', source)

    def test_gateway_waits_for_each_request_and_accepts_optional_confirmation(self):
        source = (
            ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
        ).read_text(encoding="utf-8")

        transfer_loop = source.index("while (true)", source.index("The display controls the transfer window"))
        completion = source.index('addLog(log, "Full-screen image transfer completed.");')
        section = source[transfer_loop:completion]

        self.assertIn("packet[1] == 0x08", section)
        self.assertIn("waitForPacket(0x05, packet, nextTimeout)", section)
        self.assertIn("Retransmitting requested block", section)
        self.assertIn("no optional 05 08 confirmation", section)
        self.assertIn("uniqueSent != totalBlocks", section)

    def test_gateway_decodes_uint16_block_size(self):
        source = (
            ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "((int)packet[1] | ((int)packet[2] << 8))",
            source,
        )


if __name__ == "__main__":
    unittest.main()
