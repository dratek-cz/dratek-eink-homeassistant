"""The Wi-Fi template has to hand over a network name and a password.

Three separate failures shared the same page:

1. The four-colour theme painted a yellow plate behind the QR symbol. A scanner
   reads the code by thresholding the image, so the one thing it needs is a
   clean quiet zone - and on a three-colour panel that plate fell back to red.
2. The network name and the password shared one row, side by side, so anything
   past about a dozen characters lost its end to an ellipsis. A Wi-Fi password
   with its end cut off is not a shorter password, it is the wrong one.
3. On a landscape tag neither value appeared at all: they were squeezed into a
   15px footer strip beside a code that left most of the panel empty.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
TEMPLATE = PANEL / "templates" / "wifi.js"
SVG = PANEL / "panel-template-svg.mixin.js"


class QrCodeHasNoFrameTests(unittest.TestCase):
    def setUp(self) -> None:
        self.svg = SVG.read_text(encoding="utf-8")

    def test_the_theme_no_longer_paints_the_code(self) -> None:
        self.assertNotIn('row.qr.accent = "yellow"', self.svg)

    def test_the_block_draws_only_a_quiet_zone_and_the_modules(self) -> None:
        block = self.svg[self.svg.index("_blockQr(row, box) {"):]
        block = block[: block.index("\n  },")]
        self.assertNotIn("YELLOW", block)
        self.assertNotIn("frame", block.replace("frameX", "").replace("frameY", "").replace("frameSize", ""))
        # White quiet zone, black modules, nothing else.
        self.assertIn('fill="#ffffff"', block)
        self.assertIn('fill="${BLACK}" shape-rendering="crispEdges"', block)


class CredentialsAreOnThePageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.template = TEMPLATE.read_text(encoding="utf-8")

    def _branch(self, marker: str) -> str:
        start = self.template.index(marker)
        return self.template[start : self.template.index("];", start)]

    def test_the_landscape_tag_shows_both_values(self) -> None:
        # They used to be a footer strip that printed nothing legible; the code
        # is now beside them instead of hogging a panel it leaves half empty.
        branch = self._branch("if (height <= 160 && width >= height) return [")
        self.assertIn("duo:", branch)
        self.assertIn("left: { qr }", branch)
        self.assertIn("right: { list: credentials }", branch)

    def test_each_value_gets_a_line_of_its_own(self) -> None:
        # Side by side, a name and a password share the width and both lose
        # their ends. One per line is the whole point.
        credentials = self.template[self.template.index("const credentials = ["):]
        credentials = credentials[: credentials.index("];")]
        self.assertEqual(4, credentials.count("label:"))
        self.assertIn('{ label: "SÍŤ" }', credentials)
        self.assertIn('{ label: "HESLO" }', credentials)
        self.assertIn("{ label: ssid, bold: true", credentials)
        self.assertIn("{ label: password, bold: true", credentials)
        # And the old two-column split is gone for good.
        self.assertNotIn("split:", self.template)

    def test_a_tall_panel_gives_each_value_the_full_width(self) -> None:
        branch = self._branch("if (height > width) return [")
        self.assertIn('stat: { value: ssid, caption: "SÍŤ"', branch)
        self.assertIn('stat: { value: password, caption: "HESLO"', branch)

    def test_every_credential_row_is_clamped_inside_the_panel(self) -> None:
        # _blockStat fits its value to the box by arithmetic and stops at its
        # own 8.5px floor - below which it used to keep drawing anyway, from a
        # left edge computed for a width it no longer had, so a long password
        # ran off both sides of the paper.
        self.assertEqual(4, self.template.count("clamp: true"))
        for line in self.template.splitlines():
            if "stat: { value:" in line:
                with self.subTest(line=line.strip()[:60]):
                    self.assertIn("clamp: true", line)


class StatClampTests(unittest.TestCase):
    """The opt-in that keeps a too-long value inside its box."""

    def setUp(self) -> None:
        self.svg = SVG.read_text(encoding="utf-8")

    def test_it_is_opt_in_so_other_templates_are_untouched(self) -> None:
        # A temperature cannot overflow, and its exact left edge is what lines
        # the unit up beside it - so the default path must not change.
        self.assertIn("const clamped = !!stat.clamp && span(fontSize) > box.w;", self.svg)
        self.assertIn('anchor: clamped ? "middle" : "start"', self.svg)
        self.assertIn("...(clamped ? { maxWidth: box.w, minSize: 8.5 } : {})", self.svg)

    def test_only_the_wifi_template_asks_for_it(self) -> None:
        others = [
            path.name
            for path in (PANEL / "templates").glob("*.js")
            if path.name != "wifi.js" and "clamp: true" in path.read_text(encoding="utf-8")
        ]
        self.assertEqual([], others)

    def test_a_clamped_value_shrinks_before_it_is_cut(self) -> None:
        # 8.5, not the builder's default 10: for a password, smaller-but-whole
        # beats bigger-with-the-end-missing.
        clamp_block = self.svg[self.svg.index("const clamped = !!stat.clamp"):]
        clamp_block = clamp_block[: clamp_block.index("}));")]
        self.assertIn("minSize: 8.5", clamp_block)


if __name__ == "__main__":
    unittest.main()
