// Everything about the "Fotovoltaika" (Solar) display template.
export const template = {
  catalog: {
    id: "solar",
    number: "05",
    category: "energy",
    title: "Fotovoltaika",
    variables: [
      ["solar-power", "Aktuální výkon"],
      ["weather-sunny", "Výroba dnes"],
      ["calendar-month", "Výroba měsíc"],
      ["counter", "Výroba celkem"],
      ["leaf", "Úspora CO₂"],
    ],
  },
  prepared: true,
  // Which variable index feeds the ring's live percent fill (see air.js for
  // why this can't be recovered from the row itself).
  automation: { ratio: [{ variableIndex: 0 }] },
  setup: {
    summary: "Okamžitý výkon fotovoltaiky mezikružím, výroba za den/měsíc/celkem a odhad úspory CO₂ dole.",
    integrations: [
      { name: "Integrace vašeho střídače", domain: "sensor", core: true, why: "Fronius, GoodWe, SolarEdge, SolaX, Huawei Solar a další jsou součástí Home Assistantu a po přidání dodají senzory výkonu i výroby přímo." },
      { name: "Envertech / SMA / jiný výrobce", domain: "sensor", why: "Řada dalších výrobců má vlastní nebo HACS integraci - hledejte podle značky střídače." },
    ],
    steps: [
      "Přidejte integraci střídače v Nastavení → Zařízení a služby (podle výrobce vašeho střídače).",
      "Šablona si vezme senzory s device_class power (okamžitý výkon) a energy (výroba za den/měsíc/celkem).",
      "Mezikruží se plní podle procentní hodnoty výkonu; pokud senzor procenta nemá, zobrazí ukázkovou výplň místo skutečné hodnoty.",
      "Úsporu CO₂ nabízí jen některé integrace jako samostatný senzor - pokud ji vaše nemá, můžete si ji dopočítat šablonovým senzorem z výroby v kWh.",
    ],
  },
  design: ({ v, ratio }) => [
    { text: "Fotovoltaika", h: 0.075, size: 0.05, bold: true },
    { ring: { percent: ratio(0, 47), value: v(0, "2,35"), caption: "kW" }, group: "ratio", h: 0.42 },
    { list: [
      { icon: "weather-sunny", label: "Dnes", value: v(1, "8,2 kWh") },
      { icon: "calendar-month", label: "Měsíc", value: v(2, "152 kWh") },
      { icon: "counter", label: "Celkem", value: v(3, "3,45 MWh") },
    ], h: 0.3 },
    { flex: true },
    { footer: [{ label: "ÚSPORA CO₂", value: v(4, "125 kg") }], h: 0.13 },
  ],
};
