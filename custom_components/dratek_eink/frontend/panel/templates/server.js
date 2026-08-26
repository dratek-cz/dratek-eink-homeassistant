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
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height > width) return [
      { band: { icon: "server", label: "SERVER", value: v(0, "ONLINE"), color: "black" }, bleed: true, h: 0.13 },
      // A portrait screen cannot give a two-column console enough width for
      // labels such as temperature and storage. Stack four full-width status
      // tiles instead; the values stay large and none of the labels truncate.
      { grid: [
        { icon: "chip", value: v(1, "24 %"), label: "CPU" },
        { icon: "memory", value: v(2, "61 %"), label: "RAM" },
        { icon: "harddisk", value: v(3, "73 %"), label: "DISK", color: "red" },
        { icon: "thermometer", value: v(4, "48 °C"), label: "TEPLOTA" },
      ], columns: 1, h: 0.77 },
      { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: 0.10 },
    ];
    if (height <= 160 && width >= height) return [
      { band: { icon: "server", label: "SERVER", value: v(0, "ONLINE"), color: "black" }, bleed: true, h: 0.20 },
      // Four thin progress bars turned this into a diagnostics table that had
      // to be studied. A 2 x 2 console gives every reading a real typographic
      // centre: the value is large, the icon says what it is, and the red disk
      // tile remains the warning the eye finds first.
      { grid: [
        { icon: "chip", value: v(1, "24 %"), label: "CPU" },
        { icon: "memory", value: v(2, "61 %"), label: "RAM" },
        { icon: "harddisk", value: v(3, "73 %"), label: "DISK", color: "red" },
        { icon: "thermometer", value: v(4, "48 °C"), label: "TEPLOTA" },
      ], columns: 2, h: 0.68 },
      { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: 0.12 },
    ];
    return [
      { band: { icon: "server", label: "HOME SERVER", value: v(0, "ONLINE"), color: "black" }, bleed: true, h: lerp(0.18, 0.13) },
      { grid: [
        { icon: "chip", value: v(1, "24 %"), label: "CPU" },
        { icon: "memory", value: v(2, "61 %"), label: "RAM / paměť" },
        { icon: "harddisk", value: v(3, "73 %"), label: "DISK / úložiště", color: "red" },
        { icon: "thermometer", value: v(4, "48 °C"), label: "TEMP / teplota" },
      ], columns: 2, h: lerp(0.58, 0.68) },
      { strip: [
        { icon: "server-network", label: "UPTIME", value: v(5, "18 dní"), color: "red" },
        { icon: "lan-connect", label: "SÍŤ", value: "AKTIVNÍ" },
      ], h: lerp(0.16, 0.19) },
      { flex: true },
      { footer: [{ label: "MONITORING", value: "systémová konzole" }], h: lerp(0.13, 0.07) },
    ];
  },
};
