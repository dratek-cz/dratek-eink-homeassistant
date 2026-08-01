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

// Advance width of one glyph as a fraction of the font size, per character class,
// measured off the Arial/Helvetica stack above.
//
// This was a single flat factor, and a flat factor is wrong in both directions at
// once: it under-measured an all-caps string by a fifth and over-measured a run of
// digits by the same. Shrink-to-fit believed "ZAPNUTO" fitted a 272 px panel when
// it was 15 px wider, and shrank "3 / 3 v pořádku" that did fit. Uppercase is
// detected by case-folding rather than a character range so Czech diacritics -
// Á, Č, Ř, Ž - are not mistaken for lowercase.
const glyphWidth = (character, bold) => {
  if (/[mwMW]/.test(character)) return bold ? 0.87 : 0.83;
  if (/[IJLT]/.test(character)) return bold ? 0.52 : 0.49;
  if (/[fijlrt]/.test(character)) return bold ? 0.32 : 0.27;
  if (/[0-9]/.test(character)) return 0.56;
  if (/[\s.,:;'`|!]/.test(character)) return 0.28;
  if (/[-–·/()[\]]/.test(character)) return 0.36;
  if (/[—%@]/.test(character)) return 0.95;
  if (character !== character.toLowerCase()) return bold ? 0.72 : 0.70;
  return bold ? 0.58 : 0.53;
};

// Where the stacked layout gives way to two columns. Above 4:3 - so 296x128,
// 250x128, 800x480, 1360x480 and the rest of the wide tags, but not the 4:3
// 400x300 and 1600x1200 panels, which have the height to stack comfortably.
const LANDSCAPE_ASPECT = 1.35;

// Resolved icon geometry is shared by every template, every preview slot and
// every panel instance, so it lives at module scope. A cache hung off the
// component was thrown away whenever the panel element was re-created, and the
// same handful of mdi icons then had to be resolved through ha-icon all over
// again - one visible blank-icon delay per visit to the designer.
const ICON_GEOMETRY = new Map();
const ICON_REQUESTS = new Map();
let TEMPLATE_ICONS_WARMED = false;

export const templateSvgMixin = {

  // ---------------------------------------------------------------- icons ---

  // Icon geometry, resolved once per icon name by letting Home Assistant's own
  // ha-icon render off-screen and copying whatever it drew. We copy the entire
  // inner SVG rather than hunting for a single <path>, so it works regardless of
  // how the icon is structured internally. Falls back to nothing rendered so a
  // missing icon never breaks the layout.
  _mdiIconPath(name) {
    if (ICON_GEOMETRY.has(name)) return Promise.resolve(ICON_GEOMETRY.get(name));
    let request = ICON_REQUESTS.get(name);
    if (!request) {
      request = this._resolveMdiIcon(name)
        .catch(() => null)
        .then((resolved) => {
          ICON_REQUESTS.delete(name);
          // Only a hit is worth remembering. A miss almost always means Home
          // Assistant had not finished loading its icon chunk yet, and caching
          // that used to freeze the icon out of every later render for good.
          if (resolved) ICON_GEOMETRY.set(name, resolved);
          return resolved;
        });
      // Sharing the promise matters as much as the cache does: two preview slots
      // asking for the same icon used to mount two ha-icons and run two polling
      // loops for one answer.
      ICON_REQUESTS.set(name, request);
    }
    return request;
  },

  async _resolveMdiIcon(name) {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:24px;height:24px;opacity:0;pointer-events:none";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", `mdi:${name}`);
    host.appendChild(icon);
    (this.shadowRoot || document.body).appendChild(host);

    try {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const svg = this._findSvgDeep(icon.shadowRoot) || this._findSvgDeep(icon);
        const inner = svg?.innerHTML?.trim();
        if (inner) return { inner, viewBox: svg.getAttribute("viewBox") || "0 0 24 24" };
        // ha-icon fills its shadow root while painting a frame, so waking on the
        // next frame sees the geometry the moment it exists rather than up to a
        // fixed 50 ms later. The timer is the fallback for a backgrounded tab,
        // where animation frames stop arriving at all.
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
          setTimeout(resolve, 50);
        });
      }
    } finally {
      host.remove();
    }
    return null;
  },

  // Every block kind that can carry icons has to be walked here. _svgIcon draws
  // only what this preloaded, so a cell kind missing from this list renders as a
  // silent hole in the layout rather than as an error.
  _templateIconNames(rows) {
    const names = new Set();
    const cells = (list) => (list || []).forEach((cell) => cell?.icon && names.add(cell.icon));
    rows.forEach((row) => {
      if (!row) return;
      if (row.icon) names.add(row.icon);
      cells(row.footer);
      cells(row.list);
      cells(row.grid);
      cells(row.strip);
      cells(row.split);
      cells(row.board);
      cells(row.steps);
      cells(row.meters);
      cells(row.checklist);
    });
    return [...names];
  },

  async _preloadTemplateIcons(rows) {
    await Promise.all(this._templateIconNames(rows).map((name) => this._mdiIconPath(name)));
  },

  // Kick off whatever this template still needs, without blocking the render.
  // A single "preload in progress" flag used to guard this, and because the
  // preview slots render one after another the second slot skipped its own
  // preload entirely and only started once the first had finished - two full
  // rounds of icon loading, plus a re-render each, for one drawing. Tracking
  // requests per icon lets every slot queue in the same round.
  _requestTemplateIcons(rows) {
    const missing = this._templateIconNames(rows).filter((name) => !ICON_GEOMETRY.has(name));
    if (!missing.length) return;
    Promise.all(missing.map((name) => this._mdiIconPath(name))).then((resolved) => {
      if (resolved.some(Boolean)) this._scheduleTemplateIconRepaint();
    });
  },

  // Icons land one batch at a time; repainting on a timeout collapses a burst of
  // arrivals into a single pass over the panel instead of one per icon.
  _scheduleTemplateIconRepaint() {
    if (this._templateIconRepaintPending) return;
    this._templateIconRepaintPending = true;
    setTimeout(() => {
      this._templateIconRepaintPending = false;
      this._render();
      this._paint();
    }, 0);
  },

  // Every template draws from the same small set of mdi icons, so resolve the
  // whole set once in the background after the first preview. Switching template
  // in the designer then draws from a warm cache and its icons are there on the
  // first frame, instead of appearing a beat after the rest of the layout.
  _warmTemplateIcons() {
    if (TEMPLATE_ICONS_WARMED) return;
    TEMPLATE_ICONS_WARMED = true;
    const names = new Set();
    for (const id of Object.keys(this._templateSvgSpecs({}))) {
      this._templateIconNames(this._templateSvgRows({ id })).forEach((name) => names.add(name));
    }
    const pending = [...names].filter((name) => !ICON_GEOMETRY.has(name));
    if (!pending.length) return;
    const warm = async () => {
      // In chunks, so warming the cache never mounts sixty off-screen ha-icons
      // in one go while the user is interacting with the designer.
      for (let index = 0; index < pending.length; index += 8) {
        await Promise.all(pending.slice(index, index + 8).map((name) => this._mdiIconPath(name)));
      }
      this._scheduleTemplateIconRepaint();
    };
    (window.requestIdleCallback || ((callback) => setTimeout(callback, 300)))(warm);
  },

  // The on-screen preview has to be the very markup that gets rasterized and
  // sent. It used to be a separate HTML rendering laid out by CSS inside a
  // foreignObject, so preview and panel were two different drawings of the same
  // template and could not agree. Icons resolve asynchronously through ha-icon,
  // so return whatever is cached now and re-render once the rest arrive.
  _templateSvgPreviewMarkup(template, width, height) {
    if (!template) return "";
    const rows = this._templateSvgRows(template);
    this._requestTemplateIcons(rows);
    this._warmTemplateIcons();
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

  // Advance width of a string at a given size. Blocks that place two runs of text
  // next to each other - a value and its unit, a label and its bar - have to know
  // where the first one ends, and there is no measuring API inside a serialized
  // SVG that is never attached to a document.
  _svgTextWidth(value, size, bold) {
    let ems = 0;
    for (const character of String(value ?? "")) ems += glyphWidth(character, bold);
    return ems * size;
  },

  _svgFitFontSize(value, size, maxWidth, bold) {
    const text = String(value ?? "");
    if (!maxWidth || !text) return size;
    const estimated = this._svgTextWidth(text, size, bold);
    return estimated > maxWidth ? Math.max(5, size * (maxWidth / estimated)) : size;
  },

  _svgText(value, x, y, size, options = {}) {
    const text = String(value ?? "");
    if (!text) return "";
    const bold = !!options.bold;
    const fontSize = this._svgFitFontSize(text, size, options.maxWidth, bold);
    const anchor = options.anchor || "middle";
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${FONT}" font-size="${fontSize.toFixed(2)}"`
      + ` font-weight="${bold ? 700 : 400}" fill="${options.color || BLACK}" text-anchor="${anchor}"`
      + ` dominant-baseline="central" xml:space="preserve">${this._escape(text)}</text>`;
  },

  _svgIcon(name, cx, cy, size, color = BLACK) {
    const resolved = ICON_GEOMETRY.get(name);
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
  //
  // Every template is authored as a vertical stack of rows whose heights and font
  // sizes are fractions of the panel height, which only works on a panel roughly
  // as tall and narrow as the one they were drawn for. The hardware is not: the
  // sdk types this integration supports run from 168x384 to 1360x480, so on a
  // wide panel the same stack squeezed ten rows into 128 px - type at the 6 px
  // floor, icons the size of the text, and two thirds of the width left empty.
  // Anything clearly wider than tall is therefore laid out in two columns
  // instead, which is a rearrangement of the same rows, not a different design.
  _layoutTemplateSvg(rows, width, height) {
    return width / height >= LANDSCAPE_ASPECT
      ? this._layoutTemplateSvgColumns(rows, width, height)
      : this._layoutTemplateSvgStacked(rows, width, height);
  },

  _layoutTemplateSvgStacked(rows, width, height) {
    const pad = Math.max(3, Math.round(Math.min(width, height) * 0.035));
    const footerRow = rows.find((row) => row.footer);
    const footerHeight = footerRow ? Math.max(18, Math.round(height * (footerRow.h || 0.16))) : 0;
    const box = { x: pad, y: pad, w: width - pad * 2, h: height - footerHeight - pad, fullX: 0, fullW: width };
    const parts = this._stackTemplateBlocks(rows.filter((row) => !row.footer), box, height);
    parts.push(...this._layoutTemplateFooter(footerRow, width, height, footerHeight));
    return parts.join("");
  },

  // The wide-panel arrangement: what identifies the template - its icon, its name
  // and its headline reading - fills a leading column, its content blocks stack in
  // a second one, and the footer keeps the full-width band it has when stacked.
  // Rows are re-grouped rather than re-authored, so a template says the same thing
  // on a 296x128 tag as it does on a 240x416 one.
  _layoutTemplateSvgColumns(rows, width, height) {
    const pad = Math.max(3, Math.round(Math.min(width, height) * 0.045));
    const footerRow = rows.find((row) => row.footer);
    // Horizontal rules separate stacked rows; side by side there is nothing left
    // for them to separate, and the column divider below does that job instead.
    const flowRows = rows.filter((row) => !row.footer && !row.flex && !row.rule && !row.gap);
    const footerHeight = footerRow
      ? Math.max(14, Math.round(height * Math.min(0.26, (footerRow.h || 0.16) * 1.3)))
      : 0;
    const columnHeight = Math.max(1, height - footerHeight - pad * 2);

    const iconRow = flowRows.find((row) => row.icon);
    const textRows = flowRows.filter((row) => row.text != null);
    // A stat block is the headline by definition; without one it is the largest
    // type in the spec, and every other text row captions it.
    const heroRow = flowRows.find((row) => row.stat)
      || textRows.reduce((best, row) => (!best || (row.size || 0) > (best.size || 0) ? row : best), null);
    const titleRow = textRows.find((row) => row !== heroRow);
    // Emphasis differs from the stacked layout: a column is tall and narrow, so
    // the headline can take the room the surrounding rows do not need.
    const lead = [
      iconRow && { ...iconRow, h: (iconRow.h || 0.16) * 0.85 },
      titleRow && { ...titleRow, h: (titleRow.h || 0.08) * 0.85 },
      heroRow && { ...heroRow, h: (heroRow.h || 0.12) * 1.7 },
    ].filter(Boolean);
    const detail = flowRows.filter((row) => row !== iconRow && row !== titleRow && row !== heroRow);

    const parts = [];
    if (!lead.length || !detail.length) {
      const box = { x: pad, y: pad, w: width - pad * 2, h: columnHeight, fullX: pad, fullW: width - pad * 2 };
      parts.push(...this._stackTemplateBlocks(lead.length ? lead : flowRows, box, 0));
      if (lead.length && detail.length) parts.push(...this._stackTemplateBlocks(detail, box, 0));
    } else {
      const gap = pad;
      const leadWidth = Math.max(1, Math.round((width - pad * 2 - gap) * 0.42));
      const detailX = pad + leadWidth + gap;
      const detailWidth = Math.max(1, width - pad - detailX);
      parts.push(...this._stackTemplateBlocks(lead, { x: pad, y: pad, w: leadWidth, h: columnHeight, fullX: pad, fullW: leadWidth }, 0));
      parts.push(`<rect x="${(detailX - gap / 2).toFixed(2)}" y="${pad.toFixed(2)}" width="1" height="${columnHeight.toFixed(2)}" fill="${BLACK}"></rect>`);
      parts.push(...this._stackTemplateBlocks(detail, { x: detailX, y: pad, w: detailWidth, h: columnHeight, fullX: detailX, fullW: detailWidth }, 0));
    }

    parts.push(...this._layoutTemplateFooter(footerRow, width, height, footerHeight));
    return parts.join("");
  },

  // Hands each row a rectangle and lets the row draw itself into it.
  //
  // `base` is what a row's `h` fraction is measured against: the panel height in
  // the stacked layout, which keeps its proportions exactly as authored, or 0 in
  // the column layout, where a subset of the rows has to fill a column of its own
  // and the fractions are normalised against each other instead.
  _stackTemplateBlocks(rows, box, base) {
    const total = rows.reduce((sum, row) => sum + (row.flex ? 0 : (row.h || 0.08)), 0) || 1;
    const unit = base || box.h / total;
    const fixed = rows.map((row) => (row.flex ? 0 : Math.max(1, unit * (row.h || 0.08))));
    const fixedTotal = fixed.reduce((sum, value) => sum + value, 0);
    const flexCount = rows.filter((row) => row.flex).length;
    const scale = fixedTotal > box.h ? box.h / fixedTotal : 1;
    const flexShare = flexCount ? Math.max(0, box.h - fixedTotal * scale) / flexCount : 0;

    let y = box.y;
    const parts = [];
    rows.forEach((row, index) => {
      const rowHeight = row.flex ? flexShare : fixed[index] * scale;
      parts.push(this._renderTemplateBlock(row, { x: box.x, y, w: box.w, h: rowHeight, fullX: box.fullX, fullW: box.fullW }));
      y += rowHeight;
    });
    return parts;
  },

  _layoutTemplateFooter(footerRow, width, height, footerHeight) {
    if (!footerRow || footerHeight <= 0) return [];
    const parts = [];
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
    return parts;
  },

  // ---------------------------------------------------------------- blocks ---

  // Every template used to be the same six rows - icon, title, rule, value, list,
  // footer - with different words in them, which is why twenty templates looked
  // like one. A block draws itself into whatever rectangle the layout hands it, so
  // a template's shape is now a matter of which blocks it picks, and a new shape
  // costs a spec entry instead of a branch in the layout.
  _renderTemplateBlock(row, box) {
    if (!row || box.h <= 0 || box.w <= 0) return "";
    if (row.icon) return this._blockIcon(row, box);
    if (row.rule) return this._blockRule(row, box);
    if (row.list) return this._blockList(row, box);
    if (row.stat) return this._blockStat(row, box);
    if (row.band) return this._blockBand(row, box);
    if (row.bars) return this._blockBars(row, box);
    if (row.meters) return this._blockMeters(row, box);
    if (row.ring) return this._blockRing(row, box);
    if (row.dial) return this._blockDial(row, box);
    if (row.grid) return this._blockGrid(row, box);
    if (row.steps) return this._blockSteps(row, box);
    if (row.checklist) return this._blockChecklist(row, box);
    if (row.strip) return this._blockStrip(row, box);
    if (row.split) return this._blockSplit(row, box);
    if (row.spark) return this._blockSpark(row, box);
    if (row.datebox) return this._blockDatebox(row, box);
    if (row.board) return this._blockBoard(row, box);
    if (row.text != null) return this._blockText(row, box);
    return "";
  },

  _templateInk(color) {
    return color === "red" ? RED : BLACK;
  },

  _svgHairline(x, y, w, h, color = BLACK) {
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, w).toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" fill="${color}"></rect>`;
  },

  // An annular sector, used by both the donut and the half-dial. A full circle
  // would close on itself and disappear, so the sweep stops just short of 360.
  _svgArcPath(cx, cy, outer, inner, startAngle, endAngle) {
    const stop = Math.min(endAngle, startAngle + 359.9);
    const point = (radius, angle) => {
      const rad = (angle * Math.PI) / 180;
      return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    };
    const large = stop - startAngle > 180 ? 1 : 0;
    const [x1, y1] = point(outer, startAngle);
    const [x2, y2] = point(outer, stop);
    const [x3, y3] = point(inner, stop);
    const [x4, y4] = point(inner, startAngle);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${outer.toFixed(2)} ${outer.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
      + ` L${x3.toFixed(2)} ${y3.toFixed(2)} A${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
  },

  _blockIcon(row, box) {
    return this._svgIcon(row.icon, box.x + box.w / 2, box.y + box.h / 2, Math.min(box.h, box.w) * 0.92, this._templateInk(row.color));
  },

  _blockRule(row, box) {
    const ruleWidth = box.w * 0.82;
    return this._svgHairline(box.x + (box.w - ruleWidth) / 2, box.y + box.h / 2, ruleWidth, 1, this._templateInk(row.color));
  },

  // Sizing from the row's own size/height ratio rather than from the panel keeps
  // the type inside its box in every layout: a row squeezed by a short panel used
  // to keep its full font size and collide with the line under it.
  _blockText(row, box) {
    const ratio = row.h ? (row.size || row.h * 0.62) / row.h : 0.62;
    const fontSize = Math.max(6, Math.min(box.h * ratio, box.h * 0.92));
    return this._svgText(row.text, box.x + box.w / 2, box.y + box.h / 2, fontSize, {
      bold: !!row.bold,
      color: this._templateInk(row.color),
      maxWidth: box.w,
    });
  },

  _blockList(row, box) {
    const cells = row.list;
    const lineHeight = box.h / (cells.length || 1);
    const fontSize = Math.max(6, Math.min(lineHeight * 0.62, box.w * 0.11));
    const right = box.x + box.w;
    const parts = [];
    cells.forEach((cell, index) => {
      const lineY = box.y + lineHeight * (index + 0.5);
      let textX = box.x;
      if (cell.icon) {
        const iconSize = Math.min(lineHeight * 0.66, box.w * 0.2);
        parts.push(this._svgIcon(cell.icon, box.x + iconSize / 2, lineY, iconSize, this._templateInk(cell.color)));
        textX = box.x + iconSize + Math.max(2, iconSize * 0.25);
      }
      if (cell.value != null && cell.label != null) {
        parts.push(this._svgText(cell.label, textX, lineY, fontSize, { anchor: "start", maxWidth: (right - textX) * 0.6 }));
        parts.push(this._svgText(cell.value, right, lineY, fontSize, { anchor: "end", bold: true, color: this._templateInk(cell.color), maxWidth: (right - textX) * 0.44 }));
      } else {
        parts.push(this._svgText(cell.label ?? cell.value, textX, lineY, fontSize, { anchor: "start", bold: !!cell.bold, color: this._templateInk(cell.color), maxWidth: right - textX }));
      }
    });
    return parts.join("");
  },

  // One reading at display scale, with its unit set small beside it rather than
  // shrinking the number to fit both. The pair is centred as a unit.
  _blockStat(row, box) {
    const stat = row.stat;
    const captionHeight = stat.caption != null ? box.h * 0.24 : 0;
    const valueHeight = box.h - captionHeight;
    const unitRatio = 0.34;
    const span = (size) => this._svgTextWidth(stat.value, size, true)
      + (stat.unit ? this._svgTextWidth(` ${stat.unit}`, size * unitRatio, false) : 0);
    let fontSize = Math.max(8, valueHeight * 0.82);
    // span() is linear in the font size, so one division lands exactly on the
    // width instead of iterating towards it.
    if (span(fontSize) > box.w) fontSize = Math.max(7, (fontSize * box.w) / span(fontSize));
    const unitSize = fontSize * unitRatio;
    const left = box.x + box.w / 2 - span(fontSize) / 2;
    const baseline = box.y + valueHeight * 0.54;
    const parts = [this._svgText(stat.value, left, baseline, fontSize, { anchor: "start", bold: true, color: this._templateInk(stat.color) })];
    if (stat.unit) {
      parts.push(this._svgText(stat.unit, left + this._svgTextWidth(stat.value, fontSize, true) + unitSize * 0.3, baseline + fontSize * 0.22, unitSize, {
        anchor: "start", color: this._templateInk(stat.unitColor),
      }));
    }
    if (stat.caption != null) {
      parts.push(this._svgText(stat.caption, box.x + box.w / 2, box.y + valueHeight + captionHeight * 0.5, Math.max(6, captionHeight * 0.6), {
        color: this._templateInk(stat.captionColor), maxWidth: box.w,
      }));
    }
    return parts.join("");
  },

  // A filled bar with the type reversed out of it - the loudest shape available on
  // a three-colour panel, so no template uses more than two.
  _blockBand(row, box) {
    const band = row.band;
    const x = row.bleed ? box.fullX : box.x;
    const w = row.bleed ? box.fullW : box.w;
    const fill = band.color === "black" ? BLACK : RED;
    const parts = [`<rect x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="${fill}"></rect>`];
    const cx = x + w / 2;
    if (band.label != null && band.value != null) {
      parts.push(this._svgText(band.label, cx, box.y + box.h * 0.3, Math.max(6, box.h * 0.26), { color: "#ffffff", bold: true, maxWidth: w * 0.92 }));
      parts.push(this._svgText(band.value, cx, box.y + box.h * 0.7, Math.max(7, box.h * 0.38), { color: "#ffffff", bold: true, maxWidth: w * 0.92 }));
    } else {
      parts.push(this._svgText(band.value ?? band.label, cx, box.y + box.h * 0.5, Math.max(7, box.h * 0.52), { color: "#ffffff", bold: true, maxWidth: w * 0.92 }));
    }
    return parts.join("");
  },

  // The shape of a day, which is the one thing a column of numbers cannot show.
  _blockBars(row, box) {
    const values = (row.bars.values || []).map(Number).filter(Number.isFinite);
    if (!values.length) return "";
    const labels = row.bars.labels || [];
    const labelHeight = labels.length ? Math.min(box.h * 0.24, 11) : 0;
    const chartHeight = Math.max(1, box.h - labelHeight);
    const top = Math.max(...values);
    const bottom = Math.min(...values, 0);
    const span = top - bottom || 1;
    const step = box.w / values.length;
    const barWidth = Math.max(1, step * 0.68);
    const parts = [this._svgHairline(box.x, box.y + chartHeight, box.w, 1)];
    values.forEach((value, index) => {
      const barHeight = Math.max(1, ((value - bottom) / span) * (chartHeight - 1));
      parts.push(`<rect x="${(box.x + step * index + (step - barWidth) / 2).toFixed(2)}" y="${(box.y + chartHeight - barHeight).toFixed(2)}"`
        + ` width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${row.bars.highlight === index ? RED : BLACK}"></rect>`);
    });
    labels.forEach((label, index) => {
      if (label == null || label === "") return;
      parts.push(this._svgText(label, box.x + step * (index + 0.5), box.y + chartHeight + labelHeight * 0.6, Math.max(5, labelHeight * 0.62), { maxWidth: step * 0.95 }));
    });
    return parts.join("");
  },

  // Quantities that share a 0-100 scale, which read as a comparison when they are
  // bars and as an arbitrary ranking when they are a list of numbers.
  _blockMeters(row, box) {
    const meters = row.meters;
    const lineHeight = box.h / (meters.length || 1);
    const parts = [];
    meters.forEach((meter, index) => {
      const top = box.y + lineHeight * index;
      const labelSize = Math.max(5, Math.min(lineHeight * 0.36, box.w * 0.09));
      const barHeight = Math.max(2, lineHeight * 0.28);
      const barY = top + lineHeight * 0.55;
      const percent = Math.max(0, Math.min(1, Number(meter.percent) || 0));
      parts.push(this._svgText(meter.label, box.x, top + lineHeight * 0.26, labelSize, { anchor: "start", maxWidth: box.w * 0.58 }));
      parts.push(this._svgText(meter.value, box.x + box.w, top + lineHeight * 0.26, labelSize, { anchor: "end", bold: true, color: this._templateInk(meter.color), maxWidth: box.w * 0.4 }));
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${barY.toFixed(2)}" width="${box.w.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></rect>`);
      if (percent > 0) {
        parts.push(`<rect x="${box.x.toFixed(2)}" y="${barY.toFixed(2)}" width="${(box.w * percent).toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${this._templateInk(meter.color)}"></rect>`);
      }
    });
    return parts.join("");
  },

  _blockRing(row, box) {
    const ring = row.ring;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const outer = Math.min(box.w, box.h) * 0.46;
    const inner = outer * 0.68;
    const percent = Math.max(0, Math.min(1, Number(ring.percent) || 0));
    const parts = [
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${outer.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></circle>`,
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${inner.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></circle>`,
    ];
    if (percent > 0) parts.push(`<path d="${this._svgArcPath(cx, cy, outer, inner, -90, -90 + percent * 360)}" fill="${this._templateInk(ring.color)}"></path>`);
    if (ring.value != null) parts.push(this._svgText(ring.value, cx, cy - (ring.caption != null ? inner * 0.2 : 0), inner * 0.62, { bold: true, maxWidth: inner * 1.7 }));
    if (ring.caption != null) parts.push(this._svgText(ring.caption, cx, cy + inner * 0.46, inner * 0.34, { maxWidth: inner * 1.7 }));
    return parts.join("");
  },

  // A half dial: wide, short, and open at the bottom, so it fills a landscape row
  // the donut would waste.
  _blockDial(row, box) {
    const dial = row.dial;
    const cx = box.x + box.w / 2;
    const outer = Math.min(box.w * 0.46, box.h * 0.82);
    const inner = outer * 0.7;
    const cy = box.y + box.h * 0.5 + outer * 0.4;
    const percent = Math.max(0, Math.min(1, Number(dial.percent) || 0));
    const parts = [`<path d="${this._svgArcPath(cx, cy, outer, inner, 180, 360)}" fill="none" stroke="${BLACK}" stroke-width="1"></path>`];
    if (percent > 0) parts.push(`<path d="${this._svgArcPath(cx, cy, outer, inner, 180, 180 + percent * 180)}" fill="${this._templateInk(dial.color)}"></path>`);
    if (dial.value != null) parts.push(this._svgText(dial.value, cx, cy - outer * 0.28, outer * 0.42, { bold: true, maxWidth: inner * 1.8 }));
    if (dial.caption != null) parts.push(this._svgText(dial.caption, cx, cy + outer * 0.16, outer * 0.24, { maxWidth: inner * 1.9 }));
    if (dial.min != null) parts.push(this._svgText(dial.min, cx - outer, cy + outer * 0.22, outer * 0.2, { maxWidth: outer * 0.7 }));
    if (dial.max != null) parts.push(this._svgText(dial.max, cx + outer, cy + outer * 0.22, outer * 0.2, { maxWidth: outer * 0.7 }));
    return parts.join("");
  },

  // Tiles of equal weight. A list ranks what it stacks; a grid says these readings
  // are peers, which is what a room summary actually means.
  _blockGrid(row, box) {
    const cells = row.grid;
    const columns = Math.max(1, row.columns || 2);
    const lines = Math.max(1, Math.ceil(cells.length / columns));
    const cellWidth = box.w / columns;
    const cellHeight = box.h / lines;
    const parts = [];
    for (let index = 1; index < columns; index++) parts.push(this._svgHairline(box.x + cellWidth * index, box.y, 1, box.h));
    for (let index = 1; index < lines; index++) parts.push(this._svgHairline(box.x, box.y + cellHeight * index, box.w, 1));
    // A tile stays a tile whatever shape its cell is. Sizing purely off the cell
    // height blew the type up when three cells shared one tall row, so the
    // contents sit in a centred box no taller than the cell is wide.
    const contentHeight = Math.min(cellHeight, cellWidth * 1.35);
    cells.forEach((cell, index) => {
      const cx = box.x + cellWidth * (index % columns) + cellWidth / 2;
      const top = box.y + cellHeight * Math.floor(index / columns) + (cellHeight - contentHeight) / 2;
      if (cell.icon) parts.push(this._svgIcon(cell.icon, cx, top + contentHeight * 0.26, Math.min(contentHeight * 0.32, cellWidth * 0.32), this._templateInk(cell.color)));
      parts.push(this._svgText(cell.value, cx, top + contentHeight * (cell.icon ? 0.6 : 0.42), Math.max(6, Math.min(contentHeight * (cell.icon ? 0.26 : 0.34), cellWidth * 0.3)), {
        bold: true, color: this._templateInk(cell.color), maxWidth: cellWidth * 0.9,
      }));
      parts.push(this._svgText(cell.label, cx, top + contentHeight * (cell.icon ? 0.85 : 0.74), Math.max(5, Math.min(contentHeight * 0.17, cellWidth * 0.19)), { maxWidth: cellWidth * 0.9 }));
    });
    return parts.join("");
  },

  // Progress along a sequence, which a percentage cannot express: it matters that
  // the wash is past rinsing, not that it is 60 % done.
  _blockSteps(row, box) {
    const steps = row.steps;
    const horizontal = row.orientation === "horizontal";
    const parts = [];
    if (horizontal) {
      const step = box.w / (steps.length || 1);
      const lineY = box.y + box.h * 0.34;
      const dot = Math.min(step * 0.2, box.h * 0.22);
      parts.push(this._svgHairline(box.x + step * 0.5, lineY, box.w - step, 1));
      steps.forEach((item, index) => {
        const cx = box.x + step * (index + 0.5);
        parts.push(item.done
          ? `<circle cx="${cx.toFixed(2)}" cy="${lineY.toFixed(2)}" r="${dot.toFixed(2)}" fill="${this._templateInk(item.color)}"></circle>`
          : `<circle cx="${cx.toFixed(2)}" cy="${lineY.toFixed(2)}" r="${dot.toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="1"></circle>`);
        parts.push(this._svgText(item.label, cx, box.y + box.h * 0.75, Math.max(5, box.h * 0.22), { bold: !!item.done, color: this._templateInk(item.color), maxWidth: step * 0.96 }));
      });
      return parts.join("");
    }
    const lineHeight = box.h / (steps.length || 1);
    const dot = Math.min(lineHeight * 0.26, box.w * 0.09);
    const railX = box.x + dot * 1.4;
    parts.push(this._svgHairline(railX, box.y + lineHeight * 0.5, 1, box.h - lineHeight));
    steps.forEach((item, index) => {
      const cy = box.y + lineHeight * (index + 0.5);
      parts.push(item.done
        ? `<circle cx="${railX.toFixed(2)}" cy="${cy.toFixed(2)}" r="${dot.toFixed(2)}" fill="${this._templateInk(item.color)}"></circle>`
        : `<circle cx="${railX.toFixed(2)}" cy="${cy.toFixed(2)}" r="${dot.toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="1"></circle>`);
      const textX = railX + dot * 1.8;
      parts.push(this._svgText(item.label, textX, cy, Math.max(6, Math.min(lineHeight * 0.5, box.w * 0.1)), {
        anchor: "start", bold: !!item.done, color: this._templateInk(item.color), maxWidth: box.x + box.w - textX,
      }));
    });
    return parts.join("");
  },

  _blockChecklist(row, box) {
    const items = row.checklist;
    const lineHeight = box.h / (items.length || 1);
    const mark = Math.min(lineHeight * 0.5, box.w * 0.11);
    const fontSize = Math.max(6, Math.min(lineHeight * 0.52, box.w * 0.1));
    const parts = [];
    items.forEach((item, index) => {
      const cy = box.y + lineHeight * (index + 0.5);
      const left = box.x;
      if (row.marker === "dot") {
        parts.push(item.done
          ? `<circle cx="${(left + mark / 2).toFixed(2)}" cy="${cy.toFixed(2)}" r="${(mark / 2).toFixed(2)}" fill="${this._templateInk(item.color)}"></circle>`
          : `<circle cx="${(left + mark / 2).toFixed(2)}" cy="${cy.toFixed(2)}" r="${(mark / 2).toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="1"></circle>`);
      } else {
        parts.push(`<rect x="${left.toFixed(2)}" y="${(cy - mark / 2).toFixed(2)}" width="${mark.toFixed(2)}" height="${mark.toFixed(2)}"`
          + ` fill="${item.done ? this._templateInk(item.color) : "#ffffff"}" stroke="${BLACK}" stroke-width="1"></rect>`);
        if (item.done) {
          parts.push(`<path d="M${(left + mark * 0.22).toFixed(2)} ${(cy).toFixed(2)} L${(left + mark * 0.44).toFixed(2)} ${(cy + mark * 0.24).toFixed(2)}`
            + ` L${(left + mark * 0.8).toFixed(2)} ${(cy - mark * 0.26).toFixed(2)}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1, mark * 0.14).toFixed(2)}"></path>`);
        }
      }
      const textX = left + mark + Math.max(2, mark * 0.4);
      const right = box.x + box.w;
      parts.push(this._svgText(item.label, textX, cy, fontSize, { anchor: "start", bold: !!item.bold, color: this._templateInk(item.color), maxWidth: right - textX }));
      // A struck-through line says "already handled" without spending a column on
      // a second state word next to every item.
      if (item.done && row.strike) {
        const width = Math.min(this._svgTextWidth(item.label, fontSize, !!item.bold), right - textX);
        parts.push(this._svgHairline(textX, cy, width, 1));
      }
    });
    return parts.join("");
  },

  // Equal columns, each a small stack of label, icon and value - the same idea as
  // the red footer, in black on white and at whatever size the row is given.
  _blockStrip(row, box) {
    const cells = row.strip;
    const cellWidth = box.w / (cells.length || 1);
    // Without icons there is no middle row to sit around, so label and value close
    // up instead of leaving a gap where the icon would have been.
    const iconed = cells.some((cell) => cell.icon);
    const labelY = box.y + box.h * (iconed ? 0.16 : 0.3);
    const valueY = box.y + box.h * (iconed ? 0.85 : 0.72);
    const parts = [];
    cells.forEach((cell, index) => {
      const cx = box.x + cellWidth * (index + 0.5);
      if (index > 0) parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.12, 1, box.h * 0.76));
      parts.push(this._svgText(cell.label, cx, labelY, Math.max(5, Math.min(box.h * 0.19, cellWidth * 0.28)), { bold: true, maxWidth: cellWidth * 0.9 }));
      if (cell.icon) parts.push(this._svgIcon(cell.icon, cx, box.y + box.h * 0.5, Math.min(box.h * 0.34, cellWidth * 0.5), this._templateInk(cell.color)));
      parts.push(this._svgText(cell.value, cx, valueY, Math.max(6, Math.min(box.h * 0.26, cellWidth * 0.32)), { bold: true, color: this._templateInk(cell.color), maxWidth: cellWidth * 0.9 }));
    });
    return parts.join("");
  },

  // Two readings of equal standing, divided down the middle. Stacked they read as
  // first and second; side by side they read as a pair, which is what "next two
  // collections" actually is.
  _blockSplit(row, box) {
    const halves = row.split;
    const cellWidth = box.w / (halves.length || 1);
    const parts = [];
    halves.forEach((half, index) => {
      const cx = box.x + cellWidth * (index + 0.5);
      if (index > 0) parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.08, 1, box.h * 0.84));
      let y = box.y + box.h * 0.2;
      if (half.icon) {
        parts.push(this._svgIcon(half.icon, cx, box.y + box.h * 0.22, Math.min(box.h * 0.34, cellWidth * 0.44), this._templateInk(half.color)));
        y = box.y + box.h * 0.56;
      }
      parts.push(this._svgText(half.value, cx, y, Math.max(7, Math.min(box.h * (half.icon ? 0.22 : 0.3), cellWidth * 0.3)), { bold: true, color: this._templateInk(half.color), maxWidth: cellWidth * 0.92 }));
      parts.push(this._svgText(half.label, cx, y + box.h * 0.24, Math.max(5, Math.min(box.h * 0.16, cellWidth * 0.2)), { maxWidth: cellWidth * 0.92 }));
    });
    return parts.join("");
  },

  _blockSpark(row, box) {
    const values = (row.spark.values || []).map(Number).filter(Number.isFinite);
    if (values.length < 2) return "";
    const top = Math.max(...values);
    const bottom = Math.min(...values);
    const span = top - bottom || 1;
    const step = box.w / (values.length - 1);
    const points = values.map((value, index) => [box.x + step * index, box.y + box.h - ((value - bottom) / span) * box.h]);
    const parts = [
      this._svgHairline(box.x, box.y + box.h, box.w, 1),
      `<polyline points="${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}" fill="none" stroke="${this._templateInk(row.spark.color)}"`
        + ` stroke-width="${Math.max(1, box.h * 0.05).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"></polyline>`,
    ];
    const [lastX, lastY] = points[points.length - 1];
    parts.push(`<circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="${Math.max(1.5, box.h * 0.08).toFixed(2)}" fill="${RED}"></circle>`);
    if (row.spark.caption != null) parts.push(this._svgText(row.spark.caption, box.x, box.y + box.h * 0.14, Math.max(5, box.h * 0.18), { anchor: "start", maxWidth: box.w * 0.6 }));
    return parts.join("");
  },

  // A boxed date beside its entries. A calendar that looks like a calendar is read
  // at a glance; the same information as a list of lines is not.
  _blockDatebox(row, box) {
    const date = row.datebox;
    const side = Math.min(box.h * 0.92, box.w * 0.3);
    const left = box.x;
    const top = box.y + (box.h - side) / 2;
    const parts = [`<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></rect>`];
    parts.push(`<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${side.toFixed(2)}" height="${(side * 0.28).toFixed(2)}" fill="${this._templateInk(date.color)}"></rect>`);
    parts.push(this._svgText(date.month, left + side / 2, top + side * 0.15, Math.max(5, side * 0.17), { color: "#ffffff", bold: true, maxWidth: side * 0.92 }));
    parts.push(this._svgText(date.day, left + side / 2, top + side * 0.64, Math.max(8, side * 0.46), { bold: true, maxWidth: side * 0.86 }));
    const textX = left + side + Math.max(3, side * 0.16);
    const right = box.x + box.w;
    const lines = (date.lines || []).filter((line) => line != null && line !== "");
    const lineHeight = box.h / Math.max(1, lines.length);
    lines.forEach((line, index) => {
      const size = index === 0 ? lineHeight * 0.56 : lineHeight * 0.42;
      parts.push(this._svgText(line, textX, box.y + lineHeight * (index + 0.5), Math.max(6, size), {
        anchor: "start", bold: index === 0, color: index === 0 ? this._templateInk(date.color) : BLACK, maxWidth: right - textX,
      }));
    });
    return parts.join("");
  },

  // A departure board: the line number lives in a filled badge, so it is found by
  // shape before anything is read.
  _blockBoard(row, box) {
    const items = row.board;
    const lineHeight = box.h / (items.length || 1);
    const badgeWidth = Math.min(box.w * 0.22, lineHeight * 1.5);
    const badgeHeight = lineHeight * 0.68;
    const right = box.x + box.w;
    const parts = [];
    items.forEach((item, index) => {
      const cy = box.y + lineHeight * (index + 0.5);
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${(cy - badgeHeight / 2).toFixed(2)}" width="${badgeWidth.toFixed(2)}" height="${badgeHeight.toFixed(2)}"`
        + ` fill="${this._templateInk(item.color)}"></rect>`);
      parts.push(this._svgText(item.badge, box.x + badgeWidth / 2, cy, Math.max(6, badgeHeight * 0.62), { color: "#ffffff", bold: true, maxWidth: badgeWidth * 0.88 }));
      const textX = box.x + badgeWidth + Math.max(3, badgeWidth * 0.2);
      const valueWidth = box.w * 0.26;
      parts.push(this._svgText(item.label, textX, cy, Math.max(6, Math.min(lineHeight * 0.46, box.w * 0.1)), {
        anchor: "start", maxWidth: right - textX - valueWidth,
      }));
      parts.push(this._svgText(item.value, right, cy, Math.max(6, Math.min(lineHeight * 0.5, box.w * 0.11)), {
        anchor: "end", bold: true, color: this._templateInk(item.color), maxWidth: valueWidth,
      }));
    });
    return parts.join("");
  },

  // ------------------------------------------------------------- template ---

  // Declarative content of every template. `v(index, fallback)` resolves the
  // Home Assistant binding for that variable slot, falling back to sample data.
  // Kept separate from _templateSvgRows so the icon warm-up can enumerate the
  // ids without a second copy of the list drifting out of step with this one.
  _templateSvgSpecs(template) {
    const v = (index, fallback) => this._templateDisplayValue(template, index, fallback);
    return {
      // Twenty templates, twenty shapes. The variable indices are fixed by the
      // catalog in panel-devices.mixin.js - v(0) is that template's first bound
      // entity - so the arrangement can change freely but the numbering cannot.
      weather: () => [
        { icon: "weather-partly-cloudy", h: 0.19 },
        { stat: { value: v(0, "23"), unit: "°C", caption: v(1, "Polojasno") }, h: 0.30 },
        { text: v(3, "23. května"), h: 0.07, size: 0.045 },
        { rule: true, h: 0.02 },
        { strip: [
          { label: "PÁ", icon: "weather-partly-cloudy", value: v(4, "22°") },
          { label: "SO", icon: "weather-sunny", value: "25°" },
          { label: "NE", icon: "weather-rainy", value: "18°" },
          { label: "PO", icon: "weather-cloudy", value: "20°" },
        ], h: 0.25 },
        { flex: true },
        { footer: [{ label: "AKTUALIZOVÁNO", value: v(2, "12:45") }], h: 0.13 },
      ],
      energy: () => [
        { text: "Cena elektřiny", h: 0.075, size: 0.05, bold: true },
        { stat: { value: v(0, "2,45"), unit: "Kč/kWh", caption: v(1, "12:00–13:00") }, h: 0.27 },
        { bars: {
          values: [1.62, 1.48, 1.36, 1.29, 1.34, 1.51, 1.88, 2.24, 2.06, 1.72, 1.38, 1.12, 0.86, 0.94, 1.08, 1.42, 1.96, 2.58, 2.74, 2.39, 2.05, 1.84, 1.71, 1.63],
          labels: ["0", "", "", "", "", "6", "", "", "", "", "", "12", "", "", "", "", "", "18", "", "", "", "", "", "23"],
          highlight: 12,
        }, h: 0.43 },
        { flex: true },
        { footer: [{ label: "NEJLEVNĚJI DNES", value: v(3, "0,86 Kč") }], h: 0.14 },
      ],
      home: () => [
        { icon: "home", h: 0.15, color: "red" },
        { text: "Dům", h: 0.08, size: 0.058, bold: true },
        { grid: [
          { icon: "thermometer", label: "Teplota", value: v(0, "21,5 °C") },
          { icon: "water-percent", label: "Vlhkost", value: v(1, "45 %") },
          { icon: "lightbulb-on", label: "Světla", value: v(2, "3 ON") },
          { icon: "lock", label: "Zámky", value: v(3, "Zamčeno") },
        ], columns: 2, h: 0.54 },
        { flex: true },
        { footer: [{ label: "STAV", value: "Vše v pořádku" }], h: 0.14 },
      ],
      waste: () => [
        { text: "Odpady", h: 0.085, size: 0.058, bold: true },
        { rule: true, h: 0.02 },
        { split: [
          { icon: "trash-can-outline", value: v(0, "ZÍTRA"), label: "Plast", color: "red" },
          { icon: "recycle", value: v(1, "za 7 dní"), label: "Papír" },
        ], h: 0.6 },
        { flex: true },
        { footer: [{ label: "NEJBLIŽŠÍ SVOZ", value: v(2, "út 24. 5.") }], h: 0.14 },
      ],
      solar: () => [
        { text: "Fotovoltaika", h: 0.075, size: 0.05, bold: true },
        { ring: { percent: 0.47, value: v(0, "2,35"), caption: "kW" }, h: 0.42 },
        { list: [
          { icon: "weather-sunny", label: "Dnes", value: v(1, "8,2 kWh") },
          { icon: "calendar-month", label: "Měsíc", value: v(2, "152 kWh") },
          { icon: "counter", label: "Celkem", value: v(3, "3,45 MWh") },
        ], h: 0.3 },
        { flex: true },
        { footer: [{ label: "ÚSPORA CO₂", value: v(4, "125 kg") }], h: 0.13 },
      ],
      washer: () => [
        { text: "Pračka", h: 0.075, size: 0.055, bold: true },
        { text: v(0, "Bavlna 60°"), h: 0.09, size: 0.062, bold: true, color: "red" },
        { rule: true, h: 0.02 },
        { steps: [
          { label: "Napouštění", done: true },
          { label: "Praní", done: true },
          { label: "Máchání", done: true, color: "red" },
          { label: "Odstřeďování" },
          { label: "Hotovo" },
        ], h: 0.4 },
        { stat: { value: v(1, "01:15"), caption: "zbývá" }, h: 0.2 },
        { flex: true },
        { footer: [{ label: "SKONČÍ V", value: v(2, "14:30") }], h: 0.13 },
      ],
      living: () => [
        { icon: "sofa", h: 0.15 },
        { stat: { value: v(0, "23,5"), unit: "°C", caption: "Obývák" }, h: 0.3 },
        { rule: true, h: 0.02 },
        { meters: [
          { label: "Vlhkost", value: v(1, "40 %"), percent: 0.4 },
          { label: "CO₂", value: v(2, "650 ppm"), percent: 0.32, color: "red" },
        ], h: 0.28 },
        { flex: true },
        { footer: [{ label: "KOMFORT", value: "Optimální" }], h: 0.13 },
      ],
      presence: () => [
        { text: "Kdo je doma", h: 0.08, size: 0.052, bold: true },
        { rule: true, h: 0.02 },
        { grid: [
          { icon: "account", value: v(0, "Petr"), label: v(1, "Doma"), color: "red" },
          { icon: "account", value: "Jana", label: "Doma" },
          { icon: "account", value: "Eliška", label: v(2, "Ve škole") },
        ], columns: 3, h: 0.5 },
        { flex: true },
        { footer: [{ label: "AKTUALIZACE", value: v(3, "12:45") }], h: 0.14 },
      ],
      wifi: () => [
        { icon: "wifi", h: 0.16 },
        { text: "Wi-Fi", h: 0.075, size: 0.055, bold: true },
        { band: { label: "SÍŤ", value: v(0, "Home_Network") }, bleed: true, h: 0.21 },
        { gap: true, h: 0.025 },
        { band: { label: "HESLO", value: v(1, "MyPassword123"), color: "black" }, bleed: true, h: 0.21 },
        { flex: true },
        { footer: [{ label: "ZABEZPEČENÍ", value: "WPA2" }], h: 0.13 },
      ],
      calendar: () => [
        { text: "Kalendář", h: 0.075, size: 0.05, bold: true },
        { rule: true, h: 0.02 },
        { datebox: { day: "23", month: "KVĚ", color: "red", lines: [v(0, "Schůzka"), "15:00 · kancelář"] }, h: 0.27 },
        { datebox: { day: "24", month: "KVĚ", lines: [v(1, "Narozeniny"), "Tomáš · celý den"] }, h: 0.27 },
        { flex: true },
        { footer: [{ label: "SVÁTEK MÁ", value: v(2, "Jana") }], h: 0.14 },
      ],
      security: () => [
        { icon: "shield-home", h: 0.15 },
        { band: { label: "ALARM", value: v(0, "ZAPNUTO"), color: "black" }, bleed: true, h: 0.2 },
        { checklist: [
          { label: `Dveře · ${v(1, "Zamčeno")}`, done: true },
          { label: `Okna · ${v(2, "Zavřeno")}`, done: true },
          { label: `Pohyb · ${v(3, "Klid")}`, done: true },
        ], marker: "dot", h: 0.36 },
        { flex: true },
        { footer: [{ label: "ZÓNY", value: "3 / 3 v pořádku" }], h: 0.14 },
      ],
      transport: () => [
        { text: v(0, "Hlavní nádraží"), h: 0.085, size: 0.052, bold: true },
        { rule: true, h: 0.02 },
        { board: [
          { badge: v(1, "9"), label: "Náměstí", value: v(2, "3 min"), color: "red" },
          { badge: "4", label: "Univerzita", value: "8 min" },
          { badge: "12", label: "Nemocnice", value: "14 min" },
          { badge: "N2", label: "Depo", value: "21 min" },
        ], h: 0.55 },
        { flex: true },
        { footer: [{ label: "ZASTÁVKA", value: v(3, "240 m") }], h: 0.14 },
      ],
      shopping: () => [
        { text: "Nákupní seznam", h: 0.075, size: 0.048, bold: true },
        { rule: true, h: 0.02 },
        { checklist: [
          { label: v(1, "Mléko"), done: true },
          { label: "Chléb", done: true },
          { label: v(0, "Jablka") },
          { label: "Káva" },
          { label: "Prací gel" },
        ], marker: "box", strike: true, h: 0.55 },
        { flex: true },
        { footer: [{ label: "ZBÝVÁ", value: v(2, "3 položky") }], h: 0.14 },
      ],
      air: () => [
        { text: "Kvalita vzduchu", h: 0.07, size: 0.046, bold: true },
        { dial: { percent: 0.21, value: v(0, "42"), caption: "AQI · výborná", min: "0", max: "200" }, h: 0.35 },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "molecule-co2", label: "CO₂", value: v(1, "612 ppm") },
          { icon: "blur", label: "PM2.5", value: v(2, "8 µg") },
          { icon: "water-percent", label: "Vlhkost", value: v(3, "46 %") },
        ], h: 0.31 },
        { flex: true },
        { footer: [{ label: "VĚTRÁNÍ", value: "Není třeba" }], h: 0.13 },
      ],
      thermostat: () => [
        { icon: "thermostat", h: 0.15 },
        { stat: { value: v(0, "21,5"), unit: "°C", caption: "aktuálně" }, h: 0.3 },
        { split: [
          { value: v(1, "22 °C"), label: "Cíl" },
          { value: v(2, "60 %"), label: "Výkon", color: "red" },
        ], h: 0.28 },
        { flex: true },
        { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: 0.14 },
      ],
      water: () => [
        { text: "Spotřeba vody", h: 0.07, size: 0.046, bold: true },
        { stat: { value: v(0, "126"), unit: "l", caption: "dnes" }, h: 0.26 },
        { spark: { values: [96, 131, 108, 142, 119, 174, 126], caption: "7 dní" }, h: 0.24 },
        { rule: true, h: 0.02 },
        { strip: [
          { label: "TÝDEN", value: v(1, "0,84 m³") },
          { label: "MĚSÍC", value: v(2, "3,12 m³") },
          { label: "ROZDÍL", value: v(3, "−12 %"), color: "red" },
        ], h: 0.2 },
        { flex: true },
        { footer: [{ label: "ODEČET", value: "dnes 06:00" }], h: 0.13 },
      ],
      parcel: () => [
        { icon: "package-variant-closed", h: 0.15 },
        { text: v(0, "Na cestě"), h: 0.1, size: 0.07, bold: true, color: "red" },
        { text: v(1, "RR 458 921 730 CZ"), h: 0.07, size: 0.04 },
        { steps: [
          { label: "Převzato", done: true },
          { label: "Depo", done: true },
          { label: v(2, "Rozvoz"), done: true, color: "red" },
          { label: "Doručeno" },
        ], orientation: "horizontal", h: 0.3 },
        { flex: true },
        { footer: [{ label: "DORUČENÍ", value: v(3, "13:00–15:00") }], h: 0.14 },
      ],
      birthdays: () => [
        { icon: "cake-variant", h: 0.15 },
        { stat: { value: v(0, "Lucie"), caption: v(1, "32 let"), color: "red" }, h: 0.28 },
        { rule: true, h: 0.02 },
        { datebox: { day: "27", month: "KVĚ", lines: [v(2, "Tomáš"), "za 4 dny"] }, h: 0.25 },
        { flex: true },
        { footer: [{ label: "PŘIPOMÍNKA", value: v(3, "Popřát ráno") }], h: 0.14 },
      ],
      server: () => [
        { text: "Home server", h: 0.07, size: 0.046, bold: true },
        { band: { label: "STAV", value: v(0, "ONLINE") }, bleed: true, h: 0.17 },
        { meters: [
          { label: "CPU", value: v(1, "24 %"), percent: 0.24 },
          { label: "RAM", value: v(2, "61 %"), percent: 0.61 },
          { label: "Disk", value: v(3, "73 %"), percent: 0.73, color: "red" },
          { label: "Teplota", value: v(4, "48 °C"), percent: 0.48 },
        ], h: 0.48 },
        { flex: true },
        { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: 0.13 },
      ],
      garden: () => [
        { text: v(0, "Záhon rajčat"), h: 0.075, size: 0.048, bold: true },
        { stat: { value: v(1, "36"), unit: "%", caption: "vlhkost půdy" }, h: 0.26 },
        { spark: { values: [62, 58, 55, 49, 47, 43, 40, 38, 36], caption: "7 dní" }, h: 0.27 },
        { rule: true, h: 0.02 },
        { list: [
          { icon: "weather-sunny", label: "Teplota", value: v(2, "24 °C") },
          { icon: "weather-windy", label: "Vítr", value: v(3, "8 km/h") },
        ], h: 0.18 },
        { flex: true },
        { footer: [{ label: "ZÁLIVKA", value: v(4, "18:30") }], h: 0.13 },
      ],
    };
  },

  _templateSvgRows(template) {
    const build = this._templateSvgSpecs(template)[template?.id];
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
    // Bright pixels are white; among the dark ones, a bright red channel means
    // red. Antialiasing between a black glyph and a red area lands on dark warm
    // pixels such as rgb(150, 20, 15) - those stay black here, which is what
    // keeps black text from picking up a red rim.
    //
    // Must stay identical to bwr_masks in render.py, thresholds included, or a
    // panel-rendered manual send and a backend-rendered automatic update put
    // different pixels on the same display.
    const luminance = (red * 38 + green * 75 + blue * 15) >> 7;
    if (luminance >= 161) return [255, 255, 255];
    // BWR_RED in render.py.
    return red >= 161 ? [220, 20, 12] : [0, 0, 0];
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
