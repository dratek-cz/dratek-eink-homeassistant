"""The gateway address is the one caller-supplied part of every gateway URL.

Every request this integration makes to a gateway is built by interpolation -
``f"http://{host}/api/status"``, ``f"{base_url}/api/ota/upload?..."``. The host
therefore has to be an address and nothing else. It used to be accepted as free
text with only the scheme and surrounding slashes trimmed, so a stored host of
``10.0.0.1/admin?x=`` produced a request for ``http://10.0.0.1/admin?x=/api/status``:
whoever could add a gateway could aim Home Assistant's own HTTP client at any
host and path reachable from it.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_gateway_host_test"


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


class NormalizeHostTests(unittest.TestCase):
    """_normalize_host also runs on discovery data, so it must not raise."""

    def test_plain_addresses_survive_unchanged(self):
        for host in ("192.168.1.130", "dratek-eink-gateway.local", "10.0.0.5:8080"):
            with self.subTest(host=host):
                self.assertEqual(host, gateway._normalize_host(host))

    def test_scheme_and_trailing_slash_are_dropped(self):
        self.assertEqual("192.168.1.130", gateway._normalize_host("http://192.168.1.130/"))
        self.assertEqual("192.168.1.130", gateway._normalize_host("https://192.168.1.130"))
        self.assertEqual("192.168.1.130", gateway._normalize_host("  192.168.1.130  "))

    def test_a_url_tail_cannot_reach_the_request_that_is_built_from_it(self):
        # The whole point: whatever follows the address is cut before anything
        # interpolates it into f"http://{host}/api/status".
        for host, expected in (
            ("10.0.0.1/admin?reboot=1", "10.0.0.1"),
            ("10.0.0.1/../../secret", "10.0.0.1"),
            ("http://10.0.0.1:80/api/x#frag", "10.0.0.1:80"),
            ("10.0.0.1?a=b", "10.0.0.1"),
            ("10.0.0.1#frag", "10.0.0.1"),
        ):
            with self.subTest(host=host):
                self.assertEqual(expected, gateway._normalize_host(host))


class ValidatedHostTests(unittest.TestCase):
    """The gate on the way into the gateway store."""

    def test_accepts_names_ipv4_and_bracketed_ipv6_with_optional_port(self):
        for host in (
            "192.168.1.130",
            "192.168.1.130:80",
            "dratek-eink-gateway.local",
            "gateway",
            "[fe80::1]",
            "[fe80::1]:8123",
        ):
            with self.subTest(host=host):
                self.assertEqual(host, gateway._validated_host(host))

    def test_normalises_before_accepting(self):
        self.assertEqual("192.168.1.130", gateway._validated_host("http://192.168.1.130/"))

    def test_rejects_anything_that_is_not_only_an_address(self):
        for host in (
            "",
            "   ",
            "user@evil.example",
            "192.168.1.130 evil",
            "-leading-dash.example",
            "192.168.1.130:0",
            "192.168.1.130:99999",
            "192.168.1.130:notaport",
        ):
            with self.subTest(host=host):
                with self.assertRaises(ValueError):
                    gateway._validated_host(host)

    def test_a_rejected_address_never_becomes_a_base_url(self):
        # Belt and braces: even if a bad host were somehow stored, the URL that
        # gets built from it carries no path of its own.
        base = gateway._gateway_base_url({"host": "10.0.0.1/admin?x="})
        self.assertEqual("http://10.0.0.1", base)


class StatusPayloadTests(unittest.TestCase):
    def test_status_reader_only_trusts_a_json_object(self):
        # A non-gateway host answering valid JSON that is not an object used to
        # raise AttributeError from outside async_gateway_status' own handler.
        source = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        self.assertIn("if not isinstance(payload, dict):", source)


if __name__ == "__main__":
    unittest.main()
