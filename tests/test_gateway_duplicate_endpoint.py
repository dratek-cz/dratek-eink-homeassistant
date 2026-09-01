"""Two gateway records must never mean two radios.

Reconstructed from a real queue log (v0.1.355, 104 jobs). Three gateway records
- "dilna", "DRATEK eInk gateway" and "DRATEK eInk gateway-2" - were streaming to
only two hosts:

    27 jobs  dilna                   -> 192.168.1.130
    10 jobs  dilna                   -> 192.168.1.138
    19 jobs  DRATEK eInk gateway-2   -> 192.168.1.138
     7 jobs  DRATEK eInk gateway     -> 192.168.1.138

Two separate defects show up in those four lines.

*Two records, one ESP32.* The queue serialises per resource, and the resource
was ``f"gateway:{record_id}"`` - the id of the stored record, not the box it
talks to. Two records pointing at 192.168.1.138 therefore held two independent
locks and the queue wrote to that single radio twice at once. The same log
carries the consequences: "Gateway upload attempt 1/2 failed: [Errno 104]
Connection reset by peer" and sixteen "BLE connection failed after retries".

*One record, two addresses.* "dilna" sent to both .130 and .138 inside one
minute. _remember_gateway_status deliberately keeps the last good status - its
``ip`` included - through a failed probe, and mDNS rewrites ``host`` on a DHCP
renewal without touching that status. The send preferred the probed ip
unconditionally, so it followed whichever of the two was older.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


PACKAGE = "dratek_gateway_endpoint_test"


def _load_gateway() -> types.ModuleType:
    """Import gateway.py with the same stub set test_gateway_host_validation uses."""
    key = f"{PACKAGE}.gateway"
    if key in sys.modules:
        return sys.modules[key]

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
    sys.modules.update({
        "aiohttp": aiohttp,
        "homeassistant": homeassistant,
        "homeassistant.core": core,
        "homeassistant.helpers": helpers,
        "homeassistant.helpers.aiohttp_client": aiohttp_client,
        "homeassistant.helpers.storage": storage,
    })

    render = types.ModuleType(f"{PACKAGE}.render")
    render.pack_bwr_image = lambda *_args, **_kwargs: b""
    render.pack_bwr_region = lambda *_args, **_kwargs: b""
    render.packing_description = lambda *_args, **_kwargs: "SDK type stub"
    sys.modules[render.__name__] = render

    spec = importlib.util.spec_from_file_location(key, COMPONENT / "gateway.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    spec.loader.exec_module(module)
    return module


class GatewayResourceKeyTests(unittest.TestCase):
    """queue.TransferQueue._gateway_resource, read straight out of the source.

    queue.py imports enough of Home Assistant that loading it here would only
    test the stubs, and the rule under test is a pure string function - so it is
    transcribed and exercised rather than imported. The source assertions below
    keep the transcription honest.
    """

    @staticmethod
    def _resource(route: dict) -> str:
        endpoint = str(route.get("endpoint") or route.get("host") or "").strip().lower()
        if endpoint:
            return f"gateway@{endpoint}"
        return f"gateway:{str(route.get('id') or '')}"

    def test_two_records_on_one_host_share_a_lock(self) -> None:
        """The exact shape from the log: two ids, one ESP32."""
        first = {"id": "aaaa-1111", "name": "DRATEK eInk gateway", "endpoint": "192.168.1.138"}
        second = {"id": "bbbb-2222", "name": "DRATEK eInk gateway-2", "endpoint": "192.168.1.138"}
        self.assertEqual(self._resource(first), self._resource(second))

    def test_different_hosts_stay_independent(self) -> None:
        """The gateway pool exists to run in parallel; that must survive."""
        self.assertNotEqual(
            self._resource({"id": "a", "endpoint": "192.168.1.130"}),
            self._resource({"id": "b", "endpoint": "192.168.1.138"}),
        )

    def test_a_route_without_an_endpoint_still_serialises_against_itself(self) -> None:
        self.assertEqual("gateway:a", self._resource({"id": "a"}))
        self.assertNotEqual(self._resource({"id": "a"}), self._resource({"id": "b"}))

    def test_the_transcription_matches_the_queue(self) -> None:
        source = (COMPONENT / "queue.py").read_text(encoding="utf-8")
        self.assertIn("def gateway_resource(route: dict[str, Any]) -> str:", source)
        self.assertIn(
            'endpoint = str(route.get("endpoint") or route.get("host") or "").strip().lower()',
            source,
        )
        self.assertIn('return f"gateway@{endpoint}"', source)
        # Both the reservation and the free/busy scan must use it, or a route
        # could be picked under one key and queued under another.
        self.assertIn("resource=gateway_resource(route),", source)
        self.assertIn("resource = gateway_resource(route)", source)

    def test_every_pinned_path_derives_the_same_key(self) -> None:
        """The pinned-gateway paths are the ones that stayed keyed by id.

        Three of them - a manual "send now", a design sent to a chosen
        gateway, and an automatic refresh on a pinned route - each built
        their own ``f"gateway:{id}"``. A route the user pinned therefore did
        not queue behind the pool's transfers to the same box, which is the
        half of this bug that survives even with no duplicate records at all.
        """
        for name in ("ws_sending.py", "ws_gateways.py", "automation.py"):
            source = (COMPONENT / name).read_text(encoding="utf-8")
            with self.subTest(module=name):
                self.assertNotIn('resource=f"gateway:', source)
                self.assertIn("gateway_resource(", source)

    def test_routes_carry_the_endpoint(self) -> None:
        source = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        self.assertIn('"endpoint": gateway_send_endpoint(gateway),', source)


class SendEndpointTests(unittest.TestCase):
    """gateway.gateway_send_endpoint - which address a transfer really uses."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.gateway = _load_gateway()

    def test_a_probed_ip_is_used_when_it_agrees_with_the_host(self) -> None:
        endpoint = self.gateway.gateway_send_endpoint({
            "host": "192.168.1.130",
            "discovered_at": 100,
            "status": {"ok": True, "ip": "192.168.1.130", "checked_at": 100},
        })
        self.assertEqual("192.168.1.130", endpoint)

    def test_a_probed_ip_still_wins_over_an_unresolvable_name(self) -> None:
        """Why the probe is preferred at all: a host may be an mDNS name."""
        endpoint = self.gateway.gateway_send_endpoint({
            "host": "dratek-gateway.local",
            "discovered_at": 100,
            "status": {"ok": True, "ip": "192.168.1.130", "checked_at": 200},
        })
        self.assertEqual("192.168.1.130", endpoint)

    def test_a_stale_probe_does_not_outrank_a_moved_host(self) -> None:
        """The "dilna -> .130 and .138 in one minute" line from the log.

        mDNS moved the record to .138 at t=200. The last successful probe still
        says .130 from t=100, and _remember_gateway_status keeps it on purpose.
        The newer fact has to win, or the bytes go to whichever box now holds
        the old address while the queue believes it reserved this one.
        """
        endpoint = self.gateway.gateway_send_endpoint({
            "host": "192.168.1.138",
            "discovered_at": 200,
            "status": {"ok": True, "ip": "192.168.1.130", "checked_at": 100},
        })
        self.assertEqual("192.168.1.138", endpoint)

    def test_a_failed_probe_falls_back_to_the_host(self) -> None:
        endpoint = self.gateway.gateway_send_endpoint({
            "host": "192.168.1.138",
            "status": {"ok": False, "ip": "192.168.1.130", "checked_at": 300},
        })
        self.assertEqual("192.168.1.138", endpoint)

    def test_the_base_url_is_built_from_the_endpoint(self) -> None:
        self.assertEqual(
            "http://192.168.1.138",
            self.gateway._gateway_send_base_url({
                "host": "192.168.1.138",
                "discovered_at": 200,
                "status": {"ok": True, "ip": "192.168.1.130", "checked_at": 100},
            }),
        )


class DiscoveryDeduplicatesOnUpdateTests(unittest.TestCase):
    """Following a DHCP move must not leave two records on one address."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.gateway = _load_gateway()

    def _upsert(self, stored: list[dict], **kwargs) -> list[dict]:
        module = self.gateway
        saved: list[list[dict]] = []

        async def fake_load(_hass):
            return stored

        async def fake_save(_hass, gateways):
            saved.append(gateways)

        class _Lock:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_exc):
                return False

        original = (
            module.async_load_gateways,
            module.async_save_gateways,
            module._gateway_store_lock,
        )
        module.async_load_gateways = fake_load
        module.async_save_gateways = fake_save
        module._gateway_store_lock = lambda _hass: _Lock()
        try:
            asyncio.run(module.async_upsert_discovered_gateway(object(), **kwargs))
        finally:
            (
                module.async_load_gateways,
                module.async_save_gateways,
                module._gateway_store_lock,
            ) = original
        self.assertTrue(saved, "the upsert never saved")
        return saved[-1]

    def test_a_record_moving_onto_another_address_absorbs_it(self) -> None:
        """Exactly how a list grows a duplicate.

        "dilna" is renumbered to .138 by DHCP. Another record - added by hand
        before mDNS ever saw the box, so it carries no advertised id - is
        already sitting on .138. Without this, both survive and the queue counts
        two radios.
        """
        stored = [
            {"id": "one", "gateway_id": "esp-dilna", "name": "dílna", "host": "192.168.1.130"},
            {"id": "two", "name": "DRATEK eInk gateway", "host": "192.168.1.138"},
        ]
        result = self._upsert(
            stored, gateway_id="esp-dilna", name="dílna", host="192.168.1.138"
        )
        hosts = [item["host"] for item in result]
        self.assertEqual(1, hosts.count("192.168.1.138"), f"duplicate survived: {result}")
        self.assertEqual(["one"], [item["id"] for item in result])

    def test_a_second_gateway_behind_one_address_is_kept(self) -> None:
        """Two real gateways can legitimately share a host behind NAT.

        The dedupe only drops a record that cannot be a different gateway - one
        with no advertised id of its own, or the same one.
        """
        stored = [
            {"id": "one", "gateway_id": "esp-a", "name": "A", "host": "192.168.1.130"},
            {"id": "two", "gateway_id": "esp-b", "name": "B", "host": "192.168.1.138"},
        ]
        result = self._upsert(stored, gateway_id="esp-a", name="A", host="192.168.1.138")
        self.assertEqual({"one", "two"}, {item["id"] for item in result})

    def test_a_plain_move_changes_nothing_else(self) -> None:
        stored = [{"id": "one", "gateway_id": "esp-a", "name": "A", "host": "192.168.1.130"}]
        result = self._upsert(stored, gateway_id="esp-a", name="A", host="192.168.1.140")
        self.assertEqual(1, len(result))
        self.assertEqual("192.168.1.140", result[0]["host"])


if __name__ == "__main__":
    unittest.main()
