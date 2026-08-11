"""A panel method must be defined exactly once across the mixins.

Every panel-*.mixin.js file is an object literal that gets merged into one class.
A method defined twice is not an error in JavaScript - the later definition wins
and the earlier one becomes unreachable, so a stale copy can sit there for
releases while an edit to it changes nothing on screen. panel-inspector.mixin.js
carried four such shadowed copies (_inspectorColor, _inspectorSegments,
_inspectorToggle, _setInspectorProperty).
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import unittest


PANEL_DIR = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "dratek_eink"
    / "frontend"
    / "panel"
)

# Top-level entries of a mixin object literal: exactly two spaces of indent, a
# method name, then its argument list.
METHOD = re.compile(
    r"^  (?!(?:if|for|while|switch|catch|return|function)\b)([A-Za-z_$][\w$]*)\s*\(",
    re.MULTILINE,
)

# A mixin that suddenly parses as empty would make this whole file pass without
# checking anything, which is how a vacuous guard hides the next duplicate.
MIN_METHODS_PER_MIXIN = 1


def _method_names(path: Path) -> list[str]:
    return METHOD.findall(path.read_text(encoding="utf-8"))


class PanelMixinHygieneTests(unittest.TestCase):
    def test_the_scan_actually_finds_methods(self) -> None:
        for path in sorted(PANEL_DIR.glob("*.mixin.js")):
            with self.subTest(mixin=path.name):
                self.assertGreaterEqual(len(_method_names(path)), MIN_METHODS_PER_MIXIN)

    def test_no_method_is_defined_twice_in_the_same_mixin(self) -> None:
        for path in sorted(PANEL_DIR.glob("*.mixin.js")):
            duplicates = [
                name for name, count in Counter(_method_names(path)).items() if count > 1
            ]
            with self.subTest(mixin=path.name):
                self.assertEqual([], sorted(duplicates))

    def test_no_method_is_defined_in_two_different_mixins(self) -> None:
        owners: dict[str, list[str]] = {}
        for path in sorted(PANEL_DIR.glob("*.mixin.js")):
            for name in set(_method_names(path)):
                owners.setdefault(name, []).append(path.name)
        shared = {name: files for name, files in owners.items() if len(files) > 1}
        self.assertEqual({}, shared)


if __name__ == "__main__":
    unittest.main()
