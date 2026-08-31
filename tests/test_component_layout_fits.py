"""Every designer component has to fit the box it was given.

The composite elements laid their parts out as independent minima and never
reconciled them with the element: a slider asked for a 10 px header, an 8 px
scale and a 6 px bar inside the palette's own 23 px element, and _svgText will
not draw below MIN_READABLE_FONT_SIZE (10) however small the band it is handed.
The results were all the same shape of bug - something printed on top of
something else, or off the edge:

  * the slider's 0/50/100 scale had its baseline below the bottom edge and
    printed as a row of half-letters;
  * the indicator's ZAP/VYP caption hung off the bottom on any element under
    about 30 px, and its icon touched the first letter of the label;
  * the battery's charge reading was drawn in the same ink as the charge, so at
    63% the digits were inside the fill and simply gone;
  * the thermometer's mercury came out as a one-pixel hair, because the column
    was the stem minus two outlines and the stem had no allowance for them;
  * the donut's caption sat across the bottom of its own ring and was cut in
    half by the edge;
  * the dial's arc ran above the top of the element, because the radius was
    sized against the face without the half-band the arc is drawn with;
  * the barcode's digits hung below the symbol;
  * the line and step charts put their first and last markers half outside.

The rule that replaced the minima: a band that cannot seat a readable glyph is
dropped rather than shrunk or clipped, and anything drawn with a stroke has to
allow for the half of it that falls outside the path.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
COMPONENTS = PANEL / "panel-template-components.mixin.js"
BLOCKS = PANEL / "panel-template-blocks.mixin.js"

# Element shapes a user can actually drag out, from a tall narrow slot to a
# letterbox strip. The letterbox is the one that used to break everything.
SHAPES = [(46, 52), (30, 26), (90, 18), (24, 60), (100, 100), (15, 12)]

KINDS = [
    ("chart", ["line", "area", "steps", "bars", "spark", "donut"]),
    ("gauge", ["ring", "dial", "battery", "thermometer"]),
    ("slider", [""]),
    ("signal", ["active", "off"]),
    ("qr", [""]),
    ("barcode", [""]),
    ("button", [""]),
    ("icon", [""]),
]


class ComponentLayoutSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.components = COMPONENTS.read_text(encoding="utf-8")
        cls.blocks = BLOCKS.read_text(encoding="utf-8")

    def test_a_band_too_short_for_type_is_dropped_not_clipped(self) -> None:
        self.assertIn("const MIN_TEXT_BAND = 11;", self.components)
        # Each of the four bands that used to overflow now checks against the
        # box before it is used.
        for guard in (
            "if (headerHeight + barWanted > box.h) headerHeight = 0;",
            "if (headerHeight + scaleHeight + barWanted > box.h) scaleHeight = 0;",
            "if (headerHeight && box.h - headerHeight < 12) headerHeight = 0;",
            "if (captionHeight && box.h - captionHeight < 8) captionHeight = 0;",
        ):
            with self.subTest(guard=guard):
                self.assertIn(guard, self.components)
        # The indicator's caption and the donut's label are conditional on the
        # room existing at all, rather than written at a fixed offset.
        self.assertIn("const captionBand = showState && pillHeight + MIN_TEXT_BAND <= box.h ? MIN_TEXT_BAND : 0;", self.components)
        self.assertIn("showLabel && box.h >= MIN_TEXT_BAND * 2.4", self.components)

    def test_nothing_is_hung_a_fraction_below_the_part_above_it(self) -> None:
        # The overflowing baselines were all of the form "edge + a fraction of
        # the box height". Centring in an owned band is what keeps them in.
        for gone in (
            "centre + radius + Math.max(5, box.h * 0.16)",
            "barY + barHeight + scaleHeight * 0.62",
            "box.y + box.h - Math.max(5, box.h * 0.06)",
            "box.y + barsHeight + captionHeight * 0.6",
        ):
            with self.subTest(expression=gone):
                self.assertNotIn(gone, self.components)

    def test_the_battery_reading_is_knocked_out_of_its_own_fill(self) -> None:
        self.assertIn("_componentClipped(markup, x, y, width, height) {", self.components)
        self.assertIn("glyphs(INK_WHITE)", self.components)
        self.assertIn("glyphs(valueInk)", self.components)

    def test_round_gauges_allow_for_the_band_they_are_drawn_with(self) -> None:
        # radius + half the band is what has to fit, not the radius alone.
        self.assertIn("const spread = 1.13;", self.components)
        self.assertIn("Math.min(face.w * 0.5 / spread", self.components)
        self.assertIn("Math.min(face.w, face.h) * 0.5 / spread", self.components)

    def test_strokes_allow_for_the_half_that_falls_outside_the_path(self) -> None:
        self.assertIn("this._componentStroke(item, { w, h }) / 2 + 0.5", self.components)
        self.assertIn("const y = plot.y + 0.5 + (plot.h - 1) * line;", self.components)
        self.assertIn("box.x + edge / 2", self.components)
        # The thermometer's column is the stem minus its two walls, so the stem
        # has to be wider than the walls before there is a column at all.
        self.assertIn("Math.max(edge * 2 + 3, bulb * 0.9)", self.components)

    def test_chart_markers_stay_inside_the_element(self) -> None:
        self.assertIn("const markerRoom =", self.components)
        self.assertIn("plot.x + markerRoom + (p.x / 100) * Math.max(1, plot.w - markerRoom * 2)", self.components)
        self.assertIn("plot.y + markerRoom + ((p.y - 10) / 44) * Math.max(1, plot.h - markerRoom * 2)", self.components)

    def test_palette_defaults_are_big_enough_for_their_own_sample(self) -> None:
        # A block dropped at its palette size has to look like the tile that
        # offered it. These seven collapsed: the grid printed each cell's value
        # over its own caption, the steps' labels sat on the connector line, and
        # the dial and ring ellipsised captions they had room for.
        for kind, height in (("list", 42), ("grid", 56), ("steps", 32),
                             ("dial", 46), ("ring", 44), ("bars", 38), ("duo", 42)):
            with self.subTest(block=kind):
                start = self.blocks.index(f"\n  {kind}: {{")
                spec = self.blocks[start:start + 400]
                self.assertIn(f"h: {height},", spec)


class ComponentLayoutRenderTests(unittest.TestCase):
    """Renders every kind at every shape. Needs node; skipped without it."""

    def _render_all(self) -> dict:
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is not available")
        script = f"""
          import {{ templateComponentsMixin }} from {json.dumps(COMPONENTS.as_uri())};
          import {{ templateSvgMixin }} from {json.dumps((PANEL / "panel-template-svg.mixin.js").as_uri())};
          import {{ devicesMixin }} from {json.dumps((PANEL / "panel-devices.mixin.js").as_uri())};
          const panel = Object.assign({{}}, templateSvgMixin, devicesMixin, templateComponentsMixin, {{
            _escape: (value) => String(value ?? ""),
            _displaySupportsYellow: () => false,
            _requestTemplateIcons: () => {{}},
            // Glyph geometry comes from a live <ha-icon>; a stand-in of the
            // right size is enough to place it.
            _svgIcon: (name, cx, cy, size) =>
              `<rect x="${{cx - size / 2}}" y="${{cy - size / 2}}" width="${{size}}" height="${{size}}"></rect>`,
          }});
          const report = {{}};
          for (const [type, variants] of {json.dumps(KINDS)}) {{
            for (const variant of variants) {{
              for (const [w, h] of {json.dumps(SHAPES)}) {{
                const item = panel._normalizeTemplateEditorElement({{
                  type, variant: variant || undefined, w, h,
                  value: 63, unit: "%", text: "POPISEK", chartTitle: "NADPIS", icon: "home",
                  historyValues: [12, 48, 30, 72, 55, 88, 60, 40],
                }});
                const markup = panel._renderTemplateComponentSvg({{ ...item, type }}, 296, 128);
                report[`${{type}}:${{variant || "default"}}:${{w}}x${{h}}`] = {{
                  body: markup.slice(markup.indexOf(">") + 1, -6).length,
                  ellipsis: markup.includes("…"),
                }};
              }}
            }}
          }}
          console.log(JSON.stringify(report));
        """
        result = subprocess.run(
            [node, "--input-type=module", "-e", script], capture_output=True, text=True
        )
        if result.returncode:
            raise AssertionError(result.stderr)
        return json.loads(result.stdout)

    def test_every_kind_draws_something_at_every_shape(self) -> None:
        drawn = self._render_all()
        self.assertEqual(len(drawn), sum(len(v) for _, v in KINDS) * len(SHAPES))
        for key, report in sorted(drawn.items()):
            with self.subTest(case=key):
                self.assertGreater(report["body"], 30, "draws nothing at this shape")


if __name__ == "__main__":
    unittest.main()
