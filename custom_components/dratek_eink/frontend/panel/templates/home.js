// Everything about the "Dům" (Home) display template.
export const template = {
  catalog: {
    id: "home",
    number: "03",
    category: "home",
    title: "Dům",
    variables: [
      ["thermometer", "Teplota"],
      ["water-percent", "Vlhkost"],
      ["lightbulb-on-outline", "Světla"],
      ["lock-outline", "Zámky"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Teplota, vlhkost, světla a zámky v jedné dlaždicové přehledce - rychlý přehled celé domácnosti na jednom místě.",
    integrations: [
      { name: "Senzory teploty a vlhkosti", domain: "sensor", why: "Cokoli s device_class temperature a humidity – Zigbee, ESPHome, Bluetooth, Wi-Fi teploměry." },
      { name: "Světla", domain: "light", why: "Jakákoli integrace osvětlení (Zigbee2MQTT, Z-Wave, Shelly, Philips Hue, ...) - dodá entity light.*." },
      { name: "Zámky", domain: "lock", why: "Chytré zámky s integrací do Home Assistantu dodají entity lock.*." },
    ],
    steps: [
      "Přetáhněte šablonu na displej; senzory se přiřadí podle svého device_class, světla a zámky podle domény.",
      "V Nastavit zkontrolujte, že u každé dlaždice sedí správná místnost - v domě s víc senzory stejného typu šablona vezme první nalezený.",
    ],
    note: "Údaj Světla zobrazuje stav jedné vybrané entity light.* (zapnuto/vypnuto), ne počet svítících světel v domě - pro počet potřebujete skupinu světel (light group) nebo šablonový senzor, který počet spočítá.",
  },
  design: ({ v }) => [
    { icon: "home", h: 0.15, color: "red" },
    { text: "Dům", h: 0.08, size: 0.058, bold: true },
    { grid: [
      { icon: "thermometer", label: "Teplota", value: v(0, "21,5 °C") },
      { icon: "water-percent", label: "Vlhkost", value: v(1, "45 %") },
      { icon: "lightbulb-on", label: "Světla", value: v(2, "3 ON") },
      { icon: "lock", label: "Zámky", value: v(3, "Zamčeno") },
    ], columns: 2, h: 0.54 },
    { flex: true },
    { footer: [{ label: "STAV", value: "Vše v pořádku" }], h: 0.14 },
  ],
};
