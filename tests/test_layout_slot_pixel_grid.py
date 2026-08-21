"""Grid slots must land on whole pixels, or the custom image falls apart.

Reported as "the image is applied completely differently to the individual
parts": six identical slots on a 400x300 panel, all holding the same photo,
rendered three visibly different pictures - column 1 bright, columns 2 and 3
dark and muddy.

The cause was not the image code at all. `_displayTemplateLayoutSlots` split
the panel by plain division, so three columns across 400 px were 133.333 px
each and started at x = 0, 133.33, 266.67. `_buildDisplayTemplateSvg` then
emitted `translate(133.33, 0)`, and everything inside that slot had to be
resampled a third of a pixel across. For text that is invisible. The
custom-image template's content is already a black/red/white halftone, and
resampling blends neighbouring dots into greys which the final e-ink
quantisation snaps somewhere else entirely.

Measured in the browser harness on a 400x300 panel, red pixels per cell:

    grid-6     before  4827 / 2007 / 1995   after  4827 / 4830 / 4827
    columns-3  before 12276 / 6344 / 6299   after 12276 / 12271 / 12276

Layouts whose columns happen to divide evenly - 2 or 4 across 400 px - were
always correct, which is why this looked like an image bug rather than a
geometry one.
"""

from __future__ import annotations

from fractions import Fraction
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
DEVICES_MIXIN = PANEL / "panel-devices.mixin.js"
SVG_MIXIN = PANEL / "panel-template-svg.mixin.js"


LAYOUTS = {
    "single": (1, 1, 1),
    "side-by-side": (2, 1, 2),
    "stacked": (1, 2, 2),
    "columns-3": (3, 1, 3),
    "columns-4": (4, 1, 4),
    "grid-4": (2, 2, 4),
    "grid-6": (3, 2, 6),
}

MIXED_5 = [
    (Fraction(0), Fraction(0), Fraction(1, 2), Fraction(1, 3)),
    (Fraction(1, 2), Fraction(0), Fraction(1, 2), Fraction(1, 3)),
    (Fraction(0), Fraction(1, 3), Fraction(1, 3), Fraction(2, 3)),
    (Fraction(1, 3), Fraction(1, 3), Fraction(1, 3), Fraction(2, 3)),
    (Fraction(2, 3), Fraction(1, 3), Fraction(1, 3), Fraction(2, 3)),
]


def _snap(x, y, w, h, width, height):
    """The Python twin of _snapLayoutSlot - both edges rounded, never the size.

    JavaScript's Math.round breaks .5 upwards; Python's round() breaks to
    even, so the halves are nudged explicitly rather than handed to round().
    """
    def js_round(value):
        return int((Fraction(value) + Fraction(1, 2)).__floor__())

    left = js_round(x * width)
    top = js_round(y * height)
    return (
        left,
        top,
        js_round((x + w) * width) - left,
        js_round((y + h) * height) - top,
    )


def _slots(layout, width, height):
    transposed = height > width
    if layout == "mixed-5":
        return [
            _snap(y, x, h, w, width, height) if transposed
            else _snap(x, y, w, h, width, height)
            for x, y, w, h in MIXED_5
        ]
    definition_columns, definition_rows, capacity = LAYOUTS[layout]
    columns = definition_rows if transposed else definition_columns
    rows = definition_columns if transposed else definition_rows
    return [
        _snap(
            Fraction(index % columns, columns),
            Fraction(index // columns, rows),
            Fraction(1, columns),
            Fraction(1, rows),
            width,
            height,
        )
        for index in range(capacity)
    ]


PANELS = [(400, 300), (300, 400), (800, 480), (480, 800), (296, 128), (250, 128)]
ALL_LAYOUTS = list(LAYOUTS) + ["mixed-5"]


class SnappedSlotGeometryTests(unittest.TestCase):
    """The arithmetic the fix relies on, exercised over every real panel."""

    def test_every_slot_is_whole_pixels(self) -> None:
        for width, height in PANELS:
            for layout in ALL_LAYOUTS:
                for slot in _slots(layout, width, height):
                    self.assertTrue(
                        all(isinstance(value, int) for value in slot),
                        f"{layout} on {width}x{height} produced {slot}",
                    )

    def test_slots_tile_the_panel_exactly(self) -> None:
        # No gap and no overlap: the areas must add up to the whole panel.
        for width, height in PANELS:
            for layout in ALL_LAYOUTS:
                slots = _slots(layout, width, height)
                area = sum(w * h for _x, _y, w, h in slots)
                self.assertEqual(
                    area,
                    width * height,
                    f"{layout} on {width}x{height} covers {area} of {width * height}",
                )

    def test_neighbours_share_an_edge(self) -> None:
        # A shared boundary must be one number, not two that nearly agree -
        # otherwise a seam of resampled pixels opens up between the cells.
        for width, height in PANELS:
            for layout in ALL_LAYOUTS:
                right_edges = {x + w for x, _y, w, _h in _slots(layout, width, height)}
                lefts = {x for x, _y, _w, _h in _slots(layout, width, height)}
                for left in lefts - {0}:
                    self.assertIn(
                        left,
                        right_edges,
                        f"{layout} on {width}x{height}: x={left} starts nowhere",
                    )

    def test_the_reported_case_gives_three_equal_columns(self) -> None:
        # 400 px across three columns: 133 + 134 + 133, all on whole pixels.
        slots = _slots("grid-6", 400, 300)
        self.assertEqual([s[0] for s in slots[:3]], [0, 133, 267])
        self.assertEqual([s[2] for s in slots[:3]], [133, 134, 133])
        self.assertEqual(sum(s[2] for s in slots[:3]), 400)

    def test_evenly_divisible_layouts_are_unchanged(self) -> None:
        # These always worked; the fix must not move them.
        self.assertEqual(
            _slots("grid-4", 400, 300),
            [(0, 0, 200, 150), (200, 0, 200, 150), (0, 150, 200, 150), (200, 150, 200, 150)],
        )
        self.assertEqual(
            _slots("columns-4", 400, 300),
            [(0, 0, 100, 300), (100, 0, 100, 300), (200, 0, 100, 300), (300, 0, 100, 300)],
        )


class SnappedSlotSourceTests(unittest.TestCase):
    """The renderer must actually use the snapped geometry."""

    def setUp(self) -> None:
        self.devices = DEVICES_MIXIN.read_text(encoding="utf-8")
        self.svg = SVG_MIXIN.read_text(encoding="utf-8")

    def _slots_body(self) -> str:
        match = re.search(
            r"_displayTemplateLayoutSlots\(layout, width, height\) \{(.*?)\n  \},",
            self.devices,
            re.S,
        )
        self.assertIsNotNone(match, "_displayTemplateLayoutSlots not found")
        return match.group(1)

    def test_the_snapping_helper_exists(self) -> None:
        self.assertIn("_snapLayoutSlot(x, y, w, h, width, height, index)", self.devices)

    def test_both_edges_are_rounded_rather_than_the_size(self) -> None:
        match = re.search(
            r"_snapLayoutSlot\(x, y, w, h, width, height, index\) \{(.*?)\n  \},",
            self.devices,
            re.S,
        )
        self.assertIsNotNone(match)
        body = match.group(1)
        self.assertIn("Math.round(x * width)", body)
        self.assertIn("Math.round((x + w) * width) - left", body)
        self.assertIn("Math.round((y + h) * height) - top", body)

    def test_no_branch_still_multiplies_a_fractional_cell_size(self) -> None:
        body = self._slots_body()
        for stale in ("const cellWidth = width / columns", "slot.x * width", "cellWidth"):
            self.assertNotIn(stale, body, f"{stale!r} bypasses the snapping")

    def test_both_layout_branches_go_through_the_helper(self) -> None:
        body = self._slots_body()
        # mixed-5 and the regular grid are separate code paths; both must snap.
        self.assertEqual(body.count("this._snapLayoutSlot("), 3)

    def test_the_dividers_land_on_the_same_edges(self) -> None:
        # A separator drawn at width*column/columns would sit half a pixel
        # inside a cell once the cells themselves are snapped.
        self.assertIn("const edge = (position, total) => Math.round(position * total);", self.svg)
        for stale in (
            "const x = width * column / columns;",
            "const y = height * row / rows;",
            "const splitY = height / 3;",
            "const splitX = width / 3;",
        ):
            self.assertNotIn(stale, self.svg, f"{stale!r} is not snapped")


if __name__ == "__main__":
    unittest.main()
