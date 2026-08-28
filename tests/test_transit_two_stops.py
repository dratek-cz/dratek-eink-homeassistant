"""A departures board can watch two stops at once.

A village where the train halt and the bus stop are a hundred metres apart is
one place to the person standing between them, but a display could hold exactly
one stop id. The second stop is optional, and when it is set the two timetables
are merged into a single board ordered by countdown - on the panel and on an
automatic refresh alike, which is why the ordering is pinned on both sides.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
SVG = PANEL / "panel-template-svg.mixin.js"
DEVICES = PANEL / "panel-devices.mixin.js"
INSPECTOR = PANEL / "panel-inspector.mixin.js"
AUTOMATION = COMPONENT / "automation.py"


class SecondStopConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = DEVICES.read_text(encoding="utf-8")

    def test_the_second_stop_is_saved_with_the_display(self) -> None:
        # Snapshot, restore and the local draft mirror - a stop held in only
        # two of the three survives until the next reload and no further.
        for marker in (
            'transit_stop_id_2: this._displayTemplateConfig?.transit_stop_id_2 || "",',
            'transit_stop_id_2: String(config?.transit_stop_id_2 || ""),',
            'draft.template_config.transit_stop_id_2 = String(this._displayTemplateConfig?.transit_stop_id_2 || "");',
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, self.devices)

    def test_it_is_optional_and_never_reported_as_missing(self) -> None:
        # One stop is a finished configuration, not a half-filled one.
        status = self.devices[self.devices.index('if (template?.id === "transport") {'):][:600]
        self.assertIn("total: 1", status)
        self.assertNotIn("transit_stop_id_2", status)

    def test_the_second_slot_is_only_offered_once_the_first_is_set(self) -> None:
        self.assertIn(
            'return String(config.transit_stop_id || "").trim() ? slot : 1;',
            self.devices,
        )
        self.assertIn("const addSecond = first && !second && target !== 2", self.devices)

    def test_the_picker_can_target_and_clear_the_second_slot(self) -> None:
        self.assertIn("_setTransitStopSlot(slot) {", self.devices)
        self.assertIn("_clearTransitStop(slot) {", self.devices)
        inspector = INSPECTOR.read_text(encoding="utf-8")
        self.assertIn('"[data-transit-stop-slot]"', inspector)
        self.assertIn('"[data-transit-stop-clear]"', inspector)

    def test_changing_either_stop_drops_the_merged_board(self) -> None:
        # The cache is keyed by the pair. Leaving it in place after a change
        # keeps printing the stop that was just removed.
        select = self.devices[self.devices.index("async _selectTransitStop("):][:900]
        self.assertIn("this._transitPreview = null;", select)
        clear = self.devices[self.devices.index("_clearTransitStop(slot) {"):][:700]
        self.assertIn("this._transitPreview = null;", clear)

    def test_the_binding_carries_both_stops_to_the_backend(self) -> None:
        # A board that quietly dropped back to one stop overnight is worse
        # than no board.
        self.assertIn(
            'stop_id_2: String(this._displayTemplateConfig?.transit_stop_id_2 || "").trim(),',
            self.devices,
        )
        self.assertIn('str(binding.get("stop_id_2") or "").strip()', AUTOMATION.read_text(encoding="utf-8"))


def _merge(boards: list[list[dict]], limit: int) -> list[dict]:
    """The ordering both sides implement, transcribed once here."""
    merged = [row for board in boards for row in board]
    merged.sort(key=lambda row: row.get("minutes", 0))
    return merged[:limit]


class MergedBoardOrderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.svg = SVG.read_text(encoding="utf-8")
        self.automation = AUTOMATION.read_text(encoding="utf-8")

    def test_the_board_is_keyed_by_the_pair_not_the_first_stop(self) -> None:
        # Comparing the cache against transit_stop_id alone rejects every
        # merged board the moment a second stop is added.
        self.assertEqual(2, self.svg.count("const key = stopId2 ? `${stopId}+${stopId2}` : stopId;"))
        self.assertIn("if (cached?.stop_id === key && age < ttl) return false;", self.svg)

    def test_both_timetables_are_asked_for_together(self) -> None:
        self.assertIn("await Promise.all([ask(stopId), ask(stopId2)])", self.svg)

    def test_both_sides_sort_on_the_same_single_key(self) -> None:
        self.assertIn(
            "merged.sort((a, b) => (Number(a?.minutes) || 0) - (Number(b?.minutes) || 0));",
            self.svg,
        )
        self.assertIn("departures.sort(key=lambda row: _departure_minutes(row))", self.automation)
        # A row with no countdown sorts last, not ahead of every real service.
        self.assertIn("return 10 ** 6", self.automation)

    def test_the_header_names_both_stops(self) -> None:
        # A board merging two timetables under one stop's name is lying about
        # where half its departures leave from.
        self.assertIn('return names.join(" + ");', self.svg)

    def test_a_merged_board_interleaves_by_countdown(self) -> None:
        train = [
            {"line": "S4", "minutes": 4},
            {"line": "S4", "minutes": 34},
            {"line": "S4", "minutes": 64},
        ]
        bus = [
            {"line": "620", "minutes": 1},
            {"line": "621", "minutes": 12},
            {"line": "620", "minutes": 40},
        ]
        merged = _merge([train, bus], 12)
        self.assertEqual([1, 4, 12, 34, 40, 64], [row["minutes"] for row in merged])

    def test_the_merged_board_is_capped_at_the_fetch_limit(self) -> None:
        first = [{"line": "A", "minutes": n} for n in range(0, 24, 2)]
        second = [{"line": "B", "minutes": n} for n in range(1, 25, 2)]
        merged = _merge([first, second], 12)
        self.assertEqual(12, len(merged))
        self.assertEqual(list(range(12)), [row["minutes"] for row in merged])

    def test_one_stop_still_produces_exactly_its_own_board(self) -> None:
        only = [{"line": "9", "minutes": n} for n in (3, 8, 14)]
        self.assertEqual(only, _merge([only], 12))

    def test_a_tie_keeps_each_timetables_own_order(self) -> None:
        # A repaint that changes nothing must not shuffle the board.
        first = [{"line": "A", "minutes": 5}, {"line": "B", "minutes": 5}]
        second = [{"line": "C", "minutes": 5}]
        self.assertEqual(
            ["A", "B", "C"], [row["line"] for row in _merge([first, second], 12)]
        )


if __name__ == "__main__":
    unittest.main()
