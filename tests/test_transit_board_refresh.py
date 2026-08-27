"""The departures template has to keep its stop, and keep its board current.

Three separate failures shared one symptom - "the departures template doesn't
work" - and each needs its own pin:

1. The chosen stop was persisted only *after* the live board had been fetched,
   so every failure of the public timetable server threw the user's choice away
   with the preview, and the picker came back empty on the next open.
2. The board itself lived only in `_transitPreview`, written the one time the
   stop was picked. Nothing rebuilt it, so a reload found it empty and
   transport.js fell through to its sample rows - the header named the real
   stop while the four departures under it read Centrum/Univerzita/...
3. A graphic row captured before 0.1.346 recorded a box a few pixels away from
   where the row was drawn. The clean-background tier clears that box and
   redraws into it, so the old board stayed partly visible and the new rows
   landed slightly above it: the display showed both.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


class TransitStopPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def _select_body(self) -> str:
        start = self.devices.index("async _selectTransitStop(")
        end = self.devices.index("\n  },", start)
        return self.devices[start:end]

    def test_the_stop_is_saved_before_the_board_is_fetched(self) -> None:
        body = self._select_body()
        saved = body.index("this._scheduleDraftSave?.();")
        fetched = body.index("dratek_eink/transit/departures")
        self.assertLess(
            saved, fetched,
            "a failing timetable request must not be able to discard the chosen stop",
        )

    def test_the_stop_is_mirrored_into_this_display_s_cached_draft(self) -> None:
        # Same shape as the meteoradar country and the custom image: the mirror
        # is what carries the value when _scheduleDraftSave's own gate
        # (_draftIsLoadedForSelectedDevice) is still shut.
        self.assertIn("_rememberTransitStopInDraft() {", self.devices)
        self.assertIn("draft.template_config.transit_stop_id =", self.devices)
        self.assertIn("draft.template_config.transit_stop_name =", self.devices)
        self.assertIn("this._rememberTransitStopInDraft();", self._select_body())

    def test_the_draft_payload_still_carries_the_stop(self) -> None:
        self.assertIn("transit_stop_id: this._displayTemplateConfig?.transit_stop_id", self.devices)
        self.assertIn('transit_stop_id: String(config?.transit_stop_id || "")', self.devices)


class TransitBoardRefreshTests(unittest.TestCase):
    def setUp(self) -> None:
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_a_saved_stop_refetches_its_board_without_being_re_picked(self) -> None:
        self.assertIn("async _ensureTemplateTransitBoard() {", self.svg)
        self.assertIn("_templateNeedsTransitBoard(rows) {", self.svg)
        self.assertIn('row?.group === "transport-board"', self.svg)

    def test_the_interactive_preview_requests_it_off_the_render_path(self) -> None:
        # Both places that draw a live template preview, matching how the radar
        # map is kicked off from exactly the same two call sites.
        self.assertIn("this._requestTemplateTransitBoard(rows);", self.svg)
        self.assertIn("this._requestTemplateTransitBoard(rows);", self.devices)

    def test_the_send_path_waits_for_the_board(self) -> None:
        # A manual send must never go out with the sample departures baked in.
        self.assertIn("await this._preloadTemplateTransitBoard(rows);", self.svg)

    def test_the_cache_is_aged_so_relative_times_cannot_go_stale(self) -> None:
        self.assertIn("fetched_at: Date.now()", self.svg)
        self.assertIn("const TRANSIT_CACHE_MS", self.svg)
        self.assertIn("const TRANSIT_RETRY_MS", self.svg)

    def test_a_failed_fetch_keeps_the_last_good_board_for_that_stop(self) -> None:
        start = self.svg.index("async _ensureTemplateTransitBoard() {")
        end = self.svg.index("\n  },", start)
        body = self.svg[start:end]
        self.assertIn("this._transitPreview = { ...cached, fetched_at: Date.now() };", body)


class GraphicCaptureVersionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.render = (COMPONENT / "render.py").read_text(encoding="utf-8")

    def test_the_panel_stamps_every_graphic_capture(self) -> None:
        self.assertIn("const GRAPHIC_BINDING_CAPTURE_VERSION = 2;", self.devices)
        self.assertIn("binding.capture = GRAPHIC_BINDING_CAPTURE_VERSION;", self.devices)

    def test_both_sides_agree_on_the_current_generation(self) -> None:
        self.assertIn("GRAPHIC_BINDING_CAPTURE_VERSION = 2", self.render)

    def test_an_unstamped_capture_is_treated_as_the_broken_generation(self) -> None:
        self.assertIn('int(binding.get("capture") or 0) < GRAPHIC_BINDING_CAPTURE_VERSION', self.render)


class PortraitTwoLineBoardTests(unittest.TestCase):
    """A portrait tag is narrow, and a single line could not carry the line
    number, the destination and the times side by side: the destination - the
    one field nobody can guess - was squeezed to the readability floor and then
    ellipsised away. The two-line board gives it the whole width.
    """

    def setUp(self) -> None:
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.blocks = (COMPONENT / "svg_blocks.py").read_text(encoding="utf-8")
        self.transport = (PANEL / "templates" / "transport.js").read_text(encoding="utf-8")
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.render = (COMPONENT / "render.py").read_text(encoding="utf-8")

    def test_the_portrait_layout_opts_in_and_the_others_do_not(self) -> None:
        self.assertIn("twoLine: true", self.transport)
        self.assertEqual(1, self.transport.count("twoLine: true"))
        self.assertIn("if (row.twoLine) return this._blockBoardTwoLine(row, box);", self.svg)

    def test_portrait_trades_a_row_for_the_second_line(self) -> None:
        # Three legible services beat four with their destinations cut off.
        self.assertIn("const rowCount = height > width ? 3 : 4;", self.transport)

    def test_every_column_is_sized_once_for_the_whole_board(self) -> None:
        # Per-row shrink-to-fit printed each destination at a different size.
        for source, marker in ((self.svg, "const titleSize = fit("), (self.blocks, "title_size = fit(")):
            with self.subTest(marker=marker):
                self.assertIn(marker, source)

    def test_the_clock_and_the_countdown_share_one_budget(self) -> None:
        # Sizing them one after the other clipped the clock to "07:..." on the
        # narrowest tag, and a departure time without its minutes is useless.
        self.assertIn("const valueSize = clockSize;", self.svg)
        self.assertIn("value_size = clock_size", self.blocks)

    def test_the_clip_guard_is_measured_at_the_size_it_draws_at(self) -> None:
        self.assertIn("timesWidth - valueWidth - clockSize * 0.5", self.svg)
        self.assertIn("times_width - value_width - clock_size * 0.5", self.blocks)

    def test_the_binding_records_which_layout_the_panel_chose(self) -> None:
        # A portrait tag and a small landscape tag can hand the backend the same
        # rectangle, so the box alone cannot tell it which board to redraw.
        self.assertIn("two_line: !!row.twoLine,", self.devices)
        self.assertIn('if binding.get("two_line"):', self.render)
        self.assertIn("svg_blocks.block_board_two_line(", self.render)


class VehicleKindTests(unittest.TestCase):
    """The board pictures what is pulling in, which needs the glyph geometry to
    reach a backend that has no ha-icon to resolve a name with.
    """

    def setUp(self) -> None:
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.shared = (PANEL / "templates" / "shared.js").read_text(encoding="utf-8")
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.render = (COMPONENT / "render.py").read_text(encoding="utf-8")

    def test_every_kind_transit_py_can_return_has_a_glyph(self) -> None:
        transit = (COMPONENT / "transit.py").read_text(encoding="utf-8")
        kinds = set(re.findall(r'"(\w+)"[,}]', transit[transit.index("_ROUTE_TYPE_KINDS = {"):transit.index("def vehicle_kind")]))
        kinds |= {"other"}
        for kind in kinds:
            with self.subTest(kind=kind):
                self.assertIn(f"  {kind}: ", self.shared)

    def test_the_map_lives_where_both_sides_can_import_it_without_a_cycle(self) -> None:
        # templates/shared.js imports nothing; putting it in the SVG mixin would
        # close mixin -> templates/index -> transport -> mixin.
        self.assertIn("export const TRANSIT_KIND_ICONS", self.shared)
        self.assertNotIn("import", self.shared.split("export const TRANSIT_KIND_ICONS")[0].replace("// ", ""))

    def test_the_binding_carries_the_geometry_for_every_kind(self) -> None:
        # Not only the kinds on the board at capture time: the next refresh can
        # bring back a trolleybus where a tram stood.
        self.assertIn("icons: this._transitKindIconPaths(),", self.devices)
        self.assertIn("_transitKindIconPaths() {", self.svg)
        self.assertIn("Object.entries(TRANSIT_KIND_ICONS)", self.svg)

    def test_the_send_path_waits_for_the_glyphs(self) -> None:
        preload = self.svg[self.svg.index("async _preloadTemplateTransitBoard(rows) {"):]
        preload = preload[: preload.index("\n  },")]
        self.assertIn("await this._preloadTransitKindIcons();", preload)

    def test_the_backend_looks_the_glyph_up_by_kind(self) -> None:
        self.assertIn('icons.get(str(item.get("kind") or "other"))', self.render)


if __name__ == "__main__":
    unittest.main()
