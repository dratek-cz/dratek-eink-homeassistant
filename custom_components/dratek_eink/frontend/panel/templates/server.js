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
      "V Nastavit přiřaďte CPU, RAM, Disk a Teplota - automatické rozpoznání hledá v názvu entity slovo z popisku údaje, takže u System Monitoru (anglické názvy Processor use/Memory use) je často potřeba vybrat entitu ručně, ne spoléhat na automatický návrh.",
      "Dostupnost je volitelná - System Monitor sám o sobě dostupnost nehlásí (běží-li Home Assistant, běží i on); pro skutečné sledování jiného stroje použijte binary_sensor s device_class connectivity (např. z integrace Ping).",
    ],
  },
  design: ({ v, ratio }) => [
    { text: "Home server", h: 0.07, size: 0.046, bold: true },
    { band: { label: "STAV", value: v(0, "ONLINE") }, bleed: true, h: 0.17 },
    { meters: [
      { label: "CPU", value: v(1, "24 %"), percent: ratio(1, 24) },
      { label: "RAM", value: v(2, "61 %"), percent: ratio(2, 61) },
      { label: "Disk", value: v(3, "73 %"), percent: ratio(3, 73), color: "red" },
      { label: "Teplota", value: v(4, "48 °C"), percent: ratio(4, 48) },
    ], group: "ratio", h: 0.48 },
    { flex: true },
    { footer: [{ label: "PROVOZ", value: v(5, "18 dní") }], h: 0.13 },
  ],
};
