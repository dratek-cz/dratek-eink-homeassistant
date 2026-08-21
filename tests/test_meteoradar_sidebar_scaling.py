"""The Meteoradar sidebar scales with the panel and grows hour by hour.

Two things are pinned here.

The forecast starts at +1 h, not +3 h, and a bigger panel adds whole hours
rather than enlarging the same single entry. How many fit is decided by the
height; how tall a row needs to be is decided by the width, because a row is
an icon beside two short lines of text. Deriving the row height from the
panel height instead put three unreadable rows on a 128 px tag and four
oversized ones on a 640 px panel - the wrong count in both directions.

The sidebar's own width is shared with the browser preview
(_radarSidebarWidth in panel-template-svg.mixin.js). The two must always
agree or the map and the sidebar stop tiling the block.
"""

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
                "time": f"{(13 + i) % 24:02d}:00",
                "condition": "rainy",
                "temperature": f"{14 - i}°",
            }
            for i in range(1, count + 1)
        ],
    }


def _rows_drawn(width: int, height: int, forecast: dict | None) -> int:
    """Number of forecast rows the sidebar actually painted."""
    drawn: list[int] = []
    original = render._weather_condition_icon_image
    render._weather_condition_icon_image = lambda c, s, p=False: (
        drawn.append(s),
        original(c, s, p),
    )[1]
    try:
        render._draw_radar_sidebar(width, height, forecast, False)
    finally:
        render._weather_condition_icon_image = original
    return len(drawn)


# Every panel geometry the integration ships for, smallest first.
PANELS = [(250, 128), (296, 128), (400, 300), (800, 480), (300, 400), (480, 800), (960, 640)]


class SidebarRowScalingTests(unittest.TestCase):
    def test_the_smallest_tag_still_shows_the_one_hour_step(self) -> None:
        for width, height in ((250, 128), (296, 128)):
            sidebar = render.radar_sidebar_width(width)
            self.assertEqual(
                _rows_drawn(sidebar, height, _forecast()),
                1,
                f"{width}x{height} must show exactly the +1 h base step",
            )

    def test_a_taller_panel_shows_more_hours(self) -> None:
        # Strictly more room, strictly more (or equal) hours - never fewer.
        previous = 0
        for height in (128, 300, 400, 480, 640, 800):
            rows = _rows_drawn(render.radar_sidebar_width(480), height, _forecast())
            self.assertGreaterEqual(rows, previous, f"{height} px lost a row")
            previous = rows
        self.assertGreater(previous, 1, "the tallest panel must show more than the base step")

    def test_no_panel_draws_a_row_it_cannot_fit(self) -> None:
        # A clipped row reads as damage on e-ink, where nothing scrolls.
        for width, height in PANELS:
            sidebar = render.radar_sidebar_width(width)
            image = render._draw_radar_sidebar(sidebar, height, _forecast(), False)
            self.assertEqual(image.size, (sidebar, height))

    def test_the_row_height_is_set_by_the_width_not_the_height(self) -> None:
        # Same column width, wildly different heights: the rows must stay the
        # same readable size and only their number may change.
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.assertIn("row_h = max(22, min(64, round(inner_w * 0.55)))", source)

    def test_rows_are_capped_by_what_was_actually_fetched(self) -> None:
        rows = _rows_drawn(render.radar_sidebar_width(480), 800, _forecast(count=3))
        self.assertEqual(rows, 3)

    def test_a_missing_forecast_still_renders_the_legend(self) -> None:
        sidebar = render.radar_sidebar_width(800)
        for forecast in (None, {"temperature": "", "hourly": False, "entries": []}):
            image = render._draw_radar_sidebar(sidebar, 480, forecast, False)
            self.assertEqual(image.size, (sidebar, 480))
            self.assertEqual(_rows_drawn(sidebar, 480, forecast), 0)

    def test_hourly_rows_are_labelled_by_the_clock_not_by_an_offset(self) -> None:
        # "14:00", never "+1 h · 14:00" - the wall-clock time is what a glance
        # compares against, and the offset only crowded the narrow column.
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        hourly = source[source.index("if hourly and dated:") : source.index("elif dated:")]
        self.assertIn('"label": "",', hourly)
        self.assertNotIn('f"+{offset} h"', hourly)

    def test_a_daily_only_integration_gets_one_labelled_row(self) -> None:
        daily = {
            "temperature": "9°C",
            "hourly": False,
            "entries": [{"label": "Pá", "time": "12:00", "condition": "sunny", "temperature": "18°"}],
        }
        self.assertEqual(_rows_drawn(render.radar_sidebar_width(800), 480, daily), 1)


class SidebarFitCountTests(unittest.TestCase):
    def test_only_whole_rows_are_counted(self) -> None:
        self.assertEqual(render._radar_forecast_rows(100, 30, 12), 3)
        self.assertEqual(render._radar_forecast_rows(90, 30, 12), 3)
        self.assertEqual(render._radar_forecast_rows(89, 30, 12), 2)

    def test_the_available_entries_are_the_ceiling(self) -> None:
        self.assertEqual(render._radar_forecast_rows(1000, 30, 2), 2)

    def test_degenerate_inputs_draw_nothing(self) -> None:
        for available, row, count in ((0, 30, 5), (-10, 30, 5), (100, 0, 5), (100, 30, 0)):
            self.assertEqual(render._radar_forecast_rows(available, row, count), 0)


class SidebarWidthMirrorTests(unittest.TestCase):
    """render.py and the browser preview must size the sidebar identically."""

    def setUp(self) -> None:
        self.js = SVG_MIXIN.read_text(encoding="utf-8")

    def _js_constant(self, name: str) -> float:
        match = re.search(rf"const {name} = ([\d.]+);", self.js)
        self.assertIsNotNone(match, f"{name} not found in the browser preview")
        return float(match.group(1))

    def test_the_three_constants_match(self) -> None:
        self.assertEqual(self._js_constant("RADAR_SIDEBAR_MIN"), render._RADAR_SIDEBAR_MIN)
        self.assertEqual(self._js_constant("RADAR_SIDEBAR_MAX"), render._RADAR_SIDEBAR_MAX)
        self.assertEqual(
            self._js_constant("RADAR_SIDEBAR_FRACTION"), render._RADAR_SIDEBAR_FRACTION
        )

    def test_the_width_stays_proportional_on_a_large_panel(self) -> None:
        # The old 168 cap froze an 800 px panel at 21 % while a 400 px one got
        # the full 24 %, so the larger the display the narrower its column.
        self.assertEqual(render.radar_sidebar_width(800), 192)
        self.assertGreater(render.radar_sidebar_width(800), render.radar_sidebar_width(400))

    def test_the_sidebar_never_crowds_out_the_map(self) -> None:
        for width in (120, 250, 296, 400, 480, 800, 960, 1360):
            sidebar = render.radar_sidebar_width(width)
            self.assertGreaterEqual(width - sidebar, min(60, width - 1))


if __name__ == "__main__":
    unittest.main()
