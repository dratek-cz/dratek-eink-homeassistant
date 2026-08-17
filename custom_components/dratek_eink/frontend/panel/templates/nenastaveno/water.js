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
  prepared: false,
  setup: {
    summary: "Spotřeba vody dnes velkým číslem, křivka za posledních 7 dní pod ní, týden/měsíc/rozdíl jako tři čísla dole.",
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
    return [
      { text: "Spotřeba vody", h: lerp(0.07, 0.045), size: 0.046, bold: true },
      { stat: { value: v(0, "126"), unit: "l", caption: "dnes" }, h: lerp(0.26, 0.3) },
      { spark: { values: series(0, [96, 131, 108, 142, 119, 174, 126]), caption: "7 dní" }, group: "chart", h: lerp(0.24, 0.28) },
      { rule: true, h: 0.02 },
      { strip: [
        { label: "TÝDEN", value: v(1, "0,84 m³") },
        { label: "MĚSÍC", value: v(2, "3,12 m³") },
        { label: "ROZDÍL", value: v(3, "−12 %"), color: "red" },
      ], h: lerp(0.2, 0.22) },
      { flex: true },
      { footer: [{ label: "ODEČET", value: "dnes 06:00" }], h: lerp(0.13, 0.07) },
    ];
  },
};
