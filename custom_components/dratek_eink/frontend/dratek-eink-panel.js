import qrcode from "./qrcode-generator.js";
import { storageMixin } from "./panel/panel-storage.mixin.js";
import { queueMixin } from "./panel/panel-queue.mixin.js";
import { gatewayMixin } from "./panel/panel-gateway.mixin.js";
import { devicesMixin } from "./panel/panel-devices.mixin.js";
import { projectsMixin } from "./panel/panel-projects.mixin.js";
import { customElementsMixin } from "./panel/panel-custom-elements.mixin.js";
import { canvasInteractionMixin } from "./panel/panel-canvas-interaction.mixin.js";
import { historyMixin } from "./panel/panel-history.mixin.js";
import { templatesMixin } from "./panel/panel-templates.mixin.js";
import { variablesMixin } from "./panel/panel-variables.mixin.js";
import { sendMixin } from "./panel/panel-send.mixin.js";
import { previewMixin } from "./panel/panel-preview.mixin.js";
import { renderUiMixin } from "./panel/panel-render-ui.mixin.js";
import { customLayersMixin } from "./panel/panel-custom-layers.mixin.js";
import { inspectorMixin } from "./panel/panel-inspector.mixin.js";
import { drawBasicMixin } from "./panel/panel-draw-basic.mixin.js";
import { drawChartsMixin } from "./panel/panel-draw-charts.mixin.js";

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
    this._customElements = this._loadCachedCustomElements();
    this._customElementForm = this._emptyCustomElementForm();
    this._customElementFields = [];
    this._customElementInspection = { collections: [] };
    this._customElementBusy = false;
    this._customElementResult = null;
    this._customWorkspaceView = "library";
    this._customLayerStep = "design";
    this._customActiveLayerId = "";
    this._customSelectedObjectId = "";
    this._customLayerDrag = null;
    this._customImageCache = new Map();
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
    this._deviceViewMode = this._loadUiPreference("device-view-mode", "auto");
    this._deviceSearchQuery = "";
    this._topologyViewMode = this._loadUiPreference("topology-view-mode", "auto");
    this._queue = { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0 };
    this._queuePollTimer = null;
    this._automaticScanTimer = null;
    this._lastAutomaticScanAt = 0;
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
    this._backendPreviewTimer = null;
    this._backendPreviewRequestId = 0;
    this._backendPreviewImage = null;
    this._backendPreviewAddress = "";
    this._handleKeyDown = (event) => this._onKeyDown(event);
    this._handleLocationChanged = () => {
      if (String(window.location?.pathname || "").includes("dratek-eink")) this._scheduleAutomaticScan(0);
    };
    this._stopTypingShortcut = (event) => {
      if (this._isTypingEvent(event)) event.stopPropagation();
    };
    this.shadowRoot.addEventListener("keydown", this._stopTypingShortcut);
    this.shadowRoot.addEventListener("keyup", this._stopTypingShortcut);
  }

  connectedCallback() {
    window.addEventListener("keydown", this._handleKeyDown);
    window.addEventListener("location-changed", this._handleLocationChanged);
    this._render();
    this._paint();
    this._scheduleAutomaticScan();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this._handleKeyDown);
    window.removeEventListener("location-changed", this._handleLocationChanged);
    window.clearTimeout(this._propertyEditTimer);
    window.clearTimeout(this._flashPollTimer);
    window.clearTimeout(this._otaPollTimer);
    window.clearTimeout(this._queuePollTimer);
    window.clearTimeout(this._automaticScanTimer);
    window.clearTimeout(this._backendPreviewTimer);
    // A draft save is debounced by 700 ms. Leaving the panel inside that window
    // used to drop the edit silently, so flush it instead of clearing it.
    if (this._draftSaveTimer) {
      window.clearTimeout(this._draftSaveTimer);
      this._draftSaveTimer = null;
      this._saveCurrentDeviceDraft();
    }
    this._backendPreviewRequestId += 1;
    this._backendPreviewImage = null;
    this._backendPreviewAddress = "";
  }

  set hass(hass) {
    const previousSignature = this._entityStateSignature(this._hass);
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._paint();
      this._loadProjects();
      this._loadCustomElements();
      this._loadGateways();
      this._loadSerialPorts();
      if (this._result?.devices?.length) {
        this._loadDevicePreviewDrafts(this._result.devices).then(() => {
          this._render();
          this._paint();
        });
      }
      this._scheduleAutomaticScan(100);
    } else if (previousSignature !== this._entityStateSignature(hass) && this._activeTab === "designer") {
      const active = this.shadowRoot.activeElement;
      const editing = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
      if (!editing) this._render();
      this._paint();
    }
  }

  _entityStateSignature(hass = this._hass) {
    if (!hass || !hass.states) return "";
    return this._objects
      .filter((object) => object.entityId)
      .map((object) => {
        const state = hass.states[object.entityId];
        const value = object.entityAttribute ? state?.attributes?.[object.entityAttribute] : state?.state;
        return `${object.id}:${object.entityId}:${object.entityAttribute || ""}:${JSON.stringify(value)}`;
      })
      .join("|");
  }
}

Object.assign(
  DratekEinkPanel.prototype,
  storageMixin,
  queueMixin,
  gatewayMixin,
  devicesMixin,
  projectsMixin,
  customElementsMixin,
  canvasInteractionMixin,
  historyMixin,
  templatesMixin,
  variablesMixin,
  sendMixin,
  previewMixin,
  renderUiMixin,
  customLayersMixin,
  inspectorMixin,
  drawBasicMixin,
  drawChartsMixin
);

if (!customElements.get("dratek-eink-panel")) {
  customElements.define("dratek-eink-panel", DratekEinkPanel);
}
