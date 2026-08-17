"""The Meteoradar camera draws the country shape and clips precipitation to it.

meteoradar.py splits into a pure half (Mercator projection, tile-bounds math,
compositing) and a network half (fetching RainViewer's frame index and tiles).
These tests exercise only the pure half, with synthetic tiles standing in for
real downloads, so they run without a network connection or Home Assistant
installed - the module only imports `homeassistant.helpers.aiohttp_client`
lazily, inside the functions that actually need it.
"""

from __future__ import annotations

import asyncio
import importlib.util
import math
from pathlib import Path
import sys
import types
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_meteoradar_test"


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


meteoradar = _load("meteoradar")


class MercatorProjectionTests(unittest.TestCase):
    def test_the_equator_and_prime_meridian_land_at_the_worlds_centre(self) -> None:
        x, y = meteoradar.mercator_pixel(0.0, 0.0, zoom=0, tile_size=256)
        self.assertAlmostEqual(x, 128.0)
        self.assertAlmostEqual(y, 128.0)

    def test_pixels_move_right_and_up_with_longitude_and_latitude(self) -> None:
        origin_x, origin_y = meteoradar.mercator_pixel(49.0, 15.0, zoom=6, tile_size=512)
        east_x, east_y = meteoradar.mercator_pixel(49.0, 16.0, zoom=6, tile_size=512)
        north_x, north_y = meteoradar.mercator_pixel(50.0, 15.0, zoom=6, tile_size=512)
        self.assertGreater(east_x, origin_x)
        self.assertAlmostEqual(east_y, origin_y)
        self.assertLess(north_y, origin_y)  # Mercator y grows southward
        self.assertAlmostEqual(north_x, origin_x)

    def test_extreme_latitude_is_clamped_instead_of_raising(self) -> None:
        # math.tan/log would blow up past the Mercator limit without the clamp.
        x, y = meteoradar.mercator_pixel(89.9, 0.0, zoom=4, tile_size=256)
        self.assertTrue(math.isfinite(x))
        self.assertTrue(math.isfinite(y))


class TileBoundsTests(unittest.TestCase):
    def test_covers_a_small_square_border_with_one_or_a_few_tiles(self) -> None:
        # A tiny bounding box near the equator at a coarse zoom must fit in a
        # single tile.
        square = ((10.0, 49.0), (10.1, 49.0), (10.1, 49.1), (10.0, 49.1), (10.0, 49.0))
        x_min, y_min, x_max, y_max = meteoradar.tile_bounds(square, zoom=2, tile_size=256)
        self.assertEqual((x_min, y_min), (x_max, y_max))

    def test_known_czech_republic_bounds_at_zoom_6(self) -> None:
        # Pinned against a live-verified reference: this exact (34, 21, 35, 22)
        # range was confirmed against real RainViewer tiles during development.
        self.assertEqual(
            meteoradar.tile_bounds(meteoradar.CZECH_BORDER, zoom=6, tile_size=512),
            (34, 21, 35, 22),
        )

    def test_neighboring_country_bounds_at_zoom_6(self) -> None:
        # Pinned the same way as the Czech border above, computed from the
        # geoBoundaries-sourced polygons: a regression here means a border was
        # accidentally corrupted or mis-simplified, not a RainViewer change.
        self.assertEqual(
            meteoradar.tile_bounds(meteoradar.SLOVAKIA_BORDER, zoom=6, tile_size=512),
            (34, 21, 36, 22),
        )
        self.assertEqual(
            meteoradar.tile_bounds(meteoradar.GERMANY_BORDER, zoom=6, tile_size=512),
            (33, 20, 34, 22),
        )
        self.assertEqual(
            meteoradar.tile_bounds(meteoradar.AUSTRIA_BORDER, zoom=6, tile_size=512),
            (33, 21, 35, 22),
        )
        self.assertEqual(
            meteoradar.tile_bounds(meteoradar.POLAND_BORDER, zoom=6, tile_size=512),
            (34, 20, 36, 21),
        )

    def test_europe_overview_bounds_cover_every_member_country(self) -> None:
        all_points = [
            point for _name, border in meteoradar.EUROPE_OVERVIEW_BORDERS for point in border
        ]
        self.assertEqual(
            meteoradar.tile_bounds(all_points, zoom=6, tile_size=512),
            (33, 20, 36, 22),
        )


class CountryBorderDataTests(unittest.TestCase):
    def test_every_border_is_a_closed_ring_with_real_shape(self) -> None:
        for name, border in meteoradar.COUNTRY_BORDERS.items():
            with self.subTest(country=name):
                self.assertEqual(border[0], border[-1])
                self.assertGreater(len(border), 20)

    def test_europe_overview_lists_every_country_border_once(self) -> None:
        names = [name for name, _border in meteoradar.EUROPE_OVERVIEW_BORDERS]
        self.assertEqual(sorted(names), sorted(meteoradar.COUNTRY_BORDERS.keys()))
        for name, border in meteoradar.EUROPE_OVERVIEW_BORDERS:
            with self.subTest(country=name):
                self.assertIs(border, meteoradar.COUNTRY_BORDERS[name])


def _uniform_tile(size: int, rgba: tuple[int, int, int, int]) -> Image.Image:
    return Image.new("RGBA", (size, size), rgba)


class ComposeCountryRadarImageTests(unittest.TestCase):
    """A small synthetic border and grid, independent of the real Czech outline."""

    # A diamond "country": its bounding-box corners fall outside the shape, so
    # clipping can be told apart from a plain bbox crop. Near the equator, a
    # *square* in lon/lat is almost a perfect rectangle after Mercator
    # projection, which is too forgiving a shape for this test.
    DIAMOND_BORDER = ((0.0, -10.0), (10.0, 0.0), (0.0, 10.0), (-10.0, 0.0), (0.0, -10.0))
    ZOOM = 3
    TILE_SIZE = 200

    @classmethod
    def setUpClass(cls) -> None:
        # Real code always derives the tile grid from tile_bounds() rather than
        # guessing coordinates, so these tests do the same instead of risking a
        # grid that does not actually contain the projected polygon.
        cls.x_min, cls.y_min, cls.x_max, cls.y_max = meteoradar.tile_bounds(
            cls.DIAMOND_BORDER, zoom=cls.ZOOM, tile_size=cls.TILE_SIZE
        )

    def _grid(self, rgba: tuple[int, int, int, int]) -> dict[tuple[int, int], Image.Image]:
        return {
            (x, y): _uniform_tile(self.TILE_SIZE, rgba)
            for x in range(self.x_min, self.x_max + 1)
            for y in range(self.y_min, self.y_max + 1)
        }

    def _compose(self, rgba: tuple[int, int, int, int], **kwargs) -> Image.Image:
        return meteoradar.compose_country_radar_image(
            self._grid(rgba),
            zoom=self.ZOOM, tile_size=self.TILE_SIZE,
            x_min=self.x_min, y_min=self.y_min, x_max=self.x_max, y_max=self.y_max,
            border=self.DIAMOND_BORDER, margin=0,
            **kwargs,
        )

    def test_precipitation_is_clipped_to_the_country_shape(self) -> None:
        # An opaque grid everywhere: without clipping, red would fill the frame.
        image = self._compose((220, 20, 12, 255))
        corners = [
            image.getpixel((0, 0)),
            image.getpixel((image.width - 1, 0)),
            image.getpixel((0, image.height - 1)),
            image.getpixel((image.width - 1, image.height - 1)),
        ]
        # The crop is tight to the polygon's bbox, so every corner sits outside
        # the diamond and must stay white, not red.
        self.assertTrue(all(corner == (255, 255, 255) for corner in corners), corners)
        self.assertEqual(image.getpixel((image.width // 2, image.height // 2)), meteoradar.PRECIPITATION_COLOR)

    def test_low_alpha_trace_echo_does_not_count_as_precipitation(self) -> None:
        image = self._compose((0, 100, 200, 40))  # below the default threshold
        self.assertNotIn(meteoradar.PRECIPITATION_COLOR, list(image.getdata()))

    def test_high_alpha_precipitation_is_drawn_in_the_display_red(self) -> None:
        image = self._compose((220, 20, 12, 255))
        self.assertIn(meteoradar.PRECIPITATION_COLOR, list(image.getdata()))

    def test_a_missing_tile_is_treated_as_transparent_not_an_error(self) -> None:
        grid = self._grid((0, 100, 200, 255))
        grid.pop(next(iter(grid)))  # a partial fetch must still produce an image
        image = meteoradar.compose_country_radar_image(
            grid, zoom=self.ZOOM, tile_size=self.TILE_SIZE,
            x_min=self.x_min, y_min=self.y_min, x_max=self.x_max, y_max=self.y_max,
            border=self.DIAMOND_BORDER, margin=0,
        )
        self.assertGreater(image.width, 0)
        self.assertGreater(image.height, 0)

    def test_the_country_outline_is_drawn_in_black(self) -> None:
        image = self._compose((0, 0, 0, 0), border_width=4)  # no precipitation at all
        self.assertIn(meteoradar.BORDER_COLOR, list(image.getdata()))

    def test_output_is_a_flat_rgb_image_safe_for_the_eink_palette(self) -> None:
        image = self._compose((220, 20, 12, 255))
        self.assertEqual(image.mode, "RGB")
        colors = set(list(image.getdata()))
        self.assertTrue(colors <= {(255, 255, 255), meteoradar.PRECIPITATION_COLOR, meteoradar.BORDER_COLOR})

    def test_light_precipitation_renders_solid_yellow(self) -> None:
        # Light rain reads as its own intensity by colour alone - a sparse
        # dot pattern on white used to fade into pale noise once a zoom-6 map
        # was reduced to a small display (see _generate_precipitation_
        # checkerboard's docstring), and implied "barely raining" for a pixel
        # the mask had already decided was raining. Flat yellow, no white.
        image = self._compose((0, 100, 200, 80))
        cx, cy = image.width // 2, image.height // 2
        patch = [image.getpixel((x, y)) for y in range(cy - 15, cy + 16) for x in range(cx - 15, cx + 16)]
        self.assertTrue(all(pixel == meteoradar.PRECIPITATION_YELLOW for pixel in patch), set(patch))

    def test_moderate_precipitation_mixes_yellow_and_red(self) -> None:
        image = self._compose((0, 100, 200, 220))
        colors = set(image.getdata())
        self.assertIn(meteoradar.PRECIPITATION_YELLOW, colors)
        self.assertIn(meteoradar.PRECIPITATION_COLOR, colors)

    def test_moderate_precipitation_uses_a_checkerboard_not_a_hatch(self) -> None:
        # Axis-aligned square blocks, not diagonal lines: a diagonal stroke
        # draws thin at any one point along its own length, which is exactly
        # what let the old dotted "light rain" pattern fade to noise on
        # downscale. Sampling along one fixed row should see genuine runs of
        # each colour (a block width), not an alternating diagonal streak.
        moderate = self._compose((0, 100, 200, 220))
        cx, cy = moderate.width // 2, moderate.height // 2
        row = [moderate.getpixel((x, cy)) for x in range(cx - 30, cx + 31)]
        longest_run = 1
        current_run = 1
        for previous, pixel in zip(row, row[1:]):
            current_run = current_run + 1 if pixel == previous else 1
            longest_run = max(longest_run, current_run)
        self.assertGreater(longest_run, 2)

    def test_moderate_precipitation_has_more_red_than_light_rain(self) -> None:
        light = self._compose((0, 100, 200, 80))
        moderate = self._compose((0, 100, 200, 220))
        cx, cy = light.width // 2, light.height // 2
        area = [(x, y) for y in range(cy - 25, cy + 26) for x in range(cx - 25, cx + 26)]
        light_red = sum(light.getpixel(point) == meteoradar.PRECIPITATION_COLOR for point in area)
        moderate_red = sum(moderate.getpixel(point) == meteoradar.PRECIPITATION_COLOR for point in area)
        self.assertGreater(moderate_red, light_red)
        self.assertLess(moderate_red, len(area))

    def test_wind_arrows_are_bold_and_clipped_to_the_country(self) -> None:
        plain = self._compose((0, 0, 0, 0), show_wind=False)
        windy = self._compose(
            (0, 0, 0, 0),
            show_wind=True,
            wind_samples=((0.0, 0.0, 270.0, 25.0),),
        )
        plain_black = sum(pixel == meteoradar.BORDER_COLOR for pixel in plain.getdata())
        windy_black = sum(pixel == meteoradar.BORDER_COLOR for pixel in windy.getdata())
        self.assertGreater(windy_black, plain_black)
        self.assertEqual(windy.getpixel((0, 0)), (255, 255, 255))
        self.assertEqual(windy.getpixel((windy.width - 1, 0)), (255, 255, 255))

    def test_no_fake_arrows_are_drawn_without_live_wind_samples(self) -> None:
        plain = self._compose((0, 0, 0, 0), show_wind=False)
        unavailable = self._compose((0, 0, 0, 0), show_wind=True)
        self.assertEqual(list(unavailable.getdata()), list(plain.getdata()))

    def test_home_location_draws_a_small_eink_safe_dot_marker(self) -> None:
        plain = self._compose((0, 0, 0, 0))
        marked = self._compose((0, 0, 0, 0), home_location=(0.0, 0.0))
        self.assertGreater(
            sum(pixel == meteoradar.PRECIPITATION_COLOR for pixel in marked.getdata()),
            sum(pixel == meteoradar.PRECIPITATION_COLOR for pixel in plain.getdata()),
        )
        self.assertTrue(set(marked.getdata()) <= {
            (255, 255, 255), meteoradar.PRECIPITATION_COLOR, meteoradar.BORDER_COLOR,
        })

    def test_home_marker_is_sourced_from_ha_own_configured_location(self) -> None:
        # No address field any more - the dot always comes straight from
        # Home Assistant's own configured home location, not a geocoded
        # user-entered address (there is no network call to make it wait on).
        source = (COMPONENT / "meteoradar.py").read_text(encoding="utf-8")
        self.assertIn("home_location = (hass.config.longitude, hass.config.latitude)", source)
        self.assertNotIn("location_address", source)
        self.assertNotIn("NOMINATIM", source)
        self.assertNotIn("geocod", source.lower())

    def test_no_text_badge_is_baked_into_the_radar_image(self) -> None:
        source = (COMPONENT / "meteoradar.py").read_text(encoding="utf-8")
        self.assertNotIn("draw_corner_badge", source)
        self.assertNotIn("CORNER_BADGE_", source)


class ComposeMultiCountryRadarImageTests(unittest.TestCase):
    """Two well-separated synthetic "countries" stand in for the Europe overview."""

    COUNTRY_A = ("a", ((-5.0, -5.0), (0.0, -5.0), (0.0, 5.0), (-5.0, 5.0), (-5.0, -5.0)))
    COUNTRY_B = ("b", ((15.0, -5.0), (20.0, -5.0), (20.0, 5.0), (15.0, 5.0), (15.0, -5.0)))
    BORDERS = (COUNTRY_A, COUNTRY_B)
    ZOOM = 3
    TILE_SIZE = 200

    @classmethod
    def setUpClass(cls) -> None:
        all_points = [point for _name, border in cls.BORDERS for point in border]
        cls.x_min, cls.y_min, cls.x_max, cls.y_max = meteoradar.tile_bounds(
            all_points, zoom=cls.ZOOM, tile_size=cls.TILE_SIZE
        )

    def _grid(self, rgba: tuple[int, int, int, int]) -> dict[tuple[int, int], Image.Image]:
        return {
            (x, y): _uniform_tile(self.TILE_SIZE, rgba)
            for x in range(self.x_min, self.x_max + 1)
            for y in range(self.y_min, self.y_max + 1)
        }

    def _compose(self, rgba: tuple[int, int, int, int], **kwargs) -> Image.Image:
        return meteoradar.compose_multi_country_radar_image(
            self._grid(rgba),
            zoom=self.ZOOM, tile_size=self.TILE_SIZE,
            x_min=self.x_min, y_min=self.y_min, x_max=self.x_max, y_max=self.y_max,
            borders=self.BORDERS, margin=0,
            **kwargs,
        )

    def test_precipitation_is_clipped_to_the_union_of_both_countries(self) -> None:
        # An opaque grid everywhere: without per-country clipping, red would
        # fill the whole crop, including the gap between the two rectangles.
        image = self._compose((220, 20, 12, 255))
        width, height = image.size
        mid_y = height // 2
        left_country_x = width // 8
        gap_x = width // 2
        right_country_x = width - width // 8

        self.assertEqual(image.getpixel((left_country_x, mid_y)), meteoradar.PRECIPITATION_COLOR)
        self.assertEqual(image.getpixel((right_country_x, mid_y)), meteoradar.PRECIPITATION_COLOR)
        self.assertEqual(image.getpixel((gap_x, mid_y)), (255, 255, 255))

    def test_each_country_outline_is_drawn(self) -> None:
        image = self._compose((0, 0, 0, 0), border_width=3)  # no precipitation at all
        self.assertIn(meteoradar.BORDER_COLOR, list(image.getdata()))

    def test_output_is_a_flat_rgb_image_safe_for_the_eink_palette(self) -> None:
        image = self._compose((220, 20, 12, 255))
        self.assertEqual(image.mode, "RGB")
        colors = set(list(image.getdata()))
        self.assertTrue(colors <= {(255, 255, 255), meteoradar.PRECIPITATION_COLOR, meteoradar.BORDER_COLOR})


class FitToSizeTests(unittest.TestCase):
    def test_output_is_exactly_the_requested_size(self) -> None:
        source = Image.new("RGB", (300, 100), meteoradar.PRECIPITATION_COLOR)
        fitted = meteoradar.fit_to_size(source, 120, 120)
        self.assertEqual(fitted.size, (120, 120))

    def test_aspect_ratio_is_preserved_with_white_padding(self) -> None:
        source = Image.new("RGB", (400, 100), meteoradar.PRECIPITATION_COLOR)
        fitted = meteoradar.fit_to_size(source, 100, 100)
        # A 4:1 source fit into a square must leave white bars top and bottom.
        self.assertEqual(fitted.getpixel((50, 0)), (255, 255, 255))
        self.assertEqual(fitted.getpixel((50, 99)), (255, 255, 255))


class CurrentWindTests(unittest.TestCase):
    def test_westerly_wind_points_east(self) -> None:
        dx, dy = meteoradar.wind_flow_vector(270.0, 20.0)
        self.assertAlmostEqual(dx, 20.0)
        self.assertAlmostEqual(dy, 0.0)

    def test_northerly_wind_points_south_on_the_image(self) -> None:
        dx, dy = meteoradar.wind_flow_vector(0.0, 20.0)
        self.assertAlmostEqual(dx, 0.0)
        self.assertAlmostEqual(dy, 20.0)

    def test_current_wind_samples_are_read_from_open_meteo(self) -> None:
        payloads = [
            {
                "current": {
                    "time": "2026-08-11T12:00",
                    "wind_speed_10m": 18.5 + index,
                    "wind_direction_10m": 270 + index,
                }
            }
            for index in range(len(meteoradar.COUNTRY_WIND_POINTS["cz"]))
        ]
        requested_urls: list[str] = []

        async def fake_fetch(_hass, url: str):
            requested_urls.append(url)
            return payloads

        original_fetch = meteoradar._async_fetch_json
        meteoradar._wind_cache.clear()
        meteoradar._async_fetch_json = fake_fetch
        try:
            samples, observation_key = asyncio.run(
                meteoradar._async_current_wind_samples(object(), "cz")
            )
        finally:
            meteoradar._async_fetch_json = original_fetch
            meteoradar._wind_cache.clear()

        first_latitude, first_longitude = meteoradar.COUNTRY_WIND_POINTS["cz"][0]
        self.assertEqual(samples[0], (first_longitude, first_latitude, 270.0, 18.5))
        self.assertEqual(len(samples), len(payloads))
        self.assertIn("2026-08-11T12:00", observation_key)
        self.assertIn("current=wind_speed_10m,wind_direction_10m", requested_urls[0])
        self.assertIn("wind_speed_unit=kmh", requested_urls[0])


class CameraPlatformWiringTests(unittest.TestCase):
    """HA camera entities can't run without Home Assistant installed, so this
    pins the source wiring instead - a genuine behavioural test would need a
    live HA core to instantiate config entries and the entity platform.
    """

    def test_camera_platform_is_forwarded_from_setup_entry(self) -> None:
        init_source = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        self.assertIn("PLATFORMS: list[Platform] = [Platform.CAMERA]", init_source)
        self.assertIn("await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)", init_source)
        self.assertIn("await hass.config_entries.async_unload_platforms(entry, PLATFORMS)", init_source)

    def test_camera_entity_renders_through_meteoradar(self) -> None:
        camera_source = (COMPONENT / "camera.py").read_text(encoding="utf-8")
        self.assertIn("class DratekMeteoradarCamera(Camera):", camera_source)
        self.assertIn("from .meteoradar import async_render_meteoradar", camera_source)
        self.assertIn("async def async_camera_image(", camera_source)
        self.assertIn("image = await async_render_meteoradar(self.hass)", camera_source)


if __name__ == "__main__":
    unittest.main()
