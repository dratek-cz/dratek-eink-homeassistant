"""Regression checks for lossy gateway BLE discovery."""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


class GatewayDiscoveryRetentionTests(unittest.TestCase):
    def test_backend_grace_period_bridges_long_transfers(self) -> None:
        tree = ast.parse((COMPONENT / "const.py").read_text(encoding="utf-8"))
        expression = next(
            node.value
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name)
                and target.id == "DISCOVERY_GRACE_SECONDS"
                for target in node.targets
            )
        )
        self.assertEqual("30 * 60", ast.unparse(expression))

    def test_frontend_uses_the_same_retention_window(self) -> None:
        source = (
            COMPONENT / "frontend" / "panel" / "panel-storage.mixin.js"
        ).read_text(encoding="utf-8")
        self.assertIn("_mergeScanResult(nextResult, graceMs = 30 * 60 * 1000)", source)

    def test_each_route_has_its_own_last_seen_timestamp(self) -> None:
        source = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")
        self.assertGreaterEqual(source.count('"last_seen_at": now'), 2)
        self.assertIn('cached_path.get("last_seen_at")', source)
        self.assertIn('retained_path["temporarily_unseen"] = True', source)

    def test_stale_route_does_not_outrank_a_fresh_route(self) -> None:
        source = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")
        self.assertIn('not bool(path.get("temporarily_unseen"))', source)

    def test_configured_gateways_are_monitored_and_rediscovered_automatically(self) -> None:
        gateway_source = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        init_source = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        panel_source = (
            COMPONENT / "frontend" / "panel" / "panel-gateway.mixin.js"
        ).read_text(encoding="utf-8")
        overview_source = (
            COMPONENT / "frontend" / "dratek-eink-overview-card.js"
        ).read_text(encoding="utf-8")

        self.assertIn("await async_discover_gateways(hass, seconds=4)", gateway_source)
        self.assertIn("_gateway_matches_discovery(gateway, item)", gateway_source)
        self.assertIn('gateway["host"] = host', gateway_source)
        self.assertIn('"gateway_refresh_lock", asyncio.Lock()', gateway_source)
        self.assertIn("GATEWAY_MONITOR_INTERVAL = timedelta(seconds=30)", init_source)
        self.assertIn("async_track_time_interval(", init_source)
        self.assertIn("_scheduleGatewayStatusPoll(delay = 15000)", panel_source)
        self.assertIn('type: "dratek_eink/gateways/list"', panel_source)
        self.assertIn("this._scheduleRefresh();", overview_source)


if __name__ == "__main__":
    unittest.main()
