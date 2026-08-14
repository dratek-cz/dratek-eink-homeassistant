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

import qrcode from "../qrcode-generator.js";
import { DISPLAY_TEMPLATES } from "./templates/index.js";

const RED = "#e31b1b";
const BLACK = "#000000";
const FONT = "Arial, Helvetica, sans-serif";
// Ten native device pixels are the practical lower limit for Czech diacritics
// and numerals on the supported e-ink panels. Preview scaling can make a 6–7 px
// font look acceptable on a monitor even though it becomes only a few broken
// dots after the physical panel's three-colour quantisation.
const MIN_READABLE_FONT_SIZE = 10;
// The backend refetches RainViewer at most every ten minutes (that is the real
// data's own refresh cadence - see meteoradar.py), so re-fetching a rendered
// PNG through the websocket more often than this just spends round trips on the
// same frame. Two minutes is a compromise: interactive editing (resizing the
// slot, switching templates) still sees a fresh-ish image without hammering the
// connection on every re-render tick.
const METEORADAR_CACHE_MS = 2 * 60 * 1000;
// A failed fetch (most commonly: camera.meteoradar does not exist yet because
// Home Assistant has not restarted since this integration was updated) retries
// far sooner than a success is cached for, so the map appears on its own shortly
// after the underlying cause clears instead of waiting out the full success TTL.
const METEORADAR_RETRY_MS = 15 * 1000;

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
        const svg = this._findRenderedIconSvg(icon.shadowRoot) || this._findRenderedIconSvg(icon);
        // Wait for something drawable, not merely for a non-empty <svg>.
        //
        // Home Assistant's ha-icon renders an <ha-svg-icon>, which renders
        // <svg><g>…</g></svg> through Lit. The <svg> and its <g> exist from the
        // first frame; the <path> only appears once the mdi chunk has loaded.
        // Treating any non-empty innerHTML as success therefore captured an empty
        // group, cached it as a hit and never retried - so whichever icons lost
        // that race stayed blank for the whole session. The weather template asks
        // for five icons out of one chunk and lost it every time, which is why it
        // showed none while the house showed its own.
        if (svg) {
          return {
            // Lit leaves comment markers behind; they serialise into the exported
            // SVG for no benefit.
            inner: svg.innerHTML.replace(/<!--[\s\S]*?-->/g, "").trim(),
            viewBox: svg.getAttribute("viewBox") || "0 0 24 24",
          };
        }
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

  _templateNeedsRadarImage(rows) {
    return (rows || []).some((row) => row?.radarMap);
  },

  // Fetches (or reuses a cached) rendered radar map at roughly the template's
  // own resolution. The image is embedded with preserveAspectRatio, so it does
  // not need to match the radarMap row's exact sub-box - only be large enough
  // that scaling it down stays sharp.
  //
  // A failure is cached too, distinctly from "never tried yet" - the most common
  // cause is camera.meteoradar not existing until Home Assistant restarts after
  // an update, and silently leaving the "Loading…" placeholder up forever gave
  // no hint that anything had actually gone wrong. Failures retry sooner than a
  // successful fetch's own cache lifetime, so the map appears on its own shortly
  // after the underlying cause (usually that restart) is resolved.
  async _ensureTemplateRadarImage(width, height) {
    const country = this._meteoradarCountry || this._displayTemplateConfig?.meteoradar_country || "cz";
    const showPrecipitation = this._displayTemplateConfig?.meteoradar_show_precipitation !== false;
    const dottedLight = this._displayTemplateConfig?.meteoradar_dotted_light !== false;
    const showWind = this._displayTemplateConfig?.meteoradar_show_wind === true;
    const locationAddress = this._meteoradarHomeAddress || this._displayTemplateConfig?.meteoradar_home_address || "";
    const preserveYellow = this._displaySupportsYellow?.() === true;

    const key = `${Math.round(width)}x${Math.round(height)}_${country}_p${showPrecipitation}_d${dottedLight}_w${showWind}_h${locationAddress}_y${preserveYellow}`;
    const cached = this._meteoradarImageCache;
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    const ttl = cached?.dataUrl ? METEORADAR_CACHE_MS : METEORADAR_RETRY_MS;
    if (cached && cached.key === key && age < ttl) return false;
    if (!this._hass?.callWS) return false;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/render_meteoradar",
        width: Math.round(width),
        height: Math.round(height),
        country: country,
        show_precipitation: showPrecipitation,
        dotted_light: dottedLight,
        show_wind: showWind,
        location_address: locationAddress,
        preserve_yellow: preserveYellow,
      });
      if (!result?.ok || !result?.image) {
        this._meteoradarImageCache = { key, dataUrl: "", fetchedAt: Date.now(), error: "Server nevrátil obrázek." };
        return true;
      }
      this._meteoradarImageCache = { key, dataUrl: result.image, fetchedAt: Date.now(), error: "" };
      return true;
    } catch (error) {
      this._meteoradarImageCache = { key, dataUrl: "", fetchedAt: Date.now(), error: this._message?.(error) || String(error?.message || error) };
      return true;
    }
  },

  // The blocking counterpart used by the export path: a manual send must never
  // go out with a stale or missing map, so it waits for the fetch instead of
  // drawing the placeholder used during interactive editing.
  async _preloadTemplateRadarImage(rows, width, height) {
    if (!this._templateNeedsRadarImage(rows)) return;
    await this._ensureTemplateRadarImage(width, height);
  },

  // Non-blocking counterpart for the live on-screen preview, matching how
  // _requestTemplateIcons keeps icon loading off the render path.
  _requestTemplateRadarImage(rows, width, height) {
    if (!this._templateNeedsRadarImage(rows) || this._radarImageRequestPending) return;
    this._radarImageRequestPending = true;
    this._ensureTemplateRadarImage(width, height)
      .then((changed) => {
        this._radarImageRequestPending = false;
        if (changed) this._scheduleTemplateIconRepaint();
      })
      .catch(() => {
        this._radarImageRequestPending = false;
      });
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
  _templateBaseDefinition(template) {
    if (!template?.base_template_id) return template;
    return this._displayTemplateCards?.().find((item) => item.id === template.base_template_id) || template;
  },

  _templateAdjustmentsForRender(template) {
    if (!template) return {};
    if (String(this._selectedDisplayTemplateId || "") === String(template.id || "")) return this._templateElementAdjustments || {};
    return template.element_adjustments || this._templateEditorStates?.[template.id]?.element_adjustments || {};
  },

  _applyTemplateAdjustmentsToSvgMarkup(markup, template, slot = "primary") {
    const adjustments = this._templateAdjustmentsForRender(template);
    if (!markup || !Object.keys(adjustments || {}).length || typeof DOMParser === "undefined") return markup;
    try {
      const documentNode = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><g id="template-adjustment-root">${markup}</g></svg>`, "image/svg+xml");
      const root = documentNode.getElementById("template-adjustment-root");
      if (!root) return markup;
      const baseId = template?.base_template_id || template?.id || "";
      const templateId = template?.id || baseId;
      const entries = [...root.children].map((element, index) => {
        const adjustment = adjustments[`${slot}:${templateId}:${index}`] || adjustments[`${slot}:${baseId}:${index}`] || {};
        const x = Number(adjustment.x || 0), y = Number(adjustment.y || 0);
        const scale = Math.max(.2, Math.min(3, Number(adjustment.scale ?? 1)));
        const rotation = Number(adjustment.rotation || 0);
        const cx = Number(adjustment.baseX || 0) + Number(adjustment.baseWidth || 0) / 2;
        const cy = Number(adjustment.baseY || 0) + Number(adjustment.baseHeight || 0) / 2;
        if (adjustment.hidden) element.remove();
        else if (x || y || rotation || scale !== 1) {
          const original = element.getAttribute("transform") || "";
          element.setAttribute("transform", `${original} translate(${x} ${y}) translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(${-cx} ${-cy})`.trim());
        }
        const color = { black: "#111111", red: "#d71912", yellow: this._displaySupportsYellow?.() ? "#f4c400" : "#d71912", white: "#ffffff" }[adjustment.color];
        if (color && element.isConnected) {
          [element, ...element.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")].forEach((node) => {
            const fill = node.getAttribute("fill"), stroke = node.getAttribute("stroke");
            if (fill && fill !== "none" && !["#fff", "#ffffff", "white"].includes(fill.toLowerCase())) node.setAttribute("fill", color);
            if (stroke && stroke !== "none" && !["#fff", "#ffffff", "white"].includes(stroke.toLowerCase())) node.setAttribute("stroke", color);
          });
        }
        return { element, order: Number(adjustment.order || 0), index };
      });
      entries.filter(({ element }) => element.isConnected).sort((a, b) => a.order - b.order || a.index - b.index).forEach(({ element }) => root.appendChild(element));
      const serializer = new XMLSerializer();
      return [...root.children].map((element) => serializer.serializeToString(element)).join("");
    } catch (_error) {
      return markup;
    }
  },

  _templateSvgPreviewMarkup(template, width, height) {
    if (!template) return "";
    // The catalog may decorate the "create" tile, but the actual designer and
    // exported image must start as a completely white canvas.
    if (template.id === "blank" || (template.user_created && !template.base_template_id)) return "";
    const baseTemplate = this._templateBaseDefinition(template);
    const rows = this._templateSvgRows(baseTemplate);
    this._requestTemplateIcons(rows);
    this._requestTemplateRadarImage(rows, width, height);
    this._warmTemplateIcons();
    return this._applyTemplateAdjustmentsToSvgMarkup(this._layoutTemplateSvg(rows, width, height), template);
  },

  // Wrapped as a standalone <svg> so it can sit inside the preview's
  // foreignObject and still scale with the slot. This is the on-screen copy only;
  // what the panel receives is built by _buildDisplayTemplateSvg at the display's
  // native resolution, so nothing here has to survive being cloned or serialised.
  _templateSvgPreviewBody(template, width, height) {
    const markup = this._templateSvgPreviewMarkup(template, width, height);
    if (!markup) return "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"`
      + ` viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + `<g class="tpl">${markup}</g>`
      + `</svg>`;
  },

  // The catalog tile is a fixed box, so the panel letterboxes inside it rather
  // than stretching to fill it. A blank template stays blank here as well.
  _templateSvgThumbnail(template, width, height) {
    const cacheKey = `${template?.id || "blank"}:${Math.round(width)}x${Math.round(height)}:${this._displayPaletteKey?.() || "bwr"}`;
    this._templateThumbnailMarkupCache ||= new Map();
    const cached = this._templateThumbnailMarkupCache.get(cacheKey);
    if (cached) return cached;
    const markup = this._templateSvgPreviewMarkup(template, width, height);
    const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"`
      + ` viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + markup
      + `</svg>`;
    const rows = template ? this._templateSvgRows(this._templateBaseDefinition(template)) : [];
    if (template?.id !== "custom_image" && !template?.user_created && !this._templateIconNames(rows).some((name) => !ICON_GEOMETRY.has(name))) {
      this._templateThumbnailMarkupCache.set(cacheKey, thumbnail);
      if (this._templateThumbnailMarkupCache.size > 96) this._templateThumbnailMarkupCache.delete(this._templateThumbnailMarkupCache.keys().next().value);
    }
    return thumbnail;
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

  _svgFitFontSize(value, size, maxWidth, bold, minSize = MIN_READABLE_FONT_SIZE) {
    const text = String(value ?? "");
    const requested = Math.max(minSize, Number(size) || minSize);
    if (!maxWidth || !text) return requested;
    const estimated = this._svgTextWidth(text, requested, bold);
    return estimated > maxWidth ? Math.max(minSize, requested * (maxWidth / estimated)) : requested;
  },

  _svgReadableText(value, size, maxWidth, bold, minSize = MIN_READABLE_FONT_SIZE) {
    const original = String(value ?? "");
    const fontSize = this._svgFitFontSize(original, size, maxWidth, bold, minSize);
    if (!maxWidth || this._svgTextWidth(original, fontSize, bold) <= maxWidth) return { text: original, fontSize };
    const ellipsis = "…";
    let clipped = original;
    while (clipped.length > 1 && this._svgTextWidth(`${clipped}${ellipsis}`, fontSize, bold) > maxWidth) clipped = clipped.slice(0, -1);
    return { text: clipped.length < original.length ? `${clipped.trimEnd()}${ellipsis}` : original, fontSize };
  },

  _svgText(value, x, y, size, options = {}) {
    const text = String(value ?? "");
    if (!text) return "";
    const bold = !!options.bold;
    const fitted = this._svgReadableText(text, size, options.maxWidth, bold, options.minSize);
    const fontSize = fitted.fontSize;
    const anchor = options.anchor || "middle";
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${FONT}" font-size="${fontSize.toFixed(2)}"`
      + ` font-weight="${bold ? 700 : 400}" fill="${options.color || BLACK}" text-anchor="${anchor}"`
      + ` dominant-baseline="central" xml:space="preserve">${this._escape(fitted.text)}</text>`;
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
  // `collector`, when given, receives one { rowIndex, box } entry per row this
  // pass lays out - box geometry only, nothing about what the row draws. The
  // variable-preview crop in the template settings dialog is the only
  // consumer: it needs to know exactly which rectangle of the finished SVG a
  // given variable landed in, and that rectangle is a side effect of this
  // same layout math, not something worth recomputing separately (and risking
  // it drifting from what actually gets drawn).
  _layoutTemplateSvg(rows, width, height, collector) {
    if (rows.length === 1 && (rows[0]?.dither || rows[0]?.customImage) && rows[0]?.pixelPerfect) {
      const box = { x: 0, y: 0, w: width, h: height, fullX: 0, fullW: width };
      if (collector && rows[0].__rowIndex !== undefined) collector.push({ rowIndex: rows[0].__rowIndex, box });
      return this._renderTemplateBlock(rows[0], box);
    }
    return width / height >= LANDSCAPE_ASPECT
      ? this._layoutTemplateSvgColumns(rows, width, height, collector)
      : this._layoutTemplateSvgStacked(rows, width, height, collector);
  },

  _layoutTemplateSvgStacked(rows, width, height, collector) {
    const pad = Math.max(3, Math.round(Math.min(width, height) * 0.035));
    const footerRow = rows.find((row) => row.footer);
    const footerHeight = footerRow ? Math.max(18, Math.round(height * (footerRow.h || 0.16))) : 0;
    const box = { x: pad, y: pad, w: width - pad * 2, h: height - footerHeight - pad, fullX: 0, fullW: width };
    const parts = this._stackTemplateBlocks(rows.filter((row) => !row.footer), box, height, collector);
    parts.push(...this._layoutTemplateFooter(footerRow, width, height, footerHeight, collector));
    return parts.join("");
  },

  // The wide-panel arrangement: what identifies the template - its icon, its name
  // and its headline reading - fills a leading column, its content blocks stack in
  // a second one, and the footer keeps the full-width band it has when stacked.
  // Rows are re-grouped rather than re-authored, so a template says the same thing
  // on a 296x128 tag as it does on a 240x416 one.
  _layoutTemplateSvgColumns(rows, width, height, collector) {
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
      parts.push(...this._stackTemplateBlocks(lead.length ? lead : flowRows, box, 0, collector));
      if (lead.length && detail.length) parts.push(...this._stackTemplateBlocks(detail, box, 0, collector));
    } else {
      const gap = pad;
      const leadWidth = Math.max(1, Math.round((width - pad * 2 - gap) * 0.42));
      const detailX = pad + leadWidth + gap;
      const detailWidth = Math.max(1, width - pad - detailX);
      parts.push(...this._stackTemplateBlocks(lead, { x: pad, y: pad, w: leadWidth, h: columnHeight, fullX: pad, fullW: leadWidth }, 0, collector));
      parts.push(`<rect x="${(detailX - gap / 2).toFixed(2)}" y="${pad.toFixed(2)}" width="1" height="${columnHeight.toFixed(2)}" fill="${BLACK}"></rect>`);
      parts.push(...this._stackTemplateBlocks(detail, { x: detailX, y: pad, w: detailWidth, h: columnHeight, fullX: detailX, fullW: detailWidth }, 0, collector));
    }

    parts.push(...this._layoutTemplateFooter(footerRow, width, height, footerHeight, collector));
    return parts.join("");
  },

  // Hands each row a rectangle and lets the row draw itself into it.
  //
  // `base` is what a row's `h` fraction is measured against: the panel height in
  // the stacked layout, which keeps its proportions exactly as authored, or 0 in
  // the column layout, where a subset of the rows has to fill a column of its own
  // and the fractions are normalised against each other instead.
  _stackTemplateBlocks(rows, box, base, collector) {
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
      const rowBox = { x: box.x, y, w: box.w, h: rowHeight, fullX: box.fullX, fullW: box.fullW };
      if (collector && row.__rowIndex !== undefined) collector.push({ rowIndex: row.__rowIndex, box: rowBox });
      const markup = this._renderTemplateBlock(row, rowBox);
      parts.push(row.group && markup ? `<g data-template-block="${this._escape(row.group)}">${markup}</g>` : markup);
      y += rowHeight;
    });
    return parts;
  },

  _layoutTemplateFooter(footerRow, width, height, footerHeight, collector) {
    if (!footerRow || footerHeight <= 0) return [];
    if (collector && footerRow.__rowIndex !== undefined) {
      collector.push({ rowIndex: footerRow.__rowIndex, box: { x: 0, y: height - footerHeight, w: width, h: footerHeight } });
    }
    const parts = [];
    const top = height - footerHeight;
    const footerColor = footerRow.color === "black" ? BLACK : RED;
    parts.push(`<rect x="0" y="${top.toFixed(2)}" width="${width}" height="${footerHeight.toFixed(2)}" fill="${footerColor}"></rect>`);
    const cells = footerRow.footer;
    const cellWidth = width / (cells.length || 1);
    cells.forEach((cell, index) => {
      const cx = cellWidth * (index + 0.5);
      if (index > 0) {
        parts.push(`<rect x="${(cellWidth * index).toFixed(2)}" y="${(top + footerHeight * 0.15).toFixed(2)}" width="1" height="${(footerHeight * 0.7).toFixed(2)}" fill="#ffffff" opacity="0.5"></rect>`);
      }
      const labelSize = Math.max(8.5, footerHeight * 0.32);
      const valueSize = Math.max(10, footerHeight * 0.4);
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
    if (row.dither) return this._blockDither(row, box);
    if (row.customImage) return this._blockCustomImage(row, box);
    if (row.grid) return this._blockGrid(row, box);
    if (row.steps) return this._blockSteps(row, box);
    if (row.checklist) return this._blockChecklist(row, box);
    if (row.strip) return this._blockStrip(row, box);
    if (row.split) return this._blockSplit(row, box);
    if (row.spark) return this._blockSpark(row, box);
    if (row.datebox) return this._blockDatebox(row, box);
    if (row.board) return this._blockBoard(row, box);
    if (row.qr) return this._blockQr(row, box);
    if (row.radarMap) return this._blockRadarMap(row, box);
    if (row.pricetag) return this._blockPriceTag(row, box);
    if (row.text != null) return this._blockText(row, box);
    return "";
  },

  _templateInk(color) {
    if (color === "yellow") return this._displaySupportsYellow?.() ? "#f4c400" : RED;
    return color === "red" ? RED : BLACK;
  },

  _renderTemplateQrVisual(item) {
    try {
      const code = qrcode(0, "M");
      code.addData(String(item?.text || "https://dratek.cz"));
      code.make();
      const count = code.getModuleCount();
      const quiet = 4;
      const cells = [];
      for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
        if (code.isDark(row, column)) cells.push(`<rect x="${column + quiet}" y="${row + quiet}" width="1" height="1"></rect>`);
      }
      const size = count + quiet * 2;
      return `<svg class="template-generated-code" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"></rect><g fill="#111">${cells.join("")}</g></svg>`;
    } catch (_error) {
      return `<ha-icon icon="mdi:qrcode"></ha-icon>`;
    }
  },

  _renderTemplateBarcodeVisual(item) {
    const digits = this._normalizeEan13?.(item?.text || "859123456789") || "8591234567890";
    const pattern = this._ean13Pattern?.(digits) || "1010101";
    const bars = [...pattern].map((bit, index) => bit === "1" ? `<rect x="${index}" y="0" width="1" height="42"></rect>` : "").join("");
    return `<svg class="template-generated-code" viewBox="0 0 ${pattern.length} 52" preserveAspectRatio="none" aria-hidden="true"><rect width="${pattern.length}" height="52" fill="#fff"></rect><g fill="#111">${bars}</g><text x="${pattern.length / 2}" y="51" text-anchor="middle" font-size="8" font-family="Arial">${digits}</text></svg>`;
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
    const fontSize = Math.max(9, Math.min(box.h * ratio, box.h * 0.92));
    return this._svgText(row.text, box.x + box.w / 2, box.y + box.h / 2, fontSize, {
      bold: !!row.bold,
      color: this._templateInk(row.color),
      maxWidth: box.w,
    });
  },

  _blockList(row, box) {
    const cells = row.list;
    const lineHeight = box.h / (cells.length || 1);
    const fontSize = Math.max(8.5, Math.min(lineHeight * 0.7, box.w * 0.13));
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
    let val = String(stat.value || "").trim();
    if (stat.unit) {
      const cleanUnit = String(stat.unit).trim();
      if (val.toLowerCase().endsWith(cleanUnit.toLowerCase())) {
        val = val.slice(0, -cleanUnit.length).trim();
      }
    }
    const captionHeight = stat.caption != null ? box.h * 0.24 : 0;
    const valueHeight = box.h - captionHeight;
    const unitRatio = 0.34;
    const span = (size) => this._svgTextWidth(val, size, true)
      + (stat.unit ? this._svgTextWidth(` ${stat.unit}`, size * unitRatio, false) : 0);
    let fontSize = Math.max(11, valueHeight * 0.82);
    // span() is linear in the font size, so one division lands exactly on the
    // width instead of iterating towards it.
    if (span(fontSize) > box.w) fontSize = Math.max(8.5, (fontSize * box.w) / span(fontSize));
    const unitSize = fontSize * unitRatio;
    const left = box.x + box.w / 2 - span(fontSize) / 2;
    const baseline = box.y + valueHeight * 0.54;
    const parts = [this._svgText(val, left, baseline, fontSize, { anchor: "start", bold: true, color: this._templateInk(stat.color) })];
    if (stat.unit) {
      parts.push(this._svgText(stat.unit, left + this._svgTextWidth(val, fontSize, true) + unitSize * 0.3, baseline + fontSize * 0.22, unitSize, {
        anchor: "start", color: this._templateInk(stat.unitColor),
      }));
    }
    if (stat.caption != null) {
      parts.push(this._svgText(stat.caption, box.x + box.w / 2, box.y + valueHeight + captionHeight * 0.5, Math.max(8.5, captionHeight * 0.7), {
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
      parts.push(this._svgText(band.label, cx, box.y + box.h * 0.3, Math.max(8.5, box.h * 0.32), { color: "#ffffff", bold: true, maxWidth: w * 0.92 }));
      parts.push(this._svgText(band.value, cx, box.y + box.h * 0.7, Math.max(10.5, box.h * 0.45), { color: "#ffffff", bold: true, maxWidth: w * 0.92 }));
    } else {
      parts.push(this._svgText(band.value ?? band.label, cx, box.y + box.h * 0.5, Math.max(10.5, box.h * 0.56), { color: "#ffffff", bold: true, maxWidth: w * 0.92 }));
    }
    return parts.join("");
  },

  // The shape of a day, which is the one thing a column of numbers cannot show.
  _blockBars(row, box) {
    const values = (row.bars.values || []).map(Number).filter(Number.isFinite);
    if (!values.length) return "";
    const labels = row.bars.labels || [];
    const labelHeight = labels.length ? Math.min(box.h * 0.28, 13) : 0;
    const chartHeight = Math.max(1, box.h - labelHeight);
    const top = Math.max(...values);
    const bottom = Math.min(...values, 0);
    const span = top - bottom || 1;
    const step = box.w / values.length;
    const barWidth = Math.max(1, step * 0.68);
    const parts = [
      `<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="#ffffff" fill-opacity="0" pointer-events="all"></rect>`,
      this._svgHairline(box.x, box.y + chartHeight, box.w, 1),
    ];
    values.forEach((value, index) => {
      const barHeight = Math.max(1, ((value - bottom) / span) * (chartHeight - 1));
      parts.push(`<rect x="${(box.x + step * index + (step - barWidth) / 2).toFixed(2)}" y="${(box.y + chartHeight - barHeight).toFixed(2)}"`
        + ` width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${row.bars.highlight === index ? RED : BLACK}"></rect>`);
    });
    labels.forEach((label, index) => {
      if (label == null || label === "") return;
      // Only selected ticks carry a label (typically 0, 6, 12 and 18). They may
      // use the empty neighbouring intervals instead of being squeezed into the
      // width of one narrow bar.
      const labelWidth = Math.min(box.w, Math.max(step * 0.95, step * 3.5));
      const rawX = box.x + step * (index + 0.5);
      const labelX = Math.max(box.x + labelWidth / 2, Math.min(box.x + box.w - labelWidth / 2, rawX));
      parts.push(this._svgText(label, labelX, box.y + chartHeight + labelHeight * 0.58, Math.max(7, labelHeight * 0.7), { maxWidth: labelWidth }));
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
      const labelSize = Math.max(7, Math.min(lineHeight * 0.42, box.w * 0.1));
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

  // Exact-palette 2×2 pixel patterns for the hardware shading test. The SVG is
  // rasterized at the panel's native resolution, so patternUnits=userSpaceOnUse
  // keeps every pattern cell one physical output pixel instead of blending it
  // into an intermediate RGB colour that the e-ink quantizer would discard.
  _blockDither(row, box) {
    const cells = Array.isArray(row.dither) ? row.dither : [];
    if (!cells.length) return "";
    const columns = Math.max(1, Math.min(cells.length, Number(row.columns) || 4));
    const lines = Math.max(1, Math.ceil(cells.length / columns));
    const left = Math.round(box.x);
    const top = Math.round(box.y);
    const right = Math.round(box.x + box.w);
    const bottom = Math.round(box.y + box.h);
    const gridWidth = Math.max(1, right - left);
    const gridHeight = Math.max(1, bottom - top);
    const serial = this._ditherPatternSerial = (this._ditherPatternSerial || 0) + 1;
    const ink = (color) => color === "white" ? "#ffffff" : this._templateInk(color);
    const parts = [];

    cells.forEach((cell, index) => {
      const column = index % columns;
      const line = Math.floor(index / columns);
      const x = Math.round(left + gridWidth * column / columns);
      const y = Math.round(top + gridHeight * line / lines);
      const nextX = Math.round(left + gridWidth * (column + 1) / columns);
      const nextY = Math.round(top + gridHeight * (line + 1) / lines);
      const cellWidth = Math.max(1, nextX - x);
      const cellHeight = Math.max(1, nextY - y);
      const density = Math.max(0, Math.min(1, Number(cell.density) || 0));
      const base = ink(cell.base || "white");
      const foreground = ink(cell.ink || "black");
      const matrix = Number(cell.matrix || row.matrix) === 4 ? 4 : 2;
      const bayerOrder = matrix === 4
        ? [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
        : [0, 2, 3, 1];
      const foregroundCount = Math.round(density * matrix * matrix);
      const patternId = `dratek-dither-${serial}-${index}`;
      const foregroundPixels = bayerOrder.map((order, pixel) => order < foregroundCount
        ? `<rect x="${pixel % matrix}" y="${Math.floor(pixel / matrix)}" width="1" height="1"></rect>`
        : "").join("");
      parts.push(
        `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="${matrix}" height="${matrix}" shape-rendering="crispEdges">`
        + `<rect width="${matrix}" height="${matrix}" fill="${base}"></rect>`
        + `<g fill="${foreground}">${foregroundPixels}</g></pattern></defs>`,
      );
      parts.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="url(#${patternId})" shape-rendering="crispEdges"></rect>`);
    });
    return parts.join("");
  },

  _blockCustomImage(row, box) {
    const source = String(row.customImage?.src || "");
    if (!source) return `<rect x="0" y="0" width="${box.fullW}" height="${box.h}" fill="#ffffff"></rect>`;
    const width = Math.max(1, Math.round(box.fullW));
    const height = Math.max(1, Math.round(box.h));
    return `<image x="0" y="0" width="${width}" height="${height}" href="${this._escape(source)}"`
      + ` preserveAspectRatio="none" image-rendering="auto"></image>`;
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
      parts.push(this._svgText(cell.value, cx, top + contentHeight * (cell.icon ? 0.6 : 0.42), Math.max(9.5, Math.min(contentHeight * (cell.icon ? 0.29 : 0.38), cellWidth * 0.36)), {
        bold: true, color: this._templateInk(cell.color), maxWidth: cellWidth * 0.9,
      }));
      parts.push(this._svgText(cell.label, cx, top + contentHeight * (cell.icon ? 0.85 : 0.74), Math.max(8.5, Math.min(contentHeight * 0.22, cellWidth * 0.23)), { maxWidth: cellWidth * 0.9 }));
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
        // Sized from box.h alone, a tall column with many close-together steps asked
        // for a font far bigger than any one step's own width could ever hold, then
        // leaned on the same single-shot proportional shrink as the strip block
        // above - the same glyph-estimate margin problem, just reached from a
        // wildly oversized starting point instead of a merely tight one. Capping
        // the ask by the step's own width keeps the correction small.
        parts.push(this._svgText(item.label, cx, box.y + box.h * 0.75, Math.max(8.5, Math.min(box.h * 0.28, step * 0.3)), { bold: !!item.done, color: this._templateInk(item.color), maxWidth: step * 0.94 }));
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
      parts.push(this._svgText(item.label, textX, cy, Math.max(8.5, Math.min(lineHeight * 0.58, box.w * 0.12)), {
        anchor: "start", bold: !!item.done, color: this._templateInk(item.color), maxWidth: box.x + box.w - textX,
      }));
    });
    return parts.join("");
  },

  _blockChecklist(row, box) {
    const items = row.checklist;
    const lineHeight = box.h / (items.length || 1);
    const mark = Math.min(lineHeight * 0.5, box.w * 0.11);
    const fontSize = Math.max(8.5, Math.min(lineHeight * 0.6, box.w * 0.12));
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
      // maxWidth here is a soft target, not a hard measurement: the glyph-width
      // table behind it is an estimate (there is no way to measure real text
      // extents inside a detached SVG string - see the file header), and it can
      // run a little narrow for glyphs it does not special-case, like the "³"
      // in "0,84 m³". A value sized right up to that edge used to land close
      // enough that a small estimation error tipped it into ellipsis-clipping
      // instead of just shrinking a few px. Sizing a bit under the box's own
      // ceiling leaves that error margin instead of spending it.
      parts.push(this._svgText(cell.label, cx, labelY, Math.max(8.5, Math.min(box.h * 0.25, cellWidth * 0.3)), { bold: true, maxWidth: cellWidth * 0.92 }));
      if (cell.icon) parts.push(this._svgIcon(cell.icon, cx, box.y + box.h * 0.5, Math.min(box.h * 0.34, cellWidth * 0.5), this._templateInk(cell.color)));
      parts.push(this._svgText(cell.value, cx, valueY, Math.max(10, Math.min(box.h * 0.32, cellWidth * 0.33)), { bold: true, color: this._templateInk(cell.color), maxWidth: cellWidth * 0.92 }));
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
      parts.push(this._svgText(half.value, cx, y, Math.max(9.5, Math.min(box.h * (half.icon ? 0.24 : 0.32), cellWidth * 0.34)), { bold: true, color: this._templateInk(half.color), maxWidth: cellWidth * 0.92 }));
      parts.push(this._svgText(half.label, cx, y + box.h * 0.24, Math.max(8.5, Math.min(box.h * 0.18, cellWidth * 0.22)), { maxWidth: cellWidth * 0.92 }));
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
    if (row.spark.caption != null) parts.push(this._svgText(row.spark.caption, box.x, box.y + box.h * 0.14, Math.max(8.5, box.h * 0.22), { anchor: "start", maxWidth: box.w * 0.6 }));
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
    parts.push(this._svgText(date.month, left + side / 2, top + side * 0.15, Math.max(8.5, side * 0.22), { color: "#ffffff", bold: true, maxWidth: side * 0.92 }));
    parts.push(this._svgText(date.day, left + side / 2, top + side * 0.64, Math.max(11, side * 0.5), { bold: true, maxWidth: side * 0.86 }));
    const textX = left + side + Math.max(3, side * 0.16);
    const right = box.x + box.w;
    const lines = (date.lines || []).filter((line) => line != null && line !== "");
    const lineHeight = box.h / Math.max(1, lines.length);
    lines.forEach((line, index) => {
      const size = index === 0 ? lineHeight * 0.56 : lineHeight * 0.42;
      parts.push(this._svgText(line, textX, box.y + lineHeight * (index + 0.5), Math.max(8.5, size), {
        anchor: "start", bold: index === 0, color: index === 0 ? this._templateInk(date.color) : BLACK, maxWidth: right - textX,
      }));
    });
    return parts.join("");
  },

  // The price itself, and what a promotion does to it.
  //
  // On promotion the old price is struck through above the new one and the whole
  // block reverses out of a filled panel, so a shopper reads "this is cheaper than
  // it was" from across the aisle without reading either number. That is the entire
  // job of a shelf label, and it is why the promotion is a switch on the template
  // rather than yet another value someone has to bind an entity to.
  _blockPriceTag(row, box) {
    const tag = row.pricetag;
    const sale = !!tag.sale;
    const parts = [];
    if (sale) {
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="${RED}"></rect>`);
    }
    const ink = sale ? "#ffffff" : BLACK;
    const cx = box.x + box.w / 2;
    let top = box.y + box.h * 0.06;
    if (sale && tag.was) {
      const wasSize = Math.max(6, Math.min(box.h * 0.17, box.w * 0.13));
      const wasY = top + wasSize * 0.6;
      parts.push(this._svgText(tag.was, cx, wasY, wasSize, { color: ink, maxWidth: box.w * 0.7 }));
      // The strike is what makes it a former price rather than a second one.
      const struck = Math.min(this._svgTextWidth(tag.was, wasSize, false), box.w * 0.7);
      parts.push(this._svgHairline(cx - struck / 2, wasY, struck, Math.max(1, wasSize * 0.09), ink));
      top = wasY + wasSize * 0.55;
    }
    const priceHeight = box.y + box.h * (tag.unit ? 0.82 : 0.94) - top;
    const unitRatio = 0.36;
    const span = (size) => this._svgTextWidth(tag.price, size, true)
      + (tag.currency ? this._svgTextWidth(` ${tag.currency}`, size * unitRatio, true) : 0);
    let size = Math.max(9, priceHeight * 0.86);
    if (span(size) > box.w * 0.94) size = Math.max(8, (size * box.w * 0.94) / span(size));
    const left = cx - span(size) / 2;
    const baseline = top + priceHeight * 0.55;
    parts.push(this._svgText(tag.price, left, baseline, size, { anchor: "start", bold: true, color: ink }));
    if (tag.currency) {
      parts.push(this._svgText(tag.currency, left + this._svgTextWidth(tag.price, size, true) + size * unitRatio * 0.3,
        baseline + size * 0.24, size * unitRatio, { anchor: "start", bold: true, color: ink }));
    }
    if (tag.unit) {
      parts.push(this._svgText(tag.unit, cx, box.y + box.h * 0.91, Math.max(5, Math.min(box.h * 0.13, box.w * 0.1)), { color: ink, maxWidth: box.w * 0.92 }));
    }
    return parts.join("");
  },

  // A real, scannable code.
  //
  // The Wi-Fi template used to show a QR in its catalog thumbnail while the picture
  // actually sent to the tag had none - the thumbnail was a different renderer, and
  // nothing reconciled the two. Modules are snapped to whole device pixels and drawn
  // as one path with crisp edges, because a module landing on a half pixel comes out
  // grey, and the three-colour quantiser then turns that grey into whichever of
  // black or white it is nearer - which is how a code stops scanning.
  _blockQr(row, box) {
    const text = String(row.qr.text ?? "");
    if (!text) return "";
    const code = qrcode(0, row.qr.correction || "M");
    code.addData(text);
    try {
      code.make();
    } catch (_error) {
      // Too much data for the largest symbol; a missing code beats a broken one.
      return "";
    }
    const modules = code.getModuleCount();
    const quiet = 2;
    const side = Math.min(box.w, box.h);
    const cell = Math.max(1, Math.floor(side / (modules + quiet * 2)));
    const drawn = cell * modules;
    const margin = cell * quiet;
    const x = Math.round(box.x + (box.w - drawn) / 2);
    const y = Math.round(box.y + (box.h - drawn) / 2);
    let path = "";
    for (let rowIndex = 0; rowIndex < modules; rowIndex++) {
      for (let column = 0; column < modules; column++) {
        if (code.isDark(rowIndex, column)) {
          path += `M${x + column * cell} ${y + rowIndex * cell}h${cell}v${cell}h${-cell}z`;
        }
      }
    }
    return `<rect x="${(x - margin).toFixed(0)}" y="${(y - margin).toFixed(0)}" width="${(drawn + margin * 2).toFixed(0)}"`
      + ` height="${(drawn + margin * 2).toFixed(0)}" fill="#ffffff"></rect>`
      + `<path d="${path}" fill="${BLACK}" shape-rendering="crispEdges"></path>`;
  },

  // The only raster content in an otherwise all-vector renderer: a live snapshot
  // of camera.meteoradar (camera.py), already rendered server-side as a black
  // country outline with red/white precipitation and quantised to the panel's
  // three colours (ws_meteoradar.py). Embedding it as <image> rather than
  // redrawing a map here keeps the projection and border-drawing code in one
  // place instead of duplicated between Python and this file.
  //
  // The fetch is asynchronous and this method is not, so it can only ever draw
  // whatever _ensureTemplateRadarImage last cached - never block layout waiting
  // on a network round trip. The very first render of a fresh session draws the
  // placeholder box below and repaints once the fetch resolves.
  _blockRadarMap(row, box) {
    const x = row.bleed ? box.fullX : box.x;
    const w = row.bleed ? box.fullW : box.w;
    const cached = this._meteoradarImageCache;
    if (cached?.dataUrl) {
      const legendH = Math.max(12, Math.min(22, box.h * 0.09));
      const legendW = Math.max(70, Math.min(128, w * 0.3));
      const legendX = x + w - legendW - Math.max(3, w * 0.012);
      const legendY = box.y + Math.max(3, box.h * 0.012);
      const third = legendW / 3;
      return `<image x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${w.toFixed(2)}" height="${box.h.toFixed(2)}"`
        + ` preserveAspectRatio="xMidYMid meet" href="${cached.dataUrl}"></image>`
        + `<g aria-label="Intenzita srážek"><rect x="${legendX.toFixed(2)}" y="${legendY.toFixed(2)}" width="${third.toFixed(2)}" height="${legendH.toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="0.7"></rect>`
        + `<rect x="${(legendX + third).toFixed(2)}" y="${legendY.toFixed(2)}" width="${third.toFixed(2)}" height="${legendH.toFixed(2)}" fill="${this._templateInk("yellow")}"></rect>`
        + `<rect x="${(legendX + third * 2).toFixed(2)}" y="${legendY.toFixed(2)}" width="${third.toFixed(2)}" height="${legendH.toFixed(2)}" fill="${RED}"></rect>`
        + this._svgText("SLABÉ", legendX + third / 2, legendY + legendH / 2, Math.max(5.5, legendH * 0.36), { color: BLACK, bold: true, maxWidth: third * 0.9 })
        + this._svgText("STŘED", legendX + third * 1.5, legendY + legendH / 2, Math.max(5.5, legendH * 0.36), { color: BLACK, bold: true, maxWidth: third * 0.9 })
        + this._svgText("SILNÉ", legendX + third * 2.5, legendY + legendH / 2, Math.max(5.5, legendH * 0.36), { color: "#ffffff", bold: true, maxWidth: third * 0.9 })
        + `</g>`;
    }
    const label = cached?.error
      ? `Radarová mapa se nenačetla: ${cached.error}`
      : "Načítám radarovou mapu…";
    return `<rect x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${w.toFixed(2)}" height="${box.h.toFixed(2)}"`
      + ` fill="#ffffff" stroke="${BLACK}" stroke-width="1"></rect>`
      + this._svgText(label, x + w / 2, box.y + box.h / 2, Math.max(9, box.h * 0.09), { maxWidth: w * 0.92 });
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
      parts.push(this._svgText(item.badge, box.x + badgeWidth / 2, cy, Math.max(8.5, badgeHeight * 0.65), { color: "#ffffff", bold: true, maxWidth: badgeWidth * 0.88 }));
      const textX = box.x + badgeWidth + Math.max(3, badgeWidth * 0.2);
      const valueWidth = box.w * 0.26;
      parts.push(this._svgText(item.label, textX, cy, Math.max(8.5, Math.min(lineHeight * 0.52, box.w * 0.12)), {
        anchor: "start", maxWidth: right - textX - valueWidth,
      }));
      parts.push(this._svgText(item.value, right, cy, Math.max(9.5, Math.min(lineHeight * 0.56, box.w * 0.13)), {
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
  // `resolveValue`, when given, replaces the normal v(index, fallback) lookup.
  // The only caller that does this is _templateVariableCropBoxes, which needs
  // to know which row a variable index ends up in without caring what value
  // it actually holds.
  //
  // Each template's own row layout lives in its own file under ./templates/
  // (see templates/index.js) - this just rebuilds the live
  // v/series/ratio/day/event/option closures for the requested template and
  // hands them to that template's `design` function. The variable indices are
  // fixed by each template's own catalog entry - v(0) is that template's
  // first bound entity - so a template's arrangement can change freely but
  // its numbering cannot.
  _templateSvgSpecs(template, resolveValue) {
    const v = resolveValue || ((index, fallback) => this._templateDisplayValue(template, index, fallback));
    // Charts, meters and dials need numbers rather than formatted strings, and the
    // weather and calendar rows need data that arrives from a service call. All of
    // them fall back to the sample so a template still reads as itself before any
    // entity is bound.
    const series = (index, fallback) => this._templateSeries(template, index, fallback);
    const ratio = (index, fallback) => this._templatePercent(template, index, fallback) / 100;
    const day = (index) => this._templateForecastDay(template, index);
    const event = (index) => this._templateCalendarEntry(template, index);
    const option = (name) => this._templateOptionActive(template, name);
    const customImage = () => {
      const active = this._activeCustomImageAsset?.();
      return (active ? this._paletteImageSrc?.(active) : this._customImageDataUrl)
        || this._frontendAssetUrl("images/parrot-dithered.png");
    };
    const helpers = { v, series, ratio, day, event, option, customImage };
    return Object.fromEntries(
      DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, () => entry.design(helpers)]),
    );
  },

  // Built-in templates are authored against the full BWRY palette.  The first
  // identifying block gets a yellow accent, the footer remains the red status
  // band, and the uncoloured content stays black on white.  Keeping this as one
  // shared theme means every current and future catalog template really uses all
  // four pigments without duplicating palette rules in two dozen design files.
  // _templateInk is the single hardware adaptation point: on a BWR display it
  // maps every yellow accent to red before the SVG is rasterized.
  _fourColorTemplateRows(rows) {
    const themed = structuredClone(Array.isArray(rows) ? rows : []);
    const paintYellow = (row) => {
      if (!row) return false;
      if (row.icon || row.text != null || row.rule) { row.color = "yellow"; return true; }
      for (const key of ["stat", "band", "ring", "dial", "spark", "datebox", "pricetag"]) {
        if (row[key] && typeof row[key] === "object") { row[key].color = "yellow"; return true; }
      }
      for (const key of ["list", "meters", "grid", "steps", "checklist", "strip", "split", "board"]) {
        if (Array.isArray(row[key]) && row[key].length) {
          row[key][0] = { ...row[key][0], color: "yellow" };
          return true;
        }
      }
      return false;
    };
    const identity = themed.find((row) => !row?.footer && !row?.flex && !row?.gap && !row?.radarMap && (row?.icon || row?.text != null))
      || themed.find((row) => !row?.footer && !row?.flex && !row?.gap && !row?.radarMap && !row?.qr);
    paintYellow(identity);
    const footer = themed.find((row) => row?.footer);
    if (footer) footer.color = "red";
    return themed;
  },

  _templateSvgRows(template) {
    const baseTemplate = this._templateBaseDefinition(template);
    if (baseTemplate?.id === "blank" || (baseTemplate?.user_created && !baseTemplate?.base_template_id)) return [];
    const build = this._templateSvgSpecs(baseTemplate)[baseTemplate?.id];
    const rows = build ? build() : [
      { icon: "shape-outline", h: 0.22 },
      { text: baseTemplate?.title || "Šablona", h: 0.1, size: 0.07, bold: true },
      { flex: true },
    ];
    return this._fourColorTemplateRows(rows);
  },

  // Where each variable's value actually lands in the rendered template, as a
  // box in the same coordinate space the SVG is drawn in - so the settings
  // dialog can crop straight into the real markup instead of drawing its own
  // stand-in preview that could silently drift out of sync with it.
  //
  // Found by asking the row builder for v(index) a second time with every
  // call replaced by a unique marker string, then scanning the resulting rows
  // for which one absorbed which marker. Box geometry never depends on what
  // v() returns (row heights are fixed fractions, not measured from text), so
  // the swapped-out rows lay out identically to the real ones and the row
  // that got the marker is exactly the row the real value would have landed
  // in. series()/ratio()/day()/event()/option() - chart data, forecasts,
  // calendar entries, the price-tag sale switch - are left resolving for
  // real, since a marker string in a number-typed slot would break the chart
  // math; those variables simply come back without a box, and the caller
  // falls back to the old icon-only preview for just those few.
  _templateVariableCropBoxes(template, width, height) {
    const baseTemplate = this._templateBaseDefinition(template);
    const build = this._templateSvgSpecs(baseTemplate, (index) => `VAR${index}`)[baseTemplate?.id];
    const rows = build ? build() : [];
    if (!rows.length) return {};
    rows.forEach((row, index) => { row.__rowIndex = index; });
    const collector = [];
    this._layoutTemplateSvg(rows, width, height, collector);
    const rowBoxes = {};
    collector.forEach(({ rowIndex, box }) => { if (!(rowIndex in rowBoxes)) rowBoxes[rowIndex] = box; });
    const scan = (value) => {
      if (typeof value === "string") return [...value.matchAll(/VAR(\d+)/g)].map((match) => Number(match[1]));
      if (Array.isArray(value)) return value.flatMap(scan);
      if (value && typeof value === "object") return Object.values(value).flatMap(scan);
      return [];
    };
    const boxes = {};
    rows.forEach((row) => {
      const box = rowBoxes[row.__rowIndex];
      if (!box) return;
      scan(row).forEach((variableIndex) => { boxes[variableIndex] ??= box; });
    });
    return boxes;
  },

  // Boxes (and the row spec itself, for its static caption/label/colour
  // strings) for the graphical rows series()/ratio()/day()/event() draw (a
  // sparkline, a gauge, a forecast strip, a calendar entry) - keyed by the
  // row's own `group` tag, the same one _stackTemplateBlocks wraps in
  // <g data-template-block="..."> so the panel can find and blank the drawn
  // shape later. Reuses the exact box-collection technique
  // _templateVariableCropBoxes uses for text slots: box geometry is a side
  // effect of the real layout pass, not worth recomputing separately.
  _templateGraphicRowBoxes(template, width, height) {
    const build = this._templateSvgSpecs(template)[template?.id];
    const rows = build ? build() : [];
    if (!rows.length) return {};
    rows.forEach((row, index) => { row.__rowIndex = index; });
    const collector = [];
    this._layoutTemplateSvg(rows, width, height, collector);
    const rowBoxes = {};
    collector.forEach(({ rowIndex, box }) => { if (!(rowIndex in rowBoxes)) rowBoxes[rowIndex] = box; });
    const entries = {};
    rows.forEach((row) => {
      if (!row.group) return;
      const box = rowBoxes[row.__rowIndex];
      if (box) entries[row.group] = { box, row };
    });
    return entries;
  },

  // The crop itself: the same full-template markup real bindings would
  // produce, windowed to just one variable's box via viewBox instead of a
  // redrawn miniature - so it is the actual template at 1:1, not a rendition
  // of it that could disagree on a font size or a color.
  _templateVariableCropSvg(template, box, width, height, fullMarkup) {
    if (!box) return "";
    const x = box.x.toFixed(2), y = box.y.toFixed(2), w = Math.max(1, box.w).toFixed(2), h = Math.max(1, box.h).toFixed(2);
    return `<svg class="template-variable-crop-svg" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">`
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"></rect>`
      + fullMarkup
      + `</svg>`;
  },

  // ---------------------------------------------------------------- export ---

  // Builds the complete SVG document for one or two templates at the display's
  // native resolution. Large displays use the shared layout grid, from one
  // full-screen template up to a 2 × 3 dashboard of six templates.
  async _buildDisplayTemplateSvg(templates, width, height, layout = "single") {
    const list = templates.filter(Boolean);
    if (!list.length) throw new Error("Není vybrána žádná šablona.");

    const slots = this._displayTemplateLayoutSlots?.(layout, width, height)
      || [{ x: 0, y: 0, w: width, h: height, index: 0 }];

    const bodies = [];
    for (let index = 0; index < Math.min(slots.length, list.length); index++) {
      const slot = slots[index];
      const template = list[index];
      const rows = this._templateSvgRows(template);
      await this._preloadTemplateIcons(rows);
      await this._preloadTemplateRadarImage(rows, slot.w, slot.h);
      const slotName = index === 0 ? "primary" : index === 1 ? "secondary" : `slot-${index + 1}`;
      const markup = this._applyTemplateAdjustmentsToSvgMarkup(this._layoutTemplateSvg(rows, slot.w, slot.h), template, slotName);
      bodies.push(`<g transform="translate(${slot.x.toFixed(2)},${slot.y.toFixed(2)})">`
        + `<rect x="0" y="0" width="${slot.w.toFixed(2)}" height="${slot.h.toFixed(2)}" fill="#ffffff"></rect>`
        + markup + `</g>`);
    }
    const definition = this._displayTemplateLayoutDefinition?.(layout) || { columns: 1, rows: 1 };
    const transposed = height > width;
    if (definition.id === "mixed-5") {
      if (transposed) {
        const splitX = width / 3;
        bodies.push(`<rect x="${splitX.toFixed(2)}" y="0" width="1" height="${height}" fill="${BLACK}"></rect>`);
        bodies.push(`<rect x="0" y="${(height / 2).toFixed(2)}" width="${splitX.toFixed(2)}" height="1" fill="${BLACK}"></rect>`);
        for (let row = 1; row < 3; row++) {
          const y = height * row / 3;
          bodies.push(`<rect x="${splitX.toFixed(2)}" y="${y.toFixed(2)}" width="${(width - splitX).toFixed(2)}" height="1" fill="${BLACK}"></rect>`);
        }
      } else {
        const splitY = height / 3;
        bodies.push(`<rect x="0" y="${splitY.toFixed(2)}" width="${width}" height="1" fill="${BLACK}"></rect>`);
        bodies.push(`<rect x="${(width / 2).toFixed(2)}" y="0" width="1" height="${splitY.toFixed(2)}" fill="${BLACK}"></rect>`);
        for (let column = 1; column < 3; column++) {
          const x = width * column / 3;
          bodies.push(`<rect x="${x.toFixed(2)}" y="${splitY.toFixed(2)}" width="1" height="${(height - splitY).toFixed(2)}" fill="${BLACK}"></rect>`);
        }
      }
    } else {
      const columns = transposed ? definition.rows : definition.columns;
      const rows = transposed ? definition.columns : definition.rows;
      for (let column = 1; column < columns; column++) {
        const x = width * column / columns;
        bodies.push(`<rect x="${x.toFixed(2)}" y="0" width="1" height="${height}" fill="${BLACK}"></rect>`);
      }
      for (let row = 1; row < rows; row++) {
        const y = height * row / rows;
        bodies.push(`<rect x="0" y="${y.toFixed(2)}" width="${width}" height="1" fill="${BLACK}"></rect>`);
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + bodies.join("")
      + `</svg>`;
  },

  // Rasterizes the SVG at exactly the panel's resolution and quantizes it to the
  // exact palette the target hardware can actually show.
  _quantizeEinkPixel(red, green, blue) {
    // Bright pixels are white; among the dark ones, a bright red channel means
    // red. Antialiasing between a black glyph and a red area lands on dark warm
    // pixels such as rgb(150, 20, 15) - those stay black here, which is what
    // keeps black text from picking up a red rim.
    //
    // Must stay identical to bwr_masks in render.py, thresholds included, or a
    // panel-rendered manual send and a backend-rendered automatic update put
    // different pixels on the same display.
    const yellow = red >= 161 && green >= 128 && blue < 96;
    if (yellow) return this._displaySupportsYellow?.() ? [244, 196, 0] : [220, 20, 12];
    const luminance = (red * 38 + green * 75 + blue * 15) >> 7;
    if (luminance >= 161) return [255, 255, 255];
    // BWR_RED in render.py.
    return red >= 161 ? [220, 20, 12] : [0, 0, 0];
  },

  // `paintOverlay` draws on top of the finished template, in device pixels, before
  // the three-colour quantiser runs - anything painted after it would be off the
  // palette the panel can actually show.
  async _rasterizeDisplayTemplateSvg(templates, width, height, layout = "single", paintOverlay = null) {
    const svg = await this._buildDisplayTemplateSvg(templates, width, height, layout);
    return this._rasterizeSvgStringToPng(svg, width, height, paintOverlay);
  },

  // The rasterise/quantise tail of _rasterizeDisplayTemplateSvg, split out so a
  // caller that already has a ready SVG string - e.g. a clone of the captured
  // template with its dynamic values blanked out, for automation.py's
  // clean_background tier - can reuse it without re-running _buildDisplayTemplateSvg
  // (which would re-fetch the radar camera frame and other live data unnecessarily).
  async _rasterizeSvgStringToPng(svg, width, height, paintOverlay = null) {
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
    if (paintOverlay) paintOverlay(context, width, height);

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
