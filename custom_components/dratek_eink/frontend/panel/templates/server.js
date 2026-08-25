// Everything about the "Stav serveru" (Server status) display template.
export const template = {
  catalog: {
    id: "server",
    number: "19",
    category: "technology",
    title: "Stav serveru",
    variables: [
      ["server-network", "Dostupnost"],
      ["chip", "CPU"],
      ["memory", "RAM"],
      ["harddisk", "Disk"],
      ["thermometer", "Teplota"],
      ["clock-outline", "Doba provozu"],
    ],
  },
  prepared: true,
  // Which variable index feeds each meter bar's live percent fill, in the
  // same order as the meters row below (see air.js for why this can't be
  // recovered from the row itself).
  automation: { ratio: [{ variableIndex: 1 }, { variableIndex: 2 }, { variableIndex: 3 }, { variableIndex: 4 }] },
  setup: {
    summary: "Technická konzole se stavovým pruhem, čtyřmi živými ukazateli zátěže a dobou provozu.",
    integrations: [
      {
        name: "System Monitor",
        domain: "sensor",
        core: true,
        entityFriendlyNames: ["Processor use", "Memory use", "Disk use", "Processor temperature", "Vytížení procesoru", "Využití paměti"],
        why: "Zátěž procesoru, paměti a disku stroje, na kterém běží Home Assistant - jeden ze základních vestavěných monitorovacích nástrojů.",
      },
    ],
    steps: [
      "Přidejte integraci System Monitor v Nastavení → Zařízení a služby a při konfiguraci zaškrtněte Processor use, Memory use, Disk use a Processor temperature.",
      "Šablona zná anglické názvy System Monitoru (CPU → Processor use, RAM → Memory use) a entity si najde sama; otevřete Nastavit jen pro kontrolu nebo pokud máte v Home Assistantu senzorů stejného druhu víc.",
      "Dostupnost je volitelná - System Monitor sám o sobě dostupnost nehlásí (běží-li Home Assistant, běží i on); pro skutečné sledování jiného stroje použijte binary_sensor s device_class connectivity (např. z integrace Ping).",
    ],
  },
  design: ({ v, ratio, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { band: { label: "SERVER", value: v(0, "ONLINE"), color: "black" }, bleed: true, h: 0.14 },
      { meters: [
        { label: "CPU", value: v(1, "24 %"), percent: ratio(1, 24) },
        { label: "RAM", value: v(2, "61 %"), percent: ratio(2, 61) },
        { label: "DISK", value: v(3, "73 %"), percent: ratio(3, 73), color: "red" },
        { label: "TEPLOTA", value: v(4, "48 °C"), percent: ratio(4, 48) },
      ], group: "ratio", h: 0.74 },
      { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: 0.12 },
    ];
    return [
      { band: { label: "HOME SERVER", value: v(0, "ONLINE"), color: "black" }, bleed: true, h: lerp(0.18, 0.13) },
      { meters: [
        { label: "CPU", value: v(1, "24 %"), percent: ratio(1, 24) },
        { label: "RAM / paměť", value: v(2, "61 %"), percent: ratio(2, 61) },
        { label: "DISK / úložiště", value: v(3, "73 %"), percent: ratio(3, 73), color: "red" },
        { label: "TEMP / teplota", value: v(4, "48 °C"), percent: ratio(4, 48) },
      ], group: "ratio", h: lerp(0.58, 0.68) },
      { strip: [
        { icon: "server-network", label: "UPTIME", value: v(5, "18 dní"), color: "red" },
        { icon: "lan-connect", label: "SÍŤ", value: "AKTIVNÍ" },
      ], h: lerp(0.16, 0.19) },
      { flex: true },
      { footer: [{ label: "MONITORING", value: "systémová konzole" }], h: lerp(0.13, 0.07) },
    ];
  },
};
