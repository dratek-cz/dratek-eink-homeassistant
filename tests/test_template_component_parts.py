"""One renderer per designer component, and a separate colour for every part.

Chart, gauge, progress bar, indicator, QR, barcode, button and icon used to be
drawn twice: as a borrowed template block for the preview, and again with canvas
calls in _paintTemplateOverlays for the bitmap the display receives. The two had
drifted - the canvas knew line/area/steps/donut, battery and thermometer, the
preview knew none of them, and the icon reached the panel as a "◆" typed in
Arial because that branch could not read the glyph geometry.

There is one renderer now, and the bitmap is a rasterisation of the very markup
the preview shows. These tests hold that line: every component has to draw
something at any shape, every part the inspector offers has to actually change
the drawing, and the canvas re-implementations must not come back.
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
DEVICES = PANEL / "panel-devices.mixin.js"
BLOCKS = PANEL / "panel-template-blocks.mixin.js"

# Every kind, with the variants the palette can produce for it.
CASES = [
    ("chart", ["bars", "spark", "area", "steps", "donut"]),
    ("gauge", ["ring", "dial", "battery", "thermometer"]),
    ("slider", [""]),
    ("signal", ["on", "off"]),
    ("qr", [""]),
    ("barcode", [""]),
    ("button", [""]),
    ("icon", [""]),
]


def _render(cases: list, extra: str = "{}") -> dict:
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("Node.js is not available")
    components_url = json.dumps(COMPONENTS.as_uri())
    svg_url = json.dumps((PANEL / "panel-template-svg.mixin.js").as_uri())
    devices_url = json.dumps(DEVICES.as_uri())
    script = f"""
      import {{ templateComponentsMixin }} from {components_url};
      import {{ templateSvgMixin }} from {svg_url};
      import {{ devicesMixin }} from {devices_url};
      const panel = Object.assign({{}}, templateSvgMixin, devicesMixin, templateComponentsMixin, {{
        _escape: (value) => String(value ?? ""),
        _displaySupportsYellow: () => true,
        _requestTemplateIcons: () => {{}},
        // Glyph geometry comes from a live <ha-icon>; stand in for it so what
        // is measured is the component's own drawing.
        _svgIcon: (name, cx, cy, size, color) =>
          (name ? `<svg data-icon="${{name}}" fill="${{color}}"></svg>` : ""),
      }});
      const report = {{}};
      for (const [type, variants] of {json.dumps(cases)}) {{
        for (const variant of variants) {{
          const item = panel._normalizeTemplateEditorElement({{
            type, variant: variant || undefined, ...{extra},
          }});
          // Two very different shapes: a component that only works at one
          // aspect is the bug the fixed 100x60 preview box used to have.
          const wide = panel._renderTemplateComponentSvg({{ ...item, w: 60, h: 18 }}, 800, 480);
          const tall = panel._renderTemplateComponentSvg({{ ...item, w: 18, h: 40 }}, 480, 800);
          report[`${{type}}:${{variant || "default"}}`] = {{
            wide: wide.slice(wide.indexOf(">") + 1, -6).length,
            tall: tall.slice(tall.indexOf(">") + 1, -6).length,
            markup: wide,
          }};
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


class TemplateComponentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.components = COMPONENTS.read_text(encoding="utf-8")
        cls.devices = DEVICES.read_text(encoding="utf-8")

    def test_every_component_and_variant_draws_at_any_shape(self) -> None:
        drawn = _render(CASES)
        self.assertEqual(len(drawn), sum(len(v) for _, v in CASES))
        for key, sizes in sorted(drawn.items()):
            with self.subTest(component=key):
                self.assertGreater(sizes["wide"], 30, "draws nothing in a wide box")
                self.assertGreater(sizes["tall"], 30, "draws nothing in a tall box")

    def test_each_offered_part_actually_changes_the_drawing(self) -> None:
        """A colour picker that changes nothing is worse than no picker at all."""
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is not available")
        components_url = json.dumps(COMPONENTS.as_uri())
        svg_url = json.dumps((PANEL / "panel-template-svg.mixin.js").as_uri())
        devices_url = json.dumps(DEVICES.as_uri())
        script = f"""
          import {{ templateComponentsMixin }} from {components_url};
          import {{ templateSvgMixin }} from {svg_url};
          import {{ devicesMixin }} from {devices_url};
          const panel = Object.assign({{}}, templateSvgMixin, devicesMixin, templateComponentsMixin, {{
            _escape: (value) => String(value ?? ""),
            _displaySupportsYellow: () => true,
            _requestTemplateIcons: () => {{}},
            _svgIcon: (name, cx, cy, size, color) =>
              (name ? `<svg data-icon="${{name}}" fill="${{color}}"></svg>` : ""),
          }});
          const inert = {{}};
          for (const [type, variants] of {json.dumps(CASES)}) {{
            for (const part of panel._templateComponentParts(type)) {{
              const name = part[0];
              const dead = [];
              for (const variant of variants) {{
                const base = panel._normalizeTemplateEditorElement({{
                  type, variant: variant || undefined, w: 60, h: 24, icon: "home",
                }});
                const before = panel._renderTemplateComponentSvg(base, 800, 480);
                // Yellow is a colour no part defaults to, so a drawing that is
                // unchanged by it is a drawing that never reads the field.
                const tinted = panel._normalizeTemplateEditorElement({{
                  ...base, [name]: "#f4c400",
                }});
                const after = panel._renderTemplateComponentSvg(tinted, 800, 480);
                if (before === after) dead.push(variant || "default");
              }}
              if (dead.length === variants.length) inert[`${{type}}.${{name}}`] = dead;
            }}
          }}
          console.log(JSON.stringify(inert));
        """
        result = subprocess.run(
            [node, "--input-type=module", "-e", script], capture_output=True, text=True
        )
        if result.returncode:
            self.fail(result.stderr)
        inert = json.loads(result.stdout)
        self.assertEqual(
            {}, inert,
            "these parts are offered in the inspector but no variant of the "
            "component reads them, so picking a colour there does nothing",
        )

    def test_an_unset_part_follows_the_field_it_inherits(self) -> None:
        # Templates saved before part colours existed carry none of these
        # fields, and have to keep exactly the look they had: the data follows
        # `color`, and the type follows `stroke`.
        data_red = _render([("chart", ["bars"])], extra='{"color": "#d71912"}')["chart:bars"]["markup"]
        self.assertIn('fill="#d71912"', data_red, "the bars ignore the main colour")
        self.assertIn('fill="#111111" text-anchor', data_red, "the title followed the data colour")
        ink_red = _render([("chart", ["bars"])], extra='{"stroke": "#d71912"}')["chart:bars"]["markup"]
        self.assertIn('fill="#d71912" text-anchor', ink_red, "the title ignores the ink colour")
        self.assertIn(
            'const chosen = pick(item?.[field]) || pick(fallbackField && item?.[fallbackField]) || fallback;',
            self.components,
        )
        self.assertIn(
            'return ["#111111", "#d71912", "#f4c400", "#ffffff", "transparent"].includes(normalized) ? normalized : "";',
            self.devices,
        )

    def test_the_bitmap_is_the_same_markup_the_preview_shows(self) -> None:
        blocks = BLOCKS.read_text(encoding="utf-8")
        self.assertIn("this._renderTemplateComponentSvg({ ...item, type: item.kind", blocks)
        self.assertIn('item.kind === "block" || this._isTemplateComponentKind(item.kind)', self.devices)
        self.assertIn("context.drawImage(item.overlayImage, x, y, w, h)", self.devices)
        # The canvas re-implementations are gone, diamond icon and all.
        for dead in ('item.kind === "chart"', 'item.kind === "gauge"', 'item.kind === "signal"',
                     'item.kind === "slider"', 'item.kind === "qr"', 'item.kind === "barcode"',
                     'item.kind === "icon"', 'item.kind === "button"'):
            with self.subTest(branch=dead):
                self.assertNotIn(dead, self.devices)
        self.assertNotIn('context.fillText("◆"', self.devices)

    def test_yellow_falls_back_to_red_where_the_panel_has_no_yellow(self) -> None:
        # The preview has to show what will actually be printed, not a colour
        # the panel has no pigment for.
        self.assertIn(
            'if (chosen === INK_YELLOW && !this._displaySupportsYellow?.()) return INK_RED;',
            self.components,
        )


if __name__ == "__main__":
    unittest.main()
