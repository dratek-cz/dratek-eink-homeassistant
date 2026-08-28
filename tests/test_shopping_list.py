"""The shopping list template reads a real Home Assistant todo list.

Before this it was a picture of a shopping list: five hardcoded item names and
three text slots. A todo.* entity's state is the number of items left and its
items are not in its attributes at all, so the page could never show them - the
only way to read them is the `todo.get_items` service, the same shape of fetch
calendar.js already makes for `calendar.get_events`.

These tests pin the three halves of that: the panel's fetch and ordering, the
backend's matching fetch for an automatic refresh, and the grid transposition
both of them have to agree on.
"""

from __future__ import annotations

import math
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
TEMPLATE = PANEL / "templates" / "shopping.js"
INDEX = PANEL / "templates" / "index.js"
DEVICES = PANEL / "panel-devices.mixin.js"
TEMPLATE_SVG = PANEL / "panel-template-svg.mixin.js"
RENDER = COMPONENT / "render.py"
AUTOMATION = COMPONENT / "automation.py"
BLOCKS = COMPONENT / "svg_blocks.py"


class ShoppingListTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.template = TEMPLATE.read_text(encoding="utf-8")
        self.devices = DEVICES.read_text(encoding="utf-8")

    def test_it_sits_next_to_the_departures_board(self) -> None:
        index = INDEX.read_text(encoding="utf-8")
        entries = re.search(r"export const DISPLAY_TEMPLATES = \[(.*?)\n\];", index, re.S)
        self.assertIsNotNone(entries)
        names = [line.strip().rstrip(",") for line in entries.group(1).splitlines()]
        names = [name for name in names if name and not name.startswith("//")]
        self.assertEqual("shopping", names[names.index("transport") + 1])

    def test_one_slot_and_it_is_the_list_itself(self) -> None:
        # Three text slots used to stand in for item names because the list
        # could not be read. One entity picker, pointed at the todo list, is
        # the whole configuration now.
        variables = re.search(r"variables: \[(.*?)\n    \],", self.template, re.S)
        self.assertIsNotNone(variables)
        self.assertEqual(1, variables.group(1).count("["))
        self.assertIn('"Nákupní seznam"', variables.group(1))

    def test_the_slot_resolves_to_a_todo_entity(self) -> None:
        # "Nákupní seznam" contains "seznam", which the todo_item kind below it
        # also matches - so this test is really about the order of the two.
        self.assertIn('if (has("nákupní seznam", "úkolovník")) return "todo_list";', self.devices)
        self.assertLess(
            self.devices.index('return "todo_list"'),
            self.devices.index('return "todo_item"'),
        )
        self.assertIn('todo_list: { domains: ["todo"] }', self.devices)

    def test_the_items_come_from_the_service_not_the_state(self) -> None:
        self.assertIn('this._hass.callService("todo", "get_items", {}', self.devices)
        self.assertIn("_templateShoppingList(template) {", self.devices)
        self.assertIn('const shoppingList = () => this._templateShoppingList(template);',
                      TEMPLATE_SVG.read_text(encoding="utf-8"))

    def test_unchecked_items_come_first(self) -> None:
        # The items still to be picked up are the reason the display is on the
        # fridge; a panel with room for six rows of a twenty-item list must not
        # spend them on the fourteen already in the basket.
        self.assertIn("const pending = items.filter((item) => !item.done);", self.devices)
        self.assertIn("items: [...pending, ...done],", self.devices)
        render = RENDER.read_text(encoding="utf-8")
        self.assertIn(
            'ordered = [item for item in entries if not item["done"]] '
            '+ [item for item in entries if item["done"]]',
            render,
        )

    def test_how_many_items_fit_is_measured_not_hardcoded(self) -> None:
        self.assertIn("const LINE_PITCH = 17;", self.template)
        self.assertIn("const lines = Math.max(1, Math.floor(listHeight / LINE_PITCH));", self.template)
        self.assertIn("const MIN_COLUMN_WIDTH = 84;", self.template)
        # Columns follow the list, not the panel: a four-item list on a wall
        # panel stays one legible column.
        self.assertIn(
            "const columns = Math.min(maxColumns, Math.max(1, Math.ceil(list.items.length / lines)));",
            self.template,
        )

    def test_an_empty_list_is_a_real_answer(self) -> None:
        # A list that came back empty says everything is ticked off. A list that
        # could not be read says nothing, and must keep the last rendered rows
        # rather than blank the page.
        self.assertIn('"vše odškrtnuto"', self.template)
        automation = AUTOMATION.read_text(encoding="utf-8")
        self.assertIn("async def _async_todo_items(hass: HomeAssistant, entity_id: str) -> list[dict[str, str]] | None:", automation)
        self.assertIn('str(binding.get("fallback") or "[]")\n                    if items is None', automation)

    def test_the_refresh_redraws_the_rows_instead_of_leaving_them_painted(self) -> None:
        # A checklist left in clean_background would show the old items under
        # the new ones, the way transit boards did before 0.1.345.
        self.assertIn(
            '["text", "ratio", "series", "history", "forecast", "calendar", "transit", "todo"].includes(binding.type)',
            self.devices,
        )
        self.assertIn(
            'return binding.get("type") in ("series", "ratio", "history", "forecast", "calendar", "transit", "todo")',
            RENDER.read_text(encoding="utf-8"),
        )

    def test_the_backend_has_the_block_to_redraw_them_with(self) -> None:
        self.assertIn("def block_checklist(", BLOCKS.read_text(encoding="utf-8"))
        self.assertIn("svg_blocks.block_checklist(", RENDER.read_text(encoding="utf-8"))


def _column_major_js(items: list[str], lines: int, columns: int) -> list[str]:
    """The JavaScript in shopping.js, transcribed - the reference this pins to."""
    if columns <= 1:
        return items
    slices: list[list[str]] = []
    cursor = 0
    for column in range(columns):
        size = min(lines, math.ceil((len(items) - cursor) / (columns - column)))
        slices.append(items[cursor:cursor + size])
        cursor += size
    ordered: list[str] = []
    for line in range(lines):
        for column in range(columns):
            if line < len(slices[column]):
                ordered.append(slices[column][line])
    return ordered


class ShoppingListColumnOrderTests(unittest.TestCase):
    """A shopping list is read down a column, not across three of them."""

    def setUp(self) -> None:
        # Loaded the way tests/test_svg_blocks_port.py loads its module, so the
        # Home Assistant package around render.py is never imported.
        import importlib.util
        import sys
        import types

        package = "dratek_shopping_list_test"
        if package not in sys.modules:
            module = types.ModuleType(package)
            module.__path__ = [str(COMPONENT)]
            sys.modules[package] = module
        source = RENDER.read_text(encoding="utf-8")
        body = re.search(r"\ndef _column_major\(.*?\n    return ordered\n", source, re.S)
        assert body, "render.py no longer defines _column_major"
        namespace: dict[str, object] = {"math": math, "Any": object}
        exec(compile("import math\n" + body.group(0), "<render._column_major>", "exec"), namespace)
        self.backend = namespace["_column_major"]

    def test_three_columns_read_downwards(self) -> None:
        items = [f"i{n}" for n in range(12)]
        self.assertEqual(
            # Row 0 of the printed grid holds the head of each column.
            ["i0", "i4", "i8", "i1", "i5", "i9", "i2", "i6", "i10", "i3", "i7", "i11"],
            _column_major_js(items, 4, 3),
        )

    def test_a_single_column_is_left_alone(self) -> None:
        items = [f"i{n}" for n in range(5)]
        self.assertEqual(items, _column_major_js(items, 5, 1))

    def test_the_backend_transposes_identically(self) -> None:
        # Two copies of one decision, which is only safe while they agree on
        # every shape a real list can take - including the ragged ones, where
        # the columns do not divide evenly and the empty cells have to fall at
        # the end of the last rows rather than in the middle of the grid.
        for total in range(1, 25):
            for columns in (1, 2, 3):
                for lines in range(1, 9):
                    if total > lines * columns:
                        continue
                    items = [{"label": f"i{n}"} for n in range(total)]
                    with self.subTest(total=total, columns=columns, lines=lines):
                        self.assertEqual(
                            _column_major_js(list(items), lines, columns),
                            self.backend(list(items), lines, columns),
                        )

    def test_nothing_is_lost_or_duplicated_in_the_transpose(self) -> None:
        for total in range(1, 25):
            for columns in (1, 2, 3):
                lines = math.ceil(total / columns)
                items = [f"i{n}" for n in range(total)]
                with self.subTest(total=total, columns=columns):
                    self.assertCountEqual(items, _column_major_js(items, lines, columns))


if __name__ == "__main__":
    unittest.main()
