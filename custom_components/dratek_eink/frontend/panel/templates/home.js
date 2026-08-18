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
    return [
      // No title text: "Dům" only ever repeated what the icon and the four
      // readings below already say, so it cost a whole row to say nothing -
      // and made this the fourth template in the catalog with the same
      // icon-then-title opening. Dropping it also means the readings grid
      // isn't fighting a caption for the panel's own identity anymore, so it
      // gets to be the thing someone actually reads.
      // No explicit colour: this is the template's identity row, and
      // _fourColorTemplateRows always repaints the first icon/text row
      // yellow regardless of what colour it starts with.
      { icon: "home", h: lerp(0.13, 0.1) },
      { grid: [
        { icon: "thermometer", label: "Teplota", value: v(0, "21,5 °C") },
        { icon: "water-percent", label: "Vlhkost", value: v(1, "45 %") },
        { icon: "lightbulb-on", label: "Světla", value: v(2, "3 ON") },
        { icon: "lock", label: "Zámky", value: v(3, "Zamčeno") },
      ], columns: 2, h: lerp(0.73, 0.79) },
      { flex: true },
      { footer: [{ label: "STAV", value: "Vše v pořádku" }], h: lerp(0.14, 0.08) },
    ];
  },
};
