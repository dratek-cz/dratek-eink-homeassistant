"""The SVG render path makes an automatic refresh match a manual send.

It rasterises dynamic text through resvg with the bundled Arimo, repaints each
slot's background so the stale value baked into the base image is covered, and
falls back to PIL - never leaving a slot blank - when the rasteriser is absent.
"""

from __future__ import annotations

import base64
import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_svg_render_test"


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
svg_render = _load("svg_render")


def _base_with_old_value(width: int = 296, height: int = 128) -> str:
    """A white panel with a previous value baked into the slot, as an entity refresh sees."""
    image = Image.new("RGB", (width, height), "white")
    ImageDraw.Draw(image).text((70, 55), "OLD 99999", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _slot(value_box_bg: str = "#ffffff") -> dict:
    return {
        "id": "slot1",
        "type": "text",
        "entity_id": "sensor.price",
        "fallback": "",
        "x": 60, "y": 44, "w": 176, "h": 40,
        "fontSize": 26, "minFontSize": 6, "bold": True,
        "color": "black", "backgroundColor": "white",
        "textAlign": "center", "verticalAlign": "middle", "autoFit": True,
        "svg": {
            "cx": 148, "cy": 64, "size": 26, "maxWidth": 260,
            "anchor": "middle", "bold": True, "color": "#000000",
            "bg": value_box_bg, "x": 60, "y": 44, "w": 176, "h": 40,
        },
    }


def _nonwhite(image: Image.Image) -> int:
    data = image.convert("RGB").tobytes()
    return sum(1 for index in range(0, len(data), 3) if data[index : index + 3] != b"\xff\xff\xff")


class RasterizeSvgTests(unittest.TestCase):
    def test_render_available_is_boolean(self) -> None:
        self.assertIsInstance(svg_render.render_available(), bool)

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_text_rasterises_to_pixels(self) -> None:
        document = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">'
            '<text x="60" y="20" font-family="Arimo" font-size="20" text-anchor="middle"'
            ' dominant-baseline="central" fill="#000000">Ahoj</text></svg>'
        )
        image = svg_render.rasterize_svg(document, 120, 40)
        self.assertIsNotNone(image)
        self.assertEqual(image.mode, "RGBA")  # transparent layer for compositing
        self.assertGreater(_nonwhite(image), 0)


class BoundSvgImageTests(unittest.TestCase):
    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_new_value_is_drawn(self) -> None:
        image = render.render_entity_bound_svg_image(_base_with_old_value(), [_slot()], {"slot1": "NEW 42"})
        self.assertGreater(_nonwhite(image), 0)

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_background_rect_covers_the_previous_value(self) -> None:
        # An empty value paints only the white background rect, so the stale
        # "OLD 99999" underneath it must be wiped out entirely.
        image = render.render_entity_bound_svg_image(_base_with_old_value(), [_slot()], {"slot1": ""})
        self.assertEqual(_nonwhite(image), 0)

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_svg_honours_captured_size_instead_of_growing_it(self) -> None:
        # PIL's autoFit grows the value to fill the box; the SVG path keeps the
        # captured 26px. The SVG glyphs must therefore cover fewer pixels.
        values = {"slot1": "42"}
        svg_image = render.render_entity_bound_svg_image(_base_with_old_value(), [_slot()], values)
        pil_image = render.render_entity_bound_image(_base_with_old_value(), [_slot()], values)
        self.assertLess(_nonwhite(svg_image), _nonwhite(pil_image))

    def test_falls_back_to_pil_when_rasteriser_missing(self) -> None:
        original = render.svg_render.rasterize_svg
        render.svg_render.rasterize_svg = lambda *args, **kwargs: None
        try:
            image = render.render_entity_bound_svg_image(
                _base_with_old_value(), [_slot()], {"slot1": "NEW 42"}
            )
        finally:
            render.svg_render.rasterize_svg = original
        # The value is still drawn (through PIL), never dropped.
        self.assertGreater(_nonwhite(image), 0)


if __name__ == "__main__":
    unittest.main()
