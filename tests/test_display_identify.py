"""Finding a display: light its own indicator from the device list.

The vendor's 0x30 control packet has been implemented on the local Bluetooth
path for a long time, reachable only through `dratek_eink/set_rgb_led` with a
mode, a flash time and three colour channels - a parameter surface, not an
answer to "which one of these is it?". Worse, it was local-only: a gateway had
no indicator command at all, so the light worked for installations with a Home
Assistant adapter and not for the ones where a display might be in another
room, which is exactly when you need it.

So: one button on the card, routed like a picture is, and a light that stays on
long enough to walk to.
"""

from __future__ import annotations

import ast
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
FIRMWARE = ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"


class IdentifyCommandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sending = (COMPONENT / "ws_sending.py").read_text(encoding="utf-8")
        cls.gateway = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        cls.websocket = (COMPONENT / "websocket.py").read_text(encoding="utf-8")
        for source in (cls.sending, cls.gateway, cls.websocket):
            ast.parse(source)

    def test_the_command_is_registered(self) -> None:
        self.assertIn('"type": "dratek_eink/identify"', self.sending)
        self.assertIn("websocket_identify,", self.websocket)

    def test_it_is_routed_the_same_way_a_picture_is(self) -> None:
        # Pinned gateway, then the gateway pool, then the local adapter. A
        # display reached only through a gateway is the one most worth finding,
        # so local-only would have missed the whole point.
        driver = self.sending[self.sending.index("async def _async_drive_indicator("):]
        driver = driver[: driver.index("\n@websocket_api")]
        self.assertIn("return await _async_submit_routed_transfer(", driver)
        self.assertIn("local_runner=run_local,", driver)
        self.assertIn("gateway_runner_factory=gateway_runner_factory,", driver)
        self.assertIn("await transfer.set_rgb_led(address, mode, 10, red, green, blue)", driver)
        self.assertIn("await async_set_gateway_led(", driver)

    def test_the_light_is_switched_off_again_on_a_timer(self) -> None:
        # The vendor's own flash time is undocumented in unit and capped at 255,
        # so the duration is held on this side instead.
        self.assertIn("IDENTIFY_MINUTES = 3", self.sending)
        self.assertIn("async_call_later(", self.sending)
        self.assertIn("hass, IDENTIFY_MINUTES * 60, _switch_off", self.sending)
        self.assertIn("await _async_drive_indicator(hass, address, mode=0, log=log)", self.sending)

    def test_a_second_press_cancels_the_first_press_s_timer(self) -> None:
        # Otherwise turning the light on again inside the window would be put
        # out early by the previous press's pending callback.
        handler = self.sending[self.sending.index("async def websocket_identify("):]
        self.assertLess(
            handler.index("_cancel_identify_timer(hass, address)"),
            handler.index("result = await _async_drive_indicator("),
        )

    def test_off_uses_a_dark_colour_not_just_a_mode(self) -> None:
        driver = self.sending[self.sending.index("async def _async_drive_indicator("):]
        self.assertIn("red, green, blue = IDENTIFY_COLOR if mode else (0, 0, 0)", driver)

    def test_the_gateway_helper_names_an_out_of_date_firmware(self) -> None:
        # A gateway without /api/led answers 404. "gateway_led_failed" would
        # send someone looking for a fault; the fix is a firmware update.
        helper = self.gateway[self.gateway.index("async def async_set_gateway_led("):]
        helper = helper[: helper.index("\nasync def async_send_gateway_payload(")]
        self.assertIn('url = f"{_gateway_base_url(gateway)}/api/led"', helper)
        self.assertIn("if status == 404:", helper)
        self.assertIn('"error": "gateway_firmware_too_old"', helper)
        # Status is captured inside the response context, not read after it.
        self.assertIn("status = response.status", helper)


class IdentifyFirmwareTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.firmware = FIRMWARE.read_text(encoding="utf-8")

    def test_the_gateway_exposes_an_indicator_endpoint(self) -> None:
        self.assertIn('server.on("/api/led", HTTP_POST, handleLed);', self.firmware)
        self.assertIn("void handleLed() {", self.firmware)

    def test_it_writes_the_same_vendor_packet_the_local_path_does(self) -> None:
        handler = self.firmware[self.firmware.index("void handleLed() {"):]
        handler = handler[: handler.index("\nvoid handleTransferCancel()")]
        self.assertIn("0x30, mode, byteArg(\"flash_time\", 10),", handler)
        self.assertIn("controlChar->writeValue(packet, sizeof(packet), true)", handler)

    def test_it_refuses_while_a_transfer_owns_the_radio(self) -> None:
        # One BLE central at a time, the same rule /api/scan follows.
        handler = self.firmware[self.firmware.index("void handleLed() {"):]
        handler = handler[: handler.index("\nvoid handleTransferCancel()")]
        self.assertIn("if (gatewayOperationBusy())", handler)
        self.assertIn('doc["error"] = "gateway_busy";', handler)

    def test_an_unacknowledged_write_is_reported_as_a_failure(self) -> None:
        # The display can accept the GATT write and ignore the command; calling
        # that success sends the user looking for a light that never came on.
        handler = self.firmware[self.firmware.index("void handleLed() {"):]
        handler = handler[: handler.index("\nvoid handleTransferCancel()")]
        self.assertIn("bool echoed = written && waitForPacket(0x30, response, 3000);", handler)
        self.assertIn('doc["ok"] = echoed;', handler)

    def test_the_client_is_released_exactly_once(self) -> None:
        # releaseTransferClient disconnects, deletes and nulls the pointer.
        handler = self.firmware[self.firmware.index("void handleLed() {"):]
        handler = handler[: handler.index("\nvoid handleTransferCancel()")]
        self.assertEqual(1, handler.count("releaseTransferClient(client);"))
        success = handler[handler.index("releaseTransferClient(client);"):]
        self.assertNotIn("NimBLEDevice::deleteClient(client);", success)


class IdentifyButtonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        cls.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        cls.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_the_button_is_on_the_card_in_the_device_list(self) -> None:
        self.assertIn("_renderIdentifyButton(device) {", self.devices)
        self.assertIn("${this._renderIdentifyButton(device)}", self.devices)
        # In the tile's own tools row, beside the rename control.
        header = self.devices[self.devices.index('<span class="display-tile-tools">'):]
        header = header[: header.index("</span>")]
        self.assertIn("_renderIdentifyButton", header)

    def test_it_is_a_toggle_and_says_which_way_it_will_go(self) -> None:
        renderer = self.devices[self.devices.index("_renderIdentifyButton(device) {"):]
        renderer = renderer[: renderer.index("\n  },")]
        self.assertIn('data-device-identify-on="${lit ? "0" : "1"}"', renderer)
        self.assertIn('lit ? "Zhasnout kontrolku displeje" : "Rozsvítit kontrolku displeje"', renderer)
        self.assertIn('aria-pressed="${lit ? "true" : "false"}"', renderer)

    def test_the_click_does_not_open_the_display_s_settings(self) -> None:
        # The whole tile is a button that opens settings; a tool inside its
        # header has to keep its click.
        binding = self.inspector[self.inspector.index('querySelectorAll("[data-device-identify]")'):]
        binding = binding[: binding.index("}));")]
        self.assertIn("event.stopPropagation();", binding)
        self.assertIn("this._toggleDisplayIdentify(", binding)

    def test_the_button_stops_claiming_the_light_when_it_goes_out(self) -> None:
        # The backend puts the LED out on its own, so a button left showing
        # "lit" would be lying from that moment on.
        toggle = self.devices[self.devices.index("async _toggleDisplayIdentify(address, turnOn) {"):]
        toggle = toggle[: toggle.index("\n  },")]
        self.assertIn('type: "dratek_eink/identify"', toggle)
        self.assertIn("Number(result?.minutes) > 0", toggle)
        self.assertIn("this._identifying.delete(key);", toggle)

    def test_a_lit_button_is_visibly_lit(self) -> None:
        self.assertIn(".tile-identify-btn.is-lit{", self.styles)
        self.assertIn("@keyframes identifyPulse", self.styles)
        # A pulsing icon is decoration, and decoration is opt-out.
        self.assertIn("@media(prefers-reduced-motion:reduce)", self.styles)


if __name__ == "__main__":
    unittest.main()
