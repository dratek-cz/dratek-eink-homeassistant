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
      ${this._renderDisplayTemplateConflictDialog(device)}
      ${this._renderDisplayTemplateSetupDialog()}
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
    const helper = (kind, why) => ({ name: `Pomocník typu ${kind}`, domain: kind === "text" ? "input_text" : kind === "číslo" ? "input_number" : kind === "spínač" ? "input_boolean" : "input_datetime", why, core: true, helper: true });
    return {
      weather: {
        summary: "Aktuální teplota, stav počasí a čtyřdenní předpověď.",
        integrations: [
          { name: "Met.no", domain: "weather", core: true, why: "Dodá entitu weather.* s předpovědí. V Home Assistantu bývá už po instalaci." },
          { name: "OpenWeatherMap", domain: "weather", core: true, why: "Alternativa, pokud chcete jiný zdroj předpovědi." },
        ],
        steps: [
          "Zkontrolujte, že v Nastavení → Zařízení a služby máte integraci počasí.",
          "Přetáhněte šablonu na náhled displeje; entita weather.* se najde sama.",
          "Předpověď se načítá službou weather.get_forecasts – integrace ji musí podporovat, jinak zůstanou ukázkové dny.",
        ],
      },
      energy: {
        summary: "Aktuální cena elektřiny a průběh ceny během dne.",
        integrations: [
          { name: "Integrace spotových cen elektřiny", domain: "sensor", why: "Dodá senzor s aktuální cenou. Většina těchto integrací se instaluje přes HACS." },
        ],
        steps: [
          "Nainstalujte integraci, která poskytuje senzor s cenou elektřiny.",
          "V Nastavit vyberte u údaje Aktuální cena tento senzor.",
          "Sloupcový graf se vykreslí, pokud má senzor atribut s polem cen na celý den; jinak zůstane ukázkový průběh.",
        ],
      },
      home: {
        summary: "Teplota, vlhkost, světla a zámky v jedné dlaždicové přehledce.",
        integrations: [
          { name: "Senzory teploty a vlhkosti", domain: "sensor", why: "Cokoli s device_class temperature a humidity – Zigbee, ESPHome, Bluetooth." },
          { name: "Světla a zámky", domain: "light", why: "Entity light.* a lock.*, které chcete na štítku sledovat." },
        ],
        steps: [
          "Přetáhněte šablonu na displej; senzory se přiřadí podle svého device_class.",
          "V Nastavit zkontrolujte, že u každé dlaždice sedí správná místnost.",
        ],
      },
      waste: {
        summary: "Nejbližší dva svozy odpadu a jejich druh.",
        integrations: [
          { name: "Integrace svozu odpadu", domain: "sensor", why: "Obvykle z HACS podle obce. Dodá senzor s datem nejbližšího svozu." },
          helper("datum", "Pokud integrace pro vaši obec neexistuje, zadejte termíny ručně."),
        ],
        steps: [
          "Nainstalujte integraci svozu pro svou obec, nebo si vytvořte pomocníky typu datum.",
          "V Nastavit přiřaďte první a druhý svoz.",
        ],
      },
      solar: {
        summary: "Okamžitý výkon fotovoltaiky a výroba za den, měsíc a celkem.",
        integrations: [
          { name: "Integrace vašeho střídače", domain: "sensor", core: true, why: "Fronius, GoodWe, SolarEdge, SolaX a další jsou součástí Home Assistantu." },
        ],
        steps: [
          "Přidejte integraci střídače v Nastavení → Zařízení a služby.",
          "Šablona si vezme senzory s device_class power a energy.",
          "Mezikruží se plní podle procentní hodnoty; pokud senzor procenta nemá, zobrazí ukázkovou výplň.",
        ],
      },
      washer: {
        summary: "Program pračky, zbývající čas a čas dokončení.",
        integrations: [
          { name: "Home Connect", domain: "sensor", core: true, why: "Pro pračky Bosch a Siemens. Dodá program i zbývající čas." },
          { name: "Senzor spotřeby + šablona", domain: "sensor", why: "U pračky bez chytrého připojení se stav odvodí od příkonu chytré zásuvky." },
        ],
        steps: [
          "Připojte pračku podporovanou integrací, nebo si stav odvoďte ze zásuvky.",
          "V Nastavit přiřaďte program a zbývající čas.",
        ],
      },
      living: {
        summary: "Teplota v místnosti s ukazateli vlhkosti a CO₂.",
        integrations: [
          { name: "Senzor teploty a vlhkosti", domain: "sensor", why: "Jakýkoli senzor s device_class temperature a humidity." },
          { name: "Senzor CO₂", domain: "sensor", why: "Například přes ESPHome nebo Netatmo; device_class carbon_dioxide." },
        ],
        steps: ["Přetáhněte šablonu na displej a v Nastavit zkontrolujte místnost u každého senzoru."],
      },
      presence: {
        summary: "Kdo z domácnosti je doma a kdo ne.",
        integrations: [
          { name: "Osoby", domain: "person", core: true, why: "Nastavení → Lidé. Každý člen domácnosti je entita person.*." },
          { name: "Home Assistant Companion", domain: "device_tracker", core: true, why: "Mobilní aplikace hlásí polohu, ze které se přítomnost odvodí." },
        ],
        steps: [
          "V Nastavení → Lidé založte členy domácnosti.",
          "Propojte je se sledovacím zařízením z mobilní aplikace.",
          "Stavy se na štítku zobrazí česky jako Doma a Pryč.",
        ],
      },
      wifi: {
        summary: "QR kód pro připojení k Wi-Fi, název sítě a heslo.",
        integrations: [
          helper("text", "Jeden pomocník na název sítě a druhý na heslo."),
        ],
        steps: [
          "V Nastavení → Zařízení a služby → Pomocníci vytvořte dva pomocníky typu text.",
          "Vyplňte název sítě a heslo a v Nastavit je u šablony vyberte.",
          "QR kód se vygeneruje sám z obou hodnot.",
        ],
        note: "Na malých štítcích na šířku (296 × 128) vyjde kód asi 8 mm a je na hraně čitelnosti. Použijte raději štítek na výšku nebo větší.",
      },
      calendar: {
        summary: "Dvě nejbližší události z kalendáře a svátek.",
        integrations: [
          { name: "Místní kalendář", domain: "calendar", core: true, why: "Kalendář přímo v Home Assistantu, bez cloudu. Nejrychlejší způsob, jak šablonu vyzkoušet." },
          { name: "Google Calendar", domain: "calendar", core: true, why: "Napojení na Google účet; události se načtou automaticky." },
          { name: "CalDAV", domain: "calendar", core: true, why: "Pro Nextcloud, iCloud a další servery podporující CalDAV." },
        ],
        steps: [
          "Přidejte některou kalendářovou integraci v Nastavení → Zařízení a služby.",
          "Přetáhněte šablonu na displej; entita calendar.* se najde sama.",
          "Události se čtou službou calendar.get_events na 21 dní dopředu.",
        ],
      },
      security: {
        summary: "Režim alarmu a stav dveří, oken a pohybu.",
        integrations: [
          { name: "Manual alarm", domain: "alarm_control_panel", core: true, why: "Alarm přímo v Home Assistantu, konfiguruje se v configuration.yaml. Vhodné pro vyzkoušení." },
          { name: "Integrace vaší ústředny", domain: "alarm_control_panel", why: "Jablotron, Alarmo a další; každá dodá entitu alarm_control_panel.*." },
          { name: "Kontakty dveří a oken", domain: "binary_sensor", why: "Binární senzory s device_class door, window a motion." },
        ],
        steps: [
          "Zprovozněte ústřednu alarmu, nebo použijte Manual alarm pro začátek.",
          "Přidejte kontakty dveří, oken a detektor pohybu.",
          "V Nastavit zkontrolujte přiřazení; stavy se zobrazí česky.",
        ],
      },
      transport: {
        summary: "Nejbližší odjezdy ze zastávky s čísly linek.",
        integrations: [
          { name: "Integrace vašeho dopravce", domain: "sensor", why: "Obvykle z HACS podle města, nebo vlastní REST senzor nad otevřeným API dopravce." },
        ],
        steps: [
          "Zprovozněte senzor, který vrací nejbližší odjezdy.",
          "V Nastavit přiřaďte zastávku a časy odjezdů.",
        ],
      },
      shopping: {
        summary: "Nákupní seznam se zaškrtnutými položkami.",
        integrations: [
          { name: "Místní úkolovník", domain: "todo", core: true, why: "Seznamy úkolů přímo v Home Assistantu." },
          { name: "Nákupní seznam", domain: "todo", core: true, why: "Klasický nákupní seznam Home Assistantu." },
        ],
        steps: [
          "Přidejte integraci seznamu v Nastavení → Zařízení a služby.",
          "V Nastavit přiřaďte seznam k údaji Položky.",
        ],
      },
      air: {
        summary: "Index kvality vzduchu na budíku s hodnotami CO₂, PM2.5 a vlhkosti.",
        integrations: [
          { name: "Airly", domain: "sensor", core: true, why: "Venkovní kvalita ovzduší podle nejbližší stanice." },
          { name: "Netatmo", domain: "sensor", core: true, why: "Vnitřní senzor CO₂ a kvality vzduchu." },
          { name: "ESPHome", domain: "sensor", core: true, why: "Vlastní senzor CO₂ nebo prachu postavený na ESP." },
        ],
        steps: ["Zprovozněte zdroj dat o vzduchu a v Nastavit přiřaďte AQI, CO₂ a PM2.5."],
      },
      thermostat: {
        summary: "Aktuální a cílová teplota s výkonem topení.",
        integrations: [
          { name: "Integrace vašeho termostatu", domain: "climate", core: true, why: "Tado, Netatmo, Zigbee hlavice a další dodají entitu climate.*." },
          { name: "Generic thermostat", domain: "climate", core: true, why: "Termostat složený z teploměru a spínače přímo v Home Assistantu." },
        ],
        steps: ["Přidejte termostat a v Nastavit přiřaďte aktuální i cílovou teplotu."],
      },
      water: {
        summary: "Spotřeba vody dnes s trendem za týden.",
        integrations: [
          { name: "Vodoměr", domain: "sensor", why: "Impulzní vstup, Zigbee vodoměr nebo senzor přes ESPHome; device_class water." },
          { name: "Utility Meter", domain: "sensor", core: true, why: "Z průběžného odečtu udělá denní, týdenní a měsíční spotřebu." },
        ],
        steps: [
          "Zprovozněte měření spotřeby vody.",
          "Přidejte Utility Meter pro denní, týdenní a měsíční hodnotu.",
          "V Nastavit přiřaďte jednotlivá období.",
        ],
      },
      parcel: {
        summary: "Stav zásilky a průběh dopravy.",
        integrations: [
          { name: "17TRACK", domain: "sensor", core: true, why: "Sleduje zásilky napříč dopravci; dodá senzor se stavem." },
        ],
        steps: ["Přidejte integraci sledování zásilek a v Nastavit přiřaďte stav zásilky."],
      },
      birthdays: {
        summary: "Kdo dnes slaví a kdo je na řadě příště.",
        integrations: [
          { name: "Místní kalendář", domain: "calendar", core: true, why: "Založte kalendář Narozeniny s celodenními opakovanými událostmi." },
        ],
        steps: [
          "Vytvořte kalendář s narozeninami jako opakované celodenní události.",
          "V Nastavit jej přiřaďte k údaji Jméno.",
        ],
      },
      server: {
        summary: "Dostupnost serveru s ukazateli CPU, RAM, disku a teploty.",
        integrations: [
          { name: "System Monitor", domain: "sensor", core: true, why: "Zátěž procesoru, paměti a disku stroje, na kterém běží Home Assistant." },
        ],
        steps: [
          "Přidejte integraci System Monitor a vyberte, které hodnoty sledovat.",
          "V Nastavit přiřaďte CPU, RAM a disk; ukazatele se plní podle procent.",
        ],
      },
      garden: {
        summary: "Vlhkost půdy se sedmidenním trendem a další zálivka.",
        integrations: [
          { name: "Xiaomi BLE", domain: "sensor", core: true, why: "Čidla Mi Flora měří vlhkost půdy přes Bluetooth." },
          { name: "ESPHome", domain: "sensor", core: true, why: "Vlastní čidlo vlhkosti půdy postavené na ESP." },
        ],
        steps: ["Zprovozněte čidlo vlhkosti půdy a v Nastavit jej přiřaďte."],
      },
      price: {
        summary: "Cenovka se jménem zboží, cenou a QR kódem.",
        integrations: [
          helper("text", "Název zboží a kód zboží pro QR kód."),
          helper("číslo", "Cena, původní cena a jednotková cena."),
          helper("spínač", "Nepovinné: zapíná akci automatizací nebo z pokladního systému."),
        ],
        steps: [
          "V Nastavení → Zařízení a služby → Pomocníci vytvořte pomocníky pro název a cenu.",
          "V Nastavit je přiřaďte k jednotlivým údajům.",
          "Akci zapnete přepínačem v Nastavit, nebo pomocníkem typu spínač u údaje Akce.",
        ],
      },
      priceshelf: {
        summary: "Regálová cenovka s pruhem, cenou a skladovou zásobou.",
        integrations: [
          helper("text", "Název zboží a kód zboží."),
          helper("číslo", "Cena, původní cena a počet kusů skladem."),
          helper("spínač", "Nepovinné: zapíná akci automatizací nebo z pokladního systému."),
        ],
        steps: [
          "Vytvořte pomocníky pro název, cenu a zásobu.",
          "V Nastavit je přiřaďte k údajům šablony.",
          "Přepínačem Akce zvýrazníte slevu.",
        ],
      },
    };
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
      const found = this._hasEntityDomain(item.domain);
      const link = item.core && !item.helper
        ? `<a href="https://www.home-assistant.io/integrations/${this._escape(item.domain)}/" target="_blank" rel="noopener noreferrer">Dokumentace</a>`
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
      { id: "blank", number: "00", category: "custom", title: "Prázdná šablona", variables: [] },
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
      { id: "price", number: "21", category: "shop", title: "Cenovka", options: [["sale", "Akce", "Zobrazí štítek AKCE, původní cenu přeškrtne a novou zvýrazní."]], variables: [["tag-outline", "Název zboží"], ["currency-usd", "Cena"], ["cash-multiple", "Původní cena"], ["barcode", "Kód zboží"]] },
    ];
    const prepared = new Set(["blank", "weather", "home", "solar", "living", "calendar", "security", "air", "thermostat", "server", "garden", "price"]);
    return templates.map((template) => ({
      ...template,
      kind: prepared.has(template.id) ? "prepared" : "custom",
    }));
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
    return this._templateSvgThumbnail(template, width, height);
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
      if (template.id === "blank") return true;
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
                ${editing
                  ? `<input class="display-settings-name-input" data-device-name-input="${this._escape(device.address)}" value="${this._escape(this._deviceNameDraft)}" placeholder="Název displeje" aria-label="Název displeje"><button class="display-settings-name-button is-save" data-device-name-save="${this._escape(device.address)}" title="Uložit název" aria-label="Uložit název"><ha-icon icon="mdi:check"></ha-icon></button>`
                  : `<strong class="display-template-device-info-name">${this._escape(this._deviceTitle(device))}</strong><button class="display-settings-name-button" data-device-rename="${this._escape(device.address)}" title="Přejmenovat displej" aria-label="Přejmenovat displej"><ha-icon icon="mdi:pencil-outline"></ha-icon></button><span class="display-template-device-info-address display-template-device-info-address--block">${this._escape(device.address)}</span>`}
              </div>
            </div>
            <div class="display-template-device-info-health">
              <span class="display-health-item display-battery-item" title="Baterie${Number.isFinite(battery.percent) ? ` ${battery.percent} %` : ""}">${this._renderBatterySegments(battery.percent)}<strong class="health-value battery-value level-${this._batteryLevel(battery.percent)}">${Number.isFinite(battery.percent) ? `${battery.percent} %` : "-"}</strong></span>
              <span class="display-health-item display-signal-item" title="Síla signálu${Number.isFinite(rssi) ? ` ${rssi} dBm` : ""}">${this._renderSignalBars(rssi)}<strong class="health-value signal-value level-${this._signalLevel(rssi)}">${Number.isFinite(rssi) ? `${rssi} dBm` : "-"}</strong></span>
            </div>

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
                <input type="search" id="displayTemplateSearch" data-display-template-search value="${this._escape(this._displayTemplateSearchQuery || "")}" placeholder="Hledat šablonu nebo údaj…" aria-label="Hledat šablony">
              </div>
              <div class="display-template-categories" aria-label="Kategorie šablon">
                ${categories.map((category) => `<button type="button" class="${activeCategory === category.id ? "is-active" : ""}" data-display-template-category="${category.id}" aria-pressed="${activeCategory === category.id}"><ha-icon icon="mdi:${category.icon}"></ha-icon>${category.title}</button>`).join("")}
              </div>
              <span class="pill muted display-template-result-count">${visibleCards.length} šablon</span>
            </div>
          </div>
          ${visibleCards.length ? `<div class="display-template-grid">${visibleCards.map((template) => {
            const used = assignedTemplates.includes(template.id);
            if (template.id === "blank") {
              return `<article class="display-template-card display-template-drag-card display-template-blank-card" data-display-template-open="blank" aria-label="Vytvořit vlastní šablonu od nuly. Kliknutím otevřete designer.">
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
            return `<article class="display-template-card display-template-drag-card ${used ? "is-used" : ""}" draggable="true" data-display-template-drag="${template.id}" aria-label="${this._escape(template.title)}. Přetáhněte na displej.">
              <header class="display-template-tile-header">
                <span class="display-template-kind-icon"><ha-icon icon="mdi:${template.kind === "prepared" ? "auto-fix" : "tune-variant"}"></ha-icon></span>
                <span class="display-template-tile-identity"><strong>${this._escape(template.title)}</strong><small>${template.kind === "prepared" ? "Automatické nastavení" : "Vlastní zdroje dat"}</small></span>
                <span class="display-template-variable-count">${template.variables.length} údajů</span>
                <button type="button" class="display-template-help" data-display-template-setup="${this._escape(template.id)}" title="Jak zprovoznit šablonu ${this._escape(template.title)}" aria-label="Jak zprovoznit šablonu ${this._escape(template.title)}"><ha-icon icon="mdi:help-circle-outline"></ha-icon></button>
              </header>
              <div class="display-template-tile-preview is-${orientation}" data-display-template-select="${template.id}" role="button" tabindex="0" aria-label="Vybrat šablonu ${this._escape(template.title)} pro displej">
                <span class="display-template-drag-handle"><ha-icon icon="mdi:drag"></ha-icon>Přetáhnout na displej</span>
                <span class="display-template-preview" style="aspect-ratio:${previewAspect};min-height:0">${this._renderDisplayTemplateCatalogPreview(template, orientation, size)}</span>
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
    return `<section class="display-template-editor-page studio-pro-workspace">
      ${this._renderStudioHeader(activeTemplate, device, orientation, previewZoom)}
      <div class="display-template-editor-layout">
        <aside class="card display-template-editor-panel display-template-editor-left studio-pro-sidebar" aria-label="Nástroje a vrstvy">
          <div class="photoshop-tab-header">
            <button type="button" class="${(this._photoshopSidebarTab || "layers") === "layers" ? "is-active" : ""}" data-photoshop-tab="layers"><ha-icon icon="mdi:layers-outline"></ha-icon> Vrstvy</button>
            <button type="button" class="${this._photoshopSidebarTab === "tools" ? "is-active" : ""}" data-photoshop-tab="tools"><ha-icon icon="mdi:tools"></ha-icon> Nástroje</button>
          </div>
          <div class="photoshop-tab-content">
            ${(this._photoshopSidebarTab || "layers") === "layers" ? this._renderPhotoshopLayersPanel(activeTemplate) : this._renderTemplateEditorTools()}
          </div>
        </aside>

        <main class="display-template-editor-canvas" data-photoshop-canvas>
          <div class="display-template-preview-card photoshop-canvas-card">
            <div class="display-template-editor-stage">
              ${this._renderTemplatePhysicalDevicePreview(device, template, secondaryTemplate, orientation, layout)}
            </div>
          </div>
          <div class="photoshop-context-bar">
            ${this._renderPhotoshopContextBar(activeTemplate)}
          </div>
        </main>

        <div class="display-template-editor-right-column">
          ${this._templateSendResult ? `<div class="template-send-result ${this._templateSendResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSendResult.ok ? "check-circle-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSendResult.message)}</span></div>` : ""}
          ${this._templateSaveResult ? `<div class="template-send-result ${this._templateSaveResult.ok ? "is-success" : "is-error"}"><ha-icon icon="mdi:${this._templateSaveResult.ok ? "content-save-check-outline" : "alert-circle-outline"}"></ha-icon><span>${this._escape(this._templateSaveResult.message)}</span></div>` : ""}
          <aside class="card display-template-editor-panel display-template-editor-right" aria-label="Nastavení šablony">
            <div class="template-editor-panel-heading"><ha-icon icon="mdi:tune-variant"></ha-icon><span><strong>Nastavení šablony</strong><small>${this._escape(activeTemplate.title)}</small></span></div>
            <div class="template-layout-options template-size-options" style="display:none">
              <button type="button" class="${selectedSize === "large" ? "is-active" : ""}" data-template-size="large" ${largeDisplay ? "" : "disabled"}><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon>Velká</button>
              <button type="button" class="${selectedSize === "small" ? "is-active" : ""}" data-template-size="small" ${largeDisplay ? "" : "disabled"}><ha-icon icon="mdi:arrow-collapse-all"></ha-icon>Malá</button>
            </div>
            <p class="template-size-help" style="display:none">Velká šablona zabírá celý displej a uzamkne přidání druhé.</p>
            ${this._renderTemplatePartControls(activeTemplate)}
            <button type="button" class="secondary template-setup-open" data-display-template-canvas-open="${this._escape(activeTemplate.id)}"><ha-icon icon="mdi:vector-selection"></ha-icon>Posouvat a upravit prvky na plátně</button>
            <button type="button" class="secondary template-setup-open" data-display-template-setup="${this._escape(activeTemplate.id)}"><ha-icon icon="mdi:help-circle-outline"></ha-icon>Jak zprovoznit tuto šablonu</button>
            ${this._renderTemplateOptionSettings(activeTemplate)}
            <p class="template-settings-intro">Vyberte, ze kterých entit Home Assistantu se mají načítat hodnoty. Systémové údaje jsou nastavené automaticky.</p>
            <div class="template-variable-settings">${activeTemplate.variables.map((variable, index) => this._renderTemplateVariableSetting(activeTemplate, variable, index)).join("")}</div>
          </aside>
        </div>
      </div>
    </section>`;
  },

  _renderStudioHeader(activeTemplate, device, orientation, previewZoom) {
    const key = String(this._selectedTemplatePart || "");
    const adjustment = this._templateElementAdjustments?.[key];
    const partNumber = key ? Number(key.split(":").at(-1)) + 1 : 0;
    const selectedColor = adjustment?.color || "black";
    const size = this._devicePreviewSize(device);

    return `<header class="studio-pro-header">
      <div class="studio-pro-brand">
        <span class="studio-pro-logo"><ha-icon icon="mdi:palette-swatch-outline"></ha-icon></span>
        <div class="studio-pro-title-wrap">
          <small>Designer</small>
          <h1>DRATEK eInk Studio</h1>
          <p>${this._escape(device?.name || "Displej")} · <strong>${size.width} × ${size.height} px</strong></p>
        </div>
      </div>

      <div class="studio-pro-header-center">
        ${key && adjustment ? `
          <div class="photoshop-options-group">
            <span class="photoshop-options-badge"><ha-icon icon="mdi:vector-selection"></ha-icon> Prvek ${partNumber}</span>
            <div class="photoshop-options-colors">
              <span class="photoshop-options-label">Barva:</span>
              <button type="button" class="color-swatch is-black ${selectedColor === "black" ? "is-selected" : ""}" data-template-part-color="black" title="Černá barva"></button>
              <button type="button" class="color-swatch is-red ${selectedColor === "red" ? "is-selected" : ""}" data-template-part-color="red" title="Červená barva"></button>
              <button type="button" class="color-swatch is-white ${selectedColor === "white" ? "is-selected" : ""}" data-template-part-color="white" title="Bílá barva"></button>
            </div>
            <button type="button" class="photoshop-btn" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon> Resetovat</button>
          </div>
        ` : `
          <div class="template-preview-controls">
            <div class="template-preview-zoom" role="group" aria-label="Přiblížení náhledu">
              <button type="button" data-template-preview-zoom="out" title="Oddálit"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
              <button type="button" class="template-preview-zoom-value" data-template-preview-zoom="reset" title="Obnovit">${Math.round(previewZoom * 100)} %</button>
              <button type="button" data-template-preview-zoom="in" title="Přiblížit"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
            </div>
            <div class="studio-pro-divider"></div>
            <div class="display-template-orientation" role="group" aria-label="Orientace displeje">
              <button type="button" class="${orientation === "portrait" ? "is-active" : ""}" data-template-orientation="portrait" title="Na výšku"><ha-icon icon="mdi:phone-rotate-portrait"></ha-icon></button>
              <button type="button" class="${orientation === "landscape" ? "is-active" : ""}" data-template-orientation="landscape" title="Na šířku"><ha-icon icon="mdi:phone-rotate-landscape"></ha-icon></button>
            </div>
          </div>
        `}
      </div>

      <div class="studio-pro-header-actions">
        <button type="button" class="display-template-save-button studio-pro-btn" data-template-save>
          <ha-icon icon="mdi:content-save-outline"></ha-icon> Uložit návrh
        </button>
        <button type="button" class="display-template-send-button studio-pro-btn primary" data-template-send ${this._templateSending ? "disabled" : ""}>
          <ha-icon icon="mdi:${this._templateSending ? "loading" : "send"}" ${this._templateSending ? 'class="spin"' : ""}></ha-icon>
          <span>${this._templateSending ? "Odesílám…" : "Odeslat do displeje"}</span>
        </button>
      </div>
    </header>`;
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
      const box = element.getBoundingClientRect();
      const image = element.querySelector("img");
      return {
        kind: element.classList.contains("template-overlay-image") ? "image"
          : element.classList.contains("template-overlay-text") ? "text"
            : element.classList.contains("template-overlay-line") ? "line"
              : element.classList.contains("is-circle") ? "circle" : "rect",
        x: (box.left - frame.left) / frame.width,
        y: (box.top - frame.top) / frame.height,
        w: box.width / frame.width,
        h: box.height / frame.height,
        text: element.textContent.trim(),
        src: image?.getAttribute("src") || "",
      };
    });
  },

  _paintTemplateOverlays(context, overlays, width, height) {
    context.save();
    for (const item of overlays) {
      const x = item.x * width;
      const y = item.y * height;
      const w = Math.max(1, item.w * width);
      const h = Math.max(1, item.h * height);
      context.fillStyle = "#000000";
      context.strokeStyle = "#000000";
      context.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.008));
      if (item.kind === "image" && item.src.startsWith("data:image/")) {
        const bitmap = new Image();
        bitmap.src = item.src;
        // Already decoded: the element is on screen, so the browser has it.
        if (bitmap.complete) context.drawImage(bitmap, x, y, w, h);
      } else if (item.kind === "text") {
        const size = Math.max(7, h * 0.8);
        context.font = `700 ${size}px Arial, Helvetica, sans-serif`;
        context.textBaseline = "top";
        context.fillText(item.text, x, y);
      } else if (item.kind === "line") {
        context.beginPath();
        context.moveTo(x, y + h / 2);
        context.lineTo(x + w, y + h / 2);
        context.stroke();
      } else if (item.kind === "circle") {
        context.beginPath();
        context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.strokeRect(x, y, w, h);
      }
    }
    context.restore();
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
      preview_width: width,
      preview_height: height,
      preview_orientation: portrait ? "portrait" : "landscape",
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
                    ${this._renderDisplayTemplateSurface(template, large400Layout ? (autoFit ? autoFormat : (this._displayTemplateFormats?.primary || "narrow")) : (orientation === "landscape" ? "wide" : "narrow"), true, "primary", autoFit || !large400Layout, large400Layout ? (this._displayTemplateSizes?.primary || "large") : "large", autoFit, primaryFillsDisplay ? autoSlotWidth : 0, primaryFillsDisplay ? autoSlotHeight : 0)}
                    ${large400Layout && layout !== "single" ? this._renderDisplayTemplateSurface(secondaryTemplate, autoFit ? autoFormat : (this._displayTemplateFormats?.secondary || "narrow"), false, "secondary", autoFit, "small", autoFit, autoFit ? autoSlotWidth : 0, autoFit ? autoSlotHeight : 0) : ""}
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
        <span><strong>Posouvejte prvky šablony</strong><small>Klikněte na jakýkoliv text, ikonu nebo blok v náhledu a tažením jej přesuňte na požadované místo.</small></span>
      </div>`;
    }
    const partNumber = Number(key.split(":").at(-1)) + 1;
    return `<div class="template-part-controls">
      <div class="template-part-controls-head"><ha-icon icon="mdi:cursor-move"></ha-icon><span><strong>${this._escape(activeTemplate.title)} · prvek ${partNumber}</strong><small>Tažením myší změníte polohu prvku</small></span></div>
      <button type="button" data-template-part-reset="${this._escape(key)}"><ha-icon icon="mdi:restore"></ha-icon>Obnovit původní polohu</button>
    </div>`;
  },

  _applyTemplatePartAdjustment(element, surface, adjustment) {
    const x = Number(adjustment.x || 0);
    const y = Number(adjustment.y || 0);
    if (typeof element.setAttribute === "function") {
      element.setAttribute("transform", `translate(${x}, ${y})`);
    }
    element.style.transform = `translate(${x}px, ${y}px)`;
    element.style.transformOrigin = "center";
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
          };
          element.setPointerCapture?.(event.pointerId);
        });
        element.addEventListener("pointermove", (event) => {
          const drag = this._templatePartDrag;
          if (!drag || drag.key !== key || drag.pointerId !== event.pointerId) return;
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
    let raw = state?.state;
    let forcedUnit = "";
    if (weatherState && normalized.includes("teplot")) {
      raw = weatherAttributes.temperature;
      forcedUnit = weatherAttributes.temperature_unit || "°C";
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
    if (has("událost", "kalend")) return "calendar";
    if (has("svátek")) return "nameday";
    if (has("osob", "přítom", "jméno")) return "person";
    if (has("teplot", "termostat")) return "temperature";
    if (has("vlhkost")) return "humidity";
    if (has("co₂", "co2")) return "carbon_dioxide";
    if (has("pm2", "aqi", "kvalit")) return "air_quality";
    if (has("bateri")) return "battery";
    if (has("signál")) return "signal_strength";
    if (has("cena", "tarif", "minimum")) return "monetary";
    if (has("výkon")) return "power";
    if (has("spotřeb", "výrob")) return "energy";
    if (has("vod", "zálivk")) return "water";
    if (has("vít")) return "wind_speed";
    if (has("světl")) return "light";
    if (has("zám")) return "lock";
    if (has("dveř")) return "door";
    if (has("okn")) return "window";
    if (has("pohyb")) return "motion";
    if (has("alarm", "režim")) return "alarm";
    if (has("zásilk", "sledovac", "doruč")) return "shipment";
    if (has("položk", "splněn", "seznam")) return "todo";
    if (has("program")) return "program";
    if (has("věk", "číslo")) return "generic";
    if (has("zbývaj", "dokonč", "změn")) return "timestamp";
    return "generic";
  },

  // Domains and device classes each kind accepts. A declared device_class outranks
  // any keyword match in the score below, which is what makes the binding reliable
  // on an installation whose entities are not named in Czech.
  _templateSlotTargets(kind) {
    const targets = {
      forecast: { domains: ["weather"] },
      weather: { domains: ["weather"] },
      calendar: { domains: ["calendar"] },
      person: { domains: ["person", "device_tracker"] },
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
      wind_speed: { domains: ["sensor"], classes: ["wind_speed"] },
      light: { domains: ["light", "switch"] },
      lock: { domains: ["lock"] },
      door: { domains: ["binary_sensor", "cover"], classes: ["door", "garage_door", "opening"] },
      window: { domains: ["binary_sensor", "cover"], classes: ["window", "opening"] },
      motion: { domains: ["binary_sensor"], classes: ["motion", "occupancy", "presence"] },
      alarm: { domains: ["alarm_control_panel"] },
      todo: { domains: ["todo", "sensor"] },
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
    const device = (typeof this._device === "function" ? this._device() : null);
    const address = String(device?.address || this._selectedDeviceAddress || "").toUpperCase();
    const draftBindings = this._deviceDrafts?.[address]?.bindings || {};
    if (draftBindings[meta.key] !== undefined) return draftBindings[meta.key];
    if (draftBindings[`${template?.id}:${meta.key}`] !== undefined) return draftBindings[`${template?.id}:${meta.key}`];

    const key = `${template?.id}:${meta.key}`;
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
        ${primary && !autoFit ? this._renderTemplateEditorOverlays() : ""}
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
