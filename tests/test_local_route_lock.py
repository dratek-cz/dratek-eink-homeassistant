"""Regression tests for pinning a display to Home Assistant Bluetooth.

The map lets a display be locked to any route, not just a gateway. Locking to
the local adapter is stored under the LOCAL_ROUTE_ID sentinel, so the backend
has to treat that value as a valid manual choice instead of an unknown gateway.
"""

from __future__ import annotations

import ast
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from websocket_sources import websocket_source


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
CONST_SOURCE = (COMPONENT / "const.py").read_text(encoding="utf-8")
# The handlers are spread across ws_*.py, so check the whole websocket layer.
WEBSOCKET_SOURCE = websocket_source()
AUTOMATION_SOURCE = (COMPONENT / "automation.py").read_text(encoding="utf-8")
STORAGE_SOURCE = (COMPONENT / "project_storage.py").read_text(encoding="utf-8")
SHARED_SOURCE = (COMPONENT / "ws_shared.py").read_text(encoding="utf-8")
PANEL_SOURCE = (
    COMPONENT / "frontend" / "panel" / "panel-gateway.mixin.js"
).read_text(encoding="utf-8")


def _const_value(name: str) -> str:
    """Read a module-level string constant without importing Home Assistant."""
    tree = ast.parse(CONST_SOURCE)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f"{name} is not defined in const.py")


class LocalRouteLockTests(unittest.TestCase):
    def test_sentinel_is_shared_by_backend_and_panel(self) -> None:
        local_route_id = _const_value("LOCAL_ROUTE_ID")
        self.assertEqual(local_route_id, "local")
        self.assertIn(
            f'export const LOCAL_ROUTE_ID = "{local_route_id}";',
            PANEL_SOURCE,
        )

    def test_set_gateway_accepts_the_local_sentinel(self) -> None:
        self.assertIn("local_route = gateway_id == LOCAL_ROUTE_ID", WEBSOCKET_SOURCE)
        # Sentinel nesmí spadnout do kontroly na neznámou gateway.
        self.assertIn(
            "if gateway_id and not local_route and gateway is None:",
            WEBSOCKET_SOURCE,
        )
        self.assertIn(
            'transport_name = "Home Assistant Bluetooth" if local_route else str(',
            WEBSOCKET_SOURCE,
        )

    def test_scan_reports_a_locally_pinned_display_as_manual(self) -> None:
        self.assertIn(
            'if selected_gateway_id == LOCAL_ROUTE_ID:',
            WEBSOCKET_SOURCE,
        )
        self.assertIn('device["selected_gateway_id"] = LOCAL_ROUTE_ID', WEBSOCKET_SOURCE)

    def test_automation_routes_a_pinned_display_over_local_bluetooth(self) -> None:
        self.assertIn("if gateway_id == LOCAL_ROUTE_ID:", AUTOMATION_SOURCE)
        self.assertIn('updated["route_type"] = "local"', AUTOMATION_SOURCE)
        # Zamčený displej nesmí spadnout zpět na automatický výběr gatewaye.
        self.assertIn(
            'if gateway_selection == "manual" and manual_route == LOCAL_ROUTE_ID:',
            AUTOMATION_SOURCE,
        )
        self.assertIn('            route_type = "local"', AUTOMATION_SOURCE)

    def test_storage_keeps_the_sentinel(self) -> None:
        # Normalizace zahazuje jen prázdné hodnoty, takže "local" přežije.
        self.assertIn('and str(gateway_id).strip()', STORAGE_SOURCE)

    def test_gateway_lock_has_a_dedicated_restart_safe_store(self) -> None:
        self.assertIn(
            'GATEWAY_PREFERENCES_STORE_KEY = "dratek_eink.gateway_preferences"',
            SHARED_SOURCE,
        )
        self.assertIn("await _gateway_preferences_store(hass).async_load()", SHARED_SOURCE)
        self.assertIn("await _save_gateway_preferences(", WEBSOCKET_SOURCE)


if __name__ == "__main__":
    unittest.main()
