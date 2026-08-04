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
        for category in ("basic", "data", "status"):
            self.assertIn(f'data-tool-category="{category}"', self.source)
        self.assertNotIn('data-tool-category="custom"', self.source)
        for widget in ("chart", "bar_gauge", "pie", "slider", "gauge", "status"):
            self.assertIn(f'toolButton("{widget}"', self.source)

    def test_entity_widgets_are_manual_only(self):
        start = self.source.rindex("  _automaticTextBindings()")
        end = self.source.index("  _canonicalRenderObjects()", start)
        automatic_filter = self.source[start:end]
        self.assertIn("return [];", automatic_filter)
        self.assertIn("return { enabled: false };", self.source)
        self.assertIn(
            "na displej se odešle jen ručně",
            self.source,
        )

    def test_blank_template_opens_a_truly_empty_designer(self):
        self.assertIn('if (templateId === "blank") {', self.source)
        self.assertIn('this._objects = [];', self.source)
        self.assertIn('this._templateEditorElements = [];', self.source)
        self.assertIn('this._templateElementAdjustments = {};', self.source)
        self.assertIn('this._projectName = "Vlastní šablona";', self.source)
        self.assertIn('if (template.id === "blank" || template.user_created) return "";', self.source)
        self.assertIn('if (template?.id === "blank" || template?.user_created) return [];', self.source)
        self.assertNotIn('Prázdná plocha od nuly</text>', self.source)

    def test_each_template_has_an_isolated_editor_state(self):
        self.assertIn("this._templateEditorStates = {};", self.source)
        self.assertIn("_rememberActiveTemplateEditorState(", self.source)
        self.assertIn("_restoreTemplateEditorState(templateId", self.source)
        self.assertIn("template_states: structuredClone(this._templateEditorStates || {})", self.source)
        self.assertIn("this._rememberActiveTemplateEditorState?.();", self.source)
        self.assertIn("this._restoreTemplateEditorState?.(templateId, template);", self.source)

    def test_sent_template_state_is_persistent_and_fully_green(self):
        self.assertIn("_sentDisplayTemplates(device = this._device())", self.source)
        self.assertIn("sent_template_ids", self.source)
        self.assertIn('template_ids: [...this._assignedDisplayTemplates(device)]', self.source)
        self.assertIn('${onDisplay ? "is-on-display" : ""}', self.source)
        self.assertIn(".display-template-card.is-on-display{", self.source)
        self.assertIn("rgba(104,211,145,.3)", self.source)

    def test_display_tile_hover_is_blue(self):
        self.assertIn(".display-grid .display-tile:hover{border-color:#2563eb", self.source)

    def test_chart_and_status_have_reliable_entity_inputs(self):
        self.assertIn('data-entity-input=', self.source)
        self.assertIn('setEntityBinding', self.source)
        self.assertIn('"Vstup signalizace"', self.source)
        self.assertIn('placeholder="sensor.teplota nebo input_number.hodnota"', self.source)
        self.assertIn('customElements.define("ha-selector"', self.harness)

    def test_panel_render_keeps_static_styles_and_builds_only_active_tab(self):
        self.assertIn("if (!this._staticStylesReady)", self.source)
        self.assertIn("currentPage.replaceWith(nextPage)", self.source)
        self.assertIn(
            'this._activeTab === "devices" ? `<div class="tab-panel">',
            self.source,
        )
        self.assertIn(
            'this._activeTab === "display-settings" ? `<div class="tab-panel">',
            self.source,
        )
        self.assertIn("if (this._paintedInCurrentTask) return;", self.source)
        self.assertIn("queueMicrotask(() => {", self.source)

    def test_manual_entity_input_does_not_duplicate_every_ha_entity(self):
        self.assertNotIn("Object.keys(this._hass?.states || {}).sort()", self.source)
        self.assertNotIn("<datalist", self.source)

    def test_local_harness_uses_svg_mdi_paths_instead_of_font_glyphs(self):
        self.assertIn('import { mdiPaths } from "./vendor/mdi/paths.js";', self.harness)
        self.assertIn('mdiPaths["help-circle-outline"]', self.harness)
        self.assertNotIn("mdiPaths.help-circle-outline", self.harness)
        self.assertIn('<path d="${path}" fill="currentColor"></path>', self.harness)
        self.assertNotIn("window.__mdiCodepoints", self.harness)
        self.assertNotIn('font-family="Material Design Icons"', self.harness)
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

    def test_manual_designer_send_module_is_removed(self):
        self.assertNotIn('import { sendMixin }', self.source)
        self.assertNotIn("sendMixin,", self.source)
        self.assertFalse((PANEL_MODULES / "panel-send.mixin.js").exists())

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

    def test_ha_element_designer_is_removed(self):
        self.assertNotIn('data-tab="custom"', self.source)
        self.assertNotIn('data-tool-category="custom"', self.source)
        self.assertNotIn('import { customElementsMixin }', self.source)
        self.assertNotIn('import { customLayersMixin }', self.source)
        self.assertNotIn("_loadCustomElements()", self.source)
        self.assertFalse((PANEL_MODULES / "panel-custom-elements.mixin.js").exists())
        self.assertFalse((PANEL_MODULES / "panel-custom-layers.mixin.js").exists())
        self.assertFalse((ROOT / "tests" / "ha-layer-designer-harness.html").exists())

    def test_symbol_dialog_stays_above_the_sticky_header(self):
        self.assertIn('class="modal-backdrop symbol-modal-backdrop"', self.source)
        self.assertIn(".symbol-modal-backdrop{z-index:120;isolation:isolate}", self.source)
        self.assertIn('role="dialog" aria-modal="true" aria-labelledby="symbolDialogTitle"', self.source)
        self.assertIn('id="symbolDialogTitle"', self.source)

    def test_inspector_sections_are_collapsible(self):
        self.assertIn('<details class="inspector-section"', self.source)
        self.assertIn('class="inspector-chevron"', self.source)

    def test_delete_shortcut_covers_the_display_designer(self):
        self.assertIn('this._deleteSelected();', self.source)
        self.assertIn('event.key === "Delete" || event.key === "Backspace"', self.source)

    def test_display_designer_entry_points_are_removed(self):
        self.assertNotIn('const openDeviceInDesigner = async (address)', self.source)
        self.assertNotIn('this._activeTab = "designer";', self.source)
        self.assertNotIn('data-select-device=', self.source)
        self.assertNotIn('data-device-card-open=', self.source)
        self.assertNotIn("Otevřít v designeru", self.source)
        self.assertNotIn('<div class="designer-section', self.source)
        self.assertNotIn('<canvas id="editor"', self.source)

    def test_device_settings_landing_page_opens_template_workspace_directly(self):
        self.assertIn('data-device-settings="${this._escape(device.address)}"', self.source)
        self.assertIn('data-device-card-settings="${this._escape(device.address)}"', self.source)
        self.assertIn('event.target.closest("button,input,select,textarea,a,details,summary")', self.source)
        self.assertIn('!["Enter", " "].includes(event.key)', self.source)
        self.assertIn("Upravit displej", self.source)
        self.assertIn('this._activeTab = "display-settings";', self.source)
        # The dedicated back button was removed once the main tabbar became
        # visible on this page too - "Nalezené displeje" now covers the same
        # navigation, so there is no reason to keep a second, redundant control.
        self.assertNotIn('id="displaySettingsBack"', self.source)
        self.assertNotIn('display-settings-back', self.source)
        self.assertIn('["devices", "display-settings"].includes(this._activeTab)', self.source)
        self.assertNotIn('class="card display-settings-device-summary"', self.source)
        self.assertNotIn('class="display-settings-preview"', self.source)
        self.assertIn('class="display-template-device-info"', self.source)
        self.assertIn('class="display-template-device-info-identity"', self.source)
        self.assertIn('class="display-template-device-info-health"', self.source)
        # display-template-device-info-workspace span was removed at user request
        self.assertIn('class="pill muted display-template-device-info-resolution"', self.source)
        self.assertIn('icon="mdi:tablet-dashboard"', self.source)
        self.assertIn('class="display-health-item display-battery-item"', self.source)
        self.assertIn('class="display-health-item display-signal-item"', self.source)
        self.assertIn(".display-template-device-info{display:flex", self.source)
        self.assertIn(".display-template-device-info-health{display:flex", self.source)
        self.assertIn(".display-template-device-info .display-battery-item .battery-segments{width:34px", self.source)
        self.assertIn(".display-template-device-info .display-signal-item .signal-bars{width:26px", self.source)
        self.assertNotIn("<header>\n            <span><small>Váš displej</small>", self.source)
        self.assertNotIn('class="display-settings-actions"', self.source)
        self.assertNotIn('class="display-settings-action ${activeMode === option.id ? "is-active" : ""}', self.source)
        self.assertIn('class="display-template-workspace"', self.source)
        self.assertIn('_displayDesignMode(device = this._device())', self.source)

    def test_saved_blank_design_becomes_a_user_template_card(self):
        self.assertIn('this._userDisplayTemplates = [];', self.source)
        self.assertIn('...userTemplates,', self.source)
        self.assertNotIn('user_templates: structuredClone(this._userDisplayTemplates || [])', self.source)
        self.assertIn('type: "dratek_eink/user_templates/list"', self.source)
        self.assertIn('type: "dratek_eink/user_templates/save"', self.source)
        self.assertIn('_mergeUserDisplayTemplates(...collections)', self.source)
        self.assertIn('await this._saveUserDisplayTemplate(savedUserTemplate)', self.source)
        self.assertIn('const embeddedUserTemplates = Array.isArray(config.user_templates)', self.source)
        self.assertIn('_storeCurrentUserDisplayTemplate(device = this._device())', self.source)
        self.assertIn('if (template?.user_created) this._applyUserDisplayTemplate(template);', self.source)
        self.assertIn('class="display-template-card display-template-drag-card ${userCreated ? "is-user-created"', self.source)
        self.assertIn('Vytvořeno uživatelem', self.source)
        self.assertIn('Vytvořeno v eInk Studiu', self.source)
        self.assertIn('.display-template-library .display-template-card.is-user-created{', self.source)
        self.assertIn('if (template.id === "blank" || template.user_created) return "";', self.source)

    def test_user_template_orientation_is_a_quarter_turn_without_reflow(self):
        self.assertIn('design_orientation: existing?.design_orientation || existing?.orientation', self.source)
        self.assertIn('_userTemplateQuarterTurn(template, targetOrientation = this._displayTemplateOrientation)', self.source)
        self.assertIn('_userTemplateCanvasRotationStyle(template = this._currentUserDisplayTemplate()', self.source)
        self.assertIn('is-whole-canvas-rotated', self.source)
        self.assertIn('transform:translate(-50%,-50%) rotate(${turn * 90}deg)', self.source)
        self.assertIn('return this._normalizeTemplateEditorElement(source);', self.source)
        self.assertIn('x: 100 - item.y - item.h, y: item.x, w: item.h, h: item.w, rotation: item.rotation + 90', self.source)
        self.assertIn('x: item.y, y: 100 - item.x - item.w, w: item.h, h: item.w, rotation: item.rotation - 90', self.source)
        self.assertIn('const model = this._quarterTurnedUserTemplateElement(source);', self.source)
        self.assertIn('if (!largeDisplay && !userTemplate)', self.source)
        self.assertNotIn('this._displayTemplateOrientation = template.orientation === "landscape" ? "landscape" : "portrait";', self.source)

    def test_every_studio_category_has_richer_visual_variants(self):
        self.assertIn('["controls", "toggle-switch-outline", "Signalizace"]', self.source)
        for variant in ('"line"', '"area"', '"bar"', '"steps"', '"donut"', '"sparkline"'):
            self.assertIn(f'tool("chart",', self.source)
            self.assertIn(f'variant: {variant}', self.source)
        for variant in ('"ring"', '"semicircle"', '"battery"', '"thermometer"'):
            self.assertIn(f'variant: {variant}', self.source)
        for label in ("Zapnuto", "Vypnuto", "Aktivní", "Neaktivní", "Výstraha", "Obrázková"):
            self.assertIn(label, self.source)
        self.assertIn('_renderTemplateChartVisual(item)', self.source)
        self.assertIn('_renderTemplateGaugeVisual(item)', self.source)
        self.assertIn('_renderTemplateSignalVisual(item)', self.source)
        for component_class in ('eink-chart-visual', 'eink-gauge-visual', 'eink-progress-visual', 'template-component-toggles'):
            self.assertIn(component_class, self.source)
        self.assertNotIn('paintEditorialCard(', self.source)
        self.assertIn('data-template-element-toggle=', self.source)
        self.assertIn('"#d71912"', self.source)

    def test_designer_uses_category_rail_and_visual_selection_uses_real_aspect(self):
        self.assertIn('class="template-tool-rail" aria-label="Kategorie prvků"', self.source)
        self.assertIn('data-template-palette-category="${id}"', self.source)
        self.assertIn('_renderTemplateElementPalette()', self.source)
        self.assertIn('class="card template-bottom-palette is-${category}"', self.source)
        self.assertIn('position:absolute;z-index:90;left:68px;', self.source)
        self.assertIn('top:clamp(0px,calc(var(--palette-anchor,0) * 50px),260px)', self.source)
        self.assertIn('.template-palette-items{display:grid;', self.source)
        self.assertIn('["icons", "emoticon-outline", "Ikony"]', self.source)
        self.assertIn('["layers", "layers-triple-outline", "Vrstvy"]', self.source)
        self.assertIn('this._templateElementPaletteCategory = this._templateElementPaletteCategory === category ? "" : category;', self.source)
        self.assertIn('.template-overlay-image img{object-fit:fill}', self.source)
        self.assertIn('_fitTemplateElementVisualAspect(item, visualAspect = 1)', self.source)
        self.assertIn('type === "chart" && item.variant === "donut"', self.source)
        self.assertIn('type === "gauge" && ["ring", "semicircle"].includes(item.variant)', self.source)
        self.assertIn('this._fitTemplateElementVisualAspect(item, aspect);', self.source)

    def test_uploaded_template_images_are_kept_in_a_reusable_library(self):
        self.assertIn('this._templateImageLibrary = [];', self.source)
        self.assertIn('image_library: structuredClone(this._templateImageLibrary || [])', self.source)
        self.assertIn('Array.isArray(config.image_library)', self.source)
        self.assertIn('_rememberTemplateImageAsset(src, name = "Obrázek", aspect = 1)', self.source)
        self.assertIn('_insertTemplateLibraryImage(asset, position = null)', self.source)
        self.assertIn('data-template-library-image="${this._escape(asset.id)}"', self.source)
        self.assertIn('data-template-library-remove="${this._escape(asset.id)}"', self.source)
        self.assertIn('.template-library-image-remove{position:absolute;', self.source)

    def test_settings_status_cluster_is_pulled_toward_device_name(self):
        self.assertIn('.display-template-device-info{gap:6px!important;padding-left:0!important}', self.source)
        self.assertIn('.display-template-device-info-health{gap:5px!important}', self.source)

    def test_templates_button_opens_outline_and_filled_icon_gallery(self):
        self.assertIn('this._displaySettingsView = "templates";', self.source)
        self.assertIn('if (!["templates", "designer"].includes(this._displaySettingsView)) this._displaySettingsView = "templates";', self.source)
        self.assertIn('${this._displaySettingsView === "templates" ? this._renderDisplayTemplatesSection(device) : ""}', self.source)
        self.assertNotIn('return this._renderDisplayTemplatesPage(device)', self.source)
        self.assertIn('class="display-template-grid"', self.source)
        self.assertEqual(self.source.count('number: "'), 22)
        self.assertIn("variables: [", self.source)
        # A promotion is a decision rather than a reading, so a price tag carries a
        # switch as well as its entity bindings - and the switch and a bound helper
        # are ORed, so the shop can flip it by hand today and automate it later.
        self.assertIn('options: [["sale", "Akce"', self.source)
        self.assertIn("_templateOptionActive(template, option) {", self.source)
        self.assertIn('data-template-option="${this._escape(`${template.id}:${option}`)}"', self.source)
        self.assertIn("_blockPriceTag(row, box) {", self.source)
        self.assertIn('class="display-template-variable-count"', self.source)
        self.assertIn('class="display-template-variables"', self.source)
        self.assertIn('aria-label="Použité údaje"', self.source)
        self.assertIn("template.variables.map(([iconName, label])", self.source)
        self.assertIn(".display-template-variables ha-icon{", self.source)
        self.assertIn('data-display-template-search', self.source)
        self.assertIn('data-display-template-category="${category.id}"', self.source)
        self.assertIn('class="card devices-toolbar-card display-template-toolbar"', self.source)
        self.assertIn('class="devices-toolbar"', self.source)
        self.assertIn('class="device-search"', self.source)
        self.assertIn('class="pill muted display-template-result-count"', self.source)
        self.assertIn(".display-template-toolbar>.devices-toolbar{flex-wrap:nowrap}", self.source)
        self.assertIn(".display-template-toolbar .device-search{flex:0 0 360px", self.source)
        self.assertIn(".display-template-categories{display:flex;align-items:center", self.source)
        self.assertIn('{ id: "prepared", icon: "auto-fix", title: "Předpřipravené" }', self.source)
        self.assertIn('{ id: "custom", icon: "tune-variant", title: "Vlastní nastavení" }', self.source)
        self.assertIn('class="display-template-workspace"', self.source)
        self.assertIn('data-display-template-dropzone', self.source)
        self.assertIn('draggable="true" data-display-template-drag="${template.id}"', self.source)
        # Every template gets a setup window naming the integrations that produce
        # the entities it binds to. The hover tooltip it replaces carried the same
        # three generic lines for all of them, which answered nothing: a calendar
        # template is useless until a calendar integration exists, and the panel
        # never said so.
        # A display that carries one template shows it edge to edge. The drag
        # placement only means something on the 400x300 panel, where two templates
        # share the screen; on every smaller one it inset the drawing by a few
        # percent and left 11 px of white down the left of the preview that the
        # real panel never has.
        self.assertIn(
            ".template-designer-screen .template-device-layout.is-small-display"
            " .display-template-surface{left:0;top:0;width:100%;height:100%;border:0}",
            self.source,
        )
        self.assertIn("const fullBleed = fillDisplay && !autoFit;", self.source)
        self.assertIn('${fullBleed ? "is-full-bleed" : ""}', self.source)
        self.assertIn('"[data-template-canvas-slot]:not(.is-auto-fit):not(.is-full-bleed)"', self.source)
        self.assertIn("_templateSetupRecipes() {", self.source)
        self.assertIn("_renderDisplayTemplateSetupDialog() {", self.source)
        self.assertIn('data-display-template-setup="${this._escape(template.id)}"', self.source)
        self.assertIn("_hasEntityDomain(domain) {", self.source)
        self.assertNotIn('class="display-template-guide"', self.source)
        self.assertNotIn("_displayTemplateSetupGuide(template)", self.source)
        self.assertIn("application/x-dratek-display-template", self.source)
        self.assertIn("_prepareDisplayTemplateBindings(template)", self.source)
        self.assertIn('entityId.startsWith("weather.")', self.source)
        self.assertIn(".display-template-workspace{display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,2fr)", self.source)
        self.assertIn('this._displayTemplateCategory = button.dataset.displayTemplateCategory || "prepared";', self.source)
        self.assertIn('this._displayTemplateSearchQuery = event.target.value;', self.source)
        # The Wi-Fi code is built by the SVG renderer, so it reaches the panel. It
        # used to exist only in the catalog thumbnail's HTML, which was never sent
        # anywhere - the tag showed the network name and password as plain text and
        # no code at all, while the tile promised one.
        self.assertIn('WIFI:T:WPA;S:${v(0, "Home_Network")};P:${v(1, "MyPassword123")};;', self.source)
        self.assertIn("_blockQr(row, box) {", self.source)
        self.assertIn('shape-rendering="crispEdges"', self.source)
        # An icon counts as rendered only once its <svg> holds something drawable.
        # Home Assistant's ha-icon renders an ha-svg-icon, which renders
        # <svg><g></g></svg> through Lit and fills the <g> only after the mdi chunk
        # loads. Accepting a non-empty <svg> captured that empty group, cached it as
        # a hit and never retried, so whichever icons lost the race stayed blank for
        # the session - the weather template draws five icons from one chunk and lost
        # it every time while the house template happened to win.
        self.assertIn("_findRenderedIconSvg(root) {", self.source)
        self.assertIn(
            'svg?.querySelector("path[d],circle,rect,polygon,polyline,ellipse,line,text,image,use") ? svg : null',
            self.source,
        )
        self.assertIn(
            "this._findRenderedIconSvg(icon.shadowRoot) || this._findRenderedIconSvg(icon)",
            self.source,
        )
        self.assertNotIn("!this._findSvgDeep(el.shadowRoot)", self.source)
        self.assertIn('data-display-template-open="${template.id}"', self.source)
        self.assertIn(
            'class="display-template-card display-template-drag-card ${userCreated ? "is-user-created" : ""} ${used ? "is-used" : ""} ${onDisplay ? "is-on-display" : ""}"',
            self.source,
        )
        self.assertIn("Přetáhněte sem šablonu", self.source)
        self.assertIn("Přetáhnout", self.source)
        self.assertIn("_assignDisplayTemplate(device, templateId, replaceIndex)", self.source)
        self.assertIn(".display-template-card.is-used{border-color:#16803c", self.source)
        self.assertIn('${this._displaySettingsView === "designer" ? this._renderDisplayTemplateEditor(device) : ""}', self.source)
        self.assertIn("_renderDisplayTemplateEditor(device)", self.source)
        self.assertIn('class="display-template-editor-layout"', self.source)
        self.assertIn("_renderTemplatePhysicalDevicePreview(device, template, secondaryTemplate, orientation, layout)", self.source)
        self.assertIn('data-template-orientation="portrait"', self.source)
        self.assertIn('data-template-orientation="landscape"', self.source)
        self.assertNotIn("data-template-format", self.source)
        self.assertIn('class="template-responsive-preview"', self.source)
        self.assertIn(".display-template-surface.size-small.format-narrow{width:46%;height:82%}", self.source)
        self.assertIn(".display-template-surface.size-large.format-wide{width:94%;height:88%}", self.source)
        self.assertIn("100 - drag.itemWidth", self.source)
        self.assertNotIn("display-template-orientation-popover", self.source)
        self.assertIn('class="template-preview-controls"', self.source)
        self.assertIn('aria-label="Orientace displeje"', self.source)
        self.assertNotIn('aria-label="Orientace vybrané šablony"', self.source)
        self.assertIn('aria-label="Přiblížení náhledu"', self.source)
        self.assertIn('data-template-preview-zoom="out"', self.source)
        self.assertIn('data-template-preview-zoom="reset"', self.source)
        self.assertIn('data-template-preview-zoom="in"', self.source)
        self.assertIn("this._displayTemplatePreviewZoom = 1;", self.source)
        self.assertIn("height:540px;min-height:540px", self.source)
        self.assertNotIn("Nastavte fyzickou orientaci celého displeje.", self.source)
        self.assertNotIn("Formát vybrané šablony", self.source)
        self.assertIn('data-template-canvas-slot="${slot}"', self.source)
        self.assertIn('data-template-display-slot="${slot}"', self.source)
        self.assertIn('item.addEventListener("pointerdown"', self.source)
        self.assertIn('item.addEventListener("pointermove"', self.source)
        self.assertIn('selectedItem.classList.remove("is-selected")', self.source)
        self.assertIn("--template-item-x", self.source)
        self.assertNotIn('data-template-layout="side-by-side"', self.source)
        self.assertNotIn('data-template-layout="stacked"', self.source)
        self.assertIn('data-template-size="large"', self.source)
        self.assertIn('data-template-size="small"', self.source)
        self.assertIn("Velká šablona zabírá celý displej", self.source)
        self.assertIn('data-template-conflict-action="shrink"', self.source)
        self.assertIn('data-template-conflict-action="replace"', self.source)
        self.assertIn("Zmenšit a přidat", self.source)
        self.assertIn("Nahradit velkou šablonu", self.source)
        self.assertIn('this._displayTemplateFormats.primary = format;', self.source)
        self.assertIn('this._displayTemplateFormats.secondary = format;', self.source)
        self.assertIn('data-template-entity-picker=', self.source)
        self.assertIn("Automaticky z Home Assistantu", self.source)
        self.assertIn('class="display-template-send-button"', self.source)
        self.assertIn("data-template-send", self.source)
        self.assertIn("_sendDisplayTemplatePreview()", self.source)
        self.assertIn('data-display-template-select="${template.id}"', self.source)
        self.assertNotIn("data-display-template-quick-send", self.source)
        self.assertNotIn("autoSend", self.source)
        self.assertEqual(
            self.source.count("this._sendDisplayTemplatePreview"),
            1,
            "Only the explicit Send button may start a physical display transfer.",
        )
        self.assertIn("this._rememberSentDisplayPreview(device, image);", self.source)
        self.assertIn("_rememberSentDisplayPreview(device, image)", self.source)
        self.assertIn("_captureCurrentDisplayTemplatePreview()", self.source)
        self.assertNotIn("await this._captureCurrentDisplayTemplatePreview();", self.source)
        self.assertIn("preview_image: image", self.source)
        self.assertIn("this._saveCachedDeviceDrafts?.();", self.source)
        self.assertIn(
            'type: "dratek_eink/gateways/send_design"',
            self.source,
        )
        self.assertIn(
            "Další zápis proběhne pouze ručně.",
            self.source,
        )
        # The bitmap the panel receives is built by the SVG renderer, never
        # screenshotted from the DOM. Cloning the live preview into a foreignObject
        # lost the scale transform and the positioning context of the parent it was
        # cut away from, so the drawing landed off-centre in the exported image -
        # 7 px of blank down the left of a portrait tag and 51 px, a sixth of the
        # panel, on a landscape one, while the preview on screen looked right.
        self.assertNotIn("_rasterizeDisplayTemplatePreview", self.source)
        self.assertNotIn("template-export-preview-body", self.source)
        self.assertIn("return this._rasterizeDisplayTemplateSvg(", self.source)
        self.assertIn("_collectTemplateOverlayBoxes() {", self.source)
        self.assertIn("_paintTemplateOverlays(context, overlays, width, height) {", self.source)
        self.assertIn("if (paintOverlay) paintOverlay(context, width, height);", self.source)
        self.assertIn('bitmap.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;', self.source)
        self.assertNotIn("URL.createObjectURL(new Blob([svg]", self.source)
        self.assertIn(".display-template-editor-right-column{grid-column:3;grid-row:1/3", self.source)
        # The on-screen preview has to come from the same SVG builder that makes
        # the bitmap actually sent. It used to be a separate HTML rendering laid
        # out by CSS, which is why previews never matched the panel.
        self.assertIn("_templateSvgPreviewBody(template, templateWidth, templateHeight)", self.source)
        self.assertIn("return this._layoutTemplateSvg(rows, width, height);", self.source)
        # The catalog thumbnail comes from that same builder. It did not: the tiles
        # were a second, hand-written HTML rendering of all twenty templates, so the
        # tile you picked and the picture that arrived on the tag were two different
        # designs maintained by two different code paths.
        self.assertIn("_renderDisplayTemplateCatalogPreview(template, orientation, size) {", self.source)
        self.assertIn("return this._templateSvgThumbnail(template, width, height);", self.source)
        self.assertNotIn("_renderDisplayTemplatePreview(template) {", self.source)
        self.assertNotIn('class="tpl ', self.source)
        self.assertNotIn('id="displayTemplateEditorBack"', self.source)
        self.assertNotIn("Zavřít designer", self.source)
        self.assertIn('class="template-tool-rail"', self.source)
        self.assertIn("context.putImageData(pixels, 0, 0)", self.source)
        self.assertIn('this._displaySettingsView = stayInCatalog ? "templates" : "designer";', self.source)
        self.assertIn('this._displayDesignerReturnView = "templates";', self.source)
        self.assertIn('<small>Designer</small>', self.source)
        self.assertIn(".display-template-editor-left{grid-column:1;grid-row:1/3;min-height:0;overflow:auto}", self.source)
        self.assertIn(".display-template-editor-bottom{grid-column:2;grid-row:2;box-sizing:border-box;height:150px}", self.source)
        self.assertIn("grid-template-rows:540px 150px", self.source)
        self.assertIn('class="display-template-editor-canvas"', self.source)
        self.assertNotIn('class="card display-template-editor-canvas"', self.source)
        self.assertIn("height:702px;max-height:702px", self.source)
        self.assertIn(".display-template-editor-right-column .display-template-editor-right{grid-column:auto;grid-row:auto;flex:1 1 0;min-height:0;overflow:auto}", self.source)
        self.assertIn(".display-template-card{grid-template-rows:auto 300px auto;align-content:start;justify-items:center;padding:0}", self.source)
        self.assertIn(".display-template-caption{box-sizing:border-box;width:100%;margin:0", self.source)
        for icon in (
            "weather-partly-cloudy",
            "home",
            "trash-can-outline",
            "thermometer",
            "account",
            "calendar-month",
        ):
            self.assertIn(f'icon: "{icon}"', self.source)
        self.assertIn(".display-settings-action.is-active{", self.source)
        self.assertIn("_templateDisplayValue(template, variableIndex", self.source)
        self.assertIn("state?.attributes?.unit_of_measurement", self.source)
        self.assertIn(".display-template-preview{box-sizing:border-box", self.source)
        self.assertIn("border:2px solid #111", self.source)
        self.assertIn('<span class="display-template-tile-identity"><strong>${this._escape(template.title)}</strong>', self.source)
        self.assertIn("grid-template-columns:repeat(auto-fill,minmax(240px,1fr))", self.source)
        self.assertIn('class="display-template-tile-preview is-${orientation}"', self.source)
        self.assertIn("_renderDisplayTemplateCatalogPreview(template, orientation, size)", self.source)
        self.assertIn('class="display-template-tile-actions"', self.source)
        for title in (
            "Zabezpečení",
            "Odjezdy",
            "Nákupní seznam",
            "Kvalita vzduchu",
            "Topení",
            "Spotřeba vody",
            "Zásilka",
            "Narozeniny",
            "Stav serveru",
            "Zahrada",
        ):
            self.assertIn(f'title: "{title}"', self.source)
        # Charts, meters and dials read the bound entity rather than carrying a
        # hard-coded number, so a template is a working readout as soon as it is
        # dropped on a display instead of a picture of one.
        self.assertIn("_templatePercent(template, variableIndex", self.source)
        self.assertIn("const series = (index, fallback) => this._templateSeries(template, index, fallback);", self.source)
        self.assertIn("const ratio = (index, fallback) => this._templatePercent(template, index, fallback) / 100;", self.source)
        self.assertIn('{ label: "CPU", value: v(1, "24 %"), percent: ratio(1, 24) },', self.source)
        # The forecast and the calendar come from services; Home Assistant removed
        # the forecast attribute in 2024.4, so the weather strip had been showing
        # sample data on every installation since.
        self.assertIn('this._hass.callService("weather", "get_forecasts"', self.source)
        self.assertIn('this._hass.callService("calendar", "get_events"', self.source)
        self.assertIn("{ strip: [day(0), day(1), day(2), day(3)], h: 0.25 },", self.source)
        # The thumbnail a tile remembers is the image the panel was actually given,
        # not a second rendering of its own.
        self.assertIn("const image = await this._renderCurrentDisplayTemplateImage(device);", self.source)
        self.assertIn('data-template-save', self.source)
        self.assertIn('data-template-editable-part', self.source)
        self.assertIn('template_config: this._displayTemplateDraftPayload?.(device)', self.source)

    def test_template_quantization_does_not_create_red_text_halos(self):
        # A pixel is red only when its red channel is bright and the pixel is too
        # dark to be white. Any rule that instead asks whether red *dominates*
        # green and blue also accepts the antialiased edge of a black glyph on
        # red, which is what put a red rim around black text in 0.1.167.
        self.assertIn("_quantizeEinkPixel(red, green, blue)", self.source)
        self.assertIn("const luminance = (red * 38 + green * 75 + blue * 15) >> 7;", self.source)
        self.assertIn("if (luminance >= 161) return [255, 255, 255];", self.source)
        self.assertIn("return red >= 161 ? [220, 20, 12] : [0, 0, 0];", self.source)
        self.assertNotIn("redDominance", self.source)
        self.assertNotIn("redDistance < blackDistance && redDistance < whiteDistance", self.source)

    def test_display_settings_supports_inline_rename_and_main_previews_have_no_shadow(self):
        self.assertIn('class="display-template-device-info-name-row"', self.source)
        self.assertIn('data-device-rename="${this._escape(device.address)}"', self.source)
        self.assertIn('class="display-settings-name-input"', self.source)
        self.assertIn('data-device-name-save="${this._escape(device.address)}"', self.source)
        self.assertIn(".display-settings-name-button{", self.source)
        self.assertIn(".display-preview-slot .device-preview-wrap{background:transparent}", self.source)
        self.assertIn(".display-preview-slot .device-preview-screen", self.source)
        self.assertIn("box-shadow:none!important;filter:none!important", self.source)

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
        self.assertNotIn('data-tab="custom"', self.source)

    def test_header_uses_the_combined_brand_image_without_duplicate_heading(self):
        self.assertIn("dratek-eink-header.png", self.source)
        self.assertIn('_frontendAssetUrl(path)', self.source)
        self.assertIn("border-radius:0;background:transparent;box-shadow:none;filter:none", self.source)
        self.assertIn(".topbar{padding:8px 18px 8px 0}", self.source)
        self.assertIn('class="brand-description"', self.source)
        self.assertIn("<strong>Správa eInk displejů</strong>", self.source)
        self.assertIn("BLE diagnostika · správa připojení", self.source)
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
        self.assertNotIn('"HA element designer"', self.source)

    def test_symbol_catalog_labels_follow_the_selected_language(self):
        self.assertIn("const SYMBOL_LABEL_EN", self.source)
        self.assertIn("_translateSymbolLabel(label)", self.source)
        self.assertIn("const label = this._translateSymbolLabel(item.label);", self.source)

    def test_all_search_inputs_keep_focus_during_rerenders(self):
        # The template search used to refocus itself with a separate, untested
        # requestAnimationFrame + plain focus() path that lacked preventScroll,
        # so re-rendering while typing jumped the page. It now shares the same
        # helper as every other search box.
        for search_id in ("deviceSearch", "queueSearch", "symbolSearch", "displayTemplateSearch"):
            self.assertIn(f'"{search_id}"', self.source)
        self.assertIn('id="displayTemplateSearch"', self.source)
        self.assertIn(
            'data-display-template-search]")?.addEventListener("input", (event) => {\n'
            "      this._displayTemplateSearchQuery = event.target.value;\n"
            "      this._renderKeepingSearchFocus();",
            self.source,
        )
        self.assertNotIn("window.requestAnimationFrame(() => {\n        const input = this.shadowRoot.querySelector(\"[data-display-template-search]\");", self.source)
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

    def test_connection_map_and_queue_auto_refresh_active_upload_status(self):
        self.assertIn('class="connection-transfer-state writing"', self.source)
        self.assertIn('class="connection-transfer-state uploaded"', self.source)
        self.assertIn("Úspěšně nahráno · displej se vykresluje", self.source)
        self.assertIn(".connection-device.is-writing", self.source)
        self.assertIn(".connection-device.is-uploaded", self.source)
        self.assertIn('["queue", "devices", "topology"].includes(this._activeTab)', self.source)
        self.assertIn("this._queuePollTimer = window.setTimeout", self.source)
        self.assertIn("Number(this._queue?.queued || 0) + Number(this._queue?.writing || 0) > 0", self.source)
        self.assertIn("window.clearTimeout(this._queuePollTimer)", self.source)
        self.assertIn('details[data-queue-log][open]', self.source)
        self.assertIn("details.open = openLogs.has", self.source)

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
        self.assertIn("ctx.imageSmoothingEnabled = false;", self.source)
        self.assertIn(
            "context.drawImage(image, 0, 0, target.width, target.height);",
            self.source,
        )
        self.assertIn("this._paintStoredDevicePreview(canvas, address, draft)", self.source)
        self.assertNotIn('const nativeCanvas = document.createElement("canvas");', self.source)
        self.assertIn('class="device-preview-designer-svg"', self.source)
        self.assertIn("<foreignObject", self.source)
        self.assertIn("designer-device-stage device-preview-designer-copy", self.source)
        self.assertIn('width="${sourceWidth}" height="${sourceHeight}"', self.source)
        self.assertIn("device-preview-designer-svg{display:block", self.source)
        self.assertIn("calc(100cqh * var(--frame-ratio,2.15))", self.source)
        self.assertIn(".display-preview-slot .device-preview-designer-copy{box-shadow:none;filter:none}", self.source)

    def test_portrait_orientation_rotates_the_complete_physical_frame(self):
        self.assertIn('--designer-frame-rotation:${portraitLayout ? "90deg" : "0deg"}', self.source)
        self.assertIn("transform:translate(-50%,-50%) rotate(var(--designer-frame-rotation,0deg))", self.source)
        self.assertIn("const outerWidth = portraitLayout ? frameHeight : frameWidth", self.source)

    def test_designer_and_backend_share_the_bundled_display_font(self):
        self.assertIn('value="DRATEK eInk Sans" disabled', self.source)
        self.assertIn('const family = \'"DRATEK eInk Sans"\';', self.source)
        self.assertIn('new FontFace("DRATEK eInk Sans", source', self.source)
        self.assertIn("loadedFaces.forEach((face) => document.fonts.add(face))", self.source)
        self.assertIn('document.fonts.load(\'600 24px "DRATEK eInk Sans"\')', self.source)
        self.assertIn("if (document.fonts && !this._designerFontReady)", self.source)
        self.assertIn("this._ensureDesignerFont();", self.source)
        self.assertIn('object.type === "text" || automaticIds.has(object.id)', self.source)
        self.assertIn("return { enabled: false };", self.source)
        self.assertNotIn(
            "const hasCanonicalObjects = this._canonicalRenderObjects().length > 0",
            self.source,
        )

    def test_device_cards_use_the_last_manually_sent_preview(self):
        self.assertIn("this._devicePreviewImages = new Map()", self.source)
        self.assertIn("this._paintStoredDevicePreview(canvas, address, draft)", self.source)
        self.assertIn("_paintStoredDevicePreview(canvas, address, draft)", self.source)
        self.assertIn("Number(draft?.preview_updated_at || 0)", self.source)
        self.assertIn("_mergeDraftWithSentPreview(address, draft)", self.source)
        self.assertIn("preview_updated_at: local.preview_updated_at", self.source)
        self.assertIn("this._devicePreviewImages.set(address, { key, image })", self.source)
        self.assertIn('canvas[data-device-preview]', self.source)
        self.assertIn("serverPreviewAt >= localPreviewAt", self.source)
        self.assertIn("previousActive.has(job.id) && job.status === \"succeeded\"", self.source)
        self.assertIn("await this._loadDevicePreviewDrafts(this._result.devices)", self.source)
        self.assertIn("an empty/unknown screen", self.source)

    def test_physical_template_preview_keeps_the_dithered_canvas_inside_the_screen(self):
        screen = self.source.index('class="designer-device-screen template-designer-screen"')
        canvas = self.source.index('class="template-dithered-preview"', screen)
        screen_end = self.source.index("</div>", canvas)
        self.assertLess(canvas, screen_end)

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

    def test_manual_chart_preserves_the_complete_layout(self):
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
        self.assertIn("return { enabled: false };", self.source)

    def test_device_cards_do_not_request_background_backend_previews(self):
        self.assertNotIn('type: "dratek_eink/render_preview"', self.source)
        self.assertNotIn(
            "await this._renderCanonicalPreview(automation, device.address)",
            self.source,
        )
        self.assertIn("return { enabled: false };", self.source)

    def test_designer_does_not_schedule_background_backend_previews(self):
        self.assertNotIn("this._backendPreviewImage = image;", self.source)
        self.assertNotIn("this._paintCachedCanonicalPreview(canvas);", self.source)
        self.assertIn("context.imageSmoothingEnabled = false;", self.source)
        self.assertNotIn("_scheduleCanonicalDesignerPreview", self.source)
        self.assertIn("const finishedObjectDrag = !!this._drag && !marquee", self.source)

    def test_writing_device_card_has_manual_refresh_status(self):
        self.assertIn('job.status === "writing"', self.source)
        self.assertIn('"is-writing"', self.source)
        self.assertIn("Právě se nahrává", self.source)
        self.assertIn('role="status" aria-live="polite"', self.source)
        self.assertIn(".display-tile.is-writing", self.source)
        self.assertIn(".display-writing-state", self.source)
        self.assertIn(".display-preview-slot>.display-writing-state", self.source)
        self.assertIn("position:absolute", self.source)
        self.assertIn(
            '["queue", "devices", "topology"].includes(this._activeTab)',
            self.source,
        )

    def test_recently_uploaded_device_card_has_non_blocking_green_status(self):
        self.assertIn('job.status === "succeeded"', self.source)
        self.assertIn("Date.now() - 7000", self.source)
        self.assertIn('"is-uploaded"', self.source)
        self.assertIn("Úspěšně nahráno", self.source)
        self.assertIn("Displej se vykresluje", self.source)
        self.assertIn(".display-tile.is-uploaded", self.source)
        self.assertIn(".display-uploaded-state", self.source)

    def test_websocket_errors_prefer_specific_backend_details(self):
        self.assertIn("err?.body?.message", self.source)
        self.assertIn("err?.body?.error", self.source)
        self.assertIn('"unknown_error"', self.source)
        self.assertIn("!generic.has(value.toLowerCase())", self.source)
        self.assertIn("Home Assistant ukončil požadavek bez podrobností", self.source)
        self.assertIn("await this._loadQueue?.(false)", self.source)
        self.assertIn('latestJob?.status === "succeeded"', self.source)
        self.assertIn('latestJob?.status === "writing"', self.source)
        self.assertIn("latestJob?.error", self.source)

    def test_queue_exposes_backend_version_and_complete_transfer_log(self):
        self.assertIn("queue.backend_version", self.source)
        self.assertIn('class="queue-row-details"', self.source)
        self.assertIn("Zobrazit celý protokol", self.source)
        self.assertIn('logLines.join("\\n")', self.source)
        self.assertIn("...(this._queue ||", self.source)
        self.assertIn("Náhled byl zařazen do fronty", self.source)
        self.assertIn('let image = "";', self.source)


    def test_template_studio_has_contextual_component_editor(self):
        """The display template studio exposes a real three-panel object editor."""
        for component in ("text", "rect", "circle", "line", "icon", "button", "slider", "chart", "gauge"):
            self.assertIn(f'tool("{component}"', self.source)
        self.assertIn('draggable="true" data-template-editor-tool', self.source)
        self.assertIn('application/x-dratek-template-element', self.source)
        self.assertIn('data-template-overlay-id', self.source)
        self.assertIn('data-template-resize-handle', self.source)
        self.assertIn('["nw", "n", "ne", "e", "se", "s", "sw", "w"]', self.source)
        self.assertIn('_renderTemplateElementInspector()', self.source)
        self.assertIn('field("Velikost", "fontSize"', self.source)
        self.assertIn('field("Otočení", "rotation"', self.source)
        self.assertIn('_paintTemplateOverlays(context, overlays, width, height)', self.source)

    def test_template_studio_keeps_the_header_tools_and_preview_locked(self):
        self.assertIn('.studio-pro-workspace .studio-pro-header{position:sticky;top:10px;z-index:110}', self.source)
        self.assertIn('.studio-pro-workspace .display-template-editor-left{position:sticky;top:var(--studio-locked-top)', self.source)
        self.assertIn('.studio-pro-workspace .display-template-editor-canvas{position:sticky;top:var(--studio-locked-top)', self.source)
        self.assertIn('.studio-pro-workspace .studio-pro-header,.studio-pro-workspace .display-template-editor-left,.studio-pro-workspace .display-template-editor-canvas{position:relative;top:auto}', self.source)

    def test_template_image_import_uses_the_original_colour_classifier(self):
        """Warm neutral colours must not be mistaken for the panel's red pigment."""
        self.assertIn("_quantizeImportedTemplatePixel(red, green, blue, alpha = 255)", self.source)
        self.assertIn("const redScore = red - Math.max(green, blue);", self.source)
        self.assertIn("const luminance = (38 * red + 75 * green + 15 * blue) >> 7;", self.source)
        self.assertIn("green < red * 0.68 && blue < red * 0.72", self.source)
        self.assertIn("context.imageSmoothingEnabled = false;", self.source)
        self.assertNotIn("const palette = [[255, 255, 255], [10, 10, 10], [227, 27, 27]]", self.source)

    def test_template_studio_has_undo_redo_and_keyboard_editing(self):
        self.assertIn('data-template-history="undo"', self.source)
        self.assertIn('data-template-history="redo"', self.source)
        self.assertIn("_templateHistorySnapshot()", self.source)
        self.assertIn("_undoTemplateHistory()", self.source)
        self.assertIn("_redoTemplateHistory()", self.source)
        self.assertIn("_deleteSelectedTemplateElement()", self.source)
        self.assertIn('event.key === "Delete" || event.key === "Backspace"', self.source)
        self.assertIn('event.key.toLowerCase() === "z"', self.source)
        self.assertIn('event.key.toLowerCase() === "y"', self.source)
        self.assertIn('this._templateElementPaletteCategory = "";', self.source)
        self.assertIn('window.addEventListener("keydown", this._designerGlobalKeyHandler, true);', self.source)
        self.assertIn('window.removeEventListener("keydown", this._designerGlobalKeyHandler, true);', self.source)
        self.assertNotIn('this.addEventListener("keydown", (event) => this._onKeyDown?.(event));', self.source)

    def test_template_data_components_bind_to_home_assistant_with_rolling_history(self):
        for marker in (
            "data-template-element-entity-picker",
            "data-template-element-entity-id",
            'historyLimit: 10',
            'sampleInterval: "change"',
            'resetInterval: "never"',
            "_refreshTemplateEntityElements(now = Date.now())",
            "_templateElementEntityRaw(item)",
            "data-template-element-history-clear",
        ):
            self.assertIn(marker, self.source)
        self.assertIn(".slice(-item.historyLimit)", self.source)
        self.assertIn("Math.max(1, Math.min(20", self.source)
        for interval in ("minute", "hour", "day", "week"):
            self.assertIn(f'{interval}:', self.source)

    def test_template_visuals_are_restricted_to_the_eink_palette(self):
        self.assertIn('paletteColor(source.color, "#111111")', self.source)
        self.assertIn('paletteColor(source.fill, defaults.fill ?? "transparent", true)', self.source)
        self.assertIn('fill:#d71912;stroke:none', self.source)
        self.assertIn('conic-gradient(#d71912 var(--gauge-value),#111 0)', self.source)
        self.assertNotIn('fill:color-mix(in srgb,var(--element-color) 18%,transparent)', self.source)
        self.assertNotIn('background:rgba(255,255,255,.82)', self.source)
        self.assertNotIn('context.globalAlpha = .18', self.source)


if __name__ == "__main__":
    unittest.main()
