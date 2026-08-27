"""Global installation and gateway health alerts in the panel."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"
PANEL = FRONTEND / "panel"


class SystemAlertTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ui = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.gateways = (PANEL / "panel-gateway.mixin.js").read_text(encoding="utf-8")

    def test_bluetooth_warning_waits_for_a_real_scan(self) -> None:
        self.assertIn('hasOwnProperty.call(result || {}, "scanner_count")', self.ui)
        self.assertIn("Number(result.scanner_count || 0) < 1", self.ui)
        self.assertIn("Bluetooth není v Home Assistantu dostupný", self.ui)

    def test_scanner_count_change_repaints_the_global_warning(self) -> None:
        self.assertIn('`scanner:${Number(result.scanner_count || 0)}`', self.devices)
        self.assertIn('"scanner:unchecked"', self.devices)

    def test_old_gateway_firmware_is_compared_with_the_bundled_version(self) -> None:
        self.assertIn("CURRENT_GATEWAY_FIRMWARES.has(firmware)", self.ui)
        self.assertIn("Je dostupná aktualizace firmwaru gatewaye", self.ui)
        self.assertIn("data-system-alert-gateways", self.ui)
        inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.assertIn('this._activeTab = "gateways"', inspector)

    def test_gateway_poll_repaints_alert_on_every_tab(self) -> None:
        self.assertIn("beforeFirmwareAlert !== afterFirmwareAlert", self.gateways)
        self.assertIn("alertChanged || this._pendingGatewayBackgroundRender", self.gateways)

    def test_alerts_are_global_and_red(self) -> None:
        header_end = self.ui.index('${this._renderSystemAlerts(result)}')
        first_tab = self.ui.index('this._activeTab === "devices"', header_end)
        self.assertLess(header_end, first_tab)
        self.assertIn("border:2px solid #dc2626", self.ui)
        self.assertIn('role="alert"', self.ui)


if __name__ == "__main__":
    unittest.main()
