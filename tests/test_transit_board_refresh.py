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

    def test_how_many_services_fit_is_measured_not_hardcoded(self) -> None:
        # It used to be "three rows portrait, four otherwise" whatever the panel
        # was, so a 960x640 wall display showed exactly as many departures as a
        # 296x128 shelf tag. The count now comes from the board's own box.
        self.assertIn("const boardHeight = (height || 128) * boardFraction;", self.transport)
        self.assertIn("const fits = Math.floor(boardHeight / rowPitch);", self.transport)
        self.assertIn(
            "const rowCount = Math.max(4, Math.min(portrait ? portraitCap : 12, fits));",
            self.transport,
        )
        # Four everywhere, however small the tag: three services is a board you
        # have to trust rather than read.
        self.assertIn("Math.max(4,", self.transport)
        # Two lines per service need more room than one, and the pitch grows
        # with the panel so a big display gets bigger rows, not just more of
        # them pinned to the readability floor.
        self.assertIn("const rowPitch = portrait ? lerp(30, 46) : lerp(20, 34);", self.transport)

    def test_the_board_cannot_ask_for_more_than_is_fetched(self) -> None:
        # A row the timetable was never asked for can only ever draw blank.
        self.assertIn("const TRANSIT_BOARD_LIMIT = 12;", self.svg)
        self.assertIn("limit: TRANSIT_BOARD_LIMIT,", self.svg)
        self.assertIn("portrait ? portraitCap : 12", self.transport)

    def test_a_bigger_panel_never_shows_fewer_services(self) -> None:
        """The row arithmetic, run rather than read."""
        def rows(width: int, height: int) -> int:
            t = max(0.0, min(1.0, ((width * height) ** 0.5 - 190) / (800 - 190)))
            lerp = lambda a, b: a + (b - a) * t
            portrait = height > width
            small = height <= 160 and width >= height
            fraction = 0.75 if portrait else 0.66 if small else lerp(0.65, 0.77)
            pitch = lerp(30, 46) if portrait else lerp(20, 34)
            fits = int(height * fraction // pitch)
            cap = int(lerp(4, 12)) if portrait else 12
            return max(4, min(cap, fits))

        landscape = [(196, 96), (250, 128), (296, 128), (400, 300), (640, 384), (800, 480), (960, 640)]
        counts = [rows(w, h) for w, h in landscape]
        self.assertEqual(counts, sorted(counts), f"not monotonic: {list(zip(landscape, counts))}")
        # A wall panel genuinely shows more than a shelf tag.
        self.assertGreater(rows(800, 480), rows(296, 128))

    def test_every_tag_shows_four_services(self) -> None:
        """Four is the floor, in either orientation, however small the tag.

        The smallest landscape tag was showing three, and the narrow portrait
        ones were packing in eight or nine two-line services - which bought the
        extra rows by shrinking the vehicle glyph, the one mark that says
        whether the next thing along is the bus or the train.
        """
        def rows(width: int, height: int) -> int:
            t = max(0.0, min(1.0, ((width * height) ** 0.5 - 190) / (800 - 190)))
            lerp = lambda a, b: a + (b - a) * t
            portrait = height > width
            small = height <= 160 and width >= height
            fraction = 0.75 if portrait else 0.66 if small else lerp(0.65, 0.77)
            pitch = lerp(30, 46) if portrait else lerp(20, 34)
            fits = int(height * fraction // pitch)
            cap = int(lerp(4, 12)) if portrait else 12
            return max(4, min(cap, fits))

        for width, height in [
            (196, 96), (212, 104), (250, 128), (250, 132), (296, 128),   # tags
            (96, 196), (128, 296), (168, 384),                            # the same, turned
        ]:
            with self.subTest(size=f"{width}x{height}"):
                self.assertEqual(4, rows(width, height))

    def test_a_narrow_portrait_tag_spends_its_height_on_the_glyph(self) -> None:
        # Four services on a 168x384 tag leave a 72px row, and the two-line
        # board draws the vehicle at 40% of that - twice what nine cramped
        # services left it.
        def icon(width: int, height: int, count: int) -> float:
            board_h = height * 0.75
            line_h = board_h / count
            pad = max(3, round(min(width, height) * 0.035))
            badge = min((width - 2 * pad) * 0.26, line_h * 0.95)
            return min(line_h * 0.40, badge * 0.92)

        self.assertGreater(icon(168, 384, 4), 2 * icon(168, 384, 9))
        self.assertGreater(icon(168, 384, 4), 25)

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


class LandscapeBoardCarriesTheSameFactsTests(unittest.TestCase):
    """A wide tag used to say less than a narrow one.

    The single-line board drew the line number, the destination and the
    countdown, and silently dropped the two fields the portrait board had room
    for: the vehicle icon and the scheduled departure time. The row it drew them
    into was mostly empty in the middle, so there was nothing to gain by it.
    """

    def setUp(self) -> None:
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.blocks = (COMPONENT / "svg_blocks.py").read_text(encoding="utf-8")
        self.transport = (PANEL / "templates" / "transport.js").read_text(encoding="utf-8")

    def _one_line_board(self, source: str, start: str, end: str) -> str:
        body = source[source.index(start):]
        return body[: body.index(end)]

    def test_the_panel_draws_the_icon_and_the_clock(self) -> None:
        body = self._one_line_board(self.svg, "  _blockBoard(row, box) {", "\n  },")
        self.assertIn("if (iconSize && item.icon) {", body)
        self.assertIn("if (clockWidth && item.clock) {", body)

    def test_the_backend_draws_them_too(self) -> None:
        # The preview and the bitmap the display receives come from different
        # renderers; a change to one alone makes the panel lie about the tag.
        body = self._one_line_board(self.blocks, "def block_board(", "\ndef block_split(")
        self.assertIn('if icon_size and item.get("icon"):', body)
        self.assertIn('if clock_width and item.get("clock"):', body)

    def test_both_sides_give_way_in_the_same_order(self) -> None:
        # Clock first, then the icon, and only to keep the destination - the one
        # field nobody can guess - above a third of the row.
        self.assertIn("if (clockWidth && labelRoom() < labelFloor) clockWidth = 0;", self.svg)
        self.assertIn("if (iconSize && labelRoom() < labelFloor) iconSize = 0;", self.svg)
        self.assertIn("if clock_width and label_room() < label_floor:", self.blocks)
        self.assertIn("if icon_size and label_room() < label_floor:", self.blocks)

    def test_a_board_without_them_keeps_its_wider_plate(self) -> None:
        # presence.js draws a status glyph, not a line number, and never asked
        # for the narrower plate the extra columns need.
        self.assertIn("box.w * (hasExtras ? 0.16 : 0.22)", self.svg)
        self.assertIn('box["w"] * (0.16 if has_extras else 0.22)', self.blocks)

    def test_the_template_still_opts_into_two_lines_only_in_portrait(self) -> None:
        self.assertEqual(1, self.transport.count("twoLine: true"))


if __name__ == "__main__":
    unittest.main()


def _load_svg_blocks():
    """svg_blocks.py without the Home Assistant package around it.

    Same loader tests/test_svg_blocks_port.py uses, for the same reason.
    """
    import importlib.util
    import sys
    import types

    package = "dratek_transit_board_test"
    if package not in sys.modules:
        module = types.ModuleType(package)
        module.__path__ = [str(COMPONENT)]
        sys.modules[package] = module
    for name in ("svg_text", "svg_blocks"):
        spec = importlib.util.spec_from_file_location(f"{package}.{name}", COMPONENT / f"{name}.py")
        loaded = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = loaded
        spec.loader.exec_module(loaded)
    return sys.modules[f"{package}.svg_blocks"]


_ROWS = [
    {"badge": "620", "label": "Říčany", "value": "za 1 min", "clock": "7:09", "icon": "M0 0h1v1h-1z", "color": "red"},
    {"badge": "S4", "label": "Praha hl.n.", "value": "za 4 min", "clock": "7:12", "icon": "M0 0h1v1h-1z", "color": "black"},
    {"badge": "621", "label": "Mukařov", "value": "za 12 min", "clock": "7:20", "icon": "M0 0h1v1h-1z", "color": "black"},
    {"badge": "S4", "label": "Kolín", "value": "za 34 min", "clock": "7:42", "icon": "M0 0h1v1h-1z", "color": "black"},
]


class BoardLegibilityTests(unittest.TestCase):
    """Nothing on the board may be printed with its end cut off.

    Both of these were live on the 296x128 tag, the commonest display there is.
    """

    def setUp(self) -> None:
        self.blocks = _load_svg_blocks()

    def _texts(self, box, rows, compact=True):
        markup = self.blocks.block_board(rows, box, filled=True, compact=compact)
        return re.findall(r"<text[^>]*>([^<]*)</text>", markup)

    def test_the_scheduled_time_keeps_its_minutes(self) -> None:
        # clockSize could fall to 9 while svg_text refuses to draw under 10, so
        # the strip was reserved at one size and filled at another: "7:12"
        # printed as "7:…", and a departure time without its minutes is worse
        # than no departure time at all.
        texts = self._texts({"x": 3, "y": 3, "w": 290, "h": 84}, _ROWS)
        self.assertIn("7:09", texts)
        self.assertIn("7:42", texts)

    def test_the_countdown_keeps_its_number(self) -> None:
        # A flat 26% of the board is four pixels short of "za 34 min" on a
        # 196px tag, so the most important number on the row was the one that
        # got ellipsised.
        for width, rows in ((290, _ROWS), (190, _ROWS[:3])):
            with self.subTest(width=width):
                texts = self._texts({"x": 3, "y": 3, "w": width, "h": 62 if width == 190 else 84}, rows)
                for row in rows:
                    self.assertIn(row["value"], texts)

    def test_nothing_at_all_is_ellipsised_on_a_standard_tag(self) -> None:
        texts = self._texts({"x": 3, "y": 3, "w": 290, "h": 84}, _ROWS)
        clipped = [text for text in texts if "…" in text]
        self.assertEqual([], clipped)

    def test_the_vehicle_is_drawn_big_enough_to_read(self) -> None:
        # It used to be capped at 52% of the row and 7.5% of the board, which
        # on a 296x128 tag is an 11px smudge - too small to tell a bus from a
        # train, which is the whole reason it is there.
        markup = self.blocks.block_board(
            _ROWS, {"x": 3, "y": 3, "w": 290, "h": 84}, filled=True, compact=True
        )
        sizes = [float(value) for value in re.findall(r'<g transform="translate\([^)]*\) scale\(([0-9.]+)\)"', markup)]
        if not sizes:
            # The icon helper's exact markup is not this test's business; fall
            # back to pinning the constant both renderers share.
            source = (COMPONENT / "svg_blocks.py").read_text(encoding="utf-8")
            self.assertIn('min(line_height * 0.78, box["w"] * 0.12)', source)
            svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
            self.assertIn("Math.min(lineHeight * 0.78, box.w * 0.12)", svg)
