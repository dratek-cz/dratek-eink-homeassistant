import { storageMixin } from "./panel/panel-storage.mixin.js";
import { queueMixin } from "./panel/panel-queue.mixin.js";
import { gatewayMixin } from "./panel/panel-gateway.mixin.js";
import { devicesMixin } from "./panel/panel-devices.mixin.js?v=automation-loop-4";
import { projectsMixin } from "./panel/panel-projects.mixin.js?v=template-save-queue-1";
import { canvasInteractionMixin } from "./panel/panel-canvas-interaction.mixin.js";
import { historyMixin } from "./panel/panel-history.mixin.js?v=template-history-3";
import { templatesMixin } from "./panel/panel-templates.mixin.js?v=readable-chart-type-2";
import { variablesMixin } from "./panel/panel-variables.mixin.js?v=readable-chart-type-2";
import { previewMixin } from "./panel/panel-preview.mixin.js";
import { renderUiMixin } from "./panel/panel-render-ui.mixin.js?v=studio-designer-37";
import { i18nMixin } from "./panel/panel-i18n.mixin.js";
import { inspectorMixin } from "./panel/panel-inspector.mixin.js?v=readable-chart-type-2";
import { drawBasicMixin } from "./panel/panel-draw-basic.mixin.js";
import { drawChartsMixin } from "./panel/panel-draw-charts.mixin.js?v=readable-chart-type-3";
import { templateSvgMixin } from "./panel/panel-template-svg.mixin.js?v=readable-template-type-3";

import { DRATEK_EINK_VERSION, CURRENT_GATEWAY_FIRMWARES } from "./panel/panel-constants.js";

class DratekEinkPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._loading = false;
    this._scanInProgress = false;
    this._sending = false;
    this._deviceCacheLoadedAt = 0;
    this._result = this._loadCachedScanResult();
    this._error = "";
    this._sendResult = null;
    this._ledSending = false;
    this._ledResult = null;
    this._identifySending = false;
    this._identifyResult = null;
    this._rgbLed = { mode: "off", color: "#00a2a5", flashTime: 10 };
    this._selectedDeviceAddress = "";
    this._displaySettingsView = "templates";
    this._displayTemplateSearchQuery = "";
    this._displayTemplateCategory = "prepared";
    this._selectedDisplayTemplateId = "";
    this._selectedDisplayTemplateSecondaryId = "";
    this._displayTemplateOrientation = "portrait";
    this._displayTemplateLargeLayout = "single";
    this._displayTemplateBindings = {};
    this._templateOrientationMenuOpen = false;
    this._templateEditorElements = [];
    this._templateEditorStates = {};
    this._userDisplayTemplates = [];
    this._selectedTemplateEditorElementId = "";
    this._templateElementPaletteCategory = "";
    this._templateImageLibrary = [];
    this._templateOverlayDrag = null;
    this._templateUndoStack = [];
    this._templateRedoStack = [];
    this._templateHistoryLimit = 60;
    this._templatePropertyHistoryKey = "";
    this._templateLibraryCategory = "all";
    this._templateElementAdjustments = {};
    this._selectedTemplatePart = "";
    this._templatePartDrag = null;
    this._templateSaveResult = null;
    this._templateSettingsDialogOpen = false;
    this._templateSettingsDialogMode = "settings";
    this._templateSettingsDialogTemplateId = "";
    this._templateEditMenuId = "";
    this._templateViewportMenuOpen = false;
    this._selectedTemplateCanvasSlot = "";
    this._templateCanvasPlacements = {
      primary: { x: 9, y: 9 },
      secondary: { x: 9, y: 9 },
    };
    this._displayTemplateFormats = {
      primary: "narrow",
      secondary: "narrow",
    };
    this._displayTemplateSizes = {
      primary: "large",
      secondary: "small",
    };
    this._displayTemplatePreviewZoom = 1;
    this._templateDesignerViewport = "wide";
    this._templateCanvasDrag = null;
    this._displayTemplateAssignments = {};
    this._pendingDisplayTemplateConflict = null;
    this._templateSending = false;
    this._templateSendResult = null;
    this._displayDesignerReturnView = "overview";
    this._editingDeviceAddress = "";
    this._deviceNameDraft = "";
    this._objects = [];
    this._deviceDrafts = this._loadCachedDeviceDrafts();
    this._deviceDraftsLoading = false;
    this._selectedIds = [];
    this._drag = null;
    this._nextId = 1;
    this._backgroundColor = "white";
    this._zoom = 1;
    this._snap = true;
    this._projects = [];
    // Legacy layered objects keep their embedded customLayers data so existing
    // display drafts remain renderable after removal of the HA element designer.
    this._customElements = [];
    this._embeddedLayerImageCache = new Map();
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._fileMenuOpen = false;
    this._viewMenuOpen = false;
    this._toolsMenuOpen = false;
    this._layoutMenuOpen = false;
    this._toolCategory = "basic";
    this._designerSideView = "tools";
    this._invertColors = false;
    this._variablesDialogOpen = false;
    this._templateDialogOpen = false;
    this._newProjectDialogOpen = false;
    this._variables = {};
    this._orientation = "landscape";
    this._displayTransform = "rotate_cw";
    this._refreshIntervalSeconds = 60;
    this._activeTab = "devices";
    this._language = this._loadUiPreference("language", "cs") === "en" ? "en" : "cs";
    this._deviceViewMode = this._loadUiPreference("device-view-mode", "auto");
    this._deviceSearchQuery = "";
    this._displayCatalogOpen = false;
    this._topologyViewMode = this._loadUiPreference("topology-view-mode", "auto");
    this._queue = { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0 };
    this._queuePollTimer = null;
    this._deviceStatusPollTimer = null;
    this._gateways = [];
    this._gatewayResult = null;
    this._gatewayBusy = false;
    this._gatewayDiscovery = [];
    this._gatewaySubtab = "manage";
    this._editingGatewayId = "";
    this._gatewayNameDraft = "";
    this._selectedGatewayId = "";
    this._serialPorts = [];
    this._serialPortsLoaded = false;
    this._gatewayForm = { name: "DRATEK eInk gateway", host: "dratek-eink-gateway.local" };
    this._flashForm = { port: "", ssid: "", password: "", hostname: this._defaultGatewayName(), chip: "esp32s3" };
    this._flashResult = null;
    this._flashJobId = "";
    this._flashPollTimer = null;
    this._otaResult = null;
    this._otaJobId = "";
    this._otaPollTimer = null;
    this._serialResult = null;
    this._draftSaveTimer = null;
    this._draftSavePromise = Promise.resolve();
    this._draftSaveRevision = 0;
    this._draftSavedRevision = 0;
    this._userTemplateSavePromise = Promise.resolve();
    this._loadingDraft = false;
    this._loadedDraftAddress = "";
    this._restoringDraft = false;
    this._symbolPickerOpen = false;
    this._symbolSearch = "";
    this._symbolCategory = "all";
    this._undoStack = [];
    this._redoStack = [];
    this._historyLimit = 60;
    this._propertyEditActive = false;
    this._propertyEditTimer = null;
    this._designerFontReady = false;
    this._designerFontLoading = null;
    this._devicePreviewImages = new Map();
    this._devicePreviewRequests = new Map();
  }

  connectedCallback() {
    // Keyboard shortcuts must also work after a pointer click on the canvas.
    // Such a click does not necessarily focus the custom element, so a listener
    // attached only to `this` never sees Delete/Backspace in that common case.
    if (!this._designerGlobalKeyHandler) {
      this._designerGlobalKeyHandler = (event) => this._onKeyDown?.(event);
      window.addEventListener("keydown", this._designerGlobalKeyHandler, true);
    }
    this._render();
    this._paint();
    this._scheduleDeviceStatusPoll(1000);
  }

  disconnectedCallback() {
    if (this._designerGlobalKeyHandler) {
      window.removeEventListener("keydown", this._designerGlobalKeyHandler, true);
      this._designerGlobalKeyHandler = null;
    }
    window.clearTimeout(this._propertyEditTimer);
    window.clearTimeout(this._templateEntityHistorySaveTimer);
    window.clearTimeout(this._flashPollTimer);
    window.clearTimeout(this._otaPollTimer);
    window.clearTimeout(this._queuePollTimer);
    window.clearTimeout(this._deviceStatusPollTimer);
    // A draft save is debounced by 700 ms. Leaving the panel inside that window
    // used to drop the edit silently, so flush it instead of clearing it.
    if (this._draftSaveTimer) {
      window.clearTimeout(this._draftSaveTimer);
      this._draftSaveTimer = null;
      this._saveCurrentDeviceDraft();
    }
  }

  set hass(hass) {
    const templateLiveDataChanged = this._templateLiveDataChanged?.(this._hass, hass) || false;
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._paint();
      this._loadQueue(false);
      this._scheduleDeviceStatusPoll(1000);
      this._loadUserDisplayTemplates?.();
      if (this._result?.devices?.length) {
        this._loadDevicePreviewDrafts(this._result.devices).then(() => {
          this._render();
          this._paint();
        });
      }
    } else if (this._refreshTemplateEntityElements?.() || templateLiveDataChanged) {
      this._render();
      this._paint();
    }
  }

}

Object.assign(
  DratekEinkPanel.prototype,
  storageMixin,
  queueMixin,
  gatewayMixin,
  devicesMixin,
  projectsMixin,
  canvasInteractionMixin,
  historyMixin,
  templatesMixin,
  variablesMixin,
  previewMixin,
  i18nMixin,
  renderUiMixin,
  inspectorMixin,
  drawBasicMixin,
  drawChartsMixin,
  templateSvgMixin
);

if (!customElements.get("dratek-eink-panel")) {
  customElements.define("dratek-eink-panel", DratekEinkPanel);
}
