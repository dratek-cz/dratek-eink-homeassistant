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
    const canvas = this.shadowRoot.querySelector("#editor");
    if (canvas) {
      this._drawScene(canvas.getContext("2d", { willReadFrequently: true }), canvas.width, canvas.height, false);
      if (this._automaticTextBindings().length) {
        this._paintCachedCanonicalPreview(canvas);
      } else {
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
    this._paintCustomLayerCanvases();
    this._scheduleCanonicalDesignerPreview();
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
    const previous = {
      objects: this._objects,
      variables: this._variables,
      backgroundColor: this._backgroundColor,
      invertColors: this._invertColors,
    };
    try {
      canvases.forEach((canvas) => {
        const draft = this._deviceDrafts[String(canvas.dataset.devicePreview || "").toUpperCase()];
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
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
      });
    } finally {
      this._objects = previous.objects;
      this._variables = previous.variables;
      this._backgroundColor = previous.backgroundColor;
      this._invertColors = previous.invertColors;
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
