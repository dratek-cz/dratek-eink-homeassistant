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
  setup: {
    summary: "Index kvality vzduchu na budíku (0–200) nahoře, hodnoty CO₂, PM2.5 a vlhkosti jako seznam pod ním.",
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
  design: ({ v, ratio }) => [
    { text: "Kvalita vzduchu", h: 0.07, size: 0.046, bold: true },
    { dial: { percent: ratio(0, 21) / 2, value: v(0, "42"), caption: "AQI", min: "0", max: "200" }, h: 0.35 },
    { rule: true, h: 0.02 },
    { list: [
      { icon: "molecule-co2", label: "CO₂", value: v(1, "612 ppm") },
      { icon: "blur", label: "PM2.5", value: v(2, "8 µg") },
      { icon: "water-percent", label: "Vlhkost", value: v(3, "46 %") },
    ], h: 0.31 },
    { flex: true },
    { footer: [{ label: "VĚTRÁNÍ", value: "Není třeba" }], h: 0.13 },
  ],
};
