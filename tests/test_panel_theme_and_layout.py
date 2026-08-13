"""The panel's status colours follow the Home Assistant theme, and the
automatic-refresh controls live on each automation's own card in the
Automations tab, not in the template designer.

Both are source-level pins: the rendering itself needs a browser, but what can
drift silently is the wiring - a status colour drifting back to a hardcoded ink
that only reads on a light card, or the refresh controls drifting back into the
designer they were moved out of. They were moved because a template can be
opened from several displays at once, each with its own cadence, so the
setting belongs to the automation (which is per-display), not the design
session (which is per-template).
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"

# The status hues that used to be written straight into the badge rules. Each
# only reads on a light card, which is why a dark theme showed dark green or
# dark orange text on an all-but-invisible tint.
LIGHT_ONLY_INKS = ("#2e7d32", "#e65100", "#d97706")


class StatusColourThemeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")
        self.entry = (COMPONENT / "frontend" / "dratek-eink-panel.js").read_text(encoding="utf-8")

    def test_the_status_palette_is_declared_once(self) -> None:
        for name in (
            "--dratek-status-ok-fg", "--dratek-status-ok-bg",
            "--dratek-status-warn-fg", "--dratek-status-warn-bg",
            "--dratek-status-missing-fg", "--dratek-status-missing-bg",
        ):
            with self.subTest(variable=name):
                self.assertIn(name, self.styles)

    def test_a_dark_theme_overrides_every_status_colour(self) -> None:
        dark = re.search(r':host\(\[data-dratek-dark="true"\]\)\{([^}]*)\}', self.styles)
        self.assertIsNotNone(dark, "no dark override block")
        light = re.search(r":host\{--dratek-status-ok-fg[^}]*\}", self.styles)
        self.assertIsNotNone(light, "no light default block")
        declared = lambda block: set(re.findall(r"--dratek-status-[a-z-]+", block))
        self.assertEqual(
            declared(light.group(0)),
            declared(dark.group(1)),
            "the dark theme leaves some status colour at its light value",
        )

    def test_badges_no_longer_hardcode_a_light_only_ink(self) -> None:
        for rule in re.findall(r"\.template-(?:card-status-pill|setup-status-badge)[^{]*\{[^}]*\}", self.styles):
            for ink in LIGHT_ONLY_INKS:
                with self.subTest(rule=rule[:60], ink=ink):
                    self.assertNotIn(ink, rule)

    def test_the_panel_mirrors_home_assistants_own_dark_mode(self) -> None:
        # A media query alone is not enough - Home Assistant's theme is chosen in
        # its own settings and can disagree with the operating system.
        self.assertIn("hass?.themes?.darkMode", self.entry)
        self.assertIn('setAttribute("data-dratek-dark"', self.entry)

    def test_the_harness_still_gets_a_dark_fallback(self) -> None:
        # No hass to ask there, so the attribute is absent and the media query
        # has to apply. It must not fire when Home Assistant said "light".
        self.assertIn('@media(prefers-color-scheme:dark){:host(:not([data-dratek-dark="false"]))', self.styles)


class RefreshControlPlacementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.automations = (PANEL / "panel-automations.mixin.js").read_text(encoding="utf-8")

    def _body(self, source: str, definition: str) -> str:
        """The source of one mixin method, from its definition to its closing brace."""
        start = source.index(definition)
        return source[start : source.index("\n  },", start)]

    def _settings_dialog(self) -> str:
        return self._body(self.devices, "_renderTemplateSettingsDialog(activeTemplate")

    def _automations_card(self) -> str:
        return self._body(self.automations, "_renderAutomations() {")

    def test_the_controls_are_gone_from_the_designer(self) -> None:
        # A template can be opened from several displays at once, each with its
        # own cadence, so the setting belongs to the automation, not the
        # per-template design session.
        self.assertNotIn("_renderRefreshIntervalSelect", self.devices)
        self.assertNotIn("_renderRefreshTriggerModeSelect", self.devices)
        self.assertNotIn("studio-pro-refresh-settings\"", self.devices)

    def test_the_detached_top_action_bar_is_gone(self) -> None:
        # It only ever held the "save" and "send" buttons plus the auto-refresh
        # row; once those all moved out, a floating bar with a single settings
        # button left behind wasn't worth keeping. Template settings are still
        # reachable through the "Nastavení celé šablony" button that already
        # shows once nothing is selected.
        self.assertNotIn("_renderStudioActions", self.devices)
        self.assertNotIn('class="studio-pro-detached-actions"', self.devices)
        self.assertIn("Nastavení celé šablony", self.devices)

    def test_they_are_gone_from_the_template_settings_dialog(self) -> None:
        dialog = self._settings_dialog()
        self.assertNotIn("_renderRefreshIntervalSelect", dialog)
        self.assertNotIn("_renderRefreshTriggerModeSelect", dialog)

    def test_they_render_on_each_automations_card(self) -> None:
        card = self._automations_card()
        self.assertIn("this._automationIntervalSelect(automation)", card)
        self.assertIn("this._automationTriggerSelect(automation)", card)

    def test_the_trigger_select_offers_the_three_modes(self) -> None:
        select = self._body(self.automations, "_automationTriggerSelect(automation) {")
        for value in ('"both"', '"change_only"', '"interval_only"'):
            with self.subTest(value=value):
                self.assertIn(value, select)

    def test_each_control_calls_its_own_websocket_command(self) -> None:
        self.assertIn('type: "dratek_eink/automations/update_interval",', self.automations)
        self.assertIn('type: "dratek_eink/automations/update_trigger_mode",', self.automations)


if __name__ == "__main__":
    unittest.main()
