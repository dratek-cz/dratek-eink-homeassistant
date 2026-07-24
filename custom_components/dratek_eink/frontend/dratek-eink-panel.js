import qrcode from "./qrcode-generator.js";

const DRATEK_EINK_VERSION = "0.1.104";
const CURRENT_GATEWAY_FIRMWARES = new Set(["0.1.40-gateway", "0.1.41-gateway"]);

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

  _loadUiPreference(key, fallback) {
    try {
      const value = window.localStorage.getItem(`dratek-eink-${key}`);
      return ["auto", "full", "large", "compact", "list"].includes(value) ? value : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  _saveUiPreference(key, value) {
    try { window.localStorage.setItem(`dratek-eink-${key}`, value); } catch (_err) { /* Browser storage can be disabled. */ }
  }

  _loadCachedScanResult() {
    try {
      const cached = JSON.parse(window.localStorage.getItem("dratek-eink-device-cache") || "null");
      if (!cached || !Array.isArray(cached.devices) || !cached.devices.length) return null;
      this._deviceCacheLoadedAt = Number(cached.saved_at) || 0;
      return { devices: cached.devices, debug: ["Displeje obnovené z lokální cache."], ble_devices: [] };
    } catch (_err) {
      return null;
    }
  }

  _saveCachedScanResult(result) {
    const devices = Array.isArray(result?.devices) ? result.devices : [];
    this._deviceCacheLoadedAt = Date.now();
    try {
      window.localStorage.setItem("dratek-eink-device-cache", JSON.stringify({ saved_at: this._deviceCacheLoadedAt, devices }));
    } catch (_err) { /* Browser storage can be disabled. */ }
  }

  _loadCachedDeviceDrafts() {
    try {
      const cached = JSON.parse(window.localStorage.getItem("dratek-eink-device-drafts-cache") || "{}");
      if (!cached || typeof cached !== "object" || Array.isArray(cached)) return {};
      return Object.fromEntries(Object.entries(cached).map(([address, draft]) => {
        if (!draft || typeof draft !== "object" || Array.isArray(draft)) return [address, null];
        const source = { ...draft };
        source.objects = Array.isArray(source.objects)
          ? source.objects.filter((item) => item && typeof item === "object" && !Array.isArray(item))
          : source.objects && typeof source.objects === "object"
            ? Object.values(source.objects).filter((item) => item && typeof item === "object" && !Array.isArray(item))
            : [];
        if (!source.variables || typeof source.variables !== "object" || Array.isArray(source.variables)) source.variables = {};
        return [String(address).toUpperCase(), source];
      }));
    } catch (_err) {
      return {};
    }
  }

  _saveCachedDeviceDrafts() {
    try {
      window.localStorage.setItem("dratek-eink-device-drafts-cache", JSON.stringify(this._deviceDrafts || {}));
    } catch (_err) { /* Large image drafts can exceed browser storage; server data remains authoritative. */ }
  }

  _loadCachedCustomElements() {
    try {
      const cached = JSON.parse(window.localStorage.getItem("dratek-eink-custom-elements-cache") || "[]");
      const records = Array.isArray(cached)
        ? cached
        : cached && typeof cached === "object"
          ? Object.values(cached)
          : [];
      return records
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => this._normalizeStoredCustomElement(item));
    } catch (_err) {
      return [];
    }
  }

  _saveCachedCustomElements() {
    try {
      window.localStorage.setItem("dratek-eink-custom-elements-cache", JSON.stringify(this._customElements || []));
    } catch (_err) { /* Browser storage can be disabled or full. */ }
  }

  _mergeScanResult(nextResult, graceMs = 5 * 60 * 1000) {
    const now = Date.now();
    const previousDevices = new Map((this._result?.devices || []).map((device) => [String(device.address || "").toUpperCase(), device]));
    const devices = [];
    const seen = new Set();
    for (const source of nextResult?.devices || []) {
      const address = String(source.address || "").toUpperCase();
      if (!address || seen.has(address)) continue;
      seen.add(address);
      const previous = previousDevices.get(address);
      const lastSeenMs = source.temporarily_unseen
        ? Number(source.last_seen_at || 0) * 1000 || Number(previous?._last_seen_ms || this._deviceCacheLoadedAt || now)
        : now;
      devices.push({ ...previous, ...source, address: source.address || address, _last_seen_ms: lastSeenMs });
    }
    for (const [address, previous] of previousDevices) {
      if (seen.has(address)) continue;
      const lastSeenMs = Number(previous._last_seen_ms || Number(previous.last_seen_at || 0) * 1000 || this._deviceCacheLoadedAt || 0);
      if (lastSeenMs && now - lastSeenMs <= graceMs) {
        devices.push({ ...previous, temporarily_unseen: true, _last_seen_ms: lastSeenMs });
      }
    }
    return { ...(nextResult || {}), devices };
  }

  _hasFreshDeviceCache(maxAgeMs = 10 * 60 * 1000) {
    return Boolean(this._result?.devices?.length) && Date.now() - this._deviceCacheLoadedAt < maxAgeMs;
  }

  _defaultGatewayName() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = `${pad(now.getMinutes())}${pad(now.getHours())}${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
    return `dratek-eink-gateway_${stamp}`;
  }

  connectedCallback() {
    window.addEventListener("keydown", this._handleKeyDown);
    window.addEventListener("location-changed", this._handleLocationChanged);
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

  async _loadQueue(render = true) {
    if (!this._hass) return;
    try {
      this._queue = await this._hass.callWS({ type: "dratek_eink/queue/list" });
    } catch (err) {
      this._queue = { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0, error: this._message(err) };
    }
    if (render) {
      this._render();
      this._paint();
    }
    window.clearTimeout(this._queuePollTimer);
    if (this._activeTab === "queue") {
      this._queuePollTimer = window.setTimeout(() => this._loadQueue(true), 1500);
    }
  }

  async _loadGateways(refresh = false) {
    if (!this._hass) return;
    this._gatewayBusy = true;
    this._render();
    try {
      const result = await this._hass.callWS({ type: refresh ? "dratek_eink/gateways/refresh" : "dratek_eink/gateways/list" });
      this._gateways = result.gateways || [];
      this._gatewayResult = null;
    } catch (err) {
      this._gatewayResult = { ok: false, error: this._message(err) };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _addGateway() {
    if (!this._hass || this._gatewayBusy) return;
    this._gatewayBusy = true;
    this._gatewayResult = null;
    this._render();
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/gateways/add",
        name: this._gatewayForm.name,
        host: this._gatewayForm.host,
      });
      await this._loadGateways(false);
      this._gatewayResult = { ok: true, message: `Gateway ${result.gateway.name} ulozena.` };
    } catch (err) {
      this._gatewayResult = { ok: false, error: this._message(err) };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _discoverGateways() {
    if (!this._hass || this._gatewayBusy) return;
    this._gatewayBusy = true;
    this._gatewayResult = null;
    this._render();
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/discover", seconds: 10 });
      this._gatewayDiscovery = result.discovered || [];
      this._gatewayResult = result.ok
        ? { ok: true, message: `Discovery dokonceno. Nalezeno ${this._gatewayDiscovery.length} gateway.` }
        : { ok: false, error: result.error || "Discovery selhalo." };
    } catch (err) {
      this._gatewayResult = { ok: false, error: this._message(err) };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _addDiscoveredGateway(index) {
    const discovered = this._gatewayDiscovery[Number(index)];
    if (!discovered || this._matchingStoredGateway(discovered)) return;
    this._gatewayForm = {
      name: discovered.name || "DRATEK eInk gateway",
      host: discovered.host || discovered.server,
    };
    await this._addGateway();
  }

  async _loadSerialPorts() {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/serial_ports" });
      this._serialPorts = result.ports || [];
      this._serialPortsLoaded = true;
      if (!this._flashForm.port && this._serialPorts.length) this._flashForm.port = this._serialPorts[0].device;
    } catch (err) {
      this._serialPortsLoaded = true;
      this._flashResult = { ok: false, error: this._message(err), log: [] };
    }
    this._render();
    this._paint();
  }

  async _flashGateway() {
    if (!this._hass || this._gatewayBusy) return;
    this._gatewayBusy = true;
    this._flashResult = { ok: null, status: "queued", log: ["Zakladam flash job..."] };
    this._flashJobId = "";
    this._render();
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/gateways/flash_start",
        port: this._flashForm.port,
        ssid: this._flashForm.ssid,
        password: this._flashForm.password,
        hostname: this._flashForm.hostname || "dratek-eink-gateway",
        chip: this._flashForm.chip || "esp32s3",
      });
      this._flashJobId = result.job.job_id;
      this._flashResult = result.job;
      this._scheduleFlashPoll();
    } catch (err) {
      this._flashResult = { ok: false, error: this._message(err), log: [] };
      this._gatewayBusy = false;
    } finally {
      this._render();
      this._paint();
    }
  }

  _scheduleFlashPoll() {
    window.clearTimeout(this._flashPollTimer);
    this._flashPollTimer = window.setTimeout(() => this._pollFlashJob(), 1000);
  }

  async _pollFlashJob() {
    if (!this._hass || !this._flashJobId) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/flash_job", job_id: this._flashJobId });
      this._flashResult = result.job;
      const done = ["done", "failed"].includes(result.job.status);
      this._gatewayBusy = !done;
      this._render();
      this._scrollGatewayLogsToBottom();
      this._paint();
      if (!done) {
        this._scheduleFlashPoll();
      } else if (result.job.ok) {
        await this._discoverGateways();
      }
    } catch (err) {
      this._flashResult = { ok: false, error: this._message(err), log: this._flashResult?.log || [] };
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  _scrollGatewayLogsToBottom() {
    window.requestAnimationFrame(() => {
      this.shadowRoot.querySelectorAll(".gateway-log").forEach((node) => {
        node.scrollTop = node.scrollHeight;
      });
    });
  }

  async _startGatewayOta(gatewayId) {
    if (!this._hass || !gatewayId || this._gatewayBusy) return;
    const gateway = this._gateways.find((item) => item.id === gatewayId);
    if (!gateway || !confirm(`Aktualizovat firmware gateway ${gateway.name} pres sit? Behem aktualizace nebude dostupny BLE prenos.`)) return;
    this._gatewayBusy = true;
    this._otaResult = { ok: null, status: "queued", progress: 0, log: ["Zakladam OTA aktualizaci..."] };
    this._otaJobId = "";
    this._render();
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/ota_start", gateway_id: gatewayId });
      this._otaJobId = result.job.job_id;
      this._otaResult = result.job;
      this._scheduleOtaPoll();
    } catch (err) {
      this._otaResult = { ok: false, status: "failed", progress: 0, error: this._message(err), log: [] };
      this._gatewayBusy = false;
    }
    this._render();
    this._paint();
  }

  _scheduleOtaPoll() {
    window.clearTimeout(this._otaPollTimer);
    this._otaPollTimer = window.setTimeout(() => this._pollOtaJob(), 1000);
  }

  async _pollOtaJob() {
    if (!this._hass || !this._otaJobId) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/ota_job", job_id: this._otaJobId });
      this._otaResult = result.job;
      const done = ["done", "failed"].includes(result.job.status);
      this._gatewayBusy = !done;
      this._render();
      this._scrollGatewayLogsToBottom();
      this._paint();
      if (!done) {
        this._scheduleOtaPoll();
      } else if (result.job.ok) {
        await this._loadGateways(true);
      }
    } catch (err) {
      this._otaResult = { ok: false, status: "failed", progress: this._otaResult?.progress || 0, error: this._message(err), log: this._otaResult?.log || [] };
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _serialGatewayStatus() {
    if (!this._hass || !this._flashForm.port || this._gatewayBusy) return;
    this._gatewayBusy = true;
    this._serialResult = { ok: null, log: ["Ctu stav ESP32 pres USB serial..."] };
    this._render();
    try {
      this._serialResult = await this._hass.callWS({ type: "dratek_eink/gateways/serial_status", port: this._flashForm.port });
    } catch (err) {
      this._serialResult = { ok: false, error: this._message(err), log: [] };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _serialGatewayWifi() {
    if (!this._hass || !this._flashForm.port || !this._flashForm.ssid || this._gatewayBusy) return;
    this._gatewayBusy = true;
    this._serialResult = { ok: null, log: ["Posilam Wi-Fi konfiguraci do ESP32 pres USB serial..."] };
    this._render();
    try {
      this._serialResult = await this._hass.callWS({
        type: "dratek_eink/gateways/serial_wifi",
        port: this._flashForm.port,
        ssid: this._flashForm.ssid,
        password: this._flashForm.password,
        hostname: this._flashForm.hostname || "dratek-eink-gateway",
      });
    } catch (err) {
      this._serialResult = { ok: false, error: this._message(err), log: [] };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _deleteGateway(gatewayId) {
    if (!this._hass || !gatewayId || this._gatewayBusy || !confirm("Smazat tuto gateway?")) return;
    this._gatewayBusy = true;
    this._render();
    try {
      await this._hass.callWS({ type: "dratek_eink/gateways/delete", gateway_id: gatewayId });
      await this._loadGateways(false);
      this._gatewayResult = { ok: true, message: "Gateway smazana." };
    } catch (err) {
      this._gatewayResult = { ok: false, error: this._message(err) };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _renameGateway(gatewayId) {
    const name = this._gatewayNameDraft.trim();
    if (!this._hass || !gatewayId || !name || this._gatewayBusy) return;
    this._gatewayBusy = true;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/rename", gateway_id: gatewayId, name });
      this._gateways = this._gateways.map((gateway) => gateway.id === gatewayId ? result.gateway : gateway);
      if (this._result?.devices) {
        this._result.devices.forEach((device) => {
          (device.paths || []).forEach((path) => { if (path.id === gatewayId) path.name = name; });
          if (device.preferred_path?.id === gatewayId) device.preferred_path.name = name;
        });
      }
      this._editingGatewayId = "";
      this._gatewayResult = { ok: true, message: `Gateway byla prejmenovana na ${name}.` };
    } catch (err) {
      this._gatewayResult = { ok: false, error: this._message(err) };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _scanGateway(gatewayId) {
    if (!this._hass || !gatewayId || this._gatewayBusy) return;
    this._gatewayBusy = true;
    this._gatewayResult = null;
    this._render();
    try {
      this._gatewayResult = await this._hass.callWS({ type: "dratek_eink/gateways/scan", gateway_id: gatewayId, seconds: 8 });
    } catch (err) {
      this._gatewayResult = { ok: false, error: this._message(err), devices: [] };
    } finally {
      this._gatewayBusy = false;
      this._render();
      this._paint();
    }
  }

  async _scan({ background = false } = {}) {
    if (!this._hass || this._scanInProgress) return;
    this._scanInProgress = true;
    if (!background) {
      this._loading = true;
      this._error = "";
      this._render();
    }
    try {
      const scannedResult = await this._hass.callWS({ type: "dratek_eink/scan" });
      const nextResult = this._mergeScanResult(scannedResult);
      this._saveCachedScanResult(nextResult);
      const changed = this._deviceAddressSignature(this._result) !== this._deviceAddressSignature(nextResult);
      const presenceChanged = this._devicePresenceSignature(this._result) !== this._devicePresenceSignature(nextResult);
      this._result = nextResult;
      if (!background || changed || presenceChanged) {
        this._render();
        this._paint();
        this._loadDevicePreviewDrafts(this._result.devices || []).then(() => {
          this._render();
          this._paint();
        });
      }
      const found = (this._result?.devices || []).some((device) => device.address === this._selectedDeviceAddress);
      if (!found) this._selectedDeviceAddress = "";
      this._selectPreferredRoute(this._device());
    } catch (err) {
      if (!background) this._error = this._message(err);
    } finally {
      this._scanInProgress = false;
      if (!background) this._loading = false;
      if (!background || this._deviceAddressSignature(this._result) !== this._lastRenderedDeviceSignature) {
        this._lastRenderedDeviceSignature = this._deviceAddressSignature(this._result);
        this._render();
        this._paint();
      }
      if (this._activeTab === "devices") this._scheduleAutomaticScan(30 * 1000);
    }
  }

  _deviceAddressSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => String(device.address || "").toUpperCase())
      .filter(Boolean)
      .sort()
      .join("|");
  }

  _devicePresenceSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => `${String(device.address || "").toUpperCase()}:${device.temporarily_unseen ? "stale" : "seen"}`)
      .sort()
      .join("|");
  }

  _scheduleAutomaticScan(delay = 180) {
    if (!this._hass) return;
    window.clearTimeout(this._automaticScanTimer);
    this._automaticScanTimer = window.setTimeout(() => {
      this._automaticScanTimer = null;
      const now = Date.now();
      if (now - this._lastAutomaticScanAt < 1000) return;
      this._lastAutomaticScanAt = now;
      this._lastRenderedDeviceSignature = this._deviceAddressSignature(this._result);
      this._scan({ background: true });
    }, delay);
  }

  async _loadProjects() {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/list" });
      this._projects = result.projects || [];
      this._render();
      this._paint();
    } catch (err) {
      this._error = this._message(err);
      this._render();
    }
  }

  _emptyCustomElementForm() {
    const onLayer = {
      id: `layer-${Date.now()}-on`, name: "Zapnuto",
      objects: [
        { id: `item-${Date.now()}-on-icon`, type: "text", x: 88, y: 12, w: 120, h: 62, text: "●", color: "red", font_size: 52, bold: true, align: "center" },
        { id: `item-${Date.now()}-on-text`, type: "text", x: 58, y: 78, w: 180, h: 36, text: "ZAPNUTO", color: "black", font_size: 28, bold: true, align: "center" },
      ],
    };
    const offLayer = {
      id: `layer-${Date.now()}-off`, name: "Vypnuto",
      objects: [
        { id: `item-${Date.now()}-off-icon`, type: "text", x: 88, y: 12, w: 120, h: 62, text: "○", color: "black", font_size: 52, bold: true, align: "center" },
        { id: `item-${Date.now()}-off-text`, type: "text", x: 58, y: 78, w: 180, h: 36, text: "VYPNUTO", color: "black", font_size: 28, bold: true, align: "center" },
      ],
    };
    return {
      id: "", name: "", element_type: "layered", source_type: "entity",
      entity_id: "", entity_attribute: "", url: "", collection_path: "", value_field: "", label_field: "", json_path: "", label_json_path: "",
      label: "", unit: "", color: "black", chart_type: "line",
      history_mode: "rolling", history_points: 24,
      condition_rules: [
        { operator: "is_on", value: "", symbol: "●" },
        { operator: "is_off", value: "", symbol: "○" },
      ],
      default_symbol: "?",
      on_symbol: "●", off_symbol: "○", on_values: "on,true,1,open,home",
      sample_data: "", sample_labels: "", icon_image: "", width_percent: 55, height_percent: 35,
      canvas_width: 296, canvas_height: 128,
      layers: [onLayer, offLayer],
      condition_rules: [
        { operator: "is_on", value: "", layer_id: onLayer.id },
        { operator: "is_off", value: "", layer_id: offLayer.id },
      ],
      default_layer_id: offLayer.id,
    };
  }

  _customElementFormValid() {
    const form = this._customElementForm;
    if (form.element_type === "layered") {
      return Boolean(form.name.trim() && form.entity_id && Array.isArray(form.layers) && form.layers.length);
    }
    return Boolean(
      form.name.trim()
      && (form.element_type === "icon" ? form.icon_image : form.entity_id)
    );
  }

  async _loadCustomElements(render = true) {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/custom_elements/list" });
      this._customElements = this._storedRecordList(result.elements).map((element) => this._normalizeStoredCustomElement(element));
      this._saveCachedCustomElements();
      (this._customElements || []).forEach((element) => this._syncCustomElementToAllObjects(element));
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    }
    if (render) {
      if (this._activeTab === "custom") this._stableCustomRender();
      else {
        this._render();
        this._paint();
      }
    }
  }

  _syncCustomElementToAllObjects(element) {
    if (!element || !element.id) return;
    const syncObj = (obj) => {
      if (obj.customElementId !== element.id) return;
      if (obj.type === "layered" || element.element_type === "layered") {
        obj.customLayers = structuredClone(element.layers || []);
        obj.customCanvasWidth = Number(element.canvas_width || 296);
        obj.customCanvasHeight = Number(element.canvas_height || 128);
        obj.conditionRules = structuredClone((element.condition_rules || []).map((rule) => ({
          operator: rule.operator,
          value: rule.value || "",
          symbol: rule.layer_id || rule.symbol || "",
        })));
        obj.defaultSymbol = element.default_layer_id || element.layers?.[0]?.id || "";
      }
      if (element.entity_id) {
        obj.entityId = element.entity_id;
        obj.entityAttribute = element.entity_attribute || "";
      }
      if (element.element_type === "icon" && element.icon_image) {
        obj.image = element.icon_image;
      }
      if (element.element_type === "chart") {
        obj.chartType = element.chart_type || obj.chartType || "line";
        obj.maxPoints = Number(element.history_points || obj.maxPoints || 24);
        obj.historyMode = element.history_mode || obj.historyMode || "rolling";
      }
      if (element.element_type === "status") {
        obj.statusOnSymbol = element.on_symbol || obj.statusOnSymbol;
        obj.statusOffSymbol = element.off_symbol || obj.statusOffSymbol;
        obj.statusOnValues = element.on_values || obj.statusOnValues;
        obj.defaultSymbol = element.default_symbol || obj.defaultSymbol;
        obj.conditionRules = structuredClone(element.condition_rules || obj.conditionRules || []);
      }
    };

    (this._objects || []).forEach(syncObj);

    if (this._projects && typeof this._projects === "object") {
      Object.values(this._projects).forEach((project) => {
        if (project && Array.isArray(project.objects)) {
          project.objects.forEach(syncObj);
        }
      });
    }

    if (this._deviceDrafts && typeof this._deviceDrafts === "object") {
      Object.values(this._deviceDrafts).forEach((draft) => {
        if (draft && Array.isArray(draft.objects)) {
          draft.objects.forEach(syncObj);
        }
      });
    }
  }

  async _saveCustomElement() {
    if (!this._hass || this._customElementBusy || !this._customElementFormValid()) return;
    this._customElementBusy = true;
    this._customElementResult = null;
    this._stableCustomRender();
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/custom_elements/save", element: this._customElementForm });
      this._customElementForm = { ...this._emptyCustomElementForm(), ...structuredClone(result.element) };
      await this._loadCustomElements(false);
      this._syncCustomElementToAllObjects(result.element);
      if (typeof this._saveCachedDeviceDrafts === "function") this._saveCachedDeviceDrafts();
      const device = this._device();
      if (device) {
        await this._saveCurrentDeviceDraft();
      }
      const scheduledCount = Array.isArray(result.scheduled_displays) ? result.scheduled_displays.length : 0;
      this._customElementResult = {
        ok: true,
        message: scheduledCount
          ? `Prvek „${result.element.name}“ je uložený. ${scheduledCount === 1 ? "Displej byl zařazen" : `${scheduledCount} displejů bylo zařazeno`} k automatické aktualizaci.`
          : `Prvek „${result.element.name}“ je uložený. Změny byly promítnuty do uložených návrhů.`,
      };
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    } finally {
      this._customElementBusy = false;
      this._render();
      this._paint();
      this._stableCustomRender();
    }
  }

  _customMappingPath(collectionPath, field) {
    if (!field) return "";
    if (!collectionPath) return field === "$value" ? "" : field;
    return field === "$value" ? `${collectionPath}[]` : `${collectionPath}[].${field}`;
  }

  _applyCustomMappingPaths() {
    const form = this._customElementForm;
    form.json_path = this._customMappingPath(form.collection_path, form.value_field);
    form.label_json_path = form.element_type === "chart" ? this._customMappingPath(form.collection_path, form.label_field) : "";
  }

  _adoptCustomInspection(collections) {
    const form = this._customElementForm;
    const mappings = collections.flatMap((collection) => (collection.fields || []).map((field) => ({ collection, field, path: this._customMappingPath(collection.path, field.key) })));
    const existing = mappings.find((item) => item.path === form.json_path && (form.element_type !== "chart" || item.field.kind === "number"));
    if (existing) {
      form.collection_path = existing.collection.path;
      form.value_field = existing.field.key;
      const label = mappings.find((item) => item.path === form.label_json_path && item.collection.path === existing.collection.path);
      form.label_field = label?.field?.key || "";
      this._applyCustomMappingPaths();
      return;
    }
    const preferred = form.element_type === "chart"
      ? collections.find((collection) => Number(collection.count) > 1 && (collection.fields || []).some((field) => field.kind === "number"))
      : collections.find((collection) => (collection.fields || []).length);
    const collection = preferred || collections.find((item) => (item.fields || []).length);
    if (!collection) return;
    const fields = collection.fields || [];
    const value = form.element_type === "chart" ? fields.find((field) => field.kind === "number") : fields[0];
    const label = form.element_type === "chart" ? fields.find((field) => field.kind === "text") : null;
    form.collection_path = collection.path || "";
    form.value_field = value?.key || "";
    form.label_field = label?.key || "";
    this._applyCustomMappingPaths();
  }

  async _fetchCustomElementUrl(inspect = true) {
    if (!this._hass || this._customElementBusy || !this._customElementForm.url.trim()) return;
    this._customElementBusy = true;
    this._customElementResult = null;
    this._render();
    try {
      const request = (discovery = false) => this._hass.callWS({
        type: "dratek_eink/custom_elements/fetch_url",
        url: this._customElementForm.url,
        json_path: discovery ? "" : this._customElementForm.json_path || "",
        label_json_path: discovery ? "" : this._customElementForm.label_json_path || "",
      });
      let result;
      if (inspect) {
        const inspection = await request(true);
        this._customElementFields = Array.isArray(inspection.fields) ? inspection.fields : [];
        this._customElementInspection = { collections: Array.isArray(inspection.collections) ? inspection.collections : [] };
        this._adoptCustomInspection(this._customElementInspection.collections);
      }
      result = await request(false);
      if (!inspect && Array.isArray(result.collections)) this._customElementInspection = { collections: result.collections };
      this._customElementForm.sample_data = result.value || "";
      this._customElementForm.sample_labels = this._chartLabelsText(result.labels || "");
      this._customElementResult = result.mapping_error
        ? { ok: false, error: `API bylo načteno, ale přiřazení není platné: ${result.mapping_error}` }
        : { ok: true, message: `API načteno. Používám ${this._customElementForm.json_path || "celou odpověď"}${this._customElementForm.label_json_path ? ` a popisky ${this._customElementForm.label_json_path}` : ""}.` };
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    } finally {
      this._customElementBusy = false;
      this._render();
      this._paint();
    }
  }

  async _refreshCustomUrlObjects() {
    return;
    const objects = this._objects.filter((object) => object.customSourceUrl);
    for (const object of objects) {
      const result = await this._hass.callWS({
        type: "dratek_eink/custom_elements/fetch_url",
        url: object.customSourceUrl,
        json_path: object.customJsonPath || "",
        label_json_path: object.customLabelJsonPath || "",
      });
      const value = result.value || "";
      if (object.type === "chart") {
        object.data = value;
        object.chartLabels = this._chartLabelsText(result.labels || "");
      }
      else object.text = value;
      if (object.variableName) this._variables[object.variableName] = value;
    }
  }

  _chartLabelsText(value) {
    try {
      const parsed = JSON.parse(String(value || ""));
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(",");
    } catch (_err) { /* Keep plain text below. */ }
    return String(value || "");
  }

  async _deleteCustomElement(elementId) {
    if (!this._hass || !elementId || !confirm("Smazat tento vlastní prvek z knihovny?")) return;
    await this._hass.callWS({ type: "dratek_eink/custom_elements/delete", element_id: elementId });
    if (this._customElementForm.id === elementId) this._customElementForm = this._emptyCustomElementForm();
    await this._loadCustomElements();
  }

  _device() {
    const devices = this._result ? this._result.devices : [];
    return devices.find((device) => device.address === this._selectedDeviceAddress) || null;
  }

  _deviceTitle(device) {
    if (!device) return "Neni vybran displej";
    return device.display_name || device.physical_code || device.address;
  }

  async _saveDeviceName(address) {
    const device = (this._result?.devices || []).find((item) => item.address === address);
    if (!device || !this._hass) return;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/devices/set_name",
        address,
        name: this._deviceNameDraft,
      });
      device.display_name = result.name || "";
      this._editingDeviceAddress = "";
      this._deviceNameDraft = "";
    } catch (err) {
      this._error = this._message(err);
    }
    this._render();
    this._paint();
  }

  _selectPreferredRoute(device) {
    const preferred = device && device.preferred_path;
    this._selectedGatewayId = preferred && preferred.type === "gateway" ? preferred.id : "";
  }

  _baseDisplaySize(device = this._device()) {
    const sdk = device ? Number(device.sdk_type) : 75;
    const sizes = {
      8: [212, 104], 11: [212, 104],
      40: [296, 128], 43: [296, 128], 46: [296, 128], 48: [296, 128], 51: [296, 128],
      64: [400, 300], 66: [400, 300], 72: [400, 300], 75: [400, 300], 78: [400, 300],
      104: [640, 384], 106: [640, 384], 122: [640, 384],
      136: [960, 640], 139: [960, 640], 142: [960, 640], 155: [960, 640],
      160: [250, 132], 192: [196, 96], 224: [640, 360],
      264: [250, 128], 267: [250, 128], 270: [250, 128],
      296: [800, 480], 299: [800, 480], 302: [800, 480], 310: [800, 480], 315: [800, 480], 318: [800, 480],
      328: [280, 480], 379: [1360, 480], 384: [168, 384], 386: [168, 384],
      480: [384, 168], 482: [384, 168], 552: [240, 416], 555: [240, 416], 558: [240, 416],
      654: [528, 768], 686: [200, 200], 2635: [960, 680], 2667: [792, 272],
      2670: [792, 272], 2699: [272, 792], 2702: [272, 792], 4408: [800, 480],
      4412: [800, 480], 4514: [210, 480], 4556: [1024, 576], 4610: [480, 210],
      4684: [400, 600], 4716: [1600, 1200],
    };
    const size = sizes[sdk] || [250, 128];
    return { width: size[0], height: size[1] };
  }

  _displaySize(device = this._device()) {
    const size = this._baseDisplaySize(device);
    return this._orientation === "portrait"
      ? { width: Math.min(size.width, size.height), height: Math.max(size.width, size.height) }
      : { width: Math.max(size.width, size.height), height: Math.min(size.width, size.height) };
  }

  _isPe29Device(device = this._device()) {
    return !!device && [40, 43, 46, 48, 51].includes(Number(device.sdk_type));
  }

  _transformOptions() {
    return [
      ["rotate_cw", "Otočit doprava"],
      ["rotate_ccw", "Otočit doleva"],
      ["rotate_cw_flip_lr", "Doprava + zrcadlit vodorovně"],
      ["rotate_cw_flip_tb", "Doprava + zrcadlit svisle"],
      ["rotate_ccw_flip_lr", "Doleva + zrcadlit vodorovně"],
      ["rotate_ccw_flip_tb", "Doleva + zrcadlit svisle"],
      ["none", "Bez transformace"],
      ["rotate_180", "Otočit o 180°"],
      ["flip_lr", "Jen zrcadlit vodorovně"],
      ["flip_tb", "Jen zrcadlit svisle"],
    ];
  }

  _setDisplayTransform(transform) {
    const valid = this._transformOptions().some(([value]) => value === transform);
    this._displayTransform = valid ? transform : "rotate_cw";
    this._scheduleDraftSave();
  }

  _fitZoom() {
    const size = this._displaySize();
    this._zoom = Math.min(2.4, Math.max(0.55, Math.min(820 / size.width, 460 / size.height)));
  }

  async _selectDevice(address, options = {}) {
    const { saveCurrent = true, render = true } = options;
    if (!address) return;
    const normalizedAddress = String(address).toUpperCase();
    if (
      normalizedAddress === String(this._selectedDeviceAddress || "").toUpperCase()
      && normalizedAddress === this._loadedDraftAddress
      && !options.forceLoad
    ) {
      if (render) {
        this._render();
        this._paint();
      }
      return;
    }
    if (saveCurrent) await this._saveCurrentDeviceDraft();
    this._selectedDeviceAddress = address;
    this._selectPreferredRoute((this._result?.devices || []).find((device) => device.address === address));
    await this._loadDeviceDraft(address);
    this._fitZoom();
    if (render) {
      this._render();
      this._paint();
    }
  }

  _emptyDeviceDraft(device = this._device()) {
    const size = this._displaySize(device);
    const code = device && device.physical_code ? device.physical_code : "novy-displej";
    return {
      version: 1,
      name: `Navrh ${code}`,
      device_address: device ? device.address : this._selectedDeviceAddress,
      sdk_type: device ? Number(device.sdk_type) : 75,
      orientation: this._orientation,
      display_transform: this._displayTransform,
      refresh_interval_seconds: 60,
      invert_colors: false,
      background_color: "white",
      width: size.width,
      height: size.height,
      variables: {},
      rgb_led: { mode: "off", color: "#00a2a5", flash_time: 10 },
      objects: [],
    };
  }

  _applyDraft(draft) {
    this._restoringDraft = true;
    const device = this._device();
    const source = this._normalizeStoredDraft(draft) || this._emptyDeviceDraft(device);
    this._orientation = source.orientation === "portrait" ? "portrait" : "landscape";
    this._displayTransform = source.display_transform || "rotate_cw";
    this._refreshIntervalSeconds = Math.max(30, Math.min(86400, Number(source.refresh_interval_seconds) || 60));
    this._invertColors = false;
    this._backgroundColor = ["white", "black", "red"].includes(source.background_color) ? source.background_color : "white";
    const size = this._displaySize(device);
    this._objects = structuredClone(source.objects);
    this._variables = structuredClone(source.variables);
    const led = source.rgb_led || {};
    this._rgbLed = {
      mode: ["off", "on", "flash"].includes(led.mode) ? led.mode : "off",
      color: /^#[0-9a-f]{6}$/i.test(led.color || "") ? led.color.toLowerCase() : "#00a2a5",
      flashTime: Math.max(1, Math.min(255, Number(led.flash_time) || 10)),
    };
    this._ledResult = null;
    this._selectedIds = [];
    this._selectedProjectId = source.id || "";
    this._projectName = source.name || (device ? `Navrh ${this._deviceTitle(device)}` : "Novy navrh");
    this._nextId = this._nextObjectId();
    if ((source.width && source.width !== size.width) || (source.height && source.height !== size.height)) {
      this._scaleDesign({ width: source.width || size.width, height: source.height || size.height }, size);
      this._selectedProjectId = "";
    }
    this._restoringDraft = false;
  }

  _storedRecordList(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (value && typeof value === "object") return Object.values(value).filter((item) => item && typeof item === "object" && !Array.isArray(item));
    return [];
  }

  _normalizeStoredCustomElement(element) {
    if (!element || typeof element !== "object" || Array.isArray(element)) return {};
    const normalized = { ...element };
    normalized.condition_rules = this._storedRecordList(normalized.condition_rules);
    if (normalized.element_type === "layered" || normalized.layers != null) {
      normalized.layers = this._storedRecordList(normalized.layers).map((layer, index) => ({
        ...layer,
        id: String(layer.id || `layer-${index}`),
        name: String(layer.name || `Vrstva ${index + 1}`),
        objects: this._storedRecordList(layer.objects),
      }));
    }
    return normalized;
  }

  _normalizeStoredDraft(draft) {
    if (Array.isArray(draft)) return { ...this._emptyDeviceDraft(), objects: this._storedRecordList(draft) };
    if (!draft || typeof draft !== "object") return null;
    const source = { ...draft };
    source.objects = this._storedRecordList(source.objects);
    source.variables = source.variables && typeof source.variables === "object" && !Array.isArray(source.variables)
      ? source.variables
      : {};
    return source;
  }

  _setOrientation(orientation) {
    if (!["landscape", "portrait"].includes(orientation) || orientation === this._orientation) return;
    this._pushHistory();
    const before = this._displaySize();
    const clockwise = this._orientation === "landscape" && orientation === "portrait";
    this._orientation = orientation;
    const after = this._displaySize();
    if (before.width !== after.width || before.height !== after.height) {
      this._rotateDesignLayout(before, clockwise);
    }
    this._selectedIds = [];
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _rotateDesignLayout(before, clockwise = true) {
    this._objects = this._objects.map((object) => {
      const next = { ...object };
      if (next.type === "line") {
        const rotatePoint = clockwise ? this._rotatePointClockwise.bind(this) : this._rotatePointCounterClockwise.bind(this);
        const start = rotatePoint({ x: Number(next.x || 0), y: Number(next.y || 0) }, before);
        const end = rotatePoint({ x: Number(next.x2 || 0), y: Number(next.y2 || 0) }, before);
        next.x = this._snapValue(start.x);
        next.y = this._snapValue(start.y);
        next.x2 = this._snapValue(end.x);
        next.y2 = this._snapValue(end.y);
        return next;
      }
      const x = Number(next.x || 0);
      const y = Number(next.y || 0);
      const w = Math.max(1, Number(next.w || 1));
      const h = Math.max(1, Number(next.h || 1));
      next.x = this._snapValue(clockwise ? before.height - y - h : y);
      next.y = this._snapValue(clockwise ? x : before.width - x - w);
      next.w = this._snapValue(h);
      next.h = this._snapValue(w);
      next.rotation = (Number(next.rotation || 0) + (clockwise ? 90 : 270)) % 360;
      return next;
    });
  }

  _rotatePointClockwise(point, before) {
    return { x: before.height - point.y, y: point.x };
  }

  _rotatePointCounterClockwise(point, before) {
    return { x: point.y, y: before.width - point.x };
  }

  _nextObjectId() {
    const ids = this._objects
      .map((object) => String(object.id || "").match(/^obj-(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return ids.length ? Math.max(...ids) + 1 : this._objects.length + 1;
  }

  _historySnapshot() {
    return {
      objects: this._objects.map(({ _img, ...object }) => structuredClone(object)),
      selectedIds: [...this._selectedIds],
      variables: structuredClone(this._variables),
      orientation: this._orientation,
      displayTransform: this._displayTransform,
      invertColors: this._invertColors,
      backgroundColor: this._backgroundColor,
      projectName: this._projectName,
      selectedProjectId: this._selectedProjectId,
      nextId: this._nextId,
    };
  }

  _pushHistory() {
    const snapshot = this._historySnapshot();
    const last = this._undoStack[this._undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._historyLimit) this._undoStack.shift();
    this._redoStack = [];
  }

  _restoreHistory(snapshot) {
    this._objects = structuredClone(snapshot.objects || []);
    this._selectedIds = [...(snapshot.selectedIds || [])];
    this._variables = structuredClone(snapshot.variables || {});
    this._orientation = snapshot.orientation || "landscape";
    this._displayTransform = snapshot.displayTransform || "rotate_cw";
    this._invertColors = false;
    this._backgroundColor = ["white", "black", "red"].includes(snapshot.backgroundColor) ? snapshot.backgroundColor : "white";
    this._projectName = snapshot.projectName || "Novy navrh";
    this._selectedProjectId = snapshot.selectedProjectId || "";
    this._nextId = snapshot.nextId || this._nextObjectId();
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _undo() {
    if (!this._undoStack.length) return;
    this._redoStack.push(this._historySnapshot());
    this._restoreHistory(this._undoStack.pop());
  }

  _redo() {
    if (!this._redoStack.length) return;
    this._undoStack.push(this._historySnapshot());
    this._restoreHistory(this._redoStack.pop());
  }

  _isTypingEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.some((node) => {
      const tag = String(node.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
    });
  }

  _onKeyDown(event) {
    if (this._isTypingEvent(event)) return;
    if (
      this._activeTab === "custom"
      && this._customWorkspaceView === "editor"
      && this._customLayerStep === "design"
      && (event.key === "Delete" || event.key === "Backspace")
      && this._customSelectedObjectId
    ) {
      event.preventDefault();
      this._deleteCustomLayerObject();
      return;
    }
    if (this._activeTab !== "designer" || !this._device()) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && this._selectedIds.length) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      this._moveSelectedByKeyboard(dx, dy);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && this._selectedIds.length) {
      event.preventDefault();
      this._deleteSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      this._undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
      event.preventDefault();
      this._redo();
    }
  }

  _moveSelectedByKeyboard(dx, dy) {
    if (!this._selectedIds.length || (!dx && !dy)) return;
    this._pushHistory();
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.x = Math.round(Number(object.x || 0) + dx);
      object.y = Math.round(Number(object.y || 0) + dy);
      if (object.type === "line") {
        object.x2 = Math.round(Number(object.x2 || 0) + dx);
        object.y2 = Math.round(Number(object.y2 || 0) + dy);
      }
    }
    this._paint();
    this._syncProperties();
    this._scheduleDraftSave();
  }

  async _loadDeviceDraft(address) {
    if (!this._hass || !address) {
      this._applyDraft(null);
      return;
    }
    this._loadingDraft = true;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
      this._deviceDrafts[String(address).toUpperCase()] = result.draft || null;
      this._saveCachedDeviceDrafts();
      this._applyDraft(result.draft || null);
      this._loadedDraftAddress = String(address).toUpperCase();
    } catch (err) {
      this._loadedDraftAddress = "";
      this._applyDraft(null);
      this._sendResult = { ok: false, error: `Nepodarilo se nacist navrh displeje: ${this._message(err)}`, log: [] };
    } finally {
      this._loadingDraft = false;
    }
  }

  async _loadDevicePreviewDrafts(devices) {
    if (!this._hass || !Array.isArray(devices) || !devices.length) return;
    this._deviceDraftsLoading = true;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/list" });
      this._deviceDrafts = { ...this._deviceDrafts, ...(result.drafts || {}) };
    } catch (_bulkError) {
      const entries = await Promise.all(devices.map(async (device) => {
        const address = String(device.address || "").toUpperCase();
        if (!address) return null;
        try {
          const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
          return [address, result.draft || null];
        } catch (_err) {
          return null;
        }
      }));
      for (const entry of entries.filter(Boolean)) this._deviceDrafts[entry[0]] = entry[1];
    } finally {
      this._deviceDraftsLoading = false;
      this._saveCachedDeviceDrafts();
    }
  }

  _scheduleDraftSave() {
    if (this._restoringDraft || !this._hass || !this._selectedDeviceAddress) return;
    const device = this._device();
    if (device) this._deviceDrafts[String(device.address).toUpperCase()] = structuredClone(this._projectPayload(device));
    window.clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = window.setTimeout(() => this._saveCurrentDeviceDraft(), 700);
  }

  async _saveCurrentDeviceDraft() {
    if (this._restoringDraft || !this._hass || !this._selectedDeviceAddress) return;
    window.clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = null;
    const device = this._device();
    if (!device) return;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/device_drafts/save",
        address: device.address,
        draft: this._projectPayload(device),
      });
      this._deviceDrafts[String(device.address).toUpperCase()] = result.draft || this._projectPayload(device);
      this._saveCachedDeviceDrafts();
    } catch (err) {
      this._error = `Nepodarilo se ulozit pracovni navrh displeje: ${this._message(err)}`;
    }
  }

  _scaleDesign(before, after) {
    if (!before.width || !before.height) return;
    const sx = after.width / before.width;
    const sy = after.height / before.height;
    const textScale = Math.max(0.5, Math.min(2, (sx + sy) / 2));
    this._objects = this._objects.map((object) => {
      const next = { ...object };
      for (const key of ["x", "w", "x2"]) if (Number.isFinite(Number(next[key]))) next[key] = Math.max(0, Math.round(Number(next[key]) * sx));
      for (const key of ["y", "h", "y2"]) if (Number.isFinite(Number(next[key]))) next[key] = Math.max(0, Math.round(Number(next[key]) * sy));
      if (Number.isFinite(Number(next.fontSize))) next.fontSize = Math.max(6, Math.round(Number(next.fontSize) * textScale));
      if (next.type === "qr") {
        const side = Math.max(12, Math.min(next.w || 12, next.h || 12));
        next.w = side;
        next.h = side;
      }
      return next;
    });
  }

  _status() {
    if (this._error) return { cls: "bad", text: "Chyba" };
    if (!this._result) return { cls: "muted", text: "Cekam na scan" };
    if (this._result.devices.length > 0) return { cls: "good", text: `Nalezeno ${this._result.devices.length} displeju` };
    if (this._result.scanner_count === 0 && !this._gateways.some((gateway) => gateway.status?.ok)) return { cls: "bad", text: "Neni dostupna BLE cesta" };
    if (this._result.devices.length === 0) return { cls: "warn", text: "Bluetooth funguje, DRATEK eInk nenalezen" };
    return { cls: "good", text: "Bluetooth je pripraven" };
  }

  _selectedObject() {
    if (this._selectedIds.length !== 1) return null;
    return this._objects.find((object) => object.id === this._selectedIds[0]) || null;
  }

  _templateDefinitions() {
    return [
      { id: "weather", title: "Pocasi", icon: "mdi:weather-partly-cloudy", objects: [
        this._tt(92, 22, 66, 28, "☁", "black", true),
        this._tt(83, 50, 86, 16, "Patek", "black", true),
        this._tt(72, 68, 110, 14, "23. kvetna"),
        this._ln(45, 84, 205, 84),
        this._tt(83, 92, 88, 18, "12:45", "red", true, "cas"),
        this._ln(45, 112, 205, 112),
        this._tt(69, 126, 112, 30, "23°C", "black", true, "teplota"),
        this._tt(92, 157, 70, 12, "Polojasno"),
        this._tt(95, 171, 60, 11, "24° / 13°"),
        this._rr(0, 195, 250, 55, "red", "none"),
        this._tt(18, 205, 28, 11, "SO", "white"),
        this._tt(76, 205, 28, 11, "NE", "white"),
        this._tt(134, 205, 28, 11, "PO", "white"),
        this._tt(195, 205, 28, 11, "UT", "white"),
        this._tt(13, 221, 38, 16, "22°", "white", true),
        this._tt(73, 221, 38, 16, "25°", "white", true),
        this._tt(132, 221, 38, 16, "18°", "white", true),
        this._tt(190, 221, 38, 16, "20°", "white", true),
      ] },
      { id: "energy", title: "Cena energie", icon: "mdi:lightning-bolt", objects: [
        this._tt(18, 17, 30, 32, "⚡", "red", true),
        this._tt(57, 20, 150, 18, "Cena elektriny", "black", true),
        this._tt(58, 41, 72, 11, "Kc / kWh"),
        this._ln(15, 62, 235, 62),
        this._tt(24, 82, 132, 34, "2,45 Kc", "red", true, "cena_elektriny"),
        this._tt(27, 123, 110, 12, "12:00 - 13:00"),
        this._tt(27, 141, 50, 12, "Dnes"),
        this._ln(42, 192, 58, 192, "red", 2),
        this._ln(58, 192, 58, 180, "red", 2),
        this._ln(58, 180, 73, 180, "red", 2),
        this._ln(73, 180, 73, 166, "red", 2),
        this._ln(73, 166, 91, 166, "red", 2),
        this._ln(91, 166, 91, 151, "red", 2),
        this._ln(91, 151, 107, 151, "red", 2),
        this._ln(107, 151, 107, 139, "red", 2),
        this._ln(107, 139, 126, 139, "red", 2),
        this._ln(126, 139, 126, 130, "red", 2),
        this._ln(126, 130, 145, 130, "red", 2),
        this._ln(145, 130, 145, 143, "red", 2),
        this._ln(145, 143, 167, 143, "red", 2),
        this._ln(167, 143, 167, 154, "red", 2),
        this._ln(167, 154, 191, 154, "red", 2),
        this._ln(191, 154, 191, 183, "red", 2),
        this._ln(191, 183, 212, 183, "red", 2),
        this._rr(0, 196, 250, 54, "red", "none"),
        this._tt(58, 207, 116, 15, "Nejlevnejsi dnes", "white", true),
        this._tt(83, 226, 74, 20, "2,45 Kc", "white", true, "nejlevnejsi_cena"),
        this._tt(178, 230, 60, 11, "12:00 - 13:00", "white"),
      ] },
      { id: "home", title: "Dum", icon: "mdi:home", objects: [
        this._tt(19, 18, 80, 20, "Dum", "black", true),
        this._tt(82, 57, 92, 64, "⌂", "red", true),
        this._tt(39, 147, 20, 15, "♨", "black"),
        this._tt(75, 147, 82, 16, "21,5 °C", "black", false, "teplota_dum"),
        this._tt(39, 174, 20, 15, "●", "black"),
        this._tt(75, 174, 62, 16, "45 %", "black", false, "vlhkost"),
        this._tt(39, 201, 20, 15, "◉", "black"),
        this._tt(75, 201, 106, 16, "3 svetla ON", "black", false, "svetla"),
        this._tt(39, 228, 20, 15, "▣", "black"),
        this._tt(75, 228, 104, 16, "Vse zamceno", "black", false, "zamky"),
        this._ln(20, 267, 230, 267),
        this._rr(31, 276, 31, 31, "red", "none"),
        this._tt(42, 285, 26, 20, "✓", "white", true),
        this._tt(82, 286, 126, 14, "Vsechno v poradku", "red", true, "stav_domu"),
      ] },
      { id: "waste", title: "Odpady", icon: "mdi:trash-can-outline", objects: [
        this._tt(20, 18, 92, 20, "Odpady", "black", true),
        this._tt(49, 79, 72, 54, "♜", "black", true),
        this._tt(140, 86, 68, 22, "ZITRA", "red", true, "odpad_1_kdy"),
        this._tt(140, 117, 60, 18, "Plast", "black", false, "odpad_1_typ"),
        this._ln(15, 158, 235, 158),
        this._tt(51, 194, 68, 48, "♻", "black", true),
        this._tt(138, 200, 70, 18, "za 7 dni", "red", true, "odpad_2_kdy"),
        this._tt(140, 230, 62, 18, "Papir", "black", false, "odpad_2_typ"),
      ] },
      { id: "solar", title: "Fotovoltaika", icon: "mdi:solar-power", objects: [
        this._tt(22, 18, 34, 28, "☼", "black", false),
        this._tt(78, 20, 142, 19, "Fotovoltaika", "black", true),
        this._tt(80, 42, 96, 11, "Aktualni vykon"),
        this._tt(78, 75, 96, 58, "▦", "black", true),
        this._tt(66, 136, 132, 31, "2,35 kW", "black", true, "vykon_fve"),
        this._ln(15, 183, 235, 183),
        this._tt(20, 197, 70, 13, "Dnes"),
        this._tt(165, 197, 58, 13, "8,2 kWh", "black", true, "fve_dnes"),
        this._ln(15, 214, 235, 214),
        this._tt(20, 228, 82, 13, "Tento mesic"),
        this._tt(158, 228, 65, 13, "152 kWh", "black", true, "fve_mesic"),
        this._ln(15, 245, 235, 245),
        this._tt(20, 259, 70, 13, "Celkem"),
        this._tt(155, 259, 70, 13, "3,45 MWh", "black", true, "fve_celkem"),
        this._rr(0, 290, 250, 40, "red", "none"),
        this._tt(58, 305, 132, 15, "Uspora CO2: 125 kg", "white", true, "uspora_co2"),
      ] },
      { id: "washer", title: "Pracka", icon: "mdi:washing-machine", objects: [
        this._tt(18, 18, 80, 20, "Pracka", "black", true),
        this._tt(50, 62, 94, 76, "▣", "black", true),
        this._tt(22, 154, 54, 14, "Program"),
        this._tt(22, 174, 112, 18, "Bavlna 60°", "red", true, "program_pracky"),
        this._ln(15, 203, 235, 203),
        this._tt(22, 221, 18, 15, "◷"),
        this._tt(59, 222, 48, 13, "Zbyva"),
        this._tt(143, 217, 70, 22, "01:15", "red", true, "pracka_zbyva"),
        this._ln(15, 250, 235, 250),
        this._tt(59, 267, 116, 15, "Skonci v 14:30", "black", true, "pracka_konec"),
      ] },
      { id: "living", title: "Obyvak", icon: "mdi:sofa-outline", objects: [
        this._tt(20, 18, 88, 20, "Obyvak", "black", true),
        this._tt(38, 78, 36, 50, "♨", "red", true),
        this._tt(96, 88, 118, 32, "23,5 °C", "black", true, "teplota_obyvak"),
        this._ln(20, 154, 230, 154),
        this._tt(48, 188, 30, 30, "●", "black", true),
        this._tt(94, 193, 104, 18, "Vlhkost: 40 %", "black", true, "vlhkost_obyvak"),
        this._ln(20, 230, 230, 230),
        this._tt(66, 267, 124, 18, "CO2: 650 ppm", "black", true, "co2_obyvak"),
      ] },
      { id: "presence", title: "Kdo je doma", icon: "mdi:account-group", objects: [
        this._tt(17, 18, 124, 20, "Kdo je doma", "black", true),
        this._tt(25, 67, 18, 18, "●"),
        this._tt(57, 68, 80, 16, "Petr", "black", false, "petr_stav"),
        this._tt(205, 65, 28, 22, "⌂", "red", true),
        this._ln(15, 100, 235, 100),
        this._tt(25, 118, 18, 18, "●"),
        this._tt(57, 119, 80, 16, "Jana", "black", false, "jana_stav"),
        this._tt(205, 116, 28, 22, "⌂", "red", true),
        this._ln(15, 151, 235, 151),
        this._tt(25, 168, 18, 18, "●"),
        this._tt(57, 169, 80, 16, "Eliska", "black", false, "eliska_jmeno"),
        this._tt(165, 171, 70, 15, "Ve skole", "red", true, "eliska_stav"),
        this._rr(0, 218, 250, 54, "red", "none"),
        this._tt(35, 229, 24, 22, "◷", "white", true),
        this._tt(76, 229, 128, 13, "Posledni aktualizace", "white", true),
        this._tt(76, 246, 64, 20, "12:45", "white", true, "cas_update"),
      ] },
      { id: "wifi", title: "Wi-Fi", icon: "mdi:wifi", objects: [
        this._tt(17, 18, 60, 20, "Wi-Fi", "black", true),
        this._qr(72, 58, 106, "WIFI:T:WPA;S:Home_Network;P:MyPassword123;;"),
        this._tt(20, 181, 34, 12, "Sit"),
        this._tt(20, 198, 130, 14, "Home_Network", "red", true, "wifi_ssid"),
        this._ln(15, 220, 235, 220),
        this._tt(20, 234, 48, 12, "Heslo"),
        this._tt(20, 251, 140, 14, "MyPassword123", "red", true, "wifi_heslo"),
        this._ln(15, 277, 235, 277),
        this._tt(37, 293, 28, 20, "≋", "black", true),
        this._tt(82, 297, 120, 12, "Naskenuj pro pripojeni"),
      ] },
      { id: "calendar", title: "Kalendar", icon: "mdi:calendar-month", objects: [
        this._tt(19, 18, 96, 20, "Kalendar", "black", true),
        this._tt(26, 69, 52, 45, "23", "black", true),
        this._tt(99, 64, 68, 16, "PATEK", "red", true, "udalost_1_den"),
        this._tt(99, 85, 72, 15, "Schuzka", "black", false, "udalost_1_nazev"),
        this._tt(99, 104, 58, 14, "15:00", "black", false, "udalost_1_cas"),
        this._ln(15, 137, 235, 137),
        this._tt(26, 166, 52, 45, "24", "black", true),
        this._tt(99, 161, 82, 16, "SOBOTA", "red", true, "udalost_2_den"),
        this._tt(99, 182, 96, 15, "Narozeniny", "black", false, "udalost_2_nazev"),
        this._tt(99, 201, 70, 14, "Tomas", "black", false, "udalost_2_detail"),
        this._rr(0, 240, 250, 58, "red", "none"),
        this._tt(34, 254, 34, 23, "♛", "white", true),
        this._tt(78, 253, 112, 13, "Zitra ma svatek", "white"),
        this._tt(78, 271, 70, 18, "Jana", "white", true, "svatek"),
      ] },
    ];
  }

  _tt(x, y, w, h, text, color = "black", bold = false, variableName = "", align = "center") {
    const minFontSize = h >= 28 ? 18 : h >= 18 ? 13 : 11;
    return {
      type: "text",
      x,
      y,
      w,
      h,
      text,
      color,
      fontSize: h,
      fontFamily: "Arial",
      minFontSize,
      bold,
      rotation: 0,
      variable: !!variableName,
      variableName,
      textAlign: align,
      verticalAlign: "middle",
      autoFit: true,
    };
  }

  _rr(x, y, w, h, fill = "none", stroke = "black", strokeWidth = 1) {
    return { type: "rect", x, y, w, h, fill, stroke, strokeWidth, color: stroke, rotation: 0 };
  }

  _ln(x, y, x2, y2, color = "black", strokeWidth = 1) {
    return { type: "line", x, y, x2, y2, color, strokeWidth, rotation: 0 };
  }

  _qr(x, y, side, text) {
    return { type: "qr", x, y, w: side, h: side, text, color: "black", rotation: 0, keepRatio: true };
  }

  _symbolCategories() {
    return [
      ["all", "Vše"],
      ["weather", "Počasí"],
      ["home", "Domácnost"],
      ["energy", "Energie"],
      ["tech", "Technika"],
      ["status", "Stavy"],
      ["people", "Lidé"],
      ["time", "Čas"],
      ["transport", "Doprava"],
      ["finance", "Finance"],
      ["security", "Bezpečnost"],
      ["health", "Zdraví"],
      ["media", "Media"],
      ["food", "Jídlo"],
      ["shop", "Obchod"],
      ["nature", "Příroda"],
      ["arrows", "Šipky"],
      ["symbols", "Značky"],
    ];
  }

  _symbolCatalog() {
    return [
      ["weather", "slunce", "☀"], ["weather", "slunce male", "☼"], ["weather", "mrak", "☁"], ["weather", "dest", "☂"], ["weather", "snih", "❄"], ["weather", "blesk", "⚡"], ["weather", "teplota", "℃"], ["weather", "teplota f", "℉"], ["weather", "vitr", "≋"], ["weather", "noc", "☾"], ["weather", "mesic", "☽"], ["weather", "hvezda", "★"], ["weather", "kapka", "●"], ["weather", "vlhkost", "%"], ["weather", "tlak", "hPa"], ["weather", "uv", "UV"], ["weather", "mlha", "≡"], ["weather", "mrholeni", "⋮"], ["weather", "duha", "⌒"], ["weather", "mraz", "*"],
      ["home", "dum", "⌂"], ["home", "doma", "⌂"], ["home", "zamek", "▣"], ["home", "odemceno", "▢"], ["home", "klic", "⚿"], ["home", "svetlo", "◉"], ["home", "zarovka", "●"], ["home", "voda", "●"], ["home", "kohout", "⌐"], ["home", "odpad", "♜"], ["home", "recyklace", "♻"], ["home", "pracka", "▣"], ["home", "mycka", "▤"], ["home", "lednice", "▯"], ["home", "trouba", "▥"], ["home", "topeni", "♨"], ["home", "termostat", "℃"], ["home", "ventilator", "✶"], ["home", "okno", "▥"], ["home", "dvere", "▯"], ["home", "garaz", "▰"], ["home", "zahrada", "♧"], ["home", "bazén", "≈"], ["home", "zaluzie", "▤"],
      ["energy", "blesk", "⚡"], ["energy", "solar", "▦"], ["energy", "panel", "▦"], ["energy", "uspora", "✓"], ["energy", "list", "♧"], ["energy", "graf", "▥"], ["energy", "baterie plna", "▰"], ["energy", "baterie pul", "▱"], ["energy", "zasuvka", "⌁"], ["energy", "nabijeni", "⚡"], ["energy", "vykon", "kW"], ["energy", "energie", "kWh"], ["energy", "plyn", "◌"], ["energy", "voda", "≈"], ["energy", "co2", "CO₂"], ["energy", "nahoru", "▲"], ["energy", "dolu", "▼"], ["energy", "tarif", "T"], ["energy", "cena", "Kč"], ["energy", "sit", "▤"],
      ["tech", "wifi", "≋"], ["tech", "signal", "▂"], ["tech", "signal 2", "▃"], ["tech", "signal 3", "▄"], ["tech", "qr", "▦"], ["tech", "barcode", "▥"], ["tech", "server", "▤"], ["tech", "senzor", "◌"], ["tech", "chip", "▣"], ["tech", "bluetooth", "B"], ["tech", "mobil", "▯"], ["tech", "tablet", "▭"], ["tech", "pc", "▰"], ["tech", "router", "▤"], ["tech", "cloud", "☁"], ["tech", "database", "▦"], ["tech", "api", "API"], ["tech", "kamera", "▣"], ["tech", "mikrofon", "♪"], ["tech", "reproduktor", "◁"], ["tech", "nastaveni", "⚙"], ["tech", "terminal", ">_"], ["tech", "download", "↓"], ["tech", "upload", "↑"],
      ["status", "ok", "✓"], ["status", "hotovo", "✓"], ["status", "chyba", "✕"], ["status", "krizek", "×"], ["status", "varovani", "!"], ["status", "info", "i"], ["status", "otazka", "?"], ["status", "nahoru", "▲"], ["status", "dolu", "▼"], ["status", "zapnuto", "●"], ["status", "vypnuto", "○"], ["status", "stop", "■"], ["status", "pauza", "Ⅱ"], ["status", "play", "▶"], ["status", "record", "●"], ["status", "minus", "−"], ["status", "plus", "+"], ["status", "rovna se", "="], ["status", "stav dobry", "OK"], ["status", "stav low", "LOW"], ["status", "stav high", "HI"],
      ["people", "osoba", "●"], ["people", "clovek", "●"], ["people", "doma", "⌂"], ["people", "prace", "▣"], ["people", "skola", "▥"], ["people", "srdce", "♥"], ["people", "hvezda", "★"], ["people", "rodina", "●●"], ["people", "dite", "•"], ["people", "spanek", "Zz"], ["people", "aktivita", "▲"], ["people", "prichod", "→"], ["people", "odchod", "←"], ["people", "host", "G"], ["people", "uzivatel", "U"], ["people", "telefon", "▯"],
      ["time", "hodiny", "◷"], ["time", "cas", "◷"], ["time", "kalendar", "▣"], ["time", "den", "☀"], ["time", "noc", "☾"], ["time", "alarm", "!"], ["time", "pauza", "Ⅱ"], ["time", "timer", "◴"], ["time", "stopky", "◵"], ["time", "obnovit", "↻"], ["time", "opakovat", "↺"], ["time", "dnes", "D"], ["time", "zitra", "Z"], ["time", "tyden", "T"], ["time", "mesic", "M"], ["time", "rok", "R"],
      ["transport", "auto", "▰"], ["transport", "bus", "▣"], ["transport", "vlak", "▤"], ["transport", "kolo", "○"], ["transport", "kolobezka", "o"], ["transport", "nabijeni", "⚡"], ["transport", "parkovani", "P"], ["transport", "letadlo", "✈"], ["transport", "lod", "⌁"], ["transport", "pesky", "●"], ["transport", "trasa", "→"], ["transport", "sever", "N"], ["transport", "jih", "S"], ["transport", "vychod", "E"], ["transport", "zapad", "W"], ["transport", "domu", "⌂"],
      ["finance", "koruna", "Kč"], ["finance", "euro", "€"], ["finance", "dolar", "$"], ["finance", "libra", "£"], ["finance", "yen", "¥"], ["finance", "procenta", "%"], ["finance", "promile", "‰"], ["finance", "tag", "◆"], ["finance", "sleva", "-%"], ["finance", "nahoru", "▲"], ["finance", "dolu", "▼"], ["finance", "cena", "Kč"], ["finance", "faktura", "▤"], ["finance", "platba", "✓"], ["finance", "kosik", "▢"], ["finance", "nejlevnejsi", "★"],
      ["security", "alarm", "!"], ["security", "zamek", "▣"], ["security", "odemceno", "▢"], ["security", "straz", "◉"], ["security", "kamera", "▣"], ["security", "pohyb", "◌"], ["security", "sirena", ")))"], ["security", "pozar", "▲"], ["security", "kour", "≋"], ["security", "voda", "≈"], ["security", "okno", "▥"], ["security", "dvere", "▯"], ["security", "bezpecne", "✓"], ["security", "problem", "✕"], ["security", "pin", "●●●"], ["security", "sos", "SOS"],
      ["health", "srdce", "♥"], ["health", "tep", "♥"], ["health", "teplota", "℃"], ["health", "kroky", "●"], ["health", "spanek", "Zz"], ["health", "vaha", "kg"], ["health", "lek", "+"], ["health", "prvni pomoc", "✚"], ["health", "voda", "●"], ["health", "jidlo", "◐"], ["health", "sport", "▲"], ["health", "klid", "○"], ["health", "varovani", "!"], ["health", "ok", "✓"],
      ["media", "play", "▶"], ["media", "pause", "Ⅱ"], ["media", "stop", "■"], ["media", "record", "●"], ["media", "prev", "◀"], ["media", "next", "▶"], ["media", "volume", ")))"], ["media", "mute", "×"], ["media", "hudba", "♪"], ["media", "radio", "▤"], ["media", "tv", "▭"], ["media", "film", "▥"], ["media", "foto", "▣"], ["media", "kamera", "▣"], ["media", "playlist", "≡"],
      ["food", "jidlo", "◐"], ["food", "kava", "☕"], ["food", "caj", "☕"], ["food", "voda", "●"], ["food", "vino", "◡"], ["food", "pivo", "▱"], ["food", "snidane", "☀"], ["food", "obed", "○"], ["food", "vecere", "☾"], ["food", "nakup", "▢"], ["food", "lednice", "▯"], ["food", "teplota", "℃"], ["food", "hotovo", "✓"], ["food", "cas", "◷"],
      ["shop", "kosik", "▢"], ["shop", "tag", "◆"], ["shop", "sleva", "%"], ["shop", "cena", "Kč"], ["shop", "ean", "▥"], ["shop", "qr", "▦"], ["shop", "balik", "▣"], ["shop", "sklad", "▤"], ["shop", "doprava", "→"], ["shop", "hotovo", "✓"], ["shop", "chybi", "!"], ["shop", "plus", "+"], ["shop", "minus", "−"], ["shop", "favorite", "★"],
      ["nature", "list", "♧"], ["nature", "strom", "♣"], ["nature", "kvetina", "✿"], ["nature", "slunce", "☀"], ["nature", "voda", "≈"], ["nature", "hora", "▲"], ["nature", "oheň", "▲"], ["nature", "snih", "❄"], ["nature", "mesic", "☾"], ["nature", "hvezda", "★"], ["nature", "recyklace", "♻"], ["nature", "co2", "CO₂"], ["nature", "eko", "ECO"],
      ["arrows", "vpravo", "→"], ["arrows", "vlevo", "←"], ["arrows", "nahoru", "↑"], ["arrows", "dolu", "↓"], ["arrows", "severovychod", "↗"], ["arrows", "severozapad", "↖"], ["arrows", "jihovychod", "↘"], ["arrows", "jihozapad", "↙"], ["arrows", "obnovit", "↻"], ["arrows", "zpet", "↺"], ["arrows", "enter", "↵"], ["arrows", "tam zpet", "↔"], ["arrows", "nahoru dolu", "↕"], ["arrows", "rychle", "»"], ["arrows", "pomalu", "«"], ["arrows", "pokračovat", "▶"],
      ["symbols", "check", "✓"], ["symbols", "cross", "✕"], ["symbols", "krat", "×"], ["symbols", "plus", "+"], ["symbols", "minus", "−"], ["symbols", "star", "★"], ["symbols", "heart", "♥"], ["symbols", "circle", "●"], ["symbols", "circle empty", "○"], ["symbols", "square", "■"], ["symbols", "square empty", "□"], ["symbols", "diamond", "◆"], ["symbols", "diamond empty", "◇"], ["symbols", "triangle up", "▲"], ["symbols", "triangle down", "▼"], ["symbols", "dot", "•"], ["symbols", "hash", "#"], ["symbols", "at", "@"], ["symbols", "ampersand", "&"], ["symbols", "degree", "°"], ["symbols", "copyright", "©"], ["symbols", "registered", "®"], ["symbols", "section", "§"],
    ].map(([category, label, symbol]) => ({ category, label, symbol }));
  }

  _addSymbol(symbol) {
    this._pushHistory();
    const size = this._displaySize();
    const object = {
      id: `obj-${this._nextId++}`,
      type: "text",
      x: this._snapValue(size.width * 0.42),
      y: this._snapValue(size.height * 0.38),
      w: this._snapValue(Math.max(36, size.width * 0.16)),
      h: this._snapValue(Math.max(36, size.height * 0.16)),
      rotation: 0,
      flipH: false,
      color: "black",
      text: symbol,
      fontSize: Math.max(26, Math.round(Math.min(size.width, size.height) * 0.12)),
      fontFamily: "Arial",
      minFontSize: 18,
      bold: true,
      variable: false,
      variableName: "",
      entityId: "",
      entityAttribute: "",
      textAlign: "center",
      verticalAlign: "middle",
      autoFit: true,
    };
    this._objects.push(object);
    this._selectedIds = [object.id];
    this._symbolPickerOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _applyTemplate(templateId) {
    const template = this._templateDefinitions().find((item) => item.id === templateId);
    if (!template) return;
    if (this._objects.length && !confirm(`Nahradit aktualni navrh sablonou "${template.title}"?`)) return;
    this._pushHistory();
    this._orientation = "portrait";
    const size = this._displaySize();
    const sourceWidth = Math.max(250, ...template.objects.map((object) => Math.max(Number(object.x || 0), Number(object.x2 || 0)) + Number(object.w || 0)));
    const sourceHeight = Math.max(300, ...template.objects.map((object) => Math.max(Number(object.y || 0), Number(object.y2 || 0)) + Number(object.h || 0)));
    const sx = size.width / sourceWidth;
    const sy = size.height / sourceHeight;
    const variables = {};
    this._objects = template.objects.map((object, index) => {
      const next = structuredClone(object);
      next.id = `obj-${index + 1}`;
      next.x = this._snapValue(Number(next.x || 0) * sx);
      next.y = this._snapValue(Number(next.y || 0) * sy);
      if (next.x2 !== undefined) next.x2 = this._snapValue(Number(next.x2 || 0) * sx);
      if (next.y2 !== undefined) next.y2 = this._snapValue(Number(next.y2 || 0) * sy);
      if (next.w !== undefined) next.w = Math.max(1, this._snapValue(Number(next.w || 1) * sx));
      if (next.h !== undefined) next.h = Math.max(1, this._snapValue(Number(next.h || 1) * sy));
      if (next.fontSize !== undefined) next.fontSize = Math.max(7, Math.round(Number(next.fontSize || 12) * Math.min(sx, sy)));
      if (next.minFontSize !== undefined) next.minFontSize = Math.max(11, Math.round(Number(next.minFontSize || 11) * Math.min(sx, sy)));
      if (next.strokeWidth !== undefined) next.strokeWidth = Math.max(1, Math.round(Number(next.strokeWidth || 1) * Math.min(sx, sy)));
      if (next.type === "text" && Number(next.fontSize || 0) <= 16 && Number(next.w || 0) >= 48) {
        next.textAlign = "left";
      }
      if (next.variable && next.variableName) variables[next.variableName] = next.type === "chart" ? (next.data || "") : (next.text || "");
      return next;
    });
    this._variables = variables;
    this._invertColors = false;
    this._backgroundColor = "white";
    this._selectedIds = [];
    this._selectedProjectId = "";
    this._projectName = `Sablona ${template.title}`;
    this._nextId = this._nextObjectId();
    this._templateDialogOpen = false;
    this._newProjectDialogOpen = false;
    this._fileMenuOpen = false;
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _addObject(type) {
    this._pushHistory();
    const size = this._displaySize();
    const requestedType = type;
    if (type === "status") type = "text";
    const object = {
      id: `obj-${this._nextId++}`,
      type,
      x: this._snapValue(size.width * 0.12),
      y: this._snapValue(size.height * 0.15),
      w: this._snapValue(size.width * 0.35),
      h: this._snapValue(size.height * 0.2),
      rotation: 0,
      flipH: false,
      color: "black",
      backgroundColor: "white",
      fill: "none",
      stroke: "black",
      strokeWidth: 2,
      text: type === "text" ? "Text" : type === "qr" ? "https://dratek.cz" : "8591234567890",
      fontSize: Math.max(16, Math.round(size.height * 0.16)),
      fontFamily: "Arial",
      minFontSize: 12,
      bold: false,
      variable: false,
      variableName: "",
      textAlign: "left",
      verticalAlign: "middle",
      autoFit: true,
      image: "",
      keepRatio: type === "image",
    };
    if (type === "rect") object.fill = "red";
    if (requestedType === "status") {
      object.text = "●";
      object.w = this._snapValue(size.width * 0.28);
      object.h = this._snapValue(size.height * 0.34);
      object.fontSize = Math.max(22, Math.round(size.height * 0.24));
      object.bold = true;
      object.variable = true;
      object.variableName = this._uniqueVariableName("stav_on_off", object.id);
      object.textAlign = "center";
      object.statusIcons = true;
      object.statusOnSymbol = "●";
      object.statusOffSymbol = "○";
      object.statusOnValues = "on,true,1,open,home";
      object.conditionRules = [];
      object.defaultSymbol = "○";
      object.autoUpdate = true;
    }
    if (type === "line") {
      object.x2 = object.x + this._snapValue(size.width * 0.38);
      object.y2 = object.y + this._snapValue(size.height * 0.2);
    }
    if (type === "barcode") object.h = this._snapValue(size.height * 0.32);
    if (type === "chart") {
      object.w = this._snapValue(size.width * 0.72);
      object.h = this._snapValue(size.height * 0.62);
      object.chartType = "bar";
      object.data = "1.62, 1.48, 1.36, 1.29, 1.34, 1.51, 1.88, 2.24, 2.06, 1.72, 1.38, 1.12, 0.94, 0.86, 0.91, 1.08, 1.42, 1.96, 2.58, 2.74, 2.39, 2.05, 1.84, 1.68";
      object.chartLabels = "00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23";
      object.chartTitle = "Cena elektřiny";
      object.xLabel = "Hodina";
      object.yLabel = "Kč/kWh";
      object.chartMin = "";
      object.chartMax = "";
      object.maxPoints = 24;
      object.showAxes = true;
      object.showGrid = true;
      object.showValues = false;
      object.barColor = "red";
      object.graphColor = "black";
      object.legendFontSize = 8;
      object.variable = true;
      object.variableName = this._uniqueVariableName("ceny_spot_24h", object.id);
    }
    if (requestedType === "bar_gauge") {
      Object.assign(object, {
        type: "bar_gauge", w: this._snapValue(size.width * 0.68), h: this._snapValue(size.height * 0.25),
        label: "Ukazatel", min_value: 0, max_value: 100, sample_value: 65, unit: "%",
        orientation: "horizontal", fill: "red", stroke: "black", stroke_width: 2,
        show_value: true, entityId: "", entityAttribute: "", autoUpdate: true,
      });
    }
    if (requestedType === "pie") {
      const side = this._snapValue(Math.min(size.width * 0.38, size.height * 0.72));
      Object.assign(object, {
        type: "pie", w: side, h: side, label: "Koláč", min_value: 0, max_value: 100,
        sample_value: 65, unit: "%", hole_percent: 45, color: "red",
        show_value: true, entityId: "", entityAttribute: "", autoUpdate: true, keepRatio: true,
      });
    }
    if (requestedType === "slider") {
      Object.assign(object, {
        type: "slider", w: this._snapValue(size.width * 0.64), h: this._snapValue(size.height * 0.34),
        label: "Hodnota", min_value: 0, max_value: 100, sample_value: 50, unit: "%",
        color: "red", show_value: true, entityId: "", entityAttribute: "", autoUpdate: true,
      });
    }
    if (requestedType === "gauge" || requestedType === "potentiometer") {
      Object.assign(object, {
        type: "gauge", w: this._snapValue(size.width * 0.45), h: this._snapValue(size.height * 0.68),
        label: "Budík", min_value: 0, max_value: 100, sample_value: 62, unit: "%",
        color: "red", stroke_width: 6, arc_mode: "240", show_arc: true,
        show_needle: true, show_value: true, entityId: "", entityAttribute: "", autoUpdate: true,
      });
    }
    if (type === "qr") {
      object.w = Math.min(object.w, object.h);
      object.h = object.w;
      object.keepRatio = true;
    }
    this._objects.push(object);
    if (object.variable && object.variableName) this._variables[object.variableName] = object.type === "chart" ? object.data : object.text;
    this._selectedIds = [object.id];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _customElementObject(element, size, id = `obj-${this._nextId++}`) {
    const width = Math.max(24, Math.round(size.width * (Number(element.width_percent) || 55) / 100));
    const height = Math.max(24, Math.round(size.height * (Number(element.height_percent) || 35) / 100));
    const entityId = element.entity_id || "";
    const sample = String(element.sample_data || this._customElementCurrentValue(element) || "");
    if (element.element_type === "layered") {
      const ratio = Math.max(0.2, Number(element.canvas_width || 296) / Math.max(1, Number(element.canvas_height || 128)));
      let layerWidth = Math.max(48, Math.round(size.width * 0.62));
      let layerHeight = Math.round(layerWidth / ratio);
      if (layerHeight > size.height * 0.72) {
        layerHeight = Math.round(size.height * 0.72);
        layerWidth = Math.round(layerHeight * ratio);
      }
      return {
        id, type: "layered", x: Math.round((size.width - layerWidth) / 2), y: Math.round((size.height - layerHeight) / 2),
        w: layerWidth, h: layerHeight, rotation: 0, flipH: false,
        entityId, entityAttribute: element.entity_attribute || "", autoUpdate: true,
        customElementId: element.id || "", customLayers: structuredClone(element.layers || []),
        customCanvasWidth: Number(element.canvas_width || 296), customCanvasHeight: Number(element.canvas_height || 128),
        conditionRules: structuredClone((element.condition_rules || []).map((rule) => ({ operator: rule.operator, value: rule.value || "", symbol: rule.layer_id || "" }))),
        defaultSymbol: element.default_layer_id || element.layers?.[0]?.id || "",
      };
    }
    if (element.element_type === "icon") {
      const side = Math.max(24, Math.round(Math.min(size.width, size.height) * (Number(element.width_percent) || 55) / 100));
      return {
        id, type: "image", x: Math.round((size.width - side) / 2), y: Math.round((size.height - side) / 2),
        w: side, h: side, rotation: 0, flipH: false, image: element.icon_image || "", keepRatio: true,
        customElementId: element.id || "",
      };
    }
    if (element.element_type === "chart") {
      return {
        id, type: "chart", x: Math.round((size.width - width) / 2), y: Math.round((size.height - height) / 2),
        w: width, h: height, rotation: 0, flipH: false, color: element.color || "black",
        backgroundColor: "white", chartType: element.chart_type || "line", data: sample || "1,2,3,2,4",
        chartLabels: element.sample_labels || "", chartTitle: element.label || element.name || "Graf", xLabel: "", yLabel: element.unit || "",
        chartMin: "", chartMax: "", maxPoints: Number(element.history_points || 24), historyMode: element.history_mode || "rolling", showAxes: true, showGrid: true, showValues: false,
        barColor: element.color || "red", graphColor: "black", legendFontSize: 8,
        variable: !entityId, variableName: this._uniqueVariableName(`custom_${String(element.name || "graf").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, id),
        entityId, entityAttribute: element.entity_attribute || "", customElementId: element.id || "",
      };
    }
    const status = element.element_type === "status";
    const label = element.label ? `${element.label}${status ? "\n" : ": "}` : "";
    return {
      id, type: "text", x: Math.round((size.width - width) / 2), y: Math.round((size.height - height) / 2),
      w: width, h: height, rotation: 0, flipH: false, color: element.color || "black",
      text: status ? (element.default_symbol || "?") : `${label}${sample || "Hodnota"}${element.unit ? ` ${element.unit}` : ""}`,
      fontSize: Math.max(16, Math.round(Math.min(size.width, size.height) * (status ? 0.2 : 0.12))),
      fontFamily: "Arial", minFontSize: 11, bold: true, variable: true,
      variableName: this._uniqueVariableName(`custom_${String(element.name || "prvek").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, id),
      entityId, entityAttribute: element.entity_attribute || "", textAlign: "center", verticalAlign: "middle", autoFit: true,
      autoUpdate: !!entityId, valuePrefix: status ? "" : label, valueSuffix: status || !element.unit ? "" : ` ${element.unit}`,
      statusIcons: status, statusOnSymbol: element.on_symbol || "●", statusOffSymbol: element.off_symbol || "○",
      statusOnValues: element.on_values || "on,true,1,open,home", customElementId: element.id || "",
      conditionRules: structuredClone(element.condition_rules || []), defaultSymbol: element.default_symbol || "?",
    };
  }

  async _insertCustomElement(element, openDesigner = true) {
    const device = this._device() || this._result?.devices?.[0];
    if (!device) {
      this._customElementResult = { ok: false, error: "Nejprve musí být nalezen alespoň jeden displej." };
      this._render();
      return;
    }
    if (device.address !== this._selectedDeviceAddress) await this._selectDevice(device.address, { saveCurrent: true, render: false });
    this._pushHistory();
    const object = this._customElementObject(element, this._displaySize(device));
    this._objects.push(object);
    if (object.variable && object.variableName) this._variables[object.variableName] = object.data || object.text || "";
    this._selectedIds = [object.id];
    this._projectName = this._projectName === "Novy navrh" ? `Návrh ${this._deviceTitle(device)}` : this._projectName;
    await this._saveCurrentDeviceDraft();
    if (openDesigner) this._activeTab = "designer";
    this._customElementResult = { ok: true, message: `Prvek „${element.name}“ byl vložen do návrhu displeje ${this._deviceTitle(device)}.` };
    this._render();
    this._paint();
  }

  async _applyCustomElementToAll(element) {
    const devices = this._result?.devices || [];
    if (!devices.length || this._customElementBusy) return;
    if (!confirm(`Přidat prvek „${element.name}“ do uloženého návrhu všech ${devices.length} displejů?`)) return;
    this._customElementBusy = true;
    this._render();
    try {
      for (let index = 0; index < devices.length; index++) {
        const device = devices[index];
        const address = String(device.address || "").toUpperCase();
        const loaded = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
        const base = this._baseDisplaySize(device);
        const draft = loaded.draft || {
          version: 1, name: `Návrh ${this._deviceTitle(device)}`, device_address: address,
          sdk_type: Number(device.sdk_type), orientation: "landscape", display_transform: "rotate_cw",
          refresh_interval_seconds: 60,
          invert_colors: false, background_color: "white", width: Math.max(base.width, base.height),
          height: Math.min(base.width, base.height), variables: {}, objects: [],
        };
        const size = { width: Number(draft.width) || Math.max(base.width, base.height), height: Number(draft.height) || Math.min(base.width, base.height) };
        const object = this._customElementObject(element, size, `custom-${Date.now()}-${index}`);
        draft.objects = [...(Array.isArray(draft.objects) ? draft.objects : []), object];
        draft.variables = { ...(draft.variables || {}) };
        if (object.variable && object.variableName) draft.variables[object.variableName] = object.data || object.text || "";
        const saved = await this._hass.callWS({ type: "dratek_eink/device_drafts/save", address, draft });
        this._deviceDrafts[address] = saved.draft;
      }
      this._saveCachedDeviceDrafts();
      if (this._selectedDeviceAddress) await this._loadDeviceDraft(this._selectedDeviceAddress);
      this._customElementResult = { ok: true, message: `Prvek byl přidán do návrhů ${devices.length} displejů.` };
    } catch (err) {
      this._customElementResult = { ok: false, error: this._message(err) };
    } finally {
      this._customElementBusy = false;
      this._render();
      this._paint();
    }
  }

  _addImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = this._displaySize();
        const maxW = Math.round(size.width * 0.45);
        const scale = Math.min(1, maxW / img.width);
        this._pushHistory();
        const object = {
          id: `obj-${this._nextId++}`,
          type: "image",
          x: this._snapValue(size.width * 0.12),
          y: this._snapValue(size.height * 0.15),
          w: Math.max(20, this._snapValue(img.width * scale)),
          h: Math.max(20, this._snapValue(img.height * scale)),
          rotation: 0,
          flipH: false,
          image: reader.result,
          tint: "original",
          keepRatio: true,
        };
        this._objects.push(object);
        this._selectedIds = [object.id];
        this._render();
        this._paint();
        this._scheduleDraftSave();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  _setCustomIconFile(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      this._customElementResult = { ok: false, error: "Vyberte obrázek ve formátu PNG, JPG, WebP nebo GIF." };
      this._stableCustomRender();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this._customElementResult = { ok: false, error: "Obrázek může mít maximálně 10 MB." };
      this._stableCustomRender();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        this._customElementForm.icon_image = canvas.toDataURL("image/png");
        this._customElementResult = { ok: true, message: "Ikona je připravená. Po vložení ji můžete v designeru přesouvat a měnit její velikost." };
        this._stableCustomRender();
      };
      image.onerror = () => {
        this._customElementResult = { ok: false, error: "Obrázek se nepodařilo načíst." };
        this._stableCustomRender();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  _deleteSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const selected = new Set(this._selectedIds);
    for (const object of this._objects.filter((object) => selected.has(object.id))) {
      if (object.variableName) delete this._variables[object.variableName];
    }
    this._objects = this._objects.filter((object) => !selected.has(object.id));
    this._selectedIds = [];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _duplicateSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const selected = new Set(this._selectedIds);
    const copies = this._objects.filter((object) => selected.has(object.id)).map(({ _img, ...object }) => {
      const copy = {
        ...structuredClone(object),
        id: `obj-${this._nextId++}`,
        x: this._snapValue((object.x || 0) + 10),
        y: this._snapValue((object.y || 0) + 10),
        x2: object.x2 === undefined ? undefined : this._snapValue(object.x2 + 10),
        y2: object.y2 === undefined ? undefined : this._snapValue(object.y2 + 10),
      };
      if (copy.variable && copy.variableName) {
        copy.variableName = this._uniqueVariableName(copy.variableName, copy.id);
        this._variables[copy.variableName] = copy.type === "chart" ? (copy.data || "") : (copy.text || "");
      }
      return copy;
    });
    this._objects.push(...copies);
    this._selectedIds = copies.map((object) => object.id);
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _newProject() {
    this._fileMenuOpen = false;
    this._newProjectDialogOpen = true;
    this._render();
    this._paint();
  }

  _createBlankProject() {
    if (this._objects.length && !confirm("Nahradit aktualni navrh prazdnym projektem?")) return;
    this._pushHistory();
    this._objects = [];
    this._selectedIds = [];
    this._variables = {};
    this._invertColors = false;
    this._backgroundColor = "white";
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._nextId = 1;
    this._newProjectDialogOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _clearDesign() {
    if (!this._objects.length || !confirm("Smazat vsechny objekty?")) return;
    this._pushHistory();
    this._objects = [];
    this._selectedIds = [];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _moveLayer(direction) {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const selected = new Set(this._selectedIds);
    const moving = this._objects.filter((object) => selected.has(object.id));
    const rest = this._objects.filter((object) => !selected.has(object.id));
    this._objects = direction === "front" ? [...rest, ...moving] : [...moving, ...rest];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _rotateSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.rotation = (Number(object.rotation || 0) + 90) % 360;
    }
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _mirrorSelected() {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.flipH = !object.flipH;
    }
    this._paint();
    this._scheduleDraftSave();
  }

  _toggleInvertColors() {
    this._pushHistory();
    this._invertColors = !this._invertColors;
    this._toolsMenuOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _setBackgroundColor(color) {
    if (!["white", "black", "red"].includes(color) || color === this._backgroundColor) return;
    this._pushHistory();
    this._backgroundColor = color;
    this._toolsMenuOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _moveLayerStep(id, direction) {
    const index = this._objects.findIndex((object) => object.id === id);
    const target = direction === "front" ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= this._objects.length) return;
    this._pushHistory();
    [this._objects[index], this._objects[target]] = [this._objects[target], this._objects[index]];
    this._selectedIds = [id];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _alignSelected(mode) {
    if (!this._selectedIds.length) return;
    this._pushHistory();
    const size = this._displaySize();
    const selected = this._objects.filter((item) => this._selectedIds.includes(item.id));

    if (mode === "distributeH" || mode === "distributeV") {
      if (selected.length < 3) return;
      if (mode === "distributeH") {
        selected.sort((a, b) => a.x - b.x);
        const minX = selected[0].x;
        const maxX = selected[selected.length - 1].x;
        const totalW = selected.slice(0, -1).reduce((sum, obj) => sum + (obj.w || 10), 0);
        const gap = (maxX - minX - totalW + (selected[selected.length - 1].w || 10)) / (selected.length - 1);
        let currX = minX;
        for (let i = 0; i < selected.length; i++) {
          selected[i].x = Math.round(currX);
          currX += (selected[i].w || 10) + gap;
        }
      } else {
        selected.sort((a, b) => a.y - b.y);
        const minY = selected[0].y;
        const maxY = selected[selected.length - 1].y;
        const totalH = selected.slice(0, -1).reduce((sum, obj) => sum + (obj.h || 10), 0);
        const gap = (maxY - minY - totalH + (selected[selected.length - 1].h || 10)) / (selected.length - 1);
        let currY = minY;
        for (let i = 0; i < selected.length; i++) {
          selected[i].y = Math.round(currY);
          currY += (selected[i].h || 10) + gap;
        }
      }
    } else {
      for (const object of selected) {
        const box = this._box(object);
        const oldX = box.x;
        const oldY = box.y;
        if (mode === "left") object.x = 0;
        if (mode === "center") object.x = Math.round((size.width - box.w) / 2);
        if (mode === "right") object.x = Math.round(size.width - box.w);
        if (mode === "top") object.y = 0;
        if (mode === "middle") object.y = Math.round((size.height - box.h) / 2);
        if (mode === "bottom") object.y = Math.round(size.height - box.h);
        if (object.type === "line") {
          const dx = object.x - oldX;
          const dy = object.y - oldY;
          object.x2 += dx;
          object.y2 += dy;
        }
      }
    }
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _snapValue(value) {
    const step = Number(this._snapStep || 5);
    return this._snap ? Math.round(value / step) * step : Math.round(value);
  }

  _normalizeVariableName(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^([0-9])/, "_$1")
      .replace(/_+/g, "_");
    return cleaned || "variable";
  }

  _uniqueVariableName(value, objectId) {
    const base = this._normalizeVariableName(value);
    const used = new Set(
      this._objects
        .filter((object) => object.id !== objectId && ["text", "chart"].includes(object.type) && object.variable && object.variableName)
        .map((object) => object.variableName)
    );
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base}_${index}`)) index++;
    return `${base}_${index}`;
  }

  _entityRawValue(object) {
    const entityId = object?.entityId || object?.entity_id || this._customElementForm?.entity_id;
    if (!entityId) return undefined;
    const state = this._hass?.states?.[entityId];
    if (!state) return undefined;
    const attrKey = object?.entityAttribute || object?.entity_attribute || object?.target_attribute || object?.value_field || object?.target_value || this._customElementForm?.entity_attribute;
    return attrKey ? state.attributes?.[attrKey] : state.state;
  }

  _entityValue(object) {
    const value = this._entityRawValue(object);
    if (value === undefined || value === null) return "";
    if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
    const unit = object.type === "text" && !object.entityAttribute
      ? this._hass?.states?.[object.entityId]?.attributes?.unit_of_measurement
      : "";
    return `${value}${unit ? ` ${unit}` : ""}`;
  }

  _entityStateLabel(object) {
    if (!object?.entityId) return "Ruční hodnota";
    const state = this._hass?.states?.[object.entityId];
    if (!state) return "Entita nebyla nalezena";
    const friendlyName = state.attributes?.friendly_name || object.entityId;
    const value = this._entityValue(object);
    return `${friendlyName}: ${value || "-"}`;
  }

  _variableDefs() {
    for (const object of this._objects.filter((item) => item.type === "chart")) {
      object.variable = true;
      object.variableName = this._uniqueVariableName(object.variableName || "data_grafu", object.id);
      if (this._variables[object.variableName] === undefined) this._variables[object.variableName] = object.data || "";
      if (!object.barColor) object.barColor = "red";
      if (!Number(object.legendFontSize)) object.legendFontSize = 8;
    }
    return this._objects
      .filter((object) => ["text", "chart"].includes(object.type) && object.variable && object.variableName)
      .map((object) => ({
        id: object.id,
        name: object.variableName,
        type: object.type,
        entityId: object.entityId || "",
        entityAttribute: object.entityAttribute || "",
        entityLabel: this._entityStateLabel(object),
        defaultValue: object.type === "chart" ? (object.data || "") : (object.text || ""),
        value: this._variables[object.variableName] ?? (object.type === "chart" ? object.data : object.text) ?? "",
      }));
  }

  _canvasPoint(event) {
    const canvas = this.shadowRoot.querySelector("#editor");
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
    };
  }

  _hitTest(point) {
    for (let i = this._objects.length - 1; i >= 0; i--) {
      const object = this._objects[i];
      const box = this._box(object);
      if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) return object;
    }
    return null;
  }

  _handleAt(point, object) {
    const box = this._box(object);
    const radius = Math.max(8, 16 / this._zoom);
    return this._handles(box).find((handle) => Math.abs(point.x - handle.x) <= radius && Math.abs(point.y - handle.y) <= radius);
  }

  _handleHitTest(point) {
    const selected = this._objects.filter((object) => this._selectedIds.includes(object.id)).reverse();
    const others = [...this._objects].reverse().filter((object) => !this._selectedIds.includes(object.id));
    for (const object of [...selected, ...others]) {
      const handle = this._handleAt(point, object);
      if (handle) return { object, handle };
    }
    return null;
  }

  _onPointerDown(event) {
    const point = this._canvasPoint(event);
    const handleHit = this._handleHitTest(point);
    const object = handleHit ? handleHit.object : this._hitTest(point);
    if (!object) {
      const baseIds = event.shiftKey ? [...this._selectedIds] : [];
      this._selectedIds = baseIds;
      this._drag = { mode: "marquee", start: point, current: point, baseIds };
      event.preventDefault();
      this._paint();
      return;
    }
    if (event.shiftKey) {
      this._selectedIds = this._selectedIds.includes(object.id)
        ? this._selectedIds.filter((id) => id !== object.id)
        : [...this._selectedIds, object.id];
    } else if (!this._selectedIds.includes(object.id)) {
      this._selectedIds = [object.id];
    }
    const handle = handleHit && handleHit.object.id === object.id ? handleHit.handle : this._handleAt(point, object);
    this._drag = {
      mode: handle ? "resize" : "move",
      handle: handle ? handle.name : "",
      start: point,
      historyPushed: false,
      snapshots: this._objects.filter((item) => this._selectedIds.includes(item.id)).map((item) => ({ ...item })),
    };
    event.preventDefault();
    this._render();
    this._paint();
  }

  _onPointerMove(event) {
    if (!this._drag) {
      this._updateCursor(event);
      return;
    }
    const point = this._canvasPoint(event);
    if (this._drag.mode === "marquee") {
      this._drag.current = point;
      const left = Math.min(this._drag.start.x, point.x);
      const top = Math.min(this._drag.start.y, point.y);
      const right = Math.max(this._drag.start.x, point.x);
      const bottom = Math.max(this._drag.start.y, point.y);
      const hits = this._objects.filter((object) => {
        const box = this._box(object);
        return box.x <= right && box.x + box.w >= left && box.y <= bottom && box.y + box.h >= top;
      }).map((object) => object.id);
      this._selectedIds = [...new Set([...this._drag.baseIds, ...hits])];
      this._paint();
      return;
    }
    const dx = point.x - this._drag.start.x;
    const dy = point.y - this._drag.start.y;
    if (!this._drag.historyPushed && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
      this._pushHistory();
      this._drag.historyPushed = true;
    }
    for (const snapshot of this._drag.snapshots) {
      const object = this._objects.find((item) => item.id === snapshot.id);
      if (!object) continue;
      if (this._drag.mode === "move") {
        object.x = this._snapValue(snapshot.x + dx);
        object.y = this._snapValue(snapshot.y + dy);
        if (object.type === "line") {
          object.x2 = this._snapValue(snapshot.x2 + dx);
          object.y2 = this._snapValue(snapshot.y2 + dy);
        }
      } else {
        this._resizeObject(object, snapshot, dx, dy, this._drag.handle);
      }
    }
    this._paint();
    this._syncProperties();
  }

  _onPointerUp() {
    const marquee = this._drag?.mode === "marquee";
    if (this._drag && !marquee) this._scheduleDraftSave();
    this._drag = null;
    if (marquee) {
      this._render();
      this._paint();
    }
  }

  _updateCursor(event) {
    const canvas = this.shadowRoot.querySelector("#editor");
    if (!canvas) return;
    const hit = this._handleHitTest(this._canvasPoint(event));
    if (!hit) {
      canvas.style.cursor = this._hitTest(this._canvasPoint(event)) ? "move" : "default";
      return;
    }
    canvas.style.cursor = hit.handle.name === "top-left" || hit.handle.name === "bottom-right" ? "nwse-resize" : "nesw-resize";
  }

  _resizeObject(object, snapshot, dx, dy, handle) {
    if (object.locked) return;
    if (handle === "rotate") {
      const cx = snapshot.x + snapshot.w / 2;
      const cy = snapshot.y + snapshot.h / 2;
      const startAngle = Math.atan2(this._drag.start.y - cy, this._drag.start.x - cx);
      const currentPoint = { x: this._drag.start.x + dx, y: this._drag.start.y + dy };
      const currentAngle = Math.atan2(currentPoint.y - cy, currentPoint.x - cx);
      let deg = Math.round(((currentAngle - startAngle) * 180 / Math.PI) / 15) * 15;
      object.rotation = (((snapshot.rotation || 0) + deg) % 360 + 360) % 360;
      return;
    }
    if (object.type === "line") {
      if (handle.includes("left")) {
        object.x = this._snapValue(snapshot.x + dx);
        object.y = this._snapValue(snapshot.y + dy);
      } else {
        object.x2 = this._snapValue(snapshot.x2 + dx);
        object.y2 = this._snapValue(snapshot.y2 + dy);
      }
      return;
    }
    let x = snapshot.x;
    let y = snapshot.y;
    let w = snapshot.w;
    let h = snapshot.h;
    if (handle.includes("right")) w = Math.max(8, snapshot.w + dx);
    if (handle.includes("bottom")) h = Math.max(8, snapshot.h + dy);
    if (handle.includes("left")) {
      x = snapshot.x + dx;
      w = Math.max(8, snapshot.w - dx);
    }
    if (handle.includes("top")) {
      y = snapshot.y + dy;
      h = Math.max(8, snapshot.h - dy);
    }
    if (object.keepRatio || object.type === "image" || object.type === "qr") {
      const ratio = snapshot.w / Math.max(1, snapshot.h);
      const anchorX = handle.includes("left") ? snapshot.x + snapshot.w : snapshot.x;
      const anchorY = handle.includes("top") ? snapshot.y + snapshot.h : snapshot.y;
      const rawMovingX = handle.includes("left") ? snapshot.x + dx : snapshot.x + snapshot.w + dx;
      const rawMovingY = handle.includes("top") ? snapshot.y + dy : snapshot.y + snapshot.h + dy;
      w = Math.max(8, Math.abs(rawMovingX - anchorX));
      h = Math.max(8, Math.abs(rawMovingY - anchorY));
      if (Math.abs(dx / Math.max(1, snapshot.w)) > Math.abs(dy / Math.max(1, snapshot.h))) h = w / ratio;
      else w = h * ratio;
      x = handle.includes("left") ? anchorX - w : anchorX;
      y = handle.includes("top") ? anchorY - h : anchorY;
    }
    object.x = this._snapValue(x);
    object.y = this._snapValue(y);
    object.w = this._snapValue(w);
    object.h = this._snapValue(h);
  }

  _projectPayload(device = this._device()) {
    const size = this._displaySize(device);
    return {
      id: this._selectedProjectId || undefined,
      version: 1,
      name: this._projectName || "DRATEK eInk projekt",
      device_address: device ? device.address : this._selectedDeviceAddress,
      physical_code: device ? device.physical_code : "",
      sdk_type: device ? Number(device.sdk_type) : 75,
      orientation: this._orientation,
      display_transform: this._displayTransform,
      refresh_interval_seconds: this._refreshIntervalSeconds,
      invert_colors: this._invertColors,
      background_color: this._backgroundColor,
      width: size.width,
      height: size.height,
      variables: this._variables,
      rgb_led: {
        mode: this._rgbLed.mode,
        color: this._rgbLed.color,
        flash_time: this._rgbLed.flashTime,
      },
      objects: this._objects.map(({ _img, ...object }) => object),
    };
  }

  async _saveProject() {
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/save", project: this._projectPayload() });
      this._selectedProjectId = result.project.id;
      this._projectName = result.project.name;
      await this._loadProjects();
    } catch (err) {
      alert(`Projekt se nepodarilo ulozit: ${this._message(err)}`);
    }
  }

  _downloadProjectFile() {
    const project = this._projectPayload();
    delete project.id;
    project.format = "dratek-eink-project";
    project.exported_at = new Date().toISOString();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = String(project.name || "dratek-eink-projekt").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "dratek-eink-projekt";
    link.href = url;
    link.download = `${safeName}.dratek-eink.json`;
    link.click();
    URL.revokeObjectURL(url);
    this._fileMenuOpen = false;
    this._render();
    this._paint();
  }

  async _importProjectFile(file) {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      if (!project || !Array.isArray(project.objects) || !Number(project.width) || !Number(project.height)) {
        throw new Error("Soubor neobsahuje platny editovatelny projekt DRATEK eInk.");
      }
      const orientation = project.orientation === "portrait" ? "portrait" : "landscape";
      const previousOrientation = this._orientation;
      this._orientation = orientation;
      const size = this._displaySize();
      if (Number(project.width) !== size.width || Number(project.height) !== size.height) {
        this._orientation = previousOrientation;
        throw new Error(`Projekt je pro rozliseni ${project.width}x${project.height}, aktualni displej ma ${size.width}x${size.height}.`);
      }
      this._orientation = previousOrientation;
      if (this._objects.length && !confirm("Nahradit aktualni navrh projektem ze souboru?")) {
        return;
      }
      this._pushHistory();
      this._orientation = orientation;
      this._objects = structuredClone(project.objects);
      this._variables = structuredClone(project.variables || {});
      this._displayTransform = project.display_transform || "rotate_cw";
      this._invertColors = false;
      this._backgroundColor = ["white", "black", "red"].includes(project.background_color) ? project.background_color : "white";
      this._projectName = project.name || "Importovany navrh";
      this._selectedProjectId = "";
      this._selectedIds = [];
      this._nextId = this._nextObjectId();
      this._fileMenuOpen = false;
      this._fitZoom();
      this._render();
      this._paint();
      this._scheduleDraftSave();
    } catch (err) {
      alert(`Projekt se nepodarilo otevrit: ${this._message(err)}`);
    }
  }

  async _loadSelectedProject() {
    if (!this._selectedProjectId) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/load", project_id: this._selectedProjectId });
      const project = result.project;
      const previousOrientation = this._orientation;
      const previousTransform = this._displayTransform;
      this._orientation = project.orientation === "portrait" ? "portrait" : "landscape";
      this._displayTransform = project.display_transform || "rotate_cw";
      this._invertColors = false;
      this._backgroundColor = ["white", "black", "red"].includes(project.background_color) ? project.background_color : "white";
      const size = this._displaySize();
      if (project.width !== size.width || project.height !== size.height) {
        this._orientation = previousOrientation;
        this._displayTransform = previousTransform;
        alert(`Projekt je pro rozliseni ${project.width}x${project.height}, aktualni displej ma ${size.width}x${size.height}.`);
        return;
      }
      this._objects = Array.isArray(project.objects) ? project.objects : [];
      this._variables = project.variables || {};
      this._projectName = project.name || "DRATEK eInk projekt";
      this._selectedIds = [];
      this._nextId = this._nextObjectId();
      this._render();
      this._paint();
      this._scheduleDraftSave();
    } catch (err) {
      alert(`Projekt se nepodarilo nacist: ${this._message(err)}`);
    }
  }

  async _deleteProject() {
    if (!this._selectedProjectId || !confirm("Smazat ulozeny projekt z Home Assistantu?")) return;
    await this._hass.callWS({ type: "dratek_eink/projects/delete", project_id: this._selectedProjectId });
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    await this._loadProjects();
  }

  async _sendDesign() {
    const device = this._device();
    if (!device || this._sending) return;
    if (device.preferred_path?.type === "gateway") {
      this._selectedGatewayId = device.preferred_path.id;
      await this._sendDesignViaGateway();
      return;
    }
    try {
      await this._refreshCustomUrlObjects();
    } catch (err) {
      this._sendResult = { ok: false, error: `Načtení dat vlastního prvku selhalo: ${this._message(err)}`, log: [] };
      this._render();
      this._paint();
      return;
    }
    const canvas = this._renderExportCanvas();
    const automation = this._entityAutomationPayload();
    const size = this._displaySize(device);
    if (canvas.width !== size.width || canvas.height !== size.height) {
      this._sendResult = {
        ok: false,
        error: `Rozmer navrhu ${canvas.width}x${canvas.height} nesedi s vybranym displejem ${size.width}x${size.height}. Prepnul jsem pracovni plochu, zkuste odeslat znovu.`,
        log: [],
      };
      await this._selectDevice(device.address, { forceLoad: true });
      return;
    }
    this._sending = true;
    this._sendResult = null;
    this._render();
    try {
      const image = automation.enabled
        ? await this._renderCanonicalPreview(automation, device.address)
        : canvas.toDataURL("image/png");
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/send_design",
        address: device.address,
        sdk_type: Number(device.sdk_type),
        orientation: this._orientation,
        transform: this._displayTransform,
        image,
        automation,
      });
      if (this._sendResult && this._sendResult.ok) await this._saveCurrentDeviceDraft();
    } catch (err) {
      this._sendResult = { ok: false, address: device.address, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  }

  async _sendDesignViaGateway() {
    const device = this._device();
    if (!device || this._sending || !this._selectedGatewayId) return;
    this._sending = true;
    this._sendResult = null;
    this._render();
    try {
      await this._refreshCustomUrlObjects();
      const canvas = document.createElement("canvas");
      const size = this._displaySize(device);
      canvas.width = size.width;
      canvas.height = size.height;
      this._drawScene(canvas.getContext("2d"), canvas.width, canvas.height, false);
      const automation = this._entityAutomationPayload();
      const image = automation.enabled
        ? await this._renderCanonicalPreview(automation, device.address)
        : canvas.toDataURL("image/png");
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/gateways/send_design",
        gateway_id: this._selectedGatewayId,
        address: device.address,
        sdk_type: Number(device.sdk_type),
        orientation: this._orientation,
        transform: this._displayTransform,
        image,
        automation,
      });
      if (this._sendResult && this._sendResult.ok) await this._saveCurrentDeviceDraft();
    } catch (err) {
      this._sendResult = { ok: false, address: device.address, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  }

  async _renderCanonicalPreview(automation, address = this._device()?.address) {
    if (!automation?.enabled || !address || !this._hass) return "";
    const result = await this._hass.callWS({
      type: "dratek_eink/render_preview",
      address,
      automation,
    });
    if (!result?.ok || !result.image) throw new Error("Backend nevytvořil náhled displeje.");
    return result.image;
  }

  _scheduleCanonicalDesignerPreview() {
    window.clearTimeout(this._backendPreviewTimer);
    const requestId = ++this._backendPreviewRequestId;
    if (this._activeTab !== "designer" || !this._device() || !this._hass) return;
    this._backendPreviewTimer = window.setTimeout(async () => {
      this._backendPreviewTimer = null;
      const device = this._device();
      const canvas = this.shadowRoot.querySelector("#editor");
      if (!device || !canvas || requestId !== this._backendPreviewRequestId) return;
      const automation = this._entityAutomationPayload();
      if (!automation.enabled) return;
      try {
        const source = await this._renderCanonicalPreview(automation, device.address);
        if (
          requestId !== this._backendPreviewRequestId
          || this._activeTab !== "designer"
          || this._device()?.address !== device.address
        ) return;
        const image = new Image();
        image.src = source;
        await image.decode();
        if (requestId !== this._backendPreviewRequestId) return;
        this._backendPreviewImage = image;
        this._backendPreviewAddress = device.address;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        if (requestId === this._backendPreviewRequestId) {
          console.warn("DRATEK eInk canonical preview failed:", err);
        }
      }
    }, 120);
  }

  async _sendTestText() {
    const device = this._device();
    if (!device || this._sending) return;
    this._sending = true;
    this._sendResult = null;
    this._render();
    try {
      this._sendResult = await this._hass.callWS({ type: "dratek_eink/send_text", address: device.address, sdk_type: Number(device.sdk_type), text: "dratek.cz" });
    } catch (err) {
      this._sendResult = { ok: false, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  }

  async _applyRgbLed() {
    const device = this._device();
    if (!device || this._ledSending) return;
    const color = /^#[0-9a-f]{6}$/i.test(this._rgbLed.color) ? this._rgbLed.color : "#00a2a5";
    const mode = { off: 0, on: 1, flash: 2 }[this._rgbLed.mode] ?? 0;
    this._ledSending = true;
    this._ledResult = null;
    this._scheduleDraftSave();
    this._render();
    this._paint();
    try {
      this._ledResult = await this._hass.callWS({
        type: "dratek_eink/set_rgb_led",
        address: device.address,
        mode,
        flash_time: mode === 2 ? Math.max(1, Math.min(255, Number(this._rgbLed.flashTime) || 10)) : 0,
        red: parseInt(color.slice(1, 3), 16),
        green: parseInt(color.slice(3, 5), 16),
        blue: parseInt(color.slice(5, 7), 16),
      });
    } catch (err) {
      this._ledResult = { ok: false, error: this._message(err) };
    } finally {
      this._ledSending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  }

  _renderRgbLedControl(device, compact = false) {
    const colors = [
      ["#ff2d2d", "Červená"], ["#ff7a00", "Oranžová"], ["#ffd400", "Žlutá"],
      ["#20b15a", "Zelená"], ["#00a2a5", "Tyrkysová"], ["#2474ff", "Modrá"],
      ["#b53cff", "Fialová"], ["#ffffff", "Bílá"],
    ];
    const result = this._ledResult
      ? `<span class="led-result ${this._ledResult.ok ? "good" : "bad"}"><ha-icon icon="${this._ledResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._ledResult.ok ? "Nastavení diody bylo odesláno." : this._escape(this._ledResult.error || "Ovládání diody selhalo.")}</span>`
      : "";
    return `<div class="${compact ? "rgb-led-compact" : "card"} rgb-led-card">
      <div class="rgb-led-heading"><div class="rgb-led-title"><span class="rgb-led-icon" style="--led-color:${this._escape(this._rgbLed.color)}"><ha-icon icon="mdi:led-on"></ha-icon></span><div><h2>RGB dioda displeje</h2><small>Samostatné hardwarové ovládání; dioda není součástí grafického náhledu.</small></div></div>${result}</div>
      <div class="rgb-led-controls">
        <div class="field"><label>Režim</label><div class="segment-control led-mode-control">
          <button class="segment-button ${this._rgbLed.mode === "off" ? "selected" : ""}" data-led-mode="off"><ha-icon icon="mdi:led-off"></ha-icon><span>Vypnuto</span></button>
          <button class="segment-button ${this._rgbLed.mode === "on" ? "selected" : ""}" data-led-mode="on"><ha-icon icon="mdi:led-on"></ha-icon><span>Svítí</span></button>
          <button class="segment-button ${this._rgbLed.mode === "flash" ? "selected" : ""}" data-led-mode="flash"><ha-icon icon="mdi:alarm-light-outline"></ha-icon><span>Bliká</span></button>
        </div></div>
        <div class="field led-color-field"><label>Barva</label><div class="led-color-row"><input id="rgbLedColor" type="color" value="${this._escape(this._rgbLed.color)}" ${this._rgbLed.mode === "off" ? "disabled" : ""}><div class="led-presets">${colors.map(([color, label]) => `<button type="button" data-led-color="${color}" class="led-preset ${this._rgbLed.color === color ? "selected" : ""}" style="--preset:${color}" title="${label}" ${this._rgbLed.mode === "off" ? "disabled" : ""}></button>`).join("")}</div></div></div>
        ${this._rgbLed.mode === "flash" ? `<div class="field led-flash-field"><label for="rgbLedFlashTime">Tempo blikání <strong>${this._rgbLed.flashTime}</strong></label><input id="rgbLedFlashTime" type="range" min="1" max="255" value="${this._rgbLed.flashTime}"><small>Hodnota 1–255 podle časování firmware displeje.</small></div>` : ""}
        <button id="applyRgbLed" class="rgb-led-apply" ${!device || this._ledSending ? "disabled" : ""}><ha-icon icon="mdi:bluetooth-connect"></ha-icon>${this._ledSending ? "Odesílám..." : "Použít na displeji"}</button>
      </div>
    </div>`;
  }

  _stableCustomRender() {
    const positions = [];
    let node = this;
    const visited = new Set();
    while (node && !visited.has(node)) {
      visited.add(node);
      if (typeof node.scrollTop === "number" && node.scrollHeight > node.clientHeight) {
        positions.push([node, node.scrollTop, node.scrollLeft]);
      }
      const root = node.getRootNode?.();
      node = node.parentElement || (root && root.host !== node ? root.host : null);
    }
    const windowX = window.scrollX;
    const windowY = window.scrollY;
    const libraryScroll = this.shadowRoot.querySelector(".custom-library-list")?.scrollTop || 0;
    const openDetails = [...this.shadowRoot.querySelectorAll(".ha-elements-page details")]
      .map((detail, index) => detail.open ? index : -1)
      .filter((index) => index >= 0);
    this._render();
    this._paint();
    requestAnimationFrame(() => {
      this._paintCustomLayerCanvases();
      positions.forEach(([target, top, left]) => {
        target.scrollTop = top;
        target.scrollLeft = left;
      });
      window.scrollTo(windowX, windowY);
      const library = this.shadowRoot.querySelector(".custom-library-list");
      if (library) library.scrollTop = libraryScroll;
      const details = [...this.shadowRoot.querySelectorAll(".ha-elements-page details")];
      openDetails.forEach((index) => {
        if (details[index]) details[index].open = true;
      });
    });
  }

  _render() {
    const result = this._result || { scanner_count: 0, ble_count: 0, devices: [], ble_devices: [], debug: [] };
    const topologyGroups = this._topologyGroups(result.devices);
    const topologyGatewayCount = topologyGroups.filter((group) => group.path?.type === "gateway").length;
    const status = this._status();
    const device = this._device();
    const size = this._displaySize(device);
    const object = this._selectedObject();
    const designerScreenWidth = Math.max(1, Math.round(size.width * this._zoom));
    const designerScreenHeight = Math.max(1, Math.round(size.height * this._zoom));
    const designerFrameRatio = Math.max(0.48, Math.min(3.7, (size.width / size.height) * (this._orientation === "portrait" ? 0.95 : 1 / 0.95)));
    const designerFrameWidth = Math.max(150, Math.round(designerScreenWidth / (this._orientation === "portrait" ? 0.8 : 0.76)));
    const designerBattery = this._batteryInfo(device || {});
    const designerRssi = Number(device?.rssi);
    const designerPath = device?.paths?.[0];
    this.shadowRoot.innerHTML = `
      <style>
        .device-card-details{display:grid;gap:13px}
        @font-face{font-family:"DRATEK eInk Sans";src:url("/dratek_eink_panel/fonts/Arimo-wght.ttf?v=${DRATEK_EINK_VERSION}") format("truetype");font-style:normal;font-weight:400 700;font-display:block}
        :host{display:block;min-height:100%;color:var(--primary-text-color);background:linear-gradient(180deg,var(--primary-background-color),var(--secondary-background-color));font-family:Roboto,Arial,sans-serif}
        *{box-sizing:border-box} .page{max-width:1680px;margin:0 auto;padding:18px;display:grid;gap:14px}
        h1{margin:0;font-size:24px;font-weight:850;letter-spacing:0}h2{margin:0;font-size:13px;text-transform:uppercase;color:var(--secondary-text-color);letter-spacing:.08em}.subtitle{color:var(--secondary-text-color);font-size:13px;margin-top:3px}
        button,select,input{font:inherit}button{border:0;border-radius:8px;background:var(--primary-color);color:var(--text-primary-color,#fff);padding:9px 12px;font-weight:760;cursor:pointer;box-shadow:0 1px 0 rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px}button:hover:not(:disabled){filter:brightness(1.03);transform:translateY(-1px)}button:disabled{opacity:.45;cursor:not-allowed;transform:none}
        ha-icon{--mdc-icon-size:18px}.primary-action{background:#0f766e}.secondary{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.danger{background:#b3261e;color:#fff}.ghost{background:transparent;color:var(--primary-text-color);border:1px solid transparent;box-shadow:none}
        .topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px 16px;box-shadow:0 10px 30px rgba(0,0,0,.07)}.brand{display:flex;align-items:center;gap:13px}.extension-logo{display:block;width:78px;height:68px;flex:0 0 auto;object-fit:contain;filter:drop-shadow(0 3px 7px rgba(0,0,0,.12))}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.version-badge{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 8px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color);border:1px solid var(--divider-color);font-size:11px;font-weight:850}
        .card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px;box-shadow:0 10px 28px rgba(0,0,0,.06)}.metric{color:var(--secondary-text-color);font-size:12px;margin-bottom:5px}.value{font-size:25px;font-weight:850}.pill{display:inline-flex;min-height:26px;align-items:center;border-radius:999px;padding:0 10px;font-size:12px;font-weight:800}.good{background:#d7f5df;color:#0b6b2a}.warn{background:#fff2c7;color:#775500}.bad{background:#ffd9d4;color:#9d1c0f}.muted{background:var(--secondary-background-color);color:var(--secondary-text-color)}
        .tabbar{display:flex;gap:6px;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:5px;width:max-content;max-width:100%;box-shadow:0 8px 24px rgba(0,0,0,.05)}.tab{background:transparent;color:var(--secondary-text-color);box-shadow:none;border:0;border-radius:7px;padding:10px 14px}.tab.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}
        .status-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}.status-tile{display:flex;align-items:center;justify-content:space-between;gap:12px}.status-icon{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-color)}
        .designer-context{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 14px}.display-identity{display:flex;align-items:center;gap:11px;min-width:0}.display-identity .status-icon{flex:0 0 auto}.display-identity strong{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.display-identity span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}.resolution-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--divider-color);border-radius:6px;color:var(--secondary-text-color);font-size:11px;font-weight:800;white-space:nowrap}
        .ribbon{position:relative;display:flex;align-items:center;gap:6px;min-height:48px;padding:5px 8px}.ribbon-tab{background:transparent;color:var(--primary-text-color);box-shadow:none;border-radius:6px}.ribbon-tab.active{background:#0f766e;color:#fff}.ribbon-project{margin-left:auto;min-width:0;color:var(--secondary-text-color);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-menu{position:absolute;z-index:12;left:8px;top:50px;width:min(620px,calc(100vw - 52px));padding:14px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);box-shadow:0 20px 55px rgba(0,0,0,.24)}.file-menu-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.file-menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.file-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.file-action{min-height:72px;display:grid;grid-template-rows:26px auto;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none}.file-action ha-icon{--mdc-icon-size:24px;color:var(--primary-color)}.device-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.device-name-edit{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px}.device-name-edit input{min-width:0;border:1px solid var(--primary-color);border-radius:7px;padding:8px;background:var(--card-background-color);color:var(--primary-text-color)}
        .device-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}.device-card{position:relative;display:grid;gap:13px;text-align:left;background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:15px;box-shadow:0 12px 32px rgba(0,0,0,.08);overflow:hidden}.device-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:#9ca3af}.device-card.selected{border-color:var(--primary-color);box-shadow:0 0 0 2px rgba(37,99,235,.18),0 16px 38px rgba(0,0,0,.11)}.device-card.selected:before{background:var(--primary-color)}.device-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.device-card-top strong{display:block;font-size:20px;letter-spacing:.01em}.device-card-top span:not(.pill){display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.device-model{font-size:13px;line-height:1.45;color:var(--primary-text-color)}.device-model span,.device-meta{color:var(--secondary-text-color);font-size:12px}.device-meters{display:grid;grid-template-columns:1fr 1fr;gap:12px}.meter-block{display:grid;gap:6px}.meter-block label{font-size:11px;text-transform:uppercase;color:var(--secondary-text-color);font-weight:800;letter-spacing:.08em}.battery{height:10px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden;border:1px solid var(--divider-color)}.battery span{display:block;height:100%;background:#9ca3af}.battery.high span{background:#16a34a}.battery.medium span{background:#d97706}.battery.low span{background:#dc2626}.signal-bars{height:20px;display:flex;align-items:end;gap:3px}.signal-bars span{display:block;width:8px;border-radius:2px;background:var(--divider-color)}.signal-bars span:nth-child(1){height:7px}.signal-bars span:nth-child(2){height:11px}.signal-bars span:nth-child(3){height:15px}.signal-bars span:nth-child(4){height:19px}.signal-bars.level-1 .on{background:#dc2626}.signal-bars.level-2 .on{background:#d97706}.signal-bars.level-3 .on,.signal-bars.level-4 .on{background:#16a34a}.device-meta{display:flex;gap:8px;flex-wrap:wrap}.device-meta span{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:999px;padding:4px 8px}
        .device-preview-wrap{display:grid;place-items:center;min-height:118px;padding:6px;border-radius:9px;background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.9),rgba(127,127,127,.08))}.device-preview-bezel{position:relative;display:grid;grid-template-columns:minmax(24px,11%) minmax(0,1fr);align-items:center;width:min(100%,var(--preview-width,460px));aspect-ratio:var(--frame-ratio,2.15);padding:4.5%;border:clamp(5px,1.2vw,9px) solid #eee7e7;border-radius:clamp(10px,2vw,18px);background:#fff;box-shadow:0 7px 18px rgba(0,0,0,.16),inset 0 0 0 1px rgba(0,0,0,.04)}.device-preview-code{justify-self:center;color:#111;font:700 clamp(8px,1.55vw,13px)/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em;writing-mode:vertical-rl;white-space:nowrap}.device-preview-screen{position:relative;width:100%;height:100%;min-width:0;overflow:hidden;border:1px solid rgba(0,0,0,.18);background:#fff;box-shadow:inset 0 0 5px rgba(0,0,0,.12)}.device-preview-screen canvas{display:block;width:100%;height:100%;background:#fff;box-shadow:none}.device-preview-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:8px;background:repeating-linear-gradient(135deg,#fff 0 9px,#faf7f7 9px 18px);color:#777;font-size:10px;font-weight:750}.device-preview-empty ha-icon{display:block;margin:auto;--mdc-icon-size:22px;color:#b3261e}.device-preview-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin-top:6px;color:var(--secondary-text-color);font-size:10px}.device-preview-caption span{display:flex;align-items:center;gap:4px}.device-preview-caption ha-icon{--mdc-icon-size:14px;color:#16803c}.compact-device-preview{grid-column:1/-1;min-height:76px;padding:3px}.compact-device-preview .device-preview-bezel{width:min(100%,300px);border-width:5px;border-radius:9px;padding:3%}.compact-device-preview .device-preview-code{font-size:7px}.compact-device-preview .device-preview-caption{display:none}.device-grid.mode-list .compact-device-preview{grid-column:1/2;grid-row:1/3;min-width:210px}.device-grid.mode-list .minimal-card{grid-template-columns:minmax(210px,.8fr) minmax(220px,1fr) minmax(390px,1.8fr) auto}.device-grid.mode-list .minimal-card .compact-identity{grid-column:2}.device-grid.mode-list .minimal-card .compact-metrics{grid-column:3}.device-grid.mode-list .minimal-card .compact-open{grid-column:4}
        .density-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.density-toolbar>span{font-size:11px;font-weight:800;color:var(--secondary-text-color);text-transform:uppercase}.density-switch{display:flex;gap:2px;padding:3px;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color)}.density-switch button{min-height:30px;padding:5px 8px;border-radius:5px;background:transparent;color:var(--secondary-text-color);box-shadow:none;font-size:11px}.density-switch button.active{background:var(--card-background-color);color:var(--primary-color);box-shadow:0 1px 4px rgba(0,0,0,.12)}.density-switch ha-icon{--mdc-icon-size:17px}.density-note{font-size:11px;color:var(--secondary-text-color)}.device-grid.mode-large{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.device-grid.mode-compact{grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:8px}.device-grid.mode-list{grid-template-columns:1fr;gap:7px}.device-grid.mode-compact .device-card,.device-grid.mode-list .device-card{gap:8px;padding:11px}.device-grid.mode-compact .device-card-top strong{font-size:15px}.device-grid.mode-list .device-card{grid-template-columns:minmax(220px,1.3fr) minmax(220px,1fr) auto;align-items:center}.device-grid.mode-list .device-card-top{min-width:0}.device-grid.mode-list .device-card-details{display:grid;grid-template-columns:minmax(170px,1fr) minmax(220px,1.4fr);gap:8px;align-items:center}.device-card.collapsed .device-card-details{display:none}.device-expand{background:transparent;color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none;min-width:36px;padding:7px}.device-card-expand-row{display:flex;justify-content:flex-end}.device-grid.mode-full .device-expand,.device-grid.mode-large .device-expand{display:none}.device-grid.mode-full .device-card-expand-row,.device-grid.mode-large .device-card-expand-row{display:none}
        .route-list{display:grid;gap:7px}.route{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:7px 9px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);font-size:12px}.route.preferred{border-color:#0f766e;background:rgba(15,118,110,.08)}.route ha-icon{color:#0f766e}.route-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:780}.route-rssi{color:var(--secondary-text-color)}.topology{display:grid;gap:8px}.topology-row{display:grid;grid-template-columns:minmax(170px,1fr) minmax(80px,2fr) minmax(190px,1.2fr);align-items:center;gap:10px}.topology-node{display:flex;align-items:center;gap:9px;border:1px solid var(--divider-color);border-radius:8px;padding:10px;background:var(--card-background-color);min-width:0}.topology-node strong,.topology-node small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.topology-node small{color:var(--secondary-text-color);margin-top:2px}.topology-link{height:2px;background:var(--divider-color);position:relative}.topology-link:after{content:"";position:absolute;right:0;top:-4px;border-left:7px solid #0f766e;border-top:5px solid transparent;border-bottom:5px solid transparent}.topology-link span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--card-background-color);padding:2px 8px;color:var(--secondary-text-color);font-size:11px;white-space:nowrap}.topology.mode-large{gap:6px}.topology.mode-large .topology-node{padding:8px}.topology.mode-compact{grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:7px}.topology.mode-compact .topology-row{display:grid;grid-template-columns:1fr auto;gap:6px;border:1px solid var(--divider-color);border-radius:8px;padding:8px}.topology.mode-compact .topology-link{grid-column:1/-1;grid-row:2;height:auto;background:none}.topology.mode-compact .topology-link:after{display:none}.topology.mode-compact .topology-link span{position:static;transform:none;display:inline-flex}.topology.mode-compact .topology-node{padding:7px;border:0}.topology.mode-list .topology-row{grid-template-columns:minmax(180px,1fr) minmax(100px,.7fr) minmax(210px,1.2fr);gap:6px}.topology.mode-list .topology-node{padding:7px}.topology.mode-list .topology-node small{display:none}
        .subtabs{display:flex;gap:6px;padding:5px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);width:max-content;max-width:100%}.subtab{background:transparent;color:var(--secondary-text-color);box-shadow:none}.subtab.active{background:#0f766e;color:#fff}.gateway-name-edit{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px}.gateway-name-edit input{min-width:0;border:1px solid var(--primary-color);border-radius:7px;padding:7px;background:var(--card-background-color);color:var(--primary-text-color)}.gateway-health{display:grid;grid-template-columns:1fr 1fr;gap:10px}.health-tile{padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color)}.health-tile label{display:block;color:var(--secondary-text-color);font-size:11px;text-transform:uppercase;font-weight:800;margin-bottom:5px}
        .empty-state{min-height:280px;display:grid;place-items:center;text-align:center;gap:9px;color:var(--secondary-text-color)}.empty-state h2{color:var(--primary-text-color);font-size:18px;text-transform:none;letter-spacing:0;margin:0}.empty-icon{width:62px;height:62px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);font-weight:950;color:var(--primary-color)}.empty-logo{display:block;width:112px;height:96px;object-fit:contain;filter:drop-shadow(0 4px 9px rgba(0,0,0,.12))}
        .editor-shell{display:grid;grid-template-columns:250px minmax(0,1fr) 318px 250px;gap:12px;align-items:start}.left,.right,.layers-panel{position:sticky;top:12px}.designer-section{position:relative}.designer-section.locked> :not(.designer-lock){pointer-events:none;opacity:.28;filter:grayscale(1)}.designer-lock{position:absolute;z-index:15;left:50%;top:110px;transform:translateX(-50%);width:min(440px,calc(100% - 32px));padding:28px;text-align:center;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.24)}.designer-lock ha-icon{--mdc-icon-size:44px;color:#16803c}.designer-lock h2{font-size:20px;text-transform:none;margin:10px 0}.designer-lock p{color:var(--secondary-text-color)}.template-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:282px;overflow:auto;padding-right:2px}.template-hero .template-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));max-height:none;overflow:visible;padding-right:0}.template-card{min-height:76px;display:grid;grid-template-columns:34px 1fr;align-items:center;text-align:left;gap:9px;padding:9px;border:1px solid var(--divider-color);background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color);box-shadow:none}.template-card ha-icon{color:var(--primary-color);--mdc-icon-size:26px}.template-card strong{display:block;font-size:12px;line-height:1.2}.template-card span{display:block;font-size:10px;color:var(--secondary-text-color);font-weight:800;text-transform:uppercase;margin-top:2px}.template-card:hover:not(:disabled){border-color:var(--primary-color);background:var(--secondary-background-color)}.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.tool-icon{min-height:82px;display:grid;grid-template-rows:36px auto;place-items:center;text-align:center;padding:10px 6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none}.tool-icon .ico{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-color);font-size:18px;font-weight:900}.tool-icon .txt{font-size:11px;font-weight:850;color:var(--secondary-text-color);text-transform:uppercase}.tool-icon:hover:not(:disabled){border-color:var(--primary-color);background:var(--secondary-background-color)}
        .action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.icon-btn{min-height:42px;padding:7px;font-size:16px;display:grid;place-items:center}.wide-action{grid-column:span 4;font-size:13px}.panel-divider{height:1px;background:var(--divider-color);margin:14px 0}.layout-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.layout-btn{min-height:58px;display:grid;place-items:center;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none}.layout-btn.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.transform-box{margin-top:10px;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.transform-box small{display:block;color:var(--secondary-text-color);line-height:1.35;margin-top:6px}.properties-panel,.layers-panel{max-height:calc(100vh - 120px);overflow:auto}.layer-list{display:grid;gap:6px}.layer-row{display:grid;grid-template-columns:minmax(0,1fr) 34px 34px;gap:4px;align-items:center;padding:4px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color)}.layer-row.selected{border-color:#16803c;background:rgba(22,128,60,.1);box-shadow:inset 3px 0 0 #16803c}.layer-main{min-width:0;justify-content:flex-start;background:transparent;color:var(--primary-text-color);box-shadow:none;padding:7px}.layer-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.layer-main ha-icon{color:var(--secondary-text-color);flex:0 0 auto}.layer-step{min-height:32px;padding:5px;background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none}.layer-hint{margin:9px 0 0;color:var(--secondary-text-color);font-size:11px;line-height:1.4}.background-picker{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding-top:9px;margin-top:7px;border-top:1px solid var(--divider-color)}.background-picker button{display:grid;place-items:center;gap:4px;background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none;font-size:11px}.background-picker button.selected{outline:2px solid #16803c;outline-offset:-2px}.color-swatch{width:24px;height:20px;border:1px solid #7f7f7f;border-radius:4px}.color-swatch.white{background:#fff}.color-swatch.black{background:#000}.color-swatch.red{background:#d41414}
        .workspace-card{padding:0;overflow:hidden}.canvas-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.canvas-meta{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:12px}.workspace{min-height:590px;overflow:auto;display:grid;place-items:center;background:linear-gradient(45deg,rgba(127,127,127,.08) 25%,transparent 25%),linear-gradient(-45deg,rgba(127,127,127,.08) 25%,transparent 25%);background-size:18px 18px;border:0;padding:34px}
        canvas{background:#fff;box-shadow:0 20px 54px rgba(0,0,0,.24);touch-action:none}.field{display:grid;gap:5px;margin-bottom:10px}.field label{color:var(--secondary-text-color);font-size:12px;font-weight:760}.field small{color:var(--secondary-text-color);font-size:11px;line-height:1.35}.field input,.field select,.field textarea,.file-menu input,.file-menu select,#deviceSelect{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px;font:inherit}.field textarea{resize:vertical;min-height:62px}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.entity-source{margin-top:12px;padding:11px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.entity-source ha-entity-picker{display:block;width:100%;margin-top:5px}.entity-current{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start;margin-top:8px;padding:9px;border-radius:7px;background:var(--card-background-color);font-size:12px}.entity-current ha-icon{color:#16803c}.entity-current strong,.entity-current small{display:block;overflow-wrap:anywhere}.entity-current small{color:var(--secondary-text-color);margin-top:2px}
        table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top}th{color:var(--secondary-text-color);font-size:11px;text-transform:uppercase}pre{overflow:auto;background:#111827;color:#e5e7eb;border-radius:8px;padding:12px;font-size:12px;line-height:1.45;max-height:320px;white-space:pre-wrap}.gateway-log{max-height:260px;min-height:96px;overflow-y:auto}.send-result{margin-top:10px}.ota-progress{height:9px;background:var(--secondary-background-color);border:1px solid var(--divider-color);border-radius:999px;overflow:hidden;margin:11px 0}.ota-progress span{display:block;height:100%;background:#0f766e;transition:width .25s ease}.variable-list{display:grid;gap:12px}.variable-card{padding:13px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.variable-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.variable-card-head strong{font-size:14px}.variable-card input,.variable-card textarea{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}.variable-card textarea{resize:vertical;min-height:82px;line-height:1.45}.format-help{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;margin-top:9px;padding:10px;border:1px solid rgba(22,128,60,.3);border-radius:7px;background:rgba(22,128,60,.08);font-size:12px;line-height:1.45}.format-help ha-icon{color:#16803c}.format-help code{display:block;margin-top:4px;white-space:normal;overflow-wrap:anywhere}.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:20;display:grid;place-items:center;padding:24px}.symbol-dialog{width:min(920px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.35);padding:16px}.symbol-search{display:grid;grid-template-columns:1fr auto;gap:10px;margin:12px 0}.symbol-search input{width:100%;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:10px}.category-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.category-row button{min-height:32px;padding:6px 10px}.category-row button.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}.symbol-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}.symbol-tile{min-height:78px;display:grid;grid-template-rows:32px auto;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none}.symbol-tile strong{font-size:29px;line-height:1}.symbol-tile span{font-size:10px;color:var(--secondary-text-color);font-weight:800;text-transform:uppercase;text-align:center}
        .section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.debug-card details{margin-top:10px}.debug-card summary{cursor:pointer;color:var(--primary-color);font-weight:760}.inspector-empty{padding:18px;border:1px dashed var(--divider-color);border-radius:8px;color:var(--secondary-text-color);text-align:center;background:var(--secondary-background-color)}
        .inspector-title{position:sticky;top:-14px;z-index:3;margin:-14px -14px 12px;padding:12px 14px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.inspector-title-main{display:flex;align-items:center;gap:9px;min-width:0}.inspector-title-main small{display:block;max-width:160px;margin-top:2px;color:var(--secondary-text-color);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.inspector-object-icon{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;background:rgba(22,128,60,.1);color:#16803c}.inspector-section{margin-bottom:11px;padding:11px;border:1px solid var(--divider-color);border-radius:9px;background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color))}.inspector-section:last-child{margin-bottom:0}.inspector-section-title{display:flex;align-items:center;gap:7px;margin:0 0 10px;color:var(--primary-text-color);font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.055em}.inspector-section-title ha-icon{--mdc-icon-size:18px;color:#16803c}.inspector-section .field:last-child{margin-bottom:0}.inspector-section .field label{display:flex;align-items:center;gap:5px}.inspector-section .field label ha-icon{--mdc-icon-size:15px;color:var(--secondary-text-color)}.color-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.color-option{min-width:0;min-height:52px;display:grid;grid-template-rows:23px auto;place-items:center;gap:2px;padding:5px 3px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--secondary-text-color);box-shadow:none;font-size:10px}.color-option:hover:not(:disabled){transform:none;border-color:#16803c}.color-option.selected{border-color:#16803c;background:rgba(22,128,60,.09);color:var(--primary-text-color);box-shadow:inset 0 0 0 1px #16803c}.color-dot{position:relative;width:22px;height:22px;border:1px solid #777;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.18)}.color-dot.original{background:conic-gradient(#111 0 25%,#d41414 0 50%,#fff 0 75%,#00a2a5 0)}.color-dot.black{background:#111}.color-dot.red{background:#d41414}.color-dot.white{background:#fff}.color-dot.none{background:repeating-linear-gradient(135deg,#fff 0 5px,#ddd 5px 10px)}.color-dot.none:after{content:"";position:absolute;left:1px;right:1px;top:10px;height:2px;background:#d41414;transform:rotate(-38deg)}.segment-control{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;padding:3px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.segment-button{min-width:0;min-height:34px;padding:5px;border:0;border-radius:5px;background:transparent;color:var(--secondary-text-color);box-shadow:none}.segment-button ha-icon{--mdc-icon-size:19px}.segment-button:hover:not(:disabled){transform:none;background:var(--card-background-color)}.segment-button.selected{background:var(--card-background-color);color:#16803c;box-shadow:0 1px 4px rgba(0,0,0,.16)}.toggle-stack{display:grid;gap:6px}.toggle-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin:0;padding:8px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);font-size:12px;font-weight:700}.toggle-card>ha-icon{--mdc-icon-size:19px;color:#16803c}.toggle-card input{width:17px;height:17px;accent-color:#16803c}.inspector-help{display:flex;gap:7px;align-items:flex-start;margin:8px 0 0;color:var(--secondary-text-color);font-size:11px;line-height:1.4}.inspector-help ha-icon{--mdc-icon-size:16px;color:#16803c;flex:0 0 auto}
        .ribbon-tab.menu-tab,.ribbon-tab.menu-tab.active{background:#16803c;color:#fff;border-color:#16803c}.ribbon-tab.menu-tab:hover{background:#126c33}.ribbon-tab.menu-tab.active{background:#0d5f2a;box-shadow:inset 0 -3px 0 rgba(255,255,255,.75)}.ribbon-send{background:#1565c0;color:#fff;border-color:#1565c0;margin-left:6px;box-shadow:none}.ribbon-send:hover:not(:disabled){background:#0d4f9b}.file-menu{padding:0;overflow:hidden;width:min(760px,calc(100vw - 52px))}.file-backstage{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:390px}.file-rail{display:flex;flex-direction:column;gap:3px;padding:16px 10px;background:#16803c;color:#fff}.file-rail-title{display:flex;align-items:center;gap:10px;padding:5px 10px 18px;font-size:20px;font-weight:850}.file-rail button{justify-content:flex-start;background:transparent;color:#fff;box-shadow:none;border:0;padding:11px 12px}.file-rail button:hover{background:rgba(255,255,255,.16)}.file-content{padding:20px;min-width:0}.file-content-actions{display:flex;gap:8px;margin-top:15px}.ribbon-menu{position:absolute;z-index:12;top:50px;padding:9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);box-shadow:0 18px 46px rgba(0,0,0,.22)}.view-menu{left:205px;min-width:310px}.tools-menu{left:310px;min-width:270px}.layout-menu{left:410px;min-width:340px}.view-option{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:10px;padding:10px;border-radius:6px;font-weight:750}.view-option:hover{background:var(--secondary-background-color)}.menu-command-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--divider-color)}.menu-command-row button{display:grid;place-items:center;gap:4px;background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none}.menu-command-row span{font-size:11px}.menu-command{width:100%;display:flex;align-items:center;justify-content:flex-start;text-align:left;background:transparent;color:var(--primary-text-color);box-shadow:none}.menu-command ha-icon{color:#16803c;--mdc-icon-size:28px}.menu-command span{display:grid}.menu-command small{color:var(--secondary-text-color);font-weight:500}.menu-command.selected{background:rgba(22,128,60,.1);border-color:#16803c}.layout-menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.layout-menu-button{min-height:76px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none}.layout-menu-button.active{background:#16803c;color:#fff}.editor-dialog{width:min(760px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.35);padding:18px}.template-dialog{width:min(980px,100%)}.template-dialog .template-grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr));max-height:none;overflow:visible}.new-project-dialog{width:min(620px,100%)}.project-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.project-choice{min-height:180px;display:grid;grid-template-rows:54px auto auto;place-items:center;text-align:center;padding:20px;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none}.project-choice ha-icon{--mdc-icon-size:48px;color:#16803c}.project-choice strong{font-size:17px}.project-choice span{color:var(--secondary-text-color);font-size:12px}.project-choice:hover{border-color:#16803c;background:rgba(22,128,60,.07)}
        .queue-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.queue-stat{display:flex;align-items:center;gap:12px}.queue-stat ha-icon{--mdc-icon-size:26px;color:var(--primary-color)}.queue-stat strong{display:block;font-size:23px}.queue-stat span{color:var(--secondary-text-color);font-size:12px}.queue-list{display:grid;gap:8px}.queue-row{display:grid;grid-template-columns:auto minmax(150px,1fr) minmax(170px,1fr) auto auto;align-items:center;gap:12px;padding:11px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color)}.queue-row.writing{border-color:#d97706;background:rgba(217,119,6,.07)}.queue-row.failed{border-color:#dc2626}.queue-icon{width:38px;height:38px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color)}.queue-main strong,.queue-route strong{display:block}.queue-main small,.queue-route small{display:block;color:var(--secondary-text-color);margin-top:3px}.signal-value{font-weight:850}.signal-value.good-signal{color:#16803c}.signal-value.warn-signal{color:#b06000}.signal-value.bad-signal{color:#c62828}
        @media(max-width:1450px){.editor-shell{grid-template-columns:230px minmax(0,1fr) 300px}.layers-panel{grid-column:3}.properties-panel{grid-column:3}.layers-panel,.properties-panel{position:static}}
        @media(max-width:1180px){.editor-shell,.status-grid{grid-template-columns:1fr}.queue-summary{grid-template-columns:1fr 1fr}.left,.right,.layers-panel,.properties-panel{position:static;grid-column:auto}.tabbar,.subtabs{width:100%}.tab,.subtab{flex:1}.workspace{min-height:420px}}
        @media(max-width:720px){.topology-row,.queue-row{grid-template-columns:1fr}.queue-summary,.file-menu-grid,.file-actions,.file-backstage,.project-choice-grid{grid-template-columns:1fr}.file-rail{display:grid;grid-template-columns:1fr 1fr}.file-rail-title{grid-column:1/-1}.ribbon{flex-wrap:wrap}.ribbon-project{width:100%;order:3}.ribbon-menu{left:8px;right:8px;top:94px;min-width:0}.designer-context{align-items:flex-start}.topology-link{width:2px;height:26px;justify-self:center}.topology-link:after{right:-4px;top:auto;bottom:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid #0f766e}.topology-link span{white-space:normal}.route{grid-template-columns:auto minmax(0,1fr) auto}.route-rssi{grid-column:2}.gateway-health{grid-template-columns:1fr}}
        .view-menu{left:420px}.tools-menu{left:315px}.layout-menu{left:205px}
        .toolbar>.density-toolbar{margin-left:auto}.density-row{display:flex;justify-content:flex-end;margin:10px 0 12px}.density-toolbar{justify-content:flex-end}.device-grid.mode-compact .minimal-card{grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px 11px}.device-grid.mode-compact .minimal-card .compact-metrics{grid-column:1/-1}.device-grid.mode-list .minimal-card{grid-template-columns:minmax(220px,1.2fr) minmax(390px,1.8fr) auto;gap:12px;padding:8px 11px}.compact-identity{min-width:0}.compact-identity strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}.compact-identity span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;color:var(--secondary-text-color);font-size:11px}.compact-metrics{display:flex;align-items:center;gap:12px;min-width:0}.compact-stat{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.compact-stat .signal-bars{height:17px}.compact-stat .signal-bars span{width:5px}.mini-battery{width:42px;height:8px}.compact-route{flex:1}.compact-route span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-open{min-width:34px;min-height:34px;padding:6px}
        @media(max-width:720px){.ribbon-menu{left:8px;right:8px}.density-switch span{display:none}.device-grid.mode-list .device-card{grid-template-columns:1fr auto}.device-grid.mode-list .device-card-details{grid-column:1/-1;grid-template-columns:1fr}.device-grid.mode-list .minimal-card .compact-metrics{grid-column:1/-1;grid-row:2}.compact-metrics{flex-wrap:wrap}.compact-open{grid-column:2;grid-row:1}}
        @media(max-width:720px){.device-grid.mode-list .minimal-card{grid-template-columns:minmax(0,1fr) auto}.device-grid.mode-list .compact-device-preview{grid-column:1/-1;grid-row:auto;min-width:0}.device-grid.mode-list .minimal-card .compact-identity{grid-column:1;grid-row:auto}.device-grid.mode-list .minimal-card .compact-metrics{grid-column:1/-1;grid-row:auto}.device-grid.mode-list .minimal-card .compact-open{grid-column:2;grid-row:2}.device-preview-wrap{min-height:88px}.device-preview-caption{align-items:flex-start;flex-direction:column}}
        .device-grid{grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}.device-card{gap:16px;padding:18px;border-radius:14px;background:var(--card-background-color);box-shadow:0 14px 34px rgba(15,23,42,.09);overflow:hidden}.device-card:before{display:none}.device-card:hover{border-color:rgba(22,128,60,.45);box-shadow:0 18px 42px rgba(15,23,42,.13)}.device-card.selected{border-color:#16803c;box-shadow:0 0 0 2px rgba(22,128,60,.14),0 18px 42px rgba(15,23,42,.13)}.device-card-top{align-items:center}.device-card-identity{display:flex;align-items:center;gap:11px;min-width:0}.device-card-identity>div{min-width:0}.device-card-identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-card-identity span,.device-card-identity small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-card-identity small{margin-top:2px;color:var(--secondary-text-color);font-size:10px}.device-card-icon{width:42px;height:42px;display:grid!important;place-items:center;flex:0 0 auto;border-radius:10px;background:rgba(22,128,60,.1);color:#16803c}.device-card-icon ha-icon{--mdc-icon-size:24px}.device-card-resolution{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;padding:6px 9px;border:1px solid rgba(22,128,60,.28);border-radius:7px;background:rgba(22,128,60,.07);color:#126c33;font-size:11px;font-weight:850;white-space:nowrap}.device-card-resolution ha-icon{--mdc-icon-size:15px}.device-preview-wrap{display:grid;place-items:center;min-height:0;margin:2px 0;padding:0;border-radius:0;background:none}.device-preview-bezel{position:relative;display:block;width:min(100%,var(--preview-width,460px));aspect-ratio:var(--frame-ratio,2.15);padding:0;border:7px solid #eee8e8;border-radius:15px;background:#fff;box-shadow:0 7px 18px rgba(15,23,42,.16),inset 0 0 0 1px rgba(0,0,0,.045)}.device-preview-screen{position:absolute;inset:10% 12%;width:auto;height:auto;overflow:hidden;border:1px solid rgba(0,0,0,.2);background:#fff;box-shadow:inset 0 0 4px rgba(0,0,0,.13)}.device-preview-code{position:absolute;z-index:2;left:3.1%;top:50%;justify-self:auto;color:#111;font:700 clamp(7px,1.2vw,11px)/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.025em;writing-mode:vertical-rl;transform:translateY(-50%) rotate(180deg);white-space:nowrap}.device-preview-caption{display:none}.device-preview-empty{font-size:9px}.device-preview-empty ha-icon{--mdc-icon-size:18px}.device-card-details{gap:12px}.device-status-strip{display:grid;grid-template-columns:1.1fr .8fr 1.2fr;gap:7px}.device-status-item{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-width:0;padding:10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--secondary-background-color)}.device-status-item>ha-icon{--mdc-icon-size:21px;color:#16803c}.device-status-item span,.device-status-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device-status-item span{color:var(--secondary-text-color);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.device-status-item strong{margin-top:2px;font-size:11px}.device-status-item .battery{height:5px;margin-top:6px}.device-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:8px}.device-actions button{width:100%}.compact-device-preview{grid-column:1/-1;min-height:0;padding:0}.compact-device-preview .device-preview-bezel{width:min(100%,300px);padding:0;border-width:5px;border-radius:10px}.compact-device-preview .device-preview-code{left:3%;font-size:6px}.device-grid.mode-compact{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.device-grid.mode-compact .minimal-card{position:relative;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:13px}.device-grid.mode-compact .minimal-card .compact-identity{grid-column:1;grid-row:1}.device-grid.mode-compact .minimal-card .device-card-resolution{grid-column:2;grid-row:1;align-self:start}.device-grid.mode-compact .minimal-card .compact-device-preview{grid-column:1/-1;grid-row:2}.device-grid.mode-compact .minimal-card .compact-metrics{grid-column:1/-1;grid-row:3}.device-grid.mode-compact .minimal-card .compact-open{grid-column:1/-1;grid-row:4;width:100%}.device-grid.mode-list .minimal-card{grid-template-columns:minmax(210px,.8fr) minmax(220px,1fr) auto;grid-template-rows:auto auto;gap:10px;padding:12px 14px}.device-grid.mode-list .compact-device-preview{grid-column:1;grid-row:1/3;min-width:210px}.device-grid.mode-list .minimal-card .compact-identity{grid-column:2;grid-row:1}.device-grid.mode-list .minimal-card .device-card-resolution{grid-column:3;grid-row:1;align-self:start}.device-grid.mode-list .minimal-card .compact-metrics{grid-column:2;grid-row:2}.device-grid.mode-list .minimal-card .compact-open{grid-column:3;grid-row:2;align-self:end}.device-meta{display:none!important}
        @media(max-width:720px){.device-grid{grid-template-columns:1fr}.device-card{padding:14px}.device-card-top{align-items:flex-start}.device-card-identity strong{font-size:17px}.device-status-strip{grid-template-columns:1fr}.device-actions{grid-template-columns:1fr}.device-grid.mode-list .minimal-card{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto auto auto}.device-grid.mode-list .compact-device-preview{grid-column:1/-1;grid-row:2;min-width:0}.device-grid.mode-list .minimal-card .compact-identity{grid-column:1;grid-row:1}.device-grid.mode-list .minimal-card .device-card-resolution{grid-column:2;grid-row:1}.device-grid.mode-list .minimal-card .compact-metrics{grid-column:1/-1;grid-row:3}.device-grid.mode-list .minimal-card .compact-open{grid-column:1/-1;grid-row:4;width:100%}}
        .device-card-top .device-card-icon{display:grid!important;margin-top:0;color:#16803c}.device-card-top .device-card-resolution{display:inline-flex;margin-top:0;color:#126c33}
        .display-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}.display-tile{position:relative;display:grid;grid-template-rows:auto minmax(150px,1fr) auto auto;gap:15px;padding:17px;border:1px solid var(--divider-color);border-radius:18px;background:var(--card-background-color);box-shadow:0 8px 28px rgba(15,23,42,.08);overflow:hidden;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.display-tile:hover{transform:translateY(-2px);border-color:rgba(22,128,60,.42);box-shadow:0 14px 38px rgba(15,23,42,.12)}.display-tile.selected{border-color:#16803c;box-shadow:0 0 0 2px rgba(22,128,60,.14),0 14px 38px rgba(15,23,42,.12)}.display-tile-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px}.display-online-dot{width:10px;height:10px;border-radius:50%;background:#1a9b4b;box-shadow:0 0 0 4px rgba(26,155,75,.13)}.display-tile-identity{min-width:0}.display-tile-identity strong,.display-tile-identity span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.display-tile-identity strong{font-size:16px}.display-tile-identity span{margin-top:3px;color:var(--secondary-text-color);font-size:11px}.display-resolution{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:rgba(22,128,60,.1);color:#126c33;font-size:11px;font-weight:850;white-space:nowrap}.display-resolution ha-icon{--mdc-icon-size:15px}.display-preview-slot{min-width:0;display:grid;place-items:center;padding:15px 12px;border-radius:13px;background:linear-gradient(145deg,rgba(127,127,127,.06),rgba(127,127,127,.015))}.display-preview-slot .device-preview-wrap{width:100%}.display-health{display:grid;grid-template-columns:.8fr .8fr 1.4fr;gap:8px}.display-health-item{display:flex;align-items:center;gap:8px;min-width:0;padding:9px 10px;border-top:1px solid var(--divider-color)}.display-health-item>ha-icon{--mdc-icon-size:20px;flex:0 0 auto;color:#16803c}.display-health-item span{min-width:0}.display-health-item small,.display-health-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.display-health-item small{color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.display-health-item strong{margin-top:2px;font-size:11px}.display-tile-actions{display:grid;grid-template-columns:.8fr 1.2fr;gap:8px}.display-tile-actions button{width:100%}.display-name-edit{margin:0}.display-grid.density-compact{grid-template-columns:repeat(auto-fill,minmax(275px,1fr));gap:12px}.display-grid.density-compact .display-tile{grid-template-rows:auto minmax(105px,1fr) auto auto;gap:10px;padding:13px;border-radius:14px}.display-grid.density-compact .display-preview-slot{padding:9px}.display-grid.density-compact .display-health{grid-template-columns:1fr 1fr}.display-grid.density-compact .display-health-route{grid-column:1/-1}.display-grid.density-compact .display-tile-actions{grid-template-columns:1fr}.display-grid.density-list{grid-template-columns:1fr;gap:10px}.display-grid.density-list .display-tile{grid-template-columns:minmax(220px,.8fr) minmax(250px,1fr) minmax(270px,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:10px;padding:12px 14px;border-radius:13px}.display-grid.density-list .display-preview-slot{grid-column:1;grid-row:1/3;padding:8px}.display-grid.density-list .display-tile-header{grid-column:2/4;grid-row:1}.display-grid.density-list .display-health{grid-column:2/4;grid-row:2}.display-grid.density-list .display-tile-actions{grid-column:4;grid-row:1/3;grid-template-columns:1fr}.display-grid.density-list .display-name-edit{grid-column:4;grid-row:1/3}.display-grid.density-list .display-tile-actions button{white-space:nowrap}.display-preview-slot .device-preview-bezel{border-color:#eee8e8}.display-preview-slot .device-preview-screen{inset:10% 12%}
        .display-preview-slot,.display-grid.density-compact .display-preview-slot,.display-grid.density-list .display-preview-slot{padding:10px 0;border-radius:0;background:none}
        @media(max-width:900px){.display-grid.density-list .display-tile{grid-template-columns:minmax(190px,.8fr) minmax(0,1fr);grid-template-rows:auto auto auto}.display-grid.density-list .display-preview-slot{grid-column:1;grid-row:1/4}.display-grid.density-list .display-tile-header,.display-grid.density-list .display-health,.display-grid.density-list .display-tile-actions,.display-grid.density-list .display-name-edit{grid-column:2;grid-row:auto}}
        @media(max-width:620px){.display-grid{grid-template-columns:1fr}.display-tile{padding:14px;border-radius:14px}.display-tile-header{grid-template-columns:auto minmax(0,1fr)}.display-resolution{grid-column:2}.display-health{grid-template-columns:1fr 1fr}.display-health-route{grid-column:1/-1}.display-tile-actions{grid-template-columns:1fr}.display-grid.density-list .display-tile{display:grid;grid-template-columns:1fr;grid-template-rows:auto}.display-grid.density-list .display-preview-slot,.display-grid.density-list .display-tile-header,.display-grid.density-list .display-health,.display-grid.density-list .display-tile-actions,.display-grid.density-list .display-name-edit{grid-column:1;grid-row:auto}}
        .display-health-item>span{flex:1;min-width:0}.display-battery-item .battery{display:block;width:100%;height:7px;margin-top:6px;box-sizing:border-box}.display-signal-item>.signal-bars{flex:0 0 auto}.display-signal-item>.signal-bars span{width:6px}.preview-full .device-preview-bezel{border-width:7px;border-radius:14px}.preview-large .device-preview-bezel{border-width:6px;border-radius:12px}.preview-large .device-preview-code{font-size:8px}.preview-compact .device-preview-bezel{border-width:5px;border-radius:10px}.preview-compact .device-preview-code{font-size:6px}.display-grid.density-large{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.display-grid.density-large .display-tile{grid-template-rows:auto minmax(125px,1fr) auto auto;gap:12px;padding:15px}.display-grid.density-large .display-health{grid-template-columns:1fr 1fr}.display-grid.density-large .display-health-route{grid-column:1/-1}.display-grid.density-compact{grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:10px}.display-grid.density-compact .display-tile{grid-template-rows:auto minmax(82px,1fr) auto auto;gap:9px;padding:12px}.display-grid.density-compact .display-tile-header{grid-template-columns:auto minmax(0,1fr)}.display-grid.density-compact .display-resolution{grid-column:2;padding:4px 7px}.display-grid.density-compact .display-health-item{padding:7px 5px}.display-grid.density-compact .display-health-item small{display:none}.display-grid.density-compact .display-battery-item .battery{height:6px;margin-top:4px}.display-grid.density-list .display-tile{grid-template-columns:minmax(220px,1fr) minmax(300px,1.35fr) auto;grid-template-rows:auto;gap:12px;padding:10px 13px}.display-grid.density-list .display-tile-header{grid-column:1;grid-row:1}.display-grid.density-list .display-health{grid-column:2;grid-row:1}.display-grid.density-list .display-tile-actions,.display-grid.density-list .display-name-edit{grid-column:3;grid-row:1}.display-grid.density-list .display-tile-actions{grid-template-columns:auto auto}.display-grid.density-list .display-health-item{padding:6px 8px}.display-grid.density-list .display-preview-slot{display:none}
        @media(max-width:980px){.display-grid.density-list .display-tile{grid-template-columns:minmax(210px,1fr) minmax(260px,1.2fr);grid-template-rows:auto auto}.display-grid.density-list .display-tile-header{grid-column:1;grid-row:1}.display-grid.density-list .display-health{grid-column:2;grid-row:1}.display-grid.density-list .display-tile-actions,.display-grid.density-list .display-name-edit{grid-column:1/-1;grid-row:2}}
        @media(max-width:620px){.display-grid.density-list .display-tile{grid-template-columns:1fr;grid-template-rows:auto}.display-grid.density-list .display-tile-header,.display-grid.density-list .display-health,.display-grid.density-list .display-tile-actions,.display-grid.density-list .display-name-edit{grid-column:1;grid-row:auto}.display-grid.density-list .display-tile-actions{grid-template-columns:1fr}.display-grid.density-compact .display-tile-header{grid-template-columns:auto minmax(0,1fr)}.display-health{grid-template-columns:1fr 1fr}}
        .display-health{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
        .display-battery-item,.display-signal-item{display:grid;grid-template-columns:1fr;grid-template-rows:auto 26px auto;justify-items:center;align-content:center;gap:4px;text-align:center}
        .display-battery-item small,.display-signal-item small{display:block!important;line-height:1.1}
        .display-battery-item .battery-segments,.display-signal-item .signal-bars{margin:0;align-self:center}
        .display-battery-item strong,.display-signal-item strong{max-width:100%;margin:0;line-height:1.2}
        .display-health-route{grid-column:1/-1;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;align-content:center;text-align:left}
        .display-health-route>ha-icon{grid-column:1;grid-row:1/3}
        .display-health-route>span{grid-column:2;grid-row:1/3;min-width:0}
        .display-grid.density-compact .display-battery-item,.display-grid.density-compact .display-signal-item{grid-template-rows:auto 23px auto;padding-inline:7px}
        @media(max-width:380px){.display-health{grid-template-columns:1fr}.display-health-route{grid-column:1}.display-tile-header{grid-template-columns:auto minmax(0,1fr)}.display-resolution{grid-column:2}}
        :host{--dratek-teal:#00a2a5;--dratek-teal-dark:#007f83;--dratek-orange:#ff6b00;--dratek-orange-dark:#d95700;--dratek-ink:#172033;--primary-color:var(--dratek-teal);--accent-color:var(--dratek-orange)}
        .page{background:linear-gradient(145deg,rgba(0,162,165,.045),transparent 34%,rgba(255,107,0,.035));border-radius:18px}.topbar{border-top:4px solid var(--dratek-teal);border-radius:12px}.brand h1{color:var(--dratek-teal-dark)}.version-badge{border-color:rgba(255,107,0,.35);background:rgba(255,107,0,.1);color:var(--dratek-orange-dark)}button{background:var(--dratek-teal)}.primary-action,.ribbon-tab.menu-tab,.ribbon-tab.menu-tab.active,.subtab.active{background:var(--dratek-teal);border-color:var(--dratek-teal)}.ribbon-tab.menu-tab:hover,.subtab.active:hover{background:var(--dratek-teal-dark)}.ribbon-send{background:var(--dratek-orange);border-color:var(--dratek-orange)}.ribbon-send:hover:not(:disabled){background:var(--dratek-orange-dark)}.tab.active{background:var(--dratek-teal)}.status-icon,.file-action ha-icon,.route ha-icon,.queue-stat ha-icon,.inspector-section-title ha-icon,.inspector-object-icon,.toggle-card>ha-icon,.format-help ha-icon,.device-status-item>ha-icon,.display-health-item>ha-icon{color:var(--dratek-teal)}.route.preferred,.display-tile.selected,.layer-row.selected,.color-option.selected{border-color:var(--dratek-teal)}.layer-row.selected{background:rgba(0,162,165,.09);box-shadow:inset 3px 0 0 var(--dratek-teal)}.color-option.selected{background:rgba(0,162,165,.08);box-shadow:inset 0 0 0 1px var(--dratek-teal)}.layout-btn.active,.layout-menu-button.active{background:var(--dratek-teal);border-color:var(--dratek-teal)}.menu-command ha-icon{color:var(--dratek-teal)}.menu-command.selected{background:rgba(0,162,165,.09);border-color:var(--dratek-teal)}.display-resolution,.resolution-chip{border-color:rgba(0,162,165,.3);background:rgba(0,162,165,.08);color:var(--dratek-teal-dark)}.display-online-dot{background:var(--dratek-teal);box-shadow:0 0 0 4px rgba(0,162,165,.14)}.signal-bars.level-2 .on{background:var(--dratek-orange)}.signal-bars.level-3 .on,.signal-bars.level-4 .on,.battery.high span{background:var(--dratek-teal)}.battery.medium span{background:var(--dratek-orange)}.signal-value.good-signal{color:var(--dratek-teal-dark)}.signal-value.warn-signal{color:var(--dratek-orange-dark)}
        .editor-shell{grid-template-columns:230px minmax(0,1fr) 320px;grid-template-areas:"tools canvas inspector" "layers canvas inspector";gap:14px;align-items:start}.editor-shell>.left{grid-area:tools}.editor-shell>.workspace-card{grid-area:canvas;min-width:0}.editor-shell>.properties-panel{grid-area:inspector}.editor-shell>.layers-panel{grid-area:layers}.editor-shell>.left,.editor-shell>.properties-panel{position:sticky;top:12px}.editor-shell>.layers-panel{position:static}.workspace-card{border-radius:13px;border-color:rgba(0,162,165,.22)}.canvas-head{border-bottom-color:rgba(0,162,165,.2);background:linear-gradient(90deg,rgba(0,162,165,.08),rgba(255,107,0,.055))}.canvas-meta ha-icon{color:var(--dratek-teal)}.workspace{min-width:0;padding:32px;overflow:auto;background:linear-gradient(45deg,rgba(0,162,165,.055) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,107,0,.045) 25%,transparent 25%);background-size:20px 20px}.designer-device-bezel{position:relative;display:inline-block;flex:0 0 auto;padding:var(--designer-frame-y) var(--designer-frame-x);border:8px solid #eee8e8;border-radius:18px;background:#fff;box-shadow:0 18px 46px rgba(23,32,51,.2),inset 0 0 0 1px rgba(0,0,0,.045)}.designer-device-screen{position:relative;overflow:hidden;border:1px solid rgba(0,0,0,.22);background:#fff;box-shadow:inset 0 0 5px rgba(0,0,0,.13)}.designer-device-screen canvas{display:block;background:#fff;box-shadow:none}.designer-device-code{position:absolute;z-index:2;left:calc(var(--designer-frame-x) * .26);top:50%;color:#111;font:700 clamp(7px,1vw,11px)/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.025em;writing-mode:vertical-rl;transform:translateY(-50%) rotate(180deg);white-space:nowrap;pointer-events:none}
        .rgb-led-card{padding:13px 16px;border-color:rgba(0,162,165,.24);background:linear-gradient(100deg,rgba(0,162,165,.07),var(--card-background-color) 36%,rgba(255,107,0,.045))}.rgb-led-heading,.rgb-led-title,.rgb-led-controls,.led-color-row,.led-result{display:flex;align-items:center}.rgb-led-heading{justify-content:space-between;gap:12px;margin-bottom:12px}.rgb-led-title{gap:10px;min-width:0}.rgb-led-title h2{margin:0;font-size:15px}.rgb-led-title small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:11px}.rgb-led-icon{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:10px;background:color-mix(in srgb,var(--led-color) 18%,var(--card-background-color));color:var(--led-color);border:1px solid color-mix(in srgb,var(--led-color) 46%,var(--divider-color));text-shadow:0 0 8px var(--led-color)}.rgb-led-icon ha-icon{--mdc-icon-size:24px}.rgb-led-controls{display:grid;grid-template-columns:minmax(230px,1fr) minmax(280px,1.25fr) minmax(210px,.85fr) auto;gap:12px;align-items:end}.rgb-led-controls>.field{margin:0}.led-mode-control .segment-button{display:flex;align-items:center;justify-content:center;gap:5px}.led-mode-control .segment-button span{font-size:11px}.led-color-row{gap:9px}.led-color-row input[type=color]{width:48px;height:38px;flex:0 0 auto;padding:3px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color)}.led-presets{display:flex;flex-wrap:wrap;gap:5px}.led-preset{width:25px;min-width:25px;height:25px;min-height:25px;padding:0;border:2px solid var(--card-background-color);border-radius:50%;background:var(--preset);box-shadow:0 0 0 1px var(--divider-color)}.led-preset:hover:not(:disabled){transform:scale(1.08);background:var(--preset)}.led-preset.selected{box-shadow:0 0 0 2px var(--dratek-teal)}.led-flash-field input{width:100%;accent-color:var(--dratek-orange)}.led-flash-field label{display:flex;justify-content:space-between}.rgb-led-apply{min-height:39px;white-space:nowrap}.led-result{gap:5px;font-size:11px;font-weight:750}.led-result ha-icon{--mdc-icon-size:18px}.led-result.good{color:#16803c}.led-result.bad{color:#c62828}
        @media(max-width:1280px){.editor-shell{grid-template-columns:210px minmax(0,1fr) 285px;gap:10px}.workspace{padding:24px}.editor-shell>.properties-panel{max-height:none}}
        @media(max-width:1120px){.rgb-led-controls{grid-template-columns:repeat(2,minmax(0,1fr))}.rgb-led-apply{justify-self:start}}
        @media(max-width:980px){.editor-shell{grid-template-columns:210px minmax(0,1fr);grid-template-areas:"tools canvas" "layers canvas" "inspector inspector"}.editor-shell>.left,.editor-shell>.properties-panel{position:static}.properties-panel{max-height:none}.workspace{min-height:430px}}
        @media(max-width:720px){.page{padding:10px}.editor-shell{grid-template-columns:1fr;grid-template-areas:"canvas" "tools" "inspector" "layers"}.workspace-card{order:0}.workspace{min-height:330px;padding:18px}.designer-device-bezel{border-width:6px;border-radius:13px}.canvas-head{align-items:flex-start;flex-direction:column}.designer-context{flex-wrap:wrap}.ribbon-send{order:2}.ribbon-project{width:100%;order:3}.rgb-led-heading{align-items:flex-start;flex-direction:column}.rgb-led-controls{grid-template-columns:1fr}.rgb-led-apply{width:100%}}
        :host{--dratek-teal:#009999;--dratek-teal-dark:#007a7a;--dratek-orange:#ff6600;--dratek-orange-dark:#d95700}
        .battery-segments{position:relative;display:grid;grid-template-columns:repeat(4,5px);align-items:center;gap:2px;box-sizing:border-box;height:24px;padding:3px 5px;border:2px solid var(--divider-color);border-radius:5px;color:var(--divider-color);flex:0 0 auto;transition:border-color .18s ease,color .18s ease}.battery-segments:after{content:"";position:absolute;right:-5px;top:50%;width:3px;height:9px;border-radius:0 2px 2px 0;background:currentColor;transform:translateY(-50%)}.battery-segments span{display:block;width:5px;height:12px;border-radius:1px;background:var(--divider-color);transition:background .18s ease,box-shadow .18s ease}.battery-segments.level-1{border-color:#dc2626;color:#dc2626}.battery-segments.level-1 .on{background:#dc2626}.battery-segments.level-2{border-color:var(--dratek-orange);color:var(--dratek-orange)}.battery-segments.level-2 .on{background:var(--dratek-orange)}.battery-segments.level-3{border-color:#eab308;color:#eab308}.battery-segments.level-3 .on{background:#eab308}.battery-segments.level-4{border-color:#16a34a;color:#16a34a}.battery-segments.level-4 .on{background:#16a34a}.battery-segments .on,.signal-bars .on{box-shadow:0 0 5px color-mix(in srgb,currentColor 36%,transparent)}
        .signal-bars.level-1{color:#dc2626}.signal-bars.level-1 .on{background:#dc2626}.signal-bars.level-2{color:var(--dratek-orange)}.signal-bars.level-2 .on{background:var(--dratek-orange)}.signal-bars.level-3{color:#eab308}.signal-bars.level-3 .on{background:#eab308}.signal-bars.level-4{color:#16a34a}.signal-bars.level-4 .on{background:#16a34a}
        .display-grid.density-compact .battery-segments{grid-template-columns:repeat(4,4px);height:22px;padding:3px 4px}.display-grid.density-compact .battery-segments span{width:4px;height:10px}
        .connection-map-card{padding:18px}.connection-map-card>.section-title{align-items:flex-start;margin-bottom:16px}.connection-map-card>.section-title h2{color:var(--primary-text-color);font-size:15px;text-transform:none;letter-spacing:0}.connection-map-card>.section-title small{display:block;margin-top:4px;color:var(--secondary-text-color);font-size:11px;font-weight:500}.connection-map{display:grid;gap:14px}.connection-group{display:grid;grid-template-columns:minmax(210px,260px) 54px minmax(0,1fr);align-items:center;min-width:0;padding:14px 16px;border:1px solid var(--divider-color);border-radius:15px;background:linear-gradient(135deg,rgba(0,153,153,.055),transparent 38%,rgba(255,102,0,.025));box-shadow:0 7px 22px rgba(15,23,42,.055)}.connection-group.is-local{background:linear-gradient(135deg,rgba(0,153,153,.04),transparent 42%)}.connection-group.is-unavailable{background:linear-gradient(135deg,rgba(220,38,38,.045),transparent 42%)}.connection-hub{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;min-width:0;padding:13px;border:1px solid rgba(0,153,153,.25);border-radius:12px;background:var(--card-background-color);box-shadow:0 5px 16px rgba(15,23,42,.07)}.connection-group.is-unavailable .connection-hub{border-color:rgba(220,38,38,.24)}.connection-hub-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;background:rgba(0,153,153,.1);color:var(--dratek-teal-dark)}.connection-group.is-unavailable .connection-hub-icon{background:rgba(220,38,38,.09);color:#dc2626}.connection-hub-icon ha-icon{--mdc-icon-size:24px}.connection-hub-copy{min-width:0}.connection-hub-copy small,.connection-hub-copy strong,.connection-hub-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-hub-copy small{color:var(--dratek-teal-dark);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.connection-hub-copy strong{margin-top:2px;font-size:14px}.connection-hub-copy span{margin-top:3px;color:var(--secondary-text-color);font-size:10px}.connection-count{min-width:28px;height:28px;display:grid;place-items:center;border-radius:999px;background:var(--dratek-orange);color:#fff;font-size:12px;font-weight:900}.connection-bus{position:relative;height:100%;min-height:52px}.connection-bus:before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:linear-gradient(90deg,var(--dratek-teal),var(--dratek-orange));transform:translateY(-50%)}.connection-bus span{position:absolute;right:-5px;top:50%;width:11px;height:11px;border:3px solid var(--dratek-orange);border-radius:50%;background:var(--card-background-color);transform:translateY(-50%)}.connection-devices{position:relative;display:grid;gap:8px;min-width:0}.connection-devices:before{content:"";position:absolute;left:-5px;top:24px;bottom:24px;width:2px;background:var(--dratek-orange)}.connection-device{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;min-width:0;min-height:58px;padding:9px 11px;border:1px solid var(--divider-color);border-radius:11px;background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none;text-align:left}.connection-device:before{content:"";position:absolute;left:-5px;top:50%;width:5px;height:2px;background:var(--dratek-orange)}.connection-device:hover:not(:disabled){border-color:rgba(0,153,153,.45);background:rgba(0,153,153,.045);box-shadow:0 5px 14px rgba(15,23,42,.07)}.connection-device-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:rgba(0,153,153,.09);color:var(--dratek-teal-dark)}.connection-device-icon ha-icon{--mdc-icon-size:20px}.connection-device-copy{min-width:0}.connection-device-copy strong,.connection-device-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-device-copy strong{font-size:12px}.connection-device-copy small{margin-top:3px;color:var(--secondary-text-color);font-size:9px;font-weight:500}.connection-device-signal{display:grid;grid-template-columns:auto auto;align-items:end;justify-items:end;gap:1px 7px;min-width:70px}.connection-device-signal>.signal-bars{grid-row:1/3;height:20px}.connection-device-signal>.signal-bars span{width:5px}.connection-device-signal>small{font-size:9px;white-space:nowrap}.connection-active{color:var(--dratek-teal);line-height:1}.connection-active ha-icon{--mdc-icon-size:14px}
        .connection-map-card{padding:18px;border-radius:16px}.connection-map{display:grid;gap:14px}.connection-group{display:grid;grid-template-columns:minmax(210px,260px) 54px minmax(0,1fr);align-items:center;padding:14px;border:1px solid var(--divider-color);border-radius:14px;background:var(--secondary-background-color);box-shadow:0 4px 16px rgba(15,23,42,.04)}.connection-group.is-gateway{border-left:4px solid var(--dratek-teal)}.connection-group.is-local{border-left:4px solid #168fe0}.connection-group.is-unavailable{border-left:4px solid #c62828}.connection-hub{display:flex;align-items:center;gap:11px;min-width:0}.connection-hub-icon{width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;border-radius:11px;background:var(--card-background-color);border:1px solid var(--divider-color);color:var(--dratek-teal-dark)}.connection-hub-icon ha-icon{--mdc-icon-size:24px}.connection-hub-copy{min-width:0;flex:1}.connection-hub-copy small{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.connection-hub-copy strong{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}.connection-hub-copy span{display:block;color:var(--secondary-text-color);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}.connection-count{display:grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:rgba(0,153,153,.12);color:var(--dratek-teal-dark);font-size:10px;font-weight:900}.connection-bus{position:relative;height:100%;min-height:48px;display:flex;align-items:center;justify-content:center}.connection-bus:before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:linear-gradient(90deg,var(--dratek-teal),var(--dratek-orange));transform:translateY(-50%)}.connection-bus span{position:absolute;right:2px;top:50%;width:7px;height:7px;border-top:2px solid var(--dratek-orange);border-right:2px solid var(--dratek-orange);transform:translateY(-50%) rotate(45deg)}.connection-devices{display:flex;flex-direction:column;gap:8px;position:relative;padding-left:22px}.connection-devices:before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:2px;background:var(--dratek-orange);border-radius:1px}.connection-device{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);text-align:left;cursor:pointer;transition:all .15s ease;width:100%;box-sizing:border-box}.connection-device:hover{border-color:var(--dratek-teal);box-shadow:0 4px 14px rgba(15,23,42,.08);transform:translateX(3px)}.connection-device:before{content:"";position:absolute;left:-22px;top:50%;width:22px;height:2px;background:var(--dratek-orange)}.connection-device:after{content:"";position:absolute;left:-26px;top:50%;width:7px;height:7px;border:2px solid var(--dratek-orange);border-radius:50%;background:var(--card-background-color);transform:translateY(-50%)}.connection-device-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:rgba(0,153,153,.09);color:var(--dratek-teal-dark);flex:0 0 auto}.connection-device-copy{min-width:0;flex:1}.connection-device-copy strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-device-copy small{display:block;color:var(--secondary-text-color);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}.connection-device-signal{display:flex;align-items:center;gap:6px;flex:0 0 auto}.connection-active{color:var(--dratek-teal);display:grid;place-items:center}
        @media(max-width:760px){.connection-group{grid-template-columns:1fr;gap:10px;padding:12px}.connection-bus{height:28px;min-height:28px}.connection-bus:before{left:50%;right:auto;top:0;bottom:0;width:2px;height:100%;transform:translateX(-50%);background:linear-gradient(180deg,var(--dratek-teal),var(--dratek-orange))}.connection-bus span{left:50%;right:auto;top:auto;bottom:2px;transform:translateX(-50%) rotate(135deg)}.connection-devices{padding-left:16px}.connection-devices:before{left:0;top:16px;bottom:16px}.connection-device:before{left:-16px;width:16px}.connection-device:after{left:-20px}}
        .device-preview-pe29 .device-preview-identification{position:absolute;z-index:2;right:2.1%;top:10%;bottom:10%;width:8.4%;display:grid;grid-template-columns:max-content minmax(6px,1fr);align-items:center;justify-content:center;gap:2px}.device-preview-pe29 .device-preview-identification .device-preview-code{position:static;left:auto;right:auto;top:auto;font-size:clamp(6px,1.15vw,10px);writing-mode:vertical-rl;transform:none}.device-preview-barcode{display:block;width:100%;height:88%;min-width:6px;overflow:visible;background:#fff;shape-rendering:crispEdges}.device-preview-barcode rect{fill:#111}
        .designer-device-pe29 .designer-device-identification{position:absolute;z-index:3;right:calc(var(--designer-frame-x) * .16);top:var(--designer-frame-y);bottom:var(--designer-frame-y);width:calc(var(--designer-frame-x) * .68);display:grid;grid-template-columns:max-content minmax(8px,1fr);align-items:center;justify-content:center;gap:4px}.designer-device-pe29 .designer-device-identification .designer-device-code{position:static;left:auto;right:auto;top:auto;font-size:clamp(7px,1vw,11px);writing-mode:vertical-rl;transform:none}.designer-device-identification .device-preview-barcode{height:88%}
        .designer-section{display:grid;gap:12px}.designer-device-strip{display:grid;grid-template-columns:minmax(210px,1.35fr) minmax(150px,.9fr) auto auto auto minmax(155px,1fr) auto;align-items:stretch;gap:0;padding:0;overflow:hidden;border-radius:14px;border-color:rgba(0,153,153,.24)}.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route,.designer-orientation{min-width:0;padding:11px 13px;border-right:1px solid var(--divider-color)}.designer-device-primary{display:flex;align-items:center;gap:10px;background:linear-gradient(110deg,rgba(0,153,153,.11),rgba(0,153,153,.025))}.designer-device-mark{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:10px;background:var(--dratek-teal);color:#fff}.designer-device-mark ha-icon{--mdc-icon-size:22px}.designer-device-primary strong,.designer-device-primary span,.designer-device-fact strong,.designer-device-fact small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.designer-device-primary strong{font-size:14px}.designer-device-primary span{margin-top:3px;color:var(--secondary-text-color);font-size:10px}.designer-device-primary small,.designer-device-fact small,.designer-device-meter>small,.designer-orientation>small{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:9px;font-weight:850;letter-spacing:.055em;text-transform:uppercase}.designer-device-fact,.designer-device-meter,.designer-route,.designer-orientation{display:grid;align-content:center}.designer-device-fact strong{font-size:12px}.designer-device-meter>div{display:flex;align-items:center;gap:8px}.designer-device-meter strong{font-size:11px;white-space:nowrap}.designer-device-meter .signal-bars{height:20px}.designer-route strong{display:flex;align-items:center;gap:6px;overflow:hidden;font-size:11px;white-space:nowrap;text-overflow:ellipsis}.designer-route strong ha-icon{flex:0 0 auto;color:var(--dratek-teal);--mdc-icon-size:17px}.designer-orientation{border-right:0;background:rgba(255,102,0,.055)}.designer-orientation>div{display:grid;grid-template-columns:1fr 1fr;gap:4px}.designer-orientation button{min-height:34px;padding:6px 9px;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none;font-size:10px}.designer-orientation button.active{background:var(--dratek-orange);border-color:var(--dratek-orange);color:#fff}.designer-commandbar{display:flex;align-items:center;gap:7px;min-height:58px;padding:7px 9px;border-radius:14px;border-color:rgba(0,153,153,.2)}.designer-command-group{display:flex;align-items:center;gap:3px;flex-wrap:wrap}.designer-commandbar .ribbon-project{display:flex;align-items:center;gap:5px;margin-left:auto}.designer-commandbar .ribbon-send{min-height:42px;margin-left:0;background:var(--dratek-orange)}
        .editor-shell{grid-template-columns:240px minmax(0,1fr) 330px;grid-template-areas:"tools canvas inspector" "layers canvas inspector";gap:14px}.designer-tools-panel,.properties-panel,.layers-panel,.workspace-card{border-radius:14px}.designer-panel-heading{display:flex;align-items:center;gap:9px;margin-bottom:11px}.designer-panel-heading.compact{margin-top:2px}.designer-panel-heading>span{width:33px;height:33px;display:grid;place-items:center;flex:0 0 auto;border-radius:9px;background:rgba(0,153,153,.1);color:var(--dratek-teal-dark)}.designer-panel-heading h2{color:var(--primary-text-color);font-size:13px;letter-spacing:0;text-transform:none}.designer-panel-heading small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:9px}.tool-grid{grid-template-columns:1fr 1fr;gap:7px}.tool-icon{min-height:64px;grid-template-columns:30px minmax(0,1fr);grid-template-rows:1fr;justify-items:start;text-align:left;padding:8px}.tool-icon .ico{justify-self:center}.tool-icon .txt{overflow:hidden;text-overflow:ellipsis;text-transform:none;white-space:nowrap}.action-grid{gap:6px}.canvas-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.canvas-title{display:flex;align-items:center;gap:9px}.canvas-title>span{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:rgba(0,153,153,.11);color:var(--dratek-teal-dark)}.canvas-title strong,.canvas-title small{display:block}.canvas-title strong{font-size:13px}.canvas-title small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.canvas-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.canvas-meta span{display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid var(--divider-color);border-radius:999px;background:var(--card-background-color);font-size:9px;font-weight:750}.workspace{display:flex;align-items:center;justify-content:center;min-height:570px}.properties-panel{border-top:3px solid var(--dratek-orange)}
        .designer-device-settings{width:min(760px,calc(100vw - 52px))}.designer-menu-section p{margin:4px 0 10px;color:var(--secondary-text-color);font-size:11px}.designer-advanced-device{margin-top:13px;padding-top:12px;border-top:1px solid var(--divider-color)}.designer-advanced-device summary{display:flex;align-items:center;gap:9px;padding:7px 2px;color:var(--primary-text-color);cursor:pointer;list-style:none}.designer-advanced-device summary::-webkit-details-marker{display:none}.designer-advanced-device summary>ha-icon:first-child{color:var(--dratek-orange)}.designer-advanced-device summary>ha-icon:last-child{margin-left:auto}.designer-advanced-device summary strong,.designer-advanced-device summary small{display:block}.designer-advanced-device summary small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.rgb-led-compact{margin-top:8px;padding:10px;border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color);box-shadow:none}.rgb-led-compact .rgb-led-controls{grid-template-columns:repeat(2,minmax(0,1fr))}.rgb-led-compact .rgb-led-apply{justify-self:start}.rgb-led-compact .rgb-led-title small{display:none}
        @media(max-width:1350px){.designer-device-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.designer-device-primary{grid-column:span 2}.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route{border-bottom:1px solid var(--divider-color)}.designer-route{border-right:0}.designer-orientation{grid-column:span 2}.editor-shell{grid-template-columns:220px minmax(0,1fr) 300px}}
        @media(max-width:1050px){.editor-shell{grid-template-columns:220px minmax(0,1fr);grid-template-areas:"tools canvas" "layers canvas" "inspector inspector"}.editor-shell>.left,.editor-shell>.properties-panel{position:static}.properties-panel{max-height:none}.workspace{min-height:430px}.designer-commandbar{flex-wrap:wrap}.designer-commandbar .ribbon-project{margin-left:0}.designer-commandbar .ribbon-send{margin-left:auto}}
        @media(max-width:760px){.designer-device-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.designer-device-primary{grid-column:1/-1}.designer-device-fact,.designer-device-meter,.designer-route{border-bottom:1px solid var(--divider-color)}.designer-route{grid-column:1/-1}.designer-orientation{grid-column:1/-1}.designer-command-group{width:100%}.designer-commandbar .ribbon-project{max-width:45%}.editor-shell{grid-template-columns:1fr;grid-template-areas:"canvas" "tools" "inspector" "layers"}.workspace{min-height:330px;padding:18px}.rgb-led-compact .rgb-led-controls{grid-template-columns:1fr}}
        .designer-section{gap:10px}.designer-section .card{box-shadow:0 6px 18px rgba(15,23,42,.055)}.designer-device-strip{gap:8px;padding:0;background:transparent;border:0;box-shadow:none!important;overflow:visible}.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route,.designer-orientation{min-height:68px;padding:10px 12px;border:1px solid var(--divider-color);border-radius:12px;background:var(--card-background-color)}.designer-device-primary{background:var(--card-background-color);border-left:4px solid var(--dratek-teal)}.designer-device-mark{width:36px;height:36px;border-radius:9px;background:rgba(0,153,153,.11);color:var(--dratek-teal-dark)}.designer-device-primary small,.designer-device-fact small,.designer-device-meter>small,.designer-orientation>small{letter-spacing:.025em}.designer-orientation{background:var(--card-background-color);border-color:rgba(255,102,0,.35)}.designer-orientation button{border:0;background:var(--secondary-background-color)}.designer-orientation button.active{background:var(--dratek-orange);box-shadow:0 2px 7px rgba(255,102,0,.22)}
        .designer-commandbar{min-height:54px;border:1px solid var(--divider-color);box-shadow:0 6px 18px rgba(15,23,42,.055)}.designer-commandbar .ribbon-tab{min-height:36px;padding:7px 10px;background:transparent;border:1px solid transparent;color:var(--secondary-text-color);font-size:11px}.designer-commandbar .ribbon-tab:hover:not(:disabled){transform:none;background:var(--secondary-background-color);color:var(--primary-text-color)}.designer-commandbar .ribbon-tab.active{background:rgba(0,153,153,.1);border-color:rgba(0,153,153,.24);color:var(--dratek-teal-dark)}.designer-commandbar .ribbon-project{padding:6px 9px;border-radius:8px;background:var(--secondary-background-color);color:var(--secondary-text-color)}.designer-commandbar .ribbon-send{min-height:38px;border-radius:9px;padding:8px 14px;box-shadow:0 3px 9px rgba(255,102,0,.22)}
        .designer-tools-panel,.layers-panel,.properties-panel{padding:12px;border-color:var(--divider-color);box-shadow:0 5px 16px rgba(15,23,42,.05)!important}.designer-panel-heading{margin-bottom:9px}.designer-panel-heading>span{width:31px;height:31px;border-radius:8px}.designer-panel-heading h2{font-size:12px}.tool-grid{grid-template-columns:1fr;gap:5px}.tool-icon{min-height:43px;display:grid;grid-template-columns:30px minmax(0,1fr);grid-template-rows:1fr;gap:8px;padding:5px 8px;border-radius:8px;background:transparent}.tool-icon .ico{width:29px;height:29px;border-radius:7px;background:var(--secondary-background-color);color:var(--dratek-teal-dark)}.tool-icon .txt{color:var(--primary-text-color);font-size:11px;font-weight:720}.tool-icon:hover:not(:disabled){transform:none;border-color:rgba(0,153,153,.28);background:rgba(0,153,153,.055)}.panel-divider{margin:10px 0}.action-grid{grid-template-columns:repeat(5,1fr);gap:5px}.action-grid .icon-btn{min-height:35px;border-radius:7px}.wide-action{grid-column:1/-1;min-height:35px}.layers-panel{margin-top:-4px}.layer-list{gap:4px}.layer-row{border:0;border-radius:8px;background:var(--secondary-background-color)}.layer-row.selected{background:rgba(0,153,153,.09);box-shadow:inset 3px 0 0 var(--dratek-teal)}.layer-main{min-height:34px}.layer-step{background:var(--card-background-color)}
        .workspace-card{border:1px solid var(--divider-color);border-radius:13px;box-shadow:0 7px 22px rgba(15,23,42,.065)!important}.canvas-head{min-height:54px;padding:9px 12px;background:var(--card-background-color);border-bottom:1px solid var(--divider-color)}.canvas-title>span{width:32px;height:32px;border-radius:8px}.canvas-meta span{background:var(--secondary-background-color);border:0}.workspace{min-height:570px;padding:30px;background:var(--secondary-background-color)}.designer-device-bezel{border-color:#ece9e9;box-shadow:0 12px 30px rgba(15,23,42,.15),inset 0 0 0 1px rgba(0,0,0,.04)}
        .properties-panel{border-top:1px solid var(--divider-color);max-height:calc(100vh - 110px)}.inspector-title{top:-12px;margin:-12px -12px 10px;padding:10px 12px;background:var(--card-background-color)}.inspector-object-icon{width:31px;height:31px;border-radius:8px}.inspector-section{margin-bottom:7px;padding:10px;border:0;border-radius:9px;background:var(--secondary-background-color)}.inspector-section-title{margin-bottom:8px;font-size:11px;letter-spacing:.025em;text-transform:none}.inspector-empty{border:0;border-radius:9px;background:var(--secondary-background-color)}.field input,.field select,.field textarea{border-radius:8px}.color-option{border-radius:8px;background:var(--card-background-color)}.segment-control{border:0;background:var(--card-background-color)}.toggle-card{border:0;background:var(--card-background-color)}
        .ribbon-menu{border-radius:12px;border-color:var(--divider-color);box-shadow:0 16px 36px rgba(15,23,42,.16)}.background-picker button{border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color)}.background-picker button.selected{outline-color:var(--dratek-teal)}
        @media(max-width:1350px){.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route{border:1px solid var(--divider-color)}.designer-orientation{border:1px solid rgba(255,102,0,.35)}}
        @media(max-width:760px){.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route{border:1px solid var(--divider-color)}.designer-commandbar .ribbon-tab{flex:1}.designer-commandbar .ribbon-project{max-width:none}.tool-grid{grid-template-columns:1fr 1fr}.workspace{padding:14px}.properties-panel{max-height:none}}
        .designer-device-strip{display:grid;grid-template-columns:minmax(190px,1.35fr) minmax(135px,.9fr) auto auto auto minmax(140px,1fr) minmax(145px,.8fr) minmax(190px,auto);gap:0;padding:8px;background:var(--card-background-color);border:1px solid var(--divider-color);box-shadow:0 6px 18px rgba(15,23,42,.055)!important;overflow:hidden}.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route,.designer-orientation{min-height:58px;padding:7px 11px;border:0;border-right:1px solid var(--divider-color);border-radius:0;background:transparent}.designer-device-primary{border-left:0}.designer-device-mark{width:34px;height:34px}.designer-refresh select{min-width:125px;padding:6px;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:10px;font-weight:750}.designer-orientation{padding:6px 8px;border-right:0}.designer-orientation>div{gap:3px}.designer-orientation button{display:grid;grid-template-columns:auto 1fr;min-height:37px;padding:5px 7px;text-align:left}.designer-orientation button ha-icon{--mdc-icon-size:21px}.designer-orientation button span{font-size:9px}.designer-orientation button.active{background:var(--dratek-orange);color:#fff}
        .editor-shell{grid-template-columns:184px minmax(0,1fr) 292px}.tool-grid{grid-template-columns:repeat(4,1fr);gap:5px}.tool-icon{position:relative;display:grid;grid-template-columns:1fr;place-items:center;min-width:0;min-height:42px;padding:5px}.tool-icon .ico{width:30px;height:30px}.tool-icon .txt{display:none}.designer-tools-panel{padding:10px}.designer-tools-panel .designer-panel-heading{margin-bottom:7px}.designer-tools-panel .action-grid{grid-template-columns:repeat(4,1fr)}.designer-tools-panel .wide-action{grid-column:1/-1}.designer-tools-panel .action-grid .icon-btn{min-width:0;padding:5px}.properties-panel{font-size:11px}.properties-panel .inspector-section{padding:8px}.properties-panel .field{margin-bottom:7px}.properties-panel .inspector-section-title{margin-bottom:6px}.properties-panel input,.properties-panel select,.properties-panel textarea{padding:7px}.properties-panel .color-option{min-height:43px}.properties-panel .toggle-card{padding:6px}.properties-panel .inspector-help{margin-top:5px;font-size:9px}.layers-panel{padding:10px}
        .tool-folder-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:9px}.tool-folder-tabs button{min-width:0;min-height:48px;display:grid;grid-template-columns:20px minmax(0,1fr);align-items:center;gap:4px;padding:6px;border:1px solid var(--divider-color);border-radius:9px;background:var(--secondary-background-color);color:var(--secondary-text-color);box-shadow:none}.tool-folder-tabs button ha-icon{--mdc-icon-size:19px}.tool-folder-tabs button span{overflow:hidden;font-size:9px;font-weight:800;text-overflow:ellipsis}.tool-folder-tabs button.active{border-color:var(--dratek-teal);background:rgba(0,153,153,.1);color:var(--dratek-teal-dark);box-shadow:inset 0 0 0 1px var(--dratek-teal)}.tool-folder-content{min-height:168px;padding:8px;border-radius:10px;background:var(--secondary-background-color)}.tool-folder-head{margin-bottom:7px}.tool-folder-head strong,.tool-folder-head small{display:block}.tool-folder-head strong{font-size:11px}.tool-folder-head small{margin-top:2px;color:var(--secondary-text-color);font-size:8px}.tool-folder-content .tool-grid{grid-template-columns:1fr 1fr;gap:5px}.tool-folder-content .tool-icon{min-height:54px;grid-template-columns:1fr;grid-template-rows:27px auto;gap:2px;padding:4px;background:var(--card-background-color)}.tool-folder-content .tool-icon .ico{width:27px;height:27px}.tool-folder-content .tool-icon .txt{display:block;width:100%;overflow:hidden;color:var(--secondary-text-color);font-size:8px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.tool-folder-help{display:flex;align-items:flex-start;gap:5px;margin:8px 1px 0;color:var(--secondary-text-color);font-size:8px;line-height:1.35}.tool-folder-help ha-icon{--mdc-icon-size:15px;color:var(--dratek-teal);flex:0 0 auto}.tool-folder-content .designer-custom-empty{margin-top:7px}
        details.inspector-section{display:block;padding:0;overflow:hidden}.inspector-section>summary{list-style:none;cursor:pointer;margin:0;padding:9px 10px;user-select:none}.inspector-section>summary::-webkit-details-marker{display:none}.inspector-section>summary .inspector-chevron{margin-left:auto;transition:transform .16s ease}.inspector-section[open]>summary .inspector-chevron{transform:rotate(180deg)}.inspector-section[open]>summary{margin-bottom:0;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.inspector-section-body{padding:9px 10px}.inspector-section:not([open]) .inspector-section-title{margin-bottom:0}.properties-panel .inspector-section{padding:0}.properties-panel .inspector-section-title{margin-bottom:0}
        .designer-device-bezel{position:relative;display:block;flex:0 0 auto;width:var(--designer-frame-width);max-width:none;aspect-ratio:var(--designer-frame-ratio);padding:0;border:8px solid #eee8e8;border-radius:18px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.15),inset 0 0 0 1px rgba(0,0,0,.04)}.designer-device-screen{position:absolute;inset:10% 12%;width:auto;height:auto}.designer-device-screen canvas{display:block;width:100%;height:100%}.designer-device-screen #editorSelection{position:absolute;z-index:3;inset:0;background:transparent;pointer-events:none}.designer-device-code{left:3.1%;font-size:clamp(8px,calc(var(--designer-frame-width) / 42),22px);transform:translateY(-50%) rotate(180deg)}.designer-device-pe29 .designer-device-identification{right:2.1%;top:10%;bottom:10%;width:8.4%;gap:3px}.designer-device-pe29 .designer-device-identification .designer-device-code{font-size:clamp(8px,calc(var(--designer-frame-width) / 52),18px)}.designer-device-portrait .designer-device-identification{left:10%;right:10%;top:auto;bottom:2.1%;width:auto;height:8.4%;display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:4px}.designer-device-portrait .designer-device-identification .designer-device-code{font-size:clamp(8px,calc(var(--designer-frame-width) / 23),16px);writing-mode:horizontal-tb;transform:none}.designer-device-portrait>.designer-device-code{left:50%;top:auto;bottom:3.1%;writing-mode:horizontal-tb;transform:translateX(-50%)}.designer-device-identification .device-preview-barcode.horizontal{width:100%;height:100%}
        .device-preview-pe29.device-preview-portrait .device-preview-identification{left:10%;right:10%;top:auto;bottom:2.1%;width:auto;height:8.4%;display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:2px}.device-preview-pe29.device-preview-portrait .device-preview-identification .device-preview-code{font-size:clamp(5px,1vw,9px);writing-mode:horizontal-tb;transform:none}.device-preview-portrait>.device-preview-code{left:50%;top:auto;bottom:3.1%;writing-mode:horizontal-tb;transform:translateX(-50%)}.device-preview-identification .device-preview-barcode.horizontal{width:100%;height:100%}
        .designer-device-portrait .designer-device-screen{inset:12% 10%}.device-preview-portrait .device-preview-screen{inset:12% 10%}
        @media(max-width:1350px){.designer-device-strip{grid-template-columns:repeat(4,minmax(0,1fr));gap:0}.designer-device-primary{grid-column:span 2}.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route{border:0;border-right:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color)}.designer-route{border-right:0}.designer-orientation{grid-column:span 2;border:0}.editor-shell{grid-template-columns:174px minmax(0,1fr) 280px}}
        @media(max-width:1050px){.editor-shell{grid-template-columns:174px minmax(0,1fr)}.properties-panel{font-size:12px}}
        @media(max-width:760px){.designer-device-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.designer-device-primary{grid-column:1/-1}.designer-device-primary,.designer-device-fact,.designer-device-meter,.designer-route{border:0;border-bottom:1px solid var(--divider-color)}.designer-device-fact:nth-of-type(even),.designer-device-meter:nth-of-type(even){border-left:1px solid var(--divider-color)}.designer-route,.designer-orientation{grid-column:1/-1}.tool-grid{grid-template-columns:repeat(4,1fr)}}
        .json-field-picker{margin:10px 0 14px;padding:12px;border:1px solid rgba(0,153,153,.35);border-radius:11px;background:rgba(0,153,153,.055)}.json-field-title{display:flex;align-items:center;gap:9px;margin-bottom:10px;color:var(--dratek-teal-dark)}.json-field-title ha-icon{--mdc-icon-size:24px}.json-field-title strong,.json-field-title small{display:block}.json-field-title small{margin-top:2px;color:var(--secondary-text-color);font-size:9px;font-weight:550}.json-field-picker select{font-family:monospace;font-size:10px}
        .api-load-button{width:100%;min-height:54px;display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0 12px;background:var(--dratek-teal)}.api-load-button ha-icon{--mdc-icon-size:25px}.api-load-button span,.api-load-button strong,.api-load-button small{display:block;text-align:left}.api-load-button small{margin-top:2px;color:rgba(255,255,255,.78);font-size:9px}.api-mapper{display:grid;gap:12px;padding:13px;border:1px solid rgba(0,153,153,.3);border-radius:12px;background:linear-gradient(145deg,rgba(0,153,153,.07),rgba(255,102,0,.025))}.api-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.api-steps span{display:flex;align-items:center;gap:5px;min-width:0;padding:6px;border-radius:7px;background:var(--secondary-background-color);color:var(--secondary-text-color);font-size:8px;font-weight:750}.api-steps b{width:19px;height:19px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:var(--divider-color);font-size:9px}.api-steps .active{color:var(--dratek-orange)}.api-steps .active b{background:var(--dratek-orange);color:#fff}.api-steps .done{color:var(--dratek-teal-dark)}.api-steps .done b{background:var(--dratek-teal);color:#fff}.api-mapping-grid{display:grid;gap:9px}.api-mapping-grid .field{margin:0}.api-mapping-grid select{font-size:11px}.api-mapping-summary,.api-mapper-empty{display:flex;align-items:center;gap:10px;padding:10px;border-radius:9px;background:var(--card-background-color);border:1px solid var(--divider-color)}.api-mapping-summary ha-icon,.api-mapper-empty ha-icon{color:var(--dratek-teal);--mdc-icon-size:26px}.api-mapping-summary strong,.api-mapping-summary span,.api-mapper-empty strong,.api-mapper-empty span{display:block}.api-mapping-summary span,.api-mapper-empty span{margin-top:3px;color:var(--secondary-text-color);font-size:9px}.api-mapping-summary code{color:var(--dratek-teal-dark);font-size:9px}
        .custom-elements-page{display:grid;gap:12px}.custom-elements-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px;border-left:4px solid var(--dratek-teal);background:linear-gradient(110deg,rgba(0,153,153,.1),var(--card-background-color) 48%,rgba(255,102,0,.055))}.custom-elements-hero .eyebrow{display:block;margin-bottom:5px;color:var(--dratek-teal-dark);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.custom-elements-hero h2{color:var(--primary-text-color);font-size:21px;letter-spacing:0;text-transform:none}.custom-elements-hero p{max-width:820px;margin:7px 0 0;color:var(--secondary-text-color);font-size:12px;line-height:1.5}.custom-hero-icon{width:58px;height:58px;display:grid;place-items:center;flex:0 0 auto;border-radius:16px;background:var(--dratek-teal);color:#fff;box-shadow:0 9px 24px rgba(0,153,153,.22)}.custom-hero-icon ha-icon{--mdc-icon-size:32px}.custom-result{display:flex;align-items:center;gap:8px;padding:10px 13px;border-radius:10px;font-size:12px;font-weight:750}.custom-result.good{background:rgba(22,163,74,.1);color:#16803c}.custom-result.bad{background:rgba(220,38,38,.1);color:#c62828}.custom-elements-layout{display:grid;grid-template-columns:minmax(440px,1.08fr) minmax(390px,.92fr);gap:12px;align-items:start}.custom-builder,.custom-live-preview,.custom-library{border-radius:14px}.custom-type-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:13px}.custom-type{min-height:70px;display:grid;place-items:center;gap:4px;padding:9px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none}.custom-type ha-icon{--mdc-icon-size:25px;color:var(--dratek-teal)}.custom-type span{font-size:11px}.custom-type.selected{border-color:var(--dratek-teal);background:rgba(0,153,153,.09);box-shadow:inset 0 0 0 1px var(--dratek-teal)}.custom-fetch-field button{width:100%}.custom-builder textarea{width:100%;resize:vertical;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px}.custom-builder input[type=range]{width:100%;accent-color:var(--dratek-orange)}.custom-builder-actions{display:flex;justify-content:flex-end;margin-top:12px}.custom-builder-actions button{min-width:190px;background:var(--dratek-orange)}.custom-side{display:grid;gap:12px;position:sticky;top:12px}.custom-live-preview{min-height:190px}.custom-visual{position:relative;display:grid;place-items:center;min-height:120px;padding:16px;overflow:hidden;border:8px solid #eee8e8;border-radius:14px;background:#fff;color:#111;box-shadow:0 7px 18px rgba(15,23,42,.13);font-family:"DRATEK eInk Sans",Arial,sans-serif}.custom-visual.value{align-content:center}.custom-visual.value small{font-size:11px;font-weight:700}.custom-visual.value strong{font-size:29px}.custom-visual.value em{font-size:14px;font-style:normal}.custom-visual.status{grid-template-rows:1fr auto auto;gap:2px}.custom-visual.status strong{font-size:46px;line-height:1}.custom-visual.status.active strong{color:#d41414}.custom-visual.status span{font-size:13px;font-weight:800}.custom-visual.status small{font-size:9px;color:#666}.custom-visual.chart{align-content:stretch;justify-items:stretch}.custom-visual.chart>small{text-align:center;font-weight:800}.custom-visual.icon{aspect-ratio:1;min-height:0;width:min(210px,100%);margin:auto;padding:12px}.custom-visual.icon img{display:block;max-width:100%;max-height:100%;object-fit:contain}.custom-icon-empty{display:grid;place-items:center;gap:6px;color:var(--secondary-text-color)}.custom-icon-empty ha-icon{--mdc-icon-size:34px}.custom-icon-drop{width:100%;min-height:180px;display:grid;place-items:center;align-content:center;gap:6px;padding:16px;border:2px dashed rgba(0,153,153,.45);background:rgba(0,153,153,.045);color:var(--primary-text-color);box-shadow:none}.custom-icon-drop>ha-icon{--mdc-icon-size:38px;color:var(--dratek-teal)}.custom-icon-drop small{color:var(--secondary-text-color)}.custom-icon-drop.has-image{grid-template-columns:minmax(90px,150px) 1fr;border-style:solid}.custom-icon-drop.has-image img{width:140px;height:140px;object-fit:contain;border-radius:8px;background:#fff}.custom-icon-drop.has-image span{display:flex;align-items:center;gap:6px;justify-self:start}.custom-icon-drop.dragging{border-color:var(--dratek-orange);background:rgba(255,102,0,.1)}.custom-chart-bars{height:80px;display:flex;align-items:end;justify-content:stretch;gap:3px;padding:8px 6px 0;border-left:2px solid #111;border-bottom:2px solid #111}.custom-chart-bars i{display:block;flex:1;min-width:3px;background:#d41414}.custom-library-list{display:grid;gap:9px;max-height:620px;overflow:auto;padding-right:3px}.custom-library-item{display:grid;gap:9px;padding:11px;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color)}.custom-library-head{display:flex;align-items:center;gap:9px}.custom-library-head>span{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;background:rgba(0,153,153,.1);color:var(--dratek-teal-dark)}.custom-library-head strong,.custom-library-head small{display:block}.custom-library-head strong{font-size:13px}.custom-library-head small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.custom-library-item .custom-visual{min-height:86px;border-width:5px}.custom-library-item .custom-visual.value strong{font-size:22px}.custom-library-item .custom-visual.status strong{font-size:31px}.custom-library-item .custom-visual.icon{min-height:0;width:min(140px,100%)}.custom-library-item .custom-chart-bars{height:52px}.custom-library-actions{display:grid;grid-template-columns:1.2fr 1fr auto auto;gap:5px}.custom-library-actions button{min-height:34px;padding:6px 8px;font-size:9px}.custom-library-actions .icon-btn{width:34px}.tabbar .tab[data-tab=custom]{margin-left:6px;border-left:1px solid var(--divider-color)}
        .ha-entity-module,.ha-module-card,.condition-designer{display:grid;gap:11px;margin:12px 0;padding:13px;border:1px solid var(--divider-color);border-radius:12px;background:var(--secondary-background-color)}.ha-entity-module{border-color:rgba(0,153,153,.35);background:rgba(0,153,153,.055)}.ha-module-title,.condition-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.ha-module-title{justify-content:flex-start}.ha-module-title>ha-icon{width:36px;height:36px;padding:7px;border-radius:9px;background:var(--dratek-teal);color:#fff}.ha-module-title strong,.ha-module-title small,.condition-head strong,.condition-head small{display:block}.ha-module-title small,.condition-head small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.condition-templates{display:flex;flex-wrap:wrap;gap:6px}.condition-templates button{min-height:34px;font-size:9px}.condition-rules{display:grid;gap:7px}.condition-rule{position:relative;display:grid;grid-template-columns:28px minmax(130px,1.1fr) minmax(105px,.8fr) minmax(115px,.9fr) auto;align-items:end;gap:7px;padding:9px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color)}.condition-rule.matches{border-color:var(--dratek-teal);box-shadow:inset 3px 0 0 var(--dratek-teal)}.condition-rule .field{margin:0}.condition-order{width:24px;height:24px;display:grid;place-items:center;align-self:center;border-radius:7px;background:var(--secondary-background-color);font-size:10px;font-weight:900}.condition-unused{opacity:.45}.condition-remove{align-self:center}.condition-match{position:absolute;right:8px;top:-8px;display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:10px;background:var(--dratek-teal);color:#fff;font-size:8px;font-weight:800}.condition-match ha-icon{--mdc-icon-size:11px}.condition-footer{display:flex;align-items:end;justify-content:space-between;gap:12px}.condition-footer>.field{min-width:220px;margin:0}.ha-hint{display:flex;align-items:center;gap:7px;padding:8px;border-radius:8px;background:var(--card-background-color);color:var(--secondary-text-color);font-size:9px}.ha-hint ha-icon{color:var(--dratek-teal)}.ha-hint code{font-weight:800}.ha-elements-page .custom-builder{overflow:visible}
        .ha-wizard-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}.ha-wizard-progress span{display:flex;align-items:center;gap:6px;min-width:0;padding:7px 8px;border-radius:9px;background:var(--secondary-background-color);color:var(--secondary-text-color);font-size:9px;font-weight:800}.ha-wizard-progress b,.ux-step-title>b,.summary-step{width:23px;height:23px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:var(--divider-color);font-size:10px}.ha-wizard-progress .active{color:var(--dratek-orange-dark);box-shadow:inset 0 0 0 1px rgba(255,107,0,.35)}.ha-wizard-progress .active b{background:var(--dratek-orange);color:#fff}.ha-wizard-progress .done{color:var(--dratek-teal-dark)}.ha-wizard-progress .done b{background:var(--dratek-teal);color:#fff}.ux-step{display:grid;gap:10px;padding:13px;border:1px solid var(--divider-color);border-radius:12px}.ux-step-title{display:flex;align-items:center;gap:9px}.ux-step-title>b,.summary-step{background:var(--dratek-teal);color:#fff}.ux-step-title strong,.ux-step-title small{display:block}.ux-step-title small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.behavior-title{margin:15px 0 4px}.custom-advanced{border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color)}.custom-advanced>summary{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;color:var(--primary-text-color);font-size:10px;font-weight:850;user-select:none}.custom-advanced>summary::marker{color:var(--dratek-teal)}.custom-advanced[open]>summary{border-bottom:1px solid var(--divider-color)}.custom-advanced>.field,.custom-advanced>.row,.custom-advanced>.condition-rules,.custom-advanced>.condition-footer{margin:10px 12px 12px}.condition-details{margin-top:2px}.condition-details .condition-rules{margin-top:12px}.appearance-settings{margin-top:12px}.appearance-settings>summary{font-size:11px}.value-ready{margin:10px 0;padding:13px}.sticky-save{position:sticky;z-index:4;bottom:0;align-items:center;justify-content:space-between;gap:12px;margin:14px -16px -16px;padding:12px 16px;border-top:1px solid var(--divider-color);border-radius:0 0 14px 14px;background:color-mix(in srgb,var(--card-background-color) 94%,transparent);box-shadow:0 -8px 18px rgba(15,23,42,.07);backdrop-filter:blur(8px)}.sticky-save>span{min-width:0;overflow:hidden;color:var(--secondary-text-color);font-size:9px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}
        @media(max-width:1000px){.custom-elements-layout{grid-template-columns:1fr}.custom-side{position:static;grid-template-columns:1fr 1fr}.tabbar{width:100%;overflow-x:auto}.tabbar .tab{flex:0 0 auto}.condition-rule{grid-template-columns:28px 1fr 1fr}.condition-rule .field:nth-of-type(3){grid-column:2/4}.condition-remove{grid-column:1;grid-row:2}}
        @media(max-width:680px){.custom-elements-hero{padding:16px}.custom-hero-icon{display:none}.custom-elements-hero h2{font-size:17px}.custom-side{grid-template-columns:1fr}.custom-type-grid{grid-template-columns:repeat(2,1fr)}.custom-elements-layout .row{grid-template-columns:1fr}.custom-library-actions{grid-template-columns:1fr 1fr auto auto}.ha-wizard-progress span{justify-content:center;padding:7px 4px;font-size:0}.ha-wizard-progress b{font-size:10px}.sticky-save{align-items:stretch;flex-direction:column}.sticky-save button{width:100%}.condition-footer{align-items:stretch;flex-direction:column}.condition-footer>.field{min-width:0}.custom-icon-drop.has-image{grid-template-columns:1fr}.custom-icon-drop.has-image span{justify-self:center}}
        .designer-custom-list{display:grid;gap:6px;max-height:230px;overflow:auto;padding-right:2px}.designer-custom-item,.designer-custom-empty{width:100%;min-width:0;display:grid;grid-template-columns:54px minmax(0,1fr) auto;align-items:center;gap:7px;padding:6px;border:1px solid var(--divider-color);border-radius:9px;background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none;text-align:left}.designer-custom-item canvas{width:54px;height:30px;border:1px solid var(--divider-color);border-radius:4px;background:#fff}.designer-custom-item span,.designer-custom-item strong,.designer-custom-item small,.designer-custom-empty span,.designer-custom-empty strong,.designer-custom-empty small{display:block;min-width:0}.designer-custom-item strong,.designer-custom-empty strong{overflow:hidden;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.designer-custom-item small,.designer-custom-empty small{margin-top:2px;color:var(--secondary-text-color);font-size:8px}.designer-custom-item>ha-icon{color:var(--dratek-teal)}.designer-custom-empty{grid-template-columns:auto 1fr}.designer-custom-item:hover{border-color:var(--dratek-teal);background:rgba(0,162,165,.06)}
        .editor-shell{grid-template-areas:"tools canvas inspector"}.designer-tools-panel{max-height:calc(100vh - 24px);overflow:auto}.designer-side-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:11px;padding:4px;border-radius:10px;background:var(--secondary-background-color)}.designer-side-tabs button{position:relative;min-width:0;min-height:39px;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px;border:0;border-radius:7px;background:transparent;color:var(--secondary-text-color);box-shadow:none;font-size:10px;font-weight:850}.designer-side-tabs button ha-icon{--mdc-icon-size:18px}.designer-side-tabs button b{min-width:17px;padding:1px 4px;border-radius:999px;background:var(--divider-color);font-size:8px}.designer-side-tabs button.active{background:var(--card-background-color);color:var(--dratek-teal-dark);box-shadow:0 2px 6px rgba(15,23,42,.09)}.designer-side-tabs button.active b{background:var(--dratek-orange);color:#fff}.designer-layers-content .designer-panel-heading{margin-bottom:8px}.designer-layers-content .layer-list{max-height:calc(100vh - 225px);overflow:auto;padding-right:2px}.designer-layers-content .layer-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;padding:6px;border:1px solid transparent;border-radius:9px}.designer-layers-content .layer-main{width:100%;min-height:34px;padding:6px 7px;border-radius:7px;background:transparent}.designer-layers-content .layer-row-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.designer-layers-content .layer-row-actions button{min-width:0;min-height:29px;padding:4px;border:0;border-radius:6px;background:var(--card-background-color);color:var(--secondary-text-color);box-shadow:none}.designer-layers-content .layer-row-actions button ha-icon{--mdc-icon-size:17px}.designer-layers-content .layer-row-actions button.active{background:rgba(0,153,153,.12);color:var(--dratek-teal-dark)}.designer-layers-content .layer-row.selected{border-color:rgba(0,153,153,.35);background:rgba(0,153,153,.08);box-shadow:inset 3px 0 0 var(--dratek-teal)}.designer-layers-content .layer-hint{padding:8px;border-radius:8px;background:var(--secondary-background-color);font-size:9px}
        .display-health{grid-template-columns:minmax(70px,.72fr) minmax(70px,.72fr) minmax(120px,1.56fr);align-items:stretch;gap:7px}.display-health-route{grid-column:auto;grid-template-columns:auto minmax(0,1fr);align-items:center;padding-inline:9px}.display-health-route>ha-icon{grid-column:1;grid-row:1/3}.display-health-route>span{grid-column:2;grid-row:1/3}.display-battery-item,.display-signal-item{grid-template-rows:auto 24px auto;padding-inline:6px}.display-grid.density-large .display-health,.display-grid.density-compact .display-health,.display-grid.density-list .display-health{grid-template-columns:minmax(62px,.68fr) minmax(62px,.68fr) minmax(105px,1.64fr)}.display-grid.density-compact .display-health-route{grid-column:auto}.display-health-item strong{font-size:10px}.display-health-route strong{font-size:10px}.display-health-route small{display:block!important}.display-grid.density-list .display-health{min-width:270px}
        .connection-map{gap:12px}.connection-group,.connection-group.is-gateway,.connection-group.is-local,.connection-group.is-unavailable{grid-template-columns:minmax(210px,260px) 38px minmax(0,1fr);align-items:center;padding:13px 15px;border-left:1px solid var(--divider-color);background:var(--secondary-background-color)}.connection-bus{position:relative;display:block;width:100%;height:100%;min-height:2px}.connection-bus:before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;border-radius:0;background:var(--dratek-teal);transform:translateY(-50%)}.connection-bus span{display:none}.connection-devices{position:relative;display:grid;gap:8px;padding-left:26px}.connection-devices:before{content:"";position:absolute;left:0;top:29px;bottom:29px;width:2px;border-radius:0;background:var(--dratek-teal)}.connection-device:before{content:"";position:absolute;left:-26px;top:50%;width:26px;height:2px;background:var(--dratek-teal);transform:translateY(-50%)}.connection-device:after{display:none}.connection-device:hover{transform:none}.connection-device-signal{min-width:62px}
        @media(max-width:1050px){.editor-shell{grid-template-areas:"tools canvas" "inspector inspector"}.designer-tools-panel{max-height:none;overflow:visible}.designer-layers-content .layer-list{max-height:420px}}
        @media(max-width:760px){.editor-shell{grid-template-areas:"canvas" "tools" "inspector"}.display-health,.display-grid.density-large .display-health,.display-grid.density-compact .display-health,.display-grid.density-list .display-health{grid-template-columns:minmax(58px,.65fr) minmax(58px,.65fr) minmax(90px,1.7fr)}.display-health-route{grid-column:auto}.connection-group,.connection-group.is-gateway,.connection-group.is-local,.connection-group.is-unavailable{grid-template-columns:1fr;padding:12px}.connection-bus{width:2px;height:22px;justify-self:start;margin-left:20px}.connection-bus:before{inset:0;width:2px;height:auto;transform:none}.connection-devices{padding-left:40px}.connection-devices:before{left:20px;top:0}.connection-device:before{left:-20px;width:20px}}
        @media(max-width:390px){.display-health,.display-grid.density-large .display-health,.display-grid.density-compact .display-health,.display-grid.density-list .display-health{grid-template-columns:56px 56px minmax(0,1fr);gap:4px}.display-health-item{padding:6px 3px}.display-health-route{padding-inline:5px}.display-health-route>ha-icon{display:none}.display-health-route>span{grid-column:1/-1}.display-health-route strong{font-size:9px}}
        .designer-device-screen,.designer-device-portrait .designer-device-screen{box-sizing:content-box;inset:auto;left:50%;top:50%;width:var(--designer-screen-width);height:var(--designer-screen-height);transform:translate(-50%,-50%)}.designer-device-screen canvas,.device-preview-screen canvas,.ha-elements-page canvas{image-rendering:pixelated}
        .display-tile.is-stale{border-style:dashed}.display-online-dot.stale{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.16)}.display-health-route.stale ha-icon{color:#f59e0b}
      </style>
      <div class="page">
        <div class="topbar">
          <div class="brand"><img class="extension-logo" src="/dratek_eink_panel/dratek-eink-logo.png?v=${DRATEK_EINK_VERSION}" alt="DRATEK.CZ eInk"><div><h1>DRATEK eInk <span class="version-badge">v${DRATEK_EINK_VERSION}</span></h1><div class="subtitle">Editor sablon, BLE diagnostika a sprava displeju</div></div></div>
        </div>
        <div class="tabbar"><button class="tab ${this._activeTab === "devices" ? "active" : ""}" data-tab="devices"><ha-icon icon="mdi:devices"></ha-icon>Nalezené displeje</button><button class="tab ${this._activeTab === "designer" ? "active" : ""}" data-tab="designer" ${device ? "" : "disabled"} title="${device ? "Otevřít designer" : "Nejprve vyberte displej"}"><ha-icon icon="mdi:vector-square-edit"></ha-icon>Designer</button><button class="tab ${this._activeTab === "queue" ? "active" : ""}" data-tab="queue"><ha-icon icon="mdi:tray-full"></ha-icon>Fronta zápisu${this._queue.queued || this._queue.writing ? `<span class="pill warn">${this._queue.queued + this._queue.writing}</span>` : ""}</button><button class="tab ${this._activeTab === "gateways" ? "active" : ""}" data-tab="gateways"><ha-icon icon="mdi:router-wireless"></ha-icon>Gatewaye</button><button class="tab ${this._activeTab === "custom" ? "active" : ""}" data-tab="custom"><ha-icon icon="mdi:puzzle-plus-outline"></ha-icon>Designer HA prvků</button></div>
        <div style="${this._activeTab === "devices" ? "" : "display:none"}">
          <div class="card"><div class="toolbar" style="margin-bottom:12px"><button id="scanDevicesTab" class="secondary" ${this._loading ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this._loading ? "Hledám displeje..." : "Obnovit"}</button>${this._renderDensityControl("devices", this._deviceViewMode, result.devices.length)}</div>${this._renderDeviceCards(result.devices, device && device.address)}</div>
          <div class="card connection-map-card"><div class="section-title"><div><h2>Mapa připojení</h2><small>Každá gateway je zobrazena pouze jednou se všemi připojenými displeji.</small></div><span class="pill muted">${topologyGatewayCount} ${topologyGatewayCount === 1 ? "gateway" : "gatewayů"} · ${result.devices.length} ${result.devices.length === 1 ? "displej" : "displejů"}</span></div>${this._renderTopology(result.devices, topologyGroups)}</div>
        </div>
        <div class="designer-section ${device ? "" : "locked"}" style="${this._activeTab === "designer" ? "" : "display:none"}">
        ${device ? "" : `<div class="designer-lock"><ha-icon icon="mdi:monitor-lock"></ha-icon><h2>Nejprve vyberte displej</h2><p>Pracovní plocha se nastaví podle jeho rozlišení a uloženého návrhu.</p><button data-tab="devices"><ha-icon icon="mdi:devices"></ha-icon>Vybrat displej</button></div>`}
        <div class="card designer-device-strip">
          <div class="designer-device-primary"><span class="designer-device-mark"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></span><div><small>Aktivní displej</small><strong>${this._escape(this._deviceTitle(device))}</strong><span>${this._escape(device?.model || "DRATEK eInk")}</span></div></div>
          <div class="designer-device-fact"><small>Adresa</small><strong>${device ? this._escape(device.address) : "-"}</strong></div>
          <div class="designer-device-fact"><small>Velikost</small><strong>${size.width} × ${size.height} px</strong></div>
          <div class="designer-device-meter"><small>Baterie</small><div>${this._renderBatterySegments(designerBattery.percent)}<strong>${Number.isFinite(designerBattery.percent) ? `${designerBattery.percent} %` : "-"}</strong></div></div>
          <div class="designer-device-meter"><small>Signál</small><div>${this._renderSignalBars(designerRssi)}<strong class="signal-value ${this._signalClass(designerRssi)}">${Number.isFinite(designerRssi) ? `${designerRssi} dBm` : "-"}</strong></div></div>
          <div class="designer-device-fact designer-route"><small>Připojení</small><strong><ha-icon icon="${designerPath?.type === "gateway" ? "mdi:router-wireless" : "mdi:bluetooth-connect"}"></ha-icon>${this._escape(designerPath?.name || "Nedostupné")}</strong></div>
          <div class="designer-device-fact designer-refresh"><small>Auto aktualizace</small><select id="refreshInterval" title="Nejkratší interval mezi automatickými zápisy tohoto displeje"><option value="10" ${this._refreshIntervalSeconds === 10 ? "selected" : ""}>nejdříve za 10 s</option><option value="15" ${this._refreshIntervalSeconds === 15 ? "selected" : ""}>nejdříve za 15 s</option><option value="30" ${this._refreshIntervalSeconds === 30 ? "selected" : ""}>nejdříve za 30 s</option><option value="60" ${this._refreshIntervalSeconds === 60 ? "selected" : ""}>nejdříve za 1 min</option><option value="120" ${this._refreshIntervalSeconds === 120 ? "selected" : ""}>nejdříve za 2 min</option><option value="300" ${this._refreshIntervalSeconds === 300 ? "selected" : ""}>nejdříve za 5 min</option><option value="900" ${this._refreshIntervalSeconds === 900 ? "selected" : ""}>nejdříve za 15 min</option><option value="1800" ${this._refreshIntervalSeconds === 1800 ? "selected" : ""}>nejdříve za 30 min</option><option value="3600" ${this._refreshIntervalSeconds === 3600 ? "selected" : ""}>nejdříve za 1 hod</option><option value="21600" ${this._refreshIntervalSeconds === 21600 ? "selected" : ""}>nejdříve za 6 hod</option><option value="43200" ${this._refreshIntervalSeconds === 43200 ? "selected" : ""}>nejdříve za 12 hod</option><option value="86400" ${this._refreshIntervalSeconds === 86400 ? "selected" : ""}>nejdříve za 24 hod</option></select></div>
          <div class="designer-orientation"><small>Orientace displeje</small><div><button class="${this._orientation === "landscape" ? "active" : ""}" data-orientation="landscape" title="Otočit displej na šířku"><ha-icon icon="mdi:monitor"></ha-icon><span>Na šířku</span></button><button class="${this._orientation === "portrait" ? "active" : ""}" data-orientation="portrait" title="Otočit displej na výšku"><ha-icon icon="mdi:monitor-vertical"></ha-icon><span>Na výšku</span></button></div></div>
        </div>
        <div class="card ribbon designer-commandbar"><div class="designer-command-group"><button id="fileMenuToggle" class="ribbon-tab menu-tab ${this._fileMenuOpen ? "active" : ""}"><ha-icon icon="mdi:file-outline"></ha-icon>Soubor</button><button id="variablesDialogOpen" class="ribbon-tab menu-tab"><ha-icon icon="mdi:variable"></ha-icon>Proměnné</button><button id="layoutMenuToggle" class="ribbon-tab menu-tab ${this._layoutMenuOpen ? "active" : ""}"><ha-icon icon="mdi:axis-arrow"></ha-icon>Mapování</button><button id="toolsMenuToggle" class="ribbon-tab menu-tab ${this._toolsMenuOpen ? "active" : ""}"><ha-icon icon="mdi:palette-outline"></ha-icon>Pozadí a zařízení</button><button id="viewMenuToggle" class="ribbon-tab menu-tab ${this._viewMenuOpen ? "active" : ""}"><ha-icon icon="mdi:magnify"></ha-icon>Zobrazení</button></div><span class="ribbon-project"><ha-icon icon="mdi:file-document-edit-outline"></ha-icon>${this._escape(this._projectName)}</span><button id="sendDesign" class="ribbon-send" ${!device || this._sending ? "disabled" : ""}><ha-icon icon="mdi:upload"></ha-icon>${this._sending ? "Odesílám..." : "Odeslat do displeje"}</button>${this._renderFileMenu()}${this._renderViewMenu()}${this._renderToolsMenu(device)}${this._renderLayoutMenu(device)}</div>
        ${this._renderSendResult()}
        <div class="editor-shell">
          ${this._renderToolSidebar()}
          <div class="card workspace-card"><div class="canvas-head"><div class="canvas-title"><span><ha-icon icon="mdi:monitor-edit"></ha-icon></span><div><strong>Pracovní plocha</strong><small>${size.width} × ${size.height} px · ${this._orientation === "portrait" ? "na výšku" : "na šířku"}</small></div></div><div class="canvas-meta"><span><ha-icon icon="mdi:magnify"></ha-icon>${Math.round(this._zoom * 100)} %</span><span><ha-icon icon="mdi:palette-swatch-outline"></ha-icon>eInk barvy</span></div></div><div class="workspace"><div class="designer-device-bezel ${this._isPe29Device(device) ? "designer-device-pe29" : ""} designer-device-${this._orientation}" style="--designer-frame-ratio:${designerFrameRatio.toFixed(4)};--designer-frame-width:${designerFrameWidth}px;--designer-screen-width:${designerScreenWidth}px;--designer-screen-height:${designerScreenHeight}px">${this._isPe29Device(device) ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(device?.physical_code || "00.00.00.00")}</span>${this._renderDeviceBarcode(device?.physical_code || "00.00.00.00", this._orientation === "portrait")}</span>` : `<span class="designer-device-code">${this._escape(device?.physical_code || "00.00.00.00")}</span>`}<div class="designer-device-screen"><canvas id="editor" width="${size.width}" height="${size.height}"></canvas><canvas id="editorSelection" width="${size.width}" height="${size.height}" aria-hidden="true"></canvas></div></div></div></div>
          <div class="card right properties-panel"><div class="section-title inspector-title"><div class="inspector-title-main"><span class="inspector-object-icon"><ha-icon icon="${object ? this._objectIcon(object) : "mdi:tune-variant"}"></ha-icon></span><div><h2>Inspector</h2><small>${object ? this._escape(this._objectLabel(object, this._objects.indexOf(object))) : "Vlastnosti objektu"}</small></div></div><span class="pill muted">${object ? this._escape(object.type) : "bez výběru"}</span></div>${this._renderProperties(object)}</div>
        </div>
        </div>
        <div style="${this._activeTab === "queue" ? "" : "display:none"}">${this._renderQueue()}</div>
        <div style="${this._activeTab === "gateways" ? "" : "display:none"}">
          <div class="status-grid">
            <div class="card status-tile"><div><div class="metric">DRATEK eInk gatewaye</div><div class="value">${this._gateways.length}</div></div><div class="status-icon"><ha-icon icon="mdi:router-wireless"></ha-icon></div></div>
            <div class="card status-tile"><div><div class="metric">Online</div><div class="value">${this._gateways.filter((gateway) => gateway.status && gateway.status.ok).length}</div></div><div class="status-icon"><ha-icon icon="mdi:lan-connect"></ha-icon></div></div>
            <div class="card status-tile"><div><div class="metric">Firmware</div><span class="pill muted">vlastni DRATEK gateway API</span></div><div class="status-icon"><ha-icon icon="mdi:chip"></ha-icon></div></div>
          </div>
          ${this._renderGatewayWorkspace()}
        </div>
        <div style="${this._activeTab === "custom" ? "" : "display:none"}">${this._renderCustomElementsWorkspace()}</div>
      </div>
      ${this._renderSymbolDialog()}${this._renderVariablesDialog()}${this._renderTemplateDialog()}${this._renderNewProjectDialog()}`;
    this._bind();
    this._ensureDesignerFont();
    this._paint();
  }

  _ensureDesignerFont() {
    if (!document.fonts || this._designerFontReady || this._designerFontLoading) return;
    this._designerFontLoading = Promise.all([
      document.fonts.load('600 24px "DRATEK eInk Sans"'),
      document.fonts.load('700 24px "DRATEK eInk Sans"'),
    ]).then(() => {
      this._designerFontReady = true;
      this._designerFontLoading = null;
      this._paint();
    }).catch(() => {
      this._designerFontLoading = null;
    });
  }

  _renderToolSidebar() {
    const disabled = this._selectedIds.length ? "" : "disabled";
    const category = this._toolCategory || "basic";
    const sideView = this._designerSideView || "tools";
    const customElementButtons = this._customElements.map((element) => {
      const previewLayer = this._customLayerForValue(element, this._customElementCurrentValue(element));
      return `<button class="designer-custom-item" data-custom-insert="${this._escape(element.id)}" title="Vložit ${this._escape(element.name)} do aktivního displeje"><canvas width="92" height="40" data-custom-element-id="${this._escape(element.id)}" data-custom-layer-preview="${this._escape(previewLayer?.id || "")}"></canvas><span><strong>${this._escape(element.name)}</strong><small>${(element.layers || []).length || 1} vrstev</small></span><ha-icon icon="mdi:plus-circle-outline"></ha-icon></button>`;
    }).join("");
    const toolButton = (type, icon, label, id = "") => `<button ${id ? `id="${id}"` : `data-add="${type}"`} class="tool-icon" title="${label}"><span class="ico"><ha-icon icon="${icon}"></ha-icon></span><span class="txt">${label}</span></button>`;
    const groups = {
      basic: `
        <div class="tool-folder-head"><strong>Základní prvky</strong><small>Text, tvary a obrázky</small></div>
        <div class="tool-grid">
          ${toolButton("text", "mdi:format-text", "Text")}
          ${toolButton("", "mdi:shape-plus", "Symbol", "openSymbols")}
          ${toolButton("rect", "mdi:rectangle-outline", "Tvar")}
          ${toolButton("line", "mdi:vector-line", "Čára")}
          ${toolButton("barcode", "mdi:barcode", "Čárový kód")}
          ${toolButton("qr", "mdi:qrcode", "QR kód")}
          ${toolButton("", "mdi:image-plus", "Obrázek", "addImage")}
          <input id="imageFile" type="file" accept="image/*" hidden>
        </div>`,
      data: `
        <div class="tool-folder-head"><strong>Data a grafy</strong><small>Napojení na entity Home Assistantu</small></div>
        <div class="tool-grid">
          ${toolButton("chart", "mdi:chart-line", "Graf")}
          ${toolButton("bar_gauge", "mdi:chart-bar", "Ukazatel")}
          ${toolButton("pie", "mdi:chart-donut", "Koláč")}
          ${toolButton("slider", "mdi:tune-vertical", "Posuvník")}
          ${toolButton("gauge", "mdi:gauge", "Budík")}
        </div>
        <p class="tool-folder-help"><ha-icon icon="mdi:home-assistant"></ha-icon>Po vložení vyberte v Inspectoru entitu. Změny se do displeje odešlou podle nastaveného intervalu.</p>`,
      status: `
        <div class="tool-folder-head"><strong>Stavy a signalizace</strong><small>ON/OFF nebo vlastní podmínky</small></div>
        <div class="tool-grid">
          ${toolButton("status", "mdi:toggle-switch-outline", "ON / OFF")}
        </div>
        <button id="openCustomElements" class="designer-custom-empty secondary"><ha-icon icon="mdi:layers-triple-outline"></ha-icon><span><strong>Pokročilá signalizace</strong><small>Více vrstev a podmínek</small></span></button>`,
      custom: `
        <div class="tool-folder-head"><strong>Moje HA prvky</strong><small>Uložené prvky připravené k vložení</small></div>
        ${customElementButtons ? `<div class="designer-custom-list">${customElementButtons}</div>` : `<button id="openCustomElements" class="designer-custom-empty secondary"><ha-icon icon="mdi:plus"></ha-icon><span><strong>Vytvořit první prvek</strong><small>Otevře Designer HA prvků</small></span></button>`}`,
    };
    return `<div class="card left designer-tools-panel">
      <div class="designer-side-tabs">
        <button class="${sideView === "tools" ? "active" : ""}" data-designer-side="tools"><ha-icon icon="mdi:view-grid-plus-outline"></ha-icon><span>Prvky</span></button>
        <button class="${sideView === "layers" ? "active" : ""}" data-designer-side="layers"><ha-icon icon="mdi:layers-triple-outline"></ha-icon><span>Vrstvy</span><b>${this._objects.length}</b></button>
      </div>
      <div class="designer-side-pane" style="${sideView === "tools" ? "" : "display:none"}">
        <div class="designer-panel-heading"><span><ha-icon icon="mdi:view-grid-plus-outline"></ha-icon></span><div><h2>Knihovna prvků</h2><small>Vyberte složku</small></div></div>
        <div class="tool-folder-tabs">
          <button class="${category === "basic" ? "active" : ""}" data-tool-category="basic"><ha-icon icon="mdi:shape-outline"></ha-icon><span>Základní</span></button>
          <button class="${category === "data" ? "active" : ""}" data-tool-category="data"><ha-icon icon="mdi:chart-box-outline"></ha-icon><span>Data</span></button>
          <button class="${category === "status" ? "active" : ""}" data-tool-category="status"><ha-icon icon="mdi:toggle-switch-outline"></ha-icon><span>Stavy</span></button>
          <button class="${category === "custom" ? "active" : ""}" data-tool-category="custom"><ha-icon icon="mdi:puzzle-outline"></ha-icon><span>Moje</span></button>
        </div>
        <div class="tool-folder-content">${groups[category] || groups.basic}</div>
        <div class="panel-divider"></div>
        <div class="designer-panel-heading compact"><span><ha-icon icon="mdi:selection-drag"></ha-icon></span><div><h2>Upravit výběr</h2><small>${this._selectedIds.length ? `${this._selectedIds.length} vybráno` : "Vyberte objekt"}</small></div></div>
        <div class="action-grid">
          <button id="undoAction" class="icon-btn secondary" title="Zpět (Ctrl+Z)" ${this._undoStack.length ? "" : "disabled"}><ha-icon icon="mdi:undo"></ha-icon></button>
          <button id="redoAction" class="icon-btn secondary" title="Dopředu (Ctrl+Y)" ${this._redoStack.length ? "" : "disabled"}><ha-icon icon="mdi:redo"></ha-icon></button>
          <button id="duplicateSelected" class="icon-btn secondary" title="Duplikovat" ${disabled}><ha-icon icon="mdi:content-duplicate"></ha-icon></button>
          <button id="rotateSelected" class="icon-btn secondary" title="Otočit 90°" ${disabled}><ha-icon icon="mdi:rotate-right"></ha-icon></button>
          <button id="mirrorSelected" class="icon-btn secondary" title="Zrcadlit" ${disabled}><ha-icon icon="mdi:flip-horizontal"></ha-icon></button>
          <button id="layerFront" class="icon-btn secondary" title="Do popředí" ${disabled}><ha-icon icon="mdi:arrange-bring-forward"></ha-icon></button>
          <button id="layerBack" class="icon-btn secondary" title="Do pozadí" ${disabled}><ha-icon icon="mdi:arrange-send-backward"></ha-icon></button>
          <button id="alignLeft" class="icon-btn secondary" title="Zarovnat vlevo" ${disabled}><ha-icon icon="mdi:format-align-left"></ha-icon></button>
          <button id="alignCenter" class="icon-btn secondary" title="Zarovnat na střed" ${disabled}><ha-icon icon="mdi:format-align-center"></ha-icon></button>
          <button id="alignRight" class="icon-btn secondary" title="Zarovnat vpravo" ${disabled}><ha-icon icon="mdi:format-align-right"></ha-icon></button>
          <button id="alignTop" class="icon-btn secondary" title="Zarovnat nahoru" ${disabled}><ha-icon icon="mdi:format-align-top"></ha-icon></button>
          <button id="alignMiddle" class="icon-btn secondary" title="Svislý střed" ${disabled}><ha-icon icon="mdi:format-align-middle"></ha-icon></button>
          <button id="alignBottom" class="icon-btn secondary" title="Zarovnat dolů" ${disabled}><ha-icon icon="mdi:format-align-bottom"></ha-icon></button>
          <button id="distributeH" class="icon-btn secondary" title="Rozprostřít vodorovně" ${this._selectedIds.length > 2 ? "" : "disabled"}><ha-icon icon="mdi:distribute-horizontal-center"></ha-icon></button>
          <button id="distributeV" class="icon-btn secondary" title="Rozprostřít svisle" ${this._selectedIds.length > 2 ? "" : "disabled"}><ha-icon icon="mdi:distribute-vertical-center"></ha-icon></button>
          <button id="deleteSelected" class="wide-action danger" ${disabled}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat vybrané</button>
          <button id="clearDesign" class="wide-action secondary"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Vyčistit plochu</button>
        </div>
      </div>
      <div class="designer-side-pane" style="${sideView === "layers" ? "" : "display:none"}">${this._renderLayersPanel()}</div>
    </div>`;
  }

  _renderFileMenu() {
    if (!this._fileMenuOpen) return "";
    const size = this._displaySize();
    const projects = this._projects.filter((project) => Number(project.width) === size.width && Number(project.height) === size.height);
    const selectedProjectAvailable = projects.some((project) => project.id === this._selectedProjectId);
    return `<div class="file-menu">
      <div class="file-backstage">
        <div class="file-rail">
          <div class="file-rail-title"><ha-icon icon="mdi:file-document-outline"></ha-icon><span>Soubor</span></div>
          <button id="newProject"><ha-icon icon="mdi:file-plus-outline"></ha-icon><span>Novy projekt</span></button>
          <button id="saveProject"><ha-icon icon="mdi:content-save-outline"></ha-icon><span>Ulozit projekt</span></button>
          <button id="openTemplateFromFile"><ha-icon icon="mdi:view-grid-plus-outline"></ha-icon><span>Otevrit sablonu</span></button>
          <button id="exportProjectFile"><ha-icon icon="mdi:file-download-outline"></ha-icon><span>Ulozit do souboru</span></button>
          <button id="importProjectFile"><ha-icon icon="mdi:file-upload-outline"></ha-icon><span>Otevrit ze souboru</span></button>
          <input id="projectFileInput" type="file" accept=".json,.dratek-eink.json,application/json" hidden>
        </div>
        <div class="file-content">
          <div class="file-menu-head"><div><h2>Projekt</h2><div class="subtitle">Navrhy ${size.width} x ${size.height} px</div></div><button id="fileMenuClose" class="icon-btn secondary" title="Zavrit"><ha-icon icon="mdi:close"></ha-icon></button></div>
          <div class="field"><label>Nazev projektu</label><input id="projectName" value="${this._escape(this._projectName)}" placeholder="Nazev navrhu"></div>
          <div class="field"><label>Ulozene projekty pro tento displej</label><select id="projectSelect"><option value="">Novy / neulozeny navrh</option>${projects.map((project) => `<option value="${this._escape(project.id)}" ${project.id === this._selectedProjectId ? "selected" : ""}>${this._escape(project.name)}</option>`).join("")}</select></div>
          <div class="file-content-actions"><button id="loadProject" ${selectedProjectAvailable ? "" : "disabled"}><ha-icon icon="mdi:folder-open-outline"></ha-icon>Otevrit</button><button id="deleteProject" class="danger" ${selectedProjectAvailable ? "" : "disabled"}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></div>
        </div>
      </div>
    </div>`;
  }

  _renderViewMenu() {
    if (!this._viewMenuOpen) return "";
    return `<div class="ribbon-menu view-menu">
      <div class="menu-command-row">
        <button id="zoomIn" title="Přiblížit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon><span>Přiblížit</span></button>
        <button id="zoomOut" title="Oddálit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon><span>Oddálit</span></button>
        <button id="zoomFit" title="Přizpůsobit"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon><span>Přizpůsobit (${Math.round(this._zoom * 100)}%)</span></button>
      </div>
      <div class="view-option-group">
        <label class="view-option"><input id="snap" type="checkbox" ${this._snap ? "checked" : ""}><ha-icon icon="mdi:grid"></ha-icon><span>Přichytávat k mřížce</span></label>
        <select id="snapStep" ${this._snap ? "" : "disabled"} title="Krok mřížky v px">
          <option value="1" ${(this._snapStep || 5) === 1 ? "selected" : ""}>Krok 1 px</option>
          <option value="2" ${(this._snapStep || 5) === 2 ? "selected" : ""}>Krok 2 px</option>
          <option value="5" ${(this._snapStep || 5) === 5 ? "selected" : ""}>Krok 5 px</option>
          <option value="10" ${(this._snapStep || 5) === 10 ? "selected" : ""}>Krok 10 px</option>
          <option value="20" ${(this._snapStep || 5) === 20 ? "selected" : ""}>Krok 20 px</option>
        </select>
      </div>
    </div>`;
  }

  _renderToolsMenu(device) {
    if (!this._toolsMenuOpen) return "";
    return `<div class="ribbon-menu tools-menu designer-device-settings">
      <div class="designer-menu-section"><h2>Pozadí návrhu</h2><p>Vyberte základní barvu eInk obrazovky.</p><div class="background-picker"><button data-background="white" class="${this._backgroundColor === "white" ? "selected" : ""}" title="Bílé pozadí návrhu"><span class="color-swatch white"></span>Bílé</button><button data-background="black" class="${this._backgroundColor === "black" ? "selected" : ""}" title="Černé pozadí návrhu"><span class="color-swatch black"></span>Černé</button><button data-background="red" class="${this._backgroundColor === "red" ? "selected" : ""}" title="Červené pozadí návrhu"><span class="color-swatch red"></span>Červené</button></div></div>
      <details class="designer-advanced-device"><summary><ha-icon icon="mdi:led-on"></ha-icon><span><strong>RGB dioda zařízení</strong><small>Doplňkové nastavení displeje</small></span><ha-icon icon="mdi:chevron-down"></ha-icon></summary>${this._renderRgbLedControl(device, true)}</details>
    </div>`;
  }

  _objectLabel(object, index) {
    if (object.type === "text") return object.statusIcons ? "Signalizace ON / OFF" : String(object.text || "Text").slice(0, 28);
    if (object.type === "rect") return `Obdélník ${index + 1}`;
    if (object.type === "line") return `Čára ${index + 1}`;
    if (object.type === "barcode") return `EAN ${object.value || ""}`.trim();
    if (object.type === "qr") return `QR ${object.value || ""}`.trim().slice(0, 28);
    if (object.type === "chart") return String(object.chartTitle || "Graf").slice(0, 28);
    if (object.type === "bar_gauge") return String(object.label || "Ukazatel").slice(0, 28);
    if (object.type === "pie") return String(object.label || "Koláč").slice(0, 28);
    if (object.type === "slider") return String(object.label || "Posuvník").slice(0, 28);
    if (object.type === "gauge" || object.type === "potentiometer") return String(object.label || "Budík").slice(0, 28);
    if (object.type === "image") return `Obrázek ${index + 1}`;
    if (object.type === "layered") return String(this._customElements.find((element) => element.id === object.customElementId)?.name || "Vlastní HA prvek").slice(0, 28);
    return `Objekt ${index + 1}`;
  }

  _objectIcon(object) {
    if (object.type === "text" && object.statusIcons) return "mdi:toggle-switch-outline";
    return ({ text: "mdi:format-text", rect: "mdi:rectangle-outline", line: "mdi:vector-line", barcode: "mdi:barcode", qr: "mdi:qrcode", chart: "mdi:chart-line", bar_gauge: "mdi:chart-bar", pie: "mdi:chart-donut", slider: "mdi:tune-vertical", gauge: "mdi:gauge", potentiometer: "mdi:gauge", image: "mdi:image-outline", layered: "mdi:layers-triple-outline" })[object.type] || "mdi:shape-outline";
  }

  _renderLayersPanel() {
    const layers = this._objects.map((object, index) => ({ object, index })).reverse();
    return `<div class="designer-layers-content">
      <div class="designer-panel-heading"><span><ha-icon icon="mdi:layers-triple-outline"></ha-icon></span><div><h2>Vrstvy návrhu</h2><small>${this._objects.length} ${this._objects.length === 1 ? "objekt" : "objektů"}</small></div></div>
      ${layers.length ? `<div class="layer-list">${layers.map(({ object, index }) => `
        <div class="layer-row ${this._selectedIds.includes(object.id) ? "selected" : ""} ${object.hidden ? "is-hidden" : ""} ${object.locked ? "is-locked" : ""}">
          <button class="layer-main" data-layer-select="${object.id}" title="Vybrat objekt">
            <ha-icon icon="${this._objectIcon(object)}"></ha-icon>
            <span>${this._escape(object.name || this._objectLabel(object, index))}</span>
          </button>
          <div class="layer-row-actions">
            <button class="layer-action ${object.hidden ? "active" : ""}" data-layer-toggle-hide="${object.id}" title="${object.hidden ? "Zobrazit prvek" : "Skrýt prvek"}"><ha-icon icon="${object.hidden ? "mdi:eye-off" : "mdi:eye"}"></ha-icon></button>
            <button class="layer-action ${object.locked ? "active" : ""}" data-layer-toggle-lock="${object.id}" title="${object.locked ? "Odemknout prvek" : "Zamknout prvek"}"><ha-icon icon="${object.locked ? "mdi:lock" : "mdi:lock-open-variant"}"></ha-icon></button>
            <button class="layer-step" data-layer-front="${object.id}" title="Posunout nahoru" ${index === this._objects.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button class="layer-step" data-layer-back="${object.id}" title="Posunout dolů" ${index === 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          </div>
        </div>`).join("")}</div><p class="layer-hint">Nahoře je popředí. Tlačítka oka a zámku skryjí nebo zamknou prvek.</p>` : `<div class="inspector-empty"><ha-icon icon="mdi:layers-outline"></ha-icon><p>Návrh zatím neobsahuje žádné objekty.</p></div>`}
    </div>`;
  }

  _renderLayoutMenu(device) {
    if (!this._layoutMenuOpen) return "";
    return `<div class="ribbon-menu layout-menu"><div class="designer-menu-section"><h2>Mapování obrazu na panel</h2><p>Otáčení pracovní plochy je vždy dostupné v horním informačním řádku.</p></div>${this._renderTransformSelector(device)}</div>`;
  }

  _renderVariablesDialog() {
    if (!this._variablesDialogOpen) return "";
    const variables = this._variableDefs();
    return `<div class="modal-backdrop"><div class="editor-dialog">
      <div class="section-title"><div><h2>Proměnné návrhu</h2><div class="subtitle">Ruční hodnoty upravíte zde. Zdroj z entity nebo Pomocníka Home Assistantu vyberete v Inspectoru konkrétního objektu.</div></div><button id="variablesDialogClose" class="icon-btn secondary" title="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button></div>
      ${variables.length ? `<div class="variable-list">${variables.map((variable) => `<div class="variable-card"><div class="variable-card-head"><strong>${this._escape(variable.name)}</strong><span class="pill ${variable.entityId ? "good" : "muted"}">${variable.entityId ? "Entita HA" : variable.type === "chart" ? "Ruční pole" : "Ruční text"}</span></div>${variable.entityId ? `<div class="entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>${this._escape(variable.entityLabel)}</strong><small>${this._escape(variable.entityId)}${variable.entityAttribute ? ` · atribut ${this._escape(variable.entityAttribute)}` : ""}</small></div></div>` : variable.type === "chart" ? `<textarea data-variable="${this._escape(variable.name)}" rows="4">${this._escape(variable.value)}</textarea>` : `<input data-variable="${this._escape(variable.name)}" value="${this._escape(variable.value)}">`}${variable.type === "chart" ? `<div class="format-help"><ha-icon icon="mdi:code-json"></ha-icon><div><strong>Datový formát</strong><div>Zdroj musí vrátit pole čísel v pořadí zleva doprava. Doporučený je JSON; podporovaný je také seznam oddělený čárkami. Pro desetinnou čárku oddělujte hodnoty středníkem.</div><code>[1.62, 1.48, 1.36] &nbsp; nebo &nbsp; 1,62; 1,48; 1,36</code></div></div>` : ""}</div>`).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:variable-off"></ha-icon><p>Návrh zatím neobsahuje žádnou proměnnou. Označte text jako proměnný nebo vložte graf.</p></div>`}
    </div></div>`;
  }

  _renderTemplateDialog() {
    if (!this._templateDialogOpen) return "";
    const size = this._displaySize();
    return `<div class="modal-backdrop"><div class="editor-dialog template-dialog">
      <div class="section-title"><div><h2>Otevrit sablonu</h2><div class="subtitle">Sablona se prizpusobi rozliseni ${size.width} x ${size.height} px</div></div><button id="templateDialogClose" class="icon-btn secondary" title="Zavrit"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="template-grid">${this._renderTemplates()}</div>
    </div></div>`;
  }

  _renderNewProjectDialog() {
    if (!this._newProjectDialogOpen) return "";
    return `<div class="modal-backdrop"><div class="editor-dialog new-project-dialog">
      <div class="section-title"><h2>Novy projekt</h2><button id="newProjectDialogClose" class="icon-btn secondary" title="Zavrit"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="project-choice-grid">
        <button id="createBlankProject" class="project-choice"><ha-icon icon="mdi:file-outline"></ha-icon><strong>Prazdny projekt</strong><span>Zacit s cistou pracovni plochou</span></button>
        <button id="newProjectFromTemplate" class="project-choice"><ha-icon icon="mdi:view-grid-plus-outline"></ha-icon><strong>Pouzit sablonu</strong><span>Vybrat pripraveny navrh</span></button>
      </div>
    </div></div>`;
  }

  _renderGatewayResult() {
    if (!this._gatewayResult) return "";
    const cls = this._gatewayResult.ok ? "good" : "bad";
    const message = this._gatewayResult.ok
      ? (this._gatewayResult.message || `Scan dokoncen. Nalezeno ${this._gatewayResult.devices ? this._gatewayResult.devices.length : 0} BLE zarizeni.`)
      : `Gateway chyba: ${this._gatewayResult.error || "neznamy problem"}`;
    const devices = this._gatewayResult.devices || [];
    return `<div class="card send-result"><span class="pill ${cls}">${this._escape(message)}</span>${devices.length ? `<div class="panel-divider"></div>${this._renderGatewayDevices(devices)}` : ""}</div>`;
  }

  _renderQueue() {
    const queue = this._queue || { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0, skipped: 0, skipped_reasons: [], skipped_devices: [] };
    const allJobs = queue.jobs || [];
    const skippedReasons = queue.skipped_reasons || [];
    const skippedDevices = queue.skipped_devices || [];

    const searchQuery = (this._queueSearch || "").trim().toLowerCase();
    const statusFilter = this._queueStatusFilter || "all";
    const deviceFilter = this._queueDeviceFilter || "all";

    const filteredJobs = allJobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (deviceFilter !== "all" && String(job.address || "").toUpperCase() !== deviceFilter.toUpperCase()) return false;
      if (searchQuery) {
        const text = `${job.address} ${job.operation} ${job.transport_name} ${job.error || ""} ${job.log ? job.log.join(" ") : ""}`.toLowerCase();
        if (!text.includes(searchQuery)) return false;
      }
      return true;
    });

    const limit = Number(this._queueLimit === undefined ? 50 : this._queueLimit);
    const displayedJobs = limit > 0 ? filteredJobs.slice(0, limit) : filteredJobs;

    const stat = (icon, value, label, cls = "") => `
      <div class="card queue-stat">
        <ha-icon icon="${icon}"></ha-icon>
        <div><strong class="${cls}">${value || 0}</strong><span>${label}</span></div>
      </div>`;

    const devicesList = [...new Set(allJobs.map((j) => String(j.address || "").toUpperCase()))].sort();

    const skipWarningBanner = (queue.skipped > 0 || skippedReasons.length > 0) ? `
      <div class="card queue-skip-warning">
        <div class="warning-header">
          <ha-icon icon="mdi:alert-decagram-outline"></ha-icon>
          <div>
            <strong>Upozornění: Některé automatické zápisy byly přeskočeny (${queue.skipped})</strong>
            <small>K přeskočení dochází, pokud je interval zjišťování stavů kratší než doba zápisu na displej nebo při upřednostnění ručního zápisu z editoru.</small>
          </div>
        </div>
        ${skippedReasons.length ? `<div class="warning-reasons"><strong>Důvody přeskočení:</strong><ul>${skippedReasons.map((reason) => `<li>${this._escape(reason)}</li>`).join("")}</ul></div>` : ""}
        ${skippedDevices.length ? `<div class="warning-devices"><strong>Zasažené displeje:</strong> ${skippedDevices.map((addr) => `<span class="pill muted">${this._escape(addr)}</span>`).join(" ")}</div>` : ""}
        <div class="warning-tip"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><strong>Tip:</strong> Zkraťte interval nahrávání v hlavním záhlaví (např. na 10 s nebo 15 s) nebo prodlužte interval odesílání v automatizaci.</div>
      </div>` : "";

    return `
    <style>
      .queue-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px; }
      .queue-stat { display: flex; align-items: center; gap: 10px; padding: 12px; }
      .queue-stat ha-icon { --mdc-icon-size: 28px; color: var(--dratek-teal); }
      .queue-stat strong { font-size: 20px; display: block; }
      .queue-stat span { font-size: 10px; color: var(--secondary-text-color); display: block; }
      .queue-stat .warn-signal { color: var(--dratek-orange); }
      .queue-stat .good-signal { color: #16803c; }
      .queue-stat .bad-signal { color: #c62828; }
      .queue-stat .skipped-signal { color: #d97706; }

      .queue-skip-warning { padding: 14px; margin-bottom: 14px; border: 1px solid rgba(217, 119, 6, 0.4); background: rgba(217, 119, 6, 0.07); border-radius: 12px; }
      .warning-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; color: #b45309; }
      .warning-header ha-icon { --mdc-icon-size: 28px; }
      .warning-header strong { font-size: 13px; display: block; }
      .warning-header small { font-size: 10px; color: var(--secondary-text-color); display: block; margin-top: 2px; }
      .warning-reasons { margin: 8px 0; font-size: 11px; }
      .warning-reasons ul { margin: 4px 0 0 16px; padding: 0; }
      .warning-devices { margin: 6px 0; font-size: 11px; }
      .warning-tip { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 8px; background: var(--card-background-color); border-radius: 8px; font-size: 10px; }

      .queue-controls-bar { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto auto auto auto; gap: 8px; align-items: center; margin-bottom: 12px; }
      .queue-controls-bar input, .queue-controls-bar select { padding: 7px 9px; font-size: 11px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
      .queue-row { display: grid; grid-template-columns: 36px minmax(130px, 1fr) minmax(130px, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--divider-color); font-size: 11px; }
      .queue-row:last-child { border-bottom: 0; }
      .queue-row.writing { background: rgba(255, 102, 0, 0.05); }
      .queue-row.skipped { opacity: 0.85; background: rgba(217, 119, 6, 0.04); }
      .queue-row.failed { background: rgba(198, 40, 40, 0.05); }
      .queue-row .queue-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--secondary-background-color); color: var(--dratek-teal); }
      .queue-row.writing .queue-icon { color: var(--dratek-orange); }
      .queue-row.failed .queue-icon { color: #c62828; }
      .queue-row.skipped .queue-icon { color: #d97706; }
      .queue-meta-info { font-size: 10px; color: var(--secondary-text-color); margin-top: 2px; }
      .queue-row-log { grid-column: 1 / -1; margin-top: 4px; padding: 6px 9px; font-family: monospace; font-size: 9px; border-radius: 6px; background: var(--secondary-background-color); color: var(--secondary-text-color); max-height: 80px; overflow-y: auto; }
      @media(max-width:900px) { .queue-summary { grid-template-columns: repeat(3, 1fr); } .queue-controls-bar { grid-template-columns: 1fr 1fr; } }
    </style>

    <div class="queue-summary">
      ${stat("mdi:tray-full", queue.queued, "Ve frontě")}
      ${stat("mdi:progress-upload", queue.writing, "Zapisuje", queue.writing ? "warn-signal" : "")}
      ${stat("mdi:check-circle-outline", queue.succeeded, "Dokončeno", "good-signal")}
      ${stat("mdi:skip-next-circle-outline", queue.skipped, "Přeskočeno", queue.skipped ? "skipped-signal" : "")}
      ${stat("mdi:alert-circle-outline", queue.failed, "Selhalo", queue.failed ? "bad-signal" : "")}
    </div>

    ${skipWarningBanner}

    <div class="card">
      <div class="section-title">
        <div>
          <h2>Fronta a historie zápisů</h2>
          <small>Zobrazeno ${displayedJobs.length} z celkem ${filteredJobs.length} záznamů (${allJobs.length} celkem v paměti)</small>
        </div>
      </div>

      <div class="queue-controls-bar">
        <input id="queueSearch" value="${this._escape(this._queueSearch || "")}" placeholder="Hledat MAC, zařízení, chybu...">
        <select id="queueStatusFilter" title="Filtr stavu">
          <option value="all" ${statusFilter === "all" ? "selected" : ""}>Všechny stavy</option>
          <option value="writing" ${statusFilter === "writing" ? "selected" : ""}>Zapisuje</option>
          <option value="queued" ${statusFilter === "queued" ? "selected" : ""}>Ve frontě</option>
          <option value="succeeded" ${statusFilter === "succeeded" ? "selected" : ""}>Dokončeno</option>
          <option value="skipped" ${statusFilter === "skipped" ? "selected" : ""}>Přeskočeno</option>
          <option value="failed" ${statusFilter === "failed" ? "selected" : ""}>Selhalo</option>
        </select>
        <select id="queueDeviceFilter" title="Filtr zařízení">
          <option value="all" ${deviceFilter === "all" ? "selected" : ""}>Všechna zařízení</option>
          ${devicesList.map((addr) => `<option value="${this._escape(addr)}" ${deviceFilter.toUpperCase() === addr ? "selected" : ""}>${this._escape(addr)}</option>`).join("")}
        </select>
        <select id="queueLimit" title="Počet položek">
          <option value="20" ${limit === 20 ? "selected" : ""}>20 položek</option>
          <option value="50" ${limit === 50 ? "selected" : ""}>50 položek</option>
          <option value="100" ${limit === 100 ? "selected" : ""}>100 položek</option>
          <option value="0" ${limit === 0 ? "selected" : ""}>Všechny položky</option>
        </select>
        <button id="clearQueueHistory" class="secondary icon-btn" title="Vyčistit historii zápisů"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon></button>
        <button id="refreshQueue" class="secondary"><ha-icon icon="mdi:refresh"></ha-icon>Obnovit</button>
      </div>

      ${queue.error ? `<div class="pill bad">${this._escape(queue.error)}</div>` : ""}

      ${displayedJobs.length ? `
        <div class="queue-list">
          ${displayedJobs.map((job) => {
            const labels = { queued: "Ve frontě", writing: "Zapisuji", succeeded: "Dokončeno", failed: "Selhalo", skipped: "Přeskočeno" };
            const classes = { queued: "muted", writing: "warn", succeeded: "good", failed: "bad", skipped: "warn" };
            const icons = { queued: "mdi:tray-arrow-down", writing: "mdi:progress-upload", succeeded: "mdi:check", failed: "mdi:alert-circle-outline", skipped: "mdi:skip-next-circle-outline" };
            const operation = { design: "Návrh", partial_design: "Částečný zápis", text: "Text", service_text: "HA služba", entity_update: "Změna entity" }[job.operation] || job.operation;
            const logText = Array.isArray(job.log) && job.log.length ? job.log.slice(-3).join(" | ") : "";
            return `
            <div class="queue-row ${this._escape(job.status)}">
              <div class="queue-icon"><ha-icon icon="${icons[job.status] || "mdi:help"}"></ha-icon></div>
              <div class="queue-main">
                <strong>${this._escape(job.address)}</strong>
                <div class="queue-meta-info">${this._escape(operation)} · ${this._formatTime(job.created_at)}</div>
              </div>
              <div class="queue-route">
                <strong>${this._escape(job.transport_name)}</strong>
                <div class="queue-meta-info">${job.transport_type === "gateway" ? "DRATEK gateway" : "Home Assistant BLE"}</div>
              </div>
              <span class="pill ${classes[job.status] || "muted"}">${labels[job.status] || this._escape(job.status)}</span>
              <div>${job.finished_at ? `<span class="pill muted">${this._formatDuration(job.started_at, job.finished_at)}</span>` : ""}</div>
              ${(job.error || logText) ? `<div class="queue-row-log">${this._escape(job.error || logText)}</div>` : ""}
            </div>`;
          }).join("")}
        </div>` : `
        <div class="inspector-empty">
          <ha-icon icon="mdi:tray"></ha-icon>
          <p>${searchQuery || statusFilter !== "all" || deviceFilter !== "all" ? "Žádný záznam neodpovídá zvolenému vyhledávání a filtrům." : "Fronta je prázdná."}</p>
        </div>`}
    </div>`;
  }

  _customElementMeta(type) {
    return ({
      value: { label: "Hodnota", icon: "mdi:card-text-outline", description: "Textová hodnota senzoru, ceny nebo spotřeby." },
      status: { label: "Stavová ikona", icon: "mdi:power-socket-eu", description: "Symbol se změní podle stavu entity, například zásuvky." },
      chart: { label: "Graf", icon: "mdi:chart-line", description: "Graf z hodnot senzoru nebo číselného atributu Home Assistantu." },
      icon: { label: "Vlastní ikona", icon: "mdi:image-plus-outline", description: "Vlastní obrázek, který po vložení libovolně přesunete a změníte jeho velikost." },
    })[type] || { label: "Prvek", icon: "mdi:puzzle-outline", description: "Vlastní prvek displeje." };
  }

  _customElementCurrentValue(element) {
    if (element.entity_id) {
      const state = this._hass?.states?.[element.entity_id];
      const value = element.entity_attribute ? state?.attributes?.[element.entity_attribute] : state?.state;
      if (value !== undefined && value !== null) return typeof value === "string" ? value : JSON.stringify(value);
    }
    return String(element.sample_data || "");
  }

  _customConditionMatches(value, operator, target) {
    const current = String(value ?? "").trim().toLowerCase();
    const expected = String(target ?? "").trim().toLowerCase();
    const onValues = new Set(["on", "true", "1", "open", "home", "active", "heat", "heating", "playing", "unlocked"]);
    const offValues = new Set(["off", "false", "0", "closed", "not_home", "idle", "unavailable", "unknown", "locked"]);
    if (operator === "is_on") return onValues.has(current);
    if (operator === "is_off") return offValues.has(current);
    if (operator === "contains") return current.includes(expected);
    if (["greater", "greater_equal", "less", "less_equal"].includes(operator)) {
      const currentNumber = Number(value);
      const targetNumber = Number(target);
      if (!Number.isFinite(currentNumber) || !Number.isFinite(targetNumber)) return false;
      return operator === "greater"
        ? currentNumber > targetNumber
        : operator === "greater_equal"
          ? currentNumber >= targetNumber
          : operator === "less"
            ? currentNumber < targetNumber
            : currentNumber <= targetNumber;
    }
    const equal = current === expected;
    return operator === "not_equals" ? !equal : equal;
  }

  _customConditionSymbol(element, value) {
    const rules = Array.isArray(element.condition_rules) ? element.condition_rules : [];
    const match = rules.find((rule) => this._customConditionMatches(value, rule.operator || "equals", rule.value || ""));
    if (match) return match.symbol || "●";
    if (rules.length) return element.default_symbol || "?";
    const active = new Set(String(element.on_values || "on,true,1,open,home").split(",").map((item) => item.trim().toLowerCase())).has(String(value).trim().toLowerCase());
    return active ? element.on_symbol || "●" : element.off_symbol || "○";
  }

  _customChartPreview(value) {
    let values = [];
    try {
      const parsed = JSON.parse(String(value || ""));
      if (Array.isArray(parsed)) values = parsed.map(Number).filter(Number.isFinite);
    } catch (_err) { /* Parse text below. */ }
    if (!values.length) values = String(value || "").split(/[;,\s]+/).map((item) => Number(item.replace(",", "."))).filter(Number.isFinite);
    values = values.slice(-16);
    if (!values.length) values = [2, 4, 3, 6, 5, 8, 7];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    return `<div class="custom-chart-bars">${values.map((item) => `<i style="height:${Math.max(10, Math.round(((item - min) / span) * 80 + 15))}%"></i>`).join("")}</div>`;
  }

  _renderCustomElementVisual(element) {
    const meta = this._customElementMeta(element.element_type);
    const value = this._customElementCurrentValue(element);
    if (element.element_type === "icon") {
      return `<div class="custom-visual icon">${element.icon_image ? `<img src="${this._escape(element.icon_image)}" alt="${this._escape(element.name || "Vlastní ikona")}">` : `<span class="custom-icon-empty"><ha-icon icon="mdi:image-plus-outline"></ha-icon><small>Přetáhněte sem obrázek</small></span>`}</div>`;
    }
    if (element.element_type === "chart") return `<div class="custom-visual chart"><small>${this._escape(element.label || element.name || "Graf")}</small>${this._customChartPreview(value)}</div>`;
    if (element.element_type === "status") {
      const symbol = this._customConditionSymbol(element, value);
      return `<div class="custom-visual status"><strong>${this._escape(symbol)}</strong><span>${this._escape(element.label || meta.label)}</span><small>Aktuálně: ${this._escape(value || "bez hodnoty")}</small></div>`;
    }
    return `<div class="custom-visual value"><small>${this._escape(element.label || meta.label)}</small><strong>${this._escape(value || "Hodnota")}${element.unit ? ` <em>${this._escape(element.unit)}</em>` : ""}</strong></div>`;
  }

  _renderCustomElementsWorkspace() {
    return this._renderLayeredHaDesigner();
    const form = this._customElementForm;
    const meta = this._customElementMeta(form.element_type);
    const result = this._customElementResult ? `<div class="custom-result ${this._customElementResult.ok ? "good" : "bad"}"><ha-icon icon="${this._customElementResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._escape(this._customElementResult.message || this._customElementResult.error || "")}</div>` : "";
    const collections = this._customElementInspection?.collections || [];
    const selectedCollection = collections.find((item) => item.path === form.collection_path) || collections[0] || null;
    const collectionFields = selectedCollection?.fields || [];
    const valueFields = form.element_type === "chart" ? collectionFields.filter((field) => field.kind === "number") : collectionFields;
    const labelFields = collectionFields.filter((field) => field.kind === "text" || field.kind === "number");
    const columnOption = (field, selected) => `<option value="${this._escape(field.key)}" ${field.key === selected ? "selected" : ""}>${this._escape(field.key === "$value" ? "Přímo hodnoty seznamu" : field.key)} · ukázka: ${this._escape((field.preview || []).join(", "))}</option>`;
    const apiMapper = form.source_type === "url" ? `<div class="api-mapper"><div class="api-steps"><span class="done"><b>1</b>Adresa API</span><span class="${collections.length ? "done" : "active"}"><b>2</b>Datová sada</span><span class="${form.value_field ? "done" : ""}"><b>3</b>Přiřazení</span><span class="${form.sample_data ? "done" : ""}"><b>4</b>Náhled</span></div>${collections.length ? `<div class="api-mapping-grid"><div class="field"><label>1. Který seznam chcete použít?</label><select id="customCollectionPath"><option value="">Kořen odpovědi</option>${collections.map((collection) => `<option value="${this._escape(collection.path)}" ${collection.path === form.collection_path ? "selected" : ""}>${this._escape(collection.label)} · ${collection.count} ${Number(collection.count) === 1 ? "záznam" : "záznamů"}</option>`).join("")}</select></div><div class="field"><label>2. Co se má zobrazit${form.element_type === "chart" ? " jako hodnota grafu" : ""}?</label><select id="customValueField">${valueFields.length ? valueFields.map((field) => columnOption(field, form.value_field)).join("") : `<option value="">V této sadě není číselná hodnota</option>`}</select></div>${form.element_type === "chart" ? `<div class="field"><label>3. Co bude popisovat osu X?</label><select id="customLabelField"><option value="">Bez popisků</option>${labelFields.map((field) => columnOption(field, form.label_field)).join("")}</select></div>` : ""}</div><div class="api-mapping-summary"><ha-icon icon="mdi:check-decagram-outline"></ha-icon><div><strong>Výsledné přiřazení</strong><span>Hodnoty: <code>${this._escape(form.json_path || "—")}</code>${form.element_type === "chart" ? ` · Popisky: <code>${this._escape(form.label_json_path || "bez popisků")}</code>` : ""}</span></div></div>` : `<div class="api-mapper-empty"><ha-icon icon="mdi:database-search-outline"></ha-icon><div><strong>Nejdřív načtěte strukturu API</strong><span>Rozšíření samo rozdělí odpověď na seznamy a sloupce. Nemusíte znát ani psát JSON cestu.</span></div></div>`}</div>` : "";
    return `<div class="custom-elements-page">
      <section class="card custom-elements-hero"><div><span class="eyebrow">Knihovna pro všechny displeje</span><h2>Vytvořit vlastní prvek Home Assistantu</h2><p>Propojte eInk návrhy s entitou Home Assistantu nebo JSON adresou. Uložený prvek potom vložíte do jednoho návrhu nebo do všech nalezených displejů.</p></div><span class="custom-hero-icon"><ha-icon icon="mdi:puzzle-plus-outline"></ha-icon></span></section>
      ${result}
      <div class="custom-elements-layout">
        <section class="card custom-builder">
          <div class="section-title"><div><h2>Editor prvku</h2><div class="subtitle">${this._escape(meta.description)}</div></div><button id="customElementNew" class="secondary"><ha-icon icon="mdi:plus"></ha-icon>Nový</button></div>
          <div class="custom-type-grid">${["value", "status", "chart"].map((type) => { const item = this._customElementMeta(type); return `<button class="custom-type ${form.element_type === type ? "selected" : ""}" data-custom-type="${type}"><ha-icon icon="${item.icon}"></ha-icon><span>${item.label}</span></button>`; }).join("")}</div>
          <div class="field"><label>Název prvku</label><input data-custom-element-field="name" value="${this._escape(form.name)}" placeholder="Například Zásuvka v kuchyni"></div>
          <div class="row"><div class="field"><label>Zdroj dat</label><select data-custom-element-field="source_type"><option value="entity" ${form.source_type === "entity" ? "selected" : ""}>Entita Home Assistantu</option><option value="url" ${form.source_type === "url" ? "selected" : ""}>Webová adresa / JSON API</option></select></div><div class="field"><label>Barva</label><select data-custom-element-field="color"><option value="black" ${form.color === "black" ? "selected" : ""}>Černá</option><option value="red" ${form.color === "red" ? "selected" : ""}>Červená</option></select></div></div>
          ${form.source_type === "entity" ? `<div class="field"><label>Entita nebo Pomocník Home Assistantu</label><ha-entity-picker id="customElementEntity"></ha-entity-picker></div><div class="field"><label>Atribut entity (volitelné)</label><input data-custom-element-field="entity_attribute" value="${this._escape(form.entity_attribute)}" placeholder="Například prices"></div>` : `<div class="field"><label>HTTP/HTTPS adresa</label><input data-custom-element-field="url" value="${this._escape(form.url)}" placeholder="https://example.cz/data.json"></div><button id="customElementFetch" class="api-load-button" ${this._customElementBusy || !form.url ? "disabled" : ""}><ha-icon icon="mdi:database-import-outline"></ha-icon><span><strong>${this._customElementBusy ? "Načítám API..." : collections.length ? "Načíst strukturu znovu" : "Načíst strukturu API"}</strong><small>Bez ručního zadávání JSON cesty</small></span></button>${apiMapper}`}
          <div class="row"><div class="field"><label>Popisek</label><input data-custom-element-field="label" value="${this._escape(form.label)}" placeholder="Spotřeba"></div><div class="field"><label>Jednotka</label><input data-custom-element-field="unit" value="${this._escape(form.unit)}" placeholder="kWh"></div></div>
          ${form.element_type === "status" ? `<div class="row"><div class="field"><label>Symbol zapnuto</label><input data-custom-element-field="on_symbol" value="${this._escape(form.on_symbol)}"></div><div class="field"><label>Symbol vypnuto</label><input data-custom-element-field="off_symbol" value="${this._escape(form.off_symbol)}"></div></div><div class="field"><label>Hodnoty znamenající zapnuto</label><input data-custom-element-field="on_values" value="${this._escape(form.on_values)}"><small>Oddělujte čárkou, například on,true,1,open.</small></div>` : ""}
          ${form.element_type === "chart" ? `<div class="field"><label>Typ grafu</label><select data-custom-element-field="chart_type"><option value="line" ${form.chart_type === "line" ? "selected" : ""}>Spojnicový</option><option value="bar" ${form.chart_type === "bar" ? "selected" : ""}>Sloupcový</option><option value="area" ${form.chart_type === "area" ? "selected" : ""}>Plošný</option></select></div>` : ""}
          <div class="field"><label>Ukázková hodnota / data</label><textarea data-custom-element-field="sample_data" rows="3" placeholder="${form.element_type === "chart" ? "[1.2, 1.8, 1.4, 2.1]" : "Ukázka"}">${this._escape(form.sample_data)}</textarea></div>
          <div class="row"><div class="field"><label>Šířka prvku <strong>${form.width_percent} %</strong></label><input data-custom-element-field="width_percent" type="range" min="10" max="100" value="${form.width_percent}"></div><div class="field"><label>Výška prvku <strong>${form.height_percent} %</strong></label><input data-custom-element-field="height_percent" type="range" min="10" max="100" value="${form.height_percent}"></div></div>
          <div class="custom-builder-actions"><button id="customElementSave" ${this._customElementBusy || !form.name.trim() ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${form.id ? "Uložit změny" : "Přidat do knihovny"}</button></div>
        </section>
        <aside class="custom-side">
          <section class="card custom-live-preview"><div class="section-title"><h2>Živý náhled</h2><span class="pill muted">eInk</span></div>${this._renderCustomElementVisual(form)}</section>
          <section class="card custom-library"><div class="section-title"><div><h2>Moje prvky</h2><div class="subtitle">Dostupné ve všech návrzích</div></div><span class="pill muted">${this._customElements.length}</span></div>
            ${this._customElements.length ? `<div class="custom-library-list">${this._customElements.map((element) => { const item = this._customElementMeta(element.element_type); return `<article class="custom-library-item"><div class="custom-library-head"><span><ha-icon icon="${item.icon}"></ha-icon></span><div><strong>${this._escape(element.name)}</strong><small>${item.label} · ${element.source_type === "url" ? "URL" : this._escape(element.entity_id || "bez entity")}</small></div></div>${this._renderCustomElementVisual(element)}<div class="custom-library-actions"><button data-custom-insert="${element.id}"><ha-icon icon="mdi:vector-square-plus"></ha-icon>Do designeru</button><button class="secondary" data-custom-all="${element.id}"><ha-icon icon="mdi:monitor-multiple"></ha-icon>Do všech</button><button class="secondary icon-btn" data-custom-edit="${element.id}" title="Upravit"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button class="secondary icon-btn" data-custom-delete="${element.id}" title="Smazat"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></article>`; }).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:puzzle-outline"></ha-icon><p>Zatím nemáte žádný vlastní prvek.</p></div>`}
          </section>
        </aside>
      </div>
    </div>`;
  }

  _renderLayeredHaDesigner() {
    this._ensureLayeredCustomForm();
    const form = this._customElementForm;
    const result = this._customElementResult
      ? `<div class="custom-result ${this._customElementResult.ok ? "good" : "bad"}"><ha-icon icon="${this._customElementResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._escape(this._customElementResult.message || this._customElementResult.error || "")}</div>`
      : "";
    const css = `<style>
      .ha-library-view,.ha-layer-editor{display:grid;gap:14px}.ha-library-head{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px;border-radius:14px;background:linear-gradient(115deg,rgba(0,162,165,.12),rgba(255,122,0,.08));border:1px solid rgba(0,162,165,.32)}.ha-library-head h2{font-size:26px;text-transform:none;color:var(--primary-text-color);margin:5px 0}.ha-library-head p{margin:0;color:var(--secondary-text-color)}.ha-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}.ha-library-card{display:grid;gap:12px;padding:14px;border:1px solid var(--divider-color);border-radius:12px;background:var(--card-background-color)}.ha-library-card canvas{width:100%;aspect-ratio:296/128;background:#fff;border:1px solid var(--divider-color);border-radius:8px}.ha-library-card strong,.ha-library-card small{display:block}.ha-library-card small{margin-top:3px;color:var(--secondary-text-color)}.ha-card-actions{display:flex;gap:7px}.ha-empty-library{min-height:390px;display:grid;place-items:center;align-content:center;text-align:center;gap:10px;border:1px dashed rgba(0,162,165,.45);border-radius:14px;background:var(--card-background-color)}.ha-empty-library>ha-icon{--mdc-icon-size:54px;color:var(--dratek-teal)}.ha-empty-library h3,.ha-empty-library p{margin:0}
      .ha-editor-top{display:grid;grid-template-columns:auto minmax(220px,1fr) auto auto;align-items:end;gap:12px;padding:12px;border:1px solid var(--divider-color);border-radius:12px;background:var(--card-background-color)}.ha-editor-top nav{display:flex;gap:7px}.ha-editor-top nav button b{display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:rgba(255,255,255,.2)}.name-field{margin:0}.ha-layer-layout{display:grid;grid-template-columns:230px minmax(420px,1fr) 260px;min-height:590px;border:1px solid var(--divider-color);border-radius:12px;overflow:hidden;background:var(--card-background-color)}.layer-list,.layer-properties{padding:13px;background:var(--secondary-background-color);overflow:auto}.panel-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.panel-heading strong,.panel-heading small{display:block}.panel-heading small{color:var(--secondary-text-color);font-size:10px}.layer-list-item{display:grid;grid-template-columns:72px 1fr;gap:8px;margin-bottom:9px;padding:8px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);cursor:pointer}.layer-list-item.active{border-color:var(--dratek-teal);box-shadow:inset 3px 0 0 var(--dratek-teal)}.layer-list-item canvas{width:72px;height:42px;background:#fff;border-radius:5px}.layer-list-item input{min-width:0;border:0;background:transparent;font-weight:800}.layer-list-item>div{grid-column:2;display:flex;gap:5px}.layer-stage{display:flex;flex-direction:column;align-items:stretch;padding:14px;min-width:0}.layer-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.layer-toolbar>span{margin-left:auto;color:var(--secondary-text-color);font-size:11px;font-weight:800}.layer-canvas-shell{flex:1;display:grid;place-items:center;margin-top:14px;padding:22px;background:radial-gradient(circle at 1px 1px,rgba(100,116,139,.24) 1px,transparent 0);background-size:18px 18px;border:1px solid var(--divider-color);border-radius:10px;overflow:auto}.layer-canvas-shell canvas{display:block;width:min(100%,820px);height:auto;max-height:490px;background:#fff;box-shadow:0 12px 36px rgba(0,0,0,.18);touch-action:none}.canvas-help{text-align:center;color:var(--secondary-text-color);font-size:11px}.layer-inspector{display:grid;gap:11px}.layer-inspector h3,.rules-card h3,.rules-source h3,.rule-preview h3{margin:0}.mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.layer-inspector-empty{display:grid;place-items:center;text-align:center;min-height:240px;color:var(--secondary-text-color)}.layer-inspector-empty ha-icon{--mdc-icon-size:42px}
      .ha-rules-layout{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(460px,1.5fr) minmax(260px,.7fr);gap:14px}.rules-source{display:flex;gap:12px;align-items:flex-start}.step-number{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border-radius:10px;background:var(--dratek-teal);color:#fff;font-weight:900}.rules-source p,.rules-title p{color:var(--secondary-text-color);font-size:11px}.rules-title,.rules-title>div{display:flex;align-items:center;justify-content:space-between;gap:10px}.layer-rules{display:grid;gap:8px;margin:14px 0}.layer-rule{display:grid;grid-template-columns:26px minmax(125px,1fr) minmax(85px,.75fr) auto minmax(115px,1fr) auto;align-items:center;gap:7px;padding:8px;border:1px solid var(--divider-color);border-radius:9px}.layer-rule>b{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--secondary-background-color)}.default-layer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding:13px;border-radius:10px;background:rgba(0,162,165,.08);border:1px solid rgba(0,162,165,.28)}.default-layer strong,.default-layer small{display:block}.default-layer small{color:var(--secondary-text-color)}.rule-preview{align-self:start;text-align:center}.rule-preview canvas{width:100%;height:auto;background:#fff;border:1px solid var(--divider-color);border-radius:8px;margin:12px 0}.rule-preview strong,.rule-preview small{display:block}.rule-preview small{color:var(--secondary-text-color);margin-top:4px}
      .ha-layer-editor{display:grid;gap:14px;min-width:0}.ha-editor-top{grid-template-columns:auto minmax(180px,1fr) minmax(390px,auto) auto;align-items:center;box-shadow:0 8px 26px rgba(15,23,42,.06)}.ha-editor-top>*{min-width:0}.ha-editor-top nav{min-width:0;flex-wrap:wrap}.ha-editor-top nav button{white-space:nowrap}.ha-layer-layout{grid-template-columns:minmax(190px,230px) minmax(0,1fr) minmax(240px,280px);grid-template-areas:"layers stage properties";min-width:0;min-height:clamp(520px,64vh,720px)}.ha-layer-layout>*{min-width:0}.ha-layer-layout>.layer-list{grid-area:layers;border-right:1px solid var(--divider-color)}.ha-layer-layout>.layer-stage{grid-area:stage}.ha-layer-layout>.layer-properties{grid-area:properties;border-left:1px solid var(--divider-color)}.layer-stage{overflow:hidden}.layer-canvas-shell{min-height:300px;max-width:100%;padding:clamp(12px,2vw,28px)}.layer-canvas-shell canvas{max-width:100%;max-height:min(52vh,520px);object-fit:contain}.layer-properties{overflow-wrap:anywhere}.layer-inspector-heading{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--divider-color)}.layer-inspector-heading>span{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;color:var(--dratek-teal);background:rgba(0,162,165,.1)}.layer-inspector-heading h3,.layer-inspector-heading small{display:block;margin:0}.layer-inspector-heading small,.inspector-note{color:var(--secondary-text-color);font-size:11px}.check-row{display:flex;align-items:center;gap:7px}.inspector-note{margin:0;padding:9px;border-radius:8px;background:var(--secondary-background-color)}.inspector-divider{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.inspector-divider:after{content:"";height:1px;flex:1;background:var(--divider-color)}.ha-rules-layout{grid-template-columns:minmax(220px,.7fr) minmax(0,1.45fr) minmax(220px,.65fr);align-items:start}.ha-rules-layout>*{min-width:0}.rules-source>div{min-width:0;flex:1}.layer-rule>*{min-width:0}.ha-library-card{min-width:0}.ha-library-card canvas{max-width:100%}
      @media(max-width:1320px){.ha-editor-top{grid-template-columns:auto minmax(180px,1fr) auto}.ha-editor-top nav{grid-column:1/-1;grid-row:2}.ha-layer-layout{grid-template-columns:210px minmax(0,1fr);grid-template-areas:"layers stage" "properties properties"}.ha-layer-layout>.layer-properties{border-left:0;border-top:1px solid var(--divider-color);max-height:none}.layer-inspector{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.layer-inspector>.layer-inspector-heading,.layer-inspector>.inspector-divider,.layer-inspector>.inspector-note,.layer-inspector>#deleteLayerObject{grid-column:1/-1}.ha-rules-layout{grid-template-columns:minmax(220px,.7fr) minmax(0,1.3fr);}.rule-preview{grid-column:1/-1;display:grid;grid-template-columns:minmax(180px,320px) 1fr;align-items:center;text-align:left;gap:12px}.rule-preview h3{grid-column:1/-1}.rule-preview canvas{grid-row:2/4;margin:0}.rule-preview strong,.rule-preview small{grid-column:2}}@media(max-width:900px){.ha-editor-top{grid-template-columns:1fr auto}.ha-editor-top .name-field{grid-column:1/-1;grid-row:2}.ha-editor-top nav{grid-column:1/-1;grid-row:3}.ha-rules-layout{grid-template-columns:1fr}.rule-preview{grid-column:auto}.layer-rule{grid-template-columns:26px minmax(0,1fr) minmax(0,1fr);}.layer-rule>span{display:none}.layer-rule select:last-of-type{grid-column:2/4}.layer-rule button{grid-column:3;grid-row:1}}@media(max-width:680px){.ha-library-head{display:grid}.ha-layer-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"layers" "stage" "properties"}.layer-list{max-height:280px;border-right:0!important;border-bottom:1px solid var(--divider-color)}.ha-editor-top{display:flex;align-items:stretch;flex-direction:column}.ha-editor-top nav{display:grid;grid-template-columns:1fr 1fr}.ha-editor-top nav button{white-space:normal}.layer-toolbar button{font-size:0}.layer-toolbar button ha-icon{margin:0}.layer-inspector{grid-template-columns:1fr}.layer-inspector>*{grid-column:1!important}.layer-rule{grid-template-columns:26px 1fr}.layer-rule>*{grid-column:2}.layer-rule>b{grid-column:1}.layer-rule button{grid-column:2;grid-row:auto}.rule-preview{display:block;text-align:center}.rule-preview canvas{margin:12px 0}.ha-card-actions{flex-wrap:wrap}}
    </style>`;
    if (this._customWorkspaceView === "library") {
      const cards = this._customElements.map((element) => {
        const layer = this._customLayerForValue(element, this._customElementCurrentValue(element));
        return `<article class="ha-library-card"><canvas width="296" height="128" data-custom-element-id="${this._escape(element.id)}" data-custom-layer-preview="${this._escape(layer?.id || "")}"></canvas><div><strong>${this._escape(element.name)}</strong><small>${this._escape(element.entity_id || "Bez entity")} · ${(element.layers || []).length || 1} vrstev</small></div><div class="ha-card-actions"><button data-custom-edit="${element.id}"><ha-icon icon="mdi:pencil-outline"></ha-icon>Upravit</button><button class="secondary" data-custom-insert="${element.id}"><ha-icon icon="mdi:vector-square-plus"></ha-icon>Do displeje</button><button class="secondary icon-btn" data-custom-delete="${element.id}" title="Smazat"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></article>`;
      }).join("");
      return `${css}<div class="ha-library-view"><section class="ha-library-head"><div><span class="eyebrow">Knihovna vlastních rozhraní</span><h2>Designer HA prvků</h2><p>Každý prvek může mít několik grafických vrstev. Home Assistant podle pravidel vždy vybere tu správnou.</p></div><button id="customElementNew"><ha-icon icon="mdi:plus"></ha-icon>Vytvořit nový prvek</button></section>${result}${cards ? `<div class="ha-library-grid">${cards}</div>` : `<div class="ha-empty-library"><ha-icon icon="mdi:layers-plus"></ha-icon><h3>Zatím nemáte žádný vlastní prvek</h3><p>Začněte například rozhraním zásuvky se dvěma vrstvami Zapnuto a Vypnuto.</p><button id="customElementEmptyNew"><ha-icon icon="mdi:plus"></ha-icon>Vytvořit první prvek</button></div>`}</div>`;
    }
    const layers = form.layers || [];
    const activeLayer = this._customActiveLayer();
    const selected = this._customSelectedLayerObject();
    const top = `<header class="ha-editor-top"><button id="customBackToLibrary" class="secondary"><ha-icon icon="mdi:arrow-left"></ha-icon>Knihovna</button><div class="field name-field"><label>Název prvku</label><input data-custom-element-field="name" value="${this._escape(form.name)}" placeholder="Například Zásuvka v kuchyni"></div><nav><button class="${this._customLayerStep === "design" ? "" : "secondary"}" data-custom-step="design"><b>1</b> Grafika vrstev</button><button class="${this._customLayerStep === "rules" ? "" : "secondary"}" data-custom-step="rules"><b>2</b> Pravidla zobrazení</button></nav><button id="customElementSave" ${this._customElementBusy || !this._customElementFormValid() ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${this._customElementBusy ? "Ukládám…" : "Uložit prvek"}</button></header>`;
    return `${css}<div class="ha-layer-editor">${top}${result}${this._customLayerStep === "design" ? this._renderCustomLayerDesign(layers, activeLayer, selected) : this._renderCustomLayerRules(layers)}</div>`;
  }

  _renderLayerColorPalette(property, current, label, values) {
    const labels = { original: "Původní", none: "Bez barvy", black: "Černá", red: "Červená", white: "Bílá" };
    const selected = values.includes(current) ? current : values[0];
    return `<fieldset class="layer-color-field"><legend>${this._escape(label)}</legend><div class="layer-color-options">${values.map((value) => `<label class="${selected === value ? "selected" : ""}" title="${labels[value]}"><input type="radio" name="layer-${property}-${this._escape(this._customSelectedObjectId)}" data-layer-object="${property}" value="${value}" ${selected === value ? "checked" : ""}><span class="layer-color-swatch ${value}">${value === "original" ? `<ha-icon icon="mdi:palette-outline"></ha-icon>` : value === "none" ? `<ha-icon icon="mdi:cancel"></ha-icon>` : ""}</span><small>${labels[value]}</small></label>`).join("")}</div></fieldset>`;
  }

  _defaultLayerIcons() {
    return [
      ["light", "Světlo", "mdi:lightbulb-outline"],
      ["socket", "Zásuvka", "mdi:power-socket-eu"],
      ["temperature", "Teploměr", "mdi:thermometer"],
      ["water", "Voda", "mdi:water-outline"],
      ["home", "Dům", "mdi:home-outline"],
      ["power", "Napájení", "mdi:power"],
      ["battery", "Baterie", "mdi:battery-medium"],
      ["wifi", "Signál", "mdi:wifi"],
    ];
  }

  _renderDefaultLayerIcons() {
    return this._defaultLayerIcons().map(([key, label, icon]) => `<button class="default-layer-icon secondary" data-default-layer-icon="${key}" title="Vložit ikonu ${this._escape(label)}"><ha-icon icon="${icon}"></ha-icon><span>${this._escape(label)}</span></button>`).join("");
  }

  _addDefaultLayerIcon(key) {
    const layer = this._customActiveLayer();
    if (!layer || !this._defaultLayerIcons().some(([item]) => item === key)) return;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const line = (...points) => {
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
      ctx.stroke();
    };
    if (key === "light") {
      ctx.beginPath(); ctx.arc(64, 51, 28, Math.PI * .82, Math.PI * 2.18); ctx.stroke();
      line(43, 72, 49, 83, 79, 83, 85, 72); line(49, 95, 79, 95); line(54, 107, 74, 107);
      [[64,8,64,18],[24,25,33,34],[104,25,95,34],[18,61,30,61],[110,61,98,61]].forEach((item) => line(...item));
    } else if (key === "socket") {
      ctx.strokeRect(29, 18, 70, 92); line(50, 41, 50, 57); line(78, 41, 78, 57);
      ctx.beginPath(); ctx.arc(64, 77, 15, 0, Math.PI); ctx.stroke(); line(64, 92, 64, 110);
    } else if (key === "temperature") {
      ctx.beginPath(); ctx.arc(64, 94, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 94, 10, 0, Math.PI * 2); ctx.fill();
      line(64, 84, 64, 30); ctx.beginPath(); ctx.arc(64, 29, 13, Math.PI, 0); ctx.stroke(); line(51,29,51,79); line(77,29,77,79);
    } else if (key === "water") {
      ctx.beginPath(); ctx.moveTo(64, 12); ctx.bezierCurveTo(52, 34, 29, 61, 29, 82); ctx.bezierCurveTo(29, 105, 45, 118, 64, 118); ctx.bezierCurveTo(83, 118, 99, 105, 99, 82); ctx.bezierCurveTo(99, 61, 76, 34, 64, 12); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(54, 89, 15, .3, 1.65); ctx.stroke();
    } else if (key === "home") {
      line(17,61,64,20,111,61); line(31,54,31,108,97,108,97,54); ctx.strokeRect(54, 75, 21, 33);
    } else if (key === "power") {
      ctx.beginPath(); ctx.arc(64, 68, 43, -.72, Math.PI * 1.72); ctx.stroke(); line(64, 12, 64, 65);
    } else if (key === "battery") {
      ctx.strokeRect(16, 37, 91, 55); ctx.fillRect(108, 51, 10, 27); ctx.fillRect(28, 49, 50, 31); line(68, 43, 50, 65, 64, 65, 51, 87);
    } else {
      ctx.beginPath(); ctx.arc(64, 101, 8, 0, Math.PI * 2); ctx.fill();
      [[20,59],[34,74],[48,88]].forEach(([radius, y]) => { ctx.beginPath(); ctx.arc(64, 108, radius, Math.PI * 1.19, Math.PI * 1.81); ctx.stroke(); });
    }
    const side = Math.max(44, Math.round(Math.min(this._customElementForm.canvas_width, this._customElementForm.canvas_height) * .55));
    const object = {
      id: `item-${Date.now()}`,
      type: "image",
      x: Math.round((this._customElementForm.canvas_width - side) / 2),
      y: Math.round((this._customElementForm.canvas_height - side) / 2),
      w: side,
      h: side,
      image: canvas.toDataURL("image/png"),
      tint: "black",
    };
    layer.objects.push(object);
    this._customSelectedObjectId = object.id;
    this._stableCustomRender();
  }

  _renderCustomLayerDesign(layers, activeLayer, selected) {
    const form = this._customElementForm;
    const inspector = selected ? `<div class="layer-inspector">
      <div class="layer-inspector-heading">
        <span><ha-icon icon="${
          selected.type === "text" ? "mdi:format-text" :
          selected.type === "rect" ? "mdi:rectangle-outline" :
          selected.type === "bar_gauge" ? "mdi:chart-bar" :
          selected.type === "pie" ? "mdi:chart-pie" :
          selected.type === "slider" ? "mdi:tune-horizontal" :
          selected.type === "potentiometer" || selected.type === "gauge" ? "mdi:gauge" :
          "mdi:image-outline"
        }"></ha-icon></span>
        <div>
          <h3>Vybraný objekt</h3>
          <small>${
            selected.type === "text" ? "Text" :
            selected.type === "rect" ? "Tvar / Obdélník" :
            selected.type === "bar_gauge" ? "Sloupcový ukazatel" :
            selected.type === "pie" ? "Koláčový / Donut graf" :
            selected.type === "slider" ? "Posuvník / Slider" :
            selected.type === "potentiometer" || selected.type === "gauge" ? "Potenciometr / Budík" :
            "Obrázek"
          }</small>
        </div>
      </div>

      ${selected.type === "text" ? `
        <div class="field"><label>Text</label><textarea data-layer-object="text">${this._escape(selected.text || "")}</textarea></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity"></div>
        <div class="field"><label>Velikost písma</label><input data-layer-object="font_size" type="number" min="8" max="120" value="${Number(selected.font_size || 24)}"></div>
        <label class="check-row"><input data-layer-object="bold" type="checkbox" ${selected.bold ? "checked" : ""}> Tučné písmo</label>
        <div class="field"><label>Zarovnání</label><select data-layer-object="align"><option value="left" ${selected.align === "left" ? "selected" : ""}>Vlevo</option><option value="center" ${selected.align === "center" ? "selected" : ""}>Na střed</option><option value="right" ${selected.align === "right" ? "selected" : ""}>Vpravo</option></select></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva textu", ["black", "red"])}
      ` : selected.type === "rect" ? `
        ${this._renderLayerColorPalette("fill", selected.fill || "none", "Výplň", ["none", "black", "red", "white"])}
        ${this._renderLayerColorPalette("stroke", selected.stroke || "black", "Obrys", ["none", "black", "red", "white"])}
        <div class="field"><label>Tloušťka obrysu (px)</label><input data-layer-object="stroke_width" type="number" min="1" max="20" value="${Number(selected.stroke_width || 2)}"></div>
      ` : selected.type === "bar_gauge" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Ukazatel"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. temperature, battery..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "%")}" placeholder="%, °C, kW, bar, lx..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 75 pro otestování polohy"></div>
        <div class="field"><label>Orientace</label><select data-layer-object="orientation"><option value="horizontal" ${selected.orientation !== "vertical" ? "selected" : ""}>Horizontální</option><option value="vertical" ${selected.orientation === "vertical" ? "selected" : ""}>Vertikální</option></select></div>
        ${this._renderLayerColorPalette("fill", selected.fill || "black", "Barva výplně", ["black", "red", "white", "none"])}
        ${this._renderLayerColorPalette("stroke", selected.stroke || "black", "Obrys", ["black", "red", "none"])}
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit hodnota + jednotka</label>
      ` : selected.type === "pie" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Koláčový graf"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. humidity, percentage..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "%")}" placeholder="%, °C, kW, Pa..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 65 pro vyzkoušení výseče"></div>
        <div class="field"><label>Vnitřní výřez Donut (%)</label><input data-layer-object="hole_percent" type="range" min="0" max="80" value="${Number(selected.hole_percent ?? 45)}"></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva výseče", ["black", "red"])}
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit hodnota v centru</label>
      ` : selected.type === "slider" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Posuvník"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. temperature, power..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "°C")}" placeholder="°C, %, kW, bar, lx..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 45"></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva indikátoru", ["black", "red"])}
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit text s hodnotou</label>
      ` : selected.type === "potentiometer" || selected.type === "gauge" ? `
        <div class="field"><label>Popisek / Název</label><input data-layer-object="label" value="${this._escape(selected.label || "")}" placeholder="Potenciometr"></div>
        <div class="field"><label>Entita Home Assistantu (volitelné)</label><ha-entity-picker data-layer-object-entity="${selected.id}"></ha-entity-picker></div>
        <div class="field"><label>Atribut entity / Zaměřená hodnota (volitelné)</label><input data-layer-object="entity_attribute" value="${this._escape(selected.entity_attribute || selected.entityAttribute || "")}" placeholder="Výchozí: stav entity. Zadejte např. current, voltage..."></div>
        <div class="mini-grid">
          <div class="field"><label>Min hodnota</label><input data-layer-object="min_value" type="number" value="${Number(selected.min_value ?? 0)}"></div>
          <div class="field"><label>Max hodnota</label><input data-layer-object="max_value" type="number" value="${Number(selected.max_value ?? 100)}"></div>
        </div>
        <div class="field"><label>Vlastní jednotka</label><input data-layer-object="unit" value="${this._escape(selected.unit || "°C")}" placeholder="°C, %, kW, bar, lx, Pa, V, A..."></div>
        <div class="field"><label>Testovací / Náhledová hodnota</label><input data-layer-object="sample_value" type="number" value="${selected.sample_value !== undefined ? selected.sample_value : ""}" placeholder="Např. 80 pro vyzkoušení ručičky"></div>
        <div class="field"><label>Typ rozsahu stupnice</label><select data-layer-object="arc_mode"><option value="240" ${selected.arc_mode !== "180" && selected.arc_mode !== "360" ? "selected" : ""}>240° Budík (standard)</option><option value="180" ${selected.arc_mode === "180" ? "selected" : ""}>180° Půlkruh</option><option value="360" ${selected.arc_mode === "360" ? "selected" : ""}>360° Plný kruh</option></select></div>
        <div class="field"><label>Tloušťka rotační čáry (px)</label><input data-layer-object="stroke_width" type="number" min="2" max="20" value="${Number(selected.stroke_width || 6)}"></div>
        ${this._renderLayerColorPalette("color", selected.color || "black", "Barva budíku", ["black", "red"])}
        <label class="check-row"><input data-layer-object="show_arc" type="checkbox" ${selected.show_arc !== false ? "checked" : ""}> Plnit rotační čáru podle hodnoty</label>
        <label class="check-row"><input data-layer-object="show_needle" type="checkbox" ${selected.show_needle !== false ? "checked" : ""}> Zobrazit rotující ručičku</label>
        <label class="check-row"><input data-layer-object="show_value" type="checkbox" ${selected.show_value !== false ? "checked" : ""}> Zobrazit text s hodnotou v centru</label>
      ` : `
        ${this._renderLayerColorPalette("tint", selected.tint || "original", "Barva obrázku", ["original", "black", "red", "white"])}
        <p class="inspector-note">Původní zachová barvy nahraného obrázku. Černá, červená nebo bílá vytvoří barevnou siluetu a zachová průhlednost.</p>
      `}

      <div class="inspector-divider"><span>Poloha a velikost</span></div>
      <div class="mini-grid">${["x","y","w","h"].map((key) => `<div class="field"><label>${key.toUpperCase()}</label><input data-layer-object="${key}" type="number" value="${Math.round(Number(selected[key] || 0))}"></div>`).join("")}</div>
      <button id="deleteLayerObject" class="danger"><ha-icon icon="mdi:trash-can-outline"></ha-icon>Odstranit objekt</button>
    </div>` : `<div class="layer-inspector-empty"><div><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><p>Klikněte na objekt v náhledu a upravte jej zde.</p></div></div>`;

    const layerList = layers.map((layer) => `<article class="layer-list-item ${layer.id === activeLayer?.id ? "active" : ""}" data-custom-layer="${this._escape(layer.id)}"><div class="layer-card-title"><input data-custom-layer-name="${this._escape(layer.id)}" value="${this._escape(layer.name)}" aria-label="Název vrstvy">${layer.id === activeLayer?.id ? `<span>Aktivní</span>` : ""}</div><div class="layer-card-preview"><canvas width="296" height="128" data-custom-layer-preview="${this._escape(layer.id)}"></canvas></div><div class="layer-card-actions"><button data-custom-layer-copy="${this._escape(layer.id)}" class="secondary" title="Duplikovat vrstvu"><ha-icon icon="mdi:content-copy"></ha-icon><span>Kopírovat</span></button><button data-custom-layer-delete="${this._escape(layer.id)}" class="secondary" title="Smazat vrstvu" ${layers.length <= 1 ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon><span>Odstranit</span></button></div></article>`).join("");
    const designCss = `<style>
      .layer-list-item{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:10px;cursor:pointer}.layer-list-item>*{grid-column:1!important}.layer-card-title{display:flex;align-items:center;gap:6px}.layer-card-title input{width:100%;min-width:0;padding:5px 2px;font-size:12px}.layer-card-title span{padding:3px 6px;border-radius:999px;background:rgba(0,162,165,.11);color:var(--dratek-teal);font-size:8px;font-weight:900}.layer-card-preview{padding:6px;border:5px solid #eee8e8;border-radius:999px;border-radius:9px;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.1)}.layer-card-preview canvas{display:block;width:100%;height:auto;background:#fff;border:1px solid rgba(0,0,0,.14);border-radius:2px}.layer-card-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:6px}.layer-card-actions button{min-width:0;min-height:31px;padding:5px;font-size:8px}.layer-card-actions button span{display:inline}.layer-card-actions ha-icon{--mdc-icon-size:15px}
      .default-icon-library{margin-top:10px;border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color)}.default-icon-library summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;cursor:pointer;list-style:none}.default-icon-library summary::-webkit-details-marker{display:none}.default-icon-library summary span{display:flex;align-items:center;gap:7px}.default-icon-library summary ha-icon{color:var(--dratek-teal)}.default-icon-library summary small{color:var(--secondary-text-color);font-size:9px}.default-icon-grid{display:grid;grid-template-columns:repeat(8,minmax(52px,1fr));gap:5px;padding:0 9px 9px}.default-layer-icon{display:grid;place-items:center;gap:3px;min-width:0;min-height:54px;padding:5px;background:var(--card-background-color);color:var(--primary-text-color)}.default-layer-icon ha-icon{--mdc-icon-size:23px;color:var(--dratek-teal)}.default-layer-icon span{font-size:8px}
      .layer-toolbar button{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;font-size:11px;white-space:nowrap}
      .layer-canvas-shell{padding:clamp(18px,3vw,38px)}.layer-device-frame{display:grid;place-items:center;width:min(100%,850px);padding:clamp(14px,2.3vw,30px);border:clamp(7px,1vw,12px) solid #eee8e8;border-radius:clamp(12px,1.8vw,22px);background:#fff;box-shadow:0 14px 38px rgba(15,23,42,.17),inset 0 0 0 1px rgba(0,0,0,.04)}.layer-device-frame canvas{width:100%;max-height:min(48vh,500px);border:1px solid rgba(0,0,0,.17);box-shadow:inset 0 0 5px rgba(0,0,0,.1)}
      .layer-color-field{margin:0;padding:0;border:0}.layer-color-field legend{margin-bottom:7px;color:var(--secondary-text-color);font-size:10px;font-weight:800}.layer-color-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.layer-color-options label{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:7px;padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);cursor:pointer}.layer-color-options label.selected{border-color:var(--dratek-teal);box-shadow:inset 0 0 0 1px var(--dratek-teal)}.layer-color-options input{position:absolute;opacity:0;pointer-events:none}.layer-color-options small{overflow:hidden;color:var(--primary-text-color);font-size:9px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.layer-color-swatch{display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(0,0,0,.2);border-radius:7px}.layer-color-swatch.black{background:#050505}.layer-color-swatch.red{background:#dc140c}.layer-color-swatch.white{background:#fff}.layer-color-swatch.original{background:conic-gradient(#00a2a5,#ff6800,#dc140c,#111,#00a2a5);color:#fff}.layer-color-swatch.none{background:repeating-linear-gradient(135deg,#fff 0 5px,#e5e7eb 5px 10px);color:#c62828}.layer-color-swatch ha-icon{--mdc-icon-size:17px}
      @media(max-width:1050px){.default-icon-grid{grid-template-columns:repeat(4,minmax(52px,1fr))}}@media(max-width:680px){.default-icon-library summary{align-items:flex-start;flex-direction:column}.default-icon-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.layer-card-actions button span{display:none}}
    </style>`;
    return `${designCss}<div class="ha-layer-layout">
      <aside class="layer-list">
        <div class="panel-heading"><div><strong>Vrstvy</strong><small>Každá představuje jeden stav</small></div><button id="addCustomLayer" class="secondary icon-btn" title="Přidat vrstvu"><ha-icon icon="mdi:plus"></ha-icon></button></div>
        ${layerList}
      </aside>
      <main class="layer-stage">
        <div class="layer-toolbar">
          <button data-add-layer-object="text"><ha-icon icon="mdi:format-text"></ha-icon>Text</button>
          <button data-add-layer-object="rect" class="secondary"><ha-icon icon="mdi:rectangle-outline"></ha-icon>Tvar</button>
          <button data-add-layer-object="bar_gauge" class="secondary"><ha-icon icon="mdi:chart-bar"></ha-icon>Sloupec</button>
          <button data-add-layer-object="pie" class="secondary"><ha-icon icon="mdi:chart-pie"></ha-icon>Koláč</button>
          <button data-add-layer-object="slider" class="secondary"><ha-icon icon="mdi:tune-horizontal"></ha-icon>Slider</button>
          <button data-add-layer-object="potentiometer" class="secondary"><ha-icon icon="mdi:gauge"></ha-icon>Potenciometr</button>
          <button id="addLayerImage" class="secondary"><ha-icon icon="mdi:image-plus-outline"></ha-icon>Obrázek</button>
          <input id="layerImageFile" type="file" accept="image/*" hidden>
          <span>${form.canvas_width} × ${form.canvas_height} px</span>
        </div>
        <details class="default-icon-library" open>
          <summary><span><ha-icon icon="mdi:shape-plus-outline"></ha-icon><strong>Knihovna ikon</strong></span><small>Kliknutím vložíte ikonu do vrstvy</small></summary>
          <div class="default-icon-grid">${this._renderDefaultLayerIcons()}</div>
        </details>
        <div class="layer-canvas-shell">
          <div class="layer-device-frame">
            <canvas id="customLayerCanvas" width="${form.canvas_width}" height="${form.canvas_height}"></canvas>
          </div>
        </div>
        <p class="canvas-help">Objekty přetahujte myší. Přesnou polohu, velikost, barvy a rozsahy hodnot upravíte v pravém panelu.</p>
      </main>
      <aside class="layer-properties">${inspector}</aside>
    </div>`;
  }

  _renderCustomLayerRules(layers) {
    const form = this._customElementForm;
    const currentValue = this._customElementCurrentValue(form);
    const currentLayer = this._customLayerForValue(form, currentValue);
    const operators = [["is_on","je zapnuto"],["is_off","je vypnuto"],["equals","rovná se"],["not_equals","nerovná se"],["greater","je větší než"],["greater_equal","je větší nebo rovno"],["less","je menší než"],["less_equal","je menší nebo rovno"],["contains","obsahuje"]];
    const rules = form.condition_rules.map((rule, index) => {
      const needsValue = !["is_on", "is_off"].includes(rule.operator);
      return `<div class="layer-rule"><b>${index + 1}</b><select data-layer-rule-operator="${index}">${operators.map(([value,label]) => `<option value="${value}" ${rule.operator === value ? "selected" : ""}>${label}</option>`).join("")}</select><input data-layer-rule-value="${index}" value="${this._escape(rule.value || "")}" placeholder="Hodnota" ${needsValue ? "" : "disabled"}><span>zobrazí</span><select data-layer-rule-target="${index}">${layers.map((layer) => `<option value="${this._escape(layer.id)}" ${rule.layer_id === layer.id ? "selected" : ""}>${this._escape(layer.name)}</option>`).join("")}</select><button class="secondary icon-btn" data-layer-rule-delete="${index}"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
    }).join("");
    return `<div class="ha-rules-layout"><section class="card rules-source"><span class="step-number">1</span><div><h3>Vyberte zařízení nebo senzor</h3><p>Pravidla budou reagovat na stav této entity v Home Assistantu.</p><div class="field"><label>Entita Home Assistantu</label><ha-entity-picker id="customElementEntity"></ha-entity-picker></div><div class="field"><label>Atribut entity (volitelný)</label><input data-custom-element-field="entity_attribute" value="${this._escape(form.entity_attribute || "")}" placeholder="Například temperature"></div></div></section><section class="card rules-card"><div class="rules-title"><div><span class="step-number">2</span><div><h3>Nastavte, kdy se vrstva zobrazí</h3><p>Pravidla se vyhodnocují shora dolů. Použije se první splněné.</p></div></div><span class="pill muted">Aktuálně: ${this._escape(currentValue || "bez hodnoty")}</span></div><div class="layer-rules">${rules}</div><button id="addLayerRule" class="secondary" ${form.condition_rules.length >= 12 ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon>Přidat pravidlo</button><div class="default-layer"><div><strong>Výchozí vrstva</strong><small>Když žádné pravidlo neplatí.</small></div><select data-custom-element-field="default_layer_id">${layers.map((layer) => `<option value="${this._escape(layer.id)}" ${form.default_layer_id === layer.id ? "selected" : ""}>${this._escape(layer.name)}</option>`).join("")}</select></div></section><aside class="card rule-preview"><h3>Aktuální výsledek</h3><canvas width="${form.canvas_width}" height="${form.canvas_height}" data-custom-layer-preview="${this._escape(currentLayer?.id || "")}"></canvas><strong>${this._escape(currentLayer?.name || "Bez vrstvy")}</strong><small>Hodnota entity: ${this._escape(currentValue || "—")}</small></aside></div>`;
  }

  _migrateCustomElementToLayers(element) {
    if (element?.element_type === "layered") {
      const migrated = { ...this._emptyCustomElementForm(), ...structuredClone(element) };
      migrated.layers = this._storedRecordList(migrated.layers).map((layer, index) => ({
        ...layer,
        id: String(layer.id || `layer-${Date.now()}-${index}`),
        name: String(layer.name || `Vrstva ${index + 1}`),
        objects: this._storedRecordList(layer.objects),
      }));
      migrated.condition_rules = this._storedRecordList(migrated.condition_rules);
      if (!migrated.layers.length) {
        const fallback = { id: `layer-${Date.now()}`, name: "Výchozí", objects: [] };
        migrated.layers = [fallback];
        migrated.default_layer_id = fallback.id;
      }
      if (!migrated.layers.some((layer) => layer.id === migrated.default_layer_id)) {
        migrated.default_layer_id = migrated.layers[0].id;
      }
      return migrated;
    }
    const migrated = this._emptyCustomElementForm();
    migrated.id = element?.id || "";
    migrated.name = element?.name || "";
    migrated.entity_id = element?.entity_id || "";
    migrated.entity_attribute = element?.entity_attribute || "";
    const makeLayer = (name, text, image = "") => ({
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      objects: image
        ? [{ id: `item-${Date.now()}-image`, type: "image", x: 88, y: 4, w: 120, h: 120, image }]
        : [{ id: `item-${Date.now()}-text`, type: "text", x: 28, y: 28, w: 240, h: 72, text, color: element?.color || "black", font_size: 36, bold: true, align: "center" }],
    });
    if (element?.element_type === "status") {
      const on = makeLayer("Zapnuto", `${element.on_symbol || "●"}\n${element.label || "ZAPNUTO"}`);
      const off = makeLayer("Vypnuto", `${element.off_symbol || "○"}\n${element.label || "VYPNUTO"}`);
      migrated.layers = [on, off];
      migrated.condition_rules = [{ operator: "is_on", value: "", layer_id: on.id }, { operator: "is_off", value: "", layer_id: off.id }];
      migrated.default_layer_id = off.id;
    } else {
      const layer = makeLayer(
        element?.name || "Výchozí",
        element?.sample_data || element?.label || element?.name || "Hodnota",
        element?.element_type === "icon" ? element.icon_image || "" : "",
      );
      migrated.layers = [layer];
      migrated.condition_rules = [];
      migrated.default_layer_id = layer.id;
    }
    return migrated;
  }

  _ensureLayeredCustomForm() {
    const form = this._customElementForm;
    if (form.element_type !== "layered") return;
    form.canvas_width = Math.max(128, Math.min(800, Number(form.canvas_width) || 296));
    form.canvas_height = Math.max(64, Math.min(480, Number(form.canvas_height) || 128));
    if (!Array.isArray(form.layers) || !form.layers.length) {
      const layer = { id: `layer-${Date.now()}`, name: "Výchozí", objects: [] };
      form.layers = [layer];
      form.default_layer_id = layer.id;
    }
    form.layers.forEach((layer, index) => {
      layer.id ||= `layer-${Date.now()}-${index}`;
      layer.name ||= `Vrstva ${index + 1}`;
      if (!Array.isArray(layer.objects)) layer.objects = [];
    });
    if (!form.layers.some((layer) => layer.id === form.default_layer_id)) form.default_layer_id = form.layers[0].id;
    if (!this._customActiveLayerId || !form.layers.some((layer) => layer.id === this._customActiveLayerId)) this._customActiveLayerId = form.layers[0].id;
    if (!Array.isArray(form.condition_rules)) form.condition_rules = [];
  }

  _customActiveLayer() {
    this._ensureLayeredCustomForm();
    return (this._customElementForm.layers || []).find((layer) => layer.id === this._customActiveLayerId)
      || this._customElementForm.layers?.[0] || null;
  }

  _customSelectedLayerObject() {
    return this._customActiveLayer()?.objects?.find((object) => object.id === this._customSelectedObjectId) || null;
  }

  _customLayerForValue(element, value) {
    const layers = this._storedRecordList(element.layers);
    const rule = this._storedRecordList(element.condition_rules).find((item) => this._customConditionMatches(value, item.operator || "equals", item.value || ""));
    const id = rule?.layer_id || element.default_layer_id || layers[0]?.id;
    return layers.find((layer) => layer.id === id) || layers[0] || null;
  }

  _drawCustomLayerSelection(ctx, object, scaleX = 1, scaleY = 1) {
    if (!object) return;
    const x = Number(object.x || 0), y = Number(object.y || 0);
    const w = Math.max(1, Number(object.w || 1)), h = Math.max(1, Number(object.h || 1));
    const rot = Number(object.rotation || 0);
    const box = { x, y, w, h };
    const handles = this._handles(box);

    ctx.save();
    if (rot) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.strokeStyle = "#00a2a5";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;

    ctx.setLineDash([4, 2]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);

    const rotHandle = handles.find((h) => h.name === "rotate");
    if (rotHandle) {
      ctx.beginPath();
      ctx.moveTo(box.x + box.w / 2, box.y);
      ctx.lineTo(rotHandle.x, rotHandle.y);
      ctx.strokeStyle = "rgba(0, 162, 165, 0.6)";
      ctx.stroke();
    }

    for (const handle of handles) {
      const isRotate = handle.name === "rotate";
      const size = isRotate ? 12 : 8;
      const half = size / 2;
      ctx.beginPath();
      if (isRotate) {
        ctx.arc(handle.x, handle.y, half, 0, Math.PI * 2);
        ctx.fillStyle = "#ff6800";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#00a2a5";
        ctx.fillRect(handle.x - half, handle.y - half, size, size);
        ctx.strokeRect(handle.x - half, handle.y - half, size, size);
      }
    }
    ctx.restore();
  }

  _drawCustomLayer(ctx, layer, width, height, sourceWidth, sourceHeight, selectedId = "", applyPreview = true) {
    const scaleX = width / Math.max(1, sourceWidth);
    const scaleY = height / Math.max(1, sourceHeight);
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scaleX, scaleY);
    for (const object of layer?.objects || []) {
      const x = Number(object.x || 0), y = Number(object.y || 0);
      const w = Math.max(1, Number(object.w || 1)), h = Math.max(1, Number(object.h || 1));
      ctx.save();
      if (object.rotation) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.translate(cx, cy);
        ctx.rotate((Number(object.rotation) * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      if (object.type === "rect") {
        if (object.fill && object.fill !== "none") {
          ctx.fillStyle = this._color(object.fill);
          ctx.fillRect(x, y, w, h);
        }
        if (object.stroke && object.stroke !== "none") {
          ctx.strokeStyle = this._color(object.stroke);
          ctx.lineWidth = Math.max(1, Number(object.stroke_width || 2));
          ctx.strokeRect(x, y, w, h);
        }
      } else if (object.type === "bar_gauge") {
        this._drawBarGauge(ctx, object, x, y, w, h);
      } else if (object.type === "pie") {
        this._drawPieChart(ctx, object, x, y, w, h);
      } else if (object.type === "slider") {
        this._drawSliderWidget(ctx, object, x, y, w, h);
      } else if (object.type === "potentiometer" || object.type === "gauge") {
        this._drawPotentiometerWidget(ctx, object, x, y, w, h);
      } else if (object.type === "image" && object.image) {
        let image = this._customImageCache.get(object.image);
        if (!image) {
          image = new Image();
          image.onload = () => this._paintCustomLayerCanvases();
          image.src = object.image;
          this._customImageCache.set(object.image, image);
        }
        if (image.complete && image.naturalWidth) this._drawTintedCanvasImage(ctx, image, x, y, w, h, object.tint || "original");
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = this._color(object.color || "black");
        ctx.font = `${object.bold ? "700" : "600"} ${Math.max(8, Number(object.font_size || 24))}px "DRATEK eInk Sans",Arial,sans-serif`;
        ctx.textAlign = object.align || "left";
        ctx.textBaseline = "alphabetic";
        const textX = object.align === "center" ? x + w / 2 : object.align === "right" ? x + w : x;
        const lines = String(object.text || "Text").split("\n");
        const lineHeight = Math.max(10, Number(object.font_size || 24) * 1.08);
        const startY = y + Math.max(0, (h - lineHeight * lines.length) / 2);
        lines.forEach((line, index) => {
          const metrics = ctx.measureText(line || " ");
          const baseline = startY + index * lineHeight + (Number(metrics.actualBoundingBoxAscent) || lineHeight * 0.8);
          ctx.fillText(line, textX, baseline, w);
        });
        ctx.restore();
      }
      ctx.restore();
    }

    if (selectedId) {
      const selectedObj = (layer?.objects || []).find((o) => o.id === selectedId);
      if (selectedObj) {
        this._drawCustomLayerSelection(ctx, selectedObj, scaleX, scaleY);
      }
    }

    ctx.restore();
    if (applyPreview) this._applyEinkPreview(ctx, width, height);
  }

  _paintCustomLayerCanvases() {
    const form = this._customElementForm;
    this.shadowRoot.querySelectorAll("canvas[data-custom-layer-preview]").forEach((canvas) => {
      const owner = canvas.dataset.customElementId
        ? this._customElements.find((element) => element.id === canvas.dataset.customElementId)
        : form;
      const layer = (owner?.layers || []).find((item) => item.id === canvas.dataset.customLayerPreview);
      this._drawCustomLayer(canvas.getContext("2d"), layer, canvas.width, canvas.height, owner?.canvas_width || 296, owner?.canvas_height || 128);
    });
    const canvas = this.shadowRoot.querySelector("#customLayerCanvas");
    if (canvas) this._drawCustomLayer(canvas.getContext("2d"), this._customActiveLayer(), canvas.width, canvas.height, form.canvas_width, form.canvas_height, this._customSelectedObjectId);
  }

  _addCustomLayer() {
    this._ensureLayeredCustomForm();
    const layer = { id: `layer-${Date.now()}`, name: `Vrstva ${this._customElementForm.layers.length + 1}`, objects: [] };
    this._customElementForm.layers.push(layer);
    this._customActiveLayerId = layer.id;
    this._customSelectedObjectId = "";
    this._stableCustomRender();
  }

  _duplicateCustomLayer(layerId) {
    const source = this._customElementForm.layers.find((layer) => layer.id === layerId);
    if (!source) return;
    const copy = structuredClone(source);
    copy.id = `layer-${Date.now()}`;
    copy.name = `${source.name} – kopie`;
    copy.objects = copy.objects.map((object, index) => ({ ...object, id: `item-${Date.now()}-${index}` }));
    this._customElementForm.layers.push(copy);
    this._customActiveLayerId = copy.id;
    this._stableCustomRender();
  }

  _deleteCustomLayer(layerId) {
    if (this._customElementForm.layers.length <= 1) return;
    this._customElementForm.layers = this._customElementForm.layers.filter((layer) => layer.id !== layerId);
    this._customElementForm.condition_rules = this._customElementForm.condition_rules.filter((rule) => rule.layer_id !== layerId);
    if (this._customElementForm.default_layer_id === layerId) this._customElementForm.default_layer_id = this._customElementForm.layers[0].id;
    this._customActiveLayerId = this._customElementForm.layers[0].id;
    this._customSelectedObjectId = "";
    this._stableCustomRender();
  }

  _deleteCustomLayerObject() {
    const layer = this._customActiveLayer();
    if (!layer || !this._customSelectedObjectId) return;
    const previousLength = layer.objects.length;
    layer.objects = layer.objects.filter((object) => object.id !== this._customSelectedObjectId);
    if (layer.objects.length === previousLength) return;
    this._customSelectedObjectId = "";
    this._customLayerDrag = null;
    this._stableCustomRender();
  }

  _addCustomLayerObject(type) {
    const layer = this._customActiveLayer();
    if (!layer) return;
    let object;
    if (type === "rect") {
      object = { id: `item-${Date.now()}`, type: "rect", x: 48, y: 28, w: 120, h: 64, fill: "none", stroke: "black", stroke_width: 2 };
    } else if (type === "bar_gauge") {
      object = { id: `item-${Date.now()}`, type: "bar_gauge", x: 38, y: 28, w: 220, h: 48, label: "Ukazatel", min_value: 0, max_value: 100, unit: "%", orientation: "horizontal", fill: "black", stroke: "black", show_value: true };
    } else if (type === "pie") {
      object = { id: `item-${Date.now()}`, type: "pie", x: 98, y: 14, w: 100, h: 100, label: "Koláčový graf", min_value: 0, max_value: 100, unit: "%", hole_percent: 45, color: "black", show_value: true };
    } else if (type === "slider") {
      object = { id: `item-${Date.now()}`, type: "slider", x: 28, y: 38, w: 240, h: 52, label: "Posuvník", min_value: 0, max_value: 100, unit: "°C", color: "black", show_value: true };
    } else if (type === "potentiometer" || type === "gauge") {
      object = { id: `item-${Date.now()}`, type: "potentiometer", x: 78, y: 14, w: 140, h: 100, label: "Potenciometr", min_value: 0, max_value: 100, unit: "°C", color: "black", stroke_width: 6, arc_mode: "240", show_arc: true, show_needle: true, show_value: true };
    } else {
      object = { id: `item-${Date.now()}`, type: "text", x: 38, y: 38, w: 220, h: 52, text: "Nový text", color: "black", font_size: 28, bold: true, align: "center" };
    }
    layer.objects.push(object);
    this._customSelectedObjectId = object.id;
    this._stableCustomRender();
  }

  _setCustomLayerImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      this._customElementResult = { ok: false, error: "Obrázek může mít maximálně 10 MB." };
      this._stableCustomRender();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const layer = this._customActiveLayer();
      if (!layer) return;
      const side = Math.round(Math.min(this._customElementForm.canvas_width, this._customElementForm.canvas_height) * 0.55);
      const object = { id: `item-${Date.now()}`, type: "image", x: 18, y: 18, w: side, h: side, image: reader.result, tint: "original" };
      layer.objects.push(object);
      this._customSelectedObjectId = object.id;
      this._stableCustomRender();
    };
    reader.readAsDataURL(file);
  }

  _customLayerCanvasPoint(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this._customElementForm.canvas_width / rect.width,
      y: (event.clientY - rect.top) * this._customElementForm.canvas_height / rect.height,
    };
  }

  _onCustomLayerPointerDown(event) {
    const point = this._customLayerCanvasPoint(event);
    const layer = this._customActiveLayer();
    if (!layer) return;

    const selectedObj = this._customSelectedLayerObject();
    if (selectedObj) {
      const box = { x: Number(selectedObj.x || 0), y: Number(selectedObj.y || 0), w: Math.max(1, Number(selectedObj.w || 1)), h: Math.max(1, Number(selectedObj.h || 1)) };
      const handles = this._handles(box);
      const hitHandle = handles.find((h) => Math.hypot(point.x - h.x, point.y - h.y) <= 12);
      if (hitHandle) {
        this._customLayerDrag = {
          mode: hitHandle.name === "rotate" ? "rotate" : "resize",
          handle: hitHandle.name,
          startX: point.x,
          startY: point.y,
          initialBox: { ...box },
          initialRotation: Number(selectedObj.rotation || 0),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        return;
      }
    }

    const clickedObj = [...(layer.objects || [])].reverse().find((item) =>
      point.x >= Number(item.x || 0) && point.x <= Number(item.x || 0) + Number(item.w || 0)
      && point.y >= Number(item.y || 0) && point.y <= Number(item.y || 0) + Number(item.h || 0)
    );

    this._customSelectedObjectId = clickedObj?.id || "";
    if (clickedObj) {
      this._customLayerDrag = {
        mode: "move",
        startX: point.x,
        startY: point.y,
        initialX: Number(clickedObj.x || 0),
        initialY: Number(clickedObj.y || 0),
      };
    } else {
      this._customLayerDrag = null;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this._stableCustomRender();
  }

  _onCustomLayerPointerMove(event) {
    if (!this._customLayerDrag) return;
    const point = this._customLayerCanvasPoint(event);
    const object = this._customSelectedLayerObject();
    if (!object) return;

    const drag = this._customLayerDrag;
    if (drag.mode === "move") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      object.x = Math.max(0, Math.min(this._customElementForm.canvas_width - object.w, Math.round(drag.initialX + dx)));
      object.y = Math.max(0, Math.min(this._customElementForm.canvas_height - object.h, Math.round(drag.initialY + dy)));
    } else if (drag.mode === "resize") {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      let { x, y, w, h } = drag.initialBox;
      if (drag.handle.includes("right")) w = Math.max(8, w + dx);
      if (drag.handle.includes("bottom")) h = Math.max(8, h + dy);
      if (drag.handle.includes("left")) {
        const nw = Math.max(8, w - dx);
        x = x + (w - nw);
        w = nw;
      }
      if (drag.handle.includes("top")) {
        const nh = Math.max(8, h - dy);
        y = y + (h - nh);
        h = nh;
      }
      object.x = Math.round(x);
      object.y = Math.round(y);
      object.w = Math.round(w);
      object.h = Math.round(h);
    } else if (drag.mode === "rotate") {
      const cx = drag.initialBox.x + drag.initialBox.w / 2;
      const cy = drag.initialBox.y + drag.initialBox.h / 2;
      const rad = Math.atan2(point.y - cy, point.x - cx);
      let deg = Math.round((rad * 180 / Math.PI) + 90);
      if (event.shiftKey) deg = Math.round(deg / 15) * 15;
      object.rotation = ((deg % 360) + 360) % 360;
    }
    this._paintCustomLayerCanvases();
  }

  _renderHaElementDesigner() {
    const form = this._customElementForm;
    const meta = this._customElementMeta(form.element_type);
    const isIcon = form.element_type === "icon";
    const sourceReady = isIcon ? Boolean(form.icon_image) : Boolean(form.entity_id);
    const currentValue = this._customElementCurrentValue(form);
    const result = this._customElementResult
      ? `<div class="custom-result ${this._customElementResult.ok ? "good" : "bad"}"><ha-icon icon="${this._customElementResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._escape(this._customElementResult.message || this._customElementResult.error || "")}</div>`
      : "";
    const operators = [
      ["is_on", "Je zapnuto"],
      ["is_off", "Je vypnuto"],
      ["equals", "Rovná se"],
      ["not_equals", "Nerovná se"],
      ["greater", "Je větší než"],
      ["greater_equal", "Je větší nebo rovno"],
      ["less", "Je menší než"],
      ["less_equal", "Je menší nebo rovno"],
      ["contains", "Obsahuje text"],
    ];
    const symbols = [
      ["●", "Plný kruh"], ["○", "Prázdný kruh"], ["✓", "Zaškrtnuto"], ["✕", "Křížek"],
      ["⚡", "Energie"], ["▲", "Šipka nahoru"], ["▼", "Šipka dolů"], ["!", "Varování"],
      ["■", "Plný čtverec"], ["□", "Prázdný čtverec"],
    ];
    const symbolOptions = (selected) => symbols.map(([symbol, name]) => `<option value="${this._escape(symbol)}" ${symbol === selected ? "selected" : ""}>${this._escape(symbol)} · ${name}</option>`).join("");
    const rules = Array.isArray(form.condition_rules) ? form.condition_rules : [];
    const ruleEditor = `<div class="condition-designer">
      <div class="condition-head"><div><strong>Pravidla signalizace</strong><small>Vyhodnocují se shora dolů. Použije se první splněné pravidlo.</small></div><span class="pill muted">Aktuální hodnota: ${this._escape(currentValue || "—")}</span></div>
      <div class="condition-templates"><button class="secondary" data-condition-template="socket"><ha-icon icon="mdi:power-socket-eu"></ha-icon>Zásuvka ON/OFF</button><button class="secondary" data-condition-template="temperature"><ha-icon icon="mdi:thermometer-alert"></ha-icon>Teplotní limity</button><button class="secondary" data-condition-template="limit"><ha-icon icon="mdi:gauge"></ha-icon>Číselný limit</button></div>
      <details class="custom-advanced condition-details">
      <summary>Upravit jednotlivá pravidla (${rules.length})</summary>
      <div class="condition-rules">${rules.map((rule, index) => {
        const needsValue = !["is_on", "is_off"].includes(rule.operator);
        const matches = this._customConditionMatches(currentValue, rule.operator || "equals", rule.value || "");
        return `<article class="condition-rule ${matches ? "matches" : ""}">
          <span class="condition-order">${index + 1}</span>
          <div class="field"><label>Podmínka</label><select data-condition-operator="${index}">${operators.map(([value, label]) => `<option value="${value}" ${value === rule.operator ? "selected" : ""}>${label}</option>`).join("")}</select></div>
          <div class="field ${needsValue ? "" : "condition-unused"}"><label>Porovnat s</label><input data-condition-value="${index}" value="${this._escape(rule.value || "")}" ${needsValue ? "" : "disabled"} placeholder="Například 25"></div>
          <div class="field"><label>Zobrazit ikonu</label><select data-condition-symbol="${index}">${symbolOptions(rule.symbol || "●")}</select></div>
          <button class="secondary icon-btn condition-remove" data-condition-remove="${index}" title="Odstranit pravidlo"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
          ${matches ? `<span class="condition-match"><ha-icon icon="mdi:check-circle"></ha-icon>Právě platí</span>` : ""}
        </article>`;
      }).join("")}</div>
      <div class="condition-footer"><button id="addConditionRule" class="secondary"><ha-icon icon="mdi:plus"></ha-icon>Přidat pravidlo</button><div class="field"><label>Ikona, když neplatí žádné pravidlo</label><select data-custom-element-field="default_symbol">${symbolOptions(form.default_symbol || "?")}<option value="?" ${form.default_symbol === "?" ? "selected" : ""}>? · Neznámý stav</option></select></div></div>
      </details>
    </div>`;
    const graphEditor = `<div class="ha-module-card">
      <div class="ha-module-title"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon><div><strong>Nastavení grafu</strong><small>Graf se automaticky překreslí při změně vybrané entity.</small></div></div>
      <div class="row"><div class="field"><label>Zdroj bodů grafu</label><select data-custom-element-field="history_mode"><option value="rolling" ${form.history_mode !== "attribute" ? "selected" : ""}>Postupně ukládat změny senzoru</option><option value="attribute" ${form.history_mode === "attribute" ? "selected" : ""}>Použít číselný seznam z atributu</option></select></div><div class="field"><label>Počet bodů</label><input data-custom-element-field="history_points" type="number" min="2" max="96" value="${Number(form.history_points || 24)}"></div></div>
      <div class="row"><div class="field"><label>Typ grafu</label><select data-custom-element-field="chart_type"><option value="line" ${form.chart_type === "line" ? "selected" : ""}>Spojnicový</option><option value="bar" ${form.chart_type === "bar" ? "selected" : ""}>Sloupcový</option><option value="area" ${form.chart_type === "area" ? "selected" : ""}>Plošný</option></select></div><div class="field"><label>Aktuální hodnota entity</label><input value="${this._escape(currentValue || "—")}" disabled></div></div>
      ${form.history_mode === "attribute" ? `<div class="ha-hint"><ha-icon icon="mdi:information-outline"></ha-icon>Vyberte atribut, který obsahuje pole čísel, například <code>[1.2, 1.8, 1.4]</code>.</div>` : `<div class="ha-hint"><ha-icon icon="mdi:history"></ha-icon>Integrace si bude pamatovat posledních ${Number(form.history_points || 24)} rozdílných hodnot po dobu běhu Home Assistantu.</div>`}
    </div>`;
    return `<div class="custom-elements-page ha-elements-page">
      <section class="card custom-elements-hero"><div><span class="eyebrow">Designer rozhraní Home Assistantu</span><h2>Vlastní dynamické prvky displeje</h2><p>Vyberte entitu a vytvořte graf, hodnotu nebo stavovou signalizaci. Bez externího API a bez psaní šablon.</p></div><span class="custom-hero-icon"><ha-icon icon="mdi:home-assistant"></ha-icon></span></section>
      ${result}
      <div class="custom-elements-layout">
        <section class="card custom-builder">
          <div class="section-title"><div><h2>${form.id ? "Upravit prvek" : "Nový prvek"}</h2><div class="subtitle">${this._escape(meta.description)}</div></div><button id="customElementNew" class="secondary"><ha-icon icon="mdi:plus"></ha-icon>Nový</button></div>
          <div class="ha-wizard-progress"><span class="done"><b>1</b>Typ</span><span class="${sourceReady ? "done" : "active"}"><b>2</b>${isIcon ? "Obrázek" : "Entita"}</span><span class="${sourceReady ? "active" : ""}"><b>3</b>Chování</span><span><b>4</b>Vzhled</span></div>
          <div class="ux-step"><div class="ux-step-title"><b>1</b><div><strong>Co chcete vytvořit?</strong><small>Vyberte pouze jeden typ prvku.</small></div></div><div class="custom-type-grid">${["status", "value", "chart", "icon"].map((type) => { const item = this._customElementMeta(type); return `<button class="custom-type ${form.element_type === type ? "selected" : ""}" data-custom-type="${type}"><ha-icon icon="${item.icon}"></ha-icon><span>${item.label}</span></button>`; }).join("")}</div>
          <div class="${isIcon ? "" : "row"}"><div class="field"><label>Název prvku</label><input data-custom-element-field="name" value="${this._escape(form.name)}" placeholder="${isIcon ? "Například Ikona zásuvky" : "Například Stav zásuvky"}"></div>${isIcon ? "" : `<div class="field"><label>Barva prvku</label><select data-custom-element-field="color"><option value="black" ${form.color === "black" ? "selected" : ""}>Černá</option><option value="red" ${form.color === "red" ? "selected" : ""}>Červená</option></select></div>`}</div>
          </div>
          ${isIcon ? `<div class="ha-entity-module icon-upload-module"><div class="ux-step-title"><b>2</b><div><strong>Nahrajte vlastní ikonu</strong><small>PNG, JPG, WebP nebo GIF. Obrázek se bezpečně zmenší a uloží jako PNG.</small></div></div><button type="button" id="customIconDrop" class="custom-icon-drop ${form.icon_image ? "has-image" : ""}">${form.icon_image ? `<img src="${this._escape(form.icon_image)}" alt="Nahraná ikona"><span><ha-icon icon="mdi:swap-horizontal"></ha-icon>Změnit obrázek</span>` : `<ha-icon icon="mdi:tray-arrow-down"></ha-icon><strong>Přetáhněte obrázek sem</strong><small>nebo klikněte a vyberte soubor</small>`}</button><input id="customIconFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>` : `<div class="ha-entity-module"><div class="ux-step-title"><b>2</b><div><strong>Vyberte zdroj z Home Assistantu</strong><small>Zásuvka, senzor, pomocník nebo jiná entita.</small></div></div><div class="field"><label>Entita</label><ha-entity-picker id="customElementEntity"></ha-entity-picker></div><details class="custom-advanced"><summary>Pokročilé: použít atribut entity</summary><div class="field"><label>Atribut entity</label><input data-custom-element-field="entity_attribute" value="${this._escape(form.entity_attribute)}" placeholder="Například temperature nebo prices"></div></details></div>`}
          <div class="ux-step-title behavior-title"><b>3</b><div><strong>Nastavte chování</strong><small>${this._escape(meta.description)}</small></div></div>
          ${isIcon ? `<div class="ha-hint value-ready"><ha-icon icon="mdi:cursor-move"></ha-icon>Po vložení vznikne čtvercový obrázkový blok. V hlavním designeru jej můžete přetahovat, otáčet a měnit tažením za rohy.</div>` : form.element_type === "status" ? ruleEditor : form.element_type === "chart" ? graphEditor : `<div class="ha-hint value-ready"><ha-icon icon="mdi:check-circle-outline"></ha-icon>Hodnota entity se zobrazí přímo a při každé změně se automaticky odešle na displej.</div>`}
          <details class="custom-advanced appearance-settings"><summary><span class="summary-step">4</span>Vzhled a velikost</summary>${isIcon ? `<div class="field"><label>Velikost čtverce <strong>${form.width_percent} %</strong></label><input data-custom-element-field="width_percent" type="range" min="10" max="100" value="${form.width_percent}"></div>` : `<div class="row"><div class="field"><label>Popisek</label><input data-custom-element-field="label" value="${this._escape(form.label)}" placeholder="Například Teplota"></div>${form.element_type === "status" ? "" : `<div class="field"><label>Jednotka</label><input data-custom-element-field="unit" value="${this._escape(form.unit)}" placeholder="°C, kWh, %"></div>`}</div>${form.element_type !== "status" ? `<div class="field"><label>Ukázková hodnota${form.element_type === "chart" ? " / počáteční data" : ""}</label><textarea data-custom-element-field="sample_data" rows="2">${this._escape(form.sample_data)}</textarea></div>` : ""}<div class="row"><div class="field"><label>Šířka <strong>${form.width_percent} %</strong></label><input data-custom-element-field="width_percent" type="range" min="10" max="100" value="${form.width_percent}"></div><div class="field"><label>Výška <strong>${form.height_percent} %</strong></label><input data-custom-element-field="height_percent" type="range" min="10" max="100" value="${form.height_percent}"></div></div>`}</details>
          <div class="custom-builder-actions sticky-save"><span>${form.id ? `Upravujete: ${this._escape(form.name)}` : "Nový prvek"}</span><button id="customElementSave" ${this._customElementBusy || !this._customElementFormValid() ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon>${this._customElementBusy ? "Ukládám..." : form.id ? "Uložit změny" : "Přidat do knihovny"}</button></div>
        </section>
        <aside class="custom-side">
          <section class="card custom-live-preview"><div class="section-title"><h2>Živý náhled</h2><span class="pill ${sourceReady ? "good" : "warn"}">${isIcon ? sourceReady ? "Ikona připravena" : "Bez obrázku" : sourceReady ? "Napojeno" : "Bez entity"}</span></div>${this._renderCustomElementVisual(form)}</section>
          <section class="card custom-library"><div class="section-title"><div><h2>Moje HA prvky</h2><div class="subtitle">Dostupné ve všech návrzích</div></div><span class="pill muted">${this._customElements.length}</span></div>
            ${this._customElements.length ? `<div class="custom-library-list">${this._customElements.map((element) => { const item = this._customElementMeta(element.element_type); return `<article class="custom-library-item"><div class="custom-library-head"><span><ha-icon icon="${item.icon}"></ha-icon></span><div><strong>${this._escape(element.name)}</strong><small>${item.label} · ${element.element_type === "icon" ? "obrázkový blok" : this._escape(element.entity_id || "nutno vybrat entitu")}</small></div></div>${this._renderCustomElementVisual(element)}<div class="custom-library-actions"><button data-custom-insert="${element.id}"><ha-icon icon="mdi:vector-square-plus"></ha-icon>Do designeru</button><button class="secondary" data-custom-all="${element.id}"><ha-icon icon="mdi:monitor-multiple"></ha-icon>Do všech</button><button class="secondary icon-btn" data-custom-edit="${element.id}" title="Upravit"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><button class="secondary icon-btn" data-custom-delete="${element.id}" title="Smazat"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div></article>`; }).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:home-edit-outline"></ha-icon><p>Zatím nemáte žádný vlastní HA prvek.</p></div>`}
          </section>
        </aside>
      </div>
    </div>`;
  }

  _renderGatewayWorkspace() {
    const tabs = `<div class="subtabs">
      <button class="subtab ${this._gatewaySubtab === "manage" ? "active" : ""}" data-gateway-tab="manage"><ha-icon icon="mdi:router-wireless-settings"></ha-icon>Sprava gateway</button>
      <button class="subtab ${this._gatewaySubtab === "discover" ? "active" : ""}" data-gateway-tab="discover"><ha-icon icon="mdi:access-point-network"></ha-icon>Vyhledani v siti</button>
      <button class="subtab ${this._gatewaySubtab === "create" ? "active" : ""}" data-gateway-tab="create"><ha-icon icon="mdi:plus-network-outline"></ha-icon>Vytvorit gateway</button>
    </div>`;
    if (this._gatewaySubtab === "discover") {
      return `${tabs}<div class="card"><div class="section-title"><h2>Vyhledani gateway v siti</h2><div class="toolbar"><button id="discoverGateways" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:access-point-network"></ha-icon>${this._gatewayBusy ? "Pracuji..." : "Vyhledat gatewaye"}</button><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Obnovit stav</button></div></div>${this._renderDiscoveredGateways()}</div>${this._renderGatewayResult()}`;
    }
    if (this._gatewaySubtab === "create") {
      return `${tabs}<div class="card"><div class="section-title"><h2>Vytvorit vlastni gateway</h2><div class="toolbar"><button id="refreshSerialPorts" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:usb-port"></ha-icon>Nacist porty</button><button id="serialStatus" class="secondary" ${this._gatewayBusy || !this._flashForm.port ? "disabled" : ""}><ha-icon icon="mdi:console"></ha-icon>USB status</button><button id="serialWifi" class="secondary" ${this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid ? "disabled" : ""}><ha-icon icon="mdi:wifi-cog"></ha-icon>Poslat Wi-Fi</button><button id="flashGateway" ${this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid ? "disabled" : ""}><ha-icon icon="mdi:chip"></ha-icon>Flashnout ESP32</button></div></div>${this._renderNoSerialPortsWarning()}<div class="row"><div class="field"><label>USB / serial port</label><select id="flashPort">${this._serialPorts.length ? this._serialPorts.map((port) => `<option value="${this._escape(port.device)}" ${port.device === this._flashForm.port ? "selected" : ""}>${this._escape(port.device)} - ${this._escape(port.description || port.name || "")}</option>`).join("") : `<option value="">Zadny port nenalezen</option>`}</select></div><div class="field"><label>Typ ESP32</label><select id="flashChip"><option value="esp32s3" ${this._flashForm.chip === "esp32s3" ? "selected" : ""}>ESP32-S3</option><option value="esp32" ${this._flashForm.chip === "esp32" ? "selected" : ""}>ESP32 / ESP32-WROOM</option></select></div></div><div class="row"><div class="field"><label>Nazev gatewaye</label><input id="flashHostname" value="${this._escape(this._flashForm.hostname)}" placeholder="dratek-eink-gateway_112016022026"></div><div class="field"><label>Wi-Fi SSID</label><input id="flashSsid" value="${this._escape(this._flashForm.ssid)}" placeholder="Nazev Wi-Fi"></div></div><div class="row"><div class="field"><label>Wi-Fi heslo</label><input id="flashPassword" type="password" value="${this._escape(this._flashForm.password)}" placeholder="Heslo"></div><div class="field"><label>Firmware</label><input value="${this._flashForm.chip === "esp32s3" ? "ESP32-S3 build" : "ESP32 build"}" disabled></div></div>${this._renderFlashResult()}${this._renderSerialResult()}</div>`;
    }
    return `${tabs}<div class="card"><div class="section-title"><h2>Sprava gateway</h2><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Obnovit stav</button></div>${this._renderGateways()}${this._renderOtaResult()}</div>${this._renderGatewayResult()}`;
  }

  _normalizeGatewayIdentity(value) {
    return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\.$/, "");
  }

  _matchingStoredGateway(discovered) {
    const discoveredId = this._normalizeGatewayIdentity(discovered.gateway_id);
    const discoveredHosts = new Set([
      discovered.host,
      discovered.server,
      discovered.name,
    ].map((value) => this._normalizeGatewayIdentity(value)).filter(Boolean));
    return this._gateways.find((gateway) => {
      const status = gateway.status || {};
      if (discoveredId && discoveredId === this._normalizeGatewayIdentity(status.gateway_id)) return true;
      return [gateway.host, status.ip, status.hostname]
        .map((value) => this._normalizeGatewayIdentity(value))
        .filter(Boolean)
        .some((value) => discoveredHosts.has(value));
    }) || null;
  }

  _effectiveViewMode(mode, count) {
    return mode === "auto" ? (count > 8 ? "compact" : "full") : mode;
  }

  _renderDensityControl(scope, mode, count) {
    const options = [
      ["full", "mdi:view-dashboard", "Plné"],
      ["large", "mdi:view-grid-outline", "Velké"],
      ["compact", "mdi:view-grid-compact", "Malé"],
      ["list", "mdi:view-list", "Seznam"],
    ];
    const effective = this._effectiveViewMode(mode, count);
    return `<div class="density-toolbar"><span>Zobrazení</span><div class="density-switch">${options.map(([value, icon, label]) => `<button class="${effective === value ? "active" : ""}" data-view-scope="${scope}" data-view-mode="${value}" title="${label}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("")}</div></div>`;
  }

  _topologyGroups(devices) {
    const groups = new Map();
    (devices || []).forEach((device) => {
      const paths = device.paths || [];
      const preferred = device.preferred_path || null;
      const matchingPath = preferred
        ? paths.find((path) => path.type === preferred.type && String(path.id ?? "") === String(preferred.id ?? ""))
        : null;
      const path = matchingPath ? { ...preferred, ...matchingPath } : (preferred || paths[0] || null);
      const identity = path
        ? (path.id || path.gateway_id || path.host || path.name || "default")
        : "unavailable";
      const key = `${path?.type || "unavailable"}:${String(identity).trim().toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, { key, path, devices: [] });
      groups.get(key).devices.push({
        device,
        rssi: Number(path?.rssi ?? device.rssi),
        preferred: Boolean(preferred),
      });
    });
    return [...groups.values()].sort((a, b) => {
      const rank = (group) => group.path?.type === "gateway" ? 0 : group.path?.type === "local" ? 1 : 2;
      return rank(a) - rank(b) || String(a.path?.name || "").localeCompare(String(b.path?.name || ""), "cs");
    });
  }

  _renderTopology(devices, preparedGroups = null) {
    const groups = preparedGroups || this._topologyGroups(devices);
    if (!groups.length) {
      return `<div class="inspector-empty"><ha-icon icon="mdi:lan-disconnect"></ha-icon><p>Zatím není dostupný žádný displej.</p></div>`;
    }
    return `<div class="connection-map">${groups.map((group) => {
      const path = group.path;
      const local = path?.type === "local";
      const gateway = path?.type === "gateway";
      const name = path?.name || (local ? "Home Assistant Bluetooth" : "Bez dostupné trasy");
      const detail = local ? "Integrované Bluetooth / proxy" : gateway ? (path.host || "Wi-Fi gateway") : "Displej momentálně nemá známou cestu";
      return `<section class="connection-group ${gateway ? "is-gateway" : local ? "is-local" : "is-unavailable"}">
        <div class="connection-hub">
          <span class="connection-hub-icon"><ha-icon icon="${gateway ? "mdi:router-wireless" : local ? "mdi:home-assistant" : "mdi:lan-disconnect"}"></ha-icon></span>
          <div class="connection-hub-copy"><small>${gateway ? "DRATEK gateway" : local ? "Home Assistant" : "Nedostupné"}</small><strong>${this._escape(name)}</strong><span>${this._escape(detail)}</span></div>
          <span class="connection-count">${group.devices.length}</span>
        </div>
        <div class="connection-bus" aria-hidden="true"></div>
        <div class="connection-devices">${group.devices.map(({ device, rssi, preferred }) => `<button class="connection-device" data-select-device="${this._escape(device.address)}" title="Otevřít ${this._escape(this._deviceTitle(device))} v designeru">
          <span class="connection-device-icon"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></span>
          <span class="connection-device-copy"><strong>${this._escape(this._deviceTitle(device))}</strong><small>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</small></span>
          <span class="connection-device-signal">${this._renderSignalBars(rssi)}<small class="signal-value ${this._signalClass(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</small>${preferred ? `<span class="connection-active" title="Aktivní cesta"><ha-icon icon="mdi:check-circle"></ha-icon></span>` : ""}</span>
        </button>`).join("")}</div>
      </section>`;
    }).join("")}</div>`;
  }

  _renderDiscoveredGateways() {
    if (!this._gatewayDiscovery.length) {
      return `<div class="inspector-empty"><ha-icon icon="mdi:access-point-network"></ha-icon><p>Klikni na vyhledani. Gatewaye se hledaji pres mDNS sluzbu v lokalni siti.</p></div>`;
    }
    return `<div class="device-grid">${this._gatewayDiscovery.map((gateway, index) => {
      const stored = this._matchingStoredGateway(gateway);
      return `<div class="device-card">
      <div class="device-card-top"><div><strong>${this._escape(stored?.name || gateway.name || "DRATEK eInk gateway")}</strong><span>${this._escape(gateway.server || gateway.host)}</span></div><span class="pill ${stored ? "muted" : "good"}">${stored ? "Jiz pridana" : "Nalezena"}</span></div>
      <div class="device-meta"><span>IP ${this._escape(gateway.host || "-")}</span><span>FW ${this._escape(gateway.firmware || "-")}</span><span>ID ${this._escape(gateway.gateway_id || "-")}</span></div>
      <div class="toolbar">${stored ? `<span class="pill good"><ha-icon icon="mdi:check-circle-outline"></ha-icon>Ulozena jako ${this._escape(stored.name)}</span>` : `<button data-add-discovered-gateway="${index}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:plus-network-outline"></ha-icon>Pridat</button>`}</div>
    </div>`;
    }).join("")}</div>`;
  }

  _renderFlashResult() {
    if (!this._flashResult) return "";
    const running = this._flashResult.ok === null || ["queued", "running"].includes(this._flashResult.status);
    const cls = running ? "warn" : this._flashResult.ok ? "good" : "bad";
    const message = running
      ? `Flash probiha: ${this._flashResult.status || "running"}`
      : this._flashResult.ok ? "ESP32 gateway byla flashnuta a Wi-Fi konfigurace odeslana." : `Flash selhal: ${this._flashResult.error || "neznamy problem"}`;
    const log = (this._flashResult.log || []).join("\n");
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(message)}</span>${log ? `<pre class="gateway-log">${this._escape(log)}</pre>` : ""}</div>`;
  }

  _renderSerialResult() {
    if (!this._serialResult) return "";
    const running = this._serialResult.ok === null;
    const cls = running ? "warn" : this._serialResult.ok ? "good" : "bad";
    const payload = this._serialResult.payload || {};
    const message = running
      ? "Cekam na odpoved ESP32 pres USB serial..."
      : this._serialResult.ok ? "ESP32 odpovedelo pres USB serial." : `USB diagnostika selhala: ${this._serialResult.error || "bez odpovedi"}`;
    const facts = payload && Object.keys(payload).length
      ? `<div class="device-meta"><span>FW ${this._escape(payload.firmware || "-")}</span><span>SSID ${this._escape(payload.stored_ssid || "-")}</span><span>Wi-Fi ${payload.wifi_connected ? "pripojeno" : "nepripojeno"}</span><span>IP ${this._escape(payload.ip || "-")}</span><span>RSSI ${this._escape(payload.wifi_rssi ?? "-")}</span></div>`
      : "";
    const log = (this._serialResult.log || []).join("\n");
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(message)}</span>${facts}${log ? `<pre class="gateway-log">${this._escape(log)}</pre>` : ""}</div>`;
  }

  _renderOtaResult() {
    if (!this._otaResult) return "";
    const running = this._otaResult.ok === null || !["done", "failed"].includes(this._otaResult.status);
    const cls = running ? "warn" : this._otaResult.ok ? "good" : "bad";
    const progress = Math.max(0, Math.min(100, Number(this._otaResult.progress) || 0));
    const message = running
      ? `OTA aktualizace: ${this._otaResult.status || "priprava"} (${progress} %)`
      : this._otaResult.ok
        ? `OTA dokonceno. Gateway bezi na ${this._escape(this._otaResult.reported_version || this._otaResult.target_version || "novem firmware")}.`
        : `OTA selhalo: ${this._escape(this._otaResult.error || "neznamy problem")}`;
    const log = (this._otaResult.log || []).join("\n");
    return `<div class="send-result"><span class="pill ${cls}">${message}</span><div class="ota-progress"><span style="width:${progress}%"></span></div>${log ? `<pre class="gateway-log">${this._escape(log)}</pre>` : ""}</div>`;
  }

  _renderNoSerialPortsWarning() {
    if (!this._serialPortsLoaded || this._serialPorts.length) return "";
    return `<div class="send-result"><span class="pill bad">Nebyl nalezen zadny USB / serial port</span><p><strong>Pozor:</strong> ESP32 musi byt pripojene primo do hardwaru, na kterem bezi Home Assistant. Nestaci pripojit ESP32 do jineho pocitace v siti, ze ktereho Home Assistant jen spravujes. Pro flash firmware do gateway musi byt ESP32 fyzicky zapojene do USB portu HA stroje.</p></div>`;
  }

  _gatewayWebUrl(gateway) {
    const status = gateway?.status || {};
    const raw = String(status.ip || gateway?.host || "").trim();
    if (!raw) return "";
    const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
      const url = new URL(candidate);
      return ["http:", "https:"].includes(url.protocol) ? url.href.replace(/\/$/, "") : "";
    } catch (_err) {
      return "";
    }
  }

  _gatewayConnectedDisplays(gateway) {
    const gatewayId = String(gateway?.id || "");
    const hosts = new Set([
      gateway?.host,
      gateway?.status?.ip,
      gateway?.status?.hostname,
    ].map((value) => this._normalizeGatewayIdentity(value)).filter(Boolean));
    return (this._result?.devices || []).filter((device) => (device.paths || []).some((path) =>
      path.type === "gateway"
      && (String(path.id || "") === gatewayId || hosts.has(this._normalizeGatewayIdentity(path.host)))));
  }

  _formatGatewayUptime(value) {
    const seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
    if (!seconds) return "-";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  }

  _renderGateways() {
    if (!this._gateways.length) {
      return `<div class="empty-state"><div class="empty-icon">GW</div><h2>Zadne gatewaye</h2><p>Pripoj ESP32 s DRATEK eInk firmwarem do Wi-Fi a pridej jeho IP adresu nebo .local hostname.</p></div>`;
    }
    const css = `<style>
      .gateway-overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:16px}.gateway-overview-card{position:relative;display:grid;gap:14px;padding:17px;border:1px solid var(--divider-color);border-radius:16px;background:var(--card-background-color);box-shadow:0 10px 30px rgba(15,23,42,.08);cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.gateway-overview-card:hover,.gateway-overview-card:focus-visible{transform:translateY(-2px);border-color:rgba(0,162,165,.48);box-shadow:0 16px 38px rgba(15,23,42,.13);outline:0}.gateway-overview-card.offline{border-left:4px solid #c62828}.gateway-overview-card.unknown{border-left:4px solid #f59e0b}.gateway-overview-card.online{border-left:4px solid var(--dratek-teal)}.gateway-card-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px}.gateway-state-dot{width:11px;height:11px;border-radius:50%;background:#9ca3af;box-shadow:0 0 0 4px rgba(156,163,175,.14)}.online .gateway-state-dot{background:var(--dratek-teal);box-shadow:0 0 0 4px rgba(0,162,165,.14)}.offline .gateway-state-dot{background:#c62828;box-shadow:0 0 0 4px rgba(198,40,40,.12)}.unknown .gateway-state-dot{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.14)}.gateway-card-title{min-width:0}.gateway-card-title strong,.gateway-card-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gateway-card-title strong{font-size:17px}.gateway-card-title span{margin-top:3px;color:var(--secondary-text-color);font-size:10px}.gateway-open-mark{display:flex;align-items:center;gap:5px;color:var(--dratek-teal);font-size:9px;font-weight:850}.gateway-open-mark ha-icon{--mdc-icon-size:18px}
      .gateway-card-main{display:grid;grid-template-columns:minmax(155px,.72fr) minmax(0,1.3fr);gap:14px;align-items:stretch}.gateway-hardware-visual{display:grid;place-items:center;align-content:center;min-height:180px;padding:14px;border-radius:12px;background:radial-gradient(circle at 50% 20%,rgba(255,255,255,.95),rgba(0,162,165,.07));border:1px solid rgba(0,162,165,.18)}.gateway-hardware-visual>small{margin-top:10px;color:var(--secondary-text-color);font-size:9px;font-weight:800}.esp-board{position:relative;width:112px;height:154px;border:7px solid #177d68;border-radius:12px;background:linear-gradient(145deg,#24a788,#087963);box-shadow:0 11px 24px rgba(15,118,96,.25),inset 0 0 0 2px rgba(255,255,255,.13)}.esp-board:before,.esp-board:after{content:"";position:absolute;top:7px;bottom:7px;width:8px;background:repeating-linear-gradient(to bottom,#d9b552 0 5px,transparent 5px 10px)}.esp-board:before{left:-12px}.esp-board:after{right:-12px}.esp-antenna{position:absolute;left:19px;right:19px;top:8px;height:25px;border:3px solid #d8e0d9;border-bottom:0;border-radius:5px;background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(255,255,255,.4) 7px 10px)}.esp-chip{position:absolute;display:grid;place-items:center;left:18px;right:18px;top:48px;height:53px;border-radius:5px;background:#222;color:#fff;font-size:11px;font-weight:900;box-shadow:inset 0 0 0 2px #3c3c3c}.esp-usb{position:absolute;left:36px;right:36px;bottom:-10px;height:22px;border-radius:4px;background:linear-gradient(#e9ecef,#9ca3af);border:2px solid #6b7280}.esp-leds{position:absolute;display:flex;gap:5px;right:12px;bottom:16px}.esp-leds i{width:7px;height:7px;border-radius:50%;background:#ff6800;box-shadow:0 0 6px rgba(255,104,0,.8)}.esp-leds i:last-child{background:#00f0b5;box-shadow:0 0 6px rgba(0,240,181,.8)}
      .gateway-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gateway-fact{min-width:0;padding:10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--secondary-background-color)}.gateway-fact small,.gateway-fact strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gateway-fact small{color:var(--secondary-text-color);font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.gateway-fact strong{margin-top:4px;font-size:11px}.gateway-fact.wide{grid-column:1/-1}.gateway-fact-signal{display:flex;align-items:center;gap:7px;margin-top:4px}.gateway-fact-signal strong{margin:0}.gateway-displays{display:flex;align-items:center;gap:7px;min-width:0;padding:10px;border-radius:10px;background:rgba(0,162,165,.07);border:1px solid rgba(0,162,165,.2)}.gateway-displays>ha-icon{color:var(--dratek-teal)}.gateway-displays-copy{min-width:0;flex:1}.gateway-displays-copy strong,.gateway-displays-copy small{display:block}.gateway-displays-copy small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}.gateway-display-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.gateway-display-tags span{max-width:150px;overflow:hidden;padding:3px 6px;border-radius:999px;background:var(--card-background-color);font-size:8px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.gateway-diagnostics{border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color)}.gateway-diagnostics summary{display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;font-size:10px;font-weight:850}.gateway-diagnostics summary ha-icon{color:var(--dratek-teal)}.gateway-diagnostics .device-meta{margin:0;padding:0 11px 11px}.gateway-card-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.gateway-card-actions button{min-width:0;padding:7px 5px;font-size:8px}.gateway-card-actions ha-icon{--mdc-icon-size:16px}
      @media(max-width:900px){.gateway-overview-grid{grid-template-columns:1fr}.gateway-card-main{grid-template-columns:150px minmax(0,1fr)}}@media(max-width:600px){.gateway-overview-grid{grid-template-columns:minmax(0,1fr)}.gateway-overview-card{padding:13px}.gateway-card-main{grid-template-columns:1fr}.gateway-hardware-visual{min-height:165px}.gateway-summary{grid-template-columns:1fr 1fr}.gateway-card-actions{grid-template-columns:1fr 1fr}.gateway-card-actions button:nth-last-child(1){grid-column:1/-1}.gateway-open-mark span{display:none}}
    </style>`;
    return `${css}<div class="gateway-overview-grid">${this._gateways.map((gateway) => {
      const status = gateway.status || {};
      const online = status.ok === true;
      const unknown = status.ok === null || status.ok === undefined;
      const stateClass = online ? "online" : unknown ? "unknown" : "offline";
      const cls = online ? "good" : unknown ? "warn" : "bad";
      const text = online ? "Online" : unknown ? "Neovereno" : "Offline";
      const otaReady = online && status.ota_supported === true;
      const currentFirmware = CURRENT_GATEWAY_FIRMWARES.has(String(status.firmware || "").trim());
      const otaLabel = currentFirmware ? "Firmware aktualni" : otaReady ? "Aktualizovat FW" : "Nejprve USB flash";
      const editing = this._editingGatewayId === gateway.id;
      const wifiRssi = Number(status.wifi_rssi);
      const chip = String(status.chip || "ESP32").toUpperCase().replace("ESP32S3", "ESP32-S3");
      const webUrl = this._gatewayWebUrl(gateway);
      const displays = this._gatewayConnectedDisplays(gateway);
      const networkAddress = status.ip || gateway.host || "-";
      return `<article class="gateway-overview-card ${stateClass}" data-gateway-open="${this._escape(webUrl)}" role="link" tabindex="${webUrl ? "0" : "-1"}" aria-label="Otevřít webové rozhraní gatewaye ${this._escape(gateway.name)}">
        <header class="gateway-card-header"><span class="gateway-state-dot"></span><div class="gateway-card-title">${editing
          ? `<div class="gateway-name-edit"><input data-gateway-name-input="${this._escape(gateway.id)}" value="${this._escape(this._gatewayNameDraft)}"><button class="icon-btn" data-gateway-name-save="${this._escape(gateway.id)}" title="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button><button class="icon-btn secondary" data-gateway-name-cancel title="Zrušit"><ha-icon icon="mdi:close"></ha-icon></button></div>`
          : `<strong>${this._escape(gateway.name)}</strong><span>${this._escape(status.hostname || gateway.host)}</span>`}</div><span class="pill ${cls}">${text}</span></header>
        <div class="gateway-card-main">
          <div class="gateway-hardware-visual"><div class="esp-board" aria-label="${this._escape(chip)}"><i class="esp-antenna"></i><strong class="esp-chip">${this._escape(chip)}</strong><i class="esp-usb"></i><span class="esp-leds"><i></i><i></i></span></div><small>Gateway běží na ${this._escape(chip)}</small></div>
          <div class="gateway-summary">
            <div class="gateway-fact wide"><small>IP adresa / host</small><strong>${this._escape(networkAddress)}</strong></div>
            <div class="gateway-fact"><small>Firmware</small><strong>${this._escape(status.firmware || "-")}</strong></div>
            <div class="gateway-fact"><small>BLE služba</small><strong>${status.ble_initialized === true ? "Aktivní" : status.ble_initialized === false ? "Čeká" : "-"}</strong></div>
            <div class="gateway-fact"><small>Wi-Fi signál</small><div class="gateway-fact-signal">${this._renderSignalBars(wifiRssi)}<strong class="${this._signalClass(wifiRssi)}">${Number.isFinite(wifiRssi) ? `${wifiRssi} dBm` : "-"}</strong></div></div>
            <div class="gateway-fact"><small>Doba běhu</small><strong>${this._formatGatewayUptime(status.uptime_ms)}</strong></div>
            <div class="gateway-fact wide"><small>Webové rozhraní</small><strong class="gateway-open-mark"><ha-icon icon="mdi:open-in-new"></ha-icon><span>${webUrl ? `Kliknutím otevřít ${this._escape(webUrl)}` : "Adresa není dostupná"}</span></strong></div>
          </div>
        </div>
        <div class="gateway-displays"><ha-icon icon="mdi:tablet-dashboard"></ha-icon><div class="gateway-displays-copy"><strong>${displays.length} ${displays.length === 1 ? "připojený displej" : displays.length >= 2 && displays.length <= 4 ? "připojené displeje" : "připojených displejů"}</strong><small>Displeje, které používají tuto gateway</small>${displays.length ? `<div class="gateway-display-tags">${displays.slice(0, 6).map((device) => `<span>${this._escape(this._deviceTitle(device))}</span>`).join("")}${displays.length > 6 ? `<span>+${displays.length - 6}</span>` : ""}</div>` : ""}</div></div>
        <details class="gateway-diagnostics"><summary><ha-icon icon="mdi:chart-box-outline"></ha-icon>Technické informace</summary><div class="device-meta">
          <span>FW ${this._escape(status.firmware || "-")}</span>
          <span>Čip ${this._escape(chip)}</span>
          <span>IP ${this._escape(status.ip || "-")}</span>
          <span>RSSI ${this._escape(status.wifi_rssi ?? "-")}</span>
          <span>Heap ${this._escape(status.free_heap ?? "-")}</span>
          <span>Min heap ${this._escape(status.minimum_free_heap ?? "-")}</span>
          <span>Nejvetsi blok ${this._escape(status.largest_free_block ?? "-")}</span>
          <span>Restart ${this._escape(status.reset_reason || "-")}</span>
          <span>mDNS ${status.mdns_started === true ? "aktivni" : status.mdns_started === false ? "neaktivni" : "-"}</span>
          <span>BLE ${status.ble_initialized === true ? "aktivni" : status.ble_initialized === false ? "ceka" : "-"}</span>
          <span>Přenos ${this._escape(status.transfer_status || "-")}</span>
          <span>OTA slot ${status.update_partition_size ? `${Math.round(Number(status.update_partition_size) / 1024)} kB` : "-"}</span>
        </div></details>
        <footer class="gateway-card-actions"><button class="secondary" data-gateway-rename="${this._escape(gateway.id)}" ${this._gatewayBusy || editing ? "disabled" : ""}><ha-icon icon="mdi:pencil-outline"></ha-icon>Přejmenovat</button><button data-gateway-scan="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:radar"></ha-icon>BLE scan</button><button data-gateway-ota="${this._escape(gateway.id)}" ${this._gatewayBusy || !otaReady || currentFirmware ? "disabled" : ""} title="${currentFirmware ? "Gateway má aktuální firmware" : otaReady ? "Nahrát aktuální firmware z instalace HA" : "OTA se aktivuje prvním USB flashem verze 0.1.38"}"><ha-icon icon="${currentFirmware ? "mdi:check-circle-outline" : "mdi:update"}"></ha-icon>${otaLabel}</button><button class="secondary" data-gateway-refresh="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Status</button><button class="danger" data-gateway-delete="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></footer>
      </article>`;
    }).join("")}</div>`;
  }

  _renderGatewayDevices(devices) {
    return `<table><thead><tr><th>Adresa</th><th>Nazev</th><th>RSSI</th><th>DRATEK</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.address || "")}</td><td>${this._escape(device.name || "")}</td><td>${this._escape(device.rssi ?? "")}</td><td>${device.dratek ? "ano" : "ne"}</td></tr>`).join("")}</tbody></table>`;
  }

  _bind() {
    this.shadowRoot.querySelector("#scan")?.addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#scanDevicesTab")?.addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#refreshQueue")?.addEventListener("click", () => this._loadQueue(true));
    this.shadowRoot.querySelector("#queueSearch")?.addEventListener("input", (event) => {
      this._queueSearch = event.target.value;
      this._render();
    });
    this.shadowRoot.querySelector("#queueStatusFilter")?.addEventListener("change", (event) => {
      this._queueStatusFilter = event.target.value;
      this._render();
    });
    this.shadowRoot.querySelector("#queueDeviceFilter")?.addEventListener("change", (event) => {
      this._queueDeviceFilter = event.target.value;
      this._render();
    });
    this.shadowRoot.querySelector("#queueLimit")?.addEventListener("change", (event) => {
      this._queueLimit = Number(event.target.value);
      this._render();
    });
    this.shadowRoot.querySelector("#clearQueueHistory")?.addEventListener("click", async () => {
      await this._hass.callWS({ type: "dratek_eink/queue/clear" });
      await this._loadQueue(true);
    });
    this.shadowRoot.querySelector("#discoverGateways")?.addEventListener("click", () => this._discoverGateways());
    this.shadowRoot.querySelector("#refreshGateways")?.addEventListener("click", () => this._loadGateways(true));
    this.shadowRoot.querySelectorAll("[data-gateway-tab]").forEach((button) => button.addEventListener("click", () => {
      this._gatewaySubtab = button.dataset.gatewayTab;
      this._gatewayResult = null;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-add-discovered-gateway]").forEach((button) => button.addEventListener("click", () => this._addDiscoveredGateway(button.dataset.addDiscoveredGateway)));
    const syncFlashButton = () => {
      const flashButton = this.shadowRoot.querySelector("#flashGateway");
      const statusButton = this.shadowRoot.querySelector("#serialStatus");
      const wifiButton = this.shadowRoot.querySelector("#serialWifi");
      if (flashButton) flashButton.disabled = this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid;
      if (statusButton) statusButton.disabled = this._gatewayBusy || !this._flashForm.port;
      if (wifiButton) wifiButton.disabled = this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid;
    };
    this.shadowRoot.querySelector("#refreshSerialPorts")?.addEventListener("click", async () => { await this._loadSerialPorts(); this._render(); this._paint(); });
    this.shadowRoot.querySelector("#flashPort")?.addEventListener("change", (event) => { this._flashForm.port = event.target.value; syncFlashButton(); });
    this.shadowRoot.querySelector("#flashChip")?.addEventListener("change", (event) => { this._flashForm.chip = event.target.value; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#flashSsid")?.addEventListener("input", (event) => { this._flashForm.ssid = event.target.value; syncFlashButton(); });
    this.shadowRoot.querySelector("#flashPassword")?.addEventListener("input", (event) => { this._flashForm.password = event.target.value; });
    this.shadowRoot.querySelector("#flashHostname")?.addEventListener("input", (event) => { this._flashForm.hostname = event.target.value; });
    this.shadowRoot.querySelector("#flashGateway")?.addEventListener("click", () => this._flashGateway());
    this.shadowRoot.querySelector("#serialStatus")?.addEventListener("click", () => this._serialGatewayStatus());
    this.shadowRoot.querySelector("#serialWifi")?.addEventListener("click", () => this._serialGatewayWifi());
    const openGatewayWeb = (card) => {
      const url = card.dataset.gatewayOpen;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };
    this.shadowRoot.querySelectorAll("[data-gateway-open]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button,input,select,textarea,a,details,summary")) return;
        openGatewayWeb(card);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openGatewayWeb(card);
      });
    });
    this.shadowRoot.querySelectorAll("[data-gateway-scan]").forEach((button) => button.addEventListener("click", () => this._scanGateway(button.dataset.gatewayScan)));
    this.shadowRoot.querySelectorAll("[data-gateway-ota]").forEach((button) => button.addEventListener("click", () => this._startGatewayOta(button.dataset.gatewayOta)));
    this.shadowRoot.querySelectorAll("[data-gateway-refresh]").forEach((button) => button.addEventListener("click", async () => {
      this._gatewayBusy = true;
      this._render();
      try {
        const result = await this._hass.callWS({ type: "dratek_eink/gateways/refresh", gateway_id: button.dataset.gatewayRefresh });
        const updated = result.gateways && result.gateways[0];
        if (updated) this._gateways = this._gateways.map((gateway) => gateway.id === updated.id ? updated : gateway);
      } catch (err) {
        this._gatewayResult = { ok: false, error: this._message(err) };
      } finally {
        this._gatewayBusy = false;
        this._render();
        this._paint();
      }
    }));
    this.shadowRoot.querySelectorAll("[data-gateway-delete]").forEach((button) => button.addEventListener("click", () => this._deleteGateway(button.dataset.gatewayDelete)));
    this.shadowRoot.querySelectorAll("[data-gateway-rename]").forEach((button) => button.addEventListener("click", () => {
      const gateway = this._gateways.find((item) => item.id === button.dataset.gatewayRename);
      if (!gateway) return;
      this._editingGatewayId = gateway.id;
      this._gatewayNameDraft = gateway.name || "";
      this._render();
      window.requestAnimationFrame(() => this.shadowRoot.querySelector(`[data-gateway-name-input="${gateway.id}"]`)?.focus());
    }));
    this.shadowRoot.querySelectorAll("[data-gateway-name-input]").forEach((input) => input.addEventListener("input", (event) => { this._gatewayNameDraft = event.target.value; }));
    this.shadowRoot.querySelectorAll("[data-gateway-name-save]").forEach((button) => button.addEventListener("click", () => this._renameGateway(button.dataset.gatewayNameSave)));
    this.shadowRoot.querySelectorAll("[data-gateway-name-cancel]").forEach((button) => button.addEventListener("click", () => { this._editingGatewayId = ""; this._render(); this._paint(); }));
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => {
      if (button.dataset.tab === "designer" && !this._device()) {
        this._activeTab = "devices";
        this._render();
        return;
      }
      this._activeTab = button.dataset.tab;
      window.clearTimeout(this._queuePollTimer);
      if (this._activeTab === "devices") this._scheduleAutomaticScan(60);
      if (this._activeTab === "queue") {
        await this._loadQueue(true);
        return;
      }
      this._render();
      this._paint();
    }));
    const openDeviceDesigner = async (address) => {
      await this._selectDevice(address);
      this._activeTab = "designer";
      this._render();
      this._paint();
    };
    this.shadowRoot.querySelectorAll("[data-select-device]").forEach((button) => button.addEventListener("click", () => openDeviceDesigner(button.dataset.selectDevice)));
    this.shadowRoot.querySelectorAll("[data-device-card-open]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button,input,select,textarea,a")) return;
        openDeviceDesigner(card.dataset.deviceCardOpen);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openDeviceDesigner(card.dataset.deviceCardOpen);
      });
    });
    this.shadowRoot.querySelectorAll("[data-device-rename]").forEach((button) => button.addEventListener("click", () => {
      const device = (this._result?.devices || []).find((item) => item.address === button.dataset.deviceRename);
      if (!device) return;
      this._editingDeviceAddress = device.address;
      this._deviceNameDraft = device.display_name || "";
      this._render();
      window.requestAnimationFrame(() => this.shadowRoot.querySelector(`[data-device-name-input="${device.address}"]`)?.focus());
    }));
    this.shadowRoot.querySelectorAll("[data-device-name-input]").forEach((input) => input.addEventListener("input", (event) => { this._deviceNameDraft = event.target.value; }));
    this.shadowRoot.querySelectorAll("[data-device-name-save]").forEach((button) => button.addEventListener("click", () => this._saveDeviceName(button.dataset.deviceNameSave)));
    this.shadowRoot.querySelectorAll("[data-device-name-cancel]").forEach((button) => button.addEventListener("click", () => { this._editingDeviceAddress = ""; this._deviceNameDraft = ""; this._render(); this._paint(); }));
    this.shadowRoot.querySelector("#sendDesign").addEventListener("click", () => this._sendDesign());
    this.shadowRoot.querySelector("#sendGatewayDesign")?.addEventListener("click", () => this._sendDesignViaGateway());
    this.shadowRoot.querySelector("#refreshInterval")?.addEventListener("change", (event) => {
      this._refreshIntervalSeconds = Math.max(30, Math.min(86400, Number(event.target.value) || 60));
      this._scheduleDraftSave();
    });
    this.shadowRoot.querySelector("#applyRgbLed")?.addEventListener("click", () => this._applyRgbLed());
    this.shadowRoot.querySelectorAll("[data-led-mode]").forEach((button) => button.addEventListener("click", () => {
      this._rgbLed.mode = button.dataset.ledMode;
      this._ledResult = null;
      this._scheduleDraftSave();
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-led-color]").forEach((button) => button.addEventListener("click", () => {
      this._rgbLed.color = button.dataset.ledColor;
      this._ledResult = null;
      this._scheduleDraftSave();
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("#rgbLedColor")?.addEventListener("input", (event) => {
      this._rgbLed.color = event.target.value;
      this._ledResult = null;
      this._scheduleDraftSave();
      const icon = this.shadowRoot.querySelector(".rgb-led-icon");
      if (icon) icon.style.setProperty("--led-color", this._rgbLed.color);
    });
    this.shadowRoot.querySelector("#rgbLedFlashTime")?.addEventListener("input", (event) => {
      this._rgbLed.flashTime = Math.max(1, Math.min(255, Number(event.target.value) || 10));
      this._ledResult = null;
      this._scheduleDraftSave();
      const value = event.target.closest(".field")?.querySelector("label strong");
      if (value) value.textContent = String(this._rgbLed.flashTime);
    });
    this.shadowRoot.querySelector("#fileMenuToggle")?.addEventListener("click", () => { this._fileMenuOpen = !this._fileMenuOpen; this._viewMenuOpen = false; this._toolsMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#fileMenuClose")?.addEventListener("click", () => { this._fileMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#viewMenuToggle")?.addEventListener("click", () => { this._viewMenuOpen = !this._viewMenuOpen; this._fileMenuOpen = false; this._toolsMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#toolsMenuToggle")?.addEventListener("click", () => { this._toolsMenuOpen = !this._toolsMenuOpen; this._fileMenuOpen = false; this._viewMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#layoutMenuToggle")?.addEventListener("click", () => { this._layoutMenuOpen = !this._layoutMenuOpen; this._fileMenuOpen = false; this._viewMenuOpen = false; this._toolsMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#variablesDialogOpen")?.addEventListener("click", () => { this._variablesDialogOpen = true; this._fileMenuOpen = false; this._viewMenuOpen = false; this._toolsMenuOpen = false; this._layoutMenuOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#variablesDialogClose")?.addEventListener("click", () => { this._variablesDialogOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#openTemplateFromFile")?.addEventListener("click", () => { this._fileMenuOpen = false; this._templateDialogOpen = true; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#exportProjectFile")?.addEventListener("click", () => this._downloadProjectFile());
    this.shadowRoot.querySelector("#importProjectFile")?.addEventListener("click", () => this.shadowRoot.querySelector("#projectFileInput")?.click());
    this.shadowRoot.querySelector("#projectFileInput")?.addEventListener("change", (event) => this._importProjectFile(event.target.files?.[0]));
    this.shadowRoot.querySelector("#templateDialogClose")?.addEventListener("click", () => { this._templateDialogOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#newProject")?.addEventListener("click", () => this._newProject());
    this.shadowRoot.querySelector("#newProjectDialogClose")?.addEventListener("click", () => { this._newProjectDialogOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#createBlankProject")?.addEventListener("click", () => this._createBlankProject());
    this.shadowRoot.querySelector("#newProjectFromTemplate")?.addEventListener("click", () => { this._newProjectDialogOpen = false; this._templateDialogOpen = true; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#saveProject")?.addEventListener("click", () => { this._fileMenuOpen = false; this._saveProject(); });
    this.shadowRoot.querySelector("#loadProject")?.addEventListener("click", () => { this._fileMenuOpen = false; this._loadSelectedProject(); });
    this.shadowRoot.querySelector("#deleteProject")?.addEventListener("click", () => { this._fileMenuOpen = false; this._deleteProject(); });
    this.shadowRoot.querySelector("#projectName")?.addEventListener("input", (event) => { this._projectName = event.target.value; this._scheduleDraftSave(); });
    this.shadowRoot.querySelector("#projectSelect")?.addEventListener("change", (event) => { this._selectedProjectId = event.target.value; const project = this._projects.find((item) => item.id === this._selectedProjectId); if (project) this._projectName = project.name; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#openSymbols")?.addEventListener("click", () => { this._symbolPickerOpen = true; this._symbolSearch = ""; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#closeSymbols")?.addEventListener("click", () => { this._symbolPickerOpen = false; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#symbolSearch")?.addEventListener("input", (event) => { this._symbolSearch = event.target.value; this._render(); this._paint(); });
    this.shadowRoot.querySelectorAll("[data-symbol-category]").forEach((button) => button.addEventListener("click", () => { this._symbolCategory = button.dataset.symbolCategory; this._render(); this._paint(); }));
    this.shadowRoot.querySelectorAll("[data-symbol]").forEach((button) => button.addEventListener("click", () => this._addSymbol(button.dataset.symbol)));
    this.shadowRoot.querySelectorAll("[data-designer-side]").forEach((button) => button.addEventListener("click", () => {
      this._designerSideView = button.dataset.designerSide;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-tool-category]").forEach((button) => button.addEventListener("click", () => {
      this._toolCategory = button.dataset.toolCategory;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("#addImage")?.addEventListener("click", () => this.shadowRoot.querySelector("#imageFile")?.click());
    this.shadowRoot.querySelector("#openCustomElements")?.addEventListener("click", () => { this._activeTab = "custom"; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#imageFile")?.addEventListener("change", (event) => this._addImage(event.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => this._addObject(button.dataset.add)));
    this.shadowRoot.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => this._applyTemplate(button.dataset.template)));
    this.shadowRoot.querySelector("#undoAction").addEventListener("click", () => this._undo());
    this.shadowRoot.querySelector("#redoAction").addEventListener("click", () => this._redo());
    this.shadowRoot.querySelector("#duplicateSelected").addEventListener("click", () => this._duplicateSelected());
    this.shadowRoot.querySelector("#deleteSelected").addEventListener("click", () => this._deleteSelected());
    this.shadowRoot.querySelector("#clearDesign").addEventListener("click", () => this._clearDesign());
    this.shadowRoot.querySelector("#rotateSelected").addEventListener("click", () => this._rotateSelected());
    this.shadowRoot.querySelector("#mirrorSelected").addEventListener("click", () => this._mirrorSelected());
    this.shadowRoot.querySelector("#alignLeft")?.addEventListener("click", () => this._alignSelected("left"));
    this.shadowRoot.querySelector("#alignCenter")?.addEventListener("click", () => this._alignSelected("center"));
    this.shadowRoot.querySelector("#alignRight")?.addEventListener("click", () => this._alignSelected("right"));
    this.shadowRoot.querySelector("#alignTop")?.addEventListener("click", () => this._alignSelected("top"));
    this.shadowRoot.querySelector("#alignMiddle")?.addEventListener("click", () => this._alignSelected("middle"));
    this.shadowRoot.querySelector("#alignBottom")?.addEventListener("click", () => this._alignSelected("bottom"));
    this.shadowRoot.querySelector("#distributeH")?.addEventListener("click", () => this._alignSelected("distributeH"));
    this.shadowRoot.querySelector("#distributeV")?.addEventListener("click", () => this._alignSelected("distributeV"));
    this.shadowRoot.querySelector("#layerFront")?.addEventListener("click", () => this._moveLayer("front"));
    this.shadowRoot.querySelector("#layerBack")?.addEventListener("click", () => this._moveLayer("back"));
    this.shadowRoot.querySelector("#zoomIn")?.addEventListener("click", () => { this._zoom = Math.min(4, this._zoom + 0.15); this._render(); });
    this.shadowRoot.querySelector("#zoomOut")?.addEventListener("click", () => { this._zoom = Math.max(0.35, this._zoom - 0.15); this._render(); });
    this.shadowRoot.querySelector("#zoomFit")?.addEventListener("click", () => { this._fitZoom(); this._render(); });
    this.shadowRoot.querySelector("#snap")?.addEventListener("change", (event) => { this._snap = event.target.checked; });
    this.shadowRoot.querySelector("#snapStep")?.addEventListener("change", (event) => { this._snapStep = Number(event.target.value); });
    this.shadowRoot.querySelectorAll("[data-background]").forEach((button) => button.addEventListener("click", () => this._setBackgroundColor(button.dataset.background)));
    this.shadowRoot.querySelectorAll("[data-view-scope]").forEach((button) => button.addEventListener("click", () => {
      const scope = button.dataset.viewScope;
      const mode = button.dataset.viewMode;
      if (scope === "devices") this._deviceViewMode = mode;
      else this._topologyViewMode = mode;
      this._saveUiPreference(`${scope === "devices" ? "device" : "topology"}-view-mode`, mode);
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-select]").forEach((button) => button.addEventListener("click", (event) => {
      const id = button.dataset.layerSelect;
      if (event.shiftKey) {
        this._selectedIds = this._selectedIds.includes(id) ? this._selectedIds.filter((item) => item !== id) : [...this._selectedIds, id];
      } else {
        this._selectedIds = [id];
      }
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-front]").forEach((button) => button.addEventListener("click", () => this._moveLayerStep(button.dataset.layerFront, "front")));
    this.shadowRoot.querySelectorAll("[data-layer-back]").forEach((button) => button.addEventListener("click", () => this._moveLayerStep(button.dataset.layerBack, "back")));
    this.shadowRoot.querySelectorAll("[data-layer-toggle-hide]").forEach((button) => button.addEventListener("click", () => {
      const object = this._objects.find((item) => item.id === button.dataset.layerToggleHide);
      if (object) {
        object.hidden = !object.hidden;
        this._render();
        this._paint();
        this._scheduleDraftSave();
      }
    }));
    this.shadowRoot.querySelectorAll("[data-layer-toggle-lock]").forEach((button) => button.addEventListener("click", () => {
      const object = this._objects.find((item) => item.id === button.dataset.layerToggleLock);
      if (object) {
        object.locked = !object.locked;
        this._render();
        this._paint();
        this._scheduleDraftSave();
      }
    }));
    this.shadowRoot.querySelector("#deviceSelect")?.addEventListener("change", (event) => this._selectDevice(event.target.value));
    this.shadowRoot.querySelector("#gatewaySendSelect")?.addEventListener("change", (event) => { this._selectedGatewayId = event.target.value; this._render(); this._paint(); });
    this.shadowRoot.querySelectorAll("[data-orientation]").forEach((button) => button.addEventListener("click", () => this._setOrientation(button.dataset.orientation)));
    this.shadowRoot.querySelector("#displayTransform")?.addEventListener("change", (event) => this._setDisplayTransform(event.target.value));
    this.shadowRoot.querySelectorAll("[data-variable]").forEach((input) => input.addEventListener("input", () => {
      this._variables[input.dataset.variable] = input.value;
      this._paint();
      this._scheduleDraftSave();
    }));
    this.shadowRoot.querySelectorAll("[data-entity-picker]").forEach((picker) => {
      const object = this._objects.find((item) => item.id === picker.dataset.entityPicker);
      if (!object) return;
      picker.hass = this._hass;
      picker.value = object.entityId || "";
      picker.allowCustomEntity = true;
      picker.addEventListener("value-changed", (event) => {
        const entityId = event.detail?.value || "";
        if (entityId === (object.entityId || "")) return;
        this._pushHistory();
        object.entityId = entityId;
        if (!entityId) object.entityAttribute = "";
        if (entityId && ["text", "chart", "bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type) && object.autoUpdate === undefined) object.autoUpdate = true;
        this._render();
        this._paint();
        this._scheduleDraftSave();
      });
    });
    this.shadowRoot.querySelectorAll("[data-custom-type]").forEach((button) => button.addEventListener("click", () => {
      this._customElementForm.element_type = button.dataset.customType;
      this._customElementResult = null;
      if ((this._customElementInspection.collections || []).length) this._adoptCustomInspection(this._customElementInspection.collections);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-template]").forEach((button) => button.addEventListener("click", () => {
      const templates = {
        socket: [
          { operator: "is_on", value: "", symbol: "⚡" },
          { operator: "is_off", value: "", symbol: "○" },
        ],
        temperature: [
          { operator: "greater_equal", value: "30", symbol: "▲" },
          { operator: "less_equal", value: "10", symbol: "▼" },
          { operator: "greater", value: "10", symbol: "✓" },
        ],
        limit: [
          { operator: "greater", value: "100", symbol: "!" },
          { operator: "less_equal", value: "100", symbol: "✓" },
        ],
      };
      this._customElementForm.condition_rules = structuredClone(templates[button.dataset.conditionTemplate] || []);
      this._customElementForm.default_symbol = "?";
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelector("#addConditionRule")?.addEventListener("click", () => {
      const rules = Array.isArray(this._customElementForm.condition_rules) ? this._customElementForm.condition_rules : [];
      if (rules.length < 8) rules.push({ operator: "equals", value: "", symbol: "●" });
      this._customElementForm.condition_rules = rules;
      this._stableCustomRender();
    });
    this.shadowRoot.querySelectorAll("[data-condition-remove]").forEach((button) => button.addEventListener("click", () => {
      this._customElementForm.condition_rules.splice(Number(button.dataset.conditionRemove), 1);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-operator]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.conditionOperator)];
      if (rule) rule.operator = input.value;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-value]").forEach((input) => input.addEventListener("input", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.conditionValue)];
      if (rule) rule.value = input.value;
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-value]").forEach((input) => input.addEventListener("change", () => {
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-condition-symbol]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.conditionSymbol)];
      if (rule) rule.symbol = input.value;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-element-field]").forEach((input) => {
      const update = () => {
        const key = input.dataset.customElementField;
        const previous = this._customElementForm[key];
        this._customElementForm[key] = input.type === "range" ? Number(input.value) : input.value;
        if (key === "url" && previous !== input.value) {
          this._customElementFields = [];
          this._customElementInspection = { collections: [] };
        }
        const save = this.shadowRoot.querySelector("#customElementSave");
        if (save) save.disabled = this._customElementBusy || !this._customElementFormValid();
        const fetchButton = this.shadowRoot.querySelector("#customElementFetch");
        if (fetchButton) fetchButton.disabled = this._customElementBusy || !this._customElementForm.url.trim();
      };
      input.addEventListener("input", update);
      input.addEventListener("change", () => { update(); this._stableCustomRender(); });
    });
    this.shadowRoot.querySelector("#customCollectionPath")?.addEventListener("change", (event) => {
      const collection = (this._customElementInspection.collections || []).find((item) => item.path === event.target.value);
      this._customElementForm.collection_path = event.target.value;
      const fields = collection?.fields || [];
      this._customElementForm.value_field = (this._customElementForm.element_type === "chart" ? fields.find((field) => field.kind === "number") : fields[0])?.key || "";
      this._customElementForm.label_field = this._customElementForm.element_type === "chart" ? fields.find((field) => field.kind === "text")?.key || "" : "";
      this._applyCustomMappingPaths();
      this._fetchCustomElementUrl(false);
    });
    this.shadowRoot.querySelector("#customValueField")?.addEventListener("change", (event) => {
      this._customElementForm.value_field = event.target.value;
      this._applyCustomMappingPaths();
      this._fetchCustomElementUrl(false);
    });
    this.shadowRoot.querySelector("#customLabelField")?.addEventListener("change", (event) => {
      this._customElementForm.label_field = event.target.value;
      this._applyCustomMappingPaths();
      this._fetchCustomElementUrl(false);
    });
    const customEntity = this.shadowRoot.querySelector("#customElementEntity");
    if (customEntity) {
      customEntity.hass = this._hass;
      customEntity.value = this._customElementForm.entity_id || "";
      customEntity.allowCustomEntity = true;
      customEntity.addEventListener("value-changed", (event) => {
        const entityId = event.detail?.value || "";
        if (entityId === this._customElementForm.entity_id) return;
        this._customElementForm.entity_id = entityId;
        this._stableCustomRender();
      });
    }
    this.shadowRoot.querySelectorAll("[data-layer-object-entity]").forEach((picker) => {
      const object = this._customSelectedLayerObject();
      if (!object || object.id !== picker.dataset.layerObjectEntity) return;
      picker.hass = this._hass;
      picker.value = object.entity_id || object.entityId || "";
      picker.allowCustomEntity = true;
      picker.addEventListener("value-changed", (event) => {
        const entityId = event.detail?.value || "";
        if (entityId === (object.entity_id || object.entityId || "")) return;
        object.entity_id = entityId;
        object.entityId = entityId;
        this._paintCustomLayerCanvases();
        this._stableCustomRender();
      });
    });
    const customIconFile = this.shadowRoot.querySelector("#customIconFile");
    const customIconDrop = this.shadowRoot.querySelector("#customIconDrop");
    customIconDrop?.addEventListener("click", () => customIconFile?.click());
    customIconFile?.addEventListener("change", (event) => this._setCustomIconFile(event.target.files?.[0]));
    customIconDrop?.addEventListener("dragover", (event) => {
      event.preventDefault();
      customIconDrop.classList.add("dragging");
    });
    customIconDrop?.addEventListener("dragleave", () => customIconDrop.classList.remove("dragging"));
    customIconDrop?.addEventListener("drop", (event) => {
      event.preventDefault();
      customIconDrop.classList.remove("dragging");
      this._setCustomIconFile(event.dataTransfer?.files?.[0]);
    });
    const createLayeredElement = () => {
      this._customElementForm = this._emptyCustomElementForm();
      this._customWorkspaceView = "editor";
      this._customLayerStep = "design";
      this._customActiveLayerId = this._customElementForm.layers[0].id;
      this._customSelectedObjectId = "";
      this._customElementResult = null;
      this._stableCustomRender();
    };
    this.shadowRoot.querySelector("#customElementNew")?.addEventListener("click", createLayeredElement);
    this.shadowRoot.querySelector("#customElementEmptyNew")?.addEventListener("click", createLayeredElement);
    this.shadowRoot.querySelector("#customBackToLibrary")?.addEventListener("click", () => {
      this._customWorkspaceView = "library";
      this._customElementResult = null;
      this._stableCustomRender();
    });
    this.shadowRoot.querySelectorAll("[data-custom-step]").forEach((button) => button.addEventListener("click", () => {
      this._customLayerStep = button.dataset.customStep;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelector("#addCustomLayer")?.addEventListener("click", () => this._addCustomLayer());
    this.shadowRoot.querySelectorAll("[data-custom-layer]").forEach((card) => card.addEventListener("click", (event) => {
      if (event.target.closest("button,input")) return;
      this._customActiveLayerId = card.dataset.customLayer;
      this._customSelectedObjectId = "";
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-layer-name]").forEach((input) => input.addEventListener("input", () => {
      const layer = this._customElementForm.layers.find((item) => item.id === input.dataset.customLayerName);
      if (layer) layer.name = input.value;
    }));
    this.shadowRoot.querySelectorAll("[data-custom-layer-name]").forEach((input) => input.addEventListener("change", () => this._stableCustomRender()));
    this.shadowRoot.querySelectorAll("[data-custom-layer-copy]").forEach((button) => button.addEventListener("click", () => this._duplicateCustomLayer(button.dataset.customLayerCopy)));
    this.shadowRoot.querySelectorAll("[data-custom-layer-delete]").forEach((button) => button.addEventListener("click", () => this._deleteCustomLayer(button.dataset.customLayerDelete)));
    this.shadowRoot.querySelectorAll("[data-add-layer-object]").forEach((button) => button.addEventListener("click", () => this._addCustomLayerObject(button.dataset.addLayerObject)));
    this.shadowRoot.querySelectorAll("[data-default-layer-icon]").forEach((button) => button.addEventListener("click", () => this._addDefaultLayerIcon(button.dataset.defaultLayerIcon)));
    this.shadowRoot.querySelector("#addLayerImage")?.addEventListener("click", () => this.shadowRoot.querySelector("#layerImageFile")?.click());
    this.shadowRoot.querySelector("#layerImageFile")?.addEventListener("change", (event) => this._setCustomLayerImage(event.target.files?.[0]));
    this.shadowRoot.querySelectorAll("[data-layer-object]").forEach((input) => {
      const update = () => {
        const object = this._customSelectedLayerObject();
        if (!object || (input.type === "radio" && !input.checked)) return;
        const key = input.dataset.layerObject;
        object[key] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        if (input.type === "radio") {
          this._stableCustomRender();
          return;
        }
        this._paintCustomLayerCanvases();
      };
      if (input.type === "radio") input.addEventListener("change", update);
      else {
        input.addEventListener("input", update);
        input.addEventListener("change", update);
      }
    });
    this.shadowRoot.querySelector("#deleteLayerObject")?.addEventListener("click", () => this._deleteCustomLayerObject());
    const layerCanvas = this.shadowRoot.querySelector("#customLayerCanvas");
    layerCanvas?.addEventListener("pointerdown", (event) => this._onCustomLayerPointerDown(event));
    layerCanvas?.addEventListener("pointermove", (event) => this._onCustomLayerPointerMove(event));
    layerCanvas?.addEventListener("pointerup", () => { this._customLayerDrag = null; this._stableCustomRender(); });
    layerCanvas?.addEventListener("pointercancel", () => { this._customLayerDrag = null; this._stableCustomRender(); });
    this.shadowRoot.querySelector("#addLayerRule")?.addEventListener("click", () => {
      if (this._customElementForm.condition_rules.length >= 12) return;
      this._customElementForm.condition_rules.push({ operator: "equals", value: "", layer_id: this._customElementForm.layers[0]?.id || "" });
      this._stableCustomRender();
    });
    this.shadowRoot.querySelectorAll("[data-layer-rule-operator]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.layerRuleOperator)];
      if (rule) rule.operator = input.value;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-value]").forEach((input) => input.addEventListener("input", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.layerRuleValue)];
      if (rule) rule.value = input.value;
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-value]").forEach((input) => input.addEventListener("change", () => this._stableCustomRender()));
    this.shadowRoot.querySelectorAll("[data-layer-rule-target]").forEach((input) => input.addEventListener("change", () => {
      const rule = this._customElementForm.condition_rules[Number(input.dataset.layerRuleTarget)];
      if (rule) rule.layer_id = input.value;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-layer-rule-delete]").forEach((button) => button.addEventListener("click", () => {
      this._customElementForm.condition_rules.splice(Number(button.dataset.layerRuleDelete), 1);
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelector("#customElementSave")?.addEventListener("click", () => this._saveCustomElement());
    this.shadowRoot.querySelector("#customElementFetch")?.addEventListener("click", () => this._fetchCustomElementUrl());
    this.shadowRoot.querySelectorAll("[data-custom-edit]").forEach((button) => button.addEventListener("click", () => {
      const element = this._customElements.find((item) => item.id === button.dataset.customEdit);
      if (!element) return;
      try {
        this._customElementForm = this._migrateCustomElementToLayers(element);
      } catch (err) {
        this._customElementResult = { ok: false, error: `Nepodařilo se načíst uložený prvek: ${this._message(err)}` };
        this._stableCustomRender();
        return;
      }
      this._customWorkspaceView = "editor";
      this._customLayerStep = "design";
      this._customActiveLayerId = this._customElementForm.layers?.[0]?.id || "";
      this._customSelectedObjectId = "";
      this._customElementFields = [];
      this._customElementInspection = { collections: [] };
      this._customElementResult = null;
      this._stableCustomRender();
    }));
    this.shadowRoot.querySelectorAll("[data-custom-delete]").forEach((button) => button.addEventListener("click", () => this._deleteCustomElement(button.dataset.customDelete)));
    this.shadowRoot.querySelectorAll("[data-custom-insert]").forEach((button) => button.addEventListener("click", () => {
      const element = this._customElements.find((item) => item.id === button.dataset.customInsert);
      if (element) this._insertCustomElement(element, true);
    }));
    this.shadowRoot.querySelectorAll("[data-custom-all]").forEach((button) => button.addEventListener("click", () => {
      const element = this._customElements.find((item) => item.id === button.dataset.customAll);
      if (element) this._applyCustomElementToAll(element);
    }));
    const canvas = this.shadowRoot.querySelector("#editor");
    canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    canvas.addEventListener("pointermove", (event) => this._onPointerMove(event));
    canvas.addEventListener("pointerup", () => this._onPointerUp());
    canvas.addEventListener("pointerleave", () => this._onPointerUp());
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => input.addEventListener("input", (event) => this._readProperties(event)));
    this.shadowRoot.querySelectorAll("[data-inspector-prop]").forEach((button) => button.addEventListener("click", () => {
      this._setInspectorProperty(button.dataset.inspectorProp, button.dataset.inspectorValue);
    }));
  }

  _renderEntityBinding(object) {
    const state = object.entityId ? this._hass?.states?.[object.entityId] : null;
    const friendlyName = state?.attributes?.friendly_name || object.entityId || "";
    const value = object.entityId ? this._entityValue(object) : "";
    return `<div class="entity-source"><h2>Zdroj z Home Assistantu</h2><div class="field"><label>Entita nebo Pomocník</label><ha-entity-picker data-entity-picker="${this._escape(object.id)}"></ha-entity-picker><small>Vyberte například input_text, input_number nebo libovolný senzor. Bez výběru se používá ruční hodnota z menu Proměnné.</small></div>${object.entityId ? `<div class="field"><label>Atribut entity (volitelné)</label><input data-prop="entityAttribute" value="${this._escape(object.entityAttribute || "")}" placeholder="Například prices"><small>Nechte prázdné pro hlavní stav entity. Atribut je vhodný například pro pole spotových cen.</small></div><label><input data-prop="autoUpdate" type="checkbox" ${object.autoUpdate !== false ? "checked" : ""}> Automaticky odeslat při změně</label><small>Všechny změny tohoto displeje se sloučí a odešlou nejvýše jednou za nastavený interval (${this._refreshIntervalSeconds < 60 ? `${this._refreshIntervalSeconds} s` : `${Math.round(this._refreshIntervalSeconds / 60)} min`}).</small><div class="entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>${this._escape(value || "Bez hodnoty")}</strong><small>${this._escape(friendlyName)} · ${this._escape(object.entityId)}</small></div></div>` : ""}</div>`;
  }

  _inspectorSection(icon, title, body, open = false) {
    return `<details class="inspector-section" ${open ? "open" : ""}><summary class="inspector-section-title"><ha-icon icon="${icon}"></ha-icon><span>${title}</span><ha-icon class="inspector-chevron" icon="mdi:chevron-down"></ha-icon></summary><div class="inspector-section-body">${body}</div></details>`;
  }

  _inspectorColor(prop, value, label, colors = ["black", "red", "white"]) {
    const names = { none: "Žádná", original: "Původní", black: "Černá", red: "Červená", white: "Bílá" };
    const selected = value || (colors.includes("none") ? "none" : "black");
    return `<div class="field"><label><ha-icon icon="mdi:palette"></ha-icon>${label}</label><div class="color-options">${colors.map((color) => `<button type="button" class="color-option ${selected === color ? "selected" : ""}" data-inspector-prop="${prop}" data-inspector-value="${color}" title="${names[color]}"><span class="color-dot ${color}"></span><span>${names[color]}</span></button>`).join("")}</div></div>`;
  }

  _inspectorSegments(prop, value, options, label) {
    return `<div class="field"><label>${label}</label><div class="segment-control">${options.map((option) => `<button type="button" class="segment-button ${String(value) === String(option.value) ? "selected" : ""}" data-inspector-prop="${prop}" data-inspector-value="${option.value}" title="${option.label}"><ha-icon icon="${option.icon}"></ha-icon></button>`).join("")}</div></div>`;
  }

  _inspectorToggle(prop, checked, icon, label) {
    return `<label class="toggle-card"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><input data-prop="${prop}" type="checkbox" ${checked ? "checked" : ""}></label>`;
  }

  _setInspectorProperty(prop, value) {
    const object = this._selectedObject();
    if (!object) return;
    const nextValue = prop === "rotation" ? Number(value) : value;
    if (object[prop] === nextValue) return;
    this._pushHistory();
    object[prop] = nextValue;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _renderInspectorGeometry(object) {
    return this._inspectorSection("mdi:move-resize", "Pozice a rozměry", `
      <div class="row"><div class="field"><label><ha-icon icon="mdi:axis-x-arrow"></ha-icon>X</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label><ha-icon icon="mdi:axis-y-arrow"></ha-icon>Y</label><input data-prop="y" type="number" value="${object.y}"></div></div>
      <div class="row"><div class="field"><label><ha-icon icon="mdi:arrow-left-right"></ha-icon>Šířka</label><input data-prop="w" type="number" min="1" value="${object.w || 1}"></div><div class="field"><label><ha-icon icon="mdi:arrow-up-down"></ha-icon>Výška</label><input data-prop="h" type="number" min="1" value="${object.h || 1}"></div></div>
      ${this._inspectorSegments("rotation", Number(object.rotation || 0), [
        { value: 0, label: "Bez otočení", icon: "mdi:format-rotate-90" },
        { value: 90, label: "Otočit 90°", icon: "mdi:rotate-right" },
        { value: 180, label: "Otočit 180°", icon: "mdi:rotate-3d-variant" },
        { value: 270, label: "Otočit 270°", icon: "mdi:rotate-left" },
      ], "Rotace")}`);
  }

  _renderProperties(object) {
    if (!object) return `<div class="inspector-empty"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><p>${this._selectedIds.length > 1 ? `Vybráno ${this._selectedIds.length} objektů.` : "Vyberte objekt v návrhu."}</p></div>`;
    const geometry = this._renderInspectorGeometry(object);

    if (object.type === "text") {
      const content = this._inspectorSection("mdi:format-text", object.statusIcons ? "Signalizace" : "Text", `
        <div class="field"><label><ha-icon icon="mdi:text-box-edit-outline"></ha-icon>Obsah</label><input data-prop="text" value="${this._escape(object.text)}"></div>
        <div class="row"><div class="field"><label><ha-icon icon="mdi:format-size"></ha-icon>Velikost</label><input data-prop="fontSize" type="number" min="${this._textMinFontSize(object)}" value="${object.fontSize}"></div><div class="field"><label><ha-icon icon="mdi:format-font"></ha-icon>Font displeje</label><input value="DRATEK eInk Sans" disabled title="Stejný vestavěný font používá náhled i backend při automatické aktualizaci."></div></div>
        ${this._inspectorSegments("textAlign", object.textAlign || "center", [{ value: "left", label: "Vlevo", icon: "mdi:format-align-left" }, { value: "center", label: "Na střed", icon: "mdi:format-align-center" }, { value: "right", label: "Vpravo", icon: "mdi:format-align-right" }], "Vodorovné zarovnání")}
        ${this._inspectorSegments("verticalAlign", object.verticalAlign || "middle", [{ value: "top", label: "Nahoru", icon: "mdi:format-vertical-align-top" }, { value: "middle", label: "Na střed", icon: "mdi:format-vertical-align-center" }, { value: "bottom", label: "Dolů", icon: "mdi:format-vertical-align-bottom" }], "Svislé zarovnání")}
        ${object.statusIcons ? `<div class="row"><div class="field"><label>Symbol zapnuto</label><input data-prop="statusOnSymbol" value="${this._escape(object.statusOnSymbol || "●")}"></div><div class="field"><label>Symbol vypnuto</label><input data-prop="statusOffSymbol" value="${this._escape(object.statusOffSymbol || "○")}"></div></div><div class="field"><label>Hodnoty zapnutého stavu</label><input data-prop="statusOnValues" value="${this._escape(object.statusOnValues || "on,true,1,open,home")}"><small>Oddělte čárkou, například on, true, open.</small></div>` : ""}`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Vzhled", `${this._inspectorColor("color", object.color, "Barva textu")}<div class="toggle-stack">${this._inspectorToggle("bold", !!object.bold, "mdi:format-bold", "Tučné písmo")}${this._inspectorToggle("autoFit", object.autoFit !== false, "mdi:fit-to-page-outline", "Přizpůsobit text boxu")}</div>`);
      const variable = this._inspectorSection("mdi:variable", "Proměnná", `<div class="toggle-stack">${this._inspectorToggle("variable", !!object.variable, "mdi:variable-box", "Proměnný text")}</div>${object.variable ? `<div class="field" style="margin-top:10px"><label><ha-icon icon="mdi:identifier"></ha-icon>Interní název</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="napr_teplota"><p class="inspector-help"><ha-icon icon="mdi:information-outline"></ha-icon><span>Název patří šabloně a není samostatnou entitou Home Assistantu.</span></p></div>${this._renderEntityBinding(object)}` : ""}`);
      return `${geometry}${content}${appearance}${variable}`;
    }

    if (object.type === "rect") return `${geometry}${this._inspectorSection("mdi:palette-outline", "Výplň a rámeček", `${this._inspectorColor("fill", object.fill, "Výplň", ["none", "black", "red", "white"])}${this._inspectorColor("stroke", object.stroke, "Rámeček", ["none", "black", "red"])}<div class="field"><label><ha-icon icon="mdi:border-width"></ha-icon>Síla rámečku</label><input data-prop="strokeWidth" type="number" min="0" value="${object.strokeWidth || 0}"></div>`)}`;

    if (object.type === "chart") {
      const chart = this._inspectorSection("mdi:chart-box-outline", "Graf", `
        ${this._inspectorSegments("chartType", object.chartType || "bar", [{ value: "line", label: "Spojnicový", icon: "mdi:chart-line" }, { value: "bar", label: "Sloupcový", icon: "mdi:chart-bar" }, { value: "area", label: "Plošný", icon: "mdi:chart-areaspline" }], "Typ grafu")}
        <div class="field"><label><ha-icon icon="mdi:format-title"></ha-icon>Název</label><input data-prop="chartTitle" value="${this._escape(object.chartTitle || "")}"></div>
        <div class="field"><label><ha-icon icon="mdi:code-array"></ha-icon>Data</label><textarea data-prop="data" rows="3" placeholder="2.10, 2.35, 2.18">${this._escape(object.data || "")}</textarea></div>
        <div class="field"><label><ha-icon icon="mdi:label-multiple-outline"></ha-icon>Popisky bodů</label><input data-prop="chartLabels" value="${this._escape(object.chartLabels || "")}" placeholder="00, 03, 06, 09"></div>
        <div class="row"><div class="field"><label>Osa X</label><input data-prop="xLabel" value="${this._escape(object.xLabel || "")}"></div><div class="field"><label>Osa Y</label><input data-prop="yLabel" value="${this._escape(object.yLabel || "")}"></div></div>
        <div class="row"><div class="field"><label>Počet bodů</label><input data-prop="maxPoints" type="number" min="2" max="96" value="${Number(object.maxPoints || 24)}"></div><div class="field"><label>Velikost textu</label><input data-prop="legendFontSize" type="number" min="6" max="18" value="${Number(object.legendFontSize || 8)}"></div></div>
        <div class="row"><div class="field"><label>Minimum</label><input data-prop="chartMin" type="number" step="any" value="${this._escape(object.chartMin ?? "")}" placeholder="Auto"></div><div class="field"><label>Maximum</label><input data-prop="chartMax" type="number" step="any" value="${this._escape(object.chartMax ?? "")}" placeholder="Auto"></div></div>`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Barvy a zobrazení", `${this._inspectorColor("backgroundColor", object.backgroundColor || "white", "Pozadí")}${this._inspectorColor("color", object.color || "black", "Čára grafu")}${this._inspectorColor("graphColor", object.graphColor || "black", "Osy a popisky")}${object.chartType === "bar" ? this._inspectorColor("barColor", object.barColor || "red", "Sloupce") : ""}<div class="toggle-stack">${this._inspectorToggle("showAxes", object.showAxes !== false, "mdi:axis-arrow", "Zobrazit osy")}${this._inspectorToggle("showGrid", object.showGrid !== false, "mdi:grid", "Zobrazit mřížku")}${this._inspectorToggle("showValues", !!object.showValues, "mdi:numeric", "Zobrazit hodnoty")}</div>`);
      const source = this._inspectorSection("mdi:database-sync-outline", "Datový zdroj", `<div class="field"><label><ha-icon icon="mdi:identifier"></ha-icon>Název proměnné</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="ceny_spot_24h"></div>${this._renderEntityBinding(object)}`);
      return `${geometry}${chart}${appearance}${source}`;
    }

    if (["bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type)) {
      const isBar = object.type === "bar_gauge";
      const isPie = object.type === "pie";
      const isGauge = object.type === "gauge" || object.type === "potentiometer";
      const settings = this._inspectorSection("mdi:gauge", "Ukazatel hodnoty", `
        <div class="field"><label><ha-icon icon="mdi:label-outline"></ha-icon>Popisek</label><input data-prop="label" value="${this._escape(object.label || "")}"></div>
        <div class="row"><div class="field"><label>Minimum</label><input data-prop="min_value" type="number" step="any" value="${Number(object.min_value ?? 0)}"></div><div class="field"><label>Maximum</label><input data-prop="max_value" type="number" step="any" value="${Number(object.max_value ?? 100)}"></div></div>
        <div class="row"><div class="field"><label>Náhled hodnoty</label><input data-prop="sample_value" type="number" step="any" value="${Number(object.sample_value ?? 50)}"></div><div class="field"><label>Jednotka</label><input data-prop="unit" value="${this._escape(object.unit || "")}" placeholder="%"></div></div>
        ${isBar ? this._inspectorSegments("orientation", object.orientation || "horizontal", [{ value: "horizontal", label: "Vodorovně", icon: "mdi:arrow-left-right" }, { value: "vertical", label: "Svisle", icon: "mdi:arrow-up-down" }], "Orientace") : ""}
        ${isPie ? `<div class="field"><label>Velikost otvoru (%)</label><input data-prop="hole_percent" type="number" min="0" max="80" value="${Number(object.hole_percent ?? 45)}"></div>` : ""}
        ${isGauge ? `${this._inspectorSegments("arc_mode", object.arc_mode || "240", [{ value: "180", label: "180°", icon: "mdi:gauge-low" }, { value: "240", label: "240°", icon: "mdi:gauge" }, { value: "360", label: "360°", icon: "mdi:circle-outline" }], "Rozsah budíku")}<div class="field"><label>Síla oblouku</label><input data-prop="stroke_width" type="number" min="1" max="20" value="${Number(object.stroke_width ?? 6)}"></div>` : ""}
        <div class="toggle-stack">${this._inspectorToggle("show_value", object.show_value !== false, "mdi:numeric", "Zobrazit hodnotu")}${isGauge ? `${this._inspectorToggle("show_arc", object.show_arc !== false, "mdi:chart-arc", "Zobrazit oblouk")}${this._inspectorToggle("show_needle", object.show_needle !== false, "mdi:ray-start-arrow", "Zobrazit ručičku")}` : ""}</div>`, true);
      const appearance = this._inspectorSection("mdi:palette-outline", "Vzhled", `${this._inspectorColor(isBar ? "fill" : "color", isBar ? (object.fill || "red") : (object.color || "red"), "Aktivní barva")}${isBar ? `${this._inspectorColor("stroke", object.stroke || "black", "Rámeček", ["none", "black", "red"])}<div class="field"><label>Síla rámečku</label><input data-prop="stroke_width" type="number" min="0" max="12" value="${Number(object.stroke_width ?? 2)}"></div>` : ""}`);
      const source = this._inspectorSection("mdi:home-assistant", "Zdroj dat", this._renderEntityBinding(object));
      return `${geometry}${settings}${appearance}${source}`;
    }

    if (object.type === "line") {
      const points = this._inspectorSection("mdi:vector-line", "Koncové body", `<div class="row"><div class="field"><label>X1</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y1</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>X2</label><input data-prop="x2" type="number" value="${object.x2}"></div><div class="field"><label>Y2</label><input data-prop="y2" type="number" value="${object.y2}"></div></div>`);
      return `${points}${this._inspectorSection("mdi:palette-outline", "Vzhled", `${this._inspectorColor("color", object.color, "Barva čáry", ["black", "red"])}<div class="field"><label><ha-icon icon="mdi:format-line-weight"></ha-icon>Síla čáry</label><input data-prop="strokeWidth" type="number" min="1" value="${object.strokeWidth || 2}"></div>`)}`;
    }

    if (object.type === "barcode" || object.type === "qr") {
      const title = object.type === "qr" ? "QR kód" : "EAN kód";
      const data = this._inspectorSection(object.type === "qr" ? "mdi:qrcode" : "mdi:barcode", title, `<div class="field"><label><ha-icon icon="mdi:text-box-outline"></ha-icon>Data</label><input data-prop="text" value="${this._escape(object.text)}"></div>${this._inspectorColor("color", object.color || "black", "Barva kódu")}${this._inspectorColor("backgroundColor", object.backgroundColor || "white", "Pozadí kódu")}<div class="toggle-stack">${this._inspectorToggle("keepRatio", object.keepRatio !== false, "mdi:aspect-ratio", "Zachovat poměr stran")}</div>`);
      return `${geometry}${data}`;
    }

    return `${geometry}${this._inspectorSection("mdi:image-outline", "Obrázek", `${object.type === "image" ? this._inspectorColor("tint", object.tint || "original", "Přebarvení obrázku", ["original", "black", "red", "white"]) : ""}<div class="toggle-stack">${this._inspectorToggle("keepRatio", !!object.keepRatio, "mdi:aspect-ratio", "Zachovat poměr stran")}</div><p class="inspector-help"><ha-icon icon="mdi:information-outline"></ha-icon><span>Velikost můžete změnit tažením za rohy nebo přesnými hodnotami.</span></p>`)}`;
  }

  _readProperties(event = null) {
    const object = this._selectedObject();
    if (!object) return;
    const oldFontSize = Number(object.fontSize || 0);
    const changedProp = event && event.target ? event.target.dataset.prop : "";
    const wasVariable = !!object.variable;
    const oldVariableName = object.variableName || "";
    if (!this._propertyEditActive) {
      this._pushHistory();
      this._propertyEditActive = true;
      window.clearTimeout(this._propertyEditTimer);
    }
    window.clearTimeout(this._propertyEditTimer);
    this._propertyEditTimer = window.setTimeout(() => {
      this._propertyEditActive = false;
    }, 700);
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => {
      const key = input.dataset.prop;
      if (input.type === "checkbox") object[key] = input.checked;
      else if (["x", "y", "x2", "y2", "w", "h", "rotation", "fontSize", "minFontSize", "strokeWidth", "maxPoints", "legendFontSize", "min_value", "max_value", "sample_value", "hole_percent", "stroke_width"].includes(key)) object[key] = Number(input.value);
      else object[key] = input.value;
    });
    if (object.type === "text") {
      object.minFontSize = this._textMinFontSize(object);
      object.fontSize = Math.max(object.minFontSize, Number(object.fontSize || object.minFontSize));
      if (object.fontSize !== oldFontSize) {
        const lineCount = String(object.text || "").split("\n").length || 1;
        object.h = Math.max(Number(object.h || 1), Math.ceil(object.fontSize * 1.18 * lineCount));
      }
    }
    if (["text", "chart"].includes(object.type)) {
      if (object.type === "chart") object.variable = true;
      const defaultValue = object.type === "chart" ? (object.data || "") : (object.text || "");
      if (object.variable) {
        object.variableName = this._uniqueVariableName(object.variableName || (object.type === "chart" ? "data_grafu" : object.text) || "promenna", object.id);
        if (oldVariableName && oldVariableName !== object.variableName && this._variables[oldVariableName] !== undefined) {
          this._variables[object.variableName] = this._variables[oldVariableName];
          delete this._variables[oldVariableName];
        } else if (this._variables[object.variableName] === undefined) this._variables[object.variableName] = defaultValue;
      } else if (object.variableName) {
        delete this._variables[object.variableName];
        object.variableName = "";
      }
      if (changedProp === "variable" || wasVariable !== !!object.variable) this._render();
    }
    if (object.type === "chart") object.legendFontSize = Math.max(6, Math.min(18, Number(object.legendFontSize || 8)));
    this._paint();
    this._scheduleDraftSave();
  }

  _textMinFontSize(object = null) {
    if (object && Number.isFinite(Number(object.minFontSize))) return Math.max(10, Number(object.minFontSize));
    return this._readableMinFontSize();
  }

  _syncProperties() {
    const object = this._selectedObject();
    if (!object) return;
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => {
      const value = object[input.dataset.prop];
      if (input.type === "checkbox") input.checked = !!value;
      else input.value = value ?? "";
    });
  }

  _paint() {
    const canvas = this.shadowRoot.querySelector("#editor");
    if (canvas) {
      this._drawScene(canvas.getContext("2d"), canvas.width, canvas.height, false);
      if (this._automaticTextBindings().length) {
        this._paintCachedCanonicalPreview(canvas);
      } else {
        this._backendPreviewImage = null;
        this._backendPreviewAddress = "";
      }
    }
    const selectionCanvas = this.shadowRoot.querySelector("#editorSelection");
    if (selectionCanvas) {
      const selectionContext = selectionCanvas.getContext("2d");
      selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
      this._drawSelection(selectionContext);
    }
    this._paintDevicePreviews();
    this._paintCustomLayerCanvases();
    this._scheduleCanonicalDesignerPreview();
  }

  _paintCachedCanonicalPreview(canvas) {
    const image = this._backendPreviewImage;
    const address = this._device()?.address || "";
    if (!image || this._backendPreviewAddress !== address || !image.complete) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  _paintDevicePreviews() {
    const canvases = this.shadowRoot.querySelectorAll("canvas[data-device-preview]");
    if (!canvases.length) return;
    const previous = {
      objects: this._objects,
      variables: this._variables,
      backgroundColor: this._backgroundColor,
      invertColors: this._invertColors,
    };
    try {
      canvases.forEach((canvas) => {
        const draft = this._deviceDrafts[String(canvas.dataset.devicePreview || "").toUpperCase()];
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        if (!draft) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          return;
        }
        const sourceWidth = Math.max(1, Number(canvas.dataset.sourceWidth || draft.width || canvas.width));
        const sourceHeight = Math.max(1, Number(canvas.dataset.sourceHeight || draft.height || canvas.height));
        this._objects = Array.isArray(draft.objects) ? draft.objects : [];
        this._variables = draft.variables || {};
        this._backgroundColor = ["white", "black", "red"].includes(draft.background_color) ? draft.background_color : "white";
        this._invertColors = !!draft.invert_colors;
        const nativeCanvas = document.createElement("canvas");
        nativeCanvas.width = sourceWidth;
        nativeCanvas.height = sourceHeight;
        this._drawScene(nativeCanvas.getContext("2d"), sourceWidth, sourceHeight, false);
        ctx.drawImage(nativeCanvas, 0, 0, canvas.width, canvas.height);
      });
    } finally {
      this._objects = previous.objects;
      this._variables = previous.variables;
      this._backgroundColor = previous.backgroundColor;
      this._invertColors = previous.invertColors;
    }
  }

  _drawScene(ctx, width, height, withSelection, excludedIds = null) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this._color(this._backgroundColor);
    ctx.fillRect(0, 0, width, height);
    for (const object of this._objects) {
      if (!excludedIds || !excludedIds.has(object.id)) this._drawObject(ctx, object);
    }
    if (this._invertColors) this._applyColorInversion(ctx, width, height);
    this._applyEinkPreview(ctx, width, height);
    if (withSelection) this._drawSelection(ctx);
  }

  _drawObject(ctx, object) {
    ctx.save();
    const box = this._box(object);
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate((Number(object.rotation || 0) * Math.PI) / 180);
    ctx.translate(-box.w / 2, -box.h / 2);
    if (object.flipH) {
      ctx.translate(box.w, 0);
      ctx.scale(-1, 1);
    }
    if (object.type === "text") this._drawText(ctx, object, box);
    else if (object.type === "rect") this._drawRect(ctx, object, box);
    else if (object.type === "line") this._drawLine(ctx, object);
    else if (object.type === "barcode") this._drawBarcode(ctx, object, box);
    else if (object.type === "qr") this._drawQr(ctx, object, box);
    else if (object.type === "chart") this._drawChart(ctx, object, box);
    else if (object.type === "bar_gauge") this._drawBarGauge(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "pie") this._drawPieChart(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "slider") this._drawSliderWidget(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "potentiometer" || object.type === "gauge") this._drawPotentiometerWidget(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "image") this._drawImage(ctx, object, box);
    else if (object.type === "layered") this._drawLayeredObject(ctx, object, box);
    ctx.restore();
  }

  _getWidgetValue(object, defaultPct = 0.5) {
    const minVal = Number(object.min_value ?? 0);
    const maxVal = Number(object.max_value ?? 100);
    const rawEntity = object.entityId ? this._entityRawValue(object) : undefined;
    let val;
    if (rawEntity !== undefined && rawEntity !== null && rawEntity !== "") {
      val = Number(rawEntity);
    } else if (object.sample_value !== undefined && object.sample_value !== null && object.sample_value !== "") {
      val = Number(object.sample_value);
    } else {
      val = (minVal + maxVal) * defaultPct;
    }
    if (!Number.isFinite(val)) val = (minVal + maxVal) * defaultPct;
    return { minVal, maxVal, val };
  }

  _drawBarGauge(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.6);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "%");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const isHorizontal = object.orientation !== "vertical";
    const showValue = object.show_value !== false;
    const valueBand = showValue ? Math.min(Math.max(13, Math.round(h * 0.42)), Math.max(13, h - 8)) : 0;
    const trackX = x + 1;
    const trackY = y + valueBand + 1;
    const trackW = Math.max(3, w - 2);
    const trackH = Math.max(4, h - valueBand - 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = this._color(object.stroke && object.stroke !== "none" ? object.stroke : "black");
    ctx.lineWidth = Math.max(1, Math.min(3, Number(object.stroke_width || 1)));
    ctx.strokeRect(trackX + 0.5, trackY + 0.5, Math.max(1, trackW - 1), Math.max(1, trackH - 1));
    const fillColor = this._color(object.fill && object.fill !== "none" ? object.fill : object.color || "black");
    ctx.fillStyle = fillColor;
    if (isHorizontal) {
      const fillW = Math.round(Math.max(0, trackW - 2) * pct);
      if (fillW > 0) ctx.fillRect(trackX + 1, trackY + 1, fillW, Math.max(1, trackH - 2));
    } else {
      const barH = Math.round(Math.max(0, trackH - 2) * pct);
      if (barH > 0) ctx.fillRect(trackX + 1, trackY + trackH - 1 - barH, Math.max(1, trackW - 2), barH);
    }
    if (showValue) {
      ctx.fillStyle = "#000";
      ctx.font = `700 ${Math.max(9, Math.min(18, valueBand - 3))}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Number(val.toFixed(1))} ${unit}`.trim(), x + w / 2, y + valueBand / 2, w - 4);
    }
    ctx.restore();
  }

  _drawPieChart(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.7);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "%");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const showValue = object.show_value !== false;
    const holePct = Math.max(0, Math.min(80, Number(object.hole_percent ?? 45))) / 100;
    const separateValue = showValue && holePct < 0.32;
    const valueBand = separateValue ? Math.min(16, Math.max(11, Math.round(h * 0.2))) : 0;
    const cx = x + w / 2;
    const cy = y + (h - valueBand) / 2;
    const r = Math.max(4, Math.min(w, h - valueBand) / 2 - 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.stroke();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + pct * Math.PI * 2;
    if (pct > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = this._color(object.color || "black");
      ctx.fill();
    }
    if (holePct > 0) {
      const holeR = r * holePct;
      ctx.beginPath();
      ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }
    if (showValue) {
      const text = `${Number(val.toFixed(1))}${unit}`;
      const textY = separateValue ? y + h - valueBand / 2 : cy;
      const maxTextWidth = separateValue ? Math.max(8, w - 4) : Math.max(8, r * holePct * 1.72);
      const fontSize = separateValue
        ? Math.max(8, Math.min(14, valueBand - 2))
        : Math.max(7, Math.min(16, Math.round(r * Math.max(0.25, holePct) * 0.72)));
      ctx.fillStyle = "#000";
      ctx.font = `700 ${fontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, textY, maxTextWidth);
    }
    ctx.restore();
  }

  _drawSliderWidget(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.5);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "°C");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const valueBand = object.show_value !== false ? Math.min(16, Math.max(11, Math.round(h * 0.34))) : 2;
    const labelBand = Math.min(10, Math.max(7, Math.round(h * 0.2)));
    const trackY = y + valueBand + Math.max(4, (h - valueBand - labelBand) * 0.45);
    const margin = 12;
    const trackW = Math.max(10, w - margin * 2);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + margin, trackY);
    ctx.lineTo(x + margin + trackW, trackY);
    ctx.stroke();
    const color = this._color(object.color || "black");
    const fillW = trackW * pct;
    if (fillW > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + margin, trackY);
      ctx.lineTo(x + margin + fillW, trackY);
      ctx.stroke();
    }
    const thumbX = x + margin + fillW;
    ctx.beginPath();
    ctx.arc(thumbX, trackY, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.font = `600 ${Math.max(7, Math.min(9, labelBand))}px "DRATEK eInk Sans",Arial,sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`${minVal}`, x + margin, y + h);
    ctx.textAlign = "right";
    ctx.fillText(`${maxVal}`, x + margin + trackW, y + h);
    if (object.show_value !== false) {
      ctx.font = `700 ${Math.max(8, Math.min(14, valueBand - 2))}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Number(val.toFixed(1))} ${unit}`.trim(), x + w / 2, y + valueBand / 2, w - 4);
    }
    ctx.restore();
  }

  _drawPotentiometerWidget(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.72);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "°C");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const mode = object.arc_mode || "240";
    let startAngle = Math.PI * (5 / 6);
    let endAngle = Math.PI * (13 / 6);
    if (mode === "180") {
      startAngle = Math.PI;
      endAngle = Math.PI * 2;
    } else if (mode === "360") {
      startAngle = -Math.PI / 2;
      endAngle = Math.PI * 1.5;
    }
    const cx = x + w / 2;
    const cy = y + (mode === "180" ? h * 0.8 : h * 0.52);
    const r = Math.max(6, Math.min(w, h * (mode === "180" ? 0.75 : 0.44)) - 6);
    const strokeW = Math.max(2, Number(object.stroke_width || 6));
    const color = this._color(object.color || "black");
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(1, Math.min(2, strokeW));
    ctx.lineCap = "round";
    ctx.stroke();
    const currentAngle = startAngle + pct * (endAngle - startAngle);
    if (object.show_arc !== false && pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, currentAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    if (object.show_needle !== false) {
      const needleR = r * 0.82;
      const nx = cx + Math.cos(currentAngle) * needleR;
      const ny = cy + Math.sin(currentAngle) * needleR;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, strokeW * 0.6);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, strokeW * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.fillStyle = "#555";
    ctx.font = '600 9px "DRATEK eInk Sans",Arial,sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const minLx = cx + Math.cos(startAngle) * (r + 10);
    const minLy = cy + Math.sin(startAngle) * (r + 10);
    const maxLx = cx + Math.cos(endAngle) * (r + 10);
    const maxLy = cy + Math.sin(endAngle) * (r + 10);
    ctx.fillText(`${minVal}`, minLx, minLy);
    ctx.fillText(`${maxVal}`, maxLx, maxLy);
    if (object.show_value !== false) {
      const text = `${Number(val.toFixed(1))} ${unit}`.trim();
      const fontSize = Math.max(8, Math.min(16, Math.round(r * 0.34)));
      const textY = mode === "360" ? cy : Math.min(y + h - fontSize / 2 - 1, cy + r * 0.58);
      ctx.fillStyle = "#000";
      ctx.font = `700 ${fontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const textWidth = Math.min(w - 4, ctx.measureText(text).width + 6);
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - textWidth / 2, textY - fontSize * 0.58, textWidth, fontSize * 1.16);
      ctx.fillStyle = "#000";
      ctx.fillText(text, cx, textY, w - 6);
    }
    ctx.restore();
  }

  _drawLayeredObject(ctx, object, box) {
    const master = object.customElementId ? (this._customElements || []).find((e) => e.id === object.customElementId) : null;
    const layers = this._storedRecordList(master?.layers || object.customLayers);
    const canvasWidth = Number(master?.canvas_width || object.customCanvasWidth || 296);
    const canvasHeight = Number(master?.canvas_height || object.customCanvasHeight || 128);
    const conditionRules = master
      ? this._storedRecordList(master.condition_rules).map((rule) => ({ operator: rule.operator, value: rule.value || "", symbol: rule.layer_id || rule.symbol || "" }))
      : this._storedRecordList(object.conditionRules);
    const defaultSymbol = master?.default_layer_id || object.defaultSymbol || layers[0]?.id;
    const entityId = master?.entity_id || object.entityId;

    const rawValue = entityId ? this._entityRawValue({ ...object, entityId }) : "";
    const rule = conditionRules.find((item) => this._customConditionMatches(rawValue, item.operator || "equals", item.value || ""));
    const layerId = rule?.symbol || defaultSymbol || layers[0]?.id;
    const layer = layers.find((item) => item.id === layerId) || layers[0];
    this._drawCustomLayer(ctx, layer, box.w, box.h, canvasWidth, canvasHeight, "", false);
  }

  _drawText(ctx, object, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = this._color(object.color);
    const rawEntityValue = object.entityId ? this._entityRawValue(object) : undefined;
    const rawBoundValue = object.entityId ? rawEntityValue : object.variable && object.variableName ? this._variables[object.variableName] : object.text;
    const activeStatusValues = new Set(String(object.statusOnValues || "on,true,1,open,home").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
    const value = Array.isArray(object.conditionRules) && object.conditionRules.length
      ? (object.conditionRules.find((rule) => this._customConditionMatches(rawBoundValue, rule.operator || "equals", rule.value || ""))?.symbol || object.defaultSymbol || "?")
      : object.statusIcons
      ? (activeStatusValues.has(String(rawBoundValue ?? "").trim().toLowerCase()) ? object.statusOnSymbol || "●" : object.statusOffSymbol || "○")
      : object.entityId
        ? `${object.valuePrefix || ""}${(object.valuePrefix || object.valueSuffix ? rawEntityValue : this._entityValue(object)) ?? object.text ?? ""}${object.valueSuffix || ""}`
      : object.variable && object.variableName
        ? (this._variables[object.variableName] ?? object.text ?? "")
      : (object.text || "");
    const lines = String(value).split("\n");
    const family = '"DRATEK eInk Sans"';
    const weight = object.bold ? "700 " : "600 ";
    const padding = Math.max(0, Number(object.padding || 0));
    const availableW = Math.max(1, box.w - padding * 2);
    const availableH = Math.max(1, box.h - padding * 2);
    const minFontSize = Math.max(10, Number(object.minFontSize || this._readableMinFontSize()));
    let fontSize = Math.max(minFontSize, Number(object.fontSize || 24));
    if (object.autoFit !== false) {
      for (let attempt = 0; attempt < 40; attempt++) {
        ctx.font = `${weight}${fontSize}px ${family}, Arial, sans-serif`;
        const lineHeight = fontSize * 1.08;
        const maxWidth = Math.max(...lines.map((line) => ctx.measureText(line || " ").width));
        if (maxWidth <= availableW && lineHeight * lines.length <= availableH) break;
        fontSize -= 1;
        if (fontSize <= minFontSize) {
          fontSize = minFontSize;
          break;
        }
      }
    }
    ctx.font = `${weight}${fontSize}px ${family}, Arial, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = object.textAlign || "left";
    const lineHeight = fontSize * 1.08;
    const totalHeight = lineHeight * lines.length;
    const startY = padding + (
      object.verticalAlign === "bottom"
        ? Math.max(0, availableH - totalHeight)
        : object.verticalAlign === "middle"
          ? Math.max(0, (availableH - totalHeight) / 2)
          : 0
    );
    const x = ctx.textAlign === "center" ? box.w / 2 : ctx.textAlign === "right" ? box.w - padding : padding;
    lines.forEach((line, index) => this._drawReadableLine(ctx, String(line), x, startY + index * lineHeight, availableW));
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  _readableMinFontSize() {
    const size = this._displaySize();
    const shortSide = Math.min(size.width, size.height);
    if (shortSide <= 128) return 11;
    if (shortSide <= 168) return 12;
    if (shortSide <= 250) return 13;
    return 14;
  }

  _drawReadableLine(ctx, text, x, y, maxWidth) {
    const metrics = ctx.measureText(text || " ");
    const width = metrics.width;
    const baselineY = y + (Number(metrics.actualBoundingBoxAscent) || Math.max(1, parseFloat(ctx.font) * 0.8));
    if (width <= maxWidth) {
      ctx.fillText(text, x, baselineY);
      return;
    }
    const minScale = 0.84;
    const scale = Math.max(minScale, maxWidth / Math.max(1, width));
    let output = text;
    if (width * minScale > maxWidth) {
      output = this._ellipsizeText(ctx, text, maxWidth / minScale);
    }
    ctx.save();
    ctx.translate(x, baselineY);
    ctx.scale(scale, 1);
    const localX = ctx.textAlign === "center" ? 0 : ctx.textAlign === "right" ? 0 : 0;
    ctx.fillText(output, localX, 0);
    ctx.restore();
  }

  _ellipsizeText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const suffix = "...";
    let output = text;
    while (output.length > 1 && ctx.measureText(output + suffix).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return `${output}${suffix}`;
  }

  _drawRect(ctx, object, box) {
    if (object.fill && object.fill !== "none") {
      ctx.fillStyle = this._color(object.fill);
      ctx.fillRect(0, 0, box.w, box.h);
    }
    if (object.stroke && object.stroke !== "none" && Number(object.strokeWidth) > 0) {
      ctx.strokeStyle = this._color(object.stroke);
      ctx.lineWidth = Number(object.strokeWidth || 1);
      ctx.strokeRect(0, 0, box.w, box.h);
    }
  }

  _drawLine(ctx, object) {
    ctx.strokeStyle = this._color(object.color);
    ctx.lineWidth = Number(object.strokeWidth || 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo((object.x2 || object.x) - object.x, (object.y2 || object.y) - object.y);
    ctx.stroke();
  }

  _drawBarcode(ctx, object, box) {
    const text = this._normalizeEan13(object.text || "8591234567890");
    const pattern = this._ean13Pattern(text);
    const labelHeight = Math.min(20, Math.max(13, Math.floor(box.h * 0.22)));
    const gap = 4;
    const barHeight = Math.max(12, box.h - labelHeight - gap);
    const moduleWidth = Math.max(1, Math.floor(box.w / pattern.length));
    const barcodeWidth = moduleWidth * pattern.length;
    const startX = Math.floor((box.w - barcodeWidth) / 2);
    ctx.fillStyle = this._color(object.backgroundColor || "white");
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = this._color(object.color);
    for (let index = 0; index < pattern.length; index++) {
      if (pattern[index] === "1") ctx.fillRect(startX + index * moduleWidth, 0, moduleWidth, barHeight);
    }
    ctx.font = `${Math.max(10, labelHeight - 5)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, box.w / 2, barHeight + gap);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  _normalizeEan13(value) {
    let digits = String(value).replace(/\D/g, "");
    if (digits.length < 12) digits = digits.padEnd(12, "0");
    if (digits.length > 13) digits = digits.slice(0, 13);
    if (digits.length === 12) digits += this._ean13Checksum(digits);
    return digits.slice(0, 12) + this._ean13Checksum(digits.slice(0, 12));
  }

  _ean13Checksum(twelveDigits) {
    const sum = twelveDigits.split("").reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return String((10 - (sum % 10)) % 10);
  }

  _ean13Pattern(digits) {
    const leftOdd = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
    const leftEven = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
    const right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
    const parity = ["OOOOOO", "OOEOEE", "OOEEOE", "OOEEEO", "OEOOEE", "OEEOOE", "OEEEOO", "OEOEOE", "OEOEEO", "OEEOEO"][Number(digits[0])];
    let pattern = "101";
    for (let i = 1; i <= 6; i++) pattern += parity[i - 1] === "O" ? leftOdd[Number(digits[i])] : leftEven[Number(digits[i])];
    pattern += "01010";
    for (let i = 7; i <= 12; i++) pattern += right[Number(digits[i])];
    return pattern + "101";
  }

  _drawQr(ctx, object, box) {
    const data = String(object.text || "https://dratek.cz");
    const qr = qrcode(0, "M");
    qr.addData(data);
    qr.make();
    const cells = qr.getModuleCount();
    const quiet = 4;
    const cell = Math.max(1, Math.floor(Math.min(box.w, box.h) / (cells + quiet * 2)));
    const total = cell * (cells + quiet * 2);
    const offsetX = Math.floor((box.w - total) / 2) + quiet * cell;
    const offsetY = Math.floor((box.h - total) / 2) + quiet * cell;
    ctx.fillStyle = this._color(object.backgroundColor || "white");
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = this._color(object.color);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        if (qr.isDark(y, x)) ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
      }
    }
  }

  _chartValues(object) {
    const raw = String(object.entityId
      ? (this._entityValue(object) || object.data || "")
      : object.variable && object.variableName
        ? (this._variables[object.variableName] ?? object.data ?? "")
      : (object.data || "")).trim();
    let values = [];
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) values = parsed.map(Number).filter(Number.isFinite);
      } catch (_err) { /* Use the text parser below. */ }
    }
    if (!values.length) {
      const parts = raw.includes(";")
        ? raw.split(/[;\n]+/).map((value) => value.trim().replace(",", "."))
        : raw.split(/[,\s\n]+/);
      values = parts.map(Number).filter(Number.isFinite);
    }
    return values.slice(-Math.max(2, Math.min(96, Number(object.maxPoints || 24))));
  }

  _drawChart(ctx, object, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = this._color(object.backgroundColor || "white");
    ctx.fillRect(0, 0, box.w, box.h);
    const values = this._chartValues(object);
    const color = this._color(object.color || "black");
    const graphColor = this._color(object.graphColor || "black");
    const legendFontSize = Math.max(6, Math.min(18, Number(object.legendFontSize || 8)));
    const title = String(object.chartTitle || "").trim();
    const showAxes = object.showAxes !== false;
    const left = showAxes ? Math.max(object.yLabel ? 46 : 25, Math.round(legendFontSize * 3.4)) : 5;
    const right = 6;
    const top = title ? Math.max(17, legendFontSize + 8) : 5;
    const bottom = showAxes ? Math.max(object.xLabel ? 22 : 14, object.xLabel ? legendFontSize * 2.4 : legendFontSize + 7) : 5;
    const plotW = Math.max(8, box.w - left - right);
    const plotH = Math.max(8, box.h - top - bottom);

    ctx.fillStyle = graphColor;
    ctx.font = '700 10px "DRATEK eInk Sans",Arial,sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (title) ctx.fillText(title, box.w / 2, 2, Math.max(10, box.w - 8));
    if (!values.length) {
      ctx.font = '600 9px "DRATEK eInk Sans",Arial,sans-serif';
      ctx.textBaseline = "middle";
      ctx.fillText("Zadejte data grafu", box.w / 2, box.h / 2);
      ctx.restore();
      return;
    }

    const explicitMin = String(object.chartMin ?? "").trim() !== "" ? Number(object.chartMin) : null;
    const explicitMax = String(object.chartMax ?? "").trim() !== "" ? Number(object.chartMax) : null;
    let min = Number.isFinite(explicitMin) ? explicitMin : Math.min(...values);
    let max = Number.isFinite(explicitMax) ? explicitMax : Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    if (min > max) [min, max] = [max, min];
    if (!Number.isFinite(explicitMin) || !Number.isFinite(explicitMax)) {
      const padding = Math.max(0.01, (max - min) * 0.06);
      if (!Number.isFinite(explicitMin)) min -= padding;
      if (!Number.isFinite(explicitMax)) max += padding;
    }
    const yFor = (value) => top + plotH - ((value - min) / Math.max(0.000001, max - min)) * plotH;
    const xFor = (index) => object.chartType === "bar"
      ? left + ((index + 0.5) / Math.max(1, values.length)) * plotW
      : left + (values.length === 1 ? plotW / 2 : (index / (values.length - 1)) * plotW);

    if (object.showGrid !== false) {
      ctx.strokeStyle = graphColor;
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([2, 2]);
      for (let step = 0; step <= 3; step++) {
        const y = top + (plotH * step) / 3;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke();
      }
      const verticals = Math.min(6, Math.max(2, values.length - 1));
      for (let step = 0; step <= verticals; step++) {
        const x = left + (plotW * step) / verticals;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (showAxes) {
      ctx.strokeStyle = graphColor;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, top + plotH); ctx.lineTo(left + plotW, top + plotH); ctx.stroke();
      ctx.fillStyle = graphColor;
      ctx.font = `600 ${legendFontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(this._formatChartNumber(max), left - 3, top + 2);
      ctx.fillText(this._formatChartNumber(min), left - 3, top + plotH - 2);
      const labels = String(object.chartLabels || "").split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean).slice(-values.length);
      const labelIndexes = values.length > 2 && plotW > 140 ? [0, Math.floor((values.length - 1) / 2), values.length - 1] : [0, values.length - 1];
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const index of [...new Set(labelIndexes)]) ctx.fillText(labels[index] || String(index + 1), xFor(index), top + plotH + 3, 34);
      ctx.font = `700 ${Math.min(18, legendFontSize + 1)}px "DRATEK eInk Sans",Arial,sans-serif`;
      if (object.xLabel) ctx.fillText(String(object.xLabel), left + plotW / 2, box.h - legendFontSize - 2, plotW);
      if (object.yLabel) {
        ctx.save();
        ctx.translate(7, top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = "top";
        ctx.fillText(String(object.yLabel), 0, 0, plotH);
        ctx.restore();
      }
    }

    if (object.chartType === "bar") {
      const slot = plotW / Math.max(1, values.length);
      const barW = Math.max(1, slot * 0.62);
      const baselineValue = min <= 0 && max >= 0 ? 0 : min;
      const baselineY = yFor(baselineValue);
      const barColor = object.barColor || "red";
      ctx.fillStyle = this._color(barColor);
      values.forEach((value, index) => {
        const x = left + index * slot + (slot - barW) / 2;
        const y = yFor(value);
        const barY = Math.min(y, baselineY);
        const barH = Math.max(1, Math.abs(baselineY - y));
        ctx.fillRect(x, barY, barW, barH);
        if (barColor === "white") {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, barY + 0.5, Math.max(0, barW - 1), Math.max(0, barH - 1));
        }
      });
    } else {
      if (object.chartType === "area") {
        const baselineValue = min <= 0 && max >= 0 ? 0 : min;
        const baselineY = yFor(baselineValue);
        ctx.beginPath();
        ctx.moveTo(xFor(0), baselineY);
        values.forEach((value, index) => ctx.lineTo(xFor(index), yFor(value)));
        ctx.lineTo(xFor(values.length - 1), baselineY);
        ctx.closePath();
        ctx.fillStyle = object.color === "red" ? "rgba(212,20,20,.35)" : "rgba(0,0,0,.28)";
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, Number(object.strokeWidth || 2));
      ctx.beginPath();
      values.forEach((value, index) => index ? ctx.lineTo(xFor(index), yFor(value)) : ctx.moveTo(xFor(index), yFor(value)));
      ctx.stroke();
      ctx.fillStyle = color;
      values.forEach((value, index) => { ctx.beginPath(); ctx.arc(xFor(index), yFor(value), 1.7, 0, Math.PI * 2); ctx.fill(); });
    }

    if (object.showValues) {
      ctx.fillStyle = graphColor;
      ctx.font = `700 ${legendFontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const every = values.length <= 10 ? 1 : Math.ceil(values.length / 8);
      values.forEach((value, index) => {
        if (index % every !== 0 && index !== values.length - 1) return;
        const text = this._formatChartNumber(value);
        const textWidth = ctx.measureText(text).width;
        const textY = Math.max(top + legendFontSize + 1, yFor(value) - 2);
        ctx.fillStyle = "#fff";
        ctx.fillRect(xFor(index) - textWidth / 2 - 1, textY - legendFontSize - 1, textWidth + 2, legendFontSize + 2);
        ctx.fillStyle = graphColor;
        ctx.fillText(text, xFor(index), textY);
      });
    }
    ctx.restore();
  }

  _formatChartNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    const digits = Math.abs(number) >= 100 ? 0 : Math.abs(number) >= 10 ? 1 : 2;
    return number.toFixed(digits).replace(".", ",");
  }

  _drawImage(ctx, object, box) {
    if (!object._img && object.image) {
      object._img = new Image();
      object._img.onload = () => this._paint();
      object._img.src = object.image;
    }
    if (object._img && object._img.complete) this._drawTintedCanvasImage(ctx, object._img, 0, 0, box.w, box.h, object.tint || "original");
  }

  _drawTintedCanvasImage(ctx, image, x, y, width, height, tint = "original") {
    if (!["black", "red", "white"].includes(tint)) {
      ctx.drawImage(image, x, y, width, height);
      return;
    }
    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, Math.round(width));
    buffer.height = Math.max(1, Math.round(height));
    const bufferCtx = buffer.getContext("2d");
    bufferCtx.drawImage(image, 0, 0, buffer.width, buffer.height);
    bufferCtx.globalCompositeOperation = "source-in";
    bufferCtx.fillStyle = this._color(tint);
    bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
    ctx.drawImage(buffer, x, y, width, height);
  }

  _applyEinkPreview(ctx, width, height) {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const redScore = r - Math.max(g, b);
      const luma = (38 * r + 75 * g + 15 * b) >> 7;
      if (redScore > 45 && r > 120) {
        data[i] = 220; data[i + 1] = 20; data[i + 2] = 12;
      } else if (luma < 160) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
      } else {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  _applyColorInversion(ctx, width, height) {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const redScore = r - Math.max(g, b);
      if (redScore > 45 && r > 110) continue;
      const luma = (38 * r + 75 * g + 15 * b) >> 7;
      const value = luma < 128 ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
  }

  _drawSelection(ctx) {
    ctx.save();
    ctx.strokeStyle = "#009999";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id) && !item.hidden)) {
      const box = this._box(object);
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
      const handles = this._handles(box);
      const rotHandle = handles.find((h) => h.name === "rotate");
      if (rotHandle && !object.locked) {
        ctx.beginPath();
        ctx.moveTo(box.x + box.w / 2, box.y);
        ctx.lineTo(rotHandle.x, rotHandle.y);
        ctx.strokeStyle = "rgba(0, 153, 153, 0.6)";
        ctx.stroke();
      }
      for (const handle of handles) {
        if (object.locked && handle.name === "rotate") continue;
        const isRotate = handle.name === "rotate";
        const size = isRotate ? Math.max(10, 14 / this._zoom) : Math.max(7, 10 / this._zoom);
        const half = size / 2;
        ctx.beginPath();
        if (isRotate) {
          ctx.arc(handle.x, handle.y, half, 0, Math.PI * 2);
          ctx.fillStyle = "#ff6600";
          ctx.strokeStyle = "#fff";
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = object.locked ? "#f59e0b" : "#fff";
          ctx.strokeStyle = "#009999";
          ctx.fillRect(handle.x - half, handle.y - half, size, size);
          ctx.strokeRect(handle.x - half, handle.y - half, size, size);
        }
      }
    }
    if (this._drag?.mode === "marquee") {
      const x = Math.min(this._drag.start.x, this._drag.current.x);
      const y = Math.min(this._drag.start.y, this._drag.current.y);
      const w = Math.abs(this._drag.current.x - this._drag.start.x);
      const h = Math.abs(this._drag.current.y - this._drag.start.y);
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#009999";
      ctx.fillStyle = "rgba(0, 153, 153, 0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _box(object) {
    if (object.type === "line") return { x: Math.min(object.x, object.x2), y: Math.min(object.y, object.y2), w: Math.abs(object.x2 - object.x), h: Math.abs(object.y2 - object.y) };
    return { x: Number(object.x || 0), y: Number(object.y || 0), w: Math.max(1, Number(object.w || 1)), h: Math.max(1, Number(object.h || 1)) };
  }

  _handles(box) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return [
      { name: "top-left", x: box.x, y: box.y, cursor: "nwse-resize" },
      { name: "top-middle", x: cx, y: box.y, cursor: "ns-resize" },
      { name: "top-right", x: box.x + box.w, y: box.y, cursor: "nesw-resize" },
      { name: "middle-right", x: box.x + box.w, y: cy, cursor: "ew-resize" },
      { name: "bottom-right", x: box.x + box.w, y: box.y + box.h, cursor: "nwse-resize" },
      { name: "bottom-middle", x: cx, y: box.y + box.h, cursor: "ns-resize" },
      { name: "bottom-left", x: box.x, y: box.y + box.h, cursor: "nesw-resize" },
      { name: "middle-left", x: box.x, y: cy, cursor: "ew-resize" },
      { name: "rotate", x: cx, y: box.y - 18, cursor: "grab" },
    ];
  }

  _automaticTextBindings() {
    return this._objects.filter((object) => ["text", "chart", "layered", "bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type) && object.entityId && object.autoUpdate !== false);
  }

  _entityAutomationPayload() {
    const objects = this._automaticTextBindings();
    if (!objects.length) return { enabled: false };
    const size = this._displaySize();
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    this._drawScene(canvas.getContext("2d"), size.width, size.height, false, new Set(objects.map((object) => object.id)));
    const effectiveColor = (color) => {
      if (!this._invertColors || color === "red") return color || "black";
      return color === "white" ? "black" : "white";
    };
    return {
      enabled: true,
      base_image: canvas.toDataURL("image/png"),
      refresh_interval_seconds: this._refreshIntervalSeconds,
      bindings: objects.map((object) => {
        if (["bar_gauge", "pie", "slider", "gauge", "potentiometer"].includes(object.type)) {
          const layerId = `widget-${object.id}`;
          const widget = structuredClone(object);
          widget.x = 0;
          widget.y = 0;
          widget.w = Number(object.w || 1);
          widget.h = Number(object.h || 1);
          widget.rotation = 0;
          widget.entity_id = object.entityId;
          widget.entity_attribute = object.entityAttribute || "";
          return {
            id: object.id, type: "layered", entity_id: object.entityId,
            entity_ids: [object.entityId], entity_attribute: object.entityAttribute || "",
            include_unit: false, fallback: layerId,
            x: Number(object.x || 0), y: Number(object.y || 0),
            w: Number(object.w || 1), h: Number(object.h || 1),
            rotation: Number(object.rotation || 0), flipH: !!object.flipH,
            canvas_width: Number(object.w || 1), canvas_height: Number(object.h || 1),
            layers: [{ id: layerId, name: object.label || "Ukazatel", objects: [widget] }],
            condition_rules: [], default_symbol: layerId,
          };
        }
        if (object.type === "layered") {
          const master = object.customElementId ? (this._customElements || []).find((e) => e.id === object.customElementId) : null;
          const layers = this._storedRecordList(master?.layers || object.customLayers);
          const canvasW = Number(master?.canvas_width || object.customCanvasWidth || 296);
          const canvasH = Number(master?.canvas_height || object.customCanvasHeight || 128);
          const conditionRules = master
            ? this._storedRecordList(master.condition_rules).map((rule) => ({ operator: rule.operator, value: rule.value || "", symbol: rule.layer_id || rule.symbol || "" }))
            : this._storedRecordList(object.conditionRules);
          const defaultSymbol = master?.default_layer_id || object.defaultSymbol || layers[0]?.id || "";
          const entityId = master?.entity_id || object.entityId || "";
          const entityAttr = master?.entity_attribute || object.entityAttribute || "";
          const entityIds = [...new Set([
            entityId,
            ...layers.flatMap((layer) => this._storedRecordList(layer.objects).map((item) => item.entity_id || item.entityId || "")),
          ].filter(Boolean))];
          return {
            id: object.id, type: "layered", entity_id: entityId,
            custom_element_id: object.customElementId || "",
            entity_ids: entityIds,
            entity_attribute: entityAttr, include_unit: false, fallback: defaultSymbol,
            x: Number(object.x || 0), y: Number(object.y || 0), w: Number(object.w || 1), h: Number(object.h || 1),
            rotation: Number(object.rotation || 0), flipH: !!object.flipH,
            canvas_width: canvasW, canvas_height: canvasH,
            layers: structuredClone(layers),
            condition_rules: structuredClone(conditionRules), default_symbol: defaultSymbol,
          };
        }
        if (object.type === "chart") {
          const chartType = object.chartType || "line";
          return {
            id: object.id, type: "chart", entity_id: object.entityId,
            custom_element_id: object.customElementId || "",
            entity_attribute: object.entityAttribute || "", include_unit: false, fallback: object.data || "",
            x: Number(object.x || 0), y: Number(object.y || 0), w: Number(object.w || 1), h: Number(object.h || 1),
            chartType, chartTitle: object.chartTitle || "", chartLabels: object.chartLabels || "",
            xLabel: object.xLabel || "", yLabel: object.yLabel || "",
            chartMin: object.chartMin ?? "", chartMax: object.chartMax ?? "",
            maxPoints: Number(object.maxPoints || 48), legendFontSize: Number(object.legendFontSize || 8),
            showAxes: object.showAxes !== false, showGrid: object.showGrid !== false, showValues: !!object.showValues,
            backgroundColor: object.backgroundColor || "white", graphColor: object.graphColor || "black",
            history_mode: object.historyMode || "rolling",
            color: chartType === "bar" ? (object.barColor || "red") : (object.color || "black"),
            strokeWidth: Number(object.strokeWidth || 2),
          };
        }
        return {
          id: object.id,
          custom_element_id: object.customElementId || "",
          entity_id: object.entityId,
          entity_attribute: object.entityAttribute || "",
          include_unit: !object.entityAttribute && !object.valueSuffix,
          fallback: object.text || "",
          x: Number(object.x || 0), y: Number(object.y || 0),
          w: Number(object.w || 1), h: Number(object.h || 1),
          rotation: Number(object.rotation || 0), flipH: !!object.flipH,
          color: effectiveColor(object.color), fontSize: Number(object.fontSize || 16),
          minFontSize: Number(object.minFontSize || this._readableMinFontSize()),
          bold: !!object.bold, textAlign: object.textAlign || "left",
          verticalAlign: object.verticalAlign || "middle", autoFit: object.autoFit !== false,
          padding: Number(object.padding || 0),
          value_prefix: object.valuePrefix || "", value_suffix: object.valueSuffix || "",
          status_icons: !!object.statusIcons, status_on_symbol: object.statusOnSymbol || "●",
          status_off_symbol: object.statusOffSymbol || "○", status_on_values: object.statusOnValues || "on,true,1,open,home",
          condition_rules: structuredClone(object.conditionRules || []), default_symbol: object.defaultSymbol || "?",
        };
      }),
    };
  }

  _renderExportCanvas() {
    const size = this._displaySize();
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    this._drawScene(canvas.getContext("2d"), size.width, size.height, false);
    return canvas;
  }

  _color(value) {
    if (value === "red") return "#d41414";
    if (value === "white") return "#fff";
    return "#000";
  }

  _hash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  _renderSendResult() {
    if (!this._sendResult) return "";
    const cls = this._sendResult.ok ? "good" : "bad";
    const text = this._sendResult.ok ? "Odeslano do displeje." : `Odeslani selhalo: ${this._sendResult.error || "neznama chyba"}`;
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(text)}</span></div>`;
  }

  _renderSymbolDialog() {
    if (!this._symbolPickerOpen) return "";
    const query = this._symbolSearch.trim().toLowerCase();
    const symbols = this._symbolCatalog().filter((item) => {
      const categoryMatch = this._symbolCategory === "all" || item.category === this._symbolCategory;
      const queryMatch = !query || item.label.toLowerCase().includes(query) || item.symbol.includes(query);
      return categoryMatch && queryMatch;
    });
    return `<div class="modal-backdrop">
      <div class="symbol-dialog">
        <div class="section-title"><h2>Vložit symbol</h2><button id="closeSymbols" class="secondary"><ha-icon icon="mdi:close"></ha-icon>Zavřít</button></div>
        <div class="symbol-search"><input id="symbolSearch" value="${this._escape(this._symbolSearch)}" placeholder="Hledat symbol, například Wi-Fi, teplota, světlo..."><span class="pill muted">${symbols.length} symbolů</span></div>
        <div class="category-row">${this._symbolCategories().map(([id, label]) => `<button class="secondary ${this._symbolCategory === id ? "active" : ""}" data-symbol-category="${this._escape(id)}">${this._escape(label)}</button>`).join("")}</div>
        <div class="symbol-grid">${symbols.map((item) => `<button class="symbol-tile" data-symbol="${this._escape(item.symbol)}" title="${this._escape(item.label)}"><strong>${this._escape(item.symbol)}</strong><span>${this._escape(item.label)}</span></button>`).join("")}</div>
      </div>
    </div>`;
  }

  _renderTemplates() {
    return this._templateDefinitions().map((template) => `
      <button class="template-card" data-template="${this._escape(template.id)}" title="Pouzit sablonu ${this._escape(template.title)}">
        <ha-icon icon="${this._escape(template.icon)}"></ha-icon>
        <div><strong>${this._escape(template.title)}</strong><span>vlozit layout</span></div>
      </button>
    `).join("");
  }

  _renderTransformSelector(device) {
    if (!this._isPe29Device(device)) return "";
    const options = this._transformOptions()
      .map(([value, label]) => `<option value="${this._escape(value)}" ${this._displayTransform === value ? "selected" : ""}>${this._escape(label)}</option>`)
      .join("");
    return `<div class="transform-box"><div class="field"><label>Mapování 2,9&quot; displeje</label><select id="displayTransform">${options}</select></div><small>Pokud je obraz na PE29 posunutý, otočený nebo zrcadlený, změňte tuto volbu a návrh znovu odešlete. Volba se ukládá ke konkrétní BLE adrese displeje.</small></div>`;
  }

  _devicePreviewSize(device) {
    const address = String(device.address || "").toUpperCase();
    const draft = this._deviceDrafts[address] || null;
    const base = this._baseDisplaySize(device);
    const portrait = draft?.orientation === "portrait";
    const sourceWidth = Math.max(1, Number(draft?.width || (portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height))));
    const sourceHeight = Math.max(1, Number(draft?.height || (portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height))));
    return { width: sourceWidth, height: sourceHeight, draft };
  }

  _renderDeviceBarcode(value, horizontal = false) {
    const patterns = [
      "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
      "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
      "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
      "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
      "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
      "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
      "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
      "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
      "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
      "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
      "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
    ];
    const text = String(value || "00.00.00.00");
    const dataCodes = [...text].map((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126 ? code - 32 : 0;
    });
    const startCode = 104;
    const checksum = (startCode + dataCodes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
    const symbols = [startCode, ...dataCodes, checksum, 106];
    let offset = 10;
    const bars = [];
    symbols.forEach((symbol) => {
      [...patterns[symbol]].forEach((moduleWidth, index) => {
        const width = Number(moduleWidth);
        if (index % 2 === 0) bars.push(horizontal
          ? `<rect x="${offset}" y="0" width="${width}" height="54"></rect>`
          : `<rect x="0" y="${offset}" width="54" height="${width}"></rect>`);
        offset += width;
      });
    });
    const totalHeight = offset + 10;
    const viewBox = horizontal ? `0 0 ${totalHeight} 54` : `0 0 54 ${totalHeight}`;
    return `<svg class="device-preview-barcode ${horizontal ? "horizontal" : "vertical"}" viewBox="${viewBox}" preserveAspectRatio="none" role="img" aria-label="Čárový kód ${this._escape(text)}">${bars.join("")}</svg>`;
  }

  _renderDevicePreview(device, mode = "full") {
    const address = String(device.address || "").toUpperCase();
    const { width: sourceWidth, height: sourceHeight, draft } = this._devicePreviewSize(device);
    const previewSizes = {
      full: { canvasWidth: 360, canvasHeight: 205, targetHeight: 190, minWidth: 108, maxWidth: 420 },
      large: { canvasWidth: 300, canvasHeight: 155, targetHeight: 148, minWidth: 96, maxWidth: 340 },
      compact: { canvasWidth: 220, canvasHeight: 100, targetHeight: 92, minWidth: 78, maxWidth: 240 },
    };
    const previewMode = previewSizes[mode] ? mode : "full";
    const sizing = previewSizes[previewMode];
    const maxCanvasWidth = sizing.canvasWidth;
    const maxCanvasHeight = sizing.canvasHeight;
    const scale = Math.min(maxCanvasWidth / sourceWidth, maxCanvasHeight / sourceHeight, 1);
    const canvasWidth = Math.max(40, Math.round(sourceWidth * scale));
    const canvasHeight = Math.max(28, Math.round(sourceHeight * scale));
    const portraitLayout = sourceHeight > sourceWidth;
    const frameRatio = Math.max(0.48, Math.min(3.7, (sourceWidth / sourceHeight) * (portraitLayout ? 0.95 : 1 / 0.95)));
    const previewWidth = Math.max(sizing.minWidth, Math.min(sizing.maxWidth, Math.round(sizing.targetHeight * frameRatio)));
    const pe29Layout = this._isPe29Device(device);
    const physicalCode = device.physical_code || "00.00.00.00";
    return `<div class="device-preview-wrap preview-${previewMode}">
      <div class="device-preview-bezel ${pe29Layout ? "device-preview-pe29" : ""} ${portraitLayout ? "device-preview-portrait" : "device-preview-landscape"}" style="--frame-ratio:${frameRatio.toFixed(4)};--preview-width:${previewWidth}px" title="Náhled ${this._escape(sourceWidth)} × ${this._escape(sourceHeight)}">
        ${pe29Layout ? `<span class="device-preview-identification"><span class="device-preview-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, portraitLayout)}</span>` : `<span class="device-preview-code">${this._escape(physicalCode)}</span>`}
        <div class="device-preview-screen">
          <canvas data-device-preview="${this._escape(address)}" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}" width="${canvasWidth}" height="${canvasHeight}"></canvas>
          ${draft ? "" : `<div class="device-preview-empty"><span><ha-icon icon="mdi:image-outline"></ha-icon>Prázdný návrh</span></div>`}
        </div>
      </div>
    </div>`;
  }

  _renderDeviceCards(devices, selectedAddress) {
    if (!devices.length) {
      return `<div class="empty-state"><img class="empty-logo" src="/dratek_eink_panel/dratek-eink-logo.png?v=${DRATEK_EINK_VERSION}" alt="DRATEK.CZ eInk"><h2>${this._loading ? "Hledám displeje v okolí" : "V okolí zatím není žádný displej"}</h2><p>${this._loading ? "Scan se spustil automaticky po otevření panelu." : "Hledání můžeš kdykoliv zopakovat tlačítkem Obnovit."}</p></div>`;
    }
    const mode = this._effectiveViewMode(this._deviceViewMode, devices.length);
    return `<div class="display-grid density-${mode}">${devices.map((device) => {
      const selected = device.address === selectedAddress;
      const battery = this._batteryInfo(device);
      const rssi = Number(device.rssi);
      const paths = device.paths || [];
      const editing = this._editingDeviceAddress === device.address;
      const preferredPath = paths[0];
      const previewSize = this._devicePreviewSize(device);
      const temporarilyUnseen = !!device.temporarily_unseen;
      return `<article class="display-tile ${selected ? "selected" : ""} ${temporarilyUnseen ? "is-stale" : ""}" data-device-card-open="${this._escape(device.address)}" role="button" tabindex="0" aria-label="Otevřít ${this._escape(this._deviceTitle(device))} v designeru">
        <header class="display-tile-header">
          <span class="display-online-dot ${temporarilyUnseen ? "stale" : ""}" title="${temporarilyUnseen ? "Displej nebyl zachycen v posledním krátkém skenu" : "Displej je dostupný"}"></span>
          <div class="display-tile-identity"><strong>${this._escape(this._deviceTitle(device))}</strong><span>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</span></div>
          <span class="display-resolution"><ha-icon icon="mdi:aspect-ratio"></ha-icon>${previewSize.width} × ${previewSize.height}</span>
        </header>
        ${mode === "list" ? "" : `<div class="display-preview-slot">${this._renderDevicePreview(device, mode)}</div>`}
        <div class="display-health">
          <div class="display-health-item display-battery-item" title="Odhad zbývající kapacity CR2450${Number.isFinite(battery.voltage) ? ` · ${this._formatBatteryVoltage(battery.voltage)}` : ""}"><small>Baterie</small>${this._renderBatterySegments(battery.percent)}<strong>${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></div>
          <div class="display-health-item display-signal-item"><small>Signál</small>${this._renderSignalBars(rssi)}<strong class="signal-value ${this._signalClass(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
          <div class="display-health-item display-health-route ${temporarilyUnseen ? "stale" : ""}"><ha-icon icon="${temporarilyUnseen ? "mdi:bluetooth-off" : preferredPath?.type === "local" ? "mdi:bluetooth-connect" : "mdi:router-wireless"}"></ha-icon><span><small>Připojení</small><strong>${temporarilyUnseen ? "Čekám na další signál" : this._escape(preferredPath?.name || "Nedostupné")}</strong></span></div>
        </div>
        ${editing ? `<div class="device-name-edit display-name-edit"><input data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Například Kuchyň"><button data-device-name-save="${this._escape(device.address)}" title="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button><button class="secondary" data-device-name-cancel title="Zrušit"><ha-icon icon="mdi:close"></ha-icon></button></div>` : `<footer class="display-tile-actions"><button class="secondary" data-device-rename="${this._escape(device.address)}"><ha-icon icon="mdi:pencil-outline"></ha-icon>${device.display_name ? "Přejmenovat" : "Pojmenovat"}</button><button data-select-device="${this._escape(device.address)}"><ha-icon icon="mdi:vector-square-edit"></ha-icon>Otevřít v designeru</button></footer>`}
      </article>`;
    }).join("")}</div>`;
  }

  _batteryInfo(device) {
    const raw = Number(device.battery_raw ?? device.battery);
    const reportedVoltage = Number(device.battery_voltage);
    const voltage = Number.isFinite(reportedVoltage) && reportedVoltage > 0
      ? reportedVoltage
      : Number.isFinite(raw) && raw > 0
        ? (raw > 5 ? raw / 10 : raw)
        : NaN;
    const reportedPercent = Number(device.battery_percent);
    const percent = Number.isFinite(reportedPercent)
      ? Math.max(0, Math.min(100, Math.round(reportedPercent)))
      : this._cr2450Percent(voltage);
    return { voltage, percent };
  }

  _cr2450Percent(voltage) {
    if (!Number.isFinite(voltage)) return NaN;
    const curve = [[3.20, 100], [3.10, 96], [3.00, 85], [2.90, 55], [2.80, 20], [2.70, 8], [2.60, 4], [2.50, 2], [2.00, 0]];
    if (voltage >= curve[0][0]) return 100;
    if (voltage <= curve[curve.length - 1][0]) return 0;
    for (let index = 0; index < curve.length - 1; index++) {
      const [highVoltage, highPercent] = curve[index];
      const [lowVoltage, lowPercent] = curve[index + 1];
      if (voltage >= lowVoltage && voltage <= highVoltage) {
        const ratio = (voltage - lowVoltage) / (highVoltage - lowVoltage);
        return Math.round(lowPercent + ratio * (highPercent - lowPercent));
      }
    }
    return 0;
  }

  _formatBatteryVoltage(voltage) {
    if (!Number.isFinite(voltage)) return "-";
    const decimals = Math.abs(voltage * 10 - Math.round(voltage * 10)) < 0.000001
      ? 1
      : Math.abs(voltage * 100 - Math.round(voltage * 100)) < 0.000001 ? 2 : 3;
    return `${voltage.toFixed(decimals).replace(".", ",")} V`;
  }

  _batteryPercent(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  _batteryClass(value) {
    if (!Number.isFinite(value)) return "unknown";
    if (value >= 50) return "high";
    if (value >= 25) return "medium";
    return "low";
  }

  _batteryLevel(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value >= 75) return 4;
    if (value >= 50) return 3;
    if (value >= 25) return 2;
    return 1;
  }

  _renderBatterySegments(value) {
    const level = this._batteryLevel(value);
    const label = Number.isFinite(value) ? `Baterie ${Math.round(value)} %, ${level} ze 4 dílků` : "Stav baterie není dostupný";
    return `<div class="battery-segments level-${level}" role="img" aria-label="${label}" title="${label}">${[1, 2, 3, 4].map((cell) => `<span class="${cell <= level ? "on" : ""}"></span>`).join("")}</div>`;
  }

  _signalLevel(rssi) {
    if (!Number.isFinite(rssi)) return 0;
    if (rssi >= -55) return 4;
    if (rssi >= -68) return 3;
    if (rssi >= -80) return 2;
    return 1;
  }

  _signalClass(rssi) {
    const level = this._signalLevel(rssi);
    if (level >= 3) return "good-signal";
    if (level === 2) return "warn-signal";
    return "bad-signal";
  }

  _formatTime(timestamp) {
    if (!timestamp) return "-";
    return new Date(Number(timestamp) * 1000).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  _formatDuration(started, finished) {
    if (!started || !finished) return "";
    return `${Math.max(0, Number(finished) - Number(started))} s`;
  }

  _renderSignalBars(rssi) {
    const level = this._signalLevel(rssi);
    const label = Number.isFinite(rssi) ? `Signál ${rssi} dBm, ${level} ze 4 dílků` : "Síla signálu není dostupná";
    return `<div class="signal-bars level-${level}" role="img" aria-label="${label}" title="${label}">${[1, 2, 3, 4].map((bar) => `<span class="${bar <= level ? "on" : ""}"></span>`).join("")}</div>`;
  }

  _renderBleDevices(devices) {
    if (!devices.length) return `<div style="color:var(--secondary-text-color);padding:10px 0">Home Assistant zatim nevratil zadne BLE zarizeni.</div>`;
    return `<table><thead><tr><th>Nazev</th><th>Adresa</th><th>RSSI</th><th>Manufacturer IDs</th><th>Services</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.name || "-")}</td><td>${this._escape(device.address)}</td><td>${this._escape(device.rssi ?? "")}</td><td>${this._escape((device.manufacturer_ids || []).join(", "))}</td><td>${this._escape((device.service_uuids || []).join(", "))}</td></tr>`).join("")}</tbody></table>`;
  }

  _message(err) {
    return err && err.message ? err.message : String(err);
  }

  _escape(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

if (!customElements.get("dratek-eink-panel")) {
  customElements.define("dratek-eink-panel", DratekEinkPanel);
}
