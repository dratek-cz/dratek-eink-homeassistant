"""svg_text.py must stay a faithful mirror of the panel's SVG text layout.

Automatic refreshes rebuild each template `<text>` on the backend and rasterise
it; a manual send builds the same element in the browser. They only match while
this module and glyphWidth/_svgReadableText/_svgText in
panel-template-svg.mixin.js agree. These tests pin both directions: the Python
values for representative glyphs, and the presence of the same numeric constants
in the JavaScript so neither side can drift unnoticed.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL_SVG = COMPONENT / "frontend" / "panel" / "panel-template-svg.mixin.js"


def _load(name: str):
    package = "dratek_svg_text_test"
    if package not in sys.modules:
        module = types.ModuleType(package)
        module.__path__ = [str(COMPONENT)]
        sys.modules[package] = module
    spec = importlib.util.spec_from_file_location(f"{package}.{name}", COMPONENT / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


svg_text = _load("svg_text")


# (character, expected non-bold width, expected bold width) read straight off the
# glyphWidth table in panel-template-svg.mixin.js.
GLYPH_CASES = [
    ("M", 0.83, 0.87),
    ("w", 0.83, 0.87),
    ("I", 0.49, 0.52),
    ("T", 0.49, 0.52),
    ("i", 0.27, 0.32),
    ("r", 0.27, 0.32),
    ("5", 0.56, 0.56),
    (" ", 0.28, 0.28),
    (".", 0.28, 0.28),
    ("!", 0.28, 0.28),
    ("-", 0.36, 0.36),
    ("/", 0.36, 0.36),
    ("(", 0.36, 0.36),
    ("—", 0.95, 0.95),
    ("%", 0.95, 0.95),
    ("@", 0.95, 0.95),
    ("A", 0.70, 0.72),
    ("Č", 0.70, 0.72),  # uppercase diacritic must not be mistaken for lowercase
    ("a", 0.53, 0.58),
    ("č", 0.53, 0.58),
]


class GlyphWidthPortTests(unittest.TestCase):
    def test_python_glyph_widths_match_the_table(self) -> None:
        for character, normal, bold in GLYPH_CASES:
            self.assertAlmostEqual(svg_text.glyph_width(character, False), normal, msg=character)
            self.assertAlmostEqual(svg_text.glyph_width(character, True), bold, msg=character)

    def test_javascript_still_declares_the_same_constants(self) -> None:
        source = PANEL_SVG.read_text(encoding="utf-8")
        for fragment in (
            "bold ? 0.87 : 0.83",
            "bold ? 0.52 : 0.49",
            "bold ? 0.32 : 0.27",
            "return 0.56",
            "return 0.28",
            "return 0.36",
            "return 0.95",
            "bold ? 0.72 : 0.70",
            "bold ? 0.58 : 0.53",
        ):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, source)

    def test_min_readable_font_size_matches_javascript(self) -> None:
        source = PANEL_SVG.read_text(encoding="utf-8")
        self.assertIn(f"MIN_READABLE_FONT_SIZE = {svg_text.MIN_READABLE_FONT_SIZE}", source)


class TextLayoutPortTests(unittest.TestCase):
    def test_width_is_the_summed_advance(self) -> None:
        # "Ab" = uppercase A (0.70) + lowercase b (0.53) at size 20.
        self.assertAlmostEqual(svg_text.svg_text_width("Ab", 20, False), (0.70 + 0.53) * 20)

    def test_font_shrinks_proportionally_to_fit(self) -> None:
        # Wide enough to overflow, so the size scales by maxWidth/estimated.
        size, max_width = 40, 60
        estimated = svg_text.svg_text_width("WWWW", size, False)
        self.assertGreater(estimated, max_width)
        fitted = svg_text.svg_fit_font_size("WWWW", size, max_width, False)
        self.assertAlmostEqual(fitted, size * (max_width / estimated))

    def test_font_never_drops_below_minimum(self) -> None:
        fitted = svg_text.svg_fit_font_size("WWWWWWWWWW", 40, 1, False, min_size=10)
        self.assertEqual(fitted, 10)

    def test_overflowing_text_is_ellipsis_clipped(self) -> None:
        text, size = svg_text.svg_readable_text("PŘÍLIŠ DLOUHÝ NÁPIS", 12, 40, False)
        self.assertTrue(text.endswith("…"))
        self.assertLessEqual(svg_text.svg_text_width(text, size, False), 40)

    def test_fitting_value_is_returned_unchanged(self) -> None:
        text, size = svg_text.svg_readable_text("42", 20, 400, False)
        self.assertEqual(text, "42")
        self.assertEqual(size, 20)


class TextElementPortTests(unittest.TestCase):
    def test_empty_value_produces_no_element(self) -> None:
        self.assertEqual(svg_text.svg_text("", 10, 10, 12), "")

    def test_element_carries_the_panel_attributes(self) -> None:
        element = svg_text.svg_text(
            "199 Kč", 100, 40, 24, bold=True, anchor="end", color="#dc140c", max_width=0
        )
        self.assertIn('x="100.00"', element)
        self.assertIn('y="40.00"', element)
        self.assertIn('font-size="24.00"', element)
        self.assertIn('font-weight="700"', element)
        self.assertIn('text-anchor="end"', element)
        self.assertIn('dominant-baseline="central"', element)
        self.assertIn('fill="#dc140c"', element)
        self.assertIn("199 Kč", element)

    def test_markup_in_value_is_escaped(self) -> None:
        element = svg_text.svg_text('<b>&"', 0, 0, 12)
        self.assertIn("&lt;b&gt;&amp;&quot;", element)
        self.assertNotIn("<b>", element)


if __name__ == "__main__":
    unittest.main()
