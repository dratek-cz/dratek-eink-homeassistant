"""Connection-map discovery must expose every measured radio path."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
WS_DEVICES = ROOT / "custom_components" / "dratek_eink" / "ws_devices.py"
GATEWAY_MIXIN = (
    ROOT
    / "custom_components"
    / "dratek_eink"
    / "frontend"
    / "panel"
    / "panel-gateway.mixin.js"
)
DEVICES_MIXIN = GATEWAY_MIXIN.with_name("panel-devices.mixin.js")
INSPECTOR_MIXIN = GATEWAY_MIXIN.with_name("panel-inspector.mixin.js")


class ConnectionMapDiscoveryTests(unittest.TestCase):
    def test_backend_preserves_observations_before_filtering_transfer_routes(self) -> None:
        source = WS_DEVICES.read_text(encoding="utf-8")
        snapshot = 'device["observed_paths"] = [dict(path) for path in device["paths"]]'
        local_filter = "paths_allowed_by_gateway_lock("
        self.assertIn(snapshot, source)
        self.assertLess(source.index(snapshot), source.index(local_filter, source.index(snapshot)))

    def test_topology_tab_runs_and_repeats_real_device_scans(self) -> None:
        devices = DEVICES_MIXIN.read_text(encoding="utf-8")
        inspector = INSPECTOR_MIXIN.read_text(encoding="utf-8")
        self.assertIn('["devices", "topology"].includes(this._activeTab)', devices)
        topology = inspector[inspector.index('if (this._activeTab === "topology")'):]
        self.assertIn("this._scan({ background: true })", topology)
        self.assertIn("this._scheduleDeviceStatusPoll();", topology)

    def test_local_ha_hub_and_observed_gateway_both_exist(self) -> None:
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is not available")
        script = f"""
          import {{ gatewayMixin }} from {json.dumps(GATEWAY_MIXIN.as_uri())};
          const context = {{
            _gateways: [{{ id: "workshop", name: "Workshop" }}],
            _gatewayHubKey: gatewayMixin._gatewayHubKey,
            _deviceTopologyPaths: gatewayMixin._deviceTopologyPaths,
          }};
          const device = {{
            address: "FF:FF:00:00:00:01",
            gateway_selection: "manual",
            selected_gateway_id: "workshop",
            preferred_path: {{ type: "gateway", id: "workshop", name: "Workshop", rssi: -42 }},
            paths: [{{ type: "gateway", id: "workshop", name: "Workshop", rssi: -42 }}],
            observed_paths: [
              {{ type: "gateway", id: "workshop", name: "Workshop", rssi: -42 }},
              {{ type: "local", id: "local", name: "Home Assistant Bluetooth", rssi: -55 }},
            ],
          }};
          const groups = gatewayMixin._topologyGroups.call(context, [device]);
          console.log(JSON.stringify({{
            localKey: gatewayMixin._gatewayHubKey({{ type: "local", id: "local", name: "Home Assistant Bluetooth" }}),
            keys: groups.map((group) => group.key),
          }}));
        """
        result = subprocess.run(
            [node, "--input-type=module", "-e", script],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
        self.assertEqual("local:local", payload["localKey"])
        self.assertIn("gateway:workshop", payload["keys"])
        self.assertIn("local:local", payload["keys"])


if __name__ == "__main__":
    unittest.main()
