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
  design: ({ v, width, height }) => {
    // A characteristic size (sqrt of area) rather than width alone: it reads
    // a wide wall panel and a tall portrait badge the same way, unlike a
    // width-only measure that would call a narrow tall panel "small" even
    // though it has plenty of height for the grid to grow into. 0 at the
    // smallest badge this catalog ships samples for (296x128), 1 at the
    // widest hardware this integration supports (1360x480, see weather.js).
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { grid: [
        { icon: "home", label: "Teplota", value: v(0, "21,5 °C"), color: "red" },
        { icon: "water-percent", label: "Vlhkost", value: v(1, "45 %") },
        { icon: "lightbulb-on-outline", label: "Světla", value: v(2, "Vypnuto") },
        { icon: "lock-outline", label: "Zámky", value: v(3, "Zamčeno") },
      ], columns: 2, h: 0.88 },
      { footer: [{ label: "DŮM", value: "rychlý přehled" }], h: 0.12 },
    ];
    return [
      { band: { label: "DŮM", value: "RYCHLÝ PŘEHLED", color: "black" }, bleed: true, h: lerp(0.16, 0.11) },
      { grid: [
        { icon: "home", label: "Teplota uvnitř", value: v(0, "21,5 °C"), color: "red" },
        { icon: "water-percent", label: "Vlhkost", value: v(1, "45 %") },
        { icon: "lightbulb-on-outline", label: "Světla", value: v(2, "Vypnuto") },
        { icon: "lock-outline", label: "Zámky", value: v(3, "Zamčeno") },
      ], columns: 2, h: lerp(0.70, 0.80) },
      { flex: true },
      { footer: [{ label: "DOMÁCNOST", value: "vše na jednom místě" }], h: lerp(0.14, 0.08) },
    ];
  },
};
