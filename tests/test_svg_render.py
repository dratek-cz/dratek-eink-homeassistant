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


def _template_svg_with_artwork(width: int = 296, height: int = 128) -> str:
    """A captured template: a diagonal band and a coloured icon behind the slot.

    Neither shape is a plain rect the old panel-side heuristic could match, so
    they stand in for the icons, gradients and photos a real template's variable
    slots commonly sit on.
    """
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"'
        f' viewBox="0 0 {width} {height}">'
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>'
        '<polygon points="0,0 150,0 100,128 0,128" fill="#111111"/>'
        '<circle cx="60" cy="64" r="24" fill="#dc140c"/>'
        '<text id="slot1" x="148" y="64" font-family="Arimo" font-size="26"'
        ' font-weight="700" fill="#000000" text-anchor="middle"'
        ' dominant-baseline="central">OLD 99</text>'
        "</svg>"
    )


class BoundTemplateImageTests(unittest.TestCase):
    """render_entity_bound_template_image is the primary, 1:1-with-manual path."""

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_background_artwork_survives_a_value_substitution(self) -> None:
        # This is the bug render_entity_bound_svg_image cannot fix: patching a
        # rect over the slot cannot know a polygon or a coloured icon was there.
        # Rebuilding the whole captured template and substituting only the text
        # leaves everything else - background art included - untouched.
        image = render.render_entity_bound_template_image(
            _template_svg_with_artwork(), [_slot()], {"slot1": "NEW 199 Kč"}
        ).convert("RGB")
        self.assertEqual(image.getpixel((10, 60)), (0, 0, 0))  # polygon, quantised black
        self.assertEqual(image.getpixel((60, 64)), (220, 20, 12))  # circle, quantised red
        self.assertGreater(_nonwhite_region(image, x0=180, y0=44, x1=296, y1=84), 0)

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_empty_value_removes_the_text_without_touching_the_background(self) -> None:
        image = render.render_entity_bound_template_image(
            _template_svg_with_artwork(), [_slot()], {"slot1": ""}
        ).convert("RGB")
        self.assertEqual(image.getpixel((10, 60)), (0, 0, 0))
        self.assertEqual(image.getpixel((60, 64)), (220, 20, 12))
        self.assertEqual(_nonwhite_region(image, x0=200, y0=44, x1=296, y1=84), 0)

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_binding_without_a_matching_id_is_composited_instead_of_dropped(self) -> None:
        # A mismatch (marker collision, stale id) must not silently lose the
        # value - it falls back to the same PIL compositing every other widget
        # type already uses on top of the rasterised template.
        binding = _slot()
        binding["id"] = "no-such-slot"
        image = render.render_entity_bound_template_image(
            _template_svg_with_artwork(), [binding], {"no-such-slot": "NEW 42"}
        )
        self.assertIsNotNone(image)
        self.assertGreater(_nonwhite(image), 0)

    def test_returns_none_when_the_rasteriser_is_unavailable(self) -> None:
        original = render.svg_render.render_available
        render.svg_render.render_available = lambda: False
        try:
            result = render.render_entity_bound_template_image(
                _template_svg_with_artwork(), [_slot()], {"slot1": "NEW 42"}
            )
        finally:
            render.svg_render.render_available = original
        self.assertIsNone(result)

    def test_returns_none_for_an_unparsable_template(self) -> None:
        self.assertIsNone(
            render.render_entity_bound_template_image("<svg></svg>", [_slot()], {"slot1": "x"})
        )


class AutomaticRefreshRendererTests(unittest.TestCase):
    """render_automatic_refresh_image picks the closest path to a manual send."""

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_prefers_the_full_template_when_available(self) -> None:
        image = render.render_automatic_refresh_image(
            _base_with_old_value(), _template_svg_with_artwork(), [_slot()], {"slot1": "NEW 199 Kč"}
        ).convert("RGB")
        # Only the full-template path could produce these background pixels;
        # base_image in this fixture is plain white.
        self.assertEqual(image.getpixel((10, 60)), (0, 0, 0))

    def test_falls_back_to_the_overlay_path_without_a_template(self) -> None:
        image = render.render_automatic_refresh_image(
            _base_with_old_value(), "", [_slot()], {"slot1": "NEW 42"}
        )
        self.assertGreater(_nonwhite(image), 0)

    def test_falls_back_to_the_overlay_path_when_template_rendering_fails(self) -> None:
        original = render.render_entity_bound_template_image
        render.render_entity_bound_template_image = lambda *args, **kwargs: None
        try:
            image = render.render_automatic_refresh_image(
                _base_with_old_value(), _template_svg_with_artwork(), [_slot()], {"slot1": "NEW 42"}
            )
        finally:
            render.render_entity_bound_template_image = original
        self.assertGreater(_nonwhite(image), 0)


def _nonwhite_region(image: Image.Image, x0: int, y0: int, x1: int, y1: int) -> int:
    cropped = image.crop((x0, y0, x1, y1))
    return _nonwhite(cropped)


def _solid_png_data_url(size: tuple[int, int], color: tuple[int, int, int]) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


class SvgImageHrefSubstitutionTests(unittest.TestCase):
    def test_replaces_only_the_matching_images_href(self) -> None:
        document = (
            '<svg><image id="other" href="data:old-other"/>'
            '<image id="cam1" x="1" y="2" href="data:old-cam1"/></svg>'
        )
        result = render._replace_svg_image_href_by_id(document, "cam1", "data:new-cam1")
        self.assertIn('id="cam1" x="1" y="2" href="data:new-cam1"', result)
        self.assertIn('id="other" href="data:old-other"', result)

    def test_a_missing_id_leaves_the_document_untouched(self) -> None:
        document = '<image id="cam1" href="data:old"/>'
        result = render._replace_svg_image_href_by_id(document, "no-such-id", "data:new")
        self.assertEqual(result, document)


class CameraBindingTemplateRenderTests(unittest.TestCase):
    """render_entity_bound_template_image's handling of type: camera bindings."""

    def _document(self, href: str) -> str:
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">'
            '<rect width="200" height="100" fill="#ffffff"/>'
            f'<image id="cam1" x="0" y="0" width="200" height="100" href="{href}"/>'
            "</svg>"
        )

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_a_fresh_value_replaces_the_captured_snapshot(self) -> None:
        old = _solid_png_data_url((10, 10), (255, 255, 255))  # indistinguishable from background
        new = _solid_png_data_url((10, 10), render.BWR_RED)
        binding = {"id": "cam1", "type": "camera", "entity_id": "camera.meteoradar"}
        image = render.render_entity_bound_template_image(
            self._document(old), [binding], {"cam1": new}
        )
        self.assertGreater(_nonwhite(image), 0)

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_no_fresh_value_keeps_the_captured_snapshot(self) -> None:
        # A transient fetch failure (values has no entry for this id) must not
        # blank the map - the last-known frame stays on the panel.
        old = _solid_png_data_url((10, 10), render.BWR_RED)
        binding = {"id": "cam1", "type": "camera", "entity_id": "camera.meteoradar"}
        image = render.render_entity_bound_template_image(self._document(old), [binding], {})
        self.assertGreater(_nonwhite(image), 0)


class AsyncCameraBindingFetchTests(unittest.TestCase):
    """async_render_camera_binding_data_url: the shared fetch-fit-quantise step."""

    def setUp(self) -> None:
        import asyncio

        self.asyncio = asyncio
        self._camera_module = types.ModuleType("homeassistant.components.camera")
        sys.modules.setdefault("homeassistant", types.ModuleType("homeassistant"))
        sys.modules.setdefault("homeassistant.components", types.ModuleType("homeassistant.components"))
        sys.modules["homeassistant.components.camera"] = self._camera_module

    def tearDown(self) -> None:
        sys.modules.pop("homeassistant.components.camera", None)

    class _FakeHass:
        async def async_add_executor_job(self, func, *args):
            return func(*args)

    class _FakeCameraImage:
        def __init__(self, content: bytes) -> None:
            self.content = content

    def test_returns_a_quantised_data_url_on_success(self) -> None:
        raw = io.BytesIO()
        Image.new("RGB", (40, 20), (0, 100, 220)).save(raw, format="PNG")

        async def fake_async_get_image(_hass, _entity_id, timeout=10):
            return self._FakeCameraImage(raw.getvalue())

        self._camera_module.async_get_image = fake_async_get_image
        result = self.asyncio.run(
            render.async_render_camera_binding_data_url(self._FakeHass(), "camera.meteoradar", 20, 10)
        )
        self.assertIsNotNone(result)
        self.assertTrue(result.startswith("data:image/png;base64,"))
        decoded = Image.open(io.BytesIO(base64.b64decode(result.split(",", 1)[1])))
        self.assertEqual(decoded.size, (20, 10))

    def test_returns_none_when_the_camera_entity_is_unavailable(self) -> None:
        async def fake_async_get_image(_hass, _entity_id, timeout=10):
            raise RuntimeError("no such entity")

        self._camera_module.async_get_image = fake_async_get_image
        result = self.asyncio.run(
            render.async_render_camera_binding_data_url(self._FakeHass(), "camera.meteoradar", 20, 10)
        )
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
