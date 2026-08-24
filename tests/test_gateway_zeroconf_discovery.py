"""Regression checks for zero-touch ESP32 gateway discovery in Home Assistant."""

from __future__ import annotations

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
FIRMWARE = ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"


class GatewayZeroconfDiscoveryTests(unittest.TestCase):
    def test_manifest_subscribes_home_assistant_to_gateway_mdns(self) -> None:
        manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
        self.assertIn("_dratek-eink-gateway._tcp.local.", manifest["zeroconf"])

    def test_firmware_advertises_stable_identity_and_friendly_name(self) -> None:
        source = FIRMWARE.read_text(encoding="utf-8")
        self.assertIn('MDNS.addService("dratek-eink-gateway", "tcp", 80)', source)
        self.assertIn('"id", gatewayId.c_str()', source)
        self.assertIn('"name", hostname.c_str()', source)
        self.assertIn('"model", "DRATEK eInk Gateway"', source)

    def test_config_flow_handles_nearby_gateway_announcements(self) -> None:
        source = (COMPONENT / "config_flow.py").read_text(encoding="utf-8")
        self.assertIn("async def async_step_zeroconf(", source)
        self.assertIn("async_step_zeroconf_confirm", source)
        self.assertIn("async_upsert_discovered_gateway", source)
        self.assertIn("async_register_gateway_device", source)

    def test_loaded_integration_registers_each_gateway_as_a_device(self) -> None:
        source = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        gateway_source = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        self.assertIn("gateways = await async_load_gateways(hass)", source)
        self.assertIn("for gateway in gateways", source)
        self.assertIn("async_register_gateway_device(hass, entry.entry_id, gateway)", source)
        self.assertIn("registry.async_get_or_create(", gateway_source)
        self.assertIn('identifiers={(DOMAIN, f"gateway:{stable_id}")}', gateway_source)

    def test_bluetooth_and_gateway_scans_register_displays(self) -> None:
        flow = (COMPONENT / "config_flow.py").read_text(encoding="utf-8")
        scan = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")
        registry = (COMPONENT / "device_registry.py").read_text(encoding="utf-8")
        self.assertIn("async def async_step_bluetooth(", flow)
        self.assertIn("register_display_device(hass, entry_id, device, gateways)", scan)
        self.assertIn('identifiers={(DOMAIN, f"display:{address}")}', registry)
        self.assertIn("via_device=via_device", registry)
        init_source = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        self.assertIn("GATEWAY_DISPLAY_DISCOVERY_INTERVAL_SECONDS = 5 * 60", init_source)
        self.assertIn("await async_register_gateway_displays(", init_source)


if __name__ == "__main__":
    unittest.main()
