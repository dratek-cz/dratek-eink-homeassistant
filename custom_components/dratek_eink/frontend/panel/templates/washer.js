// Everything about the "Pračka" (Washer) display template.
export const template = {
  catalog: {
    id: "washer",
    number: "06",
    category: "home",
    title: "Pračka",
    variables: [
      ["washing-machine", "Program"],
      ["timer-outline", "Zbývající čas"],
      ["clock-check-outline", "Čas dokončení"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Program pračky, zbývající čas a čas dokončení - průběh napouštění/praní/máchání pod nadpisem je ilustrační grafika, ne živé sledování konkrétní fáze.",
    integrations: [
      { name: "Home Connect", domain: "sensor", core: true, why: "Pro pračky a sušičky Bosch a Siemens. Dodá program, stav a zbývající čas přímo - nejjednodušší cesta, pokud vaše pračka Home Connect podporuje." },
      { name: "Senzor spotřeby + šablonový senzor", domain: "sensor", why: "U pračky bez chytrého připojení se běh pozná podle příkonu chytré zásuvky (typicky nad ~5 W = pere) - šablonový senzor v Home Assistantu z toho odvodí stav a odhadem i zbývající čas." },
    ],
    steps: [
      "Připojte pračku přes Home Connect, pokud to jde, nebo ji zapojte přes chytrou zásuvku sledující příkon.",
      "Bez Home Connect si vytvořte šablonový senzor, který z příkonu odvodí text programu (\"Pere\"/\"Hotovo\") a časovač na zbývající čas.",
      "V Nastavit přiřaďte Program a Zbývající čas; Čas dokončení lze nechat prázdný, pokud jej senzor nenabízí - šablona pak ukáže jen odhad podle zbývajícího času.",
    ],
    note: "Ikony Napouštění/Praní/Máchání/Odstřeďování/Hotovo pod nadpisem jsou pevná grafika téhle šablony - nesledují skutečnou fázi cyklu, tu nese jen textový Program a čas.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    return [
      // A small icon leads so the shared one-accent-per-tile auto-colour
      // (_fourColorTemplateRows) paints it yellow instead of the title text
      // below - yellow letterforms are close to unreadable on this hardware,
      // a filled icon glyph reads fine (see cz_spot_prices.js for the same fix).
      { icon: "washing-machine", h: lerp(0.1, 0.075) },
      { text: "Pračka", h: lerp(0.065, 0.045), size: 0.055, bold: true },
      { text: v(0, "Bavlna 60°"), h: lerp(0.08, 0.06), size: 0.062, bold: true, color: "red" },
      { rule: true, h: 0.02 },
      { steps: [
        { label: "Napouštění", done: true },
        { label: "Praní", done: true },
        { label: "Máchání", done: true, color: "red" },
        { label: "Odstřeďování" },
        { label: "Hotovo" },
      ], h: lerp(0.4, 0.44) },
      { stat: { value: v(1, "01:15"), caption: "zbývá" }, h: lerp(0.2, 0.24) },
      { flex: true },
      { footer: [{ label: "SKONČÍ V", value: v(2, "14:30") }], h: lerp(0.13, 0.07) },
    ];
  },
};
