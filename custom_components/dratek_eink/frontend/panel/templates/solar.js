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
    summary: "Solární energetický tok s živým výkonovým kruhem a dlaždicemi výroby za den, měsíc a celkem.",
    integrations: [
      { name: "Integrace vašeho střídače", oneOf: "Integrace střídače", domain: "sensor", core: true, why: "Fronius, GoodWe, SolarEdge, SolaX, Huawei Solar a další jsou součástí Home Assistantu a po přidání dodají senzory výkonu i výroby přímo." },
      { name: "Envertech / SMA / jiný výrobce", oneOf: "Integrace střídače", domain: "sensor", why: "Řada dalších výrobců má vlastní nebo HACS integraci - hledejte podle značky střídače." },
    ],
    steps: [
      "Přidejte integraci střídače v Nastavení → Zařízení a služby (podle výrobce vašeho střídače).",
      "Šablona si vezme senzory s device_class power (okamžitý výkon) a energy (výroba za den/měsíc/celkem).",
      "Mezikruží se plní podle procentní hodnoty výkonu; pokud senzor procenta nemá, zobrazí ukázkovou výplň místo skutečné hodnoty.",
      "Úsporu CO₂ nabízí jen některé integrace jako samostatný senzor - pokud ji vaše nemá, můžete si ji dopočítat šablonovým senzorem z výroby v kWh.",
    ],
  },
  design: ({ v, ratio, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { duo: {
        ratio: 0.48,
        left: { ring: { percent: ratio(0, 47), value: v(0, "2,35 kW"), caption: "VÝKON", color: "red" }, group: "ratio" },
        right: { list: [
          { label: "DNES", value: v(1, "8,2 kWh"), color: "red" },
          { label: "MĚSÍC", value: v(2, "152 kWh") },
          { label: "CELKEM", value: v(3, "3,45 MWh") },
        ] },
      }, h: 0.88 },
      { footer: [{ label: "ÚSPORA CO₂", value: v(4, "125 kg") }], h: 0.12 },
    ];
    return [
      { ring: { percent: ratio(0, 47), value: v(0, "2,35 kW"), caption: "VÝKON NYNÍ" }, group: "ratio", h: lerp(0.43, 0.49) },
      { grid: [
        { icon: "weather-sunny", label: "Dnes", value: v(1, "8,2 kWh"), color: "red" },
        { icon: "calendar-month", label: "Měsíc", value: v(2, "152 kWh") },
        { icon: "counter", label: "Celkem", value: v(3, "3,45 MWh") },
      ], columns: 3, h: lerp(0.40, 0.46) },
      { flex: true },
      { footer: [{ label: "ÚSPORA CO₂", value: v(4, "125 kg") }], h: lerp(0.13, 0.07) },
    ];
  },
};
