// Everything about the "Zahrada" (Garden) display template.
export const template = {
  catalog: {
    id: "garden",
    number: "20",
    category: "nature",
    title: "Zahrada",
    variables: [
      ["sprout-outline", "Záhon"],
      ["water-percent", "Vlhkost půdy"],
      ["thermometer", "Teplota"],
      ["weather-windy", "Vítr"],
      ["sprinkler-variant", "Další zálivka"],
    ],
  },
  prepared: true,
  // Which variable index feeds the sparkline's live series (see air.js for
  // why this can't be recovered from the row itself).
  automation: { series: [{ variableIndex: 1 }] },
  setup: {
    summary: "Vlhkost půdy velkým číslem s křivkou za posledních 7 dní, teplota a vítr jako dva řádky pod ní, další zálivka dole.",
    integrations: [
      { name: "Xiaomi BLE (Mi Flora)", domain: "sensor", core: true, why: "Čidla Mi Flora / Mi Plant Sensor měří vlhkost i vodivost půdy přes Bluetooth bez hubu - stačí je mít v dosahu Home Assistantu." },
      { name: "ESPHome", domain: "sensor", core: true, why: "Vlastní čidlo vlhkosti půdy (kapacitní nebo odporové) postavené na ESP, pokud Mi Flora nechcete kupovat." },
      { name: "Zavlažovací automatizace / harmonogram", domain: "input_datetime", why: "Vítr obvykle poskytuje meteostanice, ne půdní čidlo - a Další zálivka potřebuje vlastní časovač nebo automatizaci, žádné čidlo čas příští zálivky samo nezná." },
    ],
    steps: [
      "Spárujte čidlo Mi Flora v jeho integraci, nebo zprovozněte vlastní ESPHome senzor vlhkosti půdy.",
      "V Nastavit přiřaďte Vlhkost půdy k tomuto čidlu - graf posledních 7 dní čte historii ze stejné entity, potřebuje tedy uchovávanou historii aspoň týden zpět.",
      "Vítr přiřaďte k venkovní meteostanici, pokud ji máte; Teplota může být buď ze stejné meteostanice, nebo přímo z Mi Flora (měří i teplotu půdy/okolí).",
      "Další zálivka je čas, ne senzor spotřeby vody - napojte ji na časovač (timer) nebo pomocníka typu datum a čas z vaší zavlažovací automatizace.",
    ],
  },
  design: ({ v, series, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    return [
      // A small icon leads so the shared one-accent-per-tile auto-colour
      // (_fourColorTemplateRows) paints it yellow instead of the bed name
      // below - yellow letterforms are close to unreadable on this hardware,
      // a filled icon glyph reads fine (see cz_spot_prices.js for the same fix).
      { icon: "sprout-outline", h: lerp(0.1, 0.075) },
      { text: v(0, "Záhon rajčat"), h: lerp(0.065, 0.045), size: 0.048, bold: true },
      // No separate unit field: a bound sensor's value already comes back
      // with its unit_of_measurement appended, so a second literal "%" here
      // used to draw twice after a live update - see weather.js's
      // temperature stat for the same fix.
      { stat: { value: v(1, "36 %"), caption: "vlhkost půdy" }, h: lerp(0.24, 0.28) },
      { spark: { values: series(1, [62, 58, 55, 49, 47, 43, 40, 38, 36]), caption: "7 dní" }, group: "chart", h: lerp(0.27, 0.3) },
      { rule: true, h: 0.02 },
      { list: [
        { icon: "weather-sunny", label: "Teplota", value: v(2, "24 °C") },
        { icon: "weather-windy", label: "Vítr", value: v(3, "8 km/h") },
      ], h: lerp(0.24, 0.26) },
      { flex: true },
      { footer: [{ label: "ZÁLIVKA", value: v(4, "18:30") }], h: lerp(0.13, 0.07) },
    ];
  },
};
