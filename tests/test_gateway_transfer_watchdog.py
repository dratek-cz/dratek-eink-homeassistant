"""A stalled gateway transfer must recover without a manual power cycle."""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIRMWARE = ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
GATEWAY = ROOT / "custom_components" / "dratek_eink" / "gateway.py"


class GatewayTransferWatchdogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.firmware = FIRMWARE.read_text(encoding="utf-8")
        cls.gateway = GATEWAY.read_text(encoding="utf-8")
        ast.parse(cls.gateway)

    def test_firmware_has_stall_and_absolute_deadlines(self) -> None:
        self.assertIn("TRANSFER_STALL_TIMEOUT_MS = 3UL * 60UL * 1000UL", self.firmware)
        self.assertIn("TRANSFER_MAX_RUNTIME_MS = 10UL * 60UL * 1000UL", self.firmware)
        self.assertIn("void monitorTransferWatchdog()", self.firmware)
        loop = self.firmware[self.firmware.index("void loop()") :]
        self.assertIn("monitorTransferWatchdog();", loop)
        self.assertIn("ESP.restart();", loop)

    def test_every_acknowledged_block_touches_progress_before_the_write(self) -> None:
        write = "written = writeChar->writeValue(block.data(), dataLen + 4, blockWriteWithResponse);"
        position = self.firmware.index(write)
        preceding = self.firmware[position - 500 : position]
        self.assertIn('updateTransferProgress("writing_block", uniqueSent, totalBlocks);', preceding)
        following = self.firmware[position : position + 900]
        self.assertIn('updateTransferProgress("transferring", uniqueSent, totalBlocks);', following)

    def test_status_exposes_phase_block_and_stall_age(self) -> None:
        for field in (
            'doc["phase"]',
            'doc["last_block"]',
            'doc["total_blocks"]',
            'doc["progress_percent"]',
            'doc["stall_ms"]',
        ):
            self.assertIn(field, self.firmware)

    def test_cancel_endpoint_disconnects_and_schedules_recovery(self) -> None:
        self.assertIn(
            'server.on("/api/transfer/cancel", HTTP_POST, handleTransferCancel);',
            self.firmware,
        )
        self.assertIn("activeTransferClient->disconnect();", self.firmware)
        self.assertIn(
            "transferRecoveryRestartAtMs = millis() + TRANSFER_RECOVERY_RESTART_DELAY_MS;",
            self.firmware,
        )
        self.assertIn('transferJob.error = "transfer_cancelled";', self.firmware)

    def test_home_assistant_cancels_the_remote_job_after_its_poll_timeout(self) -> None:
        self.assertIn('/api/transfer/cancel?id={quote(job_id, safe=\'\')}', self.gateway)
        self.assertIn("async with session.post(cancel_url, timeout=8)", self.gateway)
        self.assertIn('"error": "gateway_transfer_timeout"', self.gateway)
        self.assertIn('"gateway_side": True', self.gateway)

    def test_gateway_timeout_errors_never_blame_the_display(self) -> None:
        block = self.gateway[
            self.gateway.index("GATEWAY_SIDE_JOB_ERRORS = frozenset(") :
            self.gateway.index("GATEWAY_MAX_UPLOAD_BYTES")
        ]
        for error in (
            "gateway_transfer_timeout",
            "transfer_watchdog_timeout",
            "transfer_cancelled",
        ):
            self.assertIn(error, block)


if __name__ == "__main__":
    unittest.main()
