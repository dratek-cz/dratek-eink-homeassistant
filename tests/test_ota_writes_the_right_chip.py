"""An OTA update must never write an image for a different chip.

Reported from the field: the update ran, the log said only "OTA update failed:"
with nothing after the colon, and the gateway had to be recovered with a USB
cable. Two things in the OTA path made that outcome reachable.

The chip family was read from ``_gateway_base_url`` - the stored host - and the
image was uploaded to ``_gateway_send_base_url``, which deliberately prefers a
freshly probed IP over that host. They disagree exactly when an mDNS name and a
DHCP lease have drifted apart, which this module already carries a long comment
about for transfers. Misrouting a transfer puts a picture on the wrong display.
Misrouting this reads the chip family from one box and writes an application
image into another, and on a shelf holding both ESP32 and ESP32-S3 gateways
that is a board that no longer boots.

And nothing anywhere compared the image to the chip. ``Update.setMD5`` proves
the bytes arrived intact; it says nothing about which CPU they are for.

The empty message was aiohttp: ``ServerDisconnectedError`` and ``TimeoutError``
both stringify to "".
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
FIRMWARE_DIR = COMPONENT / "firmware"
GATEWAY = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
MAIN_CPP = (ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp").read_text(
    encoding="utf-8"
)

# Bytes 12-13 of an ESP32 application image's extended header.
CHIP_IDS = {"esp32": 0x0000, "esp32s2": 0x0002, "esp32c3": 0x0005, "esp32s3": 0x0009}


class BundledImageTests(unittest.TestCase):
    def test_every_shipped_app_image_is_for_the_chip_its_name_claims(self) -> None:
        # The check below trusts the file name to pick a candidate and the
        # header to confirm it. If those two ever disagree in the repository,
        # every other guard is guarding the wrong thing.
        for chip, expected in (("esp32", 0x0000), ("esp32s3", 0x0009)):
            path = FIRMWARE_DIR / f"dratek-eink-gateway-{chip}.bin"
            with self.subTest(chip=chip):
                image = path.read_bytes()
                self.assertEqual(image[0], 0xE9, "not an application image")
                self.assertEqual(int.from_bytes(image[12:14], "little"), expected)

    def test_the_reader_agrees_with_the_shipped_images(self) -> None:
        namespace: dict[str, object] = {}
        tree = ast.parse(GATEWAY)
        wanted = {"ESP_IMAGE_MAGIC", "ESP_IMAGE_CHIP_IDS", "esp_image_chip"}
        for node in tree.body:
            names = (
                [t.id for t in node.targets if isinstance(t, ast.Name)]
                if isinstance(node, ast.Assign)
                else [node.name] if isinstance(node, ast.FunctionDef) else []
            )
            if set(names) & wanted:
                exec(compile(ast.Module([node], []), "<gateway>", "exec"), namespace)
        esp_image_chip = namespace["esp_image_chip"]

        for chip in ("esp32", "esp32s3"):
            image = (FIRMWARE_DIR / f"dratek-eink-gateway-{chip}.bin").read_bytes()
            self.assertEqual(esp_image_chip(image), chip)
        # Anything that is not an application image must come back empty rather
        # than as a guess: a caller is deciding whether to write flash with it.
        self.assertEqual(esp_image_chip(b""), "")
        self.assertEqual(esp_image_chip(b"\x00" * 64), "")
        self.assertEqual(esp_image_chip(b"\xe9" + b"\x00" * 4), "")


class OtaPathTests(unittest.TestCase):
    def test_the_chip_is_read_from_the_address_that_will_be_written(self) -> None:
        runner = GATEWAY[GATEWAY.index("async def async_start_gateway_ota("):]
        runner = runner[: runner.index("\ndef async_get_gateway_ota_job")]
        confirm = runner.index("_async_probe_gateway_url(hass, base_url)")
        chip = runner.index('chip = str(status.get("chip") or "")')
        upload = runner.index("upload_url = ")
        self.assertLess(confirm, chip, "the chip must come from the confirmed endpoint")
        self.assertLess(chip, upload)
        self.assertIn("status = confirm", runner)

    def test_a_mismatched_image_is_refused_before_it_is_uploaded(self) -> None:
        runner = GATEWAY[GATEWAY.index("async def async_start_gateway_ota("):]
        refuse = runner.index("if image_chip != chip:")
        upload = runner.index("upload_url, data=form")
        self.assertLess(refuse, upload)
        self.assertIn("Refusing to write it", runner)

    def test_a_failure_with_no_message_still_names_itself(self) -> None:
        # "OTA update failed:" and nothing after it is what sent this hunt in
        # the wrong direction for an hour.
        self.assertIn("reason = str(exc).strip() or type(exc).__name__", GATEWAY)


class FirmwareGuardTests(unittest.TestCase):
    def test_the_gateway_checks_the_header_before_writing_flash(self) -> None:
        write = MAIN_CPP[MAIN_CPP.index("if (upload.status == UPLOAD_FILE_WRITE) {"):]
        write = write[: write.index("if (upload.status == UPLOAD_FILE_END) {")]
        guard = write.index("otaHeaderChecked")
        flash = write.index("Update.write(")
        self.assertLess(guard, flash, "the header check must precede the first write")
        self.assertIn("ota_wrong_chip", write)
        self.assertIn("ota_not_an_application_image", write)

    def test_an_image_too_short_to_check_never_switches_the_boot_partition(self) -> None:
        end = MAIN_CPP[MAIN_CPP.index("if (upload.status == UPLOAD_FILE_END) {"):]
        end = end[: end.index("if (upload.status == UPLOAD_FILE_ABORTED)")]
        self.assertIn("ota_header_never_verified", end)
        self.assertLess(end.index("otaHeaderChecked"), end.index("Update.end()"))

    def test_each_build_expects_its_own_chip_id(self) -> None:
        self.assertIn("static const uint16_t EXPECTED_IMAGE_CHIP_ID = 0x0009;", MAIN_CPP)
        self.assertIn("static const uint16_t EXPECTED_IMAGE_CHIP_ID = 0x0000;", MAIN_CPP)


if __name__ == "__main__":
    unittest.main()


class StaleSessionTests(unittest.TestCase):
    """One interrupted upload must not cost the gateway its OTA for good.

    When the HTTP connection drops, the WebServer does not always deliver
    UPLOAD_FILE_ABORTED, so failOta - and with it Update.abort() - never runs
    and UpdateClass keeps _size set. Its begin() then takes the one early
    return in the whole function that sets no error:

        if (_size > 0) { log_w("already running"); return false; }

    which is why a gateway in that state answered "ota_begin_failed: No Error"
    to every later attempt until it was power-cycled. Confirmed against
    framework-arduinoespressif32's Updater.cpp: every other failure inside
    begin() sets _error first, so "No Error" identifies this path exactly.
    """

    def test_a_stale_update_session_is_cleared_before_begin(self) -> None:
        start = MAIN_CPP[MAIN_CPP.index("if (upload.status == UPLOAD_FILE_START) {"):]
        start = start[: start.index("if (upload.status == UPLOAD_FILE_WRITE) {")]
        clear = start.index("if (Update.isRunning()) {")
        begin = start.index("Update.begin(otaExpectedSize")
        self.assertLess(clear, begin, "the stale session must be cleared first")
        self.assertIn("Update.abort();", start)

    def test_no_error_is_never_reported_as_a_reason(self) -> None:
        start = MAIN_CPP[MAIN_CPP.index("if (upload.status == UPLOAD_FILE_START) {"):]
        start = start[: start.index("if (upload.status == UPLOAD_FILE_WRITE) {")]
        self.assertIn('reason == "No Error"', start)
        self.assertIn("update already running", start)

    def test_begin_and_the_checksum_report_separately(self) -> None:
        # They shared one branch, so a rejected checksum printed begin()'s
        # error string - which, begin() having succeeded, was "No Error".
        start = MAIN_CPP[MAIN_CPP.index("if (upload.status == UPLOAD_FILE_START) {"):]
        start = start[: start.index("if (upload.status == UPLOAD_FILE_WRITE) {")]
        self.assertNotIn("|| !Update.setMD5(", start)
        self.assertIn("gateway rejected the checksum", start)


class BusyIsNotOfflineOnTheOtaPathTests(unittest.TestCase):
    def test_a_busy_gateway_is_never_a_reason_to_refuse(self) -> None:
        # "Busy" does not mean the gateway is doing something - it means this
        # integration is holding that gateway's HTTP lock, and an upload that
        # hung held it for its whole timeout. The box answered /api/status in a
        # tenth of a second while the update refused to start. The upload takes
        # the same lock anyway and can simply queue behind whatever has it.
        runner = GATEWAY[GATEWAY.index("async def async_start_gateway_ota("):]
        runner = runner[: runner.index("\ndef async_get_gateway_ota_job")]
        self.assertIn('if status.get("ok") or not status.get("busy"):', runner)
        self.assertIn("Gateway is busy; waiting for a turn.", runner)
        # Falls back to the chip family already on record instead of raising.
        self.assertIn("stored = gateway_chip(gateway)", runner)
        self.assertIn("going ahead with its known chip", runner)
        self.assertIn('elif confirm.get("busy"):', runner)

    def test_a_hung_upload_releases_the_gateway_promptly(self) -> None:
        # A working upload finishes in seconds - verified on hardware, the whole
        # 1.1 MB in one go. The ceiling only decides how long a broken one keeps
        # the box hostage, and at 300 s it held every status probe on it.
        self.assertIn("upload_url, data=form, timeout=90", GATEWAY)
        self.assertNotIn("data=form, timeout=300", GATEWAY)

    def test_an_empty_exception_no_longer_becomes_gateway_is_offline(self) -> None:
        # A gateway answering pings, and answering this endpoint a second
        # later, was reported "offline" because str(TimeoutError()) is "".
        self.assertNotIn('or "Gateway is offline."', GATEWAY)
        probe = GATEWAY[GATEWAY.index("async def _async_probe_gateway_url("):]
        probe = probe[: probe.index("\n\n\nasync def ")]
        self.assertIn('"message": str(exc).strip() or type(exc).__name__', probe)
