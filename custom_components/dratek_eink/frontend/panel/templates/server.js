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
    summary: "Dostupnost pruhem nahoře, čtyři vodorovné ukazatele (CPU/RAM/Disk/Teplota) uprostřed, doba provozu dole.",
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
    return [
      // A small icon leads so the shared one-accent-per-tile auto-colour
      // (_fourColorTemplateRows) paints it yellow instead of the title text
      // below - yellow letterforms are close to unreadable on this hardware,
      // a filled icon glyph reads fine (see cz_spot_prices.js for the same fix).
      { icon: "server-network", h: lerp(0.09, 0.065) },
      // No title text: "Home server" only restated what the status band
      // right below it already announces. Both the band and the four
      // meters grow into the space that used to go to a caption nobody
      // needed to read twice.
      { band: { label: "STAV", value: v(0, "ONLINE") }, bleed: true, h: 0.17 },
      { meters: [
        { label: "CPU", value: v(1, "24 %"), percent: ratio(1, 24) },
        { label: "RAM", value: v(2, "61 %"), percent: ratio(2, 61) },
        { label: "Disk", value: v(3, "73 %"), percent: ratio(3, 73), color: "red" },
        { label: "Teplota", value: v(4, "48 °C"), percent: ratio(4, 48) },
      ], group: "ratio", h: lerp(0.68, 0.75) },
      { flex: true },
      { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: lerp(0.13, 0.07) },
    ];
  },
};
