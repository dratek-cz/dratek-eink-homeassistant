"""Regression tests for the categorized display-designer tool library."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"
PANEL = FRONTEND / "dratek-eink-panel.js"
PANEL_MODULES = FRONTEND / "panel"


def _panel_source() -> str:
    """Concatenate the panel entry point with its feature modules.

    The panel used to be a single file; it now delegates to the mixin modules
    under frontend/panel/, so these markup and CSS assertions have to look at
    the whole set to stay meaningful.
    """
    parts = [PANEL.read_text(encoding="utf-8")]
    parts.extend(
        path.read_text(encoding="utf-8")
        for path in sorted(PANEL_MODULES.glob("*.js"))
    )
    return "\n".join(parts)


class FrontendToolLibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = _panel_source()

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

    def test_device_preview_opens_the_selected_device_in_designer(self):
        self.assertIn('const openDeviceInDesigner = async (address)', self.source)
        self.assertIn('await this._selectDevice(address, { render: false });', self.source)
        self.assertIn('this._activeTab = "designer";', self.source)
        self.assertIn('querySelectorAll("[data-select-device]")', self.source)
        self.assertIn('querySelectorAll("[data-device-card-open]")', self.source)

    def test_layers_share_the_sticky_tool_sidebar(self):
        self.assertIn('data-designer-side="tools"', self.source)
        self.assertIn('data-designer-side="layers"', self.source)
        self.assertIn('class="designer-layers-content"', self.source)
        self.assertIn('class="layer-row-actions"', self.source)
        self.assertNotIn('<div class="card layers-panel">', self.source)

    def test_display_health_uses_aligned_original_indicators_in_one_row(self):
        self.assertIn(
            ".display-health{grid-template-columns:minmax(0,1fr) "
            "minmax(0,1fr) minmax(0,1.25fr)",
            self.source,
        )
        self.assertIn("${this._renderBatterySegments(battery.percent)}", self.source)
        self.assertIn("${this._renderSignalBars(rssi)}", self.source)
        self.assertIn('class="health-route-icons"', self.source)
        self.assertIn(
            ".display-health-route>.health-route-icons{grid-column:1;grid-row:auto}",
            self.source,
        )
        self.assertIn("width:95%;max-width:370px", self.source)
        self.assertIn("grid-template-rows:1fr!important", self.source)
        self.assertIn("gap:6px", self.source)
        self.assertIn("overflow:visible;text-overflow:clip", self.source)
        self.assertIn("white-space:normal;overflow-wrap:anywhere", self.source)
        self.assertIn('class="health-icon health-icon-sub"', self.source)
        self.assertIn(".display-grid:not(.density-list) .display-health{padding:3px 0 2px}", self.source)
        self.assertIn(".display-grid:not(.density-list) .display-health-item{min-height:32px", self.source)

    def test_brand_and_primary_navigation_stay_visible_while_scrolling(self):
        self.assertIn('<div class="app-header">', self.source)
        self.assertIn(".app-header{position:sticky", self.source)
        self.assertIn("z-index:40;top:0", self.source)
        self.assertIn(
            ".tabbar .tab[data-tab=custom]{margin-left:0;border-left:0;"
            "box-shadow:none;filter:none;transform:none}",
            self.source,
        )

    def test_header_uses_the_combined_brand_image_without_duplicate_heading(self):
        self.assertIn("dratek-eink-header.png", self.source)
        self.assertIn('_frontendAssetUrl(path)', self.source)
        self.assertIn("border-radius:0;background:transparent;box-shadow:none;filter:none", self.source)
        self.assertIn(".topbar{padding:8px 18px 8px 0}", self.source)
        self.assertIn('class="brand-description"', self.source)
        self.assertIn("<strong>Editor šablon</strong>", self.source)
        self.assertIn("BLE diagnostika · správa displejů", self.source)
        self.assertNotIn("<h1>DRATEK eInk</h1>", self.source)

    def test_device_rename_is_inline_and_flash_button_is_removed(self):
        self.assertIn('class="display-name-inline"', self.source)
        self.assertIn('input?.select();', self.source)
        self.assertIn('event.key === "Enter"', self.source)
        self.assertIn('event.key === "Escape"', self.source)
        self.assertIn('class="tile-icon-btn tile-save-name-btn"', self.source)
        self.assertIn('data-device-name-save=', self.source)
        self.assertIn('this._saveDeviceName(address, input?.value', self.source)
        self.assertNotIn('data-flash-identify=', self.source)
        self.assertNotIn('class="device-name-edit display-name-edit"', self.source)

    def test_each_display_can_be_dragged_to_a_manual_gateway_in_the_map(self):
        self.assertNotIn('data-device-gateway=', self.source)
        self.assertIn('data-topology-device=', self.source)
        self.assertIn('data-topology-gateway=', self.source)
        self.assertIn('data-topology-unlock=', self.source)
        self.assertIn('event.dataTransfer.setData("text/plain", address)', self.source)
        self.assertIn('await this._saveDeviceGateway(address, group.dataset.topologyGateway)', self.source)
        self.assertIn('type: "dratek_eink/devices/set_gateway"', self.source)
        self.assertIn('device.gateway_selection === "manual"', self.source)
        self.assertIn(".connection-device.is-locked", self.source)
        self.assertIn("Ručně přiřazeno", self.source)

    def test_connection_map_shows_live_upload_and_rendering_status(self):
        self.assertIn('class="connection-transfer-state writing"', self.source)
        self.assertIn('class="connection-transfer-state uploaded"', self.source)
        self.assertIn("Úspěšně nahráno · displej se vykresluje", self.source)
        self.assertIn(".connection-device.is-writing", self.source)
        self.assertIn(".connection-device.is-uploaded", self.source)
        self.assertIn('["queue", "devices", "topology"].includes(this._activeTab)', self.source)

    def test_designer_device_summary_is_one_compact_row(self):
        self.assertIn(".designer-device-strip{display:flex!important", self.source)
        self.assertIn("min-height:44px", self.source)
        self.assertIn("overflow-x:auto;overflow-y:hidden", self.source)
        self.assertIn(
            ".designer-device-strip>.designer-device-primary{flex:1 0 210px",
            self.source,
        )
        self.assertIn("--designer-summary-icon-size:18px", self.source)
        self.assertIn(".designer-device-strip ha-icon .mdi{display:block", self.source)
        self.assertIn("width:27px;height:16px;min-width:27px;min-height:16px", self.source)
        self.assertIn("width:22px;height:16px;min-width:22px;min-height:16px", self.source)
        self.assertIn(".designer-device-strip .designer-device-meter .signal-bars span:nth-child(4){height:14px}", self.source)

    def test_designer_command_cards_match_the_page_visual_system(self):
        for label in ("Soubor", "Proměnné", "Mapování", "Pozadí a zařízení", "Zobrazení"):
            self.assertIn(f"<strong>{label}</strong>", self.source)
        self.assertIn('class="designer-command-card', self.source)
        self.assertIn('class="designer-command-icon"', self.source)
        self.assertIn('class="designer-command-copy"', self.source)
        self.assertIn('class="designer-command-actions"', self.source)
        self.assertIn('class="designer-menu-head"', self.source)
        self.assertIn(".designer-commandbar .designer-command-group{display:grid", self.source)
        self.assertIn(".designer-command-card.active", self.source)

    def test_400x300_display_uses_the_supplied_physical_frame(self):
        self.assertIn("_isLarge400Device", self.source)
        self.assertIn('class="designer-device-bezel device-preview-designer-copy', self.source)
        self.assertIn('${large400Layout ? "designer-device-large400" : ""}', self.source)
        self.assertIn('"designer-device-large400"', self.source)
        self.assertIn(".device-preview-empty{position:absolute", self.source)
        self.assertIn("background:#fff;mix-blend-mode:normal", self.source)
        self.assertIn("1039 / 898", self.source)
        self.assertIn('class="device-large400-bottom-band"', self.source)
        self.assertIn('class="device-large400-mac"', self.source)
        self.assertIn("_renderDeviceBarcode(address, true)", self.source)
        self.assertIn(".device-large400-label .device-preview-barcode.horizontal", self.source)

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

    def test_designer_selection_is_screen_scaled_and_rotates_with_objects(self):
        self.assertIn("_selectionUiUnit()", self.source)
        self.assertIn("canvas.width / rect.width", self.source)
        self.assertIn("ctx.lineWidth = 1.5 * uiUnit", self.source)
        self.assertIn("ctx.setLineDash([4 * uiUnit, 2 * uiUnit])", self.source)
        self.assertIn("_handles(box, Number(object.rotation || 0), uiUnit)", self.source)
        self.assertIn("_unrotatePoint(point, box, Number(object.rotation || 0))", self.source)
        self.assertIn("dx = globalDx * Math.cos(rotation)", self.source)
        self.assertIn("ctx.rotate(radians)", self.source)

    def test_text_auto_fit_uses_the_complete_object_area(self):
        self.assertIn("const measurementSize = 100", self.source)
        self.assertIn("const widthFit = availableW * measurementSize / measuredWidth", self.source)
        self.assertIn("const heightFit = availableH / Math.max(1, lines.length * 1.08)", self.source)
        self.assertIn("Math.floor(Math.min(widthFit, heightFit))", self.source)
        self.assertIn("object._renderedFontSize = fontSize", self.source)
        self.assertIn("key === \"fontSize\" && object.autoFit !== false", self.source)
        self.assertIn("object.autoFit !== false && Number.isFinite(Number(object._renderedFontSize))", self.source)
        self.assertIn('class="row text-font-row"', self.source)
        self.assertIn('if (changedProp === "fontSize")', self.source)
        self.assertIn("object.autoFit = false", self.source)
        self.assertIn(".properties-panel .text-font-row", self.source)

    def test_device_cards_scale_an_already_quantized_native_canvas(self):
        self.assertIn('const nativeCanvas = document.createElement("canvas");', self.source)
        self.assertIn("ctx.imageSmoothingEnabled = false;", self.source)
        self.assertIn(
            "ctx.drawImage(nativeCanvas, 0, 0, canvas.width, canvas.height);",
            self.source,
        )
        self.assertIn("Math.min(designerFrameWidth, designerFrameWidth / designerFrameRatio) * 0.06", self.source)
        self.assertIn('class="device-preview-designer-svg"', self.source)
        self.assertIn("<foreignObject", self.source)
        self.assertIn("designer-device-bezel device-preview-designer-copy", self.source)
        self.assertIn('width="${sourceWidth}" height="${sourceHeight}"', self.source)
        self.assertIn("device-preview-designer-svg{display:block", self.source)

    def test_designer_and_backend_share_the_bundled_display_font(self):
        self.assertIn('value="DRATEK eInk Sans" disabled', self.source)
        self.assertIn('const family = \'"DRATEK eInk Sans"\';', self.source)
        self.assertIn('document.fonts.load(\'600 24px "DRATEK eInk Sans"\')', self.source)
        self.assertIn("if (document.fonts && !this._designerFontReady)", self.source)
        self.assertIn("this._ensureDesignerFont();", self.source)

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

    def test_cached_backend_preview_prevents_renderer_flicker(self):
        self.assertIn("this._backendPreviewImage = image;", self.source)
        self.assertIn("this._paintCachedCanonicalPreview(canvas);", self.source)
        self.assertIn("this._backendPreviewAddress !== address", self.source)
        self.assertIn("context.imageSmoothingEnabled = false;", self.source)
        self.assertIn("if (hasAutomaticBindings && !this._drag)", self.source)
        self.assertIn('if (this._drag && this._drag.mode !== "marquee") return;', self.source)
        self.assertIn("const finishedObjectDrag = !!this._drag && !marquee", self.source)

    def test_writing_device_card_has_live_orange_status(self):
        self.assertIn('job.status === "writing"', self.source)
        self.assertIn('"is-writing"', self.source)
        self.assertIn("Právě se nahrává", self.source)
        self.assertIn('role="status" aria-live="polite"', self.source)
        self.assertIn(".display-tile.is-writing", self.source)
        self.assertIn(".display-writing-state", self.source)
        self.assertIn('["queue", "devices", "topology"].includes(this._activeTab)', self.source)

    def test_recently_uploaded_device_card_has_non_blocking_green_status(self):
        self.assertIn('job.status === "succeeded"', self.source)
        self.assertIn("Date.now() - 7000", self.source)
        self.assertIn('"is-uploaded"', self.source)
        self.assertIn("Úspěšně nahráno", self.source)
        self.assertIn("Displej se vykresluje", self.source)
        self.assertIn(".display-tile.is-uploaded", self.source)
        self.assertIn(".display-uploaded-state", self.source)


if __name__ == "__main__":
    unittest.main()
