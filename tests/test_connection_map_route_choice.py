"""The connection map must name the transport that will carry the write.

Reported from a live installation: a gateway standing right next to four
displays showed "0 displejů" while Home Assistant Bluetooth showed all of them,
even though the gateway's own /api/scan reported every one of them 7-21 dB
stronger than the local adapter heard them.

Two independent causes, both fixed here and pinned below:

* the map only considered gateways seen in the current sweep, so one missed
  scan dropped a display back to local routing - while _async_gateway_routes,
  which decides the real transfer, deliberately reuses those same retained
  observations rather than "unexpectedly routing the write through Home
  Assistant's local adapter" (its own words);
* among the gateways it did consider, it took the first in store order instead
  of the strongest.

The numbers below are the ones actually measured on that installation.
"""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_routing_test"


def _load_routing():
    """routing.py imports only .const, which imports nothing at all."""
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package
    spec = importlib.util.spec_from_file_location(
        f"{PACKAGE}.routing", COMPONENT / "routing.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


routing = _load_routing()


LOCAL = {"type": "local", "id": "local", "name": "Home Assistant Bluetooth"}


def _preferred(paths):
    """The auto-mode choice, mirroring websocket_scan's branch."""
    ranked = sorted(
        (path for path in paths if path.get("type") == "gateway"),
        key=routing.route_preference_key,
        reverse=True,
    )
    if ranked:
        return ranked[0]
    local = [path for path in paths if path.get("type") == "local"]
    return local[0] if local else (paths[0] if paths else None)


class RoutePreferenceKeyTests(unittest.TestCase):
    def test_a_live_reading_beats_a_stronger_retained_one(self):
        live = {"id": "a", "rssi": -80}
        retained = {"id": "b", "rssi": -40, "temporarily_unseen": True}
        best = max([retained, live], key=routing.route_preference_key)
        self.assertEqual("a", best["id"])

    def test_rssi_decides_between_equally_fresh_readings(self):
        weak = {"id": "weak", "rssi": -70}
        strong = {"id": "strong", "rssi": -47}
        best = max([weak, strong], key=routing.route_preference_key)
        self.assertEqual("strong", best["id"])

    def test_an_unreadable_rssi_sorts_last_instead_of_raising(self):
        self.assertEqual(-999.0, routing.route_rssi({"rssi": None}))
        self.assertEqual(-999.0, routing.route_rssi({"rssi": "n/a"}))
        self.assertEqual(-999.0, routing.route_rssi({}))
        self.assertEqual(-47.0, routing.route_rssi({"rssi": -47}))

    def test_every_ranking_site_uses_this_one_key(self):
        # Three copies of this rule existed and one had drifted. Nothing may
        # hand-roll the (freshness, rssi) tuple again.
        for name in ("queue.py", "automation.py", "ws_devices.py"):
            source = (COMPONENT / name).read_text(encoding="utf-8")
            with self.subTest(module=name):
                self.assertIn("route_preference_key", source)
                self.assertNotIn('not bool(route.get("temporarily_unseen"))', source)


class PreferredPathTests(unittest.TestCase):
    def test_a_retained_gateway_still_beats_a_live_local_path(self):
        # The exact live case: the gateway heard 94.20.10.78 at -47 while Home
        # Assistant heard it at -68. One skipped gateway sweep used to hand the
        # display to Home Assistant anyway.
        paths = [
            {**LOCAL, "rssi": -68},
            {"type": "gateway", "id": "gw-130", "rssi": -47, "temporarily_unseen": True},
        ]
        self.assertEqual("gw-130", _preferred(paths)["id"])

    def test_the_strongest_gateway_wins_not_the_first_configured(self):
        # gw-138 is first in the store but only hears the display at -69.
        paths = [
            {**LOCAL, "rssi": -68},
            {"type": "gateway", "id": "gw-138", "rssi": -69},
            {"type": "gateway", "id": "gw-130", "rssi": -47},
        ]
        self.assertEqual("gw-130", _preferred(paths)["id"])

    def test_a_live_gateway_beats_a_retained_one(self):
        paths = [
            {"type": "gateway", "id": "gw-130", "rssi": -65, "temporarily_unseen": True},
            {"type": "gateway", "id": "gw-138", "rssi": -70},
        ]
        self.assertEqual("gw-138", _preferred(paths)["id"])

    def test_local_is_used_when_no_gateway_hears_the_display(self):
        self.assertEqual("local", _preferred([{**LOCAL, "rssi": -60}])["id"])

    def test_no_paths_at_all_does_not_raise(self):
        self.assertIsNone(_preferred([]))


class ScanGatingTests(unittest.TestCase):
    """The map's scan and the scheduler's must see the same gateways."""

    def _called(self, source: str, function: str) -> set[str]:
        tree = ast.parse(source)
        node = next(
            item
            for item in ast.walk(tree)
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
            and item.name == function
        )
        names = set()
        for call in ast.walk(node):
            if isinstance(call, ast.Call):
                func = call.func
                names.add(func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", ""))
        return names

    def test_neither_scan_path_waits_on_the_local_adapter(self):
        ws_devices = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")
        automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        for source, function in (
            (ws_devices, "websocket_scan"),
            (automation, "_async_load_gateways_and_scan"),
        ):
            with self.subTest(function=function):
                called = self._called(source, function)
                self.assertIn("async_scan_gateway", called)
                self.assertNotIn("async_try_radio_slot", called)
                self.assertNotIn("async_radio_slot", called)


if __name__ == "__main__":
    unittest.main()
