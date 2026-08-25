// Everything about the "Obývák" (Living room) display template.
export const template = {
  catalog: {
    id: "living",
    number: "07",
    category: "home",
    title: "Obývák",
    variables: [
      ["thermometer", "Teplota"],
      ["water-percent", "Vlhkost"],
      ["molecule-co2", "CO₂"],
    ],
  },
  prepared: true,
  // Which variable index feeds each meter bar's live percent fill, in the
  // same order as the meters row below (see air.js for why this can't be
  // recovered from the row itself).
  automation: { ratio: [{ variableIndex: 1 }, { variableIndex: 2 }] },
  setup: {
    summary: "Teplota v místnosti velkým číslem nahoře, vlhkost a CO₂ jako dva vodorovné ukazatele pod ní.",
    integrations: [
      { name: "Senzor teploty a vlhkosti", domain: "sensor", why: "Jakýkoli senzor s device_class temperature a humidity - Zigbee, ESPHome, Bluetooth (Xiaomi/Aqara), Wi-Fi." },
      { name: "Senzor CO₂", domain: "sensor", why: "ESPHome (vlastní čidlo, např. SCD40/SCD41 nebo MH-Z19), Netatmo, nebo Airthings - všechny dodají device_class carbon_dioxide." },
    ],
    steps: [
      "Přetáhněte šablonu na displej a v Nastavit zkontrolujte, že u každého ukazatele sedí senzor z místnosti, kterou chcete sledovat (v domě s víc pokojovými senzory šablona bez zásahu vezme první nalezený).",
    ],
    note: "Popisek KOMFORT dole je pevný text \"Optimální\" - nevyhodnocuje skutečně naměřené hodnoty, je to jen štítek pod ukazateli.",
  },
  design: ({ v, ratio, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { stat: { value: v(0, "23,5 °C"), caption: "OBÝVÁK", color: "red" }, h: 0.66 },
      { strip: [
        { icon: "water-percent", label: "VLHKOST", value: v(1, "40 %") },
        { icon: "molecule-co2", label: "CO₂", value: v(2, "650 ppm") },
      ], h: 0.22 },
      { footer: [{ label: "OBÝVÁK", value: "komfort" }], h: 0.12 },
    ];
    return [
      { split: [
        { icon: "sofa", value: "OBÝVÁK", label: "komfortní zóna" },
        { icon: "thermometer", value: v(0, "23,5 °C"), label: "teplota", color: "red" },
      ], h: lerp(0.38, 0.43) },
      { meters: [
        { label: "Vlhkost vzduchu", value: v(1, "40 %"), percent: ratio(1, 40) },
        { label: "Oxid uhličitý", value: v(2, "650 ppm"), percent: ratio(2, 32), color: "red" },
      ], group: "ratio", h: lerp(0.43, 0.49) },
      { flex: true },
      { footer: [{ label: "KOMFORT", value: "Optimální" }], h: lerp(0.13, 0.07) },
    ];
  },
};
