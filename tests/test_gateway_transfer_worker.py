"""The gateway's transfer task must be created once, not per transfer.

A task's stack has to be one contiguous block. The firmware used to call
xTaskCreate(transferTask, "dratek-transfer", 12288, ...) for every transfer
and vTaskDelete it at the end, so a 12 kB block was taken and handed back
over and over - the textbook way to chop a heap into pieces too small to
satisfy the next request.

Measured on a live gateway (esp32s3, 3 displays, Wi-Fi at -71 dBm) after
45.7 hours of uptime:

    free_heap           24096 bytes
    largest_free_block   8436 bytes   <- less than the 12288 the task needs

xTaskCreate therefore failed and every transfer through that gateway died
with transfer_task_start_failed, while the sibling gateway (esp32, 1 display,
-52 dBm) sat at 50884 free with a 25588-byte largest block and never missed
one. The heap was not leaking - it was fragmented.

Claiming the stack once at boot costs the same 12 kB but takes it while the
heap is still whole and never gives it back, so fragmentation cannot take it
away. That is the same reasoning the payload buffer already relies on.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIRMWARE = ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
CONST = ROOT / "custom_components" / "dratek_eink" / "const.py"
PANEL_CONSTANTS = (
    ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel" / "panel-constants.js"
)
BINARIES = ROOT / "custom_components" / "dratek_eink" / "firmware"


class TransferWorkerLifetimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = FIRMWARE.read_text(encoding="utf-8")

    def test_the_task_is_never_created_per_transfer(self) -> None:
        # Exactly one creation site, and it is the guarded helper.
        self.assertEqual(self.source.count("xTaskCreate("), 1)
        self.assertIn("bool ensureTransferWorker() {", self.source)

    def test_the_worker_is_not_deleted_when_a_transfer_ends(self) -> None:
        # vTaskDelete(nullptr) is what handed the stack back every time.
        # Matched with the parenthesis so the comment above the worker, which
        # names the old call, does not satisfy the assertion by itself.
        self.assertNotIn("vTaskDelete(", self.source)

    def test_the_worker_parks_on_a_semaphore_and_loops(self) -> None:
        match = re.search(r"void transferWorkerTask\(void\*\) \{(.*?)\n\}", self.source, re.S)
        self.assertIsNotNone(match, "transferWorkerTask not found")
        body = match.group(1)
        self.assertIn("for (;;)", body)
        self.assertIn("xSemaphoreTake(transferSignal, portMAX_DELAY)", body)
        self.assertIn("runQueuedTransfer();", body)

    def test_the_stack_is_claimed_at_boot_before_ble_and_the_payload(self) -> None:
        setup = self.source[self.source.index("void setup()") :]
        claim = setup.index("ensureTransferWorker()")
        for later in ("ensureBleInitialized();", "connectWifi();", "uploadPayload.reserve("):
            self.assertLess(
                claim,
                setup.index(later),
                f"the worker stack must be claimed before {later}",
            )

    def test_starting_a_transfer_only_signals_the_worker(self) -> None:
        match = re.search(r"void startQueuedTransfer\(\) \{(.*?)\n\}", self.source, re.S)
        self.assertIsNotNone(match)
        body = match.group(1)
        self.assertIn("xSemaphoreGive(transferSignal);", body)
        self.assertNotIn("xTaskCreate", body)

    def test_the_failure_path_is_unchanged(self) -> None:
        # If the worker genuinely cannot be created the job must still fail the
        # same way, so the integration keeps classifying it as gateway-side.
        match = re.search(r"void startQueuedTransfer\(\) \{(.*?)\n\}", self.source, re.S)
        body = match.group(1)
        self.assertIn('transferJob.error = "transfer_task_start_failed";', body)
        self.assertIn("uploadPayload.swap(queuedPayload);", body)

    def test_the_stack_size_did_not_shrink(self) -> None:
        # Shrinking the stack would be the other way to make xTaskCreate fit,
        # and a silent way to overflow it mid-transfer. 12288 stays.
        self.assertIn("TRANSFER_TASK_STACK_WORDS = 12288", self.source)


class GatewayFirmwareVersionTests(unittest.TestCase):
    def test_the_three_version_constants_agree(self) -> None:
        firmware = re.search(
            r'FIRMWARE_VERSION = "([^"]+)"', FIRMWARE.read_text(encoding="utf-8")
        ).group(1)
        backend = re.search(
            r'GATEWAY_FIRMWARE_VERSION = "([^"]+)"', CONST.read_text(encoding="utf-8")
        ).group(1)
        panel = re.search(
            r'CURRENT_GATEWAY_FIRMWARES = new Set\(\["([^"]+)"\]\)',
            PANEL_CONSTANTS.read_text(encoding="utf-8"),
        ).group(1)
        self.assertEqual(firmware, backend)
        self.assertEqual(firmware, panel)

    def test_the_shipped_binaries_carry_that_version(self) -> None:
        # The panel flashes these files, so a source-only bump would leave
        # every gateway reporting the old version after a "successful" update.
        expected = re.search(
            r'FIRMWARE_VERSION = "([^"]+)"', FIRMWARE.read_text(encoding="utf-8")
        ).group(1).encode()
        for name in ("dratek-eink-gateway-esp32.bin", "dratek-eink-gateway-esp32s3.bin"):
            data = (BINARIES / name).read_bytes()
            self.assertIn(expected, data, f"{name} was not rebuilt for {expected.decode()}")


if __name__ == "__main__":
    unittest.main()
