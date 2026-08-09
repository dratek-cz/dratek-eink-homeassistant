import { DRATEK_EINK_VERSION } from "./panel-constants.js";
import { DISPLAY_TEMPLATES, DISPLAY_TEMPLATE_CATALOG } from "./templates/index.js";

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
      const statusChanged = this._deviceStatusSignature(this._result) !== this._deviceStatusSignature(nextResult);
      this._result = nextResult;
      if (!background || changed || presenceChanged || statusChanged) {
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
      if (!background || this._deviceStatusSignature(this._result) !== this._lastRenderedDeviceSignature) {
        this._lastRenderedDeviceSignature = this._deviceStatusSignature(this._result);
        this._renderKeepingSearchFocus();
      }
    }
  },

  _scheduleDeviceStatusPoll(delay = 30000) {
    window.clearTimeout(this._deviceStatusPollTimer);
    if (!this.isConnected || !this._hass) return;
    this._deviceStatusPollTimer = window.setTimeout(async () => {
      this._deviceStatusPollTimer = null;
      if (this._activeTab === "devices") {
        await this._scan({ background: true });
      }
      this._scheduleDeviceStatusPoll();
    }, delay);
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

  _deviceStatusSignature(result = this._result) {
    return (result?.devices || [])
      .map((device) => {
        const preferredPath = device.preferred_path || null;
        return JSON.stringify({
          address: String(device.address || "").toUpperCase(),
          battery: device.battery ?? null,
          battery_percent: device.battery_percent ?? null,
          battery_voltage: device.battery_voltage ?? null,
          rssi: device.rssi ?? null,
          temporarily_unseen: !!device.temporarily_unseen,
          gateway_selection: device.gateway_selection || "",
          selected_gateway_id: device.selected_gateway_id || "",
          path_type: preferredPath?.type || "",
          path_id: preferredPath?.id || "",
          path_name: preferredPath?.name || "",
          path_rssi: preferredPath?.rssi ?? null,
          path_unavailable: !!preferredPath?.unavailable,
        });
      })
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
    const draftSize = this._devicePreviewSize(device);
    const { draft } = draftSize;
    const hasSentPreview = String(draft?.preview_image || device?.preview_image || device?.last_image || "").startsWith("data:image/");
    const sourceWidth = hasSentPreview ? Math.max(1, Number(draft?.preview_width || draftSize.width)) : draftSize.width;
    const sourceHeight = hasSentPreview ? Math.max(1, Number(draft?.preview_height || draftSize.height)) : draftSize.height;
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
    const hasPreviewContent = !!(
      draft?.preview_image ||
      (device.preview_image && String(device.preview_image).startsWith("data:image/")) ||
      (device.last_image && String(device.last_image).startsWith("data:image/"))
    );
    return `<div class="device-preview-wrap preview-${previewMode} ${catalogWordmark ? "catalog-device-preview" : ""}">
      <div class="device-preview-fit" style="--frame-ratio:${nativeOuterRatio.toFixed(4)};--preview-width:${previewWidth}px">
        <svg class="device-preview-designer-svg" viewBox="0 0 ${nativeOuterWidth} ${nativeOuterHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Náhled ${this._escape(sourceWidth)} × ${this._escape(sourceHeight)}">
          <foreignObject x="0" y="0" width="${nativeOuterWidth}" height="${nativeOuterHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="designer-device-stage device-preview-designer-copy designer-stage-${portraitLayout ? "portrait" : "landscape"}" style="--designer-stage-width:${nativeOuterWidth}px;--designer-stage-height:${nativeOuterHeight}px;--designer-frame-ratio:${designerFrameRatio.toFixed(4)};--designer-frame-width:${designerFrameWidth}px;--designer-frame-rotation:${portraitLayout ? "90deg" : "0deg"};--designer-screen-width:${sourceWidth}px;--designer-screen-height:${sourceHeight}px;--designer-body-width:${baseWidth}px;--device-frame-radius:${designerFrameRadius}px">
              <div class="designer-device-bezel ${pe29Layout ? "designer-device-pe29" : ""} ${large400Layout ? "designer-device-large400" : ""} designer-device-landscape">${large400Layout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, false)}</span>` : `<span class="designer-device-code">${this._escape(physicalCode)}</span>`}</div>
              <div class="designer-device-screen">
                <canvas data-device-preview="${this._escape(address)}" data-source-width="${sourceWidth}" data-source-height="${sourceHeight}" width="${sourceWidth}" height="${sourceHeight}"></canvas>
                ${hasPreviewContent ? "" : catalogWordmark
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
      // A card represents the physical tag, not the current editor state. Its
      // canvas is therefore painted only from the last successfully written
      // snapshot. Before the first recorded write it stays honestly empty.
      const assignedTemplates = this._assignedDisplayTemplates(device);
      const cardPreview = this._renderDevicePreview(device, mode === "list" ? "mini" : mode);

      return `<article class="display-tile ${temporarilyUnseen ? "is-stale" : ""} ${writingJob ? "is-writing" : ""} ${recentlySucceededJob ? "is-uploaded" : ""}" data-device-card-settings="${this._escape(device.address)}" role="button" tabindex="0" aria-label="Upravit displej ${this._escape(this._deviceTitle(device))}">
        <header class="display-tile-header">
          <span class="display-online-dot ${temporarilyUnseen ? "stale" : ""}" title="${temporarilyUnseen ? "Displej nebyl zachycen v posledním krátkém skenu" : "Displej je dostupný"}"></span>
          <div class="display-tile-identity ${editing ? "is-editing" : ""}">${editing ? `<input class="display-name-inline" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Například Kuchyň" aria-label="Název displeje">` : `<strong>${this._escape(this._deviceTitle(device))}</strong>`}<span>${this._escape(device.model || "eInk displej")} · ${this._escape(device.address)}</span></div>
          ${editing ? `<button class="tile-icon-btn tile-save-name-btn" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>` : `<button class="tile-icon-btn" data-device-rename="${this._escape(device.address)}" title="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}" aria-label="${device.display_name ? "Přejmenovat displej" : "Pojmenovat displej"}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}
          ${mode === "list" ? `<span class="display-resolution"><ha-icon icon="mdi:aspect-ratio"></ha-icon>${previewSize.width} × ${previewSize.height}</span>` : ""}
          ${mode === "list" ? transferState : ""}
        </header>
        ${mode === "list"
          // The list row carries a thumbnail too - a list of displays with no
          // picture of any display was the one view where you could not tell them
          // apart at a glance. Its transfer state already sits in the header.
          ? `<div class="display-preview-slot">${cardPreview}</div>`
          : `<div class="display-preview-slot">${transferState}${cardPreview}</div>`}
        <div class="display-health">
          <div class="display-health-item display-battery-item" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}${Number.isFinite(battery.voltage) ? ` · ${this._formatBatteryVoltage(battery.voltage)}` : ""}">${this._renderBatterySegments(battery.percent)}<strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></div>
          <div class="display-health-item display-signal-item" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">${this._renderSignalBars(rssi)}<strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
          <div class="display-health-item display-health-route ${temporarilyUnseen ? "stale" : ""}">
            <span class="health-route-icons"><ha-icon class="health-icon" icon="${temporarilyUnseen ? "mdi:bluetooth-off" : preferredPath?.type === "local" ? "mdi:bluetooth-connect" : "mdi:router-wireless"}"></ha-icon>${!temporarilyUnseen && preferredPath?.type !== "local" ? `<ha-icon class="health-icon health-icon-sub" icon="mdi:bluetooth" title="Displej je za gatewayí připojen přes BLE"></ha-icon>` : ""}</span>
            <span class="health-route-text"><small>Připojeno</small><strong>${temporarilyUnseen ? "Čekám na signál" : this._escape(preferredPath?.name || "Nedostupné")}</strong></span>
          </div>
        </div>
        <div class="display-tile-actions">
          ${assignedTemplates.includes("price") || assignedTemplates.includes("priceshelf") ? `
            <button type="button" class="display-sale-action-btn ${this._displayTemplateOptions?.["price:sale"] ? "is-active" : ""}" data-device-price-sale="${this._escape(device.address)}" title="Nastavit akční slevu">
              <ha-icon icon="mdi:sale"></ha-icon>
              <span>AKCE / SLEVA</span>
            </button>
          ` : ""}
          <button class="display-settings-button" data-device-settings="${this._escape(device.address)}"><ha-icon icon="mdi:cog-outline"></ha-icon>Upravit displej</button>
        </div>
      </article>`;
    }).join("")}</div>
    ${this._renderPriceSaleDialog()}`;
  },

  _renderPriceSaleDialog() {
    const address = this._activePriceSaleDeviceAddress;
    if (!address) return "";
    const devices = this._result?.devices || (typeof this._devices === "function" ? this._devices() : []);
    const device = devices.find((d) => String(d.address || "").toUpperCase() === String(address).toUpperCase())
      || { address, display_name: address };

    const upperAddr = String(address).toUpperCase();
    const draft = this._deviceDrafts?.[upperAddr] || {};
    const bindings = draft.bindings || this._displayTemplateBindings || {};

    const productTitle = bindings["price:tag-outline"] || bindings["tag-outline"] || "Jablka Golden";
    const oldPriceVal = parseFloat(String(bindings["price:cash-multiple"] || bindings["cash-multiple"] || "199").replace(",", ".")) || 199;
    const newPriceVal = parseFloat(String(bindings["price:currency-usd"] || bindings["currency-usd"] || "149").replace(",", ".")) || 149;
    const productCode = bindings["price:barcode"] || bindings["barcode"] || "8594001234567";

    const discountPercent = oldPriceVal > 0 ? Math.round(((oldPriceVal - newPriceVal) / oldPriceVal) * 100) : 0;
    const savedAmount = Math.max(0, oldPriceVal - newPriceVal);

    return `<div class="modal-backdrop price-sale-dialog-backdrop" data-price-sale-close>
      <section class="price-sale-dialog card" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <header class="price-sale-header">
          <div class="price-sale-header-left">
            <span class="price-sale-badge-icon"><ha-icon icon="mdi:tag-outline"></ha-icon></span>
            <div class="price-sale-header-text">
              <h2>Nastavení Cenovky</h2>
              <p>${this._escape(device.display_name || device.address)} · Nastavení údajů a akce</p>
            </div>
          </div>
          <button type="button" class="price-sale-close-btn" data-price-sale-close aria-label="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button>
        </header>

        <div class="price-sale-body" onclick="event.stopPropagation()">
          <div class="price-sale-full-field">
            <label for="priceSaleTitle"><ha-icon icon="mdi:format-title"></ha-icon> Název produktu</label>
            <div class="price-sale-input-wrap">
              <input type="text" id="priceSaleTitle" value="${this._escape(productTitle)}" placeholder="Např. Jablka Golden">
            </div>
          </div>

          <div class="price-sale-inputs-grid">
            <div class="price-sale-input-group">
              <label for="priceSaleOldPrice"><ha-icon icon="mdi:currency-usd-off"></ha-icon> Běžná / Původní cena</label>
              <div class="price-sale-input-wrap">
                <input type="number" id="priceSaleOldPrice" value="${oldPriceVal}" step="0.1" placeholder="199">
                <span class="currency-tag">Kč</span>
              </div>
            </div>

            <div class="price-sale-input-group">
              <label for="priceSaleNewPrice"><ha-icon icon="mdi:tag-text-outline"></ha-icon> Akční cena (sleva)</label>
              <div class="price-sale-input-wrap is-accent">
                <input type="number" id="priceSaleNewPrice" value="${newPriceVal}" step="0.1" placeholder="149">
                <span class="currency-tag">Kč</span>
              </div>
            </div>
          </div>

          <div class="price-sale-full-field">
            <label for="priceSaleCode"><ha-icon icon="mdi:barcode"></ha-icon> Kód zboží / EAN (volitelné)</label>
            <div class="price-sale-input-wrap">
              <input type="text" id="priceSaleCode" value="${this._escape(productCode)}" placeholder="8594001234567">
            </div>
          </div>

          <div class="price-sale-hero-summary">
            <div class="price-sale-summary-icon"><ha-icon icon="mdi:ticket-percent-outline"></ha-icon></div>
            <div class="price-sale-summary-text">
              <div class="summary-discount-row">
                <span class="summary-discount-badge">- ${discountPercent} %</span>
                <span class="summary-save-text">Ušetříte <strong>${savedAmount.toFixed(1).replace(".", ",")} Kč</strong></span>
              </div>
              <small>Akce zapne červené grafické prvky a přeškrtnutou cenu. Bez akce bude cenovka čistě černobílá.</small>
            </div>
          </div>
        </div>

        <footer class="price-sale-actions">
          <button type="button" class="price-sale-btn save-sale" data-price-sale-apply="${this._escape(address)}">
            <ha-icon icon="mdi:lightning-bolt"></ha-icon> Zapnout slevu (Červená AKCE na displej)
          </button>
          <button type="button" class="price-sale-btn turn-off" data-price-sale-disable="${this._escape(address)}">
            <ha-icon icon="mdi:circle-outline"></ha-icon> Použít běžnou cenu (Černobílá cenovka)
          </button>
        </footer>
      </section>
    </div>`;
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
      ${this._renderTemplatePlacementDialog(device)}
      ${this._renderPriceSaleDialog()}
    </section>`;
  },

  // ------------------------------------------------------- setup guidance ---

  // What each template needs before it can show anything real.
  //
  // The three generic steps that used to sit in a hover tooltip were true of every
  // template and therefore told you nothing: a calendar template is useless until a
  // calendar integration exists, and nothing in the panel said so. Every entry below
  // names the integrations that produce the entities the template binds to, so the
  // answer to "why is this still showing sample data" is one click away.
  //
  // `domain` is what the integration puts in the entity id, which is also how the
  // dialog checks whether it is already installed. `core: true` means Home Assistant
  // ships it, so a documentation link is safe to offer; everything else is named
  // without a link, because promising a URL for a community integration that may have
  // moved is worse than not linking at all.
  _templateSetupRecipes() {
    return Object.fromEntries(DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, entry.setup]));
  },

  _hasEntityDomain(domain) {
    const states = this._hass?.states || {};
    const prefix = `${domain}.`;
    return Object.keys(states).some((entityId) => entityId.startsWith(prefix));
  },

  _templateSetupRecipe(template) {
    return this._templateSetupRecipes()[template?.id] || {
      summary: "Šablona zobrazuje hodnoty z entit Home Assistantu.",
      integrations: [],
      steps: [
        "Přetáhněte šablonu na náhled displeje vlevo.",
        "Klikněte na Nastavit a u jednotlivých údajů vyberte entity.",
      ],
    };
  },

  _renderDisplayTemplateSetupDialog() {
    const templateId = this._displayTemplateSetupId;
    if (!templateId) return "";
    const template = this._displayTemplateCards().find((item) => item.id === templateId);
    if (!template) return "";
    const recipe = this._templateSetupRecipe(template);
    const integrations = (recipe.integrations || []).map((item) => {
      const states = this._hass?.states || {};
      const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const friendlyNames = new Set((item.entityFriendlyNames || []).map(normalize));
      const foundByPrefix = Array.isArray(item.entityPrefixes) && item.entityPrefixes.length
        && Object.keys(states).some((entityId) => item.entityPrefixes.some((prefix) => entityId.startsWith(prefix)));
      const foundByName = friendlyNames.size > 0 && Object.values(states).some((state) => friendlyNames.has(normalize(state?.attributes?.friendly_name)));
      const found = (item.entityPrefixes || []).length || friendlyNames.size
        ? foundByPrefix || foundByName
        : this._hasEntityDomain(item.domain);
      const documentationUrl = item.url || (item.core && !item.helper ? `https://www.home-assistant.io/integrations/${item.domain}/` : "");
      const link = documentationUrl
        ? `<a href="${this._escape(documentationUrl)}" target="_blank" rel="noopener noreferrer">${this._escape(item.linkLabel || "Dokumentace")}</a>`
        : "";
      return `<li class="template-setup-integration ${found ? "is-found" : "is-missing"}">
        <span class="template-setup-status"><ha-icon icon="mdi:${found ? "check-circle" : "alert-circle-outline"}"></ha-icon></span>
        <div><strong>${this._escape(item.name)}</strong><small>${this._escape(item.why)}</small>
          <span class="template-setup-meta">${found ? `Nalezeno v Home Assistantu (${this._escape(item.domain)}.*)` : `Zatím nenalezeno – chybí entity ${this._escape(item.domain)}.*`} ${link}</span>
        </div>
      </li>`;
    }).join("");
    const slots = template.variables.map((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      const binding = this._templateBinding(template, meta);
      const automatic = meta.automatic;
      const resolved = automatic || (binding && !binding.startsWith("internal:"));
      return `<li class="${resolved ? "is-found" : "is-missing"}">
        <ha-icon icon="mdi:${resolved ? "check" : "help-circle-outline"}"></ha-icon>
        <strong>${this._escape(meta.label)}</strong>
        <span>${automatic ? "Doplní Home Assistant" : binding ? this._escape(binding) : "Nenalezeno – vyberte entitu ručně"}</span>
      </li>`;
    }).join("");
    return `<div class="modal-backdrop template-setup-backdrop" data-template-setup-close>
      <section class="template-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="templateSetupTitle">
        <header>
          <div><small>Jak zprovoznit šablonu</small><h2 id="templateSetupTitle">${this._escape(template.title)}</h2></div>
          <button type="button" class="ghost" data-template-setup-close aria-label="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button>
        </header>
        <p class="template-setup-summary">${this._escape(recipe.summary)}</p>
        ${integrations ? `<h3><ha-icon icon="mdi:puzzle-outline"></ha-icon>Co je potřeba v Home Assistantu</h3>
        <ul class="template-setup-integrations">${integrations}</ul>` : ""}
        <h3><ha-icon icon="mdi:format-list-numbered"></ha-icon>Postup</h3>
        <ol class="template-setup-steps">${(recipe.steps || []).map((step) => `<li>${this._escape(step)}</li>`).join("")}</ol>
        <h3><ha-icon icon="mdi:database-search-outline"></ha-icon>Údaje šablony</h3>
        <ul class="template-setup-slots">${slots}</ul>
        ${recipe.note ? `<p class="template-setup-note"><ha-icon icon="mdi:information-outline"></ha-icon>${this._escape(recipe.note)}</p>` : ""}
        <div class="template-setup-actions">
          <button type="button" data-display-template-open="${this._escape(template.id)}"><ha-icon icon="mdi:tune-variant"></ha-icon>Nastavit šablonu</button>
          <button type="button" class="secondary" data-template-setup-close>Zavřít</button>
        </div>
      </section>
    </div>`;
  },

  // A miniature of the actual split: both templates rendered through the same
  // catalog-thumbnail renderer used everywhere else, just sized to the half
  // (or whole) they would occupy. This is what makes the choice legible - a
  // label like "Nahoře" does not say whether the weather template's footer
  // survives being squeezed into a quarter of the display, but the thumbnail
  // does.
  _renderTemplatePlacementPreview(value, currentTemplate, nextTemplate, width, height) {
    const preview = (template, slotWidth, slotHeight) => this._renderDisplayTemplateCatalogPreview(
      template, slotWidth >= slotHeight ? "landscape" : "portrait", { width: slotWidth, height: slotHeight },
    );
    if (value === "full") {
      return `<span class="template-placement-preview layout-full" style="aspect-ratio:${width}/${height}">`
        + `<span class="template-placement-slot is-incoming">${preview(nextTemplate, width, height)}</span></span>`;
    }
    const stacked = value === "top" || value === "bottom";
    const slotWidth = stacked ? width : width / 2;
    const slotHeight = stacked ? height / 2 : height;
    const incoming = `<span class="template-placement-slot is-incoming">${preview(nextTemplate, slotWidth, slotHeight)}</span>`;
    const existing = `<span class="template-placement-slot is-existing">${preview(currentTemplate || nextTemplate, slotWidth, slotHeight)}</span>`;
    const first = value === "left" || value === "top";
    return `<span class="template-placement-preview layout-${value}" style="aspect-ratio:${width}/${height}">${first ? incoming + existing : existing + incoming}</span>`;
  },

  // Where a second (or third, replacing one of two) template goes when the
  // display already carries at least one full-size one. Dragging straight
  // onto an edge of the preview picks this in one gesture already (see the
  // drop-zone cross in the dropzone markup below); this dialog is the same
  // five choices for anyone who clicked the template tile instead of
  // dragging it.
  _renderTemplatePlacementDialog(device) {
    const pending = this._pendingDisplayTemplateConflict;
    if (!pending?.templateId) return "";
    const templates = this._displayTemplateCards();
    const nextTemplate = templates.find((item) => item.id === pending.templateId);
    if (!nextTemplate) return "";
    const assigned = this._assignedDisplayTemplates(device);
    const primaryTemplate = templates.find((item) => item.id === assigned[0]);
    const secondaryTemplate = templates.find((item) => item.id === assigned[1]);
    const bothSlotsFull = assigned.length > 1;
    const size = this._devicePreviewSize(device);
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    const previewWidth = orientation === "landscape" ? long : short;
    const previewHeight = orientation === "landscape" ? short : long;
    // Left/top always mean "index 0", right/bottom always mean "index 1" -
    // that is what the new template takes. Whichever template currently sits
    // there is displaced by it; the other slot's template (if any) is left
    // untouched and is what the preview's other half shows.
    const displacedFor = (value) => (value === "left" || value === "top") ? primaryTemplate : secondaryTemplate;
    const remainingFor = (value) => (value === "left" || value === "top")
      ? (secondaryTemplate || primaryTemplate)
      : (primaryTemplate || secondaryTemplate);
    const hintFor = (value, moveVerb) => {
      const displaced = displacedFor(value);
      if (!displaced) return "Šablona bude přidána do prázdné poloviny.";
      return bothSlotsFull
        ? `Nahradí šablonu „${this._escape(displaced.title)}“.`
        : `Šablona „${this._escape(displaced.title)}“ se přesune ${moveVerb}.`;
    };
    const options = [
      ["full", "Přes celý displej", bothSlotsFull ? "Nahradí obě šablony." : "Nahradí stávající šablonu."],
      ["left", "Vlevo", hintFor("left", "doprava")],
      ["right", "Vpravo", hintFor("right", "doleva")],
      ["top", "Nahoře", hintFor("top", "dolů")],
      ["bottom", "Dole", hintFor("bottom", "nahoru")],
    ];
    const description = bothSlotsFull
      ? `Displej už zobrazuje šablony <strong>${this._escape(primaryTemplate?.title || "?")}</strong> a <strong>${this._escape(secondaryTemplate?.title || "?")}</strong>. Vyberte, kterou nahradit, nebo šablonu roztáhněte přes celý displej.`
      : `Šablona <strong>${this._escape(primaryTemplate?.title || "První šablona")}</strong> zabírá celý displej. Vyberte, jak si obě šablony mají displej rozdělit.`;
    return `<div class="modal-backdrop template-space-dialog-backdrop">
      <section class="template-space-dialog" role="dialog" aria-modal="true" aria-labelledby="templateSpaceDialogTitle">
        <span class="template-space-dialog-icon"><ha-icon icon="mdi:view-dashboard-edit-outline"></ha-icon></span>
        <div>
          <small>Displej je již obsazený</small>
          <h2 id="templateSpaceDialogTitle">Kam umístit šablonu „${this._escape(nextTemplate.title)}“?</h2>
          <p>${description}</p>
        </div>
        <div class="template-placement-options">
          ${options.map(([value, label, hint]) => `<button type="button" class="template-placement-option is-${value}" data-template-placement="${value}">
            ${this._renderTemplatePlacementPreview(value, remainingFor(value), nextTemplate, previewWidth, previewHeight)}
            <span class="template-placement-option-text"><strong>${label}</strong><small>${hint}</small></span>
          </button>`).join("")}
        </div>
        <div class="template-space-dialog-actions">
          <button type="button" class="ghost" data-template-placement="cancel">Zrušit</button>
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
    const userTemplates = (this._userDisplayTemplates || [])
      .filter((template) => template && String(template.id || "").startsWith("user-template-"))
      .map((template) => ({
        ...structuredClone(template),
        id: String(template.id),
        title: String(template.title || "Vlastní šablona"),
        variables: Array.isArray(template.variables) ? template.variables : [],
        user_created: true,
        kind: "custom",
      }));
    const templates = [
      { id: "blank", number: "00", category: "custom", title: "Prázdná šablona", variables: [] },
      ...userTemplates,
      ...DISPLAY_TEMPLATE_CATALOG,
    ];
    const prepared = new Set(["blank", ...DISPLAY_TEMPLATES.filter((entry) => entry.prepared).map((entry) => entry.catalog.id)]);

    return templates.map((template) => ({
      ...template,
      kind: template.user_created ? "custom" : prepared.has(template.id) ? "prepared" : "custom",
    }));
  },

  _prepareDisplayTemplateBindings(template) {
    if (!template) return;
    this._displayTemplateBindings ||= {};
    const weatherEntity = template.id === "weather"
      ? Object.keys(this._hass?.states || {}).find((entityId) => entityId.startsWith("weather."))
      : "";
    const czSpotBindings = template.id === "cz_spot_prices" ? this._czSpotTemplateBindings() : {};
    template.variables.forEach((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      const key = `${template.id}:${meta.key}`;
      if (Object.prototype.hasOwnProperty.call(this._displayTemplateBindings, key)) return;
      if (meta.automatic) {
        this._displayTemplateBindings[key] = `internal:${meta.key}`;
        return;
      }
      const suggested = weatherEntity || czSpotBindings[index] || (template.id === "cz_spot_prices" ? "" : this._suggestTemplateEntity(meta));
      if (suggested) this._displayTemplateBindings[key] = suggested;
    });
  },

  // Whether a template's data slots actually point at real entities yet, as
  // opposed to still showing sample data. Automatic slots (time, date, …) do
  // not count - they never need a user choice. A template with no non-automatic
  // slots at all (blank, a user-drawn template, the radar map) has nothing to
  // configure, so it is reported as "complete" rather than "empty": there is no
  // unset state for a card that never asks for one.
  _templateBindingStatus(template) {
    const variables = Array.isArray(template?.variables) ? template.variables : [];
    const bindings = this._displayTemplateBindings || {};
    let total = 0;
    let done = 0;
    variables.forEach((variable, index) => {
      const meta = this._templateVariableMeta(variable, index);
      if (meta.automatic) return;
      total += 1;
      const value = bindings[`${template.id}:${meta.key}`];
      if (typeof value === "string" && value.trim()) done += 1;
    });
    if (!total) return { total: 0, done: 0, state: "complete" };
    if (done >= total) return { total, done, state: "complete" };
    if (done > 0) return { total, done, state: "partial" };
    return { total, done, state: "empty" };
  },

  _czSpotTemplateBindings() {
    const states = this._hass?.states || {};
    const entityIds = Object.keys(states);
    const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const usable = (entityId) => entityId && states[entityId] && !["unavailable", "unknown"].includes(String(states[entityId].state).toLowerCase());
    const sensorEntries = entityIds.filter((entityId) => entityId.startsWith("sensor.") && usable(entityId)).map((entityId) => {
      const friendlyName = normalize(states[entityId]?.attributes?.friendly_name);
      return { entityId, friendlyName, searchable: normalize(`${entityId} ${friendlyName}`) };
    });
    const findNamedEntity = (aliases, excluded = []) => {
      const wanted = aliases.map(normalize);
      const rejected = excluded.map(normalize);
      const allowed = (entry) => !rejected.some((term) => entry.searchable.includes(term));
      return sensorEntries.find((entry) => allowed(entry) && wanted.includes(entry.friendlyName))?.entityId
        || sensorEntries.find((entry) => allowed(entry) && wanted.some((term) => entry.searchable.includes(term)))?.entityId
        || "";
    };
    const findEntity = (base, duplicate = "") => {
      const preferred = duplicate ? `${base}${duplicate}` : base;
      if (usable(preferred)) return preferred;
      if (usable(base)) return base;
      return entityIds.find((entityId) => entityId === preferred || entityId.startsWith(`${base}_`)) || "";
    };
    const currentCandidates = [
      "sensor.current_buy_electricity_price_15min",
      "sensor.current_buy_electricity_price",
      "sensor.current_spot_electricity_price_15min",
      "sensor.current_spot_electricity_price",
    ];
    let current = currentCandidates.map((base) => findEntity(base)).find(Boolean) || "";
    if (!current) current = findNamedEntity(["Aktuální spotová cena elektřiny", "Current spot electricity price"], ["je nejlevnější", "is cheapest"]);
    if (!current) {
      current = entityIds.find((entityId) => {
        const state = states[entityId];
        const attributes = state?.attributes || {};
        const timestampCount = Object.keys(attributes).filter((key) => !Number.isNaN(Date.parse(key))).length;
        const name = `${entityId} ${attributes.friendly_name || ""}`.toLowerCase();
        return entityId.startsWith("sensor.") && timestampCount >= 20 && name.includes("electric") && name.includes("price");
      }) || "";
    }
    const named = {
      todayMin: findNamedEntity(["Dnešní nejlevnější spotová cena elektřiny", "Spot cheapest electricity today"]),
      todayMax: findNamedEntity(["Dnešní nejdražší spotová cena elektřiny", "Spot most expensive electricity today"]),
      tomorrowMin: findNamedEntity(["Zítřejší nejlevnější spotová cena elektřiny", "Spot cheapest electricity tomorrow"]),
      todayOrder: findNamedEntity(["Dnešní pořadí hodin spotových cen elektřiny", "Current spot electricity hour order", "Current spot electricity 15min order"]),
    };
    const match = current.match(/^sensor\.current_(buy|spot)_electricity_price(_15min)?(_\d+)?$/);
    if (!match) return { 0: current, 1: current, 2: named.todayMin, 3: named.todayMax, 4: named.tomorrowMin, 5: named.todayOrder };
    const trade = match[1];
    const interval = match[2] || "";
    const duplicate = match[3] || "";
    const orderInterval = interval ? "15min" : "hour";
    return {
      0: current,
      1: current,
      2: findEntity(`sensor.${trade}_cheapest_electricity_today${interval}`, duplicate) || named.todayMin,
      3: findEntity(`sensor.${trade}_most_expensive_electricity_today${interval}`, duplicate) || named.todayMax,
      4: findEntity(`sensor.${trade}_cheapest_electricity_tomorrow${interval}`, duplicate) || named.tomorrowMin,
      5: findEntity(`sensor.current_${trade}_electricity_${orderInterval}_order`, duplicate) || named.todayOrder,
    };
  },

  _templateLiveDataChanged(previousHass, nextHass) {
    if (!previousHass?.states || !nextHass?.states || this._activeTab !== "display-settings") return false;
    const watched = new Set(Object.values(this._displayTemplateBindings || {}).filter((value) => typeof value === "string" && !value.startsWith("internal:")));
    Object.keys(nextHass.states)
      .filter((entityId) => /^(sensor|binary_sensor)\.(?:current_)?(?:buy|spot)_.*electricity|^sensor\.(?:buy|spot)_(?:cheapest|most_expensive)_electricity/.test(entityId))
      .forEach((entityId) => watched.add(entityId));
    return [...watched].some((entityId) => previousHass.states[entityId] !== nextHass.states[entityId]);
  },

  // The catalog tile shows the very drawing the display will get, laid out at the
  // panel's own resolution. It used to be a second, hand-written HTML rendering of
  // all twenty templates: the tile you picked and the picture that arrived on the
  // tag were two different designs by two different code paths, so every change to
  // one drifted silently from the other. There is now one renderer.
  _renderDisplayTemplateCatalogPreview(template, orientation, size) {
    const base = size && size.width && size.height ? size : { width: 250, height: 128 };
    const long = Math.max(base.width, base.height);
    const short = Math.min(base.width, base.height);
    const width = orientation === "landscape" ? long : short;
    const height = orientation === "landscape" ? short : long;
    if (template?.user_created) return this._renderUserDisplayTemplateCatalogPreview(template, orientation, width, height);
    return this._templateSvgThumbnail(template, width, height);
  },

  _renderUserDisplayTemplateCatalogPreview(template, orientation = template?.orientation, width = 250, height = 128) {
    const elements = Array.isArray(template?.editor_elements) ? template.editor_elements : [];
    const baseMarkup = template?.base_template_id ? this._templateSvgThumbnail(template, width, height) : "";
    const canvasRotation = this._userTemplateCanvasRotationStyle(template, orientation);
    const markup = elements.map((source) => {
      const item = this._orientedUserTemplateElement(source, template, orientation);
      const style = `left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;transform:rotate(${item.rotation}deg);--element-color:${item.color};--element-fill:${item.fill};--element-stroke:${item.stroke};--element-stroke-width:${item.strokeWidth}px;--element-radius:${item.radius}px;--element-font-size:${item.fontSize}px;--element-font-weight:${item.fontWeight};--element-font-family:${item.fontFamily};--element-font-style:${item.fontStyle};--element-text-decoration:${item.textDecoration};--element-text-outline-width:${item.textOutlineWidth}px;--element-text-outline-color:${item.textOutlineColor};--element-text-border-width:${item.textBorderWidth}px;--element-text-border-color:${item.textBorderColor};--element-overlay-opacity:${item.overlayOpacity}%;--element-text-align:${item.textAlign};--element-value:${Math.max(0, Math.min(100, item.value))}%`;
      let content = "";
      if (item.type === "image") content = `<img src="${this._escape(item.src || "")}" alt="">`;
      else if (["text", "button"].includes(item.type)) content = `<span>${this._escape(item.text || item.label)}</span>`;
      else if (item.type === "icon") content = `<ha-icon icon="mdi:${this._escape(item.icon || "star")}"></ha-icon>`;
      else if (item.type === "slider") content = this._renderTemplateProgressVisual(item);
      else if (item.type === "chart") content = this._renderTemplateChartVisual(item);
      else if (item.type === "gauge") content = this._renderTemplateGaugeVisual(item);
      else if (item.type === "signal") content = this._renderTemplateSignalVisual(item);
      return `<span class="template-overlay template-overlay-${item.type} variant-${this._escape(item.variant || "default")}" style="${style}" aria-hidden="true">${content}</span>`;
    }).join("");
    return `<span class="user-template-catalog-canvas">${baseMarkup}<span class="user-template-rotated-canvas ${canvasRotation.turn ? "is-whole-canvas-rotated" : ""}" style="${canvasRotation.style}">${markup}</span></span>`;
  },

  _renderDisplayTemplatesSection(device) {
    const size = this._devicePreviewSize(device);
    // The tile carries the panel's own proportions, so the thumbnail is the shape
    // of the thing being configured rather than the shape of a stylesheet box.
    const previewAspect = this._displayTemplateOrientation === "landscape"
      ? `${Math.max(size.width, size.height)}/${Math.min(size.width, size.height)}`
      : `${Math.min(size.width, size.height)}/${Math.max(size.width, size.height)}`;
    const battery = this._batteryInfo(device);
    const rssi = Number(device.rssi);
    const editing = this._editingDeviceAddress === device.address;
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const assignedTemplates = this._assignedDisplayTemplates(device);
    const sentTemplates = this._sentDisplayTemplates(device);
    const cards = this._displayTemplateCards();
    const settingsTemplate = cards.find((item) => item.id === this._templateSettingsDialogTemplateId);
    const query = String(this._displayTemplateSearchQuery || "").trim().toLocaleLowerCase("cs");
    // Every template shows up together - the old "Předpřipravené" / "Vlastní
    // nastavení" tabs hid half the catalog behind a click nobody knew to make.
    // The per-card badge (see below) still tells you whether a template's data
    // sources fill in on their own or need picking by hand; search is the only
    // filter left.
    const visibleCards = cards.filter((template) => {
      if (template.id === "blank" || !query) return true;
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
          <div class="display-template-device-info ${primaryTemplate ? "is-configurable" : ""}" ${primaryTemplate ? `data-display-template-configure="${this._escape(primaryTemplate.id)}" role="button" tabindex="0" title="Nastavit zdroje dat šablony ${this._escape(primaryTemplate.title)}"` : ""}>
            <div class="display-template-device-info-top">
              <span class="display-template-device-info-icon"><ha-icon icon="mdi:tablet-dashboard"></ha-icon></span>
              <div class="display-template-device-info-identity">
                <div class="display-template-device-info-name-row">
                  ${editing
                    ? `<input class="display-settings-name-input" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Název displeje" aria-label="Název displeje"><button class="display-settings-name-button is-save" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>`
                    : `<strong class="display-template-device-info-name">${this._escape(this._deviceTitle(device))}</strong><button class="display-settings-name-button" data-device-rename="${this._escape(device.address)}" title="Přejmenovat displej" aria-label="Přejmenovat displej"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`}
                </div>
                <span class="display-template-device-info-address">${this._escape(device.address)}</span>
              </div>
            </div>
            <div class="display-template-device-info-stats">
              <div class="display-template-device-info-stat" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}${Number.isFinite(battery.voltage) ? ` · ${this._formatBatteryVoltage(battery.voltage)}` : ""}">
                ${this._renderBatterySegments(battery.percent)}
                <div class="display-template-device-info-stat-copy"><small>Baterie</small><strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></div>
              </div>
              <div class="display-template-device-info-stat" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">
                ${this._renderSignalBars(rssi)}
                <div class="display-template-device-info-stat-copy"><small>Signál</small><strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></div>
              </div>
              <div class="display-template-device-info-stat" title="Rozlišení displeje">
                <ha-icon icon="mdi:aspect-ratio"></ha-icon>
                <div class="display-template-device-info-stat-copy"><small>Rozlišení</small><strong>${size.width} × ${size.height}</strong></div>
              </div>
            </div>
          </div>
          <div class="display-template-dropzone ${assignedTemplates.length ? "has-template" : ""}" data-display-template-dropzone tabindex="0" aria-label="Přetáhněte sem šablonu">
            ${primaryTemplate
              ? this._renderTemplatePhysicalDevicePreview(device, primaryTemplate, secondaryTemplate, orientation, layout, true)
              : this._renderDevicePreview(device, "template")}
            ${largeDisplay && assignedTemplates.length ? `<div class="display-template-drop-zones" data-display-template-drop-zones aria-hidden="true">
              <span class="display-template-drop-zone is-top" data-display-template-drop-zone="top" title="Umístit nahoru"><ha-icon icon="mdi:arrow-collapse-up"></ha-icon></span>
              <span class="display-template-drop-zone is-left" data-display-template-drop-zone="left" title="Umístit vlevo"><ha-icon icon="mdi:arrow-collapse-left"></ha-icon></span>
              <span class="display-template-drop-zone is-full" data-display-template-drop-zone="full" title="Přes celý displej"><ha-icon icon="mdi:arrow-expand-all"></ha-icon></span>
              <span class="display-template-drop-zone is-right" data-display-template-drop-zone="right" title="Umístit vpravo"><ha-icon icon="mdi:arrow-collapse-right"></ha-icon></span>
              <span class="display-template-drop-zone is-bottom" data-display-template-drop-zone="bottom" title="Umístit dolů"><ha-icon icon="mdi:arrow-collapse-down"></ha-icon></span>
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
                <input type="search" id="displayTemplateSearch" data-display-template-search value="${this._escape(this._displayTemplateSearchQuery || "")}" placeholder="Hledat šablonu nebo údaj…" aria-label="Hledat šablony">
              </div>
              <span class="pill muted display-template-result-count">${visibleCards.length} šablon</span>
            </div>
          </div>
          ${visibleCards.length ? `<div class="display-template-grid">${visibleCards.map((template) => {
            const used = assignedTemplates.includes(template.id);
            const onDisplay = sentTemplates.includes(template.id);
            const userCreated = !!template.user_created;
            const configStatus = this._templateBindingStatus(template);
            if (template.id === "blank") {
              return `<article class="display-template-card display-template-drag-card display-template-blank-card ${onDisplay ? "is-on-display" : ""}" data-display-template-open="blank" aria-label="Vytvořit vlastní šablonu od nuly. Kliknutím otevřete designer.">
                <header class="display-template-tile-header">
                  <span class="display-template-kind-icon is-blank-icon"><ha-icon icon="mdi:plus-circle-outline"></ha-icon></span>
                  <span class="display-template-tile-identity"><strong>Vytvořit vlastní šablonu</strong><small>Návrh od nuly v eInk Studiu</small></span>
                  <span class="display-template-variable-count blank-badge">+ Nová</span>
                </header>
                <div class="display-template-tile-preview is-${orientation} is-blank-preview" data-display-template-open="blank" role="button" tabindex="0" aria-label="Otevřít prázdný designer">
                  <span class="display-template-preview" style="aspect-ratio:${previewAspect};min-height:0">${this._renderDisplayTemplateCatalogPreview(template, orientation, size)}</span>
                </div>
                <div class="display-template-tile-actions">
                  <button type="button" class="display-template-card-action is-blank-action-btn" data-display-template-open="blank"><ha-icon icon="mdi:palette-outline"></ha-icon> Otevřít prázdný Designer</button>
                </div>
              </article>`;
            }
            return `<article class="display-template-card display-template-drag-card is-config-${configStatus.state} ${userCreated ? "is-user-created" : ""} ${used ? "is-used" : ""} ${onDisplay ? "is-on-display" : ""}" draggable="true" data-display-template-drag="${template.id}" aria-label="${this._escape(template.title)}. Přetáhněte na displej.">
              <header class="display-template-tile-header">
                <span class="display-template-kind-icon"><ha-icon icon="mdi:${userCreated ? "palette-outline" : template.kind === "prepared" ? "auto-fix" : "tune-variant"}"></ha-icon></span>
                <span class="display-template-tile-identity"><strong>${this._escape(template.title)}</strong><small>${userCreated ? "Vytvořeno uživatelem" : template.kind === "prepared" ? "Automatické nastavení" : "Vlastní zdroje dat"}</small></span>
                ${userCreated ? `<span class="user-template-owner-mark" title="Uživatelská šablona"><ha-icon icon="mdi:check-circle"></ha-icon></span>` : `<button type="button" class="display-template-help" data-display-template-setup="${this._escape(template.id)}" title="Jak zprovoznit šablonu ${this._escape(template.title)}" aria-label="Jak zprovoznit šablonu ${this._escape(template.title)}"><ha-icon icon="mdi:help-circle-outline"></ha-icon></button>`}
              </header>
              <div class="display-template-tile-preview is-${orientation}" data-display-template-select="${template.id}" role="button" tabindex="0" aria-label="Vybrat šablonu ${this._escape(template.title)} pro displej">
                <span class="display-template-preview ${userCreated ? "has-user-template" : ""}" style="aspect-ratio:${previewAspect};min-height:0">${this._renderDisplayTemplateCatalogPreview(template, orientation, size)}</span>
              </div>
              <div class="display-template-tile-meta">
                ${userCreated ? `<span class="user-template-created-note"><ha-icon icon="mdi:palette-outline"></ha-icon>Vytvořeno v eInk Studiu</span>` : `<div class="display-template-meta-row">
                  <button type="button" class="display-template-config-status is-${configStatus.state}" data-display-template-configure="${this._escape(template.id)}" title="${configStatus.state === "complete" ? "Všechny zdroje dat jsou napojené na entity Home Assistantu. Kliknutím upravíte." : configStatus.state === "partial" ? `Napojeno ${configStatus.done} z ${configStatus.total} zdrojů dat. Kliknutím dokončíte.` : "Zdroje dat ještě nejsou napojené. Kliknutím je nastavíte."}"><ha-icon icon="mdi:${configStatus.state === "complete" ? "check-circle" : configStatus.state === "partial" ? "alert-circle" : "circle-off-outline"}"></ha-icon>${configStatus.state === "complete" ? "Nastaveno" : configStatus.state === "partial" ? `${configStatus.done}/${configStatus.total}` : "Nenastaveno"}</button>
                  <span class="display-template-variables-row" aria-label="Použité údaje">${(template.variables.length > 5 ? template.variables.slice(0, 4) : template.variables).map(([iconName, label]) => `<span class="display-template-variable-icon" title="${this._escape(label)}"><ha-icon icon="mdi:${iconName}"></ha-icon></span>`).join("")}${template.variables.length > 5 ? `<span class="display-template-variable-overflow" tabindex="0" aria-label="Další údaje: ${this._escape(template.variables.map(([, label]) => label).join(", "))}">
                    <span class="display-template-variable-overflow-badge">+${template.variables.length}</span>
                    <span class="display-template-variable-overflow-menu" role="tooltip">
                      <strong>Použité údaje</strong>
                      <ul>${template.variables.map(([iconName, label]) => `<li><ha-icon icon="mdi:${iconName}"></ha-icon>${this._escape(label)}</li>`).join("")}</ul>
                    </span>
                  </span>` : ""}</span>
                </div>`}
              </div>
              <div class="display-template-tile-actions">
                <button type="button" class="display-template-card-action" data-display-template-edit-menu="${template.id}" aria-expanded="${this._templateEditMenuId === template.id}"><ha-icon icon="mdi:${onDisplay ? "check-circle" : "tune-variant"}"></ha-icon>Upravit šablonu<ha-icon icon="mdi:chevron-down"></ha-icon></button>
                ${this._templateEditMenuId === template.id ? `<div class="display-template-edit-menu" role="menu" aria-label="Možnosti úpravy šablony ${this._escape(template.title)}">
                  <div class="display-template-edit-menu-head"><span><ha-icon icon="mdi:tune-variant"></ha-icon></span><div><strong>Co chcete upravit?</strong><small>${this._escape(template.title)}</small></div></div>
                  <button type="button" role="menuitem" data-display-template-edit-choice="variables" data-display-template-id="${this._escape(template.id)}"><ha-icon icon="mdi:database-edit-outline"></ha-icon><span><strong>Upravit zdroje dat</strong><small>Napojení hodnot na entity Home Assistantu</small></span></button>
                  <button type="button" role="menuitem" data-display-template-edit-choice="designer" data-display-template-id="${this._escape(template.id)}"><ha-icon icon="mdi:palette-outline"></ha-icon><span><strong>Designer displeje</strong><small>Rozložení, prvky a vzhled displeje</small></span></button>
                </div>` : ""}
              </div>
            </article>`;
          }).join("")}</div>` : `<div class="display-template-empty"><ha-icon icon="mdi:magnify-close"></ha-icon><strong>Žádná šablona neodpovídá filtru</strong><span>Zkuste jiný název nebo druh šablony.</span></div>`}
        </section>
      </div>
    </section>${settingsTemplate && this._templateSettingsDialogMode === "variables" ? this._renderTemplateSettingsDialog(settingsTemplate, largeDisplay ? "large" : "small", largeDisplay) : ""}`;
  },

  _assignedDisplayTemplates(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const assigned = this._displayTemplateAssignments?.[address];
    if (Array.isArray(assigned)) return assigned.filter(Boolean).slice(0, 2);
    return [];
  },

  _sentDisplayTemplates(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const sent = this._deviceDrafts?.[address]?.sent_template_ids;
    if (Array.isArray(sent)) return sent.filter(Boolean).slice(0, 2);
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

  // Puts exactly one template on the display, discarding whatever else was
  // there. This is the "whole screen" placement choice - the other four
  // (left/right/top/bottom) keep the display's other slot intact instead.
  _assignDisplayTemplateFull(device, templateId) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (!address || !templateId) return [];
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = [templateId];
    return [templateId];
  },

  // Puts a template into a specific half (index 0 = left/top, index 1 =
  // right/bottom) while keeping whatever already occupies the other half.
  // _assignDisplayTemplate cannot do this: its replaceIndex only overwrites a
  // slot that already exists in the current array, so handing it index 0 while
  // only one template is assigned collapses the array back to length 1 and
  // silently drops that other template instead of shifting it aside.
  _placeDisplayTemplateInSlot(device, templateId, index) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (!address || !templateId) return [];
    const current = this._assignedDisplayTemplates(device);
    let next;
    if (current.length >= 2) {
      // Both slots already have a fixed position; only the requested one changes.
      next = [current[0], current[1]];
      next[index] = templateId;
    } else {
      // Fewer than two slots exist yet, so the sole occupant (if any) is not
      // reliably at the position it conceptually belongs to - a single template
      // always sits at array index 0 regardless of which half it visually
      // occupies. Find it by identity instead of by index, so it lands in
      // whichever slot this placement did not ask for.
      const other = current.find((id) => id !== templateId) || null;
      next = index === 0 ? [templateId, other] : [other, templateId];
    }
    const deduped = next.filter((id, position) => id && next.indexOf(id) === position).slice(0, 2);
    this._displayTemplateAssignments ||= {};
    this._displayTemplateAssignments[address] = deduped;
    return deduped;
  },

  _activeTemplateEditorStateId() {
    return String(
      this._selectedTemplateCanvasSlot === "secondary"
        ? this._selectedDisplayTemplateSecondaryId
        : this._selectedDisplayTemplateId
    );
  },

  _rememberActiveTemplateEditorState(templateId = this._activeTemplateEditorStateId()) {
    const id = String(templateId || "");
    if (!id) return;
    this._templateEditorStates ||= {};
    this._templateEditorStates[id] = {
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(this._templateElementAdjustments || {}),
      designer_viewport: this._templateDesignerViewport || "wide",
    };
  },

  _restoreTemplateEditorState(templateId, template = null) {
    const id = String(templateId || "");
    const saved = this._templateEditorStates?.[id];
    const sourceElements = saved?.editor_elements
      ?? (template?.user_created ? template.editor_elements : []);
    const sourceAdjustments = saved?.element_adjustments
      ?? (template?.user_created ? template.element_adjustments : {});
    const requestedViewport = saved?.designer_viewport || template?.designer_viewport || "wide";
    this._templateDesignerViewport = ["narrow", "wide", "large", "large-portrait"].includes(requestedViewport)
      ? requestedViewport
      : "wide";
    this._templateEditorElements = Array.isArray(sourceElements)
      ? structuredClone(sourceElements).map((item) => this._normalizeTemplateEditorElement(item))
      : [];
    this._templateElementAdjustments = structuredClone(sourceAdjustments || {});
    this._selectedTemplateEditorElementId = "";
    this._selectedTemplatePart = "";
    this._templateOverlayDrag = null;
    this._refreshTemplateEntityElements?.();
  },

  _displayTemplateDraftPayload(device = this._device()) {
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    this._rememberActiveTemplateEditorState();
    return {
      assignments: address ? [...(this._displayTemplateAssignments?.[address] || [])] : [],
      selected_primary: this._selectedDisplayTemplateId || "",
      selected_secondary: this._selectedDisplayTemplateSecondaryId || "",
      orientation: this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait",
      layout: this._displayTemplateLargeLayout || "single",
      bindings: structuredClone(this._displayTemplateBindings || {}),
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(this._templateElementAdjustments || {}),
      template_states: structuredClone(this._templateEditorStates || {}),
      formats: structuredClone(this._displayTemplateFormats || {}),
      sizes: structuredClone(this._displayTemplateSizes || {}),
      placements: structuredClone(this._templateCanvasPlacements || {}),
      image_library: structuredClone(this._templateImageLibrary || []),
      designer_viewport: this._templateDesignerViewport || "wide",
      meteoradar_country: this._meteoradarCountry || "cz",
    };
  },

  _restoreDisplayTemplateConfig(config) {
    this._templateUndoStack = [];
    this._templateRedoStack = [];
    this._templatePropertyHistoryKey = "";
    this._meteoradarCountry = config?.meteoradar_country || "cz";
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
      this._templateEditorStates = {};
      this._selectedTemplateEditorElementId = "";
      this._templateOverlayDrag = null;
      this._templateElementAdjustments = {};
      this._templateImageLibrary = [];
      this._templateDesignerViewport = "wide";
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
    this._templateDesignerViewport = ["narrow", "wide", "large", "large-portrait"].includes(config.designer_viewport)
      ? config.designer_viewport
      : "wide";
    this._displayTemplateBindings = structuredClone(config.bindings || {});
    this._templateEditorStates = {};
    if (config.template_states && typeof config.template_states === "object" && !Array.isArray(config.template_states)) {
      for (const [templateId, state] of Object.entries(config.template_states)) {
        if (!templateId || !state || typeof state !== "object") continue;
        this._templateEditorStates[templateId] = {
          editor_elements: Array.isArray(state.editor_elements) ? structuredClone(state.editor_elements) : [],
          element_adjustments: structuredClone(state.element_adjustments || {}),
          designer_viewport: ["narrow", "wide", "large", "large-portrait"].includes(state.designer_viewport)
            ? state.designer_viewport
            : this._templateDesignerViewport,
        };
      }
    }
    const restoredTemplateId = this._selectedDisplayTemplateId || assignments[0] || "";
    if (restoredTemplateId && !this._templateEditorStates[restoredTemplateId]
      && (Array.isArray(config.editor_elements) || config.element_adjustments)) {
      // Legacy drafts had one global editor state. It belongs only to the
      // template that was selected when that draft was saved.
      this._templateEditorStates[restoredTemplateId] = {
        editor_elements: Array.isArray(config.editor_elements) ? structuredClone(config.editor_elements) : [],
        element_adjustments: structuredClone(config.element_adjustments || {}),
        designer_viewport: this._templateDesignerViewport,
      };
    }
    this._restoreTemplateEditorState(restoredTemplateId);
    const embeddedUserTemplates = Array.isArray(config.user_templates)
      ? structuredClone(config.user_templates).filter((template) => template && String(template.id || "").startsWith("user-template-"))
      : [];
    const sharedTemplatesBeforeMigration = [...(this._userDisplayTemplates || [])];
    this._userDisplayTemplates = this._mergeUserDisplayTemplates
      ? this._mergeUserDisplayTemplates(this._userDisplayTemplates, embeddedUserTemplates)
      : embeddedUserTemplates;
    for (const template of embeddedUserTemplates) {
      const shared = sharedTemplatesBeforeMigration.find((item) => item.id === template.id);
      const embeddedUpdated = Date.parse(template.updated_at || "") || Number(template.updated_at || 0);
      const sharedUpdated = Date.parse(shared?.updated_at || "") || Number(shared?.updated_at || 0);
      if (!shared || embeddedUpdated > sharedUpdated) this._saveUserDisplayTemplate?.(template).catch(() => {});
    }
    this._templateImageLibrary = Array.isArray(config.image_library)
      ? structuredClone(config.image_library).filter((asset) => asset?.id && String(asset.src || "").startsWith("data:image/"))
      : [];
    this._displayTemplateFormats = { primary: "narrow", secondary: "narrow", ...(config.formats || {}) };
    this._displayTemplateSizes = { primary: "large", secondary: "small", ...(config.sizes || {}) };
    this._templateCanvasPlacements = {
      primary: { x: 9, y: 9 },
      secondary: { x: 9, y: 9 },
      ...(config.placements || {}),
    };
    this._selectedTemplatePart = "";
    this._refreshTemplateEntityElements?.();
  },

  _nextUserDisplayTemplateTitle() {
    const names = new Set((this._userDisplayTemplates || []).map((template) => String(template.title || "").trim()));
    if (!names.has("Vlastní šablona")) return "Vlastní šablona";
    let index = 2;
    while (names.has(`Vlastní šablona ${index}`)) index += 1;
    return `Vlastní šablona ${index}`;
  },

  _storeCurrentUserDisplayTemplate(device = this._device()) {
    const selectedId = String(this._selectedDisplayTemplateId || "");
    const existing = (this._userDisplayTemplates || []).find((template) => template.id === selectedId);
    const sourceTemplate = this._displayTemplateCards().find((template) => template.id === selectedId);
    if (!sourceTemplate) return null;
    const id = existing?.id || `user-template-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const title = existing?.title || (selectedId === "blank" ? this._nextUserDisplayTemplateTitle() : `${sourceTemplate.title} – upravená`);
    const now = new Date().toISOString();
    const viewport = this._templateDesignerViewport || "wide";
    const viewportSize = {
      narrow: { width: 128, height: 296 },
      wide: { width: 296, height: 128 },
      large: { width: 800, height: 480 },
      "large-portrait": { width: 480, height: 800 },
    }[viewport] || { width: 296, height: 128 };
    const remappedAdjustments = Object.fromEntries(Object.entries(this._templateElementAdjustments || {}).map(([key, adjustment]) => [
      key.replace(`:${selectedId}:`, `:${id}:`), structuredClone(adjustment),
    ]));
    this._templateElementAdjustments = remappedAdjustments;
    const stored = {
      ...(existing || {}),
      id,
      title,
      user_created: true,
      base_template_id: existing?.base_template_id || (selectedId === "blank" ? "" : selectedId),
      variables: structuredClone(existing?.variables || sourceTemplate.variables || []),
      options: structuredClone(existing?.options || sourceTemplate.options || []),
      editor_elements: structuredClone(this._templateEditorElements || []),
      element_adjustments: structuredClone(remappedAdjustments),
      orientation: this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait",
      design_orientation: existing?.design_orientation || existing?.orientation || (this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait"),
      designer_viewport: viewport,
      design_width: viewportSize.width,
      design_height: viewportSize.height,
      formats: structuredClone(this._displayTemplateFormats || {}),
      sizes: structuredClone(this._displayTemplateSizes || {}),
      placements: structuredClone(this._templateCanvasPlacements || {}),
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    this._userDisplayTemplates = existing
      ? this._userDisplayTemplates.map((template) => template.id === id ? stored : template)
      : [...(this._userDisplayTemplates || []), stored];
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    if (address) {
      this._displayTemplateAssignments ||= {};
      this._displayTemplateAssignments[address] = this._assignedDisplayTemplates(device)
        .map((templateId) => templateId === selectedId ? id : templateId);
    }
    this._selectedDisplayTemplateId = id;
    this._rememberActiveTemplateEditorState(id);
    if (selectedId === "blank" && id !== selectedId) delete this._templateEditorStates.blank;
    this._projectName = title;
    this._selectedTemplateEditorElementId = "";
    return stored;
  },

  _applyUserDisplayTemplate(template) {
    if (!template?.user_created) return;
    this._templateUndoStack = [];
    this._templateRedoStack = [];
    this._templatePropertyHistoryKey = "";
    this._pushHistory();
    this._objects = [];
    this._variables = {};
    this._restoreTemplateEditorState(template.id, template);
    this._displayTemplateFormats = { primary: "narrow", secondary: "narrow", ...(template.formats || {}) };
    this._displayTemplateSizes = { primary: "large", secondary: "small", ...(template.sizes || {}) };
    this._templateCanvasPlacements = {
      primary: { x: 9, y: 9 },
      secondary: { x: 9, y: 9 },
      ...(template.placements || {}),
    };
    this._selectedTemplateEditorElementId = "";
    this._selectedTemplatePart = "";
    this._selectedProjectId = "";
    this._projectName = template.title || "Vlastní šablona";
    this._nextId = 1;
    this._refreshTemplateEntityElements?.();
  },

  _currentUserDisplayTemplate() {
    const selectedId = String(this._selectedDisplayTemplateId || "");
    return (this._userDisplayTemplates || []).find((template) => template?.user_created && template.id === selectedId) || null;
  },

  _userTemplateQuarterTurn(template, targetOrientation = this._displayTemplateOrientation) {
    if (!template?.user_created) return 0;
    const sourceOrientation = ["portrait", "landscape"].includes(template.design_orientation)
      ? template.design_orientation
      : template.orientation;
    const source = sourceOrientation === "landscape" ? "landscape" : "portrait";
    const target = targetOrientation === "landscape" ? "landscape" : "portrait";
    if (source === target) return 0;
    return source === "portrait" ? 1 : -1;
  },

  // Stored elements always remain in their authored coordinate system. The live
  // preview rotates one wrapper around the complete canvas instead of rewriting
  // every child, so text, images and charts behave like one finished picture.
  _orientedUserTemplateElement(source, template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation) {
    return this._normalizeTemplateEditorElement(source);
  },

  _quarterTurnedUserTemplateElement(source, template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation) {
    const item = this._normalizeTemplateEditorElement(source);
    const turn = this._userTemplateQuarterTurn(template, targetOrientation);
    if (turn === 1) {
      return { ...item, x: 100 - item.y - item.h, y: item.x, w: item.h, h: item.w, rotation: item.rotation + 90 };
    }
    if (turn === -1) {
      return { ...item, x: item.y, y: 100 - item.x - item.w, w: item.h, h: item.w, rotation: item.rotation - 90 };
    }
    return item;
  },

  _userTemplateElementFromView(source, template = this._currentUserDisplayTemplate()) {
    return this._normalizeTemplateEditorElement(source);
  },

  _userTemplateCanvasRotationStyle(template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation, targetRatio = 0) {
    const turn = this._userTemplateQuarterTurn(template, targetOrientation);
    if (!turn) return { turn: 0, style: "" };
    const base = this._baseDisplaySize?.(this._device?.()) || { width: 296, height: 128 };
    const long = Math.max(1, Number(base.width || 296), Number(base.height || 128));
    const short = Math.max(1, Math.min(Number(base.width || 296), Number(base.height || 128)));
    const ratio = Number(targetRatio) > 0 ? Number(targetRatio) : targetOrientation === "landscape" ? long / short : short / long;
    return {
      turn,
      style: `left:50%;top:50%;right:auto;bottom:auto;width:${100 / ratio}%;height:${100 * ratio}%;transform:translate(-50%,-50%) rotate(${turn * 90}deg)`,
    };
  },

  async _saveDisplayTemplateDraft() {
    const device = this._device();
    if (!device || !this._hass) return false;
    window.clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = null;
    const payload = this._projectPayload(device);
    return this._queueDeviceDraftSave(device, payload);
  },

  _renderDisplayTemplateEditor(device) {
    const templates = this._displayTemplateCards();
    const template = templates.find((item) => item.id === this._selectedDisplayTemplateId) || templates[0];
    const size = this._devicePreviewSize(device);
    const largeDisplay = Math.max(size.width, size.height) >= 400 && Math.min(size.width, size.height) >= 300;
    const selectedSize = "large";
    const activeTemplate = template;
    const previewZoom = Math.max(0.5, Math.min(1.8, Number(this._displayTemplatePreviewZoom || 1)));
    const viewport = ["narrow", "wide", "large", "large-portrait"].includes(this._templateDesignerViewport)
      ? this._templateDesignerViewport
      : "wide";
    const viewportSize = {
      narrow: { width: 128, height: 296 },
      wide: { width: 296, height: 128 },
      large: { width: 800, height: 480 },
      "large-portrait": { width: 480, height: 800 },
    }[viewport];
    const canvasWidth = viewportSize.width;
    const canvasHeight = viewportSize.height;
    const canvasScale = Math.min(760 / canvasWidth, 360 / canvasHeight);
    const previewCanvasWidth = Math.round(canvasWidth * canvasScale);
    const canvasFormat = canvasWidth >= canvasHeight ? "wide" : "narrow";
    return `<section class="display-template-editor-page studio-pro-workspace">
      <div class="studio-pro-top-row">
        ${this._renderStudioActions()}
      </div>
      <div class="display-template-editor-layout">
        <div class="studio-pro-selection-row">
          ${this._renderTemplateSelectionBar(activeTemplate, previewZoom, viewport)}
        </div>
        <aside class="card display-template-editor-panel display-template-editor-left studio-pro-sidebar" aria-label="Kategorie prvků">
          ${this._renderTemplateEditorTools()}
          ${this._renderTemplateElementPalette()}
        </aside>

        <main class="display-template-editor-canvas" data-photoshop-canvas>
          <div class="display-template-preview-card photoshop-canvas-card">
            <div class="display-template-editor-stage">
              <div class="template-standalone-editor template-designer-screen viewport-${viewport}" style="--template-canvas-ratio:${canvasWidth}/${canvasHeight};--template-canvas-width:${previewCanvasWidth}px;--template-preview-zoom:${previewZoom}" aria-label="Plátno šablony ${this._escape(template.title)}">
                ${this._renderDisplayTemplateSurface(template, canvasFormat, true, "primary", true, "large", false, canvasWidth, canvasHeight)}
              </div>
            </div>
          </div>
        </main>

        <div class="display-template-editor-right-column">
          ${this._templateSendResult ? `<div class="template-send-result ${this._templateSendResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSendResult.ok ? "check-circle-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSendResult.message)}</span></div>` : ""}
          ${this._templateSaveResult ? `<div class="template-send-result ${this._templateSaveResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSaveResult.ok ? "content-save-check-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSaveResult.message)}</span></div>` : ""}
          <aside class="card display-template-editor-panel display-template-editor-right" aria-label="Nastavení prvku nebo šablony">
            ${this._selectedTemplateEditorElementId ? this._renderTemplateElementInspector() : this._selectedTemplatePart ? this._renderTemplatePartInspector(activeTemplate) : `
            <div class="template-properties-empty"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><strong>Vyberte prvek na plátně</strong><p>Zde se zobrazí všechny jeho barvy, text, podbarvení, orámování, data a další vlastnosti.</p><button type="button" class="secondary" data-template-settings-open><ha-icon icon="mdi:tune-variant"></ha-icon>Nastavení celé šablony</button></div>`}
          </aside>
        </div>
      </div>
      ${this._renderTemplateSettingsDialog(activeTemplate, selectedSize, largeDisplay)}
    </section>`;
  },

  // Geometry and markup shared by every variable's crop in one dialog, built
  // once instead of once per variable: the SVG layout pass and icon warm-up
  // are the same regardless of which variable is asking.
  _templateVariableCropContext(template) {
    const size = this._devicePreviewSize(this._device()) || { width: 296, height: 128 };
    const orientation = this._displayTemplateOrientation === "landscape" ? "landscape" : "portrait";
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    const width = orientation === "landscape" ? long : short;
    const height = orientation === "landscape" ? short : long;
    const rows = this._templateSvgRows(template);
    this._requestTemplateIcons(rows);
    this._requestTemplateRadarImage(rows, width, height);
    return { width, height, markup: this._layoutTemplateSvg(rows, width, height), boxes: this._templateVariableCropBoxes(template, width, height) };
  },

  // The setup guide's own content, reused both inside the merged dialog and
  // (unchanged) nowhere else now that the two dialogs are one.
  _renderInteractiveCountryMap(selectedCountry = "cz", address = "") {
    const active = String(selectedCountry || "cz").toLowerCase();
    // The "eu" overview draws all five countries' borders at once (see
    // compose_multi_country_radar_image in meteoradar.py), so picking it here
    // should light up all five shapes too - leaving the map dark for that
    // choice looked like the picker had forgotten about it entirely.
    const isCountryActive = (id) => active === id || active === "eu";
    const countries = [
      { id: "cz", name: "Česká republika", flag: "🇨🇿" },
      { id: "sk", name: "Slovensko", flag: "🇸🇰" },
      { id: "de", name: "Německo", flag: "🇩🇪" },
      { id: "at", name: "Rakousko", flag: "🇦🇹" },
      { id: "pl", name: "Polsko", flag: "🇵🇱" },
      { id: "eu", name: "Střední Evropa", flag: "🇪🇺" },
    ];
    const activeCountryObj = countries.find((c) => c.id === active) || countries[0];

    return `<div class="interactive-country-map-widget">
      <div class="country-map-header">
        <ha-icon icon="mdi:map-legend"></ha-icon>
        <strong>Výběr státu srážkové radarové mapy</strong>
        <span class="active-country-pill">${activeCountryObj.flag} ${this._escape(activeCountryObj.name)}</span>
      </div>
      <div class="country-map-svg-wrap">
        <svg class="country-map-svg" viewBox="0 0 600 450" preserveAspectRatio="xMidYMid meet" aria-label="Interaktivní mapa Střední Evropy pro výběr státu">
          <defs>
            <filter id="mapGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <!-- NĚMECKO (DE) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("de") ? "is-active" : ""}" data-meteoradar-country="de" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Německo">
            <path d="M 160.5 382.9 L 185.6 390.0 L 215.7 374.3 L 240.0 385.8 L 231.1 356.8 L 264.2 327.0 L 228.0 296.0 L 211.0 253.9 L 218.1 261.0 L 281.0 225.9 L 278.4 218.3 L 293.5 229.7 L 301.1 207.6 L 287.2 180.6 L 288.7 143.0 L 272.9 129.6 L 283.0 108.0 L 277.9 81.7 L 242.9 56.6 L 260.7 55.6 L 258.8 39.6 L 246.2 35.1 L 255.6 46.9 L 242.9 41.2 L 242.5 53.1 L 221.0 54.5 L 236.3 47.4 L 223.6 44.5 L 191.1 75.3 L 169.7 68.3 L 180.9 49.2 L 151.9 51.8 L 142.1 45.9 L 143.8 27.8 L 98.3 23.6 L 97.8 14.0 L 93.8 30.3 L 104.0 23.4 L 116.5 45.0 L 103.7 53.4 L 124.4 77.3 L 104.1 76.0 L 92.9 101.0 L 85.5 84.8 L 55.7 93.4 L 61.3 121.0 L 44.8 144.0 L 56.6 159.7 L 46.4 176.8 L 22.3 180.5 L 30.9 203.4 L 19.9 218.7 L 36.5 253.1 L 27.4 266.3 L 46.6 308.7 L 92.4 317.9 L 72.3 357.1 L 75.1 383.8 L 103.1 381.0 L 102.7 371.4 L 122.6 377.9 L 117.1 371.0 L 153.7 395.8 L 160.5 382.9 Z" class="map-country-shape" />
            <text x="162" y="164" class="map-country-flag">🇩🇪</text>
            <text x="162" y="190" class="map-country-label">DE</text>
          </g>

          <!-- POLSKO (PL) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("pl") ? "is-active" : ""}" data-meteoradar-country="pl" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Polsko">
            <path d="M 414.5 284.5 L 409.3 272.9 L 401.5 273.2 L 392.8 266.0 L 384.9 268.2 L 379.3 261.5 L 384.3 259.3 L 383.0 253.7 L 371.9 256.6 L 358.0 247.7 L 362.0 258.2 L 351.6 264.5 L 336.5 248.5 L 344.1 241.4 L 341.0 237.4 L 331.2 240.4 L 324.8 232.9 L 311.3 231.8 L 305.1 220.0 L 299.4 220.4 L 299.9 227.4 L 294.3 227.2 L 301.1 207.6 L 287.3 180.7 L 292.4 168.5 L 285.5 152.0 L 288.7 143.0 L 272.9 129.7 L 283.0 108.0 L 271.6 46.7 L 277.7 63.3 L 328.7 46.1 L 340.6 32.7 L 364.9 21.4 L 401.5 15.2 L 420.6 25.6 L 442.2 46.1 L 497.4 53.2 L 541.4 48.4 L 559.9 61.9 L 573.1 113.4 L 573.8 136.0 L 559.3 144.2 L 550.5 157.6 L 565.0 168.1 L 561.1 185.2 L 564.8 206.7 L 580.1 227.5 L 574.3 231.0 L 578.6 238.6 L 575.6 249.4 L 567.3 250.6 L 553.6 264.4 L 534.0 291.5 L 541.7 316.0 L 521.3 309.2 L 503.0 295.4 L 487.5 295.9 L 481.4 302.5 L 475.7 296.8 L 466.3 296.7 L 457.5 301.4 L 455.7 307.9 L 446.4 307.0 L 446.6 297.1 L 441.8 297.2 L 436.7 287.5 L 421.8 297.8 L 414.5 284.5 Z" class="map-country-shape" />
            <text x="423" y="198" class="map-country-flag">🇵🇱</text>
            <text x="423" y="224" class="map-country-label">PL</text>
          </g>

          <!-- ČESKÁ REPUBLIKA (CZ) - reálná hranice (ČÚZK via geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("cz") ? "is-active" : ""}" data-meteoradar-country="cz" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Českou republiku">
            <path d="M 356.9 259.7 L 349.9 263.8 L 336.9 249.5 L 344.1 241.4 L 341.0 237.4 L 331.2 240.4 L 324.8 232.9 L 311.3 231.8 L 305.1 220.0 L 299.4 220.4 L 299.9 227.4 L 291.3 229.6 L 284.7 218.9 L 278.8 218.3 L 277.1 221.6 L 281.1 225.9 L 264.7 234.2 L 255.4 234.9 L 252.8 240.3 L 249.9 237.9 L 236.9 249.8 L 233.0 247.1 L 223.6 250.1 L 218.1 261.0 L 213.5 253.7 L 210.6 257.1 L 224.6 272.9 L 220.1 280.9 L 228.0 296.0 L 239.4 302.1 L 251.6 317.6 L 261.1 321.7 L 271.2 335.2 L 279.4 337.2 L 283.6 332.7 L 290.8 335.7 L 293.9 326.7 L 299.2 327.0 L 300.4 315.4 L 304.7 319.1 L 308.4 316.6 L 325.6 322.1 L 333.6 328.2 L 342.0 329.0 L 347.0 325.0 L 358.1 329.5 L 359.3 334.2 L 367.2 322.1 L 377.3 325.1 L 388.2 319.7 L 394.7 313.6 L 397.4 302.9 L 403.4 300.9 L 408.7 292.7 L 417.8 292.1 L 409.3 272.9 L 401.5 273.2 L 392.8 266.0 L 389.3 270.2 L 384.9 268.2 L 379.3 261.5 L 384.3 259.3 L 383.0 253.7 L 371.8 256.5 L 371.8 253.4 L 358.3 247.6 L 362.0 258.2 L 356.9 259.7 Z" class="map-country-shape" />
            <text x="317" y="260" class="map-country-flag">🇨🇿</text>
            <text x="317" y="286" class="map-country-label">CZ</text>
          </g>

          <!-- SLOVENSKO (SK) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("sk") ? "is-active" : ""}" data-meteoradar-country="sk" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Slovensko">
            <path d="M 514.4 345.1 L 519.1 344.3 L 519.6 335.5 L 524.7 331.1 L 526.1 322.7 L 531.7 312.2 L 516.2 306.4 L 513.2 300.0 L 509.4 298.0 L 507.5 299.7 L 503.0 295.4 L 497.0 297.0 L 492.2 294.7 L 489.6 297.5 L 487.5 295.9 L 485.1 296.7 L 486.6 299.2 L 481.4 302.5 L 475.7 296.8 L 470.7 298.7 L 466.3 296.7 L 457.5 301.4 L 455.7 308.0 L 451.0 305.3 L 446.4 307.0 L 446.6 297.1 L 441.8 297.2 L 436.1 287.5 L 433.5 291.2 L 430.4 291.4 L 427.1 297.4 L 421.8 297.8 L 420.6 292.0 L 408.7 292.7 L 403.4 300.9 L 397.4 302.9 L 393.5 315.0 L 389.4 315.4 L 388.2 319.7 L 385.0 319.8 L 382.7 322.9 L 372.2 325.1 L 367.0 322.2 L 360.1 331.8 L 356.0 345.1 L 363.9 358.0 L 363.9 361.7 L 371.4 362.9 L 382.9 373.8 L 400.7 374.9 L 417.8 371.0 L 414.9 367.3 L 417.0 360.6 L 436.7 358.8 L 438.5 353.3 L 441.7 351.1 L 446.9 353.7 L 446.8 355.6 L 449.9 355.0 L 450.0 356.9 L 454.6 354.9 L 457.1 350.9 L 463.0 350.1 L 469.8 337.5 L 479.1 335.8 L 487.3 340.0 L 497.2 335.7 L 502.5 339.2 L 505.9 346.5 L 514.4 345.1 Z" class="map-country-shape" />
            <text x="448" y="308" class="map-country-flag">🇸🇰</text>
            <text x="448" y="334" class="map-country-label">SK</text>
          </g>

          <!-- RAKOUSKO (AT) - reálná hranice (geoBoundaries, zjednodušeno Douglas-Peucker) -->
          <g class="map-country-group ${isCountryActive("at") ? "is-active" : ""}" data-meteoradar-country="at" data-device-address="${this._escape(address)}" role="button" tabindex="0" aria-label="Vybrat Rakousko">
            <path d="M 160.5 382.8 L 160.0 390.8 L 153.7 395.8 L 145.7 383.3 L 133.1 385.2 L 134.5 405.2 L 149.8 415.1 L 158.5 407.9 L 161.0 414.5 L 173.6 418.6 L 182.3 409.5 L 213.6 403.8 L 212.3 411.8 L 225.1 423.5 L 286.5 436.0 L 301.1 423.6 L 331.7 423.4 L 330.2 415.5 L 339.4 407.3 L 346.2 407.9 L 344.1 389.6 L 352.4 383.6 L 343.4 377.9 L 349.2 373.5 L 364.0 375.9 L 361.4 369.1 L 366.1 362.3 L 356.3 346.4 L 358.1 329.5 L 347.1 325.0 L 333.4 328.1 L 300.5 315.4 L 299.2 326.9 L 294.0 326.6 L 290.7 335.7 L 271.2 335.2 L 264.4 326.9 L 260.9 338.9 L 254.1 335.4 L 248.6 347.7 L 231.1 356.8 L 238.6 369.5 L 235.6 375.2 L 241.0 376.9 L 238.6 387.0 L 231.8 377.5 L 223.2 379.7 L 215.8 374.3 L 214.1 380.5 L 196.7 381.1 L 185.5 390.0 L 160.5 382.8 Z" class="map-country-shape" />
            <text x="257" y="362" class="map-country-flag">🇦🇹</text>
            <text x="257" y="388" class="map-country-label">AT</text>
          </g>
        </svg>
      </div>

      <div class="country-buttons-row">
        ${countries.map((c) => `<button type="button" class="country-pick-btn ${active === c.id ? "is-active" : ""}" data-meteoradar-country="${c.id}" data-device-address="${this._escape(address)}">
          <span class="country-flag">${c.flag}</span>
          <span class="country-name">${this._escape(c.name)}</span>
        </button>`).join("")}
      </div>
    </div>`;
  },

  _renderTemplateSetupGuide(template) {
    const recipe = this._templateSetupRecipe(template);

    const integrations = (recipe.integrations || []).map((item) => {
      const states = this._hass?.states || {};
      const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const friendlyNames = new Set((item.entityFriendlyNames || []).map(normalize));
      const foundByPrefix = Array.isArray(item.entityPrefixes) && item.entityPrefixes.length
        && Object.keys(states).some((entityId) => item.entityPrefixes.some((prefix) => entityId.startsWith(prefix)));
      const foundByName = friendlyNames.size > 0 && Object.values(states).some((state) => friendlyNames.has(normalize(state?.attributes?.friendly_name)));
      const found = (item.entityPrefixes || []).length || friendlyNames.size
        ? foundByPrefix || foundByName
        : this._hasEntityDomain(item.domain);
      const documentationUrl = item.url || (item.core && !item.helper ? `https://www.home-assistant.io/integrations/${item.domain}/` : "");
      const link = documentationUrl
        ? `<a href="${this._escape(documentationUrl)}" target="_blank" rel="noopener noreferrer" class="template-setup-doc-link"><ha-icon icon="mdi:open-in-new"></ha-icon>${this._escape(item.linkLabel || "Dokumentace")}</a>`
        : "";
      return `<li class="template-guide-integration-card ${found ? "is-found" : "is-missing"}">
        <div class="template-guide-integration-top">
          <strong>${this._escape(item.name)}</strong>
          <span class="template-setup-status-badge ${found ? "is-found" : "is-missing"}">
            <ha-icon icon="mdi:${found ? "check-circle" : "alert-circle-outline"}"></ha-icon>
            ${found ? "Nalezeno" : "Chybí"}
          </span>
        </div>
        <p class="template-guide-integration-why">${this._escape(item.why)}</p>
        <div class="template-guide-integration-footer">
          <span>${found ? `Připraveno (${this._escape(item.domain)}.*)` : `Doporučeno (${this._escape(item.domain)}.*)`}</span>
          ${link}
        </div>
      </li>`;
    }).join("");

    const steps = (recipe.steps || []).map((step, index) => `<li class="template-guide-step-card"><span class="template-step-num">${index + 1}</span><span class="template-step-text">${this._escape(step)}</span></li>`).join("");

    return `<div class="template-guide-summary-card">
        <ha-icon icon="mdi:lightbulb-outline"></ha-icon>
        <p>${this._escape(recipe.summary)}</p>
      </div>
      ${integrations ? `<div class="template-guide-section">
        <h4><ha-icon icon="mdi:puzzle-outline"></ha-icon> Co je potřeba v Home Assistantu</h4>
        <ul class="template-guide-integrations-list">${integrations}</ul>
      </div>` : ""}
      <div class="template-guide-section">
        <h4><ha-icon icon="mdi:format-list-numbered"></ha-icon> Postup zprovoznění</h4>
        <ul class="template-guide-steps-list">${steps}</ul>
      </div>
      ${recipe.note ? `<div class="template-setup-note-card">
        <ha-icon icon="mdi:information-outline"></ha-icon>
        <span>${this._escape(recipe.note)}</span>
      </div>` : ""}`;
  },

  _renderRefreshIntervalSelect(address, currentSeconds, extraClass = "") {
    const seconds = Math.max(30, Math.min(86400, Number(currentSeconds) || 60));
    const presets = [
      { value: 30, label: "30 s" },
      { value: 60, label: "1 min" },
      { value: 300, label: "5 min" },
      { value: 600, label: "10 min" },
      { value: 900, label: "15 min" },
      { value: 1800, label: "30 min" },
      { value: 3600, label: "1 hod" },
      { value: 7200, label: "2 hod" },
      { value: 21600, label: "6 hod" },
      { value: 43200, label: "12 hod" },
      { value: 86400, label: "24 hod" },
    ];
    return `<div class="display-interval-control ${extraClass}" title="Interval automatického nahrávání a obnovy displeje">
      <ha-icon icon="mdi:timer-refresh-outline"></ha-icon>
      <select class="display-refresh-interval-select" data-device-refresh-interval="${this._escape(address || '')}" aria-label="Interval automatické obnovy">
        ${presets.map((p) => `<option value="${p.value}" ${seconds === p.value ? "selected" : ""}>${p.label}</option>`).join("")}
      </select>
    </div>`;
  },

  // What actually has to happen before a display redraws: only a real change
  // to a napojená entita, only the interval ticking over, or either - kept
  // separate from the interval itself, because "how often" and "on what"
  // are two different questions (a display with nothing that needs periodic
  // insurance, e.g. no camera binding, may want to never redraw between real
  // changes; a fast-changing entity may want throttling to a fixed cadence
  // instead of redrawing on every update).
  _renderRefreshTriggerModeSelect(address, currentMode, extraClass = "") {
    const mode = ["both", "change_only", "interval_only"].includes(currentMode) ? currentMode : "both";
    const options = [
      { value: "both", label: "Při změně i pravidelně" },
      { value: "change_only", label: "Jen při změně entity" },
      { value: "interval_only", label: "Jen pravidelně (podle intervalu)" },
    ];
    // Reuses display-interval-control/display-refresh-interval-select's styling
    // (icon + borderless select in a pill) rather than defining a parallel set
    // of rules for what is visually the same kind of control.
    return `<div class="display-interval-control display-trigger-mode-control ${extraClass}" title="Co spouští automatickou obnovu displeje">
      <ha-icon icon="mdi:swap-horizontal"></ha-icon>
      <select class="display-refresh-interval-select display-refresh-trigger-mode-select" data-device-refresh-trigger-mode="${this._escape(address || '')}" aria-label="Co spouští automatickou obnovu">
        ${options.map((o) => `<option value="${o.value}" ${mode === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
    </div>`;
  },

  _toggleModalScrollLock(active) {
    try {
      const lock = !!active;
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("has-dratek-modal-open", lock);
        if (lock) {
          document.body.style.overflow = "hidden";
        } else {
          document.body.style.overflow = "";
        }
      }
      if (this && this.classList) {
        this.classList.toggle("has-dratek-modal-open", lock);
      }
    } catch (_err) {}
  },

  _renderTemplateSettingsDialog(activeTemplate, selectedSize, largeDisplay) {
    if (!this._templateSettingsDialogOpen) {
      this._toggleModalScrollLock(false);
      return "";
    }
    this._toggleModalScrollLock(true);
    const isRadarTemplate = activeTemplate?.id === "radar" || activeTemplate?.category === "radar" || String(activeTemplate?.id || "").includes("radar");
    const selectedCountry = this._meteoradarCountry || this._displayTemplateConfig?.meteoradar_country || "cz";
    const mapWidget = isRadarTemplate ? this._renderInteractiveCountryMap(selectedCountry, this._selectedDeviceAddress) : "";

    const crop = this._templateVariableCropContext(activeTemplate);
    const variableList = `<div class="template-variables-header">
      <div class="template-guide-interval-box">
        <div class="template-guide-interval-title">
          <ha-icon icon="mdi:timer-refresh-outline"></ha-icon>
          <span>Interval automatické obnovy displeje:</span>
        </div>
        ${this._renderRefreshIntervalSelect(this._selectedDeviceAddress, this._refreshIntervalSeconds, "in-dialog")}
        ${this._renderRefreshTriggerModeSelect(this._selectedDeviceAddress, this._refreshTriggerMode, "in-dialog")}
      </div>
      <h4><ha-icon icon="mdi:tune-vertical"></ha-icon> Napojení proměnných</h4>
      <p class="template-settings-intro">U každé položky vyberte entitu v Home Assistantu. Systémové údaje (čas, datum) se doplňují automaticky.</p>
    </div>
    ${mapWidget}
    <div class="template-variable-settings">${activeTemplate.variables.map((variable, index) => this._renderTemplateVariableSetting(activeTemplate, variable, index, crop)).join("")}</div>`;
    return `<div class="template-settings-backdrop" data-template-settings-close><section class="card template-settings-dialog is-guide-layout" role="dialog" aria-modal="true" aria-label="Nastavení šablony" data-template-settings-dialog>
      <header><span><small>Jak zprovoznit a nastavit šablonu</small><strong>${this._escape(activeTemplate.title)}</strong></span><button type="button" data-template-settings-close title="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button></header>
      <div class="template-settings-dialog-content template-settings-two-col">
        <aside class="template-settings-guide">${this._renderTemplateSetupGuide(activeTemplate)}</aside>
        <div class="template-settings-variables">${variableList}</div>
      </div>
    </section></div>`;
  },


  _renderStudioActions() {
    return `<div class="studio-pro-detached-actions" aria-label="Akce návrhu">
        <button type="button" class="studio-pro-btn secondary" data-template-settings-open>
          <ha-icon icon="mdi:tune-variant"></ha-icon> Nastavení šablony
        </button>
        <button type="button" class="display-template-save-button studio-pro-btn" data-template-save>
          <ha-icon icon="mdi:content-save-outline"></ha-icon> Uložit návrh
        </button>
        <button type="button" class="display-template-send-button studio-pro-btn primary" data-template-send ${this._templateSending ? "disabled" : ""}>
          <ha-icon icon="mdi:${this._templateSending ? "loading" : "send"}" ${this._templateSending ? 'class="spin"' : ""}></ha-icon>
          <span>${this._templateSending ? "Odesílám…" : "Odeslat do displeje"}</span>
        </button>
      </div>`;
  },

  _renderTemplateSelectionBar(activeTemplate, previewZoom, viewport) {
    const item = this._templateEditorElement();
    const partKey = String(this._selectedTemplatePart || "");
    const partAdjustment = partKey ? this._templateElementAdjustments?.[partKey] : null;
    const hasSelection = !!(item || partAdjustment);
    const disabled = hasSelection ? "" : "disabled";
    const partQuarterTurn = Math.abs(Math.round(Number(partAdjustment?.rotation || 0) / 90)) % 2 === 1;
    const partLandscape = Number(partAdjustment?.baseWidth || 0) >= Number(partAdjustment?.baseHeight || 0);
    const areaOrientation = item
      ? (Number(item.w || 0) >= Number(item.h || 0) ? "landscape" : "portrait")
      : ((partQuarterTurn ? !partLandscape : partLandscape) ? "landscape" : "portrait");
    const viewportOptions = [
      ["narrow", "phone-rotate-portrait", "Úzká"],
      ["wide", "phone-rotate-landscape", "Široká"],
      ["large", "monitor", "Velký displej"],
      ["large-portrait", "tablet", "Velký na výšku"],
    ];
    const activeViewport = viewportOptions.find(([value]) => value === viewport) || viewportOptions[1];
    return `<section class="template-selection-bar is-locked-controls ${hasSelection ? "has-selection" : "has-no-selection"}" aria-label="Pevné ovládání designeru">
      <div class="template-selection-fixed-tools">
        <div class="template-toolbar-cluster is-view">
        <div class="template-viewport-menu-wrap">
          <button type="button" class="template-viewport-menu-trigger ${this._templateViewportMenuOpen ? "is-active" : ""}" data-template-viewport-menu aria-expanded="${this._templateViewportMenuOpen}" title="Formát náhledu: ${activeViewport[2]}"><ha-icon icon="mdi:${activeViewport[1]}"></ha-icon></button>
          ${this._templateViewportMenuOpen ? `<div class="template-viewport-popup" role="dialog" aria-label="Formát náhledu šablony">
            <header><span><strong>Formát náhledu</strong><small>${this._escape(activeTemplate?.title || "Šablona")}</small></span><button type="button" data-template-viewport-menu-close title="Zavřít"><ha-icon icon="mdi:close"></ha-icon></button></header>
            <div>${viewportOptions.map(([value, icon, label]) => `<button type="button" class="${viewport === value ? "is-active" : ""}" data-template-designer-viewport="${value}" aria-pressed="${viewport === value}"><ha-icon icon="mdi:${icon}"></ha-icon><span>${label}</span></button>`).join("")}</div>
          </div>` : ""}
        </div>
        <span class="template-selection-divider"></span>
        <div class="template-preview-zoom" role="group" aria-label="Přiblížení náhledu">
          <button type="button" data-template-preview-zoom="out" title="Oddálit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
          <button type="button" class="template-preview-zoom-value" data-template-preview-zoom="reset" title="Obnovit přiblížení">${Math.round(previewZoom * 100)} %</button>
          <button type="button" data-template-preview-zoom="in" title="Přiblížit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
        </div>
        </div>
        <span class="template-selection-divider"></span>
        <div class="template-toolbar-cluster is-transform">
        <div class="template-selection-orientation" role="group" aria-label="Orientace vybrané oblasti">
          <button type="button" class="${hasSelection && areaOrientation === "portrait" ? "is-active" : ""}" data-template-element-area-orientation="portrait" title="Oblast na výšku" aria-label="Oblast na výšku" ${disabled}><ha-icon icon="mdi:rectangle-outline"></ha-icon></button>
          <button type="button" class="${hasSelection && areaOrientation === "landscape" ? "is-active" : ""}" data-template-element-area-orientation="landscape" title="Oblast na šířku" aria-label="Oblast na šířku" ${disabled}><ha-icon icon="mdi:rectangle-outline" class="is-landscape"></ha-icon></button>
        </div>
        </div>
        <span class="template-selection-divider"></span>
        <div class="template-selection-tool-group template-toolbar-cluster is-actions" role="toolbar" aria-label="Historie, transformace a vrstvy">
          <button type="button" data-template-history="undo" title="Zpět" ${this._templateUndoStack?.length ? "" : "disabled"}><ha-icon icon="mdi:undo"></ha-icon></button>
          <button type="button" data-template-history="redo" title="Vpřed" ${this._templateRedoStack?.length ? "" : "disabled"}><ha-icon icon="mdi:redo"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" data-template-element-rotate="-90" title="Otočit o 90° doleva" ${disabled}><ha-icon icon="mdi:rotate-left"></ha-icon></button>
          <button type="button" data-template-element-rotate="90" title="Otočit o 90° doprava" ${disabled}><ha-icon icon="mdi:rotate-right"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" data-template-element-order="back" title="Přenést do pozadí" ${disabled}><ha-icon icon="mdi:arrange-send-backward"></ha-icon></button>
          <button type="button" data-template-element-order="front" title="Přenést do popředí" ${disabled}><ha-icon icon="mdi:arrange-bring-forward"></ha-icon></button>
          <span class="template-selection-divider"></span>
          <button type="button" data-template-element-duplicate title="Duplikovat" ${disabled}><ha-icon icon="mdi:content-duplicate"></ha-icon></button>
          <button type="button" class="is-danger" data-template-element-delete title="Smazat" ${disabled}><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
        </div>
      </div>
    </section>`;
  },

  _renderPhotoshopOptionsBar(activeTemplate, device, orientation, previewZoom) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    const partNumber = key ? Number(key.split(":").at(-1)) + 1 : 0;
    const selectedColor = adjustment?.color || "black";
    const size = this._devicePreviewSize(device);

    return `<div class="photoshop-options-bar">
      ${key && adjustment ? `
        <div class="photoshop-options-group">
          <span class="photoshop-options-badge"><ha-icon icon="mdi:vector-selection"></ha-icon> Prvek ${partNumber}</span>
          <div class="photoshop-options-divider"></div>
          <div class="photoshop-options-colors">
            <span class="photoshop-options-label">Barva:</span>
            <button type="button" class="color-swatch is-black ${selectedColor === "black" ? "is-selected" : ""}" data-template-part-color="black" title="Černá barva"></button>
            <button type="button" class="color-swatch is-red ${selectedColor === "red" ? "is-selected" : ""}" data-template-part-color="red" title="Červená barva"></button>
            <button type="button" class="color-swatch is-white ${selectedColor === "white" ? "is-selected" : ""}" data-template-part-color="white" title="Bílá barva"></button>
          </div>
          <div class="photoshop-options-divider"></div>
          <button type="button" class="photoshop-btn" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon> Resetovat polohu</button>
        </div>
      ` : `
        <div class="photoshop-options-group">
          <span class="photoshop-options-badge"><ha-icon icon="mdi:palette-swatch-outline"></ha-icon> <small>Designer</small> eInk Studio</span>
          <div class="photoshop-options-divider"></div>
          <span class="photoshop-options-info">${this._escape(device?.name || "Displej")} · <strong>${size.width} × ${size.height} px</strong></span>
          <div class="photoshop-options-divider"></div>
          <div class="template-preview-controls">
            <div class="template-preview-zoom" role="group" aria-label="Přiblížení náhledu">
              <button type="button" data-template-preview-zoom="out" title="Oddálit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
              <button type="button" class="template-preview-zoom-value" data-template-preview-zoom="reset">${Math.round(previewZoom * 100)} %</button>
              <button type="button" data-template-preview-zoom="in" title="Přiblížit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
            </div>
            <div class="photoshop-options-divider"></div>
            <div class="display-template-orientation" role="group" aria-label="Orientace displeje">
              <button type="button" class="${orientation === "portrait" ? "is-active" : ""}" data-template-orientation="portrait" title="Na výšku"><ha-icon icon="mdi:phone-rotate-portrait"></ha-icon></button>
              <button type="button" class="${orientation === "landscape" ? "is-active" : ""}" data-template-orientation="landscape" title="Na šířku"><ha-icon icon="mdi:phone-rotate-landscape"></ha-icon></button>
            </div>
          </div>
        </div>
      `}
    </div>`;
  },

  _renderPhotoshopLayersPanel(activeTemplate) {
    const key = String(this._selectedTemplatePart || "");
    const adjustments = this._templateElementAdjustments || {};
    const items = Object.keys(adjustments).map((itemKey, idx) => {
      const isSelected = itemKey === key;
      const partNum = idx + 1;
      const hidden = adjustments[itemKey]?.hidden || false;
      const locked = adjustments[itemKey]?.locked || false;
      return `<div class="photoshop-layer-item ${isSelected ? "is-selected" : ""} ${hidden ? "is-hidden" : ""}" data-layer-key="${this._escape(itemKey)}">
        <button type="button" class="photoshop-layer-btn" data-layer-select="${this._escape(itemKey)}">
          <ha-icon icon="mdi:${hidden ? "eye-off-outline" : "eye-outline"}"></ha-icon>
          <span>Prvek šablony #${partNum}</span>
        </button>
        <div class="photoshop-layer-actions">
          <button type="button" data-layer-toggle-hide="${this._escape(itemKey)}" title="${hidden ? "Zobrazit" : "Skrýt"}"><ha-icon icon="mdi:${hidden ? "eye-off-outline" : "eye-outline"}"></ha-icon></button>
          <button type="button" data-layer-toggle-lock="${this._escape(itemKey)}" title="${locked ? "Odemknout" : "Zamknout"}"><ha-icon icon="mdi:${locked ? "lock-outline" : "lock-open-outline"}"></ha-icon></button>
        </div>
      </div>`;
    });

    return `<div class="photoshop-layers-panel">
      <div class="photoshop-layers-header">
        <ha-icon icon="mdi:layers-outline"></ha-icon>
        <span>Vrstvy prvků (${items.length})</span>
      </div>
      <div class="photoshop-layers-list">
        ${items.length ? items.join("") : '<div class="photoshop-layers-empty">Klikněte na prvek na plátně pro jeho úpravu.</div>'}
      </div>
    </div>`;
  },

  _renderPhotoshopContextBar(activeTemplate) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    if (!key || !adjustment) return "";
    const partNumber = Number(key.split(":").at(-1)) + 1;
    const selectedColor = adjustment.color || "black";

    return `<div class="photoshop-context-bar-inner">
      <span class="photoshop-context-label"><ha-icon icon="mdi:cursor-move"></ha-icon> <strong>Prvek ${partNumber}</strong></span>
      <div class="photoshop-options-colors">
        <button type="button" class="color-swatch is-black ${selectedColor === "black" ? "is-selected" : ""}" data-template-part-color="black" title="Černá"></button>
        <button type="button" class="color-swatch is-red ${selectedColor === "red" ? "is-selected" : ""}" data-template-part-color="red" title="Červená"></button>
        <button type="button" class="color-swatch is-white ${selectedColor === "white" ? "is-selected" : ""}" data-template-part-color="white" title="Bílá"></button>
      </div>
      <button type="button" class="photoshop-btn" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon> Obnovit polohu</button>
    </div>`;
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

  // The image the panel receives comes from the same builder that draws the
  // preview, at the display's exact resolution.
  //
  // It used to be a screenshot of the live DOM: the visible preview was cloned
  // into a foreignObject and rasterised. That clone lost the scale transform and
  // the positioning context of the parent it was cut away from, so the drawing
  // landed off-centre inside the exported bitmap - 7 px of blank down the left of
  // a portrait tag and 51 px, a sixth of the panel, on a landscape one, while the
  // preview on screen looked correct. Building the SVG directly has no DOM to
  // lose: what the renderer lays out is what the panel gets, to the pixel.
  async _renderCurrentDisplayTemplateImage(device = this._device()) {
    const request = this._currentDisplayTemplateSvgRequest(device);
    if (!request) throw new Error("Není vybrána žádná šablona.");
    const overlays = this._collectTemplateOverlayBoxes();
    return this._rasterizeDisplayTemplateSvg(
      request.templates,
      request.width,
      request.height,
      request.layout,
      overlays.length ? (context, width, height) => this._paintTemplateOverlays(context, overlays, width, height) : null,
    );
  },

  // Elements added in the element editor live only in the preview's HTML, so they
  // are measured where they sit on screen and re-drawn onto the bitmap in device
  // pixels. Without this they would simply stop reaching the panel the moment the
  // send path stopped screenshotting the DOM.
  _collectTemplateOverlayBoxes() {
    if (!(this._templateEditorElements || []).length) return [];
    const surface = this.shadowRoot.querySelector(".display-template-editor-stage .display-template-surface")
      || this.shadowRoot.querySelector(".display-template-dropzone .display-template-surface");
    const frame = surface?.getBoundingClientRect();
    if (!frame?.width || !frame?.height) return [];
    return [...surface.querySelectorAll(".template-overlay")].map((element) => {
      const image = element.querySelector("img");
      const source = (this._templateEditorElements || []).find((item) => item.id === element.dataset.templateOverlayId) || {};
      const model = this._quarterTurnedUserTemplateElement(source);
      return {
        kind: model.type || "rect",
        x: Number(model.x || 0) / 100,
        y: Number(model.y || 0) / 100,
        w: Number(model.w || 2) / 100,
        h: Number(model.h || 2) / 100,
        text: model.text || element.textContent.trim(),
        src: image?.getAttribute("src") || "",
        icon: model.icon || "star", color: model.color || "#111111", fill: model.fill || "transparent",
        variant: model.variant || "default",
        stroke: model.stroke || "#111111", strokeWidth: Number(model.strokeWidth ?? 2), radius: Number(model.radius || 0),
        fontSize: Number(model.fontSize || 16), fontWeight: String(model.fontWeight || "700"), fontFamily: String(model.fontFamily || "DRATEK eInk Sans"), fontStyle: model.fontStyle === "italic" ? "italic" : "normal", textDecoration: model.textDecoration || "none", textAlign: model.textAlign || "center",
        textOutlineWidth: Number(model.textOutlineWidth || 0), textOutlineColor: model.textOutlineColor || "#ffffff", textBorderWidth: Number(model.textBorderWidth || 0), textBorderColor: model.textBorderColor || "#111111", overlayOpacity: Number(model.overlayOpacity ?? 100),
        value: Math.max(0, Math.min(100, Number(model.value ?? 50))), rotation: Number(model.rotation || 0),
        showValue: model.showValue !== false, showPercent: model.showPercent !== false, showLabel: model.showLabel !== false,
        showGrid: model.showGrid !== false, showPoints: model.showPoints !== false, showFill: model.showFill !== false,
        showTrack: model.showTrack !== false, showScale: model.showScale !== false, showIcon: model.showIcon !== false, showState: model.showState !== false,
        historyLimit: Number(model.historyLimit || 10), historyValues: structuredClone(model.historyValues || []),
        resolvedActive: typeof model.resolvedActive === "boolean" ? model.resolvedActive : undefined,
      };
    });
  },

  _paintTemplateOverlays(context, overlays, width, height) {
    const paintRichText = (item, x, y, w, h, padding = 0) => {
      const size = Math.max(7, item.fontSize * Math.min(width, height) / 300);
      const family = String(item.fontFamily || "DRATEK eInk Sans").replace(/["']/g, "");
      const textX = item.textAlign === "left" ? x + padding : item.textAlign === "right" ? x + w - padding : x + w / 2;
      const textY = y + h / 2;
      if (item.fill !== "transparent") {
        context.save(); context.globalAlpha = Math.max(0, Math.min(1, Number(item.overlayOpacity ?? 100) / 100)); context.fillStyle = item.fill; context.fillRect(x, y, w, h); context.restore();
      }
      if (Number(item.textBorderWidth || 0) > 0) {
        context.strokeStyle = item.textBorderColor || "#111111"; context.lineWidth = Math.max(1, Number(item.textBorderWidth) * Math.min(width, height) / 300); context.strokeRect(x, y, w, h);
      }
      context.font = `${item.fontStyle === "italic" ? "italic " : ""}${item.fontWeight} ${size}px "${family}", Arial, Helvetica, sans-serif`;
      context.textBaseline = "middle"; context.textAlign = item.textAlign || "center";
      if (Number(item.textOutlineWidth || 0) > 0) {
        context.strokeStyle = item.textOutlineColor || "#ffffff"; context.lineWidth = Math.max(1, Number(item.textOutlineWidth) * Math.min(width, height) / 300); context.strokeText(item.text, textX, textY, Math.max(1, w - padding * 2));
      }
      context.fillStyle = item.color || "#111111"; context.fillText(item.text, textX, textY, Math.max(1, w - padding * 2));
      if (["underline", "line-through"].includes(item.textDecoration)) {
        const measured = Math.min(w - padding * 2, context.measureText(item.text).width);
        const startX = item.textAlign === "left" ? textX : item.textAlign === "right" ? textX - measured : textX - measured / 2;
        const lineY = item.textDecoration === "underline" ? textY + size * .42 : textY;
        context.strokeStyle = item.color || "#111111"; context.lineWidth = Math.max(1, size * .07); context.beginPath(); context.moveTo(startX, lineY); context.lineTo(startX + measured, lineY); context.stroke();
      }
    };
    context.save();
    for (const item of overlays) {
      const x = item.x * width;
      const y = item.y * height;
      const w = Math.max(1, item.w * width);
      const h = Math.max(1, item.h * height);
      context.save();
      context.translate(x + w / 2, y + h / 2);
      context.rotate((item.rotation || 0) * Math.PI / 180);
      context.translate(-(x + w / 2), -(y + h / 2));
      context.fillStyle = item.color || "#111111";
      context.strokeStyle = item.stroke || "#111111";
      context.lineWidth = Math.max(1, item.strokeWidth * Math.min(width, height) / 300);
      if (item.kind === "image" && item.src.startsWith("data:image/")) {
        const bitmap = new Image();
        bitmap.src = item.src;
        // Already decoded: the element is on screen, so the browser has it.
        if (bitmap.complete) {
          const smoothing = context.imageSmoothingEnabled;
          // The source is already exactly black/white/red. Interpolation would
          // invent warm edge colours and the final quantizer could turn those
          // into false red pixels, so scale it like actual eInk pixels.
          context.imageSmoothingEnabled = false;
          context.drawImage(bitmap, x, y, w, h);
          context.imageSmoothingEnabled = smoothing;
        }
      } else if (item.kind === "text") {
        paintRichText(item, x, y, w, h);
      } else if (item.kind === "line") {
        context.beginPath();
        context.moveTo(x, y + h / 2);
        context.lineTo(x + w, y + h / 2);
        context.stroke();
      } else if (item.kind === "circle") {
        if (item.fill !== "transparent") { context.fillStyle = item.fill; context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); context.fill(); }
        context.beginPath();
        context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        context.stroke();
      } else if (item.kind === "button") {
        paintRichText(item, x, y, w, h, 3);
        context.strokeStyle = item.stroke || "#111111";
        context.lineWidth = Math.max(1, item.strokeWidth * Math.min(width, height) / 300);
        context.strokeRect(x, y, w, h);
      } else if (item.kind === "slider") {
        const trackH = Math.max(3, h * .18); const trackY = y + h * .5;
        if (item.showTrack) { context.strokeStyle = "#111111"; context.lineWidth = Math.max(1, trackH * .28); context.strokeRect(x, trackY, w, trackH); }
        context.fillStyle = "#d71912"; context.fillRect(x, trackY, w * item.value / 100, trackH);
        if (item.showValue) { context.fillStyle = "#111111"; context.font = `900 ${Math.max(7, h * .3)}px Arial`; context.textAlign = "right"; context.textBaseline = "top"; context.fillText(`${Math.round(item.value)}${item.showPercent ? "%" : ""}`, x + w, y, w * .4); }
        if (item.showScale) { context.font = `700 ${Math.max(4, h * .16)}px Arial`; context.textBaseline = "bottom"; context.textAlign = "left"; context.fillText("0", x, y + h); context.textAlign = "center"; context.fillText("50", x + w / 2, y + h); context.textAlign = "right"; context.fillText("100", x + w, y + h); }
      } else if (item.kind === "chart") {
        const labels = { line: "VÝVOJ", area: "PLOCHA", bar: "PŘEHLED", steps: "ZMĚNY", donut: "PODÍL", sparkline: "TREND" };
        const gx = x + 2, gy = y + 2, gw = Math.max(1, w - 4), gh = Math.max(1, h - 4);
        const points = this._templateChartNormalizedPoints(item).map((point) => [point.x / 100, point.y / 60]);
        context.strokeStyle = "#111111"; context.lineWidth = Math.max(1, Math.min(width, height) / 140);
        if (item.showGrid && item.variant !== "donut" && item.variant !== "sparkline") { context.save(); context.strokeStyle = "#111111"; context.lineWidth = 1; context.setLineDash([2, 3]); [.2,.5,.8].forEach((line) => { context.beginPath(); context.moveTo(gx, gy + gh * line); context.lineTo(gx + gw, gy + gh * line); context.stroke(); }); context.restore(); }
        if (item.variant === "bar") {
          const slot = .92 / Math.max(1, points.length);
          const barWidth = Math.min(.14, slot * .62);
          points.forEach(([px, py], index) => {
            context.fillStyle = index % 3 === 0 ? "#d71912" : "#111111";
            context.fillRect(gx + gw * Math.max(.02, px - barWidth / 2), gy + gh * py, gw * barWidth, gh * (1 - py));
          });
        } else if (item.variant === "donut") {
          const radius = Math.min(gw, gh) * .34;
          context.lineWidth = Math.max(3, radius * .28); if (item.showTrack) { context.strokeStyle = "#111111"; context.beginPath(); context.arc(gx + gw / 2, gy + gh / 2, radius, 0, Math.PI * 2); context.stroke(); }
          context.strokeStyle = "#d71912"; context.lineCap = "butt"; context.beginPath(); context.arc(gx + gw / 2, gy + gh / 2, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * item.value / 100); context.stroke();
        } else if (item.variant === "steps") {
          const steps = points.flatMap((point, index) => index ? [[point[0], points[index - 1][1]], point] : [point]);
          context.beginPath(); steps.forEach(([px, py], index) => index ? context.lineTo(gx + gw * px, gy + gh * py) : context.moveTo(gx + gw * px, gy + gh * py)); context.stroke();
        } else {
          if (item.variant === "area" && item.showFill) {
            context.fillStyle = "#d71912"; context.beginPath(); points.forEach(([px, py], index) => index ? context.lineTo(gx + gw * px, gy + gh * py) : context.moveTo(gx + gw * px, gy + gh * py)); context.lineTo(gx + gw * points.at(-1)[0], gy + gh); context.lineTo(gx + gw * points[0][0], gy + gh); context.closePath(); context.fill();
          }
          context.beginPath(); points.forEach(([px, py], index) => index ? context.lineTo(gx + gw * px, gy + gh * py) : context.moveTo(gx + gw * px, gy + gh * py)); context.stroke();
          if (item.variant !== "sparkline" && item.showPoints) points.filter((_, index) => points.length <= 10 || index % 2 === 0).forEach(([px, py]) => { context.fillStyle = "#fff"; context.strokeStyle = "#d71912"; context.beginPath(); context.arc(gx + gw * px, gy + gh * py, Math.max(1.5, context.lineWidth * 1.25), 0, Math.PI * 2); context.fill(); context.stroke(); });
        }
        if (item.showValue) { context.fillStyle = "#111111"; context.font = `900 ${Math.max(7, Math.min(w, h) * .22)}px Arial`; context.textAlign = item.variant === "donut" ? "center" : "right"; context.textBaseline = "middle"; context.fillText(`${Math.round(item.value)}${item.showPercent ? "%" : ""}`, item.variant === "donut" ? x + w / 2 : x + w, item.variant === "donut" ? y + h / 2 : y + h * .14, w * .42); }
        if (item.showLabel) { context.font = `900 ${Math.max(4, h * .12)}px Arial`; context.textAlign = "left"; context.textBaseline = "bottom"; context.fillText(labels[item.variant] || "DATA", x, y + h, w * .45); }
      } else if (item.kind === "gauge") {
        const labels = { battery: "BATERIE", thermometer: "TEPLOTA", semicircle: "ROZSAH", ring: "HODNOTA" };
        const vx = x, vy = y, vw = w, vh = h;
        if (item.variant === "battery") {
          context.strokeStyle = "#111111"; context.lineWidth = Math.max(1, vh * .07); context.strokeRect(vx + vw * .05, vy + vh * .2, vw * .78, vh * .6); context.fillStyle = "#111111"; context.fillRect(vx + vw * .84, vy + vh * .38, vw * .08, vh * .24); context.fillStyle = "#d71912"; context.fillRect(vx + vw * .09, vy + vh * .27, vw * .68 * item.value / 100, vh * .46);
        } else if (item.variant === "thermometer") {
          context.strokeStyle = "#111111"; context.lineWidth = Math.max(2, vw * .08); context.beginPath(); context.moveTo(vx + vw / 2, vy + vh * .76); context.lineTo(vx + vw / 2, vy + vh * .14); context.stroke(); context.strokeStyle = "#d71912"; context.beginPath(); context.moveTo(vx + vw / 2, vy + vh * .82); context.lineTo(vx + vw / 2, vy + vh * (.76 - .56 * item.value / 100)); context.stroke();
        } else {
          const semicircle = item.variant === "semicircle";
          const start = semicircle ? Math.PI : -Math.PI / 2;
          const extent = semicircle ? Math.PI : Math.PI * 2;
          const radius = Math.min(vw, vh) * .34; context.lineWidth = Math.max(2, radius * .24); if (item.showTrack) { context.strokeStyle = "#111111"; context.beginPath(); context.arc(vx + vw / 2, vy + vh / 2, radius, start, start + extent); context.stroke(); }
          context.strokeStyle = "#d71912"; context.beginPath(); context.arc(vx + vw / 2, vy + vh / 2, radius, start, start + extent * item.value / 100); context.stroke();
        }
        if (item.showValue) { context.fillStyle = "#111111"; context.font = `900 ${Math.max(7, Math.min(w, h) * .2)}px Arial`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(`${Math.round(item.value)}${item.showPercent ? (item.variant === "thermometer" ? "°" : "%") : ""}`, x + w / 2, y + h / 2, w * .7); }
        if (item.showLabel) { context.font = `900 ${Math.max(4, h * .1)}px Arial`; context.textAlign = "center"; context.textBaseline = "bottom"; context.fillText(labels[item.variant] || "HODNOTA", x + w / 2, y + h, w); }
      } else if (item.kind === "signal") {
        const active = typeof item.resolvedActive === "boolean" ? item.resolvedActive : !["off", "inactive"].includes(item.variant);
        const inactive = !active;
        context.fillStyle = "#ffffff"; context.fillRect(x, y, w, h); context.strokeStyle = "#111111"; context.lineWidth = Math.max(1, h * .07); context.strokeRect(x, y, w, h); context.fillStyle = inactive ? "#111111" : "#d71912"; context.fillRect(x, y, Math.max(3, w * .06), h);
        let cursorX = x + Math.max(5, w * .1);
        if (item.showIcon) { const iconSize = Math.max(4, h * .38); context.fillRect(cursorX, y + (h - iconSize) / 2, iconSize, iconSize); cursorX += iconSize + 4; }
        if (item.showLabel) { context.fillStyle = "#111111"; context.font = `900 ${Math.max(6, h * .32)}px Arial`; context.textAlign = "left"; context.textBaseline = "middle"; context.fillText(item.text || "Stav", cursorX, y + h / 2, w - (cursorX - x) - (item.showState ? w * .22 : 3)); }
        if (item.showState && ["on", "off"].includes(item.variant)) { const tw = Math.max(14, w * .2); const th = Math.max(7, h * .45); const tx = x + w - tw - 3; const ty = y + (h - th) / 2; context.strokeStyle = "#111111"; context.strokeRect(tx, ty, tw, th); context.fillStyle = active ? "#d71912" : "#111111"; context.fillRect(active ? tx + tw * .58 : tx + 2, ty + 2, tw * .28, Math.max(2, th - 4)); }
      } else if (item.kind === "icon") {
        // MDI web components cannot be drawn directly onto a bitmap; use a clear,
        // palette-safe symbol fallback while preserving the selected icon in preview.
        context.fillStyle = item.color; context.font = `700 ${Math.max(10, Math.min(w, h) * .72)}px Arial`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText("◆", x + w / 2, y + h / 2);
      } else {
        if (item.fill !== "transparent") { context.fillStyle = item.fill; context.fillRect(x, y, w, h); }
        context.strokeRect(x, y, w, h);
      }
      context.restore();
    }
    context.restore();
  },

  _templateAutomationNodeOffset(node) {
    let x = 0;
    let y = 0;
    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      const transform = String(parent.getAttribute?.("transform") || "");
      const match = transform.match(/translate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?\s*\)/);
      if (match) {
        x += Number(match[1] || 0);
        y += Number(match[2] || 0);
      }
    }
    return { x, y };
  },

  _templateAutomationPalette(value, fallback = "black") {
    const normalized = String(value || "").trim().toLowerCase();
    if (["#fff", "#ffffff", "white", "rgb(255,255,255)"].includes(normalized.replace(/\s/g, ""))) return "white";
    if (["#e31b1b", "#d71912", "#dc140c", "red", "rgb(220,20,12)"].includes(normalized.replace(/\s/g, ""))) return "red";
    if (["#000", "#000000", "black", "#111", "#111111"].includes(normalized.replace(/\s/g, ""))) return "black";
    return fallback;
  },

  // Builds the automation binding for one series()/ratio()/day()/event()-driven
  // row, keyed by the row's own `group` name. `group` alone is enough for a
  // forecast strip ("forecast") or a calendar entry ("event-0"/"event-1") -
  // both resolve their entity the same way the live helpers already do
  // (_templateEntityForKind), and the index rides on the group suffix. A
  // ratio()/series() row also needs template.automation (declared next to
  // design() in the template file) to know which variable index feeds it,
  // since by the time a row exists ratio()/series() have already collapsed
  // to a plain number and there is no trace of where it came from.
  _templateAutomationGraphicBinding(template, group, row, geometry) {
    if (group === "forecast") {
      const entityId = this._templateEntityForKind(template, ["forecast", "weather"]);
      if (!entityId) return null;
      return { type: "forecast", entity_id: entityId, days: 4, fallback: "", ...geometry };
    }
    const eventMatch = group.match(/^event-(\d+)$/);
    if (eventMatch) {
      const entityId = this._templateEntityForKind(template, ["calendar"]);
      if (!entityId) return null;
      return {
        type: "calendar", entity_id: entityId, index: Number(eventMatch[1]), fallback: "",
        // _blockDatebox reads row.datebox.color for the header band and the
        // first detail line - never captured before, so an automatic refresh
        // always painted a manual send's red date box (calendar.js's event-0)
        // black instead.
        color: row.datebox?.color === "red" ? "red" : "black",
        ...geometry,
      };
    }
    if (group === "ratio") {
      const declared = template?.automation?.ratio;
      if (!Array.isArray(declared) || !declared.length) return null;
      let visual = "bars";
      let sources = [];
      if (row.dial) { visual = "dial"; sources = [row.dial]; }
      else if (row.ring) { visual = "ring"; sources = [row.ring]; }
      else if (row.meters) { visual = "bars"; sources = row.meters; }
      const meters = declared
        .map((entry, index) => {
          const variableIndex = Number(entry.variableIndex);
          const variable = template?.variables?.[variableIndex];
          if (!variable) return null;
          const meta = this._templateVariableMeta(variable, variableIndex);
          const entityId = String(this._templateBinding(template, meta) || "").trim();
          if (!entityId.includes(".") || entityId.startsWith("internal:")) return null;
          const source = sources[index] || {};
          return {
            entity_id: entityId,
            divisor: Number(entry.divisor) || 1,
            label: source.label != null ? String(source.label) : "",
            color: source.color === "red" ? "red" : "black",
          };
        })
        .filter(Boolean);
      if (!meters.length) return null;
      const single = sources[0] || {};
      return {
        type: "ratio", visual, meters,
        caption: single.caption != null ? String(single.caption) : "",
        min: single.min != null ? String(single.min) : "0",
        max: single.max != null ? String(single.max) : "100",
        fallback: "", ...geometry,
      };
    }
    if (group === "chart") {
      const declared = template?.automation?.series?.[0];
      if (!declared) return null;
      const index = Number(declared.variableIndex);
      const variable = template?.variables?.[index];
      if (!variable) return null;
      const meta = this._templateVariableMeta(variable, index);
      const entityId = String(this._templateBinding(template, meta) || "").trim();
      if (!entityId.includes(".") || entityId.startsWith("internal:")) return null;
      const chartType = row.bars ? "bar" : "line";
      const caption = row.spark?.caption != null ? String(row.spark.caption) : "";
      // _blockBars reads row.bars.labels/highlight to draw the tick labels and
      // pick out the current-interval bar in red (cz_spot_prices.js, energy.js)
      // - neither was ever captured, so an automatic refresh drew every bar in
      // the same row's chart-widget style with no labels and no highlight.
      const labels = Array.isArray(row.bars?.labels) ? row.bars.labels.map((label) => String(label ?? "")) : [];
      const highlightIndex = Number.isInteger(row.bars?.highlight) ? row.bars.highlight : -1;
      return {
        type: "series", entity_id: entityId, chartType, caption, labels, highlight: highlightIndex,
        maxPoints: 96, fallback: "[]", ...geometry,
      };
    }
    return null;
  },

  _templateAutomationTextBinding(documentNode, textNode, entityId, meta, occurrence, width, height, valuePrefix = "", valueSuffix = "") {
    const offset = this._templateAutomationNodeOffset(textNode);
    const centerX = offset.x + Number(textNode.getAttribute("x") || 0);
    const centerY = offset.y + Number(textNode.getAttribute("y") || 0);
    const fontSize = Math.max(6, Number(textNode.getAttribute("font-size") || 12));
    const anchor = String(textNode.getAttribute("text-anchor") || "middle");
    const bold = Number(textNode.getAttribute("font-weight") || 400) >= 600;
    const currentText = String(textNode.textContent || "");
    // Distance to whichever panel edge this run's anchor faces. Correct for
    // "middle" (bounded on both sides), but for "end"/"start" it measures
    // all the way back to the panel origin - a right-aligned value sitting
    // well clear of the left edge (a list row's number, after its label)
    // gets a "space available" reading of hundreds of pixels that has
    // nothing to do with how much room it actually has before the label.
    const geometricMaxWidth = anchor === "middle"
      ? Math.max(1, Math.min(width, 2 * Math.min(centerX, width - centerX)))
      : Math.max(1, anchor === "end" ? centerX : width - centerX);
    // The backend's PIL tier treats this box as an autoFit *target* - it
    // grows the font to fill whatever width it's given, not just shrinks to
    // avoid overflow. Driving the box off this run's own current width (with
    // a small fixed margin, not a multiple of it - a multiple scales with
    // font size, so a big headline number with only two or three digits got
    // handed a huge absolute margin and autoFit grew it well past its
    // captured size) keeps that autoFit a no-op instead of inflating a
    // short value to fill unused row width.
    // autoFit's shrink-to-fit already keeps a longer future value from
    // overflowing (it searches for the largest font that still fits), so
    // this margin only has to absorb the gap between _svgTextWidth's glyph
    // table and the bundled font's real metrics - not leave room to grow.
    // Two adjacent short lines in the same row (a band's label above its
    // value, a footer's label above its number) sit close enough that even
    // a modest few-pixel-per-character margin was enough for the value's
    // box to grow into the label above it.
    const currentTextWidth = this._svgTextWidth(currentText, fontSize, bold);
    const maxWidth = Math.min(geometricMaxWidth, currentTextWidth + Math.max(6, fontSize * 0.3));
    const boxWidth = Math.max(8, Math.min(maxWidth, fontSize * 13));
    const boxHeight = Math.max(8, Math.min(height, Math.ceil(fontSize * 1.65)));
    const x = Math.max(0, Math.min(width - boxWidth,
      anchor === "middle" ? centerX - boxWidth / 2 : anchor === "end" ? centerX - boxWidth : centerX));
    const y = Math.max(0, Math.min(height - boxHeight, centerY - boxHeight / 2));
    const color = this._templateAutomationPalette(textNode.getAttribute("fill"), "black");
    // The exact hex the panel drew this run through, kept verbatim so the backend
    // SVG rasteriser reproduces the manual send pixel for pixel rather than
    // re-deriving it from a colour name.
    const colorHex = String(textNode.getAttribute("fill") || "#000000");

    let backgroundColor = "white";
    // The base image the backend composites over still carries the previous
    // value's pixels, so each slot has to repaint its own background exactly the
    // way _render_bound_text does. Default to white, then adopt the covering
    // rect's real fill when the slot sits on a coloured band.
    let backgroundHex = "#ffffff";
    const allNodes = [...documentNode.querySelectorAll("rect, text")];
    const textIndex = allNodes.indexOf(textNode);
    for (let index = textIndex - 1; index >= 0; index -= 1) {
      const rect = allNodes[index];
      if (rect.tagName?.toLowerCase() !== "rect") continue;
      const rectOffset = this._templateAutomationNodeOffset(rect);
      const rx = rectOffset.x + Number(rect.getAttribute("x") || 0);
      const ry = rectOffset.y + Number(rect.getAttribute("y") || 0);
      const rw = Number(rect.getAttribute("width") || 0);
      const rh = Number(rect.getAttribute("height") || 0);
      if (centerX >= rx && centerX <= rx + rw && centerY >= ry && centerY <= ry + rh) {
        backgroundColor = this._templateAutomationPalette(rect.getAttribute("fill"), "white");
        backgroundHex = String(rect.getAttribute("fill") || "#ffffff");
        break;
      }
    }

    const state = this._hass?.states?.[entityId];
    const kind = this._templateSlotKind(meta.label, meta.icon);
    const weatherTemperature = String(entityId).startsWith("weather.") && kind === "temperature";
    // A max width that never shrinks the value the panel just showed: the box
    // bound, but at least this run's own text width, so re-rendering the current
    // value through svg_text.py is a no-op fit and stays byte-identical, while a
    // future longer value is still clamped instead of overflowing.
    const svgMaxWidth = Math.max(maxWidth, currentTextWidth + 1);
    const bindingId = `template-${String(meta.templateId || "slot")}-${meta.key}-${occurrence}`;
    // Stamped onto the live node so the caller's captured svg_template can be
    // searched for this exact element later - the backend replaces it by this
    // id when an automatic refresh substitutes a fresh value.
    textNode.setAttribute("id", bindingId);
    return {
      id: bindingId,
      type: "text",
      entity_id: entityId,
      entity_attribute: weatherTemperature ? "temperature" : "",
      // Home-Assistant-internal states ("sunny", "not_home", "on") read as
      // Czech words on a manual send (_templateStateWords, driven by this
      // same kind) - without it riding along, an automatic refresh had no
      // way to tell a word-translated slot from a plain numeric one and
      // fell back to the raw state.
      kind,
      x: Math.round(x), y: Math.round(y), w: Math.round(boxWidth), h: Math.round(boxHeight),
      fallback: currentText,
      include_unit: !weatherTemperature,
      value_prefix: valuePrefix,
      value_suffix: (weatherTemperature ? ` ${state?.attributes?.temperature_unit || "°C"}` : "") + valueSuffix,
      backgroundColor,
      color,
      fontSize: Math.round(fontSize),
      minFontSize: 6,
      bold,
      autoFit: true,
      textAlign: anchor === "end" ? "right" : anchor === "start" ? "left" : "center",
      verticalAlign: "middle",
      // Everything the backend needs to rebuild this exact <text> (and cover the
      // stale pixels underneath it) when the SVG rasteriser is available. Falls
      // back to the box fields above when it is not.
      svg: {
        cx: centerX, cy: centerY,
        size: fontSize,
        maxWidth: svgMaxWidth,
        anchor,
        bold,
        color: colorHex,
        bg: backgroundHex,
        x: Math.round(x), y: Math.round(y), w: Math.round(boxWidth), h: Math.round(boxHeight),
      },
    };
  },

  // Pair up the <text> runs of the marker-injected document with the ones the
  // template actually renders right now.
  //
  // These used to be walked by position, which silently assumed both documents
  // hold the same runs in the same order. They do not: a value that is empty at
  // this moment (an unavailable entity, a sensor that has not reported yet)
  // produces no <text> element at all - _svgText returns "" rather than an empty
  // element - so injecting a marker *adds* a run, and every run after it shifted
  // by one. Each of those shifted runs then compared unequal and was credited to
  // the variable being probed, complete with the geometry of whichever run now
  // sat at its index. On the weather template one unavailable value was enough to
  // hand eleven runs to one entity, eight of them cells of the forecast strip - so
  // every automatic refresh painted that entity's value on top of the days and
  // temperatures the strip itself draws.
  //
  // A longest common subsequence over the run texts pairs the untouched runs
  // (identical text on both sides) and leaves exactly the marker-changed slots
  // unpaired, which is what the caller wants to look at. A slot with no current
  // counterpart is one that renders nothing today: there is no run on the display
  // to bind, and the caller skips it instead of stealing a neighbour's.
  _alignTemplateTextRuns(markedTexts, currentTexts) {
    const textOf = (node) => String(node?.textContent || "");
    const rows = markedTexts.length;
    const cols = currentTexts.length;
    const lengths = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = cols - 1; j >= 0; j -= 1) {
        lengths[i][j] = textOf(markedTexts[i]) === textOf(currentTexts[j])
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
      }
    }
    const operations = [];
    let i = 0;
    let j = 0;
    while (i < rows || j < cols) {
      if (i < rows && j < cols && textOf(markedTexts[i]) === textOf(currentTexts[j])) {
        operations.push({ kind: "same", marked: markedTexts[i], current: currentTexts[j] });
        i += 1; j += 1;
      } else if (i < rows && (j >= cols || lengths[i + 1][j] >= lengths[i][j + 1])) {
        operations.push({ kind: "added", marked: markedTexts[i] });
        i += 1;
      } else {
        operations.push({ kind: "removed", current: currentTexts[j] });
        j += 1;
      }
    }
    // A slot whose text merely changed shows up as an added run next to a removed
    // one; rejoining those two recovers the run's current node, which is the whole
    // point - that node carries the geometry and the value on the display today.
    const pairs = [];
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      if (operation.kind === "same") {
        pairs.push({ marked: operation.marked, current: operation.current });
        continue;
      }
      if (operation.kind !== "added") continue;
      const neighbour = operations[index + 1];
      if (neighbour?.kind === "removed") {
        pairs.push({ marked: operation.marked, current: neighbour.current });
        index += 1;
        continue;
      }
      pairs.push({ marked: operation.marked, current: null });
    }
    return pairs;
  },

  async _preparedTemplateEntityBindings(device, width, height) {
    const request = this._currentDisplayTemplateSvgRequest(device);
    if (!request?.templates?.length || typeof DOMParser === "undefined") return { bindings: [], svgTemplate: "" };
    const currentSvg = await this._buildDisplayTemplateSvg(request.templates, width, height, request.layout);
    const currentDocument = new DOMParser().parseFromString(currentSvg, "image/svg+xml");
    const currentTexts = [...currentDocument.querySelectorAll("text")];
    const bindings = [];
    this._templateAutomationBindingOverrides ||= {};

    for (const template of request.templates) {
      // A ratio()-driven dial/ring/meter row is fully redrawn by its own
      // "ratio" binding below (fill, label AND the value text together, the
      // same way _blockDial/_blockRing/_blockMeters draw it as one shape) -
      // the variable indices it declares must NOT also get an independent
      // "text" binding here, or the value would be painted twice: once
      // small and precisely positioned by this loop, once again as part of
      // the full row by the ratio renderer.
      const ratioClaimedIndices = new Set(
        (template?.automation?.ratio || []).map((entry) => Number(entry.variableIndex))
      );
      for (let index = 0; index < (template.variables || []).length; index += 1) {
        if (ratioClaimedIndices.has(index)) continue;
        const meta = { ...this._templateVariableMeta(template.variables[index], index), templateId: template.id };
        const entityId = String(this._templateBinding(template, meta) || "").trim();
        if (!entityId.includes(".") || entityId.startsWith("internal:")) continue;
        const bindingKey = `${template.id}:${meta.key}`;
        const marker = `QZ${index}X`;
        this._templateAutomationBindingOverrides[bindingKey] = marker;
        let markedSvg = "";
        try {
          markedSvg = await this._buildDisplayTemplateSvg(request.templates, width, height, request.layout);
        } finally {
          delete this._templateAutomationBindingOverrides[bindingKey];
        }
        const markedDocument = new DOMParser().parseFromString(markedSvg, "image/svg+xml");
        const markedTexts = [...markedDocument.querySelectorAll("text")];
        let occurrence = 0;
        for (const { marked: markedNode, current: currentText } of this._alignTemplateTextRuns(markedTexts, currentTexts)) {
          const markedText = String(markedNode?.textContent || "");
          // A slot belongs to this variable when injecting the marker changed the
          // rendered text - whether the marker survived verbatim or the block
          // reformatted it (a number slot, an ellipsis clip, an empty value). The
          // old test only matched a verbatim marker, so those reformatting slots
          // produced no binding and silently never auto-updated.
          const drivenByVariable =
            markedText.includes(marker) || markedText !== String(currentText?.textContent || "");
          if (!drivenByVariable) continue;
          // Nothing is rendered for this slot today, so there is no run on the
          // display to bind - and no geometry to bind it at.
          if (!currentText) continue;
          // A run inside a series()/ratio()/day()/event() row is redrawn by that
          // row's own binding further down, value text and all - the whole row is
          // one shape to _blockBars/_blockDial/_blockStrip/_blockDatebox. Capturing
          // it here as well would paint the entity's value a second time, on top of
          // what the row draws. This is the general form of the ratioClaimedIndices
          // guard above, which only ever covered ratio() rows.
          if (currentText.closest?.("[data-template-block]")) continue;
          // A row that writes a literal alongside the bound value in the same
          // run (security.js's checklist: `Dveře · ${v(1, "Zamčeno")}`) diffs
          // out as one binding for the *whole* run - substituting only the
          // resolved value during an automatic refresh would silently drop
          // "Dveře · ". Splitting the marked text on the still-verbatim
          // marker recovers exactly what surrounded it, empty for the (far
          // more common) case where the variable is the entire run. Only
          // possible when the marker survived intact - a reformatting slot
          // (number/ellipsis) has nothing stable to split on and gets none.
          let valuePrefix = "";
          let valueSuffix = "";
          if (markedText.includes(marker)) {
            const markerIndex = markedText.indexOf(marker);
            valuePrefix = markedText.slice(0, markerIndex);
            valueSuffix = markedText.slice(markerIndex + marker.length);
          }
          bindings.push(this._templateAutomationTextBinding(
            currentDocument, currentText, entityId, meta, occurrence++, width, height, valuePrefix, valueSuffix
          ));
        }
      }
    }
    // series()/ratio()/day()/event() rows (a sparkline, a gauge, a forecast
    // strip, a calendar entry) never produce a <text> node whose content is
    // the raw bound value - a chart draws numbers as bar heights, day()/
    // event() call a service the backend cannot reach from inside the plain
    // v()-marker loop above - so none of them were ever captured for
    // automatic refresh; they stayed frozen at whatever was true on the last
    // manual send. Each such row is tagged with a `group` in its template's
    // design() (see air.js and weather.js), wrapped by _stackTemplateBlocks
    // in <g data-template-block="...">, and resolved here into its own
    // binding the same way camera/text bindings are.
    const slots = request.templates.length > 1 && request.layout !== "single"
      ? (request.layout === "stacked"
        ? [{ x: 0, y: 0, w: width, h: height / 2 }, { x: 0, y: height / 2, w: width, h: height / 2 }]
        : [{ x: 0, y: 0, w: width / 2, h: height }, { x: width / 2, y: 0, w: width / 2, h: height }])
      : [{ x: 0, y: 0, w: width, h: height }];
    const graphicOccurrences = {};
    request.templates.forEach((template, slotIndex) => {
      const slot = slots[slotIndex] || slots[0];
      const graphicRows = this._templateGraphicRowBoxes(template, slot.w, slot.h);
      for (const [group, { box, row }] of Object.entries(graphicRows)) {
        const occurrenceKey = `${template.id}:${group}`;
        const occurrence = graphicOccurrences[occurrenceKey] || 0;
        graphicOccurrences[occurrenceKey] = occurrence + 1;
        const nodes = [...currentDocument.querySelectorAll(`[data-template-block="${group}"]`)];
        const node = nodes[occurrence];
        if (!node) continue;
        const binding = this._templateAutomationGraphicBinding(template, group, row, {
          x: Math.round(slot.x + box.x), y: Math.round(slot.y + box.y),
          w: Math.round(box.w), h: Math.round(box.h),
        });
        if (!binding) continue;
        binding.id = `template-${template.id}-${group}-${occurrence}`;
        node.setAttribute("id", binding.id);
        bindings.push(binding);
      }
    });
    // The Meteoradar row (and anything else built from _blockRadarMap) embeds a
    // live camera snapshot as a plain <image>, not a bound HA entity value, so it
    // is tagged and captured the same way but carries its own binding type: an
    // automatic refresh re-fetches the camera rather than reading entity state.
    const radarImage = currentDocument.querySelector("image");
    if (radarImage) {
      const radarId = "template-radar-map";
      radarImage.setAttribute("id", radarId);
      const radarWidth = Math.round(Number(radarImage.getAttribute("width")) || width);
      const radarHeight = Math.round(Number(radarImage.getAttribute("height")) || height);
      bindings.push({
        id: radarId,
        type: "camera",
        entity_id: "camera.meteoradar",
        width: radarWidth,
        height: radarHeight,
        // x/y/w/h let the backend's clean_background tier paste the fresh
        // camera frame at the exact spot the <image> occupied - the other
        // (SVG-substitution) tier does not need these, it just swaps the
        // href of the very same element and keeps its original geometry.
        x: Math.round(Number(radarImage.getAttribute("x")) || 0),
        y: Math.round(Number(radarImage.getAttribute("y")) || 0),
        w: radarWidth,
        h: radarHeight,
        country: this._meteoradarCountry || this._displayTemplateConfig?.meteoradar_country || "cz",
      });
    }
    // currentDocument's tagged nodes are what the backend substitutes fresh
    // values into - text runs and the radar image alike - so this capture of the
    // whole template (background art, icons and all) is what makes an automatic
    // refresh reproduce a manual send exactly instead of guessing at what should
    // sit behind each value.
    const svgTemplate = bindings.length ? currentDocument.documentElement.outerHTML : "";
    const cleanBackground = await this._blankedDisplayTemplateBackground(currentDocument, bindings, width, height);
    return { bindings, svgTemplate, cleanBackground };
  },

  // Builds the true, value-free background an automatic refresh composites
  // fresh values onto (automation.py's clean_background tier): a clone of the
  // exact document captured above with every dynamic binding's footprint
  // removed - tagged <text> runs and the radar <image> href - then rasterised
  // WITHOUT paintOverlay, so free-form chart/gauge/signal/slider widgets (which
  // only ever reach the canvas through that callback, see
  // _rasterizeDisplayTemplateSvg) are absent too. Nothing here is guessed: this
  // is the same real background a manual send draws behind every value, so an
  // automatic refresh can match it exactly on any platform, with no dependency
  // on the backend's optional SVG rasteriser.
  //
  // Not gated on text/camera bindings existing (unlike svgTemplate above) - a
  // chart/gauge-only design still benefits from a real clean background, since
  // paintOverlay is what would have baked their stale values in otherwise.
  async _blankedDisplayTemplateBackground(currentDocument, bindings, width, height) {
    const clone = currentDocument.cloneNode(true);
    for (const binding of bindings) {
      const elementId = String(binding.id || "");
      if (!elementId) continue;
      const node = clone.getElementById(elementId);
      if (!node) continue; // best-effort, mirrors the backend's own id-collision tolerance
      if (binding.type === "camera") {
        node.removeAttribute("href");
        continue;
      }
      if (["text", "ratio", "series", "forecast", "calendar"].includes(binding.type)) {
        node.remove();
      }
    }
    try {
      return await this._rasterizeSvgStringToPng(clone.documentElement.outerHTML, width, height);
    } catch {
      return ""; // falls back to the older tiers on the backend, same as a missing svg_template
    }
  },

  async _displayTemplateEntityAutomation(image, device, gatewayId = "") {
    const size = this._devicePreviewSize(device);
    const landscape = this._displayTemplateOrientation !== "portrait";
    const width = landscape ? Math.max(size.width, size.height) : Math.min(size.width, size.height);
    const height = landscape ? Math.min(size.width, size.height) : Math.max(size.width, size.height);
    const px = (value, extent, minimum = 0) => Math.max(minimum, Math.round(Number(value || 0) * extent / 100));
    const bindings = [];

    const prepared = await this._preparedTemplateEntityBindings(device, width, height);
    bindings.push(...prepared.bindings);

    for (const source of this._templateEditorElements || []) {
      const item = this._quarterTurnedUserTemplateElement(source);
      const entityId = String(item.entityId || "").trim();
      if (!entityId || !["chart", "gauge", "signal", "slider"].includes(item.type)) continue;
      const x = px(item.x, width);
      const y = px(item.y, height);
      const w = Math.min(width - x, px(item.w, width, 1));
      const h = Math.min(height - y, px(item.h, height, 1));
      const common = {
        id: String(item.id || `entity-${bindings.length + 1}`),
        entity_id: entityId,
        entity_attribute: String(item.entityAttribute || ""),
        x, y, w, h,
        fallback: String(item.value ?? ""),
        backgroundColor: "white",
        rotation: Number(item.rotation || 0),
      };

      if (item.type === "chart") {
        bindings.push({
          ...common,
          type: "chart",
          fallback: JSON.stringify((item.historyValues || []).map(Number).filter(Number.isFinite).slice(-Number(item.historyLimit || 10))),
          chartType: ["bar", "area"].includes(item.variant) ? item.variant : "line",
          maxPoints: Math.max(1, Math.min(20, Number(item.historyLimit || 10))),
          history_mode: String(item.sampleInterval || "change") === "attribute" ? "attribute" : "rolling",
          color: "red",
          graphColor: "black",
          strokeWidth: Math.max(1, Number(item.strokeWidth || 2)),
          showGrid: item.showGrid !== false,
          showAxes: item.variant !== "sparkline",
          showValues: item.showValue !== false,
          // _drawChart (panel-draw-charts.mixin.js) reads all of these from
          // the same item - never captured before, so a manual send's title,
          // axis labels, custom min/max and legend font size all silently
          // reset to render.py's own defaults on every automatic refresh.
          legendFontSize: Math.max(10, Math.min(24, Number(item.legendFontSize || 12))),
          chartTitle: String(item.chartTitle || ""),
          xLabel: String(item.xLabel || ""),
          yLabel: String(item.yLabel || ""),
          chartMin: item.chartMin != null && String(item.chartMin).trim() !== "" ? Number(item.chartMin) : "",
          chartMax: item.chartMax != null && String(item.chartMax).trim() !== "" ? Number(item.chartMax) : "",
          chartLabels: String(item.chartLabels || ""),
          barColor: item.barColor || "red",
        });
        continue;
      }

      if (item.type === "signal") {
        bindings.push({
          ...common,
          type: "text",
          status_icons: true,
          status_on_symbol: item.showState === false ? String(item.text || "Aktivní") : `${String(item.text || "Stav")}  ON`,
          status_off_symbol: item.showState === false ? String(item.text || "Vypnuto") : `${String(item.text || "Stav")}  OFF`,
          status_on_values: "on,true,1,open,home,active,heat,heating,playing,unlocked",
          fontSize: Math.max(8, Math.round(Number(item.fontSize || 10) * height / 128)),
          minFontSize: 7,
          bold: true,
          textAlign: "center",
          verticalAlign: "middle",
          color: "black",
        });
        continue;
      }

      const objectType = item.type === "slider" ? "slider" : (item.variant === "donut" ? "pie" : "gauge");
      bindings.push({
        ...common,
        type: "layered",
        entity_ids: [entityId],
        canvas_width: w,
        canvas_height: h,
        default_symbol: "default",
        fallback: "default",
        layers: [{ id: "default", objects: [{
          type: objectType,
          entity_id: entityId,
          entity_attribute: String(item.entityAttribute || ""),
          x: 0, y: 0, w, h,
          min_value: 0,
          max_value: 100,
          unit: item.showPercent === false ? "" : "%",
          color: "red",
          fill: "red",
          stroke: "black",
          stroke_width: Math.max(1, Number(item.strokeWidth || 2)),
          show_value: item.showValue !== false,
          show_arc: item.showTrack !== false,
          show_needle: item.variant === "semicircle",
          arc_mode: item.variant === "semicircle" ? "180" : "360",
        }] }],
      });
    }

    if (!bindings.length) return undefined;
    return {
      enabled: true,
      base_image: image,
      // The full template SVG, with every bound value's <text> node tagged by
      // id. An automatic refresh substitutes fresh values into this document
      // and rasterises the whole thing, so its background art, icons and
      // colours always match what a manual send draws - base_image alone
      // cannot reconstruct that once it is baked to a bitmap.
      svg_template: prepared.svgTemplate,
      // A real, value-free render of this exact template (icons/gradients/photos
      // included, chart/gauge/signal/slider widgets excluded since they never
      // reach this document) captured by the panel itself. An automatic refresh
      // composites fresh values on top of this instead of guessing a flat
      // rectangle for whatever the value's box actually sits on - unlike
      // svg_template, this needs no backend SVG rasteriser, so it works the
      // same on every Home Assistant platform.
      clean_background: prepared.cleanBackground || "",
      bindings,
      sdk_type: Number(device.sdk_type),
      software_version: Number(device.sw || 0),
      orientation: landscape ? "landscape" : "portrait",
      transform: this._displayTransform || "rotate_cw",
      refresh_interval_seconds: Math.max(30, Math.min(86400, Number(this._refreshIntervalSeconds) || 60)),
      refresh_trigger_mode: ["both", "change_only", "interval_only"].includes(this._refreshTriggerMode)
        ? this._refreshTriggerMode
        : "both",
      gateway_selection: "manual",
      manual_gateway_id: gatewayId || "local",
      route_type: gatewayId ? "gateway" : "local",
      gateway_id: gatewayId,
      transport_name: gatewayId ? "DRATEK eInk gateway" : "Home Assistant Bluetooth",
    };
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
        automation: payload.automation,
        template_ids: Array.isArray(payload.template_ids) ? payload.template_ids : [],
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
        template_ids: [...this._assignedDisplayTemplates(device)],
      };
      payload.automation = await this._displayTemplateEntityAutomation(image, device, gatewayId);
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
          message: `Náhled byl úspěšně zapsán přes ${gatewayId ? "zvolenou gateway" : "Home Assistant Bluetooth"}.${payload.automation ? " Navázané hodnoty se nyní aktualizují automaticky po změně." : " Další zápis proběhne pouze ručně."}`,
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
      preview_width: width,
      preview_height: height,
      preview_orientation: portrait ? "portrait" : "landscape",
      sent_template_ids: [...this._assignedDisplayTemplates(device)],
    };
    this._forgetCachedDisplayImages(address);
    this._saveCachedDeviceDrafts?.();
  },

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

  _findRenderedIconSvg(root) {
    const svg = this._findSvgDeep(root);
    return svg?.querySelector("path[d],circle,rect,polygon,polyline,ellipse,line,text,image,use") ? svg : null;
  },

  // Everything this panel remembers about how a display currently looks. A fresh
  // upload replaces the picture on the hardware, so every cached rendering of the
  // previous one has to go with it or the cards keep showing a stale image.
  _forgetCachedDisplayImages(address) {
    const key = String(address || "").toUpperCase();
    if (!key) return;
    this._devicePreviewImages?.delete(key);
    this._devicePreviewRequests?.delete(key);
    if (this._ditheredPreviewCache) delete this._ditheredPreviewCache[key];
    if (this._ditheredPreviewPending) delete this._ditheredPreviewPending[key];
  },

  // What the tile remembers has to be what the panel was given, so it comes from
  // the same builder rather than from a second rendering of its own.
  async _captureCurrentDisplayTemplatePreview() {
    const device = this._device();
    if (!device) return false;
    try {
      const image = await this._renderCurrentDisplayTemplateImage(device);
      this._rememberSentDisplayPreview(device, image);
      return true;
    } catch (err) {
      console.warn("DRATEK eInk template preview capture failed:", err);
      return false;
    }
  },

  _renderTemplatePhysicalDevicePreview(device, template, secondaryTemplate, orientation, layout, autoFit = false) {
    const address = String(device.address || "").toUpperCase();
    const prevAddr = this._renderingDeviceAddress;
    this._renderingDeviceAddress = address;
    try {
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
      const primaryFillsDisplay = autoFit || !large400Layout;
      const ditherKey = autoFit ? this._escape(JSON.stringify({
        t: [template?.id || null, large400Layout && layout !== "single" ? (secondaryTemplate?.id || null) : null],
        o: orientation,
        l: layout,
        z: Math.round(previewZoom * 100),
        b: this._displayTemplateBindings || null,
        a: this._templateElementAdjustments || null,
        e: this._templateEditorElements || null,
        d: this._deviceDrafts?.[address] || null,
      })) : "";
      return `<div class="template-physical-preview device-preview-wrap" style="--template-preview-zoom:${previewZoom}">
        <div class="device-preview-fit" style="--frame-ratio:${(outerWidth / outerHeight).toFixed(4)};--preview-width:${Math.min(620, Math.max(250, Math.round(470 * outerWidth / outerHeight)))}px">
          <svg class="device-preview-designer-svg" viewBox="0 0 ${outerWidth} ${outerHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Náhled šablony v rámečku displeje">
            <foreignObject x="0" y="0" width="${outerWidth}" height="${outerHeight}">
              <div xmlns="http://www.w3.org/1999/xhtml" class="designer-device-stage device-preview-designer-copy designer-stage-${orientation}" style="--designer-stage-width:${outerWidth}px;--designer-stage-height:${outerHeight}px;--designer-frame-ratio:${frameRatio.toFixed(4)};--designer-frame-width:${frameWidth}px;--designer-frame-rotation:${orientation === "portrait" ? "90deg" : "0deg"};--designer-screen-width:${sourceWidth}px;--designer-screen-height:${sourceHeight}px;--designer-body-width:${baseWidth}px;--device-frame-radius:${frameRadius}px">
                <div class="designer-device-bezel ${pe29Layout ? "designer-device-pe29" : ""} ${large400Layout ? "designer-device-large400" : ""} designer-device-landscape">${large400Layout ? `<span class="device-large400-top-band"></span><span class="device-large400-bottom-band"><span class="device-large400-label">${this._renderDeviceBarcode(address, true)}<span class="device-large400-mac">${this._escape(address)}</span></span></span>` : pe29Layout ? `<span class="designer-device-identification"><span class="designer-device-code">${this._escape(physicalCode)}</span>${this._renderDeviceBarcode(physicalCode, false)}</span>` : `<span class="designer-device-code">${this._escape(physicalCode)}</span>`}</div>
                <div class="designer-device-screen template-designer-screen">
                  <div class="template-device-layout layout-${layout} ${large400Layout ? "is-large-display" : "is-small-display"}">
                    ${this._renderDisplayTemplateSurface(template, large400Layout ? (autoFit ? autoFormat : template?.user_created ? (orientation === "landscape" ? "wide" : "narrow") : (this._displayTemplateFormats?.primary || "narrow")) : (orientation === "landscape" ? "wide" : "narrow"), true, "primary", autoFit || !large400Layout, large400Layout ? (this._displayTemplateSizes?.primary || "large") : "large", autoFit, primaryFillsDisplay ? autoSlotWidth : 0, primaryFillsDisplay ? autoSlotHeight : 0)}
                    ${large400Layout && layout !== "single" ? this._renderDisplayTemplateSurface(secondaryTemplate, autoFit ? autoFormat : secondaryTemplate?.user_created ? (orientation === "landscape" ? "wide" : "narrow") : (this._displayTemplateFormats?.secondary || "narrow"), false, "secondary", autoFit, "small", autoFit, autoFit ? autoSlotWidth : 0, autoFit ? autoSlotHeight : 0) : ""}
                  </div>
                  ${autoFit ? `<canvas class="template-dithered-preview" data-dithered-preview="${ditherKey}" data-dithered-address="${this._escape(address)}" width="${sourceWidth}" height="${sourceHeight}"></canvas>` : ""}
                </div>
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>`;
    } finally {
      this._renderingDeviceAddress = prevAddr;
    }
  },

  _renderTemplateEditorTools() {
    const categories = [
      ["text", "format-text", "Text"], ["shapes", "shape-outline", "Tvary"], ["icons", "emoticon-outline", "Ikony"],
      ["charts", "chart-box-outline", "Grafy"], ["gauges", "gauge", "Ukazatele"], ["controls", "toggle-switch-outline", "Signalizace"],
      ["images", "image-outline", "Obrázky"], ["layers", "layers-triple-outline", "Vrstvy"],
    ];
    const active = String(this._templateElementPaletteCategory || "");
    return `<nav class="template-tool-rail" aria-label="Kategorie prvků">${categories.map(([id, icon, title]) => `<button type="button" class="${active === id ? "is-active" : ""}" data-template-palette-category="${id}" title="${title}" aria-label="${title}" aria-pressed="${active === id}"><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</nav>`;
  },

  _renderTemplateElementPalette() {
    const category = String(this._templateElementPaletteCategory || "");
    if (!category) return "";
    const meta = {
      text: ["Text", "Texty a popisky"], shapes: ["Tvary", "Základní geometrické prvky"], icons: ["Ikony", "Symboly Material Design"],
      charts: ["Grafy", "Vizuální průběhy, sloupce a podíly"], gauges: ["Ukazatele", "Hodnoty, kapacita a průběh"], controls: ["Signalizace", "Stavy zapnuto, vypnuto a aktivita"],
      images: ["Obrázky", "Vlastní soubor z počítače"], layers: ["Vrstvy", "Pořadí objektů na displeji"],
    };
    const [title, description] = meta[category] || meta.shapes;
    const anchorIndex = ["text", "shapes", "icons", "charts", "gauges", "controls", "images", "layers"].indexOf(category);
    const toolPreview = (type, settings) => {
      const item = this._normalizeTemplateEditorElement({ type, ...settings });
      const style = `--element-color:${item.color};--element-fill:${item.fill};--element-stroke:${item.stroke};--element-stroke-width:${item.strokeWidth}px;--element-radius:${item.radius}px;--element-font-size:${item.fontSize}px;--element-font-weight:${item.fontWeight};--element-value:${Math.max(0, Math.min(100, item.value))}%`;
      let preview = "";
      if (item.type === "text") preview = `<b class="template-palette-text-sample">${this._escape(item.text || item.label)}</b>`;
      else if (item.type === "button") preview = `<b class="template-palette-button-sample">${this._escape(item.text || item.label)}</b>`;
      else if (item.type === "rect") preview = `<i class="template-palette-shape-sample is-rect"></i>`;
      else if (item.type === "circle") preview = `<i class="template-palette-shape-sample is-circle"></i>`;
      else if (item.type === "line") preview = `<i class="template-palette-line-sample"></i>`;
      else if (item.type === "icon") preview = `<ha-icon icon="mdi:${this._escape(item.icon || "star")}"></ha-icon>`;
      else if (item.type === "slider") preview = this._renderTemplateProgressVisual(item);
      else if (item.type === "chart") preview = this._renderTemplateChartVisual(item);
      else if (item.type === "gauge") preview = this._renderTemplateGaugeVisual(item);
      else if (item.type === "signal") preview = this._renderTemplateSignalVisual(item);
      const componentClass = ["chart", "gauge", "slider", "signal"].includes(item.type) ? ` template-overlay-${item.type}` : "";
      return `<span class="template-palette-visual template-palette-preview${componentClass} variant-${this._escape(item.variant || item.type)}" style="${style}">${preview}</span>`;
    };
    const tool = (type, icon, label, preset = {}) => {
      const settings = typeof preset === "string" ? { icon: preset } : { ...preset };
      settings.label ||= label;
      return `<button type="button" class="template-palette-item variant-${this._escape(settings.variant || type)}" draggable="true" data-template-editor-tool="${type}" data-template-editor-icon="${this._escape(settings.icon || "")}" data-template-editor-preset="${this._escape(JSON.stringify(settings))}" title="Vložit ${this._escape(label)}">${toolPreview(type, settings)}<span>${this._escape(label)}</span></button>`;
    };
    const iconNames = [
      ["star", "Hvězda"], ["heart", "Srdce"], ["home", "Dům"], ["account", "Osoba"],
      ["weather-sunny", "Slunce"], ["weather-cloudy", "Mrak"], ["thermometer", "Teplota"], ["water-percent", "Vlhkost"],
      ["wifi", "Wi-Fi"], ["bluetooth", "Bluetooth"], ["lightning-bolt", "Energie"], ["battery", "Baterie"],
      ["calendar", "Kalendář"], ["clock-outline", "Čas"], ["lock-outline", "Zámek"], ["shield-lock-outline", "Zabezpečení"],
      ["lightbulb-on-outline", "Světlo"], ["power", "Napájení"], ["check-circle-outline", "Hotovo"], ["alert-circle-outline", "Upozornění"],
      ["information-outline", "Informace"], ["cart-outline", "Košík"], ["currency-usd", "Cena"], ["map-marker-outline", "Místo"],
      ["door-open", "Dveře"], ["window-open-variant", "Okno"], ["fan", "Ventilátor"], ["radiator", "Topení"],
      ["water-pump", "Čerpadlo"], ["sprinkler-variant", "Zavlažování"], ["solar-power", "Fotovoltaika"], ["ev-station", "Nabíjení"],
      ["bell-outline", "Zvonek"], ["camera-outline", "Kamera"], ["package-variant-closed", "Zásilka"], ["tools", "Dílna"],
    ];
    let content = "";
    if (category === "text") content = [
      tool("text", "format-title", "Nadpis", { text: "Nadpis", fontSize: 28, fontWeight: "900", h: 13, variant: "heading" }),
      tool("text", "format-text", "Běžný text", { text: "Vlastní text", fontSize: 17, fontWeight: "400", variant: "body" }),
      tool("text", "numeric", "Velká hodnota", { text: "24,5 °C", fontSize: 32, fontWeight: "900", h: 16, variant: "value" }),
      tool("button", "label-outline", "Text v rámečku", { text: "Popisek", fontSize: 14, radius: 7, variant: "label" }),
    ].join("");
    else if (category === "shapes") content = [
      tool("rect", "rectangle-outline", "Obdélník", { variant: "outline" }),
      tool("rect", "rectangle", "Plný blok", { fill: "#111111", stroke: "#111111", variant: "filled" }),
      tool("rect", "rectangle-rounded-outline", "Zaoblený blok", { radius: 12, variant: "rounded" }),
      tool("circle", "circle-outline", "Kruh", { variant: "circle" }),
      tool("circle", "circle", "Plný kruh", { fill: "#111111", variant: "circle-filled" }),
      tool("line", "vector-line", "Čára", { variant: "line" }),
    ].join("");
    else if (category === "icons") content = iconNames.map(([icon, label]) => tool("icon", icon, label, icon)).join("");
    else if (category === "charts") content = [
      tool("chart", "chart-line", "Čárový", { variant: "line" }),
      tool("chart", "chart-areaspline", "Plošný", { variant: "area" }),
      tool("chart", "chart-bar", "Sloupcový", { variant: "bar" }),
      tool("chart", "chart-timeline-variant-shimmer", "Schodový", { variant: "steps" }),
      tool("chart", "chart-donut", "Prstencový", { variant: "donut", value: 68 }),
      tool("chart", "chart-line-variant", "Mini trend", { variant: "sparkline", fill: "transparent", strokeWidth: 3, h: 18 }),
    ].join("");
    else if (category === "gauges") content = [
      tool("gauge", "gauge", "Kruhový", { variant: "ring", value: 72 }),
      tool("gauge", "gauge-low", "Půlkruhový", { variant: "semicircle", value: 54 }),
      tool("gauge", "battery-70", "Baterie", { variant: "battery", value: 72 }),
      tool("gauge", "thermometer", "Teploměr", { variant: "thermometer", value: 64 }),
      tool("slider", "progress-check", "Průběh", { variant: "progress", value: 68 }),
    ].join("");
    else if (category === "controls") content = [
      tool("signal", "toggle-switch", "Zapnuto", { variant: "on", text: "Zapnuto", icon: "power", value: 100, fill: "#ffffff", color: "#111111" }),
      tool("signal", "toggle-switch-off-outline", "Vypnuto", { variant: "off", text: "Vypnuto", icon: "power-off", value: 0 }),
      tool("signal", "check-circle", "Aktivní", { variant: "active", text: "Aktivní", icon: "check-circle", value: 100 }),
      tool("signal", "minus-circle-outline", "Neaktivní", { variant: "inactive", text: "Neaktivní", icon: "minus-circle-outline", value: 0 }),
      tool("signal", "alert-circle", "Výstraha", { variant: "warning", text: "Výstraha", icon: "alert-circle", color: "#d71912", stroke: "#d71912" }),
      tool("signal", "image-outline", "Obrázková", { variant: "picture", text: "Stav", icon: "lightbulb-on-outline", w: 28, h: 24 }),
    ].join("");
    else if (category === "images") {
      const assets = this._templateImageLibrary || [];
      content = `<button type="button" class="template-palette-item is-import" data-template-editor-import><ha-icon icon="mdi:image-plus"></ha-icon><span>Nahrát obrázek</span></button><input id="templateEditorImage" type="file" accept="image/*" hidden>${assets.map((asset) => `<span class="template-library-image"><button type="button" data-template-library-image="${this._escape(asset.id)}" title="Vložit ${this._escape(asset.name || "obrázek")}"><img src="${this._escape(asset.src)}" alt=""><span>${this._escape(asset.name || "Obrázek")}</span></button><button type="button" class="template-library-image-remove" data-template-library-remove="${this._escape(asset.id)}" title="Odstranit z knihovny" aria-label="Odstranit ${this._escape(asset.name || "obrázek")} z knihovny"><ha-icon icon="mdi:close"></ha-icon></button></span>`).join("")}`;
    }
    else if (category === "layers") {
      const selected = String(this._selectedTemplateEditorElementId || "");
      content = `<div class="template-palette-layers">${(this._templateEditorElements || []).length ? [...this._templateEditorElements].reverse().map((item) => `<div class="${selected === item.id ? "is-selected" : ""}" data-template-editor-select="${this._escape(item.id)}"><ha-icon icon="mdi:${item.type === "image" ? "image-outline" : item.icon || ({ text: "format-text", rect: "rectangle-outline", circle: "circle-outline", line: "vector-line", button: "label-outline", slider: "progress-check", chart: "chart-box-outline", gauge: "gauge", signal: "toggle-switch-outline" }[item.type] || "shape-outline")}"></ha-icon><button type="button" class="template-layer-name" data-template-editor-select="${this._escape(item.id)}">${this._escape(item.label)}</button><button type="button" data-template-editor-remove="${this._escape(item.id)}" title="Odstranit"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button></div>`).join("") : `<p class="template-layers-empty">Na plátně zatím nejsou žádné vlastní prvky.</p>`}</div>`;
    }
    return `<section class="card template-bottom-palette is-${category}" aria-label="Paleta ${this._escape(title)}" style="--palette-anchor:${Math.max(0, anchorIndex)}"><header><span><strong>${this._escape(title)}</strong><small>${this._escape(description)}</small></span><button type="button" data-template-palette-close title="Zavřít paletu" aria-label="Zavřít paletu"><ha-icon icon="mdi:close"></ha-icon></button></header><div class="template-palette-items ${category === "layers" ? "is-layers" : ""}">${content}</div></section>`;
  },

  _templateEditorElement() {
    return (this._templateEditorElements || []).find((item) => item.id === this._selectedTemplateEditorElementId) || null;
  },

  _renderTemplateElementInspector() {
    const item = this._templateEditorElement();
    if (!item) {
      this._selectedTemplateEditorElementId = "";
      return "";
    }
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const field = (title, prop, value, min = 0, max = 100, step = 1, suffix = "%") => `<label class="template-property-field"><span>${title}</span><div><input type="number" min="${min}" max="${max}" step="${step}" value="${number(value)}" data-template-element-prop="${prop}"><small>${suffix}</small></div></label>`;
    const colors = (prop, value, allowTransparent = false) => `<div class="template-property-colors" data-template-color-group="${prop}">${allowTransparent ? `<button type="button" class="is-transparent ${value === "transparent" ? "is-selected" : ""}" data-template-element-color="${prop}:transparent" title="Bez barvy"><ha-icon icon="mdi:water-off-outline"></ha-icon></button>` : ""}${[["#111111", "Černá"], ["#d71912", "Červená"], ["#ffffff", "Bílá"]].map(([color, title]) => `<button type="button" style="--swatch:${color}" class="${value === color ? "is-selected" : ""}" data-template-element-color="${prop}:${color}" title="${title}"></button>`).join("")}</div>`;
    const toggles = (items) => `<div class="template-component-toggles">${items.map(([prop, label]) => `<label><input type="checkbox" data-template-element-toggle="${prop}" ${item[prop] !== false ? "checked" : ""}><span><i></i>${label}</span></label>`).join("")}</div>`;
    const intervalOptions = [["change", "Při každé změně"], ["minute", "Nejvýše 1× za minutu"], ["hour", "Nejvýše 1× za hodinu"], ["day", "Nejvýše 1× denně"], ["week", "Nejvýše 1× týdně"]];
    const resetOptions = [["never", "Nemazat automaticky"], ["hour", "Vymazat po hodině"], ["day", "Vymazat po dni"], ["week", "Vymazat po týdnu"]];
    const select = (title, prop, value, options) => `<label class="template-property-wide"><span>${title}</span><select data-template-element-prop="${prop}">${options.map(([key, label]) => `<option value="${key}" ${value === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
    const entity = item.entityId ? this._hass?.states?.[item.entityId] : null;
    const entityValue = this._templateElementEntityRaw?.(item);
    const propertyTab = (title, content, open = false, extraClass = "") => `<details class="template-property-section ${extraClass}" ${open ? "open" : ""}><summary><span>${title}</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body">${content}</div></details>`;
    const entityBinding = ["chart", "gauge", "signal", "slider"].includes(item.type) ? propertyTab("Home Assistant", `<label class="template-property-wide"><span>Entita nebo pomocník</span><ha-selector data-template-element-entity-picker="${this._escape(item.id)}"></ha-selector></label><label class="template-property-wide"><span>Entity ID</span><input type="text" value="${this._escape(item.entityId || "")}" data-template-element-entity-id placeholder="sensor.teplota"></label><label class="template-property-wide"><span>Atribut (volitelné)</span><input type="text" value="${this._escape(item.entityAttribute || "")}" data-template-element-prop="entityAttribute" placeholder="Například prices"></label>${item.entityId ? `<div class="template-entity-current"><ha-icon icon="mdi:home-assistant"></ha-icon><span><strong>${this._escape(entity?.attributes?.friendly_name || item.entityId)}</strong><small>${this._escape(entityValue === undefined ? "Entita nemá hodnotu" : String(entityValue))}</small></span></div>` : `<p class="template-entity-help">Bez vybrané entity se používá ručně nastavená hodnota.</p>`}`, true, "template-ha-binding") : "";
    const textTypes = ["text", "button", "signal"];
    const shapeTypes = ["rect", "circle", "button", "signal"];
    return `<div class="template-element-inspector">
      <div class="template-editor-panel-heading"><ha-icon icon="mdi:tune-vertical-variant"></ha-icon><span><strong>Vlastnosti prvku</strong><small>${this._escape(item.label)}</small></span></div>
      <div class="template-inspector-actions"><button type="button" data-template-element-duplicate><ha-icon icon="mdi:content-duplicate"></ha-icon>Duplikovat</button><button type="button" class="is-danger" data-template-element-delete><ha-icon icon="mdi:trash-can-outline"></ha-icon>Smazat</button></div>
      ${textTypes.includes(item.type) ? `${propertyTab("Text a typografie", `
        <label class="template-property-wide"><span>Obsah</span><input type="text" value="${this._escape(item.text || "")}" data-template-element-prop="text"></label>
        ${select("Font", "fontFamily", item.fontFamily, [["DRATEK eInk Sans", "DRATEK eInk Sans"], ["Arial", "Arial"], ["Georgia", "Georgia / patkové"], ["Courier New", "Courier / monospace"]])}
        <div class="template-property-row">${field("Velikost", "fontSize", item.fontSize, 6, 72, 1, "px")}${select("Řez", "fontWeight", String(item.fontWeight), [["400", "Normální"], ["700", "Tučný"], ["900", "Extra tučný"]])}</div>
        <div class="template-property-row">${select("Styl", "fontStyle", item.fontStyle, [["normal", "Normální"], ["italic", "Kurzíva"]])}${select("Dekorace", "textDecoration", item.textDecoration, [["none", "Bez dekorace"], ["underline", "Podtržení"], ["line-through", "Přeškrtnutí"]])}</div>
        <label class="template-property-wide"><span>Zarovnání</span><div class="template-align-buttons">${[["left", "format-align-left"], ["center", "format-align-center"], ["right", "format-align-right"]].map(([value, icon]) => `<button type="button" class="${item.textAlign === value ? "is-selected" : ""}" data-template-element-align="${value}"><ha-icon icon="mdi:${icon}"></ha-icon></button>`).join("")}</div></label>
        <label class="template-property-wide"><span>Barva textu</span>${colors("color", item.color)}</label>
      `, true)}
      ${propertyTab("Podbarvení a overlay", `
        <label class="template-property-wide"><span>Barva podkladu</span>${colors("fill", item.fill, true)}</label>
        <div class="template-property-row">${field("Krytí overlay", "overlayOpacity", item.overlayOpacity, 0, 100, 5, "%")}${field("Zaoblení", "radius", item.radius, 0, 50, 1, "px")}</div>
      `)}
      ${propertyTab("Orámování textu", `
        <label class="template-property-wide"><span>Barva rámečku oblasti</span>${colors("textBorderColor", item.textBorderColor)}</label>
        ${field("Tloušťka rámečku", "textBorderWidth", item.textBorderWidth, 0, 12, 1, "px")}
        <label class="template-property-wide"><span>Barva obrysu písma</span>${colors("textOutlineColor", item.textOutlineColor)}</label>
        ${field("Obrys písma", "textOutlineWidth", item.textOutlineWidth, 0, 6, 1, "px")}
      `)}` : ""}
      ${["icon", "signal"].includes(item.type) ? propertyTab("Ikona", `<label class="template-property-wide"><span>Název MDI ikony</span><input type="text" value="${this._escape(item.icon || "star")}" data-template-element-prop="icon"></label><label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${shapeTypes.includes(item.type) ? propertyTab("Vzhled", `<label class="template-property-wide"><span>Výplň</span>${colors("fill", item.fill, true)}</label><label class="template-property-wide"><span>Rámeček</span>${colors("stroke", item.stroke)}</label><div class="template-property-row">${field("Tloušťka", "strokeWidth", item.strokeWidth, 0, 12, 1, "px")}${field("Zaoblení", "radius", item.radius, 0, 50, 1, "px")}</div>`, true) : ""}
      ${item.type === "slider" ? propertyTab("Hodnota slideru", `${field("Hodnota", "value", item.value, 0, 100, 1, "%")}<label class="template-property-wide"><span>Aktivní barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${["chart", "gauge"].includes(item.type) ? propertyTab("Data", `${field("Hodnota", "value", item.value, 0, 100, 1, "%")}<label class="template-property-wide"><span>Barva</span>${colors("color", item.color)}</label>`, true) : ""}
      ${entityBinding}
      ${item.type === "chart" ? propertyTab("Historie grafu", `${field("Počet posledních hodnot", "historyLimit", item.historyLimit, 1, 20, 1, "")} ${select("Interval ukládání hodnot", "sampleInterval", item.sampleInterval, intervalOptions)}${select("Automatické mazání historie", "resetInterval", item.resetInterval, resetOptions)}<button type="button" class="template-history-clear" data-template-element-history-clear><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Vymazat uložené hodnoty</button><small class="template-history-count">Uloženo ${(item.historyValues || []).length} z ${item.historyLimit} hodnot</small>`) : ""}
      ${item.type === "chart" ? propertyTab("Části grafu", toggles([["showValue", "Hodnota"], ["showPercent", "Znak %"], ["showLabel", "Popisek"], ["showGrid", "Mřížka"], ["showPoints", "Body grafu"], ["showFill", "Barevná plocha"], ["showTrack", "Podklad kruhu"]])) : ""}
      ${item.type === "gauge" ? propertyTab("Části ukazatele", toggles([["showValue", "Hodnota"], ["showPercent", "Jednotka"], ["showLabel", "Popisek"], ["showTrack", "Podkladová stupnice"]])) : ""}
      ${item.type === "signal" ? propertyTab("Části signalizace", toggles([["showIcon", "Ikona"], ["showLabel", "Text"], ["showState", "Stav / přepínač"]])) : ""}
      ${item.type === "slider" ? propertyTab("Části průběhu", toggles([["showValue", "Hodnota"], ["showPercent", "Znak %"], ["showScale", "Číselná stupnice"], ["showTrack", "Podkladová čára"]])) : ""}
      ${propertyTab("Pořadí vrstev", `<div class="template-layer-order"><button type="button" data-template-element-order="back"><ha-icon icon="mdi:arrange-send-backward"></ha-icon>Dozadu</button><button type="button" data-template-element-order="front"><ha-icon icon="mdi:arrange-bring-forward"></ha-icon>Dopředu</button></div><p class="template-entity-help">Polohu, velikost a orientaci upravíte v úzkém panelu nad náhledem displeje.</p>`)}
      <button type="button" class="template-inspector-close" data-template-element-deselect><ha-icon icon="mdi:arrow-left"></ha-icon>Zpět k nastavení šablony</button>
    </div>`;
  },

  _renderTemplatePartControls(activeTemplate) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    if (!key || !adjustment) {
      return `<div class="template-part-controls is-empty">
        <ha-icon icon="mdi:cursor-move"></ha-icon>
        <span><strong>Posouvejte prvky šablony</strong><small>Klikněte na jakýkoliv text, ikonu nebo blok v náhledu a tažením jej přesuňte na požadované místo.</small></span>
      </div>`;
    }
    const partNumber = Number(key.split(":").at(-1)) + 1;
    return `<div class="template-part-controls">
      <div class="template-part-controls-head"><ha-icon icon="mdi:cursor-move"></ha-icon><span><strong>${this._escape(activeTemplate.title)} · prvek ${partNumber}</strong><small>Tažením myší změníte polohu prvku</small></span></div>
      <button type="button" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon>Obnovit původní polohu</button>
    </div>`;
  },

  _renderTemplatePartInspector(activeTemplate) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    if (!key || !adjustment) return "";
    const partNumber = Number(key.split(":").at(-1)) + 1;
    const field = (label, prop, value, min, max, suffix = "") => `<label class="template-property-field"><span>${label}</span><div><input type="number" min="${min}" max="${max}" step="1" value="${Math.round(Number(value || 0))}" data-template-part-prop="${prop}"><small>${suffix}</small></div></label>`;
    const selectedColor = adjustment.color || "black";
    return `<div class="template-element-inspector template-built-in-inspector">
      <div class="template-editor-panel-heading"><ha-icon icon="mdi:vector-selection"></ha-icon><span><strong>Vlastnosti prvku šablony</strong><small>${this._escape(activeTemplate?.title || "Šablona")} · prvek ${partNumber}</small></span></div>
      <div class="template-inspector-actions"><button type="button" data-template-element-duplicate><ha-icon icon="mdi:content-duplicate"></ha-icon>Duplikovat</button><button type="button" class="is-danger" data-template-element-delete><ha-icon icon="mdi:trash-can-outline"></ha-icon>Skrýt</button></div>
      <details class="template-property-section" open><summary><span>Poloha a transformace</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body">
        <div class="template-property-row">${field("Posun X", "x", adjustment.x, -1000, 1000, "px")}${field("Posun Y", "y", adjustment.y, -1000, 1000, "px")}</div>
        <div class="template-property-row">${field("Velikost", "scale", Number(adjustment.scale ?? 1) * 100, 20, 300, "%")}${field("Otočení", "rotation", adjustment.rotation, -180, 180, "°")}</div>
        <button type="button" class="template-history-clear" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon>Obnovit původní stav</button>
      </div></details>
      <details class="template-property-section" open><summary><span>Vzhled a viditelnost</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body">
        <label class="template-property-wide"><span>Barva prvku</span><div class="template-property-colors"><button type="button" style="--swatch:#111111" class="${selectedColor === "black" ? "is-selected" : ""}" data-template-part-color="black" title="Černá"></button><button type="button" style="--swatch:#d71912" class="${selectedColor === "red" ? "is-selected" : ""}" data-template-part-color="red" title="Červená"></button><button type="button" style="--swatch:#ffffff" class="${selectedColor === "white" ? "is-selected" : ""}" data-template-part-color="white" title="Bílá"></button></div></label>
        <div class="template-component-toggles"><label><input type="checkbox" data-template-part-toggle="hidden" ${adjustment.hidden ? "" : "checked"}><span><i></i>Viditelný</span></label><label><input type="checkbox" data-template-part-toggle="locked" ${adjustment.locked ? "checked" : ""}><span><i></i>Zamknutý</span></label></div>
      </div></details>
      <details class="template-property-section"><summary><span>Pořadí vrstev</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary><div class="template-property-section-body"><div class="template-layer-order"><button type="button" data-template-element-order="back"><ha-icon icon="mdi:arrange-send-backward"></ha-icon>Dozadu</button><button type="button" data-template-element-order="front"><ha-icon icon="mdi:arrange-bring-forward"></ha-icon>Dopředu</button></div></div></details>
      <button type="button" class="template-inspector-close" data-template-part-deselect><ha-icon icon="mdi:arrow-left"></ha-icon>Zrušit výběr</button>
    </div>`;
  },

  _applyTemplatePartAdjustment(element, surface, adjustment) {
    const x = Number(adjustment.x || 0);
    const y = Number(adjustment.y || 0);
    const scale = Math.max(.2, Math.min(3, Number(adjustment.scale ?? 1)));
    const rotation = Number(adjustment.rotation || 0);
    if (typeof element.setAttribute === "function") {
      element.setAttribute("transform", `translate(${x}, ${y}) rotate(${rotation}) scale(${scale})`);
    }
    element.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
    element.style.transformOrigin = "center";
    element.style.display = adjustment.hidden ? "none" : "";
    element.style.pointerEvents = adjustment.locked ? "none" : "";
    element.style.position = "relative";
    element.style.zIndex = String(Number(adjustment.order || 0));
    element.classList.toggle("is-locked", !!adjustment.locked);
    const color = { black: "#111111", red: "#d71912", white: "#ffffff" }[adjustment.color];
    if (color) {
      element.style.color = color;
      [element, ...element.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")].forEach((node) => {
        const fill = node.getAttribute?.("fill");
        const stroke = node.getAttribute?.("stroke");
        if (fill && fill !== "none" && !["#fff", "#ffffff", "white"].includes(fill.toLowerCase())) node.style.fill = color;
        if (stroke && stroke !== "none" && !["#fff", "#ffffff", "white"].includes(stroke.toLowerCase())) node.style.stroke = color;
      });
    }
  },

  _bindTemplatePartEditor() {
    if (this._activeTab !== "display-settings" || this._displaySettingsView !== "designer") return;
    this._templateElementAdjustments ||= {};
    this.shadowRoot.querySelectorAll(".display-template-editor-stage .display-template-surface").forEach((surface) => {
      const templateId = surface.dataset.previewTemplate || "";
      const slot = surface.dataset.templateCanvasSlot || "primary";
      const templateRoot = surface.querySelector(".tpl") || surface.querySelector(".template-responsive-preview-body") || surface.querySelector("svg.template-responsive-preview");
      if (!templateRoot) return;
      const parts = [...templateRoot.children].filter((child) => child.tagName !== "rect" || child.getAttribute("fill") !== "#ffffff");
      parts.forEach((element, index) => {
        const key = `${slot}:${templateId}:${index}`;
        const adjustment = this._templateElementAdjustments[key] || { x: 0, y: 0, scale: 1, rotation: 0 };
        this._templateElementAdjustments[key] = adjustment;
        const nativeBounds = element.getBBox?.();
        const visualBounds = element.getBoundingClientRect?.();
        adjustment.baseX ??= Number(nativeBounds?.x || 0);
        adjustment.baseY ??= Number(nativeBounds?.y || 0);
        adjustment.baseWidth ||= Number(nativeBounds?.width || visualBounds?.width || 1);
        adjustment.baseHeight ||= Number(nativeBounds?.height || visualBounds?.height || 1);
        element.dataset.templateEditablePart = key;
        element.classList.add("template-editable-part");
        element.classList.toggle("is-selected", this._selectedTemplatePart === key);
        this._applyTemplatePartAdjustment(element, surface, adjustment);
        element.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || adjustment.locked) return;
          event.preventDefault();
          event.stopPropagation();
          this._selectedTemplatePart = key;
          this._selectedTemplateEditorElementId = "";
          this.shadowRoot.querySelectorAll(".template-editable-part.is-selected").forEach((item) => item.classList.remove("is-selected"));
          element.classList.add("is-selected");

          const svg = surface.querySelector("svg.template-responsive-preview") || surface.querySelector("svg");
          const bounds = (svg || surface).getBoundingClientRect();
          const viewBox = svg?.viewBox?.baseVal;
          const nativeWidth = viewBox?.width || Number(svg?.getAttribute("width")) || bounds.width || 1;
          const nativeHeight = viewBox?.height || Number(svg?.getAttribute("height")) || bounds.height || 1;
          const ctm = svg?.getScreenCTM?.();
          const scaleX = ctm?.a ? (1 / ctm.a) : (bounds.width > 0 ? (nativeWidth / bounds.width) : 1);
          const scaleY = ctm?.d ? (1 / ctm.d) : (bounds.height > 0 ? (nativeHeight / bounds.height) : 1);

          this._templatePartDrag = {
            key,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: Number(adjustment.x || 0),
            originY: Number(adjustment.y || 0),
            scaleX,
            scaleY,
            historyPushed: false,
          };
          element.setPointerCapture?.(event.pointerId);
        });
        element.addEventListener("pointermove", (event) => {
          const drag = this._templatePartDrag;
          if (!drag || drag.key !== key || drag.pointerId !== event.pointerId) return;
          if (!drag.historyPushed) {
            this._pushTemplateHistory();
            drag.historyPushed = true;
          }
          const dxScreen = event.clientX - drag.startX;
          const dyScreen = event.clientY - drag.startY;
          adjustment.x = drag.originX + (dxScreen * drag.scaleX);
          adjustment.y = drag.originY + (dyScreen * drag.scaleY);
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

  _normalizeTemplateEditorElement(source = {}) {
    const type = String(source.type || "rect");
    const defaults = {
      text: { w: 42, h: 10, text: "Vlastní text", fontSize: 18, fill: "transparent", fontFamily: "DRATEK eInk Sans", fontStyle: "normal", textDecoration: "none", textOutlineWidth: 0, textOutlineColor: "#ffffff", textBorderWidth: 0, textBorderColor: "#111111", overlayOpacity: 100 },
      rect: { w: 36, h: 22, fill: "transparent" }, circle: { w: 25, h: 25, fill: "transparent" },
      line: { w: 42, h: 4, fill: "#111111" }, icon: { w: 18, h: 18, icon: "star", fill: "transparent" },
      image: { w: 34, h: 28, fill: "transparent" }, button: { w: 42, h: 14, text: "Popisek", fontSize: 15, fill: "#ffffff", radius: 6 },
      slider: { w: 48, h: 15, value: 60, fill: "transparent", radius: 0, strokeWidth: 2, entityId: "", entityAttribute: "", showValue: true, showPercent: true, showScale: true, showTrack: true },
      chart: { w: 52, h: 30, value: 68, fill: "transparent", radius: 0, strokeWidth: 2, entityId: "", entityAttribute: "", historyLimit: 10, sampleInterval: "change", resetInterval: "never", historyValues: [], historyUpdatedAt: 0, historyResetAt: 0, showValue: true, showPercent: true, showLabel: false, showGrid: true, showPoints: true, showFill: true, showTrack: true },
      gauge: { w: 26, h: 34, value: 72, fill: "transparent", radius: 0, strokeWidth: 2, entityId: "", entityAttribute: "", variant: "ring", showValue: true, showPercent: true, showLabel: false, showTrack: true },
      signal: { w: 40, h: 14, value: 100, text: "Aktivní", icon: "check-circle", fontSize: 9, fill: "#ffffff", radius: 6, strokeWidth: 2, entityId: "", entityAttribute: "", variant: "active", showIcon: true, showLabel: true, showState: true },
    }[type] || { w: 30, h: 20, fill: "transparent" };
    const legacy = source.w === undefined || source.h === undefined;
    const w = Math.max(2, Math.min(100, Number(source.w ?? defaults.w)));
    const h = Math.max(2, Math.min(100, Number(source.h ?? defaults.h)));
    const sourceX = Number(source.x ?? 50);
    const sourceY = Number(source.y ?? 50);
    const paletteColor = (value, fallback, transparent = false) => {
      const normalized = String(value ?? fallback).toLowerCase();
      if (transparent && normalized === "transparent") return "transparent";
      if (["#fff", "#ffffff", "white"].includes(normalized)) return "#ffffff";
      if (["#e31b1b", "#d71912", "#f00", "#ff0000", "red"].includes(normalized)) return "#d71912";
      return "#111111";
    };
    return {
      ...defaults, ...source, type, w, h,
      x: Math.max(0, Math.min(100 - w, legacy ? sourceX - w / 2 : sourceX)),
      y: Math.max(0, Math.min(100 - h, legacy ? sourceY - h / 2 : sourceY)),
      rotation: Number(source.rotation || 0), color: paletteColor(source.color, "#111111"), fill: paletteColor(source.fill, defaults.fill ?? "transparent", true),
      stroke: paletteColor(source.stroke, "#111111"), strokeWidth: Number(source.strokeWidth ?? 2), radius: Number(source.radius ?? defaults.radius ?? 0),
      fontSize: Number(source.fontSize ?? defaults.fontSize ?? 16), fontWeight: String(source.fontWeight || "700"), fontFamily: ["DRATEK eInk Sans", "Arial", "Georgia", "Courier New"].includes(source.fontFamily) ? source.fontFamily : (defaults.fontFamily || "DRATEK eInk Sans"), fontStyle: source.fontStyle === "italic" ? "italic" : "normal", textDecoration: ["underline", "line-through"].includes(source.textDecoration) ? source.textDecoration : "none", textAlign: source.textAlign || "center",
      textOutlineWidth: Math.max(0, Math.min(6, Number(source.textOutlineWidth ?? defaults.textOutlineWidth ?? 0))), textOutlineColor: paletteColor(source.textOutlineColor, defaults.textOutlineColor || "#ffffff"), textBorderWidth: Math.max(0, Math.min(12, Number(source.textBorderWidth ?? defaults.textBorderWidth ?? 0))), textBorderColor: paletteColor(source.textBorderColor, defaults.textBorderColor || "#111111"), overlayOpacity: Math.max(0, Math.min(100, Number(source.overlayOpacity ?? defaults.overlayOpacity ?? 100))),
      value: Number(source.value ?? defaults.value ?? 50), historyLimit: Math.max(1, Math.min(20, Number(source.historyLimit ?? defaults.historyLimit ?? 10))),
    };
  },

  _templateHistorySnapshot() {
    return {
      elements: structuredClone(this._templateEditorElements || []),
      adjustments: structuredClone(this._templateElementAdjustments || {}),
      selectedElementId: String(this._selectedTemplateEditorElementId || ""),
      selectedPart: String(this._selectedTemplatePart || ""),
    };
  },

  _pushTemplateHistory() {
    this._templateUndoStack ||= [];
    this._templateRedoStack ||= [];
    const snapshot = this._templateHistorySnapshot();
    const last = this._templateUndoStack.at(-1);
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    this._templateUndoStack.push(snapshot);
    if (this._templateUndoStack.length > (this._templateHistoryLimit || 60)) this._templateUndoStack.shift();
    this._templateRedoStack = [];
  },

  _restoreTemplateHistory(snapshot) {
    if (!snapshot) return;
    this._templateEditorElements = structuredClone(snapshot.elements || []);
    this._templateElementAdjustments = structuredClone(snapshot.adjustments || {});
    this._selectedTemplateEditorElementId = String(snapshot.selectedElementId || "");
    this._selectedTemplatePart = String(snapshot.selectedPart || "");
    this._templateOverlayDrag = null;
    this._templatePropertyHistoryKey = "";
    this._templateSaveResult = null;
    this._render();
    this._paint();
  },

  _undoTemplateHistory() {
    if (!this._templateUndoStack?.length) return;
    this._templateRedoStack ||= [];
    this._templateRedoStack.push(this._templateHistorySnapshot());
    this._restoreTemplateHistory(this._templateUndoStack.pop());
  },

  _redoTemplateHistory() {
    if (!this._templateRedoStack?.length) return;
    this._templateUndoStack ||= [];
    this._templateUndoStack.push(this._templateHistorySnapshot());
    this._restoreTemplateHistory(this._templateRedoStack.pop());
  },

  _deleteSelectedTemplateElement() {
    const id = String(this._selectedTemplateEditorElementId || "");
    if (!id || !(this._templateEditorElements || []).some((item) => item.id === id)) return;
    this._pushTemplateHistory();
    this._templateEditorElements = this._templateEditorElements.filter((item) => item.id !== id);
    this._selectedTemplateEditorElementId = "";
    this._templateSaveResult = null;
    this._render();
    this._paint();
  },

  _addTemplateEditorElement(type, icon = "", position = null, preset = {}) {
    const settings = preset && typeof preset === "object" && !Array.isArray(preset) ? preset : {};
    const labels = { text: "Vlastní text", rect: "Obdélník", circle: "Kruh", line: "Čára", icon: "Ikona", button: "Text v rámečku", slider: "Stupnice", chart: "Graf", gauge: "Ukazatel", signal: "Signalizace" };
    this._templateEditorElements ||= [];
    this._pushTemplateHistory();
    const item = this._normalizeTemplateEditorElement({
      ...settings,
      id: `template-element-${Date.now()}-${this._templateEditorElements.length}`,
      type, icon: settings.icon || icon || undefined, label: settings.label || (type === "icon" ? `Ikona ${icon || "star"}` : labels[type] || "Prvek"),
      x: position?.x, y: position?.y,
    });
    // Circular primitives start with an exact visual selection. Users can still
    // resize width and height independently afterwards.
    if (["icon", "circle"].includes(type) || (type === "chart" && item.variant === "donut") || (type === "gauge" && ["ring", "semicircle"].includes(item.variant))) this._fitTemplateElementVisualAspect(item, 1);
    item.x = Math.max(0, Math.min(100 - item.w, Number(position?.x ?? 50) - item.w / 2));
    item.y = Math.max(0, Math.min(100 - item.h, Number(position?.y ?? 50) - item.h / 2));
    this._templateEditorElements.push(item);
    this._selectedTemplateEditorElementId = item.id;
    this._selectedTemplatePart = "";
    this._templateSaveResult = null;
    this._render();
    this._paint();
  },

  _quantizeImportedTemplatePixel(red, green, blue, alpha = 255) {
    if (alpha < 40) return [255, 255, 255, 255];
    // Restore the colour classifier used by the original canvas designer.
    // A nearest-palette calculation turns beige, brown and warm greys red even
    // though the source is not red.  The physical panel has a separate red
    // pigment, so only pixels with a genuinely dominant red channel may use it.
    const redScore = red - Math.max(green, blue);
    const luminance = (38 * red + 75 * green + 15 * blue) >> 7;
    // The extra channel ratios keep skin, beige and warm paper tones out of the
    // red plane while still mapping saturated red, orange and magenta correctly.
    if (redScore > 45 && red > 120 && green < red * 0.68 && blue < red * 0.72) {
      return [220, 20, 12, 255];
    }
    if (luminance < 160) return [0, 0, 0, 255];
    return [255, 255, 255, 255];
  },

  _templateEditorSurfaceRatio() {
    const surface = this.shadowRoot?.querySelector(".display-template-editor-stage .display-template-surface");
    const bounds = surface?.getBoundingClientRect?.();
    if (bounds?.width > 0 && bounds?.height > 0) return bounds.width / bounds.height;
    const size = this._devicePreviewSize?.(this._device?.()) || { width: 296, height: 128 };
    const long = Math.max(1, Number(size.width || 296), Number(size.height || 128));
    const short = Math.max(1, Math.min(Number(size.width || 296), Number(size.height || 128)));
    return this._displayTemplateOrientation === "portrait" ? short / long : long / short;
  },

  _fitTemplateElementVisualAspect(item, visualAspect = 1) {
    const surfaceRatio = Math.max(.05, this._templateEditorSurfaceRatio());
    const aspect = Math.max(.05, Number(visualAspect || 1));
    let width = Math.max(2, Number(item.w || 2));
    let height = Math.max(2, Number(item.h || 2));
    const currentAspect = width * surfaceRatio / height;
    if (currentAspect > aspect) width = height * aspect / surfaceRatio;
    else height = width * surfaceRatio / aspect;
    item.w = Math.round(Math.max(2, Math.min(100, width)) * 100) / 100;
    item.h = Math.round(Math.max(2, Math.min(100, height)) * 100) / 100;
    item.visualAspect = aspect;
    return item;
  },

  _rememberTemplateImageAsset(src, name = "Obrázek", aspect = 1) {
    this._templateImageLibrary ||= [];
    const existing = this._templateImageLibrary.find((asset) => asset.src === src);
    if (existing) return existing;
    const asset = {
      id: `template-library-image-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      name: String(name || "Obrázek"),
      src,
      aspect: Math.max(.05, Number(aspect || 1)),
      created_at: new Date().toISOString(),
    };
    this._templateImageLibrary = [asset, ...this._templateImageLibrary].slice(0, 30);
    return asset;
  },

  _insertTemplateLibraryImage(asset, position = null) {
    if (!asset?.src) return null;
    this._templateEditorElements ||= [];
    this._pushTemplateHistory();
    const aspect = Math.max(.05, Number(asset.aspect || 1));
    const item = this._normalizeTemplateEditorElement({ id: `template-image-${Date.now()}-${this._templateEditorElements.length}`, type: "image", label: asset.name || "Obrázek", src: asset.src });
    item.w = Math.min(55, Math.max(18, aspect >= 1 ? 38 : 26));
    item.h = Math.min(55, Math.max(14, item.w / Math.max(.3, aspect)));
    this._fitTemplateElementVisualAspect(item, aspect);
    item.x = Math.max(0, Math.min(100 - item.w, Number(position?.x ?? 50) - item.w / 2));
    item.y = Math.max(0, Math.min(100 - item.h, Number(position?.y ?? 50) - item.h / 2));
    this._templateEditorElements.push(item);
    this._selectedTemplateEditorElementId = item.id;
    this._templateSaveResult = null;
    this._render();
    this._paint();
    return item;
  },

  _importTemplateEditorImage(file, position = null) {
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
        for (let index = 0; index < pixels.data.length; index += 4) {
          const color = this._quantizeImportedTemplatePixel(
            pixels.data[index], pixels.data[index + 1], pixels.data[index + 2], pixels.data[index + 3]
          );
          [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2], pixels.data[index + 3]] = color;
        }
        context.putImageData(pixels, 0, 0);
        const aspect = canvas.width / Math.max(1, canvas.height);
        const asset = this._rememberTemplateImageAsset(canvas.toDataURL("image/png"), file.name || "Obrázek", aspect);
        this._templateElementPaletteCategory = "";
        this._insertTemplateLibraryImage(asset, position);
        this._saveDisplayTemplateDraft?.().catch(() => {});
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  },

  _templateElementEntityRaw(item) {
    const entityId = String(item?.entityId || "").trim();
    if (!entityId) return undefined;
    const state = this._hass?.states?.[entityId];
    if (!state) return undefined;
    const attribute = String(item.entityAttribute || "").trim();
    return attribute ? state.attributes?.[attribute] : state.state;
  },

  _templateEntityIntervalMs(interval) {
    return { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[interval] || 0;
  },

  _templateEntityIsActive(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return !["", "0", "off", "false", "no", "closed", "unavailable", "unknown", "none", "null"].includes(normalized);
  },

  _refreshTemplateEntityElements(now = Date.now()) {
    let changed = false;
    for (const item of this._templateEditorElements || []) {
      if (!["chart", "gauge", "signal", "slider"].includes(item.type) || !item.entityId) continue;
      const raw = this._templateElementEntityRaw(item);
      if (raw === undefined || raw === null) continue;
      if (item.type === "signal") {
        const active = this._templateEntityIsActive(raw);
        if (item.resolvedActive !== active || item.value !== (active ? 100 : 0)) {
          item.resolvedActive = active; item.value = active ? 100 : 0; changed = true;
        }
        continue;
      }
      const array = Array.isArray(raw) ? raw : typeof raw === "object" && raw ? Object.values(raw) : null;
      if (item.type === "chart" && array) {
        const values = array.map(Number).filter(Number.isFinite).slice(-item.historyLimit);
        if (values.length && JSON.stringify(values) !== JSON.stringify(item.historyValues || [])) {
          item.historyValues = values; item.value = values.at(-1); item.historyUpdatedAt = now; changed = true;
        }
        continue;
      }
      const numeric = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(numeric)) continue;
      if (item.type !== "chart") {
        const next = Math.max(0, Math.min(100, numeric));
        if (item.value !== next) { item.value = next; changed = true; }
        continue;
      }
      item.historyValues = Array.isArray(item.historyValues) ? item.historyValues.map(Number).filter(Number.isFinite) : [];
      const resetMs = this._templateEntityIntervalMs(item.resetInterval);
      const resetAt = Number(item.historyResetAt || item.historyUpdatedAt || now);
      if (resetMs && now - resetAt >= resetMs) {
        item.historyValues = []; item.historyResetAt = now; changed = true;
      } else if (!item.historyResetAt) item.historyResetAt = now;
      const sampleMs = this._templateEntityIntervalMs(item.sampleInterval);
      const last = item.historyValues.at(-1);
      const due = !item.historyValues.length || (sampleMs ? now - Number(item.historyUpdatedAt || 0) >= sampleMs : numeric !== last);
      if (due) {
        item.historyValues = [...item.historyValues, numeric].slice(-item.historyLimit);
        item.historyUpdatedAt = now; changed = true;
      }
      if (item.value !== numeric) { item.value = numeric; changed = true; }
    }
    if (changed && this._rendered) {
      window.clearTimeout(this._templateEntityHistorySaveTimer);
      this._templateEntityHistorySaveTimer = window.setTimeout(() => this._saveDisplayTemplateDraft?.().catch(() => {}), 1200);
    }
    return changed;
  },

  _templateElementSeries(item) {
    const values = (Array.isArray(item?.historyValues) ? item.historyValues : []).map(Number).filter(Number.isFinite).slice(-Math.max(1, Math.min(20, Number(item?.historyLimit || 10))));
    return values.length ? values : [18, 34, 27, 58, 43, 76, Number(item?.value ?? 68)];
  },

  _templateChartNormalizedPoints(item) {
    const values = this._templateElementSeries(item);
    const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(1, max - min);
    return values.map((value, index) => ({ value, x: values.length === 1 ? 50 : 2 + (index / (values.length - 1)) * 96, y: 54 - ((value - min) / span) * 44 }));
  },

  _renderTemplateChartVisual(item) {
    const variant = String(item.variant || "line");
    const names = { line: "Vývoj", area: "Plocha", bar: "Přehled", steps: "Změny", donut: "Podíl", sparkline: "Trend" };
    const label = item.showLabel !== false ? `<small class="eink-component-label">${names[variant] || "Data"}</small>` : "";
    const value = item.showValue !== false ? `<strong class="eink-component-value">${Math.round(item.value)}${item.showPercent !== false ? "<em>%</em>" : ""}</strong>` : "";
    const grid = item.showGrid !== false && variant !== "sparkline" && variant !== "donut" ? `<g class="chart-grid"><path d="M4 12H96M4 30H96M4 48H96"></path></g>` : "";
    const points = this._templateChartNormalizedPoints(item);
    const pointText = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    let svg = "";
    if (variant === "bar") { const barWidth = Math.max(2, Math.min(14, 78 / points.length)); svg = `<svg viewBox="0 0 100 60" preserveAspectRatio="none">${grid}<g class="chart-bars">${points.map((point, index) => `<rect x="${(5 + index * (90 / points.length)).toFixed(2)}" y="${point.y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(56 - point.y).toFixed(2)}"></rect>`).join("")}</g></svg>`; }
    else if (variant === "donut") svg = `<svg class="chart-donut" viewBox="0 0 60 60" preserveAspectRatio="none">${item.showTrack !== false ? `<circle class="donut-track" cx="30" cy="30" r="21"></circle>` : ""}<circle class="donut-value" cx="30" cy="30" r="21" pathLength="100" stroke-dasharray="${Math.max(0, Math.min(100, item.value))} 100"></circle></svg>`;
    else if (variant === "steps") { const steps = points.flatMap((point, index) => index ? [{ x: point.x, y: points[index - 1].y }, point] : [point]); svg = `<svg viewBox="0 0 100 60" preserveAspectRatio="none">${grid}<polyline points="${steps.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}"></polyline></svg>`; }
    else {
      const area = variant === "area" && item.showFill !== false ? `<path class="chart-area" d="M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} ${points.slice(1).map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} L${points.at(-1).x.toFixed(2)} 56 L${points[0].x.toFixed(2)} 56Z"></path>` : "";
      const dots = variant !== "sparkline" && item.showPoints !== false ? `<g class="chart-points">${points.map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2"></circle>`).join("")}</g>` : "";
      svg = `<svg viewBox="0 0 100 60" preserveAspectRatio="none">${grid}${area}<polyline points="${pointText}"></polyline>${dots}</svg>`;
    }
    return `<span class="eink-chart-visual variant-${this._escape(variant)}">${label}${svg}${value}</span>`;
  },

  _renderTemplateProgressVisual(item) {
    const value = item.showValue !== false ? `<strong>${Math.round(item.value)}${item.showPercent !== false ? "<em>%</em>" : ""}</strong>` : "";
    const scale = item.showScale !== false ? `<span class="eink-progress-scale"><b>0</b><b>50</b><b>100</b></span>` : "";
    return `<span class="eink-progress-visual">${value}<span class="template-slider-track ${item.showTrack === false ? "without-track" : ""}"><i></i></span>${scale}</span>`;
  },

  _renderTemplateGaugeVisual(item) {
    const variant = String(item.variant || "ring");
    const names = { battery: "Baterie", thermometer: "Teplota", semicircle: "Rozsah", ring: "Hodnota" };
    const unit = variant === "thermometer" ? "°" : "%";
    const value = item.showValue !== false ? `<span class="eink-gauge-value"><strong>${Math.round(item.value)}</strong>${item.showPercent !== false ? `<em>${unit}</em>` : ""}</span>` : "";
    const label = item.showLabel !== false ? `<small class="eink-component-label">${names[variant] || "Hodnota"}</small>` : "";
    let visual = `<span class="template-gauge-ring ${item.showTrack === false ? "without-track" : ""}" style="--gauge-value:${Math.max(0, Math.min(100, item.value)) * 3.6}deg"></span>`;
    if (variant === "battery") visual = `<span class="template-battery-gauge"><i style="width:${Math.max(4, Math.min(100, item.value))}%"></i></span>`;
    else if (variant === "thermometer") visual = `<span class="template-thermometer-gauge"><i style="height:${Math.max(6, Math.min(100, item.value))}%"></i></span>`;
    else if (variant === "semicircle") visual = `<span class="template-semicircle-gauge"><i style="--gauge-value:${Math.max(0, Math.min(100, item.value)) * 1.8}deg"></i></span>`;
    return `<span class="eink-gauge-visual variant-${this._escape(variant)}">${label}${visual}${value}</span>`;
  },

  _renderTemplateSignalVisual(item) {
    const active = typeof item.resolvedActive === "boolean" ? item.resolvedActive : !["off", "inactive"].includes(String(item.variant || ""));
    const icon = item.showIcon !== false ? `<ha-icon icon="mdi:${this._escape(item.icon || (active ? "check-circle" : "minus-circle-outline"))}"></ha-icon>` : "";
    const label = item.showLabel !== false ? `<span class="eink-signal-label">${this._escape(item.text || item.label || "Stav")}</span>` : "";
    const state = item.showState !== false && ["on", "off"].includes(item.variant) ? `<i><em></em></i>` : item.showState !== false ? `<small>${active ? "ON" : "OFF"}</small>` : "";
    return `<span class="template-signal-visual ${active ? "is-active" : "is-inactive"}">${icon}${label}${state}</span>`;
  },

  _renderTemplateEditorOverlays(template = this._currentUserDisplayTemplate(), targetOrientation = this._displayTemplateOrientation, targetRatio = 0) {
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    const canvasRotation = this._userTemplateCanvasRotationStyle(template, targetOrientation, targetRatio);
    const sourceElements = String(template?.id || "") === String(this._selectedDisplayTemplateId || "")
      ? (this._templateEditorElements || [])
      : (template?.editor_elements || this._templateEditorStates?.[template?.id]?.editor_elements || []);
    return `<div class="template-editor-overlays ${canvasRotation.turn ? "is-whole-canvas-rotated" : ""}" style="${canvasRotation.style}">${sourceElements.map((raw) => {
      const normalized = this._normalizeTemplateEditorElement(raw);
      if (String(template?.id || "") === String(this._selectedDisplayTemplateId || "")) Object.assign(raw, normalized);
      const item = this._orientedUserTemplateElement(normalized, template, targetOrientation);
      const selected = item.id === this._selectedTemplateEditorElementId;
      const style = `left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;transform:rotate(${item.rotation}deg);--element-color:${item.color};--element-fill:${item.fill};--element-stroke:${item.stroke};--element-stroke-width:${item.strokeWidth}px;--element-radius:${item.radius}px;--element-font-size:${item.fontSize}px;--element-font-weight:${item.fontWeight};--element-font-family:${item.fontFamily};--element-font-style:${item.fontStyle};--element-text-decoration:${item.textDecoration};--element-text-outline-width:${item.textOutlineWidth}px;--element-text-outline-color:${item.textOutlineColor};--element-text-border-width:${item.textBorderWidth}px;--element-text-border-color:${item.textBorderColor};--element-overlay-opacity:${item.overlayOpacity}%;--element-text-align:${item.textAlign};--element-value:${Math.max(0, Math.min(100, item.value))}%`;
      let content = "";
      if (item.type === "image") content = `<img src="${item.src}" alt="${this._escape(item.label)}">`;
      else if (["text", "button"].includes(item.type)) content = `<span>${this._escape(item.text || item.label)}</span>`;
      else if (item.type === "icon") content = `<ha-icon icon="mdi:${this._escape(item.icon || "star")}"></ha-icon>`;
      else if (item.type === "slider") content = this._renderTemplateProgressVisual(item);
      else if (item.type === "chart") content = this._renderTemplateChartVisual(item);
      else if (item.type === "gauge") content = this._renderTemplateGaugeVisual(item);
      else if (item.type === "signal") content = this._renderTemplateSignalVisual(item);
      return `<span class="template-overlay template-overlay-${item.type} variant-${this._escape(item.variant || "default")} ${selected ? "is-selected" : ""}" data-template-overlay-id="${this._escape(item.id)}" style="${style}" role="button" tabindex="0" aria-label="${this._escape(item.label)}">${content}${selected ? `<span class="template-overlay-selection">${handles.map((name) => `<i class="template-resize-handle is-${name}" data-template-resize-handle="${name}"></i>`).join("")}</span>` : ""}</span>`;
    }).join("")}</div>`;
  },

  _bindTemplateEditorOverlays() {
    if (this._activeTab !== "display-settings" || this._displaySettingsView !== "designer") return;
    const surfaces = [...this.shadowRoot.querySelectorAll(".display-template-editor-stage .display-template-surface")];
    const pointInSurface = (event, surface) => {
      const box = surface.getBoundingClientRect();
      const targetX = ((event.clientX - box.left) / Math.max(1, box.width)) * 100;
      const targetY = ((event.clientY - box.top) / Math.max(1, box.height)) * 100;
      const surfaceOrientation = surface.classList.contains("format-wide") ? "landscape" : "portrait";
      const turn = this._userTemplateQuarterTurn(this._currentUserDisplayTemplate(), surfaceOrientation);
      if (turn === 1) return { x: targetY, y: 100 - targetX, box };
      if (turn === -1) return { x: 100 - targetY, y: targetX, box };
      return { x: targetX, y: targetY, box };
    };
    this.shadowRoot.querySelectorAll("[data-template-editor-tool]").forEach((button) => {
      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "copy";
        let preset = {};
        try { preset = JSON.parse(button.dataset.templateEditorPreset || "{}"); } catch (_err) { /* Invalid third-party preset. */ }
        event.dataTransfer.setData("application/x-dratek-template-element", JSON.stringify({ type: button.dataset.templateEditorTool, icon: button.dataset.templateEditorIcon || "", preset }));
      });
    });
    surfaces.forEach((surface) => {
      surface.addEventListener("dragover", (event) => {
        if ([...(event.dataTransfer?.types || [])].some((type) => type === "Files" || type === "application/x-dratek-template-element")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          surface.classList.add("is-element-drag-over");
        }
      });
      surface.addEventListener("dragleave", () => surface.classList.remove("is-element-drag-over"));
      surface.addEventListener("drop", (event) => {
        event.preventDefault();
        surface.classList.remove("is-element-drag-over");
        const position = pointInSurface(event, surface);
        const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
        if (file) return this._importTemplateEditorImage(file, position);
        try {
          const payload = JSON.parse(event.dataTransfer.getData("application/x-dratek-template-element") || "{}");
          if (payload.type) this._addTemplateEditorElement(payload.type, payload.icon || "", position, payload.preset || {});
        } catch (_err) { /* Ignore foreign drag data. */ }
      });
      surface.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".template-overlay") || event.target.closest(".template-editable-part")) return;
        if (this._selectedTemplateEditorElementId) {
          this._selectedTemplateEditorElementId = "";
          this._render();
          this._paint();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-template-overlay-id]").forEach((element) => {
      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const id = element.dataset.templateOverlayId;
        const item = (this._templateEditorElements || []).find((entry) => entry.id === id);
        const surface = element.closest(".display-template-surface");
        if (!item || !surface) return;
        const handle = event.target.closest("[data-template-resize-handle]")?.dataset.templateResizeHandle || "";
        this._selectedTemplateEditorElementId = id;
        this._selectedTemplatePart = "";
        const position = pointInSurface(event, surface);
        const viewItem = this._normalizeTemplateEditorElement(item);
        this._templateOverlayDrag = { id, pointerId: event.pointerId, mode: handle ? "resize" : "move", handle, startX: position.x, startY: position.y, origin: { x: viewItem.x, y: viewItem.y, w: viewItem.w, h: viewItem.h }, historyPushed: false };
        element.setPointerCapture?.(event.pointerId);
        if (!element.classList.contains("is-selected")) {
          element.classList.add("is-selected");
          this.shadowRoot.querySelectorAll("[data-template-overlay-id].is-selected").forEach((other) => { if (other !== element) other.classList.remove("is-selected"); });
        }
      });
      element.addEventListener("pointermove", (event) => {
        const drag = this._templateOverlayDrag;
        if (!drag || drag.id !== element.dataset.templateOverlayId || drag.pointerId !== event.pointerId) return;
        const item = (this._templateEditorElements || []).find((entry) => entry.id === drag.id);
        const surface = element.closest(".display-template-surface");
        if (!item || !surface) return;
        if (!drag.historyPushed) {
          this._pushTemplateHistory();
          drag.historyPushed = true;
        }
        const point = pointInSurface(event, surface);
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        let viewItem;
        if (drag.mode === "move") {
          const x = Math.max(0, Math.min(100 - drag.origin.w, drag.origin.x + dx));
          const y = Math.max(0, Math.min(100 - drag.origin.h, drag.origin.y + dy));
          viewItem = { ...this._normalizeTemplateEditorElement(item), x, y, w: drag.origin.w, h: drag.origin.h };
        } else {
          let { x, y, w, h } = drag.origin;
          if (drag.handle.includes("w")) { x += dx; w -= dx; }
          if (drag.handle.includes("e")) w += dx;
          if (drag.handle.includes("n")) { y += dy; h -= dy; }
          if (drag.handle.includes("s")) h += dy;
          if (w < 2) { if (drag.handle.includes("w")) x -= 2 - w; w = 2; }
          if (h < 2) { if (drag.handle.includes("n")) y -= 2 - h; h = 2; }
          x = Math.max(0, Math.min(98, x)); y = Math.max(0, Math.min(98, y));
          w = Math.max(2, Math.min(100 - x, w)); h = Math.max(2, Math.min(100 - y, h));
          viewItem = { ...this._normalizeTemplateEditorElement(item), x, y, w, h };
        }
        Object.assign(item, { x: viewItem.x, y: viewItem.y, w: viewItem.w, h: viewItem.h });
        element.style.left = `${viewItem.x}%`; element.style.top = `${viewItem.y}%`; element.style.width = `${viewItem.w}%`; element.style.height = `${viewItem.h}%`;
      });
      const finish = (event) => {
        const drag = this._templateOverlayDrag;
        if (!drag || drag.id !== element.dataset.templateOverlayId || drag.pointerId !== event.pointerId) return;
        this._templateOverlayDrag = null;
        element.releasePointerCapture?.(event.pointerId);
        this._templateSaveResult = null;
        this._render(); this._paint();
      };
      element.addEventListener("pointerup", finish);
      element.addEventListener("pointercancel", finish);
      element.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault(); this._selectedTemplateEditorElementId = element.dataset.templateOverlayId; this._render(); this._paint();
      });
    });
  },

  // --------------------------------------------------- template switches ---

  // Some templates carry a state that is a decision rather than a reading: a price
  // tag is on promotion because someone says so, not because a sensor changed. Such
  // a switch can still be driven by an entity - a helper toggle, a binary sensor
  // from the till system - so the manual switch and the bound entity are ORed: the
  // shop can flip it by hand today and automate it tomorrow without rebuilding.
  _templateOptionActive(template, option) {
    const device = (typeof this._device === "function" ? this._device() : null);
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const draftOptions = this._deviceDrafts?.[address]?.options;
    if (draftOptions && typeof draftOptions[option] === "boolean") {
      return draftOptions[option];
    }
    if (this._displayTemplateOptions?.[`${template?.id}:${option}`] !== undefined) {
      return !!this._displayTemplateOptions[`${template?.id}:${option}`];
    }
    const entity = this._templateEntityForKind(template, [option]);
    const state = entity ? this._hass?.states?.[entity] : null;
    return ["on", "true", "1", "akce", "sale"].includes(String(state?.state ?? "").toLowerCase());
  },

  _renderTemplateOptionSettings(template) {
    const options = template?.options || [];
    if (!options.length) return "";
    return `<div class="template-option-settings">${options.map(([option, label, help]) => {
      const active = !!this._displayTemplateOptions?.[`${template.id}:${option}`];
      const bound = this._templateEntityForKind(template, [option]);
      return `<label class="template-option-switch ${active ? "is-active" : ""}">
        <input type="checkbox" data-template-option="${this._escape(`${template.id}:${option}`)}" ${active ? "checked" : ""}>
        <span><strong>${this._escape(label)}</strong><small>${this._escape(help)}${bound ? ` Řídí i entita ${bound}.` : ""}</small></span>
      </label>`;
    }).join("")}</div>`;
  },

  // ------------------------------------------------------- live template data ---

  // Home Assistant stopped publishing forecasts as a weather attribute in 2024.4;
  // they come from the weather.get_forecasts service now, which is why the forecast
  // row of the weather template had been showing sample data on every install since.
  // Rendering is synchronous, so the fetch fills a cache and asks for a repaint when
  // it lands - the same shape the icon warm-up uses.
  _templateForecast(entityId) {
    if (!entityId || !this._hass?.callService) return null;
    this._templateForecastCache ||= new Map();
    if (this._templateForecastCache.has(entityId)) return this._templateForecastCache.get(entityId);
    this._templateForecastCache.set(entityId, null);
    Promise.resolve()
      .then(() => this._hass.callService("weather", "get_forecasts", { type: "daily" }, { entity_id: entityId }, false, true))
      .then((result) => {
        const forecast = result?.response?.[entityId]?.forecast;
        if (Array.isArray(forecast) && forecast.length) {
          this._templateForecastCache.set(entityId, forecast);
          this._scheduleTemplateDataRepaint();
        }
      })
      .catch(() => {
        // An installation too old for response data, or a weather integration
        // without a daily forecast. The sample row stays, which is honest.
      });
    return null;
  },

  _templateCalendarEvents(entityId) {
    if (!entityId || !this._hass?.callService) return null;
    this._templateCalendarCache ||= new Map();
    if (this._templateCalendarCache.has(entityId)) return this._templateCalendarCache.get(entityId);
    this._templateCalendarCache.set(entityId, null);
    Promise.resolve()
      // A duration avoids formatting a local timestamp by hand, which is the part
      // of calendar.get_events that goes wrong across time zones.
      .then(() => this._hass.callService("calendar", "get_events", { duration: { days: 21 } }, { entity_id: entityId }, false, true))
      .then((result) => {
        const events = result?.response?.[entityId]?.events;
        if (Array.isArray(events)) {
          this._templateCalendarCache.set(entityId, events);
          this._scheduleTemplateDataRepaint();
        }
      })
      .catch(() => {});
    return null;
  },

  // Both fetches land independently; coalescing the repaint keeps a template with a
  // forecast and a calendar from redrawing the whole panel twice.
  _scheduleTemplateDataRepaint() {
    if (this._templateDataRepaintPending) return;
    this._templateDataRepaintPending = true;
    setTimeout(() => {
      this._templateDataRepaintPending = false;
      this._render();
      this._paint();
    }, 0);
  },

  // The entity bound to the first slot of a template that asks for one of `kinds`.
  _templateEntityForKind(template, kinds) {
    const variables = template?.variables || [];
    for (let index = 0; index < variables.length; index++) {
      const meta = this._templateVariableMeta(variables[index], index);
      if (!kinds.includes(this._templateSlotKind(meta.label, meta.icon))) continue;
      const binding = this._templateBinding(template, meta);
      if (binding && !binding.startsWith("internal:")) return binding;
    }
    return "";
  },

  _weatherConditionIcon(condition) {
    return {
      "clear-night": "weather-night",
      cloudy: "weather-cloudy",
      exceptional: "alert-circle-outline",
      fog: "weather-fog",
      hail: "weather-hail",
      lightning: "weather-lightning",
      "lightning-rainy": "weather-lightning-rainy",
      partlycloudy: "weather-partly-cloudy",
      pouring: "weather-pouring",
      rainy: "weather-rainy",
      snowy: "weather-snowy",
      "snowy-rainy": "weather-snowy-rainy",
      sunny: "weather-sunny",
      windy: "weather-windy",
      "windy-variant": "weather-windy",
    }[String(condition || "")] || "";
  },

  _weatherConditionLabel(condition) {
    return {
      "clear-night": "Jasná noc",
      cloudy: "Zataženo",
      exceptional: "Výjimečné",
      fog: "Mlha",
      hail: "Krupobití",
      lightning: "Bouřky",
      "lightning-rainy": "Bouřky s deštěm",
      partlycloudy: "Polojasno",
      pouring: "Vydatný déšť",
      rainy: "Déšť",
      snowy: "Sněžení",
      "snowy-rainy": "Déšť se sněhem",
      sunny: "Jasno",
      windy: "Větrno",
      "windy-variant": "Větrno",
    }[String(condition || "")] || "";
  },

  // One column of the forecast strip. Falls back to the sample day so the template
  // still reads as a weather template before the service call returns.
  _templateForecastDay(template, index) {
    const sample = [
      { label: "PÁ", icon: "weather-partly-cloudy", value: "22°" },
      { label: "SO", icon: "weather-sunny", value: "25°" },
      { label: "NE", icon: "weather-rainy", value: "18°" },
      { label: "PO", icon: "weather-cloudy", value: "20°" },
    ][index] || { label: "", icon: "", value: "" };
    const forecast = this._templateForecast(this._templateEntityForKind(template, ["forecast", "weather"]));
    const entry = Array.isArray(forecast) ? forecast[index] : null;
    if (!entry) return sample;
    const date = new Date(entry.datetime);
    const temperature = Number(entry.temperature);
    return {
      label: Number.isNaN(date.getTime())
        ? sample.label
        : new Intl.DateTimeFormat("cs-CZ", { weekday: "short" }).format(date).replace(/\./g, "").toLocaleUpperCase("cs"),
      icon: this._weatherConditionIcon(entry.condition) || sample.icon,
      value: Number.isFinite(temperature) ? `${Math.round(temperature)}°` : sample.value,
    };
  },

  // One entry of the calendar template: a boxed date beside what is happening.
  _templateCalendarEntry(template, index) {
    const samples = [
      { day: "23", month: "KVĚ", title: "Schůzka", detail: "15:00 · kancelář" },
      { day: "24", month: "KVĚ", title: "Narozeniny", detail: "Tomáš · celý den" },
    ];
    const sample = samples[index] || samples[0];
    const events = this._templateCalendarEvents(this._templateEntityForKind(template, ["calendar"]));
    const event = Array.isArray(events) ? events[index] : null;
    if (!event) return sample;
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) return { ...sample, title: event.summary || sample.title };
    const allDay = !String(event.start).includes("T");
    const time = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(start);
    return {
      day: String(start.getDate()),
      month: new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(start).replace(/\./g, "").slice(0, 3).toLocaleUpperCase("cs"),
      title: event.summary || sample.title,
      detail: [allDay ? "celý den" : time, event.location].filter(Boolean).join(" · "),
    };
  },

  // States that are words rather than numbers. Left raw they reach the panel in
  // English - a presence template that prints "not_home" is not a finished feature.
  _templateStateWords(entityId, state, kind) {
    const domain = String(entityId || "").split(".")[0];
    const value = String(state?.state ?? "").toLowerCase();
    const deviceClass = String(state?.attributes?.device_class || "");
    if (domain === "weather") return this._weatherConditionLabel(value);
    if (domain === "person" || domain === "device_tracker") {
      // A person's own name is never their entity's *state* (that's always
      // home/not_home/a zone) - a name-seeking slot has to read friendly_name.
      if (kind === "person_name") return String(state?.attributes?.friendly_name || "");
      if (value === "home") return "Doma";
      if (value === "not_home") return "Pryč";
      return state?.state ? String(state.state) : "";
    }
    if (domain === "lock") return value === "locked" ? "Zamčeno" : value === "unlocked" ? "Odemčeno" : "";
    if (domain === "light" || domain === "switch") return value === "on" ? "Zapnuto" : value === "off" ? "Vypnuto" : "";
    if (domain === "alarm_control_panel") {
      return { disarmed: "Vypnuto", armed_home: "Doma", armed_away: "Mimo dům", armed_night: "Noc", arming: "Aktivuji", pending: "Čekám", triggered: "POPLACH" }[value] || "";
    }
    if (domain === "binary_sensor") {
      const on = value === "on";
      if (["door", "garage_door", "opening"].includes(deviceClass) || kind === "door") return on ? "Otevřeno" : "Zavřeno";
      if (["window"].includes(deviceClass) || kind === "window") return on ? "Otevřeno" : "Zavřeno";
      if (["motion", "occupancy", "presence"].includes(deviceClass) || kind === "motion") return on ? "Pohyb" : "Klid";
      if (["moisture"].includes(deviceClass)) return on ? "Vlhko" : "Sucho";
      return on ? "Ano" : "Ne";
    }
    return "";
  },

  _templateDisplayValue(template, variableIndex, fallback = "") {
    const variable = template?.variables?.[variableIndex];
    if (!variable) return fallback;
    const meta = this._templateVariableMeta(variable, variableIndex);
    const binding = this._templateBinding(template, meta);
    if (!binding) return fallback;
    if (!binding.includes(".") && !binding.startsWith("internal:")) {
      return binding;
    }
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
    const kind = this._templateSlotKind(meta.label, meta.icon);
    const weatherState = String(binding || "").startsWith("weather.");
    const weatherAttributes = state?.attributes || {};
    const climateState = String(binding || "").startsWith("climate.");
    let raw = state?.state;
    let forcedUnit = "";
    if (template?.id === "cz_spot_prices" && variableIndex === 5 && Number.isFinite(Number(raw))) {
      const intervals = this._czSpotIntervalCount(binding, state);
      return `${Math.round(Number(raw))} / ${intervals}`;
    }
    if (weatherState && normalized.includes("teplot")) {
      raw = weatherAttributes.temperature;
      forcedUnit = weatherAttributes.temperature_unit || "°C";
    } else if (climateState && kind === "temperature") {
      // A climate.* entity's own `state` is its HVAC mode ("heat", "off", ...),
      // never a number - "Cílová teplota" needs the `temperature` attribute
      // (the setpoint), "Teplota" needs `current_temperature` (what the
      // thermostat is actually reading right now). Neither is the raw state.
      raw = normalized.includes("cil")
        ? state?.attributes?.temperature
        : state?.attributes?.current_temperature;
      forcedUnit = state?.attributes?.temperature_unit || "°C";
    } else if (climateState && normalized.includes("vykon")) {
      // hvac_action is what the thermostat is doing right now (heating/idle/
      // off/...) - a much more useful "Výkon topení" than the HVAC *mode*
      // (heat/auto/off) the bare state would otherwise return.
      const action = String(state?.attributes?.hvac_action || "").toLowerCase();
      return { heating: "Topí", idle: "Klid", off: "Vypnuto", cooling: "Chladí", drying: "Vysouší", fan: "Ventilace" }[action] || fallback;
    } else if (kind === "forecast") {
      // The service-backed forecast, not the attribute Home Assistant removed.
      const tomorrow = this._templateForecast(binding)?.[1];
      const high = Number(tomorrow?.temperature);
      const low = Number(tomorrow?.templow);
      raw = Number.isFinite(high)
        ? `${Math.round(high)}° / ${Number.isFinite(low) ? Math.round(low) : "-"}°`
        : undefined;
    } else if (kind === "calendar") {
      raw = this._templateCalendarEvents(binding)?.[0]?.summary;
    } else {
      const words = this._templateStateWords(binding, state, kind);
      if (words) return words;
    }
    if (raw === undefined || raw === null || ["", "unknown", "unavailable"].includes(String(raw).toLowerCase())) return fallback;
    const unit = String(forcedUnit || state?.attributes?.unit_of_measurement || "").trim();
    const numeric = Number(raw);
    const text = Number.isFinite(numeric)
      ? new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(numeric)
      : String(raw);
    return unit && !String(text).toLowerCase().endsWith(unit.toLowerCase()) ? `${text} ${unit}` : text;
  },

  _czSpotIntervalCount(binding, state) {
    if (/15min/i.test(String(binding || ""))) return 96;
    const timestamps = Object.keys(state?.attributes || {})
      .map((key) => Date.parse(key))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    const gaps = timestamps.slice(1)
      .map((value, index) => (value - timestamps[index]) / 60000)
      .filter((minutes) => minutes > 0 && minutes <= 120)
      .sort((left, right) => left - right);
    const typicalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60;
    return typicalGap < 45 ? 96 : 24;
  },

  _templateSeries(template, variableIndex, fallback) {
    const variable = template?.variables?.[variableIndex];
    if (!variable) return fallback;
    const meta = this._templateVariableMeta(variable, variableIndex);
    const binding = this._templateBinding(template, meta);
    if (!binding || binding.startsWith("internal:")) return fallback;
    const state = this._hass?.states?.[binding];
    if (!state) return fallback;
    const timestampPrices = Object.fromEntries(Object.entries(state.attributes || {}).filter(([key, value]) => !Number.isNaN(Date.parse(key)) && Number.isFinite(Number(value))));
    if (template?.id === "cz_spot_prices") {
      const entries = Object.entries(timestampPrices).sort(([left], [right]) => Date.parse(left) - Date.parse(right));
      const intervalCount = this._czSpotIntervalCount(binding, state);
      const today = new Date();
      const sameLocalDay = (value) => {
        const date = new Date(value);
        return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
      };
      const todayPrices = entries.filter(([timestamp]) => sameLocalDay(timestamp)).map(([, value]) => Number(value)).filter(Number.isFinite);
      if (todayPrices.length > 1) return todayPrices.slice(0, intervalCount);
      const allPrices = entries.map(([, value]) => Number(value)).filter(Number.isFinite);
      // The integration exposes today and, after noon, tomorrow in the same
      // attribute dictionary. If the browser timezone prevents matching the
      // local day, the first complete interval set is still today's data.
      if (allPrices.length > 1) return allPrices.slice(0, intervalCount);
    }
    const candidates = [timestampPrices, state.attributes?.values, state.attributes?.prices, state.attributes?.data, state.attributes?.history, state.state];
    for (const candidate of candidates) {
      let value = candidate;
      if (typeof value === "string") {
        try { value = JSON.parse(value); } catch (_err) { value = value.split(/[;,\s]+/); }
      }
      if (value && !Array.isArray(value) && typeof value === "object") value = Object.values(value);
      if (!Array.isArray(value)) continue;
      const numbers = value.map((item) => Number(typeof item === "object" ? item.value ?? item.price ?? item.state : item)).filter(Number.isFinite);
      if (numbers.length > 1) return numbers.slice(-96);
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
    // Word-bounded, not a bare substring test: "čas" as a plain .includes()
    // also matches inside "počasí" ("po-ČAS-í"), which silently turned
    // weather.js's "Stav počasí" into an internal/automatic slot - it could
    // never be bound to an entity at all and always showed its static
    // design-time fallback text, in a manual send as much as an automatic
    // refresh.
    const paddedLabel = ` ${normalized} `;
    const automatic = ["čas", "datum", "aktualizace", "cenový interval"].some((part) => paddedLabel.includes(` ${part} `));
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

  // What a template slot is actually asking for, independent of how its label reads.
  // Matching on label text alone picked the wrong entity constantly - "Teplota"
  // matched anything containing "teplo", the heating switch included - because a
  // name is a description while a device_class is a declaration.
  _templateSlotKind(label, icon = "") {
    const text = `${label} ${icon}`.toLocaleLowerCase("cs");
    const has = (...needles) => needles.some((needle) => text.includes(needle));
    if (has("akce", "sleva")) return "sale";
    if (has("název zboží", "zboží")) return "product";
    if (has("původní cena")) return "monetary";
    if (has("jednotková cena")) return "monetary";
    if (has("kód")) return "barcode";
    if (has("skladem", "zásob")) return "stock";
    if (has("předpově")) return "forecast";
    if (has("počas")) return "weather";
    if (has("narozenin")) return "nameday";
    if (has("událost", "kalend")) return "calendar";
    if (has("svátek")) return "nameday";
    // A person.*/device_tracker.* entity's *state* is always "home"/"not_home" -
    // never a name - so a slot asking for a name ("Osoby", "Jméno") and one
    // asking for a status ("Přítomnost", "Stav osoby") need different kinds:
    // only the status kind should read the entity's state, the name kind has
    // to read its friendly_name instead (see _templateStateWords).
    if (has("jméno")) return "person_name";
    if (has("osob") && !has("stav")) return "person_name";
    if (has("osob", "přítom")) return "person_status";
    if (has("teplot", "termostat")) return "temperature";
    if (has("vlhkost")) return "humidity";
    // "Úspora CO₂" (solar's cumulative kilograms saved) is a completely
    // different physical quantity from a device_class carbon_dioxide sensor
    // (a live ppm air-quality reading) despite sharing the words "CO₂" - a
    // plain sensor is the honest target, not a demand for a ppm sensor.
    if (has("úspora")) return "generic";
    if (has("co₂", "co2")) return "carbon_dioxide";
    if (has("pm2", "aqi", "kvalit")) return "air_quality";
    if (has("bateri")) return "battery";
    if (has("signál")) return "signal_strength";
    if (has("cena", "tarif", "minimum")) return "monetary";
    if (has("výkon")) return "power";
    // "výrob" alone (solar's "Výroba …"), not "spotřeb" - that word is shared
    // with the water template's "Spotřeba vody …" labels below, and checking
    // it here first used to steal that match before "vod" ever got a turn.
    if (has("výrob")) return "energy";
    // "Další zálivka" (garden's *next scheduled watering time*) used to also
    // match here via a "zálivk" keyword - but that is a schedule, not a water
    // *consumption* reading, so it needs a timestamp/duration sensor instead
    // (matched separately below with the rest of the "next X" slots).
    if (has("vod")) return "water";
    if (has("svoz", "odpad", "popelnic")) return "waste";
    if (has("zastáv", "odjezd", "link", "spoj")) return "transport";
    if (has("vzdálenost")) return "distance";
    if (has("vít")) return "wind_speed";
    if (has("světl")) return "light";
    if (has("zám")) return "lock";
    if (has("dveř")) return "door";
    if (has("okn")) return "window";
    if (has("pohyb")) return "motion";
    if (has("alarm", "režim")) return "alarm";
    if (has("zásilk", "sledovac", "doruč")) return "shipment";
    // "Položky"/"Splněné" bind one item's *name text* (see shopping.js's
    // design - a checklist row's label), not a reference to a whole todo
    // list - a todo.* entity's own state is a number (items left), which
    // would show as the item's name if suggested here. A "remaining count"
    // wording is the one case that really does want the list entity itself.
    // The full phrase "počet zbývajících", not a bare "zbývaj" stem: that stem
    // is also the start of washer's "Zbývající čas" and must still fall through
    // to the timestamp check below rather than be caught here.
    if (has("počet zbývajících")) return "todo_count";
    if (has("položk", "splněn", "seznam")) return "todo_item";
    if (has("program")) return "program";
    if (has("věk", "číslo")) return "generic";
    // Requires the full "zbývající čas" phrase, not the bare "zbývaj" stem -
    // that stem alone also shows up in the shopping template's "Počet
    // zbývajících" (a remaining-items count, not a duration), which used to
    // get misclassified as a timestamp/duration sensor because of it.
    // "zálivk" (garden's "Další zálivka") belongs here too - see the comment
    // by the water kind above for why it moved.
    if (has("zbývající čas", "dokonč", "změn", "zálivk")) return "timestamp";
    return "generic";
  },

  // Domains and device classes each kind accepts. A declared device_class outranks
  // any keyword match in the score below, which is what makes the binding reliable
  // on an installation whose entities are not named in Czech.
  _templateSlotTargets(kind) {
    const targets = {
      forecast: { domains: ["weather"] },
      weather: { domains: ["weather"] },
      radar: { domains: ["camera", "sensor"] },
      camera: { domains: ["camera", "sensor"] },

      calendar: { domains: ["calendar"] },
      person_name: { domains: ["person", "device_tracker"] },
      person_status: { domains: ["person", "device_tracker"] },
      temperature: { domains: ["sensor", "climate"], classes: ["temperature"] },
      humidity: { domains: ["sensor"], classes: ["humidity", "moisture"] },
      carbon_dioxide: { domains: ["sensor"], classes: ["carbon_dioxide"] },
      air_quality: { domains: ["sensor"], classes: ["aqi", "pm25"] },
      battery: { domains: ["sensor"], classes: ["battery"] },
      signal_strength: { domains: ["sensor"], classes: ["signal_strength"] },
      monetary: { domains: ["sensor"], classes: ["monetary"], units: ["kč", "czk", "eur", "/kwh"] },
      power: { domains: ["sensor"], classes: ["power"], units: ["kw", "w"] },
      energy: { domains: ["sensor"], classes: ["energy"], units: ["kwh", "wh", "mwh"] },
      water: { domains: ["sensor"], classes: ["water"], units: ["l", "m³"] },
      // Neither has a dedicated device_class - waste collection and transit
      // departures almost always come from a community integration, most
      // commonly exposed as a plain sensor (or a calendar entity for waste
      // schedules), so keyword matching against the entity id/name carries
      // more of the score here than for classes above.
      waste: { domains: ["calendar", "sensor"] },
      transport: { domains: ["sensor"] },
      distance: { domains: ["sensor"], classes: ["distance"] },
      wind_speed: { domains: ["sensor"], classes: ["wind_speed"] },
      light: { domains: ["light", "switch"] },
      lock: { domains: ["lock"] },
      door: { domains: ["binary_sensor", "cover"], classes: ["door", "garage_door", "opening"] },
      window: { domains: ["binary_sensor", "cover"], classes: ["window", "opening"] },
      motion: { domains: ["binary_sensor"], classes: ["motion", "occupancy", "presence"] },
      alarm: { domains: ["alarm_control_panel"] },
      // A todo.* list entity's own state is a number (items left) - the right
      // fit for a "how many remain" slot, but the wrong fit for a slot that
      // wants one item's name as text.
      todo_item: { domains: ["input_text", "sensor"] },
      todo_count: { domains: ["todo", "sensor", "input_number"] },
      program: { domains: ["sensor", "select", "vacuum", "humidifier"] },
      timestamp: { domains: ["sensor", "input_datetime"], classes: ["timestamp", "duration"] },
      shipment: { domains: ["sensor"] },
      nameday: { domains: ["sensor", "calendar"] },
      // A promotion is a decision, so the entity that carries it is a helper the
      // shop can flip - or a binary sensor fed by the till system.
      sale: { domains: ["input_boolean", "binary_sensor", "switch"] },
      product: { domains: ["input_text", "sensor"] },
      barcode: { domains: ["input_text", "sensor"] },
      stock: { domains: ["sensor", "input_number"] },
      generic: { domains: ["sensor", "binary_sensor", "input_number", "input_text"] },
    };
    return targets[kind] || targets.generic;
  },

  _suggestTemplateEntity(meta) {
    const states = this._hass?.states || {};
    const entries = Object.entries(states);
    if (!entries.length) return "";
    const kind = this._templateSlotKind(meta.label, meta.icon);
    const { domains = [], classes = [], units = [] } = this._templateSlotTargets(kind);
    const strip = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const keywords = strip(meta.label).split(/\s+/).filter((word) => word.length > 2);
    const scored = entries.map(([entityId, state]) => {
      const domain = entityId.split(".")[0];
      const attributes = state?.attributes || {};
      let score = 0;
      if (domains.includes(domain)) score += 6;
      if (classes.length && classes.includes(String(attributes.device_class || ""))) score += 10;
      if (units.length && units.some((unit) => strip(attributes.unit_of_measurement).includes(strip(unit)))) score += 4;
      score += keywords.reduce((sum, word) => sum + (strip(`${entityId} ${attributes.friendly_name || ""}`).includes(word) ? 3 : 0), 0);
      if ([attributes.values, attributes.prices, attributes.data, attributes.history].some(Array.isArray)) score += 2;
      // An unavailable entity renders as its fallback anyway, so anything live is
      // a better binding than one that will show nothing.
      if (["unavailable", "unknown"].includes(String(state?.state).toLowerCase())) score -= 5;
      return { entityId, score };
    }).sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId));
    return scored[0]?.score >= 6 ? scored[0].entityId : "";
  },

  _templateBinding(template, meta) {
    const overrideKey = `${template?.id}:${meta.key}`;
    if (Object.prototype.hasOwnProperty.call(this._templateAutomationBindingOverrides || {}, overrideKey)) {
      return this._templateAutomationBindingOverrides[overrideKey];
    }
    const device = (typeof this._device === "function" ? this._device() : null);
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const draftBindings = this._deviceDrafts?.[address]?.bindings || {};
    if (draftBindings[meta.key] !== undefined) return draftBindings[meta.key];
    if (draftBindings[`${template?.id}:${meta.key}`] !== undefined) return draftBindings[`${template?.id}:${meta.key}`];

    const key = `${template?.id}:${meta.key}`;
    if (Object.prototype.hasOwnProperty.call(this._displayTemplateBindings || {}, key)) {
      const stored = this._displayTemplateBindings[key];
      if (template?.id !== "cz_spot_prices" || !stored || this._hass?.states?.[stored]) return stored;
      // Entity ids can change when the integration is recreated or translated.
      // A stale saved id must not permanently suppress fresh auto-discovery.
    }
    if (template?.id === "cz_spot_prices") {
      const index = Number(String(meta.key || "").split("-", 1)[0]);
      return this._czSpotTemplateBindings()[index] || "";
    }
    return meta.automatic ? `internal:${meta.key}` : this._suggestTemplateEntity(meta);
  },

  _renderTemplateVariableSetting(template, variable, index) {
    const meta = this._templateVariableMeta(variable, index);
    const binding = this._templateBinding(template, meta);
    const sample = this._templateSampleValue(meta.label);
    return `<section class="template-variable-setting ${meta.automatic ? "is-automatic" : ""}">
      <div class="template-variable-preview ${meta.automatic ? "is-automatic" : ""}" aria-label="Náhled proměnné ${this._escape(meta.label)}">
        <ha-icon icon="mdi:${meta.icon}"></ha-icon><strong>${this._escape(sample)}</strong><small>${this._escape(meta.label)}</small>
      </div>
      <div class="template-variable-setting-content">
        <div class="template-variable-setting-head"><div><strong>${this._escape(meta.label)}</strong><small>${this._escape(meta.description)}</small></div></div>
        ${meta.automatic
          ? `<div class="template-internal-value"><ha-icon icon="mdi:home-assistant"></ha-icon><span><strong>Automaticky z Home Assistantu</strong><small>Interní systémová proměnná</small></span><ha-icon icon="mdi:check-circle"></ha-icon></div>`
          : `<ha-selector data-template-entity-picker="${this._escape(`${template.id}:${meta.key}`)}" data-template-default-entity="${this._escape(binding)}"></ha-selector>
             <small class="template-picker-help">Vyberte senzor, pomocníka nebo jinou entitu odpovídající tomuto údaji.</small>`}
      </div>
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

  _renderDisplayTemplateSurface(template, format, primary = false, slot = "primary", fillDisplay = false, templateSize = "small", autoFit = false, slotWidth = 0, slotHeight = 0) {
    const orientation = format === "wide" ? "landscape" : "portrait";
    // Lay the preview out at the panel's own pixel size whenever it is known.
    // _layoutTemplateSvg derives padding and font sizes from these numbers, so
    // guessing them means the preview shrinks text differently than the panel.
    const nativeWidth = Math.round(Number(slotWidth) || 0);
    const nativeHeight = Math.round(Number(slotHeight) || 0);
    const templateWidth = nativeWidth > 0 ? nativeWidth : (orientation === "landscape" ? 296 : 150);
    const templateHeight = nativeHeight > 0 ? nativeHeight : (orientation === "landscape" ? 150 : 296);
    const placement = this._templateCanvasPlacements?.[slot] || { x: 9, y: 9 };
    const placementX = fillDisplay ? Math.max(0, Math.min(4, Number(placement.x || 0))) : Number(placement.x || 0);
    const placementY = fillDisplay ? Math.max(0, Math.min(4, Number(placement.y || 0))) : Number(placement.y || 0);
    const selected = !autoFit && !fillDisplay && this._selectedTemplateCanvasSlot === slot;
    // A template that covers the whole panel has nowhere to be moved to, so it
    // is drawn edge to edge and offers neither the drag handle nor the outline.
    const fullBleed = fillDisplay && !autoFit;
    const placeable = !autoFit && !fullBleed;
    return `<div class="template-display-slot" data-template-display-slot="${slot}">
      <div class="display-template-surface template-canvas-item size-${templateSize === "large" ? "large" : "small"} format-${format === "wide" ? "wide" : "narrow"} is-${orientation} ${selected ? "is-selected" : ""} ${autoFit ? "is-auto-fit" : ""} ${fullBleed ? "is-full-bleed" : ""}" data-preview-template="${template.id}" data-template-canvas-slot="${slot}" ${placeable ? `tabindex="0" role="button" aria-label="Šablona ${this._escape(template.title)}. Kliknutím vyberte a tažením přesuňte."` : ""} style="--template-item-x:${placementX}%;--template-item-y:${placementY}%">
        <svg class="template-responsive-preview" viewBox="0 0 ${templateWidth} ${templateHeight}" preserveAspectRatio="${fillDisplay ? "none" : "xMidYMid meet"}" aria-hidden="true">
          <foreignObject x="0" y="0" width="${templateWidth}" height="${templateHeight}">
            <div xmlns="http://www.w3.org/1999/xhtml" class="template-responsive-preview-body">${this._templateSvgPreviewBody(template, templateWidth, templateHeight)}</div>
          </foreignObject>
        </svg>
        ${primary && (!autoFit || template.user_created) ? this._renderTemplateEditorOverlays(template, orientation, templateWidth / Math.max(1, templateHeight)) : ""}
        ${placeable ? `<span class="template-canvas-selection-label">${this._escape(template.title)}</span>` : ""}
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
