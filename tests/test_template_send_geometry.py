"""What the panel receives must be built, not screenshotted.

The send path used to clone the visible preview into an SVG foreignObject and
rasterise that. The clone lost the scale transform and the positioning context of
the parent it was cut away from, so the drawing landed off-centre inside the
exported bitmap while the preview on screen looked correct. Measured on the
harness: 7 px of blank down the left edge of a portrait tag, and 51 px - a sixth
of the panel - on a landscape one, with the right edge clipped to compensate.

Building the SVG directly has no DOM to lose. This file pins that the screenshot
exporter stays gone and that the send path goes through the renderer.
"""

from __future__ import annotations

from pathlib import Path
import unittest


PANEL = (
    Path(__file__).resolve().parents[1]
    / "custom_components" / "dratek_eink" / "frontend" / "panel"
)


class TemplateSendGeometryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")

    def test_the_dom_screenshot_exporter_is_gone(self) -> None:
        for fragment in (
            "_rasterizeDisplayTemplatePreview",
            "template-export-preview-body",
            "new XMLSerializer().serializeToString",
        ):
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, self.devices)

    def test_the_send_path_uses_the_renderer(self) -> None:
        self.assertIn(
            '_renderCurrentDisplayTemplateImage(device = this._device(), customSourceOverride = "") {',
            self.devices,
        )
        self.assertIn("return await this._rasterizeDisplayTemplateSvg(", self.devices)
        # and the remembered thumbnail is that same image, not a second rendering
        self.assertIn(
            "const image = await this._renderCurrentDisplayTemplateImage(device);",
            self.devices,
        )

    def test_the_renderer_draws_at_the_panel_resolution(self) -> None:
        # No bounding-rect anywhere in the raster path: a CSS measurement is what
        # let the exported geometry drift from the display's real pixels. The
        # actual canvas mechanics live in _rasterizeSvgStringToPng, the tail
        # _rasterizeDisplayTemplateSvg delegates to (also reused by the
        # clean_background capture, which rasterises a ready SVG string
        # directly rather than building one from templates every time).
        raster = self.svg[self.svg.index("async _rasterizeSvgStringToPng("):]
        raster = raster[: raster.index("\n  },")]
        self.assertNotIn("getBoundingClientRect", raster)
        self.assertIn("canvas.width = width;", raster)
        self.assertIn("canvas.height = height;", raster)

    def test_editor_overlays_are_still_composited(self) -> None:
        # Overlay elements exist only in the preview's HTML, so dropping the DOM
        # screenshot would have quietly stopped them reaching the panel.
        self.assertIn("_collectTemplateOverlayBoxes() {", self.devices)
        self.assertIn("_paintTemplateOverlays(context, overlays, width, height) {", self.devices)
        self.assertIn("if (paintOverlay) paintOverlay(context, width, height);", self.svg)
        # and they must land before quantisation, or they leave the panel's palette
        raster = self.svg[self.svg.index("async _rasterizeDisplayTemplateSvg("):]
        self.assertLess(
            raster.index("paintOverlay(context, width, height)"),
            raster.index("_quantizeEinkPixel"),
        )


if __name__ == "__main__":
    unittest.main()
