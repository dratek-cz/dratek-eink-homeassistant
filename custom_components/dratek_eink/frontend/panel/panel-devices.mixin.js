import qrcode from "../qrcode-generator.js";
import { DRATEK_EINK_VERSION } from "./panel-constants.js";

export const devicesMixin = {


  async _scan({ background = false } = {}) {
    if (!this._hass || this._scanInProgress) return;
    this._scanInProgress = true;
    if (!background) {
      this._loading = true;
      this._error = "";
      this._renderKeepingSearchFocus();
    }
    try {
      const scannedResult = await this._hass.callWS({ type: "dratek_eink/scan" });
      const nextResult = this._mergeScanResult(scannedResult);
      this._saveCachedScanResult(nextResult);
      const changed = this._deviceAddressSignature(this._result) !== this._deviceAddressSignature(nextResult);
      const presenceChanged = this._devicePresenceSignature(this._result) !== this._devicePresenceSignature(nextResult);
      this._result = nextResult;
      if (!background || changed || presenceChanged) {
        this._renderKeepingSearchFocus();
        this._loadDevicePreviewDrafts(this._result.devices || []).then(() => {
          this._renderKeepingSearchFocus();
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
        this._renderKeepingSearchFocus();
      }
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

  async _saveDeviceGateway(address, gatewayId) {
    const device = (this._result?.devices || []).find((item) => item.address === address);
    if (!device || !this._hass) return;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/devices/set_gateway",
        address,
        gateway_id: gatewayId || "",
      });
      device.gateway_selection = result.gateway_selection;
      device.selected_gateway_id = result.gateway_id || "";
      const gatewayPaths = (device.paths || [])
        .filter((path) => path.type === "gateway")
        .sort((left, right) => Number(right.rssi ?? -999) - Number(left.rssi ?? -999));
      if (result.gateway_id) {
        const gateway = (this._gateways || []).find((item) => String(item.id) === String(result.gateway_id));
        device.preferred_path = gatewayPaths.find((path) => String(path.id) === String(result.gateway_id)) || {
          type: "gateway",
          id: result.gateway_id,
          name: result.transport_name || gateway?.name || gateway?.host || "DRATEK eInk gateway",
          rssi: null,
          unavailable: true,
        };
      } else {
        device.preferred_path = gatewayPaths[0] || (device.paths || [])[0] || null;
      }
      device.rssi = device.preferred_path?.rssi;
      this._selectPreferredRoute(device);
      this._render();
      this._paint();
    } catch (err) {
      this._error = this._message(err);
      this._render();
      this._paint();
    }
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

  // Geometrie rámečku displeje. Sdílí ji velký náhled na stránce displejů
  // i miniatura v mapě připojení, aby oba ukazovaly stejný tvar zařízení.
  _deviceFrameGeometry(device) {
    const { width: sourceWidth, height: sourceHeight, draft } = this._devicePreviewSize(device);
    const portraitLayout = sourceHeight > sourceWidth;
    const large400Layout = this._isLarge400Device(device);
    const base = this._baseDisplaySize(device);
    const baseWidth = Math.max(base.width, base.height);
    const baseHeight = Math.min(base.width, base.height);
    const frameRatio = large400Layout
      ? 1039 / 898
      : Math.max(0.48, Math.min(3.7, (baseWidth / baseHeight) / 0.95));
    const frameWidth = Math.max(150, Math.round(baseWidth / (large400Layout ? 0.77 : 0.76)));
    const frameHeight = Math.round(frameWidth / frameRatio);
    const frameRadius = Math.max(4, Math.min(28, Math.round(Math.min(frameWidth, frameHeight) * 0.06)));
    const outerWidth = portraitLayout ? frameHeight : frameWidth;
    const outerHeight = portraitLayout ? frameWidth : frameHeight;
    return { sourceWidth, sourceHeight, draft, portraitLayout, large400Layout, baseWidth, frameRatio, frameWidth, frameHeight, outerWidth, outerHeight, frameRadius };
  },

  _renderDevicePreview(device, mode = "full", options = {}) {
    const address = String(device.address || "").toUpperCase();
    const catalogWordmark = options.catalogWordmark === true;
    const previewSizes = {
      full: { targetHeight: 190, minWidth: 108, maxWidth: 420 },
      large: { targetHeight: 190, minWidth: 120, maxWidth: 420 },
      compact: { targetHeight: 112, minWidth: 92, maxWidth: 260 },
      mini: { targetHeight: 30, minWidth: 22, maxWidth: 76 },
      template: { targetHeight: 470, minWidth: 250, maxWidth: 620 },
    };
    const previewMode = previewSizes[mode] ? mode : "full";
    const sizing = previewSizes[previewMode];
    const geometry = this._deviceFrameGeometry(device);
    const { sourceWidth, sourceHeight, draft, portraitLayout, large400Layout, baseWidth } = geometry;
    const designerFrameRatio = geometry.frameRatio;
    const designerFrameWidth = geometry.frameWidth;
    const designerFrameHeight = geometry.frameHeight;
    const nativeOuterWidth = geometry.outerWidth;
    const nativeOuterHeight = geometry.outerHeight;
    const nativeOuterRatio = nativeOuterWidth / nativeOuterHeight;
    const previewWidth = Math.max(sizing.minWidth, Math.min(sizing.maxWidth, Math.round(sizing.targetHeight * nativeOuterRatio)));
    const designerFrameRadius = geometry.frameRadius;
    const pe29Layout = this._isPe29Device(device);
    const physicalCode = device.physical_code || "00.00.00.00";
    return `<div class="device-preview-wrap preview-${previewMode} ${catalogWordmark ? "catalog-device-preview" : ""}">
      <div class="device-preview-fit" style="--frame-ratio:${nativeOuterRatio.toFixed(4)};--preview-width:${previewWidth}px">
        <svg class="device-preview-designer-svg" viewBox="0 0 ${nativeOuterWidth} ${nativeOuterHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Náhled ${this._escape(sourceWidth)} × ${this._escape(sourceHeight)}">
          <foreignObject x="0" y="0" width="${nativeOuterWidth}" height="${nativeOuterHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="designer-device-stage device-preview-designer-copy designer-stage-${portraitLayout ? "portrait" : "landscape"}" style="--designer-stage-width:${nativeOuterWidth}px;--designer-stage-height:${nativeOuterHeight}px;--designer-frame-ratio:${designerFrameRatio.toFixed(4)};--designer-frame-width:${designerFrameWidth}px;--designer-frame-rotation:${portraitLayout ? "90deg" : "0deg"};--designer-screen-width:${sourceWidth}px;--designer-screen-height:${sourceHeight}px;--designer-body-width:${baseWidth}px;--device-frame-radius:${designerFrameRadius}px">
              <div class="designer-device-bezel ${pe29Layout ? "designer-device-pe29" : ""} ${large400Layout ? "designer-device-large400" : ""} designer-device-landscape">${large400Layout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, false)}</span>` : `<span class="designer-device-code">${this._escape(physicalCode)}</span>`}</div>
              <div class="designer-device-screen">
                <canvas data-device-preview="${this._escape(address)}" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}" width="${sourceWidth}" height="${sourceHeight}"></canvas>
                ${draft ? "" : catalogWordmark
                  ? `<div class="device-preview-empty catalog-eink-screen"><span class="catalog-eink-wordmark">Eink</span></div>`
                  : `<div class="device-preview-empty"><span><ha-icon icon="mdi:image-outline"></ha-icon>Prázdný návrh</span></div>`}
              </div>
            </div>
          </foreignObject>
        </svg>
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

  _renderDeviceCards(devices) {
    if (!devices.length) {
      return `<div class="empty-state"><img class="empty-logo" src="${this._frontendAssetUrl("dratek-eink-logo.png")}" alt="DRATEK.CZ eInk"><h2>${this._loading ? "Hledám displeje v okolí" : "V okolí zatím není žádný displej"}</h2><p>${this._loading ? "Scan se spustil automaticky po otevření panelu." : "Hledání můžeš kdykoliv zopakovat tlačítkem Obnovit."}</p></div>`;
    }
    const query = String(this._deviceSearchQuery || "").trim().toLowerCase();
    const filtered = query ? devices.filter((device) => this._deviceMatchesSearch(device, query)) : devices;
    if (!filtered.length) {
      return `<div class="empty-state"><ha-icon icon="mdi:magnify-close"></ha-icon><h2>Žádný displej neodpovídá hledání</h2><p>Zkus jiný název, adresu nebo velikost, případně vyhledávání resetuj.</p></div>`;
    }
    const mode = this._effectiveViewMode(this._deviceViewMode, filtered.length);
    return `<div class="display-grid density-${mode}">${filtered.map((device) => {
      const battery = this._batteryInfo(device);
      const rssi = Number(device.rssi);
      const paths = device.paths || [];
      const preferredPath = device.preferred_path || paths[0];
      const previewSize = this._devicePreviewSize(device);
      const temporarilyUnseen = !!device.temporarily_unseen;
      const editing = this._editingDeviceAddress === device.address;
      const writingJob = (this._queue?.jobs || []).find((job) =>
        job.status === "writing"
        && String(job.address || "").toUpperCase() === String(device.address || "").toUpperCase()
      );
      const recentlySucceededJob = writingJob ? null : (this._queue?.jobs || []).find((job) =>
        job.status === "succeeded"
        && String(job.address || "").toUpperCase() === String(device.address || "").toUpperCase()
        && Number(job.finished_at || 0) * 1000 >= Date.now() - 7000
      );
      const transferState = writingJob
        ? `<div class="display-writing-state" role="status" aria-live="polite"><ha-icon icon="mdi:progress-upload"></ha-icon><strong>Právě se nahrává</strong><span>${this._escape(writingJob.transport_name || writingJob.operation || "Zápis do displeje")}</span></div>`
        : recentlySucceededJob
          ? `<div class="display-uploaded-state" role="status" aria-live="polite"><ha-icon icon="mdi:check-circle"></ha-icon><strong>Úspěšně nahráno</strong><span>Displej se vykresluje</span></div>`
          : "";
      return `<article class="display-tile ${temporarilyUnseen ? "is-stale" : ""} ${writingJob ? "is-writing" : ""} ${recentlySucceededJob ? "is-uploaded" : ""}" data-device-card-settings="${this._escape(device.address)}" role="button" tabindex="0" aria-label="Upravit displej ${this._escape(this._deviceTitle(device))}">
        <header class="display-tile-header">
          <span class="display-online-dot ${temporarilyUnseen ? "stale" : ""}" title="${temporarilyUnseen ? "Displej nebyl zachycen v posledním krátkém skenu" : "Displej je dostupný"}"></span>
          <div class="display-tile-identity ${editing ? "is-editing" : ""}">${editing ? `<input class="display-name-inline" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Například Kuchyň" aria-label="Název displeje">` : `<strong>${this._escape(this._deviceTitle(device))}</strong>`}<span>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</span></div>
          ${editing ? `<button class="tile-icon-btn tile-save-name-btn" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>` : `<button class="tile-icon-btn" data-device-rename="${this._escape(device.address)}" title="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}" aria-label="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}
          ${mode === "list" ? `<span class="display-resolution"><ha-icon icon="mdi:aspect-ratio"></ha-icon>${previewSize.width} × ${previewSize.height}</span>` : ""}
          ${mode === "list" ? transferState : ""}
        </header>
        ${mode === "list" ? "" : `<div class="display-preview-slot">${transferState}${this._renderDevicePreview(device, mode)}</div>`}
        <div class="display-health">
          <div class="display-health-item display-battery-item" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}${Number.isFinite(battery.voltage) ? ` · ${this._formatBatteryVoltage(battery.voltage)}` : ""}">${this._renderBatterySegments(battery.percent)}<strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></div>
          <div class="display-health-item display-signal-item" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">${this._renderSignalBars(rssi)}<strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
          <div class="display-health-item display-health-route ${temporarilyUnseen ? "stale" : ""}">
            <span class="health-route-icons"><ha-icon class="health-icon" icon="${temporarilyUnseen ? "mdi:bluetooth-off" : preferredPath?.type === "local" ? "mdi:bluetooth-connect" : "mdi:router-wireless"}"></ha-icon>${!temporarilyUnseen && preferredPath?.type !== "local" ? `<ha-icon class="health-icon health-icon-sub" icon="mdi:bluetooth" title="Displej je za gatewayí připojen přes BLE"></ha-icon>` : ""}</span>
            <span class="health-route-text"><small>Připojeno</small><strong>${temporarilyUnseen ? "Čekám na signál" : this._escape(preferredPath?.name || "Nedostupné")}</strong></span>
          </div>
        </div>
        <div class="display-tile-actions">
          <button class="display-settings-button" data-device-settings="${this._escape(device.address)}"><ha-icon icon="mdi:cog-outline"></ha-icon>Upravit displej</button>
        </div>
      </article>`;
    }).join("")}</div>`;
  },

  _renderDisplaySettingsPage() {
    const device = this._device();
    if (!device) {
      return `<section class="display-settings-page">
        <div class="card display-settings-panel"><h1>Displej nebyl nalezen</h1><p>Vraťte se na hlavní stránku a vyberte dostupný displej.</p></div>
      </section>`;
    }
    if (!["templates", "designer"].includes(this._displaySettingsView)) this._displaySettingsView = "templates";
    return `<section class="display-settings-page">
      ${this._displaySettingsView === "templates" ? this._renderDisplayTemplatesSection(device) : ""}
      ${this._displaySettingsView === "designer" ? this._renderDisplayTemplateEditor(device) : ""}
      ${this._renderDisplayTemplateConflictDialog(device)}
    </section>`;
  },

  _renderDisplayTemplateConflictDialog(device) {
    const pending = this._pendingDisplayTemplateConflict;
    if (!pending?.templateId) return "";
    const templates = this._displayTemplateCards();
    const nextTemplate = templates.find((item) => item.id === pending.templateId);
    const currentTemplate = templates.find((item) => item.id === this._assignedDisplayTemplates(device)[0]);
    if (!nextTemplate) return "";
    return `<div class="modal-backdrop template-space-dialog-backdrop">
      <section class="template-space-dialog" role="dialog" aria-modal="true" aria-labelledby="templateSpaceDialogTitle">
        <span class="template-space-dialog-icon"><ha-icon icon="mdi:view-dashboard-edit-outline"></ha-icon></span>
        <div>
          <small>Nedostatek místa na displeji</small>
          <h2 id="templateSpaceDialogTitle">První šablona je nastavená jako velká</h2>
          <p>Šablona <strong>${this._escape(currentTemplate?.title || "První šablona")}</strong> zabírá celý displej. Chcete ji zmenšit a přidat <strong>${this._escape(nextTemplate.title)}</strong>, nebo ji novou šablonou nahradit?</p>
        </div>
        <div class="template-space-dialog-actions">
          <button type="button" class="template-space-shrink" data-template-conflict-action="shrink"><ha-icon icon="mdi:arrow-collapse-all"></ha-icon>Zmenšit a přidat</button>
          <button type="button" class="secondary" data-template-conflict-action="replace"><ha-icon icon="mdi:swap-horizontal"></ha-icon>Nahradit velkou šablonu</button>
          <button type="button" class="ghost" data-template-conflict-action="cancel">Zrušit</button>
        </div>
      </section>
    </div>`;
  },

  _displayDesignMode(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const draft = this._deviceDrafts?.[address] || null;
    const explicitMode = String(draft?.design_mode || draft?.designMode || "").toLowerCase();
    if (["templates", "custom", "ha"].includes(explicitMode)) return explicitMode;
    const objects = this._storedRecordList(draft?.objects);
    if (objects.some((object) => object.type === "layered" || object.customElementId || object.custom_element_id)) return "ha";
    const projectName = String(draft?.name || "").toLowerCase();
    if (projectName.startsWith("sablona ") || projectName.startsWith("šablona ") || projectName.startsWith("template ")) return "templates";
    return "custom";
  },

  _displayTemplateCards() {
    const templates = [
      { id: "weather", number: "01", category: "nature", title: "Počasí", variables: [["thermometer", "Teplota"], ["weather-partly-cloudy", "Stav počasí"], ["clock-outline", "Čas"], ["calendar-outline", "Datum"], ["weather-rainy", "Předpověď"]] },
      { id: "energy", number: "02", category: "energy", title: "Cena elektřiny", variables: [["currency-usd", "Aktuální cena"], ["clock-outline", "Cenový interval"], ["chart-line", "Denní průběh"], ["tag-outline", "Minimum dne"]] },
      { id: "home", number: "03", category: "home", title: "Dům", variables: [["thermometer", "Teplota"], ["water-percent", "Vlhkost"], ["lightbulb-on-outline", "Světla"], ["lock-outline", "Zámky"]] },
      { id: "waste", number: "04", category: "home", title: "Odpady", variables: [["trash-can-outline", "První svoz"], ["recycle", "Druhý svoz"], ["calendar-clock", "Termíny svozu"]] },
      { id: "solar", number: "05", category: "energy", title: "Fotovoltaika", variables: [["solar-power", "Aktuální výkon"], ["weather-sunny", "Výroba dnes"], ["calendar-month", "Výroba měsíc"], ["counter", "Výroba celkem"], ["leaf", "Úspora CO₂"]] },
      { id: "washer", number: "06", category: "home", title: "Pračka", variables: [["washing-machine", "Program"], ["timer-outline", "Zbývající čas"], ["clock-check-outline", "Čas dokončení"]] },
      { id: "living", number: "07", category: "home", title: "Obývák", variables: [["thermometer", "Teplota"], ["water-percent", "Vlhkost"], ["molecule-co2", "CO₂"]] },
      { id: "presence", number: "08", category: "home", title: "Kdo je doma", variables: [["account-group-outline", "Osoby"], ["home-account", "Přítomnost"], ["school-outline", "Stav osoby"], ["clock-outline", "Aktualizace"]] },
      { id: "wifi", number: "09", category: "information", title: "Wi-Fi", variables: [["wifi", "Název sítě"], ["key-outline", "Heslo"]] },
      { id: "calendar", number: "10", category: "information", title: "Kalendář", variables: [["calendar", "První událost"], ["calendar-multiple", "Druhá událost"], ["cake-variant-outline", "Svátek"]] },
      { id: "security", number: "11", category: "technology", title: "Zabezpečení", variables: [["shield-lock-outline", "Režim alarmu"], ["door-closed-lock", "Dveře"], ["window-closed", "Okna"], ["motion-sensor", "Pohyb"]] },
      { id: "transport", number: "12", category: "information", title: "Odjezdy", variables: [["map-marker-outline", "Zastávka"], ["tram", "Linky"], ["clock-fast", "Časy odjezdů"], ["walk", "Vzdálenost"]] },
      { id: "shopping", number: "13", category: "home", title: "Nákupní seznam", variables: [["format-list-checks", "Položky"], ["checkbox-marked-outline", "Splněné"], ["cart-outline", "Počet zbývajících"]] },
      { id: "air", number: "14", category: "nature", title: "Kvalita vzduchu", variables: [["air-filter", "AQI"], ["molecule-co2", "CO₂"], ["blur", "PM2.5"], ["water-percent", "Vlhkost"]] },
      { id: "thermostat", number: "15", category: "home", title: "Topení", variables: [["thermometer", "Teplota"], ["thermostat", "Cílová teplota"], ["fire", "Výkon topení"], ["clock-outline", "Další změna"]] },
      { id: "water", number: "16", category: "energy", title: "Spotřeba vody", variables: [["water", "Spotřeba dnes"], ["calendar-week", "Spotřeba týden"], ["calendar-month", "Spotřeba měsíc"], ["compare", "Porovnání"]] },
      { id: "parcel", number: "17", category: "information", title: "Zásilka", variables: [["package-variant", "Stav zásilky"], ["barcode", "Sledovací číslo"], ["map-marker-path", "Průběh dopravy"], ["clock-outline", "Čas doručení"]] },
      { id: "birthdays", number: "18", category: "information", title: "Narozeniny", variables: [["account", "Jméno"], ["numeric", "Věk"], ["calendar-star", "Další narozeniny"], ["gift-outline", "Připomínka"]] },
      { id: "server", number: "19", category: "technology", title: "Stav serveru", variables: [["server-network", "Dostupnost"], ["chip", "CPU"], ["memory", "RAM"], ["harddisk", "Disk"], ["thermometer", "Teplota"], ["clock-outline", "Doba provozu"]] },
      { id: "garden", number: "20", category: "nature", title: "Zahrada", variables: [["sprout-outline", "Záhon"], ["water-percent", "Vlhkost půdy"], ["thermometer", "Teplota"], ["weather-windy", "Vítr"], ["sprinkler-variant", "Další zálivka"]] },
    ];
    const prepared = new Set(["weather", "home", "solar", "living", "calendar", "security", "air", "thermostat", "server", "garden"]);
    return templates.map((template) => ({
      ...template,
      kind: prepared.has(template.id) ? "prepared" : "custom",
    }));
  },

  _displayTemplateSetupGuide(template) {
    if (template.id === "weather") {
      return [
        "Přetáhněte šablonu na náhled displeje vlevo.",
        "Aplikace automaticky najde první entitu weather.* v Home Assistantu.",
        "Teplota, stav počasí, datum a čas se doplní automaticky; zdroj lze později změnit v nastavení šablony.",
      ];
    }
    if (template.kind === "prepared") {
      return [
        "Přetáhněte šablonu na náhled displeje vlevo.",
        "Aplikace zkusí automaticky přiřadit odpovídající entity Home Assistantu.",
        "Po kliknutí na Nastavit můžete zkontrolovat nebo změnit každý zdroj dat.",
      ];
    }
    return [
      "Přetáhněte šablonu na náhled displeje vlevo.",
      "Klikněte na Nastavit a u jednotlivých údajů vyberte vlastní entity Home Assistantu.",
      "Zkontrolujte živý náhled a odešlete hotový obsah do displeje.",
    ];
  },

  _prepareDisplayTemplateBindings(template) {
    if (!template) return;
    this._displayTemplateBindings ||= {};
    const weatherEntity = template.id === "weather"
      ? Object.keys(this._hass?.states || {}).find((entityId) => entityId.startsWith("weather."))
      : "";
    template.variables.forEach((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      const key = `${template.id}:${meta.key}`;
      if (Object.prototype.hasOwnProperty.call(this._displayTemplateBindings, key)) return;
      if (meta.automatic) {
        this._displayTemplateBindings[key] = `internal:${meta.key}`;
        return;
      }
      const suggested = weatherEntity || this._suggestTemplateEntity(meta);
      if (suggested) this._displayTemplateBindings[key] = suggested;
    });
  },

  _renderDisplayTemplatePreview(template) {
    const icon = (name, className = "") => `<ha-icon class="${className}" icon="mdi:${name}"></ha-icon>`;
    const value = (index, fallback) => this._escape(this._templateDisplayValue(template, index, fallback));
    const percent = (index, fallback) => this._templatePercent(template, index, fallback);
    const energySeries = this._templateSeries(template, 2, [4, 2, 5, 8, 7, 11, 15, 13, 18, 14, 10, 12, 6, 9]);
    const energyMin = Math.min(...energySeries);
    const energyMax = Math.max(...energySeries);
    const energyRange = Math.max(1, energyMax - energyMin);
    const energyPoints = energySeries.map((value, index) => {
      const x = energySeries.length === 1 ? 0 : (index / (energySeries.length - 1)) * 180;
      const y = 60 - ((value - energyMin) / energyRange) * 48;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const waterSeries = this._templateSeries(template, 3, [42, 70, 52, 88, 61, 45, 73]);
    const waterMax = Math.max(1, ...waterSeries);
    const waterBars = waterSeries.slice(-9).map((value) => `<b style="height:${Math.max(8, Math.round((value / waterMax) * 92))}%"></b>`).join("");
    const wifiNetwork = this._templateDisplayValue(template, 0, "Home_Network");
    const wifiPassword = this._templateDisplayValue(template, 1, "MyPassword123");
    const wifiCode = qrcode(0, "M");
    wifiCode.addData(`WIFI:T:WPA;S:${wifiNetwork};P:${wifiPassword};;`);
    wifiCode.make();
    const wifiQr = wifiCode.createSvgTag(3, 0, "QR kód pro připojení k Wi-Fi", `Wi-Fi ${wifiNetwork}`);
    const previews = {
      weather: `<div class="tpl tpl-weather">
        ${icon("weather-partly-cloudy", "tpl-weather-icon")}
        <strong>${value(1, "Polojasno")}</strong><span>${value(3, "23. května")}</span><i></i><b>${value(2, "12:45")}</b><i></i>
        <em>${value(0, "23 °C")}</em><small>${icon("thermometer")} ${value(1, "Polojasno")}<br>${value(4, "24° / 13°")}</small>
        <footer><span>SO<br>${icon("weather-partly-cloudy")}<br>${value(4, "22°")}</span><span>NE<br>${icon("weather-sunny")}<br>25°</span><span>PO<br>${icon("weather-rainy")}<br>18°</span><span>ÚT<br>${icon("weather-cloudy")}<br>20°</span></footer>
      </div>`,
      energy: `<div class="tpl tpl-energy">
        <header>${icon("lightning-bolt", "tpl-red")}<span><strong>Cena elektřiny</strong><small>Kč / kWh</small></span></header><i></i>
        <em>${value(0, "2,45 Kč")}</em><span>${value(1, "12:00–13:00")}</span><span>Dnes</span>
        <svg viewBox="0 0 180 70" aria-hidden="true" data-template-chart="energy"><polyline points="${energyPoints}"></polyline></svg>
        <footer>${icon("tag")}<span>Nejlevnější dnes<br><b>${value(3, "2,45 Kč")}</b></span><small>${value(1, "12:00–13:00")}</small></footer>
      </div>`,
      home: `<div class="tpl tpl-home">
        <h3>Dům</h3>${icon("home", "tpl-home-icon tpl-red")}
        <ul><li>${icon("thermometer")}<span>${value(0, "21,5 °C")}</span></li><li>${icon("water")}<span>${value(1, "45 %")}</span></li><li>${icon("lightbulb-on")}<span>${value(2, "3 světla ON")}</span></li><li>${icon("lock")}<span>${value(3, "Vše zamčeno")}</span></li></ul><i></i>
        <footer>${icon("check-circle")}<strong>Všechno v pořádku</strong></footer>
      </div>`,
      waste: `<div class="tpl tpl-waste">
        <h3>Odpady</h3><section>${icon("trash-can-outline")}<span><b>${value(0, "ZÍTRA")}</b><strong>Plast</strong></span></section><i></i>
        <section>${icon("recycle")}<span><b>${value(1, "za 7 dní")}</b><strong>${value(2, "Papír")}</strong></span></section>
      </div>`,
      solar: `<div class="tpl tpl-solar">
        <header>${icon("weather-sunny-outline")}<span><strong>Fotovoltaika</strong><small>Aktuální výkon</small></span></header>
        ${icon("solar-power", "tpl-solar-icon")}<em>${value(0, "2,35 kW")}</em><i></i>
        <ul><li><span>Dnes</span><b>${value(1, "8,2 kWh")}</b></li><li><span>Tento měsíc</span><b>${value(2, "152 kWh")}</b></li><li><span>Celkem</span><b>${value(3, "3,45 MWh")}</b></li></ul>
        <footer>${icon("leaf")} Úspora CO₂: ${value(4, "125 kg")}</footer>
      </div>`,
      washer: `<div class="tpl tpl-washer">
        <h3>Pračka</h3>${icon("washing-machine", "tpl-washer-icon")}
        <label>Program</label><strong class="tpl-red">${value(0, "Bavlna 60°")}</strong><i></i>
        <section>${icon("clock-outline")}<span>Zbývá</span><b>${value(1, "01:15")}</b></section><i></i><footer>Skončí v ${value(2, "14:30")}</footer>
      </div>`,
      living: `<div class="tpl tpl-living">
        <h3>Obývák</h3><section>${icon("thermometer", "tpl-red")}<em>${value(0, "23,5 °C")}</em></section><i></i>
        <section>${icon("water")}<strong>Vlhkost: ${value(1, "40 %")}</strong></section><i></i><footer>CO₂: ${value(2, "650 ppm")}</footer>
      </div>`,
      presence: `<div class="tpl tpl-presence">
        <h3>Kdo je doma</h3>
        <ul><li>${icon("account")}<strong>${value(0, "Petr")}</strong>${icon("home", "tpl-red")}</li><li>${icon("account")}<strong>Jana</strong>${icon("home", "tpl-red")}</li><li>${icon("account")}<strong>Eliška</strong><b>${value(2, "Ve škole")}</b></li></ul>
        <footer>${icon("clock-outline")}<span>${value(1, "Poslední aktualizace")}<br><strong>${value(3, "12:45")}</strong></span></footer>
      </div>`,
      wifi: `<div class="tpl tpl-wifi">
        <h3>Wi-Fi</h3><span class="tpl-wifi-qr">${wifiQr}</span>
        <label>Síť</label><strong class="tpl-red">${this._escape(wifiNetwork)}</strong><i></i><label>Heslo</label><strong class="tpl-red">${this._escape(wifiPassword)}</strong><i></i>
        <footer>${icon("wifi")} Naskenuj pro připojení</footer>
      </div>`,
      calendar: `<div class="tpl tpl-calendar">
        <h3>Kalendář</h3>
        <section><span class="tpl-date">${icon("calendar-blank")}<b>23</b></span><span><b>PÁTEK</b><strong>${value(0, "Schůzka")}</strong><small>15:00</small></span></section><i></i>
        <section><span class="tpl-date">${icon("calendar-blank")}<b>24</b></span><span><b>SOBOTA</b><strong>${value(1, "Narozeniny")}</strong><small>Tomáš</small></span></section>
        <footer>${icon("cake-variant")}<span>Zítra má svátek<br><strong>${value(2, "Jana")}</strong></span></footer>
      </div>`,
      security: `<div class="tpl tpl-security">
        <h3>Zabezpečení</h3>${icon("shield-home", "tpl-security-icon")}
        <em>${value(0, "ZAPNUTO")}</em><span>Dům je zabezpečený</span><i></i>
        <ul><li>${icon("door-closed-lock")}<span>Dveře</span><b>${value(1, "Zamčeno")}</b></li><li>${icon("window-closed")}<span>Okna</span><b>${value(2, "Zavřeno")}</b></li><li>${icon("motion-sensor")}<span>Pohyb</span><b>${value(3, "Klid")}</b></li></ul>
        <footer>${icon("check-circle")} Všechny zóny v pořádku</footer>
      </div>`,
      transport: `<div class="tpl tpl-transport">
        <h3>Odjezdy</h3><header>${icon("tram")}<span><strong>${value(0, "Hlavní nádraží")}</strong><small>směr Centrum</small></span></header>
        <ul><li><b>${value(1, "9")}</b><span>Náměstí</span><em>${value(2, "3 min")}</em></li><li><b>4</b><span>Univerzita</span><em>8 min</em></li><li><b>12</b><span>Nemocnice</span><em>14 min</em></li></ul>
        <footer>${icon("walk")} Zastávka ${value(3, "240 m")}</footer>
      </div>`,
      shopping: `<div class="tpl tpl-shopping">
        <h3>Nákupní seznam</h3><ul><li>${icon("checkbox-marked")}<span>${value(0, "Mléko")}</span></li><li>${icon("checkbox-blank-outline")}<span>Chléb</span></li><li>${icon("checkbox-blank-outline")}<span>Jablka</span></li><li>${icon("checkbox-blank-outline")}<span>Káva</span></li><li>${icon("checkbox-blank-outline")}<span>${value(1, "Prací gel")}</span></li></ul>
        <footer>${icon("cart-outline")} ${value(2, "Zbývají 4 položky")}</footer>
      </div>`,
      air: `<div class="tpl tpl-air">
        <h3>Kvalita vzduchu</h3>${icon("air-filter", "tpl-air-icon")}<em>Výborná</em><strong>${value(0, "42 AQI")}</strong><i></i>
        <section><span>CO₂<b>${value(1, "612 ppm")}</b></span><span>PM2.5<b>${value(2, "8 µg/m³")}</b></span><span>Vlhkost<b>${value(3, "46 %")}</b></span></section>
        <footer>${icon("leaf")} Doporučeno nevětrat</footer>
      </div>`,
      thermostat: `<div class="tpl tpl-thermostat">
        <h3>Topení</h3>${icon("radiator", "tpl-thermostat-icon")}<label>Obývací pokoj</label><em>${value(0, "22,5 °C")}</em><span>Cílová teplota ${value(1, "23 °C")}</span>
        <div class="tpl-heat-scale"><i style="width:${percent(2, 48)}%"></i><b style="left:${percent(2, 48)}%"></b></div>
        <section><span>${icon("fire")} Topení aktivní</span><strong>${value(2, "48 %")}</strong></section>
        <footer>Další změna v ${value(3, "22:00")}</footer>
      </div>`,
      water: `<div class="tpl tpl-water">
        <h3>Spotřeba vody</h3>${icon("water-pump", "tpl-water-icon")}<em>${value(0, "126 l")}</em><span>Dnes</span>
        <section data-template-chart="water">${waterBars}</section>
        <ul><li><span>Tento týden</span><b>${value(1, "0,84 m³")}</b></li><li><span>Tento měsíc</span><b>${value(2, "3,12 m³")}</b></li></ul>
        <footer>${icon("trending-down")} ${value(3, "O 12 % méně než včera")}</footer>
      </div>`,
      parcel: `<div class="tpl tpl-parcel">
        <h3>Zásilka</h3>${icon("package-variant-closed", "tpl-parcel-icon")}<em>${value(0, "Na cestě")}</em><strong>${value(1, "RR 458 921 730 CZ")}</strong>
        <ol><li class="done"><b></b><span>Převzato dopravcem</span></li><li class="done"><b></b><span>Na depu Brno</span></li><li class="active"><b></b><span>${value(2, "Doručení dnes")}</span></li></ol>
        <footer>${icon("truck-delivery-outline")} ${value(3, "13:00–15:00")}</footer>
      </div>`,
      birthdays: `<div class="tpl tpl-birthdays">
        <h3>Narozeniny</h3>${icon("cake-variant", "tpl-birthday-icon")}<em>Dnes slaví</em><strong>${value(0, "Lucie")}</strong><span>${value(1, "32 let")}</span><i></i>
        <section><small>Další narozeniny</small><b>${value(2, "Tomáš")}</b><span>za 4 dny</span></section>
        <footer>${icon("gift-outline")} ${value(3, "Nezapomeň popřát")}</footer>
      </div>`,
      server: `<div class="tpl tpl-server">
        <h3>Stav serveru</h3><header>${icon("server-network")}<span><strong>Home server</strong><small>192.168.1.10</small></span><b>${value(0, "ONLINE")}</b></header>
        <section><span>CPU<b>${value(1, "24 %")}</b><i style="width:${percent(1, 24)}%"></i></span><span>RAM<b>${value(2, "61 %")}</b><i style="width:${percent(2, 61)}%"></i></span><span>Disk<b>${value(3, "73 %")}</b><i style="width:${percent(3, 73)}%"></i></span></section>
        <ul><li>${icon("thermometer")}<span>Teplota</span><b>${value(4, "48 °C")}</b></li><li>${icon("clock-outline")}<span>Provoz</span><b>${value(5, "18 dní")}</b></li></ul>
        <footer>${icon("check-network-outline")} Všechny služby běží</footer>
      </div>`,
      garden: `<div class="tpl tpl-garden">
        <h3>Zahrada</h3><header>${icon("flower")}<span><strong>${value(0, "Záhon rajčat")}</strong><small>Automatická závlaha</small></span></header>
        <em>Vlhkost ${value(1, "36 %")}</em><div class="tpl-moisture"><i style="width:${percent(1, 36)}%"></i></div>
        <section><span>${icon("weather-sunny")} ${value(2, "24 °C")}</span><span>${icon("water-percent")} ${value(1, "36 %")}</span><span>${icon("weather-windy")} ${value(3, "8 km/h")}</span></section>
        <i></i><strong>Další zalévání</strong><b>${value(4, "18:30 · 12 minut")}</b>
        <footer>${icon("sprinkler-variant")} Závlaha připravena</footer>
      </div>`,
    };
    return previews[template.id] || "";
  },

  _renderDisplayTemplateCatalogPreview(template, orientation) {
    const preview = this._renderDisplayTemplatePreview(template);
    return orientation === "landscape"
      ? preview.replace('class="tpl ', 'class="tpl tpl-landscape ')
      : preview;
  },

  _renderDisplayTemplatesSection(device) {
    const size = this._devicePreviewSize(device);
    const battery = this._batteryInfo(device);
    const rssi = Number(device.rssi);
    const editing = this._editingDeviceAddress === device.address;
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const assignedTemplates = this._assignedDisplayTemplates(device);
    const categories = [
      { id: "prepared", icon: "auto-fix", title: "Předpřipravené" },
      { id: "custom", icon: "tune-variant", title: "Vlastní nastavení" },
    ];
    const cards = this._displayTemplateCards();
    const query = String(this._displayTemplateSearchQuery || "").trim().toLocaleLowerCase("cs");
    const activeCategory = categories.some((category) => category.id === this._displayTemplateCategory)
      ? this._displayTemplateCategory
      : "prepared";
    const visibleCards = cards.filter((template) => {
      if (template.kind !== activeCategory) return false;
      if (!query) return true;
      const searchable = [template.title, ...template.variables.map(([, label]) => label)].join(" ").toLocaleLowerCase("cs");
      return searchable.includes(query);
    });
    const primaryTemplate = cards.find((item) => item.id === assignedTemplates[0]);
    const secondaryTemplate = cards.find((item) => item.id === assignedTemplates[1]) || primaryTemplate;
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const layout = largeDisplay && assignedTemplates.length > 1
      ? (["side-by-side", "stacked"].includes(this._displayTemplateLargeLayout) ? this._displayTemplateLargeLayout : "side-by-side")
      : "single";
    const previewZoom = Math.max(0.5, Math.min(1.8, Number(this._displayTemplatePreviewZoom || 1)));
    return `<section class="display-templates-inline">
      <div class="display-template-workspace">
        <aside class="card display-template-drop-panel">
          <div class="display-template-device-info">
            <span class="display-template-device-info-icon"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></span>
            <div class="display-template-device-info-identity">
              <div class="display-template-device-info-name-row">
                ${editing ? `<input class="display-settings-name-input" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Název displeje" aria-label="Název displeje"><button class="display-settings-name-button is-save" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>` : `<strong>${this._escape(this._deviceTitle(device))}</strong><span class="display-template-device-info-address">${this._escape(device.address)}</span><button class="display-settings-name-button" data-device-rename="${this._escape(device.address)}" title="Přejmenovat displej" aria-label="Přejmenovat displej"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}
              </div>
              <div class="display-template-device-info-health">
                <span class="display-health-item display-battery-item" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}">${this._renderBatterySegments(battery.percent)}<strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></span>
                <span class="display-health-item display-signal-item" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">${this._renderSignalBars(rssi)}<strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></span>
              </div>
            </div>
            <span class="display-template-device-info-workspace"><small>Váš displej</small><strong>Plocha pro šablony</strong></span>
            <span class="pill muted display-template-device-info-resolution">${size.width} × ${size.height} px</span>
          </div>
          <div class="display-template-dropzone ${assignedTemplates.length ? "has-template" : ""}" data-display-template-dropzone tabindex="0" aria-label="Přetáhněte sem šablonu">
            ${primaryTemplate
              ? this._renderTemplatePhysicalDevicePreview(device, primaryTemplate, secondaryTemplate, orientation, layout, true)
              : this._renderDevicePreview(device, "template")}
            ${largeDisplay ? `<div class="display-template-drop-halves" data-display-template-drop-halves="${["side-by-side", "stacked"].includes(this._displayTemplateLargeLayout) ? this._displayTemplateLargeLayout : "side-by-side"}">
              <span class="display-template-drop-half" data-display-template-drop-half="0"></span>
              <span class="display-template-drop-half" data-display-template-drop-half="1"></span>
            </div>` : ""}
          </div>
          <div class="display-template-drop-controls">
            <div class="template-preview-zoom" role="group" aria-label="Přiblížení náhledu">
              <button type="button" data-template-preview-zoom="out" title="Oddálit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
              <button type="button" class="template-preview-zoom-value" data-template-preview-zoom="reset">${Math.round(previewZoom * 100)} %</button>
              <button type="button" data-template-preview-zoom="in" title="Přiblížit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
            </div>
            <div class="display-template-orientation" role="group" aria-label="Orientace displeje">
              <button type="button" class="${orientation === "portrait" ? "is-active" : ""}" data-template-orientation="portrait" title="Na výšku"><ha-icon icon="mdi:phone-rotate-portrait"></ha-icon></button>
              <button type="button" class="${orientation === "landscape" ? "is-active" : ""}" data-template-orientation="landscape" title="Na šířku"><ha-icon icon="mdi:phone-rotate-landscape"></ha-icon></button>
            </div>
          </div>
          <button type="button" class="display-template-send-button" data-template-send ${assignedTemplates.length && !this._templateSending ? "" : "disabled"}>
            <ha-icon icon="mdi:${this._templateSending ? "loading" : "send"}" ${this._templateSending ? 'class="spin"' : ""}></ha-icon>
            <span><strong>${this._templateSending ? "Odesílám náhled…" : "Odeslat do displeje"}</strong><small>${assignedTemplates.length ? "Zapíše aktuální obsah displeje" : "Nejprve přetáhněte šablonu"}</small></span>
          </button>
          ${this._templateSendResult ? `<div class="template-send-result ${this._templateSendResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSendResult.ok ? "check-circle-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSendResult.message)}</span></div>` : ""}
        </aside>
        <section class="display-template-library">
          <div class="card devices-toolbar-card display-template-toolbar">
            <div class="devices-toolbar">
              <div class="device-search">
                <ha-icon icon="mdi:magnify"></ha-icon>
                <input type="search" data-display-template-search value="${this._escape(this._displayTemplateSearchQuery || "")}" placeholder="Hledat šablonu nebo údaj…" aria-label="Hledat šablony">
              </div>
              <div class="display-template-categories" aria-label="Kategorie šablon">
                ${categories.map((category) => `<button type="button" class="${activeCategory === category.id ? "is-active" : ""}" data-display-template-category="${category.id}" aria-pressed="${activeCategory === category.id}"><ha-icon icon="mdi:${category.icon}"></ha-icon>${category.title}</button>`).join("")}
              </div>
              <span class="pill muted display-template-result-count">${visibleCards.length} šablon</span>
            </div>
          </div>
          ${visibleCards.length ? `<div class="display-template-grid">${visibleCards.map((template) => {
            const used = assignedTemplates.includes(template.id);
            const guide = this._displayTemplateSetupGuide(template);
            return `<article class="display-template-card display-template-drag-card ${used ? "is-used" : ""}" draggable="true" data-display-template-drag="${template.id}" aria-label="${this._escape(template.title)}. Přetáhněte na displej.">
              <header class="display-template-tile-header">
                <span class="display-template-kind-icon"><ha-icon icon="mdi:${template.kind === "prepared" ? "auto-fix" : "tune-variant"}"></ha-icon></span>
                <span class="display-template-tile-identity"><strong>${this._escape(template.title)}</strong><small>${template.kind === "prepared" ? "Automatické nastavení" : "Vlastní zdroje dat"}</small></span>
                <span class="display-template-variable-count">${template.variables.length} údajů</span>
                <span class="display-template-help" tabindex="0" aria-label="Zobrazit návod pro šablonu ${this._escape(template.title)}"><ha-icon icon="mdi:information-outline"></ha-icon>
                  <span class="display-template-guide" role="tooltip"><strong>Jak nastavit ${this._escape(template.title)}</strong><ol>${guide.map((step) => `<li>${this._escape(step)}</li>`).join("")}</ol></span>
                </span>
              </header>
              <div class="display-template-tile-preview is-${orientation}" data-display-template-open="${template.id}" role="button" tabindex="0" aria-label="Umístit šablonu ${this._escape(template.title)} na displej">
                <span class="display-template-drag-handle"><ha-icon icon="mdi:drag"></ha-icon>Přetáhnout na displej</span>
                <span class="display-template-preview">${this._renderDisplayTemplateCatalogPreview(template, orientation)}</span>
              </div>
              <div class="display-template-tile-meta">
                <span class="display-template-variables" aria-label="Použité údaje">${template.variables.map(([iconName, label]) => `<span><ha-icon icon="mdi:${iconName}"></ha-icon>${this._escape(label)}</span>`).join("")}</span>
              </div>
              <div class="display-template-tile-actions">
                <button type="button" class="display-template-card-action" data-display-template-open="${template.id}"><ha-icon icon="mdi:tune-variant"></ha-icon>${used ? "Upravit nastavení" : "Nastavit šablonu"}</button>
              </div>
            </article>`;
          }).join("")}</div>` : `<div class="display-template-empty"><ha-icon icon="mdi:magnify-close"></ha-icon><strong>Žádná šablona neodpovídá filtru</strong><span>Zkuste jiný název nebo druh šablony.</span></div>`}
        </section>
      </div>
    </section>`;
  },

  _assignedDisplayTemplates(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const assigned = this._displayTemplateAssignments?.[address];
    if (Array.isArray(assigned)) return assigned.filter(Boolean).slice(0, 2);
    return [];
  },

  _assignDisplayTemplate(device, templateId, replaceIndex = null) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (!address || !templateId) return [];
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const current = this._assignedDisplayTemplates(device);
    let next;
    if (!largeDisplay) {
      next = [templateId];
    } else if (current.includes(templateId)) {
      next = current;
    } else if (Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < current.length) {
      next = [...current];
      next[replaceIndex] = templateId;
    } else if (current.length < 2) {
      next = [...current, templateId];
    } else {
      next = current;
    }
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = next;
    return next;
  },

  _displayTemplateDraftPayload(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    return {
      assignments: address ? [...(this._displayTemplateAssignments?.[address] || [])] : [],
      selected_primary: this._selectedDisplayTemplateId || "",
      selected_secondary: this._selectedDisplayTemplateSecondaryId || "",
      orientation: this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait",
      layout: this._displayTemplateLargeLayout || "single",
      bindings: structuredClone(this._displayTemplateBindings || {}),
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(this._templateElementAdjustments || {}),
      formats: structuredClone(this._displayTemplateFormats || {}),
      sizes: structuredClone(this._displayTemplateSizes || {}),
      placements: structuredClone(this._templateCanvasPlacements || {}),
    };
  },

  _restoreDisplayTemplateConfig(config) {
    const address = String(this._selectedDeviceAddress || "").toUpperCase();
    if (!config || typeof config !== "object") {
      if (address) {
        this._displayTemplateAssignments ||= {};
        this._displayTemplateAssignments[address] = [];
      }
      this._selectedDisplayTemplateId = "";
      this._selectedDisplayTemplateSecondaryId = "";
      this._displayTemplateBindings = {};
      this._templateEditorElements = [];
      this._templateElementAdjustments = {};
      this._selectedTemplatePart = "";
      return;
    }
    const assignments = Array.isArray(config.assignments) ? config.assignments.filter((item) => typeof item === "string") : [];
    this._displayTemplateAssignments ||= {};
    if (address) this._displayTemplateAssignments[address] = assignments.slice(0, 2);
    this._selectedDisplayTemplateId = String(config.selected_primary || assignments[0] || "");
    this._selectedDisplayTemplateSecondaryId = String(config.selected_secondary || assignments[1] || "");
    this._displayTemplateOrientation = config.orientation === "landscape" ? "landscape" : "portrait";
    this._displayTemplateLargeLayout = ["single", "side-by-side", "stacked"].includes(config.layout) ? config.layout : "single";
    this._displayTemplateBindings = structuredClone(config.bindings || {});
    this._templateEditorElements = Array.isArray(config.editor_elements) ? structuredClone(config.editor_elements) : [];
    this._templateElementAdjustments = structuredClone(config.element_adjustments || {});
    this._displayTemplateFormats = { primary: "narrow", secondary: "narrow", ...(config.formats || {}) };
    this._displayTemplateSizes = { primary: "large", secondary: "small", ...(config.sizes || {}) };
    this._templateCanvasPlacements = {
      primary: { x: 9, y: 9 },
      secondary: { x: 9, y: 9 },
      ...(config.placements || {}),
    };
    this._selectedTemplatePart = "";
  },

  async _saveDisplayTemplateDraft() {
    const device = this._device();
    if (!device || !this._hass) return false;
    const payload = this._projectPayload(device);
    const result = await this._hass.callWS({
      type: "dratek_eink/device_drafts/save",
      address: device.address,
      draft: payload,
    });
    const address = String(device.address || "").toUpperCase();
    this._deviceDrafts[address] = result?.draft || payload;
    this._saveCachedDeviceDrafts?.();
    return true;
  },

  _renderDisplayTemplateEditor(device) {
    const templates = this._displayTemplateCards();
    const template = templates.find((item) => item.id === this._selectedDisplayTemplateId) || templates[0];
    const secondaryTemplate = templates.find((item) => item.id === this._selectedDisplayTemplateSecondaryId)
      || templates.find((item) => item.id !== template.id)
      || template;
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const layout = largeDisplay && ["side-by-side", "stacked"].includes(this._displayTemplateLargeLayout)
      ? this._displayTemplateLargeLayout
      : "single";
    const selectedSlot = this._selectedTemplateCanvasSlot === "secondary" && layout !== "single" ? "secondary" : "primary";
    const selectedSize = largeDisplay && this._displayTemplateSizes?.[selectedSlot] === "small" ? "small" : "large";
    const activeTemplate = selectedSlot === "secondary" ? secondaryTemplate : template;
    const previewZoom = Math.max(0.5, Math.min(1.8, Number(this._displayTemplatePreviewZoom || 1)));
    return `<section class="display-template-editor-page">
      <header class="display-template-editor-header">
        <div>
          <small>Designer</small>
          <h1>${this._escape(template.title)}</h1>
          <p>Šablona ${template.number} · ${size.width} × ${size.height} px</p>
        </div>
      </header>
      <div class="display-template-editor-layout">
        <aside class="card display-template-editor-panel display-template-editor-left" aria-label="Editor prvků">
          ${this._renderTemplateEditorTools()}
        </aside>
        <main class="display-template-editor-canvas">
          <div class="display-template-preview-card">
            <div class="display-template-preview-card-head">
              <span><small>Náhled displeje</small><strong>${size.width} × ${size.height} px</strong></span>
              <div class="template-preview-controls">
                <div class="template-preview-zoom" role="group" aria-label="Přiblížení náhledu">
                  <button type="button" data-template-preview-zoom="out" title="Oddálit náhled" aria-label="Oddálit náhled"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
                  <button type="button" class="template-preview-zoom-value" data-template-preview-zoom="reset" title="Obnovit přiblížení" aria-label="Obnovit přiblížení">${Math.round(previewZoom * 100)} %</button>
                  <button type="button" data-template-preview-zoom="in" title="Přiblížit náhled" aria-label="Přiblížit náhled"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
                </div>
                <div class="display-template-orientation" role="group" aria-label="Orientace displeje">
                  <button type="button" class="${orientation === "portrait" ? "is-active" : ""}" data-template-orientation="portrait" title="Displej na výšku" aria-label="Displej na výšku"><ha-icon icon="mdi:phone-rotate-portrait"></ha-icon></button>
                  <button type="button" class="${orientation === "landscape" ? "is-active" : ""}" data-template-orientation="landscape" title="Displej na šířku" aria-label="Displej na šířku"><ha-icon icon="mdi:phone-rotate-landscape"></ha-icon></button>
                </div>
              </div>
            </div>
            <div class="display-template-editor-stage">
              ${this._renderTemplatePhysicalDevicePreview(device, template, secondaryTemplate, orientation, layout)}
            </div>
          </div>
        </main>
        <div class="display-template-editor-right-column">
          <button type="button" class="display-template-save-button" data-template-save>
            <ha-icon icon="mdi:content-save-outline"></ha-icon>
            <span><strong>Uložit šablonu</strong><small>Zachová rozložení, velikosti a vybrané entity</small></span>
          </button>
          <button type="button" class="display-template-send-button" data-template-send ${this._templateSending ? "disabled" : ""}>
            <ha-icon icon="mdi:${this._templateSending ? "loading" : "send"}" ${this._templateSending ? 'class="spin"' : ""}></ha-icon>
            <span><strong>${this._templateSending ? "Odesílám náhled…" : "Odeslat do displeje"}</strong><small>Zapíše aktuálně nastavený náhled</small></span>
          </button>
          ${this._templateSendResult ? `<div class="template-send-result ${this._templateSendResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSendResult.ok ? "check-circle-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSendResult.message)}</span></div>` : ""}
          ${this._templateSaveResult ? `<div class="template-send-result ${this._templateSaveResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSaveResult.ok ? "content-save-check-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSaveResult.message)}</span></div>` : ""}
          <aside class="card display-template-editor-panel display-template-editor-right" aria-label="Nastavení šablony">
            <div class="template-editor-panel-heading"><ha-icon icon="mdi:tune-variant"></ha-icon><span><strong>Nastavení šablony</strong><small>${this._escape(activeTemplate.title)}</small></span></div>
            <div class="template-editor-panel-heading template-layout-heading"><ha-icon icon="mdi:resize"></ha-icon><span><strong>Velikost šablony</strong><small>${selectedSlot === "secondary" ? "Nastavujete druhou šablonu" : "Nastavujete první šablonu"}</small></span></div>
            <div class="template-layout-options template-size-options">
              <button type="button" class="${selectedSize === "large" ? "is-active" : ""}" data-template-size="large" ${largeDisplay ? "" : "disabled"}><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon>Velká</button>
              <button type="button" class="${selectedSize === "small" ? "is-active" : ""}" data-template-size="small" ${largeDisplay ? "" : "disabled"}><ha-icon icon="mdi:arrow-collapse-all"></ha-icon>Malá</button>
            </div>
            ${this._renderTemplatePartControls(activeTemplate)}
            <p class="template-size-help">${largeDisplay
              ? selectedSize === "large"
                ? "Velká šablona zabírá celý displej a uzamkne přidání druhé."
                : layout === "single"
                  ? "Místo pro druhou šablonu je odemčené. Přidejte ji v galerii šablon."
                  : "Na displeji jsou dvě malé šablony. Kliknutím v náhledu vyberete tu, kterou upravujete."
              : "Malý displej používá jednu šablonu přes celou plochu. Při otočení displeje se šablona otočí automaticky."}</p>
            <p class="template-settings-intro">Vyberte, ze kterých entit Home Assistantu se mají načítat hodnoty. Systémové údaje jsou nastavené automaticky.</p>
            <div class="template-variable-settings">${activeTemplate.variables.map((variable, index) => this._renderTemplateVariableSetting(activeTemplate, variable, index)).join("")}</div>
          </aside>
        </div>
        <section class="card display-template-editor-panel display-template-editor-bottom" aria-label="Informace o návrhu">
          <ha-icon icon="mdi:information-outline"></ha-icon><span><strong>Náhled používá pouze červenou, bílou a černou.</strong><small>Po výběru entit se hodnoty v šabloně aktualizují z Home Assistantu.</small></span>
        </section>
      </div>
    </section>`;
  },

  // Resolves the fallback SVG renderer request. The normal send path captures
  // the visible HTML template so the editor and physical display stay WYSIWYG.
  _currentDisplayTemplateSvgRequest(device = this._device()) {
    if (!device) return null;
    const cards = this._displayTemplateCards();
    const assigned = this._assignedDisplayTemplates(device);
    const templates = assigned.map((id) => cards.find((item) => item.id === id)).filter(Boolean);
    if (!templates.length) return null;
    const base = this._baseDisplaySize(device);
    const portrait = this._displayTemplateOrientation === "portrait";
    const width = portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    const height = portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const layout = largeDisplay && templates.length > 1
      ? (["side-by-side", "stacked"].includes(this._displayTemplateLargeLayout) ? this._displayTemplateLargeLayout : "side-by-side")
      : "single";
    return { templates, width, height, layout };
  },

  async _renderCurrentDisplayTemplateImage(device = this._device()) {
    const request = this._currentDisplayTemplateSvgRequest(device);
    if (!request) throw new Error("Není vybrána žádná šablona.");
    const screen = this.shadowRoot.querySelector(".display-template-editor-stage .template-designer-screen")
      || this.shadowRoot.querySelector(".display-template-dropzone .template-designer-screen");
    if (screen && screen.getBoundingClientRect().width > 0) {
      return this._rasterizeDisplayTemplatePreview(screen);
    }
    return this._rasterizeDisplayTemplateSvg(request.templates, request.width, request.height, request.layout);
  },

  async _sendLocalDisplayDesignChunked(payload) {
    const encoded = String(payload.image || "").replace(/^data:[^,]*,/, "");
    if (!encoded) throw new Error("Vykreslený obrázek je prázdný.");
    const chunkSize = 64 * 1024;
    const total = Math.ceil(encoded.length / chunkSize);
    const uploadId = globalThis.crypto?.randomUUID?.()
      || `dratek-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    for (let index = 0; index < total; index += 1) {
      try {
        await this._hass.callWS({
          type: "dratek_eink/upload_design_chunk",
          upload_id: uploadId,
          index,
          total,
          data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
        });
      } catch (err) {
        throw new Error(
          `Home Assistant nepřijal část obrázku ${index + 1}/${total}: ${this._message(err)}`
        );
      }
    }
    try {
      return await this._hass.callWS({
        type: "dratek_eink/commit_design_upload",
        upload_id: uploadId,
        address: payload.address,
        sdk_type: payload.sdk_type,
        software_version: payload.software_version,
        orientation: payload.orientation,
        transform: payload.transform,
      });
    } catch (err) {
      throw new Error(`Home Assistant nezařadil přijatý obrázek do fronty: ${this._message(err)}`);
    }
  },

  async _sendDisplayTemplatePreview() {
    const device = this._device();
    if (!device || !this._hass || this._templateSending) return;
    this._templateSending = true;
    this._templateSendResult = null;
    let image = "";
    const sendButton = this.shadowRoot.querySelector("[data-template-send]");
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.querySelector("ha-icon")?.setAttribute("icon", "mdi:loading");
      sendButton.querySelector("ha-icon")?.classList.add("spin");
      const label = sendButton.querySelector("strong");
      if (label) label.textContent = "Odesílám náhled…";
    }
    try {
      await this._saveDisplayTemplateDraft();
      image = await this._renderCurrentDisplayTemplateImage(device);
      const gatewayId = String(this._selectedGatewayId || "");
      const payload = {
        address: device.address,
        sdk_type: Number(device.sdk_type),
        software_version: Number(device.sw || 0),
        image,
        orientation: this._displayTemplateOrientation === "portrait" ? "portrait" : "landscape",
        transform: this._displayTransform || "rotate_cw",
      };
      const result = gatewayId
        ? await this._hass.callWS({
          type: "dratek_eink/gateways/send_design",
          gateway_id: gatewayId,
          ...payload,
        })
        : await this._sendLocalDisplayDesignChunked(payload);
      if (result?.ok === false) throw new Error(result.error || "Odeslání se nezdařilo.");
      if (result?.queued) {
        this._templateSendResult = {
          ok: true,
          message: `Náhled byl zařazen do fronty přes ${gatewayId ? "zvolenou gateway" : "Home Assistant Bluetooth"}. Průběh a případnou chybu uvidíte na kartě Fronta zápisu.`,
        };
      } else {
        this._rememberSentDisplayPreview(device, image);
        this._templateSendResult = {
          ok: true,
          message: `Náhled byl úspěšně zapsán přes ${gatewayId ? "zvolenou gateway" : "Home Assistant Bluetooth"}. Další zápis proběhne pouze ručně.`,
        };
      }
      await this._loadQueue?.(true);
    } catch (err) {
      const websocketMessage = this._message(err);
      await this._loadQueue?.(false);
      const address = String(device.address || "").toUpperCase();
      const latestJob = (this._queue?.jobs || []).find((job) =>
        String(job.address || "").toUpperCase() === address
        && ["design", "partial_design"].includes(job.operation)
      );
      if (latestJob?.status === "succeeded") {
        this._rememberSentDisplayPreview(device, image);
        this._templateSendResult = {
          ok: true,
          message: "Přenos byl dokončen. Home Assistant pouze ztratil odpověď websocketu.",
        };
      } else if (latestJob?.status === "writing" || latestJob?.status === "queued") {
        this._templateSendResult = {
          ok: true,
          message: "Přenos pokračuje ve frontě Home Assistantu. Stav najdete na kartě Fronta.",
        };
      } else {
        const transferMessage = String(
          latestJob?.error
          || [...(latestJob?.log || [])].reverse().find((line) => String(line || "").trim())
          || websocketMessage
        ).trim();
        this._templateSendResult = { ok: false, message: `Odeslání selhalo: ${transferMessage}` };
      }
    } finally {
      this._templateSending = false;
      this._render();
      this._paint();
    }
  },

  _rememberSentDisplayPreview(device, image) {
    const address = String(device?.address || "").toUpperCase();
    if (!address || !String(image || "").startsWith("data:image/")) return;
    const base = this._baseDisplaySize(device);
    const portrait = this._displayTemplateOrientation === "portrait";
    const width = portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    const height = portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const previous = this._deviceDrafts?.[address] || {};
    this._deviceDrafts ||= {};
    this._deviceDrafts[address] = {
      ...previous,
      width,
      height,
      orientation: portrait ? "portrait" : "landscape",
      preview_image: image,
      preview_updated_at: Date.now(),
    };
    this._devicePreviewImages?.delete(address);
    this._devicePreviewRequests?.delete(address);
    this._saveCachedDeviceDrafts?.();
  },

  async _captureCurrentDisplayTemplatePreview() {
    const device = this._device();
    const screen = this.shadowRoot.querySelector(".template-designer-screen");
    if (!device || !screen) return false;
    try {
      const image = await this._rasterizeDisplayTemplatePreview(screen);
      this._rememberSentDisplayPreview(device, image);
      return true;
    } catch (err) {
      console.warn("DRATEK eInk template preview capture failed:", err);
      return false;
    }
  },

  // Home Assistant's real ha-icon renders its glyph through a nested
  // ha-svg-icon child that has its own separate shadow root, so the actual
  // <svg> can sit two (or more) shadow boundaries deep. shadowRoot.querySelector
  // never pierces into a further-nested shadow root, so walk the tree and
  // enter every shadow root we find until an <svg> turns up.
  _findSvgDeep(root) {
    if (!root) return null;
    const direct = root.querySelector("svg");
    if (direct) return direct;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.shadowRoot) {
        const found = this._findSvgDeep(node.shadowRoot);
        if (found) return found;
      }
      node = walker.nextNode();
    }
    return null;
  },

  async _rasterizeDisplayTemplatePreview(screen) {
    const layout = screen.querySelector(".template-device-layout");
    if (!layout) throw new Error("Náhled displeje není dostupný.");
    // mdi ha-icon elements render their glyph into their shadow root
    // asynchronously; give any that were just added a moment to finish so
    // the export doesn't have to fall back to leaving them empty.
    for (let attempt = 0; attempt < 40; attempt++) {
      const pending = [...layout.querySelectorAll("ha-icon")].some((el) => !this._findSvgDeep(el.shadowRoot));
      if (!pending) break;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    const sourceResponsivePreviews = [...layout.querySelectorAll("svg.template-responsive-preview")];
    const clone = layout.cloneNode(true);
    const sourceIcons = [...layout.querySelectorAll("ha-icon")];
    [...clone.querySelectorAll("ha-icon")].forEach((target, index) => {
      const source = sourceIcons[index];
      const sourceSvg = this._findSvgDeep(source?.shadowRoot);
      if (!sourceSvg) {
        // Leave the (empty) element in place instead of removing it: templates
        // lay out their children with CSS grid in DOM order, so deleting an
        // icon that hasn't finished rendering yet shifts every later element
        // into the wrong row and corrupts the whole layout.
        return;
      }
      const icon = sourceSvg.cloneNode(true);
      const style = getComputedStyle(source);
      icon.setAttribute("width", style.width || "24px");
      icon.setAttribute("height", style.height || "24px");
      icon.style.color = style.color || "#111";
      icon.style.display = "block";
      target.replaceWith(icon);
    });
    clone.querySelectorAll(".is-selected,.is-dragging").forEach((item) => item.classList.remove("is-selected", "is-dragging"));
    clone.querySelectorAll(".template-canvas-selection-label").forEach((item) => item.remove());
    // The interactive preview uses an SVG foreignObject per template so it can
    // scale responsively. Nesting those foreignObjects inside the export SVG
    // makes Chromium mark the resulting bitmap as cross-origin. Flatten every
    // template back to ordinary XHTML before creating the single export SVG.
    clone.querySelectorAll("svg.template-responsive-preview").forEach((preview, index) => {
      const body = preview.querySelector(".template-responsive-preview-body");
      const sourcePreview = sourceResponsivePreviews[index];
      if (!body) {
        preview.remove();
        return;
      }
      const viewBox = String(sourcePreview?.getAttribute("viewBox") || preview.getAttribute("viewBox") || "0 0 1 1")
        .trim().split(/\s+/).map(Number);
      const nativeWidth = Math.max(1, Number(viewBox[2]) || 1);
      const nativeHeight = Math.max(1, Number(viewBox[3]) || 1);
      const previewBounds = sourcePreview?.getBoundingClientRect();
      const scaleX = Math.max(0.001, Number(previewBounds?.width || nativeWidth) / nativeWidth);
      const scaleY = Math.max(0.001, Number(previewBounds?.height || nativeHeight) / nativeHeight);
      const replacement = document.createElement("div");
      replacement.className = "template-responsive-preview-body template-export-preview-body";
      replacement.style.width = `${nativeWidth}px`;
      replacement.style.height = `${nativeHeight}px`;
      replacement.style.transform = `scale(${scaleX},${scaleY})`;
      replacement.style.transformOrigin = "0 0";
      replacement.style.overflow = "hidden";
      replacement.innerHTML = body.innerHTML;
      preview.replaceWith(replacement);
    });
    // Canvas becomes unreadable as soon as the SVG foreignObject resolves a
    // font or image through an external URL. Keep the exported SVG completely
    // self-contained: imported user images are already converted to data URLs.
    clone.querySelectorAll("img").forEach((image) => {
      const source = String(image.getAttribute("src") || "").trim();
      if (!source.startsWith("data:image/")) image.remove();
    });
    clone.querySelectorAll("[style]").forEach((element) => {
      const style = String(element.getAttribute("style") || "");
      const safeStyle = style.replace(/url\((?!["']?data:)[^)]+\)/gi, "none");
      if (safeStyle !== style) element.setAttribute("style", safeStyle);
    });
    const bounds = screen.getBoundingClientRect();
    const orientation = this._displayTemplateOrientation === "portrait" ? "portrait" : "landscape";
    const base = this._baseDisplaySize(this._device());
    const width = orientation === "portrait" ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    const height = orientation === "portrait" ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const css = [...this.shadowRoot.querySelectorAll("style")]
      .map((style) => style.textContent || "")
      .join("\n")
      .replace(/@font-face\s*\{[^}]*\}/gi, "")
      .replace(/url\((?!["']?data:)[^)]+\)/gi, "none");
    const exportCss = `${css}
      .template-device-layout,
      .template-device-layout * {
        font-family: Arial, sans-serif !important;
      }`;
    // Cloning only .template-device-layout drops its .template-designer-screen
    // parent, so every ".template-designer-screen .display-template-surface"
    // rule (including sizing/positioning) fails to match in the exported markup
    // and an unrelated same-named class from the catalog dialog wins instead.
    // Re-wrap the clone so the scoped selectors still apply.
    const screenWrapper = document.createElement("div");
    screenWrapper.className = "template-designer-screen";
    screenWrapper.style.cssText = "width:100%;height:100%";
    screenWrapper.appendChild(clone);
    const markup = new XMLSerializer().serializeToString(screenWrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, bounds.width)}" height="${Math.max(1, bounds.height)}" viewBox="0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden;background:#fff"><style>${exportCss}</style>${markup}</div></foreignObject></svg>`;
    const bitmap = new Image();
    await new Promise((resolve, reject) => {
      bitmap.onload = resolve;
      bitmap.onerror = () => reject(new Error("Náhled se nepodařilo převést na obrázek."));
      bitmap.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const color = this._quantizeEinkPixel(red, green, blue);
      pixels.data[index] = color[0];
      pixels.data[index + 1] = color[1];
      pixels.data[index + 2] = color[2];
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  },

  _renderTemplatePhysicalDevicePreview(device, template, secondaryTemplate, orientation, layout, autoFit = false) {
    const address = String(device.address || "").toUpperCase();
    const base = this._baseDisplaySize(device);
    const sourceWidth = orientation === "portrait" ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    const sourceHeight = orientation === "portrait" ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const large400Layout = this._isLarge400Device(device);
    const pe29Layout = this._isPe29Device(device);
    const baseWidth = Math.max(base.width, base.height);
    const baseHeight = Math.min(base.width, base.height);
    const frameRatio = large400Layout ? 1039 / 898 : Math.max(0.48, Math.min(3.7, (baseWidth / baseHeight) / 0.95));
    const frameWidth = Math.max(150, Math.round(baseWidth / (large400Layout ? 0.77 : 0.76)));
    const frameHeight = Math.round(frameWidth / frameRatio);
    const outerWidth = orientation === "portrait" ? frameHeight : frameWidth;
    const outerHeight = orientation === "portrait" ? frameWidth : frameHeight;
    const frameRadius = Math.max(4, Math.min(28, Math.round(Math.min(frameWidth, frameHeight) * 0.06)));
    const physicalCode = device.physical_code || "00.00.00.00";
    const previewZoom = Math.max(0.5, Math.min(1.8, Number(this._displayTemplatePreviewZoom || 1)));
    const autoSlotWidth = layout === "side-by-side" ? sourceWidth / 2 : sourceWidth;
    const autoSlotHeight = layout === "stacked" ? sourceHeight / 2 : sourceHeight;
    const autoFormat = autoSlotWidth >= autoSlotHeight ? "wide" : "narrow";
    const ditherKey = autoFit ? this._escape(JSON.stringify({
      t: [template?.id || null, large400Layout && layout !== "single" ? (secondaryTemplate?.id || null) : null],
      o: orientation,
      l: layout,
      z: Math.round(previewZoom * 100),
      b: this._displayTemplateBindings || null,
      a: this._templateElementAdjustments || null,
      e: this._templateEditorElements || null,
    })) : "";
    return `<div class="template-physical-preview device-preview-wrap" style="--template-preview-zoom:${previewZoom}">
      <div class="device-preview-fit" style="--frame-ratio:${(outerWidth / outerHeight).toFixed(4)};--preview-width:${Math.min(620, Math.max(250, Math.round(470 * outerWidth / outerHeight)))}px">
        <svg class="device-preview-designer-svg" viewBox="0 0 ${outerWidth} ${outerHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Náhled šablony v rámečku displeje">
          <foreignObject x="0" y="0" width="${outerWidth}" height="${outerHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="designer-device-stage device-preview-designer-copy designer-stage-${orientation}" style="--designer-stage-width:${outerWidth}px;--designer-stage-height:${outerHeight}px;--designer-frame-ratio:${frameRatio.toFixed(4)};--designer-frame-width:${frameWidth}px;--designer-frame-rotation:${orientation === "portrait" ? "90deg" : "0deg"};--designer-screen-width:${sourceWidth}px;--designer-screen-height:${sourceHeight}px;--designer-body-width:${baseWidth}px;--device-frame-radius:${frameRadius}px">
              <div class="designer-device-bezel ${pe29Layout ? "designer-device-pe29" : ""} ${large400Layout ? "designer-device-large400" : ""} designer-device-landscape">${large400Layout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, false)}</span>` : `<span class="designer-device-code">${this._escape(physicalCode)}</span>`}</div>
              <div class="designer-device-screen template-designer-screen">
                <div class="template-device-layout layout-${layout} ${large400Layout ? "is-large-display" : "is-small-display"}">
                  ${this._renderDisplayTemplateSurface(template, large400Layout ? (autoFit ? autoFormat : (this._displayTemplateFormats?.primary || "narrow")) : (orientation === "landscape" ? "wide" : "narrow"), true, "primary", autoFit || !large400Layout, large400Layout ? (this._displayTemplateSizes?.primary || "large") : "large", autoFit)}
                  ${large400Layout && layout !== "single" ? this._renderDisplayTemplateSurface(secondaryTemplate, autoFit ? autoFormat : (this._displayTemplateFormats?.secondary || "narrow"), false, "secondary", autoFit, "small", autoFit) : ""}
                </div>
                ${autoFit ? `<canvas class="template-dithered-preview" data-dithered-preview="${ditherKey}" data-dithered-address="${this._escape(address)}" width="${sourceWidth}" height="${sourceHeight}"></canvas>` : ""}
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>`;
  },

  _renderTemplateEditorTools() {
    const tool = (type, icon, title) => `<button type="button" data-template-editor-tool="${type}" data-template-editor-icon="${icon}"><ha-icon icon="mdi:${icon}"></ha-icon><span>${title}</span></button>`;
    const icons = [["weather-sunny", "Slunce"], ["home", "Dům"], ["thermometer", "Teplota"], ["water-percent", "Vlhkost"], ["wifi", "Wi-Fi"], ["lightning-bolt", "Energie"], ["calendar", "Kalendář"], ["lock", "Zámek"]];
    return `<div class="template-editor-tools">
      <div class="template-editor-panel-heading"><ha-icon icon="mdi:shape-plus"></ha-icon><span><strong>Editor prvků</strong><small>Přidejte vlastní obsah nad šablonu</small></span></div>
      <div class="template-editor-tool-group"><small>Základní prvky</small><div class="template-editor-tool-grid">
        ${tool("text", "format-text", "Text")}${tool("rect", "rectangle-outline", "Obdélník")}${tool("circle", "circle-outline", "Kruh")}${tool("line", "vector-line", "Čára")}
        <button type="button" data-template-editor-import><ha-icon icon="mdi:image-plus"></ha-icon><span>Obrázek</span></button><input id="templateEditorImage" type="file" accept="image/*" hidden>
      </div></div>
      <div class="template-editor-tool-group"><small>Přednastavené ikony</small><div class="template-editor-icon-grid">${icons.map(([icon, title]) => `<button type="button" title="${title}" data-template-editor-tool="icon" data-template-editor-icon="${icon}"><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</div></div>
      ${(this._templateEditorElements || []).length ? `<div class="template-editor-layers"><small>Přidané prvky</small>${this._templateEditorElements.map((item) => `<div><ha-icon icon="mdi:${item.type === "image" ? "image-outline" : item.icon || "shape-outline"}"></ha-icon><span>${this._escape(item.label)}</span><button type="button" data-template-editor-remove="${item.id}" title="Odstranit"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("")}</div>` : ""}
    </div>`;
  },

  _renderTemplatePartControls(activeTemplate) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    if (!key || !adjustment) {
      return `<div class="template-part-controls is-empty">
        <ha-icon icon="mdi:cursor-move"></ha-icon>
        <span><strong>Upravte části šablony</strong><small>Klikněte na text, ikonu, graf nebo jiný prvek v náhledu a tažením jej přesuňte.</small></span>
      </div>`;
    }
    const partNumber = Number(key.split(":").at(-1)) + 1;
    const scale = Math.round(Math.max(0.5, Math.min(2, Number(adjustment.scale || 1))) * 100);
    return `<div class="template-part-controls">
      <div class="template-part-controls-head"><ha-icon icon="mdi:cursor-move"></ha-icon><span><strong>${this._escape(activeTemplate.title)} · prvek ${partNumber}</strong><small>Tažením v náhledu změníte polohu</small></span></div>
      <label><span>Velikost prvku <strong data-template-part-scale-value>${scale} %</strong></span><input type="range" min="50" max="200" step="5" value="${scale}" data-template-part-scale="${this._escape(key)}"></label>
      <button type="button" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon>Obnovit polohu a velikost</button>
    </div>`;
  },

  _applyTemplatePartAdjustment(element, surface, adjustment) {
    const elementWidth = Math.max(1, element.getBoundingClientRect().width);
    const elementHeight = Math.max(1, element.getBoundingClientRect().height);
    const surfaceWidth = Math.max(1, surface.getBoundingClientRect().width);
    const surfaceHeight = Math.max(1, surface.getBoundingClientRect().height);
    const translateX = (Number(adjustment.x || 0) * surfaceWidth) / elementWidth;
    const translateY = (Number(adjustment.y || 0) * surfaceHeight) / elementHeight;
    const scale = Math.max(0.5, Math.min(2, Number(adjustment.scale || 1)));
    element.style.transform = `translate(${translateX}%,${translateY}%) scale(${scale})`;
    element.style.transformOrigin = "center";
  },

  _bindTemplatePartEditor() {
    if (this._activeTab !== "display-settings" || this._displaySettingsView !== "designer") return;
    this._templateElementAdjustments ||= {};
    this.shadowRoot.querySelectorAll(".display-template-editor-stage .display-template-surface").forEach((surface) => {
      const templateId = surface.dataset.previewTemplate || "";
      const slot = surface.dataset.templateCanvasSlot || "primary";
      const templateRoot = surface.querySelector(".tpl");
      if (!templateRoot) return;
      [...templateRoot.children].forEach((element, index) => {
        const key = `${slot}:${templateId}:${index}`;
        const adjustment = this._templateElementAdjustments[key] || { x: 0, y: 0, scale: 1 };
        this._templateElementAdjustments[key] = adjustment;
        element.dataset.templateEditablePart = key;
        element.classList.add("template-editable-part");
        element.classList.toggle("is-selected", this._selectedTemplatePart === key);
        this._applyTemplatePartAdjustment(element, surface, adjustment);
        element.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          this._selectedTemplatePart = key;
          this.shadowRoot.querySelectorAll(".template-editable-part.is-selected").forEach((item) => item.classList.remove("is-selected"));
          element.classList.add("is-selected");
          this._templatePartDrag = {
            key,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: Number(adjustment.x || 0),
            originY: Number(adjustment.y || 0),
            width: Math.max(1, surface.getBoundingClientRect().width),
            height: Math.max(1, surface.getBoundingClientRect().height),
          };
          element.setPointerCapture?.(event.pointerId);
        });
        element.addEventListener("pointermove", (event) => {
          const drag = this._templatePartDrag;
          if (!drag || drag.key !== key || drag.pointerId !== event.pointerId) return;
          adjustment.x = Math.max(-50, Math.min(50, drag.originX + ((event.clientX - drag.startX) / drag.width) * 100));
          adjustment.y = Math.max(-50, Math.min(50, drag.originY + ((event.clientY - drag.startY) / drag.height) * 100));
          this._applyTemplatePartAdjustment(element, surface, adjustment);
        });
        const finish = (event) => {
          const drag = this._templatePartDrag;
          if (!drag || drag.key !== key || drag.pointerId !== event.pointerId) return;
          this._templatePartDrag = null;
          element.releasePointerCapture?.(event.pointerId);
          this._templateSaveResult = null;
          this._render();
          this._paint();
        };
        element.addEventListener("pointerup", finish);
        element.addEventListener("pointercancel", finish);
      });
    });
  },

  _addTemplateEditorElement(type, icon = "") {
    const labels = { text: "Vlastní text", rect: "Obdélník", circle: "Kruh", line: "Čára", icon: "Ikona" };
    this._templateEditorElements ||= [];
    this._templateEditorElements.push({
      id: `template-element-${Date.now()}-${this._templateEditorElements.length}`,
      type,
      icon,
      label: type === "icon" ? `Ikona ${icon}` : labels[type] || "Prvek",
      x: 50 + (this._templateEditorElements.length % 3) * 8,
      y: 42 + (this._templateEditorElements.length % 4) * 8,
    });
    this._render();
    this._paint();
  },

  _importTemplateEditorImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 240 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const palette = [[255, 255, 255], [10, 10, 10], [227, 27, 27]];
        for (let index = 0; index < pixels.data.length; index += 4) {
          if (pixels.data[index + 3] < 40) {
            [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2], pixels.data[index + 3]] = [255, 255, 255, 255];
            continue;
          }
          const color = palette.reduce((best, candidate) => {
            const distance = (pixels.data[index] - candidate[0]) ** 2 + (pixels.data[index + 1] - candidate[1]) ** 2 + (pixels.data[index + 2] - candidate[2]) ** 2;
            return distance < best.distance ? { candidate, distance } : best;
          }, { candidate: palette[0], distance: Infinity }).candidate;
          [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]] = color;
        }
        context.putImageData(pixels, 0, 0);
        this._templateEditorElements ||= [];
        this._templateEditorElements.push({ id: `template-image-${Date.now()}`, type: "image", label: file.name || "Obrázek", src: canvas.toDataURL("image/png"), x: 50, y: 50 });
        this._render();
        this._paint();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  },

  _renderTemplateEditorOverlays() {
    return `<div class="template-editor-overlays">${(this._templateEditorElements || []).map((item) => {
      const style = `left:${item.x}%;top:${item.y}%`;
      if (item.type === "image") return `<span class="template-overlay template-overlay-image" style="${style}"><img src="${item.src}" alt="${this._escape(item.label)}"></span>`;
      if (item.type === "text") return `<span class="template-overlay template-overlay-text" style="${style}">Vlastní text</span>`;
      if (item.type === "rect" || item.type === "circle") return `<span class="template-overlay template-overlay-shape is-${item.type}" style="${style}"></span>`;
      if (item.type === "line") return `<span class="template-overlay template-overlay-line" style="${style}"></span>`;
      return `<span class="template-overlay template-overlay-icon" style="${style}"><ha-icon icon="mdi:${item.icon || "star"}"></ha-icon></span>`;
    }).join("")}</div>`;
  },

  _templateDisplayValue(template, variableIndex, fallback = "") {
    const variable = template?.variables?.[variableIndex];
    if (!variable) return fallback;
    const meta = this._templateVariableMeta(variable, variableIndex);
    const binding = this._templateBinding(template, meta);
    const normalized = String(meta.label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (binding?.startsWith("internal:")) {
      const now = new Date();
      if (normalized.includes("datum")) {
        return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long" }).format(now);
      }
      if (normalized.includes("cas") || normalized.includes("aktualizace")) {
        return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(now);
      }
      if (normalized.includes("interval")) {
        const next = new Date(now.getTime() + 60 * 60 * 1000);
        const format = (date) => new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(date);
        return `${format(now)}–${format(next)}`;
      }
      return fallback;
    }
    const state = binding ? this._hass?.states?.[binding] : null;
    const weatherState = String(binding || "").startsWith("weather.");
    const weatherAttributes = state?.attributes || {};
    let raw = state?.state;
    let forcedUnit = "";
    if (weatherState && normalized.includes("teplot")) {
      raw = weatherAttributes.temperature;
      forcedUnit = weatherAttributes.temperature_unit || "°C";
    } else if (weatherState && normalized.includes("predpoved")) {
      const forecast = Array.isArray(weatherAttributes.forecast) ? weatherAttributes.forecast[0] : null;
      raw = forecast
        ? `${forecast.condition || state?.state || ""}${Number.isFinite(Number(forecast.temperature)) ? ` ${forecast.temperature} ${weatherAttributes.temperature_unit || "°C"}` : ""}`
        : state?.state;
    }
    if (raw === undefined || raw === null || ["", "unknown", "unavailable"].includes(String(raw).toLowerCase())) return fallback;
    const unit = String(forcedUnit || state?.attributes?.unit_of_measurement || "").trim();
    const numeric = Number(raw);
    const text = Number.isFinite(numeric)
      ? new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(numeric)
      : String(raw);
    return unit && !String(text).toLowerCase().endsWith(unit.toLowerCase()) ? `${text} ${unit}` : text;
  },

  _templateSeries(template, variableIndex, fallback) {
    const variable = template?.variables?.[variableIndex];
    if (!variable) return fallback;
    const meta = this._templateVariableMeta(variable, variableIndex);
    const binding = this._templateBinding(template, meta);
    if (!binding || binding.startsWith("internal:")) return fallback;
    const state = this._hass?.states?.[binding];
    if (!state) return fallback;
    const candidates = [state.attributes?.values, state.attributes?.prices, state.attributes?.data, state.attributes?.history, state.state];
    for (const candidate of candidates) {
      let value = candidate;
      if (typeof value === "string") {
        try { value = JSON.parse(value); } catch (_err) { value = value.split(/[;,\s]+/); }
      }
      if (value && !Array.isArray(value) && typeof value === "object") value = Object.values(value);
      if (!Array.isArray(value)) continue;
      const numbers = value.map((item) => Number(typeof item === "object" ? item.value ?? item.price ?? item.state : item)).filter(Number.isFinite);
      if (numbers.length > 1) return numbers.slice(-48);
    }
    return fallback;
  },

  _templatePercent(template, variableIndex, fallback = 0) {
    const raw = String(this._templateDisplayValue(template, variableIndex, fallback)).replace(",", ".");
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    const numeric = match ? Number(match[0]) : Number(fallback);
    return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : Number(fallback) || 0));
  },

  _templateVariableMeta(variable, index = 0) {
    const [icon, label] = variable;
    const normalized = String(label || "").toLocaleLowerCase("cs");
    const automatic = ["čas", "datum", "aktualizace", "cenový interval"].some((part) => normalized.includes(part));
    const descriptions = {
      teplota: "Senzor teploty místnosti nebo venkovního prostoru.",
      vlhkost: "Senzor relativní vlhkosti vzduchu nebo půdy.",
      signál: "Síla signálu vybraného zařízení.",
      baterie: "Stav baterie zařízení v procentech.",
      cena: "Senzor aktuální ceny nebo tarifu.",
      výkon: "Senzor okamžitého výkonu.",
      spotřeba: "Senzor spotřeby za zvolené období.",
      stav: "Entita, jejíž aktuální stav chcete zobrazit.",
      program: "Entita se stavem aktuálního programu.",
      osoba: "Osoba nebo tracker přítomnosti.",
      událost: "Kalendářová entita s nejbližší událostí.",
    };
    const descriptionKey = Object.keys(descriptions).find((key) => normalized.includes(key));
    return {
      icon,
      label,
      key: `${index}-${String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      automatic,
      description: automatic
        ? "Interní údaj Home Assistantu – není potřeba vybírat vlastní entitu."
        : descriptions[descriptionKey] || `Vyberte entitu Home Assistantu, která poskytuje hodnotu „${label}“.`,
    };
  },

  _suggestTemplateEntity(meta) {
    const states = this._hass?.states || {};
    const entries = Object.entries(states);
    if (!entries.length) return "";
    const text = `${meta.label} ${meta.icon}`.toLocaleLowerCase("cs");
    const domainHints = text.includes("osob") || text.includes("přítom") ? ["person.", "device_tracker."]
      : text.includes("kalend") || text.includes("udál") ? ["calendar."]
        : text.includes("počas") || text.includes("předpově") ? ["weather."]
          : text.includes("svět") ? ["light."]
            : text.includes("zám") || text.includes("dveř") || text.includes("okn") ? ["lock.", "binary_sensor."]
              : ["sensor.", "binary_sensor.", "input_number.", "input_text."];
    const keywords = String(meta.label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    const scored = entries.map(([entityId, state]) => {
      const haystack = `${entityId} ${state?.attributes?.friendly_name || ""} ${state?.attributes?.device_class || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const domainScore = domainHints.some((domain) => entityId.startsWith(domain)) ? 3 : 0;
      const keywordScore = keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 4 : 0), 0);
      const attributes = state?.attributes || {};
      const seriesScore = String(meta.icon || "").includes("chart")
        && [attributes.values, attributes.prices, attributes.data, attributes.history].some((value) => Array.isArray(value)) ? 7 : 0;
      return { entityId, score: domainScore + keywordScore + seriesScore };
    }).sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId));
    return scored[0]?.score > 3 ? scored[0].entityId : "";
  },

  _templateBinding(template, meta) {
    const key = `${template.id}:${meta.key}`;
    if (Object.prototype.hasOwnProperty.call(this._displayTemplateBindings || {}, key)) return this._displayTemplateBindings[key];
    return meta.automatic ? `internal:${meta.key}` : this._suggestTemplateEntity(meta);
  },

  _renderTemplateVariableSetting(template, variable, index) {
    const meta = this._templateVariableMeta(variable, index);
    const binding = this._templateBinding(template, meta);
    return `<section class="template-variable-setting ${meta.automatic ? "is-automatic" : ""}">
      <div class="template-variable-setting-head"><span><ha-icon icon="mdi:${meta.icon}"></ha-icon></span><div><strong>${this._escape(meta.label)}</strong><small>${this._escape(meta.description)}</small></div></div>
      ${meta.automatic
        ? `<div class="template-internal-value"><ha-icon icon="mdi:home-assistant"></ha-icon><span><strong>Automaticky z Home Assistantu</strong><small>Interní systémová proměnná</small></span><ha-icon icon="mdi:check-circle"></ha-icon></div>`
        : `<ha-selector data-template-entity-picker="${this._escape(`${template.id}:${meta.key}`)}" data-template-default-entity="${this._escape(binding)}"></ha-selector>
           <small class="template-picker-help">Vyberte senzor, pomocníka nebo jinou entitu odpovídající tomuto údaji.</small>`}
    </section>`;
  },

  _templateSampleValue(label) {
    const value = String(label || "").toLocaleLowerCase("cs");
    if (value.includes("teplot")) return "22,5 °C";
    if (value.includes("vlhk")) return "46 %";
    if (value.includes("čas") || value.includes("aktual")) return "12:45";
    if (value.includes("datum")) return "23. května";
    if (value.includes("výkon")) return "2,35 kW";
    if (value.includes("cena")) return "2,45 Kč";
    if (value.includes("spotřeb") || value.includes("výrob")) return "8,2 kWh";
    if (value.includes("bateri")) return "82 %";
    if (value.includes("signál")) return "-48 dBm";
    return "Aktivní";
  },

  _renderDisplayTemplateWidePreview(template) {
    const primary = this._templateVariableMeta(template.variables[0] || ["view-dashboard-outline", "Stav"], 0);
    const details = template.variables.slice(1, 4);
    return `<div class="tpl-wide tpl-wide-${template.id}">
      <header><span><ha-icon icon="mdi:${primary.icon}"></ha-icon></span><div><small>Šablona ${template.number}</small><strong>${this._escape(template.title)}</strong></div></header>
      <section class="tpl-wide-main"><small>${this._escape(primary.label)}</small><strong>${this._escape(this._templateDisplayValue(template, 0, this._templateSampleValue(primary.label)))}</strong></section>
      <div class="tpl-wide-metrics">${details.map(([icon, label], index) => `<span><ha-icon icon="mdi:${icon}"></ha-icon><small>${this._escape(label)}</small><strong>${this._escape(this._templateDisplayValue(template, index + 1, this._templateSampleValue(label)))}</strong></span>`).join("")}</div>
      <footer><ha-icon icon="mdi:home-assistant"></ha-icon>Aktualizováno z Home Assistantu</footer>
    </div>`;
  },

  _renderDisplayTemplateSurface(template, format, primary = false, slot = "primary", fillDisplay = false, templateSize = "small", autoFit = false) {
    const orientation = format === "wide" ? "landscape" : "portrait";
    const preview = this._renderDisplayTemplatePreview(template);
    const orientedPreview = orientation === "landscape"
      ? preview.replace('class="tpl ', 'class="tpl tpl-landscape ')
      : preview;
    const templateWidth = orientation === "landscape" ? 296 : 150;
    const templateHeight = orientation === "landscape" ? 150 : 296;
    const placement = this._templateCanvasPlacements?.[slot] || { x: 9, y: 9 };
    const placementX = fillDisplay ? Math.max(0, Math.min(4, Number(placement.x || 0))) : Number(placement.x || 0);
    const placementY = fillDisplay ? Math.max(0, Math.min(4, Number(placement.y || 0))) : Number(placement.y || 0);
    const selected = !autoFit && this._selectedTemplateCanvasSlot === slot;
    return `<div class="template-display-slot" data-template-display-slot="${slot}">
      <div class="display-template-surface template-canvas-item size-${templateSize === "large" ? "large" : "small"} format-${format === "wide" ? "wide" : "narrow"} is-${orientation} ${selected ? "is-selected" : ""} ${autoFit ? "is-auto-fit" : ""}" data-preview-template="${template.id}" data-template-canvas-slot="${slot}" ${autoFit ? "" : `tabindex="0" role="button" aria-label="Šablona ${this._escape(template.title)}. Kliknutím vyberte a tažením přesuňte."`} style="--template-item-x:${placementX}%;--template-item-y:${placementY}%">
        <svg class="template-responsive-preview" viewBox="0 0 ${templateWidth} ${templateHeight}" preserveAspectRatio="${fillDisplay ? "none" : "xMidYMid meet"}" aria-hidden="true">
          <foreignObject x="0" y="0" width="${templateWidth}" height="${templateHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="template-responsive-preview-body">${orientedPreview}</div>
          </foreignObject>
        </svg>
        ${primary && !autoFit ? this._renderTemplateEditorOverlays() : ""}
        ${autoFit ? "" : `<span class="template-canvas-selection-label">${this._escape(template.title)}</span>`}
      </div>
    </div>`;
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
