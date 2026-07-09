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
      if (!this._selectedDeviceAddress && this._result.devices.length) {
        this._selectedDeviceAddress = this._result.devices[0].address;
        this._fitZoom();
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
    return { width: 250, height: 128 };
  }

  _fitZoom() {
    const size = this._displaySize();
    this._zoom = Math.min(2.4, Math.max(0.55, Math.min(820 / size.width, 460 / size.height)));
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
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  _deleteSelected() {
    const selected = new Set(this._selectedIds);
    this._objects = this._objects.filter((object) => !selected.has(object.id));
    this._selectedIds = [];
    this._render();
    this._paint();
  }

  _duplicateSelected() {
    const selected = new Set(this._selectedIds);
    const copies = this._objects.filter((object) => selected.has(object.id)).map(({ _img, ...object }) => ({
      ...structuredClone(object),
      id: `obj-${this._nextId++}`,
      x: this._snapValue((object.x || 0) + 10),
      y: this._snapValue((object.y || 0) + 10),
      x2: object.x2 === undefined ? undefined : this._snapValue(object.x2 + 10),
      y2: object.y2 === undefined ? undefined : this._snapValue(object.y2 + 10),
    }));
    this._objects.push(...copies);
    this._selectedIds = copies.map((object) => object.id);
    this._render();
    this._paint();
  }

  _newProject() {
    if (this._objects.length && !confirm("Vytvorit novy prazdny navrh?")) return;
    this._objects = [];
    this._selectedIds = [];
    this._selectedProjectId = "";
    this._projectName = "Novy navrh";
    this._nextId = 1;
    this._render();
    this._paint();
  }

  _clearDesign() {
    if (!this._objects.length || !confirm("Smazat vsechny objekty?")) return;
    this._objects = [];
    this._selectedIds = [];
    this._render();
    this._paint();
  }

  _moveLayer(direction) {
    if (!this._selectedIds.length) return;
    const selected = new Set(this._selectedIds);
    const moving = this._objects.filter((object) => selected.has(object.id));
    const rest = this._objects.filter((object) => !selected.has(object.id));
    this._objects = direction === "front" ? [...rest, ...moving] : [...moving, ...rest];
    this._paint();
  }

  _rotateSelected() {
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.rotation = (Number(object.rotation || 0) + 90) % 360;
    }
    this._render();
    this._paint();
  }

  _mirrorSelected() {
    for (const object of this._objects.filter((item) => this._selectedIds.includes(item.id))) {
      object.flipH = !object.flipH;
    }
    this._paint();
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
  }

  _snapValue(value) {
    return this._snap ? Math.round(value / 5) * 5 : Math.round(value);
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
    return this._handles(box).find((handle) => Math.abs(point.x - handle.x) <= 8 / this._zoom && Math.abs(point.y - handle.y) <= 8 / this._zoom);
  }

  _onPointerDown(event) {
    const point = this._canvasPoint(event);
    const object = this._hitTest(point);
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
    const handle = this._handleAt(point, object);
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
    if (!this._drag) return;
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
    this._drag = null;
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
      if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
      else w = h * ratio;
    }
    object.x = this._snapValue(x);
    object.y = this._snapValue(y);
    object.w = this._snapValue(w);
    object.h = this._snapValue(h);
  }

  _projectPayload() {
    const device = this._device();
    const size = this._displaySize(device);
    return {
      id: this._selectedProjectId || undefined,
      version: 1,
      name: this._projectName || "DRATEK eInk projekt",
      sdk_type: device ? Number(device.sdk_type) : 75,
      width: size.width,
      height: size.height,
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
      this._projectName = project.name || "DRATEK eInk projekt";
      this._selectedIds = [];
      this._nextId = this._objects.length + 1;
      this._render();
      this._paint();
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
        .page{max-width:1480px;margin:0 auto;padding:18px}
        .topbar,.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.topbar{justify-content:space-between;margin-bottom:12px}
        .brand{display:flex;align-items:center;gap:12px}.logo{width:42px;height:42px;border-radius:8px;display:grid;place-items:center;background:var(--primary-color);color:#fff;font-weight:800}
        h1{margin:0;font-size:24px;font-weight:700}h2{margin:0 0 12px;font-size:15px}.subtitle{color:var(--secondary-text-color);font-size:13px}
        button,select,input{font:inherit}button{border:0;border-radius:6px;background:var(--primary-color);color:var(--text-primary-color,#fff);padding:9px 12px;font-weight:650;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}
        .secondary{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color)}.danger{background:#b3261e;color:#fff}
        .card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:14px;box-sizing:border-box}.metric{color:var(--secondary-text-color);font-size:12px;margin-bottom:5px}.value{font-size:24px;font-weight:800}
        .pill{display:inline-flex;min-height:26px;align-items:center;border-radius:999px;padding:0 10px;font-size:12px;font-weight:800}.good{background:#d7f5df;color:#0b6b2a}.warn{background:#fff2c7;color:#775500}.bad{background:#ffd9d4;color:#9d1c0f}.muted{background:var(--secondary-background-color);color:var(--secondary-text-color)}
        .status-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:12px}.projectbar{display:grid;grid-template-columns:minmax(180px,280px) minmax(180px,320px) auto;gap:8px;align-items:center;margin-bottom:12px}
        .editor-shell{display:grid;grid-template-columns:250px minmax(0,1fr) 320px;gap:12px;align-items:start}.left,.right{position:sticky;top:12px}.tool-list{display:grid;gap:8px}.tool-list button{text-align:left}
        .workspace{min-height:500px;overflow:auto;display:grid;place-items:center;background:linear-gradient(45deg,var(--secondary-background-color) 25%,transparent 25%),linear-gradient(-45deg,var(--secondary-background-color) 25%,transparent 25%);background-size:18px 18px;border-radius:8px;border:1px solid var(--divider-color);padding:24px}
        canvas{background:#fff;box-shadow:0 14px 36px rgba(0,0,0,.2);touch-action:none}.field{display:grid;gap:5px;margin-bottom:10px}.field label{color:var(--secondary-text-color);font-size:12px;font-weight:700}.field input,.field select,.projectbar input,.projectbar select,#deviceSelect{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color);padding:8px}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--divider-color);vertical-align:top}th{color:var(--secondary-text-color);font-size:11px;text-transform:uppercase}pre{overflow:auto;background:var(--secondary-background-color);border-radius:8px;padding:10px;font-size:12px;line-height:1.45}.send-result{margin-top:10px}
        @media(max-width:1100px){.editor-shell,.status-grid,.projectbar{grid-template-columns:1fr}.left,.right{position:static}}
      </style>
      <div class="page">
        <div class="topbar">
          <div class="brand"><div class="logo">DE</div><div><h1>DRATEK eInk</h1><div class="subtitle">Profesionalni editor a Bluetooth diagnostika</div></div></div>
          <div class="toolbar"><button id="scan" class="secondary" ${this._loading ? "disabled" : ""}>${this._loading ? "Vyhledavam..." : "Vyhledat zarizeni"}</button><button id="sendDesign" ${!device || this._sending ? "disabled" : ""}>${this._sending ? "Odesilam..." : "Odeslat navrh"}</button></div>
        </div>
        <div class="status-grid"><div class="card"><div class="metric">Stav</div><span class="pill ${status.cls}">${this._escape(status.text)}</span></div><div class="card"><div class="metric">Bluetooth adaptery / proxy</div><div class="value">${result.scanner_count}</div></div><div class="card"><div class="metric">BLE zarizeni v dosahu</div><div class="value">${result.ble_count}</div></div></div>
        <div class="card projectbar"><input id="projectName" value="${this._escape(this._projectName)}" placeholder="Nazev navrhu"><select id="projectSelect"><option value="">Novy / neulozeny navrh</option>${this._projects.map((project) => `<option value="${this._escape(project.id)}" ${project.id === this._selectedProjectId ? "selected" : ""}>${this._escape(project.name)} (${project.width}x${project.height})</option>`).join("")}</select><div class="toolbar"><button id="newProject" class="secondary">Novy</button><button id="saveProject">Ulozit do HA</button><button id="loadProject" class="secondary" ${this._selectedProjectId ? "" : "disabled"}>Nacist</button><button id="deleteProject" class="danger" ${this._selectedProjectId ? "" : "disabled"}>Smazat</button></div></div>
        <div class="card" style="margin-bottom:12px"><div class="toolbar"><label>Displej</label><select id="deviceSelect">${result.devices.map((item) => `<option value="${this._escape(item.address)}" ${item.address === (device && device.address) ? "selected" : ""}>${this._escape(item.physical_code)} - ${this._escape(item.model)} - RSSI ${this._escape(item.rssi)}</option>`).join("")}</select><span class="pill muted">${size.width} x ${size.height}</span><button id="sendTest" class="secondary" ${!device ? "disabled" : ""}>Odeslat dratek.cz</button><label><input id="realPreview" type="checkbox" ${this._realPreview ? "checked" : ""}> Real eInk colors</label></div>${this._renderSendResult()}</div>
        <div class="editor-shell">
          <div class="card left"><h2>Nastroje</h2><div class="tool-list"><button data-add="text">Text</button><button data-add="rect">Rectangle</button><button data-add="line">Cara</button><button data-add="barcode">EAN</button><button data-add="qr">QR</button><button id="addImage" class="secondary">Obrazek</button><input id="imageFile" type="file" accept="image/*" hidden></div><h2 style="margin-top:18px">Upravy</h2><div class="tool-list"><button id="duplicateSelected" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Duplikovat</button><button id="rotateSelected" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Otocit 90</button><button id="mirrorSelected" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Zrcadlit</button><button id="alignLeft" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Zarovnat vlevo</button><button id="alignCenter" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Zarovnat na stred</button><button id="alignTop" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Zarovnat nahoru</button><button id="alignMiddle" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Svisly stred</button><button id="layerFront" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Do popredi</button><button id="layerBack" class="secondary" ${this._selectedIds.length ? "" : "disabled"}>Do pozadi</button><button id="deleteSelected" class="danger" ${this._selectedIds.length ? "" : "disabled"}>Smazat vybrane</button><button id="clearDesign" class="danger">Smazat vse</button></div><h2 style="margin-top:18px">Zobrazeni</h2><div class="tool-list"><button id="zoomIn" class="secondary">Priblizit</button><button id="zoomOut" class="secondary">Oddalit</button><button id="zoomFit" class="secondary">Prizpusobit</button><label><input id="snap" type="checkbox" ${this._snap ? "checked" : ""}> Grid snap 5 px</label></div></div>
          <div class="workspace"><canvas id="editor" width="${size.width}" height="${size.height}" style="width:${Math.round(size.width * this._zoom)}px;height:${Math.round(size.height * this._zoom)}px"></canvas></div>
          <div class="card right"><h2>Object properties</h2>${this._renderProperties(object)}</div>
        </div>
        <div class="card" style="margin-top:12px"><h2>Debug</h2><pre>${this._escape((result.debug || []).join("\n"))}</pre><details><summary>Vsechna BLE zarizeni (${result.ble_devices.length})</summary>${this._renderBleDevices(result.ble_devices)}</details></div>
      </div>`;
    this._bind();
    this._paint();
  }

  _bind() {
    this.shadowRoot.querySelector("#scan").addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#sendDesign").addEventListener("click", () => this._sendDesign());
    this.shadowRoot.querySelector("#newProject").addEventListener("click", () => this._newProject());
    this.shadowRoot.querySelector("#saveProject").addEventListener("click", () => this._saveProject());
    this.shadowRoot.querySelector("#loadProject").addEventListener("click", () => this._loadSelectedProject());
    this.shadowRoot.querySelector("#deleteProject").addEventListener("click", () => this._deleteProject());
    this.shadowRoot.querySelector("#projectName").addEventListener("input", (event) => { this._projectName = event.target.value; });
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
    this.shadowRoot.querySelector("#deviceSelect").addEventListener("change", (event) => { this._selectedDeviceAddress = event.target.value; this._fitZoom(); this._render(); });
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
    if (object.type === "text") return `${common}<div class="field"><label>Text</label><input data-prop="text" value="${this._escape(object.text)}"></div><div class="field"><label>Velikost textu</label><input data-prop="fontSize" type="number" value="${object.fontSize}"></div>`;
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
    this._paint();
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
    ctx.font = `${object.fontSize || 24}px Arial, sans-serif`;
    ctx.textBaseline = "top";
    String(object.text || "").split("\n").forEach((line, index) => ctx.fillText(line, 0, index * (object.fontSize || 24) * 1.18, box.w));
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
    const text = String(object.text || "8591234567890").replace(/\D/g, "") || "0";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = this._color(object.color);
    let x = 0;
    const unit = Math.max(1, box.w / (text.length * 7));
    for (const char of text) {
      const bits = (Number(char).toString(2).padStart(4, "0") + "101").slice(0, 7);
      for (const bit of bits) {
        if (bit === "1") ctx.fillRect(Math.round(x), 0, Math.ceil(unit), Math.max(8, box.h - 16));
        x += unit;
      }
    }
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, box.w / 2, box.h - 13);
    ctx.textAlign = "left";
  }

  _drawQr(ctx, object, box) {
    const data = String(object.text || "https://dratek.cz");
    const cells = 21;
    const cell = Math.max(1, Math.floor(Math.min(box.w, box.h) / cells));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cell * cells, cell * cells);
    ctx.fillStyle = this._color(object.color);
    const hash = this._hash(data);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const finder = (x < 7 && y < 7) || (x >= 14 && y < 7) || (x < 7 && y >= 14);
        const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 6 >= 2 && x % 6 <= 4 && y % 6 >= 2 && y % 6 <= 4)) : ((x * 31 + y * 17 + hash) % 5 < 2);
        if (on) ctx.fillRect(x * cell, y * cell, cell, cell);
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
        ctx.fillRect(handle.x - 4, handle.y - 4, 8, 8);
        ctx.strokeRect(handle.x - 4, handle.y - 4, 8, 8);
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
