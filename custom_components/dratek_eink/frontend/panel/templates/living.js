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
  design: ({ v, ratio }) => [
    { icon: "sofa", h: 0.15 },
    { stat: { value: v(0, "23,5"), unit: "°C", caption: "Obývák" }, h: 0.3 },
    { rule: true, h: 0.02 },
    { meters: [
      { label: "Vlhkost", value: v(1, "40 %"), percent: ratio(1, 40) },
      { label: "CO₂", value: v(2, "650 ppm"), percent: ratio(2, 32), color: "red" },
    ], h: 0.28 },
    { flex: true },
    { footer: [{ label: "KOMFORT", value: "Optimální" }], h: 0.13 },
  ],
};
