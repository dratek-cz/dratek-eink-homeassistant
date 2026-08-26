// Everything about the "Kvalita vzduchu" (Air quality) display template.
export const template = {
  catalog: {
    id: "air",
    number: "14",
    category: "nature",
    title: "Kvalita vzduchu",
    variables: [
      ["air-filter", "AQI"],
      ["molecule-co2", "CO₂"],
      ["blur", "PM2.5"],
      ["water-percent", "Vlhkost"],
    ],
  },
  prepared: true,
  // Declares which variable index feeds the dial's live percent fill (the
  // "group" tag on the row below is how the panel finds the drawn shape;
  // this is how it knows which entity value to recompute it from during an
  // automatic refresh, since ratio() itself only ever returns a plain
  // number - by the time a row is built there is no trace of which
  // variable produced it). divisor matches design()'s own `/ 2` - AQI's
  // native range is 0-200, one ratio() step further than the 0-100 the
  // dial fill otherwise assumes.
  automation: { ratio: [{ variableIndex: 0, divisor: 2 }] },
  setup: {
    summary: "Kruhový přístroj AQI a tři samostatné laboratorní karty pro CO₂, PM2.5 a vlhkost.",
    integrations: [
      { name: "Airly", domain: "sensor", core: true, why: "Venkovní kvalita ovzduší podle nejbližší veřejné stanice - nevyžaduje vlastní čidlo, jen zadání polohy." },
      { name: "Netatmo", domain: "sensor", core: true, why: "Vnitřní senzor CO₂ a kvality vzduchu, pokud máte stanici Netatmo doma." },
      { name: "ESPHome", domain: "sensor", core: true, why: "Vlastní senzor CO₂ (SCD40/SCD41, MH-Z19) nebo prachových částic (SDS011, PMS5003) postavený na ESP - device_class se nastaví přímo v ESPHome konfiguraci." },
      { name: "IQAir AirVisual", domain: "sensor", why: "Alternativa k Airly pro venkovní AQI, dostupná přes HACS nebo cloud API." },
    ],
    steps: [
      "Zprovozněte zdroj dat o vzduchu - Airly pro venkovní, Netatmo nebo vlastní ESPHome čidlo pro vnitřní.",
      "V Nastavit přiřaďte AQI, CO₂ a PM2.5 - většina zdrojů nabízí jen některé z nich, chybějící zůstanou na ukázkové hodnotě.",
      "Ciferník AQI počítá se stupnicí 0–200; pokud váš zdroj vrací jinou stupnici (např. americký AQI 0–500), hodnota na budíku nebude přesně odpovídat.",
    ],
    note: "Popisek VĚTRÁNÍ dole je pevný text \"Není třeba\" - nevyhodnocuje skutečné hodnoty, je to jen štítek pod seznamem.",
  },
  design: ({ v, ratio, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { dial: { percent: ratio(0, 42) / 2, value: v(0, "42"), caption: "AQI", min: "0", max: "200" }, group: "ratio", h: 0.68 },
      { strip: [
        { icon: "molecule-co2", label: "CO₂", value: v(1, "612 ppm") },
        { icon: "blur", label: "PM2.5", value: v(2, "8 µg") },
        { icon: "water-percent", label: "Vlhkost", value: v(3, "46 %") },
      ], h: 0.20 },
      { footer: [{ label: "VĚTRÁNÍ", value: "Není třeba" }], h: 0.12 },
    ];
    return [
      { strip: [
        { icon: "molecule-co2", label: "CO₂", value: v(1, "612 ppm"), color: "red" },
        { icon: "blur", label: "PM2.5", value: v(2, "8 µg") },
        { icon: "water-percent", label: "VLHKOST", value: v(3, "46 %") },
      ], h: lerp(0.31, 0.36) },
      { dial: { percent: ratio(0, 42) / 2, value: v(0, "42"), caption: "AQI / 200", min: "ČISTÝ", max: "ZÁTĚŽ" }, group: "ratio", h: lerp(0.38, 0.43) },
      { band: { label: "LABORATOŘ VZDUCHU", value: "ŽIVÉ MĚŘENÍ", color: "black" }, bleed: true, h: lerp(0.10, 0.08) },
      { flex: true },
      { footer: [{ label: "VĚTRÁNÍ", value: "Není třeba" }], h: lerp(0.13, 0.07) },
    ];
  },
};
