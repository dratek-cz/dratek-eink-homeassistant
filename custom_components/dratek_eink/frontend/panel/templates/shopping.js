// Everything about the "Nákupní seznam" (Shopping list) display template.
export const template = {
  catalog: {
    id: "shopping",
    number: "13",
    category: "home",
    title: "Nákupní seznam",
    variables: [
      ["format-list-checks", "Položky"],
      ["checkbox-marked-outline", "Splněné"],
      ["cart-outline", "Počet zbývajících"],
    ],
  },
  prepared: false,
  setup: {
    summary: "Nákupní seznam se zaškrtnutými položkami - pět řádků na displeji, ale dva z nich jsou napojitelné na skutečná data, zbytek je ukázka (viz poznámka).",
    integrations: [
      {
        name: "Nákupní seznam",
        domain: "todo",
        core: true,
        entityPrefixes: ["todo.shopping_list"],
        why: "Klasická vestavěná integrace Home Assistantu - po zapnutí vytvoří entitu todo.shopping_list. Její stav je počet nevyřízených položek, ne jejich jména.",
      },
      { name: "Místní úkolovník", domain: "todo", core: true, why: "Obecný seznam úkolů přímo v Home Assistantu - vhodný, pokud chcete nákupní seznam nazvat a spravovat sám." },
    ],
    steps: [
      "Přidejte integraci Nákupní seznam (nebo Místní úkolovník) v Nastavení → Zařízení a služby.",
      "V Nastavit přiřaďte Počet zbývajících k entitě todo.* - její stav (počet nevyřízených položek) se zobrazí ve spodním řádku ZBÝVÁ.",
      "Položky a Splněné jsou ukázkové názvy dvou konkrétních položek (jedné odškrtnuté a jedné ne) - napojte je na pomocníky typu text, pokud chcete na displeji vidět konkrétní jména, jinak zůstanou vzorové Mléko/Jablka.",
    ],
    note: "Seznam na displeji má pevně pět řádků, ale skutečná data z todo.* entity (jednotlivé položky) se na něj automaticky nepřenášejí - žádná todo entita totiž nevrací \"první nevyřízenou položku jako text\" způsobem, který by šlo jednoduše napojit. Živě fungující je jen celkový počet zbývajících položek.",
  },
  design: ({ v }) => [
    { text: "Nákupní seznam", h: 0.075, size: 0.048, bold: true },
    { rule: true, h: 0.02 },
    // 0.55 left over a fifth of the panel as bare flex before the footer -
    // checklist rows scale with their own share of box height, so growing
    // this gives all five lines more room instead of leaving it unused.
    { checklist: [
      { label: v(1, "Mléko"), done: true },
      { label: "Chléb", done: true },
      { label: v(0, "Jablka") },
      { label: "Káva" },
      { label: "Prací gel" },
    ], marker: "box", strike: true, h: 0.72 },
    { flex: true },
    { footer: [{ label: "ZBÝVÁ", value: v(2, "3 položky") }], h: 0.14 },
  ],
};
