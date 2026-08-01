// Native-SVG renderer for display templates.
//
// The previous approach cloned the live HTML preview into an <svg><foreignObject>
// and rasterized that. It depended on Home Assistant's shadow-DOM internals
// (ha-icon renders through a nested ha-svg-icon shadow root), on the panel's
// whole stylesheet resolving correctly inside the export, and on browser layout
// of HTML at a size it was never designed for. Every one of those was a source
// of "the sent image doesn't match the preview" bugs.
//
// Instead we build the template directly as a self-contained SVG document using
// only native SVG primitives (<text>, <path>, <rect>, <line>) laid out at the
// display's exact native resolution. Home Assistant values are substituted as
// plain strings, mdi icons are embedded as real path data, and nothing depends
// on external CSS or fonts beyond a generic sans-serif family. The same SVG is
// used for the on-screen preview and for the bitmap sent to the panel, so they
// are identical by construction.

const RED = "#e31b1b";
const BLACK = "#000000";
const FONT = "Arial, Helvetica, sans-serif";

// Rough advance-width factor for the sans-serif stack above, used to shrink
// text that would otherwise overflow the (very narrow) display.
const widthFactor = (bold) => (bold ? 0.60 : 0.55);

export const templateSvgMixin = {

  // ---------------------------------------------------------------- icons ---

  // Icon geometry, resolved once per icon name by letting Home Assistant's own
  // ha-icon render off-screen and copying whatever it drew. We copy the entire
  // inner SVG rather than hunting for a single <path>, so it works regardless of
  // how the icon is structured internally. Falls back to nothing rendered so a
  // missing icon never breaks the layout.
  async _mdiIconPath(name) {
    this._mdiPathCache ||= new Map();
    if (this._mdiPathCache.has(name)) return this._mdiPathCache.get(name);

    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:24px;height:24px;opacity:0;pointer-events:none";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", `mdi:${name}`);
    host.appendChild(icon);
    (this.shadowRoot || document.body).appendChild(host);

    let resolved = null;
    try {
      for (let attempt = 0; attempt < 40; attempt++) {
        const svg = this._findSvgDeep(icon.shadowRoot) || this._findSvgDeep(icon);
        const inner = svg?.innerHTML?.trim();
        if (inner) {
          resolved = { inner, viewBox: svg.getAttribute("viewBox") || "0 0 24 24" };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      host.remove();
    }
    this._mdiPathCache.set(name, resolved);
    return resolved;
  },

  _templateIconNames(rows) {
    const names = new Set();
    const collect = (row) => {
      if (!row) return;
      if (row.icon) names.add(row.icon);
      (row.footer || []).forEach((cell) => cell.icon && names.add(cell.icon));
      (row.list || []).forEach((cell) => cell.icon && names.add(cell.icon));
    };
    rows.forEach(collect);
    return [...names];
  },

  async _preloadTemplateIcons(rows) {
    await Promise.all(this._templateIconNames(rows).map((name) => this._mdiIconPath(name)));
  },

  // The on-screen preview has to be the very markup that gets rasterized and
  // sent. It used to be a separate HTML rendering laid out by CSS inside a
  // foreignObject, so preview and panel were two different drawings of the same
  // template and could not agree. Icons resolve asynchronously through ha-icon,
  // so return whatever is cached now and re-render once the rest arrive.
  _templateSvgPreviewMarkup(template, width, height) {
    if (!template) return "";
    const rows = this._templateSvgRows(template);
    const names = this._templateIconNames(rows);
    this._mdiPathCache ||= new Map();
    if (!names.every((name) => this._mdiPathCache.has(name)) && !this._templateIconPreloadPending) {
      this._templateIconPreloadPending = true;
      this._preloadTemplateIcons(rows).finally(() => {
        this._templateIconPreloadPending = false;
        this._render();
        this._paint();
      });
    }
    return this._layoutTemplateSvg(rows, width, height);
  },

  // Wrapped as a standalone <svg> so it can sit inside the preview's
  // foreignObject and still scale with the slot. The export path in
  // _rasterizeDisplayTemplatePreview copies this element's innerHTML, so the
  // surrounding .template-responsive-preview-body has to stay in place.
  _templateSvgPreviewBody(template, width, height) {
    const markup = this._templateSvgPreviewMarkup(template, width, height);
    if (!markup) return "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"`
      + ` viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + markup
      + `</svg>`;
  },

  // --------------------------------------------------------------- layout ---

  _svgText(value, x, y, size, options = {}) {
    const text = String(value ?? "");
    if (!text) return "";
    const bold = !!options.bold;
    const maxWidth = options.maxWidth;
    let fontSize = size;
    if (maxWidth) {
      const estimated = text.length * fontSize * widthFactor(bold);
      if (estimated > maxWidth) fontSize = Math.max(5, fontSize * (maxWidth / estimated));
    }
    const anchor = options.anchor || "middle";
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${FONT}" font-size="${fontSize.toFixed(2)}"`
      + ` font-weight="${bold ? 700 : 400}" fill="${options.color || BLACK}" text-anchor="${anchor}"`
      + ` dominant-baseline="central" xml:space="preserve">${this._escape(text)}</text>`;
  },

  _svgIcon(name, cx, cy, size, color = BLACK) {
    const resolved = this._mdiPathCache?.get(name);
    if (!resolved?.inner) return "";
    const x = cx - size / 2;
    const y = cy - size / 2;
    // Nested <svg> re-establishes the icon's own viewBox, so it scales into the
    // requested box no matter what coordinate system the source icon used. The
    // color attribute makes any fill="currentColor" inside resolve correctly.
    return `<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"`
      + ` viewBox="${resolved.viewBox}" fill="${color}" color="${color}">${resolved.inner}</svg>`;
  },

  // Turns the declarative row list into positioned SVG markup filling width x height.
  _layoutTemplateSvg(rows, width, height) {
    const pad = Math.max(3, Math.round(Math.min(width, height) * 0.035));
    const inner = width - pad * 2;
    const footerRow = rows.find((row) => row.footer);
    const flowRows = rows.filter((row) => !row.footer);

    const footerHeight = footerRow ? Math.max(18, Math.round(height * (footerRow.h || 0.16))) : 0;
    const available = height - footerHeight - pad;

    const fixed = flowRows.map((row) => (row.flex ? 0 : Math.max(1, height * (row.h || 0.08))));
    const fixedTotal = fixed.reduce((sum, value) => sum + value, 0);
    const flexCount = flowRows.filter((row) => row.flex).length;
    const scale = fixedTotal > available ? available / fixedTotal : 1;
    const slack = Math.max(0, available - fixedTotal * scale);
    const flexShare = flexCount ? slack / flexCount : 0;

    let y = pad;
    const parts = [];
    flowRows.forEach((row, index) => {
      const rowHeight = row.flex ? flexShare : fixed[index] * scale;
      const centerY = y + rowHeight / 2;
      if (row.icon) {
        parts.push(this._svgIcon(row.icon, width / 2, centerY, Math.min(rowHeight, inner) * 0.92, row.color === "red" ? RED : BLACK));
      } else if (row.rule) {
        const ruleWidth = inner * 0.82;
        parts.push(`<rect x="${((width - ruleWidth) / 2).toFixed(2)}" y="${centerY.toFixed(2)}" width="${ruleWidth.toFixed(2)}" height="1" fill="${row.color === "red" ? RED : BLACK}"></rect>`);
      } else if (row.list) {
        const count = row.list.length || 1;
        const lineHeight = rowHeight / count;
        const fontSize = Math.min(lineHeight * 0.62, inner * 0.11);
        row.list.forEach((cell, cellIndex) => {
          const lineY = y + lineHeight * (cellIndex + 0.5);
          let textX = pad;
          if (cell.icon) {
            const iconSize = lineHeight * 0.66;
            parts.push(this._svgIcon(cell.icon, pad + iconSize / 2, lineY, iconSize, cell.color === "red" ? RED : BLACK));
            textX = pad + iconSize + Math.max(2, iconSize * 0.25);
          }
          if (cell.value != null && cell.label != null) {
            parts.push(this._svgText(cell.label, textX, lineY, fontSize, { anchor: "start", maxWidth: (width - pad - textX) * 0.62 }));
            parts.push(this._svgText(cell.value, width - pad, lineY, fontSize, { anchor: "end", bold: true, color: cell.color === "red" ? RED : BLACK, maxWidth: (width - pad - textX) * 0.42 }));
          } else {
            parts.push(this._svgText(cell.label ?? cell.value, textX, lineY, fontSize, { anchor: "start", bold: !!cell.bold, color: cell.color === "red" ? RED : BLACK, maxWidth: width - pad - textX }));
          }
        });
      } else if (row.text != null) {
        const fontSize = Math.max(6, height * (row.size || 0.05));
        parts.push(this._svgText(row.text, width / 2, centerY, fontSize, {
          bold: !!row.bold,
          color: row.color === "red" ? RED : BLACK,
          maxWidth: inner,
        }));
      }
      y += rowHeight;
    });

    if (footerRow) {
      const top = height - footerHeight;
      parts.push(`<rect x="0" y="${top.toFixed(2)}" width="${width}" height="${footerHeight.toFixed(2)}" fill="${RED}"></rect>`);
      const cells = footerRow.footer;
      const cellWidth = width / (cells.length || 1);
      cells.forEach((cell, index) => {
        const cx = cellWidth * (index + 0.5);
        if (index > 0) {
          parts.push(`<rect x="${(cellWidth * index).toFixed(2)}" y="${(top + footerHeight * 0.15).toFixed(2)}" width="1" height="${(footerHeight * 0.7).toFixed(2)}" fill="#ffffff" opacity="0.5"></rect>`);
        }
        const labelSize = Math.max(6, footerHeight * 0.26);
        const valueSize = Math.max(7, footerHeight * 0.3);
        if (cell.icon) {
          parts.push(this._svgText(cell.label, cx, top + footerHeight * 0.2, labelSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
          parts.push(this._svgIcon(cell.icon, cx, top + footerHeight * 0.5, footerHeight * 0.3, "#ffffff"));
          parts.push(this._svgText(cell.value, cx, top + footerHeight * 0.82, valueSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
        } else {
          parts.push(this._svgText(cell.label, cx, top + footerHeight * 0.32, labelSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
          parts.push(this._svgText(cell.value, cx, top + footerHeight * 0.7, valueSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
        }
      });
    }

    return parts.join("");
  },

  // ------------------------------------------------------------- template ---

  // Declarative content of every template. `v(index, fallback)` resolves the
  // Home Assistant binding for that variable slot, falling back to sample data.
  _templateSvgRows(template) {
    const v = (index, fallback) => this._templateDisplayValue(template, index, fallback);
    const specs = {
      weather: () => [
        { icon: "weather-partly-cloudy", h: 0.20 },
        { text: v(1, "Polojasno"), h: 0.085, size: 0.058, bold: true },
        { text: v(3, "23. května"), h: 0.065, size: 0.044 },
        { rule: true, h: 0.02 },
        { text: v(2, "12:45"), h: 0.095, size: 0.070, bold: true, color: "red" },
        { rule: true, h: 0.02 },
        { text: v(0, "23 °C"), h: 0.145, size: 0.105, bold: true },
        { text: v(4, "24° / 13°"), h: 0.07, size: 0.046 },
        { flex: true },
        { footer: [
          { label: "SO", icon: "weather-partly-cloudy", value: v(4, "22°") },
          { label: "NE", icon: "weather-sunny", value: "25°" },
          { label: "PO", icon: "weather-rainy", value: "18°" },
          { label: "ÚT", icon: "weather-cloudy", value: "20°" },
        ], h: 0.17 },
      ],
      energy: () => [
        { icon: "lightning-bolt", h: 0.16, color: "red" },
        { text: "Cena elektřiny", h: 0.075, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "2,45 Kč"), h: 0.16, size: 0.115, bold: true },
        { text: "Kč / kWh", h: 0.06, size: 0.04 },
        { text: v(1, "12:00–13:00"), h: 0.08, size: 0.052, bold: true },
        { flex: true },
        { footer: [{ label: "NEJLEVNĚJI DNES", value: v(3, "2,45 Kč") }], h: 0.16 },
      ],
      home: () => [
        { icon: "home", h: 0.17, color: "red" },
        { text: "Dům", h: 0.085, size: 0.062, bold: true },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "thermometer", label: "Teplota", value: v(0, "21,5 °C") },
          { icon: "water-percent", label: "Vlhkost", value: v(1, "45 %") },
          { icon: "lightbulb-on", label: "Světla", value: v(2, "3 ON") },
          { icon: "lock", label: "Zámky", value: v(3, "Zamčeno") },
        ], h: 0.44 },
        { flex: true },
        { footer: [{ label: "STAV", value: "Vše v pořádku" }], h: 0.15 },
      ],
      waste: () => [
        { icon: "trash-can-outline", h: 0.18 },
        { text: "Odpady", h: 0.08, size: 0.058, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "ZÍTRA"), h: 0.11, size: 0.08, bold: true, color: "red" },
        { text: "Plast", h: 0.08, size: 0.055 },
        { rule: true, h: 0.02 },
        { text: v(1, "za 7 dní"), h: 0.09, size: 0.062, bold: true },
        { text: v(2, "Papír"), h: 0.075, size: 0.05 },
        { flex: true },
        { footer: [{ label: "SVOZ", value: v(2, "Papír") }], h: 0.15 },
      ],
      solar: () => [
        { icon: "solar-power", h: 0.18 },
        { text: "Fotovoltaika", h: 0.075, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "2,35 kW"), h: 0.155, size: 0.11, bold: true },
        { list: [
          { icon: "weather-sunny", label: "Dnes", value: v(1, "8,2 kWh") },
          { icon: "calendar-month", label: "Měsíc", value: v(2, "152 kWh") },
          { icon: "counter", label: "Celkem", value: v(3, "3,45 MWh") },
        ], h: 0.33 },
        { flex: true },
        { footer: [{ label: "ÚSPORA CO₂", value: v(4, "125 kg") }], h: 0.15 },
      ],
      washer: () => [
        { icon: "washing-machine", h: 0.19 },
        { text: "Pračka", h: 0.08, size: 0.058, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "Bavlna 60°"), h: 0.1, size: 0.07, bold: true, color: "red" },
        { text: "Zbývá", h: 0.06, size: 0.042 },
        { text: v(1, "01:15"), h: 0.14, size: 0.1, bold: true },
        { flex: true },
        { footer: [{ label: "SKONČÍ V", value: v(2, "14:30") }], h: 0.15 },
      ],
      living: () => [
        { icon: "sofa", h: 0.17 },
        { text: "Obývák", h: 0.08, size: 0.058, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "23,5 °C"), h: 0.17, size: 0.12, bold: true },
        { list: [
          { icon: "water-percent", label: "Vlhkost", value: v(1, "40 %") },
          { icon: "molecule-co2", label: "CO₂", value: v(2, "650 ppm") },
        ], h: 0.24 },
        { flex: true },
        { footer: [{ label: "OBÝVÁK", value: v(0, "23,5 °C") }], h: 0.15 },
      ],
      presence: () => [
        { icon: "account-group", h: 0.16 },
        { text: "Kdo je doma", h: 0.08, size: 0.052, bold: true },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "account", label: v(0, "Petr"), value: "Doma", color: "red" },
          { icon: "account", label: "Jana", value: "Doma" },
          { icon: "account", label: "Eliška", value: v(2, "Ve škole") },
        ], h: 0.42 },
        { flex: true },
        { footer: [{ label: "AKTUALIZACE", value: v(3, "12:45") }], h: 0.15 },
      ],
      wifi: () => [
        { icon: "wifi", h: 0.18 },
        { text: "Wi-Fi", h: 0.085, size: 0.062, bold: true },
        { rule: true, h: 0.02 },
        { text: "Síť", h: 0.06, size: 0.042 },
        { text: v(0, "Home_Network"), h: 0.1, size: 0.068, bold: true, color: "red" },
        { text: "Heslo", h: 0.06, size: 0.042 },
        { text: v(1, "MyPassword123"), h: 0.1, size: 0.062, bold: true, color: "red" },
        { flex: true },
        { footer: [{ label: "PŘIPOJENÍ", value: "Wi-Fi" }], h: 0.15 },
      ],
      calendar: () => [
        { icon: "calendar", h: 0.16 },
        { text: "Kalendář", h: 0.08, size: 0.055, bold: true },
        { rule: true, h: 0.02 },
        { text: "PÁTEK", h: 0.07, size: 0.048, bold: true, color: "red" },
        { text: v(0, "Schůzka"), h: 0.1, size: 0.068, bold: true },
        { text: "15:00", h: 0.06, size: 0.044 },
        { rule: true, h: 0.02 },
        { text: "SOBOTA", h: 0.065, size: 0.045, bold: true },
        { text: v(1, "Narozeniny"), h: 0.085, size: 0.058 },
        { flex: true },
        { footer: [{ label: "SVÁTEK", value: v(2, "Jana") }], h: 0.15 },
      ],
      security: () => [
        { icon: "shield-home", h: 0.18 },
        { text: "Zabezpečení", h: 0.075, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "ZAPNUTO"), h: 0.12, size: 0.085, bold: true, color: "red" },
        { list: [
          { icon: "door-closed-lock", label: "Dveře", value: v(1, "Zamčeno") },
          { icon: "window-closed", label: "Okna", value: v(2, "Zavřeno") },
          { icon: "motion-sensor", label: "Pohyb", value: v(3, "Klid") },
        ], h: 0.34 },
        { flex: true },
        { footer: [{ label: "ZÓNY", value: "V pořádku" }], h: 0.15 },
      ],
      transport: () => [
        { icon: "tram", h: 0.16 },
        { text: v(0, "Hlavní nádraží"), h: 0.08, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "tram", label: `${v(1, "9")} Náměstí`, value: v(2, "3 min"), color: "red" },
          { icon: "tram", label: "4 Univerzita", value: "8 min" },
          { icon: "tram", label: "12 Nemocnice", value: "14 min" },
        ], h: 0.42 },
        { flex: true },
        { footer: [{ label: "ZASTÁVKA", value: v(3, "240 m") }], h: 0.15 },
      ],
      shopping: () => [
        { icon: "cart-outline", h: 0.16 },
        { text: "Nákupní seznam", h: 0.075, size: 0.048, bold: true },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "checkbox-marked", label: v(0, "Mléko") },
          { icon: "checkbox-blank-outline", label: "Chléb" },
          { icon: "checkbox-blank-outline", label: "Jablka" },
          { icon: "checkbox-blank-outline", label: "Káva" },
          { icon: "checkbox-blank-outline", label: v(1, "Prací gel") },
        ], h: 0.48 },
        { flex: true },
        { footer: [{ label: "ZBÝVÁ", value: v(2, "4 položky") }], h: 0.15 },
      ],
      air: () => [
        { icon: "air-filter", h: 0.18 },
        { text: "Kvalita vzduchu", h: 0.07, size: 0.046, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "42 AQI"), h: 0.15, size: 0.105, bold: true },
        { text: "Výborná", h: 0.065, size: 0.045, color: "red" },
        { list: [
          { icon: "molecule-co2", label: "CO₂", value: v(1, "612 ppm") },
          { icon: "blur", label: "PM2.5", value: v(2, "8 µg") },
          { icon: "water-percent", label: "Vlhkost", value: v(3, "46 %") },
        ], h: 0.3 },
        { flex: true },
        { footer: [{ label: "AQI", value: v(0, "42") }], h: 0.14 },
      ],
      thermostat: () => [
        { icon: "thermostat", h: 0.18 },
        { text: "Topení", h: 0.08, size: 0.058, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "21,5 °C"), h: 0.16, size: 0.115, bold: true },
        { list: [
          { icon: "thermostat", label: "Cíl", value: v(1, "22 °C") },
          { icon: "fire", label: "Výkon", value: v(2, "60 %"), color: "red" },
        ], h: 0.24 },
        { flex: true },
        { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: 0.15 },
      ],
      water: () => [
        { icon: "water-pump", h: 0.18 },
        { text: "Spotřeba vody", h: 0.075, size: 0.048, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "126 l"), h: 0.16, size: 0.115, bold: true },
        { text: "Dnes", h: 0.06, size: 0.042 },
        { list: [
          { icon: "calendar-week", label: "Týden", value: v(1, "0,84 m³") },
          { icon: "calendar-month", label: "Měsíc", value: v(2, "3,12 m³") },
        ], h: 0.24 },
        { flex: true },
        { footer: [{ label: "POROVNÁNÍ", value: v(3, "-12 %") }], h: 0.15 },
      ],
      parcel: () => [
        { icon: "package-variant-closed", h: 0.18 },
        { text: "Zásilka", h: 0.08, size: 0.058, bold: true },
        { rule: true, h: 0.02 },
        { text: v(0, "Na cestě"), h: 0.11, size: 0.078, bold: true, color: "red" },
        { text: v(1, "RR 458 921 730 CZ"), h: 0.075, size: 0.042 },
        { list: [
          { icon: "check-circle", label: "Převzato" },
          { icon: "check-circle", label: "Depo Brno" },
          { icon: "truck-delivery-outline", label: v(2, "Doručení dnes"), color: "red" },
        ], h: 0.3 },
        { flex: true },
        { footer: [{ label: "DORUČENÍ", value: v(3, "13:00–15:00") }], h: 0.15 },
      ],
      birthdays: () => [
        { icon: "cake-variant", h: 0.19 },
        { text: "Narozeniny", h: 0.075, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { text: "Dnes slaví", h: 0.065, size: 0.045 },
        { text: v(0, "Lucie"), h: 0.135, size: 0.095, bold: true, color: "red" },
        { text: v(1, "32 let"), h: 0.08, size: 0.055 },
        { rule: true, h: 0.02 },
        { text: `${v(2, "Tomáš")} · za 4 dny`, h: 0.075, size: 0.045 },
        { flex: true },
        { footer: [{ label: "PŘIPOMÍNKA", value: v(3, "Popřát") }], h: 0.15 },
      ],
      server: () => [
        { icon: "server-network", h: 0.16 },
        { text: "Home server", h: 0.075, size: 0.05, bold: true },
        { text: v(0, "ONLINE"), h: 0.085, size: 0.06, bold: true, color: "red" },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "chip", label: "CPU", value: v(1, "24 %") },
          { icon: "memory", label: "RAM", value: v(2, "61 %") },
          { icon: "harddisk", label: "Disk", value: v(3, "73 %") },
          { icon: "thermometer", label: "Teplota", value: v(4, "48 °C") },
        ], h: 0.44 },
        { flex: true },
        { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: 0.14 },
      ],
      garden: () => [
        { icon: "flower", h: 0.17 },
        { text: v(0, "Záhon rajčat"), h: 0.08, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { text: v(1, "36 %"), h: 0.16, size: 0.115, bold: true },
        { text: "Vlhkost půdy", h: 0.06, size: 0.042 },
        { list: [
          { icon: "weather-sunny", label: "Teplota", value: v(2, "24 °C") },
          { icon: "weather-windy", label: "Vítr", value: v(3, "8 km/h") },
        ], h: 0.24 },
        { flex: true },
        { footer: [{ label: "ZÁLIVKA", value: v(4, "18:30") }], h: 0.15 },
      ],
    };
    const build = specs[template?.id];
    return build ? build() : [
      { icon: "shape-outline", h: 0.22 },
      { text: template?.title || "Šablona", h: 0.1, size: 0.07, bold: true },
      { flex: true },
    ];
  },

  // ---------------------------------------------------------------- export ---

  // Builds the complete SVG document for one or two templates at the display's
  // native resolution. Two templates split the panel down the middle (or across
  // it when stacked), matching how they are arranged in the editor.
  async _buildDisplayTemplateSvg(templates, width, height, layout = "single") {
    const list = templates.filter(Boolean);
    if (!list.length) throw new Error("Není vybrána žádná šablona.");

    const slots = list.length > 1 && layout !== "single"
      ? (layout === "stacked"
        ? [{ x: 0, y: 0, w: width, h: height / 2 }, { x: 0, y: height / 2, w: width, h: height / 2 }]
        : [{ x: 0, y: 0, w: width / 2, h: height }, { x: width / 2, y: 0, w: width / 2, h: height }])
      : [{ x: 0, y: 0, w: width, h: height }];

    const bodies = [];
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      const template = list[index] || list[0];
      const rows = this._templateSvgRows(template);
      await this._preloadTemplateIcons(rows);
      const markup = this._layoutTemplateSvg(rows, slot.w, slot.h);
      bodies.push(`<g transform="translate(${slot.x.toFixed(2)},${slot.y.toFixed(2)})">`
        + `<rect x="0" y="0" width="${slot.w.toFixed(2)}" height="${slot.h.toFixed(2)}" fill="#ffffff"></rect>`
        + markup + `</g>`);
      if (index > 0) {
        bodies.push(layout === "stacked"
          ? `<rect x="0" y="${slot.y.toFixed(2)}" width="${width}" height="1" fill="${BLACK}"></rect>`
          : `<rect x="${slot.x.toFixed(2)}" y="0" width="1" height="${height}" fill="${BLACK}"></rect>`);
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + bodies.join("")
      + `</svg>`;
  },

  // Rasterizes the SVG at exactly the panel's resolution and quantizes it to the
  // three colors the hardware can actually show.
  _quantizeEinkPixel(red, green, blue) {
    // Subpixel font antialiasing can produce reddish edge pixels even for text
    // whose requested fill is pure black. Only preserve red when it is strongly
    // dominant; all neutral and weakly tinted edge pixels are classified solely
    // by luminance, so black glyphs cannot acquire a red halo.
    const redDominance = red - Math.max(green, blue);
    const intentionalRed = red >= 105
      && redDominance >= 52
      && green <= 145
      && blue <= 145;
    // Must stay equal to BWR_RED in render.py, otherwise a backend rendered
    // automatic update and a panel rendered manual send show different reds.
    if (intentionalRed) return [220, 20, 12];
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    return luminance < 168 ? [0, 0, 0] : [255, 255, 255];
  },

  async _rasterizeDisplayTemplateSvg(templates, width, height, layout = "single") {
    const svg = await this._buildDisplayTemplateSvg(templates, width, height, layout);
    const bitmap = new Image();
    await new Promise((resolve, reject) => {
      bitmap.onload = resolve;
      bitmap.onerror = () => reject(new Error("Šablonu se nepodařilo převést na obrázek."));
      bitmap.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const color = this._quantizeEinkPixel(red, green, blue);
      pixels.data[index] = color[0];
      pixels.data[index + 1] = color[1];
      pixels.data[index + 2] = color[2];
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  },
};
