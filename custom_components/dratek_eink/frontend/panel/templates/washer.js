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
  prepared: false,
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
  design: ({ v }) => [
    { text: "Pračka", h: 0.075, size: 0.055, bold: true },
    { text: v(0, "Bavlna 60°"), h: 0.09, size: 0.062, bold: true, color: "red" },
    { rule: true, h: 0.02 },
    { steps: [
      { label: "Napouštění", done: true },
      { label: "Praní", done: true },
      { label: "Máchání", done: true, color: "red" },
      { label: "Odstřeďování" },
      { label: "Hotovo" },
    ], h: 0.4 },
    { stat: { value: v(1, "01:15"), caption: "zbývá" }, h: 0.2 },
    { flex: true },
    { footer: [{ label: "SKONČÍ V", value: v(2, "14:30") }], h: 0.13 },
  ],
};
