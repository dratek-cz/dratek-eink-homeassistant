// Everything about the "Spotřeba vody" (Water usage) display template.
export const template = {
  catalog: {
    id: "water",
    number: "16",
    category: "energy",
    title: "Spotřeba vody",
    // The word "vody" in every label is load-bearing, not decorative: the
    // auto-binding classifier (_templateSlotKind) tells this template apart
    // from electricity consumption by that word alone.
    variables: [
      ["water", "Spotřeba vody dnes"],
      ["calendar-week", "Spotřeba vody týden"],
      ["calendar-month", "Spotřeba vody měsíc"],
      ["compare", "Porovnání s minulým obdobím"],
    ],
  },
  // Which variable index feeds the sparkline's live series (see air.js for
  // why this can't be recovered from the row itself).
  automation: { series: [{ variableIndex: 0 }] },
  prepared: true,
  setup: {
    summary: "Vodárenský přehled s dnešním odběrem, sedmidenní křivkou a třemi bilančními poli.",
    integrations: [
      { name: "Vodoměr", domain: "sensor", why: "Impulzní vstup (pulzní vodoměr + čítač), Zigbee vodoměr, nebo senzor přes ESPHome; device_class water." },
      { name: "Utility Meter", domain: "sensor", core: true, why: "Vestavěná integrace, která z průběžného odečtu (celkových m³) spočítá denní, týdenní a měsíční spotřebu jako samostatné senzory." },
    ],
    steps: [
      "Zprovozněte měření spotřeby vody - vodoměr sám o sobě obvykle hlásí jen celkový průběžný stav, ne spotřebu za období.",
      "Přidejte integraci Utility Meter nad tímto vodoměrem a nastavte jí denní, týdenní a měsíční cyklus - vytvoří tři oddělené senzory.",
      "V Nastavit přiřaďte Spotřeba vody dnes k dennímu senzoru; Spotřeba vody týden a měsíc k odpovídajícím Utility Meter senzorům.",
      "Graf posledních 7 dní čte historii ze stejné entity jako Spotřeba vody dnes, ne ze zvláštního zdroje - denní senzor tedy potřebuje mít v Home Assistantu uchovávanou historii aspoň týden dozadu.",
    ],
    note: "Popisek ODEČET dole je pevný text \"dnes 06:00\" - nejde o skutečný čas posledního odečtu vodoměru.",
  },
  design: ({ v, series, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { stat: { value: v(0, "126 l"), caption: `DNES · ${v(3, "−12 %")}`, color: "red" }, h: 0.28 },
      { spark: { values: series(0, [96, 131, 108, 142, 119, 174, 126]), caption: "7 DNÍ" }, group: "chart", h: 0.50 },
      { strip: [
        { label: "TÝDEN", value: v(1, "0,84 m³") },
        { label: "MĚSÍC", value: v(2, "3,12 m³") },
      ], h: 0.10 },
      { footer: [{ label: "VODA", value: "aktuální odečet" }], h: 0.12 },
    ];
    // The two headline readings were given more than a third of the page and
    // spent it on white space between three widely separated lines. The curve
    // is what a week of water actually looks like, so the room went there.
    return [
      // No icons: a 16 px droplet under the word DNES is a speck, and dropping
      // it lets the split use its two-line geometry, where the reading is the
      // biggest thing in the cell rather than the third of three bands.
      { split: [
        { value: v(0, "126 l"), label: "DNES", color: "red" },
        { value: v(3, "−12 %"), label: "PROTI MINULE" },
      ], h: lerp(0.28, 0.30) },
      { spark: { values: series(0, [96, 131, 108, 142, 119, 174, 126]), caption: "SPOTŘEBA / 7 DNÍ" }, group: "chart", h: lerp(0.38, 0.40) },
      // Stacked rows sit flush, and the chart's baseline would otherwise be
      // the line the two totals below it stand on.
      { gap: true, h: 0.02 },
      { strip: [
        { label: "TÝDEN", value: v(1, "0,84 m³") },
        { label: "MĚSÍC", value: v(2, "3,12 m³") },
      ], h: lerp(0.18, 0.20) },
      { flex: true },
      { footer: [{ label: "ODEČET", value: "dnes 06:00" }], h: lerp(0.13, 0.07) },
    ];
  },
};
