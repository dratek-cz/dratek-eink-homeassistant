"""The browser route for creating a gateway, alongside the host route.

A gateway can be flashed two ways: esptool running next to Home Assistant
(_flash_gateway_sync), or the panel writing the same images itself over Web
Serial from the machine the operator is sitting at. Both must end up with the
same bytes at the same offsets, so the pieces guarded here are the ones that
could silently drift apart - the manifest the browser flashes from, the view
that hands it the images, and the panel wiring that offers the choice at all.

The Web Serial protocol code itself needs a browser and a board, so it cannot
run here; what this file can prove is that nothing else has moved out from
under it.
"""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
PACKAGE = "dratek_browser_flash_test"


def _load_gateway_module():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package

    aiohttp = types.ModuleType("aiohttp")
    aiohttp.FormData = object
    homeassistant = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = object
    helpers = types.ModuleType("homeassistant.helpers")
    aiohttp_client = types.ModuleType("homeassistant.helpers.aiohttp_client")
    aiohttp_client.async_get_clientsession = lambda _hass: None
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = object
    sys.modules.update(
        {
            "aiohttp": aiohttp,
            "homeassistant": homeassistant,
            "homeassistant.core": core,
            "homeassistant.helpers": helpers,
            "homeassistant.helpers.aiohttp_client": aiohttp_client,
            "homeassistant.helpers.storage": storage,
        }
    )

    render = types.ModuleType(f"{PACKAGE}.render")
    render.pack_bwr_image = lambda *_args, **_kwargs: b""
    render.pack_bwr_region = lambda *_args, **_kwargs: b""
    render.packing_description = lambda *_args, **_kwargs: "SDK type stub"
    sys.modules[render.__name__] = render

    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.gateway", COMPONENT / "gateway.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


gateway = _load_gateway_module()


class FirmwarePartLookupTests(unittest.TestCase):
    """gateway_firmware_part_path is reached straight from an HTTP request."""

    def test_known_parts_resolve_to_the_bundled_images(self) -> None:
        for chip, profile in gateway.FLASH_PROFILES.items():
            for part in gateway.FLASH_PART_ORDER:
                with self.subTest(chip=chip, part=part):
                    self.assertEqual(
                        profile["files"][part][1],
                        gateway.gateway_firmware_part_path(chip, part),
                    )

    def test_a_crafted_request_cannot_leave_the_firmware_directory(self) -> None:
        # The request selects a FLASH_PROFILES entry, it never contributes to
        # a path, so traversal has nothing to traverse.
        for chip, part in (
            ("esp32", "../../../../etc/passwd"),
            ("../..", "app"),
            ("esp32", "app/../../secrets.yaml"),
            ("esp32", ""),
            ("", ""),
            ("esp32c3", "app"),
            ("esp32", "nvs"),
        ):
            with self.subTest(chip=chip, part=part):
                self.assertIsNone(gateway.gateway_firmware_part_path(chip, part))

    def test_lookup_ignores_case_and_surrounding_space(self) -> None:
        self.assertIsNotNone(gateway.gateway_firmware_part_path(" ESP32 ", " App "))


class FlashManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = gateway._flash_manifest_sync()

    def test_every_supported_chip_is_offered(self) -> None:
        self.assertEqual(set(gateway.FLASH_PROFILES), set(self.manifest))

    def test_offsets_match_the_profile_the_host_route_flashes(self) -> None:
        for chip, entry in self.manifest.items():
            offsets = {part["part"]: part["offset"] for part in entry["parts"]}
            expected = {
                part: gateway.FLASH_PROFILES[chip]["files"][part][0]
                for part in gateway.FLASH_PART_ORDER
                if not entry["missing"]
            }
            with self.subTest(chip=chip):
                self.assertEqual(expected, offsets)

    def test_sizes_and_digests_describe_the_bundled_bytes(self) -> None:
        for chip, entry in self.manifest.items():
            for part in entry["parts"]:
                path = gateway.FLASH_PROFILES[chip]["files"][part["part"]][1]
                data = path.read_bytes()
                with self.subTest(chip=chip, part=part["part"]):
                    self.assertEqual(len(data), part["size"])
                    self.assertEqual(
                        hashlib.md5(data, usedforsecurity=False).hexdigest(), part["md5"]
                    )

    def test_the_browser_is_told_to_clear_the_same_span_esptool_erases(self) -> None:
        # The host route erases NVS with esptool; the ROM loader the browser
        # talks to has no erase-region, so it writes 0xFF over this span
        # instead. A drift between the two would leave the browser-flashed
        # board booting with the previous gateway's stored Wi-Fi.
        for chip, entry in self.manifest.items():
            with self.subTest(chip=chip):
                self.assertEqual(
                    {"offset": gateway.NVS_ERASE_OFFSET, "size": gateway.NVS_ERASE_SIZE},
                    entry["erase"],
                )

    def test_the_erase_span_covers_nvs_without_touching_the_app(self) -> None:
        end = gateway.NVS_ERASE_OFFSET + gateway.NVS_ERASE_SIZE
        for chip, profile in gateway.FLASH_PROFILES.items():
            app_offset = profile["files"]["app"][0]
            partitions_offset = profile["files"]["partitions"][0]
            with self.subTest(chip=chip):
                self.assertLessEqual(end, app_offset)
                self.assertGreaterEqual(gateway.NVS_ERASE_OFFSET, partitions_offset)
                # The ROM erases whole 4 kB sectors around whatever it is
                # given, so a misaligned span would eat a neighbour.
                self.assertEqual(0, gateway.NVS_ERASE_OFFSET % 0x1000)
                self.assertEqual(0, gateway.NVS_ERASE_SIZE % 0x1000)


class BrowserFlashWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ws_gateways = (COMPONENT / "ws_gateways.py").read_text(encoding="utf-8")
        self.websocket = (COMPONENT / "websocket.py").read_text(encoding="utf-8")
        self.init = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        self.view = (COMPONENT / "http_firmware.py").read_text(encoding="utf-8")
        self.panel = (COMPONENT / "frontend" / "dratek-eink-panel.js").read_text(encoding="utf-8")
        self.mixin = (PANEL / "panel-webserial.mixin.js").read_text(encoding="utf-8")
        self.gateway_mixin = (PANEL / "panel-gateway.mixin.js").read_text(encoding="utf-8")
        self.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")

    def test_manifest_command_is_defined_and_registered(self) -> None:
        self.assertIn('"type": "dratek_eink/gateways/firmware_manifest"', self.ws_gateways)
        self.assertIn("def websocket_gateway_firmware_manifest(", self.ws_gateways)
        self.assertIn("websocket_gateway_firmware_manifest", self.websocket)

    def test_firmware_images_stay_behind_authentication(self) -> None:
        self.assertIn("requires_auth = True", self.view)
        self.assertIn("hass.http.register_view(GatewayFirmwareView())", self.init)
        # A static path is served to anyone who can reach the port, so the
        # firmware directory must never become one.
        for line in self.init.splitlines():
            if "StaticPathConfig(" in line:
                self.assertNotIn("firmware", line)

    def test_the_panel_offers_both_routes(self) -> None:
        self.assertIn('id: "browser"', self.mixin)
        self.assertIn('id: "host"', self.mixin)
        self.assertIn("_renderGatewayRoutePicker()", self.gateway_mixin)
        # The host route keeps its own port picker and install panel.
        self.assertIn("_renderGatewayPortPicker()", self.gateway_mixin)
        self.assertIn("_renderGatewayInstallPanel(selectedBoard)", self.gateway_mixin)
        self.assertIn("_renderBrowserInstallPanel(selectedBoard)", self.gateway_mixin)

    def test_the_mixin_is_merged_into_the_panel(self) -> None:
        self.assertIn("panel-webserial.mixin.js", self.panel)
        self.assertIn("webSerialMixin,", self.panel)
        self.assertIn('this._flashRoute = "host";', self.panel)

    def test_every_browser_control_has_a_listener(self) -> None:
        for element_id in (
            "pickBrowserPort",
            "forgetBrowserPort",
            "browserFlashGateway",
            "browserSerialStatus",
            "browserSerialWifi",
        ):
            with self.subTest(element=element_id):
                self.assertIn(f'id="{element_id}"', self.mixin)
                self.assertIn(f'querySelector("#{element_id}")', self.inspector)
        self.assertIn("data-flash-route", self.mixin)
        self.assertIn("[data-flash-route]", self.inspector)

    def test_the_browser_route_is_refused_outside_a_secure_context(self) -> None:
        # navigator.serial simply is not there on plain http, so the panel has
        # to say why. The route card itself must remain selectable: it opens
        # that explanation; only the actual port picker is disabled.
        flasher = (PANEL / "esp-web-flasher.js").read_text(encoding="utf-8")
        self.assertIn("isSecureContext", flasher)
        self.assertIn("_renderBrowserFlashNotice", self.mixin)
        self.assertIn("const disabled = this._gatewayBusy;", self.mixin)
        self.assertIn("this._gatewayBusy || blocked ? \"disabled\"", self.mixin)
        self.assertNotIn('route.id === "browser" && Boolean(blocked));', self.mixin)


if __name__ == "__main__":
    unittest.main()
