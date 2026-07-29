export const previewMixin = {


  async _renderCanonicalPreview(automation, address = this._device()?.address) {
    if (!automation?.enabled || !address || !this._hass) return "";
    const result = await this._hass.callWS({
      type: "dratek_eink/render_preview",
      address,
      automation,
    });
    if (!result?.ok || !result.image) throw new Error("Backend nevytvořil náhled displeje.");
    return result.image;
  },

  _scheduleCanonicalDesignerPreview() {
    window.clearTimeout(this._backendPreviewTimer);
    const requestId = ++this._backendPreviewRequestId;
    if (this._drag && this._drag.mode !== "marquee") return;
    if (this._activeTab !== "designer" || !this._device() || !this._hass) return;
    this._backendPreviewTimer = window.setTimeout(async () => {
      this._backendPreviewTimer = null;
      const device = this._device();
      const canvas = this.shadowRoot.querySelector("#editor");
      if (!device || !canvas || requestId !== this._backendPreviewRequestId) return;
      const automation = this._entityAutomationPayload();
      if (!automation.enabled) return;
      try {
        const source = await this._renderCanonicalPreview(automation, device.address);
        if (
          requestId !== this._backendPreviewRequestId
          || this._activeTab !== "designer"
          || this._device()?.address !== device.address
        ) return;
        const image = new Image();
        image.src = source;
        await image.decode();
        if (requestId !== this._backendPreviewRequestId) return;
        this._backendPreviewImage = image;
        this._backendPreviewAddress = device.address;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        if (requestId === this._backendPreviewRequestId) {
          console.warn("DRATEK eInk canonical preview failed:", err);
        }
      }
    }, 120);
  },

  _paint() {
    if (document.fonts && !this._designerFontReady) {
      this._ensureDesignerFont();
      return;
    }
    const canvas = this.shadowRoot.querySelector("#editor");
    if (canvas) {
      this._drawScene(canvas.getContext("2d", { willReadFrequently: true }), canvas.width, canvas.height, false);
      const hasCanonicalObjects = this._canonicalRenderObjects().length > 0;
      if (hasCanonicalObjects && !this._drag) {
        this._paintCachedCanonicalPreview(canvas);
      } else if (!hasCanonicalObjects) {
        this._backendPreviewImage = null;
        this._backendPreviewAddress = "";
      }
    }
    const selectionCanvas = this.shadowRoot.querySelector("#editorSelection");
    if (selectionCanvas) {
      const selectionContext = selectionCanvas.getContext("2d", { willReadFrequently: true });
      selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
      this._drawSelection(selectionContext);
    }
    this._paintDevicePreviews();
    this._paintDisplayTemplateDitheredPreviews();
    this._scheduleCanonicalDesignerPreview();
  },

  // Templates render as crisp HTML/SVG on screen, but the physical e-ink
  // panel only shows a dithered, native-resolution 3-color bitmap - the same
  // one _rasterizeDisplayTemplatePreview produces before sending. Paint that
  // exact bitmap into the dropzone preview (pixelated, no smoothing) so what
  // you see there matches 1:1 what actually gets sent to the display.
  _paintDisplayTemplateDitheredPreviews() {
    const canvases = [...this.shadowRoot.querySelectorAll("canvas[data-dithered-preview]")];
    if (!canvases.length) return;
    this._ditheredPreviewCache ||= {};
    this._ditheredPreviewPending ||= {};
    canvases.forEach((canvas) => {
      const key = canvas.dataset.ditheredPreview || "";
      const address = canvas.dataset.ditheredAddress || "";
      if (!address) return;
      const cached = this._ditheredPreviewCache[address];
      if (cached?.key === key && cached.image?.complete) {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(cached.image, 0, 0, canvas.width, canvas.height);
        return;
      }
      if (this._ditheredPreviewPending[address] === key) return;
      this._ditheredPreviewPending[address] = key;
      const screen = canvas.closest(".designer-device-screen");
      if (!screen) return;
      this._rasterizeDisplayTemplatePreview(screen).then((dataUrl) => {
        if (this._ditheredPreviewPending[address] !== key) return;
        const image = new Image();
        image.onload = () => {
          if (this._ditheredPreviewPending[address] !== key) return;
          this._ditheredPreviewCache[address] = { key, image };
          delete this._ditheredPreviewPending[address];
          this._paintDisplayTemplateDitheredPreviews();
        };
        image.onerror = () => { delete this._ditheredPreviewPending[address]; };
        image.src = dataUrl;
      }).catch(() => { delete this._ditheredPreviewPending[address]; });
    });
  },

  _paintCachedCanonicalPreview(canvas) {
    const image = this._backendPreviewImage;
    const address = this._device()?.address || "";
    if (!image || this._backendPreviewAddress !== address || !image.complete) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  },

  _paintDevicePreviews() {
    const canvases = this.shadowRoot.querySelectorAll("canvas[data-device-preview]");
    if (!canvases.length) return;
    const canonicalRequests = [];
    const previous = {
      objects: this._objects,
      variables: this._variables,
      backgroundColor: this._backgroundColor,
      invertColors: this._invertColors,
    };
    try {
      canvases.forEach((canvas) => {
        const address = String(canvas.dataset.devicePreview || "").toUpperCase();
        const draft = this._deviceDrafts[address];
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        if (this._paintStoredDevicePreview(canvas, address, draft)) return;
        if (!draft) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          return;
        }
        const sourceWidth = Math.max(1, Number(canvas.dataset.sourceWidth || draft.width || canvas.width));
        const sourceHeight = Math.max(1, Number(canvas.dataset.sourceHeight || draft.height || canvas.height));
        this._objects = Array.isArray(draft.objects) ? draft.objects : [];
        this._variables = draft.variables || {};
        this._backgroundColor = ["white", "black", "red"].includes(draft.background_color) ? draft.background_color : "white";
        this._invertColors = !!draft.invert_colors;
        const nativeCanvas = document.createElement("canvas");
        nativeCanvas.width = sourceWidth;
        nativeCanvas.height = sourceHeight;
        this._drawScene(nativeCanvas.getContext("2d", { willReadFrequently: true }), sourceWidth, sourceHeight, false);
        ctx.drawImage(nativeCanvas, 0, 0, canvas.width, canvas.height);
        const device = (this._result?.devices || []).find((item) => String(item.address || "").toUpperCase() === address);
        const automation = this._entityAutomationPayload(device, { width: sourceWidth, height: sourceHeight });
        if (automation.enabled) {
          const keySource = `${automation.base_image}|${JSON.stringify(automation.bindings)}`;
          const key = `${keySource.length}:${this._hash(keySource)}`;
          const cached = this._devicePreviewImages.get(address);
          if (cached?.key === key && cached.image?.complete) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(cached.image, 0, 0, canvas.width, canvas.height);
          } else {
            canonicalRequests.push({ address, automation, key });
          }
        }
      });
    } finally {
      this._objects = previous.objects;
      this._variables = previous.variables;
      this._backgroundColor = previous.backgroundColor;
      this._invertColors = previous.invertColors;
    }
    canonicalRequests.forEach((request) => this._requestCanonicalDevicePreview(request));
  },

  _paintStoredDevicePreview(canvas, address, draft) {
    const source = String(draft?.preview_image || "");
    if (!source.startsWith("data:image/")) return false;
    const key = `sent:${Number(draft?.preview_updated_at || 0)}:${source.length}:${this._hash(source)}`;
    const cached = this._devicePreviewImages.get(address);
    const draw = (target, image) => {
      const context = target.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, target.width, target.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, target.width, target.height);
    };
    if (cached?.key === key && cached.image?.complete) {
      draw(canvas, cached.image);
      return true;
    }
    if (this._devicePreviewRequests.get(address) === key) return true;
    this._devicePreviewRequests.set(address, key);
    const image = new Image();
    image.onload = () => {
      if (this._devicePreviewRequests.get(address) !== key) return;
      this._devicePreviewImages.set(address, { key, image });
      this._devicePreviewRequests.delete(address);
      const currentCanvas = [...this.shadowRoot.querySelectorAll("canvas[data-device-preview]")]
        .find((item) => String(item.dataset.devicePreview || "").toUpperCase() === address);
      if (currentCanvas) draw(currentCanvas, image);
    };
    image.onerror = () => {
      if (this._devicePreviewRequests.get(address) === key) this._devicePreviewRequests.delete(address);
    };
    image.src = source;
    return true;
  },

  async _requestCanonicalDevicePreview({ address, automation, key }) {
    if (this._devicePreviewRequests.get(address) === key) return;
    this._devicePreviewRequests.set(address, key);
    try {
      const source = await this._renderCanonicalPreview(automation, address);
      if (this._devicePreviewRequests.get(address) !== key) return;
      const image = new Image();
      image.src = source;
      await image.decode();
      if (this._devicePreviewRequests.get(address) !== key) return;
      this._devicePreviewImages.set(address, { key, image });
      const canvas = [...this.shadowRoot.querySelectorAll("canvas[data-device-preview]")]
        .find((item) => String(item.dataset.devicePreview || "").toUpperCase() === address);
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } catch (_err) {
      // Lokální canvas zůstává záloha, když Home Assistant backend není dostupný.
    } finally {
      if (this._devicePreviewRequests.get(address) === key) {
        this._devicePreviewRequests.delete(address);
      }
    }
  },

  _drawScene(ctx, width, height, withSelection, excludedIds = null) {
    if (!ctx || !width || !height || width <= 0 || height <= 0) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this._color(this._backgroundColor);
    ctx.fillRect(0, 0, width, height);
    for (const object of this._objects) {
      if (!excludedIds || !excludedIds.has(object.id)) this._drawObject(ctx, object);
    }
    if (this._invertColors) this._applyColorInversion(ctx, width, height);
    this._applyEinkPreview(ctx, width, height);
    if (withSelection) this._drawSelection(ctx);
  },
};
