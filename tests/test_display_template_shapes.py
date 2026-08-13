"""No two display templates may be built from the same blocks.

Every template used to be the same six rows - icon, title, rule, value, list,
footer - with different words in them. Twenty templates therefore looked like one
template twenty times, and picking between them in the designer told you nothing
until you read the text. That was not a content problem: the SVG renderer only
knew those six row kinds, so there was nothing else a template could be.

The renderer now has a block vocabulary (bars, meters, ring, dial, grid, steps,
checklist, strip, split, spark, datebox, board, band, stat) and each template
picks a different combination. This test pins that: it reads the row-level keys
out of every spec and fails if two templates end up with the same shape, or if a
template falls back to nothing but the old skeleton.

It scans the source text rather than executing it because the specs are inside an
ES module that expects a live panel. Each template's `design` function now lives in
its own file under frontend/panel/templates/ (one file per template - see that
directory's own README-style comment in index.js) rather than all sharing one fixed
column of indentation, so the scan below walks bracket depth instead of matching a
literal indentation column: a "row" is anything that is a direct element of the
array `design` returns, however that function or its array happens to be indented,
and anything nested deeper (a grid cell, a footer entry) is not. The count
assertions catch the scan matching nothing.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import unittest


TEMPLATES_DIR = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "dratek_eink"
    / "frontend"
    / "panel"
    / "templates"
)
TEMPLATE_FILES = tuple(sorted(
    path for path in TEMPLATES_DIR.glob("*.js") if path.name not in {"index.js", "shared.js"}
))

TEMPLATE_ID = re.compile(r'id:\s*"(\w+)"')
DESIGN_ARROW = re.compile(r"design:\s*\([^)]*\)\s*=>\s*")
ROW_KEY = re.compile(r"\{\s*(\w+):")

# Rows that only take up space, and so say nothing about what a template looks like.
SPACERS = {"flex", "gap"}

# The old skeleton. A template made of nothing but these is the bug this file exists
# to prevent, so each one has to bring at least one real content block.
SKELETON = {"icon", "text", "rule", "footer"}

MINIMUM_TEMPLATES = 20

# A template built from a single full-bleed content block is already maximally
# distinctive - there is nothing the old icon/title/rule/value/list/footer
# skeleton could be confused with here, so the row-count floor below does not
# apply to it. Each entry needs a reason, not just a name.
SINGLE_ROW_TEMPLATES = {
    # The whole panel is one live map image; anything else drawn over it would
    # just cover the data it exists to show.
    "radar",
    # A hardware calibration target must be nothing except its edge-to-edge
    # palette pixels; titles, footers or extra rows would contaminate the test.
    "shading_test",
}


def _design_row_array_source(source: str) -> str:
    """Return just the `[ ...rows... ]` a template's `design` function returns.

    Handles both shapes in the templates/ directory: `design: (helpers) => [...]`
    (the array follows the arrow directly) and `design: (helpers) => { ... return
    [...]; ... }` (a block body, used by templates - price, cz_spot_prices - whose
    rows depend on a branch or a computed value first).
    """
    arrow = DESIGN_ARROW.search(source)
    if not arrow:
        return ""
    rest = source[arrow.end():]
    if rest.lstrip().startswith("["):
        array_start = rest.index("[")
    else:
        # A block-bodied design (cz_spot_prices computes a chart series first;
        # price branches on whether the sale option is on) can contain more than
        # one `return [` - a `.map()` callback computing labels, an early-return
        # branch. The last one in the function is always the one that actually
        # returns the row array: everything a design function computes before
        # its own return is in service of that return, not the other way round.
        return_matches = list(re.finditer(r"return\s*\[", rest))
        if not return_matches:
            return ""
        array_start = return_matches[-1].end() - 1
    depth = 0
    for index in range(array_start, len(rest)):
        char = rest[index]
        if char in "[{(":
            depth += 1
        elif char in "]})":
            depth -= 1
            if depth == 0:
                return rest[array_start:index + 1]
    return rest[array_start:]


def _row_keys(array_source: str) -> list[str]:
    """Keys of objects that are direct elements of the row array.

    Walks bracket depth rather than matching an indentation column: the array's
    own `[` puts us at depth 1, so a row object's opening `{` lands at depth 2 -
    anything nested inside a row (a grid cell, a footer entry's own object) opens
    at depth 3 or deeper and is correctly not counted as a row of its own.
    """
    keys: list[str] = []
    depth = 0
    for index, char in enumerate(array_source):
        if char in "[{(":
            depth += 1
            if char == "{" and depth == 2:
                match = ROW_KEY.match(array_source[index:])
                if match:
                    keys.append(match.group(1))
        elif char in "]})":
            depth -= 1
    return [key for key in keys if key not in SPACERS]


def _template_shapes() -> dict[str, tuple[str, ...]]:
    shapes: dict[str, tuple[str, ...]] = {}
    for path in TEMPLATE_FILES:
        source = path.read_text(encoding="utf-8")
        id_match = TEMPLATE_ID.search(source)
        if not id_match:
            continue
        rows = _row_keys(_design_row_array_source(source))
        shapes[id_match.group(1)] = tuple(sorted(rows))
    return shapes


class DisplayTemplateShapeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.shapes = _template_shapes()

    def test_the_scan_finds_every_template(self) -> None:
        self.assertGreaterEqual(len(self.shapes), MINIMUM_TEMPLATES)
        for name, shape in self.shapes.items():
            if name in SINGLE_ROW_TEMPLATES:
                continue
            with self.subTest(template=name):
                self.assertGreaterEqual(len(shape), 3, "the row scan found almost nothing")

    def test_no_two_templates_are_built_the_same_way(self) -> None:
        seen: dict[tuple[str, ...], list[str]] = {}
        for name, shape in self.shapes.items():
            seen.setdefault(shape, []).append(name)
        duplicates = {shape: names for shape, names in seen.items() if len(names) > 1}
        self.assertEqual(
            {},
            duplicates,
            "these templates are the same arrangement with different words in it",
        )

    def test_every_template_carries_a_content_block(self) -> None:
        for name, shape in self.shapes.items():
            with self.subTest(template=name):
                self.assertTrue(
                    set(shape) - SKELETON,
                    "template is nothing but icon/title/rule/footer again",
                )

    def test_the_block_vocabulary_is_actually_spread_around(self) -> None:
        # A vocabulary that exists but is used by one template each would still leave
        # the catalog looking uniform, and one used everywhere would mean it is not
        # doing any distinguishing. Neither is asserted precisely - what matters is
        # that a good number of distinct content blocks are in play.
        content = Counter(key for shape in self.shapes.values() for key in shape if key not in SKELETON)
        self.assertGreaterEqual(len(content), 12, "the templates draw on too few block kinds")
        for key, count in content.items():
            with self.subTest(block=key):
                self.assertLessEqual(count, len(self.shapes) // 2, f"{key} is on too many templates to distinguish any")


if __name__ == "__main__":
    unittest.main()
