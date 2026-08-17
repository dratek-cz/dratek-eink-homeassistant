// Everything about the "Zabezpečení" (Security) display template.
export const template = {
  catalog: {
    id: "security",
    number: "11",
    category: "technology",
    title: "Zabezpečení",
    variables: [
      ["shield-lock-outline", "Režim alarmu"],
      ["door-closed-lock", "Dveře"],
      ["window-closed", "Okna"],
      ["motion-sensor", "Pohyb"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Režim alarmu nahoře jedním pruhem, stav dveří/oken/pohybu jako seznam pod ním.",
    integrations: [
      { name: "Manual Alarm Control Panel", domain: "alarm_control_panel", core: true, why: "Alarm přímo v Home Assistantu bez fyzické ústředny, konfiguruje se v configuration.yaml. Vhodné pro vyzkoušení nebo když jinou ústřednu nemáte." },
      { name: "Integrace vaší ústředny", domain: "alarm_control_panel", why: "Jablotron, Alarmo, Konnected, Verisure a další - každá dodá vlastní entitu alarm_control_panel.*." },
      { name: "Kontakty dveří a oken, detektor pohybu", domain: "binary_sensor", why: "Jakékoli Zigbee/Z-Wave/Wi-Fi čidlo s device_class door, window nebo motion." },
    ],
    steps: [
      "Zprovozněte ústřednu alarmu, nebo použijte Manual Alarm Control Panel pro začátek.",
      "Přidejte kontakty dveří, oken a detektor pohybu (stačí po jednom od každého typu - více senzorů stejného typu šablona nesčítá).",
      "V Nastavit zkontrolujte přiřazení; stavy se zobrazí česky (Zamčeno/Odemčeno, Otevřeno/Zavřeno, Pohyb/Klid).",
    ],
    note: "Zaškrtávátka u Dveří/Oken/Pohybu i řádek ZÓNY dole jsou vizuálně vždy „v pořádku“ - mění se jen text vedle nich podle skutečného stavu, ne barva ani fajfka. Otevřené dveře tedy poznáte podle slova „Otevřeno“, ne podle vykřičníku.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    return [
      { icon: "shield-home", h: lerp(0.15, 0.12) },
      { band: { label: "ALARM", value: v(0, "ZAPNUTO"), color: "black" }, bleed: true, h: 0.2 },
      { checklist: [
        { label: `Dveře · ${v(1, "Zamčeno")}`, done: true },
        { label: `Okna · ${v(2, "Zavřeno")}`, done: true },
        { label: `Pohyb · ${v(3, "Klid")}`, done: true },
      ], marker: "dot", h: lerp(0.47, 0.54) },
      { flex: true },
      { footer: [{ label: "ZÓNY", value: "3 / 3 v pořádku" }], h: lerp(0.14, 0.08) },
    ];
  },
};
