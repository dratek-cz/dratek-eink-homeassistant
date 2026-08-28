"""Unconfigured templates are conspicuous but remain sendable."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
DEVICES = PANEL / "panel-devices.mixin.js"
STYLES = PANEL / "panel-render-ui.mixin.js"
I18N = PANEL / "panel-i18n.mixin.js"


class UnconfiguredTemplateWarningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = DEVICES.read_text(encoding="utf-8")
        cls.styles = STYLES.read_text(encoding="utf-8")
        cls.i18n = I18N.read_text(encoding="utf-8")

    def test_one_warning_renderer_serves_catalog_and_display_preview(self) -> None:
        self.assertIn("_renderTemplateConfigurationWarning(template, status = null)", self.source)
        self.assertEqual(
            2,
            self.source.count("this._renderTemplateConfigurationWarning(template, configStatus)"),
        )
        self.assertIn(
            '${used ? this._renderTemplateConfigurationWarning(template, configStatus) : ""}',
            self.source,
        )

    def test_complete_templates_have_no_warning(self) -> None:
        self.assertIn('if (!current || current.state === "complete") return "";', self.source)

    def test_empty_and_partial_states_explain_the_difference(self) -> None:
        for phrase in (
            "Šablona není nastavená",
            "Nastavení není dokončené",
            "Zobrazuje zatím ukázková data",
            "Část hodnot stále používá ukázková data",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.source)
                self.assertIn(f'"{phrase}":', self.i18n)

    def test_the_layer_does_not_reassure_about_a_restriction_it_never_imposed(self) -> None:
        """No "you can still send it" chip.

        Nothing on this layer has ever been disabled, so the note existed only
        to deny a restriction the user had no reason to assume - and it sat
        beside the Configure button looking like a second action.
        `test_send_button_still_only_requires_an_assigned_template` below is
        what actually pins the behaviour it used to describe.
        """
        self.assertNotIn("Odeslat lze i tak", self.source)
        self.assertNotIn("Odeslat lze i tak", self.i18n)
        self.assertNotIn(".template-unconfigured-warning-content em", self.styles)

    def test_the_layer_stays_see_through_and_its_button_is_the_hit_target(self) -> None:
        """The warning captions the preview; it does not replace it.

        A near-opaque wash read as a switched-off screen rather than as a
        template running on sample data, and the one control on the layer was
        smaller than the text above it.
        """
        warning = self.styles[self.styles.index(".template-unconfigured-warning{"):]
        warning = warning[: warning.index(chr(10))]
        self.assertIn("background:rgba(255,247,230,.3)", warning)
        button = self.styles[self.styles.index(".template-unconfigured-warning-actions>button{"):]
        button = button[: button.index(chr(10))]
        self.assertIn("min-height:36px", button)
        self.assertIn("font-size:12px", button)

    def test_warning_covers_the_preview_without_blocking_it(self) -> None:
        self.assertIn(".template-unconfigured-warning{position:absolute;inset:0;z-index:40", self.styles)
        self.assertIn("pointer-events:none", self.styles)
        self.assertIn('data-display-template-configure="${this._escape(template.id)}"', self.source)
        self.assertIn(".template-unconfigured-warning-actions>button", self.styles)
        self.assertIn("cursor:pointer;pointer-events:auto", self.styles)
        self.assertIn(".display-template-surface.has-config-warning{container-type:size}", self.styles)
        self.assertIn('data-has-config-warning="${hasConfigWarning ? "true" : "false"}"', self.source)

    def test_send_button_still_only_requires_an_assigned_template(self) -> None:
        send = self.source[self.source.index('class="display-template-send-button'):]
        send = send[: send.index("</button>")]
        self.assertIn(
            'data-template-send ${assignedTemplates.length && !this._templateSending ? "" : "disabled"}',
            send,
        )
        self.assertNotIn("configStatus", send)
        self.assertNotIn("hasConfigWarning", send)


if __name__ == "__main__":
    unittest.main()
