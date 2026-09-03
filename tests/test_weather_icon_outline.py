"""A weather glyph's outline is a constant width in pixels, not a fraction.

The outline exists so a dithered fill does not dissolve into the white around
it, so it is wanted at every size - but it used to be given in viewBox units.
1.5 units on a 17-unit canvas is about 9% of the width, so the rim scaled with
the glyph: a large icon came out with a four-pixel black border that swallowed
the drawing inside it. The parts also carried three different weights, so the
outer cloud was rimmed more heavily than the inner one and the two read as
separate drawings.

The opposite mistake is just as visible. Everything here is dithered to pure
black and white, and a stroke under about two pixels rasterises mostly to
antialiased grey, which error diffusion breaks into a dotted line - a thin
outline does not read as thin, it reads as broken.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _load(module: str):
    package = types.ModuleType("dratek_weather_icon_test")
    package.__path__ = [str(COMPONENT)]
    sys.modules.setdefault(package.__name__, package)
    spec = importlib.util.spec_from_file_location(
        f"{package.__name__}.{module}", COMPONENT / f"{module}.py"
    )
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


svg_blocks = _load("svg_blocks")


class WeatherIconOutlineTests(unittest.TestCase):
    def test_the_rendered_outline_is_the_same_width_at_every_size(self) -> None:
        widths = {
            size: svg_blocks._weather_outline_units(size) * size / 17.0
            for size in (22, 30, 40, 56, 72)
        }
        for size, rendered in widths.items():
            with self.subTest(size=size):
                self.assertAlmostEqual(svg_blocks._WEATHER_OUTLINE_PX, rendered, delta=0.35)

    def test_the_outline_never_thins_into_a_dotted_line(self) -> None:
        # Below ~2 px the stroke rasterises to grey and the dither turns it
        # into dashes, which looks like a broken drawing rather than a fine one.
        for size in (16, 22, 34, 56, 96):
            with self.subTest(size=size):
                rendered = svg_blocks._weather_outline_units(size) * size / 17.0
                self.assertGreaterEqual(rendered, 1.6)

    def test_every_part_of_one_glyph_shares_the_outline_weight(self) -> None:
        for condition in ("partlycloudy", "rainy", "snowy", "lightning"):
            with self.subTest(condition=condition):
                weights = {w for _d, _fill, w in svg_blocks._weather_condition_parts(condition, False)}
                # Body shapes at 1.0, small details slightly finer - not the
                # old 1.5 / 1.1 / 0.85 spread across one drawing.
                self.assertLessEqual(weights, {1.0, 0.7})

    def test_small_glyphs_drop_the_halftone_for_line_art(self) -> None:
        small = svg_blocks._weather_icon_svg_source("cloudy", False, 20)
        large = svg_blocks._weather_icon_svg_source("cloudy", False, 48)
        self.assertNotIn(svg_blocks.WEATHER_CLOUD_BACK_COLOR, small)
        self.assertIn(svg_blocks.WEATHER_CLOUD_BACK_COLOR, large)


if __name__ == "__main__":
    unittest.main()
