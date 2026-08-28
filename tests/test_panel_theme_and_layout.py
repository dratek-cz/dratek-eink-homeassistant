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


class AccentInkThemeTests(unittest.TestCase):
    """The accent inks the status palette left behind: green, amber and red
    literals written straight into a `color:` on a themed surface."""

    def setUp(self) -> None:
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_every_ink_has_a_dark_counterpart(self) -> None:
        names = ("--dratek-ink-ok", "--dratek-ink-teal", "--dratek-ink-warn",
                 "--dratek-ink-bad", "--dratek-ink-danger")
        light = re.search(r":host\{--dratek-status-ok-fg[^}]*\}", self.styles)
        dark = re.search(r':host\(\[data-dratek-dark="true"\]\)\{([^}]*)\}', self.styles)
        for name in names:
            with self.subTest(variable=name):
                self.assertIn(f"{name}:", light.group(0))
                self.assertIn(f"{name}:", dark.group(1))

    def test_status_text_no_longer_carries_a_bare_literal(self) -> None:
        for selector in (r"\.signal-value\.bad-signal", r"\.system-alert-copy strong",
                         r"\.display-grid \.health-value\.level-3"):
            rule = re.search(selector + r"\{[^}]*\}", self.styles)
            with self.subTest(selector=selector):
                self.assertIsNotNone(rule, f"{selector} is gone")
                self.assertIn("var(--dratek-ink-", rule.group(0))

    def test_the_e_ink_preview_keeps_its_own_black_on_white(self) -> None:
        # The simulated display is paper: it stays white with black ink whatever
        # the Home Assistant theme does.
        for selector in (r"\.device-preview-code", r"\.device-preview-screen"):
            rule = re.search(selector + r"\{[^}]*\}", self.styles)
            with self.subTest(selector=selector):
                self.assertNotIn("--dratek-ink-", rule.group(0))


class StackingOrderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_the_ladder_is_declared_in_order(self) -> None:
        self.assertIn(
            "--dratek-z-sticky:40;--dratek-z-menu:200;--dratek-z-overlay:300;--dratek-z-modal:400",
            self.styles,
        )

    def test_dialogs_sit_on_the_modal_rung(self) -> None:
        for selector in (r"\.modal-backdrop", r"\.price-sale-dialog-backdrop",
                         r"\.template-settings-backdrop", r"\.symbol-modal-backdrop"):
            rule = re.search(selector + r"\{[^}]*z-index:[^;}]*", self.styles)
            with self.subTest(selector=selector):
                self.assertIn("var(--dratek-z-modal", rule.group(0))

    def test_the_layout_popup_still_outranks_its_own_scrim(self) -> None:
        # One shared rung would leave DOM order to decide which of the two wins.
        self.assertIn(".display-grid-layout-menu-scrim{position:fixed;z-index:var(--dratek-z-menu,200)", self.styles)
        self.assertIn(".display-grid-layout-popup{position:absolute;z-index:calc(var(--dratek-z-menu,200) + 1)", self.styles)


class StickyLayerTests(unittest.TestCase):
    """A sticky bar has to clear the header and hide what scrolls under it."""

    def setUp(self) -> None:
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_the_offset_follows_the_header_instead_of_one_early_measurement(self) -> None:
        # The header is still growing while its webfont loads and while the tab
        # bar decides whether it wraps. Measured once, the offset came out ~18px
        # short and every sticky section below parked under the header.
        self.assertIn("new ResizeObserver(() => this._syncStickyOffset())", self.styles)
        self.assertIn("this._stickyHeaderObserver.observe(header);", self.styles)
        entry = (COMPONENT / "frontend" / "dratek-eink-panel.js").read_text(encoding="utf-8")
        self.assertIn("this._stickyHeaderObserver.disconnect();", entry)

    def test_the_gap_below_the_header_belongs_to_the_header(self) -> None:
        # Sticky sections park 10px below the header. That band used to belong
        # to nobody, so list rows and card borders scrolled visibly through it;
        # only the template toolbar masked it, with a pseudo-element of its own.
        header = re.search(r"\.app-header\{[^}]*\}", self.styles).group(0)
        self.assertIn("padding:6px 0 14px", header)
        self.assertIn("background:var(--primary-background-color", header)
        self.assertIn("const value = `${height}px`;", self.styles)
        self.assertNotIn("${height + 10}px", self.styles)
        self.assertNotIn(".display-template-toolbar::before", self.styles)

    def test_every_sticky_offset_is_measured_from_the_same_header(self) -> None:
        # A second, hardcoded offset put the designer's selection row 165px
        # behind the header.
        self.assertIn(".studio-pro-workspace{--studio-locked-top:var(--dratek-sticky-top,10px)", self.styles)
        self.assertNotIn("--studio-locked-top:10px", self.styles)

    def _rules_for(self, class_name: str) -> str:
        # A class can carry several rules (a plain one, a scoped one, a media
        # query); the declarations that matter may sit in any of them.
        found = re.findall(re.escape(class_name) + r"\{([^}]*)\}", self.styles)
        self.assertTrue(found, f"{class_name} has no rules left")
        return " ".join(found)

    def test_sticky_bars_paint_an_opaque_surface(self) -> None:
        for class_name in (".studio-pro-selection-row", ".queue-controls-locked",
                           ".gateway-workspace-tabs", ".display-template-drop-panel"):
            body = self._rules_for(class_name)
            with self.subTest(selector=class_name):
                self.assertIn("position:sticky", body, f"{class_name} is no longer sticky")
                self.assertRegex(
                    body, r"background:var\(--(primary|card|secondary)-background-color",
                    "a sticky bar without its own surface lets the page scroll through it",
                )

    def test_a_sticky_bar_declares_the_layer_it_sits_on(self) -> None:
        # z-index:auto puts a sticky bar below any positioned sibling after it.
        self.assertIn("z-index:var(--dratek-z-sticky", self._rules_for(".gateway-workspace-tabs"))


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
