"""Regression tests for safe Home Assistant USB gateway flashing."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_gateway_flash_test"


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


class GatewayFlashTests(unittest.TestCase):
    def test_transient_status_failure_keeps_the_last_gateway_identity(self):
        configured = {
            "host": "192.168.1.20",
            "gateway_id": "stable-gateway",
            "status": {
                "ok": True,
                "gateway_id": "stable-gateway",
                "ip": "192.168.1.20",
                "firmware": "0.1.56-gateway",
            },
        }

        online = gateway._remember_gateway_status(
            configured,
            {"ok": False, "message": "timeout", "checked_at": 123},
        )

        self.assertFalse(online)
        self.assertFalse(configured["status"]["ok"])
        self.assertEqual("stable-gateway", configured["status"]["gateway_id"])
        self.assertEqual("192.168.1.20", configured["status"]["ip"])
        self.assertEqual("0.1.56-gateway", configured["status"]["firmware"])

    def test_mdns_matches_a_saved_gateway_after_its_ip_changes(self):
        configured = {
            "host": "192.168.1.20",
            "gateway_id": "stable-gateway",
            "status": {"gateway_id": "stable-gateway", "ip": "192.168.1.20"},
        }
        discovered = {
            "gateway_id": "stable-gateway",
            "host": "192.168.1.77",
            "server": "dratek-eink-gateway.local",
        }

        self.assertTrue(gateway._gateway_matches_discovery(configured, discovered))

    def test_failed_old_status_does_not_override_a_recovered_host(self):
        configured = {
            "host": "192.168.1.77",
            "status": {"ok": False, "ip": "192.168.1.20"},
        }

        self.assertEqual("http://192.168.1.77", gateway._gateway_send_base_url(configured))

    def test_internal_linux_uart_is_not_offered_for_flashing(self):
        self.assertFalse(gateway._is_flashable_serial_device("/dev/ttyS3"))
        self.assertFalse(gateway._is_flashable_serial_device("/dev/ttyAMA0"))
        self.assertTrue(gateway._is_flashable_serial_device("/dev/ttyACM0"))
        self.assertTrue(gateway._is_flashable_serial_device("/dev/ttyUSB0"))
        self.assertTrue(gateway._is_flashable_serial_device("COM4"))

    def test_usb_metadata_keeps_other_usb_serial_names_available(self):
        self.assertTrue(gateway._is_flashable_serial_device("/dev/custom-uart", 0x303A, 0x1001))

    def test_invalid_system_uart_fails_before_esptool_is_started(self):
        result = gateway._flash_gateway_sync(
            "/dev/ttyS3",
            "wifi",
            "secret",
            "dratek-eink-gateway",
            "esp32s3",
        )

        self.assertFalse(result["ok"])
        self.assertIn("not a USB serial device", result["error"])

    def test_esptool_uses_current_hyphenated_commands(self):
        source = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        self.assertIn('"erase-region"', source)
        self.assertIn('"write-flash"', source)
        self.assertNotIn('"erase_region"', source)
        self.assertNotIn('"write_flash"', source)

    def test_wifi_provisioning_retries_until_firmware_acknowledges(self):
        writes = []
        serial_instances = []

        class _Serial:
            dtr = True
            rts = True
            dsrdtr = True
            rtscts = True
            opened = False

            def __init__(self):
                serial_instances.append(self)

            def open(self):
                self.opened = True

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def write(self, payload):
                writes.append(json.loads(payload.decode()))

            def flush(self):
                return None

            def readline(self):
                if len(writes) >= 2:
                    return b'{"ok":true,"message":"wifi_config_saved"}\n'
                return b"Gateway booting\n"

        fake_serial = types.SimpleNamespace(Serial=_Serial)
        original_serial = sys.modules.get("serial")
        original_monotonic = gateway.time.monotonic
        clock = 0.0

        def monotonic():
            nonlocal clock
            clock += 0.75
            return clock

        sys.modules["serial"] = fake_serial
        gateway.time.monotonic = monotonic
        log = []
        try:
            acknowledged = gateway._provision_wifi_over_serial(
                "/dev/ttyACM1",
                "workshop",
                "secret",
                "gateway-workshop",
                log.append,
                timeout_seconds=12,
            )
        finally:
            gateway.time.monotonic = original_monotonic
            if original_serial is None:
                sys.modules.pop("serial", None)
            else:
                sys.modules["serial"] = original_serial

        self.assertTrue(acknowledged)
        self.assertGreaterEqual(len(writes), 2)
        self.assertEqual("wifi", writes[0]["cmd"])
        self.assertEqual("workshop", writes[0]["ssid"])
        fake_serial_instance = serial_instances[0]
        self.assertFalse(fake_serial_instance.dsrdtr)
        self.assertFalse(fake_serial_instance.rtscts)
        self.assertFalse(fake_serial_instance.dtr)
        self.assertFalse(fake_serial_instance.rts)
        self.assertTrue(fake_serial_instance.opened)
        self.assertTrue(any("attempt 2" in line for line in log))


class GatewayAvailabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_probe_rediscovers_changed_ip_and_retries(self):
        configured = {
            "id": "stored-record",
            "host": "192.168.1.20",
            "gateway_id": "stable-gateway",
            "status": {"ok": True, "gateway_id": "stable-gateway", "ip": "192.168.1.20"},
        }
        probed_hosts = []

        async def status(_hass, item):
            probed_hosts.append(item["host"])
            if item["host"] == "192.168.1.20":
                return {"ok": False, "message": "timeout", "checked_at": 100}
            return {
                "ok": True,
                "message": "Online",
                "checked_at": 101,
                "gateway_id": "stable-gateway",
                "ip": "192.168.1.77",
            }

        async def discover(_hass, seconds):
            self.assertEqual(4, seconds)
            return [{"gateway_id": "stable-gateway", "host": "192.168.1.77"}]

        original_status = gateway.async_gateway_status
        original_discover = gateway.async_discover_gateways
        gateway.async_gateway_status = status
        gateway.async_discover_gateways = discover
        try:
            await gateway._async_refresh_gateway_set(object(), [configured])
        finally:
            gateway.async_gateway_status = original_status
            gateway.async_discover_gateways = original_discover

        self.assertEqual(["192.168.1.20", "192.168.1.77"], probed_hosts)
        self.assertEqual("192.168.1.77", configured["host"])
        self.assertTrue(configured["status"]["ok"])


if __name__ == "__main__":
    unittest.main()
