"""Regression tests for responsive Meteoradar layout and direct dithering."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
SVG_MIXIN = COMPONENT / "frontend" / "panel" / "panel-template-svg.mixin.js"


def _load_render():
    package = types.ModuleType("dratek_radar_sidebar_test")
    package.__path__ = [str(COMPONENT)]
    sys.modules[package.__name__] = package
    spec = importlib.util.spec_from_file_location(
        f"{package.__name__}.render", COMPONENT / "render.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


render = _load_render()


def _forecast(count: int = 12) -> dict:
    return {
        "temperature": "12°C",
        "hourly": True,
        "entries": [
            {
                "label": "",
                "time": f"{(13 + index) % 24:02d}:00",
                "condition": "rainy",
                "temperature": f"{14 - index}°",
            }
            for index in range(1, count + 1)
        ],
    }


def _rows_drawn(width: int, height: int, forecast: dict | None) -> int:
    drawn: list[int] = []
    original = render._weather_condition_icon_image
    render._weather_condition_icon_image = lambda condition, size, yellow=False, night=False: (
        drawn.append(size),
        original(condition, size, yellow),
    )[1]
    try:
        render._draw_radar_sidebar(width, height, forecast, False)
    finally:
        render._weather_condition_icon_image = original
    return len(drawn)


class HourlySidebarTests(unittest.TestCase):
    def test_small_tag_shows_at_least_one_hour(self) -> None:
        for width, height in ((250, 128), (296, 128)):
            self.assertGreaterEqual(
                _rows_drawn(render.radar_sidebar_width(width), height, _forecast()), 1
            )

    def test_small_portrait_forecast_keeps_two_hours(self) -> None:
        self.assertEqual(_rows_drawn(128, 162, _forecast(2)), 2)

    def test_taller_panel_never_shows_fewer_hours(self) -> None:
        previous = 0
        for height in (128, 300, 400, 480, 640, 800):
            rows = _rows_drawn(render.radar_sidebar_width(480), height, _forecast())
            self.assertGreaterEqual(rows, previous)
            previous = rows
        self.assertGreater(previous, 1)

    def test_rows_are_capped_by_available_forecasts(self) -> None:
        self.assertEqual(
            _rows_drawn(render.radar_sidebar_width(480), 800, _forecast(3)), 3
        )

    def test_hourly_rows_use_clock_time_without_offset_numbers(self) -> None:
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        hourly = source[source.index("if hourly and dated:") : source.index("elif dated:")]
        self.assertIn('"label": "",', hourly)
        self.assertNotIn('f"+{offset} h"', hourly)
        self.assertNotIn('f"+3 h', source)

    def test_only_complete_rows_are_counted(self) -> None:
        self.assertEqual(render._radar_forecast_rows(100, 30, 12), 3)
        self.assertEqual(render._radar_forecast_rows(89, 30, 12), 2)
        self.assertEqual(render._radar_forecast_rows(1000, 30, 2), 2)

    def test_sidebar_has_no_intensity_legend(self) -> None:
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.assertNotIn("_precipitation_intensity_fills", source)
        self.assertNotIn("SLABÉ", source)
        self.assertNotIn("STŘEDNÍ", source)
        self.assertNotIn("SILNÉ", source)


class LayoutMirrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.js = SVG_MIXIN.read_text(encoding="utf-8")

    def _js_constant(self, name: str) -> float:
        match = re.search(rf"const {name} = ([\d.]+);", self.js)
        self.assertIsNotNone(match)
        return float(match.group(1))

    def test_v01330_sidebar_constants_match_python(self) -> None:
        self.assertEqual(self._js_constant("RADAR_SIDEBAR_MIN"), 88)
        self.assertEqual(self._js_constant("RADAR_SIDEBAR_MAX"), 200)
        self.assertEqual(self._js_constant("RADAR_SIDEBAR_MIN"), render._RADAR_SIDEBAR_MIN)
        self.assertEqual(self._js_constant("RADAR_SIDEBAR_MAX"), render._RADAR_SIDEBAR_MAX)
        self.assertEqual(
            self._js_constant("RADAR_SIDEBAR_FRACTION"), render._RADAR_SIDEBAR_FRACTION
        )

    def test_portrait_layout_places_forecast_below_the_map(self) -> None:
        self.assertIn("_radarBlockLayout(width, height)", self.js)
        self.assertIn("if (height > width)", self.js)
        self.assertIn("const forecastY = box.y + layout.mapH;", self.js)
        self.assertIn('data-radar-part="sidebar"', self.js)

    def test_landscape_layout_keeps_forecast_beside_the_map(self) -> None:
        self.assertIn("const mapX = x + layout.forecastW;", self.js)

    def test_map_bitmap_fills_its_entire_slot(self) -> None:
        radar_block = self.js[self.js.index("_blockRadarMap(row, box)") :]
        radar_block = radar_block[:radar_block.index("_blockBoardTwoLine")]
        self.assertIn('data-radar-part="map"', radar_block)
        self.assertNotIn('preserveAspectRatio="xMidYMid meet"', radar_block)
        self.assertIn('preserveAspectRatio="none"', radar_block)

    def test_portrait_footer_draws_hourly_items_horizontally(self) -> None:
        drawn: list[int] = []
        original = render._weather_condition_icon_image
        render._weather_condition_icon_image = lambda condition, size, yellow=False, night=False: (
            drawn.append(size), original(condition, size, yellow)
        )[1]
        try:
            image = render._draw_radar_sidebar(480, 140, _forecast(), False)
        finally:
            render._weather_condition_icon_image = original
        self.assertEqual(image.size, (480, 140))
        self.assertGreaterEqual(len(drawn), 4)

    def test_a_taller_portrait_strip_never_shows_fewer_hours(self) -> None:
        # The minimum column width used to scale with the strip's height, so
        # making the strip taller fitted fewer hours across it than a short one
        # - the opposite of what the extra room should buy.
        def hours(height: int) -> int:
            drawn: list[int] = []
            original = render._weather_condition_icon_image
            render._weather_condition_icon_image = lambda condition, size, yellow=False, night=False: (
                drawn.append(size), original(condition, size, yellow)
            )[1]
            try:
                render._draw_radar_footer(280, height, _forecast(), False)
            finally:
                render._weather_condition_icon_image = original
            return len(drawn)

        short = hours(96)
        for height in (110, 120, 140, 160):
            with self.subTest(height=height):
                self.assertGreaterEqual(hours(height), short)

    def test_the_portrait_strip_has_no_dead_band_through_the_middle(self) -> None:
        """Icon, hour and temperature are measured and stacked as one block.

        They used to be pinned to fixed fractions of the strip - icon flush to
        the top padding, hour at 0.62, temperature at 0.84 - so the icons sat
        alone above an empty band roughly a fifth of the content tall, and the
        two text rows were crushed together underneath it. Measuring the total
        margin instead would not catch this: the old strip was top- and
        bottom-balanced, the hole was in the middle of it.
        """
        for height in (96, 120, 140):
            with self.subTest(height=height):
                image = render._draw_radar_footer(280, height, _forecast(), False)
                pixels = image.convert("L").load()
                width, _ = image.size
                rows = [
                    any(pixels[x, y] < 200 for x in range(width))
                    for y in range(height)
                ]
                inked = [y for y, drawn in enumerate(rows) if drawn]
                self.assertTrue(inked, "the strip drew nothing at all")
                widest_gap = 0
                run = 0
                for y in range(inked[0], inked[-1] + 1):
                    run = 0 if rows[y] else run + 1
                    widest_gap = max(widest_gap, run)
                span = inked[-1] - inked[0] + 1
                self.assertLessEqual(
                    widest_gap, span * 0.08,
                    f"{widest_gap}px blank band inside a {span}px stack",
                )

    def test_palette_and_target_size_reach_the_map_renderer(self) -> None:
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        call = source[source.index("radar_img = await async_render_meteoradar(") :][:700]
        self.assertIn("preserve_yellow=preserve_yellow,", call)
        self.assertIn("target_width=width,", call)
        self.assertIn("target_height=height", call)


if __name__ == "__main__":
    unittest.main()
