"""Wiring pins for the refresh-trigger-mode setting (interval / change / both).

The behavioural logic (which configs the tick and the state-change listener
actually act on) is exercised directly in test_automation_bindings.py against
a live EntityAutoUpdateManager instance. This file guards the surrounding
wiring that can't run without a browser or a real Home Assistant websocket
connection: the panel exposes a control for it, persists it in every draft
path, and the backend's draft-save handler pushes a live update through.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


class FrontendTriggerModeWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.automations = (PANEL / "panel-automations.mixin.js").read_text(encoding="utf-8")
        self.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.projects = (PANEL / "panel-projects.mixin.js").read_text(encoding="utf-8")
        self.storage = (PANEL / "panel-storage.mixin.js").read_text(encoding="utf-8")

    def test_settings_dialog_offers_the_three_modes(self) -> None:
        # The picker moved out of the designer and onto each automation's own
        # card in the Automations tab - see RefreshControlPlacementTests in
        # test_panel_theme_and_layout.py for the full placement pin.
        self.assertIn("_automationTriggerSelect(automation) {", self.automations)
        for value in ('"both"', '"change_only"', '"interval_only"'):
            with self.subTest(value=value):
                self.assertIn(value, self.automations)
        self.assertNotIn("_renderRefreshTriggerModeSelect", self.devices)

    def test_change_handler_persists_the_chosen_mode_into_the_draft(self) -> None:
        self.assertIn("data-device-refresh-trigger-mode", self.inspector)
        self.assertIn("draft.refresh_trigger_mode = mode;", self.inspector)
        self.assertIn("this._scheduleDraftSave();", self.inspector)

    def test_draft_round_trip_reads_and_writes_the_mode(self) -> None:
        self.assertIn("this._refreshTriggerMode = ", self.projects)
        self.assertIn("refresh_trigger_mode: this._refreshTriggerMode,", self.projects)
        self.assertIn('refresh_trigger_mode: "both",', self.storage)

    def test_manual_send_carries_the_mode_into_the_automation_config(self) -> None:
        self.assertIn("refresh_trigger_mode: [\"both\", \"change_only\", \"interval_only\"].includes(this._refreshTriggerMode)", self.devices)


_NODE_SCRIPT = """
import { automationsMixin } from %(mixin)s;
const panel = {
  ...automationsMixin,
  _selectedDeviceAddress: "AA:BB",
  _refreshTriggerMode: "both",
  _refreshIntervalSeconds: 600,
  _deviceDrafts: { "AA:BB": { refresh_trigger_mode: "both", refresh_interval_seconds: 600 } },
  _automations: [{ address: "AA:BB", refresh_trigger_mode: "both", refresh_interval_seconds: 600 }],
};
panel._rememberAutomationRefreshSetting("aa:bb", { refresh_trigger_mode: "interval_only" });
panel._rememberAutomationRefreshSetting("AA:BB", { refresh_interval_seconds: 3600 });
console.log(JSON.stringify({
  mode: panel._refreshTriggerMode,
  seconds: panel._refreshIntervalSeconds,
  draft: panel._deviceDrafts["AA:BB"],
}));
"""


@unittest.skipUnless(shutil.which("node"), "node is required")
class CardEditSurvivesDraftSaveTests(unittest.TestCase):
    """Editing the interval/mode on an automation card must reach the drafts.

    A device draft carries a copy of both settings and every draft save pushes
    that copy to the backend, so a copy left at its old value reverted the
    user's choice ("Při změně entity i pravidelně" kept coming back).
    """

    def test_card_edit_updates_editor_fields_and_stored_draft(self) -> None:
        import json

        with tempfile.TemporaryDirectory() as tmp:
            module = Path(tmp) / "automations.mjs"
            shutil.copyfile(PANEL / "panel-automations.mixin.js", module)
            script = Path(tmp) / "run.mjs"
            script.write_text(_NODE_SCRIPT % {"mixin": json.dumps(module.as_uri())}, encoding="utf-8")
            out = subprocess.run(
                ["node", str(script)], capture_output=True, text=True, check=True, timeout=30
            ).stdout
        result = json.loads(out)
        self.assertEqual("interval_only", result["mode"])
        self.assertEqual(3600, result["seconds"])
        self.assertEqual("interval_only", result["draft"]["refresh_trigger_mode"])
        self.assertEqual(3600, result["draft"]["refresh_interval_seconds"])

    def test_handlers_and_draft_apply_use_the_backend_value(self) -> None:
        automations = (PANEL / "panel-automations.mixin.js").read_text(encoding="utf-8")
        projects = (PANEL / "panel-projects.mixin.js").read_text(encoding="utf-8")
        self.assertIn("this._rememberAutomationRefreshSetting(address, { refresh_trigger_mode: select.value });", automations)
        self.assertIn("this._rememberAutomationRefreshSetting(address, { refresh_interval_seconds: Number(select.value) });", automations)
        self.assertIn("this._adoptAutomationRefreshSettings();", automations)
        self.assertIn("this._adoptAutomationRefreshSettings?.();", projects)


class BackendTriggerModeWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        self.ws_projects = (COMPONENT / "ws_projects.py").read_text(encoding="utf-8")

    def test_automation_defines_the_three_modes(self) -> None:
        self.assertIn('VALID_REFRESH_TRIGGER_MODES = {"both", "change_only", "interval_only"}', self.automation)
        self.assertIn("def _refresh_trigger_mode(config", self.automation)
        self.assertIn("async def async_set_refresh_trigger_mode(", self.automation)

    def test_tick_and_state_change_and_listener_all_check_the_mode(self) -> None:
        self.assertIn('if self._refresh_trigger_mode(config) == "change_only":', self.automation)
        self.assertIn('if self._refresh_trigger_mode(config) == "interval_only":', self.automation)
        self.assertIn('if self._refresh_trigger_mode(config) != "interval_only"', self.automation)

    def test_draft_save_pushes_a_live_update_like_the_interval_does(self) -> None:
        self.assertIn(
            'await get_entity_auto_update_manager(hass).async_set_refresh_interval(',
            self.ws_projects,
        )
        self.assertIn(
            'await get_entity_auto_update_manager(hass).async_set_refresh_trigger_mode(',
            self.ws_projects,
        )
        self.assertIn('if "refresh_trigger_mode" in draft:', self.ws_projects)


if __name__ == "__main__":
    unittest.main()
