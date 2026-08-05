export const drawChartsMixin = {


  _drawBarGauge(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.6);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "%");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const isHorizontal = object.orientation !== "vertical";
    const showValue = object.show_value !== false;
    const valueBand = showValue ? Math.min(Math.max(13, Math.round(h * 0.42)), Math.max(13, h - 8)) : 0;
    const trackX = x + 1;
    const trackY = y + valueBand + 1;
    const trackW = Math.max(3, w - 2);
    const trackH = Math.max(4, h - valueBand - 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = this._color(object.stroke && object.stroke !== "none" ? object.stroke : "black");
    ctx.lineWidth = Math.max(1, Math.min(3, Number(object.stroke_width || 1)));
    ctx.strokeRect(trackX + 0.5, trackY + 0.5, Math.max(1, trackW - 1), Math.max(1, trackH - 1));
    const fillColor = this._color(object.fill && object.fill !== "none" ? object.fill : object.color || "black");
    ctx.fillStyle = fillColor;
    if (isHorizontal) {
      const fillW = Math.round(Math.max(0, trackW - 2) * pct);
      if (fillW > 0) ctx.fillRect(trackX + 1, trackY + 1, fillW, Math.max(1, trackH - 2));
    } else {
      const barH = Math.round(Math.max(0, trackH - 2) * pct);
      if (barH > 0) ctx.fillRect(trackX + 1, trackY + trackH - 1 - barH, Math.max(1, trackW - 2), barH);
    }
    if (showValue) {
      ctx.fillStyle = "#000";
      ctx.font = `700 ${Math.max(9, Math.min(18, valueBand - 3))}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Number(val.toFixed(1))} ${unit}`.trim(), x + w / 2, y + valueBand / 2, w - 4);
    }
    ctx.restore();
  },

  _drawPieChart(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.7);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "%");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const showValue = object.show_value !== false;
    const holePct = Math.max(0, Math.min(80, Number(object.hole_percent ?? 45))) / 100;
    const separateValue = showValue && holePct < 0.32;
    const valueBand = separateValue ? Math.min(16, Math.max(11, Math.round(h * 0.2))) : 0;
    const cx = x + w / 2;
    const cy = y + (h - valueBand) / 2;
    const r = Math.max(4, Math.min(w, h - valueBand) / 2 - 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.stroke();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + pct * Math.PI * 2;
    if (pct > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = this._color(object.color || "black");
      ctx.fill();
    }
    if (holePct > 0) {
      const holeR = r * holePct;
      ctx.beginPath();
      ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }
    if (showValue) {
      const text = `${Number(val.toFixed(1))}${unit}`;
      const textY = separateValue ? y + h - valueBand / 2 : cy;
      const maxTextWidth = separateValue ? Math.max(8, w - 4) : Math.max(8, r * holePct * 1.72);
      const fontSize = separateValue
        ? Math.max(8, Math.min(14, valueBand - 2))
        : Math.max(7, Math.min(16, Math.round(r * Math.max(0.25, holePct) * 0.72)));
      ctx.fillStyle = "#000";
      ctx.font = `700 ${fontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, textY, maxTextWidth);
    }
    ctx.restore();
  },

  _drawSliderWidget(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.5);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "°C");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const valueBand = object.show_value !== false ? Math.min(16, Math.max(11, Math.round(h * 0.34))) : 2;
    const labelBand = Math.min(10, Math.max(7, Math.round(h * 0.2)));
    const trackY = y + valueBand + Math.max(4, (h - valueBand - labelBand) * 0.45);
    const margin = 12;
    const trackW = Math.max(10, w - margin * 2);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + margin, trackY);
    ctx.lineTo(x + margin + trackW, trackY);
    ctx.stroke();
    const color = this._color(object.color || "black");
    const fillW = trackW * pct;
    if (fillW > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + margin, trackY);
      ctx.lineTo(x + margin + fillW, trackY);
      ctx.stroke();
    }
    const thumbX = x + margin + fillW;
    ctx.beginPath();
    ctx.arc(thumbX, trackY, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.font = `600 ${Math.max(7, Math.min(9, labelBand))}px "DRATEK eInk Sans",Arial,sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`${minVal}`, x + margin, y + h);
    ctx.textAlign = "right";
    ctx.fillText(`${maxVal}`, x + margin + trackW, y + h);
    if (object.show_value !== false) {
      ctx.font = `700 ${Math.max(8, Math.min(14, valueBand - 2))}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Number(val.toFixed(1))} ${unit}`.trim(), x + w / 2, y + valueBand / 2, w - 4);
    }
    ctx.restore();
  },

  _drawPotentiometerWidget(ctx, object, x, y, w, h, sampleVal = null) {
    ctx.save();
    const { minVal, maxVal, val: resolvedVal } = this._getWidgetValue(object, 0.72);
    const val = sampleVal !== null ? sampleVal : resolvedVal;
    const unit = String(object.unit || "°C");
    const pct = Math.max(0, Math.min(1, (val - minVal) / Math.max(0.0001, maxVal - minVal)));
    const mode = object.arc_mode || "240";
    let startAngle = Math.PI * (5 / 6);
    let endAngle = Math.PI * (13 / 6);
    if (mode === "180") {
      startAngle = Math.PI;
      endAngle = Math.PI * 2;
    } else if (mode === "360") {
      startAngle = -Math.PI / 2;
      endAngle = Math.PI * 1.5;
    }
    const cx = x + w / 2;
    const cy = y + (mode === "180" ? h * 0.8 : h * 0.52);
    const r = Math.max(6, Math.min(w, h * (mode === "180" ? 0.75 : 0.44)) - 6);
    const strokeW = Math.max(2, Number(object.stroke_width || 6));
    const color = this._color(object.color || "black");
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(1, Math.min(2, strokeW));
    ctx.lineCap = "round";
    ctx.stroke();
    const currentAngle = startAngle + pct * (endAngle - startAngle);
    if (object.show_arc !== false && pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, currentAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    if (object.show_needle !== false) {
      const needleR = r * 0.82;
      const nx = cx + Math.cos(currentAngle) * needleR;
      const ny = cy + Math.sin(currentAngle) * needleR;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, strokeW * 0.6);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, strokeW * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.fillStyle = "#555";
    ctx.font = '600 9px "DRATEK eInk Sans",Arial,sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const minLx = cx + Math.cos(startAngle) * (r + 10);
    const minLy = cy + Math.sin(startAngle) * (r + 10);
    const maxLx = cx + Math.cos(endAngle) * (r + 10);
    const maxLy = cy + Math.sin(endAngle) * (r + 10);
    ctx.fillText(`${minVal}`, minLx, minLy);
    ctx.fillText(`${maxVal}`, maxLx, maxLy);
    if (object.show_value !== false) {
      const text = `${Number(val.toFixed(1))} ${unit}`.trim();
      const fontSize = Math.max(8, Math.min(16, Math.round(r * 0.34)));
      const textY = mode === "360" ? cy : Math.min(y + h - fontSize / 2 - 1, cy + r * 0.58);
      ctx.fillStyle = "#000";
      ctx.font = `700 ${fontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const textWidth = Math.min(w - 4, ctx.measureText(text).width + 6);
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - textWidth / 2, textY - fontSize * 0.58, textWidth, fontSize * 1.16);
      ctx.fillStyle = "#000";
      ctx.fillText(text, cx, textY, w - 6);
    }
    ctx.restore();
  },

  _chartValues(object) {
    const raw = String(object.entityId
      ? (this._entityValue(object) || object.data || "")
      : object.variable && object.variableName
        ? (this._variables[object.variableName] ?? object.data ?? "")
        : (object.data || "")).trim();
    let values = [];
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) values = parsed.map(Number).filter(Number.isFinite);
      } catch (_err) { /* Use the text parser below. */ }
    }
    if (!values.length) {
      const parts = raw.includes(";")
        ? raw.split(/[;\n]+/).map((value) => value.trim().replace(",", "."))
        : raw.split(/[,\s\n]+/);
      values = parts.map(Number).filter(Number.isFinite);
    }
    return values.slice(-Math.max(2, Math.min(96, Number(object.maxPoints || 24))));
  },

  _drawChart(ctx, object, box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = this._color(object.backgroundColor || "white");
    ctx.fillRect(0, 0, box.w, box.h);
    const values = this._chartValues(object);
    const color = this._color(object.color || "black");
    const graphColor = this._color(object.graphColor || "black");
    const legendFontSize = Math.max(10, Math.min(24, Number(object.legendFontSize || 12)));
    const title = String(object.chartTitle || "").trim();
    const showAxes = object.showAxes !== false;
    const left = showAxes ? Math.max(object.yLabel ? 46 : 25, Math.round(legendFontSize * 3.4)) : 5;
    const right = 6;
    const top = title ? Math.max(17, legendFontSize + 8) : 5;
    const bottom = showAxes ? Math.max(object.xLabel ? 22 : 14, object.xLabel ? legendFontSize * 2.4 : legendFontSize + 7) : 5;
    const plotW = Math.max(8, box.w - left - right);
    const plotH = Math.max(8, box.h - top - bottom);

    ctx.fillStyle = graphColor;
    ctx.font = `700 ${Math.min(24, legendFontSize + 2)}px "DRATEK eInk Sans",Arial,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (title) ctx.fillText(title, box.w / 2, 2, Math.max(10, box.w - 8));
    if (!values.length) {
      ctx.font = '700 11px "DRATEK eInk Sans",Arial,sans-serif';
      ctx.textBaseline = "middle";
      ctx.fillText("Zadejte data grafu", box.w / 2, box.h / 2);
      ctx.restore();
      return;
    }

    const explicitMin = String(object.chartMin ?? "").trim() !== "" ? Number(object.chartMin) : null;
    const explicitMax = String(object.chartMax ?? "").trim() !== "" ? Number(object.chartMax) : null;
    let min = Number.isFinite(explicitMin) ? explicitMin : Math.min(...values);
    let max = Number.isFinite(explicitMax) ? explicitMax : Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    if (min > max) [min, max] = [max, min];
    if (!Number.isFinite(explicitMin) || !Number.isFinite(explicitMax)) {
      const padding = Math.max(0.01, (max - min) * 0.06);
      if (!Number.isFinite(explicitMin)) min -= padding;
      if (!Number.isFinite(explicitMax)) max += padding;
    }
    const yFor = (value) => top + plotH - ((value - min) / Math.max(0.000001, max - min)) * plotH;
    const xFor = (index) => object.chartType === "bar"
      ? left + ((index + 0.5) / Math.max(1, values.length)) * plotW
      : left + (values.length === 1 ? plotW / 2 : (index / (values.length - 1)) * plotW);

    if (object.showGrid !== false) {
      ctx.strokeStyle = graphColor;
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([2, 2]);
      for (let step = 0; step <= 3; step++) {
        const y = top + (plotH * step) / 3;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke();
      }
      const verticals = Math.min(6, Math.max(2, values.length - 1));
      for (let step = 0; step <= verticals; step++) {
        const x = left + (plotW * step) / verticals;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (showAxes) {
      ctx.strokeStyle = graphColor;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, top + plotH); ctx.lineTo(left + plotW, top + plotH); ctx.stroke();
      ctx.fillStyle = graphColor;
      ctx.font = `400 ${legendFontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(this._formatChartNumber(max), left - 3, top + 2);
      ctx.fillText(this._formatChartNumber(min), left - 3, top + plotH - 2);
      const labels = String(object.chartLabels || "").split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean).slice(-values.length);
      const labelIndexes = values.length > 2 && plotW > 140 ? [0, Math.floor((values.length - 1) / 2), values.length - 1] : [0, values.length - 1];
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const index of [...new Set(labelIndexes)]) ctx.fillText(labels[index] || String(index + 1), xFor(index), top + plotH + 3, 34);
      ctx.font = `600 ${Math.min(18, legendFontSize + 1)}px "DRATEK eInk Sans",Arial,sans-serif`;
      if (object.xLabel) ctx.fillText(String(object.xLabel), left + plotW / 2, box.h - legendFontSize - 2, plotW);
      if (object.yLabel) {
        ctx.save();
        ctx.translate(7, top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = "top";
        ctx.fillText(String(object.yLabel), 0, 0, plotH);
        ctx.restore();
      }
    }

    if (object.chartType === "bar") {
      const slot = plotW / Math.max(1, values.length);
      const barW = Math.max(1, slot * 0.62);
      const baselineValue = min <= 0 && max >= 0 ? 0 : min;
      const baselineY = yFor(baselineValue);
      const barColor = object.barColor || "red";
      ctx.fillStyle = this._color(barColor);
      values.forEach((value, index) => {
        const x = left + index * slot + (slot - barW) / 2;
        const y = yFor(value);
        const barY = Math.min(y, baselineY);
        const barH = Math.max(1, Math.abs(baselineY - y));
        ctx.fillRect(x, barY, barW, barH);
        if (barColor === "white") {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, barY + 0.5, Math.max(0, barW - 1), Math.max(0, barH - 1));
        }
      });
    } else {
      if (object.chartType === "area") {
        const baselineValue = min <= 0 && max >= 0 ? 0 : min;
        const baselineY = yFor(baselineValue);
        ctx.beginPath();
        ctx.moveTo(xFor(0), baselineY);
        values.forEach((value, index) => ctx.lineTo(xFor(index), yFor(value)));
        ctx.lineTo(xFor(values.length - 1), baselineY);
        ctx.closePath();
        ctx.fillStyle = object.color === "red" ? "rgba(212,20,20,.35)" : "rgba(0,0,0,.28)";
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, Number(object.strokeWidth || 2));
      ctx.beginPath();
      values.forEach((value, index) => index ? ctx.lineTo(xFor(index), yFor(value)) : ctx.moveTo(xFor(index), yFor(value)));
      ctx.stroke();
      ctx.fillStyle = color;
      if (object.xLabel) ctx.fillText(String(object.xLabel), left + plotW / 2, box.h - legendFontSize - 2, plotW);
      if (object.yLabel) {
        ctx.save();
        ctx.translate(7, top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = "top";
        ctx.fillText(String(object.yLabel), 0, 0, plotH);
        ctx.restore();
      }
    }

    if (object.chartType === "bar") {
      const slot = plotW / Math.max(1, values.length);
      const barW = Math.max(1, slot * 0.62);
      const baselineValue = min <= 0 && max >= 0 ? 0 : min;
      const baselineY = yFor(baselineValue);
      const barColor = object.barColor || "red";
      ctx.fillStyle = this._color(barColor);
      values.forEach((value, index) => {
        const x = left + index * slot + (slot - barW) / 2;
        const y = yFor(value);
        const barY = Math.min(y, baselineY);
        const barH = Math.max(1, Math.abs(baselineY - y));
        ctx.fillRect(x, barY, barW, barH);
        if (barColor === "white") {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, barY + 0.5, Math.max(0, barW - 1), Math.max(0, barH - 1));
        }
      });
    } else {
      if (object.chartType === "area") {
        const baselineValue = min <= 0 && max >= 0 ? 0 : min;
        const baselineY = yFor(baselineValue);
        ctx.beginPath();
        ctx.moveTo(xFor(0), baselineY);
        values.forEach((value, index) => ctx.lineTo(xFor(index), yFor(value)));
        ctx.lineTo(xFor(values.length - 1), baselineY);
        ctx.closePath();
        ctx.fillStyle = object.color === "red" ? "rgba(212,20,20,.35)" : "rgba(0,0,0,.28)";
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, Number(object.strokeWidth || 2));
      ctx.beginPath();
      values.forEach((value, index) => index ? ctx.lineTo(xFor(index), yFor(value)) : ctx.moveTo(xFor(index), yFor(value)));
      ctx.stroke();
      ctx.fillStyle = color;
      values.forEach((value, index) => { ctx.beginPath(); ctx.arc(xFor(index), yFor(value), 1.7, 0, Math.PI * 2); ctx.fill(); });
    }

    if (object.showValues) {
      ctx.fillStyle = graphColor;
      ctx.font = `700 ${legendFontSize}px "DRATEK eInk Sans",Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const every = values.length <= 10 ? 1 : Math.ceil(values.length / 8);
      values.forEach((value, index) => {
        if (index % every !== 0 && index !== values.length - 1) return;
        const text = this._formatChartNumber(value);
        const textWidth = ctx.measureText(text).width;
        const textY = Math.max(top + legendFontSize + 1, yFor(value) - 2);
        ctx.fillStyle = "#fff";
        ctx.fillRect(xFor(index) - textWidth / 2 - 1, textY - legendFontSize - 1, textWidth + 2, legendFontSize + 2);
        ctx.fillStyle = graphColor;
        ctx.fillText(text, xFor(index), textY);
      });
    }
  },

  _formatChartNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    const digits = Math.abs(number) >= 100 ? 0 : Math.abs(number) >= 10 ? 1 : 2;
    return number.toFixed(digits).replace(".", ",");
  },
};
