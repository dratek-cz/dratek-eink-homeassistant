export const sendMixin = {


  async _sendDesign() {
    const device = this._device();
    if (!device || this._sending) return;
    if (device.preferred_path?.type === "gateway") {
      this._selectedGatewayId = device.preferred_path.id;
      await this._sendDesignViaGateway();
      return;
    }
    try {
      await this._refreshCustomUrlObjects();
    } catch (err) {
      this._sendResult = { ok: false, error: `Načtení dat vlastního prvku selhalo: ${this._message(err)}`, log: [] };
      this._render();
      this._paint();
      return;
    }
    const canvas = this._renderExportCanvas();
    const automation = this._entityAutomationPayload();
    const size = this._displaySize(device);
    if (canvas.width !== size.width || canvas.height !== size.height) {
      this._sendResult = {
        ok: false,
        error: `Rozmer navrhu ${canvas.width}x${canvas.height} nesedi s vybranym displejem ${size.width}x${size.height}. Prepnul jsem pracovni plochu, zkuste odeslat znovu.`,
        log: [],
      };
      await this._selectDevice(device.address, { forceLoad: true });
      return;
    }
    this._sending = true;
    this._sendResult = null;
    this._render();
    try {
      const image = automation.enabled
        ? await this._renderCanonicalPreview(automation, device.address)
        : canvas.toDataURL("image/png");
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/send_design",
        address: device.address,
        sdk_type: Number(device.sdk_type),
        orientation: this._orientation,
        transform: this._displayTransform,
        image,
        automation,
      });
      if (this._sendResult && this._sendResult.ok) await this._saveCurrentDeviceDraft();
    } catch (err) {
      this._sendResult = { ok: false, address: device.address, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  },

  /**
   * Area of the current selection, snapped outwards to the protocol's grid.
   *
   * The vendor protocol requires y and height to be multiples of 8 (it
   * addresses the panel in 8-row bands), so the selection is grown to the
   * nearest band rather than rejected, and clamped to the display.
   */
  _partialRegion() {
    const size = this._displaySize();
    const selected = this._objects.filter((object) => this._selectedIds.includes(object.id));
    if (!selected.length) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const object of selected) {
      const box = this._box(object);
      left = Math.min(left, box.x);
      top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.w);
      bottom = Math.max(bottom, box.y + box.h);
    }
    const x = Math.max(0, Math.floor(left));
    const y = Math.max(0, Math.floor(top / 8) * 8);
    const maxRight = Math.min(size.width, Math.ceil(right));
    const maxBottom = Math.min(size.height, Math.ceil(bottom / 8) * 8);
    const width = Math.max(8, maxRight - x);
    const height = Math.max(8, Math.ceil((maxBottom - y) / 8) * 8);
    return {
      x,
      y,
      width: Math.min(width, size.width - x),
      height: Math.min(height, Math.floor((size.height - y) / 8) * 8 || 8),
    };
  },

  async _sendPartialDesign() {
    const device = this._device();
    if (!device || this._sending) return;
    const region = this._partialRegion();
    if (!region) {
      this._sendResult = { ok: false, error: "Nejprve v návrhu označ objekty, jejichž oblast se má přepsat.", log: [] };
      this._render();
      this._paint();
      return;
    }
    const full = this._renderExportCanvas();
    const crop = document.createElement("canvas");
    crop.width = region.width;
    crop.height = region.height;
    const ctx = crop.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(full, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    this._sending = true;
    this._sendResult = null;
    this._render();
    try {
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/send_partial_design",
        address: device.address,
        sdk_type: Number(device.sdk_type),
        transform: this._displayTransform,
        image: crop.toDataURL("image/png"),
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        clear_screen: 0,
      });
    } catch (err) {
      this._sendResult = { ok: false, address: device.address, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  },

  async _sendDesignViaGateway() {
    const device = this._device();
    if (!device || this._sending || !this._selectedGatewayId) return;
    this._sending = true;
    this._sendResult = null;
    this._render();
    try {
      await this._refreshCustomUrlObjects();
      const canvas = document.createElement("canvas");
      const size = this._displaySize(device);
      canvas.width = size.width;
      canvas.height = size.height;
      this._drawScene(canvas.getContext("2d", { willReadFrequently: true }), canvas.width, canvas.height, false);
      const automation = this._entityAutomationPayload();
      const image = automation.enabled
        ? await this._renderCanonicalPreview(automation, device.address)
        : canvas.toDataURL("image/png");
      this._sendResult = await this._hass.callWS({
        type: "dratek_eink/gateways/send_design",
        gateway_id: this._selectedGatewayId,
        address: device.address,
        sdk_type: Number(device.sdk_type),
        orientation: this._orientation,
        transform: this._displayTransform,
        image,
        automation,
      });
      if (this._sendResult && this._sendResult.ok) await this._saveCurrentDeviceDraft();
    } catch (err) {
      this._sendResult = { ok: false, address: device.address, error: this._message(err), log: [] };
    } finally {
      this._sending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  },

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
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  },

  async _applyRgbLed() {
    const device = this._device();
    if (!device || this._ledSending) return;
    const color = /^#[0-9a-f]{6}$/i.test(this._rgbLed.color) ? this._rgbLed.color : "#00a2a5";
    const mode = { off: 0, on: 1, flash: 2 }[this._rgbLed.mode] ?? 0;
    this._ledSending = true;
    this._ledResult = null;
    this._scheduleDraftSave();
    this._render();
    this._paint();
    try {
      this._ledResult = await this._hass.callWS({
        type: "dratek_eink/set_rgb_led",
        address: device.address,
        mode,
        flash_time: mode === 2 ? Math.max(1, Math.min(255, Number(this._rgbLed.flashTime) || 10)) : 0,
        red: parseInt(color.slice(1, 3), 16),
        green: parseInt(color.slice(3, 5), 16),
        blue: parseInt(color.slice(5, 7), 16),
      });
    } catch (err) {
      this._ledResult = { ok: false, error: this._message(err) };
    } finally {
      this._ledSending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  },

  async _flashIdentify(address) {
    const target = address || this._device()?.address;
    if (!target || this._identifySending) return;
    this._identifySending = true;
    this._identifyResult = null;
    this._render();
    try {
      this._identifyResult = await this._hass.callWS({ type: "dratek_eink/flash_identify", address: target });
    } catch (err) {
      this._identifyResult = { ok: false, error: this._message(err) };
    } finally {
      this._identifySending = false;
      await this._loadQueue(false);
      this._render();
      this._paint();
    }
  },

  _renderRgbLedControl(device, compact = false) {
    const colors = [
      ["#ff2d2d", "Červená"], ["#ff7a00", "Oranžová"], ["#ffd400", "Žlutá"],
      ["#20b15a", "Zelená"], ["#00a2a5", "Tyrkysová"], ["#2474ff", "Modrá"],
      ["#b53cff", "Fialová"], ["#ffffff", "Bílá"],
    ];
    const result = this._ledResult
      ? `<span class="led-result ${this._ledResult.ok ? "good" : "bad"}"><ha-icon icon="${this._ledResult.ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline"}"></ha-icon>${this._ledResult.ok ? "Nastavení diody bylo odesláno." : this._escape(this._ledResult.error || "Ovládání diody selhalo.")}</span>`
      : "";
    return `<div class="${compact ? "rgb-led-compact" : "card"} rgb-led-card">
      <div class="rgb-led-heading"><div class="rgb-led-title"><span class="rgb-led-icon" style="--led-color:${this._escape(this._rgbLed.color)}"><ha-icon icon="mdi:led-on"></ha-icon></span><div><h2>RGB dioda displeje</h2><small>Samostatné hardwarové ovládání; dioda není součástí grafického náhledu.</small></div></div>${result}</div>
      <div class="rgb-led-controls">
        <div class="field"><label>Režim</label><div class="segment-control led-mode-control">
          <button class="segment-button ${this._rgbLed.mode === "off" ? "selected" : ""}" data-led-mode="off"><ha-icon icon="mdi:led-off"></ha-icon><span>Vypnuto</span></button>
          <button class="segment-button ${this._rgbLed.mode === "on" ? "selected" : ""}" data-led-mode="on"><ha-icon icon="mdi:led-on"></ha-icon><span>Svítí</span></button>
          <button class="segment-button ${this._rgbLed.mode === "flash" ? "selected" : ""}" data-led-mode="flash"><ha-icon icon="mdi:alarm-light-outline"></ha-icon><span>Bliká</span></button>
        </div></div>
        <div class="field led-color-field"><label>Barva</label><div class="led-color-row"><input id="rgbLedColor" type="color" value="${this._escape(this._rgbLed.color)}" ${this._rgbLed.mode === "off" ? "disabled" : ""}><div class="led-presets">${colors.map(([color, label]) => `<button type="button" data-led-color="${color}" class="led-preset ${this._rgbLed.color === color ? "selected" : ""}" style="--preset:${color}" title="${label}" ${this._rgbLed.mode === "off" ? "disabled" : ""}></button>`).join("")}</div></div></div>
        ${this._rgbLed.mode === "flash" ? `<div class="field led-flash-field"><label for="rgbLedFlashTime">Tempo blikání <strong>${this._rgbLed.flashTime}</strong></label><input id="rgbLedFlashTime" type="range" min="1" max="255" value="${this._rgbLed.flashTime}"><small>Hodnota 1–255 podle časování firmware displeje.</small></div>` : ""}
        <button id="applyRgbLed" class="rgb-led-apply" ${!device || this._ledSending ? "disabled" : ""}><ha-icon icon="mdi:bluetooth-connect"></ha-icon>${this._ledSending ? "Odesílám..." : "Použít na displeji"}</button>
      </div>
    </div>`;
  },
};
