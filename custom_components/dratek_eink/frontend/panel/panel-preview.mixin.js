export const previewMixin = {


  _paint() {
    if (this._paintedInCurrentTask) return;
    this._paintedInCurrentTask = true;
    queueMicrotask(() => {
      this._paintedInCurrentTask = false;
    });
    if (document.fonts && !this._designerFontReady) {
      this._ensureDesignerFont();
      return;
    }
    const canvas = this.shadowRoot.querySelector("#editor");
    if (canvas) {
      this._drawScene(canvas.getContext("2d", { willReadFrequently: true }), canvas.width, canvas.height, false);
    }
    const selectionCanvas = this.shadowRoot.querySelector("#editorSelection");
    if (selectionCanvas) {
      const selectionContext = selectionCanvas.getContext("2d", { willReadFrequently: true });
      selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
      this._drawSelection(selectionContext);
    }
    this._paintDevicePreviews();
    this._paintDisplayTemplateDitheredPreviews();
  },

  // The physical e-ink panel shows a 3-color bitmap at its own native
  // resolution, so paint the very same WYSIWYG bitmap that gets sent into the
  // dropzone preview, pixelated and unsmoothed. Preview and sent image are
  // then identical by construction.
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
      const device = (this._result?.devices || []).find((item) => String(item.address || "").toUpperCase() === address.toUpperCase());
      if (!device) { delete this._ditheredPreviewPending[address]; return; }
      this._renderCurrentDisplayTemplateImage(device).then((dataUrl) => {
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
        const address = String(canvas.dataset.devicePreview || "").toUpperCase();
        const draft = this._deviceDrafts[address];
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        if (this._paintStoredDevicePreview(canvas, address, draft)) return;
        // A physical-device preview must never silently substitute an unsent
        // editor draft. Until the first successful write is recorded, the
        // truthful state is an empty/unknown screen.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });
    } finally {
      this._objects = previous.objects;
      this._variables = previous.variables;
      this._backgroundColor = previous.backgroundColor;
      this._invertColors = previous.invertColors;
    }
  },

  _paintStoredDevicePreview(canvas, address, draft) {
    const device = (this._result?.devices || []).find((item) => String(item.address || "").toUpperCase() === address);
    const source = String(draft?.preview_image || device?.preview_image || device?.last_image || "");
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
