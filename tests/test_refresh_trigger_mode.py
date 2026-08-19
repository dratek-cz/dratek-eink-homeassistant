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
        self.assertIn('refresh_trigger_mode: "interval_only",', self.storage)

    def test_manual_send_carries_the_mode_into_the_automation_config(self) -> None:
        self.assertIn("refresh_trigger_mode: [\"both\", \"change_only\", \"interval_only\"].includes(this._refreshTriggerMode)", self.devices)


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
