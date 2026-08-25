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
    summary: "Výrazný stav alarmu a samostatné zónové karty pro dveře, okna a pohyb.",
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
    note: "Zónové karty zobrazují skutečný text stavu entity. Souhrnný text v patičce je informační štítek a počet zón sám nepočítá.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { band: { icon: "shield-home-outline", label: "ALARM", value: v(0, "ZAPNUTO"), color: "black" }, bleed: true, h: 0.24 },
      { checklist: [
        { label: `Dveře · ${v(1, "Zamčeno")}`, done: true, color: "red" },
        { label: `Okna · ${v(2, "Zavřeno")}`, done: true },
        { label: `Pohyb · ${v(3, "Klid")}`, done: true },
      ], marker: "dot", h: 0.64 },
      { footer: [{ label: "OCHRANA", value: "aktivní" }], h: 0.12 },
    ];
    return [
      { band: { icon: "shield-home-outline", label: "OCHRANA DOMU", value: v(0, "ZAPNUTO"), color: "black" }, bleed: true, h: lerp(0.22, 0.17) },
      { strip: [
        { icon: "door-closed-lock", label: "Dveře", value: v(1, "Zamčeno"), color: "red" },
        { icon: "window-closed", label: "Okna", value: v(2, "Zavřeno") },
        { icon: "motion-sensor", label: "Pohyb", value: v(3, "Klid") },
      ], h: lerp(0.62, 0.73) },
      { flex: true },
      { footer: [{ label: "ZÓNY", value: "kontrola aktivní" }], h: lerp(0.14, 0.08) },
    ];
  },
};
