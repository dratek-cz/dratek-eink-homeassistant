import qrcode from "./qrcode-generator.js";

const DRATEK_EINK_VERSION = "0.1.61";
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
    this._selectedDeviceAddress = "";
    this._editingDeviceAddress = "";
    this._deviceNameDraft = "";
    this._objects = [];
    this._deviceDrafts = {};
    this._deviceDraftsLoading = false;
    this._selectedIds = [];
    this._drag = null;
    this._nextId = 1;
    this._backgroundColor = "white";
    this._zoom = 1;
    this._snap = true;
    this._projects = [];
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._fileMenuOpen = false;
    this._viewMenuOpen = false;
    this._toolsMenuOpen = false;
    this._layoutMenuOpen = false;
    this._invertColors = false;
    this._variablesDialogOpen = false;
    this._templateDialogOpen = false;
    this._newProjectDialogOpen = false;
    this._variables = {};
    this._orientation = "landscape";
    this._displayTransform = "rotate_cw";
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
  }

  set hass(hass) {
    const previousSignature = this._entityStateSignature(this._hass);
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._loadProjects();
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
      const nextResult = await this._hass.callWS({ type: "dratek_eink/scan" });
      this._saveCachedScanResult(nextResult);
      const changed = this._deviceAddressSignature(this._result) !== this._deviceAddressSignature(nextResult);
      if (!background || changed) {
        this._result = nextResult;
        await this._loadDevicePreviewDrafts(this._result.devices || []);
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
    }
  }

  _deviceAddressSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => String(device.address || "").toUpperCase())
      .filter(Boolean)
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
    if (address === this._selectedDeviceAddress && !options.forceLoad) {
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
      invert_colors: false,
      background_color: "white",
      width: size.width,
      height: size.height,
      variables: {},
      objects: [],
    };
  }

  _applyDraft(draft) {
    this._restoringDraft = true;
    const device = this._device();
    const source = draft || this._emptyDeviceDraft(device);
    this._orientation = source.orientation === "portrait" ? "portrait" : "landscape";
    this._displayTransform = source.display_transform || "rotate_cw";
    this._invertColors = false;
    this._backgroundColor = ["white", "black", "red"].includes(source.background_color) ? source.background_color : "white";
    const size = this._displaySize(device);
    this._objects = Array.isArray(source.objects) ? structuredClone(source.objects) : [];
    this._variables = source.variables ? structuredClone(source.variables) : {};
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
    if (this._activeTab !== "designer" || !this._device() || this._isTypingEvent(event)) return;
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
      this._applyDraft(result.draft || null);
    } catch (err) {
      this._applyDraft(null);
      this._sendResult = { ok: false, error: `Nepodarilo se nacist navrh displeje: ${this._message(err)}`, log: [] };
    } finally {
      this._loadingDraft = false;
    }
  }

  async _loadDevicePreviewDrafts(devices) {
    if (!this._hass || !Array.isArray(devices) || !devices.length) return;
    this._deviceDraftsLoading = true;
    const entries = await Promise.all(devices.map(async (device) => {
      const address = String(device.address || "").toUpperCase();
      if (!address) return null;
      try {
        const result = await this._hass.callWS({ type: "dratek_eink/device_drafts/load", address });
        return [address, result.draft || null];
      } catch (_err) {
        return [address, null];
      }
    }));
    this._deviceDrafts = Object.fromEntries(entries.filter(Boolean));
    this._deviceDraftsLoading = false;
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
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
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
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _snapValue(value) {
    return this._snap ? Math.round(value / 5) * 5 : Math.round(value);
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
    if (!object?.entityId) return undefined;
    const state = this._hass?.states?.[object.entityId];
    if (!state) return undefined;
    return object.entityAttribute ? state.attributes?.[object.entityAttribute] : state.state;
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
      x: (event.clientX - rect.left) / this._zoom,
      y: (event.clientY - rect.top) / this._zoom,
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
      invert_colors: this._invertColors,
      background_color: this._backgroundColor,
      width: size.width,
      height: size.height,
      variables: this._variables,
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
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/send_design",
        address: device.address,
        sdk_type: Number(device.sdk_type),
        orientation: this._orientation,
        transform: this._displayTransform,
        image: canvas.toDataURL("image/png"),
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
      const canvas = document.createElement("canvas");
      const size = this._displaySize(device);
      canvas.width = size.width;
      canvas.height = size.height;
      this._drawScene(canvas.getContext("2d"), canvas.width, canvas.height, false);
      const automation = this._entityAutomationPayload();
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/gateways/send_design",
        gateway_id: this._selectedGatewayId,
        address: device.address,
        sdk_type: Number(device.sdk_type),
        orientation: this._orientation,
        transform: this._displayTransform,
        image: canvas.toDataURL("image/png"),
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
    const designerFrameX = Math.max(22, Math.round(designerScreenWidth * 0.158));
    const designerFrameY = Math.max(16, Math.round(designerScreenHeight * 0.125));
    this.shadowRoot.innerHTML = `
      <style>
        .device-card-details{display:grid;gap:13px}
        @font-face{font-family:"DRATEK eInk Sans";src:url("/dratek_eink_static/fonts/Arimo-wght.ttf") format("truetype");font-style:normal;font-weight:400 700;font-display:block}
        :host{display:block;min-height:100%;color:var(--primary-text-color);background:linear-gradient(180deg,var(--primary-background-color),var(--secondary-background-color));font-family:Roboto,Arial,sans-serif}
        *{box-sizing:border-box} .page{max-width:1680px;margin:0 auto;padding:18px;display:grid;gap:14px}
        h1{margin:0;font-size:24px;font-weight:850;letter-spacing:0}h2{margin:0;font-size:13px;text-transform:uppercase;color:var(--secondary-text-color);letter-spacing:.08em}.subtitle{color:var(--secondary-text-color);font-size:13px;margin-top:3px}
        button,select,input{font:inherit}button{border:0;border-radius:8px;background:var(--primary-color);color:var(--text-primary-color,#fff);padding:9px 12px;font-weight:760;cursor:pointer;box-shadow:0 1px 0 rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px}button:hover:not(:disabled){filter:brightness(1.03);transform:translateY(-1px)}button:disabled{opacity:.45;cursor:not-allowed;transform:none}
        ha-icon{--mdc-icon-size:18px}.primary-action{background:#0f766e}.secondary{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.danger{background:#b3261e;color:#fff}.ghost{background:transparent;color:var(--primary-text-color);border:1px solid transparent;box-shadow:none}
        .topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.07)}.brand{display:flex;align-items:center;gap:13px}.logo{width:44px;height:44px;border-radius:8px;display:grid;place-items:center;background:#111827;color:#fff;font-weight:950;letter-spacing:.5px}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.version-badge{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 8px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color);border:1px solid var(--divider-color);font-size:11px;font-weight:850}
        .card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px;box-shadow:0 10px 28px rgba(0,0,0,.06)}.metric{color:var(--secondary-text-color);font-size:12px;margin-bottom:5px}.value{font-size:25px;font-weight:850}.pill{display:inline-flex;min-height:26px;align-items:center;border-radius:999px;padding:0 10px;font-size:12px;font-weight:800}.good{background:#d7f5df;color:#0b6b2a}.warn{background:#fff2c7;color:#775500}.bad{background:#ffd9d4;color:#9d1c0f}.muted{background:var(--secondary-background-color);color:var(--secondary-text-color)}
        .tabbar{display:flex;gap:6px;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:5px;width:max-content;max-width:100%;box-shadow:0 8px 24px rgba(0,0,0,.05)}.tab{background:transparent;color:var(--secondary-text-color);box-shadow:none;border:0;border-radius:7px;padding:10px 14px}.tab.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}
        .status-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}.status-tile{display:flex;align-items:center;justify-content:space-between;gap:12px}.status-icon{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-color)}
        .designer-context{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 14px}.display-identity{display:flex;align-items:center;gap:11px;min-width:0}.display-identity .status-icon{flex:0 0 auto}.display-identity strong{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.display-identity span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}.resolution-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--divider-color);border-radius:6px;color:var(--secondary-text-color);font-size:11px;font-weight:800;white-space:nowrap}
        .ribbon{position:relative;display:flex;align-items:center;gap:6px;min-height:48px;padding:5px 8px}.ribbon-tab{background:transparent;color:var(--primary-text-color);box-shadow:none;border-radius:6px}.ribbon-tab.active{background:#0f766e;color:#fff}.ribbon-project{margin-left:auto;min-width:0;color:var(--secondary-text-color);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-menu{position:absolute;z-index:12;left:8px;top:50px;width:min(620px,calc(100vw - 52px));padding:14px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);box-shadow:0 20px 55px rgba(0,0,0,.24)}.file-menu-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.file-menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.file-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.file-action{min-height:72px;display:grid;grid-template-rows:26px auto;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none}.file-action ha-icon{--mdc-icon-size:24px;color:var(--primary-color)}.device-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.device-name-edit{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px}.device-name-edit input{min-width:0;border:1px solid var(--primary-color);border-radius:7px;padding:8px;background:var(--card-background-color);color:var(--primary-text-color)}
        .device-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}.device-card{position:relative;display:grid;gap:13px;text-align:left;background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:15px;box-shadow:0 12px 32px rgba(0,0,0,.08);overflow:hidden}.device-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:#9ca3af}.device-card.selected{border-color:var(--primary-color);box-shadow:0 0 0 2px rgba(37,99,235,.18),0 16px 38px rgba(0,0,0,.11)}.device-card.selected:before{background:var(--primary-color)}.device-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.device-card-top strong{display:block;font-size:20px;letter-spacing:.01em}.device-card-top span:not(.pill){display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.device-model{font-size:13px;line-height:1.45;color:var(--primary-text-color)}.device-model span,.device-meta{color:var(--secondary-text-color);font-size:12px}.device-meters{display:grid;grid-template-columns:1fr 1fr;gap:12px}.meter-block{display:grid;gap:6px}.meter-block label{font-size:11px;text-transform:uppercase;color:var(--secondary-text-color);font-weight:800;letter-spacing:.08em}.battery{height:10px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden;border:1px solid var(--divider-color)}.battery span{display:block;height:100%;background:#9ca3af}.battery.high span{background:#16a34a}.battery.medium span{background:#d97706}.battery.low span{background:#dc2626}.signal-bars{height:20px;display:flex;align-items:end;gap:3px}.signal-bars span{display:block;width:8px;border-radius:2px;background:var(--divider-color)}.signal-bars span:nth-child(1){height:7px}.signal-bars span:nth-child(2){height:11px}.signal-bars span:nth-child(3){height:15px}.signal-bars span:nth-child(4){height:19px}.signal-bars.level-1 .on{background:#dc2626}.signal-bars.level-2 .on{background:#d97706}.signal-bars.level-3 .on,.signal-bars.level-4 .on{background:#16a34a}.device-meta{display:flex;gap:8px;flex-wrap:wrap}.device-meta span{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:999px;padding:4px 8px}
        .device-preview-wrap{display:grid;place-items:center;min-height:118px;padding:6px;border-radius:9px;background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.9),rgba(127,127,127,.08))}.device-preview-bezel{position:relative;display:grid;grid-template-columns:minmax(24px,11%) minmax(0,1fr);align-items:center;width:min(100%,var(--preview-width,460px));aspect-ratio:var(--frame-ratio,2.15);padding:4.5%;border:clamp(5px,1.2vw,9px) solid #eee7e7;border-radius:clamp(10px,2vw,18px);background:#fff;box-shadow:0 7px 18px rgba(0,0,0,.16),inset 0 0 0 1px rgba(0,0,0,.04)}.device-preview-code{justify-self:center;color:#111;font:700 clamp(8px,1.55vw,13px)/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap}.device-preview-screen{position:relative;width:100%;height:100%;min-width:0;overflow:hidden;border:1px solid rgba(0,0,0,.18);background:#fff;box-shadow:inset 0 0 5px rgba(0,0,0,.12)}.device-preview-screen canvas{display:block;width:100%;height:100%;background:#fff;box-shadow:none}.device-preview-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:8px;background:repeating-linear-gradient(135deg,#fff 0 9px,#faf7f7 9px 18px);color:#777;font-size:10px;font-weight:750}.device-preview-empty ha-icon{display:block;margin:auto;--mdc-icon-size:22px;color:#b3261e}.device-preview-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin-top:6px;color:var(--secondary-text-color);font-size:10px}.device-preview-caption span{display:flex;align-items:center;gap:4px}.device-preview-caption ha-icon{--mdc-icon-size:14px;color:#16803c}.compact-device-preview{grid-column:1/-1;min-height:76px;padding:3px}.compact-device-preview .device-preview-bezel{width:min(100%,300px);border-width:5px;border-radius:9px;padding:3%}.compact-device-preview .device-preview-code{font-size:7px}.compact-device-preview .device-preview-caption{display:none}.device-grid.mode-list .compact-device-preview{grid-column:1/2;grid-row:1/3;min-width:210px}.device-grid.mode-list .minimal-card{grid-template-columns:minmax(210px,.8fr) minmax(220px,1fr) minmax(390px,1.8fr) auto}.device-grid.mode-list .minimal-card .compact-identity{grid-column:2}.device-grid.mode-list .minimal-card .compact-metrics{grid-column:3}.device-grid.mode-list .minimal-card .compact-open{grid-column:4}
        .density-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.density-toolbar>span{font-size:11px;font-weight:800;color:var(--secondary-text-color);text-transform:uppercase}.density-switch{display:flex;gap:2px;padding:3px;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color)}.density-switch button{min-height:30px;padding:5px 8px;border-radius:5px;background:transparent;color:var(--secondary-text-color);box-shadow:none;font-size:11px}.density-switch button.active{background:var(--card-background-color);color:var(--primary-color);box-shadow:0 1px 4px rgba(0,0,0,.12)}.density-switch ha-icon{--mdc-icon-size:17px}.density-note{font-size:11px;color:var(--secondary-text-color)}.device-grid.mode-large{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.device-grid.mode-compact{grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:8px}.device-grid.mode-list{grid-template-columns:1fr;gap:7px}.device-grid.mode-compact .device-card,.device-grid.mode-list .device-card{gap:8px;padding:11px}.device-grid.mode-compact .device-card-top strong{font-size:15px}.device-grid.mode-list .device-card{grid-template-columns:minmax(220px,1.3fr) minmax(220px,1fr) auto;align-items:center}.device-grid.mode-list .device-card-top{min-width:0}.device-grid.mode-list .device-card-details{display:grid;grid-template-columns:minmax(170px,1fr) minmax(220px,1.4fr);gap:8px;align-items:center}.device-card.collapsed .device-card-details{display:none}.device-expand{background:transparent;color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none;min-width:36px;padding:7px}.device-card-expand-row{display:flex;justify-content:flex-end}.device-grid.mode-full .device-expand,.device-grid.mode-large .device-expand{display:none}.device-grid.mode-full .device-card-expand-row,.device-grid.mode-large .device-card-expand-row{display:none}
        .route-list{display:grid;gap:7px}.route{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:7px 9px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);font-size:12px}.route.preferred{border-color:#0f766e;background:rgba(15,118,110,.08)}.route ha-icon{color:#0f766e}.route-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:780}.route-rssi{color:var(--secondary-text-color)}.topology{display:grid;gap:8px}.topology-row{display:grid;grid-template-columns:minmax(170px,1fr) minmax(80px,2fr) minmax(190px,1.2fr);align-items:center;gap:10px}.topology-node{display:flex;align-items:center;gap:9px;border:1px solid var(--divider-color);border-radius:8px;padding:10px;background:var(--card-background-color);min-width:0}.topology-node strong,.topology-node small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.topology-node small{color:var(--secondary-text-color);margin-top:2px}.topology-link{height:2px;background:var(--divider-color);position:relative}.topology-link:after{content:"";position:absolute;right:0;top:-4px;border-left:7px solid #0f766e;border-top:5px solid transparent;border-bottom:5px solid transparent}.topology-link span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--card-background-color);padding:2px 8px;color:var(--secondary-text-color);font-size:11px;white-space:nowrap}.topology.mode-large{gap:6px}.topology.mode-large .topology-node{padding:8px}.topology.mode-compact{grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:7px}.topology.mode-compact .topology-row{display:grid;grid-template-columns:1fr auto;gap:6px;border:1px solid var(--divider-color);border-radius:8px;padding:8px}.topology.mode-compact .topology-link{grid-column:1/-1;grid-row:2;height:auto;background:none}.topology.mode-compact .topology-link:after{display:none}.topology.mode-compact .topology-link span{position:static;transform:none;display:inline-flex}.topology.mode-compact .topology-node{padding:7px;border:0}.topology.mode-list .topology-row{grid-template-columns:minmax(180px,1fr) minmax(100px,.7fr) minmax(210px,1.2fr);gap:6px}.topology.mode-list .topology-node{padding:7px}.topology.mode-list .topology-node small{display:none}
        .subtabs{display:flex;gap:6px;padding:5px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);width:max-content;max-width:100%}.subtab{background:transparent;color:var(--secondary-text-color);box-shadow:none}.subtab.active{background:#0f766e;color:#fff}.gateway-name-edit{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px}.gateway-name-edit input{min-width:0;border:1px solid var(--primary-color);border-radius:7px;padding:7px;background:var(--card-background-color);color:var(--primary-text-color)}.gateway-health{display:grid;grid-template-columns:1fr 1fr;gap:10px}.health-tile{padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color)}.health-tile label{display:block;color:var(--secondary-text-color);font-size:11px;text-transform:uppercase;font-weight:800;margin-bottom:5px}
        .empty-state{min-height:280px;display:grid;place-items:center;text-align:center;gap:9px;color:var(--secondary-text-color)}.empty-state h2{color:var(--primary-text-color);font-size:18px;text-transform:none;letter-spacing:0;margin:0}.empty-icon{width:62px;height:62px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);font-weight:950;color:var(--primary-color)}
        .editor-shell{display:grid;grid-template-columns:250px minmax(0,1fr) 318px 250px;gap:12px;align-items:start}.left,.right,.layers-panel{position:sticky;top:12px}.designer-section{position:relative}.designer-section.locked> :not(.designer-lock){pointer-events:none;opacity:.28;filter:grayscale(1)}.designer-lock{position:absolute;z-index:15;left:50%;top:110px;transform:translateX(-50%);width:min(440px,calc(100% - 32px));padding:28px;text-align:center;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.24)}.designer-lock ha-icon{--mdc-icon-size:44px;color:#16803c}.designer-lock h2{font-size:20px;text-transform:none;margin:10px 0}.designer-lock p{color:var(--secondary-text-color)}.template-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:282px;overflow:auto;padding-right:2px}.template-hero .template-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));max-height:none;overflow:visible;padding-right:0}.template-card{min-height:76px;display:grid;grid-template-columns:34px 1fr;align-items:center;text-align:left;gap:9px;padding:9px;border:1px solid var(--divider-color);background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color);box-shadow:none}.template-card ha-icon{color:var(--primary-color);--mdc-icon-size:26px}.template-card strong{display:block;font-size:12px;line-height:1.2}.template-card span{display:block;font-size:10px;color:var(--secondary-text-color);font-weight:800;text-transform:uppercase;margin-top:2px}.template-card:hover:not(:disabled){border-color:var(--primary-color);background:var(--secondary-background-color)}.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.tool-icon{min-height:82px;display:grid;grid-template-rows:36px auto;place-items:center;text-align:center;padding:10px 6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none}.tool-icon .ico{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-color);font-size:18px;font-weight:900}.tool-icon .txt{font-size:11px;font-weight:850;color:var(--secondary-text-color);text-transform:uppercase}.tool-icon:hover:not(:disabled){border-color:var(--primary-color);background:var(--secondary-background-color)}
        .action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.icon-btn{min-height:42px;padding:7px;font-size:16px;display:grid;place-items:center}.wide-action{grid-column:span 4;font-size:13px}.panel-divider{height:1px;background:var(--divider-color);margin:14px 0}.layout-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.layout-btn{min-height:58px;display:grid;place-items:center;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none}.layout-btn.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.transform-box{margin-top:10px;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.transform-box small{display:block;color:var(--secondary-text-color);line-height:1.35;margin-top:6px}.properties-panel,.layers-panel{max-height:calc(100vh - 120px);overflow:auto}.layer-list{display:grid;gap:6px}.layer-row{display:grid;grid-template-columns:minmax(0,1fr) 34px 34px;gap:4px;align-items:center;padding:4px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color)}.layer-row.selected{border-color:#16803c;background:rgba(22,128,60,.1);box-shadow:inset 3px 0 0 #16803c}.layer-main{min-width:0;justify-content:flex-start;background:transparent;color:var(--primary-text-color);box-shadow:none;padding:7px}.layer-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.layer-main ha-icon{color:var(--secondary-text-color);flex:0 0 auto}.layer-step{min-height:32px;padding:5px;background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none}.layer-hint{margin:9px 0 0;color:var(--secondary-text-color);font-size:11px;line-height:1.4}.background-picker{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding-top:9px;margin-top:7px;border-top:1px solid var(--divider-color)}.background-picker button{display:grid;place-items:center;gap:4px;background:var(--secondary-background-color);color:var(--primary-text-color);box-shadow:none;font-size:11px}.background-picker button.selected{outline:2px solid #16803c;outline-offset:-2px}.color-swatch{width:24px;height:20px;border:1px solid #7f7f7f;border-radius:4px}.color-swatch.white{background:#fff}.color-swatch.black{background:#000}.color-swatch.red{background:#d41414}
        .workspace-card{padding:0;overflow:hidden}.canvas-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.canvas-meta{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:12px}.workspace{min-height:590px;overflow:auto;display:grid;place-items:center;background:linear-gradient(45deg,rgba(127,127,127,.08) 25%,transparent 25%),linear-gradient(-45deg,rgba(127,127,127,.08) 25%,transparent 25%);background-size:18px 18px;border:0;padding:34px}
        canvas{background:#fff;box-shadow:0 20px 54px rgba(0,0,0,.24);touch-action:none}.field{display:grid;gap:5px;margin-bottom:10px}.field label{color:var(--secondary-text-color);font-size:12px;font-weight:760}.field small{color:var(--secondary-text-color);font-size:11px;line-height:1.35}.field input,.field select,.field textarea,.file-menu input,.file-menu select,#deviceSelect{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px;font:inherit}.field textarea{resize:vertical;min-height:62px}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.entity-source{margin-top:12px;padding:11px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.entity-source ha-entity-picker{display:block;width:100%;margin-top:5px}.entity-current{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start;margin-top:8px;padding:9px;border-radius:7px;background:var(--card-background-color);font-size:12px}.entity-current ha-icon{color:#16803c}.entity-current strong,.entity-current small{display:block;overflow-wrap:anywhere}.entity-current small{color:var(--secondary-text-color);margin-top:2px}
        table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top}th{color:var(--secondary-text-color);font-size:11px;text-transform:uppercase}pre{overflow:auto;background:#111827;color:#e5e7eb;border-radius:8px;padding:12px;font-size:12px;line-height:1.45;max-height:320px;white-space:pre-wrap}.gateway-log{max-height:260px;min-height:96px;overflow-y:auto}.send-result{margin-top:10px}.ota-progress{height:9px;background:var(--secondary-background-color);border:1px solid var(--divider-color);border-radius:999px;overflow:hidden;margin:11px 0}.ota-progress span{display:block;height:100%;background:#0f766e;transition:width .25s ease}.variable-list{display:grid;gap:12px}.variable-card{padding:13px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.variable-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.variable-card-head strong{font-size:14px}.variable-card input,.variable-card textarea{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);padding:9px;font:inherit}.variable-card textarea{resize:vertical;min-height:82px;line-height:1.45}.format-help{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;margin-top:9px;padding:10px;border:1px solid rgba(22,128,60,.3);border-radius:7px;background:rgba(22,128,60,.08);font-size:12px;line-height:1.45}.format-help ha-icon{color:#16803c}.format-help code{display:block;margin-top:4px;white-space:normal;overflow-wrap:anywhere}.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:20;display:grid;place-items:center;padding:24px}.symbol-dialog{width:min(920px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.35);padding:16px}.symbol-search{display:grid;grid-template-columns:1fr auto;gap:10px;margin:12px 0}.symbol-search input{width:100%;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:10px}.category-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.category-row button{min-height:32px;padding:6px 10px}.category-row button.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}.symbol-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}.symbol-tile{min-height:78px;display:grid;grid-template-rows:32px auto;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none}.symbol-tile strong{font-size:29px;line-height:1}.symbol-tile span{font-size:10px;color:var(--secondary-text-color);font-weight:800;text-transform:uppercase;text-align:center}
        .section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.debug-card details{margin-top:10px}.debug-card summary{cursor:pointer;color:var(--primary-color);font-weight:760}.inspector-empty{padding:18px;border:1px dashed var(--divider-color);border-radius:8px;color:var(--secondary-text-color);text-align:center;background:var(--secondary-background-color)}
        .inspector-title{position:sticky;top:-14px;z-index:3;margin:-14px -14px 12px;padding:12px 14px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.inspector-title-main{display:flex;align-items:center;gap:9px;min-width:0}.inspector-title-main small{display:block;max-width:160px;margin-top:2px;color:var(--secondary-text-color);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.inspector-object-icon{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;background:rgba(22,128,60,.1);color:#16803c}.inspector-section{margin-bottom:11px;padding:11px;border:1px solid var(--divider-color);border-radius:9px;background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color))}.inspector-section:last-child{margin-bottom:0}.inspector-section-title{display:flex;align-items:center;gap:7px;margin:0 0 10px;color:var(--primary-text-color);font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.055em}.inspector-section-title ha-icon{--mdc-icon-size:18px;color:#16803c}.inspector-section .field:last-child{margin-bottom:0}.inspector-section .field label{display:flex;align-items:center;gap:5px}.inspector-section .field label ha-icon{--mdc-icon-size:15px;color:var(--secondary-text-color)}.color-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.color-option{min-width:0;min-height:52px;display:grid;grid-template-rows:23px auto;place-items:center;gap:2px;padding:5px 3px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--secondary-text-color);box-shadow:none;font-size:10px}.color-option:hover:not(:disabled){transform:none;border-color:#16803c}.color-option.selected{border-color:#16803c;background:rgba(22,128,60,.09);color:var(--primary-text-color);box-shadow:inset 0 0 0 1px #16803c}.color-dot{position:relative;width:22px;height:22px;border:1px solid #777;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.18)}.color-dot.black{background:#111}.color-dot.red{background:#d41414}.color-dot.white{background:#fff}.color-dot.none{background:repeating-linear-gradient(135deg,#fff 0 5px,#ddd 5px 10px)}.color-dot.none:after{content:"";position:absolute;left:1px;right:1px;top:10px;height:2px;background:#d41414;transform:rotate(-38deg)}.segment-control{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;padding:3px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.segment-button{min-width:0;min-height:34px;padding:5px;border:0;border-radius:5px;background:transparent;color:var(--secondary-text-color);box-shadow:none}.segment-button ha-icon{--mdc-icon-size:19px}.segment-button:hover:not(:disabled){transform:none;background:var(--card-background-color)}.segment-button.selected{background:var(--card-background-color);color:#16803c;box-shadow:0 1px 4px rgba(0,0,0,.16)}.toggle-stack{display:grid;gap:6px}.toggle-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin:0;padding:8px;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);font-size:12px;font-weight:700}.toggle-card>ha-icon{--mdc-icon-size:19px;color:#16803c}.toggle-card input{width:17px;height:17px;accent-color:#16803c}.inspector-help{display:flex;gap:7px;align-items:flex-start;margin:8px 0 0;color:var(--secondary-text-color);font-size:11px;line-height:1.4}.inspector-help ha-icon{--mdc-icon-size:16px;color:#16803c;flex:0 0 auto}
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
        :host{--dratek-teal:#00a2a5;--dratek-teal-dark:#007f83;--dratek-orange:#ff6b00;--dratek-orange-dark:#d95700;--dratek-ink:#172033;--primary-color:var(--dratek-teal);--accent-color:var(--dratek-orange)}
        .page{background:linear-gradient(145deg,rgba(0,162,165,.045),transparent 34%,rgba(255,107,0,.035));border-radius:18px}.topbar{border-top:4px solid var(--dratek-teal);border-radius:12px}.brand h1{color:var(--dratek-teal-dark)}.logo{position:relative;background:var(--dratek-teal);border-radius:10px}.logo:after{content:"";position:absolute;right:-4px;bottom:6px;width:9px;height:9px;border-radius:50%;background:var(--dratek-orange);box-shadow:0 0 0 3px var(--card-background-color)}.version-badge{border-color:rgba(255,107,0,.35);background:rgba(255,107,0,.1);color:var(--dratek-orange-dark)}button{background:var(--dratek-teal)}.primary-action,.ribbon-tab.menu-tab,.ribbon-tab.menu-tab.active,.subtab.active{background:var(--dratek-teal);border-color:var(--dratek-teal)}.ribbon-tab.menu-tab:hover,.subtab.active:hover{background:var(--dratek-teal-dark)}.ribbon-send{background:var(--dratek-orange);border-color:var(--dratek-orange)}.ribbon-send:hover:not(:disabled){background:var(--dratek-orange-dark)}.tab.active{background:var(--dratek-teal)}.status-icon,.file-action ha-icon,.route ha-icon,.queue-stat ha-icon,.inspector-section-title ha-icon,.inspector-object-icon,.toggle-card>ha-icon,.format-help ha-icon,.device-status-item>ha-icon,.display-health-item>ha-icon{color:var(--dratek-teal)}.route.preferred,.display-tile.selected,.layer-row.selected,.color-option.selected{border-color:var(--dratek-teal)}.layer-row.selected{background:rgba(0,162,165,.09);box-shadow:inset 3px 0 0 var(--dratek-teal)}.color-option.selected{background:rgba(0,162,165,.08);box-shadow:inset 0 0 0 1px var(--dratek-teal)}.layout-btn.active,.layout-menu-button.active{background:var(--dratek-teal);border-color:var(--dratek-teal)}.menu-command ha-icon{color:var(--dratek-teal)}.menu-command.selected{background:rgba(0,162,165,.09);border-color:var(--dratek-teal)}.display-resolution,.resolution-chip{border-color:rgba(0,162,165,.3);background:rgba(0,162,165,.08);color:var(--dratek-teal-dark)}.display-online-dot{background:var(--dratek-teal);box-shadow:0 0 0 4px rgba(0,162,165,.14)}.signal-bars.level-2 .on{background:var(--dratek-orange)}.signal-bars.level-3 .on,.signal-bars.level-4 .on,.battery.high span{background:var(--dratek-teal)}.battery.medium span{background:var(--dratek-orange)}.signal-value.good-signal{color:var(--dratek-teal-dark)}.signal-value.warn-signal{color:var(--dratek-orange-dark)}
        .editor-shell{grid-template-columns:230px minmax(0,1fr) 320px;grid-template-areas:"tools canvas inspector" "layers canvas inspector";gap:14px;align-items:start}.editor-shell>.left{grid-area:tools}.editor-shell>.workspace-card{grid-area:canvas;min-width:0}.editor-shell>.properties-panel{grid-area:inspector}.editor-shell>.layers-panel{grid-area:layers}.editor-shell>.left,.editor-shell>.properties-panel{position:sticky;top:12px}.editor-shell>.layers-panel{position:static}.workspace-card{border-radius:13px;border-color:rgba(0,162,165,.22)}.canvas-head{border-bottom-color:rgba(0,162,165,.2);background:linear-gradient(90deg,rgba(0,162,165,.08),rgba(255,107,0,.055))}.canvas-meta ha-icon{color:var(--dratek-teal)}.workspace{min-width:0;padding:32px;overflow:auto;background:linear-gradient(45deg,rgba(0,162,165,.055) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,107,0,.045) 25%,transparent 25%);background-size:20px 20px}.designer-device-bezel{position:relative;display:inline-block;flex:0 0 auto;padding:var(--designer-frame-y) var(--designer-frame-x);border:8px solid #eee8e8;border-radius:18px;background:#fff;box-shadow:0 18px 46px rgba(23,32,51,.2),inset 0 0 0 1px rgba(0,0,0,.045)}.designer-device-screen{position:relative;overflow:hidden;border:1px solid rgba(0,0,0,.22);background:#fff;box-shadow:inset 0 0 5px rgba(0,0,0,.13)}.designer-device-screen canvas{display:block;background:#fff;box-shadow:none}.designer-device-code{position:absolute;z-index:2;left:calc(var(--designer-frame-x) * .26);top:50%;color:#111;font:700 clamp(7px,1vw,11px)/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.025em;writing-mode:vertical-rl;transform:translateY(-50%) rotate(180deg);white-space:nowrap;pointer-events:none}
        @media(max-width:1280px){.editor-shell{grid-template-columns:210px minmax(0,1fr) 285px;gap:10px}.workspace{padding:24px}.editor-shell>.properties-panel{max-height:none}}
        @media(max-width:980px){.editor-shell{grid-template-columns:210px minmax(0,1fr);grid-template-areas:"tools canvas" "layers canvas" "inspector inspector"}.editor-shell>.left,.editor-shell>.properties-panel{position:static}.properties-panel{max-height:none}.workspace{min-height:430px}}
        @media(max-width:720px){.page{padding:10px}.editor-shell{grid-template-columns:1fr;grid-template-areas:"canvas" "tools" "inspector" "layers"}.workspace-card{order:0}.workspace{min-height:330px;padding:18px}.designer-device-bezel{border-width:6px;border-radius:13px}.canvas-head{align-items:flex-start;flex-direction:column}.designer-context{flex-wrap:wrap}.ribbon-send{order:2}.ribbon-project{width:100%;order:3}}
        :host{--dratek-teal:#009999;--dratek-teal-dark:#007a7a;--dratek-orange:#ff6600;--dratek-orange-dark:#d95700}
        .battery-segments{position:relative;display:grid;grid-template-columns:repeat(4,5px);align-items:center;gap:2px;box-sizing:border-box;height:24px;padding:3px 5px;border:2px solid var(--divider-color);border-radius:5px;color:var(--divider-color);flex:0 0 auto;transition:border-color .18s ease,color .18s ease}.battery-segments:after{content:"";position:absolute;right:-5px;top:50%;width:3px;height:9px;border-radius:0 2px 2px 0;background:currentColor;transform:translateY(-50%)}.battery-segments span{display:block;width:5px;height:12px;border-radius:1px;background:var(--divider-color);transition:background .18s ease,box-shadow .18s ease}.battery-segments.level-1{border-color:#dc2626;color:#dc2626}.battery-segments.level-1 .on{background:#dc2626}.battery-segments.level-2{border-color:var(--dratek-orange);color:var(--dratek-orange)}.battery-segments.level-2 .on{background:var(--dratek-orange)}.battery-segments.level-3{border-color:#eab308;color:#eab308}.battery-segments.level-3 .on{background:#eab308}.battery-segments.level-4{border-color:#16a34a;color:#16a34a}.battery-segments.level-4 .on{background:#16a34a}.battery-segments .on,.signal-bars .on{box-shadow:0 0 5px color-mix(in srgb,currentColor 36%,transparent)}
        .signal-bars.level-1{color:#dc2626}.signal-bars.level-1 .on{background:#dc2626}.signal-bars.level-2{color:var(--dratek-orange)}.signal-bars.level-2 .on{background:var(--dratek-orange)}.signal-bars.level-3{color:#eab308}.signal-bars.level-3 .on{background:#eab308}.signal-bars.level-4{color:#16a34a}.signal-bars.level-4 .on{background:#16a34a}
        .display-grid.density-compact .battery-segments{grid-template-columns:repeat(4,4px);height:22px;padding:3px 4px}.display-grid.density-compact .battery-segments span{width:4px;height:10px}
        .connection-map-card{padding:18px}.connection-map-card>.section-title{align-items:flex-start;margin-bottom:16px}.connection-map-card>.section-title h2{color:var(--primary-text-color);font-size:15px;text-transform:none;letter-spacing:0}.connection-map-card>.section-title small{display:block;margin-top:4px;color:var(--secondary-text-color);font-size:11px;font-weight:500}.connection-map{display:grid;gap:14px}.connection-group{display:grid;grid-template-columns:minmax(210px,260px) 54px minmax(0,1fr);align-items:center;min-width:0;padding:14px 16px;border:1px solid var(--divider-color);border-radius:15px;background:linear-gradient(135deg,rgba(0,153,153,.055),transparent 38%,rgba(255,102,0,.025));box-shadow:0 7px 22px rgba(15,23,42,.055)}.connection-group.is-local{background:linear-gradient(135deg,rgba(0,153,153,.04),transparent 42%)}.connection-group.is-unavailable{background:linear-gradient(135deg,rgba(220,38,38,.045),transparent 42%)}.connection-hub{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;min-width:0;padding:13px;border:1px solid rgba(0,153,153,.25);border-radius:12px;background:var(--card-background-color);box-shadow:0 5px 16px rgba(15,23,42,.07)}.connection-group.is-unavailable .connection-hub{border-color:rgba(220,38,38,.24)}.connection-hub-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;background:rgba(0,153,153,.1);color:var(--dratek-teal-dark)}.connection-group.is-unavailable .connection-hub-icon{background:rgba(220,38,38,.09);color:#dc2626}.connection-hub-icon ha-icon{--mdc-icon-size:24px}.connection-hub-copy{min-width:0}.connection-hub-copy small,.connection-hub-copy strong,.connection-hub-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-hub-copy small{color:var(--dratek-teal-dark);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.connection-hub-copy strong{margin-top:2px;font-size:14px}.connection-hub-copy span{margin-top:3px;color:var(--secondary-text-color);font-size:10px}.connection-count{min-width:28px;height:28px;display:grid;place-items:center;border-radius:999px;background:var(--dratek-orange);color:#fff;font-size:12px;font-weight:900}.connection-bus{position:relative;height:100%;min-height:52px}.connection-bus:before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:linear-gradient(90deg,var(--dratek-teal),var(--dratek-orange));transform:translateY(-50%)}.connection-bus span{position:absolute;right:-5px;top:50%;width:11px;height:11px;border:3px solid var(--dratek-orange);border-radius:50%;background:var(--card-background-color);transform:translateY(-50%)}.connection-devices{position:relative;display:grid;gap:8px;min-width:0}.connection-devices:before{content:"";position:absolute;left:-5px;top:24px;bottom:24px;width:2px;background:var(--dratek-orange)}.connection-device{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;min-width:0;min-height:58px;padding:9px 11px;border:1px solid var(--divider-color);border-radius:11px;background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none;text-align:left}.connection-device:before{content:"";position:absolute;left:-5px;top:50%;width:5px;height:2px;background:var(--dratek-orange)}.connection-device:hover:not(:disabled){border-color:rgba(0,153,153,.45);background:rgba(0,153,153,.045);box-shadow:0 5px 14px rgba(15,23,42,.07)}.connection-device-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:rgba(0,153,153,.09);color:var(--dratek-teal-dark)}.connection-device-icon ha-icon{--mdc-icon-size:20px}.connection-device-copy{min-width:0}.connection-device-copy strong,.connection-device-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-device-copy strong{font-size:12px}.connection-device-copy small{margin-top:3px;color:var(--secondary-text-color);font-size:9px;font-weight:500}.connection-device-signal{display:grid;grid-template-columns:auto auto;align-items:end;justify-items:end;gap:1px 7px;min-width:70px}.connection-device-signal>.signal-bars{grid-row:1/3;height:20px}.connection-device-signal>.signal-bars span{width:5px}.connection-device-signal>small{font-size:9px;white-space:nowrap}.connection-active{color:var(--dratek-teal);line-height:1}.connection-active ha-icon{--mdc-icon-size:14px}
        @media(max-width:900px){.connection-group{grid-template-columns:minmax(190px,240px) 38px minmax(0,1fr);padding:12px}.connection-device{grid-template-columns:auto minmax(0,1fr)}.connection-device-signal{grid-column:2;justify-self:start;grid-template-columns:auto auto auto;align-items:center;justify-items:start}.connection-device-signal>.signal-bars{grid-row:auto}}
        @media(max-width:620px){.connection-map-card{padding:14px}.connection-map-card>.section-title{display:grid;gap:8px}.connection-group{grid-template-columns:1fr;padding:11px}.connection-bus{height:28px;min-height:28px}.connection-bus:before{left:50%;right:auto;top:0;bottom:0;width:2px;height:auto;background:linear-gradient(180deg,var(--dratek-teal),var(--dratek-orange));transform:translateX(-50%)}.connection-bus span{right:auto;left:50%;top:auto;bottom:-5px;transform:translateX(-50%)}.connection-devices:before{left:10px;top:-5px;bottom:auto;width:calc(100% - 20px);height:2px}.connection-device:before{left:10px;top:-12px;width:2px;height:12px}.connection-device-signal{grid-column:1/-1;margin-left:44px}}
        .display-tile[data-device-card-open]{cursor:pointer;outline:none}.display-tile[data-device-card-open]:hover{border-color:#168fe0;box-shadow:0 0 0 2px rgba(22,143,224,.17),0 16px 40px rgba(15,23,42,.13)}.display-tile[data-device-card-open]:focus-visible{border-color:#168fe0;box-shadow:0 0 0 3px rgba(22,143,224,.28),0 16px 40px rgba(15,23,42,.13)}.display-tile.selected{border-color:#168fe0;box-shadow:0 0 0 2px rgba(22,143,224,.18),0 14px 38px rgba(15,23,42,.12)}.display-tile[data-device-card-open] button,.display-tile[data-device-card-open] input{cursor:auto}.display-tile[data-device-card-open] button{cursor:pointer}
        .display-health-item.display-battery-item,.display-health-item.display-signal-item{display:grid;grid-template-rows:auto 24px auto;place-items:center;align-content:center;gap:6px;text-align:center}.display-battery-item>small,.display-signal-item>small{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.display-battery-item>strong,.display-signal-item>strong{display:block;margin:0;font-size:11px;white-space:nowrap}.display-battery-item>.battery-segments,.display-signal-item>.signal-bars{justify-self:center}.display-grid.density-compact .display-battery-item>small,.display-grid.density-compact .display-signal-item>small{display:block}.display-grid.density-compact .display-battery-item,.display-grid.density-compact .display-signal-item{gap:4px}
      </style>
      <div class="page">
        <div class="topbar">
          <div class="brand"><div class="logo">DE</div><div><h1>DRATEK eInk <span class="version-badge">v${DRATEK_EINK_VERSION}</span></h1><div class="subtitle">Editor sablon, BLE diagnostika a sprava displeju</div></div></div>
        </div>
        <div class="tabbar"><button class="tab ${this._activeTab === "devices" ? "active" : ""}" data-tab="devices"><ha-icon icon="mdi:devices"></ha-icon>Nalezene displeje</button><button class="tab ${this._activeTab === "designer" ? "active" : ""}" data-tab="designer" ${device ? "" : "disabled"} title="${device ? "Otevřít designer" : "Nejprve vyberte displej"}"><ha-icon icon="mdi:vector-square-edit"></ha-icon>Designer</button><button class="tab ${this._activeTab === "queue" ? "active" : ""}" data-tab="queue"><ha-icon icon="mdi:tray-full"></ha-icon>Fronta zapisu${this._queue.queued || this._queue.writing ? `<span class="pill warn">${this._queue.queued + this._queue.writing}</span>` : ""}</button><button class="tab ${this._activeTab === "gateways" ? "active" : ""}" data-tab="gateways"><ha-icon icon="mdi:router-wireless"></ha-icon>Gatewaye</button></div>
        <div style="${this._activeTab === "devices" ? "" : "display:none"}">
          <div class="card"><div class="toolbar" style="margin-bottom:12px"><button id="scanDevicesTab" class="secondary" ${this._loading ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this._loading ? "Hledám displeje..." : "Obnovit"}</button>${this._renderDensityControl("devices", this._deviceViewMode, result.devices.length)}</div>${this._renderDeviceCards(result.devices, device && device.address)}</div>
          <div class="card connection-map-card"><div class="section-title"><div><h2>Mapa připojení</h2><small>Každá gateway je zobrazena pouze jednou se všemi připojenými displeji.</small></div><span class="pill muted">${topologyGatewayCount} ${topologyGatewayCount === 1 ? "gateway" : "gatewayů"} · ${result.devices.length} ${result.devices.length === 1 ? "displej" : "displejů"}</span></div>${this._renderTopology(result.devices, topologyGroups)}</div>
        </div>
        <div class="designer-section ${device ? "" : "locked"}" style="${this._activeTab === "designer" ? "" : "display:none"}">
        ${device ? "" : `<div class="designer-lock"><ha-icon icon="mdi:monitor-lock"></ha-icon><h2>Nejprve vyberte displej</h2><p>Pracovní plocha se nastaví podle jeho rozlišení a uloženého návrhu.</p><button data-tab="devices"><ha-icon icon="mdi:devices"></ha-icon>Vybrat displej</button></div>`}
        <div class="card designer-context"><div class="display-identity"><div class="status-icon"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></div><div><strong>${this._escape(this._deviceTitle(device))}</strong><span>${device ? this._escape(device.address) : "Vyber displej v karte Nalezene displeje"}</span></div></div><span class="resolution-chip"><ha-icon icon="mdi:resize"></ha-icon>${size.width} x ${size.height}</span></div>
        <div class="card ribbon"><button id="fileMenuToggle" class="ribbon-tab menu-tab ${this._fileMenuOpen ? "active" : ""}"><ha-icon icon="mdi:file-outline"></ha-icon>Soubor</button><button id="variablesDialogOpen" class="ribbon-tab menu-tab"><ha-icon icon="mdi:variable"></ha-icon>Promenne</button><button id="layoutMenuToggle" class="ribbon-tab menu-tab ${this._layoutMenuOpen ? "active" : ""}"><ha-icon icon="mdi:page-layout-body"></ha-icon>Rozlozeni</button><button id="toolsMenuToggle" class="ribbon-tab menu-tab ${this._toolsMenuOpen ? "active" : ""}"><ha-icon icon="mdi:palette-outline"></ha-icon>Pozadi</button><button id="viewMenuToggle" class="ribbon-tab menu-tab ${this._viewMenuOpen ? "active" : ""}"><ha-icon icon="mdi:eye-outline"></ha-icon>Zobrazeni</button><button id="sendDesign" class="ribbon-send" ${!device || this._sending ? "disabled" : ""}><ha-icon icon="mdi:upload"></ha-icon>${this._sending ? "Odesilam..." : "Odeslat navrh"}</button><span class="ribbon-project">${this._escape(this._projectName)}</span>${this._renderFileMenu()}${this._renderViewMenu()}${this._renderToolsMenu()}${this._renderLayoutMenu(device)}</div>
        ${this._renderSendResult()}
        <div class="editor-shell">
          ${this._renderToolSidebar()}
          <div class="card workspace-card"><div class="canvas-head"><div class="canvas-meta"><ha-icon icon="mdi:checkerboard"></ha-icon><strong>${size.width} x ${size.height}</strong><span>${this._orientation === "portrait" ? "Na výšku" : "Na šířku"}</span></div><div class="canvas-meta"><span>Zoom ${Math.round(this._zoom * 100)}%</span><span>Reálné barvy eInk</span></div></div><div class="workspace"><div class="designer-device-bezel" style="--designer-frame-x:${designerFrameX}px;--designer-frame-y:${designerFrameY}px"><span class="designer-device-code">${this._escape(device?.physical_code || "00.00.00.00")}</span><div class="designer-device-screen"><canvas id="editor" width="${size.width}" height="${size.height}" style="width:${designerScreenWidth}px;height:${designerScreenHeight}px"></canvas></div></div></div></div>
          <div class="card right properties-panel"><div class="section-title inspector-title"><div class="inspector-title-main"><span class="inspector-object-icon"><ha-icon icon="${object ? this._objectIcon(object) : "mdi:tune-variant"}"></ha-icon></span><div><h2>Inspector</h2><small>${object ? this._escape(this._objectLabel(object, this._objects.indexOf(object))) : "Vlastnosti objektu"}</small></div></div><span class="pill muted">${object ? this._escape(object.type) : "bez výběru"}</span></div>${this._renderProperties(object)}</div>
          ${this._renderLayersPanel()}
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
    return `<div class="card left">
      <div class="section-title"><h2>Nastroje</h2><span class="pill muted">${this._selectedIds.length} vybrano</span></div>
      <div class="tool-grid">
        <button class="tool-icon" data-add="text" title="Text"><span class="ico"><ha-icon icon="mdi:format-text"></ha-icon></span><span class="txt">Text</span></button>
        <button id="openSymbols" class="tool-icon" title="Symboly"><span class="ico"><ha-icon icon="mdi:shape-plus"></ha-icon></span><span class="txt">Symbol</span></button>
        <button class="tool-icon" data-add="rect" title="Obdelnik"><span class="ico"><ha-icon icon="mdi:rectangle-outline"></ha-icon></span><span class="txt">Rect</span></button>
        <button class="tool-icon" data-add="line" title="Cara"><span class="ico"><ha-icon icon="mdi:vector-line"></ha-icon></span><span class="txt">Cara</span></button>
        <button class="tool-icon" data-add="barcode" title="EAN"><span class="ico"><ha-icon icon="mdi:barcode"></ha-icon></span><span class="txt">EAN</span></button>
        <button class="tool-icon" data-add="qr" title="QR"><span class="ico"><ha-icon icon="mdi:qrcode"></ha-icon></span><span class="txt">QR</span></button>
        <button class="tool-icon" data-add="chart" title="Graf"><span class="ico"><ha-icon icon="mdi:chart-line"></ha-icon></span><span class="txt">Graf</span></button>
        <button id="addImage" class="tool-icon secondary" title="Obrazek"><span class="ico"><ha-icon icon="mdi:image-plus"></ha-icon></span><span class="txt">Image</span></button>
        <input id="imageFile" type="file" accept="image/*" hidden>
      </div>
      <div class="panel-divider"></div>
      <h2>Upravy</h2>
      <div class="action-grid">
        <button id="undoAction" class="icon-btn secondary" title="Zpet" ${this._undoStack.length ? "" : "disabled"}><ha-icon icon="mdi:undo"></ha-icon></button>
        <button id="redoAction" class="icon-btn secondary" title="Dopredu" ${this._redoStack.length ? "" : "disabled"}><ha-icon icon="mdi:redo"></ha-icon></button>
        <button id="duplicateSelected" class="icon-btn secondary" title="Duplikovat" ${disabled}><ha-icon icon="mdi:content-duplicate"></ha-icon></button>
        <button id="rotateSelected" class="icon-btn secondary" title="Otocit 90" ${disabled}><ha-icon icon="mdi:rotate-right"></ha-icon></button>
        <button id="mirrorSelected" class="icon-btn secondary" title="Zrcadlit" ${disabled}><ha-icon icon="mdi:flip-horizontal"></ha-icon></button>
        <button id="layerFront" class="icon-btn secondary" title="Do popredi" ${disabled}><ha-icon icon="mdi:arrange-bring-forward"></ha-icon></button>
        <button id="layerBack" class="icon-btn secondary" title="Do pozadi" ${disabled}><ha-icon icon="mdi:arrange-send-backward"></ha-icon></button>
        <button id="alignLeft" class="icon-btn secondary" title="Zarovnat vlevo" ${disabled}><ha-icon icon="mdi:format-align-left"></ha-icon></button>
        <button id="alignCenter" class="icon-btn secondary" title="Zarovnat na stred" ${disabled}><ha-icon icon="mdi:format-align-center"></ha-icon></button>
        <button id="alignTop" class="icon-btn secondary" title="Zarovnat nahoru" ${disabled}><ha-icon icon="mdi:format-align-top"></ha-icon></button>
        <button id="alignMiddle" class="icon-btn secondary" title="Svisly stred" ${disabled}><ha-icon icon="mdi:format-align-middle"></ha-icon></button>
        <button id="deleteSelected" class="wide-action danger" ${disabled}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat vybrane</button>
        <button id="clearDesign" class="wide-action danger"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Smazat vse</button>
      </div>
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
    return `<div class="ribbon-menu view-menu"><div class="menu-command-row"><button id="zoomIn" title="Přiblížit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon><span>Přiblížit</span></button><button id="zoomOut" title="Oddálit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon><span>Oddálit</span></button><button id="zoomFit" title="Přizpůsobit"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon><span>Přizpůsobit</span></button></div><label class="view-option"><input id="snap" type="checkbox" ${this._snap ? "checked" : ""}><ha-icon icon="mdi:grid"></ha-icon><span>Přichytávat k mřížce</span></label></div>`;
  }

  _renderToolsMenu() {
    if (!this._toolsMenuOpen) return "";
    return `<div class="ribbon-menu tools-menu"><h2>Barva pozadí návrhu</h2><div class="background-picker"><button data-background="white" class="${this._backgroundColor === "white" ? "selected" : ""}" title="Bílé pozadí návrhu"><span class="color-swatch white"></span>Bílé pozadí</button><button data-background="black" class="${this._backgroundColor === "black" ? "selected" : ""}" title="Černé pozadí návrhu"><span class="color-swatch black"></span>Černé pozadí</button><button data-background="red" class="${this._backgroundColor === "red" ? "selected" : ""}" title="Červené pozadí návrhu"><span class="color-swatch red"></span>Červené pozadí</button></div></div>`;
  }

  _objectLabel(object, index) {
    if (object.type === "text") return String(object.text || "Text").slice(0, 28);
    if (object.type === "rect") return `Obdélník ${index + 1}`;
    if (object.type === "line") return `Čára ${index + 1}`;
    if (object.type === "barcode") return `EAN ${object.value || ""}`.trim();
    if (object.type === "qr") return `QR ${object.value || ""}`.trim().slice(0, 28);
    if (object.type === "chart") return String(object.chartTitle || "Graf").slice(0, 28);
    if (object.type === "image") return `Obrázek ${index + 1}`;
    return `Objekt ${index + 1}`;
  }

  _objectIcon(object) {
    return ({ text: "mdi:format-text", rect: "mdi:rectangle-outline", line: "mdi:vector-line", barcode: "mdi:barcode", qr: "mdi:qrcode", chart: "mdi:chart-line", image: "mdi:image-outline" })[object.type] || "mdi:shape-outline";
  }

  _renderLayersPanel() {
    const layers = this._objects.map((object, index) => ({ object, index })).reverse();
    return `<div class="card layers-panel"><div class="section-title"><h2>Objekty</h2><span class="pill muted">${this._objects.length}</span></div>${layers.length ? `<div class="layer-list">${layers.map(({ object, index }) => `<div class="layer-row ${this._selectedIds.includes(object.id) ? "selected" : ""}"><button class="layer-main" data-layer-select="${object.id}" title="Vybrat objekt"><ha-icon icon="${this._objectIcon(object)}"></ha-icon><span>${this._escape(this._objectLabel(object, index))}</span></button><button class="layer-step" data-layer-front="${object.id}" title="Posunout do popředí" ${index === this._objects.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button><button class="layer-step" data-layer-back="${object.id}" title="Posunout do pozadí" ${index === 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>`).join("")}</div><p class="layer-hint">Nahoře je popředí. Se Shiftem lze vybrat více objektů.</p>` : `<div class="inspector-empty"><ha-icon icon="mdi:layers-outline"></ha-icon><p>Návrh zatím neobsahuje žádné objekty.</p></div>`}</div>`;
  }

  _renderLayoutMenu(device) {
    if (!this._layoutMenuOpen) return "";
    return `<div class="ribbon-menu layout-menu"><div class="layout-menu-grid"><button class="layout-menu-button ${this._orientation === "landscape" ? "active" : ""}" data-orientation="landscape"><ha-icon icon="mdi:phone-landscape"></ha-icon><span>Na sirku</span></button><button class="layout-menu-button ${this._orientation === "portrait" ? "active" : ""}" data-orientation="portrait"><ha-icon icon="mdi:phone-portrait"></ha-icon><span>Na vysku</span></button></div>${this._renderTransformSelector(device)}</div>`;
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
    const queue = this._queue || { jobs: [], queued: 0, writing: 0, succeeded: 0, failed: 0 };
    const jobs = queue.jobs || [];
    const stat = (icon, value, label, cls = "") => `<div class="card queue-stat"><ha-icon icon="${icon}"></ha-icon><div><strong class="${cls}">${value || 0}</strong><span>${label}</span></div></div>`;
    return `<div class="queue-summary">
      ${stat("mdi:tray-full", queue.queued, "Ve fronte")}
      ${stat("mdi:progress-upload", queue.writing, "Prave zapisuje", queue.writing ? "warn-signal" : "")}
      ${stat("mdi:check-circle-outline", queue.succeeded, "Uspesne", "good-signal")}
      ${stat("mdi:alert-circle-outline", queue.failed, "Neuspesne", queue.failed ? "bad-signal" : "")}
    </div>
    <div class="card"><div class="section-title"><h2>Fronta a poslednich 20 zapisu</h2><button id="refreshQueue" class="secondary"><ha-icon icon="mdi:refresh"></ha-icon>Obnovit</button></div>
      ${queue.error ? `<div class="pill bad">${this._escape(queue.error)}</div>` : ""}
      ${jobs.length ? `<div class="queue-list">${jobs.map((job) => {
        const labels = { queued: "Ve frontě", writing: "Zapisuji", succeeded: "Dokončeno", failed: "Selhalo", skipped: "Přeskočeno" };
        const classes = { queued: "muted", writing: "warn", succeeded: "good", failed: "bad", skipped: "muted" };
        const icons = { queued: "mdi:tray-arrow-down", writing: "mdi:progress-upload", succeeded: "mdi:check", failed: "mdi:alert-circle-outline", skipped: "mdi:skip-next-circle-outline" };
        const operation = { design: "Navrh", partial_design: "Castecny zapis", text: "Text", service_text: "HA sluzba", entity_update: "Automaticka zmena entity" }[job.operation] || job.operation;
        return `<div class="queue-row ${this._escape(job.status)}">
          <div class="queue-icon"><ha-icon icon="${icons[job.status] || "mdi:help"}"></ha-icon></div>
          <div class="queue-main"><strong>${this._escape(job.address)}</strong><small>${this._escape(operation)} | ${this._formatTime(job.created_at)}</small></div>
          <div class="queue-route"><strong>${this._escape(job.transport_name)}</strong><small>${job.transport_type === "gateway" ? "DRATEK gateway" : "Home Assistant Bluetooth"}</small></div>
          <span class="pill ${classes[job.status] || "muted"}">${labels[job.status] || this._escape(job.status)}</span>
          ${job.error ? `<span class="bad-signal">${this._escape(job.error)}</span>` : `<span>${job.finished_at ? this._formatDuration(job.started_at, job.finished_at) : ""}</span>`}
        </div>`;
      }).join("")}</div>` : `<div class="inspector-empty"><ha-icon icon="mdi:tray"></ha-icon><p>Fronta je prazdna. Zapisy z designeru a automatizaci se zde objevi automaticky.</p></div>`}
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
        <div class="connection-bus" aria-hidden="true"><span></span></div>
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

  _renderGateways() {
    if (!this._gateways.length) {
      return `<div class="empty-state"><div class="empty-icon">GW</div><h2>Zadne gatewaye</h2><p>Pripoj ESP32 s DRATEK eInk firmwarem do Wi-Fi a pridej jeho IP adresu nebo .local hostname.</p></div>`;
    }
    return `<div class="device-grid">${this._gateways.map((gateway) => {
      const status = gateway.status || {};
      const online = status.ok === true;
      const unknown = status.ok === null || status.ok === undefined;
      const cls = online ? "good" : unknown ? "warn" : "bad";
      const text = online ? "Online" : unknown ? "Neovereno" : "Offline";
      const otaReady = online && status.ota_supported === true;
      const currentFirmware = CURRENT_GATEWAY_FIRMWARES.has(String(status.firmware || "").trim());
      const otaLabel = currentFirmware ? "Firmware aktualni" : otaReady ? "Aktualizovat FW" : "Nejprve USB flash";
      const editing = this._editingGatewayId === gateway.id;
      const wifiRssi = Number(status.wifi_rssi);
      return `<div class="device-card">
        <div class="device-card-top"><div>${editing
          ? `<div class="gateway-name-edit"><input data-gateway-name-input="${this._escape(gateway.id)}" value="${this._escape(this._gatewayNameDraft)}"><button class="icon-btn" data-gateway-name-save="${this._escape(gateway.id)}" title="Ulozit nazev"><ha-icon icon="mdi:check"></ha-icon></button><button class="icon-btn secondary" data-gateway-name-cancel title="Zrusit"><ha-icon icon="mdi:close"></ha-icon></button></div>`
          : `<strong>${this._escape(gateway.name)}</strong>`}<span>${this._escape(gateway.host)}</span></div><span class="pill ${cls}">${text}</span></div>
        <div class="device-model">${this._escape(status.message || "")}</div>
        <div class="gateway-health">
          <div class="health-tile"><label>Wi-Fi signal</label><div class="toolbar">${this._renderSignalBars(wifiRssi)}<strong>${Number.isFinite(wifiRssi) ? `${wifiRssi} dBm` : "-"}</strong></div></div>
          <div class="health-tile"><label>BLE sluzba</label><strong>${status.ble_initialized === true ? "Aktivni" : status.ble_initialized === false ? "Pripravena" : "-"}</strong></div>
        </div>
        <div class="device-meta">
          <span>FW ${this._escape(status.firmware || "-")}</span>
          <span>Chip ${this._escape(status.chip || "-")}</span>
          <span>IP ${this._escape(status.ip || "-")}</span>
          <span>RSSI ${this._escape(status.wifi_rssi ?? "-")}</span>
          <span>Heap ${this._escape(status.free_heap ?? "-")}</span>
          <span>Min heap ${this._escape(status.minimum_free_heap ?? "-")}</span>
          <span>Nejvetsi blok ${this._escape(status.largest_free_block ?? "-")}</span>
          <span>Restart ${this._escape(status.reset_reason || "-")}</span>
          <span>mDNS ${status.mdns_started === true ? "aktivni" : status.mdns_started === false ? "neaktivni" : "-"}</span>
          <span>BLE ${status.ble_initialized === true ? "aktivni" : status.ble_initialized === false ? "ceka" : "-"}</span>
          <span>Prenos ${this._escape(status.transfer_status || "-")}</span>
          <span>OTA slot ${status.update_partition_size ? `${Math.round(Number(status.update_partition_size) / 1024)} kB` : "-"}</span>
        </div>
        <div class="toolbar"><button class="secondary" data-gateway-rename="${this._escape(gateway.id)}" ${this._gatewayBusy || editing ? "disabled" : ""}><ha-icon icon="mdi:pencil-outline"></ha-icon>Prejmenovat</button><button data-gateway-scan="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:radar"></ha-icon>BLE scan</button><button data-gateway-ota="${this._escape(gateway.id)}" ${this._gatewayBusy || !otaReady || currentFirmware ? "disabled" : ""} title="${currentFirmware ? "Gateway ma aktualni firmware" : otaReady ? "Nahrat aktualni firmware z instalace HA" : "OTA se aktivuje prvnim USB flashem verze 0.1.38"}"><ha-icon icon="${currentFirmware ? "mdi:check-circle-outline" : "mdi:update"}"></ha-icon>${otaLabel}</button><button class="secondary" data-gateway-refresh="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Status</button><button class="danger" data-gateway-delete="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></div>
      </div>`;
    }).join("")}</div>`;
  }

  _renderGatewayDevices(devices) {
    return `<table><thead><tr><th>Adresa</th><th>Nazev</th><th>RSSI</th><th>DRATEK</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.address || "")}</td><td>${this._escape(device.name || "")}</td><td>${this._escape(device.rssi ?? "")}</td><td>${device.dratek ? "ano" : "ne"}</td></tr>`).join("")}</tbody></table>`;
  }

  _bind() {
    this.shadowRoot.querySelector("#scan")?.addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#scanDevicesTab")?.addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#refreshQueue")?.addEventListener("click", () => this._loadQueue(true));
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
    this.shadowRoot.querySelector("#addImage").addEventListener("click", () => this.shadowRoot.querySelector("#imageFile").click());
    this.shadowRoot.querySelector("#imageFile").addEventListener("change", (event) => this._addImage(event.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => this._addObject(button.dataset.add)));
    this.shadowRoot.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => this._applyTemplate(button.dataset.template)));
    this.shadowRoot.querySelector("#undoAction").addEventListener("click", () => this._undo());
    this.shadowRoot.querySelector("#redoAction").addEventListener("click", () => this._redo());
    this.shadowRoot.querySelector("#duplicateSelected").addEventListener("click", () => this._duplicateSelected());
    this.shadowRoot.querySelector("#deleteSelected").addEventListener("click", () => this._deleteSelected());
    this.shadowRoot.querySelector("#clearDesign").addEventListener("click", () => this._clearDesign());
    this.shadowRoot.querySelector("#rotateSelected").addEventListener("click", () => this._rotateSelected());
    this.shadowRoot.querySelector("#mirrorSelected").addEventListener("click", () => this._mirrorSelected());
    this.shadowRoot.querySelector("#alignLeft").addEventListener("click", () => this._alignSelected("left"));
    this.shadowRoot.querySelector("#alignCenter").addEventListener("click", () => this._alignSelected("center"));
    this.shadowRoot.querySelector("#alignTop").addEventListener("click", () => this._alignSelected("top"));
    this.shadowRoot.querySelector("#alignMiddle").addEventListener("click", () => this._alignSelected("middle"));
    this.shadowRoot.querySelector("#layerFront").addEventListener("click", () => this._moveLayer("front"));
    this.shadowRoot.querySelector("#layerBack").addEventListener("click", () => this._moveLayer("back"));
    this.shadowRoot.querySelector("#zoomIn")?.addEventListener("click", () => { this._zoom = Math.min(4, this._zoom + 0.15); this._render(); });
    this.shadowRoot.querySelector("#zoomOut")?.addEventListener("click", () => { this._zoom = Math.max(0.35, this._zoom - 0.15); this._render(); });
    this.shadowRoot.querySelector("#zoomFit")?.addEventListener("click", () => { this._fitZoom(); this._render(); });
    this.shadowRoot.querySelector("#snap")?.addEventListener("change", (event) => { this._snap = event.target.checked; });
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
        if (entityId && object.type === "text" && object.autoUpdate === undefined) object.autoUpdate = true;
        this._render();
        this._paint();
        this._scheduleDraftSave();
      });
    });
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
    return `<div class="entity-source"><h2>Zdroj z Home Assistantu</h2><div class="field"><label>Entita nebo Pomocník</label><ha-entity-picker data-entity-picker="${this._escape(object.id)}"></ha-entity-picker><small>Vyberte například input_text, input_number nebo libovolný senzor. Bez výběru se používá ruční hodnota z menu Proměnné.</small></div>${object.entityId ? `<div class="field"><label>Atribut entity (volitelné)</label><input data-prop="entityAttribute" value="${this._escape(object.entityAttribute || "")}" placeholder="Například prices"><small>Nechte prázdné pro hlavní stav entity. Atribut je vhodný například pro pole spotových cen.</small></div>${object.type === "text" ? `<label><input data-prop="autoUpdate" type="checkbox" ${object.autoUpdate !== false ? "checked" : ""}> Automaticky odeslat při změně</label><small>Změny se sloučí po 2 sekundách a zapíší přes frontu i při zavřeném designeru.</small>` : ""}<div class="entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><div><strong>${this._escape(value || "Bez hodnoty")}</strong><small>${this._escape(friendlyName)} · ${this._escape(object.entityId)}</small></div></div>` : ""}</div>`;
  }

  _inspectorSection(icon, title, body) {
    return `<section class="inspector-section"><div class="inspector-section-title"><ha-icon icon="${icon}"></ha-icon><span>${title}</span></div>${body}</section>`;
  }

  _inspectorColor(prop, value, label, colors = ["black", "red", "white"]) {
    const names = { none: "Žádná", black: "Černá", red: "Červená", white: "Bílá" };
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
      const content = this._inspectorSection("mdi:format-text", "Text", `
        <div class="field"><label><ha-icon icon="mdi:text-box-edit-outline"></ha-icon>Obsah</label><input data-prop="text" value="${this._escape(object.text)}"></div>
        <div class="row"><div class="field"><label><ha-icon icon="mdi:format-size"></ha-icon>Velikost</label><input data-prop="fontSize" type="number" min="${this._textMinFontSize(object)}" value="${object.fontSize}"></div><div class="field"><label><ha-icon icon="mdi:format-font"></ha-icon>Font</label><input value="Arial" disabled></div></div>
        ${this._inspectorSegments("textAlign", object.textAlign || "center", [{ value: "left", label: "Vlevo", icon: "mdi:format-align-left" }, { value: "center", label: "Na střed", icon: "mdi:format-align-center" }, { value: "right", label: "Vpravo", icon: "mdi:format-align-right" }], "Vodorovné zarovnání")}
        ${this._inspectorSegments("verticalAlign", object.verticalAlign || "middle", [{ value: "top", label: "Nahoru", icon: "mdi:format-vertical-align-top" }, { value: "middle", label: "Na střed", icon: "mdi:format-vertical-align-center" }, { value: "bottom", label: "Dolů", icon: "mdi:format-vertical-align-bottom" }], "Svislé zarovnání")}`);
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
        <div class="row"><div class="field"><label>Minimum</label><input data-prop="chartMin" type="number" step="any" value="${this._escape(object.chartMin ?? "")}" placeholder="Auto"></div><div class="field"><label>Maximum</label><input data-prop="chartMax" type="number" step="any" value="${this._escape(object.chartMax ?? "")}" placeholder="Auto"></div></div>`);
      const appearance = this._inspectorSection("mdi:palette-outline", "Barvy a zobrazení", `${this._inspectorColor("backgroundColor", object.backgroundColor || "white", "Pozadí")}${this._inspectorColor("color", object.color || "black", "Čára grafu")}${this._inspectorColor("graphColor", object.graphColor || "black", "Osy a popisky")}${object.chartType === "bar" ? this._inspectorColor("barColor", object.barColor || "red", "Sloupce") : ""}<div class="toggle-stack">${this._inspectorToggle("showAxes", object.showAxes !== false, "mdi:axis-arrow", "Zobrazit osy")}${this._inspectorToggle("showGrid", object.showGrid !== false, "mdi:grid", "Zobrazit mřížku")}${this._inspectorToggle("showValues", !!object.showValues, "mdi:numeric", "Zobrazit hodnoty")}</div>`);
      const source = this._inspectorSection("mdi:database-sync-outline", "Datový zdroj", `<div class="field"><label><ha-icon icon="mdi:identifier"></ha-icon>Název proměnné</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="ceny_spot_24h"></div>${this._renderEntityBinding(object)}`);
      return `${geometry}${chart}${appearance}${source}`;
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

    return `${geometry}${this._inspectorSection("mdi:image-outline", "Obrázek", `<div class="toggle-stack">${this._inspectorToggle("keepRatio", !!object.keepRatio, "mdi:aspect-ratio", "Zachovat poměr stran")}</div><p class="inspector-help"><ha-icon icon="mdi:information-outline"></ha-icon><span>Velikost můžete změnit tažením za rohy nebo přesnými hodnotami.</span></p>`)}`;
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
      else if (["x", "y", "x2", "y2", "w", "h", "rotation", "fontSize", "minFontSize", "strokeWidth", "maxPoints", "legendFontSize"].includes(key)) object[key] = Number(input.value);
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
    if (canvas) this._drawScene(canvas.getContext("2d"), canvas.width, canvas.height, true);
    this._paintDevicePreviews();
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
        ctx.save();
        ctx.scale(canvas.width / sourceWidth, canvas.height / sourceHeight);
        ctx.fillStyle = this._color(this._backgroundColor);
        ctx.fillRect(0, 0, sourceWidth, sourceHeight);
        for (const object of this._objects) this._drawObject(ctx, object);
        ctx.restore();
        if (this._invertColors) this._applyColorInversion(ctx, canvas.width, canvas.height);
        this._applyEinkPreview(ctx, canvas.width, canvas.height);
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
    else if (object.type === "image") this._drawImage(ctx, object, box);
    ctx.restore();
  }

  _drawText(ctx, object, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = this._color(object.color);
    const value = object.entityId
      ? (this._entityValue(object) || object.text || "")
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
    ctx.textBaseline = "top";
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
    const width = ctx.measureText(text || " ").width;
    if (width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    const minScale = 0.84;
    const scale = Math.max(minScale, maxWidth / Math.max(1, width));
    let output = text;
    if (width * minScale > maxWidth) {
      output = this._ellipsizeText(ctx, text, maxWidth / minScale);
    }
    ctx.save();
    ctx.translate(x, y);
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
    const left = showAxes ? Math.max(object.yLabel ? 34 : 25, Math.round(legendFontSize * 3.4)) : 5;
    const right = 6;
    const top = title ? Math.max(17, legendFontSize + 8) : 5;
    const bottom = showAxes ? Math.max(object.xLabel ? 22 : 14, object.xLabel ? legendFontSize * 2.4 : legendFontSize + 7) : 5;
    const plotW = Math.max(8, box.w - left - right);
    const plotH = Math.max(8, box.h - top - bottom);

    ctx.fillStyle = graphColor;
    ctx.font = "700 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (title) ctx.fillText(title, box.w / 2, 2, Math.max(10, box.w - 8));
    if (!values.length) {
      ctx.font = "600 9px Arial";
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
      ctx.font = `600 ${legendFontSize}px Arial`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(this._formatChartNumber(max), left - 3, top + 2);
      ctx.fillText(this._formatChartNumber(min), left - 3, top + plotH - 2);
      const labels = String(object.chartLabels || "").split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean).slice(-values.length);
      const labelIndexes = values.length > 2 && plotW > 140 ? [0, Math.floor((values.length - 1) / 2), values.length - 1] : [0, values.length - 1];
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const index of [...new Set(labelIndexes)]) ctx.fillText(labels[index] || String(index + 1), xFor(index), top + plotH + 3, 34);
      ctx.font = `700 ${Math.min(18, legendFontSize + 1)}px Arial`;
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
      ctx.font = `700 ${legendFontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const every = values.length <= 10 ? 1 : Math.ceil(values.length / 8);
      values.forEach((value, index) => { if (index % every === 0 || index === values.length - 1) ctx.fillText(this._formatChartNumber(value), xFor(index), yFor(value) - 2); });
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
    if (object._img && object._img.complete) ctx.drawImage(object._img, 0, 0, box.w, box.h);
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
    ctx.strokeStyle = "#0078d4";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1;
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      const box = this._box(object);
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
      for (const handle of this._handles(box)) {
        const size = Math.max(8, 12 / this._zoom);
        const half = size / 2;
        ctx.fillRect(handle.x - half, handle.y - half, size, size);
        ctx.strokeRect(handle.x - half, handle.y - half, size, size);
      }
    }
    if (this._drag?.mode === "marquee") {
      const x = Math.min(this._drag.start.x, this._drag.current.x);
      const y = Math.min(this._drag.start.y, this._drag.current.y);
      const w = Math.abs(this._drag.current.x - this._drag.start.x);
      const h = Math.abs(this._drag.current.y - this._drag.start.y);
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#0078d4";
      ctx.fillStyle = "rgba(0,120,212,.12)";
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
    return [
      { name: "top-left", x: box.x, y: box.y },
      { name: "top-right", x: box.x + box.w, y: box.y },
      { name: "bottom-left", x: box.x, y: box.y + box.h },
      { name: "bottom-right", x: box.x + box.w, y: box.y + box.h },
    ];
  }

  _automaticTextBindings() {
    return this._objects.filter((object) => object.type === "text" && object.entityId && object.autoUpdate !== false);
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
      bindings: objects.map((object) => ({
        id: object.id,
        entity_id: object.entityId,
        entity_attribute: object.entityAttribute || "",
        include_unit: !object.entityAttribute,
        fallback: object.text || "",
        x: Number(object.x || 0), y: Number(object.y || 0),
        w: Number(object.w || 1), h: Number(object.h || 1),
        rotation: Number(object.rotation || 0), flipH: !!object.flipH,
        color: effectiveColor(object.color), fontSize: Number(object.fontSize || 16),
        minFontSize: Number(object.minFontSize || this._readableMinFontSize()),
        bold: !!object.bold, textAlign: object.textAlign || "left",
        verticalAlign: object.verticalAlign || "middle", autoFit: object.autoFit !== false,
        padding: Number(object.padding || 0),
      })),
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
    const frameRatio = Math.max(0.48, Math.min(3.7, (sourceWidth / sourceHeight) / 0.95));
    const previewWidth = Math.max(sizing.minWidth, Math.min(sizing.maxWidth, Math.round(sizing.targetHeight * frameRatio)));
    return `<div class="device-preview-wrap preview-${previewMode}">
      <div class="device-preview-bezel" style="--frame-ratio:${frameRatio.toFixed(4)};--preview-width:${previewWidth}px" title="Náhled ${this._escape(sourceWidth)} × ${this._escape(sourceHeight)}">
        <span class="device-preview-code">${this._escape(device.physical_code || "00.00.00.00")}</span>
        <div class="device-preview-screen">
          <canvas data-device-preview="${this._escape(address)}" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}" width="${canvasWidth}" height="${canvasHeight}"></canvas>
          ${draft ? "" : `<div class="device-preview-empty"><span><ha-icon icon="mdi:image-outline"></ha-icon>Prázdný návrh</span></div>`}
        </div>
      </div>
    </div>`;
  }

  _renderDeviceCards(devices, selectedAddress) {
    if (!devices.length) {
      return `<div class="empty-state"><div class="empty-icon">DE</div><h2>${this._loading ? "Hledám displeje v okolí" : "V okolí zatím není žádný displej"}</h2><p>${this._loading ? "Scan se spustil automaticky po otevření panelu." : "Hledání můžeš kdykoliv zopakovat tlačítkem Obnovit."}</p></div>`;
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
      return `<article class="display-tile ${selected ? "selected" : ""}" data-device-card-open="${this._escape(device.address)}" role="button" tabindex="0" aria-label="Otevřít ${this._escape(this._deviceTitle(device))} v designeru">
        <header class="display-tile-header">
          <span class="display-online-dot" title="Displej je dostupný"></span>
          <div class="display-tile-identity"><strong>${this._escape(this._deviceTitle(device))}</strong><span>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</span></div>
          <span class="display-resolution"><ha-icon icon="mdi:aspect-ratio"></ha-icon>${previewSize.width} × ${previewSize.height}</span>
        </header>
        ${mode === "list" ? "" : `<div class="display-preview-slot">${this._renderDevicePreview(device, mode)}</div>`}
        <div class="display-health">
          <div class="display-health-item display-battery-item" title="Odhad zbývající kapacity CR2450"><small>Baterie</small>${this._renderBatterySegments(battery.percent)}<strong>${Number.isFinite(battery.percent) ? `${battery.percent} % · ${this._formatBatteryVoltage(battery.voltage)}` : "-"}</strong></div>
          <div class="display-health-item display-signal-item"><small>Signál</small>${this._renderSignalBars(rssi)}<strong class="signal-value ${this._signalClass(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
          <div class="display-health-item display-health-route"><ha-icon icon="${preferredPath?.type === "local" ? "mdi:bluetooth-connect" : "mdi:router-wireless"}"></ha-icon><span><small>Připojení</small><strong>${this._escape(preferredPath?.name || "Nedostupné")}</strong></span></div>
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

