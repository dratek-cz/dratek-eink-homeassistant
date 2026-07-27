import { DRATEK_EINK_VERSION } from "./panel-constants.js";

export const devicesMixin = {


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
  },

  _deviceAddressSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => String(device.address || "").toUpperCase())
      .filter(Boolean)
      .sort()
      .join("|");
  },

  _devicePresenceSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => `${String(device.address || "").toUpperCase()}:${device.temporarily_unseen ? "stale" : "seen"}`)
      .sort()
      .join("|");
  },

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
  },

  _device() {
    const devices = this._result ? this._result.devices : [];
    return devices.find((device) => device.address === this._selectedDeviceAddress) || null;
  },

  _deviceTitle(device) {
    if (!device) return "Neni vybran displej";
    return device.display_name || device.physical_code || device.address;
  },

  async _saveDeviceName(address, name = this._deviceNameDraft) {
    const device = (this._result?.devices || []).find((item) => item.address === address);
    if (!device || !this._hass) return;
    this._deviceNameDraft = String(name ?? "");
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
  },

  _selectPreferredRoute(device) {
    const preferred = device && device.preferred_path;
    this._selectedGatewayId = preferred && preferred.type === "gateway" ? preferred.id : "";
  },

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
  },

  _displaySize(device = this._device()) {
    const size = this._baseDisplaySize(device);
    return this._orientation === "portrait"
      ? { width: Math.min(size.width, size.height), height: Math.max(size.width, size.height) }
      : { width: Math.max(size.width, size.height), height: Math.min(size.width, size.height) };
  },

  _isPe29Device(device = this._device()) {
    return !!device && [40, 43, 46, 48, 51].includes(Number(device.sdk_type));
  },

  _isLarge400Device(device = this._device()) {
    if (!device) return false;
    const size = this._baseDisplaySize(device);
    return Math.max(size.width, size.height) === 400 && Math.min(size.width, size.height) === 300;
  },

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
  },

  _setDisplayTransform(transform) {
    const valid = this._transformOptions().some(([value]) => value === transform);
    this._displayTransform = valid ? transform : "rotate_cw";
    this._scheduleDraftSave();
  },

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
  },

  _renderTransformSelector(device) {
    if (!this._isPe29Device(device)) return "";
    const options = this._transformOptions()
      .map(([value, label]) => `<option value="${this._escape(value)}" ${this._displayTransform === value ? "selected" : ""}>${this._escape(label)}</option>`)
      .join("");
    return `<div class="transform-box"><div class="field"><label>Mapování 2,9&quot; displeje</label><select id="displayTransform">${options}</select></div><small>Pokud je obraz na PE29 posunutý, otočený nebo zrcadlený, změňte tuto volbu a návrh znovu odešlete. Volba se ukládá ke konkrétní BLE adrese displeje.</small></div>`;
  },

  _devicePreviewSize(device) {
    const address = String(device.address || "").toUpperCase();
    const draft = this._deviceDrafts[address] || null;
    const base = this._baseDisplaySize(device);
    const portrait = draft?.orientation === "portrait";
    const sourceWidth = Math.max(1, Number(draft?.width || (portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height))));
    const sourceHeight = Math.max(1, Number(draft?.height || (portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height))));
    return { width: sourceWidth, height: sourceHeight, draft };
  },

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
  },

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
    const large400Layout = this._isLarge400Device(device);
    const frameRatio = large400Layout
      ? (portraitLayout ? 898 / 1039 : 1039 / 898)
      : Math.max(0.48, Math.min(3.7, (sourceWidth / sourceHeight) * (portraitLayout ? 0.95 : 1 / 0.95)));
    const previewWidth = Math.max(sizing.minWidth, Math.min(sizing.maxWidth, Math.round(sizing.targetHeight * frameRatio)));
    const previewFrameRadius = Math.max(4, Math.min(18, Math.round(Math.min(previewWidth, previewWidth / frameRatio) * 0.06)));
    const pe29Layout = this._isPe29Device(device);
    const physicalCode = device.physical_code || "00.00.00.00";
    return `<div class="device-preview-wrap preview-${previewMode}">
      <div class="device-preview-fit" style="--frame-ratio:${frameRatio.toFixed(4)};--preview-width:${previewWidth}px;--device-frame-radius:${previewFrameRadius}px">
        <div class="device-preview-bezel ${pe29Layout ? "device-preview-pe29" : ""} ${large400Layout ? "device-preview-large400" : ""} ${portraitLayout ? "device-preview-portrait" : "device-preview-landscape"}" title="Náhled ${this._escape(sourceWidth)} × ${this._escape(sourceHeight)}">
          ${large400Layout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="device-preview-identification"><span class="device-preview-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, portraitLayout)}</span>` : `<span class="device-preview-code">${this._escape(physicalCode)}</span>`}
          <div class="device-preview-screen">
            <canvas data-device-preview="${this._escape(address)}" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}" width="${canvasWidth}" height="${canvasHeight}"></canvas>
            ${draft ? "" : `<div class="device-preview-empty"><span><ha-icon icon="mdi:image-outline"></ha-icon>Prázdný návrh</span></div>`}
          </div>
        </div>
      </div>
    </div>`;
  },

  _deviceMatchesSearch(device, query) {
    const size = this._devicePreviewSize(device);
    const haystack = [
      device.display_name,
      device.model,
      device.address,
      device.physical_code,
      `${size.width}x${size.height}`,
      `${size.width}×${size.height}`,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  },

  _renderDeviceCards(devices, selectedAddress) {
    if (!devices.length) {
      return `<div class="empty-state"><img class="empty-logo" src="/dratek_eink_panel/dratek-eink-logo.png?v=${DRATEK_EINK_VERSION}" alt="DRATEK.CZ eInk"><h2>${this._loading ? "Hledám displeje v okolí" : "V okolí zatím není žádný displej"}</h2><p>${this._loading ? "Scan se spustil automaticky po otevření panelu." : "Hledání můžeš kdykoliv zopakovat tlačítkem Obnovit."}</p></div>`;
    }
    const query = String(this._deviceSearchQuery || "").trim().toLowerCase();
    const filtered = query ? devices.filter((device) => this._deviceMatchesSearch(device, query)) : devices;
    if (!filtered.length) {
      return `<div class="empty-state"><ha-icon icon="mdi:magnify-close"></ha-icon><h2>Žádný displej neodpovídá hledání</h2><p>Zkus jiný název, adresu nebo velikost, případně vyhledávání resetuj.</p></div>`;
    }
    const mode = this._effectiveViewMode(this._deviceViewMode, filtered.length);
    return `<div class="display-grid density-${mode}">${filtered.map((device) => {
      const selected = device.address === selectedAddress;
      const battery = this._batteryInfo(device);
      const rssi = Number(device.rssi);
      const paths = device.paths || [];
      const preferredPath = paths[0];
      const previewSize = this._devicePreviewSize(device);
      const temporarilyUnseen = !!device.temporarily_unseen;
      const editing = this._editingDeviceAddress === device.address;
      const writingJob = (this._queue?.jobs || []).find((job) =>
        job.status === "writing"
        && String(job.address || "").toUpperCase() === String(device.address || "").toUpperCase()
      );
      return `<article class="display-tile ${selected ? "selected" : ""} ${temporarilyUnseen ? "is-stale" : ""} ${writingJob ? "is-writing" : ""}" data-device-card-open="${this._escape(device.address)}" role="button" tabindex="0" aria-label="Vybrat ${this._escape(this._deviceTitle(device))}">
        <header class="display-tile-header">
          <span class="display-online-dot ${temporarilyUnseen ? "stale" : ""}" title="${temporarilyUnseen ? "Displej nebyl zachycen v posledním krátkém skenu" : "Displej je dostupný"}"></span>
          <div class="display-tile-identity ${editing ? "is-editing" : ""}">${editing ? `<input class="display-name-inline" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Například Kuchyň" aria-label="Název displeje">` : `<strong>${this._escape(this._deviceTitle(device))}</strong>`}<span>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</span></div>
          ${editing ? `<button class="tile-icon-btn tile-save-name-btn" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>` : `<button class="tile-icon-btn" data-device-rename="${this._escape(device.address)}" title="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}" aria-label="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}
          ${mode === "list" ? `<span class="display-resolution"><ha-icon icon="mdi:aspect-ratio"></ha-icon>${previewSize.width} × ${previewSize.height}</span>` : ""}
          ${writingJob ? `<div class="display-writing-state" role="status" aria-live="polite"><ha-icon icon="mdi:progress-upload"></ha-icon><strong>Právě se nahrává</strong><span>${this._escape(writingJob.transport_name || writingJob.operation || "Zápis do displeje")}</span></div>` : ""}
        </header>
        ${mode === "list" ? "" : `<div class="display-preview-slot">${this._renderDevicePreview(device, mode)}</div>`}
        <div class="display-health">
          <div class="display-health-item display-battery-item" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}${Number.isFinite(battery.voltage) ? ` · ${this._formatBatteryVoltage(battery.voltage)}` : ""}">${this._renderBatterySegments(battery.percent)}<strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></div>
          <div class="display-health-item display-signal-item" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">${this._renderSignalBars(rssi)}<strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
          <div class="display-health-item display-health-route ${temporarilyUnseen ? "stale" : ""}">
            <span class="health-route-icons"><ha-icon class="health-icon" icon="${temporarilyUnseen ? "mdi:bluetooth-off" : preferredPath?.type === "local" ? "mdi:bluetooth-connect" : "mdi:router-wireless"}"></ha-icon>${!temporarilyUnseen && preferredPath?.type !== "local" ? `<ha-icon class="health-icon health-icon-sub" icon="mdi:bluetooth" title="Displej je za gatewayí připojen přes BLE"></ha-icon>` : ""}</span>
            <span class="health-route-text"><small>Připojeno</small><strong>${temporarilyUnseen ? "Čekám na signál" : this._escape(preferredPath?.name || "Nedostupné")}</strong></span>
          </div>
        </div>
        <footer class="display-tile-actions">
          <button data-select-device="${this._escape(device.address)}"><ha-icon icon="mdi:vector-square-edit"></ha-icon>Otevřít v designeru</button>
        </footer>
      </article>`;
    }).join("")}</div>`;
  },

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
  },

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
  },

  _formatBatteryVoltage(voltage) {
    if (!Number.isFinite(voltage)) return "-";
    const decimals = Math.abs(voltage * 10 - Math.round(voltage * 10)) < 0.000001
      ? 1
      : Math.abs(voltage * 100 - Math.round(voltage * 100)) < 0.000001 ? 2 : 3;
    return `${voltage.toFixed(decimals).replace(".", ",")} V`;
  },

  _batteryPercent(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  },

  _batteryClass(value) {
    if (!Number.isFinite(value)) return "unknown";
    if (value >= 50) return "high";
    if (value >= 25) return "medium";
    return "low";
  },

  _batteryIconName(value) {
    if (!Number.isFinite(value)) return "mdi:battery-unknown";
    if (value <= 5) return "mdi:battery-alert-variant-outline";
    const step = Math.max(10, Math.min(90, Math.round(value / 10) * 10));
    return step >= 90 ? "mdi:battery" : `mdi:battery-${step}`;
  },

  _batteryLevel(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value >= 75) return 4;
    if (value >= 50) return 3;
    if (value >= 25) return 2;
    return 1;
  },

  _renderBatterySegments(value) {
    const level = this._batteryLevel(value);
    const label = Number.isFinite(value) ? `Baterie ${Math.round(value)} %, ${level} ze 4 dílků` : "Stav baterie není dostupný";
    return `<div class="battery-segments level-${level}" role="img" aria-label="${label}" title="${label}">${[1, 2, 3, 4].map((cell) => `<span class="${cell <= level ? "on" : ""}"></span>`).join("")}</div>`;
  },

  _signalLevel(rssi) {
    if (!Number.isFinite(rssi)) return 0;
    if (rssi >= -55) return 4;
    if (rssi >= -68) return 3;
    if (rssi >= -80) return 2;
    return 1;
  },

  _signalClass(rssi) {
    const level = this._signalLevel(rssi);
    if (level >= 3) return "good-signal";
    if (level === 2) return "warn-signal";
    return "bad-signal";
  },

  _formatTime(timestamp) {
    if (!timestamp) return "-";
    return new Date(Number(timestamp) * 1000).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  },

  _formatDuration(started, finished) {
    if (!started || !finished) return "";
    return `${Math.max(0, Number(finished) - Number(started))} s`;
  },

  _renderSignalBars(rssi) {
    const level = this._signalLevel(rssi);
    const label = Number.isFinite(rssi) ? `Signál ${rssi} dBm, ${level} ze 4 dílků` : "Síla signálu není dostupná";
    return `<div class="signal-bars level-${level}" role="img" aria-label="${label}" title="${label}">${[1, 2, 3, 4].map((bar) => `<span class="${bar <= level ? "on" : ""}"></span>`).join("")}</div>`;
  },

  _renderBleDevices(devices) {
    if (!devices.length) return `<div style="color:var(--secondary-text-color);padding:10px 0">Home Assistant zatim nevratil zadne BLE zarizeni.</div>`;
    return `<table><thead><tr><th>Nazev</th><th>Adresa</th><th>RSSI</th><th>Manufacturer IDs</th><th>Services</th></tr></thead><tbody>${devices.map((device) => `<tr><td>${this._escape(device.name || "-")}</td><td>${this._escape(device.address)}</td><td>${this._escape(device.rssi ?? "")}</td><td>${this._escape((device.manufacturer_ids || []).join(", "))}</td><td>${this._escape((device.service_uuids || []).join(", "))}</td></tr>`).join("")}</tbody></table>`;
  },
};
