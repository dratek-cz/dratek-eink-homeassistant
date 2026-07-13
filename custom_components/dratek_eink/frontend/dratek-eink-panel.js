import qrcode from "./qrcode-generator.js";

const DRATEK_EINK_VERSION = "0.1.21";

class DratekEinkPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._loading = false;
    this._sending = false;
    this._result = null;
    this._error = "";
    this._sendResult = null;
    this._selectedDeviceAddress = "";
    this._objects = [];
    this._selectedIds = [];
    this._drag = null;
    this._nextId = 1;
    this._realPreview = false;
    this._zoom = 1;
    this._snap = true;
    this._projects = [];
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._variables = {};
    this._orientation = "landscape";
    this._displayTransform = "rotate_cw";
    this._activeTab = "devices";
    this._gateways = [];
    this._gatewayResult = null;
    this._gatewayBusy = false;
    this._gatewayDiscovery = [];
    this._serialPorts = [];
    this._serialPortsLoaded = false;
    this._gatewayForm = { name: "DRATEK eInk gateway", host: "dratek-eink-gateway.local" };
    this._flashForm = { port: "", ssid: "", password: "", hostname: "dratek-eink-gateway", chip: "esp32s3" };
    this._flashResult = null;
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
    this._handleKeyDown = (event) => this._onKeyDown(event);
  }

  connectedCallback() {
    window.addEventListener("keydown", this._handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this._handleKeyDown);
    window.clearTimeout(this._propertyEditTimer);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._scan();
      this._loadProjects();
      this._loadGateways();
      this._loadSerialPorts();
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
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/discover", seconds: 5 });
      this._gatewayDiscovery = result.discovered || [];
      this._gatewayResult = result.ok
        ? { ok: true, message: `Discovery dokonceno. Nalezeno ${this._gatewayDiscovery.length} gatewayi.` }
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
    if (!discovered) return;
    this._gatewayForm = {
      name: discovered.name || "DRATEK eInk gateway",
      host: discovered.server || discovered.host,
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
    this._flashResult = null;
    this._render();
    try {
      this._flashResult = await this._hass.callWS({
        type: "dratek_eink/gateways/flash",
        port: this._flashForm.port,
        ssid: this._flashForm.ssid,
        password: this._flashForm.password,
        hostname: this._flashForm.hostname || "dratek-eink-gateway",
        chip: this._flashForm.chip || "esp32s3",
      });
      if (this._flashResult.ok) {
        this._gatewayBusy = false;
        await this._discoverGateways();
      }
    } catch (err) {
      this._flashResult = { ok: false, error: this._message(err), log: [] };
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

  async _scan() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      this._result = await this._hass.callWS({ type: "dratek_eink/scan" });
      if (this._result.devices.length) {
        const found = this._result.devices.some((device) => device.address === this._selectedDeviceAddress);
        if (!this._selectedDeviceAddress || !found) {
          await this._selectDevice(this._result.devices[0].address, { saveCurrent: false, render: false });
        }
      }
    } catch (err) {
      this._error = this._message(err);
    } finally {
      this._loading = false;
      this._render();
      this._paint();
    }
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
    return devices.find((device) => device.address === this._selectedDeviceAddress) || devices[0] || null;
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
    const size = this._displaySize(device);
    this._objects = Array.isArray(source.objects) ? structuredClone(source.objects) : [];
    this._variables = source.variables ? structuredClone(source.variables) : {};
    this._selectedIds = [];
    this._selectedProjectId = source.id || "";
    this._projectName = source.name || (device && device.physical_code ? `Navrh ${device.physical_code}` : "Novy navrh");
    this._nextId = this._nextObjectId();
    if ((source.width && source.width !== size.width) || (source.height && source.height !== size.height)) {
      this._scaleDesign({ width: source.width || size.width, height: source.height || size.height }, size);
      this._selectedProjectId = "";
    }
    this._restoringDraft = false;
  }

  _setOrientation(orientation) {
    if (!["landscape", "portrait"].includes(orientation) || orientation === this._orientation) return;
    const before = this._displaySize();
    this._orientation = orientation;
    const after = this._displaySize();
    if (before.width !== after.width || before.height !== after.height) {
      this._rotateDesignLayout(before);
    }
    this._selectedIds = [];
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _rotateDesignLayout(before) {
    this._objects = this._objects.map((object) => {
      const next = { ...object };
      if (next.type === "line") {
        const start = this._rotatePointClockwise({ x: Number(next.x || 0), y: Number(next.y || 0) }, before);
        const end = this._rotatePointClockwise({ x: Number(next.x2 || 0), y: Number(next.y2 || 0) }, before);
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
      next.x = this._snapValue(before.height - y - h);
      next.y = this._snapValue(x);
      next.w = this._snapValue(h);
      next.h = this._snapValue(w);
      next.rotation = (Number(next.rotation || 0) + 90) % 360;
      return next;
    });
  }

  _rotatePointClockwise(point, before) {
    return { x: before.height - point.y, y: point.x };
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
    return event.composedPath().some((node) => {
      const tag = String(node.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
    });
  }

  _onKeyDown(event) {
    if (this._activeTab !== "designer" || this._isTypingEvent(event)) return;
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
      this._applyDraft(result.draft || null);
    } catch (err) {
      this._applyDraft(null);
      this._sendResult = { ok: false, error: `Nepodarilo se nacist navrh displeje: ${this._message(err)}`, log: [] };
    } finally {
      this._loadingDraft = false;
    }
  }

  _scheduleDraftSave() {
    if (this._restoringDraft || !this._hass || !this._selectedDeviceAddress) return;
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
      await this._hass.callWS({
        type: "dratek_eink/device_drafts/save",
        address: device.address,
        draft: this._projectPayload(device),
      });
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
    if (this._result.scanner_count === 0) return { cls: "bad", text: "Bluetooth neni dostupny" };
    if (this._result.devices.length === 0) return { cls: "warn", text: "Bluetooth funguje, DRATEK eInk nenalezen" };
    return { cls: "good", text: `Nalezeno ${this._result.devices.length} displeju` };
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
      ["all", "Vse"],
      ["weather", "Pocasi"],
      ["home", "Domacnost"],
      ["energy", "Energie"],
      ["tech", "Technika"],
      ["status", "Stavy"],
      ["people", "Lide"],
      ["time", "Cas"],
      ["transport", "Doprava"],
      ["finance", "Finance"],
      ["security", "Bezpecnost"],
      ["health", "Zdravi"],
      ["media", "Media"],
      ["food", "Jidlo"],
      ["shop", "Obchod"],
      ["nature", "Priroda"],
      ["arrows", "Sipky"],
      ["symbols", "Znacky"],
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
      if (next.variable && next.variableName) variables[next.variableName] = next.text || "";
      return next;
    });
    this._variables = variables;
    this._selectedIds = [];
    this._selectedProjectId = "";
    this._projectName = `Sablona ${template.title}`;
    this._nextId = this._nextObjectId();
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
    if (type === "qr") {
      object.w = Math.min(object.w, object.h);
      object.h = object.w;
      object.keepRatio = true;
    }
    this._objects.push(object);
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
        this._variables[copy.variableName] = copy.text || "";
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
    if (this._objects.length && !confirm("Vytvorit novy prazdny navrh?")) return;
    this._pushHistory();
    this._objects = [];
    this._selectedIds = [];
    this._variables = {};
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._nextId = 1;
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
        .filter((object) => object.id !== objectId && object.type === "text" && object.variable && object.variableName)
        .map((object) => object.variableName)
    );
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base}_${index}`)) index++;
    return `${base}_${index}`;
  }

  _variableDefs() {
    return this._objects
      .filter((object) => object.type === "text" && object.variable && object.variableName)
      .map((object) => ({
        id: object.id,
        name: object.variableName,
        defaultValue: object.text || "",
        value: this._variables[object.variableName] ?? object.text ?? "",
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
      this._selectedIds = [];
      this._drag = null;
      this._render();
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
    if (this._drag) this._scheduleDraftSave();
    this._drag = null;
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

  async _loadSelectedProject() {
    if (!this._selectedProjectId) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/projects/load", project_id: this._selectedProjectId });
      const project = result.project;
      const previousOrientation = this._orientation;
      const previousTransform = this._displayTransform;
      this._orientation = project.orientation === "portrait" ? "portrait" : "landscape";
      this._displayTransform = project.display_transform || "rotate_cw";
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
    const canvas = this._renderExportCanvas();
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
      });
      if (this._sendResult && this._sendResult.ok) await this._saveCurrentDeviceDraft();
    } catch (err) {
      this._sendResult = { ok: false, address: device.address, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
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
      this._render();
      this._paint();
    }
  }

  _render() {
    const result = this._result || { scanner_count: 0, ble_count: 0, devices: [], ble_devices: [], debug: [] };
    const status = this._status();
    const device = this._device();
    const size = this._displaySize(device);
    const object = this._selectedObject();
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-height:100%;color:var(--primary-text-color);background:linear-gradient(180deg,var(--primary-background-color),var(--secondary-background-color));font-family:Roboto,Arial,sans-serif}
        *{box-sizing:border-box} .page{max-width:1680px;margin:0 auto;padding:18px;display:grid;gap:14px}
        h1{margin:0;font-size:24px;font-weight:850;letter-spacing:0}h2{margin:0;font-size:13px;text-transform:uppercase;color:var(--secondary-text-color);letter-spacing:.08em}.subtitle{color:var(--secondary-text-color);font-size:13px;margin-top:3px}
        button,select,input{font:inherit}button{border:0;border-radius:8px;background:var(--primary-color);color:var(--text-primary-color,#fff);padding:9px 12px;font-weight:760;cursor:pointer;box-shadow:0 1px 0 rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px}button:hover:not(:disabled){filter:brightness(1.03);transform:translateY(-1px)}button:disabled{opacity:.45;cursor:not-allowed;transform:none}
        ha-icon{--mdc-icon-size:18px}.primary-action{background:#0f766e}.secondary{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.danger{background:#b3261e;color:#fff}.ghost{background:transparent;color:var(--primary-text-color);border:1px solid transparent;box-shadow:none}
        .topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.07)}.brand{display:flex;align-items:center;gap:13px}.logo{width:44px;height:44px;border-radius:8px;display:grid;place-items:center;background:#111827;color:#fff;font-weight:950;letter-spacing:.5px}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.version-badge{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 8px;border-radius:999px;background:var(--secondary-background-color);color:var(--secondary-text-color);border:1px solid var(--divider-color);font-size:11px;font-weight:850}
        .card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px;box-shadow:0 10px 28px rgba(0,0,0,.06)}.metric{color:var(--secondary-text-color);font-size:12px;margin-bottom:5px}.value{font-size:25px;font-weight:850}.pill{display:inline-flex;min-height:26px;align-items:center;border-radius:999px;padding:0 10px;font-size:12px;font-weight:800}.good{background:#d7f5df;color:#0b6b2a}.warn{background:#fff2c7;color:#775500}.bad{background:#ffd9d4;color:#9d1c0f}.muted{background:var(--secondary-background-color);color:var(--secondary-text-color)}
        .tabbar{display:flex;gap:6px;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:5px;width:max-content;max-width:100%;box-shadow:0 8px 24px rgba(0,0,0,.05)}.tab{background:transparent;color:var(--secondary-text-color);box-shadow:none;border:0;border-radius:7px;padding:10px 14px}.tab.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}
        .status-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}.status-tile{display:flex;align-items:center;justify-content:space-between;gap:12px}.status-icon{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-color)}
        .projectbar{display:grid;grid-template-columns:minmax(190px,280px) minmax(210px,340px) auto;gap:10px;align-items:center}.projectbar .toolbar{justify-content:flex-end}
        .device-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}.device-card{position:relative;display:grid;gap:13px;text-align:left;background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:15px;box-shadow:0 12px 32px rgba(0,0,0,.08);overflow:hidden}.device-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:#9ca3af}.device-card.selected{border-color:var(--primary-color);box-shadow:0 0 0 2px rgba(37,99,235,.18),0 16px 38px rgba(0,0,0,.11)}.device-card.selected:before{background:var(--primary-color)}.device-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.device-card-top strong{display:block;font-size:20px;letter-spacing:.01em}.device-card-top span:not(.pill){display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.device-model{font-size:13px;line-height:1.45;color:var(--primary-text-color)}.device-model span,.device-meta{color:var(--secondary-text-color);font-size:12px}.device-meters{display:grid;grid-template-columns:1fr 1fr;gap:12px}.meter-block{display:grid;gap:6px}.meter-block label{font-size:11px;text-transform:uppercase;color:var(--secondary-text-color);font-weight:800;letter-spacing:.08em}.battery{height:10px;border-radius:999px;background:rgba(127,127,127,.14);overflow:hidden;border:1px solid var(--divider-color)}.battery span{display:block;height:100%;background:#9ca3af}.battery.high span{background:#16a34a}.battery.medium span{background:#d97706}.battery.low span{background:#dc2626}.signal-bars{height:20px;display:flex;align-items:end;gap:3px}.signal-bars span{display:block;width:8px;border-radius:2px;background:var(--divider-color)}.signal-bars span:nth-child(1){height:7px}.signal-bars span:nth-child(2){height:11px}.signal-bars span:nth-child(3){height:15px}.signal-bars span:nth-child(4){height:19px}.signal-bars.level-1 .on{background:#dc2626}.signal-bars.level-2 .on{background:#d97706}.signal-bars.level-3 .on,.signal-bars.level-4 .on{background:#16a34a}.device-meta{display:flex;gap:8px;flex-wrap:wrap}.device-meta span{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:999px;padding:4px 8px}
        .empty-state{min-height:280px;display:grid;place-items:center;text-align:center;gap:9px;color:var(--secondary-text-color)}.empty-state h2{color:var(--primary-text-color);font-size:18px;text-transform:none;letter-spacing:0;margin:0}.empty-icon{width:62px;height:62px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);font-weight:950;color:var(--primary-color)}
        .editor-shell{display:grid;grid-template-columns:276px minmax(0,1fr) 352px;gap:12px;align-items:start}.left,.right{position:sticky;top:12px}.template-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:282px;overflow:auto;padding-right:2px}.template-hero .template-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));max-height:none;overflow:visible;padding-right:0}.template-card{min-height:76px;display:grid;grid-template-columns:34px 1fr;align-items:center;text-align:left;gap:9px;padding:9px;border:1px solid var(--divider-color);background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color);box-shadow:none}.template-card ha-icon{color:var(--primary-color);--mdc-icon-size:26px}.template-card strong{display:block;font-size:12px;line-height:1.2}.template-card span{display:block;font-size:10px;color:var(--secondary-text-color);font-weight:800;text-transform:uppercase;margin-top:2px}.template-card:hover:not(:disabled){border-color:var(--primary-color);background:var(--secondary-background-color)}.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.tool-icon{min-height:82px;display:grid;grid-template-rows:36px auto;place-items:center;text-align:center;padding:10px 6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none}.tool-icon .ico{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-color);font-size:18px;font-weight:900}.tool-icon .txt{font-size:11px;font-weight:850;color:var(--secondary-text-color);text-transform:uppercase}.tool-icon:hover:not(:disabled){border-color:var(--primary-color);background:var(--secondary-background-color)}
        .action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.icon-btn{min-height:42px;padding:7px;font-size:16px;display:grid;place-items:center}.wide-action{grid-column:span 4;font-size:13px}.panel-divider{height:1px;background:var(--divider-color);margin:14px 0}.layout-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.layout-btn{min-height:58px;display:grid;place-items:center;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-shadow:none}.layout-btn.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}.transform-box{margin-top:10px;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color)}.transform-box small{display:block;color:var(--secondary-text-color);line-height:1.35;margin-top:6px}.properties-panel{max-height:calc(100vh - 120px);overflow:auto}
        .workspace-card{padding:0;overflow:hidden}.canvas-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.canvas-meta{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:12px}.workspace{min-height:590px;overflow:auto;display:grid;place-items:center;background:linear-gradient(45deg,rgba(127,127,127,.08) 25%,transparent 25%),linear-gradient(-45deg,rgba(127,127,127,.08) 25%,transparent 25%);background-size:18px 18px;border:0;padding:34px}
        canvas{background:#fff;box-shadow:0 20px 54px rgba(0,0,0,.24);touch-action:none}.field{display:grid;gap:5px;margin-bottom:10px}.field label{color:var(--secondary-text-color);font-size:12px;font-weight:760}.field input,.field select,.projectbar input,.projectbar select,#deviceSelect{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top}th{color:var(--secondary-text-color);font-size:11px;text-transform:uppercase}pre{overflow:auto;background:#111827;color:#e5e7eb;border-radius:8px;padding:12px;font-size:12px;line-height:1.45}.send-result{margin-top:10px}.variable-table input{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);padding:7px}.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:20;display:grid;place-items:center;padding:24px}.symbol-dialog{width:min(920px,100%);max-height:min(760px,92vh);overflow:auto;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.35);padding:16px}.symbol-search{display:grid;grid-template-columns:1fr auto;gap:10px;margin:12px 0}.symbol-search input{width:100%;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:10px}.category-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.category-row button{min-height:32px;padding:6px 10px}.category-row button.active{background:var(--primary-color);color:var(--text-primary-color,#fff)}.symbol-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}.symbol-tile{min-height:78px;display:grid;grid-template-rows:32px auto;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);box-shadow:none}.symbol-tile strong{font-size:29px;line-height:1}.symbol-tile span{font-size:10px;color:var(--secondary-text-color);font-weight:800;text-transform:uppercase;text-align:center}
        .section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.debug-card details{margin-top:10px}.debug-card summary{cursor:pointer;color:var(--primary-color);font-weight:760}.inspector-empty{padding:18px;border:1px dashed var(--divider-color);border-radius:8px;color:var(--secondary-text-color);text-align:center;background:var(--secondary-background-color)}
        @media(max-width:1180px){.editor-shell,.status-grid,.projectbar{grid-template-columns:1fr}.left,.right{position:static}.tabbar{width:100%}.tab{flex:1}.workspace{min-height:420px}}
      </style>
      <div class="page">
        <div class="topbar">
          <div class="brand"><div class="logo">DE</div><div><h1>DRATEK eInk <span class="version-badge">v${DRATEK_EINK_VERSION}</span></h1><div class="subtitle">Editor sablon, BLE diagnostika a sprava displeju</div></div></div>
          <div class="toolbar"><button id="scan" class="secondary" ${this._loading ? "disabled" : ""}><ha-icon icon="mdi:bluetooth-searching"></ha-icon>${this._loading ? "Vyhledavam..." : "Vyhledat zarizeni"}</button><button id="sendDesign" class="primary-action" ${!device || this._sending ? "disabled" : ""}><ha-icon icon="mdi:upload"></ha-icon>${this._sending ? "Odesilam..." : "Odeslat navrh"}</button></div>
        </div>
        <div class="tabbar"><button class="tab ${this._activeTab === "devices" ? "active" : ""}" data-tab="devices"><ha-icon icon="mdi:devices"></ha-icon>Nalezene displeje</button><button class="tab ${this._activeTab === "designer" ? "active" : ""}" data-tab="designer"><ha-icon icon="mdi:vector-square-edit"></ha-icon>Designer</button><button class="tab ${this._activeTab === "gateways" ? "active" : ""}" data-tab="gateways"><ha-icon icon="mdi:router-wireless"></ha-icon>Gatewaye</button></div>
        <div style="${this._activeTab === "devices" ? "" : "display:none"}">
          <div class="status-grid">
            <div class="card status-tile"><div><div class="metric">Stav systemu</div><span class="pill ${status.cls}">${this._escape(status.text)}</span></div><div class="status-icon"><ha-icon icon="mdi:access-point"></ha-icon></div></div>
            <div class="card status-tile"><div><div class="metric">Bluetooth adaptery / proxy</div><div class="value">${result.scanner_count}</div></div><div class="status-icon"><ha-icon icon="mdi:bluetooth"></ha-icon></div></div>
            <div class="card status-tile"><div><div class="metric">BLE zarizeni v dosahu</div><div class="value">${result.ble_count}</div></div><div class="status-icon"><ha-icon icon="mdi:radar"></ha-icon></div></div>
          </div>
          <div class="card"><div class="section-title"><h2>DRATEK eInk displeje</h2><button id="scanDevicesTab" ${this._loading ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this._loading ? "Vyhledavam..." : "Spustit scan"}</button></div>${this._renderDeviceCards(result.devices, device && device.address)}</div>
          <div class="card debug-card"><div class="section-title"><h2>Bluetooth debug</h2><span class="pill muted">${result.ble_devices.length} BLE</span></div><pre>${this._escape((result.debug || []).join("\n"))}</pre><details><summary>Vsechna BLE zarizeni</summary>${this._renderBleDevices(result.ble_devices)}</details></div>
        </div>
        <div style="${this._activeTab === "designer" ? "" : "display:none"}">
        <div class="status-grid">
          <div class="card status-tile"><div><div class="metric">Vybrany displej</div><span class="pill ${device ? "good" : "warn"}">${device ? this._escape(device.physical_code) : "Neni vybran"}</span></div><div class="status-icon"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></div></div>
          <div class="card status-tile"><div><div class="metric">Rozliseni navrhu</div><div class="value">${size.width}x${size.height}</div></div><div class="status-icon"><ha-icon icon="mdi:resize"></ha-icon></div></div>
          <div class="card status-tile"><div><div class="metric">Objekty v sablone</div><div class="value">${this._objects.length}</div></div><div class="status-icon"><ha-icon icon="mdi:shape-outline"></ha-icon></div></div>
        </div>
        <div class="card projectbar"><input id="projectName" value="${this._escape(this._projectName)}" placeholder="Nazev navrhu"><select id="projectSelect"><option value="">Novy / neulozeny navrh</option>${this._projects.map((project) => `<option value="${this._escape(project.id)}" ${project.id === this._selectedProjectId ? "selected" : ""}>${this._escape(project.name)} (${project.width}x${project.height})</option>`).join("")}</select><div class="toolbar"><button id="newProject" class="secondary"><ha-icon icon="mdi:file-plus-outline"></ha-icon>Novy</button><button id="saveProject"><ha-icon icon="mdi:content-save-outline"></ha-icon>Ulozit</button><button id="loadProject" class="secondary" ${this._selectedProjectId ? "" : "disabled"}><ha-icon icon="mdi:folder-open-outline"></ha-icon>Nacist</button><button id="deleteProject" class="danger" ${this._selectedProjectId ? "" : "disabled"}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></div></div>
        <div class="card"><div class="toolbar"><label>Displej</label><select id="deviceSelect">${result.devices.map((item) => `<option value="${this._escape(item.address)}" ${item.address === (device && device.address) ? "selected" : ""}>${this._escape(item.physical_code)} - ${this._escape(item.model)} - SDK ${this._escape(item.sdk_type)} - RSSI ${this._escape(item.rssi)}</option>`).join("")}</select><span class="pill muted">${size.width} x ${size.height}</span><button id="orientationLandscape" class="secondary" data-orientation="landscape" title="Na sirku" ${this._orientation === "landscape" ? "disabled" : ""}><ha-icon icon="mdi:phone-landscape"></ha-icon>Na sirku</button><button id="orientationPortrait" class="secondary" data-orientation="portrait" title="Na vysku" ${this._orientation === "portrait" ? "disabled" : ""}><ha-icon icon="mdi:phone-portrait"></ha-icon>Na vysku</button><button id="sendTest" class="secondary" ${!device ? "disabled" : ""}><ha-icon icon="mdi:send-check-outline"></ha-icon>Test dratek.cz</button><label class="pill muted"><input id="realPreview" type="checkbox" ${this._realPreview ? "checked" : ""}> Real eInk colors</label></div>${this._renderSendResult()}</div>
        ${this._renderVariables()}
        <div class="card template-hero"><div class="section-title"><h2>Sablony navrhu</h2><span class="pill good">Vyber sablonu kliknutim</span></div><div class="template-grid">${this._renderTemplates()}</div></div>
        <div class="editor-shell">
          <div class="card left"><div class="section-title"><h2>Nastroje</h2><span class="pill muted">${this._selectedIds.length} vybrano</span></div><div class="tool-grid"><button class="tool-icon" data-add="text" title="Text"><span class="ico"><ha-icon icon="mdi:format-text"></ha-icon></span><span class="txt">Text</span></button><button id="openSymbols" class="tool-icon" title="Symboly"><span class="ico"><ha-icon icon="mdi:shape-plus"></ha-icon></span><span class="txt">Symbol</span></button><button class="tool-icon" data-add="rect" title="Rectangle"><span class="ico"><ha-icon icon="mdi:rectangle-outline"></ha-icon></span><span class="txt">Rect</span></button><button class="tool-icon" data-add="line" title="Cara"><span class="ico"><ha-icon icon="mdi:vector-line"></ha-icon></span><span class="txt">Cara</span></button><button class="tool-icon" data-add="barcode" title="EAN"><span class="ico"><ha-icon icon="mdi:barcode"></ha-icon></span><span class="txt">EAN</span></button><button class="tool-icon" data-add="qr" title="QR"><span class="ico"><ha-icon icon="mdi:qrcode"></ha-icon></span><span class="txt">QR</span></button><button id="addImage" class="tool-icon secondary" title="Obrazek"><span class="ico"><ha-icon icon="mdi:image-plus"></ha-icon></span><span class="txt">Image</span></button><input id="imageFile" type="file" accept="image/*" hidden></div><div class="panel-divider"></div><h2>Layout displeje</h2><div class="layout-grid"><button class="layout-btn ${this._orientation === "landscape" ? "active" : ""}" data-orientation="landscape" title="Navrh na sirku"><ha-icon icon="mdi:phone-landscape"></ha-icon>Na sirku</button><button class="layout-btn ${this._orientation === "portrait" ? "active" : ""}" data-orientation="portrait" title="Navrh na vysku"><ha-icon icon="mdi:phone-portrait"></ha-icon>Na vysku</button></div>${this._renderTransformSelector(device)}<div class="panel-divider"></div><h2>Upravy</h2><div class="action-grid"><button id="undoAction" class="icon-btn secondary" title="Zpet" ${this._undoStack.length ? "" : "disabled"}><ha-icon icon="mdi:undo"></ha-icon></button><button id="redoAction" class="icon-btn secondary" title="Dopredu" ${this._redoStack.length ? "" : "disabled"}><ha-icon icon="mdi:redo"></ha-icon></button><button id="duplicateSelected" class="icon-btn secondary" title="Duplikovat" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:content-duplicate"></ha-icon></button><button id="rotateSelected" class="icon-btn secondary" title="Otocit 90" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:rotate-right"></ha-icon></button><button id="mirrorSelected" class="icon-btn secondary" title="Zrcadlit" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:flip-horizontal"></ha-icon></button><button id="layerFront" class="icon-btn secondary" title="Do popredi" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:arrange-bring-forward"></ha-icon></button><button id="layerBack" class="icon-btn secondary" title="Do pozadi" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:arrange-send-backward"></ha-icon></button><button id="alignLeft" class="icon-btn secondary" title="Zarovnat vlevo" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:format-align-left"></ha-icon></button><button id="alignCenter" class="icon-btn secondary" title="Zarovnat na stred" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:format-align-center"></ha-icon></button><button id="alignTop" class="icon-btn secondary" title="Zarovnat nahoru" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:format-align-top"></ha-icon></button><button id="alignMiddle" class="icon-btn secondary" title="Svisly stred" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:format-align-middle"></ha-icon></button><button id="deleteSelected" class="wide-action danger" ${this._selectedIds.length ? "" : "disabled"}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat vybrane</button><button id="clearDesign" class="wide-action danger"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Smazat vse</button></div><div class="panel-divider"></div><h2>Zobrazeni</h2><div class="action-grid"><button id="zoomIn" class="icon-btn secondary" title="Priblizit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button><button id="zoomOut" class="icon-btn secondary" title="Oddalit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button><button id="zoomFit" class="icon-btn secondary" title="Prizpusobit"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon></button><label class="wide-action pill muted"><input id="snap" type="checkbox" ${this._snap ? "checked" : ""}> Grid snap 5 px</label></div></div>
          <div class="card workspace-card"><div class="canvas-head"><div class="canvas-meta"><ha-icon icon="mdi:checkerboard"></ha-icon><strong>${size.width} x ${size.height}</strong><span>${this._orientation === "portrait" ? "Na vysku" : "Na sirku"}</span></div><div class="canvas-meta"><span>Zoom ${Math.round(this._zoom * 100)}%</span><span>${this._realPreview ? "Real eInk colors" : "RGB nahled"}</span></div></div><div class="workspace"><canvas id="editor" width="${size.width}" height="${size.height}" style="width:${Math.round(size.width * this._zoom)}px;height:${Math.round(size.height * this._zoom)}px"></canvas></div></div>
          <div class="card right properties-panel"><div class="section-title"><h2>Inspector</h2><span class="pill muted">${object ? this._escape(object.type) : "bez vyberu"}</span></div>${this._renderProperties(object)}</div>
        </div>
        <div class="card debug-card"><div class="section-title"><h2>Debug</h2><span class="pill muted">${result.ble_devices.length} BLE</span></div><pre>${this._escape((result.debug || []).join("\n"))}</pre><details><summary>Vsechna BLE zarizeni</summary>${this._renderBleDevices(result.ble_devices)}</details></div>
        </div>
        <div style="${this._activeTab === "gateways" ? "" : "display:none"}">
          <div class="status-grid">
            <div class="card status-tile"><div><div class="metric">DRATEK eInk gatewaye</div><div class="value">${this._gateways.length}</div></div><div class="status-icon"><ha-icon icon="mdi:router-wireless"></ha-icon></div></div>
            <div class="card status-tile"><div><div class="metric">Online</div><div class="value">${this._gateways.filter((gateway) => gateway.status && gateway.status.ok).length}</div></div><div class="status-icon"><ha-icon icon="mdi:lan-connect"></ha-icon></div></div>
            <div class="card status-tile"><div><div class="metric">Firmware</div><span class="pill muted">vlastni DRATEK gateway API</span></div><div class="status-icon"><ha-icon icon="mdi:chip"></ha-icon></div></div>
          </div>
          <div class="card"><div class="section-title"><h2>Vyhledani v siti</h2><div class="toolbar"><button id="discoverGateways" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:access-point-network"></ha-icon>${this._gatewayBusy ? "Pracuji..." : "Vyhledat gatewaye v siti"}</button><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Obnovit stav ulozenych</button></div></div>${this._renderDiscoveredGateways()}</div>
          ${this._renderGatewayResult()}
          <div class="card"><div class="section-title"><h2>Sprava opakovacu signalu</h2><span class="pill muted">ESP32 pres Wi-Fi</span></div>${this._renderGateways()}</div>
          <div class="card"><div class="section-title"><h2>Vytvorit gateway</h2><div class="toolbar"><button id="refreshSerialPorts" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:usb-port"></ha-icon>Nacist porty</button><button id="flashGateway" ${this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid ? "disabled" : ""}><ha-icon icon="mdi:chip"></ha-icon>Flashnout ESP32</button></div></div>${this._renderNoSerialPortsWarning()}<div class="row"><div class="field"><label>USB / serial port</label><select id="flashPort">${this._serialPorts.length ? this._serialPorts.map((port) => `<option value="${this._escape(port.device)}" ${port.device === this._flashForm.port ? "selected" : ""}>${this._escape(port.device)} - ${this._escape(port.description || port.name || "")}</option>`).join("") : `<option value="">Zadny port nenalezen</option>`}</select></div><div class="field"><label>Typ ESP32</label><select id="flashChip"><option value="esp32s3" ${this._flashForm.chip === "esp32s3" ? "selected" : ""}>ESP32-S3</option><option value="esp32" ${this._flashForm.chip === "esp32" ? "selected" : ""}>ESP32 / ESP32-WROOM</option></select></div></div><div class="row"><div class="field"><label>Hostname gatewaye</label><input id="flashHostname" value="${this._escape(this._flashForm.hostname)}" placeholder="dratek-eink-gateway"></div><div class="field"><label>Wi-Fi SSID</label><input id="flashSsid" value="${this._escape(this._flashForm.ssid)}" placeholder="Nazev Wi-Fi"></div></div><div class="row"><div class="field"><label>Wi-Fi heslo</label><input id="flashPassword" type="password" value="${this._escape(this._flashForm.password)}" placeholder="Heslo"></div><div class="field"><label>Firmware</label><input value="${this._flashForm.chip === "esp32s3" ? "ESP32-S3 build" : "ESP32 build"}" disabled></div></div>${this._renderFlashResult()}</div>
        </div>
      </div>
      ${this._renderSymbolDialog()}`;
    this._bind();
    this._paint();
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

  _renderDiscoveredGateways() {
    if (!this._gatewayDiscovery.length) {
      return `<div class="inspector-empty"><ha-icon icon="mdi:access-point-network"></ha-icon><p>Klikni na vyhledani. Gatewaye se hledaji pres mDNS sluzbu v lokalni siti.</p></div>`;
    }
    return `<div class="device-grid">${this._gatewayDiscovery.map((gateway, index) => `<div class="device-card">
      <div class="device-card-top"><div><strong>${this._escape(gateway.name || "DRATEK eInk gateway")}</strong><span>${this._escape(gateway.server || gateway.host)}</span></div><span class="pill good">Nalezena</span></div>
      <div class="device-meta"><span>IP ${this._escape(gateway.host || "-")}</span><span>FW ${this._escape(gateway.firmware || "-")}</span><span>ID ${this._escape(gateway.gateway_id || "-")}</span></div>
      <div class="toolbar"><button data-add-discovered-gateway="${index}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:plus-network-outline"></ha-icon>Pridat</button></div>
    </div>`).join("")}</div>`;
  }

  _renderFlashResult() {
    if (!this._flashResult) return "";
    const cls = this._flashResult.ok ? "good" : "bad";
    const message = this._flashResult.ok ? "ESP32 gateway byla flashnuta a Wi-Fi konfigurace odeslana." : `Flash selhal: ${this._flashResult.error || "neznamy problem"}`;
    const log = (this._flashResult.log || []).join("\n");
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(message)}</span>${log ? `<pre>${this._escape(log)}</pre>` : ""}</div>`;
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
      return `<div class="device-card">
        <div class="device-card-top"><div><strong>${this._escape(gateway.name)}</strong><span>${this._escape(gateway.host)}</span></div><span class="pill ${cls}">${text}</span></div>
        <div class="device-model">${this._escape(status.message || "")}</div>
        <div class="device-meta">
          <span>FW ${this._escape(status.firmware || "-")}</span>
          <span>IP ${this._escape(status.ip || "-")}</span>
          <span>RSSI ${this._escape(status.wifi_rssi ?? "-")}</span>
          <span>Heap ${this._escape(status.free_heap ?? "-")}</span>
        </div>
        <div class="toolbar"><button data-gateway-scan="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:radar"></ha-icon>BLE scan</button><button class="secondary" data-gateway-refresh="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Status</button><button class="danger" data-gateway-delete="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></div>
      </div>`;
    }).join("")}</div>`;
  }

  _renderGatewayDevices(devices) {
    return `<table><thead><tr><th>Adresa</th><th>Nazev</th><th>RSSI</th><th>DRATEK</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.address || "")}</td><td>${this._escape(device.name || "")}</td><td>${this._escape(device.rssi ?? "")}</td><td>${device.dratek ? "ano" : "ne"}</td></tr>`).join("")}</tbody></table>`;
  }

  _bind() {
    this.shadowRoot.querySelector("#scan").addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#scanDevicesTab")?.addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#discoverGateways")?.addEventListener("click", () => this._discoverGateways());
    this.shadowRoot.querySelector("#refreshGateways")?.addEventListener("click", () => this._loadGateways(true));
    this.shadowRoot.querySelectorAll("[data-add-discovered-gateway]").forEach((button) => button.addEventListener("click", () => this._addDiscoveredGateway(button.dataset.addDiscoveredGateway)));
    const syncFlashButton = () => {
      const button = this.shadowRoot.querySelector("#flashGateway");
      if (button) button.disabled = this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid;
    };
    this.shadowRoot.querySelector("#refreshSerialPorts")?.addEventListener("click", async () => { await this._loadSerialPorts(); this._render(); this._paint(); });
    this.shadowRoot.querySelector("#flashPort")?.addEventListener("change", (event) => { this._flashForm.port = event.target.value; syncFlashButton(); });
    this.shadowRoot.querySelector("#flashChip")?.addEventListener("change", (event) => { this._flashForm.chip = event.target.value; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#flashSsid")?.addEventListener("input", (event) => { this._flashForm.ssid = event.target.value; syncFlashButton(); });
    this.shadowRoot.querySelector("#flashPassword")?.addEventListener("input", (event) => { this._flashForm.password = event.target.value; });
    this.shadowRoot.querySelector("#flashHostname")?.addEventListener("input", (event) => { this._flashForm.hostname = event.target.value; });
    this.shadowRoot.querySelector("#flashGateway")?.addEventListener("click", () => this._flashGateway());
    this.shadowRoot.querySelectorAll("[data-gateway-scan]").forEach((button) => button.addEventListener("click", () => this._scanGateway(button.dataset.gatewayScan)));
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
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
      this._activeTab = button.dataset.tab;
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelectorAll("[data-select-device]").forEach((button) => button.addEventListener("click", async () => {
      await this._selectDevice(button.dataset.selectDevice);
      this._activeTab = "designer";
      this._render();
      this._paint();
    }));
    this.shadowRoot.querySelector("#sendDesign").addEventListener("click", () => this._sendDesign());
    this.shadowRoot.querySelector("#newProject").addEventListener("click", () => this._newProject());
    this.shadowRoot.querySelector("#saveProject").addEventListener("click", () => this._saveProject());
    this.shadowRoot.querySelector("#loadProject").addEventListener("click", () => this._loadSelectedProject());
    this.shadowRoot.querySelector("#deleteProject").addEventListener("click", () => this._deleteProject());
    this.shadowRoot.querySelector("#projectName").addEventListener("input", (event) => { this._projectName = event.target.value; this._scheduleDraftSave(); });
    this.shadowRoot.querySelector("#projectSelect").addEventListener("change", (event) => { this._selectedProjectId = event.target.value; const project = this._projects.find((item) => item.id === this._selectedProjectId); if (project) this._projectName = project.name; this._render(); this._paint(); });
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
    this.shadowRoot.querySelector("#zoomIn").addEventListener("click", () => { this._zoom = Math.min(4, this._zoom + 0.15); this._render(); });
    this.shadowRoot.querySelector("#zoomOut").addEventListener("click", () => { this._zoom = Math.max(0.35, this._zoom - 0.15); this._render(); });
    this.shadowRoot.querySelector("#zoomFit").addEventListener("click", () => { this._fitZoom(); this._render(); });
    this.shadowRoot.querySelector("#snap").addEventListener("change", (event) => { this._snap = event.target.checked; });
    this.shadowRoot.querySelector("#realPreview").addEventListener("change", (event) => { this._realPreview = event.target.checked; this._paint(); });
    this.shadowRoot.querySelector("#sendTest").addEventListener("click", () => this._sendTestText());
    this.shadowRoot.querySelector("#deviceSelect").addEventListener("change", (event) => this._selectDevice(event.target.value));
    this.shadowRoot.querySelectorAll("[data-orientation]").forEach((button) => button.addEventListener("click", () => this._setOrientation(button.dataset.orientation)));
    this.shadowRoot.querySelector("#displayTransform")?.addEventListener("change", (event) => this._setDisplayTransform(event.target.value));
    this.shadowRoot.querySelectorAll("[data-variable]").forEach((input) => input.addEventListener("input", () => {
      this._variables[input.dataset.variable] = input.value;
      this._paint();
      this._scheduleDraftSave();
    }));
    const canvas = this.shadowRoot.querySelector("#editor");
    canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    canvas.addEventListener("pointermove", (event) => this._onPointerMove(event));
    canvas.addEventListener("pointerup", () => this._onPointerUp());
    canvas.addEventListener("pointerleave", () => this._onPointerUp());
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => input.addEventListener("input", (event) => this._readProperties(event)));
  }

  _renderProperties(object) {
    if (!object) {
      return `<div class="inspector-empty"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><p>${this._selectedIds.length > 1 ? `Vybrano ${this._selectedIds.length} objektu.` : "Vyber objekt v navrhu."}</p></div>`;
    }
    const common = `<h2>Pozice</h2><div class="row"><div class="field"><label>X</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>Sirka</label><input data-prop="w" type="number" value="${object.w || 1}"></div><div class="field"><label>Vyska</label><input data-prop="h" type="number" value="${object.h || 1}"></div></div><h2>Vzhled</h2><div class="row"><div class="field"><label>Rotace</label><select data-prop="rotation"><option ${object.rotation === 0 ? "selected" : ""}>0</option><option ${object.rotation === 90 ? "selected" : ""}>90</option><option ${object.rotation === 180 ? "selected" : ""}>180</option><option ${object.rotation === 270 ? "selected" : ""}>270</option></select></div><div class="field"><label>Barva</label><select data-prop="color"><option value="black" ${object.color === "black" ? "selected" : ""}>Cerna</option><option value="red" ${object.color === "red" ? "selected" : ""}>Cervena</option><option value="white" ${object.color === "white" ? "selected" : ""}>Bila</option></select></div></div>`;
    if (object.type === "text") return `${common}<div class="field"><label>Text</label><input data-prop="text" value="${this._escape(object.text)}"></div><div class="row"><div class="field"><label>Velikost textu</label><input data-prop="fontSize" type="number" min="${this._textMinFontSize(object)}" value="${object.fontSize}"></div><div class="field"><label>Font pro eInk</label><input value="Arial" disabled></div></div><div class="row"><div class="field"><label>Zarovnani</label><select data-prop="textAlign"><option value="left" ${object.textAlign === "left" ? "selected" : ""}>Vlevo</option><option value="center" ${!object.textAlign || object.textAlign === "center" ? "selected" : ""}>Stred</option><option value="right" ${object.textAlign === "right" ? "selected" : ""}>Vpravo</option></select></div><div class="field"><label>Svisle</label><select data-prop="verticalAlign"><option value="top" ${object.verticalAlign === "top" ? "selected" : ""}>Nahore</option><option value="middle" ${!object.verticalAlign || object.verticalAlign === "middle" ? "selected" : ""}>Stred</option><option value="bottom" ${object.verticalAlign === "bottom" ? "selected" : ""}>Dole</option></select></div></div><label><input data-prop="autoFit" type="checkbox" ${object.autoFit !== false ? "checked" : ""}> Prizpusobit velikost podle boxu</label><label><input data-prop="bold" type="checkbox" ${object.bold ? "checked" : ""}> Bold</label><label><input data-prop="variable" type="checkbox" ${object.variable ? "checked" : ""}> Promenny text</label><div class="field"><label>Nazev promenne</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="napr_teplota"></div>`;
    if (object.type === "rect") return `${common}<div class="row"><div class="field"><label>Vypln</label><select data-prop="fill"><option value="none" ${object.fill === "none" ? "selected" : ""}>Bez vyplne</option><option value="black" ${object.fill === "black" ? "selected" : ""}>Cerna</option><option value="red" ${object.fill === "red" ? "selected" : ""}>Cervena</option><option value="white" ${object.fill === "white" ? "selected" : ""}>Bila</option></select></div><div class="field"><label>Ramecek</label><select data-prop="stroke"><option value="none" ${object.stroke === "none" ? "selected" : ""}>Bez ramecku</option><option value="black" ${object.stroke === "black" ? "selected" : ""}>Cerny</option><option value="red" ${object.stroke === "red" ? "selected" : ""}>Cerveny</option></select></div></div><div class="field"><label>Sila ramecku</label><input data-prop="strokeWidth" type="number" value="${object.strokeWidth || 0}"></div>`;
    if (object.type === "line") return `<div class="row"><div class="field"><label>X1</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y1</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>X2</label><input data-prop="x2" type="number" value="${object.x2}"></div><div class="field"><label>Y2</label><input data-prop="y2" type="number" value="${object.y2}"></div></div><div class="row"><div class="field"><label>Barva</label><select data-prop="color"><option value="black" ${object.color === "black" ? "selected" : ""}>Cerna</option><option value="red" ${object.color === "red" ? "selected" : ""}>Cervena</option></select></div><div class="field"><label>Sila</label><input data-prop="strokeWidth" type="number" value="${object.strokeWidth || 2}"></div></div>`;
    if (object.type === "barcode" || object.type === "qr") return `${common}<div class="field"><label>${object.type === "qr" ? "QR data" : "EAN data"}</label><input data-prop="text" value="${this._escape(object.text)}"></div>`;
    return `${common}<label><input data-prop="keepRatio" type="checkbox" ${object.keepRatio ? "checked" : ""}> Zachovat pomer stran</label>`;
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
      else if (["x", "y", "x2", "y2", "w", "h", "rotation", "fontSize", "minFontSize", "strokeWidth"].includes(key)) object[key] = Number(input.value);
      else object[key] = input.value;
    });
    if (object.type === "text") {
      object.minFontSize = this._textMinFontSize(object);
      object.fontSize = Math.max(object.minFontSize, Number(object.fontSize || object.minFontSize));
      if (object.fontSize !== oldFontSize) {
        const lineCount = String(object.text || "").split("\n").length || 1;
        object.h = Math.max(Number(object.h || 1), Math.ceil(object.fontSize * 1.18 * lineCount));
      }
      if (object.variable) {
        object.variableName = this._uniqueVariableName(object.variableName || object.text || "variable", object.id);
        if (this._variables[object.variableName] === undefined) this._variables[object.variableName] = object.text || "";
      } else if (object.variableName) {
        delete this._variables[object.variableName];
        object.variableName = "";
      }
      if (changedProp === "variable" || changedProp === "variableName" || wasVariable !== !!object.variable || oldVariableName !== (object.variableName || "")) {
        this._render();
      }
    }
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
    if (!canvas) return;
    this._drawScene(canvas.getContext("2d"), canvas.width, canvas.height, true);
  }

  _drawScene(ctx, width, height, withSelection) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    for (const object of this._objects) this._drawObject(ctx, object);
    if (this._realPreview) this._applyEinkPreview(ctx, width, height);
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
    else if (object.type === "image") this._drawImage(ctx, object, box);
    ctx.restore();
  }

  _drawText(ctx, object, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = this._color(object.color);
    const value = object.variable && object.variableName
      ? (this._variables[object.variableName] ?? object.text ?? "")
      : (object.text || "");
    const lines = String(value).split("\n");
    const family = "Arial";
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
    ctx.fillStyle = "#fff";
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
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = this._color(object.color);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        if (qr.isDark(y, x)) ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
      }
    }
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
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(text)}</span>${(this._sendResult.log || []).length ? `<pre>${this._escape(this._sendResult.log.join("\n"))}</pre>` : ""}</div>`;
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
        <div class="section-title"><h2>Vlozit symbol</h2><button id="closeSymbols" class="secondary"><ha-icon icon="mdi:close"></ha-icon>Zavrit</button></div>
        <div class="symbol-search"><input id="symbolSearch" value="${this._escape(this._symbolSearch)}" placeholder="Hledat symbol, napriklad wifi, teplota, svetlo..."><span class="pill muted">${symbols.length} symbolu</span></div>
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

  _renderVariables() {
    const variables = this._variableDefs();
    if (!variables.length) return "";
    return `<div class="card" style="margin-bottom:12px"><h2>Promenne navrhu</h2><table class="variable-table"><thead><tr><th>Nazev</th><th>Default</th><th>Hodnota pro odeslani</th></tr></thead><tbody>${variables.map((variable) => `<tr><td><strong>${this._escape(variable.name)}</strong></td><td>${this._escape(variable.defaultValue)}</td><td><input data-variable="${this._escape(variable.name)}" value="${this._escape(variable.value)}"></td></tr>`).join("")}</tbody></table></div>`;
  }

  _renderTransformSelector(device) {
    if (!this._isPe29Device(device)) return "";
    const options = this._transformOptions()
      .map(([value, label]) => `<option value="${this._escape(value)}" ${this._displayTransform === value ? "selected" : ""}>${this._escape(label)}</option>`)
      .join("");
    return `<div class="transform-box"><div class="field"><label>Mapovani 2,9&quot; displeje</label><select id="displayTransform">${options}</select></div><small>Pokud je obraz na PE29 posunuty, otoceny nebo zrcadleny, zmen tuto volbu a znovu odesli navrh. Volba se uklada ke konkretni BLE adrese displeje.</small></div>`;
  }

  _renderDeviceCards(devices, selectedAddress) {
    if (!devices.length) {
      return `<div class="empty-state"><div class="empty-icon">DE</div><h2>Zadne DRATEK eInk displeje</h2><p>Spust scan a over, ze je v Home Assistantu aktivni Bluetooth integrace nebo Bluetooth proxy.</p></div>`;
    }
    return `<div class="device-grid">${devices.map((device) => {
      const selected = device.address === selectedAddress;
      const battery = Number(device.battery);
      const rssi = Number(device.rssi);
      return `<button class="device-card ${selected ? "selected" : ""}" data-select-device="${this._escape(device.address)}">
        <div class="device-card-top"><div><strong>${this._escape(device.physical_code)}</strong><span>${this._escape(device.name || device.address)}</span></div><span class="pill ${selected ? "good" : "muted"}">${selected ? "Vybrano" : "Vybrat"}</span></div>
        <div class="device-model">${this._escape(device.model)}<br><span>SDK ${this._escape(device.sdk_type)} / raw ${this._escape(device.raw_type)}</span></div>
        <div class="device-meters">
          <div class="meter-block"><label>Baterie</label><div class="battery ${this._batteryClass(battery)}"><span style="width:${this._batteryPercent(battery)}%"></span></div><strong>${Number.isFinite(battery) ? `${battery}%` : "-"}</strong></div>
          <div class="meter-block"><label>Signal</label>${this._renderSignalBars(rssi)}<strong>${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
        </div>
        <div class="device-meta"><span>SW ${this._escape(device.sw)}</span><span>HW ${this._escape(device.hw)}</span><span>${this._escape(device.profile)}</span><span>${device.partial_update ? "Partial update" : "Full update"}</span></div>
      </button>`;
    }).join("")}</div>`;
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

  _signalLevel(rssi) {
    if (!Number.isFinite(rssi)) return 0;
    if (rssi >= -55) return 4;
    if (rssi >= -68) return 3;
    if (rssi >= -80) return 2;
    return 1;
  }

  _renderSignalBars(rssi) {
    const level = this._signalLevel(rssi);
    return `<div class="signal-bars level-${level}">${[1, 2, 3, 4].map((bar) => `<span class="${bar <= level ? "on" : ""}"></span>`).join("")}</div>`;
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
