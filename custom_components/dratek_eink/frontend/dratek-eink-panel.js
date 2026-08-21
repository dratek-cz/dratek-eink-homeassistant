import { storageMixin } from "./panel/panel-storage.mixin.js";
import { queueMixin } from "./panel/panel-queue.mixin.js?v=live-log-update-1";
import { automationsMixin } from "./panel/panel-automations.mixin.js?v=always-send-default-on-1";
import { gatewayMixin } from "./panel/panel-gateway.mixin.js?v=live-topology-routes-1";
import { devicesMixin } from "./panel/panel-devices.mixin.js?v=radar-direct-dither-1";
import { projectsMixin } from "./panel/panel-projects.mixin.js?v=interval-only-default-1";
import { canvasInteractionMixin } from "./panel/panel-canvas-interaction.mixin.js";
import { historyMixin } from "./panel/panel-history.mixin.js?v=template-history-3";
import { templatesMixin } from "./panel/panel-templates.mixin.js?v=radar-direct-dither-1";
import { variablesMixin } from "./panel/panel-variables.mixin.js?v=readable-chart-type-2";
import { previewMixin } from "./panel/panel-preview.mixin.js?v=device-preview-quality-1";
import { renderUiMixin } from "./panel/panel-render-ui.mixin.js?v=repeat-template-repaint-1";
import { i18nMixin } from "./panel/panel-i18n.mixin.js?v=full-en-translation-3";
import { inspectorMixin } from "./panel/panel-inspector.mixin.js?v=radar-direct-dither-1";
import { drawBasicMixin } from "./panel/panel-draw-basic.mixin.js?v=templates-4c-1";
import { drawChartsMixin } from "./panel/panel-draw-charts.mixin.js?v=readable-chart-type-3";
import { templateSvgMixin } from "./panel/panel-template-svg.mixin.js?v=radar-direct-dither-1";

import { DRATEK_EINK_VERSION, CURRENT_GATEWAY_FIRMWARES } from "./panel/panel-constants.js?v=0.1.333";

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
    this._selectedDisplayTemplateId = "";
    this._selectedDisplayTemplateSecondaryId = "";
    this._displayTemplateOrientation = "portrait";
    this._displayTemplateLargeLayout = "single";
    this._displayTemplateBindings = {};
    this._displayTemplateConfig = {};
    this._templateOrientationMenuOpen = false;
    this._templateEditorElements = [];
    this._templateEditorStates = {};
    this._userDisplayTemplates = [];
    this._selectedTemplateEditorElementId = "";
    this._templateElementPaletteCategory = "";
    this._templateImageLibrary = [];
    this._customImageDataUrl = "";
    this._customImageSourceUrl = "";
    this._customImageVariants = {};
    this._customImageRendererVersion = "";
    this._customImageName = "";
    this._customImageActiveId = "";
    this._customImageCycleIds = [];
    this._customImageCycleEnabled = false;
    this._customImageCycleMinutes = 10;
    this._customImageFitMode = "cover";
    this._customImagePreviewNow = Date.now();
    this._customImageCyclePreviewTimer = null;
    this._customImageStudioTab = "gallery";
    this._customImageStudioZoom = 1;
    this._customImageViewportPan = { x: 0, y: 0 };
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
    this._displayTemplateViewportPan = { x: 0, y: 0 };
    this._templateDesignerPan = { x: 0, y: 0 };
    this._templateDesignerViewport = "wide";
    this._templateCanvasDrag = null;
    this._displayTemplateAssignments = {};
    this._pendingDisplayTemplateConflict = null;
    this._templateSending = false;
    this._templateSendResult = null;
    this._templateDesignerReturnView = "overview";
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
    this._refreshIntervalSeconds = 600;
    this._activeTab = "devices";
    this._language = this._loadUiPreference("language", "cs") === "en" ? "en" : "cs";
    this._deviceViewMode = this._loadUiPreference("device-view-mode", "auto");
    this._deviceSearchQuery = "";
    this._displayCatalogOpen = false;
    this._topologyViewMode = this._loadUiPreference("topology-view-mode", "auto");
    this._gatewayMapMode = this._loadUiPreference("gateway-map-mode", "list");
    // Off by default: drawing every gateway that merely hears a display buried
    // the one line that matters under a mesh of grey alternatives.
    this._gatewayMapShowAlternatives = this._loadUiPreference("gateway-map-show-alternatives", "0") === "1";
    this._gatewayMapFocusAddress = "";
    this._gatewayMapView = { scale: 1, x: 0, y: 0 };
    this._queue = { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0 };
    this._queuePollTimer = null;
    this._automations = [];
    this._automationsLoading = false;
    this._automationsError = "";
    this._automationsResult = "";
    this._automationBusyAddress = "";
    this._deviceStatusPollTimer = null;
    this._gateways = [];
    this._gatewayResult = null;
    this._gatewayBusy = false;
    this._gatewayStatusPollTimer = null;
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

  _openCustomImageStudioView(choice = "images") {
    if (choice === "download") {
      const active = this._activeCustomImageAsset?.();
      const source = active ? this._paletteImageSrc?.(active) : this._customImageDataUrl;
      if (!source) return;
      const anchor = document.createElement("a");
      anchor.href = source;
      anchor.download = String(active?.name || this._customImageName || "dratek-eink.png").replace(/\.[^.]+$/, "") + "-eink.png";
      anchor.click();
      return;
    }
    if (!this._customImageDataUrl) {
      this._useBundledCustomImageTemplate?.().catch((error) => {
        this._templateSendResult = { ok: false, message: this._message?.(error) || String(error) };
        this._render();
      });
    }
    this._selectedDisplayTemplateId = "custom_image";
    this._selectedDisplayTemplateSecondaryId = "";
    this._selectedTemplateCanvasSlot = "primary";
    this._displayTemplateLargeLayout = "single";
    this._templateOrientationMenuOpen = false;
    this._templateSettingsDialogOpen = false;
    this._templateEditMenuId = "";
    this._pendingDisplayTemplateConflict = null;
    this._templateDesignerReturnView = "templates";
    this._displaySettingsView = "designer";
    this._render();
    this._paint();
    this.shadowRoot.querySelector(".page")?.scrollIntoView({ block: "start" });
    if (choice === "gallery") {
      requestAnimationFrame(() => this.shadowRoot.querySelector("[data-custom-image-gallery]")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  connectedCallback() {
    // Keyboard shortcuts must also work after a pointer click on the canvas.
    // Such a click does not necessarily focus the custom element, so a listener
    // attached only to `this` never sees Delete/Backspace in that common case.
    if (!this._designerGlobalKeyHandler) {
      this._designerGlobalKeyHandler = (event) => this._onKeyDown?.(event);
      window.addEventListener("keydown", this._designerGlobalKeyHandler, true);
    }
    // The template catalog is replaced wholesale on every render. Keep the
    // custom-image card controls on the stable shadow root so they cannot lose
    // their click handler while a lazy preview or an image import is repainting
    // the catalog underneath the pointer.
    if (!this._customImageCardClickHandler) {
      this._customImageCardClickHandler = (event) => {
        const back = event.composedPath().find((node) => node?.hasAttribute?.("data-template-editor-back"));
        if (back && this._selectedDisplayTemplateId === "custom_image") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this._templateEditMenuId = "";
          this._displaySettingsView = "templates";
          this._render();
          this._paint();
          this.shadowRoot.querySelector('[data-display-template-drag="custom_image"]')?.scrollIntoView({ block: "center" });
          return;
        }
        const menu = event.composedPath().find((node) => node?.dataset?.displayTemplateEditMenu === "custom_image");
        if (menu) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this._templateEditMenuId = this._templateEditMenuId === "custom_image" ? "" : "custom_image";
          this._render();
          this._paint();
          return;
        }
        const choice = event.composedPath().find((node) => node?.dataset?.displayTemplateId === "custom_image" && node?.dataset?.displayTemplateEditChoice);
        const configure = event.composedPath().find((node) => node?.dataset?.displayTemplateConfigure === "custom_image");
        if (!choice && !configure) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this._templateEditMenuId = "";
        this._openCustomImageStudioView(choice?.dataset?.displayTemplateEditChoice || "images");
      };
      this.shadowRoot.addEventListener("click", this._customImageCardClickHandler, true);
    }
    this._render();
    this._paint();
    this._lastRenderedDeviceSignature = this._deviceStatusSignature?.(this._result) || "";
    this._startCountdownTicker?.();
    this._scheduleDeviceStatusPoll(1000);
    this._scheduleGatewayStatusPoll?.(1500);
    if (!this._automations) this._loadAutomations?.(false);
  }

  disconnectedCallback() {
    if (this._onWindowResize) {
      window.removeEventListener("resize", this._onWindowResize);
      this._onWindowResize = null;
      this._stickyOffsetBound = false;
    }
    if (this._designerGlobalKeyHandler) {
      window.removeEventListener("keydown", this._designerGlobalKeyHandler, true);
      this._designerGlobalKeyHandler = null;
    }
    if (this._customImageCardClickHandler) {
      this.shadowRoot.removeEventListener("click", this._customImageCardClickHandler, true);
      this._customImageCardClickHandler = null;
    }
    this._stopCountdownTicker?.();
    window.clearTimeout(this._propertyEditTimer);
    window.clearTimeout(this._templateEntityHistorySaveTimer);
    window.clearTimeout(this._flashPollTimer);
    window.clearTimeout(this._otaPollTimer);
    window.clearTimeout(this._queuePollTimer);
    window.clearTimeout(this._deviceStatusPollTimer);
    window.clearTimeout(this._gatewayStatusPollTimer);
    window.clearTimeout(this._customImageCyclePreviewTimer);
    if (this._gwmapPanMove) window.removeEventListener("mousemove", this._gwmapPanMove);
    if (this._gwmapPanEnd) window.removeEventListener("mouseup", this._gwmapPanEnd);
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
    // Mirror Home Assistant's own light/dark choice onto the host so the
    // stylesheet can key off it. A media query alone is not enough: Home
    // Assistant's theme is chosen in its own settings and can be dark while the
    // operating system is light, or the other way round. Written as "true"/
    // "false" rather than toggled, so the prefers-color-scheme fallback (which
    // the standalone test harness relies on, having no hass to ask) can tell
    // "Home Assistant says light" apart from "nobody has said anything yet".
    const darkMode = hass?.themes?.darkMode ? "true" : "false";
    if (this.getAttribute("data-dratek-dark") !== darkMode) {
      this.setAttribute("data-dratek-dark", darkMode);
    }
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._paint();
      this._lastRenderedDeviceSignature = this._deviceStatusSignature?.(this._result) || "";
      this._loadQueue(false);
      this._loadAutomations?.(false);
      this._scheduleDeviceStatusPoll(1000);
      this._scheduleGatewayStatusPoll?.(1500);
      this._loadUserDisplayTemplates?.();
      if (this._result?.devices?.length) {
        this._loadDevicePreviewDrafts(this._result.devices).then(() => {
          this._render();
          this._paint();
        });
      }
    } else if (this._refreshTemplateEntityElements?.() || templateLiveDataChanged) {
      if (this._backgroundUiCanRender?.() !== false) {
        this._render();
        this._paint();
      } else {
        // Model values are already updated. Keep the current dialog, menu or
        // focused field alive and repaint only the stable canvas underneath.
        this._pendingLiveDataBackgroundRender = true;
        this._paint();
      }
    } else if (this._pendingLiveDataBackgroundRender && this._backgroundUiCanRender?.() !== false) {
      this._pendingLiveDataBackgroundRender = false;
      this._render();
      this._paint();
    }
  }

}

Object.assign(
  DratekEinkPanel.prototype,
  storageMixin,
  queueMixin,
  automationsMixin,
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
