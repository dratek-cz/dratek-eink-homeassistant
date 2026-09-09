// The one-click showroom reset behind the "Logo Drátek" catalog tile.
//
// Every other template in the catalog is assigned to the display that is
// currently open. This one is not a template anyone arranges: clicking its tile
// puts every known display into the same clean state - automatic update
// cancelled, pending queue jobs cancelled, the shop's logo printed across the
// whole panel - so a shelf of displays can be reset between customers in one
// action instead of one display at a time.
//
// Deliberately its own mixin rather than a branch inside panel-devices so the
// broadcast flow stays separate from ordinary per-display template editing.

import { DISPLAY_TEMPLATES_BY_ID } from "./templates/index.js";

export const BRAND_LOGO_TEMPLATE_ID = "dratek_logo";

// The lockup is dithered at every panel size. There used to be a height below
// which it was not: the module's screen printed as plain white inside its black
// outline, so the small tags showed an empty frame where the large ones showed
// the shading, and the same logo did not look like the same logo across a shelf.
//
// That switch was the wrong answer to a real problem. The small tags did print
// the screen as a coarse mesh - but because they were dithered with a 4x4 cell,
// not because they were dithered at all. The module's grey is RGB 210,210,208,
// a light tone that wants roughly one pixel in six: a 4x4 cell can only place
// that as one dot per sixteen on a hard four-pixel pitch, which is a visible
// grid, while the 8x8 cell spreads about eleven dots through sixty-four and
// reads as a tint at any size. So the cell went, not the tone.

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

  // A small tag prints the wordmark alone - no picture of an eInk module.
  //
  // Both shipped lockups pair the DRÁTEK.CZ wordmark with a drawing of the
  // product, right for a header on a screen and wrong on the product: the tag
  // in the customer's hand ends up showing a picture of a tag. The wide file is
  // the one a small landscape panel gets, and its two halves sit side by side,
  // so the wordmark is recoverable by cropping the artwork rather than by
  // redrawing it - which is still the rule this whole block is built on.
  //
  // The box is the wordmark's own ink in the shipped 1700x500 header, padded by
  // the 26px optical margin the artwork already carries down its left edge, so
  // the type is not flush against the edge of a full-bleed panel. Returns null
  // for the square lockup: it stacks the module *under* the wordmark, where no
  // rectangle separates the two, and a tall panel has the room to carry both.
  _brandLogoWordmarkCrop(sourceWidth, sourceHeight) {
    if (sourceWidth === sourceHeight) return null;
    const box = { x: 0, y: 70, right: 979, bottom: 348 };
    const right = Math.min(sourceWidth, box.right);
    const bottom = Math.min(sourceHeight, box.bottom);
    const y = Math.min(box.y, bottom);
    // A source that is not the artwork this box was measured in would be
    // cropped to nonsense; drawn whole instead, exactly as before.
    if (right <= box.x || bottom <= y) return null;
    return { x: box.x, y, width: right - box.x, height: bottom - y };
  },

  // The dither is per palette as well as per size: a three-colour panel and a
  // four-colour one need different error diffusion over the same pixels, and
  // handing a BWR panel the BWRY bitmap prints the yellow as a dirty grey.
  _brandLogoDitherSpec(stacked, width, height, device = this._device?.(), ground = "white") {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const source = this._brandLogoAsset(stacked);
    const paletteKey = this._displayPaletteKey?.(device) || "bwr";
    const field = this._brandLogoGround(ground, paletteKey);
    return {
      source, w, h, paletteKey, ground: field,
      cacheKey: `${source}:${w}x${h}:${paletteKey}:${field}:logo-ground-9`,
    };
  },

  // The panel behind the wordmark. Yellow is a real pigment on a four-colour
  // display and nothing at all on a three-colour one: asking a BWR panel for it
  // would dither the whole field into a red-and-white mesh under the type,
  // which reads worse than the white it already prints. So the fallback is not
  // a degraded yellow, it is white - the same lockup, one colour poorer.
  _brandLogoGround(ground, paletteKey) {
    return ground === "yellow" && paletteKey === "bwry" ? "yellow" : "white";
  },

  // The flat colour a not-yet-dithered block should stand in with, so a yellow
  // panel does not flash white for the length of one render pass.
  _brandLogoGroundHex(ground, device = this._device?.()) {
    const paletteKey = this._displayPaletteKey?.(device) || "bwr";
    return this._brandLogoGround(ground, paletteKey) === "yellow" ? "#f4c400" : "#ffffff";
  },

  // One cell for every panel. 8x8 is the smallest matrix that can place a light
  // tone as something other than a regular grid, which is the whole reason the
  // small tags looked wrong under the 4x4 cell they used to get.
  _brandLogoBayerMatrix() {
    return [
      [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
    ];
  },

  _brandLogoPrepareSource(image, crop = null) {
    const canvas = document.createElement("canvas");
    canvas.width = crop ? crop.width : (image.naturalWidth || image.width);
    canvas.height = crop ? crop.height : (image.naturalHeight || image.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    // Shifted rather than clipped: the region outside the crop lands off the
    // canvas, so what remains is exactly the box and nothing is resampled.
    context.drawImage(image, crop ? -crop.x : 0, crop ? -crop.y : 0);
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

  _ditherBrandLogoImageData(pixels, width, height, paletteKey = "", ground = "white") {
    const supportsYellow = paletteKey === "bwry";
    const red = [220, 20, 12];
    const yellow = [244, 196, 0];
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    // What "not ink" prints as. Every light outcome below resolves to this and
    // not to hard white, or the antialiased edge of every letter leaves a white
    // fringe standing on the yellow field - the halo this dither exists to
    // avoid, just in the other direction.
    const field = ground === "yellow" ? yellow : white;
    const warmPalette = supportsYellow
      ? (field === yellow ? [yellow, red] : [field, red, yellow])
      : [field, red];
    const matrix = this._brandLogoBayerMatrix();
    const matrixSize = matrix.length;
    const levels = matrixSize * matrixSize;
    const thresholdAt = (x, y) => (matrix[y % matrixSize][x % matrixSize] + 0.5) / levels;
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
          ink = field;
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
          ink = best.amount > thresholdAt(x, y) ? best.second : best.first;
        } else {
          // Neutral parts of the module are strictly black/white. Red is not
          // eligible here, so it cannot leak into the corner underneath .CZ.
          const luminance = (0.2126 * source[0] + 0.7152 * source[1] + 0.0722 * source[2]) / 255;
          ink = luminance > thresholdAt(x, y) ? field : black;
        }
        pixels.data[offset] = ink[0];
        pixels.data[offset + 1] = ink[1];
        pixels.data[offset + 2] = ink[2];
        pixels.data[offset + 3] = 255;
      }
    }
  },

  // Bounds of the real Eink module in the square lockup, mapped into the target
  // pixels the panel is actually printed in. The outline is drawn from it after
  // the dither, so the module keeps a continuous, sharp edge around a screen
  // that is a tone rather than a solid.
  //
  // Only the square lockup has a module in the bitmap at all now: the wide one
  // is cropped down to its wordmark before it is drawn, so the bounds it used
  // to need here are gone rather than left standing unreachable.
  _brandLogoModuleRect(width, height, sourceWidth, sourceHeight) {
    const bounds = { x: 83, y: 488, right: 979, bottom: 883 };
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const offsetX = (width - sourceWidth * scale) / 2;
    const offsetY = (height - sourceHeight * scale) / 2;
    return {
      left: Math.max(0, Math.round(offsetX + bounds.x * scale)),
      top: Math.max(0, Math.round(offsetY + bounds.y * scale)),
      right: Math.min(width - 1, Math.round(offsetX + (bounds.right + 1) * scale) - 1),
      bottom: Math.min(height - 1, Math.round(offsetY + (bounds.bottom + 1) * scale) - 1),
      radius: Math.max(2, Math.round(28 * scale)),
    };
  },

  _outlineBrandLogoModule(pixels, width, height, sourceWidth, sourceHeight) {
    // The outline is added after dithering, in target pixels, so it stays
    // continuous and sharp even on the smallest tag.
    const { left, top, right, bottom, radius } = this._brandLogoModuleRect(
      width, height, sourceWidth, sourceHeight,
    );
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

  _renderBrandLogoBitmapAtSize(source, width, height, paletteKey, ground = "white") {
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
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const crop = this._brandLogoWordmarkCrop(sourceWidth, sourceHeight);
        this._drawCustomImageFitted(context, this._brandLogoPrepareSource(image, crop), width, height, "contain");
        const pixels = context.getImageData(0, 0, width, height);
        this._ditherBrandLogoImageData(pixels, width, height, paletteKey, ground);
        // The cropped lockup is the wordmark alone - there is no module left in
        // it to frame, and the rectangle would land on the type.
        if (!crop) this._outlineBrandLogoModule(pixels, width, height, sourceWidth, sourceHeight);
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      image.src = source;
    });
  },

  _brandLogoDitherEntry(stacked, width, height, device = this._device?.(), ground = "white") {
    const spec = this._brandLogoDitherSpec(stacked, width, height, device, ground);
    return this._brandLogoDitherCache?.get(spec.cacheKey) || "";
  },

  // Non-blocking, for the interactive preview: the block that needs it is
  // synchronous, so the first pass draws blank and repaints when this lands.
  _requestBrandLogoDither(stacked, width, height, device = this._device?.(), ground = "white") {
    const spec = this._brandLogoDitherSpec(stacked, width, height, device, ground);
    this._brandLogoDitherCache ||= new Map();
    if (this._brandLogoDitherCache.has(spec.cacheKey)) return;
    this._brandLogoDitherPending ||= new Set();
    if (this._brandLogoDitherPending.has(spec.cacheKey)) return;
    this._brandLogoDitherPending.add(spec.cacheKey);
    // "contain": a logo may be letterboxed but never cropped.
    this._renderBrandLogoBitmapAtSize(spec.source, spec.w, spec.h, spec.paletteKey, spec.ground)
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
    const spec = this._brandLogoDitherSpec(
      !!row.brandLogo.stacked, width, height, device, row.brandLogo.ground,
    );
    if (this._brandLogoDitherCache?.has(spec.cacheKey)) return;
    const dataUrl = await this._renderBrandLogoBitmapAtSize(
      spec.source, spec.w, spec.h, spec.paletteKey, spec.ground,
    );
    this._rememberBrandLogoDither(spec.cacheKey, dataUrl);
  },

  _brandLogoTemplateCard() {
    const builtIn = DISPLAY_TEMPLATES_BY_ID[BRAND_LOGO_TEMPLATE_ID];
    return builtIn ? { ...builtIn.catalog, user_created: false } : null;
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

  async _brandLogoCancelAllQueuedJobs(devices) {
    const targets = new Set(
      (devices || []).map((device) => String(device?.address || "").toUpperCase()).filter(Boolean),
    );
    if (!targets.size) return 0;
    let snapshot;
    try {
      snapshot = await this._hass.callWS({ type: "dratek_eink/queue/list" });
    } catch (_error) {
      return 0;
    }
    const pending = (snapshot?.jobs || []).filter((job) =>
      targets.has(String(job?.address || "").toUpperCase())
      && String(job?.status || "") === "queued"
    );
    let cancelled = 0;
    for (const job of pending) {
      try {
        const result = await this._hass.callWS({ type: "dratek_eink/queue/cancel", job_id: job.id });
        if (result?.ok) cancelled += 1;
      } catch (_error) {
        // The job may have started or finished between listing and cancelling.
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
    // Scopes every palette lookup inside the renderer to this display, so a
    // three-colour panel is not drawn with the four-colour decisions of
    // whichever display happens to be selected in the UI. A broadcast renders
    // every display in turn, so these scopes overlap - see _pushRenderingDevice
    // for why that rules out save-and-restore.
    return this._withRenderingDevice(device?.address, () =>
      this._rasterizeDisplayTemplateSvg([template], width, height, "single", null));
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
      // Queue insertion, not the finished write. The broadcast's job is to put
      // one entry per display into the transfer queue and let the backend write
      // them one at a time; awaiting each transfer instead meant a shelf of a
      // hundred displays only ever had as many queue entries as there are
      // radios, the other ninety-odd existed nowhere but this loop, and closing
      // the panel threw them away. It also silently disabled two things the
      // queue does for exactly this case: holding a job for a display that is
      // out of range (queue.py's may_wait), and keeping gateway routes in play
      // (the backoff filter in _async_submit_routed_transfer only fires when a
      // caller is waiting, so one gateway hiccup pushed the whole shelf onto
      // Home Assistant's own adapter). Flooding a dead gateway is a routing
      // problem and is solved where routing happens - see _select_gateway_route.
      wait_for_completion: false,
      // No `automation` key at all, which is what makes the send itself clear
      // whatever automatic update the display had (see
      // _clear_previous_entity_automation in ws_sending.py). The explicit
      // delete above is still worth doing: it takes the display off the
      // Automations tab immediately, and it holds even if this transfer fails.
    };
    // The routed chunked endpoint honours automatic and manually selected
    // gateways and can fall back to another route when one fails.
    const result = await this._sendLocalDisplayDesignChunked(payload);
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

  // Three outcomes that used to collapse into one cheerful sentence: everything
  // queued, some displays refused, and the loop itself dying partway down the
  // list. The last one is the one that mattered and the one that was invisible.
  _brandLogoBroadcastOutcome(sent, total, failures, reachedEveryDisplay) {
    if (!reachedEveryDisplay) {
      return {
        ok: false,
        message: `Hromadné odeslání se zastavilo po ${sent} z ${total} displejů. `
          + "Zbývající displeje nebyly vůbec zkoušeny. "
          + "Chyba je vypsaná v konzoli prohlížeče (F12).",
      };
    }
    if (!failures.length) {
      return {
        ok: true,
        message: `Logo Drátek bylo zařazeno do fronty pro všech ${sent} displejů. `
          + "Automatické aktualizace i dřívější čekající úlohy byly zrušeny. "
          + "Zápisy probíhají postupně přes dostupné gateway - průběh sledujte na kartě Fronta zápisu.",
      };
    }
    return {
      ok: false,
      message: `Logo zařazeno pro ${sent} z ${total} displejů. ${this._brandLogoFailureSummary(failures)}`,
    };
  },

  // Fifty identical errors are one fact, not fifty. Grouping them is the whole
  // difference between "the websocket dropped" and "these three displays have
  // no route left", without anyone having to open the console first.
  _brandLogoFailureSummary(failures) {
    const byReason = new Map();
    for (const failure of failures) {
      byReason.set(failure.reason, [...(byReason.get(failure.reason) || []), failure.label]);
    }
    const ranked = [...byReason.entries()].sort((a, b) => b[1].length - a[1].length);
    const shown = ranked.slice(0, 3).map(([reason, labels]) => {
      const names = labels.slice(0, 3).join(", ");
      const more = labels.length > 3 ? ` a ${labels.length - 3} dalších` : "";
      return `${labels.length}x ${reason} (${names}${more})`;
    });
    const hiddenKinds = ranked.length - shown.length;
    const tail = hiddenKinds > 0 ? `; a ${hiddenKinds} další druh chyby` : "";
    return `Nepovedlo se zařadit - ${shown.join("; ")}${tail}. `
      + "Úplný seznam po displejích je v konzoli prohlížeče (F12).";
  },

  // The whole reset. Every display gets its queue entry here, as fast as the
  // panel can render and upload them; the writing itself belongs to the backend
  // queue, which serialises one display at a time per radio and spreads the
  // backlog across every gateway that hears them.
  //
  // Sequential on purpose. The render is serialised anyway (_withRenderingDevice
  // holds a gate so one display's palette scope cannot overlap another's), so
  // parallel workers would only interleave the chunk uploads, and they cost the
  // one thing that matters here: submitting in list order means the queue is
  // written in list order.
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
    // Whether the list was walked to its end, as opposed to the loop dying in
    // the middle of it. Without this the finally block below cannot tell the
    // two apart, and it reported a broadcast that stopped at display 47 of 100
    // as "queued for all 47 displays" - the other 53 were never tried, and
    // nothing on screen said so.
    let reachedEveryDisplay = false;
    try {
      this._templateSendResult = {
        ok: true,
        message: `Připravuji hromadné odeslání a ruším čekající úlohy pro ${targets.length} displejů…`,
      };
      this._render();
      await this._brandLogoCancelAllQueuedJobs(targets);
      for (const device of targets) {
        await this._brandLogoDeleteAutomation(device.address);
      }
      for (const [index, device] of targets.entries()) {
        // The progress repaint belongs INSIDE the guard. It used to sit above
        // it, so anything the panel threw while redrawing - not while sending -
        // ended the whole broadcast where it stood, and the displays after that
        // one were never even attempted.
        try {
          this._templateSendResult = {
            ok: true,
            message: `Logo Drátek: zařazuji displej ${index + 1}/${targets.length} do fronty zápisu…`,
          };
          this._render();
          await this._brandLogoSendTo(device, template);
          sent += 1;
        } catch (error) {
          const label = this._deviceTitle?.(device) || device.address;
          // The panel's own line can only carry a summary, and fifty of these
          // joined by semicolons is readable by nobody. The console keeps the
          // per-display truth, which is what a bug report actually needs.
          console.error(`[dratek-eink] Logo Drátek: ${label} se nepodařilo zařadit do fronty:`, error);
          failures.push({ label, reason: String(this._message?.(error) || error) });
        }
      }
      reachedEveryDisplay = true;
    } finally {
      this._brandLogoBroadcasting = false;
      await this._loadQueue?.(true);
      await this._loadAutomations?.();
      this._saveCachedDeviceDrafts?.();
      this._templateSendResult = this._brandLogoBroadcastOutcome(
        sent, targets.length, failures, reachedEveryDisplay,
      );
      this._render();
      this._paint();
    }
  },
};
