"""The panel must not treat an unfinished ha-icon as a rendered one.

Home Assistant's ha-icon renders an <ha-svg-icon>, which renders
<svg><g>...</g></svg> through Lit. The <svg> and its empty <g> exist from the
first frame; the <path> arrives only once the mdi chunk has loaded. The panel
used to accept any non-empty <svg>, so it captured the empty group, cached it as
a resolved icon and never retried - whichever icons lost that race were blank for
the rest of the session. The weather template draws five icons out of one chunk
and lost it every time, while the house template happened to win.

The test harness could not reproduce any of this: its stand-in wrote the finished
<svg> with its <path> in a single step and had no ha-svg-icon in between. This
file pins both halves of the fix - the readiness test in the panel, and a harness
faithful enough for that test to mean something.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
HARNESS = ROOT / "tests" / "dratek-eink-panel-harness.html"

DRAWABLE = "path[d],circle,rect,polygon,polyline,ellipse,line,text,image,use"


class PanelIconReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.harness = HARNESS.read_text(encoding="utf-8")

    def test_readiness_requires_a_drawable_node(self) -> None:
        self.assertIn(DRAWABLE, self.devices)
        self.assertIn("_findRenderedIconSvg(root) {", self.devices)

    def test_every_wait_for_an_icon_uses_that_test(self) -> None:
        # _findSvgDeep on its own is satisfied by an empty <svg>. Its own recursion
        # and the one call inside _findRenderedIconSvg are the only legitimate uses;
        # anywhere else it would be deciding readiness again.
        allowed = []
        for holder in ("_findSvgDeep(root) {", "_findRenderedIconSvg(root) {"):
            start = self.devices.index(holder)
            allowed.append((start, self.devices.index("\n  },", start)))

        checked = 0
        for name, source in (("devices", self.devices), ("template-svg", self.svg)):
            for match in re.finditer(r"this\._findSvgDeep\(", source):
                if name == "devices" and any(a <= match.start() <= b for a, b in allowed):
                    continue
                checked += 1
                line = source[: match.start()].count("\n") + 1
                with self.subTest(mixin=name, line=line):
                    self.fail(
                        f"raw _findSvgDeep decides icon readiness at {name}:{line}: "
                        f"{source.splitlines()[line - 1].strip()}"
                    )
        self.assertEqual(0, checked)

    def test_the_harness_models_the_two_element_nesting(self) -> None:
        self.assertIn('customElements.define("ha-svg-icon"', self.harness)
        self.assertIn("<ha-svg-icon></ha-svg-icon>", self.harness)
        # The empty group has to exist before the path does, or the harness cannot
        # reproduce the window the bug lived in.
        self.assertRegex(self.harness, r"<g>\$\{\s*\n?\s*path \?")

    def test_the_harness_delivers_the_path_asynchronously(self) -> None:
        self.assertRegex(self.harness, r"setTimeout\(\(\) => \{[\s\S]*?setAttribute\(\"path\"")


if __name__ == "__main__":
    unittest.main()
