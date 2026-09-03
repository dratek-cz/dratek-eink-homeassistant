"""The made-up radar field exists for product photos and must stay switched off.

A shelf of displays has to be photographed showing rain on a dry day, so
`DEMO_PRECIPITATION` composes the Czech map from an invented precipitation
field instead of RainViewer's. That is a demo build, not a feature: a display
quietly showing weather that is not happening is worse than a display showing
no radar at all. This module is the tripwire that keeps the flag from reaching
a public release by accident.

The one test that is allowed to turn it on does so explicitly and puts it back.
"""

from __future__ import annotations

import ast
import importlib.util
import pathlib
import sys
import types
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_demo_precip"


def _load_meteoradar():
    if f"{PACKAGE}.meteoradar" in sys.modules:
        return sys.modules[f"{PACKAGE}.meteoradar"]
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package
    for name in ("const", "meteoradar"):
        spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", COMPONENT / f"{name}.py")
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{PACKAGE}.meteoradar"]


meteoradar = _load_meteoradar()


class DemoFlagTests(unittest.TestCase):
    def test_a_demo_build_says_so_in_the_changelog(self) -> None:
        """The flag and the release notes must agree.

        Asserting the flag is simply False would go red for the one build that
        is meant to have it on, and a red suite on a deliberate demo build
        teaches everyone to ignore this test. Tying it to the changelog keeps
        both builds green while still catching the case that actually matters:
        the flag left on by accident in a release whose notes describe ordinary
        behaviour.
        """
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        latest = changelog.split("## [", 2)[1]
        declared = "DEMO BUILD" in latest
        self.assertEqual(
            meteoradar.DEMO_PRECIPITATION,
            declared,
            "DEMO_PRECIPITATION is on but the newest changelog entry is not marked "
            "DEMO BUILD (or the other way round)",
        )

    def test_the_flag_is_a_literal_not_a_setting(self) -> None:
        # Read from the source, not the module: a constant a user could flip
        # from the UI is exactly what this must not become.
        tree = ast.parse((COMPONENT / "meteoradar.py").read_text(encoding="utf-8"))
        assignment = next(
            node
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(t, ast.Name) and t.id == "DEMO_PRECIPITATION" for t in node.targets)
        )
        self.assertIsInstance(assignment.value, ast.Constant)
        self.assertIn("MUST BE False IN EVERY PUBLIC RELEASE", (COMPONENT / "meteoradar.py").read_text(encoding="utf-8"))

    def test_the_demo_never_touches_the_europe_overview_or_other_countries(self) -> None:
        source = (COMPONENT / "meteoradar.py").read_text(encoding="utf-8")
        self.assertIn(
            "demo = DEMO_PRECIPITATION and not is_europe and country_key == DEMO_PRECIPITATION_COUNTRY",
            source,
        )


class DemoFieldTests(unittest.TestCase):
    """The field itself still has to be a plausible radar picture."""

    ZOOM = meteoradar.ZOOM
    TILE = 128  # small tiles keep the test quick; the shape is scale-free

    def test_the_field_is_patchy_rather_than_a_slab(self) -> None:
        x_min, y_min, x_max, y_max = meteoradar.tile_bounds(
            meteoradar.CZECH_BORDER, zoom=self.ZOOM, tile_size=self.TILE
        )
        tiles = meteoradar.demo_precipitation_tiles(x_min, y_min, x_max, y_max, self.TILE)
        self.assertEqual(
            len(tiles), (x_max - x_min + 1) * (y_max - y_min + 1), "every tile in the grid"
        )
        wet = total = 0
        for tile in tiles.values():
            for _r, _g, _b, alpha in tile.convert("RGBA").getdata():
                total += 1
                if alpha:
                    wet += 1
        coverage = wet / max(1, total)
        # Enough rain to photograph, far from wall-to-wall - a map where
        # everything is raining reads as a broken render, not as weather.
        self.assertGreater(coverage, 0.05)
        self.assertLess(coverage, 0.60)

    def test_the_colours_are_rainviewers_ramp(self) -> None:
        # _paint_precipitation reads alpha and the red/green growth within that
        # ramp to pick its pigment, so a field coloured any other way would
        # dither unlike the real thing.
        weak = meteoradar._demo_rainviewer_colour(0.05)
        strong = meteoradar._demo_rainviewer_colour(0.95)
        self.assertLess(weak[0], strong[0], "stronger echo is redder")
        self.assertLess(weak[3], strong[3], "stronger echo is more opaque")
        self.assertLessEqual(strong[3], 255)

    def test_it_composes_through_the_real_renderer(self) -> None:
        x_min, y_min, x_max, y_max = meteoradar.tile_bounds(
            meteoradar.CZECH_BORDER, zoom=self.ZOOM, tile_size=self.TILE
        )
        image = meteoradar.compose_country_radar_image(
            meteoradar.demo_precipitation_tiles(x_min, y_min, x_max, y_max, self.TILE),
            zoom=self.ZOOM,
            tile_size=self.TILE,
            x_min=x_min,
            y_min=y_min,
            x_max=x_max,
            y_max=y_max,
            border=meteoradar.CZECH_BORDER,
            preserve_yellow=False,
        )
        colours = {pixel for pixel in image.convert("RGB").getdata()}
        # The panel's three inks and nothing else, and precipitation actually
        # present rather than an empty country outline.
        self.assertLessEqual(len(colours), 3)
        self.assertIn(meteoradar.PRECIPITATION_COLOR, colours)
        self.assertIn(meteoradar.BORDER_COLOR, colours)


if __name__ == "__main__":
    unittest.main()
