"""Meteoradar must not drag the rest of the display down a weaker tier.

render_automatic_refresh_image picks between two renderers. The preferred one
composites fresh values over a value-free background the panel captured with a
real browser, which matches a manual send for every binding type. The other
substitutes values into the captured SVG and is documented as the fallback for
designs saved before the first existed.

A camera binding used to force the second one for the whole image, because the
clean-background tier had no camera case and pasting a frame over it would have
covered Meteoradar's legend. That tier has since grown one - it composites the
frame at the binding's own x/y/w/h, which panel-devices.mixin.js sends for
exactly this purpose - so the exception outlived its reason.

Reported on a 400x300 running two stacked templates, Meteoradar above and
Weather below: the radar refreshed correctly while the weather template came
back with only its static icon and "Aktualizováno" footer, every bound value
and icon gone. One camera in one slot had demoted both slots.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _load_render():
    package = types.ModuleType("dratek_refresh_tier_test")
    package.__path__ = [str(COMPONENT)]
    sys.modules[package.__name__] = package
    spec = importlib.util.spec_from_file_location(
        f"{package.__name__}.render", COMPONENT / "render.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


render = _load_render()

CAMERA_WITH_GEOMETRY = {
    "id": "radar-0", "type": "camera", "entity_id": "camera.meteoradar",
    "x": 0, "y": 0, "w": 400, "h": 150, "width": 400, "height": 150,
}
# A design captured before the panel started sending the box.
CAMERA_WITHOUT_GEOMETRY = {"id": "radar-0", "type": "camera", "entity_id": "camera.meteoradar"}
WEATHER_TEXT = {"id": "weather-1", "type": "text", "svg": {"cx": 10, "cy": 200, "size": 12}}


class TierChoiceTests(unittest.TestCase):
    """Which renderer gets used, recorded by monkeypatching both."""

    def setUp(self) -> None:
        self.calls: list[str] = []
        self._clean = render.render_entity_bound_clean_background_image
        self._template = render.render_entity_bound_template_image
        render.render_entity_bound_clean_background_image = (
            lambda *a, **k: (self.calls.append("clean"), "IMAGE")[1]
        )
        render.render_entity_bound_template_image = (
            lambda *a, **k: (self.calls.append("svg"), "IMAGE")[1]
        )

    def tearDown(self) -> None:
        render.render_entity_bound_clean_background_image = self._clean
        render.render_entity_bound_template_image = self._template

    def _run(self, bindings, clean="CLEAN", svg="SVG"):
        render.render_automatic_refresh_image("BASE", svg, clean, bindings, {})
        return self.calls

    def test_meteoradar_beside_another_template_uses_the_preferred_tier(self) -> None:
        # The reported case. Both slots must be rendered the good way.
        self.assertEqual(self._run([CAMERA_WITH_GEOMETRY, WEATHER_TEXT]), ["clean"])

    def test_meteoradar_alone_also_uses_the_preferred_tier(self) -> None:
        self.assertEqual(self._run([CAMERA_WITH_GEOMETRY]), ["clean"])

    def test_a_capture_without_the_camera_box_still_uses_the_svg_tier(self) -> None:
        # Older designs carry no x/y/w/h, so the clean-background tier has
        # nowhere to put the frame - those must keep the previous route.
        self.assertEqual(self._run([CAMERA_WITHOUT_GEOMETRY, WEATHER_TEXT]), ["svg"])

    def test_a_camera_without_geometry_and_no_svg_capture_still_renders(self) -> None:
        # Nothing to fall back to: the preferred tier has to try anyway rather
        # than the caller shipping nothing.
        self.assertEqual(self._run([CAMERA_WITHOUT_GEOMETRY], svg=""), ["clean"])

    def test_a_display_with_no_camera_is_unaffected(self) -> None:
        self.assertEqual(self._run([WEATHER_TEXT]), ["clean"])

    def test_without_a_clean_capture_the_svg_tier_is_used(self) -> None:
        self.assertEqual(self._run([CAMERA_WITH_GEOMETRY, WEATHER_TEXT], clean=""), ["svg"])


class CleanTierCameraSupportTests(unittest.TestCase):
    """The premise of the fix: that tier really can place a camera frame."""

    def test_it_has_a_camera_branch(self) -> None:
        source = (COMPONENT / "render.py").read_text(encoding="utf-8")
        body = source[source.index("def render_entity_bound_clean_background_image") :]
        body = body[: body.index("\ndef ", 10)]
        self.assertIn('if binding.get("type") == "camera":', body)
        self.assertIn("_composite_binding(image, binding, camera_layer)", body)

    def test_the_panel_sends_the_geometry_that_branch_needs(self) -> None:
        panel = (
            COMPONENT / "frontend" / "panel" / "panel-devices.mixin.js"
        ).read_text(encoding="utf-8")
        block = panel[panel.index('type: "camera"') :][:600]
        for key in ("x:", "y:", "w:", "h:"):
            self.assertIn(key, block)


if __name__ == "__main__":
    unittest.main()
