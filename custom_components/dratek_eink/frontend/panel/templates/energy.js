// Everything about the "Cena elektřiny" (Electricity price) display template.
export const template = {
  catalog: {
    id: "energy",
    number: "02",
    category: "energy",
    title: "Cena elektřiny",
    variables: [
      ["currency-usd", "Aktuální cena"],
      ["clock-outline", "Cenový interval"],
      ["chart-line", "Denní průběh"],
      ["tag-outline", "Minimum dne"],
    ],
  },
  prepared: false,
  // Which variable index feeds the bar chart's live series (see air.js for
  // why this can't be recovered from the row itself).
  automation: { series: [{ variableIndex: 2 }] },
  setup: {
    summary: "Aktuální cena elektřiny, kdy platí, a sloupcový graf ceny během celého dne s vyznačeným minimem.",
    integrations: [
      { name: "Nord Pool", domain: "sensor", core: true, why: "Součást Home Assistantu, spotové ceny pro severské a některé další evropské trhy - vhodné mimo Česko." },
      { name: "Tibber", domain: "sensor", core: true, why: "Součást Home Assistantu; funguje jen pro zákazníky dodavatele Tibber, ale napojení je pak plně automatické." },
      { name: "Jiná integrace spotových cen elektřiny", domain: "sensor", why: "Desítky dalších (podle dodavatele nebo země) se instalují přes HACS - stačí jakákoli, která vytvoří senzor s aktuální cenou." },
    ],
    steps: [
      "Nainstalujte integraci, která poskytuje senzor s cenou elektřiny - pokud jde o české spotové ceny podle OTE, použijte raději šablonu České spotové ceny, ta se napojí sama.",
      "V Nastavit vyberte u údaje Aktuální cena tento senzor.",
      "Sloupcový graf se vykreslí, pokud má stejný (nebo jiný, ručně vybraný) senzor atribut s polem cen na celý den; jinak zůstane ukázkový průběh - u údaje Denní průběh v Nastavit zkuste vybrat tentýž senzor jako u Aktuální ceny.",
    ],
    note: "Cenový interval (kdy aktuální cena platí) si šablona doplňuje sama z hodin Home Assistantu podle celé hodiny - nejde o hodnotu ze senzoru.",
  },
  design: ({ v, series }) => [
    { text: "Cena elektřiny", h: 0.075, size: 0.05, bold: true },
    { stat: { value: v(0, "2,45"), unit: "Kč/kWh", caption: v(1, "12:00–13:00") }, h: 0.27 },
    { bars: {
      values: series(2, [1.62, 1.48, 1.36, 1.29, 1.34, 1.51, 1.88, 2.24, 2.06, 1.72, 1.38, 1.12, 0.86, 0.94, 1.08, 1.42, 1.96, 2.58, 2.74, 2.39, 2.05, 1.84, 1.71, 1.63]),
      labels: ["0", "", "", "", "", "6", "", "", "", "", "", "12", "", "", "", "", "", "18", "", "", "", "", "", "23"],
      highlight: 12,
    }, group: "chart", h: 0.43 },
    { flex: true },
    { footer: [{ label: "NEJLEVNĚJI DNES", value: v(3, "0,86 Kč") }], h: 0.14 },
  ],
};
