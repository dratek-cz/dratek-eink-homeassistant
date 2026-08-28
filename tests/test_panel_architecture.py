"""Guards for the two things the mixin layout makes easy to get wrong.

Every mixin is merged into one prototype with Object.assign, so a name declared
twice would silently leave only the last definition alive, with no error
anywhere. And because a render rebuilds the whole page, anything the user was
holding on to - a caret, a scroll position, an open <details> - has to be
measured and put back, or it is gone.
"""

from __future__ import annotations

import collections
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"
PANEL = FRONTEND / "panel"
ENTRY = FRONTEND / "dratek-eink-panel.js"

# A member of an exported mixin object: two-space indent, then a name followed
# by "(" (method) or ":" (property).
MEMBER = re.compile(r"^  (?:async )?([A-Za-z_$][\w$]*)\s*(?:\(|:)", re.M)


def _mixin_members() -> dict[str, list[str]]:
    owners: dict[str, list[str]] = collections.defaultdict(list)
    for path in sorted(PANEL.glob("*.mixin.js")):
        source = path.read_text(encoding="utf-8")
        start = source.find("Mixin = {")
        if start < 0:
            continue
        for match in MEMBER.finditer(source[start:]):
            owners[match.group(1)].append(path.name)
    return owners


class MixinCompositionTests(unittest.TestCase):
    def test_no_two_mixins_declare_the_same_member(self) -> None:
        owners = _mixin_members()
        self.assertGreater(len(owners), 400, "the member scan stopped finding methods")
        clashes = {
            name: sorted(set(files))
            for name, files in owners.items()
            if len(set(files)) > 1
        }
        self.assertEqual(
            clashes, {},
            "Object.assign keeps only the last definition, so one of these "
            "methods is dead code that nothing will ever call.",
        )

    def test_no_mixin_declares_the_same_member_twice(self) -> None:
        # A duplicate inside one object literal is legal JavaScript and silently
        # drops the earlier body.
        owners = _mixin_members()
        doubled = {
            name: dict(collections.Counter(files))
            for name, files in owners.items()
            if any(count > 1 for count in collections.Counter(files).values())
        }
        self.assertEqual(doubled, {})

    def test_every_mixin_file_is_actually_assigned(self) -> None:
        entry = ENTRY.read_text(encoding="utf-8")
        assign = entry[entry.index("Object.assign("):]
        assign = assign[: assign.index(");")]
        merged = set(re.findall(r"^\s*(\w+),?$", assign, re.M))
        for path in sorted(PANEL.glob("*.mixin.js")):
            export = re.search(r"export const (\w+) = \{", path.read_text(encoding="utf-8"))
            if not export:
                continue
            with self.subTest(mixin=path.name):
                self.assertIn(export.group(1), merged, f"{path.name} is never merged in")


class RenderCostTests(unittest.TestCase):
    def setUp(self) -> None:
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_an_unchanged_render_does_not_swap_the_page(self) -> None:
        # The swap discards every canvas, scroll position and the focused field,
        # so identical markup has to stop before it.
        self.assertIn("renderKey === this._lastRenderKey", self.styles)
        self.assertIn("this._lastRenderKey = renderKey;", self.styles)
        # The markup is Czech until the translation pass runs over it.
        self.assertIn("const renderKey = `${this._uiLanguage()} ${markup}`;", self.styles)

    def test_a_skipped_render_does_not_bind_twice(self) -> None:
        # The surviving nodes still carry the listeners _bind() gave them; a
        # second pass over the same nodes would double every handler.
        skip = self.styles[self.styles.index("renderKey === this._lastRenderKey"):]
        skip = skip[: skip.index("this._lastRenderKey = renderKey;")]
        self.assertNotIn("this._bind()", skip)
        self.assertNotIn("_applyUiLanguage()", skip)

    def test_the_page_state_is_measured_before_the_swap_and_put_back_after(self) -> None:
        order = [
            self.styles.index("const uiState = this._captureUiState();"),
            self.styles.index("this._restoreUiState(uiState);"),
            self.styles.index("this._bind();\n    this._syncStickyOffset();"),
        ]
        self.assertEqual(order, sorted(order), "the UI state is restored at the wrong point")

    def test_focus_selection_scroll_and_open_sections_are_all_carried_over(self) -> None:
        capture = self.styles[self.styles.index("_captureUiState()"):self.styles.index("_restoreUiState(state)")]
        for expected in ("root.activeElement", "selectionStart", "scrollTop", "details[id],details[data-queue-log]"):
            with self.subTest(expected=expected):
                self.assertIn(expected, capture)


if __name__ == "__main__":
    unittest.main()
