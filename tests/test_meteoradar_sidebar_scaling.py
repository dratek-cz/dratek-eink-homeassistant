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
RADAR_TEMPLATE = COMPONENT / "frontend" / "panel" / "templates" / "radar.js"


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

    def test_radar_owns_the_exact_full_panel_rectangle(self) -> None:
        template = RADAR_TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("radarMap: true", template)
        self.assertIn("pixelPerfect: true", template)
        self.assertIn("rows[0]?.radarMap", self.js)
        self.assertIn("const box = { x: 0, y: 0, w: width, h: height", self.js)

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


class SidebarLegibilityTests(unittest.TestCase):
    """The vertical sidebar is a list, and has to read as one.

    It used to centre the hour and the temperature inside the column left of
    the icon, so every row began at a different x - "9°C" and "-11°C" are three
    glyphs apart - and the hours read as scattered digits. The current reading
    was a larger unlabelled number floating above them with nothing to say it
    was "now" rather than another forecast row.
    """

    def _text_calls(self, width: int, height: int, forecast: dict) -> list[tuple]:
        """Every line the sidebar draws, as (text, anchor_x, align).

        Recorded rather than measured off the bitmap: the property under test
        is where each line is anchored, and reading that back out of pixels
        means first guessing where the icon column ends - which changes with
        the row height and made the check pass or fail on the entry count
        rather than on the alignment.
        """
        calls: list[tuple] = []
        original = render._draw_centered_text

        def spy(draw, text, center_x, center_y, max_w, max_h, size, **kwargs):
            calls.append((text, round(center_x), kwargs.get("align", "center")))
            return original(draw, text, center_x, center_y, max_w, max_h, size, **kwargs)

        render._draw_centered_text = spy
        try:
            render._draw_radar_sidebar(width, height, forecast, False)
        finally:
            render._draw_centered_text = original
        return calls

    def test_hour_and_temperature_share_one_left_edge(self) -> None:
        forecast = _forecast(6)
        # Widths that differ by three glyphs: centring moves the left edge,
        # left alignment does not.
        forecast["entries"][0]["temperature"] = "9°C"
        forecast["entries"][1]["temperature"] = "-11°C"
        calls = self._text_calls(192, 480, forecast)
        rows = [call for call in calls if call[0] not in ("TEĎ", forecast["temperature"])]
        self.assertTrue(rows)
        self.assertEqual({call[2] for call in rows}, {"left"})
        self.assertEqual(len({call[1] for call in rows}), 1)

    def test_the_current_reading_is_anchored_with_the_hours(self) -> None:
        forecast = _forecast(6)
        calls = self._text_calls(192, 480, forecast)
        anchors = {call[1] for call in calls}
        self.assertEqual(len(anchors), 2, f"expected one label edge and one row edge, got {anchors}")
        self.assertEqual({call[2] for call in calls}, {"left"})

    def test_the_current_reading_is_labelled_and_ruled_off(self) -> None:
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        sidebar = source[source.index("def _draw_radar_sidebar(") :]
        sidebar = sidebar[: sidebar.index("def _draw_radar_footer(")]
        self.assertIn('"TEĎ"', sidebar)
        self.assertIn("draw.rectangle([x0, y, x1 - 1, y]", sidebar)

    def test_the_rows_fill_the_column_rather_than_truncating_it(self) -> None:
        # The label and rule above cost just enough height that a fixed row
        # height dropped the last hour that would still have fitted and left
        # the remainder as dead space along the bottom edge.
        image = render._draw_radar_sidebar(192, 480, _forecast(), False)
        pixels = image.convert("L").load()
        width, height = image.size
        last_ink = max(
            (y for y in range(height) if any(pixels[x, y] < 128 for x in range(width))),
            default=0,
        )
        row_h = max(22, min(64, round((width - 2 * max(3, round(width * 0.07))) * 0.55)))
        self.assertLess(height - last_ink, row_h)

    def test_a_taller_sidebar_never_shows_fewer_hours(self) -> None:
        short = _rows_drawn(192, 300, _forecast())
        for height in (360, 420, 480, 600):
            with self.subTest(height=height):
                self.assertGreaterEqual(_rows_drawn(192, height, _forecast()), short)


if __name__ == "__main__":
    unittest.main()
