"""Regression tests for the categorized display-designer tool library."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = (
    ROOT
    / "custom_components"
    / "dratek_eink"
    / "frontend"
    / "dratek-eink-panel.js"
)


class FrontendToolLibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PANEL.read_text(encoding="utf-8")

    def test_library_exposes_all_categories_and_direct_widgets(self):
        for category in ("basic", "data", "status", "custom"):
            self.assertIn(f'data-tool-category="{category}"', self.source)
        for widget in ("chart", "bar_gauge", "pie", "slider", "gauge", "status"):
            self.assertIn(f'toolButton("{widget}"', self.source)

    def test_direct_widgets_participate_in_automatic_refresh(self):
        start = self.source.rindex("  _automaticTextBindings()")
        end = self.source.index("  _entityAutomationPayload()", start)
        automatic_filter = self.source[start:end]
        for widget in ("bar_gauge", "pie", "slider", "gauge", "potentiometer"):
            self.assertIn(f'"{widget}"', automatic_filter)
        self.assertIn('type: "layered"', self.source)

    def test_inspector_sections_are_collapsible(self):
        self.assertIn('<details class="inspector-section"', self.source)
        self.assertIn('class="inspector-chevron"', self.source)

    def test_delete_shortcut_covers_both_designers(self):
        self.assertIn('this._deleteSelected();', self.source)
        self.assertIn('this._deleteCustomLayerObject();', self.source)
        self.assertIn('this._activeTab === "custom"', self.source)
        self.assertIn('event.key === "Delete" || event.key === "Backspace"', self.source)

    def test_layers_share_the_sticky_tool_sidebar(self):
        self.assertIn('data-designer-side="tools"', self.source)
        self.assertIn('data-designer-side="layers"', self.source)
        self.assertIn('class="designer-layers-content"', self.source)
        self.assertIn('class="layer-row-actions"', self.source)
        self.assertNotIn('<div class="card layers-panel">', self.source)

    def test_display_health_keeps_gateway_in_the_same_row(self):
        self.assertIn(
            ".display-health{grid-template-columns:minmax(70px,.72fr) "
            "minmax(70px,.72fr) minmax(120px,1.56fr)",
            self.source,
        )
        self.assertIn(".display-health-route{grid-column:auto", self.source)

    def test_connection_map_uses_plain_lines(self):
        self.assertIn(".connection-device:after{display:none}", self.source)
        self.assertIn(
            ".connection-device:before{content:\"\";position:absolute;",
            self.source,
        )
        self.assertIn(".connection-device:hover{transform:none}", self.source)

    def test_designer_preview_uses_exact_pixel_geometry(self):
        self.assertIn("--designer-screen-width:", self.source)
        self.assertIn("--designer-screen-height:", self.source)
        self.assertIn("box-sizing:content-box", self.source)
        self.assertIn("image-rendering:pixelated", self.source)
        self.assertIn(
            "(event.clientX - rect.left) * canvas.width / Math.max(1, rect.width)",
            self.source,
        )

    def test_device_cards_scale_an_already_quantized_native_canvas(self):
        self.assertIn('const nativeCanvas = document.createElement("canvas");', self.source)
        self.assertIn("ctx.imageSmoothingEnabled = false;", self.source)
        self.assertIn(
            "ctx.drawImage(nativeCanvas, 0, 0, canvas.width, canvas.height);",
            self.source,
        )

    def test_designer_and_backend_share_the_bundled_display_font(self):
        self.assertIn('value="DRATEK eInk Sans" disabled', self.source)
        self.assertIn('const family = \'"DRATEK eInk Sans"\';', self.source)
        self.assertIn('document.fonts.load(\'600 24px "DRATEK eInk Sans"\')', self.source)

    def test_chart_automation_preserves_the_complete_layout(self):
        for field in (
            "chartLabels",
            "xLabel",
            "yLabel",
            "chartMin",
            "chartMax",
            "legendFontSize",
            "showAxes",
            "showGrid",
            "showValues",
            "backgroundColor",
            "graphColor",
        ):
            self.assertIn(field, self.source)
        self.assertIn('chartType === "bar" ? (object.barColor', self.source)

    def test_designer_and_manual_send_use_canonical_backend_preview(self):
        self.assertIn('type: "dratek_eink/render_preview"', self.source)
        self.assertIn("this._scheduleCanonicalDesignerPreview();", self.source)
        self.assertIn("await this._renderCanonicalPreview(automation, device.address)", self.source)
        self.assertIn("image,", self.source)


if __name__ == "__main__":
    unittest.main()
