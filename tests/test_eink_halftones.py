"""A tint is not a shade on a panel that has no shades.

The designer's component renderer drew two areas as a lighter version of their
ink: the chart's area under the curve at 22% alpha, and the gauge's track at
18%. Neither ever reached a display. Both the panel's quantizer and the
backend's cut at luma 161 and hand everything above it to white, and 22% of any
ink over paper is far above that line - rgb(203,203,203) for black,
rgb(246,204,203) for red, rgb(253,242,199) for yellow. The fills were computed,
rasterised, and then thresholded out of existence, which is why a chart looked
right in the designer and arrived as a bare line, and a gauge arrived as an arc
with nothing behind it.

The replacement is an ordered screen of full-strength ink: every pixel it paints
is either ink or paper, so the quantizer has no rounding left to do and the
density survives to the panel. These tests pin the reason (the tints really are
erased) and the fix (the screens really are drawn, and drawn in whole pixels).
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import types
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
COMPONENTS = PANEL / "panel-template-components.mixin.js"
DEVICES = PANEL / "panel-devices.mixin.js"
PACKAGE = "dratek_halftone_test"

# The inks, and the two alphas the component renderer used to draw them at.
INKS = {"black": (17, 17, 17), "red": (215, 25, 18), "yellow": (244, 196, 0)}
DEAD_ALPHAS = (0.18, 0.22)


def _load(name: str):
    if PACKAGE not in sys.modules:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(COMPONENT)]
        sys.modules[PACKAGE] = package
    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", COMPONENT / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


render = _load("render")


def _over_white(ink: tuple[int, int, int], alpha: float) -> tuple[int, int, int]:
    return tuple(round(channel * alpha + 255 * (1 - alpha)) for channel in ink)


class TintsAreErasedTests(unittest.TestCase):
    """Why the fills had to go: the quantizer cannot keep them."""

    def test_every_ink_at_the_old_alphas_quantizes_to_paper(self) -> None:
        for name, ink in INKS.items():
            for alpha in DEAD_ALPHAS:
                blended = _over_white(ink, alpha)
                with self.subTest(ink=name, alpha=alpha, blended=blended):
                    swatch = Image.new("RGB", (4, 4), blended)
                    quantized = render.quantize_bwr_preview(swatch, preserve_yellow=True)
                    self.assertEqual(
                        quantized.convert("RGB").getpixel((1, 1)),
                        (255, 255, 255),
                        "a tint at this alpha is not a lighter shade, it is nothing at all",
                    )

    def test_the_same_ink_at_full_strength_survives(self) -> None:
        # The control: it is the alpha that erases these, not the colours.
        for name, ink in INKS.items():
            with self.subTest(ink=name):
                swatch = Image.new("RGB", (4, 4), ink)
                quantized = render.quantize_bwr_preview(swatch, preserve_yellow=True)
                self.assertNotEqual(quantized.convert("RGB").getpixel((1, 1)), (255, 255, 255))


class HalftoneMarkupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.components = COMPONENTS.read_text(encoding="utf-8")
        cls.devices = DEVICES.read_text(encoding="utf-8")

    def test_the_erased_tints_do_not_come_back(self) -> None:
        for alpha in ("0.18", "0.22"):
            with self.subTest(alpha=alpha):
                self.assertNotIn(f'fill-opacity="{alpha}"', self.components)

    def test_the_screens_are_one_panel_pixel(self) -> None:
        # userSpaceOnUse against a viewBox of one unit per device pixel is the
        # whole reason a dot is a dot rather than a blur: a pattern measured in
        # objectBoundingBox units would rescale with the element.
        self.assertIn('patternUnits="userSpaceOnUse"', self.components)
        self.assertIn('width="1" height="1"', self.components)

    def test_each_screen_gets_its_own_pattern_id(self) -> None:
        # Several components are inlined into one designer document, and two
        # <pattern> elements sharing an id make one paint the other's colour.
        self.assertIn("HALFTONE_SERIAL += 1", self.components)
        self.assertIn("`dratek-halftone-${", self.components)

    def test_overlays_are_blitted_on_whole_pixels_without_smoothing(self) -> None:
        # Resampling a one-pixel screen turns it straight back into the grey it
        # exists to avoid, so the blit has to be 1:1.
        for fragment in (
            "const x = Math.round(item.x * width);",
            "const y = Math.round(item.y * height);",
            "const w = Math.max(1, Math.round(item.w * width));",
            "const h = Math.max(1, Math.round(item.h * height));",
        ):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, self.devices)
        self.assertNotIn("context.globalAlpha = Math.max(0, Math.min(1, Number(item.overlayOpacity", self.devices)

    def test_element_opacity_is_a_screen_in_both_the_canvas_and_the_preview(self) -> None:
        # One ladder, drawn twice - if only the canvas half existed the designer
        # would keep showing a tint for something the panel prints as dots.
        self.assertIn("_overlayFillStyle(context, color, opacity) {", self.devices)
        self.assertIn("_overlayFillScreenStyle(fill, opacity) {", self.devices)
        self.assertIn("context.createPattern(cell, \"repeat\")", self.devices)
        self.assertIn("--element-fill-screen", self.devices)
        css = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")
        self.assertIn("background-image:var(--element-fill-screen,none)", css)
        self.assertIn("background-size:2px 2px", css)
        # The old flat tint, which thresholded to solid ink or to nothing.
        self.assertNotIn("color-mix(in srgb,var(--element-fill)", css)


class HalftoneRenderTests(unittest.TestCase):
    """The markup a component actually produces. Needs node; skipped without."""

    def _render(self, item: dict, width: int, height: int) -> str:
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is not available")
        script = f"""
          import {{ templateComponentsMixin }} from {json.dumps(COMPONENTS.as_uri())};
          import {{ templateSvgMixin }} from {json.dumps((PANEL / "panel-template-svg.mixin.js").as_uri())};
          import {{ devicesMixin }} from {json.dumps(DEVICES.as_uri())};
          const panel = Object.assign({{}}, templateSvgMixin, devicesMixin, templateComponentsMixin, {{
            _escape: (value) => String(value ?? ""),
            _displaySupportsYellow: () => false,
            _requestTemplateIcons: () => {{}},
            _svgIcon: () => "",
          }});
          const item = panel._normalizeTemplateEditorElement({json.dumps(item)});
          console.log(panel._renderTemplateComponentSvg(item, {width}, {height}));
        """
        result = subprocess.run(
            [node, "--input-type=module", "-e", script], capture_output=True, text=True
        )
        if result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout

    def test_the_chart_area_fill_is_a_screen(self) -> None:
        markup = self._render(
            {"type": "chart", "variant": "area", "showFill": True,
             "historyValues": [10, 40, 25, 70, 55, 90, 60], "w": 60, "h": 40},
            296, 128,
        )
        self.assertIn("<pattern ", markup)
        self.assertIn("dratek-halftone-", markup)
        self.assertNotIn("fill-opacity=", markup)

    def test_the_gauge_track_is_a_screen(self) -> None:
        markup = self._render(
            {"type": "gauge", "variant": "ring", "value": 40, "showTrack": True, "w": 30, "h": 40},
            296, 128,
        )
        self.assertIn("<pattern ", markup)
        self.assertNotIn("fill-opacity=", markup)

    def test_a_component_that_asks_for_no_screen_emits_no_defs(self) -> None:
        # The <defs> block is per-render, so a stale one would mean the
        # collector is leaking between components.
        markup = self._render({"type": "barcode", "w": 40, "h": 20}, 296, 128)
        self.assertNotIn("<pattern ", markup)


if __name__ == "__main__":
    unittest.main()
