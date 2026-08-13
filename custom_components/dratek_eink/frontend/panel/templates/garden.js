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
  design: ({ v, series }) => [
    { text: v(0, "Záhon rajčat"), h: 0.075, size: 0.048, bold: true },
    { stat: { value: v(1, "36"), unit: "%", caption: "vlhkost půdy" }, h: 0.26 },
    { spark: { values: series(1, [62, 58, 55, 49, 47, 43, 40, 38, 36]), caption: "7 dní" }, group: "chart", h: 0.27 },
    { rule: true, h: 0.02 },
    { list: [
      { icon: "weather-sunny", label: "Teplota", value: v(2, "24 °C") },
      { icon: "weather-windy", label: "Vítr", value: v(3, "8 km/h") },
    ], h: 0.24 },
    { flex: true },
    { footer: [{ label: "ZÁLIVKA", value: v(4, "18:30") }], h: 0.13 },
  ],
};
