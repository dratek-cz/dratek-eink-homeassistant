"""The English UI must stay complete as Czech copy is added.

The panel is authored in Czech and rendered into English by a post-render
pass over text nodes and the title/aria-label/placeholder attributes (see
panel-i18n.mixin.js). That design makes it very easy to add a Czech string
and never notice the English UI still shows it untranslated, so this test
walks the same surface the runtime does and fails on anything new.

Three kinds of Czech text are deliberately NOT translated, and each is
excluded here for a stated reason rather than by being silently allowed:
  * Czech name-day given names - data the display prints, not UI copy.
  * Sample/preview content drawn into the template SVG. The on-screen
    preview must keep matching the bitmap actually sent to the panel, and
    the translation pass cannot tell an SVG text node from a UI one.
  * Lowercase word stems used for fuzzy entity matching in code. They are
    matched against entity names, never rendered.
"""

from __future__ import annotations

import collections
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"
PANEL = FRONTEND / "panel"
I18N = PANEL / "panel-i18n.mixin.js"

CZECH_LETTERS = "ěščřžýáíéúůňťďĚŠČŘŽÝÁÍÉÚŮŇŤĎ"
HAS_CZECH = re.compile(f"[{CZECH_LETTERS}]")

# Content the display itself renders, or that must stay Czech on any UI.
ALLOWED_UNTRANSLATED = {
    # Preview/sample data drawn into the template SVG.
    "15:00 · kancelář", "2,45 Kč", "23. května", "Tomáš · celý den",
    "Spotřeba vody …", "Výroba …", "PODÍL", "VÝVOJ", "ZMĚNY", "Dveře ·",
    "Met.no: 21.5°C • Déšť", "■ Slabé ■ Silné", "0,86 Kč", "3 / 3 v pořádku",
    "Kč", "Kč/kWh", "kč",
    # Sample copy in the starter designs _templateDefinitions() drops onto the
    # canvas. It is drawn into the bitmap the display receives, so it stays
    # Czech whatever language the panel around it is showing.
    "Kč / kWh", "Naskenuj pro připojení", "Nejlevnější dnes", "Papír",
    "Poslední aktualizace", "PÁTEK", "Pátek", "Skončí v 14:30", "Tento měsíc",
    "Všechno v pořádku", "ZÍTRA", "Zítra má svátek", "za 7 dní",
    "Úspora CO2: 125 kg",
    # shopping.js's sample list, drawn onto the panel by _templateShoppingList
    # until a real todo.* entity is bound. Panel content, not UI copy.
    "Mléko", "Chléb", "Káva", "Prací gel",
    # Czech weekday/month abbreviations printed on the panel.
    "PÁ", "ÚT", "ČT", "KVĚ",
    # Brand name.
    "DRÁTEK.CZ eInk",
    # Symbol-catalogue labels: translated through SYMBOL_LABEL_EN instead.
    "bazén", "oheň", "pokračovat",
    # Lowercase stems compared against entity names by has()/includes().
    "celý den", "cenový interval", "dokonč", "doruč", "dveř",
    "je nejlevnější", "jednotková cena", "jméno", "název zboží", "po-ČAS-í",
    "položk", "počas", "počasí", "počet zbývajících", "předpově", "přítom",
    "původní cena", "režim", "signál", "splněn", "spotřeb", "svátek",
    "světl", "událost", "uložený obrázek", "uložených obrázků", "vzdálenost",
    "vít", "vítr", "výkon", "výrob", "věk", "zastáv", "zboží", "zbývaj",
    "zbývající čas", "změn", "zálivk", "zám", "zásilk", "zásob", "úspora",
    "čas", "číslo",
    # The todo_list slot kind's own stems, matched against a template's slot
    # label the same way the ones above are.
    "nákupní seznam", "úkolovník",
}


def _en_exact_pairs() -> list[tuple[str, str]]:
    source = I18N.read_text(encoding="utf-8")
    match = re.search(
        r"const EN_EXACT = new Map\(Object\.entries\(\{(.*?)\n\}\)\);", source, re.S
    )
    assert match, "EN_EXACT map not found - did panel-i18n.mixin.js change shape?"
    entry = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$', re.M)
    return [(m.group(1), m.group(2)) for m in entry.finditer(match.group(1))]


def _en_patterns() -> list[re.Pattern[str]]:
    source = I18N.read_text(encoding="utf-8")
    match = re.search(r"const EN_PATTERNS = \[(.*?)\n\];", source, re.S)
    if not match:
        return []
    compiled = []
    for line in match.group(1).splitlines():
        # A replacement is either a literal string or a function, the latter so
        # a frame can hand the name it captured back through the dictionary.
        found = re.match(r'\s*\[/(.*?)/,\s*["(]', line)
        if found:
            try:
                compiled.append(re.compile(found.group(1)))
            except re.error:
                pass
    return compiled


def _symbol_labels() -> set[str]:
    source = I18N.read_text(encoding="utf-8")
    match = re.search(
        r"const SYMBOL_LABEL_EN = new Map\(Object\.entries\(\{(.*?)\n\}\)\);", source, re.S
    )
    if not match:
        return set()
    return {m.group(1) for m in re.finditer(r'"([^"]*)"\s*:', match.group(1))}


def _name_days() -> set[str]:
    source = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
    match = re.search(r"const CZECH_NAME_DAYS = \[(.*?)\n\];", source, re.S)
    if not match:
        return set()
    names: set[str] = set()
    for quoted in re.finditer(r'"([^"]*)"', match.group(1)):
        value = quoted.group(1).strip()
        if not value:
            continue
        names.add(value)
        names.update(part.strip() for part in value.split(",") if part.strip())
    return names


def _translatable_strings(path: Path, skip_name_days: bool) -> set[str]:
    """Everything _applyUiLanguage would try to translate in one file."""
    text = path.read_text(encoding="utf-8")
    if skip_name_days:
        match = re.search(r"const CZECH_NAME_DAYS = \[(.*?)\n\];", text, re.S)
        if match:
            text = text.replace(match.group(0), "")

    found: set[str] = set()
    for attribute in re.finditer(r'(?:title|aria-label|placeholder)="([^"$<>]*)"', text):
        found.add(attribute.group(1).strip())
    for between_tags in re.finditer(r">([^<>`$]*)<", text):
        found.add(between_tags.group(1).strip())
    for double in re.finditer(r'"((?:[^"\\\n]|\\.)*)"', text):
        found.add(double.group(1).strip())
    for single in re.finditer(r"'((?:[^'\\\n]|\\.)*)'", text):
        found.add(single.group(1).strip())
    return found


def _is_whole_phrase(value: str) -> bool:
    """A real user-visible phrase, not markup, code or a CSS fragment."""
    if not value or len(value) > 180:
        return False
    if not HAS_CZECH.search(value):
        return False
    if any(bad in value for bad in ("<", ">", "${", "=", "\\", "  ", "|", '"', "`")):
        return False
    if re.match(r"^[a-z-]+:", value) or value.startswith(".") or value.startswith("#"):
        return False
    return True


class UiTranslationCoverageTests(unittest.TestCase):
    def test_every_czech_ui_string_has_an_english_translation(self) -> None:
        exact = {key for key, _ in _en_exact_pairs()}
        patterns = _en_patterns()
        symbols = _symbol_labels()
        name_days = _name_days()

        untranslated: dict[str, set[str]] = {}
        files = sorted(set(PANEL.glob("*.js")) | set(FRONTEND.glob("*.js")))
        for path in files:
            if path.name == "panel-i18n.mixin.js":
                continue
            # The Lovelace card is a separate custom element with no access to
            # the panel's prototype, so it carries its own two-language table.
            # test_the_overview_card_translates_itself covers it instead.
            if path.name == "dratek-eink-overview-card.js":
                continue
            for value in _translatable_strings(path, path.name == "panel-devices.mixin.js"):
                if not _is_whole_phrase(value):
                    continue
                if value in exact or value in ALLOWED_UNTRANSLATED:
                    continue
                if value in name_days or value.lower() in symbols:
                    continue
                if any(pattern.match(value) for pattern in patterns):
                    continue
                untranslated.setdefault(path.name, set()).add(value)

        self.assertEqual(
            untranslated,
            {},
            "New Czech UI copy has no English translation. Add it to EN_EXACT in "
            "panel-i18n.mixin.js, or to ALLOWED_UNTRANSLATED here with a reason "
            "if it is display content or a code fragment rather than UI copy.",
        )

    def test_the_overview_card_translates_itself(self) -> None:
        source = (FRONTEND / "dratek-eink-overview-card.js").read_text(encoding="utf-8")
        block = re.search(r"const STRINGS = \{(.*?)\n\};", source, re.S)
        self.assertIsNotNone(block, "the card's STRINGS table is gone")
        tables = re.findall(r"\n  (cs|en): \{(.*?)\n  \},", block.group(1), re.S)
        self.assertEqual([name for name, _ in tables], ["cs", "en"])
        keys = {name: set(re.findall(r"^\s{4}(\w+):", body, re.M)) for name, body in tables}
        self.assertEqual(
            keys["cs"], keys["en"],
            "the Czech and English card copy no longer describe the same strings",
        )
        # Nothing renders unless the language is picked per render.
        self.assertIn("const t = this._t;", source)
        self.assertIn('window.localStorage.getItem("dratek-eink-language")', source)

    def test_the_overview_card_counts_in_czech(self) -> None:
        source = (FRONTEND / "dratek-eink-overview-card.js").read_text(encoding="utf-8")
        # "1 displejů" is wrong Czech; one, a few and many each take their own form.
        self.assertIn("const czechPlural = ", source)
        self.assertIn('czechPlural(n, "displej", "displeje", "displejů")', source)

    def test_interpolated_copy_has_a_pattern(self) -> None:
        """A text node that mixes Czech words with a ${...} value needs a rule.

        _is_whole_phrase above drops anything containing "${", so the scan that
        precedes this one never looked at interpolated copy at all - and that is
        exactly the copy EN_EXACT cannot hold, because the string only exists
        once a count or a name has been substituted into it. Sixteen such nodes
        were reaching the English UI untranslated ("24 šablon", "Vrstvy prvků
        (5)", "Prvek šablony #3", …). EN_PATTERNS is the mechanism for them.
        """
        patterns = _en_patterns()
        expression = re.compile(r"\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}")
        # Stands in for a substituted value while the Czech around it is checked.
        SENTINEL = ""
        missing: dict[str, set[str]] = {}
        for path in sorted(PANEL.glob("*.js")) + [FRONTEND / "dratek-eink-panel.js"]:
            if path.name == I18N.name:
                continue
            text = path.read_text(encoding="utf-8")
            for node in re.finditer(r">([^<>`]*\$\{[^<>`]*)<", text):
                value = node.group(1).strip()
                if not value or len(value) > 200:
                    continue
                # Only the Czech that survives outside the substitutions matters.
                outside = expression.sub(SENTINEL, value)
                if not HAS_CZECH.search(outside):
                    continue
                if outside.replace(SENTINEL, "").strip() in ALLOWED_UNTRANSLATED:
                    continue
                probe = expression.sub("1", value).strip()
                if any(rule.search(probe) for rule in patterns):
                    continue
                missing.setdefault(path.name, set()).add(value)
        self.assertEqual(
            missing,
            {},
            "Interpolated Czech copy with no EN_PATTERNS rule. Add a rule to "
            "panel-i18n.mixin.js matching the string as it reads once the "
            "values are substituted in.",
        )

    def test_translation_map_has_no_duplicate_keys(self) -> None:
        # A duplicate silently overrides the earlier entry in a JS object
        # literal, so a translation can be replaced without any error.
        keys = [key for key, _ in _en_exact_pairs()]
        duplicates = sorted(key for key, count in collections.Counter(keys).items() if count > 1)
        self.assertEqual(duplicates, [], f"Duplicate EN_EXACT keys: {duplicates}")

    def test_every_translation_has_a_value(self) -> None:
        blank = sorted(key for key, value in _en_exact_pairs() if not value.strip())
        self.assertEqual(blank, [], f"EN_EXACT entries with an empty translation: {blank}")

    def test_map_covers_every_panel_section(self) -> None:
        # A representative string from each tab, so a whole section losing its
        # translations is caught even if the scan above is ever loosened.
        exact = {key for key, _ in _en_exact_pairs()}
        for phrase in (
            "Nalezené displeje",          # devices
            "Mapa připojení",             # topology
            "Fronta zápisu",              # queue
            "Aktivní zápisy",             # automations
            "Diagnostika připojení",      # gateways
            "Vrstvy návrhu",              # designer
            "Pozice a rozměry",           # inspector
            "Ruční hodnota",              # variables
            "Nastavení šablony",          # templates
            "DRATEK eInk – přehled",      # overview card
        ):
            self.assertIn(phrase, exact, f"Section anchor missing a translation: {phrase}")


if __name__ == "__main__":
    unittest.main()
