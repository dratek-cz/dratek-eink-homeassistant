"""Regression tests for display-driven BLE image transfer completion."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TransferCompletionTests(unittest.TestCase):
    def test_local_transfer_selects_the_vendor_protocol_from_software_version(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        transfer_loop = source.index("while True:", source.index("Picksmart has two transfer implementations"))
        completion = source.index("Full-screen image transfer completed", transfer_loop)
        section = source[transfer_loop:completion]

        self.assertIn("streaming_mode = bool(int(software_version or 0) & 0x80)", source)
        self.assertIn("end_block = total_blocks if streaming_mode else next_block + 1", section)
        self.assertIn("next_block += 1", section)
        self.assertIn('int.from_bytes(response[2:6], "little")', section)
        self.assertIn("_next_block(payload, block_size, block_number)", section)
        self.assertIn("await self._wait_for_next_transfer_response(", section)
        self.assertIn("Display requested retransmission from block", section)
        self.assertIn('"write-without-response" not in write_char.properties', source)
        self.assertIn("WRITE_ACK_SDK_TYPES = {51}", source)
        self.assertIn("FINAL_BLOCK_RESPONSE_TIMEOUT = 2", source)
        self.assertIn("MTU_NEGOTIATION_TIMEOUT = 4", source)
        self.assertIn("await self._negotiate_mtu(client)", source)
        self.assertIn('getattr(backend, "_acquire_mtu", None)', source)
        self.assertIn("int(sdk_type) in WRITE_ACK_SDK_TYPES", source)
        self.assertIn("unconfirmed_stream = (", source)
        self.assertIn("not unconfirmed_stream", source)
        self.assertIn('and "write-without-response" in write_char.properties', source)
        self.assertIn('"uniform paced write without response"', source)
        self.assertIn('"vendor write-complete flow control"', source)
        self.assertIn("block_number == total_blocks - 1", section)
        self.assertIn("block_requires_response = require_gatt_response", section)
        self.assertIn("require_response=block_requires_response", section)
        self.assertIn("confirmed_blocks: set[int] = set()", source)
        self.assertIn("confirmed_flow_complete", section)
        self.assertIn("confirmed_blocks.add(block_number)", section)
        self.assertIn("The display did not return the final GATT response", section)
        self.assertIn('"Final block handed off"', section)
        self.assertIn("GATT_OPERATION_TIMEOUT = 8", source)
        self.assertIn("STREAM_WRITE_DELAY = 0.04", source)
        self.assertIn("asyncio.timeout(operation_timeout)", source)
        self.assertIn('if not label.startswith("block "):', source)
        self.assertIn("if not require_response:", source)
        self.assertIn("await asyncio.sleep(STREAM_WRITE_DELAY)", source)
        self.assertIn("if isinstance(exc, TimeoutError):", source)
        self.assertIn("async_last_service_info", source)
        self.assertIn("manufacturer_data.get(DRATEK_COMPANY_ID)", source)

    def test_local_transfer_accepts_models_without_optional_completion_confirmation(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        confirmed = source.index("Display confirmed that the complete image was received.")
        optional = source.index("All image blocks were handed off")
        disconnect_log = source.index("Full-screen image transfer completed; releasing Bluetooth.")

        self.assertLess(confirmed, disconnect_log)
        self.assertLess(optional, disconnect_log)
        self.assertIn("OPTIONAL_COMPLETION_TIMEOUT = 2", source)
        self.assertIn("UNCONFIRMED_WRITE_DRAIN_TIMEOUT = 10", source)
        self.assertIn("+ bytes([FULL_REFRESH_MODE])", source)
        self.assertIn("if len(sent_blocks) != total_blocks:", source)

    def test_block_size_is_decoded_as_little_endian_uint16(self):
        source = (ROOT / "custom_components" / "dratek_eink" / "transfer.py").read_text(
            encoding="utf-8"
        )

        self.assertIn('int.from_bytes(data[1:3], "little")', source)

    def test_gateway_supports_streaming_and_legacy_vendor_protocols(self):
        source = (
            ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
        ).read_text(encoding="utf-8")

        transfer_loop = source.index("while (true)", source.index("Picksmart selects one of two protocols"))
        completion = source.index('addLog(log, "Full-screen image transfer completed.");')
        section = source[transfer_loop:completion]

        self.assertIn("streamingMode = (softwareVersion & 0x80) == 0x80", source)
        self.assertIn("endBlock = streamingMode ? totalBlocks : nextBlock + 1", section)
        self.assertIn("blockWriteWithResponse = writeChar->canWrite()", source)
        self.assertIn("nextBlock++", section)
        self.assertIn("no optional 05 08 confirmation", section)
        self.assertIn("uniqueSent != totalBlocks", section)
        self.assertIn("uint8_t prepare[6];", source)

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
