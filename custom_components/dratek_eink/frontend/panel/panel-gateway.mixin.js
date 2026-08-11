import { CURRENT_GATEWAY_FIRMWARES } from "./panel-constants.js";

// Desky, na které umíme nahrát gateway firmware. Klíč `chip` musí sedět
// s FLASH_PROFILES v gateway.py, jinak backend flash odmítne.
// Musí sedět s LOCAL_ROUTE_ID v const.py - pod tímhle klíčem se ukládá zamčení
// displeje na Bluetooth adaptér Home Assistantu místo na gateway.
export const LOCAL_ROUTE_ID = "local";

export const GATEWAY_BOARDS = [
  {
    chip: "esp32",
    name: "ESP-32S / ESP32",
    subtitle: "Vývojová deska 2,4GHz Wi-Fi + Bluetooth s anténou",
    icon: "mdi:chip",
    firmware: "Firmware pro ESP32 / WROOM",
  },
  {
    chip: "esp32s3",
    name: "ESP32-S3 N16R8",
    subtitle: "Vývojový modul Wi-Fi a BLE 5.0, s pinovou lištou v balení",
    icon: "mdi:memory",
    firmware: "Firmware pro ESP32-S3",
  },
];

// Náhledy desek jsou kreslené inline v SVG, ne fotky. HA panel běží pod přísným
// CSP a obrázek z dratek.cz by se nenačetl; inline SVG je součást bundlu, takže
// funguje i bez internetu a ostře na jakémkoliv zvětšení.
const BOARD_PREVIEWS = {
  esp32: `<svg class="board-preview" viewBox="0 0 200 116" role="img" aria-label="Vývojová deska ESP32">
    <rect x="4" y="10" width="192" height="96" rx="6" fill="#141414"/>
    <g fill="#c9a227">${Array.from({ length: 15 }, (_, i) => `<rect x="${22 + i * 11}" y="12" width="7" height="7" rx="1.5"/><rect x="${22 + i * 11}" y="97" width="7" height="7" rx="1.5"/>`).join("")}</g>
    <rect x="2" y="47" width="18" height="22" rx="3" fill="#b9bec4"/>
    <rect x="6" y="52" width="10" height="12" rx="2" fill="#6b7178"/>
    <circle cx="26" cy="34" r="7" fill="#2b2b2b" stroke="#5c6167" stroke-width="1.5"/>
    <circle cx="26" cy="82" r="7" fill="#2b2b2b" stroke="#5c6167" stroke-width="1.5"/>
    <rect x="104" y="26" width="82" height="64" rx="4" fill="#d5d9dd" stroke="#8f959b"/>
    <text x="145" y="63" text-anchor="middle" font-size="15" font-weight="700" fill="#3b4045" font-family="Arial,sans-serif">ESP-32</text>
    <g fill="#3d4248">${Array.from({ length: 9 }, (_, i) => `<rect x="${96}" y="${28 + i * 7}" width="6" height="4" rx="1"/>`).join("")}</g>
  </svg>`,
  // S3 je otočený o 90° doleva: kreslí se na výšku (116x200) a celá skupina se
  // překlopí do šířky, takže USB-C konektory míří doleva. Popisek modulu se
  // otáčí zpět, aby zůstal čitelný.
  esp32s3: `<svg class="board-preview" viewBox="0 0 200 116" role="img" aria-label="Vývojový modul ESP32-S3">
    <g transform="translate(0 116) rotate(-90)">
      <rect x="18" y="4" width="80" height="192" rx="6" fill="#141414"/>
      <g fill="#c9a227">${Array.from({ length: 21 }, (_, i) => `<rect x="20" y="${10 + i * 8.6}" width="7" height="6" rx="1.5"/><rect x="89" y="${10 + i * 8.6}" width="7" height="6" rx="1.5"/>`).join("")}</g>
      <rect x="33" y="1" width="22" height="16" rx="5" fill="#b9bec4"/>
      <rect x="61" y="1" width="22" height="16" rx="5" fill="#b9bec4"/>
      <rect x="42" y="34" width="32" height="20" rx="3" fill="#2f2f2f" stroke="#4d5258"/>
      <rect x="66" y="60" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#9aa0a6"/>
      <circle cx="44" cy="82" r="8" fill="#2b2b2b" stroke="#5c6167" stroke-width="1.5"/>
      <circle cx="44" cy="104" r="8" fill="#2b2b2b" stroke="#5c6167" stroke-width="1.5"/>
      <rect x="28" y="126" width="60" height="62" rx="4" fill="#d5d9dd" stroke="#8f959b"/>
      <text x="58" y="161" text-anchor="middle" font-size="11" font-weight="700" fill="#3b4045" font-family="Arial,sans-serif" transform="rotate(90 58 157)">ESP32-S3</text>
    </g>
  </svg>`,
};

// USB-A konektor s kabelem, stejný kreslený styl jako náhledy desek.
const USB_PREVIEW = `<svg class="usb-preview" viewBox="0 0 120 64" role="img" aria-label="USB konektor">
  <rect x="4" y="20" width="14" height="24" rx="3" fill="#5c6167"/>
  <rect x="16" y="24" width="42" height="16" rx="2" fill="#2f3237"/>
  <rect x="56" y="14" width="26" height="36" rx="3" fill="#b9bec4" stroke="#8f959b"/>
  <rect x="82" y="20" width="34" height="24" rx="2" fill="#d5d9dd" stroke="#8f959b"/>
  <rect x="88" y="26" width="22" height="5" rx="1" fill="#3d4248"/>
  <rect x="88" y="34" width="14" height="4" rx="1" fill="#3d4248"/>
  <path d="M62 24h4v16h-4z" fill="#8f959b"/>
</svg>`;

export const gatewayMixin = {

  _renderGatewayPortPicker() {
    const ports = this._serialPorts || [];
    const selected = ports.find((port) => port.device === this._flashForm.port);
    const hint = ports.length
      ? selected
        ? this._escape(selected.description || selected.name || selected.device)
        : "Vyberte port, do kterého je deska zapojená"
      : "Zatím žádný port. Zapojte desku do USB stroje s Home Assistantem a načtěte porty znovu.";
    return `<div class="port-picker ${ports.length ? "" : "is-empty"}">
      <span class="port-picker-visual">${USB_PREVIEW}</span>
      <div class="port-picker-field">
        <label for="flashPort">USB / serial port</label>
        <select id="flashPort" ${ports.length ? "" : "disabled"}>${ports.length
          ? ports.map((port) => `<option value="${this._escape(port.device)}" ${port.device === this._flashForm.port ? "selected" : ""}>${this._escape(port.device)} — ${this._escape(port.description || port.name || "")}</option>`).join("")
          : `<option value="">Žádný port nenalezen</option>`}</select>
        <small class="port-picker-hint"><ha-icon icon="${ports.length ? "mdi:usb-port" : "mdi:usb-flash-drive-outline"}"></ha-icon>${hint}</small>
      </div>
    </div>`;
  },

  _selectedGatewayBoard() {
    return GATEWAY_BOARDS.find((board) => board.chip === this._flashForm.chip) || GATEWAY_BOARDS[1];
  },

  _renderGatewayBoardPicker() {
    return `<div class="board-picker" role="radiogroup" aria-label="Typ ESP32 desky">${GATEWAY_BOARDS.map((board) => {
      const selected = this._flashForm.chip === board.chip;
      return `<div class="board-option ${selected ? "selected" : ""}">
        <div class="board-option-visual">${BOARD_PREVIEWS[board.chip] || ""}</div>
        <div class="board-option-copy"><strong>${this._escape(board.name)}</strong><small>${this._escape(board.subtitle)}</small></div>
        <div class="board-option-actions">
          <button class="board-option-pick ${selected ? "" : "secondary"}" role="radio" aria-checked="${selected ? "true" : "false"}" data-flash-chip="${board.chip}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="${selected ? "mdi:check-circle" : "mdi:checkbox-blank-circle-outline"}"></ha-icon>${selected ? "Vybráno" : "Vybrat"}</button>
        </div>
      </div>`;
    }).join("")}</div>`;
  },


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
  },

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
  },

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
  },

  async _addDiscoveredGateway(index) {
    const discovered = this._gatewayDiscovery[Number(index)];
    if (!discovered || this._matchingStoredGateway(discovered)) return;
    this._gatewayForm = {
      name: discovered.name || "DRATEK eInk gateway",
      host: discovered.host || discovered.server,
    };
    await this._addGateway();
  },

  async _loadSerialPorts() {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/gateways/serial_ports" });
      this._serialPorts = result.ports || [];
      this._serialPortsLoaded = true;
      if (!this._serialPorts.some((port) => port.device === this._flashForm.port)) {
        this._flashForm.port = this._serialPorts[0]?.device || "";
      }
    } catch (err) {
      this._serialPortsLoaded = true;
      this._flashResult = { ok: false, error: this._message(err), log: [] };
    }
    this._render();
    this._paint();
  },

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
  },

  _scheduleFlashPoll() {
    window.clearTimeout(this._flashPollTimer);
    this._flashPollTimer = window.setTimeout(() => this._pollFlashJob(), 1000);
  },

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
  },

  _scrollGatewayLogsToBottom() {
    window.requestAnimationFrame(() => {
      this.shadowRoot.querySelectorAll(".gateway-log").forEach((node) => {
        node.scrollTop = node.scrollHeight;
      });
    });
  },

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
  },

  _scheduleOtaPoll() {
    window.clearTimeout(this._otaPollTimer);
    this._otaPollTimer = window.setTimeout(() => this._pollOtaJob(), 1000);
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  _renderGatewayResult() {
    if (!this._gatewayResult) return "";
    const cls = this._gatewayResult.ok ? "good" : "bad";
    const message = this._gatewayResult.ok
      ? (this._gatewayResult.message || `Scan dokoncen. Nalezeno ${this._gatewayResult.devices ? this._gatewayResult.devices.length : 0} BLE zarizeni.`)
      : `Gateway chyba: ${this._gatewayResult.error || "neznamy problem"}`;
    const devices = this._gatewayResult.devices || [];
    return `<div class="card send-result"><span class="pill ${cls}">${this._escape(message)}</span>${devices.length ? `<div class="panel-divider"></div>${this._renderGatewayDevices(devices)}` : ""}</div>`;
  },

  _renderGatewayWorkspace() {
    const tabs = `<nav class="gateway-workspace-tabs" aria-label="Správa gatewayí">
      <button class="${this._gatewaySubtab === "manage" ? "active" : ""}" data-gateway-tab="manage"><span><ha-icon icon="mdi:router-wireless-settings"></ha-icon></span><span><strong>Moje gatewaye</strong><small>Stav, displeje a aktualizace</small></span></button>
      <button class="${this._gatewaySubtab === "discover" ? "active" : ""}" data-gateway-tab="discover"><span><ha-icon icon="mdi:access-point-network"></ha-icon></span><span><strong>Najít v síti</strong><small>Automatické vyhledání přes mDNS</small></span></button>
      <button class="${this._gatewaySubtab === "create" ? "active" : ""}" data-gateway-tab="create"><span><ha-icon icon="mdi:usb-flash-drive-outline"></ha-icon></span><span><strong>Nová gateway</strong><small>Instalace firmware přes USB</small></span></button>
    </nav>`;
    const shellStart = `<div class="gateway-workspace">${tabs}<section class="gateway-workspace-content">`;
    const shellEnd = `</section></div>`;
    if (this._gatewaySubtab === "discover") {
      return `${shellStart}<div class="gateway-section-head"><div><span class="gateway-section-icon"><ha-icon icon="mdi:radar"></ha-icon></span><div><h2>Gatewaye dostupné v lokální síti</h2><p>Panel vyhledá zařízení s DRATEK firmwarem a nabídne jejich přidání.</p></div></div><div class="toolbar"><button id="discoverGateways" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:access-point-network"></ha-icon>${this._gatewayBusy ? "Vyhledávám…" : "Spustit hledání"}</button><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Obnovit</button></div></div><div class="gateway-panel">${this._renderDiscoveredGateways()}</div>${this._renderGatewayResult()}${shellEnd}`;
    }
    if (this._gatewaySubtab === "create") {
      return `${shellStart}<div class="gateway-section-head"><div><span class="gateway-section-icon"><ha-icon icon="mdi:usb-flash-drive-outline"></ha-icon></span><div><h2>Připravit novou gateway</h2><p>Připojte ESP32 přímo k Home Assistantu, vyberte port a nastavte Wi-Fi.</p></div></div><button id="refreshSerialPorts" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:usb-port"></ha-icon>Načíst porty</button></div>${this._renderNoSerialPortsWarning()}<div class="gateway-setup-grid"><div class="gateway-panel gateway-form-panel"><div class="gateway-step-title"><span>1</span><div><strong>Připojení přes USB</strong><small>Vyberte port, ve kterém je deska zapojená</small></div></div>${this._renderGatewayPortPicker()}<div class="gateway-step-title"><span>2</span><div><strong>Typ desky</strong><small>Podle desky se vybere správný firmware</small></div></div>${this._renderGatewayBoardPicker()}<div class="gateway-step-title"><span>3</span><div><strong>Síťové nastavení</strong><small>Údaje se bezpečně odešlou přes USB</small></div></div><div class="field"><label>Název gatewaye</label><input id="flashHostname" value="${this._escape(this._flashForm.hostname)}" placeholder="dratek-eink-gateway-dilna"></div><div class="field"><label>Wi-Fi SSID</label><input id="flashSsid" value="${this._escape(this._flashForm.ssid)}" placeholder="Název Wi-Fi"></div><div class="field"><label>Wi-Fi heslo</label><input id="flashPassword" type="password" value="${this._escape(this._flashForm.password)}" placeholder="Heslo"></div></div><div class="gateway-panel gateway-install-panel"><div class="gateway-step-title"><span>4</span><div><strong>Instalace a diagnostika</strong><small>Průběh zůstane viditelný v tomto panelu</small></div></div><div class="gateway-install-actions"><button id="flashGateway" ${this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid ? "disabled" : ""}><ha-icon icon="mdi:chip"></ha-icon>Nahrát firmware</button><button id="serialWifi" class="secondary" ${this._gatewayBusy || !this._flashForm.port || !this._flashForm.ssid ? "disabled" : ""}><ha-icon icon="mdi:wifi-cog"></ha-icon>Poslat jen Wi-Fi</button><button id="serialStatus" class="secondary" ${this._gatewayBusy || !this._flashForm.port ? "disabled" : ""}><ha-icon icon="mdi:console"></ha-icon>Ověřit USB</button></div><div class="gateway-install-placeholder"><ha-icon icon="mdi:progress-wrench"></ha-icon><strong>${this._gatewayBusy ? "Probíhá operace…" : "Připraveno k instalaci"}</strong><small>${this._escape(this._selectedGatewayBoard().firmware)}</small></div>${this._renderFlashResult()}${this._renderSerialResult()}</div></div>${shellEnd}`;
    }
    return `${shellStart}<div class="gateway-section-head"><div><span class="gateway-section-icon"><ha-icon icon="mdi:router-wireless"></ha-icon></span><div><h2>Chytré směrování gatewayí</h2><p>Home Assistant automaticky rozděluje zápisy podle signálu a aktuálního vytížení.</p></div></div><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this._gatewayBusy ? "Obnovuji…" : "Obnovit stav"}</button></div><div class="gateway-routing-guide"><span><ha-icon icon="mdi:signal"></ha-icon><strong>1. Nejlepší signál</strong><small>Vybere se nejsilnější gateway, která displej vidí.</small></span><ha-icon icon="mdi:chevron-right"></ha-icon><span><ha-icon icon="mdi:router-wireless-settings"></ha-icon><strong>2. Kontrola vytížení</strong><small>Obsazená gateway obsluhuje pouze jeden displej.</small></span><ha-icon icon="mdi:chevron-right"></ha-icon><span><ha-icon icon="mdi:call-split"></ha-icon><strong>3. Bezpečná alternativa</strong><small>Volná gateway se použije od −80 dBm, jinak požadavek počká.</small></span></div>${this._renderGatewayCards()}${this._renderOtaResult()}${this._renderGatewayResult()}${shellEnd}`;
  },

  _normalizeGatewayIdentity(value) {
    return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\.$/, "");
  },

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
  },

  _effectiveViewMode(mode, count) {
    if (mode === "auto") return count > 8 ? "compact" : "large";
    return mode === "full" ? "large" : mode;
  },

  _renderDensityControl(scope, mode, count) {
    const options = [
      ["large", "mdi:view-grid-outline", "Velké"],
      ["compact", "mdi:view-grid-compact", "Malé"],
      ["list", "mdi:view-list", "Seznam"],
    ];
    const effective = this._effectiveViewMode(mode, count);
    return `<div class="density-toolbar">${options.map(([value, icon, label]) => `<button class="secondary density-btn ${effective === value ? "active" : ""}" data-view-scope="${scope}" data-view-mode="${value}" title="${label}" aria-label="${label}"><ha-icon icon="${icon}"></ha-icon></button>`).join("")}</div>`;
  },

  _topologyGroups(devices) {
    const groups = new Map();
    (this._gateways || []).forEach((gateway) => {
      const identity = gateway.id || gateway.gateway_id || gateway.host || gateway.name;
      if (!identity) return;
      const key = `gateway:${String(identity).trim().toLowerCase()}`;
      const gatewayId = gateway.id || gateway.gateway_id || identity;
      groups.set(key, {
        key,
        path: {
          type: "gateway",
          id: gatewayId,
          gateway_id: gatewayId,
          name: gateway.name || gateway.host || "DRATEK eInk gateway",
          host: gateway.host || "",
        },
        devices: [],
      });
    });
    (devices || []).forEach((device) => {
      const paths = device.paths || [];
      const preferred = device.preferred_path || null;
      const matchingPath = preferred
        ? paths.find((path) => path.type === preferred.type && String(path.id ?? "") === String(preferred.id ?? ""))
        : null;
      let path = matchingPath ? { ...preferred, ...matchingPath } : (preferred || paths[0] || null);
      if (device.gateway_selection === "manual" && device.selected_gateway_id === LOCAL_ROUTE_ID) {
        // Zamčeno na Bluetooth Home Assistantu - patří do lokální skupiny i tehdy,
        // když ho zrovna slyší nějaká gateway silněji.
        const measuredLocal = paths.find((candidate) => candidate.type === "local");
        path = { type: "local", name: "Home Assistant Bluetooth", ...measuredLocal };
      } else if (device.gateway_selection === "manual" && device.selected_gateway_id) {
        const gatewayId = String(device.selected_gateway_id);
        const configuredGateway = (this._gateways || []).find((gateway) => String(gateway.id) === gatewayId);
        const measuredPath = paths.find((candidate) =>
          candidate.type === "gateway"
          && String(candidate.id || candidate.gateway_id || "") === gatewayId
        );
        path = {
          type: "gateway",
          id: gatewayId,
          gateway_id: gatewayId,
          name: configuredGateway?.name || measuredPath?.name || configuredGateway?.host || "DRATEK eInk gateway",
          host: configuredGateway?.host || measuredPath?.host || "",
          ...measuredPath,
        };
      }
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
  },

  _renderTopology(devices, preparedGroups = null) {
    const groups = preparedGroups || this._topologyGroups(devices);
    if (!groups.length) {
      return `<div class="inspector-empty"><ha-icon icon="mdi:lan-disconnect"></ha-icon><p>Zatím není dostupný žádný displej.</p></div>`;
    }
    return `<div class="connection-map">${groups.map((group) => {
      const path = group.path;
      const local = path?.type === "local";
      const gateway = path?.type === "gateway";
      // Cíl zamčení: id gatewaye, nebo sentinel pro Bluetooth Home Assistantu.
      // Skupina bez trasy zůstává bez cíle - není kam displej připnout.
      const gatewayId = gateway ? String(path.id || path.gateway_id || "") : local ? LOCAL_ROUTE_ID : "";
      const name = path?.name || (local ? "Home Assistant Bluetooth" : "Bez dostupné trasy");
      const detail = local ? "Integrované Bluetooth / proxy" : gateway ? (path.host || "Wi-Fi gateway") : "Displej momentálně nemá známou cestu";
      // Hlavička gateway skupiny ukazuje přímo desku, na které gateway běží.
      const hubGateway = gateway ? (this._gateways || []).find((item) => String(item.id) === gatewayId) : null;
      const hubChip = String(hubGateway?.status?.chip || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const hubBoardPreview = BOARD_PREVIEWS[hubChip] || BOARD_PREVIEWS.esp32;
      return `<section class="connection-group ${gateway ? "is-gateway" : local ? "is-local" : "is-unavailable"}" ${gatewayId ? `data-topology-gateway="${this._escape(gatewayId)}"` : ""}>
        <div class="connection-hub">
          <span class="connection-hub-icon ${gateway ? "is-board" : ""}">${gateway ? hubBoardPreview : `<ha-icon icon="${local ? "mdi:home-assistant" : "mdi:lan-disconnect"}"></ha-icon>`}</span>
          <div class="connection-hub-copy"><small>${gateway ? "DRATEK gateway" : local ? "Home Assistant" : "Nedostupné"}</small><strong>${this._escape(name)}</strong><span>${gatewayId ? "Přetáhněte sem displej" : this._escape(detail)}</span></div>
          <span class="connection-count">${group.devices.length}</span>
        </div>
        <div class="connection-bus" aria-hidden="true"></div>
        <div class="connection-devices">${group.devices.length ? group.devices.map(({ device, rssi }) => {
          const address = String(device.address || "").toUpperCase();
          const manual = device.gateway_selection === "manual" && Boolean(device.selected_gateway_id);
          // Zámek visí na každém displeji: zamčený se kliknutím uvolní, odemčený se
          // kliknutím zamkne na gateway své skupiny. Mimo gateway není kam zamykat.
          const lockTarget = local ? "Bluetooth Home Assistantu" : "tuto gateway";
          const lockTitle = manual
            ? `Zamčeno na ${local ? "Bluetooth Home Assistantu" : "této gateway"} – kliknutím vrátíte automatický výběr`
            : gatewayId
              ? `Automatický výběr cesty – kliknutím zamknete displej na ${lockTarget}`
              : "Displej nemá dostupnou trasu, není ho kam zamknout";
          const writingJob = (this._queue?.jobs || []).find((job) =>
            job.status === "writing" && String(job.address || "").toUpperCase() === address
          );
          const recentlySucceededJob = writingJob ? null : (this._queue?.jobs || []).find((job) =>
            job.status === "succeeded"
            && String(job.address || "").toUpperCase() === address
            && Number(job.finished_at || 0) * 1000 >= Date.now() - 7000
          );
          return `<article class="connection-device ${manual ? "is-locked" : ""} ${writingJob ? "is-writing" : ""} ${recentlySucceededJob ? "is-uploaded" : ""}" draggable="true" data-topology-device="${this._escape(device.address)}" title="Přetáhnout na gateway">
            <span class="connection-device-thumb">${this._renderDevicePreview(device, "mini")}</span>
            <span class="connection-device-copy"><strong>${this._escape(this._deviceTitle(device))}</strong><small>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</small>${writingJob ? `<span class="connection-transfer-state writing"><ha-icon icon="mdi:progress-upload"></ha-icon>Právě se nahrává</span>` : recentlySucceededJob ? `<span class="connection-transfer-state uploaded"><ha-icon icon="mdi:check-circle"></ha-icon>Úspěšně nahráno · displej se vykresluje</span>` : ""}</span>
            <span class="connection-device-signal">${this._renderSignalBars(rssi)}<small class="signal-value ${this._signalClass(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</small><button class="connection-route-lock ${manual ? "is-locked" : "is-auto"}" draggable="false" data-topology-lock="${this._escape(device.address)}" data-topology-lock-gateway="${this._escape(gatewayId)}" data-topology-locked="${manual ? "1" : "0"}" ${manual || gatewayId ? "" : "disabled"} aria-label="${lockTitle}" title="${lockTitle}"><ha-icon icon="${manual ? "mdi:lock" : "mdi:lock-open-variant"}"></ha-icon></button></span>
          </article>`;
        }).join("") : gateway ? `<div class="connection-drop-empty"><ha-icon icon="mdi:drag-variant"></ha-icon><span>Přetáhněte sem displej</span></div>` : ""}</div>
      </section>`;
    }).join("")}</div>`;
  },

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
  },

  _renderFlashResult() {
    if (!this._flashResult) return "";
    const running = this._flashResult.ok === null || ["queued", "running"].includes(this._flashResult.status);
    const cls = running ? "warn" : this._flashResult.ok ? "good" : "bad";
    const message = running
      ? `Flash probiha: ${this._flashResult.status || "running"}`
      : this._flashResult.ok ? "ESP32 gateway byla flashnuta a Wi-Fi konfigurace odeslana." : `Flash selhal: ${this._flashResult.error || "neznamy problem"}`;
    const log = (this._flashResult.log || []).join("\n");
    return `<div class="send-result"><span class="pill ${cls}">${this._escape(message)}</span>${log ? `<pre class="gateway-log">${this._escape(log)}</pre>` : ""}</div>`;
  },

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
  },

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
  },

  _renderNoSerialPortsWarning() {
    if (!this._serialPortsLoaded || this._serialPorts.length) return "";
    return `<div class="send-result"><span class="pill bad">Nebyl nalezen zadny USB / serial port</span><p><strong>Pozor:</strong> ESP32 musi byt pripojene primo do hardwaru, na kterem bezi Home Assistant. Nestaci pripojit ESP32 do jineho pocitace v siti, ze ktereho Home Assistant jen spravujes. Pro flash firmware do gateway musi byt ESP32 fyzicky zapojene do USB portu HA stroje.</p></div>`;
  },

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
  },

  _gatewayConnectedDisplays(gateway) {
    const gatewayId = String(gateway?.id || "");
    const hosts = new Set([
      gateway?.host,
      gateway?.status?.ip,
      gateway?.status?.hostname,
    ].map((value) => this._normalizeGatewayIdentity(value)).filter(Boolean));
    return (this._result?.devices || []).filter((device) => {
      if (device.gateway_selection === "manual" && device.selected_gateway_id) {
        return String(device.selected_gateway_id) === gatewayId;
      }
      const path = device.preferred_path || null;
      return path?.type === "gateway"
        && (String(path.id || path.gateway_id || "") === gatewayId
          || hosts.has(this._normalizeGatewayIdentity(path.host)));
    });
  },

  _gatewayActiveJob(gateway) {
    const resource = `gateway:${String(gateway?.id || "")}`;
    return (this._queue?.jobs || []).find((job) =>
      job.resource === resource && ["queued", "writing"].includes(job.status)
    ) || null;
  },

  _formatGatewayUptime(value) {
    const seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
    if (!seconds) return "-";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  },

  _renderGatewayCards() {
    if (!this._gateways.length) {
      return `<div class="gateway-panel gateway-empty"><span><ha-icon icon="mdi:router-wireless-off"></ha-icon></span><div><h2>Zatím nemáte žádnou gateway</h2><p>Najděte ji v lokální síti, nebo připravte novou desku ESP32 přes USB.</p></div><button data-gateway-tab="discover"><ha-icon icon="mdi:radar"></ha-icon>Najít gateway</button></div>`;
    }
    return `<div class="gateway-card-grid">${this._gateways.map((gateway) => {
      const status = gateway.status || {};
      const online = status.ok === true;
      const unknown = status.ok === null || status.ok === undefined;
      const stateClass = online ? "online" : unknown ? "unknown" : "offline";
      const stateText = online ? "Online" : unknown ? "Neověřeno" : "Offline";
      const otaReady = online && status.ota_supported === true;
      const currentFirmware = CURRENT_GATEWAY_FIRMWARES.has(String(status.firmware || "").trim());
      const otaLabel = currentFirmware ? "Aktuální" : otaReady ? "Aktualizovat" : "Vyžaduje USB";
      const editing = this._editingGatewayId === gateway.id;
      const wifiRssi = Number(status.wifi_rssi);
      const chip = String(status.chip || "ESP32").toUpperCase().replace("ESP32S3", "ESP32-S3");
      // Náhled desky se řídí čipem hlášeným firmwarem; neznámý čip spadne na ESP32.
      const boardChip = String(status.chip || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const boardPreview = BOARD_PREVIEWS[boardChip] || BOARD_PREVIEWS.esp32;
      const webUrl = this._gatewayWebUrl(gateway);
      const displays = this._gatewayConnectedDisplays(gateway);
      const activeJob = this._gatewayActiveJob(gateway);
      const routingText = activeJob?.status === "writing"
        ? `Zapisuje do ${this._deviceTitle(activeJob)}`
        : activeJob ? `Ve frontě: ${this._deviceTitle(activeJob)}` : "Volná pro další displej";
      return `<article class="gateway-compact-card ${stateClass} ${activeJob ? "is-busy" : "is-free"}">
        <header class="gateway-compact-head"><span class="gateway-device-icon"><ha-icon icon="mdi:router-wireless"></ha-icon><i></i></span><div class="gateway-card-title">${editing
          ? `<div class="gateway-name-edit"><input data-gateway-name-input="${this._escape(gateway.id)}" value="${this._escape(this._gatewayNameDraft)}"><button class="icon-btn" data-gateway-name-save="${this._escape(gateway.id)}" title="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button><button class="icon-btn secondary" data-gateway-name-cancel title="Zrušit"><ha-icon icon="mdi:close"></ha-icon></button></div>`
          : `<strong>${this._escape(gateway.name)}</strong><span>${this._escape(status.hostname || gateway.host)}</span>`}</div><span class="gateway-state ${stateClass}"><i></i>${stateText}</span></header>
        <div class="gateway-routing-state ${activeJob ? "is-busy" : "is-free"}"><ha-icon icon="mdi:${activeJob ? "progress-upload" : "check-circle-outline"}"></ha-icon><span><small>Kapacita gatewaye</small><strong>${this._escape(routingText)}</strong></span></div>
        <div class="gateway-visual-slot">
          <div class="gateway-visual-board">${boardPreview}<strong>${this._escape(chip)}</strong></div>
          <div class="gateway-visual-caption"><span><ha-icon icon="mdi:tablet-dashboard"></ha-icon></span><div><strong>${displays.length} ${displays.length === 1 ? "připojený displej" : displays.length >= 2 && displays.length <= 4 ? "připojené displeje" : "připojených displejů"}</strong><small>${displays.length ? displays.slice(0, 4).map((device) => this._deviceTitle(device)).join(" · ") : "Připravená pro přiřazení v mapě"}</small></div></div>
        </div>
        <div class="gateway-address"><span class="gateway-address-icon"><ha-icon icon="mdi:ip-network-outline"></ha-icon></span><div class="gateway-address-copy"><small>IP adresa</small><strong>${this._escape(status.ip || gateway.host || "-")}</strong></div>${webUrl ? `<button class="gateway-address-open" data-gateway-open="${this._escape(webUrl)}" title="Otevřít web gatewaye"><ha-icon icon="mdi:open-in-new"></ha-icon></button>` : ""}</div>
        <div class="gateway-metrics">
          <div class="gateway-metric"><span class="gateway-metric-icon"><ha-icon icon="${Number.isFinite(wifiRssi) ? "mdi:wifi" : "mdi:wifi-off"}"></ha-icon></span><div><small>Wi-Fi signál</small><div class="gateway-metric-signal">${this._renderSignalBars(wifiRssi)}<strong class="${this._signalClass(wifiRssi)}">${Number.isFinite(wifiRssi) ? `${wifiRssi} dBm` : "-"}</strong></div></div></div>
          <div class="gateway-metric"><span class="gateway-metric-icon"><ha-icon icon="mdi:memory"></ha-icon></span><div><small>Firmware</small><strong>${this._escape(status.firmware || "-")}${currentFirmware ? ` <ha-icon class="gateway-metric-ok" icon="mdi:check-decagram"></ha-icon>` : ""}</strong></div></div>
        </div>
        <details class="gateway-diagnostics"><summary><ha-icon icon="mdi:information-outline"></ha-icon>Technické informace <ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="gateway-diagnostic-grid"><span><ha-icon icon="mdi:timer-outline"></ha-icon><div><small>Doba běhu</small><strong>${this._formatGatewayUptime(status.uptime_ms)}</strong></div></span><span><ha-icon icon="mdi:bluetooth"></ha-icon><div><small>BLE</small><strong>${status.ble_initialized === true ? "Aktivní" : status.ble_initialized === false ? "Čeká" : "-"}</strong></div></span><span><ha-icon icon="mdi:chip"></ha-icon><div><small>Volná paměť</small><strong>${this._escape(status.free_heap ?? "-")}</strong></div></span><span><ha-icon icon="mdi:restart"></ha-icon><div><small>Restart</small><strong>${this._escape(status.reset_reason || "-")}</strong></div></span></div></details>
        <footer class="gateway-compact-actions">
          <button data-gateway-ota="${this._escape(gateway.id)}" ${this._gatewayBusy || !otaReady || currentFirmware ? "disabled" : ""}><ha-icon icon="${currentFirmware ? "mdi:check-circle-outline" : "mdi:update"}"></ha-icon>${otaLabel}</button>
          <button class="secondary" data-gateway-scan="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:radar"></ha-icon>BLE scan</button>
          <button class="secondary" data-gateway-rename="${this._escape(gateway.id)}" ${this._gatewayBusy || editing ? "disabled" : ""}><ha-icon icon="mdi:pencil-outline"></ha-icon>Přejmenovat</button>
          <button class="secondary" data-gateway-refresh="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Status</button>
          <button class="danger gateway-action-danger" data-gateway-delete="${this._escape(gateway.id)}" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat gateway</button>
        </footer>
      </article>`;
    }).join("")}</div>`;
  },

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
  },

  _renderGatewayDevices(devices) {
    return `<table><thead><tr><th>Adresa</th><th>Nazev</th><th>RSSI</th><th>DRATEK</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.address || "")}</td><td>${this._escape(device.name || "")}</td><td>${this._escape(device.rssi ?? "")}</td><td>${device.dratek ? "ano" : "ne"}</td></tr>`).join("")}</tbody></table>`;
  },
};
