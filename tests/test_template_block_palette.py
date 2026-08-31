"""The designer's template-block palette must stay wired to the real renderer.

The palette in panel-template-blocks.mixin.js is not a set of pictures of the
blocks - each entry is a real template row, drawn by the same
_renderTemplateBlock the prepared templates in templates/*.js go through. That
is the whole point of it: what the designer shows is what the panel prints.

It is also the thing that breaks silently. A block's spec names its fields by
hand (`{ band: { label, value, icon, color } }`), so renaming a field in the
renderer, or mistyping one here, produces an entry that still appears in the
palette and still drops onto the canvas - and draws nothing at all. So run every
catalogued block through the renderer and insist it produces markup.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
BLOCKS = PANEL / "panel-template-blocks.mixin.js"
DEVICES = PANEL / "panel-devices.mixin.js"
ENTRY = ROOT / "custom_components" / "dratek_eink" / "frontend" / "dratek-eink-panel.js"


def _run_node(script: str) -> dict:
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("Node.js is not available")
    result = subprocess.run(
        [node, "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


class TemplateBlockPaletteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.blocks = BLOCKS.read_text(encoding="utf-8")
        cls.devices = DEVICES.read_text(encoding="utf-8")

    def test_every_catalogued_block_draws_something(self) -> None:
        blocks_url = json.dumps(BLOCKS.as_uri())
        svg_url = json.dumps((PANEL / "panel-template-svg.mixin.js").as_uri())
        script = f"""
          import {{ templateBlocksMixin }} from {blocks_url};
          import {{ templateSvgMixin }} from {svg_url};
          const panel = Object.assign({{}}, templateSvgMixin, templateBlocksMixin, {{
            _escape: (value) => String(value ?? ""),
            _displaySupportsYellow: () => true,
            _requestTemplateIcons: () => {{}},
            // Real icon geometry is read out of a live <ha-icon>, which needs a
            // browser; an unresolved glyph makes _svgIcon return "", which
            // would report the icon block as empty for a reason that has
            // nothing to do with its spec. Stand in for the glyph so what is
            // measured is the block's own drawing.
            _svgIcon: (name) => (name ? `<svg data-icon="${{name}}"></svg>` : ""),
          }});
          const report = {{}};
          for (const kind of panel._templateBlockKindIds()) {{
            const spec = panel._templateBlockSpec(kind);
            const item = {{ block: spec.row(), blockKind: kind, w: spec.w, h: spec.h }};
            const markup = panel._renderTemplateBlockVisual(item, 800, 480);
            // Only the wrapper is stripped - a nested <svg> is how an icon is
            // drawn, so removing every svg tag would erase the icon block.
            report[kind] = markup.slice(markup.indexOf(">") + 1, -6).length;
          }}
          console.log(JSON.stringify(report));
        """
        drawn = _run_node(script)
        self.assertEqual(
            sorted(drawn),
            sorted(set(drawn)),
            "the catalogue lists a block twice",
        )
        self.assertGreaterEqual(len(drawn), 20, "the catalogue lost most of its blocks")
        empty = sorted(kind for kind, size in drawn.items() if size < 20)
        self.assertEqual(
            [], empty,
            "these blocks are in the palette but draw nothing - their sample row "
            "no longer matches what panel-template-svg expects",
        )

    def test_the_palette_reaches_the_designer(self) -> None:
        # The rail entry, the palette body and the element type the tiles insert.
        self.assertIn('["blocks", "view-dashboard-variant-outline", "Prvky šablon"]', self.devices)
        self.assertIn("this._renderTemplateBlockPalette()", self.devices)
        self.assertIn('data-template-editor-tool="block"', self.blocks)
        self.assertIn('item.type === "block") content = this._renderTemplateBlockVisual', self.devices)
        # And the mixin is actually merged into the panel prototype.
        self.assertIn("templateBlocksMixin,", ENTRY.read_text(encoding="utf-8"))

    def test_blocks_are_painted_into_the_bitmap_the_display_receives(self) -> None:
        """The send path repaints overlays onto a canvas; it never screenshots.

        A block that renders in the preview but has no branch in
        _paintTemplateOverlays reaches the panel as the empty stroked rectangle
        the final `else` draws - which is exactly what happened before the
        rasteriser below existed, and it looked fine on screen the whole time.
        """
        self.assertIn('block: model.block && typeof model.block === "object"', self.devices)
        self.assertIn("await this._prepareTemplateOverlayImages(overlays,", self.devices)
        self.assertIn('item.kind === "block"', self.devices)
        self.assertIn("context.drawImage(item.overlayImage, x, y, w, h)", self.devices)
        # An SVG loaded as an image cannot fetch anything, so the icons have to
        # be in the cache before the markup is built.
        self.assertIn("await this._preloadTemplateIcons([", self.blocks)

    def test_a_block_overlay_adds_no_frame_of_its_own(self) -> None:
        # The block paints all of its own decoration. A fill or a border on the
        # wrapper would put a box around it that no prepared template has.
        self.assertIn(
            'block: { w: 70, h: 20, fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 0',
            self.devices,
        )
        styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")
        self.assertIn(
            ".template-overlay-block{padding:0!important;border:0!important;",
            styles,
        )


if __name__ == "__main__":
    unittest.main()
