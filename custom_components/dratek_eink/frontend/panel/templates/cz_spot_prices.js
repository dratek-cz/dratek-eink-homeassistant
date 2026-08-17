// Everything about the "České spotové ceny" (Czech spot electricity prices)
// display template - the only built-in template with its own auto-binding
// logic (see _czSpotTemplateBindings in panel-devices.mixin.js), because it
// targets one specific community integration closely enough to name its
// exact entity ids instead of guessing from device_class alone.
export const template = {
  catalog: {
    id: "cz_spot_prices",
    number: "22",
    category: "energy",
    title: "České spotové ceny",
    variables: [
      ["currency-usd", "Aktuální cena"],
      ["chart-line", "Cenový průběh dnes"],
      ["tray-arrow-down", "Minimum dnes"],
      ["arrow-up-down", "Maximum dnes"],
    ],
  },
  prepared: true,
  // Which variable index feeds the bar chart's live series (see air.js for
  // why this can't be recovered from the row itself).
  automation: { series: [{ variableIndex: 1 }] },
  setup: {
    summary: "České spotové ceny elektřiny z integrace Czech Energy Spot Prices podle dat OTE. Šablona automaticky načte aktuální cenu, celý denní průběh, minimum a maximum.",
    integrations: [
      {
        name: "Czech Energy Spot Prices",
        domain: "sensor",
        entityPrefixes: ["sensor.current_buy_electricity_price", "sensor.current_spot_electricity_price", "sensor.aktualni_spotova_cena_elektriny"],
        entityFriendlyNames: [
          "Aktuální spotová cena elektřiny",
          "Dnešní nejdražší spotová cena elektřiny",
          "Dnešní nejlevnější spotová cena elektřiny",
          "Dnešní pořadí hodin spotových cen elektřiny",
          "K dispozici zítřejší spotové ceny elektřiny",
          "Zítřejší nejdražší spotová cena elektřiny",
          "Zítřejší nejlevnější spotová cena elektřiny",
          "Zítřejší pořadí hodin spotových cen elektřiny",
        ],
        url: "https://github.com/rnovacek/homeassistant_cz_energy_spot_prices",
        linkLabel: "GitHub a instalace",
        why: "Komunitní integrace pro ceny elektřiny z OTE. Podporuje hodinové i 15minutové ceny a volitelnou skutečnou nákupní cenu včetně poplatků a DPH.",
      },
    ],
    steps: [
      "V HACS otevřete Integrace, vyhledejte Czech Energy Spot Prices a integraci nainstalujte. Potom restartujte Home Assistant.",
      "V Nastavení → Zařízení a služby → Přidat integraci vyberte Czech Energy Spot Prices.",
      "Zvolte elektřinu, měnu CZK, jednotku kWh a hodinový nebo 15minutový interval.",
      "Chcete-li zobrazovat skutečnou nákupní cenu, otevřete u integrace Konfigurovat a vyplňte šablonu nákupní ceny včetně distribuce, poplatků a DPH.",
      "Otevřete tuto šablonu znovu. Senzory se přiřadí automaticky; pokud máte více instancí integrace, můžete zdroje ručně změnit v Upravit data.",
    ],
    note: "Šablona preferuje nákupní cenu, pokud je v integraci nakonfigurovaná. Jinak použije základní spotovou cenu. Při současné hodinové a 15minutové instanci preferuje podrobnější 15minutová data.",
  },
  design: ({ v, series, width, height }) => {
    const prices = series(1, [1.62, 1.48, 1.36, 1.29, 1.34, 1.51, 1.88, 2.24, 2.06, 1.72, 1.38, 1.12, 0.86, 0.94, 1.08, 1.42, 1.96, 2.58, 2.74, 2.39, 2.05, 1.84, 1.71, 1.63]);
    const labels = prices.map((_price, index) => {
      const hour = Math.round((index * 24) / prices.length);
      return [0, 6, 12, 18].includes(hour) && index === Math.round((hour * prices.length) / 24) ? String(hour) : "";
    });
    const now = new Date();
    const highlight = Math.min(prices.length - 1, Math.floor((now.getHours() * 60 + now.getMinutes()) * prices.length / 1440));
    // MIN in yellow / MAX in red - cheap-good / expensive-bad, the same pair
    // the range footer below repeats in full-width red, so a BWRY panel reads
    // the two accent colours consistently across the whole tile.
    const minMax = (icons) => [
      { ...(icons ? { icon: "trending-down" } : {}), label: "MIN", value: v(2, "0,86 Kč"), color: "yellow" },
      { ...(icons ? { icon: "trending-up" } : {}), label: "MAX", value: v(3, "2,74 Kč"), color: "red" },
    ];
    // Without an icon, _blockStrip has nothing to carry the colour but the
    // value text itself - two cramped, differently-coloured numbers with no
    // icon to explain why read as noisy rather than informative. Colour stays
    // reserved for the icon in the range footer below; these tiers' strip
    // stays plain black instead.
    const minMaxPlain = () => [
      { label: "MIN", value: v(2, "0,86 Kč") },
      { label: "MAX", value: v(3, "2,74 Kč") },
    ];
    // The red "today's range" band used to be exclusive to the roomy tier -
    // dropped everywhere else for space. It is now a fixture on every size
    // instead: _stackTemplateBlocks already shrinks the rows above it
    // proportionally when the footer's fixed height doesn't fit, so adding it
    // unconditionally degrades gracefully down to the smallest price tag
    // rather than needing a bespoke layout per tier. The icon and the taller
    // h (was 0.13) make its label/value read bigger and bolder - both derive
    // straight from the footer's own height in _layoutTemplateFooter.
    const rangeFooter = () => ({
      footer: [{ icon: "arrow-up-down", label: "DNES ROZPĚTÍ", value: `${v(2, "0,86 Kč")}–${v(3, "2,74 Kč")}` }],
      h: 0.16,
    });
    // The current price used to be hard-coded red regardless of whether it was
    // actually the day's cheapest or most expensive interval - a glance at a
    // panel showing the lowest price of the day still read as "expensive",
    // the opposite of what MIN/MAX's own yellow/red already teach. Deriving
    // it from where `now` actually sits in today's own low/high range keeps
    // the same colour language meaning the same thing everywhere on the
    // tile: yellow cheap, red expensive, black (no colour) unremarkable.
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const current = prices[highlight];
    const spread = high - low;
    const position = Number.isFinite(current) && spread > 0 ? (current - low) / spread : 0.5;
    const currentColor = position >= 0.66 ? "red" : position <= 0.33 ? "yellow" : undefined;
    // width/height are the real panel this row set is about to be laid out
    // into (see _templateSvgSpecs) - undefined only for callers that build
    // rows without a target device (icon warm-up), where the 296x128 tag is
    // the common case to assume. Proportional scaling alone cannot make a
    // 212x104 price tag and a 1360x480 wall panel both read well from the
    // same five rows: a badge-sized tag has no room left for a title or a
    // chart once the price itself is legible, while a big panel has room to
    // spare that shrinking everything to fit the smallest tag would waste.
    const area = width && height ? width * height : 296 * 128;
    if (area <= 26000) {
      // 212x104, 196x96 - a price tag, not a dashboard. A `stat` row here
      // would be the only icon/text/stat row around, which is exactly what
      // _layoutTemplateSvgColumns treats as this wide little panel's
      // "identity" row - it would get its own 42% lead column and leave
      // MIN/MAX splitting the cramped rest. One plain three-cell strip has
      // no such row for the column split to key off, so it falls back to
      // stacking full width instead - more room for every number, not less.
      // No icon fits next to these values at this size, and _blockStrip
      // colours the value text itself when there is no icon to carry the
      // colour instead - three cramped, differently-coloured numbers read as
      // noisy rather than informative here. Colour stays reserved for the
      // icon in the range footer below; the strip itself stays plain black.
      return [
        { strip: [
          { label: "NYNÍ", value: v(0, "2,45 Kč") },
          ...minMaxPlain(),
        ], h: 0.86 },
        { flex: true },
        rangeFooter(),
      ];
    }
    if (area <= 110000) {
      // 250x128, 296x128, 168x384, 240x416, 210x480 and similar - room for
      // the chart and a title but not for MIN/MAX icons on top of them too,
      // so those stay dropped (see minMaxPlain above); the range footer
      // still fits and the rows above it shrink to make room.
      return [
        { text: "České spotové ceny", h: 0.065, size: 0.042, bold: true },
        { stat: { value: v(0, "2,45 Kč/kWh"), caption: "aktuální interval", color: currentColor }, h: 0.29 },
        { bars: { values: prices, labels, highlight }, group: "chart", h: 0.32 },
        { strip: minMaxPlain(), h: 0.26 },
        { flex: true },
        rangeFooter(),
      ];
    }
    // 400x300 and up - the full picture: icons beside MIN/MAX and the red
    // "today's range" band, all with room to breathe.
    return [
      { text: "České spotové ceny", h: 0.06, size: 0.04, bold: true },
      { stat: { value: v(0, "2,45 Kč/kWh"), caption: "aktuální interval", color: currentColor }, h: 0.22 },
      { bars: { values: prices, labels, highlight }, group: "chart", h: 0.33 },
      { strip: minMax(true), valueIcon: true, h: 0.3 },
      { flex: true },
      rangeFooter(),
    ];
  },
};
