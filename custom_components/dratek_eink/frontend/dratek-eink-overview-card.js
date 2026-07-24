const DRATEK_EINK_OVERVIEW_VERSION = "0.1.98";
const DRATEK_EINK_PANEL_PATH = "/dratek-eink";
const overviewStore = {
  devices: [],
  gateways: [],
  loadingDevices: false,
  loadingGateways: false,
  error: "",
  loadedAt: 0,
  request: null,
  listeners: new Set(),
};

const notifyOverviewCards = () => {
  overviewStore.listeners.forEach((listener) => listener());
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const signalLevel = (rssi) => {
  const value = Number(rssi);
  if (!Number.isFinite(value)) return 0;
  if (value >= -55) return 4;
  if (value >= -67) return 3;
  if (value >= -75) return 2;
  return 1;
};

const signalTone = (rssi) => {
  const level = signalLevel(rssi);
  return level >= 4 ? "green" : level === 3 ? "yellow" : level === 2 ? "orange" : "red";
};

const batteryTone = (percent) => {
  const value = Number(percent);
  if (!Number.isFinite(value)) return "muted";
  if (value >= 60) return "green";
  if (value >= 35) return "yellow";
  if (value >= 15) return "orange";
  return "red";
};

const safeGatewayUrl = (gateway) => {
  const raw = String(gateway?.status?.ip || gateway?.host || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href.replace(/\/$/, "") : "";
  } catch (_err) {
    return "";
  }
};

class DratekEinkOverviewCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._devices = [];
    this._gateways = [];
    this._loadingDevices = false;
    this._loadingGateways = false;
    this._error = "";
    this._connected = false;
    this._loadedAt = 0;
    this._timer = null;
    this._syncOverview = () => {
      this._devices = overviewStore.devices;
      this._gateways = overviewStore.gateways;
      this._loadingDevices = overviewStore.loadingDevices;
      this._loadingGateways = overviewStore.loadingGateways;
      this._error = overviewStore.error;
      this._loadedAt = overviewStore.loadedAt;
      this._render();
    };
  }

  static getConfigElement() {
    return document.createElement("dratek-eink-overview-card-editor");
  }

  static getStubConfig() {
    return {
      title: "DRATEK eInk",
      max_displays: 6,
      show_gateways: true,
      refresh_interval: 60,
    };
  }

  setConfig(config) {
    this._config = {
      title: "DRATEK eInk",
      max_displays: 6,
      show_gateways: true,
      refresh_interval: 60,
      ...(config || {}),
    };
    this._render();
    this._scheduleRefresh();
  }

  set hass(value) {
    const firstConnection = !this._hass && value;
    this._hass = value;
    if (firstConnection) this._loadData();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._connected = true;
    overviewStore.listeners.add(this._syncOverview);
    this._syncOverview();
    this._render();
    this._loadData();
    this._scheduleRefresh();
  }

  disconnectedCallback() {
    this._connected = false;
    overviewStore.listeners.delete(this._syncOverview);
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = null;
  }

  getCardSize() {
    const displayRows = Math.ceil(Math.min(this._devices.length || 1, 6) / 2);
    return 2 + displayRows + (this._config.show_gateways === false ? 0 : 1);
  }

  getGridOptions() {
    return {
      columns: 12,
      rows: Math.max(3, this.getCardSize()),
      min_columns: 6,
      min_rows: 2,
    };
  }

  _refreshSeconds() {
    return Math.min(900, Math.max(30, Number(this._config.refresh_interval) || 60));
  }

  _scheduleRefresh() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = null;
    if (!this._connected) return;
    this._timer = window.setTimeout(async () => {
      await this._loadData(true);
      this._scheduleRefresh();
    }, this._refreshSeconds() * 1000);
  }

  async _loadData(force = false) {
    if (!this._hass || (!force && Date.now() - overviewStore.loadedAt < 15000)) return;
    if (overviewStore.request) {
      await overviewStore.request;
      this._syncOverview();
      return;
    }

    overviewStore.loadingDevices = true;
    overviewStore.loadingGateways = true;
    overviewStore.error = "";
    notifyOverviewCards();

    const gatewayRequest = this._hass.callWS({ type: "dratek_eink/gateways/list" })
        .then((result) => {
          overviewStore.gateways = Array.isArray(result?.gateways) ? result.gateways : [];
        })
        .catch((error) => {
          overviewStore.error = error?.message || String(error);
        })
        .finally(() => {
          overviewStore.loadingGateways = false;
          notifyOverviewCards();
        });

    overviewStore.request = (async () => {
      try {
        const result = await this._hass.callWS({ type: "dratek_eink/scan" });
        overviewStore.devices = Array.isArray(result?.devices) ? result.devices : [];
        overviewStore.loadedAt = Date.now();
      } catch (error) {
        overviewStore.error = error?.message || String(error);
      } finally {
        overviewStore.loadingDevices = false;
        notifyOverviewCards();
      }
      await gatewayRequest;
    })();
    try {
      await overviewStore.request;
    } finally {
      overviewStore.request = null;
      this._syncOverview();
    }
  }

  _deviceTitle(device) {
    return device?.display_name || device?.physical_code || device?.name || device?.address || "eInk displej";
  }

  _deviceSubtitle(device) {
    const size = String(device?.model || "").match(/(\d+)\s*x\s*(\d+)/i);
    return size ? `${size[1]} × ${size[2]} px` : device?.model || device?.address || "";
  }

  _renderSignal(rssi, compact = false) {
    const level = signalLevel(rssi);
    const tone = signalTone(rssi);
    const bars = [1, 2, 3, 4]
      .map((index) => `<i class="${index <= level ? "on" : ""}" style="height:${4 + index * 3}px"></i>`)
      .join("");
    return `<span class="signal ${tone}" title="${Number.isFinite(Number(rssi)) ? `${Number(rssi)} dBm` : "Signál neznámý"}">${bars}${compact ? "" : `<b>${Number.isFinite(Number(rssi)) ? `${Number(rssi)} dBm` : "—"}</b>`}</span>`;
  }

  _renderBattery(percent) {
    const value = Number(percent);
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
    const label = Number.isFinite(value) ? `${safeValue} %` : "—";
    return `<span class="battery-wrap ${batteryTone(value)}" title="Baterie ${label}"><span class="battery"><i style="width:${safeValue}%"></i></span><b>${label}</b></span>`;
  }

  _renderDevice(device) {
    const unseen = device?.temporarily_unseen === true;
    const address = device?.address || "";
    const route = device?.preferred_path?.type === "gateway"
      ? device.preferred_path.name || "Gateway"
      : "Home Assistant Bluetooth";
    return `<button class="display-item ${unseen ? "stale" : ""}" data-open-panel="${escapeHtml(address)}">
      <span class="display-miniature"><i></i><em></em></span>
      <span class="display-copy">
        <strong>${escapeHtml(this._deviceTitle(device))}</strong>
        <small>${escapeHtml(this._deviceSubtitle(device))}</small>
        <span class="route">${unseen ? "Dočasně mimo dosah" : escapeHtml(route)}</span>
      </span>
      <span class="display-health">
        <span class="metric"><small>Baterie</small>${this._renderBattery(device?.battery_percent)}</span>
        <span class="metric"><small>Signál</small>${this._renderSignal(device?.rssi)}</span>
      </span>
    </button>`;
  }

  _renderGateway(gateway) {
    const status = gateway?.status || {};
    const online = status.ok === true;
    const unknown = status.ok === null || status.ok === undefined;
    const stateClass = online ? "online" : unknown ? "unknown" : "offline";
    const stateLabel = online ? "Online" : unknown ? "Neověřeno" : "Offline";
    const url = safeGatewayUrl(gateway);
    return `<button class="gateway-item ${stateClass}" data-gateway-url="${escapeHtml(url)}" ${url ? "" : "disabled"}>
      <span class="gateway-board"><i></i><b>${String(status.chip || "ESP32").toUpperCase().replace("ESP32S3", "S3")}</b></span>
      <span class="gateway-copy"><strong>${escapeHtml(gateway?.name || "DRATEK gateway")}</strong><small>${escapeHtml(status.ip || gateway?.host || "Bez IP adresy")}</small></span>
      <span class="gateway-health">${this._renderSignal(status.wifi_rssi, true)}<b class="state">${stateLabel}</b></span>
    </button>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const maxDisplays = Math.min(20, Math.max(1, Number(this._config.max_displays) || 6));
    const visibleDevices = this._devices.slice(0, maxDisplays);
    const hiddenCount = Math.max(0, this._devices.length - visibleDevices.length);
    const showGateways = this._config.show_gateways !== false;
    const busy = this._loadingDevices || this._loadingGateways;
    const gatewayOnline = this._gateways.filter((gateway) => gateway?.status?.ok === true).length;

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font-family:var(--paper-font-body1_-_font-family,var(--ha-font-family,Arial,sans-serif));color:var(--primary-text-color)}
        *{box-sizing:border-box}button{font:inherit;color:inherit}
        ha-card{display:block;overflow:hidden;border-radius:var(--ha-card-border-radius,14px);background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:var(--ha-card-box-shadow,0 2px 10px rgba(0,0,0,.08))}
        .header{display:flex;align-items:center;gap:11px;padding:14px 16px;border-top:4px solid #00a2a5;border-bottom:1px solid var(--divider-color,#ddd);background:linear-gradient(115deg,rgba(0,162,165,.1),transparent 55%,rgba(255,107,0,.07))}
        .logo{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#00a2a5;color:#fff;font-weight:900;font-size:12px;box-shadow:0 6px 14px rgba(0,162,165,.22)}
        .title{min-width:0;flex:1}.title strong,.title small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.title strong{font-size:16px}.title small{margin-top:2px;color:var(--secondary-text-color,#6b7280);font-size:11px}
        .header-actions{display:flex;gap:5px}.icon-button{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid var(--divider-color,#ddd);border-radius:9px;background:var(--card-background-color,#fff);cursor:pointer}.icon-button:hover{border-color:#00a2a5;color:#007f82}.icon-button.loading{animation:pulse 1s ease-in-out infinite}
        .content{display:grid;gap:13px;min-width:0;padding:14px}.content section{min-width:0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.section-head strong{font-size:11px;letter-spacing:.06em;text-transform:uppercase}.count{padding:3px 7px;border-radius:999px;background:rgba(0,162,165,.1);color:#007f82;font-size:10px;font-weight:850}
        .display-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.display-item{display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;min-width:0;padding:10px;border:1px solid var(--divider-color,#ddd);border-radius:11px;background:var(--secondary-background-color,#f3f5f5);text-align:left;cursor:pointer;transition:border-color .16s ease,transform .16s ease}.display-item:hover{transform:translateY(-1px);border-color:rgba(0,162,165,.55)}.display-item.stale{border-color:rgba(245,158,11,.55);opacity:.78}
        .display-miniature{position:relative;display:block;width:52px;height:35px;border:4px solid #f7f7f7;border-radius:5px;background:#c9ccc4;box-shadow:0 0 0 1px #c9cdcd,0 3px 8px rgba(0,0,0,.1)}.display-miniature:before{content:"";position:absolute;left:6px;right:6px;top:5px;height:3px;background:#111;box-shadow:0 7px 0 #111,0 14px 0 #e02822}.display-miniature i{position:absolute;right:-7px;top:13px;width:3px;height:7px;border-radius:2px;background:#00a2a5}.display-miniature em{display:none}
        .display-copy{min-width:0}.display-copy strong,.display-copy small,.route{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.display-copy strong{font-size:12px}.display-copy small{margin-top:3px;color:var(--secondary-text-color,#6b7280);font-size:9px}.route{margin-top:5px;color:#007f82;font-size:8px;font-weight:800}.stale .route{color:#b45309}
        .display-health{display:grid;grid-template-columns:1fr 1fr;gap:6px}.metric{display:grid;justify-items:center;gap:4px;min-width:58px}.metric>small{color:var(--secondary-text-color,#6b7280);font-size:8px;font-weight:750}
        .battery-wrap{display:grid;justify-items:center;gap:3px}.battery-wrap b,.signal b{font-size:8px}.battery{position:relative;display:block;width:28px;height:13px;padding:2px;border:2px solid currentColor;border-radius:3px}.battery:after{content:"";position:absolute;right:-5px;top:3px;width:3px;height:5px;border-radius:0 2px 2px 0;background:currentColor}.battery i{display:block;height:100%;min-width:2px;border-radius:1px;background:currentColor}.green{color:#169b4a}.yellow{color:#b58a00}.orange{color:#ef7d00}.red{color:#d5312f}.muted{color:#9ca3af}
        .signal{display:flex;align-items:flex-end;gap:2px;height:18px}.signal i{display:block;width:4px;border-radius:1px;background:currentColor;opacity:.18}.signal i.on{opacity:1}.signal b{align-self:center;margin-left:3px;color:var(--primary-text-color)}
        .gateway-list{display:flex;gap:7px;overflow:auto;padding-bottom:2px;scrollbar-width:none}.gateway-list::-webkit-scrollbar{display:none}.gateway-item{display:grid;grid-template-columns:35px minmax(90px,1fr) auto;align-items:center;gap:8px;min-width:220px;flex:1;padding:8px;border:1px solid var(--divider-color,#ddd);border-left:3px solid #9ca3af;border-radius:10px;background:var(--secondary-background-color,#f3f5f5);text-align:left;cursor:pointer}.gateway-item.online{border-left-color:#00a2a5}.gateway-item.offline{border-left-color:#d5312f}.gateway-item.unknown{border-left-color:#ef9d00}.gateway-item:disabled{cursor:default;opacity:.85}
        .gateway-board{position:relative;display:grid;place-items:center;width:27px;height:34px;border:3px solid #177d68;border-radius:5px;background:#159678;color:#fff}.gateway-board:before,.gateway-board:after{content:"";position:absolute;top:3px;bottom:3px;width:3px;background:repeating-linear-gradient(to bottom,#dbb954 0 3px,transparent 3px 6px)}.gateway-board:before{left:-6px}.gateway-board:after{right:-6px}.gateway-board i{position:absolute;left:5px;right:5px;top:4px;height:7px;border:1px solid #dce4dc}.gateway-board b{margin-top:7px;font-size:6px}.gateway-copy{min-width:0}.gateway-copy strong,.gateway-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gateway-copy strong{font-size:10px}.gateway-copy small{margin-top:3px;color:var(--secondary-text-color,#6b7280);font-size:8px}.gateway-health{display:grid;justify-items:end;gap:3px}.gateway-health .state{font-size:8px}.online .state{color:#07843c}.offline .state{color:#c62828}.unknown .state{color:#b56f00}
        .empty{display:grid;place-items:center;gap:5px;min-height:72px;padding:12px;border:1px dashed var(--divider-color,#ddd);border-radius:10px;color:var(--secondary-text-color,#6b7280);text-align:center}.empty strong{font-size:12px}.empty small{font-size:9px}.error{padding:8px 10px;border-radius:8px;background:rgba(213,49,47,.09);color:#bd2220;font-size:9px}.more{width:100%;padding:7px;border:0;background:transparent;color:#007f82;font-size:9px;font-weight:800;cursor:pointer}
        @keyframes pulse{50%{opacity:.45}}@media(max-width:700px){.display-grid{grid-template-columns:1fr}}@media(max-width:430px){.display-item{grid-template-columns:46px minmax(0,1fr)}.display-miniature{width:46px;height:31px}.display-health{grid-column:1/-1;justify-self:stretch;padding-top:7px;border-top:1px solid var(--divider-color,#ddd)}.gateway-item{min-width:205px}}
      </style>
      <ha-card>
        <div class="header">
          <span class="logo">DE</span>
          <span class="title"><strong>${escapeHtml(this._config.title || "DRATEK eInk")}</strong><small>${this._devices.length} displejů${showGateways ? ` · ${gatewayOnline}/${this._gateways.length} gatewayí online` : ""}</small></span>
          <span class="header-actions"><button class="icon-button ${busy ? "loading" : ""}" data-refresh title="Obnovit" aria-label="Obnovit">↻</button><button class="icon-button" data-open-panel title="Otevřít DRATEK eInk" aria-label="Otevřít DRATEK eInk">↗</button></span>
        </div>
        <div class="content">
          <section>
            <div class="section-head"><strong>Displeje</strong><span class="count">${this._devices.length}</span></div>
            <div style="height:8px"></div>
            ${visibleDevices.length ? `<div class="display-grid">${visibleDevices.map((device) => this._renderDevice(device)).join("")}</div>` : `<div class="empty"><strong>${this._loadingDevices ? "Načítám displeje…" : "Žádné displeje"}</strong><small>${this._loadingDevices ? "Probíhá BLE vyhledávání v Home Assistantu a gatewayích." : "Otevřete DRATEK eInk a ověřte dostupnost zařízení."}</small></div>`}
            ${hiddenCount ? `<button class="more" data-open-panel>+ ${hiddenCount} dalších displejů · zobrazit vše</button>` : ""}
          </section>
          ${showGateways ? `<section><div class="section-head"><strong>Gatewaye</strong><span class="count">${gatewayOnline}/${this._gateways.length}</span></div><div style="height:8px"></div>${this._gateways.length ? `<div class="gateway-list">${this._gateways.map((gateway) => this._renderGateway(gateway)).join("")}</div>` : `<div class="empty"><strong>${this._loadingGateways ? "Načítám gatewaye…" : "Žádné gatewaye"}</strong></div>`}</section>` : ""}
          ${this._error ? `<div class="error">Část údajů se nepodařilo načíst: ${escapeHtml(this._error)}</div>` : ""}
        </div>
      </ha-card>`;

    this.shadowRoot.querySelector("[data-refresh]")?.addEventListener("click", () => this._loadData(true));
    this.shadowRoot.querySelectorAll("[data-open-panel]").forEach((element) => {
      element.addEventListener("click", () => {
        window.history.pushState(null, "", DRATEK_EINK_PANEL_PATH);
        window.dispatchEvent(new Event("location-changed"));
      });
    });
    this.shadowRoot.querySelectorAll("[data-gateway-url]").forEach((element) => {
      element.addEventListener("click", () => {
        const url = element.dataset.gatewayUrl;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    });
  }
}

class DratekEinkOverviewCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  set hass(value) {
    this._hass = value;
  }

  _changed(key, value) {
    const config = { ...this._config, [key]: value };
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:grid;gap:14px;padding:8px 0;color:var(--primary-text-color);font-family:var(--ha-font-family,Arial,sans-serif)}
        label{display:grid;gap:6px;font-size:12px;font-weight:650}input,select{width:100%;padding:10px 11px;border:1px solid var(--divider-color,#ccc);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color);font:inherit}.toggle{display:flex;align-items:center;gap:9px}.toggle input{width:18px;height:18px}
      </style>
      <label>Název karty<input data-field="title" value="${escapeHtml(this._config.title || "DRATEK eInk")}"></label>
      <label>Maximální počet displejů<input data-field="max_displays" type="number" min="1" max="20" value="${Number(this._config.max_displays) || 6}"></label>
      <label>Obnovení údajů<select data-field="refresh_interval"><option value="30">30 sekund</option><option value="60">1 minuta</option><option value="120">2 minuty</option><option value="300">5 minut</option><option value="900">15 minut</option></select></label>
      <label class="toggle"><input data-field="show_gateways" type="checkbox" ${this._config.show_gateways === false ? "" : "checked"}> Zobrazit gatewaye</label>`;
    const refreshSelect = this.shadowRoot.querySelector('[data-field="refresh_interval"]');
    refreshSelect.value = String(Number(this._config.refresh_interval) || 60);
    this.shadowRoot.querySelector('[data-field="title"]').addEventListener("input", (event) => this._changed("title", event.target.value));
    this.shadowRoot.querySelector('[data-field="max_displays"]').addEventListener("change", (event) => this._changed("max_displays", Math.min(20, Math.max(1, Number(event.target.value) || 6))));
    refreshSelect.addEventListener("change", (event) => this._changed("refresh_interval", Number(event.target.value)));
    this.shadowRoot.querySelector('[data-field="show_gateways"]').addEventListener("change", (event) => this._changed("show_gateways", event.target.checked));
  }
}

if (!customElements.get("dratek-eink-overview-card")) {
  customElements.define("dratek-eink-overview-card", DratekEinkOverviewCard);
}
if (!customElements.get("dratek-eink-overview-card-editor")) {
  customElements.define("dratek-eink-overview-card-editor", DratekEinkOverviewCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "dratek-eink-overview-card")) {
  window.customCards.push({
    type: "dratek-eink-overview-card",
    name: "DRATEK eInk – přehled",
    description: "Kompaktní přehled displejů, baterií, signálu a gatewayí.",
    preview: true,
    documentationURL: "https://github.com/dratek-cz/dratek-eink-homeassistant",
  });
}

console.info(`DRATEK eInk overview card v${DRATEK_EINK_OVERVIEW_VERSION}`);
