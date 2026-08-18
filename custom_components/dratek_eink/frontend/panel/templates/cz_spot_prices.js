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
    // No icons here, at any size: a MIN/MAX badge coloured yellow-vs-red only
    // reads as two different colours on hardware that actually has a yellow
    // pigment. On the (common) BWR-only fallback both "yellow" and "red"
    // resolve to the same red, so the two badges rendered identically -
    // trending-down and trending-up circles that looked like copies of each
    // other instead of a MIN/MAX pair. Plain black label/value text has no
    // such failure mode.
    const minMax = () => [
      { label: "MIN", value: v(2, "0,86 Kč") },
      { label: "MAX", value: v(3, "2,74 Kč") },
    ];
    // The red "today's range" band matches standard footer height across templates
    // (the same lerp(0.13, 0.07) most other templates' own footer uses, keyed off
    // sqrt(area) the same way - see home.js), without redundant icons for maximum
    // legibility. A fixed 0.12 used to sit here regardless of panel size: smaller
    // than every other template's footer on a small panel, bigger than all of them
    // on a large one.
    const rangeFooter = () => ({
      footer: [{ label: "DNES ROZPĚTÍ", value: `${v(2, "0,86 Kč")}–${v(3, "2,74 Kč")}` }],
      h: lerp(0.13, 0.07),
    });
    // width/height are the real panel this row set is about to be laid out
    // into (see _templateSvgSpecs) - undefined only for callers that build
    // rows without a target device (icon warm-up), where the 296x128 tag is
    // the common case to assume. Proportional scaling alone cannot make a
    // 212x104 price tag and a 1360x480 wall panel both read well from the
    // same five rows: a badge-sized tag has no room left for a title or a
    // chart once the price itself is legible, while a big panel has room to
    // spare that shrinking everything to fit the smallest tag would waste.
    const area = width && height ? width * height : 296 * 128;
    // Same sqrt(area) characteristic-size ramp home.js/water.js/etc. use for
    // their own footer row - rangeFooter() below is the only row here that
    // needs it, since every other row in this template picks a size per
    // discrete area tier instead of interpolating continuously.
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    // Every built-in template's first icon/text/stat/strip/... row is
    // auto-painted yellow at render time (_fourColorTemplateRows's identity
    // search - the one-accent-per-tile rule every catalog template shares).
    // It hunts for the first row carrying an `icon` or `text` field
    // specifically, wherever that row sits in the array. No title text row
    // and no icon anywhere here - a bare hairline is the only thing left for
    // that search to land on (its own fallback: the first row of any kind),
    // so it always gets the accent and nothing that actually needs to stay
    // black (the price, MIN/MAX) can end up recoloured by it.
    const accentRule = { rule: true, h: 0.015 };
    if (area <= 26000) {
      // 212x104, 196x96 - a price tag, not a dashboard. A `stat` row here
      // would be the only icon/text/stat row around, which is exactly what
      // _layoutTemplateSvgColumns treats as this wide little panel's
      // "identity" row - it would get its own 42% lead column and leave
      // MIN/MAX splitting the cramped rest. One plain three-cell strip has
      // no such row for the column split to key off, so it falls back to
      // stacking full width instead - more room for every number, not less.
      return [
        accentRule,
        { strip: [
          { label: "NYNÍ", value: v(0, "2,45 Kč") },
          ...minMax(),
        ], h: 0.845 },
        { flex: true },
        rangeFooter(),
      ];
    }
    if (area <= 110000) {
      // 250x128, 296x128, 168x384, 240x416, 210x480 and similar - room for
      // the chart but not for a title on top of it too. Chart first and
      // biggest, then the main price, then MIN/MAX, then today's range -
      // same priority order as the big tier below.
      return [
        accentRule,
        { bars: { values: prices, labels, highlight }, group: "chart", h: 0.4 },
        { stat: { value: v(0, "2,45 Kč/kWh"), caption: "aktuální interval" }, h: 0.22 },
        { strip: minMax(), h: 0.18 },
        { flex: true },
        rangeFooter(),
      ];
    }
    // 400x300 and up - the full picture. The chart is the thing worth a
    // glance at this size, so it leads and gets the most room; the current
    // price, then MIN/MAX, then today's range follow in shrinking order of
    // how often each one is actually what someone is looking for.
    return [
      accentRule,
      { bars: { values: prices, labels, highlight }, group: "chart", h: 0.44 },
      { stat: { value: v(0, "2,45 Kč/kWh"), caption: "aktuální interval" }, h: 0.2 },
      { strip: minMax(), h: 0.16 },
      { flex: true },
      rangeFooter(),
    ];
  },
};
