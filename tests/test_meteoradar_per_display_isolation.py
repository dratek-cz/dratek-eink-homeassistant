"""A radar frame fetched for one display must never be drawn on another.

The Meteoradar country is a per-display setting: display A can be set to
Czechia and display B to the Central Europe overview, and each sends its own.
The panel's *preview*, though, used to keep exactly one rendered frame for the
whole session - `_meteoradarImageCache` was a single slot - and `_blockRadarMap`
drew whatever sat in it without checking who it had been fetched for.

So: set A to Czechia, set B to Europe, go back to A. A's refetch is a websocket
round trip to a real RainViewer render, and for its whole duration every
repaint of A drew B's Europe map, while a manual send - which awaits its own
fetch through `_preloadTemplateRadarImage` - still put Czechia on the panel.
The catalog tile was worse: `_templateSvgThumbnail` memoised its markup under a
key of template id, size and palette only, so once a tile had been drawn with
one country it stayed on that country for every display of that size until the
page was reloaded.

Both are pinned here as source assertions - Node is not available, so the panel
JS cannot be executed by the suite (see the module docstring in
test_template_preview_caching.py for the same constraint).
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
SVG_MIXIN = PANEL / "panel-template-svg.mixin.js"
DEVICES_MIXIN = PANEL / "panel-devices.mixin.js"


def _method_body(source: str, signature: str) -> str:
    """The text of one mixin method, from its signature to its closing `},`."""
    start = source.index(signature)
    end = source.index("\n  },", start)
    return source[start:end]


class MeteoradarCacheIsolationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.svg = SVG_MIXIN.read_text(encoding="utf-8")
        self.devices = DEVICES_MIXIN.read_text(encoding="utf-8")

    def test_the_cache_key_carries_the_per_display_settings(self) -> None:
        spec = _method_body(self.svg, "_meteoradarRequestSpec(width, height) {")
        # Geometry alone is not enough: two displays of the same size set to
        # different countries would collide on it.
        self.assertIn("_activeMeteoradarCountry()", spec)
        self.assertIn("meteoradar_show_precipitation", spec)
        self.assertIn("meteoradar_show_wind", spec)
        self.assertIn("const key =", spec)
        self.assertIn("${country}", spec)

    def test_frames_are_stored_per_key_not_in_a_single_slot(self) -> None:
        self.assertIn("_meteoradarCacheEntry(key) {", self.svg)
        self.assertIn("this._meteoradarImageCache instanceof Map", self.svg)
        self.assertIn("_rememberMeteoradarFrame(key, entry) {", self.svg)
        # A bounded store, like every other cache in the panel.
        self.assertIn("METEORADAR_CACHE_ENTRIES", self.svg)
        self.assertRegex(
            self.svg, r"const METEORADAR_CACHE_ENTRIES = \d+;"
        )

    def test_every_write_goes_through_the_keyed_store(self) -> None:
        # A stray `this._meteoradarImageCache = {...}` would silently restore
        # the single-slot behaviour this test exists to prevent.
        assigned = [
            value.strip()
            for value in re.findall(
                r"this\._meteoradarImageCache\s*=\s*([^;]+);", self.svg
            )
        ]
        self.assertEqual(
            [value for value in assigned if value != "new Map()"],
            [],
            "radar frames must be stored with _rememberMeteoradarFrame, not by "
            "replacing the whole cache",
        )

    def test_the_block_draws_only_a_frame_fetched_for_this_render(self) -> None:
        block = _method_body(self.svg, "_blockRadarMap(row, box) {")
        self.assertIn("this._meteoradarRequestSpec(w, box.h)", block)
        self.assertIn("this._meteoradarCacheEntry(spec.key)", block)
        # And on a miss it must fall through to the placeholder rather than
        # drawing anything else.
        self.assertIn("Načítám radarovou mapu…", block)

    def test_the_ensure_path_reads_the_same_key(self) -> None:
        ensure = _method_body(self.svg, "async _ensureTemplateRadarImage(width, height) {")
        self.assertIn("this._meteoradarRequestSpec(width, height)", ensure)
        self.assertIn("this._meteoradarCacheEntry(key)", ensure)


class MeteoradarCountrySourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = DEVICES_MIXIN.read_text(encoding="utf-8")
        self.svg = SVG_MIXIN.read_text(encoding="utf-8")

    def test_the_country_has_exactly_one_reader(self) -> None:
        self.assertIn("_activeMeteoradarCountry() {", self.devices)
        body = _method_body(self.devices, "_activeMeteoradarCountry() {")
        # The draft-backed config is the authority; the bare field is only a
        # mirror, and reading it first let the previously opened display's
        # value win over the config just loaded for this one.
        self.assertLess(
            body.index("_displayTemplateConfig?.meteoradar_country"),
            body.index("this._meteoradarCountry"),
            "the per-display config must be read before the mirrored field",
        )

    def test_nothing_reads_the_mirrored_field_first_any_more(self) -> None:
        stale = 'this._meteoradarCountry || this._displayTemplateConfig?.meteoradar_country'
        for name, source in (("devices", self.devices), ("template-svg", self.svg)):
            self.assertNotIn(stale, source, f"{name} still prefers the mirrored field")


class DraftWritesStayOnTheOpenDisplayTests(unittest.TestCase):
    """The mechanism behind "changing one display changed another".

    `_device()` answers "whose palette and size is this drawing pass using" -
    it prefers `_renderingDeviceAddress`, the render scope. Those scopes belong
    to async renderers, and two repaints of the same display can be inside one
    at the same time; a scope that saved the previous value and restored it in
    a `finally` then left the address pinned once the runs interleaved. Every
    later `_device()` answered for a display nobody had open, and
    `_saveCurrentDeviceDraft` - which resolved its target through `_device()` -
    wrote the open display's settings under that other display's address.
    """

    def setUp(self) -> None:
        self.devices = DEVICES_MIXIN.read_text(encoding="utf-8")
        self.projects = (PANEL / "panel-projects.mixin.js").read_text(encoding="utf-8")
        self.storage = (PANEL / "panel-storage.mixin.js").read_text(encoding="utf-8")
        self.brand_logo = (PANEL / "panel-brand-logo.mixin.js").read_text(encoding="utf-8")

    def test_there_is_a_reader_that_ignores_the_render_scope(self) -> None:
        body = _method_body(self.devices, "_selectedDevice() {")
        self.assertIn("this._selectedDeviceAddress", body)
        self.assertNotIn("_renderingDeviceAddress", body)

    def test_persistence_resolves_the_open_display(self) -> None:
        for source, signature in (
            (self.projects, "_projectPayload(device = "),
            (self.devices, "_displayTemplateDraftPayload(device = "),
            (self.storage, "_emptyDeviceDraft(device = "),
        ):
            line = source[source.index(signature):].split("\n")[0]
            self.assertIn("this._selectedDevice()", line)

        for signature in ("_scheduleDraftSave() {", "async _saveCurrentDeviceDraft() {"):
            body = _method_body(self.projects, signature)
            self.assertIn("this._selectedDevice()", body)
            self.assertNotIn("this._device()", body)

    def test_opening_a_display_reads_the_display_that_was_clicked(self) -> None:
        # Opening a display is not a drawing pass. Reading _device() here took
        # the orientation from whatever render scope was open - a device card's
        # preview, for one - rather than from the display the user clicked.
        inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        body = _method_body(inspector, "async _openDisplaySettings(address) {")
        self.assertIn("const openedDevice = this._selectedDevice();", body)
        self.assertNotIn("this._device()", body)

    def test_a_draft_can_only_be_written_under_its_own_address(self) -> None:
        body = _method_body(self.projects, "_queueDeviceDraftSave(device, payload")
        self.assertIn("this._loadedDraftAddress", body)
        self.assertIn("address !== loaded", body)
        self.assertLess(
            body.index("address !== loaded"),
            body.index("dratek_eink/device_drafts/save"),
            "the guard must run before the write, not after it",
        )

    def test_render_scopes_unwind_however_they_interleave(self) -> None:
        push = _method_body(self.devices, "_pushRenderingDevice(address) {")
        pop = _method_body(self.devices, "_popRenderingDevice(token) {")
        self.assertIn("_renderingDeviceStack", push)
        # Removed by identity, not by position: an overlapping run's token can
        # sit anywhere in the stack by the time this one exits.
        self.assertIn("stack.lastIndexOf(token)", pop)
        self.assertIn("stack.splice(index, 1)", pop)
        # And the address always falls back to whatever scope is still open.
        self.assertIn("stack.length ? stack[stack.length - 1].address : null", pop)

    def test_no_scope_saves_and_restores_the_address_by_hand(self) -> None:
        for name, source in (
            ("devices", self.devices),
            ("brand-logo", self.brand_logo),
        ):
            writes = [
                line.strip()
                for line in source.splitlines()
                if "this._renderingDeviceAddress =" in line
            ]
            allowed = {
                "this._renderingDeviceAddress = token.address;",
                "this._renderingDeviceAddress = stack.length ? stack[stack.length - 1].address : null;",
            }
            self.assertEqual(
                [write for write in writes if write not in allowed],
                [],
                f"{name} must scope the rendering device through push/pop",
            )

if __name__ == "__main__":
    unittest.main()
