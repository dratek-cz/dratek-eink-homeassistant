"""The template edit menu makes its destinations visibly distinct.

This menu is only as wide as a catalog card.  Treating data bindings, visual
design and a JSON download as three identical teal cards made all three scan as
one setting.  The markup now carries semantic groups and the CSS gives the two
editing destinations different visual identities while keeping export quiet.
"""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
DEVICES = PANEL / "panel-devices.mixin.js"
STYLES = PANEL / "panel-render-ui.mixin.js"
I18N = PANEL / "panel-i18n.mixin.js"


class TemplateEditMenuHierarchyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.markup = DEVICES.read_text(encoding="utf-8")
        cls.styles = STYLES.read_text(encoding="utf-8")
        cls.i18n = I18N.read_text(encoding="utf-8")

    def test_editing_and_file_actions_have_separate_sections(self) -> None:
        self.assertIn('class="card-edit-section is-main-section"', self.markup)
        self.assertIn('class="card-edit-section is-file-section"', self.markup)
        self.assertLess(
            self.markup.index("Co chcete změnit?"),
            self.markup.index("Soubor šablony"),
        )

    def test_destinations_say_what_they_change(self) -> None:
        self.assertIn("Home Assistant", self.markup)
        self.assertIn("Zdroje dat", self.markup)
        self.assertIn("Entity a živé hodnoty", self.markup)
        self.assertIn("eInk Studio", self.markup)
        self.assertIn("Vzhled a rozložení", self.markup)
        self.assertIn("Prvky, texty a grafika", self.markup)

    def test_data_and_design_are_not_the_same_teal_card(self) -> None:
        self.assertIn("is-primary-action is-data-action", self.markup)
        self.assertIn("is-primary-action is-design-action", self.markup)
        self.assertIn(".card-edit-option-btn.is-data-action{", self.styles)
        self.assertIn(".card-edit-option-btn.is-design-action{", self.styles)
        self.assertIn("var(--dratek-orange,#ff6b00)", self.styles)

    def test_export_is_a_secondary_file_action(self) -> None:
        self.assertIn('class="card-edit-option-btn is-secondary-action"', self.markup)
        self.assertIn(".card-edit-option-btn.is-secondary-action{", self.styles)
        self.assertIn("border-style:dashed", self.styles)

    def test_new_copy_is_available_in_english(self) -> None:
        for phrase in (
            "Co chcete změnit?",
            "Zdroje dat",
            "Entity a živé hodnoty",
            "Vzhled a rozložení",
            "Prvky, texty a grafika",
            "Soubor šablony",
            "Vyberte oblast",
            "Stáhnout soubor",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(f'"{phrase}":', self.i18n)


if __name__ == "__main__":
    unittest.main()
