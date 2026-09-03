"""Alternative integrations are one requirement, not several failures.

The setup guide reports whether the integrations a template needs are present.
Its status check is a domain check, and alternatives share a domain - Met.no,
OpenWeatherMap and AccuWeather are all `weather` - so listing them as separate
cards was wrong in both directions: with none installed the guide showed three
red "Chybí" badges for one unmet requirement, and installing any single one
turned all three green, crediting the user with integrations they do not have.

Entries that carry the same `oneOf` label are now one card with one status.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
DEVICES = PANEL / "panel-devices.mixin.js"
TEMPLATES = PANEL / "templates"

# Interchangeable sources for one requirement: any one of them satisfies it.
GROUPED = {
    "weather": ("Zdroj předpovědi počasí", 3),
    "calendar": ("Zdroj kalendáře", 3),
    "garden": ("Čidlo vlhkosti půdy", 2),
    "parcel": ("Sledování zásilky", 2),
    "security": ("Ústředna alarmu", 2),
    "solar": ("Integrace střídače", 2),
    "thermostat": ("Zdroj termostatu", 2),
    "washer": ("Zdroj stavu pračky", 2),
    "air": ("Zdroj kvality vzduchu", 4),
}

# Same domain, but not alternatives - the template shows both readings, so
# collapsing them would hide a requirement rather than clarify one.
NOT_GROUPED = ("living", "water")


class TemplateSetupAlternativesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = DEVICES.read_text(encoding="utf-8")

    def test_both_setup_surfaces_share_one_status_check(self) -> None:
        # The guide and the older setup dialog each had their own copy of the
        # entity-detection logic, so a fix to one silently missed the other.
        self.assertIn("_templateIntegrationGroups(recipe) {", self.source)
        self.assertEqual(
            2, self.source.count("this._templateIntegrationGroups(recipe)")
        )
        # Scoped to the two renderers: an identical normalize() also lives in
        # _czSpotTemplateBindings, which has nothing to do with integrations.
        for start, end in (
            ("_renderDisplayTemplateSetupDialog() {", "  _templateVariableMeta"),
            ("_renderTemplateSetupGuide(template) {", "    const steps ="),
        ):
            body = self.source[self.source.index(start) : ]
            body = body[: body.index(end)] if end in body else body
            with self.subTest(renderer=start):
                self.assertNotIn("_hasEntityDomain", body)
                self.assertNotIn("entityFriendlyNames", body)

    def test_any_one_option_satisfies_the_group(self) -> None:
        helper = self.source[self.source.index("_templateIntegrationGroups(recipe) {") :]
        helper = helper[: helper.index("\n  _render")]
        self.assertIn("existing.found = existing.found || found;", helper)

    def test_alternatives_are_labelled_as_one_requirement(self) -> None:
        for template_id, (label, count) in GROUPED.items():
            with self.subTest(template=template_id):
                source = (TEMPLATES / f"{template_id}.js").read_text(encoding="utf-8")
                found = re.findall(r'oneOf:\s*"([^"]+)"', source)
                self.assertEqual([label] * count, found)

    def test_distinct_requirements_stay_separate(self) -> None:
        for template_id in NOT_GROUPED:
            with self.subTest(template=template_id):
                source = (TEMPLATES / f"{template_id}.js").read_text(encoding="utf-8")
                self.assertNotIn("oneOf:", source)

    def test_the_choice_is_spelled_out_where_it_applies(self) -> None:
        self.assertIn("Stačí jedna z těchto možností:", self.source)
        i18n = (PANEL / "panel-i18n.mixin.js").read_text(encoding="utf-8")
        self.assertIn('"Stačí jedna z těchto možností:":', i18n)


if __name__ == "__main__":
    unittest.main()
