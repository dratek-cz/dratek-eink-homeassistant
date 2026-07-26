import { CURRENT_GATEWAY_FIRMWARES } from "./panel-constants.js";

export const gatewayMixin = {


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
      if (!this._flashForm.port && this._serialPorts.length) this._flashForm.port = this._serialPorts[0].device;
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
    return mode === "auto" ? (count > 8 ? "compact" : "full") : mode;
  },

  _renderDensityControl(scope, mode, count) {
    const options = [
      ["full", "mdi:view-dashboard", "Plné"],
      ["large", "mdi:view-grid-outline", "Velké"],
      ["compact", "mdi:view-grid-compact", "Malé"],
      ["list", "mdi:view-list", "Seznam"],
    ];
    const effective = this._effectiveViewMode(mode, count);
    return `<div class="density-toolbar"><span>Zobrazení</span><div class="density-switch">${options.map(([value, icon, label]) => `<button class="${effective === value ? "active" : ""}" data-view-scope="${scope}" data-view-mode="${value}" title="${label}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("")}</div></div>`;
  },

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
    return (this._result?.devices || []).filter((device) => (device.paths || []).some((path) =>
      path.type === "gateway"
      && (String(path.id || "") === gatewayId || hosts.has(this._normalizeGatewayIdentity(path.host)))));
  },

  _formatGatewayUptime(value) {
    const seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
    if (!seconds) return "-";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
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
