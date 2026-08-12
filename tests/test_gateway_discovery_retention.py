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


if __name__ == "__main__":
    unittest.main()
