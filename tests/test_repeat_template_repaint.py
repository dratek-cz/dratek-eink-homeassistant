"""Re-applying the template a display already shows must not blank its preview.

`_paint()` deduplicates itself per task so a burst of callers in one event
handler results in one repaint. `_render()` replaces the whole `.page`
subtree, which throws away every canvas an earlier paint in that same task
had drawn into - so a render that happens *after* a paint has to be allowed
to paint again, or the fresh canvases stay blank.

Applying a template that is already assigned runs
`_render()` -> `_applyTemplate()` -> `_render()` -> `_paint()` in a single
click handler. Without the reset the last two paints were both swallowed by
the guard, and because the dithered preview image for that exact key was
already cached there was no async image load left to trigger a late repaint.
The display preview simply vanished on the second click.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
RENDER_MIXIN = PANEL / "panel-render-ui.mixin.js"
PREVIEW_MIXIN = PANEL / "panel-preview.mixin.js"
INSPECTOR_MIXIN = PANEL / "panel-inspector.mixin.js"


class RepeatTemplateRepaintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.render_source = RENDER_MIXIN.read_text(encoding="utf-8")
        self.preview_source = PREVIEW_MIXIN.read_text(encoding="utf-8")
        self.inspector_source = INSPECTOR_MIXIN.read_text(encoding="utf-8")

    def _render_body(self) -> str:
        match = re.search(r"\n  _render\(\) \{(.*?)\n  \},", self.render_source, re.S)
        self.assertIsNotNone(match, "_render not found")
        return match.group(1)

    def test_paint_still_dedupes_within_one_task(self) -> None:
        # The guard itself has to stay - it is what keeps a single click from
        # redrawing every canvas several times over.
        self.assertIn("if (this._paintedInCurrentTask) return;", self.preview_source)
        self.assertIn("this._paintedInCurrentTask = true;", self.preview_source)

    def test_render_clears_the_paint_guard_before_repainting(self) -> None:
        body = self._render_body()
        self.assertIn("this._paintedInCurrentTask = false;", body)

    def test_the_reset_precedes_the_paint_that_render_performs(self) -> None:
        body = self._render_body()
        reset = body.index("this._paintedInCurrentTask = false;")
        paint = body.rindex("this._paint();")
        self.assertLess(reset, paint, "the guard must be cleared before _render paints")

    def test_the_reset_happens_after_the_dom_has_been_swapped(self) -> None:
        # Clearing it before the swap would let an unrelated paint sneak in and
        # re-arm the guard against the canvases this render is about to create.
        body = self._render_body()
        swap = body.index("currentPage.replaceWith(nextPage)")
        reset = body.index("this._paintedInCurrentTask = false;")
        self.assertLess(swap, reset)

    def test_repeated_assignment_is_still_a_no_op_on_the_assignment_itself(self) -> None:
        # The repaint fix does not replace the duplicate-click guard in
        # openDisplayTemplate; both are needed and both must stay.
        self.assertIn(
            "if (previousAssigned.includes(templateId) && !isPlacementMove) {",
            self.inspector_source,
        )


if __name__ == "__main__":
    unittest.main()
