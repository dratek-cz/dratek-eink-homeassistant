"""The SVG render path makes an automatic refresh match a manual send.

It rasterises dynamic text through resvg with the bundled Arimo, repaints each
slot's background so the stale value baked into the base image is covered, and
falls back to PIL - never leaving a slot blank - when the rasteriser is absent.
"""

from __future__ import annotations

import base64
import importlib.util
import io
import json
from pathlib import Path
import sys
import types
import unittest

from PIL import Image, ImageChops, ImageDraw


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
svg_text = _load("svg_text")
svg_blocks = _load("svg_blocks")


def _data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


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
            _base_with_old_value(), _template_svg_with_artwork(), "", [_slot()], {"slot1": "NEW 199 Kč"}
        ).convert("RGB")
        # Only the full-template path could produce these background pixels;
        # base_image in this fixture is plain white.
        self.assertEqual(image.getpixel((10, 60)), (0, 0, 0))

    def test_falls_back_to_the_overlay_path_without_a_template(self) -> None:
        image = render.render_automatic_refresh_image(
            _base_with_old_value(), "", "", [_slot()], {"slot1": "NEW 42"}
        )
        self.assertGreater(_nonwhite(image), 0)

    def test_falls_back_to_the_overlay_path_when_template_rendering_fails(self) -> None:
        original = render.render_entity_bound_template_image
        render.render_entity_bound_template_image = lambda *args, **kwargs: None
        try:
            image = render.render_automatic_refresh_image(
                _base_with_old_value(), _template_svg_with_artwork(), "", [_slot()], {"slot1": "NEW 42"}
            )
        finally:
            render.render_entity_bound_template_image = original
        self.assertGreater(_nonwhite(image), 0)

    def test_prefers_clean_background_over_every_older_tier(self) -> None:
        # clean_background needs no resvg_py and no captured svg_template - it
        # must win even when a (deliberately misleading) svg_template is also
        # present, proving the new tier is checked first.
        clean = _solid_png_data_url((296, 128), (17, 17, 17))  # quantises to black
        image = render.render_automatic_refresh_image(
            _base_with_old_value(), _template_svg_with_artwork(), clean, [], {}
        ).convert("RGB")
        self.assertEqual(image.getpixel((10, 10)), (0, 0, 0))

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_empty_clean_background_is_purely_additive(self) -> None:
        # An automation saved before this tier existed has no clean_background
        # at all - behaviour must be identical to today's fallback chain.
        with_empty = render.render_automatic_refresh_image(
            _base_with_old_value(), _template_svg_with_artwork(), "", [_slot()], {"slot1": "NEW 42"}
        )
        without_param_tier = render.render_entity_bound_template_image(
            _template_svg_with_artwork(), [_slot()], {"slot1": "NEW 42"}
        )
        self.assertEqual(list(with_empty.convert("RGB").getdata()), list(without_param_tier.convert("RGB").getdata()))


class CleanBackgroundRendererTests(unittest.TestCase):
    """render_entity_bound_clean_background_image never guesses a background -
    every binding type composites onto the real capture, so a pixel just
    inside a binding's box but away from anything it actually draws must still
    show the real background, not a flat guessed rectangle.
    """

    @staticmethod
    def _clean(size: tuple[int, int] = (200, 120)) -> str:
        return _solid_png_data_url(size, (220, 20, 12))  # quantises to red

    def test_text_binding_does_not_paint_a_guessed_background(self) -> None:
        binding = {
            "id": "t1", "type": "text", "x": 20, "y": 20, "w": 60, "h": 24,
            "fontSize": 14, "backgroundColor": "white", "color": "black",
            "textAlign": "center", "verticalAlign": "middle", "autoFit": True,
        }
        image = render.render_entity_bound_clean_background_image(
            self._clean(), [binding], {"t1": "42"}
        ).convert("RGB")
        self.assertEqual(image.getpixel((21, 21)), (220, 20, 12))

    def test_chart_binding_does_not_paint_a_guessed_background(self) -> None:
        binding = {
            "id": "c1", "type": "chart", "x": 20, "y": 20, "w": 60, "h": 40,
            "maxPoints": 5, "showAxes": False, "showGrid": False, "showValues": False,
        }
        image = render.render_entity_bound_clean_background_image(
            self._clean(), [binding], {"c1": "[1,2,3]"}
        ).convert("RGB")
        self.assertEqual(image.getpixel((21, 21)), (220, 20, 12))

    def test_layered_binding_does_not_paint_a_guessed_background(self) -> None:
        binding = {
            "id": "g1", "type": "layered", "x": 20, "y": 20, "w": 40, "h": 40,
            "canvas_width": 40, "canvas_height": 40,
            "default_symbol": "default", "fallback": "default",
            "layers": [{"id": "default", "objects": []}],
        }
        image = render.render_entity_bound_clean_background_image(
            self._clean(), [binding], {"g1": "default"}
        ).convert("RGB")
        self.assertEqual(image.getpixel((21, 21)), (220, 20, 12))

    def test_weather_binding_does_not_paint_a_guessed_background(self) -> None:
        binding = {"id": "w1", "type": "weather", "x": 20, "y": 20, "w": 40, "h": 30}
        image = render.render_entity_bound_clean_background_image(
            self._clean(), [binding], {"w1": "sunny"}
        ).convert("RGB")
        self.assertEqual(image.getpixel((21, 21)), (220, 20, 12))

    def test_camera_binding_is_pasted_at_its_declared_position(self) -> None:
        camera = _solid_png_data_url((30, 20), (0, 0, 0))  # quantises to black
        binding = {"id": "cam1", "type": "camera", "x": 10, "y": 10, "w": 30, "h": 20}
        image = render.render_entity_bound_clean_background_image(
            self._clean(), [binding], {"cam1": camera}
        ).convert("RGB")
        self.assertEqual(image.getpixel((25, 20)), (0, 0, 0))  # inside the pasted frame
        self.assertEqual(image.getpixel((5, 5)), (220, 20, 12))  # outside it, real background

    def test_camera_binding_without_a_fresh_value_is_skipped_not_blanked(self) -> None:
        # A transient fetch failure must leave the clean background showing
        # through rather than pasting nothing meaningful or crashing.
        binding = {"id": "cam1", "type": "camera", "x": 10, "y": 10, "w": 30, "h": 20}
        image = render.render_entity_bound_clean_background_image(
            self._clean(), [binding], {}
        ).convert("RGB")
        self.assertEqual(image.getpixel((25, 20)), (220, 20, 12))

    def test_returns_none_for_an_undecodable_background(self) -> None:
        self.assertIsNone(
            render.render_entity_bound_clean_background_image("not-a-real-data-url", [], {})
        )


class CleanBackgroundMatchesManualSendTests(unittest.TestCase):
    """The preferred tier has to *reproduce* a manual send, not resemble it.

    Every value the template itself drew - text runs and the live series()/
    ratio()/day()/event() rows alike - is put back through the panel's own
    builders and rasterised, so compositing them onto the value-free capture
    must land on exactly the pixels the browser produced for the same data.
    Redrawing them with PIL could not: it grew text to fill its box, centred it
    on the glyphs' ink extents instead of the font's central baseline, and
    recomputed every gauge arc and bar by hand.
    """

    WIDTH, HEIGHT = 200, 100

    def _rows(self) -> tuple[str, list[dict], dict[str, str]]:
        """One text run and one gauge row: markup, bindings, resolved values."""
        box = {"x": 10, "y": 40, "w": 180, "h": 50}
        text = svg_text.svg_text(
            "21,4 °C", 100.0, 20.0, 22.0, bold=True, anchor="middle",
            max_width=120.0, element_id="t1",
        )
        # 42 on the backend's 0-100 percentage scale is the 0.42 fraction the
        # panel's own ratio() helper hands the block.
        gauge = svg_blocks.block_ring(
            {"percent": 0.42, "value": "42", "caption": "AQI"}, box
        )
        bindings = [
            {
                "id": "t1", "type": "text", "entity_id": "sensor.t", "fallback": "21,4 °C",
                "x": 40, "y": 8, "w": 120, "h": 26, "fontSize": 22, "minFontSize": 6,
                "bold": True, "autoFit": True, "textAlign": "center",
                "verticalAlign": "middle", "backgroundColor": "transparent", "color": "black",
                "svg": {
                    "cx": 100.0, "cy": 20.0, "size": 22.0, "maxWidth": 120.0,
                    "anchor": "middle", "bold": True, "color": "#000000", "bg": "none",
                    "x": 40, "y": 8, "w": 120, "h": 26,
                },
            },
            {
                "id": "g1", "type": "ratio", "visual": "ring", "caption": "AQI",
                "min": "0", "max": "100", "fallback": "",
                "meters": [{"entity_id": "sensor.aqi", "divisor": 1, "label": "", "color": "black"}],
                **{key: int(value) for key, value in box.items()},
            },
        ]
        values = {
            "t1": "21,4 °C",
            "g1": json.dumps([{"percent": 42.0, "text": "42", "label": "", "color": "black"}]),
        }
        return f'<g id="g1">{gauge}</g>{text}', bindings, values

    def _document(self, body: str) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.WIDTH}" height="{self.HEIGHT}"'
            f' viewBox="0 0 {self.WIDTH} {self.HEIGHT}">'
            f'<rect width="{self.WIDTH}" height="{self.HEIGHT}" fill="#ffffff"/>{body}</svg>'
        )

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_the_refresh_is_pixel_identical_to_the_manual_send(self) -> None:
        body, bindings, values = self._rows()
        manual = render.quantize_bwr_preview(
            svg_render.rasterize_svg(self._document(body), self.WIDTH, self.HEIGHT, background="#ffffff")
        ).convert("RGB")
        # _blankedDisplayTemplateBackground tears every bound node out; what is
        # left is what the backend composites onto.
        blanked = svg_render.rasterize_svg(
            self._document(""), self.WIDTH, self.HEIGHT, background="#ffffff"
        ).convert("RGB")
        automatic = render.render_entity_bound_clean_background_image(
            _data_url(blanked), bindings, values
        ).convert("RGB")
        self.assertIsNone(
            ImageChops.difference(manual, automatic).getbbox(),
            "an automatic refresh no longer matches the manual send pixel for pixel",
        )

    @unittest.skipUnless(svg_render.render_available(), "SVG rasteriser not installed")
    def test_a_forecast_strip_draws_the_panels_own_block(self) -> None:
        box = {"x": 0, "y": 0, "w": 200, "h": 60}
        days = [
            {"label": "PÁ", "condition": "sunny", "value": "22°"},
            {"label": "SO", "condition": "rainy", "value": "18°"},
        ]
        binding = {
            "id": "f1", "type": "forecast", "entity_id": "weather.home", "days": 4,
            "fallback": "", **{key: int(value) for key, value in box.items()},
        }
        expected = render.quantize_bwr_preview(
            svg_render.rasterize_svg(
                self._document(
                    svg_blocks.block_strip(
                        [
                            {
                                "label": day["label"], "value": day["value"],
                                "icon": render._MDI_WEATHER_ICON_PATHS[
                                    render._WEATHER_CONDITION_ICON_NAMES[day["condition"]]
                                ],
                            }
                            for day in days
                        ],
                        box,
                    )
                ),
                self.WIDTH, self.HEIGHT, background="#ffffff",
            )
        ).convert("RGB")
        blanked = svg_render.rasterize_svg(
            self._document(""), self.WIDTH, self.HEIGHT, background="#ffffff"
        ).convert("RGB")
        automatic = render.render_entity_bound_clean_background_image(
            _data_url(blanked), [binding], {"f1": json.dumps(days, ensure_ascii=False)}
        ).convert("RGB")
        self.assertIsNone(ImageChops.difference(expected, automatic).getbbox())

    def test_without_the_rasteriser_every_value_is_still_drawn(self) -> None:
        # No resvg wheel on this platform: the PIL renderers take over, so the
        # refresh is approximate again but never blank or half-built.
        body, bindings, values = self._rows()
        del body
        original = render.svg_render.rasterize_svg
        render.svg_render.rasterize_svg = lambda *args, **kwargs: None
        try:
            image = render.render_entity_bound_clean_background_image(
                _solid_png_data_url((self.WIDTH, self.HEIGHT), (255, 255, 255)), bindings, values
            )
        finally:
            render.svg_render.rasterize_svg = original
        self.assertIsNotNone(image)
        self.assertGreater(_nonwhite(image), 0)  # the text run
        self.assertGreater(_nonwhite_region(image.convert("RGB"), 10, 40, 190, 90), 0)  # the gauge

    def test_the_pil_fallback_keeps_the_captured_font_size(self) -> None:
        # PIL's autoFit grows text to fill its box; a manual send only ever
        # shrinks it to fit. Growing it is what made short values balloon.
        _body, bindings, values = self._rows()
        text_binding = bindings[0]
        original = render.svg_render.rasterize_svg
        render.svg_render.rasterize_svg = lambda *args, **kwargs: None
        try:
            fallback = render.render_entity_bound_clean_background_image(
                _solid_png_data_url((self.WIDTH, self.HEIGHT), (255, 255, 255)),
                [text_binding], values,
            ).convert("RGB")
        finally:
            render.svg_render.rasterize_svg = original
        grown = render.quantize_bwr_preview(
            render.render_entity_bound_image(
                _solid_png_data_url((self.WIDTH, self.HEIGHT), (255, 255, 255)),
                [text_binding], values,
            )
        ).convert("RGB")
        self.assertLess(_nonwhite(fallback), _nonwhite(grown))


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
            render.async_render_camera_binding_data_url(self._FakeHass(), "camera.test", 20, 10)
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
            render.async_render_camera_binding_data_url(self._FakeHass(), "camera.test", 20, 10)
        )
        self.assertIsNone(result)

    def test_meteoradar_renders_directly_with_all_selected_options(self) -> None:
        async def camera_must_not_be_used(*_args, **_kwargs):
            raise AssertionError("camera.meteoradar would discard its render options")

        captured = {}

        async def fake_render(_hass, **kwargs):
            captured.update(kwargs)
            return Image.new("RGB", (40, 20), render.BWR_RED)

        self._camera_module.async_get_image = camera_must_not_be_used
        radar_module = sys.modules[f"{PACKAGE}.meteoradar"]
        original = radar_module.async_render_meteoradar
        radar_module.async_render_meteoradar = fake_render
        try:
            result = self.asyncio.run(
                render.async_render_camera_binding_data_url(
                    self._FakeHass(), "camera.meteoradar", 20, 10,
                    country="pl", show_precipitation=True,
                    dotted_light=False, show_wind=True,
                )
            )
        finally:
            radar_module.async_render_meteoradar = original

        self.assertIsNotNone(result)
        self.assertEqual("pl", captured["country"])
        self.assertTrue(captured["show_precipitation"])
        self.assertFalse(captured["dotted_light"])
        self.assertTrue(captured["show_wind"])


if __name__ == "__main__":
    unittest.main()
