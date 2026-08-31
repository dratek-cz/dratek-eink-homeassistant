"""A configured gateway answers the "no Bluetooth adapter" warning for good.

The banner fired on `scanner_count < 1` alone. A gateway drives displays over
the network and needs no Home Assistant adapter at all, so for anyone running
gateways the warning was permanent, unactionable, and wrong about what their
installation could do.

Reading the gateway list separately would not have fixed it either: that list
is filled by a poll a second and a half after the first paint, so the banner
would appear and then vanish on every single load. The count therefore travels
in the same scan result as scanner_count, and the panel decides once.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


class GatewayCountIsInTheScanResultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.ws_devices = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")
        cls.render_ui = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_the_scan_result_carries_the_gateway_count(self) -> None:
        self.assertIn('"gateway_count": len(gateways),', self.ws_devices)
        # Beside scanner_count, in the one payload the scan handler sends -
        # not a second round trip.
        handler = self.ws_devices[self.ws_devices.index("async def websocket_scan("):]
        result = handler[handler.index('"scanner_count": scanner_count,'):]
        result = result[: result.index("@websocket_api")]
        self.assertLess(result.index('"gateway_count"'), result.index('"ble_count"'))
        self.assertIn('"devices": devices,', result)

    def test_the_gateways_are_loaded_before_the_result_is_sent(self) -> None:
        # `gateways` is already in hand for the gateway scan loop; the count
        # must reuse that binding rather than reload the list.
        handler = self.ws_devices[self.ws_devices.index("async def websocket_scan("):]
        self.assertLess(
            handler.index("gateways = await async_load_gateways(hass)"),
            handler.index('"gateway_count": len(gateways),'),
        )

    def test_the_banner_is_suppressed_once_a_gateway_exists(self) -> None:
        self.assertIn(
            'const gatewayConfigured = Number(result?.gateway_count || 0) > 0',
            self.render_ui,
        )
        self.assertIn(
            "if (bluetoothChecked && !gatewayConfigured && Number(result.scanner_count || 0) < 1)",
            self.render_ui,
        )

    def test_a_setup_with_neither_still_gets_the_banner(self) -> None:
        # The guard is a gateway check, not a removal: with no adapter and no
        # gateway there is nothing that can drive a display, and that is worth
        # saying.
        alert = self.render_ui[self.render_ui.index("_renderSystemAlerts(result) {"):]
        alert = alert[: alert.index("\n  },")]
        self.assertIn("Bluetooth není v Home Assistantu dostupný", alert)
        self.assertIn("scanner_count", alert)


class AutomationQueueCancelTests(unittest.TestCase):
    """Calling off a queued write from the page you watch automations on."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.automations = (PANEL / "panel-automations.mixin.js").read_text(encoding="utf-8")
        cls.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        cls.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_waiting_writes_are_shown_not_only_the_one_in_progress(self) -> None:
        # The tab used to read the queue for "which addresses are writing" and
        # nothing else, so a write still waiting its turn was invisible here.
        self.assertIn('if (!["queued", "writing"].includes(job.status)) continue;', self.automations)
        self.assertIn("_renderAutomationQueue(jobs) {", self.automations)
        self.assertIn("activeJobs.get(String(automation.address || \"\").toUpperCase())", self.automations)

    def test_only_a_waiting_write_offers_the_cancel_button(self) -> None:
        # async_cancel_job refuses anything already "writing" - a transfer may
        # be mid-block and dropping it there freezes the display's controller -
        # so a write in progress must not be given a button that would fail.
        renderer = self.automations[self.automations.index("_renderAutomationQueue(jobs) {"):]
        renderer = renderer[: renderer.index("\n  },")]
        self.assertIn('const waiting = job.status === "queued";', renderer)
        self.assertIn("${waiting ? `<button", renderer)

    def test_the_button_reuses_the_queue_tab_s_own_handler(self) -> None:
        # One cancel path, not two: the attribute the queue tab emits is the
        # attribute this button emits, and _bind wires both at once.
        self.assertIn("data-cancel-queue-job=", self.automations)
        self.assertIn('this.shadowRoot.querySelectorAll("[data-cancel-queue-job]")', self.inspector)
        self.assertIn('type: "dratek_eink/queue/cancel"', self.inspector)

    def test_the_strip_is_styled(self) -> None:
        for rule in (".automation-queue{", ".automation-queue-job{", ".automation-queue-cancel{"):
            with self.subTest(rule=rule):
                self.assertIn(rule, self.styles)


class AdvertisedTypeDecodingTests(unittest.TestCase):
    """The advertised type decides the packing, so pin how it is read.

    raw_type is two bytes of the advertisement, and bit 0x4000 of it is a
    separate statement about payload framing that must not leak into the model
    lookup. Recorded here against real advertisements captured from hardware,
    so a change to the masking is caught against something that actually exists
    rather than against a hand-made number.
    """

    CAPTURED = {
        # address: (manufacturer data as the gateway reports it, raw, sdk)
        "FF:FF:92:81:59:39": ("53502E1D810140", 0x402E, 46),
        "FF:FF:92:81:46:32": ("5350331D810140", 0x4033, 51),
        "FF:FF:94:20:10:78": ("53504B1D810140", 0x404B, 75),
        "FF:FF:99:80:41:52": ("53502B1B810101", 0x012B, 299),
    }

    def test_captured_advertisements_decode_to_their_known_models(self) -> None:
        import importlib.util
        import sys
        import types

        package = "dratek_advert_test"
        if package not in sys.modules:
            module = types.ModuleType(package)
            module.__path__ = [str(COMPONENT)]
            sys.modules[package] = module
        spec = importlib.util.spec_from_file_location(
            f"{package}.discovery", COMPONENT / "discovery.py"
        )
        assert spec and spec.loader
        discovery = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = discovery
        spec.loader.exec_module(discovery)

        for address, (payload, raw, sdk) in self.CAPTURED.items():
            with self.subTest(address=address):
                data = bytes.fromhex(payload)
                if int.from_bytes(data[:2], "little") == 0x5053:
                    data = data[2:]
                parsed = discovery.parse_dratek_manufacturer_data(address, "", None, data)
                self.assertIsNotNone(parsed)
                self.assertEqual(raw, parsed.raw_type)
                self.assertEqual(sdk, parsed.sdk_type)

    def test_no_800x480_code_is_in_both_packing_sets(self) -> None:
        # pack_bwr_image checks BWRY_CODES first and returns, so a code in both
        # sets never reaches the 800x480 branch at all. 302, 310 and 318 are
        # named "800x480 BWR" in SDK_MODELS and sit in both - a three-colour
        # panel that advertises one of them is packed two bits per pixel, which
        # the panel reads misaligned and prints as white/red/black grain over
        # the whole screen. Left failing deliberately would be worse than
        # documented: this test records the overlap so the decision is a
        # decision, not an oversight.
        render_source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        bwry = eval(re.search(r"BWRY_CODES = (\{[^}]*\})", render_source).group(1))
        wide = eval(re.search(r"BWR_800X480_CODES = (\{[^}]*\})", render_source).group(1))
        self.assertEqual(
            {302, 310, 318},
            bwry & wide,
            "the set of codes claimed by both packers changed - confirm against hardware "
            "which panel each of them really is before editing either set",
        )


if __name__ == "__main__":
    unittest.main()
