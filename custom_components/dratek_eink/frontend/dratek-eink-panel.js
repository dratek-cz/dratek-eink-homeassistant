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
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._render();
      this._scan();
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
      this._error = err && err.message ? err.message : String(err);
    } finally {
      this._loading = false;
      this._render();
      this._paint();
    }
  }

  _device() {
    const devices = this._result ? this._result.devices : [];
    return devices.find((device) => device.address === this._selectedDeviceAddress) || devices[0] || null;
  }

  _displaySize(device = this._device()) {
    const sdk = device ? Number(device.sdk_type) : 75;
    if (sdk === 75) return { width: 400, height: 300 };
    if ([11].includes(sdk)) return { width: 212, height: 104 };
    return { width: 250, height: 128 };
  }

  _fitZoom() {
    const size = this._displaySize();
    this._zoom = Math.min(2.2, Math.max(0.55, Math.min(760 / size.width, 420 / size.height)));
  }

  _status() {
    if (this._error) return { cls: "bad", text: "Chyba při skenu" };
    if (!this._result) return { cls: "muted", text: "Čekám na první sken" };
    if (this._result.scanner_count === 0) return { cls: "bad", text: "Bluetooth není dostupné" };
    if (this._result.devices.length === 0) return { cls: "warn", text: "Bluetooth funguje, DRATEK eInk nenalezen" };
    return { cls: "good", text: `Nalezeno ${this._result.devices.length} DRATEK eInk displejů` };
  }

  _selectedObject() {
    if (this._selectedIds.length !== 1) return null;
    return this._objects.find((object) => object.id === this._selectedIds[0]) || null;
  }

  _addObject(type) {
    const size = this._displaySize();
    const base = {
      id: `obj-${this._nextId++}`,
      type,
      x: Math.round(size.width * 0.12),
      y: Math.round(size.height * 0.15),
      w: Math.round(size.width * 0.35),
      h: Math.round(size.height * 0.18),
      rotation: 0,
      color: "black",
      fill: "none",
      stroke: "black",
      strokeWidth: 2,
      text: type === "text" ? "Text" : type === "qr" ? "https://dratek.cz" : "8591234567890",
      fontSize: Math.max(16, Math.round(size.height * 0.16)),
      image: "",
      keepRatio: type === "image",
    };
    if (type === "rect") {
      base.fill = "red";
      base.h = Math.round(size.height * 0.28);
    }
    if (type === "line") {
      base.x2 = base.x + Math.round(size.width * 0.38);
      base.y2 = base.y + Math.round(size.height * 0.2);
      base.w = Math.abs(base.x2 - base.x);
      base.h = Math.abs(base.y2 - base.y);
    }
    if (type === "barcode") {
      base.h = Math.round(size.height * 0.32);
    }
    this._objects.push(base);
    this._selectedIds = [base.id];
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
          x: Math.round(size.width * 0.12),
          y: Math.round(size.height * 0.15),
          w: Math.max(20, Math.round(img.width * scale)),
          h: Math.max(20, Math.round(img.height * scale)),
          rotation: 0,
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

  _moveLayer(direction) {
    const id = this._selectedIds[0];
    const index = this._objects.findIndex((object) => object.id === id);
    if (index < 0) return;
    if (direction === "front") {
      this._objects.push(this._objects.splice(index, 1)[0]);
    } else if (direction === "back") {
      this._objects.unshift(this._objects.splice(index, 1)[0]);
    } else {
      const next = direction === "up" ? index + 1 : index - 1;
      if (next < 0 || next >= this._objects.length) return;
      [this._objects[index], this._objects[next]] = [this._objects[next], this._objects[index]];
    }
    this._paint();
  }

  _updateSelected(patch) {
    const object = this._selectedObject();
    if (!object) return;
    Object.assign(object, patch);
    this._paint();
    this._syncProperties();
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
      if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) {
        return object;
      }
    }
    return null;
  }

  _handleAt(point, object) {
    const box = this._box(object);
    const handles = this._handles(box);
    return handles.find((handle) => Math.abs(point.x - handle.x) <= 7 / this._zoom && Math.abs(point.y - handle.y) <= 7 / this._zoom);
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
      if (this._selectedIds.includes(object.id)) {
        this._selectedIds = this._selectedIds.filter((id) => id !== object.id);
      } else {
        this._selectedIds = [...this._selectedIds, object.id];
      }
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
        object.x = Math.round(snapshot.x + dx);
        object.y = Math.round(snapshot.y + dy);
        if (object.type === "line") {
          object.x2 = Math.round(snapshot.x2 + dx);
          object.y2 = Math.round(snapshot.y2 + dy);
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
      if (handle.includes("left") || handle === "start") {
        object.x = Math.round(snapshot.x + dx);
        object.y = Math.round(snapshot.y + dy);
      } else {
        object.x2 = Math.round(snapshot.x2 + dx);
        object.y2 = Math.round(snapshot.y2 + dy);
      }
      object.w = Math.abs(object.x2 - object.x);
      object.h = Math.abs(object.y2 - object.y);
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
    if (object.keepRatio || object.type === "image") {
      const ratio = snapshot.w / Math.max(1, snapshot.h);
      if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
      else w = h * ratio;
    }
    object.x = Math.round(x);
    object.y = Math.round(y);
    object.w = Math.round(w);
    object.h = Math.round(h);
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
      this._sendResult = { ok: false, address: device.address, error: err && err.message ? err.message : String(err), log: [] };
    } finally {
      this._sending = false;
      this._render();
      this._paint();
    }
  }

  _saveProject() {
    const device = this._device();
    const size = this._displaySize(device);
    const project = {
      version: 1,
      sdk_type: device ? Number(device.sdk_type) : 75,
      width: size.width,
      height: size.height,
      objects: this._objects.map(({ _img, ...object }) => object),
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dratek-eink-${size.width}x${size.height}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _openProject(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const project = JSON.parse(reader.result);
      const size = this._displaySize();
      if (project.width !== size.width || project.height !== size.height) {
        alert(`Projekt je pro rozlišení ${project.width}x${project.height}, aktuální displej má ${size.width}x${size.height}.`);
        return;
      }
      this._objects = Array.isArray(project.objects) ? project.objects : [];
      this._selectedIds = [];
      this._nextId = this._objects.length + 1;
      this._render();
      this._paint();
    };
    reader.readAsText(file);
  }

  _render() {
    const result = this._result || { scanner_count: 0, ble_count: 0, devices: [], ble_devices: [], debug: [] };
    const status = this._status();
    const device = this._device();
    const size = this._displaySize(device);
    const object = this._selectedObject();
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100%; color:var(--primary-text-color); background:var(--primary-background-color); font-family:Roboto,Arial,sans-serif; }
        .page { max-width:1420px; margin:0 auto; padding:20px; }
        .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px; }
        .brand { display:flex; align-items:center; gap:12px; }
        .logo { width:40px; height:40px; border-radius:8px; display:grid; place-items:center; background:var(--primary-color); color:#fff; font-weight:800; }
        h1 { margin:0; font-size:24px; font-weight:650; }
        h2 { margin:0 0 12px; font-size:16px; }
        .subtitle { margin-top:3px; color:var(--secondary-text-color); font-size:13px; }
        button, select, input { font:inherit; }
        button { border:0; border-radius:6px; background:var(--primary-color); color:var(--text-primary-color,#fff); padding:9px 12px; font-weight:650; cursor:pointer; }
        button:disabled { opacity:.55; cursor:progress; }
        .secondary { background:var(--secondary-background-color); color:var(--primary-text-color); border:1px solid var(--divider-color); }
        .danger { background:#b3261e; color:#fff; }
        .toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .status-grid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px; margin-bottom:14px; }
        .card { background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:8px; padding:14px; box-sizing:border-box; }
        .metric { color:var(--secondary-text-color); font-size:12px; margin-bottom:6px; }
        .value { font-size:24px; font-weight:700; }
        .pill { display:inline-flex; min-height:26px; align-items:center; border-radius:999px; padding:0 10px; font-size:12px; font-weight:700; }
        .good { background:#d7f5df; color:#0b6b2a; } .warn { background:#fff2c7; color:#775500; } .bad { background:#ffd9d4; color:#9d1c0f; } .muted { background:var(--secondary-background-color); color:var(--secondary-text-color); }
        .editor-shell { display:grid; grid-template-columns:230px minmax(0,1fr) 300px; gap:12px; align-items:start; }
        .left, .right { position:sticky; top:12px; }
        .tool-list { display:grid; gap:8px; }
        .tool-list button { text-align:left; }
        .workspace { min-height:480px; overflow:auto; display:grid; place-items:center; background:linear-gradient(45deg, var(--secondary-background-color) 25%, transparent 25%), linear-gradient(-45deg, var(--secondary-background-color) 25%, transparent 25%); background-size:18px 18px; border-radius:8px; border:1px solid var(--divider-color); padding:24px; }
        canvas { background:#fff; box-shadow:0 10px 28px rgba(0,0,0,.18); image-rendering:auto; touch-action:none; }
        .field { display:grid; gap:5px; margin-bottom:10px; }
        .field label { color:var(--secondary-text-color); font-size:12px; font-weight:650; }
        .field input, .field select { width:100%; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:6px; background:var(--card-background-color); color:var(--primary-text-color); padding:8px; }
        .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th,td { text-align:left; padding:8px; border-bottom:1px solid var(--divider-color); vertical-align:top; }
        th { color:var(--secondary-text-color); font-size:11px; text-transform:uppercase; }
        pre { overflow:auto; background:var(--secondary-background-color); border-radius:8px; padding:10px; font-size:12px; line-height:1.45; }
        .send-result { margin-top:10px; }
        @media (max-width:1050px){ .editor-shell{grid-template-columns:1fr;} .left,.right{position:static;} .status-grid{grid-template-columns:1fr;} }
      </style>
      <div class="page">
        <div class="topbar">
          <div class="brand"><div class="logo">DE</div><div><h1>DRATEK eInk</h1><div class="subtitle">Editor grafiky, vyhledávání a Bluetooth diagnostika</div></div></div>
          <div class="toolbar">
            <button id="scan" class="secondary" ${this._loading ? "disabled" : ""}>${this._loading ? "Vyhledávám..." : "Vyhledat zařízení"}</button>
            <button id="saveProject" class="secondary">Uložit projekt</button>
            <button id="openProject" class="secondary">Otevřít projekt</button>
            <button id="sendDesign" ${!device || this._sending ? "disabled" : ""}>${this._sending ? "Odesílám..." : "Odeslat návrh"}</button>
            <input id="projectFile" type="file" accept="application/json" hidden>
          </div>
        </div>

        <div class="status-grid">
          <div class="card"><div class="metric">Stav</div><span class="pill ${status.cls}">${this._escape(status.text)}</span></div>
          <div class="card"><div class="metric">Bluetooth adaptéry / proxy</div><div class="value">${result.scanner_count}</div></div>
          <div class="card"><div class="metric">BLE zařízení v dosahu</div><div class="value">${result.ble_count}</div></div>
        </div>

        <div class="card" style="margin-bottom:12px;">
          <div class="toolbar">
            <label>Displej</label>
            <select id="deviceSelect">${result.devices.map((item) => `<option value="${this._escape(item.address)}" ${item.address === (device && device.address) ? "selected" : ""}>${this._escape(item.physical_code)} - ${this._escape(item.model)} - RSSI ${this._escape(item.rssi)}</option>`).join("")}</select>
            <span class="pill muted">${size.width} × ${size.height}</span>
            <button id="sendTest" class="secondary" ${!device ? "disabled" : ""}>Odeslat dratek.cz</button>
            <label><input id="realPreview" type="checkbox" ${this._realPreview ? "checked" : ""}> Real eInk colors</label>
          </div>
          ${this._renderSendResult()}
        </div>

        <div class="editor-shell">
          <div class="card left">
            <h2>Nástroje</h2>
            <div class="tool-list">
              <button data-add="text">Text</button>
              <button data-add="rect">Rectangle</button>
              <button data-add="line">Čára</button>
              <button data-add="barcode">EAN</button>
              <button data-add="qr">QR</button>
              <button id="addImage" class="secondary">Obrázek</button>
              <input id="imageFile" type="file" accept="image/*" hidden>
            </div>
            <h2 style="margin-top:18px;">Vrstvy</h2>
            <div class="tool-list">
              <button id="layerFront" class="secondary">Dopředu</button>
              <button id="layerBack" class="secondary">Dozadu</button>
              <button id="deleteSelected" class="danger" ${this._selectedIds.length ? "" : "disabled"}>Smazat vybrané</button>
            </div>
          </div>

          <div class="workspace">
            <canvas id="editor" width="${size.width}" height="${size.height}" style="width:${Math.round(size.width * this._zoom)}px;height:${Math.round(size.height * this._zoom)}px"></canvas>
          </div>

          <div class="card right">
            <h2>Object properties</h2>
            ${this._renderProperties(object)}
          </div>
        </div>

        <div class="card" style="margin-top:12px;">
          <h2>Debug</h2>
          <pre>${this._escape((result.debug || []).join("\n"))}</pre>
          <details><summary>Všechna BLE zařízení (${result.ble_devices.length})</summary>${this._renderBleDevices(result.ble_devices)}</details>
        </div>
      </div>
    `;
    this._bind();
    this._paint();
  }

  _bind() {
    this.shadowRoot.querySelector("#scan").addEventListener("click", () => this._scan());
    this.shadowRoot.querySelector("#sendDesign").addEventListener("click", () => this._sendDesign());
    this.shadowRoot.querySelector("#saveProject").addEventListener("click", () => this._saveProject());
    this.shadowRoot.querySelector("#openProject").addEventListener("click", () => this.shadowRoot.querySelector("#projectFile").click());
    this.shadowRoot.querySelector("#projectFile").addEventListener("change", (event) => this._openProject(event.target.files[0]));
    this.shadowRoot.querySelector("#addImage").addEventListener("click", () => this.shadowRoot.querySelector("#imageFile").click());
    this.shadowRoot.querySelector("#imageFile").addEventListener("change", (event) => this._addImage(event.target.files[0]));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => this._addObject(button.dataset.add)));
    this.shadowRoot.querySelector("#deleteSelected").addEventListener("click", () => this._deleteSelected());
    this.shadowRoot.querySelector("#layerFront").addEventListener("click", () => this._moveLayer("front"));
    this.shadowRoot.querySelector("#layerBack").addEventListener("click", () => this._moveLayer("back"));
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
      if (this._selectedIds.length > 1) return `<p class="muted" style="padding:10px;border-radius:8px;">Vybráno ${this._selectedIds.length} objektů. Přesun funguje hromadně, vlastnosti uprav po jednom objektu.</p>`;
      return `<p class="muted" style="padding:10px;border-radius:8px;">Vyber objekt v návrhu.</p>`;
    }
    const common = `
      <div class="row"><div class="field"><label>X</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y</label><input data-prop="y" type="number" value="${object.y}"></div></div>
      <div class="row"><div class="field"><label>Šířka</label><input data-prop="w" type="number" value="${object.w || 1}"></div><div class="field"><label>Výška</label><input data-prop="h" type="number" value="${object.h || 1}"></div></div>
      <div class="row"><div class="field"><label>Rotace</label><select data-prop="rotation"><option ${object.rotation === 0 ? "selected" : ""}>0</option><option ${object.rotation === 90 ? "selected" : ""}>90</option><option ${object.rotation === 180 ? "selected" : ""}>180</option><option ${object.rotation === 270 ? "selected" : ""}>270</option></select></div><div class="field"><label>Barva</label><select data-prop="color"><option value="black" ${object.color === "black" ? "selected" : ""}>Černá</option><option value="red" ${object.color === "red" ? "selected" : ""}>Červená</option><option value="white" ${object.color === "white" ? "selected" : ""}>Bílá</option></select></div></div>
    `;
    if (object.type === "text") {
      return `${common}<div class="field"><label>Text</label><input data-prop="text" value="${this._escape(object.text)}"></div><div class="field"><label>Velikost textu</label><input data-prop="fontSize" type="number" value="${object.fontSize}"></div>`;
    }
    if (object.type === "rect") {
      return `${common}<div class="row"><div class="field"><label>Výplň</label><select data-prop="fill"><option value="none" ${object.fill === "none" ? "selected" : ""}>Bez výplně</option><option value="black" ${object.fill === "black" ? "selected" : ""}>Černá</option><option value="red" ${object.fill === "red" ? "selected" : ""}>Červená</option><option value="white" ${object.fill === "white" ? "selected" : ""}>Bílá</option></select></div><div class="field"><label>Rámeček</label><select data-prop="stroke"><option value="none" ${object.stroke === "none" ? "selected" : ""}>Bez rámečku</option><option value="black" ${object.stroke === "black" ? "selected" : ""}>Černý</option><option value="red" ${object.stroke === "red" ? "selected" : ""}>Červený</option></select></div></div><div class="field"><label>Síla rámečku</label><input data-prop="strokeWidth" type="number" value="${object.strokeWidth || 0}"></div>`;
    }
    if (object.type === "line") {
      return `<div class="row"><div class="field"><label>X1</label><input data-prop="x" type="number" value="${object.x}"></div><div class="field"><label>Y1</label><input data-prop="y" type="number" value="${object.y}"></div></div><div class="row"><div class="field"><label>X2</label><input data-prop="x2" type="number" value="${object.x2}"></div><div class="field"><label>Y2</label><input data-prop="y2" type="number" value="${object.y2}"></div></div><div class="row"><div class="field"><label>Barva</label><select data-prop="color"><option value="black" ${object.color === "black" ? "selected" : ""}>Černá</option><option value="red" ${object.color === "red" ? "selected" : ""}>Červená</option></select></div><div class="field"><label>Síla</label><input data-prop="strokeWidth" type="number" value="${object.strokeWidth || 2}"></div></div>`;
    }
    if (object.type === "barcode" || object.type === "qr") {
      return `${common}<div class="field"><label>${object.type === "qr" ? "QR data" : "EAN data"}</label><input data-prop="text" value="${this._escape(object.text)}"></div>`;
    }
    return `${common}<label><input data-prop="keepRatio" type="checkbox" ${object.keepRatio ? "checked" : ""}> Zachovat poměr stran</label>`;
  }

  _readProperties() {
    const object = this._selectedObject();
    if (!object) return;
    const patch = {};
    this.shadowRoot.querySelectorAll("[data-prop]").forEach((input) => {
      const key = input.dataset.prop;
      if (input.type === "checkbox") patch[key] = input.checked;
      else if (["x", "y", "x2", "y2", "w", "h", "rotation", "fontSize", "strokeWidth"].includes(key)) patch[key] = Number(input.value);
      else patch[key] = input.value;
    });
    Object.assign(object, patch);
    if (object.type === "line") {
      object.w = Math.abs(object.x2 - object.x);
      object.h = Math.abs(object.y2 - object.y);
    }
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
    const ctx = canvas.getContext("2d");
    this._drawScene(ctx, canvas.width, canvas.height, true);
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
    const lines = String(object.text || "").split("\n");
    lines.forEach((line, index) => ctx.fillText(line, 0, index * (object.fontSize || 24) * 1.18, box.w));
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
    const cell = Math.floor(Math.min(box.w, box.h) / cells);
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
      ctx.setLineDash([3, 2]);
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
    const text = this._sendResult.ok ? "Odesláno do displeje." : `Odeslání selhalo: ${this._sendResult.error || "neznámá chyba"}`;
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(text)}</span>${(this._sendResult.log || []).length ? `<pre>${this._escape(this._sendResult.log.join("\n"))}</pre>` : ""}</div>`;
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
      this._sendResult = { ok: false, error: err && err.message ? err.message : String(err), log: [] };
    } finally {
      this._sending = false;
      this._render();
    }
  }

  _renderBleDevices(devices) {
    if (!devices.length) return `<div style="color:var(--secondary-text-color);padding:10px 0;">Home Assistant zatím nevrátil žádné BLE zařízení.</div>`;
    return `<table><thead><tr><th>Název</th><th>Adresa</th><th>RSSI</th><th>Manufacturer IDs</th><th>Services</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.name || "-")}</td><td>${this._escape(device.address)}</td><td>${this._escape(device.rssi ?? "")}</td><td>${this._escape((device.manufacturer_ids || []).join(", "))}</td><td>${this._escape((device.service_uuids || []).join(", "))}</td></tr>`).join("")}</tbody></table>`;
  }

  _escape(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

customElements.define("dratek-eink-panel", DratekEinkPanel);
