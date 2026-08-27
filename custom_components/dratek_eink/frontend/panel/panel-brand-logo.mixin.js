// INTERNAL FEATURE - MUST NOT SHIP IN THE PUBLIC / RETAIL RELEASE.
// See PRIVATE-NOTES.md in the repository root for the removal checklist.
//
// The one-click showroom reset behind the "Logo Drátek" catalog tile.
//
// Every other template in the catalog is assigned to the display that is
// currently open. This one is not a template anyone arranges: clicking its tile
// puts every known display into the same clean state - automatic update
// cancelled, pending queue jobs cancelled, the shop's logo printed across the
// whole panel - so a shelf of displays can be reset between customers in one
// action instead of one display at a time.
//
// Deliberately its own mixin rather than a branch inside panel-devices: the
// whole feature is this file plus templates/dratek_logo.js plus _blockBrandLogo,
// which is what makes it removable in one pass.

export const BRAND_LOGO_TEMPLATE_ID = "dratek_logo";

export const brandLogoMixin = {

  // --------------------------------------------------------- the artwork ---

  // The lockup is the integration's own icon, dithered, not a redrawing of it.
  //
  // It started as native SVG - type and rectangles that approximated the mark -
  // and an approximation of a logo is the one thing a logo may not be. The
  // logo-specific ordered pass below keeps the real shapes but does not spread
  // a coloured pixel's quantization error into the neutral module beside it.
  //
  // Two source files because the artwork has two lockups: the square one reads
  // on a tall or roomy panel, the wide one on a small landscape tag where the
  // square lockup's wordmark would shrink to a smudge.
  _brandLogoAsset(stacked) {
    return this._frontendAssetUrl(stacked ? "dratek-eink-logo.png" : "dratek-eink-header.png");
  },

  // The dither is per palette as well as per size: a three-colour panel and a
  // four-colour one need different error diffusion over the same pixels, and
  // handing a BWR panel the BWRY bitmap prints the yellow as a dirty grey.
  _brandLogoDitherSpec(stacked, width, height, device = this._device?.()) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const source = this._brandLogoAsset(stacked);
    const paletteKey = this._displayPaletteKey?.(device) || "bwr";
    return { source, w, h, paletteKey, cacheKey: `${source}:${w}x${h}:${paletteKey}:logo-ordered-5` };
  },

  _brandLogoBayerMatrix(width, height) {
    // A 4x4 cell repeats often enough for 128/152px-high tags; larger panels
    // have room for the smoother 8x8 tonal scale.
    if (Math.min(width, height) <= 160) {
      return [
        [0, 8, 2, 10], [12, 4, 14, 6],
        [3, 11, 1, 9], [15, 7, 13, 5],
      ];
    }
    return [
      [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
    ];
  },

  _brandLogoPrepareSource(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const r = pixels.data[offset];
      const g = pixels.data[offset + 1];
      const b = pixels.data[offset + 2];
      if (!pixels.data[offset + 3]) continue;
      // Turquoise DRATEK and +/- become black. Orange (accent and .CZ) stays
      // untouched and is mixed from the display's physical colour inks later.
      if (g > r + 35 && b > r + 35) {
        pixels.data[offset] = 0;
        pixels.data[offset + 1] = 0;
        pixels.data[offset + 2] = 0;
      // The artwork's only deep-red region is the dot over the i in Eink.
      } else if (r > 150 && g < 70 && b < 55) {
        pixels.data[offset] = 220;
        pixels.data[offset + 1] = 20;
        pixels.data[offset + 2] = 12;
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  },

  _ditherBrandLogoImageData(pixels, width, height, paletteKey = "") {
    const supportsYellow = paletteKey === "bwry";
    const red = [220, 20, 12];
    const yellow = [244, 196, 0];
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    const warmPalette = supportsYellow ? [white, red, yellow] : [white, red];
    const matrix = this._brandLogoBayerMatrix(width, height);
    const matrixSize = matrix.length;
    const levels = matrixSize * matrixSize;
    const distance = (colour, target) => (
      (colour[0] - target[0]) ** 2
      + (colour[1] - target[1]) ** 2
      + (colour[2] - target[2]) ** 2
    );
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = pixels.data[offset + 3] / 255;
        const source = [pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]];
        let ink;
        // Antialiasing is used only to locate the original contour. It must not
        // survive as a grey/dotted halo around letters on the physical panel.
        if (alpha < 0.5) {
          ink = white;
        // Source-black shapes (wordmark, symbols, Eink letters and outlines)
        // get a hard one-pixel contour instead of a dithered soft edge.
        } else if (Math.max(...source) < 48) {
          ink = black;
        // Preserve the dot over i as real solid red, not a disappearing cluster.
        } else if (source[0] > 175 && source[1] < 75 && source[2] < 60) {
          ink = red;
        } else if (source[0] > source[1] + 8 && source[1] > source[2] + 8) {
          // Accent and .CZ: find the most faithful pair of warm inks and order
          // their pixels. BWRY gets red+yellow orange; BWR gets red+white.
          let best = null;
          for (let a = 0; a < warmPalette.length; a += 1) {
            for (let b = a + 1; b < warmPalette.length; b += 1) {
              const first = warmPalette[a];
              const second = warmPalette[b];
              const direction = second.map((value, channel) => value - first[channel]);
              const divisor = direction.reduce((sum, value) => sum + value * value, 0) || 1;
              const amount = Math.max(0, Math.min(1,
                source.reduce((sum, value, channel) => sum + (value - first[channel]) * direction[channel], 0) / divisor,
              ));
              const mixed = first.map((value, channel) => value + amount * direction[channel]);
              const error = distance(mixed, source);
              if (!best || error < best.error) best = { first, second, amount, error };
            }
          }
          const threshold = (matrix[y % matrixSize][x % matrixSize] + 0.5) / levels;
          ink = best.amount > threshold ? best.second : best.first;
        } else {
          // Neutral parts of the module are strictly black/white. Red is not
          // eligible here, so it cannot leak into the corner underneath .CZ.
          const luminance = (0.2126 * source[0] + 0.7152 * source[1] + 0.0722 * source[2]) / 255;
          const threshold = (matrix[y % matrixSize][x % matrixSize] + 0.5) / levels;
          ink = luminance > threshold ? white : black;
        }
        pixels.data[offset] = ink[0];
        pixels.data[offset + 1] = ink[1];
        pixels.data[offset + 2] = ink[2];
        pixels.data[offset + 3] = 255;
      }
    }
  },

  _outlineBrandLogoModule(pixels, width, height, sourceWidth, sourceHeight) {
    // Bounds of the real Eink module in the two supplied source lockups. The
    // outline is added after dithering in target pixels, so it stays continuous
    // and sharp even on the smallest tag.
    const stacked = sourceWidth === sourceHeight;
    const bounds = stacked
      ? { x: 83, y: 488, right: 979, bottom: 883 }
      : { x: 1005, y: 103, right: 1665, bottom: 395 };
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const offsetX = (width - sourceWidth * scale) / 2;
    const offsetY = (height - sourceHeight * scale) / 2;
    const left = Math.max(0, Math.round(offsetX + bounds.x * scale));
    const top = Math.max(0, Math.round(offsetY + bounds.y * scale));
    const right = Math.min(width - 1, Math.round(offsetX + (bounds.right + 1) * scale) - 1);
    const bottom = Math.min(height - 1, Math.round(offsetY + (bounds.bottom + 1) * scale) - 1);
    const radius = Math.max(2, Math.round((stacked ? 28 : 19) * scale));
    const insideRoundedRect = (x, y, inset) => {
      const l = left + inset;
      const t = top + inset;
      const r = right + 1 - inset;
      const b = bottom + 1 - inset;
      const corner = Math.max(0, radius - inset);
      const px = x + 0.5;
      const py = y + 0.5;
      if (px < l || px >= r || py < t || py >= b) return false;
      if (px >= l + corner && px < r - corner) return true;
      if (py >= t + corner && py < b - corner) return true;
      const centreX = px < l + corner ? l + corner : r - corner;
      const centreY = py < t + corner ? t + corner : b - corner;
      return (px - centreX) ** 2 + (py - centreY) ** 2 <= corner ** 2;
    };
    const blacken = (x, y) => {
      const offset = (y * width + x) * 4;
      pixels.data[offset] = 0;
      pixels.data[offset + 1] = 0;
      pixels.data[offset + 2] = 0;
      pixels.data[offset + 3] = 255;
    };
    // One physical pixel: outer rounded silhouette minus the same silhouette
    // inset by one pixel. This follows the product image instead of boxing it.
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (insideRoundedRect(x, y, 0) && !insideRoundedRect(x, y, 1)) {
          blacken(x, y);
        }
      }
    }
  },

  _renderBrandLogoBitmapAtSize(source, width, height, paletteKey) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        this._drawCustomImageFitted(context, this._brandLogoPrepareSource(image), width, height, "contain");
        const pixels = context.getImageData(0, 0, width, height);
        this._ditherBrandLogoImageData(pixels, width, height, paletteKey);
        this._outlineBrandLogoModule(pixels, width, height, image.naturalWidth || image.width, image.naturalHeight || image.height);
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      image.src = source;
    });
  },

  _brandLogoDitherEntry(stacked, width, height, device = this._device?.()) {
    const spec = this._brandLogoDitherSpec(stacked, width, height, device);
    return this._brandLogoDitherCache?.get(spec.cacheKey) || "";
  },

  // Non-blocking, for the interactive preview: the block that needs it is
  // synchronous, so the first pass draws blank and repaints when this lands.
  _requestBrandLogoDither(stacked, width, height, device = this._device?.()) {
    const spec = this._brandLogoDitherSpec(stacked, width, height, device);
    this._brandLogoDitherCache ||= new Map();
    if (this._brandLogoDitherCache.has(spec.cacheKey)) return;
    this._brandLogoDitherPending ||= new Set();
    if (this._brandLogoDitherPending.has(spec.cacheKey)) return;
    this._brandLogoDitherPending.add(spec.cacheKey);
    // "contain": a logo may be letterboxed but never cropped.
    this._renderBrandLogoBitmapAtSize(spec.source, spec.w, spec.h, spec.paletteKey)
      .then((dataUrl) => {
        this._rememberBrandLogoDither(spec.cacheKey, dataUrl);
        this._scheduleTemplateIconRepaint?.();
      })
      .catch(() => {})
      .finally(() => this._brandLogoDitherPending.delete(spec.cacheKey));
  },

  _rememberBrandLogoDither(cacheKey, dataUrl) {
    this._brandLogoDitherCache ||= new Map();
    this._brandLogoDitherCache.set(cacheKey, dataUrl);
    if (this._brandLogoDitherCache.size > 8) {
      this._brandLogoDitherCache.delete(this._brandLogoDitherCache.keys().next().value);
    }
  },

  // Blocking counterpart for the send path: a broadcast must never go out as a
  // blank panel because the dither had not finished yet.
  async _preloadBrandLogoDither(rows, width, height, device = this._device?.()) {
    const row = (rows || []).find((entry) => entry?.brandLogo);
    if (!row) return;
    const spec = this._brandLogoDitherSpec(!!row.brandLogo.stacked, width, height, device);
    if (this._brandLogoDitherCache?.has(spec.cacheKey)) return;
    const dataUrl = await this._renderBrandLogoBitmapAtSize(spec.source, spec.w, spec.h, spec.paletteKey);
    this._rememberBrandLogoDither(spec.cacheKey, dataUrl);
  },

  _brandLogoTemplateCard() {
    return (this._displayTemplateCards?.() || []).find((card) => card.id === BRAND_LOGO_TEMPLATE_ID) || null;
  },

  // Every display the panel knows about, not only the ones a gateway can see
  // right now. An unreachable display's transfer is queued and written when it
  // next reports in, which is the behaviour a shelf reset wants: nothing is
  // silently skipped because a panel happened to be asleep.
  _brandLogoTargets() {
    return (this._result?.devices || []).filter((device) => String(device?.address || "").trim());
  },

  // Orientation and transform are per display, taken from that display's own
  // saved draft rather than from whichever display is open in the designer -
  // the broadcast touches displays the user is not looking at.
  _brandLogoSendGeometry(device) {
    const address = String(device?.address || "").toUpperCase();
    const draft = this._deviceDrafts?.[address] || {};
    const base = this._baseDisplaySize(device);
    const portrait = draft.orientation === "portrait";
    return {
      portrait,
      width: portrait ? Math.min(base.width, base.height) : Math.max(base.width, base.height),
      height: portrait ? Math.max(base.width, base.height) : Math.min(base.width, base.height),
      transform: draft.display_transform || "rotate_cw",
    };
  },

  // Cancels this display's waiting transfers so the logo is not queued behind
  // whatever was already lined up for it.
  //
  // Only "queued" jobs - the queue deliberately refuses to cancel one that is
  // already "writing", because cutting a BLE transfer mid-block leaves the
  // display's controller stuck in RECEIVE (see async_cancel_job in queue.py).
  // Such a job finishes and is then overwritten by the logo, which is the right
  // outcome anyway. A cancel that comes back refused is not a failure of the
  // reset either way.
  async _brandLogoCancelQueuedJobs(address) {
    const target = String(address || "").toUpperCase();
    let snapshot = null;
    try {
      snapshot = await this._hass.callWS({ type: "dratek_eink/queue/list" });
    } catch (_error) {
      return 0;
    }
    const pending = (snapshot?.jobs || []).filter((job) =>
      String(job?.address || "").toUpperCase() === target
      && String(job?.status || "") === "queued"
    );
    let cancelled = 0;
    for (const job of pending) {
      try {
        const result = await this._hass.callWS({ type: "dratek_eink/queue/cancel", job_id: job.id });
        if (result?.ok) cancelled += 1;
      } catch (_error) {
        // Already finished, already gone - either way there is nothing left to
        // cancel and the send below is what actually matters.
      }
    }
    return cancelled;
  },

  async _brandLogoDeleteAutomation(address) {
    try {
      const result = await this._hass.callWS({ type: "dratek_eink/automations/delete", address });
      return result?.ok === true;
    } catch (_error) {
      // A display with no automation answers ok:false, and a websocket failure
      // here must not stop the logo from reaching the rest of the shelf.
      return false;
    }
  },

  async _brandLogoRenderFor(device, template) {
    const { width, height } = this._brandLogoSendGeometry(device);
    const previousRenderingDevice = this._renderingDeviceAddress;
    // Scopes every palette lookup inside the renderer to this display, so a
    // three-colour panel is not drawn with the four-colour decisions of
    // whichever display happens to be selected in the UI.
    this._renderingDeviceAddress = device?.address || null;
    try {
      return await this._rasterizeDisplayTemplateSvg([template], width, height, "single", null);
    } finally {
      this._renderingDeviceAddress = previousRenderingDevice;
    }
  },

  async _brandLogoSendTo(device, template) {
    const { portrait, transform } = this._brandLogoSendGeometry(device);
    const image = await this._brandLogoRenderFor(device, template);
    const payload = {
      address: device.address,
      sdk_type: Number(device.sdk_type),
      software_version: Number(device.sw || 0),
      image,
      orientation: portrait ? "portrait" : "landscape",
      transform,
      template_ids: [BRAND_LOGO_TEMPLATE_ID],
      // No `automation` key at all, which is what makes the send itself clear
      // whatever automatic update the display had (see
      // _clear_previous_entity_automation in ws_sending.py). The explicit
      // delete above is still worth doing: it takes the display off the
      // Automations tab immediately, and it holds even if this transfer fails.
    };
    const gatewayId = device?.gateway_selection === "manual"
      ? String(device?.selected_gateway_id || "")
      : "";
    const result = gatewayId
      ? await this._hass.callWS({ type: "dratek_eink/gateways/send_design", gateway_id: gatewayId, ...payload })
      : await this._sendLocalDisplayDesignChunked(payload);
    if (result?.ok === false) throw new Error(result.error || "Odeslání se nezdařilo.");
    this._rememberBrandLogoPreview(device, image, portrait);
    return result;
  },

  // The list view paints each display's tile from the last image it was sent,
  // so the shelf shows the logo straight away instead of the design it used to
  // carry. Deliberately not _rememberSentDisplayPreview, which reads the
  // *selected* display's orientation and assignments rather than this one's.
  _rememberBrandLogoPreview(device, image, portrait) {
    const address = String(device?.address || "").toUpperCase();
    if (!address || !String(image || "").startsWith("data:image/")) return;
    const { width, height } = this._brandLogoSendGeometry(device);
    this._deviceDrafts ||= {};
    this._deviceDrafts[address] = {
      ...(this._deviceDrafts[address] || {}),
      width,
      height,
      orientation: portrait ? "portrait" : "landscape",
      preview_image: image,
      preview_updated_at: Date.now(),
      preview_width: width,
      preview_height: height,
      preview_orientation: portrait ? "portrait" : "landscape",
      sent_template_ids: [BRAND_LOGO_TEMPLATE_ID],
    };
  },

  _brandLogoConfirmationText(count) {
    return `Odeslat logo Drátek na všech ${count} známých displejů?\n\n`
      + "U každého displeje se nejdřív zruší automatická aktualizace a zruší se jeho čekající úlohy ve frontě. "
      + "Displeje mimo dosah se zapíší, jakmile se ohlásí gatewayi.\n\n"
      + "Tuto akci nelze vzít zpět.";
  },

  // The whole reset. Sequential rather than parallel on purpose: the transfers
  // share one Bluetooth radio (or one gateway), and firing them all at once
  // only produces contention errors the queue would then have to retry through.
  async _broadcastBrandLogoToAllDisplays() {
    if (this._brandLogoBroadcasting || !this._hass) return;
    const template = this._brandLogoTemplateCard();
    if (!template) return;
    const targets = this._brandLogoTargets();
    if (!targets.length) {
      this._templateSendResult = { ok: false, message: "Není známý žádný displej, kam logo poslat." };
      this._render();
      return;
    }
    if (!confirm(this._brandLogoConfirmationText(targets.length))) return;

    this._brandLogoBroadcasting = true;
    const failures = [];
    let sent = 0;
    try {
      for (const [index, device] of targets.entries()) {
        this._templateSendResult = {
          ok: true,
          message: `Logo Drátek: ${index + 1}/${targets.length} – ${this._deviceTitle?.(device) || device.address}…`,
        };
        this._render();
        try {
          await this._brandLogoDeleteAutomation(device.address);
          await this._brandLogoCancelQueuedJobs(device.address);
          await this._brandLogoSendTo(device, template);
          sent += 1;
        } catch (error) {
          failures.push(`${this._deviceTitle?.(device) || device.address}: ${this._message?.(error) || error}`);
        }
      }
    } finally {
      this._brandLogoBroadcasting = false;
      await this._loadQueue?.(true);
      await this._loadAutomations?.();
      this._saveCachedDeviceDrafts?.();
      this._templateSendResult = failures.length
        ? {
          ok: false,
          message: `Logo odesláno na ${sent} z ${targets.length} displejů. Nepovedlo se: ${failures.join("; ")}`,
        }
        : {
          ok: true,
          message: `Logo Drátek bylo odesláno na všech ${sent} displejů. Automatické aktualizace i čekající fronta byly zrušeny.`,
        };
      this._render();
      this._paint();
    }
  },
};
