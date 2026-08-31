// One drawing of every composite designer element - chart, gauge, progress
// bar, indicator, QR, barcode, button, icon - used both for the preview and
// for the bitmap the display receives.
//
// It used to be two. The preview drew a chart by borrowing a template block
// (_renderTemplateChartVisual built a `{spark:…}` row), while the send path
// repainted it from scratch with canvas calls in _paintTemplateOverlays. The
// two had drifted a long way apart: the canvas knew line/area/steps/donut,
// battery and thermometer gauges; the preview knew none of them and drew every
// component into a fixed 100x60 box whatever shape the element actually was.
// The icon was the plainest symptom - on screen a real Material Design glyph,
// on the panel a "◆" typed in Arial, because the canvas branch had no way to
// reach the icon geometry.
//
// So there is one renderer now, it draws at the element's true pixel size, and
// every part of it takes its own colour. Fully separate colours are the reason
// the split had to go first: a caption colour would otherwise have had to be
// implemented twice and kept in step by hand.
//
// A note on "any colour": the panel has three or four physical inks and
// thresholds every pixel it is given. Black, red, white and - on BWRY panels -
// yellow are the whole range; anything else is not a paler shade, it is one of
// those four chosen for you by the threshold. The pickers therefore offer the
// inks that exist, and yellow falls back to red where the panel has no yellow.

import qrcode from "../qrcode-generator.js";

const COMPONENT_KINDS = new Set(["chart", "gauge", "slider", "signal", "qr", "barcode", "button", "icon"]);

const INK_BLACK = "#111111";
const INK_RED = "#d71912";
const INK_YELLOW = "#f4c400";
const INK_WHITE = "#ffffff";
const COMPONENT_FONT = "Arial, Helvetica, sans-serif";

// A panel has no light grey, and nothing downstream invents one: the quantizer
// cuts at luma 161 and hands every pixel above it to white. A fill drawn at
// 22% alpha lands on rgb(203,203,203) - and at 18% on rgb(212) - so the chart's
// area under the curve and the gauge's track were computed, rasterised, and
// then thresholded away entirely. Red and yellow fare no better: 22% red is
// rgb(246,204,203), which is white as well. They were invisible on the printed
// picture for every ink while looking perfectly fine on screen.
//
// An ordered screen of full-strength ink says the same thing in a way the
// hardware can show. Every pixel it paints is either pure ink or untouched
// white, so the final quantizer passes the whole pattern through unchanged
// instead of collapsing it - which is the difference between a halftone and a
// tint on a display with three physical colours.
//
// Cells are in userSpaceOnUse units and the component viewBox is one unit per
// device pixel, so a dot is exactly one pixel of the panel.
const HALFTONE_SCREENS = {
  12: { cell: 4, dots: [[0, 0], [2, 2]] },
  25: { cell: 2, dots: [[0, 0]] },
  50: { cell: 2, dots: [[0, 0], [1, 1]] },
  75: { cell: 2, dots: [[0, 0], [1, 1], [1, 0]] },
};

// Several components are inlined into the same designer document at once, so
// the ids have to be unique across the whole page, not just within one <svg>:
// two <pattern> elements sharing an id make one component paint the other's
// colour.
let HALFTONE_SERIAL = 0;

// The height a band needs before it is worth putting type in it.
//
// _svgText will not draw below MIN_READABLE_FONT_SIZE (10 px) - correctly, a
// smaller glyph is a smudge on a panel that thresholds every pixel - but the
// components budgeted their bands as though it would. A slider asked for a
// 10 px header, an 8 px scale and a 6 px bar inside the palette's own 23 px
// element: 24 px of content in 21 px of box, so the bar was squeezed away and
// the scale's baseline landed below the bottom edge, printing the numerals as
// half-letters. The gauge's caption and the donut's label ran off the same
// cliff.
//
// So a band that cannot seat a readable glyph is dropped, not shrunk and not
// clipped: no scale reads better than half a scale.
const MIN_TEXT_BAND = 11;

// Which parts each kind lets you colour, in the order the inspector shows
// them. `from` is the field it inherits when left unset, so a template saved
// before any of this existed keeps exactly the look it had.
const COMPONENT_PARTS = {
  chart: [
    ["color", "Data (čára, sloupce)", ""],
    ["gridColor", "Mřížka a osa", "stroke"],
    ["labelColor", "Nadpis", "stroke"],
    ["valueColor", "Hodnota", "stroke"],
    ["pointColor", "Body na křivce", "color"],
    ["fill", "Podklad", ""],
  ],
  gauge: [
    ["color", "Ukazatel", ""],
    ["trackColor", "Dráha pod ukazatelem", "stroke"],
    ["valueColor", "Hodnota", "stroke"],
    ["labelColor", "Popisek", "stroke"],
    ["fill", "Podklad", ""],
  ],
  slider: [
    ["color", "Naplněná část", ""],
    ["trackColor", "Dráha", "stroke"],
    ["valueColor", "Hodnota", "stroke"],
    ["labelColor", "Popisek", "stroke"],
    ["fill", "Podklad", ""],
  ],
  signal: [
    ["color", "Stavová tečka", ""],
    ["labelColor", "Popisek", "stroke"],
    ["valueColor", "Text stavu", "stroke"],
    ["trackColor", "Obrys přepínače", "stroke"],
    ["stroke", "Rámeček", ""],
    ["fill", "Podklad", ""],
  ],
  qr: [
    ["color", "Body kódu", ""],
    ["fill", "Podklad", ""],
    ["stroke", "Rámeček", ""],
  ],
  barcode: [
    ["color", "Čáry", ""],
    ["valueColor", "Číslice", "color"],
    ["fill", "Podklad", ""],
  ],
  button: [
    ["color", "Text", ""],
    ["fill", "Výplň", ""],
    ["stroke", "Rámeček", ""],
  ],
  icon: [
    ["color", "Ikona", ""],
  ],
};

export const templateComponentsMixin = {
  _isTemplateComponentKind(type) {
    return COMPONENT_KINDS.has(String(type || ""));
  },

  _templateComponentParts(type) {
    return COMPONENT_PARTS[String(type || "")] || [];
  },

  // Resolve one part's colour: its own choice, else the field it inherits from,
  // else black. Yellow is mapped to red on a panel that has no yellow ink - the
  // same substitution the rest of the panel makes, made here rather than left
  // to the display, so the preview tells the truth.
  _componentColor(item, field, fallbackField = "", fallback = INK_BLACK) {
    const pick = (value) => {
      const raw = String(value ?? "").trim().toLowerCase();
      return raw && raw !== "inherit" ? raw : "";
    };
    const chosen = pick(item?.[field]) || pick(fallbackField && item?.[fallbackField]) || fallback;
    if (chosen === INK_YELLOW && !this._displaySupportsYellow?.()) return INK_RED;
    return chosen;
  },

  // A stroke thinner than about two device pixels disappears when the panel
  // thresholds it, so every line the components draw has a floor rather than a
  // width that shrinks with the box.
  _componentStroke(item, box, factor = 1) {
    const requested = Number(item?.strokeWidth);
    const base = Number.isFinite(requested) && requested > 0 ? requested : 2;
    return Math.max(1.6, Math.min(box.w, box.h) * 0.012 * base * factor);
  },

  _componentValueText(item) {
    const value = Number(item?.value);
    const number = Number.isFinite(value) ? value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 }) : "0";
    return item?.showPercent === false ? number : `${number}${item?.unit || ""}`;
  },

  // ------------------------------------------------------------- chart ---

  _componentChart(item, box) {
    const variant = String(item.variant || "bars");
    const data = this._componentColor(item, "color", "", INK_RED);
    const grid = this._componentColor(item, "gridColor", "stroke");
    const label = this._componentColor(item, "labelColor", "stroke");
    const valueInk = this._componentColor(item, "valueColor", "stroke");
    const point = this._componentColor(item, "pointColor", "color", data);
    const parts = [];
    const donut = variant === "donut";
    const showLabel = item.showLabel !== false;
    const showValue = item.showValue !== false;
    // The header is a band of its own. Printing the title over the plot is
    // what the template blocks had to be taught not to do - a series that
    // peaks early runs straight through its own caption.
    let headerHeight = !donut && (showLabel || showValue) ? Math.max(MIN_TEXT_BAND, box.h * 0.2) : 0;
    // A header that would leave no plot worth drawing is dropped instead of
    // squeezing the series into a couple of pixels.
    if (headerHeight && box.h - headerHeight < 12) headerHeight = 0;
    const plot = {
      x: box.x, y: box.y + headerHeight,
      w: box.w, h: Math.max(4, box.h - headerHeight),
    };

    if (donut) {
      // The ring used to be centred in the whole box while the label was
      // written a few pixels off the bottom edge, so the two shared the same
      // space: the caption sat across the bottom of the ring and was itself
      // cut in half by the edge. The label gets a band of its own and the ring
      // is centred in what remains - the arrangement every other gauge here
      // already used.
      const labelBand = showLabel && box.h >= MIN_TEXT_BAND * 2.4 ? Math.max(MIN_TEXT_BAND, Math.min(box.h * 0.18, 15)) : 0;
      const face = { x: box.x, y: box.y, w: box.w, h: Math.max(6, box.h - labelBand) };
      const radius = Math.min(face.w, face.h) * 0.38;
      const width = Math.max(3, radius * 0.3);
      const cx = face.x + face.w / 2;
      const cy = face.y + face.h / 2;
      const percent = Math.max(0, Math.min(100, Number(item.value) || 0)) / 100;
      if (item.showTrack !== false) {
        parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="none" stroke="${grid}" stroke-width="${width.toFixed(2)}"></circle>`);
      }
      if (percent > 0) {
        parts.push(`<path d="${this._svgArcPath(cx, cy, radius + width / 2, radius - width / 2, -90, -90 + percent * 360)}" fill="${data}"></path>`);
      }
      if (showValue) parts.push(this._svgText(this._componentValueText(item), cx, cy, Math.max(10, radius * 0.5), { bold: true, color: valueInk, maxWidth: radius * 1.5 }));
      if (labelBand) parts.push(this._svgText(item.chartTitle || item.text || "PODÍL", cx, box.y + box.h - labelBand / 2, labelBand * 0.8, { color: label, maxWidth: box.w * 0.94 }));
      return parts.join("");
    }

    const points = this._templateChartNormalizedPoints(item);
    // The series ran edge to edge, which put the first and last marker circles
    // half outside the element - they printed as clipped half-moons against
    // the border. Inset by the marker's own radius so the curve stays inside
    // the box it was given.
    const markerRoom = item.showPoints !== false && variant !== "spark" && variant !== "bars" && variant !== "bar"
      ? Math.min(plot.w * 0.08, Math.max(2, this._componentStroke(item, box) * 1.6))
      : 0;
    const toX = (p) => plot.x + markerRoom + (p.x / 100) * Math.max(1, plot.w - markerRoom * 2);
    // Vertically too: the highest and lowest readings sit on the plot's own
    // edges, so their markers were half outside the element - the same clipped
    // half-moon, turned ninety degrees. The grid lines keep the full band, so
    // the chart still reads against the box it was given.
    const toY = (p) => plot.y + markerRoom + ((p.y - 10) / 44) * Math.max(1, plot.h - markerRoom * 2);
    if (item.showGrid !== false && variant !== "spark") {
      [0, 0.5, 1].forEach((line) => {
        // The outer two rules bound the plot, so centring them on its edge put
        // half of each outside the element - on a short chart the top rule
        // printed as a broken line along the border.
        const y = plot.y + 0.5 + (plot.h - 1) * line;
        parts.push(`<path d="M${plot.x.toFixed(2)} ${y.toFixed(2)}H${(plot.x + plot.w).toFixed(2)}" fill="none" stroke="${grid}" stroke-width="1" stroke-dasharray="2 3"></path>`);
      });
    }
    const width = this._componentStroke(item, box);
    if (variant === "bars" || variant === "bar") {
      const step = plot.w / Math.max(1, points.length);
      const barWidth = Math.max(1.5, step * 0.62);
      points.forEach((p, index) => {
        const top = toY(p);
        // The lowest reading maps to the foot of the plot, so its bar came out
        // one pixel tall and read as an empty slot rather than as a low value.
        const height = Math.max(2, plot.y + plot.h - top);
        const x = plot.x + step * index + (step - barWidth) / 2;
        parts.push(`<rect x="${x.toFixed(2)}" y="${top.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" fill="${data}" rx="${Math.min(2, barWidth * 0.22).toFixed(2)}"></rect>`);
      });
    } else {
      const path = variant === "steps"
        ? points.map((p, index) => index
          ? `H${toX(p).toFixed(2)}V${toY(p).toFixed(2)}`
          : `M${toX(p).toFixed(2)} ${toY(p).toFixed(2)}`).join("")
        : `M${points.map((p) => `${toX(p).toFixed(2)} ${toY(p).toFixed(2)}`).join("L")}`;
      if (variant === "area" && item.showFill !== false) {
        const base = (plot.y + plot.h).toFixed(2);
        const wash = this._componentHalftoneFill(data, 25);
        if (wash) parts.push(`<path d="${path}L${toX(points.at(-1)).toFixed(2)} ${base}L${toX(points[0]).toFixed(2)} ${base}Z" fill="${wash}"></path>`);
      }
      // Round caps and joins are as soft as a panel that thresholds every
      // pixel allows: a mitred corner on a 2px line thresholds into a spike.
      parts.push(`<path d="${path}" fill="none" stroke="${data}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"></path>`);
      if (item.showPoints !== false && variant !== "spark" && points.length <= 14) {
        points.forEach((p) => parts.push(`<circle cx="${toX(p).toFixed(2)}" cy="${toY(p).toFixed(2)}" r="${Math.max(1.6, width * 1.1).toFixed(2)}" fill="${INK_WHITE}" stroke="${point}" stroke-width="${Math.max(1, width * 0.7).toFixed(2)}"></circle>`));
      }
    }
    if (showLabel) parts.push(this._svgText(item.chartTitle || "DATA", box.x, box.y + headerHeight * 0.5, Math.max(8, headerHeight * 0.5), { anchor: "start", color: label, maxWidth: box.w * 0.58 }));
    if (showValue) parts.push(this._svgText(this._componentValueText(item), box.x + box.w, box.y + headerHeight * 0.5, Math.max(10, headerHeight * 0.72), { anchor: "end", bold: true, color: valueInk, maxWidth: box.w * 0.4 }));
    return parts.join("");
  },

  // ------------------------------------------------------------- gauge ---

  _componentGauge(item, box) {
    const variant = String(item.variant || "ring");
    const data = this._componentColor(item, "color", "", INK_RED);
    const track = this._componentColor(item, "trackColor", "stroke");
    const valueInk = this._componentColor(item, "valueColor", "stroke");
    const label = this._componentColor(item, "labelColor", "stroke");
    const percent = Math.max(0, Math.min(100, Number(item.value) || 0)) / 100;
    const parts = [];
    const showLabel = item.showLabel !== false;
    const showValue = item.showValue !== false;
    const labelBand = showLabel ? Math.max(9, box.h * 0.16) : 0;
    const face = { x: box.x, y: box.y, w: box.w, h: Math.max(6, box.h - labelBand) };

    if (variant === "battery") {
      const capWidth = Math.max(2, face.w * 0.05);
      const bodyWidth = Math.max(4, face.w - capWidth - 2);
      const height = Math.min(face.h * 0.8, bodyWidth * 0.55);
      const top = face.y + (face.h - height) / 2;
      const edge = this._componentStroke(item, box, 0.9);
      parts.push(`<rect x="${face.x.toFixed(2)}" y="${top.toFixed(2)}" width="${bodyWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="${Math.min(4, height * 0.2).toFixed(2)}" fill="none" stroke="${track}" stroke-width="${edge.toFixed(2)}"></rect>`);
      parts.push(`<rect x="${(face.x + bodyWidth + 1).toFixed(2)}" y="${(top + height * 0.3).toFixed(2)}" width="${capWidth.toFixed(2)}" height="${(height * 0.4).toFixed(2)}" rx="1" fill="${track}"></rect>`);
      const inset = edge + 1.5;
      const fillWidth = Math.max(0, (bodyWidth - inset * 2) * percent);
      if (fillWidth > 0) parts.push(`<rect x="${(face.x + inset).toFixed(2)}" y="${(top + inset).toFixed(2)}" width="${fillWidth.toFixed(2)}" height="${Math.max(1, height - inset * 2).toFixed(2)}" rx="${Math.min(2, height * 0.12).toFixed(2)}" fill="${data}"></rect>`);
      // The charge reading sits on top of the charge itself, and both were
      // drawn in the same ink: at 63% the digits were inside the solid fill
      // and simply gone, with only the trailing "%" clear of its edge. A panel
      // has no third tone to separate them, so the reading is knocked out
      // instead - the same glyphs drawn twice, paper-coloured over the fill and
      // ink-coloured over the empty part, each clipped to its own side. The
      // charge stays readable as a bar and the number stays readable as a
      // number, at every percentage including the ones that split a digit.
      if (showValue) {
        const cx = face.x + bodyWidth / 2;
        const cy = top + height / 2;
        const size = Math.max(9, height * 0.5);
        const glyphs = (color) => this._svgText(this._componentValueText(item), cx, cy, size,
          { bold: true, color, maxWidth: bodyWidth * 0.8 });
        const fillRect = { x: face.x + inset, w: fillWidth };
        parts.push(this._componentClipped(glyphs(INK_WHITE), fillRect.x, top, Math.max(0, fillRect.w), height));
        parts.push(this._componentClipped(glyphs(valueInk), fillRect.x + fillRect.w, top,
          Math.max(0, bodyWidth - inset - fillRect.w), height));
      }
    } else if (variant === "thermometer") {
      const edge = this._componentStroke(item, box, 0.9);
      const bulb = Math.min(face.w * 0.3, face.h * 0.2);
      // Wide enough to hold its own outline and still have a column between
      // the walls. It was max(3, …) against an outline that is often 2 px a
      // side, so the mercury came out as a one-pixel hair inside an empty
      // tube - the reading was in the caption and nowhere in the drawing.
      const stemWidth = Math.max(edge * 2 + 3, bulb * 0.9);
      // The glyph moves off centre only when it is sharing the box with a
      // value, so the two stop competing for the middle.
      const cx = showValue ? face.x + Math.max(bulb + edge, face.w * 0.3) : face.x + face.w / 2;
      const bulbCy = face.y + face.h - bulb;
      const stemTop = face.y + bulb * 0.4;
      parts.push(`<path d="M${(cx - stemWidth / 2).toFixed(2)} ${bulbCy.toFixed(2)}V${stemTop.toFixed(2)}a${(stemWidth / 2).toFixed(2)} ${(stemWidth / 2).toFixed(2)} 0 0 1 ${stemWidth.toFixed(2)} 0V${bulbCy.toFixed(2)}" fill="none" stroke="${track}" stroke-width="${edge.toFixed(2)}"></path>`);
      parts.push(`<circle cx="${cx.toFixed(2)}" cy="${bulbCy.toFixed(2)}" r="${bulb.toFixed(2)}" fill="${data}" stroke="${track}" stroke-width="${edge.toFixed(2)}"></circle>`);
      const column = Math.max(0, (bulbCy - stemTop) * percent);
      if (column > 0) parts.push(`<rect x="${(cx - stemWidth / 2 + edge).toFixed(2)}" y="${(bulbCy - column).toFixed(2)}" width="${Math.max(2, stemWidth - edge * 2).toFixed(2)}" height="${column.toFixed(2)}" fill="${data}"></rect>`);
      // Placed against the tube rather than against the box edge, so the gap
      // between glyph and reading does not depend on how long the reading is.
      if (showValue) {
        const room = Math.max(12, face.x + face.w - (cx + bulb + edge * 2));
        parts.push(this._svgText(this._componentValueText(item), face.x + face.w, face.y + face.h * 0.42,
          Math.max(9, face.h * 0.18), { anchor: "end", bold: true, color: valueInk, maxWidth: room }));
      }
    } else {
      const semicircle = variant === "dial" || variant === "semicircle";
      // The arc is drawn as a band, so what has to fit the face is the radius
      // plus half the band - 1.13 radii, since the band is 0.26 of it. Sizing
      // the radius alone against the face let the dial's outer edge run above
      // the top of the element by a third of its own thickness, which printed
      // as a flat-topped arc clipped by the border.
      const spread = 1.13;
      const radius = semicircle
        ? Math.min(face.w * 0.5 / spread, Math.max(3, face.h * 0.92 - 2) / spread)
        // The full ring had the same arithmetic slip in miniature: 0.44 of the
        // face plus half a band of 0.26 comes to 0.497 - and the band has a
        // 3 px floor, which on a short element pushed it over the edge.
        : Math.min(face.w, face.h) * 0.5 / spread;
      const width = Math.max(3, radius * 0.26);
      const cx = face.x + face.w / 2;
      const cy = semicircle ? face.y + face.h * 0.92 : face.y + face.h / 2;
      const from = semicircle ? -180 : -90;
      const sweep = semicircle ? 180 : 360;
      if (item.showTrack !== false) {
        const trackArc = this._svgArcPath(cx, cy, radius + width / 2, radius - width / 2, from, from + sweep - 0.01);
        const wash = this._componentHalftoneFill(track, 25);
        if (wash) parts.push(`<path d="${trackArc}" fill="${wash}"></path>`);
        parts.push(`<path d="${trackArc}" fill="none" stroke="${track}" stroke-width="1"></path>`);
      }
      if (percent > 0) parts.push(`<path d="${this._svgArcPath(cx, cy, radius + width / 2, radius - width / 2, from, from + sweep * percent)}" fill="${data}"></path>`);
      if (showValue) parts.push(this._svgText(this._componentValueText(item), cx, semicircle ? cy - radius * 0.32 : cy, Math.max(10, radius * (semicircle ? 0.46 : 0.56)), { bold: true, color: valueInk, maxWidth: radius * 1.6 }));
    }
    if (showLabel) parts.push(this._svgText(item.text || "Hodnota", box.x + box.w / 2, box.y + box.h - labelBand * 0.42, Math.max(8, labelBand * 0.66), { color: label, maxWidth: box.w * 0.94 }));
    return parts.join("");
  },

  // ---------------------------------------------------------- progress ---

  _componentSlider(item, box) {
    const data = this._componentColor(item, "color", "", INK_RED);
    const track = this._componentColor(item, "trackColor", "stroke");
    const valueInk = this._componentColor(item, "valueColor", "stroke");
    const label = this._componentColor(item, "labelColor", "stroke");
    const percent = Math.max(0, Math.min(100, Number(item.value) || 0)) / 100;
    const showLabel = item.showLabel !== false;
    const showValue = item.showValue !== false;
    const showScale = item.showScale !== false;
    const parts = [];
    // Six pixels is the floor a track needs to hold an outline, a gap and a
    // fill without the three thresholding into one smear. It is claimed first,
    // because a progress bar without its bar is not a progress bar.
    const barWanted = Math.max(6, Math.min(box.h * 0.34, 14));
    // Then the type, widest band first, each only if what is left can seat a
    // readable glyph. See MIN_TEXT_BAND.
    let headerHeight = showLabel || showValue ? Math.max(MIN_TEXT_BAND, box.h * 0.3) : 0;
    if (headerHeight + barWanted > box.h) headerHeight = 0;
    let scaleHeight = showScale ? Math.max(MIN_TEXT_BAND, box.h * 0.22) : 0;
    if (headerHeight + scaleHeight + barWanted > box.h) scaleHeight = 0;
    const barHeight = Math.max(3, Math.min(barWanted, box.h - headerHeight - scaleHeight));
    const barY = box.y + headerHeight + Math.max(0, (box.h - headerHeight - scaleHeight - barHeight) / 2);
    const radius = barHeight / 2;
    // Sized to the band that holds them, so a tall element gets big type and a
    // short one gets type that still fits between the edge and the track. The
    // two share the width with a gap, or a long name runs into its own value.
    if (showLabel && headerHeight) parts.push(this._svgText(item.text || "Průběh", box.x, box.y + headerHeight / 2, headerHeight * 0.66, { anchor: "start", color: label, maxWidth: box.w * 0.55 }));
    if (showValue && headerHeight) parts.push(this._svgText(this._componentValueText(item), box.x + box.w, box.y + headerHeight / 2, headerHeight * 0.8, { anchor: "end", bold: true, color: valueInk, maxWidth: box.w * 0.4 }));
    if (item.showTrack !== false) {
      // An SVG stroke straddles the path, so a rect on the box edge loses half
      // its outline off the side of the element. Inset by half the width.
      const edge = this._componentStroke(item, box, 0.8);
      parts.push(`<rect x="${(box.x + edge / 2).toFixed(2)}" y="${barY.toFixed(2)}" width="${Math.max(1, box.w - edge).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="${radius.toFixed(2)}" fill="none" stroke="${track}" stroke-width="${edge.toFixed(2)}"></rect>`);
    }
    const inset = Math.max(1.5, barHeight * 0.2);
    const fillWidth = Math.max(0, (box.w - inset * 2) * percent);
    if (fillWidth > 0) {
      parts.push(`<rect x="${(box.x + inset).toFixed(2)}" y="${(barY + inset).toFixed(2)}" width="${fillWidth.toFixed(2)}" height="${Math.max(1, barHeight - inset * 2).toFixed(2)}" rx="${Math.max(0, radius - inset).toFixed(2)}" fill="${data}"></rect>`);
    }
    if (scaleHeight) {
      // Centred in its own band rather than hung a fraction below the track,
      // which is what used to put the baseline past the bottom edge.
      const scaleY = barY + barHeight + scaleHeight / 2;
      const size = scaleHeight * 0.78;
      parts.push(this._svgText("0", box.x, scaleY, size, { anchor: "start", color: label, maxWidth: box.w * 0.2 }));
      parts.push(this._svgText("50", box.x + box.w / 2, scaleY, size, { color: label, maxWidth: box.w * 0.2 }));
      parts.push(this._svgText("100", box.x + box.w, scaleY, size, { anchor: "end", color: label, maxWidth: box.w * 0.2 }));
    }
    return parts.join("");
  },

  // --------------------------------------------------------- indicator ---

  _componentSignal(item, box) {
    const active = typeof item.resolvedActive === "boolean"
      ? item.resolvedActive
      : !["off", "inactive"].includes(String(item.variant || ""));
    const dot = this._componentColor(item, "color", "", INK_RED);
    const label = this._componentColor(item, "labelColor", "stroke");
    const state = this._componentColor(item, "valueColor", "stroke");
    const track = this._componentColor(item, "trackColor", "stroke");
    const parts = [];
    const pad = Math.max(3, box.h * 0.16);
    const showState = item.showState !== false;
    // The switch reads the state from across a room; the words only confirm
    // it. It gets a fixed share of the width so the label never squeezes it
    // down into an unreadable smudge.
    const pillWidth = showState ? Math.max(18, Math.min(box.w * 0.26, box.h * 1.7)) : 0;
    const pillHeight = Math.max(9, Math.min(box.h * 0.5, pillWidth * 0.56));
    // The ZAP/VYP caption used to hang off the bottom of the element: its
    // baseline was the row centre plus half the pill plus at least 5 px, which
    // leaves the box on anything shorter than about 30 px - and the palette's
    // own indicator is 16. Pill and caption are one stack now, centred
    // together, and the caption is dropped when the box cannot seat it rather
    // than printed as a row of half-letters.
    const captionBand = showState && pillHeight + MIN_TEXT_BAND <= box.h ? MIN_TEXT_BAND : 0;
    const stackHeight = pillHeight + captionBand;
    const pillY = box.y + Math.max(0, (box.h - stackHeight) / 2);
    // Everything on the row lines up with the switch, not with the box, so a
    // caption underneath does not leave the label sitting lower than the pill.
    const centre = pillY + pillHeight / 2;
    let cursor = box.x + pad;
    if (item.showIcon !== false && item.icon) {
      const size = Math.min(box.h * 0.56, box.w * 0.22);
      parts.push(this._svgIcon(item.icon, cursor + size / 2, centre, size, active ? dot : track));
      // A real gap: pad * 0.6 came to under two pixels on a short element and
      // the glyph ran straight into the first letter of the label.
      cursor += size + Math.max(3, size * 0.3);
    }
    const pillX = box.x + box.w - pad - pillWidth;
    if (item.showLabel !== false) {
      const room = Math.max(8, pillX - cursor - pad * 0.6);
      parts.push(this._svgText(item.text || item.label || "Stav", cursor, centre, Math.max(9, box.h * 0.34), { anchor: "start", bold: true, color: label, maxWidth: room }));
    }
    if (showState) {
      const radius = pillHeight / 2;
      // A screen, not a tint: at 18% alpha this fill quantized to plain white
      // on every panel, so the "on" pill was indistinguishable from the "off".
      const bed = active ? this._componentHalftoneFill(dot, 25) : INK_WHITE;
      parts.push(`<rect x="${pillX.toFixed(2)}" y="${pillY.toFixed(2)}" width="${pillWidth.toFixed(2)}" height="${pillHeight.toFixed(2)}" rx="${radius.toFixed(2)}" fill="${bed || INK_WHITE}" stroke="${track}" stroke-width="${this._componentStroke(item, box, 0.7).toFixed(2)}"></rect>`);
      const knob = radius * 0.66;
      const knobX = active ? pillX + pillWidth - radius : pillX + radius;
      parts.push(`<circle cx="${knobX.toFixed(2)}" cy="${centre.toFixed(2)}" r="${knob.toFixed(2)}" fill="${active ? dot : track}"></circle>`);
      if (captionBand) {
        parts.push(this._svgText(active ? "ZAP" : "VYP", pillX + pillWidth / 2, pillY + pillHeight + captionBand / 2,
          captionBand * 0.82, { color: state, maxWidth: pillWidth * 1.4 }));
      }
    }
    return parts.join("");
  },

  // -------------------------------------------------------------- code ---

  // The modules as one path rather than a rect each: a 45x45 symbol is two
  // thousand rectangles, and the browser has to keep every one of them alive
  // for as long as the element is on the canvas.
  _qrModulePath(text, box, color) {
    if (!text) return "";
    const code = qrcode(0, String(this._qrCorrection || "M"));
    code.addData(String(text));
    try {
      code.make();
    } catch (_error) {
      // More data than the largest symbol holds. A missing code beats one
      // that scans to something else.
      return "";
    }
    const modules = code.getModuleCount();
    const quiet = 2;
    const side = Math.min(box.w, box.h);
    // Whole pixels per module, or the panel's threshold turns a half-pixel
    // seam into a module of its own and the code stops scanning.
    const cell = Math.max(1, Math.floor(side / (modules + quiet * 2)));
    const drawn = cell * modules;
    const x = Math.round(box.x + (box.w - drawn) / 2);
    const y = Math.round(box.y + (box.h - drawn) / 2);
    let path = "";
    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        if (code.isDark(row, column)) path += `M${x + column * cell} ${y + row * cell}h${cell}v${cell}h${-cell}z`;
      }
    }
    return `<path d="${path}" fill="${color}" shape-rendering="crispEdges"></path>`;
  },

  _componentQr(item, box) {
    const modules = this._componentColor(item, "color");
    const frame = this._componentColor(item, "stroke", "", "transparent");
    const text = String(item.text || "https://dratek.cz");
    const markup = this._qrModulePath?.(text, box, modules);
    if (!markup) return "";
    const border = frame !== "transparent" && Number(item.strokeWidth) > 0
      ? `<rect x="${(box.x + 0.5).toFixed(2)}" y="${(box.y + 0.5).toFixed(2)}" width="${Math.max(1, box.w - 1).toFixed(2)}" height="${Math.max(1, box.h - 1).toFixed(2)}" rx="${Number(item.radius || 0).toFixed(2)}" fill="none" stroke="${frame}" stroke-width="${this._componentStroke(item, box, 0.8).toFixed(2)}"></rect>`
      : "";
    return markup + border;
  },

  _componentBarcode(item, box) {
    const bars = this._componentColor(item, "color");
    const digitsInk = this._componentColor(item, "valueColor", "color", bars);
    const digits = this._normalizeEan13?.(item?.text || "859123456789") || "8591234567890";
    const pattern = this._ean13Pattern?.(digits) || "1010101";
    // The digit row asked for 20% of the height but never less than 7 px, and
    // then wrote type into it that _svgText will not draw below 10 - so on a
    // short element the numerals hung below the bars and off the bottom of the
    // symbol. It gets a band that can hold them, or it does not get drawn.
    let captionHeight = item.showValue === false ? 0 : Math.max(MIN_TEXT_BAND, box.h * 0.2);
    if (captionHeight && box.h - captionHeight < 8) captionHeight = 0;
    const barsHeight = Math.max(4, box.h - captionHeight);
    const unit = box.w / Math.max(1, pattern.length);
    let path = "";
    [...pattern].forEach((bit, index) => {
      if (bit !== "1") return;
      path += `M${(box.x + index * unit).toFixed(2)} ${box.y.toFixed(2)}h${unit.toFixed(2)}v${barsHeight.toFixed(2)}h${(-unit).toFixed(2)}z`;
    });
    const parts = [`<path d="${path}" fill="${bars}" shape-rendering="crispEdges"></path>`];
    if (captionHeight) {
      parts.push(this._svgText(digits, box.x + box.w / 2, box.y + barsHeight + captionHeight / 2, captionHeight * 0.82, { color: digitsInk, maxWidth: box.w * 0.9 }));
    }
    return parts.join("");
  },

  // ------------------------------------------------------ button, icon ---

  _componentButton(item, box) {
    const text = this._componentColor(item, "color");
    const fill = this._componentColor(item, "fill", "", "transparent");
    const stroke = this._componentColor(item, "stroke", "", "transparent");
    const width = Number(item.strokeWidth) > 0 ? this._componentStroke(item, box, 0.8) : 0;
    const radius = Math.max(0, Math.min(Number(item.radius) || 0, Math.min(box.w, box.h) / 2));
    const parts = [];
    if (fill !== "transparent" || (stroke !== "transparent" && width > 0)) {
      parts.push(`<rect x="${(box.x + width / 2).toFixed(2)}" y="${(box.y + width / 2).toFixed(2)}"`
        + ` width="${Math.max(1, box.w - width).toFixed(2)}" height="${Math.max(1, box.h - width).toFixed(2)}"`
        + ` rx="${radius.toFixed(2)}" fill="${fill}"`
        + `${stroke !== "transparent" && width > 0 ? ` stroke="${stroke}" stroke-width="${width.toFixed(2)}"` : ""}></rect>`);
    }
    const size = Math.max(8, Math.min(Number(item.fontSize) || 15, box.h * 0.62));
    parts.push(this._svgText(item.text || item.label || "Popisek", box.x + box.w / 2, box.y + box.h / 2, size, {
      bold: Number(item.fontWeight) >= 700, color: text, maxWidth: box.w - Math.max(6, radius),
    }));
    return parts.join("");
  },

  _componentIcon(item, box) {
    return this._svgIcon(item.icon || "star", box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) * 0.94,
      this._componentColor(item, "color"));
  },

  // ------------------------------------------------------------ shared ---

  // Returns a `fill` value - a pattern reference - for an area that wants to
  // read as a lighter shade of `color`, and records the pattern for the
  // enclosing <svg> to emit. Empty for a colour that draws nothing, so the
  // caller can drop the shape rather than paint `fill=""`.
  _componentHalftoneFill(color, density = 25) {
    if (!color || color === "transparent") return "";
    const screen = HALFTONE_SCREENS[density] || HALFTONE_SCREENS[25];
    const id = `dratek-halftone-${HALFTONE_SERIAL += 1}`;
    this._componentDefs ||= [];
    this._componentDefs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${screen.cell}" height="${screen.cell}">`
      + screen.dots.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"></rect>`).join("")
      + `</pattern>`,
    );
    return `url(#${id})`;
  },

  // Wraps markup in a clip to a rectangle. Ids are serialised for the same
  // reason the screens' are: several components share one designer document.
  _componentClipped(markup, x, y, width, height) {
    if (!markup || width <= 0 || height <= 0) return "";
    const id = `dratek-clip-${HALFTONE_SERIAL += 1}`;
    this._componentDefs ||= [];
    this._componentDefs.push(
      `<clipPath id="${id}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}"></rect></clipPath>`,
    );
    return `<g clip-path="url(#${id})">${markup}</g>`;
  },

  _templateComponentBody(item, box) {
    switch (String(item.type)) {
      case "chart": return this._componentChart(item, box);
      case "gauge": return this._componentGauge(item, box);
      case "slider": return this._componentSlider(item, box);
      case "signal": return this._componentSignal(item, box);
      case "qr": return this._componentQr(item, box);
      case "barcode": return this._componentBarcode(item, box);
      case "button": return this._componentButton(item, box);
      case "icon": return this._componentIcon(item, box);
      default: return "";
    }
  },

  // The component drawn at the pixel size it occupies on the panel. Font
  // floors inside _svgText are absolute, so a fixed viewBox would lay every
  // component out for a display it is not going on - which is exactly what the
  // old 100x60 preview box did.
  _renderTemplateComponentSvg(item, canvasWidth = 296, canvasHeight = 128) {
    if (!this._isTemplateComponentKind(item?.type)) return "";
    const w = Math.max(8, Math.round((Math.max(1, Number(canvasWidth) || 296) * (Number(item.w) || 20)) / 100));
    const h = Math.max(8, Math.round((Math.max(1, Number(canvasHeight) || 128) * (Number(item.h) || 12)) / 100));
    // The glyph comes from a cache filled by a live <ha-icon>, so a component
    // naming one it has not seen draws nothing until the fetch lands. Asking
    // here covers the palette tile, the canvas and the catalogue thumbnail at
    // once; _requestTemplateIcons repaints the panel when the geometry
    // arrives and does nothing at all for a name it already holds.
    if (item.icon && ["icon", "signal"].includes(String(item.type))) this._requestTemplateIcons?.([{ icon: item.icon }]);
    const background = this._componentColor(item, "fill", "", "transparent");
    // A frame is the button's and the QR's own business; everything else is
    // drawn inside a margin so a stroke or a glyph never sits on the edge.
    const framed = item.type === "button" || item.type === "qr";
    // The margin has to clear the heaviest stroke the body will draw, not just
    // be a fraction of the box: an SVG stroke straddles its path, so a grid
    // line on the plot's own edge, a bar chart's baseline or the top of a
    // thermometer's tube each lost half their width off the side of the
    // element. At the small end the old 5% came to barely a pixel, which is
    // less than half of any line here.
    const pad = framed ? 0 : Math.max(1, this._componentStroke(item, { w, h }) / 2 + 0.5, Math.min(w, h) * 0.05);
    const box = { x: pad, y: pad, w: Math.max(4, w - pad * 2), h: Math.max(4, h - pad * 2), fullX: 0, fullW: w };
    const plate = background !== "transparent" && !framed
      ? `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.max(0, Math.min(Number(item.radius) || 0, Math.min(w, h) / 2)).toFixed(2)}" fill="${background}"></rect>`
      : item.type === "qr" && background !== "transparent"
        ? `<rect x="0" y="0" width="${w}" height="${h}" fill="${background}"></rect>`
        : "";
    // Collected while the body is built, so the body has to be built first -
    // the patterns it asks for do not exist until then.
    this._componentDefs = [];
    const body = this._templateComponentBody(item, box);
    const defs = this._componentDefs.length
      ? `<defs>${this._componentDefs.join("")}</defs>`
      : "";
    this._componentDefs = [];
    return `<svg class="template-component-visual" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"`
      + ` font-family="${COMPONENT_FONT}" aria-hidden="true">${defs}${plate}${body}</svg>`;
  },

  // Icons resolve from a cache that a closed SVG document cannot reach, so the
  // ones a component names have to be warm before its markup is built.
  _templateComponentIconNames(items) {
    return [...new Set((items || [])
      .filter((item) => item?.icon && ["icon", "signal"].includes(String(item.type)))
      .map((item) => String(item.icon)))];
  },
};
