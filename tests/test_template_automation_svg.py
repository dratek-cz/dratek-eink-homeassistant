"""Wiring pins for the 1:1 automatic-update path.

The behaviour of the DOM-driven binding extraction can't run without a browser,
so these guard the source: every template variable still yields a slot (the
dropped-value fix), the panel hands the backend the geometry it needs to rebuild
the text, and the backend actually chooses the SVG renderer.
"""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


class FrontendCaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_slot_is_kept_when_the_marker_is_reformatted_away(self) -> None:
        # The fix: a slot belongs to the variable when overriding it changed the
        # rendered text, not only when the raw marker survives verbatim. The old
        # includes()-only test dropped number/ellipsis/empty slots.
        self.assertIn("const drivenByVariable", self.devices)
        self.assertIn("markedText !== String(currentText?.textContent", self.devices)

    def test_binding_carries_svg_geometry_for_the_backend(self) -> None:
        self.assertIn("svg: {", self.devices)
        for field in ("cx:", "cy:", "maxWidth:", "anchor,", "color: colorHex", "bg: backgroundHex"):
            with self.subTest(field=field):
                self.assertIn(field, self.devices)

    def test_max_width_never_shrinks_the_current_value(self) -> None:
        # svgMaxWidth is at least this run's own text width, so re-rendering the
        # shown value is a no-op fit and stays identical to the manual send.
        self.assertIn("const svgMaxWidth = Math.max(maxWidth", self.devices)


class BackendWiringTests(unittest.TestCase):
    def test_render_exposes_the_svg_path_with_a_covering_rect(self) -> None:
        render = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.assertIn("def render_entity_bound_svg_image(", render)
        self.assertIn("def _svg_text_slot(", render)
        # The slot repaints its background so stale pixels are covered.
        self.assertIn('<rect', render)
        # Fallback forces the captured size instead of PIL autoFit.
        self.assertIn('"autoFit": False', render)

    def test_render_exposes_the_full_template_path(self) -> None:
        # The primary path: substitute fresh values into the captured whole
        # template SVG and rasterise it - no covering rect needed, since the
        # real background (icons, gradients, photos) is simply still there.
        render = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.assertIn("def render_entity_bound_template_image(", render)
        self.assertIn("def _replace_svg_element_by_id(", render)
        self.assertIn("def render_automatic_refresh_image(", render)
        self.assertIn("element_id=element_id,", render)

    def test_automation_delegates_the_render_choice_to_render_py(self) -> None:
        automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        self.assertIn("render_automatic_refresh_image", automation)
        self.assertIn('config.get("svg_template")', automation)

    def test_manifest_requires_the_rasteriser(self) -> None:
        manifest = (COMPONENT / "manifest.json").read_text(encoding="utf-8")
        self.assertIn("resvg-py", manifest)


if __name__ == "__main__":
    unittest.main()
