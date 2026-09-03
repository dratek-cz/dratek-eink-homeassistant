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
    summary: "Zahradnická karta záhonu: půdní vlhkost, sedmidenní trend a venkovní podmínky v jedné scéně.",
    integrations: [
      { name: "Xiaomi BLE (Mi Flora)", oneOf: "Čidlo vlhkosti půdy", domain: "sensor", core: true, why: "Čidla Mi Flora / Mi Plant Sensor měří vlhkost i vodivost půdy přes Bluetooth bez hubu - stačí je mít v dosahu Home Assistantu." },
      { name: "ESPHome", oneOf: "Čidlo vlhkosti půdy", domain: "sensor", core: true, why: "Vlastní čidlo vlhkosti půdy (kapacitní nebo odporové) postavené na ESP, pokud Mi Flora nechcete kupovat." },
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
    if (height <= 160 && width >= height) return [
      { split: [
        { icon: "sprout-outline", label: "ZÁHON", value: v(0, "Rajčata"), color: "red" },
        { icon: "water-percent", label: "PŮDA", value: v(1, "36 %") },
      ], h: 0.34 },
      { list: [
        { icon: "thermometer", label: "Teplota", value: v(2, "24 °C") },
        { icon: "weather-windy", label: "Vítr", value: v(3, "8 km/h") },
      ], h: 0.54 },
      { footer: [{ label: "ZÁLIVKA", value: v(4, "18:30") }], h: 0.12 },
    ];
    return [
      { split: [
        { icon: "sprout-outline", value: v(0, "Záhon rajčat"), label: "ZÁHON", color: "red" },
        { icon: "water-percent", value: v(1, "36 %"), label: "PŮDNÍ VLHKOST" },
      ], h: lerp(0.33, 0.38) },
      { spark: { values: series(1, [62, 58, 55, 49, 47, 43, 40, 38, 36]), caption: "VLHKOST PŮDY / 7 DNÍ" }, group: "chart", h: lerp(0.32, 0.37) },
      { list: [
        { icon: "weather-sunny", label: "Teplota", value: v(2, "24 °C") },
        { icon: "weather-windy", label: "Vítr", value: v(3, "8 km/h") },
      ], h: lerp(0.20, 0.23) },
      { flex: true },
      { footer: [{ label: "DALŠÍ ZÁLIVKA", value: v(4, "18:30") }], h: lerp(0.13, 0.07) },
    ];
  },
};
