import { CURRENT_GATEWAY_FIRMWARES } from "./panel-constants.js";

// Desky, na které umíme nahrát gateway firmware. Klíč `chip` musí sedět
// s FLASH_PROFILES v gateway.py, jinak backend flash odmítne.
// Musí sedět s LOCAL_ROUTE_ID v const.py - pod tímhle klíčem se ukládá zamčení
// displeje na Bluetooth adaptér Home Assistantu místo na gateway.
export const LOCAL_ROUTE_ID = "local";

export const GATEWAY_BOARDS = [
  {
    chip: "esp32",
    name: "ESP32",
    subtitle: "Vývojová deska 2,4GHz Wi-Fi + Bluetooth s anténou",
    badge: "Standard",
    badgeClass: "muted",
    specs: "Classic WROOM • 2.4GHz Wi-Fi • BLE 4.2",
    icon: "mdi:chip",
    firmware: "Firmware pro ESP32 / WROOM",
  },
  {
    chip: "esp32s3",
    name: "ESP32-S3",
    subtitle: "Vývojový modul Wi-Fi a BLE 5.0, s pinovou lištou v balení",
    badge: "Doporučeno",
    badgeClass: "featured",
    specs: "16MB Flash • Dual-Core 240MHz • BLE 5.0",
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
    const statusBadge = ports.length
      ? `<span class="port-status-badge is-connected"><i class="dot"></i>${ports.length} ${ports.length === 1 ? "port nalezen" : "porty nalezeny"}</span>`
      : `<span class="port-status-badge is-disconnected"><i class="dot"></i>Žádný port</span>`;
    return `<div class="port-picker-card ${ports.length ? "" : "is-empty"}">
      <div class="port-picker-visual">
        ${USB_PREVIEW}
        ${statusBadge}
      </div>
      <div class="port-picker-field">
        <div class="port-picker-label-row">
          <label for="flashPort">USB / Sériový port</label>
        </div>
        <div class="field-with-icon">
          <ha-icon icon="mdi:usb-port" class="field-icon"></ha-icon>
          <select id="flashPort" ${ports.length ? "" : "disabled"}>${ports.length
            ? ports.map((port) => `<option value="${this._escape(port.device)}" ${port.device === this._flashForm.port ? "selected" : ""}>${this._escape(port.device)} — ${this._escape(port.description || port.name || "")}</option>`).join("")
            : `<option value="">Žádný port nenalezen</option>`}</select>
        </div>
        <small class="port-picker-hint"><ha-icon icon="${ports.length ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${hint}</small>
      </div>
    </div>`;
  },

  _selectedGatewayBoard() {
    return GATEWAY_BOARDS.find((board) => board.chip === this._flashForm.chip) || GATEWAY_BOARDS[1];
  },

  _renderGatewayBoardPicker() {
    return `<div class="board-picker-grid" role="radiogroup" aria-label="Typ ESP32 desky">${GATEWAY_BOARDS.map((board) => {
      const selected = this._flashForm.chip === board.chip;
      return `<div class="board-card ${selected ? "is-selected" : ""} ${board.badgeClass === "featured" ? "is-featured" : ""}">
        ${board.badge ? `<span class="board-tag ${board.badgeClass}">${this._escape(board.badge)}</span>` : ""}
        <div class="board-card-visual">${BOARD_PREVIEWS[board.chip] || ""}</div>
        <div class="board-card-info">
          <strong>${this._escape(board.name)}</strong>
          <small class="board-subtitle">${this._escape(board.subtitle)}</small>
          ${board.specs ? `<span class="board-specs-pill">${this._escape(board.specs)}</span>` : ""}
        </div>
        <div class="board-card-actions">
          <button class="board-option-pick ${selected ? "primary" : "secondary"}" role="radio" aria-checked="${selected ? "true" : "false"}" data-flash-chip="${board.chip}" ${this._gatewayBusy ? "disabled" : ""}>
            <ha-icon icon="${selected ? "mdi:check-circle" : "mdi:radiobox-blank"}"></ha-icon>
            ${selected ? "Vybráno" : "Vybrat desku"}
          </button>
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

  _renderGatewayInstallPanel(selectedBoard) {
    const portReady = Boolean(this._flashForm.port);
    const wifiReady = Boolean(this._flashForm.ssid);
    const ready = portReady && wifiReady;
    const check = (ok, icon, label) => `<span class="${ok ? "is-ready" : "is-missing"}"><ha-icon icon="mdi:${ok ? "check-circle" : icon}"></ha-icon>${label}</span>`;
    return `<section class="gateway-panel gateway-install-panel">
      <div class="gateway-step-header"><span class="step-num">4</span><div><strong>Instalace a diagnostika</strong><small>Poslední kontrola a bezpečné nahrání gatewaye</small></div></div>
      <div class="gateway-install-overview">
        <div class="gateway-install-placeholder ${this._gatewayBusy ? "is-busy" : ""}">
          <div class="placeholder-icon-wrap"><ha-icon icon="${this._gatewayBusy ? "mdi:sync" : ready ? "mdi:check-decagram-outline" : "mdi:progress-alert"}" class="${this._gatewayBusy ? "spin" : ""}"></ha-icon></div>
          <div class="placeholder-info"><small>Vybraná deska</small><strong>${this._escape(selectedBoard.name)}</strong><span class="board-target-tag"><ha-icon icon="mdi:memory"></ha-icon>${this._escape(selectedBoard.firmware)}</span></div>
        </div>
        <div class="gateway-install-checks" aria-label="Připravenost instalace">
          ${check(portReady, "usb-port", portReady ? "USB port připraven" : "Vyberte USB port")}
          ${check(wifiReady, "wifi-alert", wifiReady ? "Wi-Fi údaje vyplněny" : "Doplňte Wi-Fi síť")}
          ${check(true, "memory", `${selectedBoard.name} vybrána`)}
        </div>
      </div>
      <div class="gateway-install-actions">
        <button id="flashGateway" class="gateway-cta-primary" ${this._gatewayBusy || !ready ? "disabled" : ""}><ha-icon icon="mdi:chip"></ha-icon><span><strong>Nahrát firmware</strong><small>Nainstaluje firmware i nastavení Wi-Fi</small></span><ha-icon class="gateway-cta-arrow" icon="mdi:arrow-right"></ha-icon></button>
        <div class="gateway-install-sub-actions">
          <button id="serialWifi" class="secondary" ${this._gatewayBusy || !ready ? "disabled" : ""}><ha-icon icon="mdi:wifi-cog"></ha-icon><span><strong>Jen Wi-Fi</strong><small>Bez změny firmwaru</small></span></button>
          <button id="serialStatus" class="secondary" ${this._gatewayBusy || !portReady ? "disabled" : ""}><ha-icon icon="mdi:console-line"></ha-icon><span><strong>Ověřit USB</strong><small>Diagnostika připojení</small></span></button>
        </div>
      </div>
      ${this._renderFlashResult()}${this._renderSerialResult()}
    </section>`;
  },

  _renderGatewayWorkspace() {
    // Svislý rail v levém sloupci. Nelepí se na výšku obsahu jako dřív - drží se
    // nahoře (align-self:start + sticky), takže při rolování jde s sebou.
    const tab = (key, icon, label, hint, count = null) =>
      `<button class="${this._gatewaySubtab === key ? "active" : ""}" data-gateway-tab="${key}" aria-current="${this._gatewaySubtab === key ? "page" : "false"}">
        <span class="gateway-tab-icon"><ha-icon icon="${icon}"></ha-icon></span>
        <span class="gateway-tab-copy"><strong>${label}</strong><small>${hint}</small></span>
        ${Number(count) ? `<span class="gateway-tab-count">${count}</span>` : ""}
      </button>`;
    const tabs = `<nav class="gateway-workspace-tabs" aria-label="Správa gatewayí">
      ${tab("manage", "mdi:router-wireless-settings", "Moje gatewaye", "Stav, displeje a aktualizace", this._gateways.length)}
      ${tab("discover", "mdi:access-point-network", "Najít v síti", "Automatické vyhledání přes mDNS", this._gatewayDiscovery.length)}
      ${tab("create", "mdi:usb-flash-drive-outline", "Nová gateway", "Instalace firmware přes USB")}
    </nav>`;
    const shellStart = `<div class="gateway-workspace">${tabs}<section class="gateway-workspace-content">`;
    const shellEnd = `</section></div>`;
    if (this._gatewaySubtab === "discover") {
      return `${shellStart}<div class="gateway-view-head"><p>Panel vyhledá zařízení s DRATEK firmwarem v lokální síti přes mDNS.</p><div class="gateway-view-actions"><button id="discoverGateways" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:access-point-network"></ha-icon>${this._gatewayBusy ? "Vyhledávám…" : "Spustit hledání"}</button><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>Obnovit</button></div></div><div class="gateway-panel">${this._renderDiscoveredGateways()}</div>${this._renderGatewayResult()}${shellEnd}`;
    }
    if (this._gatewaySubtab === "create") {
      const selectedBoard = this._selectedGatewayBoard();
      return `${shellStart}<div class="gateway-create-block">
        <div class="gateway-hero-head"><div class="gateway-hero-title"><span class="hero-icon-badge"><ha-icon icon="mdi:usb-flash-drive"></ha-icon></span><div><h2>Nová gateway přes USB</h2><p>Vyberte připojení, desku a Wi-Fi. Potom nahrajte připravený firmware.</p></div></div><div class="gateway-view-actions"><button id="refreshSerialPorts" class="secondary refresh-ports-btn" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:usb-port" class="${this._gatewayBusy ? "spin" : ""}"></ha-icon>Načíst porty</button></div></div>
        ${this._renderNoSerialPortsWarning()}
        <div class="gateway-setup-grid"><div class="gateway-setup-column gateway-setup-left">
          <section class="gateway-setup-section gateway-usb-section"><div class="gateway-step-header"><span class="step-num">1</span><div><strong>Připojení přes USB</strong><small>Port desky připojené k Home Assistantu</small></div></div>${this._renderGatewayPortPicker()}</section>
          <section class="gateway-setup-section gateway-network-section"><div class="gateway-step-header"><span class="step-num">3</span><div><strong>Síťové nastavení</strong><small>Údaje se nahrají bezpečně přes USB</small></div></div><div class="gateway-form-fields"><div class="field"><label for="flashHostname"><ha-icon icon="mdi:dns-outline"></ha-icon>Název gatewaye</label><input id="flashHostname" value="${this._escape(this._flashForm.hostname)}" placeholder="dratek-eink-gateway-dilna"></div><div class="field"><label for="flashSsid"><ha-icon icon="mdi:wifi"></ha-icon>Wi-Fi SSID</label><input id="flashSsid" value="${this._escape(this._flashForm.ssid)}" placeholder="Název Wi-Fi sítě"></div><div class="field"><label for="flashPassword"><ha-icon icon="mdi:lock-outline"></ha-icon>Wi-Fi heslo</label><input id="flashPassword" type="password" value="${this._escape(this._flashForm.password)}" placeholder="Heslo k Wi-Fi síti"></div></div></section>
        </div><div class="gateway-setup-column gateway-setup-right">
          <section class="gateway-setup-section gateway-board-section"><div class="gateway-step-header"><span class="step-num">2</span><div><strong>Vyberte typ desky</strong><small>Dvě podporované varianty gateway firmwaru</small></div></div>${this._renderGatewayBoardPicker()}</section>
          ${this._renderGatewayInstallPanel(selectedBoard)}
        </div></div>
      </div>${shellEnd}`;
    }
    // Návod ke směrování je dokumentace, ne stav - drží se sbalený, aby nad
    // kartami netrůnil natrvalo.
    return `${shellStart}<div class="gateway-view-head"><details class="gateway-routing-guide"><summary><ha-icon icon="mdi:sitemap-outline"></ha-icon>Jak se vybírá trasa</summary><div class="gateway-routing-steps"><span><ha-icon icon="mdi:signal"></ha-icon><strong>1. Nejlepší signál</strong><small>Vybere se nejsilnější gateway, která displej vidí.</small></span><span><ha-icon icon="mdi:router-wireless-settings"></ha-icon><strong>2. Kontrola vytížení</strong><small>Obsazená gateway obsluhuje pouze jeden displej.</small></span><span><ha-icon icon="mdi:call-split"></ha-icon><strong>3. Bezpečná alternativa</strong><small>Volná gateway se použije od −80 dBm, jinak požadavek počká.</small></span></div></details><div class="gateway-view-actions"><button id="refreshGateways" class="secondary" ${this._gatewayBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this._gatewayBusy ? "Obnovuji…" : "Obnovit stav"}</button></div></div>${this._renderGatewayCards()}${this._renderOtaResult()}${this._renderGatewayResult()}${shellEnd}`;
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
      // Hlavička nese stav trasy, ne návod. Výzva k přetažení se ukáže až při
      // vlastním tažení (.is-drag-over) a v prázdné skupině, kde má co dělat.
      // Skupina může vzniknout i z trasy, kterou hlásí displej, aniž by ta gateway
      // byla v seznamu - takovou nehlásíme jako nedostupnou, jen jako neregistrovanou.
      const hubKnown = gateway ? Boolean(hubGateway) : local;
      const hubOnline = gateway ? Boolean(hubGateway?.status?.ok) : local;
      const hubWifi = Number(hubGateway?.status?.wifi_rssi);
      const hubStateLabel = local
        ? "Lokální adaptér"
        : !hubKnown ? "Není v seznamu gatewayí" : hubOnline ? "Online" : "Nedostupná";
      const hubMeta = [
        gateway || local
          ? `<span class="connection-hub-state ${!hubKnown ? "is-unknown" : hubOnline ? "is-online" : "is-offline"}"><i></i>${hubStateLabel}</span>`
          : "",
        gateway && path.host ? `<span title="${this._escape(path.host)}"><ha-icon icon="mdi:ip-network-outline"></ha-icon>${this._escape(path.host)}</span>` : "",
        gateway && Number.isFinite(hubWifi) ? `<span><ha-icon icon="mdi:wifi"></ha-icon>${hubWifi} dBm</span>` : "",
        gateway || local ? "" : `<span>${this._escape(detail)}</span>`,
      ].filter(Boolean).join("");
      const hubCountLabel = `${group.devices.length} ${group.devices.length === 1 ? "displej" : group.devices.length < 5 ? "displeje" : "displejů"} na této trase`;
      return `<section class="connection-group ${gateway ? "is-gateway" : local ? "is-local" : "is-unavailable"}" ${gatewayId ? `data-topology-gateway="${this._escape(gatewayId)}"` : ""}>
        <div class="connection-hub">
          <span class="connection-hub-icon ${gateway ? "is-board" : ""}">${gateway ? hubBoardPreview : `<ha-icon icon="${local ? "mdi:home-assistant" : "mdi:lan-disconnect"}"></ha-icon>`}</span>
          <div class="connection-hub-copy"><small>${gateway ? "DRATEK gateway" : local ? "Home Assistant" : "Nedostupné"}</small><strong>${this._escape(name)}</strong><span class="connection-hub-meta">${hubMeta}</span>${gatewayId ? `<span class="connection-hub-drop"><ha-icon icon="mdi:tray-arrow-down"></ha-icon>Pustit sem displej</span>` : ""}</div>
          <span class="connection-count" title="${hubCountLabel}">${group.devices.length}</span>
        </div>
        <div class="connection-bus" aria-hidden="true"><span></span></div>
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
    const statusText = running ? "Probíhá nahrávání..." : this._flashResult.ok ? "Dokončeno" : "Chyba";
    const message = running
      ? `Flash probíhá: ${this._flashResult.status || "running"}`
      : this._flashResult.ok ? "ESP32 gateway byla úspěšně flashnuta a Wi-Fi konfigurace odeslána." : `Flash selhal: ${this._flashResult.error || "neznámý problém"}`;
    const log = (this._flashResult.log || []).join("\n");
    return `<div class="gateway-terminal-window">
      <div class="terminal-header">
        <span class="terminal-dots"><i></i><i></i><i></i></span>
        <span class="terminal-title"><ha-icon icon="mdi:console-line"></ha-icon>Konzole nahrávání firmware</span>
        <span class="pill ${cls}">${statusText}</span>
      </div>
      <div class="terminal-status-msg ${cls}">
        <ha-icon icon="${running ? "mdi:sync" : this._flashResult.ok ? "mdi:check-circle" : "mdi:alert-circle"}" class="${running ? "spin" : ""}"></ha-icon>
        <span>${this._escape(message)}</span>
      </div>
      ${log ? `<pre class="gateway-log">${this._escape(log)}</pre>` : ""}
    </div>`;
  },

  _renderSerialResult() {
    if (!this._serialResult) return "";
    const running = this._serialResult.ok === null;
    const cls = running ? "warn" : this._serialResult.ok ? "good" : "bad";
    const statusText = running ? "Ověřuji USB..." : this._serialResult.ok ? "Odpověď přijata" : "Bez odpovědi";
    const payload = this._serialResult.payload || {};
    const message = running
      ? "Čekám na odpověď ESP32 přes USB serial..."
      : this._serialResult.ok ? "ESP32 odpovídá přes USB serial." : `USB diagnostika selhala: ${this._serialResult.error || "bez odpovědi"}`;
    const facts = payload && Object.keys(payload).length
      ? `<div class="terminal-facts">
          <span><ha-icon icon="mdi:chip"></ha-icon>FW ${this._escape(payload.firmware || "-")}</span>
          <span><ha-icon icon="mdi:wifi"></ha-icon>SSID ${this._escape(payload.stored_ssid || "-")}</span>
          <span class="${payload.wifi_connected ? "good" : "warn"}"><ha-icon icon="mdi:ip-network"></ha-icon>${payload.wifi_connected ? `IP ${this._escape(payload.ip || "-")}` : "Wi-Fi neobsazeno"}</span>
          <span><ha-icon icon="mdi:signal"></ha-icon>RSSI ${this._escape(payload.wifi_rssi ?? "-")}</span>
        </div>`
      : "";
    const log = (this._serialResult.log || []).join("\n");
    return `<div class="gateway-terminal-window">
      <div class="terminal-header">
        <span class="terminal-dots"><i></i><i></i><i></i></span>
        <span class="terminal-title"><ha-icon icon="mdi:console-network"></ha-icon>Sériová diagnostika USB</span>
        <span class="pill ${cls}">${statusText}</span>
      </div>
      <div class="terminal-status-msg ${cls}">
        <ha-icon icon="${running ? "mdi:sync" : this._serialResult.ok ? "mdi:check-circle" : "mdi:alert-circle"}" class="${running ? "spin" : ""}"></ha-icon>
        <span>${this._escape(message)}</span>
      </div>
      ${facts}
      ${log ? `<pre class="gateway-log">${this._escape(log)}</pre>` : ""}
    </div>`;
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
    return `<div class="gateway-alert-card gateway-alert-compact is-warning">
      <span class="alert-icon-wrap"><ha-icon icon="mdi:usb-port-down"></ha-icon></span>
      <div><strong>USB port nebyl nalezen</strong><small>Připojte ESP32 datovým kabelem přímo ke stroji s Home Assistantem a zvolte Načíst porty.</small></div>
    </div>`;
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
      const routingAvailable = online && !activeJob;
      // Úloha nese jen adresu. Bez dohledání displeje by karta ukazovala holou
      // MAC, zatímco fronta i mapa na stejný displej píšou jeho název.
      const activeAddress = String(activeJob?.address || "").toUpperCase();
      const activeDevice = activeJob
        ? (this._result?.devices || []).find((item) => String(item.address || "").toUpperCase() === activeAddress)
        : null;
      const activeTitle = activeDevice ? this._deviceTitle(activeDevice) : activeAddress;
      const routingText = !online
        ? "Nedostupná – nelze přes ni zapisovat"
        : activeJob?.status === "writing"
        ? `Zapisuje do ${activeTitle}`
        : activeJob ? `Ve frontě: ${activeTitle}` : "Volná pro další displej";
      const routingClass = activeJob ? "is-busy" : routingAvailable ? "is-free" : "is-unavailable";
      const displayNames = displays.slice(0, 3).map((device) => this._deviceTitle(device)).join(" · ");
      // Deska drží celý levý sloupec, vpravo jde identita -> kapacita -> fakta ->
      // akce. Dřív byla karta sedm bloků nad sebou a přerostla 690 px.
      const fact = (icon, label, value, extra = "") =>
        `<div class="gateway-fact"><ha-icon icon="${icon}"></ha-icon><div><small>${label}</small><strong>${value}</strong></div>${extra}</div>`;
      const iconAction = (attr, icon, label, cls = "", disabled = false) =>
        `<button class="gateway-icon-action ${cls}" data-gateway-${attr}="${this._escape(gateway.id)}" title="${label}" aria-label="${label}" ${disabled ? "disabled" : ""}><ha-icon icon="${icon}"></ha-icon></button>`;
      // Karta shora dolů: obrázek desky, pod ním informace, dole tlačítka.
      return `<article class="gateway-compact-card ${stateClass} ${routingClass}">
        <div class="gateway-card-board">
          <span class="gateway-state ${stateClass}"><i></i>${stateText}</span>
          <div class="gateway-card-board-art">${boardPreview}</div>
          <strong class="gateway-card-chip">${this._escape(chip)}</strong>
        </div>
        <div class="gateway-card-body">
          <header class="gateway-card-head"><div class="gateway-card-title">${editing
            ? `<div class="gateway-name-edit"><input data-gateway-name-input="${this._escape(gateway.id)}" value="${this._escape(this._gatewayNameDraft)}"><button class="icon-btn" data-gateway-name-save="${this._escape(gateway.id)}" title="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button><button class="icon-btn secondary" data-gateway-name-cancel title="Zrušit"><ha-icon icon="mdi:close"></ha-icon></button></div>`
            : `<strong>${this._escape(gateway.name)}</strong><span>${this._escape(status.hostname || gateway.host)}</span>`}</div></header>
          <div class="gateway-routing-state ${routingClass}"><ha-icon icon="mdi:${activeJob ? "progress-upload" : routingAvailable ? "check-circle-outline" : "router-wireless-off"}"></ha-icon><span><small>Kapacita gatewaye</small><strong>${this._escape(routingText)}</strong></span></div>
          <div class="gateway-facts">
            ${fact("mdi:ip-network-outline", "IP adresa", this._escape(status.ip || gateway.host || "-"), webUrl ? `<button class="gateway-fact-open" data-gateway-open="${this._escape(webUrl)}" title="Otevřít web gatewaye" aria-label="Otevřít web gatewaye"><ha-icon icon="mdi:open-in-new"></ha-icon></button>` : "")}
            ${fact(Number.isFinite(wifiRssi) ? "mdi:wifi" : "mdi:wifi-off", "Wi-Fi signál", `<span class="gateway-fact-signal">${this._renderSignalBars(wifiRssi)}<span class="${this._signalClass(wifiRssi)}">${Number.isFinite(wifiRssi) ? `${wifiRssi} dBm` : "-"}</span></span>`)}
            ${fact("mdi:memory", "Firmware", `${this._escape(status.firmware || "-")}${currentFirmware ? `<ha-icon class="gateway-fact-ok" icon="mdi:check-decagram" title="Aktuální firmware"></ha-icon>` : ""}`)}
            ${fact("mdi:tablet-dashboard", displays.length === 1 ? "Připojený displej" : "Připojené displeje", `${displays.length}${displayNames ? ` <em>${this._escape(displayNames)}${displays.length > 3 ? ` +${displays.length - 3}` : ""}</em>` : ` <em>Připravená pro přiřazení v mapě</em>`}`)}
          </div>
          <details class="gateway-diagnostics"><summary><ha-icon icon="mdi:information-outline"></ha-icon>Technické informace<ha-icon class="gateway-diagnostics-caret" icon="mdi:chevron-down"></ha-icon></summary><div class="gateway-diagnostic-grid"><span><ha-icon icon="mdi:timer-outline"></ha-icon><div><small>Doba běhu</small><strong>${this._formatGatewayUptime(status.uptime_ms)}</strong></div></span><span><ha-icon icon="mdi:bluetooth"></ha-icon><div><small>BLE</small><strong>${status.ble_initialized === true ? "Aktivní" : status.ble_initialized === false ? "Čeká" : "-"}</strong></div></span><span><ha-icon icon="mdi:chip"></ha-icon><div><small>Volná paměť</small><strong>${this._escape(status.free_heap ?? "-")}</strong></div></span><span><ha-icon icon="mdi:restart"></ha-icon><div><small>Restart</small><strong>${this._escape(status.reset_reason || "-")}</strong></div></span></div></details>
        </div>
        <footer class="gateway-card-actions">
          <button class="gateway-ota-action" data-gateway-ota="${this._escape(gateway.id)}" ${this._gatewayBusy || !otaReady || currentFirmware ? "disabled" : ""}><ha-icon icon="${currentFirmware ? "mdi:check-circle-outline" : "mdi:update"}"></ha-icon>${otaLabel}</button>
          <div class="gateway-icon-actions">
            ${iconAction("scan", "mdi:radar", "Spustit BLE scan", "", this._gatewayBusy)}
            ${iconAction("rename", "mdi:pencil-outline", "Přejmenovat gateway", "", this._gatewayBusy || editing)}
            ${iconAction("refresh", "mdi:refresh", "Načíst stav gatewaye", "", this._gatewayBusy)}
            ${iconAction("delete", "mdi:trash-can-outline", "Smazat gateway", "is-danger", this._gatewayBusy)}
          </div>
        </footer>
      </article>`;
    }).join("")}</div>`;
  },

  _renderGatewayDevices(devices) {
    return `<table><thead><tr><th>Adresa</th><th>Nazev</th><th>RSSI</th><th>DRATEK</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.address || "")}</td><td>${this._escape(device.name || "")}</td><td>${this._escape(device.rssi ?? "")}</td><td>${device.dratek ? "ano" : "ne"}</td></tr>`).join("")}</tbody></table>`;
  },
};
