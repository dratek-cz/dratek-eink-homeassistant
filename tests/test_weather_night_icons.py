"""A cloudy night must not draw the sun behind the cloud.

Home Assistant has no "partlycloudy-night" state - the entity reports plain
"partlycloudy" whether it is noon or 2am, and the frontend decides day/night
itself. Both renderers already carried a `night` flag all the way down to the
glyph builder (weather_icon -> weather_icon_image -> _weather_condition_parts,
where it picks the moon colour over the sun colour for the disc), but nothing
ever set it, so the sun was drawn at every hour of the night.

Only "partlycloudy" is affected: "clear-night" carries its own branch keyed on
the state name, and the remaining conditions have no night artwork in Home
Assistant's own icon set either.
"""

from __future__ import annotations

from datetime import datetime
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_night_icon_test"


def _load_svg_blocks():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package
    for name in ("svg_render", "svg_text", "svg_blocks"):
        spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", COMPONENT / f"{name}.py")
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{PACKAGE}.svg_blocks"]


svg_blocks = _load_svg_blocks()


def _fills(condition: str, night: bool) -> list[str]:
    return [fill for _d, fill, _w in svg_blocks._weather_condition_parts(condition, night)]


class GlyphColourTests(unittest.TestCase):
    def test_partlycloudy_uses_the_moon_at_night_and_the_sun_by_day(self):
        self.assertIn(svg_blocks.WEATHER_SUN_COLOR, _fills("partlycloudy", False))
        self.assertNotIn(svg_blocks.WEATHER_MOON_COLOR, _fills("partlycloudy", False))
        self.assertIn(svg_blocks.WEATHER_MOON_COLOR, _fills("partlycloudy", True))
        self.assertNotIn(svg_blocks.WEATHER_SUN_COLOR, _fills("partlycloudy", True))

    def test_the_cloud_is_drawn_over_the_disc_either_way(self):
        # The user-visible question this answers: it is a moon *behind a cloud*,
        # not a bare moon replacing the whole glyph.
        for night in (False, True):
            with self.subTest(night=night):
                fills = _fills("partlycloudy", night)
                self.assertIn(svg_blocks.WEATHER_CLOUD_BACK_COLOR, fills)
                self.assertIn(svg_blocks.WEATHER_CLOUD_FRONT_COLOR, fills)
                disc = svg_blocks.WEATHER_MOON_COLOR if night else svg_blocks.WEATHER_SUN_COLOR
                self.assertLess(
                    fills.index(disc),
                    fills.index(svg_blocks.WEATHER_CLOUD_BACK_COLOR),
                    "the disc has to be painted first so the cloud covers it",
                )

    def test_clear_night_needs_no_flag(self):
        self.assertIn(svg_blocks.WEATHER_MOON_COLOR, _fills("clear-night", False))

    def test_conditions_without_night_artwork_are_unchanged(self):
        for condition in ("cloudy", "rainy", "snowy", "fog", "pouring", "windy"):
            with self.subTest(condition=condition):
                self.assertEqual(_fills(condition, False), _fills(condition, True))


class SunWindowTests(unittest.TestCase):
    """render._is_night_at, the pure half of the sun lookup."""

    def setUp(self):
        spec = importlib.util.spec_from_file_location(f"{PACKAGE}.render_probe", COMPONENT / "render.py")
        assert spec and spec.loader
        # render.py pulls in the whole rendering stack; only the two helpers are
        # needed here, so they are re-read rather than imported.
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        start = source.index("def _is_night_at(")
        end = source.index("\n\n\n", start)
        namespace: dict = {"datetime": datetime}
        exec(compile(source[start:end], "render._is_night_at", "exec"), namespace)
        self.is_night_at = namespace["_is_night_at"]

    def _at(self, hour: int, minute: int = 0) -> datetime:
        # A local wall-clock time: the window is a local time of day, and
        # _is_night_at compares against the moment's own local hour.
        return datetime(2026, 8, 24, hour, minute).astimezone()

    def test_an_ordinary_day_is_dark_after_sunset_and_before_sunrise(self):
        window = (20 * 60 + 30, 5 * 60 + 45)  # sunset 20:30, sunrise 05:45
        for hour, expected in ((12, False), (20, False), (21, True), (2, True), (5, True), (6, False)):
            with self.subTest(hour=hour):
                self.assertIs(self.is_night_at(self._at(hour), window), expected)

    def test_a_missing_sun_entity_means_daylight(self):
        self.assertFalse(self.is_night_at(self._at(3), None))

    def test_the_boundaries_belong_to_the_night(self):
        window = (20 * 60, 6 * 60)
        self.assertTrue(self.is_night_at(self._at(20, 0), window))
        self.assertFalse(self.is_night_at(self._at(6, 0), window))

    def test_a_polar_style_window_does_not_invert(self):
        # sunset after midnight, sunrise later the same morning: the dark
        # stretch is the ordinary between-the-two case, not the wrapped one.
        window = (1 * 60, 3 * 60)
        self.assertTrue(self.is_night_at(self._at(2), window))
        self.assertFalse(self.is_night_at(self._at(12), window))


if __name__ == "__main__":
    unittest.main()
