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
ES module that expects a live panel; the indentation contract below is what keeps
the scan honest, and the count assertions catch it matching nothing.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import unittest


SPECS = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "dratek_eink"
    / "frontend"
    / "panel"
    / "panel-template-svg.mixin.js"
)

# `  <id>: () => [` at six spaces opens a template; `{ <key>:` at eight spaces is
# one of its rows. Cells nested inside a row's array sit at ten spaces and must
# not be counted - a grid cell carrying an icon is not the template's own icon.
TEMPLATE = re.compile(r"^      (\w+): \(\) => \[$", re.MULTILINE)
ROW = re.compile(r"^        \{ (\w+):", re.MULTILINE)

# Rows that only take up space, and so say nothing about what a template looks like.
SPACERS = {"flex", "gap"}

# The old skeleton. A template made of nothing but these is the bug this file exists
# to prevent, so each one has to bring at least one real content block.
SKELETON = {"icon", "text", "rule", "footer"}

MINIMUM_TEMPLATES = 20


def _template_shapes() -> dict[str, tuple[str, ...]]:
    source = SPECS.read_text(encoding="utf-8")
    starts = [(match.group(1), match.start()) for match in TEMPLATE.finditer(source)]
    shapes: dict[str, tuple[str, ...]] = {}
    for index, (name, start) in enumerate(starts):
        end = starts[index + 1][1] if index + 1 < len(starts) else len(source)
        rows = [key for key in ROW.findall(source[start:end]) if key not in SPACERS]
        shapes[name] = tuple(sorted(rows))
    return shapes


class DisplayTemplateShapeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.shapes = _template_shapes()

    def test_the_scan_finds_every_template(self) -> None:
        self.assertGreaterEqual(len(self.shapes), MINIMUM_TEMPLATES)
        for name, shape in self.shapes.items():
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
