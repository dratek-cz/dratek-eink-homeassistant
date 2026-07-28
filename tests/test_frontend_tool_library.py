"""Regression tests for the categorized display-designer tool library."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"
PANEL = FRONTEND / "dratek-eink-panel.js"
PANEL_MODULES = FRONTEND / "panel"
HARNESS = ROOT / "tests" / "dratek-eink-panel-harness.html"


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
        cls.harness = HARNESS.read_text(encoding="utf-8")

    def test_library_exposes_all_categories_and_direct_widgets(self):
        for category in ("basic", "data", "status", "custom"):
            self.assertIn(f'data-tool-category="{category}"', self.source)
        for widget in ("chart", "bar_gauge", "pie", "slider", "gauge", "status"):
            self.assertIn(f'toolButton("{widget}"', self.source)

    def test_direct_widgets_participate_in_automatic_refresh(self):
        start = self.source.rindex("  _automaticTextBindings()")
        end = self.source.index("  _canonicalRenderObjects()", start)
        automatic_filter = self.source[start:end]
        for widget in ("bar_gauge", "pie", "slider", "gauge", "potentiometer"):
            self.assertIn(f'"{widget}"', automatic_filter)
        self.assertIn('type: "layered"', self.source)

    def test_chart_and_status_have_reliable_entity_inputs(self):
        self.assertIn('data-entity-input=', self.source)
        self.assertIn('setEntityBinding', self.source)
        self.assertIn('"Vstup signalizace"', self.source)
        self.assertIn('placeholder="sensor.teplota nebo input_number.hodnota"', self.source)
        self.assertIn('customElements.define("ha-selector"', self.harness)
        self.assertIn('"sensor.spot_prices"', self.harness)
        self.assertIn('"binary_sensor.dvere_dilna"', self.harness)

    def test_variables_use_the_native_home_assistant_entity_selector(self):
        self.assertIn('data-variable-entity-picker=', self.source)
        self.assertIn('data-variable-entity-attribute=', self.source)
        self.assertIn('<ha-selector data-variable-entity-picker=', self.source)
        self.assertIn('selector.selector = { entity: {} }', self.source)
        self.assertIn('selector.hass = this._hass', self.source)
        self.assertNotIn('<ha-entity-picker', self.source)
        self.assertIn('aria-label="Výběr entity Home Assistantu"', self.harness)
        self.assertIn('placeholder="Hledat podle názvu, Entity ID nebo hodnoty…"', self.harness)
        self.assertNotIn('this.innerHTML = `<select', self.harness)

    def test_gateway_workspace_uses_compact_management_layout(self):
        for marker in (
            'class="page-heading"',
            'class="gateway-workspace-tabs"',
            'class="gateway-card-grid"',
            'class="gateway-compact-card',
            'class="gateway-setup-grid"',
        ):
            self.assertIn(marker, self.source)
        self.assertIn("Moje gatewaye", self.source)
        self.assertIn("Najít v síti", self.source)
        self.assertIn("Nová gateway", self.source)
        self.assertIn('class="gateway-visual-slot"', self.source)
        self.assertIn(".gateway-compact-card{grid-template-rows:auto minmax(140px,1fr)", self.source)

    def test_gateway_board_picker_has_no_store_buttons(self):
        self.assertNotIn('class="board-option-cart"', self.source)
        self.assertNotIn("board.shop", self.source)
        self.assertNotIn("mdi:cart-outline", self.source)

    def test_stat_tiles_are_shared_by_queue_gateways_and_designer(self):
        # Vzorem je pruh dlaždic z fronty zápisu; Gatewaye i Designer ho přebírají.
        self.assertIn(".stat-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))", self.source)
        self.assertIn(".stat-tile{display:grid;grid-template-columns:auto minmax(0,1fr)", self.source)
        self.assertIn(".stat-tile-copy strong{font-size:20px;font-weight:900", self.source)
        self.assertIn('<div class="stat-tiles">', self.source)
        self.assertIn('<span class="stat-tile-copy"><strong>${this._gateways.length}</strong><small>Celkem</small></span>', self.source)
        # Gradientní hlavičky nahradil plochý nadpis a stejné dlaždice.
        self.assertNotIn('class="gateway-page-hero"', self.source)
        self.assertNotIn('class="gateway-page-metrics"', self.source)
        self.assertIn('<header class="page-heading">', self.source)
        self.assertNotIn("background:linear-gradient(115deg,rgba(0,162,165,.12),rgba(255,122,0,.08))", self.source)
        # Metriky fronty zůstávají klikacím filtrem stavu.
        self.assertIn('data-queue-status="${status}"', self.source)

    def test_ha_element_rules_support_time_intervals(self):
        for marker in (
            '"time_between"',
            'data-condition-template="time"',
            'data-condition-time-start',
            'data-condition-time-end',
            'id="addLayerTimeRule"',
            'data-layer-rule-time-start',
            'data-layer-rule-time-end',
        ):
            self.assertIn(marker, self.source)
        self.assertIn('"sensor.time"', self.harness)

    def test_ha_designer_shares_the_main_designer_toolset(self):
        self.assertNotIn('<section class="ha-library-head">', self.source)
        for element_type in (
            "text",
            "rect",
            "line",
            "barcode",
            "qr",
            "bar_gauge",
            "pie",
            "slider",
            "potentiometer",
        ):
            self.assertIn(f'data-add-layer-object="{element_type}"', self.source)
        for action in (
            "undo",
            "redo",
            "duplicate",
            "back",
            "front",
            "rotate-left",
            "rotate-right",
            "delete",
            "clear",
        ):
            self.assertIn(f'data-custom-layer-action="{action}"', self.source)
        for action in ("left", "center", "right", "top", "middle", "bottom"):
            self.assertIn(f'["{action}",', self.source)
        self.assertIn('id="openCustomLayerSymbols"', self.source)
        self.assertIn('data-custom-layer-zoom="${zoom}"', self.source)
        self.assertIn("_undoCustomLayerChange()", self.source)
        self.assertIn("_redoCustomLayerChange()", self.source)

    def test_symbol_dialog_stays_above_the_sticky_header(self):
        self.assertIn('class="modal-backdrop symbol-modal-backdrop"', self.source)
        self.assertIn(".symbol-modal-backdrop{z-index:120;isolation:isolate}", self.source)
        self.assertIn('role="dialog" aria-modal="true" aria-labelledby="symbolDialogTitle"', self.source)
        self.assertIn('id="symbolDialogTitle"', self.source)

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

    def test_header_language_switch_and_page_help_are_available_everywhere(self):
        self.assertIn('import { i18nMixin } from "./panel/panel-i18n.mixin.js";', self.source)
        self.assertIn("i18nMixin,", self.source)
        self.assertIn('data-language="cs"', self.source)
        self.assertIn('data-language="en"', self.source)
        self.assertIn('class="language-flag language-flag-cs"', self.source)
        self.assertIn('class="language-flag language-flag-en"', self.source)
        self.assertIn('class="page-context-help"', self.source)
        self.assertIn('class="page-help-tooltip"', self.source)
        self.assertIn('class="header-actions">${this._renderPageHelp()}', self.source)
        self.assertIn('class="language-switch-label">Jazyk / Language</span>', self.source)
        self.assertIn(".language-flag{border:1px solid #111;box-shadow:none}", self.source)
        self.assertIn(".page-help-button,.page-help-button:hover,.page-help-button:focus-visible{border-color:transparent;background:transparent;box-shadow:none}", self.source)
        self.assertIn("${this._renderPageHelp()}", self.source)
        self.assertIn("this._applyUiLanguage();", self.source)
        self.assertIn('querySelectorAll("[data-language]")', self.source)
        self.assertIn('this._saveUiPreference("language", next)', self.source)
        self.assertIn('"cs", "en"', self.source)
        self.assertIn('"Discovered displays"', self.source)
        self.assertIn('"Connection map"', self.source)
        self.assertIn('"Write queue"', self.source)
        self.assertIn('"HA element designer"', self.source)

    def test_symbol_catalog_labels_follow_the_selected_language(self):
        self.assertIn("const SYMBOL_LABEL_EN", self.source)
        self.assertIn("_translateSymbolLabel(label)", self.source)
        self.assertIn("const label = this._translateSymbolLabel(item.label);", self.source)

    def test_all_search_inputs_keep_focus_during_rerenders(self):
        for search_id in ("deviceSearch", "queueSearch", "symbolSearch"):
            self.assertIn(f'"{search_id}"', self.source)
        self.assertIn("_renderKeepingSearchFocus()", self.source)
        self.assertIn("next.focus({ preventScroll: true });", self.source)
        self.assertIn("next.setSelectionRange(selectionStart, selectionEnd, selectionDirection);", self.source)

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
        self.assertIn('data-topology-lock=', self.source)
        self.assertIn("gateway.id || gateway.gateway_id || gateway.host || gateway.name", self.source)
        self.assertIn("this._loadGateways(false)", self.source)
        self.assertIn("Gateway bez displeje", self.harness)
        self.assertIn('event.dataTransfer.setData("text/plain", address)', self.source)
        self.assertIn('await this._saveDeviceGateway(address, group.dataset.topologyGateway)', self.source)
        self.assertIn('type: "dratek_eink/devices/set_gateway"', self.source)
        self.assertIn('device.gateway_selection === "manual"', self.source)
        self.assertIn(".connection-device.is-locked", self.source)
        self.assertIn("box-shadow:inset 3px 0 0 #2563eb", self.source)
        self.assertIn("Přetažení displeje na gateway ho tam rovnou zamkne", self.source)

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
        self.assertEqual(self.source.count('class="designer-meter-value"'), 2)
        self.assertIn(".designer-device-meter .designer-meter-value{display:block;margin:0;color:var(--primary-text-color)", self.source)

    def test_designer_command_cards_match_the_page_visual_system(self):
        for label in ("Soubor", "Proměnné"):
            self.assertIn(f"<strong>{label}</strong>", self.source)
        self.assertNotIn("<strong>Mapování</strong>", self.source)
        self.assertNotIn("<strong>Zobrazení</strong>", self.source)
        self.assertIn('class="designer-command-direct designer-command-orientation"', self.source)
        self.assertIn('class="designer-command-direct designer-command-background"', self.source)
        self.assertIn('data-orientation="landscape"', self.source)
        for color in ("white", "black", "red"):
            self.assertIn(f'data-background="{color}"', self.source)
        self.assertIn('class="designer-command-card', self.source)
        self.assertIn('class="designer-command-icon"', self.source)
        self.assertIn('class="designer-command-copy"', self.source)
        self.assertIn('class="designer-command-actions"', self.source)
        self.assertIn('class="designer-menu-head"', self.source)
        self.assertIn(".designer-commandbar .designer-command-group{display:grid", self.source)
        self.assertIn(".designer-command-card.active", self.source)

    def test_400x300_display_uses_the_supplied_physical_frame(self):
        self.assertIn("_isLarge400Device", self.source)
        self.assertIn('class="designer-device-stage device-preview-designer-copy', self.source)
        self.assertNotIn(
            'class="designer-device-stage device-preview-designer-copy ${large400Layout',
            self.source,
        )
        self.assertNotIn(
            'class="designer-device-stage ${designerLarge400',
            self.source,
        )
        self.assertIn('${large400Layout ? "designer-device-large400" : ""}', self.source)
        self.assertIn('"designer-device-large400"', self.source)
        self.assertIn(".device-preview-empty{position:absolute", self.source)
        self.assertIn("background:#fff;mix-blend-mode:normal", self.source)
        self.assertIn("1039 / 898", self.source)
        self.assertIn("width:calc(var(--designer-body-width) + 2px)", self.source)
        self.assertIn("--designer-body-width:${baseWidth}px", self.source)
        self.assertIn("--designer-body-width:${designerBaseWidth * this._zoom}px", self.source)
        self.assertIn(".device-preview-large400:after,.designer-device-large400:after{display:none}", self.source)
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
        self.assertIn("Math.min(designerFrameWidth, designerFrameHeight) * 0.06", self.source)
        self.assertIn('class="device-preview-designer-svg"', self.source)
        self.assertIn("<foreignObject", self.source)
        self.assertIn("designer-device-stage device-preview-designer-copy", self.source)
        self.assertIn('width="${sourceWidth}" height="${sourceHeight}"', self.source)
        self.assertIn("device-preview-designer-svg{display:block", self.source)
        self.assertIn("calc(100cqh * var(--frame-ratio,2.15))", self.source)
        self.assertIn(".display-preview-slot .device-preview-designer-copy{box-shadow:none;filter:none}", self.source)

    def test_portrait_orientation_rotates_the_complete_physical_frame(self):
        self.assertIn('class="designer-device-stage', self.source)
        self.assertIn('--designer-frame-rotation:${this._orientation === "portrait" ? "90deg" : "0deg"}', self.source)
        self.assertIn('--designer-frame-rotation:${portraitLayout ? "90deg" : "0deg"}', self.source)
        self.assertIn("transform:translate(-50%,-50%) rotate(var(--designer-frame-rotation,0deg))", self.source)
        self.assertIn("const outerWidth = portraitLayout ? frameHeight : frameWidth", self.source)

    def test_ha_designer_binds_every_entity_picker(self):
        self.assertIn("data-custom-entity-picker", self.source)
        self.assertIn('querySelectorAll("[data-custom-entity-picker]")', self.source)
        self.assertNotIn('id="customElementEntity"', self.source)

    def test_designer_and_backend_share_the_bundled_display_font(self):
        self.assertIn('value="DRATEK eInk Sans" disabled', self.source)
        self.assertIn('const family = \'"DRATEK eInk Sans"\';', self.source)
        self.assertIn('new FontFace("DRATEK eInk Sans", source', self.source)
        self.assertIn("loadedFaces.forEach((face) => document.fonts.add(face))", self.source)
        self.assertIn('document.fonts.load(\'600 24px "DRATEK eInk Sans"\')', self.source)
        self.assertIn("if (document.fonts && !this._designerFontReady)", self.source)
        self.assertIn("this._ensureDesignerFont();", self.source)
        self.assertIn('object.type === "text" || automaticIds.has(object.id)', self.source)
        self.assertIn("fallback: this._textObjectValue(object)", self.source)
        self.assertIn("const hasCanonicalObjects = this._canonicalRenderObjects().length > 0", self.source)

    def test_device_cards_use_the_same_canonical_backend_preview(self):
        self.assertIn("this._devicePreviewImages = new Map()", self.source)
        self.assertIn("this._requestCanonicalDevicePreview(request)", self.source)
        self.assertIn("await this._renderCanonicalPreview(automation, address)", self.source)
        self.assertIn("this._devicePreviewImages.set(address, { key, image })", self.source)
        self.assertIn('canvas[data-device-preview]', self.source)

    def test_device_card_selection_is_not_restored_from_designer(self):
        self.assertIn("this._renderDeviceCards(result.devices)", self.source)
        self.assertNotIn("device.address === selectedAddress", self.source)
        self.assertIn(".display-tile:focus{outline:0;border-color:#16803c", self.source)
        self.assertIn(".devices-toolbar-card{margin-bottom:12px", self.source)

    def test_device_catalog_is_not_exposed_as_a_plus_button(self):
        self.assertNotIn('id="openDisplayCatalog"', self.source)
        self.assertNotIn('class="add-display-area"', self.source)
        self.assertNotIn('class="add-display-tile"', self.source)
        self.assertIn("_renderDisplayCatalogDialog()", self.source)
        self.assertIn('id="displayCatalogBackdrop"', self.source)
        self.assertEqual(self.source.count('class="display-catalog-item" href="${product.url}"'), 1)
        for resolution in ("200 × 200 px", "212 × 104 px", "296 × 128 px"):
            self.assertIn(resolution, self.source)
        self.assertIn('this._renderDevicePreview(product.device, "compact", { catalogWordmark: true })', self.source)
        self.assertIn('class="catalog-eink-wordmark">Eink</span>', self.source)
        self.assertNotIn("catalog-display-shape", self.source)
        self.assertIn("https://dratek.cz/12684-e-paper/", self.source)
        self.assertIn('event.key === "Escape" && this._displayCatalogOpen', self.source)

    def test_search_fields_fit_their_complete_placeholders(self):
        self.assertIn(".devices-toolbar>.device-search{flex:0 1 420px;min-width:320px", self.source)
        self.assertIn("@media(max-width:640px){.devices-toolbar>.device-search{flex:1 1 100%;width:100%;min-width:0}", self.source)
        self.assertIn(".symbol-search{display:grid;grid-template-columns:minmax(390px,1fr) auto", self.source)
        self.assertIn('<input type="search" id="symbolSearch"', self.source)

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
        self.assertIn("fullContext.drawImage(image, 0, 0, full.width, full.height)", self.source)

    def test_cached_backend_preview_prevents_renderer_flicker(self):
        self.assertIn("this._backendPreviewImage = image;", self.source)
        self.assertIn("this._paintCachedCanonicalPreview(canvas);", self.source)
        self.assertIn("this._backendPreviewAddress !== address", self.source)
        self.assertIn("context.imageSmoothingEnabled = false;", self.source)
        self.assertIn("if (hasCanonicalObjects && !this._drag)", self.source)
        self.assertIn('if (this._drag && this._drag.mode !== "marquee") return;', self.source)
        self.assertIn("const finishedObjectDrag = !!this._drag && !marquee", self.source)

    def test_writing_device_card_has_live_orange_status(self):
        self.assertIn('job.status === "writing"', self.source)
        self.assertIn('"is-writing"', self.source)
        self.assertIn("Právě se nahrává", self.source)
        self.assertIn('role="status" aria-live="polite"', self.source)
        self.assertIn(".display-tile.is-writing", self.source)
        self.assertIn(".display-writing-state", self.source)
        self.assertIn(".display-preview-slot>.display-writing-state", self.source)
        self.assertIn("position:absolute", self.source)
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
