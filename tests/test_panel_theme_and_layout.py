"""The panel's status colours follow the Home Assistant theme, and the
automatic-refresh controls live with the display's own actions.

Both are source-level pins: the rendering itself needs a browser, but what can
drift silently is the wiring - a status colour drifting back to a hardcoded ink
that only reads on a light card, or the refresh controls drifting back into the
template settings dialog they were moved out of.
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
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def _body(self, definition: str) -> str:
        """The source of one mixin method, from its definition to its closing brace."""
        start = self.devices.index(definition)
        return self.devices[start : self.devices.index("\n  },", start)]

    def _studio_actions(self) -> str:
        return self._body("_renderStudioActions() {")

    def _settings_dialog(self) -> str:
        return self._body("_renderTemplateSettingsDialog(activeTemplate")

    def test_the_controls_sit_with_the_displays_own_actions(self) -> None:
        actions = self._studio_actions()
        self.assertIn("_renderRefreshIntervalSelect", actions)
        self.assertIn("_renderRefreshTriggerModeSelect", actions)

    def test_they_render_after_the_send_button(self) -> None:
        actions = self._studio_actions()
        self.assertLess(
            actions.index("data-template-send"),
            actions.index("studio-pro-refresh-settings"),
            "the refresh controls must come after the send button, not before it",
        )

    def test_they_are_gone_from_the_template_settings_dialog(self) -> None:
        # They describe the display, not the template - a template can be sent to
        # several displays, each with its own cadence.
        dialog = self._settings_dialog()
        self.assertNotIn("_renderRefreshIntervalSelect", dialog)
        self.assertNotIn("_renderRefreshTriggerModeSelect", dialog)

    def test_the_row_claims_a_full_line_in_both_layouts(self) -> None:
        # The action bar is flex at desktop width and a grid at narrow widths.
        rule = re.search(r"\.studio-pro-refresh-settings\{([^}]*)\}", self.styles)
        self.assertIsNotNone(rule)
        self.assertIn("flex:1 0 100%", rule.group(1))
        self.assertIn("grid-column:1/-1", rule.group(1))
        self.assertIn(".studio-pro-detached-actions{flex-wrap:wrap}", self.styles)

    def test_the_full_line_rule_is_not_trapped_in_a_media_query(self) -> None:
        # It was, at first, and silently did nothing at desktop width.
        index = self.styles.index(".studio-pro-refresh-settings{flex:1 0 100%")
        before = self.styles[:index]
        last_media = before.rfind("@media")
        self.assertNotEqual(-1, last_media)
        segment = before[last_media:]
        self.assertLessEqual(
            segment.count("{") - segment.count("}"), 0,
            "the rule sits inside an unclosed @media block, so it only applies at that width",
        )


if __name__ == "__main__":
    unittest.main()
