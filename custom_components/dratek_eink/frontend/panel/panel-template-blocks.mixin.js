// The designer's own copy of the vocabulary the built-in templates are written
// in.
//
// Every display template (templates/*.js) is a list of rows, and each row is one
// block - a band, a strip, a dial, a departures board. panel-template-svg draws
// them, and until now the designer could not: its palette offered free-floating
// primitives (a rectangle, a line, a text box) that had nothing to do with the
// blocks the templates themselves use, so anything built by hand looked unlike
// every prepared template on the same device.
//
// This mixin closes that gap. Each entry below is one of those same blocks,
// with a sample filled in, a default size on the canvas and a plain-language
// description of its fields. Dropping one on the canvas creates a normal
// editor element of type "block"; drawing it calls straight into
// _renderTemplateBlock, the same function the prepared templates go through, so
// what the designer shows is what the panel prints.
//
// Adding a block therefore costs one entry here, not a branch in the renderer.

// The panel's own inks. A block spec names them ("black"/"red"/"yellow"), never
// a hex value - _templateInk maps yellow down to red on three-colour panels.
const BLOCK_INKS = [
  ["black", "Černá"],
  ["red", "Červená"],
  ["yellow", "Žlutá"],
];

// Fields shared by more than one block, written once so a wording fix lands
// everywhere the field appears.
const LABEL_FIELD = { key: "label", kind: "text", label: "Popisek" };
const VALUE_FIELD = { key: "value", kind: "text", label: "Hodnota" };
const ICON_FIELD = { key: "icon", kind: "icon", label: "Ikona" };
const INK_FIELD = { key: "color", kind: "ink", label: "Barva" };
const DONE_FIELD = { key: "done", kind: "bool", label: "Hotovo" };

// Which blocks may sit inside a "duo" (two blocks side by side). Anything that
// is itself a layout - another duo, the page footer, a row of dateboxes - is
// left out: nesting those produces shapes no template uses and no inspector
// could sensibly present.
const DUO_KINDS = [
  "text", "icon", "stat", "list", "strip", "grid", "split",
  "checklist", "steps", "board", "datebox", "dial", "ring",
  "meters", "bars", "spark",
];

const TEMPLATE_BLOCK_KINDS = {
  text: {
    label: "Nadpis / text",
    hint: "Jeden řádek textu přes celou šířku",
    icon: "format-title",
    w: 70, h: 12,
    row: () => ({ text: "NADPIS", bold: true, color: "black", h: 1, size: 0.62 }),
    fields: [
      { path: "text", kind: "text", label: "Text" },
      { path: "size", kind: "ratio", label: "Velikost písma", min: 20, max: 92 },
      { path: "bold", kind: "bool", label: "Tučně" },
      { path: "color", kind: "ink", label: "Barva" },
    ],
  },

  band: {
    label: "Pruh s nadpisem",
    hint: "Hlavička sekce s ikonou a hodnotou",
    icon: "format-header-1",
    w: 88, h: 14,
    row: () => ({ band: { icon: "home", label: "OBÝVÁK", value: "21,4 °C", color: "black" } }),
    fields: [
      { path: "band.label", kind: "text", label: "Popisek" },
      { path: "band.value", kind: "text", label: "Hodnota" },
      { path: "band.icon", kind: "icon", label: "Ikona" },
      {
        path: "band.color", kind: "select", label: "Provedení",
        options: [["black", "Otevřený nadpis s linkou"], ["red", "Plný červený pruh"]],
      },
      { path: "bleed", kind: "bool", label: "Přes celou šířku displeje" },
    ],
  },

  rule: {
    label: "Dělicí linka",
    hint: "Tenká vodorovná linka",
    icon: "minus",
    w: 80, h: 4,
    row: () => ({ rule: true, color: "black" }),
    fields: [{ path: "color", kind: "ink", label: "Barva" }],
  },

  icon: {
    label: "Velká ikona",
    hint: "Samostatný symbol Material Design",
    icon: "shape-outline",
    w: 16, h: 16,
    square: true,
    row: () => ({ icon: "home", color: "black" }),
    fields: [
      { path: "icon", kind: "icon", label: "Ikona" },
      { path: "color", kind: "ink", label: "Barva" },
    ],
  },

  stat: {
    label: "Velká hodnota",
    hint: "Údaj s jednotkou a popiskem pod ním",
    icon: "numeric",
    w: 48, h: 22,
    row: () => ({ stat: { value: "21,4", unit: "°C", caption: "TEPLOTA V OBÝVÁKU" } }),
    fields: [
      { path: "stat.value", kind: "text", label: "Hodnota" },
      { path: "stat.unit", kind: "text", label: "Jednotka" },
      { path: "stat.caption", kind: "text", label: "Popisek pod hodnotou" },
    ],
  },

  list: {
    label: "Seznam řádků",
    hint: "Popisek vlevo, hodnota vpravo",
    icon: "format-list-bulleted",
    w: 66, h: 42,
    row: () => ({
      list: [
        { icon: "thermometer", label: "Teplota", value: "21,4 °C" },
        { icon: "water-percent", label: "Vlhkost", value: "46 %" },
        { icon: "gauge", label: "Tlak", value: "1013 hPa" },
      ],
    }),
    fields: [{ path: "compact", kind: "bool", label: "Úsporné řádky" }],
    repeat: {
      path: "list", label: "Řádky", add: "Přidat řádek", max: 10,
      template: { icon: "", label: "Popisek", value: "Hodnota" },
      fields: [LABEL_FIELD, VALUE_FIELD, ICON_FIELD, INK_FIELD],
    },
  },

  strip: {
    label: "Pás dlaždic",
    hint: "Vedle sebe: popisek nad hodnotou",
    icon: "view-column-outline",
    w: 88, h: 20,
    row: () => ({
      strip: [
        { label: "CO₂", value: "612 ppm" },
        { label: "PM2.5", value: "8 µg" },
        { label: "VLHKOST", value: "46 %" },
      ],
    }),
    fields: [{ path: "valueIcon", kind: "bool", label: "Ikona vedle hodnoty" }],
    repeat: {
      path: "strip", label: "Sloupce", add: "Přidat sloupec", max: 8,
      template: { label: "Popisek", value: "Hodnota" },
      fields: [LABEL_FIELD, VALUE_FIELD, ICON_FIELD],
    },
  },

  grid: {
    label: "Mřížka dlaždic",
    hint: "Ohraničené buňky s ikonou, hodnotou a popiskem",
    icon: "view-grid-outline",
    w: 80, h: 56,
    row: () => ({
      columns: 2,
      grid: [
        { icon: "sofa-outline", value: "21,4 °C", label: "OBÝVÁK" },
        { icon: "bed-outline", value: "19,8 °C", label: "LOŽNICE" },
        { icon: "silverware-fork-knife", value: "22,1 °C", label: "KUCHYŇ" },
        { icon: "shower", value: "23,0 °C", label: "KOUPELNA" },
      ],
    }),
    fields: [{ path: "columns", kind: "number", label: "Sloupců", min: 1, max: 4 }],
    repeat: {
      path: "grid", label: "Buňky", add: "Přidat buňku", max: 12,
      template: { icon: "", value: "0", label: "POPISEK" },
      fields: [VALUE_FIELD, LABEL_FIELD, ICON_FIELD, INK_FIELD],
    },
  },

  split: {
    label: "Dva až tři údaje vedle sebe",
    hint: "Rozdělený řádek s tenkými předěly",
    icon: "format-columns",
    w: 88, h: 14,
    row: () => ({
      split: [{ label: "VÝCHOD", value: "05:12" }, { label: "ZÁPAD", value: "20:48" }],
      banner: false, color: "black",
    }),
    fields: [
      { path: "banner", kind: "bool", label: "Orámovaný panel" },
      {
        path: "color", kind: "select", label: "Podklad panelu",
        options: [["black", "Bílý s rámečkem"], ["red", "Plný červený"]],
      },
      { path: "compact", kind: "bool", label: "Úsporný jednořádkový zápis" },
    ],
    repeat: {
      path: "split", label: "Části", add: "Přidat část", max: 4,
      template: { label: "POPISEK", value: "Hodnota" },
      fields: [LABEL_FIELD, VALUE_FIELD],
    },
  },

  checklist: {
    label: "Zaškrtávací seznam",
    hint: "Nákupní seznam, úkoly",
    icon: "format-list-checks",
    w: 62, h: 32,
    row: () => ({
      columns: 1,
      checklist: [
        { label: "Mléko", done: true },
        { label: "Chléb", done: false },
        { label: "Káva", done: false },
      ],
    }),
    fields: [{ path: "columns", kind: "number", label: "Sloupců", min: 1, max: 3 }],
    repeat: {
      path: "checklist", label: "Položky", add: "Přidat položku", max: 16,
      template: { label: "Položka", done: false },
      fields: [LABEL_FIELD, DONE_FIELD, INK_FIELD],
    },
  },

  steps: {
    label: "Průběh kroků",
    hint: "Řetěz kroků s tečkami, splněné jsou plné",
    icon: "transit-connection-variant",
    w: 84, h: 32,
    row: () => ({
      orientation: "horizontal",
      steps: [
        { label: "PRANÍ", done: true },
        { label: "MÁCHÁNÍ", done: true },
        { label: "ODSTŘEĎ.", done: false },
        { label: "HOTOVO", done: false },
      ],
    }),
    fields: [{
      path: "orientation", kind: "select", label: "Směr",
      options: [["horizontal", "Vodorovně"], ["vertical", "Svisle"]],
    }],
    repeat: {
      path: "steps", label: "Kroky", add: "Přidat krok", max: 8,
      template: { label: "KROK", done: false },
      fields: [LABEL_FIELD, DONE_FIELD, INK_FIELD],
    },
  },

  board: {
    label: "Tabule řádků",
    hint: "Odjezdy, přítomnost - štítek, název, čas",
    icon: "table-large",
    w: 90, h: 42,
    row: () => ({
      filled: true,
      board: [
        { badge: "1", label: "Hlavní nádraží", value: "za 3 min", icon: "tram", clock: "12:48" },
        { badge: "17", label: "Náměstí Míru", value: "za 7 min", icon: "bus", clock: "12:52" },
        { badge: "C", label: "Letiště", value: "za 14 min", icon: "subway-variant", clock: "12:59" },
      ],
    }),
    fields: [
      { path: "filled", kind: "bool", label: "Plné štítky linek" },
      { path: "twoLine", kind: "bool", label: "Dva řádky na položku" },
      { path: "compact", kind: "bool", label: "Úsporné řádky" },
    ],
    repeat: {
      path: "board", label: "Řádky", add: "Přidat řádek", max: 12,
      template: { badge: "", label: "Popisek", value: "Hodnota" },
      fields: [
        { key: "badge", kind: "text", label: "Štítek" },
        LABEL_FIELD, VALUE_FIELD,
        { key: "clock", kind: "text", label: "Čas" },
        ICON_FIELD, INK_FIELD,
      ],
    },
  },

  datebox: {
    label: "Datum s popisem",
    hint: "Trhací kalendář a text vedle něj",
    icon: "calendar-text",
    w: 80, h: 18,
    row: () => ({
      datebox: { day: "23", month: "KVĚ", color: "red", lines: ["Narozeniny Jany", "za 3 dny"] },
    }),
    fields: [
      { path: "datebox.day", kind: "text", label: "Den" },
      { path: "datebox.month", kind: "text", label: "Měsíc" },
      { path: "datebox.lines.0", kind: "text", label: "První řádek" },
      { path: "datebox.lines.1", kind: "text", label: "Druhý řádek" },
      { path: "datebox.color", kind: "ink", label: "Barva" },
    ],
  },

  splitDates: {
    label: "Řada datumů",
    hint: "Několik kalendářů vedle sebe",
    icon: "calendar-multiple",
    w: 90, h: 22,
    row: () => ({
      splitDates: [
        { datebox: { day: "23", month: "KVĚ", color: "red", lines: ["Jana"] } },
        { datebox: { day: "07", month: "ČVN", color: "black", lines: ["Petr"] } },
      ],
    }),
    repeat: {
      path: "splitDates", label: "Datumy", add: "Přidat datum", max: 4,
      template: { datebox: { day: "1", month: "LED", color: "black", lines: ["Popisek"] } },
      fields: [
        { key: "datebox.day", kind: "text", label: "Den" },
        { key: "datebox.month", kind: "text", label: "Měsíc" },
        { key: "datebox.lines.0", kind: "text", label: "Popisek" },
        { key: "datebox.color", kind: "ink", label: "Barva" },
      ],
    },
  },

  dial: {
    label: "Půlkruhový budík",
    hint: "Výseč se stupnicí, hodnotou a popiskem",
    icon: "gauge-low",
    w: 50, h: 46,
    row: () => ({
      dial: { percent: 0.42, value: "42", caption: "AQI / 200", min: "ČISTÝ", max: "ZÁTĚŽ", color: "red" },
    }),
    fields: [
      { path: "dial.percent", kind: "ratio", label: "Naplnění", min: 0, max: 100 },
      { path: "dial.value", kind: "text", label: "Hodnota uprostřed" },
      { path: "dial.caption", kind: "text", label: "Popisek" },
      { path: "dial.min", kind: "text", label: "Popis levého konce" },
      { path: "dial.max", kind: "text", label: "Popis pravého konce" },
      { path: "dial.color", kind: "ink", label: "Barva výseče" },
    ],
  },

  ring: {
    label: "Kruhový ukazatel",
    hint: "Mezikruží s hodnotou uprostřed",
    icon: "circle-slice-5",
    w: 34, h: 44,
    square: true,
    row: () => ({ ring: { percent: 0.68, value: "68 %", caption: "BATERIE", color: "red" } }),
    fields: [
      { path: "ring.percent", kind: "ratio", label: "Naplnění", min: 0, max: 100 },
      { path: "ring.value", kind: "text", label: "Hodnota uprostřed" },
      { path: "ring.caption", kind: "text", label: "Popisek" },
      { path: "ring.color", kind: "ink", label: "Barva výseče" },
    ],
  },

  meters: {
    label: "Pruhové ukazatele",
    hint: "Popisek, hodnota a vodorovný sloupec",
    icon: "chart-timeline-variant",
    w: 72, h: 26,
    row: () => ({
      meters: [
        { label: "CPU", value: "38 %", percent: 0.38, color: "black" },
        { label: "PAMĚŤ", value: "62 %", percent: 0.62, color: "red" },
      ],
    }),
    repeat: {
      path: "meters", label: "Ukazatele", add: "Přidat ukazatel", max: 6,
      template: { label: "Popisek", value: "0 %", percent: 0.5, color: "black" },
      fields: [
        LABEL_FIELD, VALUE_FIELD,
        { key: "percent", kind: "ratio", label: "Naplnění", min: 0, max: 100 },
        INK_FIELD,
      ],
    },
  },

  bars: {
    label: "Sloupcový graf",
    hint: "Sloupce s popisky pod osou",
    icon: "chart-bar",
    w: 74, h: 38,
    row: () => ({
      bars: {
        values: [3.1, 2.8, 3.4, 4.2, 3.9, 3.2, 2.9],
        labels: ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
        highlight: 3,
      },
    }),
    fields: [
      { path: "bars.values", kind: "numbers", label: "Hodnoty oddělené čárkou" },
      { path: "bars.labels", kind: "texts", label: "Popisky oddělené čárkou" },
      { path: "bars.highlight", kind: "number", label: "Zvýraznit sloupec č.", min: -1, max: 30 },
    ],
  },

  spark: {
    label: "Křivka trendu",
    hint: "Spojnicový průběh s popiskem nad ním",
    icon: "chart-line-variant",
    w: 74, h: 26,
    row: () => ({
      spark: { values: [18, 19, 21, 23, 22, 20, 19, 18], caption: "TEPLOTA / 12 H", color: "red" },
    }),
    fields: [
      { path: "spark.values", kind: "numbers", label: "Hodnoty oddělené čárkou" },
      { path: "spark.caption", kind: "text", label: "Popisek" },
      { path: "spark.color", kind: "ink", label: "Barva křivky" },
    ],
  },

  pricetag: {
    label: "Cenovka",
    hint: "Cena, měna a přeškrtnutá původní cena",
    icon: "tag-outline",
    w: 60, h: 40,
    row: () => ({ pricetag: { price: "149,-", currency: "Kč", was: "199,- Kč", sale: true } }),
    fields: [
      { path: "pricetag.price", kind: "text", label: "Cena" },
      { path: "pricetag.currency", kind: "text", label: "Měna" },
      { path: "pricetag.unit", kind: "text", label: "Jednotka (např. / kg)" },
      { path: "pricetag.was", kind: "text", label: "Původní cena" },
      { path: "pricetag.sale", kind: "bool", label: "Akční (červený podklad)" },
      {
        path: "pricetag.accent", kind: "select", label: "Zvýraznění rámečku",
        options: [["", "Bez rámečku"], ["yellow", "Žlutý rámeček"]],
      },
    ],
  },

  footer: {
    label: "Patička displeje",
    hint: "Červený pruh s údaji na spodním okraji",
    icon: "page-layout-footer",
    w: 100, h: 12,
    row: () => ({
      footer: [{ label: "ČAS", value: "12:45" }, { label: "DATUM", value: "23. května" }],
    }),
    fields: [{ path: "compact", kind: "bool", label: "Jednořádkově" }],
    repeat: {
      path: "footer", label: "Pole", add: "Přidat pole", max: 4,
      template: { label: "POPISEK", value: "Hodnota" },
      fields: [LABEL_FIELD, VALUE_FIELD, ICON_FIELD],
    },
  },

  duo: {
    label: "Dva bloky vedle sebe",
    hint: "Libovolná dvojice bloků s předělem",
    icon: "view-split-vertical",
    w: 90, h: 42,
    row: () => ({
      duo: {
        ratio: 0.5,
        left: { ring: { percent: 0.68, value: "68 %", caption: "BATERIE", color: "red" } },
        right: {
          list: [
            { label: "Signál", value: "-64 dBm" },
            { label: "Doběh", value: "128 dní" },
          ],
        },
      },
    }),
    fields: [{ path: "duo.ratio", kind: "ratio", label: "Šířka levé části", min: 30, max: 70 }],
  },
};

// Palette order. Grouped by what the user is trying to say, not by which
// renderer function draws it.
const TEMPLATE_BLOCK_GROUPS = [
  { id: "type", title: "Text a nadpisy", kinds: ["text", "band", "rule", "icon", "stat"] },
  {
    id: "lists", title: "Seznamy a přehledy",
    kinds: ["list", "strip", "grid", "split", "checklist", "steps", "board", "datebox", "splitDates"],
  },
  { id: "meters", title: "Ukazatele a grafy", kinds: ["dial", "ring", "meters", "bars", "spark"] },
  { id: "layout", title: "Rozvržení a speciální", kinds: ["duo", "pricetag", "footer"] },
];

// Detection order must match _renderTemplateBlock's own dispatch, or a row that
// carries two recognisable keys would be reported as the wrong kind.
const BLOCK_DETECTION_ORDER = [
  "icon", "rule", "list", "stat", "band", "bars", "meters", "ring", "dial",
  "grid", "steps", "checklist", "strip", "split", "duo", "splitDates", "spark",
  "datebox", "board", "pricetag", "footer", "text",
];

export const templateBlocksMixin = {
  // Every block the palette offers, in palette order. Exposed so a guard can
  // walk the whole catalogue rather than a list restated next to it.
  _templateBlockKindIds() {
    return TEMPLATE_BLOCK_GROUPS.flatMap((group) => group.kinds);
  },

  _templateBlockSpec(kind) {
    return TEMPLATE_BLOCK_KINDS[String(kind || "")] || null;
  },

  // Which block a stored row is. Used by the duo inspector, which has to show
  // the fields of whatever the user put on each side.
  _templateBlockKindOfRow(row) {
    if (!row || typeof row !== "object") return "";
    for (const kind of BLOCK_DETECTION_ORDER) {
      const key = kind === "rule" ? "rule" : kind;
      if (row[key] != null && row[key] !== false) return kind;
    }
    return "";
  },

  // ------------------------------------------------------------- drawing ---

  // The row an element draws, ready for _renderTemplateBlock: the stored spec
  // plus the one thing that cannot be stored with it, whether the box it landed
  // in is small enough to need the compact treatment. Templates set `compact`
  // from the panel size for exactly the same reason.
  _templateBlockElementRow(item, pixelHeight = 0) {
    const stored = item?.block;
    if (!stored || typeof stored !== "object") return null;
    const row = structuredClone(stored);
    if (row.compact === undefined && pixelHeight > 0) row.compact = pixelHeight < 46;
    return row;
  },

  // Native pixel size of an element's box. Font floors inside the block
  // renderer (_svgText never goes under ten pixels) are absolute, so the
  // viewBox has to be in the panel's own pixels or a block would be laid out
  // for the wrong display.
  _templateBlockPixelBox(item, canvasWidth, canvasHeight) {
    const width = Math.max(1, Number(canvasWidth) || 296);
    const height = Math.max(1, Number(canvasHeight) || 128);
    return {
      w: Math.max(8, Math.round((width * (Number(item?.w) || 20)) / 100)),
      h: Math.max(8, Math.round((height * (Number(item?.h) || 12)) / 100)),
    };
  },

  _renderTemplateBlockVisual(item, canvasWidth = 296, canvasHeight = 128) {
    const { w, h } = this._templateBlockPixelBox(item, canvasWidth, canvasHeight);
    const row = this._templateBlockElementRow(item, h);
    if (!row) return `<ha-icon icon="mdi:shape-outline"></ha-icon>`;
    // Icons resolve asynchronously and repaint the panel when they land, so a
    // block drawn before its glyph arrives simply gains it a frame later.
    this._requestTemplateIcons?.([row]);
    // The footer is the one row the layout draws itself rather than handing to
    // _renderTemplateBlock - it is pinned to the bottom of the panel and paints
    // its own red bar. Given a box the height of the whole viewBox it produces
    // exactly the same bar, just wherever the user put it.
    const markup = row.footer
      ? this._layoutTemplateFooter(row, w, h, h).join("")
      : this._renderTemplateBlock(row, { x: 0, y: 0, w, h, fullX: 0, fullW: w });
    return `<svg class="template-block-visual" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${markup}</svg>`;
  },

  // The bitmap a display receives is not a screenshot of the preview: the send
  // path repaints every overlay onto a canvas, one branch per element kind (see
  // _paintTemplateOverlays). Re-implementing twenty-two blocks there in canvas
  // calls would be a second renderer to keep in step with the first, and the
  // existing branches already show what that costs - the icon branch draws a
  // diamond because it cannot reach the mdi geometry.
  //
  // So a block is rasterised from its own SVG instead, at exactly the pixel size
  // it occupies on the panel, and the painter only has to draw the result. The
  // work is asynchronous - an <img> has to decode - which is why it happens here
  // rather than inside the synchronous painter.
  async _prepareTemplateOverlayImages(overlays, width, height) {
    const blocks = (overlays || []).filter((item) => item.kind === "block" && item.block);
    const components = (overlays || []).filter((item) => this._isTemplateComponentKind?.(item.kind));
    const images = (overlays || []).filter((item) => item.kind === "image" && (item.source || item.src));
    await this._prepareTemplateOverlayPhotos(images, width, height);
    if (!blocks.length && !components.length) return;
    // An SVG loaded as an image is a closed document: it cannot fetch anything,
    // so every icon it names has to be in the geometry cache before the markup
    // is built or the glyph is silently missing from the panel.
    await this._preloadTemplateIcons([
      ...blocks.map((item) => item.block),
      ...this._templateComponentIconNames(components).map((icon) => ({ icon })),
    ]);
    const rasterize = async (item, markup, w, h) => {
      const image = new Image();
      image.width = w;
      image.height = h;
      await new Promise((resolve) => {
        image.onload = resolve;
        // One element that fails to decode must not take the whole send with
        // it - it simply does not reach the panel, like an image element whose
        // source is gone.
        image.onerror = resolve;
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      });
      item.overlayImage = image.complete && image.naturalWidth ? image : null;
    };
    await Promise.all([
      ...blocks.map(async (item) => {
        const w = Math.max(1, Math.round(item.w * width));
        const h = Math.max(1, Math.round(item.h * height));
        const row = this._templateBlockElementRow(item, h);
        if (!row) return;
        const inner = row.footer
          ? this._layoutTemplateFooter(row, w, h, h).join("")
          : this._renderTemplateBlock(row, { x: 0, y: 0, w, h, fullX: 0, fullW: w });
        await rasterize(item, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`, w, h);
      }),
      // The component markup is the very same string the preview shows, only
      // given an xmlns so it can stand alone as a document. That is the whole
      // guarantee that what was designed is what gets printed.
      ...components.map(async (item) => {
        const w = Math.max(1, Math.round(item.w * width));
        const h = Math.max(1, Math.round(item.h * height));
        const inner = this._renderTemplateComponentSvg({ ...item, type: item.kind, w: 100, h: 100 }, w, h);
        if (!inner) return;
        await rasterize(item, inner.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" '), w, h);
      }),
    ]);
  },

  // An image element carried a bitmap dithered once, at import time, into a
  // 240px-longest-side thumbnail - and the painter then scaled that to the
  // element's box with smoothing off. Nearest-neighbour resampling of a
  // halftone is not a smaller halftone: down to a 90px-wide element it drops
  // three quarters of the dots and the picture breaks into patches that
  // threshold to flat black or flat white, and blown up past 240px it turns
  // into visible blocks. Either way the photo on the panel did not look like
  // the photo on screen.
  //
  // Dithering the original at exactly the pixel box the element occupies is
  // the same thing _requestCustomImageSlotDither already does for a
  // custom_image slot, and it is the only size at which the error diffusion is
  // the one the panel actually shows. `stretch` because the preview's <img> is
  // object-fit:fill - the box is the picture.
  async _prepareTemplateOverlayPhotos(images, width, height) {
    if (!images?.length) return;
    this._templateImageDitherCache ||= new Map();
    const paletteKey = this._displayPaletteKey?.() || "bwr";
    await Promise.all(images.map(async (item) => {
      const w = Math.max(1, Math.round(item.w * width));
      const h = Math.max(1, Math.round(item.h * height));
      // The original photo where the element still has one; an element restored
      // from a saved template may only carry the already-dithered bitmap, and
      // re-dithering that is worse than leaving it alone.
      const source = String(item.source || "");
      const key = `${paletteKey}:${w}x${h}:${source.length}:${source.slice(-48)}`;
      let dataUrl = source ? this._templateImageDitherCache.get(key) : "";
      if (source && !dataUrl) {
        dataUrl = await this._renderCustomImageBitmapAtSize(source, "stretch", w, h, paletteKey).catch(() => "");
        if (dataUrl) {
          this._templateImageDitherCache.set(key, dataUrl);
          if (this._templateImageDitherCache.size > 24) {
            this._templateImageDitherCache.delete(this._templateImageDitherCache.keys().next().value);
          }
        }
      }
      const bitmap = new Image();
      await new Promise((resolve) => {
        bitmap.onload = resolve;
        // A source that will not decode drops this one element, exactly as
        // before - it must not take the rest of the send with it.
        bitmap.onerror = resolve;
        bitmap.src = dataUrl || item.src || "";
      });
      item.overlayImage = bitmap.complete && bitmap.naturalWidth ? bitmap : null;
    }));
  },

  // ------------------------------------------------------------- palette ---

  // The tile is drawn at the size the block will actually land in on the panel
  // being designed. Previewing every tile at one nominal size instead made the
  // captions of the round gauges ellipsise in the palette while fitting
  // perfectly on the canvas a click later.
  _templateBlockPaletteCanvas() {
    return {
      narrow: { width: 128, height: 296 },
      wide: { width: 296, height: 128 },
      large: { width: 800, height: 480 },
      "large-portrait": { width: 480, height: 800 },
    }[this._templateDesignerViewport] || { width: 296, height: 128 };
  },

  _renderTemplateBlockPalette() {
    const canvas = this._templateBlockPaletteCanvas();
    return TEMPLATE_BLOCK_GROUPS.map((group) => {
      const items = group.kinds.map((kind) => {
        const spec = this._templateBlockSpec(kind);
        if (!spec) return "";
        const preset = {
          blockKind: kind,
          block: spec.row(),
          label: spec.label,
          w: spec.w,
          h: spec.h,
        };
        // The tile shows the real block at the size it will land in, so the
        // palette is a preview rather than a list of names.
        const preview = this._renderTemplateBlockVisual(preset, canvas.width, canvas.height);
        return `<button type="button" class="template-palette-item is-block-tool" draggable="true"`
          + ` data-template-editor-tool="block" data-template-editor-icon="${this._escape(spec.icon)}"`
          + ` data-template-editor-preset="${this._escape(JSON.stringify(preset))}"`
          + ` title="Vložit ${this._escape(spec.label)} - ${this._escape(spec.hint)}">`
          + `<span class="template-palette-visual template-block-tile">${preview}</span>`
          + `<span>${this._escape(spec.label)}</span></button>`;
      }).join("");
      return `<div class="template-block-group"><small>${this._escape(group.title)}</small>`
        + `<div class="template-block-group-items">${items}</div></div>`;
    }).join("");
  },

  // ----------------------------------------------------------- inspector ---

  _templateBlockValueAt(row, path) {
    return String(path).split(".").reduce((node, key) => (node == null ? undefined : node[key]), row);
  },

  _setTemplateBlockValueAt(row, path, value) {
    const keys = String(path).split(".");
    const last = keys.pop();
    let node = row;
    for (const key of keys) {
      // A numeric key means the parent has to be an array, or "lines.0" would
      // quietly build an object with a "0" property that no block reads.
      if (node[key] == null || typeof node[key] !== "object") node[key] = /^\d+$/.test(key) ? [] : {};
      node = node[key];
    }
    if (value === undefined) delete node[last];
    else node[last] = value;
  },

  _renderTemplateBlockField(row, field, pathPrefix = "") {
    const path = `${pathPrefix}${field.path || field.key}`;
    const value = this._templateBlockValueAt(row, path);
    const id = this._escape(path);
    const label = this._escape(field.label);
    if (field.kind === "bool") {
      return `<label class="template-block-check"><input type="checkbox" data-template-block-prop="${id}"`
        + ` data-template-block-kind="bool" ${value ? "checked" : ""}><span><i></i>${label}</span></label>`;
    }
    if (field.kind === "ink") {
      const current = String(value || "black");
      const inks = BLOCK_INKS.filter(([key]) => key !== "yellow" || this._displaySupportsYellow?.());
      return `<label class="template-property-wide"><span>${label}</span><div class="template-property-colors">`
        + inks.map(([key, title]) => `<button type="button" style="--swatch:${key === "red" ? "#d71912" : key === "yellow" ? "#f4c400" : "#111111"}"`
          + ` class="${current === key ? "is-selected" : ""}" data-template-block-ink="${id}:${key}" title="${title}"></button>`).join("")
        + `</div></label>`;
    }
    if (field.kind === "select") {
      return `<label class="template-property-wide"><span>${label}</span>`
        + `<select data-template-block-prop="${id}" data-template-block-kind="text">`
        + (field.options || []).map(([key, title]) => `<option value="${this._escape(key)}" ${String(value ?? "") === key ? "selected" : ""}>${this._escape(title)}</option>`).join("")
        + `</select></label>`;
    }
    if (field.kind === "ratio" || field.kind === "number") {
      const shown = field.kind === "ratio" ? Math.round((Number(value) || 0) * 100) : (value ?? "");
      return `<label class="template-property-field"><span>${label}</span><div>`
        + `<input type="number" step="1" min="${field.min ?? 0}" max="${field.max ?? 100}" value="${this._escape(shown)}"`
        + ` data-template-block-prop="${id}" data-template-block-kind="${field.kind}">`
        + `<small>${field.kind === "ratio" ? "%" : "#"}</small></div></label>`;
    }
    if (field.kind === "numbers" || field.kind === "texts") {
      const shown = Array.isArray(value) ? value.join(", ") : "";
      return `<label class="template-property-wide"><span>${label}</span>`
        + `<input type="text" value="${this._escape(shown)}" data-template-block-prop="${id}"`
        + ` data-template-block-kind="${field.kind}" placeholder="1, 2, 3"></label>`;
    }
    const placeholder = field.kind === "icon" ? "např. home" : "";
    return `<label class="template-property-wide"><span>${label}</span>`
      + `<input type="text" value="${this._escape(value ?? "")}" data-template-block-prop="${id}"`
      + ` data-template-block-kind="text" placeholder="${this._escape(placeholder)}"></label>`;
  },

  // The repeatable part of a block - the rows of a list, the columns of a
  // strip. One card per entry, each with the same handful of fields, plus add
  // and remove. This is what keeps the inspector honest for the nine blocks
  // that are really "a variable number of the same small thing".
  _renderTemplateBlockRepeat(row, repeat, pathPrefix = "") {
    const path = `${pathPrefix}${repeat.path}`;
    const entries = this._templateBlockValueAt(row, path);
    const list = Array.isArray(entries) ? entries : [];
    const max = Number(repeat.max) || 8;
    const cards = list.map((_entry, index) => {
      const fields = repeat.fields
        .map((field) => this._renderTemplateBlockField(row, field, `${path}.${index}.`))
        .join("");
      return `<div class="template-block-entry"><header><span>${index + 1}.</span>`
        + `<button type="button" data-template-block-remove="${this._escape(path)}:${index}"`
        + ` title="Odebrat" aria-label="Odebrat položku ${index + 1}"><ha-icon icon="mdi:close"></ha-icon></button></header>`
        + `<div class="template-block-entry-fields">${fields}</div></div>`;
    }).join("");
    const full = list.length >= max;
    return `<div class="template-block-repeat"><div class="template-block-entries">${cards}</div>`
      + `<button type="button" class="template-block-add" data-template-block-add="${this._escape(path)}" ${full ? "disabled" : ""}>`
      + `<ha-icon icon="mdi:plus"></ha-icon>${this._escape(repeat.add || "Přidat položku")}</button></div>`;
  },

  // Fields for one block, at one level. Called again with a path prefix for
  // each half of a duo, which is what makes a nested pair editable without a
  // second inspector.
  _renderTemplateBlockSpecFields(row, kind, pathPrefix = "") {
    const spec = this._templateBlockSpec(kind);
    if (!spec) return "";
    const fields = (spec.fields || [])
      .map((field) => this._renderTemplateBlockField(row, field, pathPrefix))
      .join("");
    const repeat = spec.repeat ? this._renderTemplateBlockRepeat(row, spec.repeat, pathPrefix) : "";
    return fields + repeat;
  },

  _renderTemplateBlockDuoSide(row, side) {
    const prefix = `duo.${side}.`;
    const current = this._templateBlockKindOfRow(this._templateBlockValueAt(row, `duo.${side}`));
    const options = DUO_KINDS
      .map((kind) => `<option value="${kind}" ${current === kind ? "selected" : ""}>${this._escape(this._templateBlockSpec(kind).label)}</option>`)
      .join("");
    return `<div class="template-block-side"><h5>${side === "left" ? "Levá část" : "Pravá část"}</h5>`
      + `<label class="template-property-wide"><span>Typ bloku</span>`
      + `<select data-template-block-duo="${side}">${options}</select></label>`
      + this._renderTemplateBlockSpecFields(row, current, prefix)
      + `</div>`;
  },

  _renderTemplateBlockInspector(item) {
    const kind = String(item?.blockKind || this._templateBlockKindOfRow(item?.block) || "");
    const spec = this._templateBlockSpec(kind);
    if (!spec || !item?.block) return "";
    const body = kind === "duo"
      ? this._renderTemplateBlockSpecFields(item.block, "duo")
        + this._renderTemplateBlockDuoSide(item.block, "left")
        + this._renderTemplateBlockDuoSide(item.block, "right")
      : this._renderTemplateBlockSpecFields(item.block, kind);
    return `<details class="template-property-section template-block-section" open>`
      + `<summary><span>${this._escape(spec.label)}</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary>`
      + `<div class="template-property-section-body"><p class="template-entity-help">${this._escape(spec.hint)}</p>${body}</div>`
      + `</details>`;
  },

  // ------------------------------------------------------------- editing ---

  _applyTemplateBlockEdit(path, rawValue, kind) {
    const item = this._templateEditorElement?.();
    if (!item?.block) return;
    let value = rawValue;
    if (kind === "bool") value = !!rawValue;
    else if (kind === "ratio") value = Math.max(0, Math.min(1, (Number(rawValue) || 0) / 100));
    else if (kind === "number") value = Number(rawValue) || 0;
    else if (kind === "numbers") {
      value = String(rawValue).split(/[;,\n]+/)
        .map((part) => Number(String(part).trim().replace(",", ".")))
        .filter(Number.isFinite);
    } else if (kind === "texts") {
      value = String(rawValue).split(/[;,\n]+/).map((part) => part.trim()).filter(Boolean);
    } else {
      // An emptied text field means "leave this out", not "print an empty
      // string": several blocks change shape when a field is absent (a strip
      // cell without an icon closes up, a dial without min/max drops its
      // scale band), and storing "" would keep the space reserved.
      value = String(rawValue) === "" ? undefined : String(rawValue);
    }
    this._pushTemplateHistory?.();
    this._setTemplateBlockValueAt(item.block, path, value);
    this._templateSaveResult = null;
    this._render();
    this._paint();
    this._saveDisplayTemplateDraft?.().catch(() => {});
  },

  _addTemplateBlockEntry(path) {
    const item = this._templateEditorElement?.();
    if (!item?.block) return;
    const spec = this._templateBlockSpec(item.blockKind);
    // The template for a nested list lives on whichever spec owns that path -
    // for a duo that is the side's own kind, not "duo".
    const owner = path.startsWith("duo.")
      ? this._templateBlockSpec(this._templateBlockKindOfRow(this._templateBlockValueAt(item.block, path.split(".").slice(0, 2).join("."))))
      : spec;
    const template = owner?.repeat?.template;
    if (!template) return;
    const list = this._templateBlockValueAt(item.block, path);
    if (!Array.isArray(list) || list.length >= (owner.repeat.max || 8)) return;
    this._pushTemplateHistory?.();
    list.push(structuredClone(template));
    this._templateSaveResult = null;
    this._render();
    this._paint();
    this._saveDisplayTemplateDraft?.().catch(() => {});
  },

  _removeTemplateBlockEntry(path, index) {
    const item = this._templateEditorElement?.();
    if (!item?.block) return;
    const list = this._templateBlockValueAt(item.block, path);
    if (!Array.isArray(list) || list.length <= 1 || index < 0 || index >= list.length) return;
    this._pushTemplateHistory?.();
    list.splice(index, 1);
    this._templateSaveResult = null;
    this._render();
    this._paint();
    this._saveDisplayTemplateDraft?.().catch(() => {});
  },

  _setTemplateBlockDuoSide(side, kind) {
    const item = this._templateEditorElement?.();
    const spec = this._templateBlockSpec(kind);
    if (!item?.block?.duo || !spec) return;
    this._pushTemplateHistory?.();
    item.block.duo[side] = spec.row();
    this._templateSaveResult = null;
    this._render();
    this._paint();
    this._saveDisplayTemplateDraft?.().catch(() => {});
  },

  _bindTemplateBlockInspector() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-template-block-prop]").forEach((input) => {
      const kind = input.dataset.templateBlockKind || "text";
      const path = input.dataset.templateBlockProp;
      const event = input.tagName === "SELECT" || kind === "bool" ? "change" : "change";
      input.addEventListener(event, () => {
        this._applyTemplateBlockEdit(path, kind === "bool" ? input.checked : input.value, kind);
      });
    });
    root.querySelectorAll("[data-template-block-ink]").forEach((button) => button.addEventListener("click", () => {
      const [path, color] = String(button.dataset.templateBlockInk).split(":");
      this._applyTemplateBlockEdit(path, color, "text");
    }));
    root.querySelectorAll("[data-template-block-add]").forEach((button) => button.addEventListener("click", () => {
      this._addTemplateBlockEntry(button.dataset.templateBlockAdd);
    }));
    root.querySelectorAll("[data-template-block-remove]").forEach((button) => button.addEventListener("click", () => {
      const raw = String(button.dataset.templateBlockRemove);
      const index = Number(raw.slice(raw.lastIndexOf(":") + 1));
      this._removeTemplateBlockEntry(raw.slice(0, raw.lastIndexOf(":")), index);
    }));
    root.querySelectorAll("[data-template-block-duo]").forEach((select) => select.addEventListener("change", () => {
      this._setTemplateBlockDuoSide(select.dataset.templateBlockDuo, select.value);
    }));
  },
};
