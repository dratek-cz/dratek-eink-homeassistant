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
        self.assertIn("_collectTemplateOverlayBoxes(request) {", self.devices)
        self.assertIn("_paintTemplateOverlays(context, overlays, width, height) {", self.devices)
        self.assertIn("if (paintOverlay) paintOverlay(context, width, height);", self.svg)
        # and they must land before quantisation, or they leave the panel's palette
        raster = self.svg[self.svg.index("async _rasterizeDisplayTemplateSvg("):]
        self.assertLess(
            raster.index("paintOverlay(context, width, height)"),
            raster.index("_quantizeEinkPixel"),
        )

    def test_overlays_are_read_from_the_model_not_the_dom(self) -> None:
        # The collector used to look up the designer's own surface and walk the
        # .template-overlay nodes inside it, which made the bitmap depend on
        # what happened to be on screen. It dropped elements three ways: with
        # the designer stage not mounted - the case for every device-preview
        # thumbnail, which renders from the overview and the settings pane -
        # there was no surface and it returned nothing at all; it read only
        # _templateEditorElements, so a multi-slot layout kept the open
        # template's elements and lost every other slot's; and it took the
        # first surface only, so a slot's percentages were applied to the whole
        # display instead of to that slot's rectangle.
        collector = self.devices[self.devices.index("  _collectTemplateOverlayBoxes(request) {"):]
        collector = collector[: collector.index("\n  },")]
        for dom in ("getBoundingClientRect", "querySelectorAll", "querySelector", "shadowRoot"):
            with self.subTest(dom=dom):
                self.assertNotIn(dom, collector)
        # Each slot's own template, positioned inside that slot's rectangle.
        self.assertIn("this._displayTemplateLayoutSlots(request.layout, width, height)", collector)
        self.assertIn("this._templateEditorElementsFor(template)", collector)
        self.assertIn("(slot.x + (Number(model.x || 0) / 100) * slot.w) / width", self.devices)

    def test_an_unopened_template_still_contributes_its_elements(self) -> None:
        # _templateEditorElements holds only whichever template is open in the
        # editor; the rest live in _templateEditorStates, or on the template
        # itself when it was never opened this session.
        resolver = self.devices[self.devices.index("  _templateEditorElementsFor(template) {"):]
        resolver = resolver[: resolver.index("\n  },")]
        self.assertIn("this._activeTemplateEditorStateId()", resolver)
        self.assertIn("this._templateEditorStates?.[id]?.editor_elements", resolver)
        self.assertIn("template.user_created ? template.editor_elements", resolver)

    def test_image_elements_are_redithered_at_the_size_they_land_in(self) -> None:
        # The element carried a bitmap dithered once into a 240px thumbnail,
        # and the painter nearest-neighbour scaled that into the element's box.
        # Resampling a halftone is not a smaller halftone - it breaks into
        # patches that threshold flat - so the original is dithered again at
        # exactly the pixel box, the way a custom_image slot already was.
        blocks = (PANEL / "panel-template-blocks.mixin.js").read_text(encoding="utf-8")
        self.assertIn("_prepareTemplateOverlayPhotos(images, width, height) {", blocks)
        self.assertIn('this._renderCustomImageBitmapAtSize(source, "stretch", w, h, paletteKey)', blocks)
        # And the painter waits for that decode rather than building an Image
        # whose .complete was still false on the first send.
        self.assertIn("context.drawImage(item.overlayImage, x, y, w, h)", self.devices)
        self.assertNotIn('item.kind === "image" && item.src.startsWith("data:image/")', self.devices)


if __name__ == "__main__":
    unittest.main()
