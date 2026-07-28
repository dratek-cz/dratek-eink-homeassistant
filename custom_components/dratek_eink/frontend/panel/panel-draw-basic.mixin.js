import qrcode from "../qrcode-generator.js";

export const drawBasicMixin = {


  _drawObject(ctx, object) {
    ctx.save();
    const box = this._box(object);
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate((Number(object.rotation || 0) * Math.PI) / 180);
    ctx.translate(-box.w / 2, -box.h / 2);
    if (object.flipH) {
      ctx.translate(box.w, 0);
      ctx.scale(-1, 1);
    }
    if (object.type === "text") this._drawText(ctx, object, box);
    else if (object.type === "rect") this._drawRect(ctx, object, box);
    else if (object.type === "line") this._drawLine(ctx, object);
    else if (object.type === "barcode") this._drawBarcode(ctx, object, box);
    else if (object.type === "qr") this._drawQr(ctx, object, box);
    else if (object.type === "chart") this._drawChart(ctx, object, box);
    else if (object.type === "bar_gauge") this._drawBarGauge(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "pie") this._drawPieChart(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "slider") this._drawSliderWidget(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "potentiometer" || object.type === "gauge") this._drawPotentiometerWidget(ctx, object, 0, 0, box.w, box.h);
    else if (object.type === "image") this._drawImage(ctx, object, box);
    else if (object.type === "layered") this._drawLayeredObject(ctx, object, box);
    ctx.restore();
  },

  _getWidgetValue(object, defaultPct = 0.5) {
    const minVal = Number(object.min_value ?? 0);
    const maxVal = Number(object.max_value ?? 100);
    const rawEntity = object.entityId ? this._entityRawValue(object) : undefined;
    let val;
    if (rawEntity !== undefined && rawEntity !== null && rawEntity !== "") {
      val = Number(rawEntity);
    } else if (object.sample_value !== undefined && object.sample_value !== null && object.sample_value !== "") {
      val = Number(object.sample_value);
    } else {
      val = (minVal + maxVal) * defaultPct;
    }
    if (!Number.isFinite(val)) val = (minVal + maxVal) * defaultPct;
    return { minVal, maxVal, val };
  },

  _drawLayeredObject(ctx, object, box) {
    const master = object.customElementId ? (this._customElements || []).find((e) => e.id === object.customElementId) : null;
    const layers = this._storedRecordList(master?.layers || object.customLayers);
    const canvasWidth = Number(master?.canvas_width || object.customCanvasWidth || 296);
    const canvasHeight = Number(master?.canvas_height || object.customCanvasHeight || 128);
    const conditionRules = master
      ? this._storedRecordList(master.condition_rules).map((rule) => ({ operator: rule.operator, value: rule.value || "", symbol: rule.layer_id || rule.symbol || "" }))
      : this._storedRecordList(object.conditionRules);
    const defaultSymbol = master?.default_layer_id || object.defaultSymbol || layers[0]?.id;
    const entityId = master?.entity_id || object.entityId;

    const rawValue = entityId ? this._entityRawValue({ ...object, entityId }) : "";
    const rule = conditionRules.find((item) => this._customConditionMatches(rawValue, item.operator || "equals", item.value || ""));
    const layerId = rule?.symbol || defaultSymbol || layers[0]?.id;
    const layer = layers.find((item) => item.id === layerId) || layers[0];
    this._drawCustomLayer(ctx, layer, box.w, box.h, canvasWidth, canvasHeight, "", false);
  },

  _textObjectValue(object) {
    const rawEntityValue = object.entityId ? this._entityRawValue(object) : undefined;
    const rawBoundValue = object.entityId ? rawEntityValue : object.variable && object.variableName ? this._variables[object.variableName] : object.text;
    const activeStatusValues = new Set(String(object.statusOnValues || "on,true,1,open,home").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
    return Array.isArray(object.conditionRules) && object.conditionRules.length
      ? (object.conditionRules.find((rule) => this._customConditionMatches(rawBoundValue, rule.operator || "equals", rule.value || ""))?.symbol || object.defaultSymbol || "?")
      : object.statusIcons
        ? (activeStatusValues.has(String(rawBoundValue ?? "").trim().toLowerCase()) ? object.statusOnSymbol || "●" : object.statusOffSymbol || "○")
        : object.entityId
          ? `${object.valuePrefix || ""}${(object.valuePrefix || object.valueSuffix ? rawEntityValue : this._entityValue(object)) ?? object.text ?? ""}${object.valueSuffix || ""}`
          : object.variable && object.variableName
            ? (this._variables[object.variableName] ?? object.text ?? "")
            : (object.text || "");
  },

  _drawText(ctx, object, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = this._color(object.color);
    const value = this._textObjectValue(object);
    const lines = String(value).split("\n");
    const family = '"DRATEK eInk Sans"';
    const weight = object.bold ? "700 " : "600 ";
    const padding = Math.max(0, Number(object.padding || 0));
    const availableW = Math.max(1, box.w - padding * 2);
    const availableH = Math.max(1, box.h - padding * 2);
    const minFontSize = Math.max(10, Number(object.minFontSize || this._readableMinFontSize()));
    let fontSize = Math.max(minFontSize, Number(object.fontSize || 24));
    if (object.autoFit !== false) {
      const measurementSize = 100;
      ctx.font = `${weight}${measurementSize}px ${family}, Arial, sans-serif`;
      const measuredWidth = Math.max(...lines.map((line) => ctx.measureText(line || " ").width), 1);
      const widthFit = availableW * measurementSize / measuredWidth;
      const heightFit = availableH / Math.max(1, lines.length * 1.08);
      fontSize = Math.max(minFontSize, Math.floor(Math.min(widthFit, heightFit)));
    }
    if (this._selectedIds?.includes(object.id)) {
      object._renderedFontSize = fontSize;
      const fontSizeInput = this.shadowRoot?.querySelector('[data-prop="fontSize"]');
      if (fontSizeInput && fontSizeInput !== fontSizeInput.getRootNode()?.activeElement) {
        fontSizeInput.value = String(fontSize);
      }
    }
    ctx.font = `${weight}${fontSize}px ${family}, Arial, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = object.textAlign || "left";
    const lineHeight = fontSize * 1.08;
    const totalHeight = lineHeight * lines.length;
    const startY = padding + (
      object.verticalAlign === "bottom"
        ? Math.max(0, availableH - totalHeight)
        : object.verticalAlign === "middle"
          ? Math.max(0, (availableH - totalHeight) / 2)
          : 0
    );
    const x = ctx.textAlign === "center" ? box.w / 2 : ctx.textAlign === "right" ? box.w - padding : padding;
    lines.forEach((line, index) => this._drawReadableLine(ctx, String(line), x, startY + index * lineHeight, availableW));
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  },

  _readableMinFontSize(sizeOverride = null) {
    const size = sizeOverride || this._displaySize();
    const shortSide = Math.min(size.width, size.height);
    if (shortSide <= 128) return 11;
    if (shortSide <= 168) return 12;
    if (shortSide <= 250) return 13;
    return 14;
  },

  _drawReadableLine(ctx, text, x, y, maxWidth) {
    const metrics = ctx.measureText(text || " ");
    const width = metrics.width;
    const baselineY = y + (Number(metrics.actualBoundingBoxAscent) || Math.max(1, parseFloat(ctx.font) * 0.8));
    if (width <= maxWidth) {
      ctx.fillText(text, x, baselineY);
      return;
    }
    const minScale = 0.84;
    const scale = Math.max(minScale, maxWidth / Math.max(1, width));
    let output = text;
    if (width * minScale > maxWidth) {
      output = this._ellipsizeText(ctx, text, maxWidth / minScale);
    }
    ctx.save();
    ctx.translate(x, baselineY);
    ctx.scale(scale, 1);
    const localX = ctx.textAlign === "center" ? 0 : ctx.textAlign === "right" ? 0 : 0;
    ctx.fillText(output, localX, 0);
    ctx.restore();
  },

  _ellipsizeText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const suffix = "...";
    let output = text;
    while (output.length > 1 && ctx.measureText(output + suffix).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return `${output}${suffix}`;
  },

  _drawRect(ctx, object, box) {
    if (object.fill && object.fill !== "none") {
      ctx.fillStyle = this._color(object.fill);
      ctx.fillRect(0, 0, box.w, box.h);
    }
    if (object.stroke && object.stroke !== "none" && Number(object.strokeWidth) > 0) {
      ctx.strokeStyle = this._color(object.stroke);
      ctx.lineWidth = Number(object.strokeWidth || 1);
      ctx.strokeRect(0, 0, box.w, box.h);
    }
  },

  _drawLine(ctx, object) {
    ctx.strokeStyle = this._color(object.color);
    ctx.lineWidth = Number(object.strokeWidth || 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo((object.x2 || object.x) - object.x, (object.y2 || object.y) - object.y);
    ctx.stroke();
  },

  _drawBarcode(ctx, object, box) {
    const text = this._normalizeEan13(object.text || "8591234567890");
    const pattern = this._ean13Pattern(text);
    const labelHeight = Math.min(20, Math.max(13, Math.floor(box.h * 0.22)));
    const gap = 4;
    const barHeight = Math.max(12, box.h - labelHeight - gap);
    const moduleWidth = Math.max(1, Math.floor(box.w / pattern.length));
    const barcodeWidth = moduleWidth * pattern.length;
    const startX = Math.floor((box.w - barcodeWidth) / 2);
    ctx.fillStyle = this._color(object.backgroundColor || "white");
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = this._color(object.color);
    for (let index = 0; index < pattern.length; index++) {
      if (pattern[index] === "1") ctx.fillRect(startX + index * moduleWidth, 0, moduleWidth, barHeight);
    }
    ctx.font = `${Math.max(10, labelHeight - 5)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, box.w / 2, barHeight + gap);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  },

  _normalizeEan13(value) {
    let digits = String(value).replace(/\D/g, "");
    if (digits.length < 12) digits = digits.padEnd(12, "0");
    if (digits.length > 13) digits = digits.slice(0, 13);
    if (digits.length === 12) digits += this._ean13Checksum(digits);
    return digits.slice(0, 12) + this._ean13Checksum(digits.slice(0, 12));
  },

  _ean13Checksum(twelveDigits) {
    const sum = twelveDigits.split("").reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return String((10 - (sum % 10)) % 10);
  },

  _ean13Pattern(digits) {
    const leftOdd = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
    const leftEven = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
    const right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
    const parity = ["OOOOOO", "OOEOEE", "OOEEOE", "OOEEEO", "OEOOEE", "OEEOOE", "OEEEOO", "OEOEOE", "OEOEEO", "OEEOEO"][Number(digits[0])];
    let pattern = "101";
    for (let i = 1; i <= 6; i++) pattern += parity[i - 1] === "O" ? leftOdd[Number(digits[i])] : leftEven[Number(digits[i])];
    pattern += "01010";
    for (let i = 7; i <= 12; i++) pattern += right[Number(digits[i])];
    return pattern + "101";
  },

  _drawQr(ctx, object, box) {
    const data = String(object.text || "https://dratek.cz");
    const qr = qrcode(0, "M");
    qr.addData(data);
    qr.make();
    const cells = qr.getModuleCount();
    const quiet = 4;
    const cell = Math.max(1, Math.floor(Math.min(box.w, box.h) / (cells + quiet * 2)));
    const total = cell * (cells + quiet * 2);
    const offsetX = Math.floor((box.w - total) / 2) + quiet * cell;
    const offsetY = Math.floor((box.h - total) / 2) + quiet * cell;
    ctx.fillStyle = this._color(object.backgroundColor || "white");
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.fillStyle = this._color(object.color);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        if (qr.isDark(y, x)) ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
      }
    }
  },

  _drawImage(ctx, object, box) {
    if (!object._img && object.image) {
      object._img = new Image();
      object._img.onload = () => this._paint();
      object._img.src = object.image;
    }
    if (object._img && object._img.complete) this._drawTintedCanvasImage(ctx, object._img, 0, 0, box.w, box.h, object.tint || "original");
  },

  _drawTintedCanvasImage(ctx, image, x, y, width, height, tint = "original") {
    if (!["black", "red", "white"].includes(tint)) {
      ctx.drawImage(image, x, y, width, height);
      return;
    }
    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, Math.round(width));
    buffer.height = Math.max(1, Math.round(height));
    const bufferCtx = buffer.getContext("2d", { willReadFrequently: true });
    bufferCtx.drawImage(image, 0, 0, buffer.width, buffer.height);
    bufferCtx.globalCompositeOperation = "source-in";
    bufferCtx.fillStyle = this._color(tint);
    bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
    ctx.drawImage(buffer, x, y, width, height);
  },

  _applyEinkPreview(ctx, width, height) {
    if (!ctx || !width || !height || width <= 0 || height <= 0) return;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const redScore = r - Math.max(g, b);
      const luma = (38 * r + 75 * g + 15 * b) >> 7;
      if (redScore > 45 && r > 120) {
        data[i] = 220; data[i + 1] = 20; data[i + 2] = 12;
      } else if (luma < 160) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
      } else {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  },

  _applyColorInversion(ctx, width, height) {
    if (!ctx || !width || !height || width <= 0 || height <= 0) return;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const redScore = r - Math.max(g, b);
      if (redScore > 45 && r > 110) continue;
      const luma = (38 * r + 75 * g + 15 * b) >> 7;
      const value = luma < 128 ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
  },
};
