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
  prepared: true,
  setup: {
    summary: "Papírově čistý nákupní lístek: velký počet zbývajících položek a kompaktní seznam s odškrtnutými řádky.",
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
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { checklist: [
        { label: v(1, "Mléko"), done: true },
        { label: "Chléb", done: true },
        { label: v(0, "Jablka"), color: "red" },
        { label: "Káva" },
        { label: "Prací gel" },
        { label: "Vejce" },
      ], columns: 3, marker: "box", strike: true, h: 0.88 },
      { footer: [{ label: "NÁKUP", value: "seznam připraven" }], h: 0.12 },
    ];
    return [
      { stat: { value: v(2, "3"), caption: "POLOŽKY ZBÝVAJÍ" }, h: lerp(0.26, 0.31) },
      { checklist: [
        { label: v(1, "Mléko"), done: true },
        { label: "Chléb", done: true },
        { label: v(0, "Jablka"), color: "red" },
        { label: "Káva" },
        { label: "Prací gel" },
      ], marker: "box", strike: true, h: lerp(0.58, 0.64) },
      { flex: true },
      { footer: [{ label: "NÁKUP", value: "vezmi seznam s sebou" }], h: lerp(0.14, 0.08) },
    ];
  },
};
