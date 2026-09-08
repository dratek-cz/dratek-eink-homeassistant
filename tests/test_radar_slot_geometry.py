"""An automatic refresh must put the Meteoradar back where the slot put it.

A large display's layout wraps every cell in a translated group, so the radar
<image>'s own x/y are slot-relative. The clean-background tier pastes the fresh
frame at the binding's x/y, so recording those raw numbers threw a radar in the
bottom row of a 2+3 layout up to the top of the panel on every automatic
refresh - while a manual send, which never reads the binding, stayed correct.
"""

from __future__ import annotations

import base64
import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
DEVICES_MIXIN = COMPONENT / "frontend" / "panel" / "panel-devices.mixin.js"
PACKAGE = "dratek_radar_slot_geometry_test"


def _load(name: str):
    if PACKAGE not in sys.modules:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(COMPONENT)]
        sys.modules[PACKAGE] = package
    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", COMPONENT / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


render = _load("render")


def _png_data_url(size: tuple[int, int], color: tuple[int, int, int]) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


# The bottom-left cell of the 2-up/3-down layout: one translated slot group
# holding a radar map that begins at the slot's own origin.
BOTTOM_LEFT_SLOT_SVG = (
    '<svg width="60" height="60">'
    '<g data-template-slot="2" transform="translate(0.00,20.00)">'
    '<image data-radar-part="map" x="0" y="0" width="60" height="40"'
    ' href="data:," id="template-radar-map-0"/>'
    "</g></svg>"
)


class ElementPositionTests(unittest.TestCase):
    def test_slot_translate_is_added_to_the_elements_own_coordinates(self) -> None:
        self.assertEqual(
            (0.0, 20.0),
            render._svg_element_position(BOTTOM_LEFT_SLOT_SVG, "template-radar-map-0"),
        )

    def test_nested_groups_accumulate(self) -> None:
        document = (
            '<svg><g transform="translate(10,5)"><g transform="translate(2,3)">'
            '<image x="1" y="1" id="deep"/></g></g></svg>'
        )
        self.assertEqual((13.0, 9.0), render._svg_element_position(document, "deep"))

    def test_a_group_that_already_closed_contributes_nothing(self) -> None:
        document = (
            '<svg><g transform="translate(100,100)"><rect/></g>'
            '<g transform="translate(0,20)"><image x="4" y="0" id="radar"/></g></svg>'
        )
        self.assertEqual((4.0, 20.0), render._svg_element_position(document, "radar"))

    def test_a_self_closing_group_does_not_shift_the_nesting(self) -> None:
        # The same trap _replace_svg_group_by_id documents: counting <g/> as an
        # opener leaves every later depth off by one, and the element would
        # inherit a translate it never sat inside.
        document = (
            '<svg><g transform="translate(0,20)"><g transform="translate(7,7)"/>'
            '<image x="4" y="0" id="radar"/></g></svg>'
        )
        self.assertEqual((4.0, 20.0), render._svg_element_position(document, "radar"))

    def test_an_untranslated_group_is_neutral(self) -> None:
        document = '<svg><g data-template-slot="0"><image x="4" y="6" id="radar"/></g></svg>'
        self.assertEqual((4.0, 6.0), render._svg_element_position(document, "radar"))

    def test_missing_element_or_coordinates_gives_no_answer(self) -> None:
        self.assertIsNone(render._svg_element_position(BOTTOM_LEFT_SLOT_SVG, "nope"))
        self.assertIsNone(
            render._svg_element_position('<svg><image id="radar"/></svg>', "radar")
        )


class CameraGeometryRepairTests(unittest.TestCase):
    def _repair(self, bindings: list[dict]) -> list[dict]:
        return render._bindings_with_resolved_camera_geometry(bindings, BOTTOM_LEFT_SLOT_SVG)

    def test_a_slot_relative_capture_is_lifted_into_panel_coordinates(self) -> None:
        binding = {"id": "template-radar-map-0", "type": "camera", "x": 0, "y": 0, "w": 60, "h": 40}
        self.assertEqual({"x": 0, "y": 20}, {k: self._repair([binding])[0][k] for k in ("x", "y")})

    def test_a_capture_that_was_already_right_is_left_alone(self) -> None:
        binding = {"id": "template-radar-map-0", "type": "camera", "x": 0, "y": 20, "w": 60, "h": 40}
        self.assertEqual([binding], self._repair([binding]))

    def test_the_original_binding_is_not_mutated(self) -> None:
        binding = {"id": "template-radar-map-0", "type": "camera", "x": 0, "y": 0}
        self._repair([binding])
        self.assertEqual(0, binding["y"])

    def test_other_binding_types_are_untouched(self) -> None:
        binding = {"id": "template-radar-map-0", "type": "text", "x": 0, "y": 0}
        self.assertEqual([binding], self._repair([binding]))

    def test_an_untagged_camera_keeps_whatever_geometry_it_has(self) -> None:
        binding = {"id": "designer-cam", "type": "camera", "x": 3, "y": 4}
        self.assertEqual([binding], self._repair([binding]))

    def test_without_a_captured_template_nothing_can_be_resolved(self) -> None:
        binding = {"id": "template-radar-map-0", "type": "camera", "x": 0, "y": 0}
        self.assertEqual([binding], render._bindings_with_resolved_camera_geometry([binding], ""))


class AutomaticRefreshPlacementTests(unittest.TestCase):
    """End to end: the tier that actually pastes the frame gets it right."""

    def _refresh(self, binding: dict) -> Image.Image:
        white = _png_data_url((60, 60), (255, 255, 255))
        return render.render_automatic_refresh_image(
            white,
            BOTTOM_LEFT_SLOT_SVG,
            white,
            [binding],
            {"template-radar-map-0": _png_data_url((60, 40), (0, 0, 0))},
        ).convert("RGB")

    def test_a_bottom_row_radar_stays_in_the_bottom_row(self) -> None:
        image = self._refresh(
            {"id": "template-radar-map-0", "type": "camera", "x": 0, "y": 0, "w": 60, "h": 40}
        )
        self.assertEqual((255, 255, 255), image.getpixel((30, 5)))  # top row untouched
        self.assertEqual((0, 0, 0), image.getpixel((30, 40)))  # radar in its own cell

    def test_a_full_panel_radar_still_covers_the_panel(self) -> None:
        document = (
            '<svg width="60" height="60"><g data-template-slot="0" transform="translate(0.00,0.00)">'
            '<image data-radar-part="map" x="0" y="0" width="60" height="60"'
            ' href="data:," id="template-radar-map-0"/></g></svg>'
        )
        white = _png_data_url((60, 60), (255, 255, 255))
        image = render.render_automatic_refresh_image(
            white,
            document,
            white,
            [{"id": "template-radar-map-0", "type": "camera", "x": 0, "y": 0, "w": 60, "h": 60}],
            {"template-radar-map-0": _png_data_url((60, 60), (0, 0, 0))},
        ).convert("RGB")
        self.assertEqual((0, 0, 0), image.getpixel((30, 5)))


class PanelCaptureTests(unittest.TestCase):
    """The panel must record the radar's place on the panel, not in its slot."""

    def setUp(self) -> None:
        self.js = DEVICES_MIXIN.read_text(encoding="utf-8")
        start = self.js.index("const radarImages = ")
        self.capture = self.js[start : self.js.index("const svgTemplate =", start)]

    def test_the_radar_binding_resolves_its_ancestor_translates(self) -> None:
        self.assertIn("this._templateAutomationNodeOffset(radarImage)", self.capture)
        self.assertIn('radarOffset.x + (Number(radarImage.getAttribute("x")) || 0)', self.capture)
        self.assertIn('radarOffset.y + (Number(radarImage.getAttribute("y")) || 0)', self.capture)

    def test_the_raw_attribute_is_never_used_as_the_paste_position(self) -> None:
        self.assertNotIn('x: Math.round(Number(radarImage.getAttribute("x")) || 0)', self.capture)
        self.assertNotIn('y: Math.round(Number(radarImage.getAttribute("y")) || 0)', self.capture)

    def test_slots_are_still_the_translated_groups_this_relies_on(self) -> None:
        svg_mixin = (COMPONENT / "frontend" / "panel" / "panel-template-svg.mixin.js").read_text(
            encoding="utf-8"
        )
        self.assertIn('<g data-template-slot="${index}" transform="translate(', svg_mixin)


if __name__ == "__main__":
    unittest.main()
