import qrcode from "./qrcode-generator.js";

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
    this._realPreview = true;
    this._zoom = 1;
    this._snap = true;
    this._projects = [];
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._variables = {};
    this._draftSaveTimer = null;
    this._loadingDraft = false;
    this._restoringDraft = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._scan();
      this._loadProjects();
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

  _displaySize(device = this._device()) {
    const sdk = device ? Number(device.sdk_type) : 75;
    if (sdk === 75) return { width: 400, height: 300 };
    if (sdk === 11) return { width: 212, height: 104 };
    if (sdk === 296) return { width: 296, height: 128 };
    return { width: 250, height: 128 };
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
      width: size.width,
      height: size.height,
      variables: {},
      objects: [],
    };
  }

  _applyDraft(draft) {
    this._restoringDraft = true;
    const device = this._device();
    const size = this._displaySize(device);
    const source = draft || this._emptyDeviceDraft(device);
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

  _nextObjectId() {
    const ids = this._objects
      .map((object) => String(object.id || "").match(/^obj-(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return ids.length ? Math.max(...ids) + 1 : this._objects.length + 1;
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

  _addObject(type) {
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
      bold: false,
      variable: false,
      variableName: "",
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
    this._objects = [];
    this._selectedIds = [];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _moveLayer(direction) {
    if (!this._selectedIds.length) return;
    const selected = new Set(this._selectedIds);
    const moving = this._objects.filter((object) => selected.has(object.id));
    const rest = this._objects.filter((object) => !selected.has(object.id));
    this._objects = direction === "front" ? [...rest, ...moving] : [...moving, ...rest];
    this._paint();
    this._scheduleDraftSave();
  }

  _rotateSelected() {
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.rotation = (Number(object.rotation || 0) + 90) % 360;
    }
    this._render();
    this._paint();
    this._scheduleDraftSave();
  }

  _mirrorSelected() {
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.flipH = !object.flipH;
    }
    this._paint();
    this._scheduleDraftSave();
  }

  _alignSelected(mode) {
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
      const size = this._displaySize();
      if (project.width !== size.width || project.height !== size.height) {
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
        image: canvas.toDataURL("image/png"),
      });
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
        :host{display:block;min-height:100%;color:var(--primary-text-color);background:var(--primary-background-color);font-family:Roboto,Arial,sans-serif}
        .page{max-width:1520px;margin:0 auto;padding:18px}
        .topbar,.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.topbar{justify-content:space-between;margin-bottom:12px}
        .brand{display:flex;align-items:center;gap:12px}.logo{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(135deg,#0f766e,#2563eb);color:#fff;font-weight:900;letter-spacing:.5px}
        h1{margin:0;font-size:24px;font-weight:800}h2{margin:0 0 12px;font-size:13px;text-transform:uppercase;color:var(--secondary-text-color);letter-spacing:.08em}.subtitle{color:var(--secondary-text-color);font-size:13px}
        button,select,input{font:inherit}button{border:0;border-radius:7px;background:var(--primary-color);color:var(--text-primary-color,#fff);padding:9px 12px;font-weight:750;cursor:pointer;box-shadow:0 1px 0 rgba(0,0,0,.08)}button:hover:not(:disabled){filter:brightness(1.03)}button:disabled{opacity:.5;cursor:not-allowed}
        .primary-action{display:inline-flex;align-items:center;gap:8px}.primary-action .mini-ico{font-size:16px}
        .secondary{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.danger{background:#b3261e;color:#fff}
        .card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px;box-sizing:border-box;box-shadow:0 8px 28px rgba(0,0,0,.06)}.metric{color:var(--secondary-text-color);font-size:12px;margin-bottom:5px}.value{font-size:24px;font-weight:850}
        .pill{display:inline-flex;min-height:26px;align-items:center;border-radius:999px;padding:0 10px;font-size:12px;font-weight:800}.good{background:#d7f5df;color:#0b6b2a}.warn{background:#fff2c7;color:#775500}.bad{background:#ffd9d4;color:#9d1c0f}.muted{background:var(--secondary-background-color);color:var(--secondary-text-color)}
        .status-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:12px}.projectbar{display:grid;grid-template-columns:minmax(180px,280px) minmax(180px,320px) auto;gap:8px;align-items:center;margin-bottom:12px}
        .editor-shell{display:grid;grid-template-columns:270px minmax(0,1fr) 340px;gap:12px;align-items:start}.left,.right{position:sticky;top:12px}.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.tool-icon{min-height:78px;display:grid;grid-template-rows:34px auto;place-items:center;text-align:center;padding:10px 6px;border:1px solid var(--divider-color);background:linear-gradient(180deg,var(--card-background-color),var(--secondary-background-color));color:var(--primary-text-color)}.tool-icon .ico{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:rgba(37,99,235,.11);color:#2563eb;font-size:19px;font-weight:900}.tool-icon .txt{font-size:11px;font-weight:800;color:var(--secondary-text-color);text-transform:uppercase}.tool-icon:hover:not(:disabled){border-color:var(--primary-color)}
        .action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.icon-btn{min-height:42px;padding:7px;font-size:16px;display:grid;place-items:center}.wide-action{grid-column:span 4;font-size:13px}.panel-divider{height:1px;background:var(--divider-color);margin:14px 0}.properties-panel{max-height:calc(100vh - 120px);overflow:auto}
        .workspace{min-height:560px;overflow:auto;display:grid;place-items:center;background:linear-gradient(45deg,rgba(127,127,127,.08) 25%,transparent 25%),linear-gradient(-45deg,rgba(127,127,127,.08) 25%,transparent 25%);background-size:18px 18px;border-radius:8px;border:1px solid var(--divider-color);padding:28px}
        canvas{background:#fff;box-shadow:0 18px 46px rgba(0,0,0,.22);touch-action:none}.field{display:grid;gap:5px;margin-bottom:10px}.field label{color:var(--secondary-text-color);font-size:12px;font-weight:750}.field input,.field select,.projectbar input,.projectbar select,#deviceSelect{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:7px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top}th{color:var(--secondary-text-color);font-size:11px;text-transform:uppercase}pre{overflow:auto;background:var(--secondary-background-color);border-radius:8px;padding:10px;font-size:12px;line-height:1.45}.send-result{margin-top:10px}.variable-table input{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);padding:7px}
        @media(max-width:1100px){.editor-shell,.status-grid,.projectbar{grid-template-columns:1fr}.left,.right{position:static}}
      </style>
      <div class="page">
        <div class="topbar">
          <div class="brand"><div class="logo">DE</div><div><h1>DRATEK eInk</h1><div class="subtitle">Profesionalni editor a Bluetooth diagnostika</div></div></div>
          <div class="toolbar"><button id="scan" class="secondary" ${this._loading ? "disabled" : ""}>${this._loading ? "Vyhledavam..." : "Vyhledat zarizeni"}</button><button id="sendDesign" class="primary-action" ${!device || this._sending ? "disabled" : ""}><span class="mini-ico">&#8593;</span>${this._sending ? "Odesilam..." : "Odeslat navrh"}</button></div>
        </div>
        <div class="status-grid"><div class="card"><div class="metric">Stav</div><span class="pill ${status.cls}">${this._escape(status.text)}</span></div><div class="card"><div class="metric">Bluetooth adaptery / proxy</div><div class="value">${result.scanner_count}</div></div><div class="card"><div class="metric">BLE zarizeni v dosahu</div><div class="value">${result.ble_count}</div></div></div>
        <div class="card projectbar"><input id="projectName" value="${this._escape(this._projectName)}" placeholder="Nazev navrhu"><select id="projectSelect"><option value="">Novy / neulozeny navrh</option>${this._projects.map((project) => `<option value="${this._escape(project.id)}" ${project.id === this._selectedProjectId ? "selected" : ""}>${this._escape(project.name)} (${project.width}x${project.height})</option>`).join("")}</select><div class="toolbar"><button id="newProject" class="secondary">Novy</button><button id="saveProject">Ulozit do HA</button><button id="loadProject" class="secondary" ${this._selectedProjectId ? "" : "disabled"}>Nacist</button><button id="deleteProject" class="danger" ${this._selectedProjectId ? "" : "disabled"}>Smazat</button></div></div>
        <div class="card" style="margin-bottom:12px"><div class="toolbar"><label>Displej</label><select id="deviceSelect">${result.devices.map((item) => `<option value="${this._escape(item.address)}" ${item.address === (device && device.address) ? "selected" : ""}>${this._escape(item.physical_code)} - ${this._escape(item.model)} - RSSI ${this._escape(item.rssi)}</option>`).join("")}</select><span class="pill muted">${size.width} x ${size.height}</span><button id="sendTest" class="secondary" ${!device ? "disabled" : ""}>Odeslat dratek.cz</button><label><input id="realPreview" type="checkbox" ${this._realPreview ? "checked" : ""}> Real eInk colors</label></div>${this._renderSendResult()}</div>
        ${this._renderVariables()}
        <div class="editor-shell">
          <div class="card left"><h2>Nastroje</h2><div class="tool-grid"><button class="tool-icon" data-add="text" title="Text"><span class="ico">T</span><span class="txt">Text</span></button><button class="tool-icon" data-add="rect" title="Rectangle"><span class="ico">&#9633;</span><span class="txt">Rect</span></button><button class="tool-icon" data-add="line" title="Cara"><span class="ico">&#9585;</span><span class="txt">Cara</span></button><button class="tool-icon" data-add="barcode" title="EAN"><span class="ico">&#9776;</span><span class="txt">EAN</span></button><button class="tool-icon" data-add="qr" title="QR"><span class="ico">&#9638;</span><span class="txt">QR</span></button><button id="addImage" class="tool-icon secondary" title="Obrazek"><span class="ico">&#9729;</span><span class="txt">Image</span></button><input id="imageFile" type="file" accept="image/*" hidden></div><div class="panel-divider"></div><h2>Upravy</h2><div class="action-grid"><button id="duplicateSelected" class="icon-btn secondary" title="Duplikovat" ${this._selectedIds.length ? "" : "disabled"}>&#10697;</button><button id="rotateSelected" class="icon-btn secondary" title="Otocit 90" ${this._selectedIds.length ? "" : "disabled"}>&#8635;</button><button id="mirrorSelected" class="icon-btn secondary" title="Zrcadlit" ${this._selectedIds.length ? "" : "disabled"}>&#8644;</button><button id="layerFront" class="icon-btn secondary" title="Do popredi" ${this._selectedIds.length ? "" : "disabled"}>&#8679;</button><button id="layerBack" class="icon-btn secondary" title="Do pozadi" ${this._selectedIds.length ? "" : "disabled"}>&#8681;</button><button id="alignLeft" class="icon-btn secondary" title="Zarovnat vlevo" ${this._selectedIds.length ? "" : "disabled"}>&#8676;</button><button id="alignCenter" class="icon-btn secondary" title="Zarovnat na stred" ${this._selectedIds.length ? "" : "disabled"}>&#8596;</button><button id="alignTop" class="icon-btn secondary" title="Zarovnat nahoru" ${this._selectedIds.length ? "" : "disabled"}>&#8673;</button><button id="alignMiddle" class="icon-btn secondary" title="Svisly stred" ${this._selectedIds.length ? "" : "disabled"}>&#8597;</button><button id="deleteSelected" class="wide-action danger" ${this._selectedIds.length ? "" : "disabled"}>Smazat vybrane</button><button id="clearDesign" class="wide-action danger">Smazat vse</button></div><div class="panel-divider"></div><h2>Zobrazeni</h2><div class="action-grid"><button id="zoomIn" class="icon-btn secondary" title="Priblizit">+</button><button id="zoomOut" class="icon-btn secondary" title="Oddalit">-</button><button id="zoomFit" class="icon-btn secondary" title="Prizpusobit">&#9633;</button><label class="wide-action"><input id="snap" type="checkbox" ${this._snap ? "checked" : ""}> Grid snap 5 px</label></div></div>
          <div class="workspace"><canvas id="editor" width="${size.width}" height="${size.height}" style="width:${Math.round(size.width * this._zoom)}px;height:${Math.round(size.height * this._zoom)}px"></canvas></div>
          <div class="card right properties-panel"><h2>Vlastnosti objektu</h2>${this._renderProperties(object)}</div>
        </div>
        <div class="card" style="margin-top:12px"><h2>Debug</h2><pre>${this._escape((result.debug || []).join("\n"))}</pre><details><summary>Vsechna BLE zarizeni (${result.ble_devices.length})</summary>${this._renderBleDevices(result.ble_devices)}</details></div>
      </div>`;
    this._bind();
    this._paint();
    this._scheduleDraftSave();
  }

  _bind() {
    this.shadowRoot.querySelector("#scan").addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#sendDesign").addEventListener("click", () => this._sendDesign());
    this.shadowRoot.querySelector("#newProject").addEventListener("click", () => this._newProject());
    this.shadowRoot.querySelector("#saveProject").addEventListener("click", () => this._saveProject());
    this.shadowRoot.querySelector("#loadProject").addEventListener("click", () => this._loadSelectedProject());
    this.shadowRoot.querySelector("#deleteProject").addEventListener("click", () => this._deleteProject());
    this.shadowRoot.querySelector("#projectName").addEventListener("input", (event) => { this._projectName = event.target.value; this._scheduleDraftSave(); });
    this.shadowRoot.querySelector("#projectSelect").addEventListener("change", (event) => { this._selectedProjectId = event.target.value; const project = this._projects.find((item) => item.id === this._selectedProjectId); if (project) this._projectName = project.name; this._render(); this._paint(); });
    this.shadowRoot.querySelector("#addImage").addEventListener("click", () => this.shadowRoot.querySelector("#imageFile").click());
    this.shadowRoot.querySelector("#imageFile").addEventListener("change", (event) => this._addImage(event.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => this._addObject(button.dataset.add)));
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
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => input.addEventListener("input", () => this._readProperties()));
  }

  _renderProperties(object) {
    if (!object) {
      return `<p class="muted" style="padding:10px;border-radius:8px">${this._selectedIds.length > 1 ? `Vybrano ${this._selectedIds.length} objektu.` : "Vyber objekt v navrhu."}</p>`;
    }
    const common = `<div class="row"><div class="field"><label>X</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>Sirka</label><input data-prop="w" type="number" value="${object.w || 1}"></div><div class="field"><label>Vyska</label><input data-prop="h" type="number" value="${object.h || 1}"></div></div><div class="row"><div class="field"><label>Rotace</label><select data-prop="rotation"><option ${object.rotation === 0 ? "selected" : ""}>0</option><option ${object.rotation === 90 ? "selected" : ""}>90</option><option ${object.rotation === 180 ? "selected" : ""}>180</option><option ${object.rotation === 270 ? "selected" : ""}>270</option></select></div><div class="field"><label>Barva</label><select data-prop="color"><option value="black" ${object.color === "black" ? "selected" : ""}>Cerna</option><option value="red" ${object.color === "red" ? "selected" : ""}>Cervena</option><option value="white" ${object.color === "white" ? "selected" : ""}>Bila</option></select></div></div>`;
    if (object.type === "text") return `${common}<div class="field"><label>Text</label><input data-prop="text" value="${this._escape(object.text)}"></div><div class="row"><div class="field"><label>Velikost textu</label><input data-prop="fontSize" type="number" value="${object.fontSize}"></div><div class="field"><label>Font</label><select data-prop="fontFamily"><option value="Arial" ${object.fontFamily === "Arial" ? "selected" : ""}>Arial</option><option value="Verdana" ${object.fontFamily === "Verdana" ? "selected" : ""}>Verdana</option><option value="Tahoma" ${object.fontFamily === "Tahoma" ? "selected" : ""}>Tahoma</option><option value="Georgia" ${object.fontFamily === "Georgia" ? "selected" : ""}>Georgia</option><option value="Courier New" ${object.fontFamily === "Courier New" ? "selected" : ""}>Courier</option></select></div></div><label><input data-prop="bold" type="checkbox" ${object.bold ? "checked" : ""}> Bold</label><label><input data-prop="variable" type="checkbox" ${object.variable ? "checked" : ""}> Promenny text</label><div class="field"><label>Nazev promenne</label><input data-prop="variableName" value="${this._escape(object.variableName || "")}" placeholder="napr_teplota"></div>`;
    if (object.type === "rect") return `${common}<div class="row"><div class="field"><label>Vypln</label><select data-prop="fill"><option value="none" ${object.fill === "none" ? "selected" : ""}>Bez vyplne</option><option value="black" ${object.fill === "black" ? "selected" : ""}>Cerna</option><option value="red" ${object.fill === "red" ? "selected" : ""}>Cervena</option><option value="white" ${object.fill === "white" ? "selected" : ""}>Bila</option></select></div><div class="field"><label>Ramecek</label><select data-prop="stroke"><option value="none" ${object.stroke === "none" ? "selected" : ""}>Bez ramecku</option><option value="black" ${object.stroke === "black" ? "selected" : ""}>Cerny</option><option value="red" ${object.stroke === "red" ? "selected" : ""}>Cerveny</option></select></div></div><div class="field"><label>Sila ramecku</label><input data-prop="strokeWidth" type="number" value="${object.strokeWidth || 0}"></div>`;
    if (object.type === "line") return `<div class="row"><div class="field"><label>X1</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y1</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>X2</label><input data-prop="x2" type="number" value="${object.x2}"></div><div class="field"><label>Y2</label><input data-prop="y2" type="number" value="${object.y2}"></div></div><div class="row"><div class="field"><label>Barva</label><select data-prop="color"><option value="black" ${object.color === "black" ? "selected" : ""}>Cerna</option><option value="red" ${object.color === "red" ? "selected" : ""}>Cervena</option></select></div><div class="field"><label>Sila</label><input data-prop="strokeWidth" type="number" value="${object.strokeWidth || 2}"></div></div>`;
    if (object.type === "barcode" || object.type === "qr") return `${common}<div class="field"><label>${object.type === "qr" ? "QR data" : "EAN data"}</label><input data-prop="text" value="${this._escape(object.text)}"></div>`;
    return `${common}<label><input data-prop="keepRatio" type="checkbox" ${object.keepRatio ? "checked" : ""}> Zachovat pomer stran</label>`;
  }

  _readProperties() {
    const object = this._selectedObject();
    if (!object) return;
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => {
      const key = input.dataset.prop;
      if (input.type === "checkbox") object[key] = input.checked;
      else if (["x", "y", "x2", "y2", "w", "h", "rotation", "fontSize", "strokeWidth"].includes(key)) object[key] = Number(input.value);
      else object[key] = input.value;
    });
    if (object.type === "text") {
      if (object.variable) {
        object.variableName = this._uniqueVariableName(object.variableName || object.text || "variable", object.id);
        if (this._variables[object.variableName] === undefined) this._variables[object.variableName] = object.text || "";
      } else if (object.variableName) {
        delete this._variables[object.variableName];
        object.variableName = "";
      }
      this._render();
    }
    this._paint();
    this._scheduleDraftSave();
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
    ctx.fillStyle = this._color(object.color);
    const family = object.fontFamily || "Arial";
    const weight = object.bold ? "700 " : "";
    ctx.font = `${weight}${object.fontSize || 24}px ${family}, sans-serif`;
    ctx.textBaseline = "top";
    const value = object.variable && object.variableName
      ? (this._variables[object.variableName] ?? object.text ?? "")
      : (object.text || "");
    String(value).split("\n").forEach((line, index) => ctx.fillText(line, 0, index * (object.fontSize || 24) * 1.18, box.w));
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

  _renderVariables() {
    const variables = this._variableDefs();
    if (!variables.length) return "";
    return `<div class="card" style="margin-bottom:12px"><h2>Promenne navrhu</h2><table class="variable-table"><thead><tr><th>Nazev</th><th>Default</th><th>Hodnota pro odeslani</th></tr></thead><tbody>${variables.map((variable) => `<tr><td><strong>${this._escape(variable.name)}</strong></td><td>${this._escape(variable.defaultValue)}</td><td><input data-variable="${this._escape(variable.name)}" value="${this._escape(variable.value)}"></td></tr>`).join("")}</tbody></table></div>`;
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

customElements.define("dratek-eink-panel", DratekEinkPanel);
