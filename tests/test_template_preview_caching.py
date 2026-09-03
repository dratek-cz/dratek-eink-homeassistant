"""A catalog thumbnail must not be cached while its content is still loading.

_templateSvgThumbnail memoises the markup it produces so scrolling the
catalog does not re-lay-out every tile. Anything a tile draws asynchronously
therefore has to be excluded from that cache until it has actually arrived,
or the tile is frozen forever on whatever placeholder the first pass drew.

This has now bitten twice - first the weather icons, then the Meteoradar
map, which is fetched over a websocket and starts out as a "Načítám
radarovou mapu…" placeholder - so the guard is pinned here.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIXIN = (
    ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
    / "panel-template-svg.mixin.js"
)


class TemplateThumbnailCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = MIXIN.read_text(encoding="utf-8")
        match = re.search(
            r"_templateSvgThumbnail\(template, width, height\) \{(.*?)\n  \},",
            self.source,
            re.S,
        )
        self.assertIsNotNone(match, "_templateSvgThumbnail not found")
        self.body = match.group(1)

    def test_thumbnail_is_not_cached_while_the_radar_is_still_loading(self) -> None:
        # "Is a frame in hand" is now asked for this display's own country and
        # geometry - _meteoradarFrameReady - rather than "does the panel hold
        # any frame at all", which a frame fetched for a different display
        # satisfied.
        self.assertIn(
            "!(this._templateNeedsRadarImage(rows) && !this._meteoradarFrameReady(width, height))",
            self.body,
        )

    def test_the_thumbnail_key_is_scoped_to_the_open_display(self) -> None:
        # Two displays showing the same template at the same size draw
        # different tiles as soon as their per-display settings differ, so the
        # memo key has to carry those settings.
        self.assertIn("this._perDisplayTemplateFingerprint()", self.body)
        self.assertIn("_perDisplayTemplateFingerprint() {", self.source)
        fingerprint = self.source.split("_perDisplayTemplateFingerprint() {")[1]
        fingerprint = fingerprint.split("\n  },")[0]
        for part in (
            "this._selectedDeviceAddress",
            "this._displayTemplateConfig",
            "this._displayTemplateOptions",
            "this._displayTemplateBindings",
        ):
            self.assertIn(part, fingerprint, f"{part} must be part of the tile key")

    def test_the_existing_async_guards_are_still_in_place(self) -> None:
        # The radar guard is one of a family - losing either of the others
        # brings back the same class of frozen tile.
        self.assertIn("ICON_GEOMETRY.has(name)", self.body)
        self.assertIn("this._templateAllWeatherIconsResolved !== false", self.body)

    def test_every_async_guard_gates_the_same_single_cache_write(self) -> None:
        # All guards must sit on the one `if` that writes the cache; a guard
        # placed anywhere else would not actually prevent memoising.
        writes = self.body.count("_templateThumbnailMarkupCache.set(")
        self.assertEqual(writes, 1, "the thumbnail cache must have exactly one write site")
        condition = self.body.split("_templateThumbnailMarkupCache.set(")[0]
        for guard in (
            "ICON_GEOMETRY.has(name)",
            "_templateAllWeatherIconsResolved !== false",
            "_templateNeedsRadarImage(rows)",
        ):
            self.assertIn(guard, condition, f"{guard} must gate the cache write")

    def test_the_preview_requests_the_radar_so_a_repaint_follows(self) -> None:
        # Without the request nothing would ever fetch the map, and the tile
        # would stay on the placeholder even with the cache guard in place.
        self.assertIn("_requestTemplateRadarImage(rows, width, height)", self.source)
        self.assertIn("_scheduleTemplateIconRepaint()", self.source)


if __name__ == "__main__":
    unittest.main()
