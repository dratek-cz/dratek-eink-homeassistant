"""Regression coverage for useful physical-display pages in Home Assistant."""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


class DisplayDeviceEntityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.init = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        cls.registry = (COMPONENT / "device_registry.py").read_text(encoding="utf-8")
        cls.sensor = (COMPONENT / "sensor.py").read_text(encoding="utf-8")
        cls.binary = (COMPONENT / "binary_sensor.py").read_text(encoding="utf-8")
        cls.camera = (COMPONENT / "camera.py").read_text(encoding="utf-8")
        cls.preview = (COMPONENT / "display_preview.py").read_text(encoding="utf-8")
        frontend = COMPONENT / "frontend" / "panel"
        cls.variables = (frontend / "panel-variables.mixin.js").read_text(encoding="utf-8")
        cls.inspector = (frontend / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        cls.devices = (frontend / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_physical_display_platforms_are_loaded(self) -> None:
        self.assertIn("Platform.BINARY_SENSOR", self.init)
        self.assertIn("Platform.CAMERA", self.init)
        self.assertIn("Platform.SENSOR", self.init)

    def test_display_page_exposes_requested_telemetry(self) -> None:
        for entity in (
            "DisplayBatterySensor",
            "DisplayBatteryVoltageSensor",
            "DisplaySignalSensor",
            "DisplayLastSeenSensor",
            "DisplayRouteSensor",
        ):
            self.assertIn(f"class {entity}", self.sensor)
        self.assertIn("class DisplayConnectivityBinarySensor", self.binary)
        self.assertIn("BinarySensorDeviceClass.CONNECTIVITY", self.binary)

    def test_all_display_entities_share_the_physical_device_identifier(self) -> None:
        self.assertIn('f"display:{normalized}"', self.registry)
        self.assertIn("return display_device_info(self.hass, self.address)", self.sensor)
        self.assertIn("return display_device_info(self.hass, self.address)", self.binary)
        self.assertIn("return display_device_info(self.hass, self.address)", self.camera)

    def test_late_discovery_adds_entities_without_a_reload(self) -> None:
        self.assertIn("async_dispatcher_send", self.registry)
        self.assertIn("async_dispatcher_connect", self.sensor)
        self.assertIn("async_dispatcher_connect", self.binary)
        self.assertIn("async_dispatcher_connect", self.camera)

    def test_preview_camera_only_uses_the_last_successful_image(self) -> None:
        self.assertIn("class DratekDisplayPreviewCamera", self.camera)
        self.assertIn("async_display_preview(self.hass, self.address)", self.camera)
        self.assertIn('prefix = "data:image/png;base64,"', self.camera)
        self.assertIn("display_update_signal(entry_id)", self.preview)

    def test_internal_devices_are_marked_as_services(self) -> None:
        self.assertIn("DeviceEntryType.SERVICE", self.sensor)
        self.assertIn("DeviceEntryType.SERVICE", self.camera)
        self.assertIn("Interní", self.sensor)
        self.assertIn("Interní", self.camera)

    def test_existing_internal_devices_are_migrated_to_services(self) -> None:
        self.assertIn("def _register_internal_service_devices(", self.init)
        self.assertIn(
            "_register_internal_service_devices(hass, entry.entry_id)", self.init
        )
        self.assertEqual(self.init.count("entry_type=DeviceEntryType.SERVICE"), 1)
        for identifier in (
            'config_entry_id, "DRATEK eInk · Interní · Meteoradar"',
            'f"{config_entry_id}_ui"',
            'f"{config_entry_id}_scheduler"',
            'f"{config_entry_id}_transfer"',
        ):
            self.assertIn(identifier, self.init)

    def test_physical_devices_are_not_registered_as_services(self) -> None:
        gateway = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        display_registration = self.registry[
            self.registry.index("def register_display_device("):
            self.registry.index("async def async_register_gateway_displays(")
        ]
        self.assertNotIn("DeviceEntryType.SERVICE", gateway)
        self.assertNotIn("DeviceEntryType.SERVICE", display_registration)

    def test_gateway_scan_forwards_battery_signal_and_last_seen(self) -> None:
        for field in (
            '"battery_percent": parsed.battery_percent',
            '"battery_voltage": parsed.battery_voltage',
            '"rssi": parsed.rssi',
            '"last_seen_at": int(time.time())',
        ):
            self.assertIn(field, self.registry)

    def test_display_diagnostics_do_not_clutter_variable_pickers(self) -> None:
        self.assertIn("_isDratekDisplayDiagnosticEntity(entityId)", self.variables)
        self.assertIn("registryEntry?.platform !== \"dratek_eink\"", self.variables)
        self.assertIn("exclude_entities: excludeEntities", self.variables)
        self.assertEqual(
            self.inspector.count("selector.selector = this._variableEntitySelector();"),
            1,
        )
        self.assertGreaterEqual(
            self.inspector.count("picker.selector = this._variableEntitySelector();"),
            2,
        )
        self.assertIn(
            ".filter(([entityId]) => !this._isDratekDisplayDiagnosticEntity(entityId))",
            self.devices,
        )

    def test_display_telemetry_is_push_only(self) -> None:
        self.assertIn("_attr_should_poll = False", self.sensor)
        self.assertIn("_attr_should_poll = False", self.binary)
        self.assertIn("_attr_should_poll = False", self.camera)


if __name__ == "__main__":
    unittest.main()
