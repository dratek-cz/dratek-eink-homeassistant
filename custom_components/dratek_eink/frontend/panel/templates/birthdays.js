// Everything about the "Narozeniny" (Birthdays) display template.
export const template = {
  catalog: {
    id: "birthdays",
    number: "18",
    category: "information",
    title: "Narozeniny",
    // "Jméno z kalendáře", not just "Jméno": this slot's value comes from a
    // calendar event's title, not a person.* entity's name, and the auto-
    // binding classifier (_templateSlotKind) tells the two apart by whether
    // the label says "kalend" - see the setup note below for what that means
    // in practice.
    variables: [
      ["account", "Jméno z kalendáře"],
      ["numeric", "Věk"],
      ["calendar-star", "Další narozeniny"],
      ["gift-outline", "Připomínka"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Narozeninová pozvánka s oslavencem, věkem a výraznou kartou dalšího jubilea.",
    integrations: [
      { name: "Místní kalendář", domain: "calendar", core: true, why: "Založte kalendář Narozeniny s celodenními opakovanými událostmi - jedna událost na osobu, název události je jméno." },
    ],
    steps: [
      "V Nastavení → Zařízení a služby přidejte Místní kalendář a pojmenujte ho třeba Narozeniny.",
      "Do kalendáře přidejte celodenní opakovanou událost pro každou osobu, kde název události je její jméno (např. „Lucie“).",
      "V Nastavit přiřaďte Jméno z kalendáře k této kalendářové entitě - šablona zobrazí název nejbližší dnešní/nadcházející události.",
    ],
    note: "Věk a Připomínka jsou volitelné doplňkové texty, ne odvozené z kalendáře - Věk se typicky zadává ručně (pomocníkem typu číslo) a mění se jednou za rok, Připomínka je pevný nebo ručně upravovaný text.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { duo: {
        ratio: 0.55,
        left: { stat: { value: v(0, "Lucie"), caption: "DNES SLAVÍ", color: "red" } },
        right: { list: [
          { label: "VĚK", value: v(1, "32 let"), color: "red" },
          { label: "DALŠÍ", value: v(2, "Tomáš") },
        ] },
      }, h: 0.88 },
      { footer: [{ label: "PŘIPOMÍNKA", value: v(3, "Popřát ráno") }], h: 0.12 },
    ];
    return [
      { band: { label: "DNES SLAVÍ", value: v(0, "LUCIE"), color: "red" }, bleed: true, h: lerp(0.22, 0.17) },
      { split: [
        { icon: "cake-variant", value: v(1, "32 let"), label: "JUBILEUM", color: "red" },
        { icon: "gift-outline", value: v(2, "Tomáš"), label: "DALŠÍ OSLAVENEC" },
      ], h: lerp(0.42, 0.49) },
      { datebox: { day: "27", month: "KVĚ", lines: ["DALŠÍ TERMÍN", "za 4 dny"] }, h: lerp(0.22, 0.27) },
      { flex: true },
      { footer: [{ label: "PŘIPOMÍNKA", value: v(3, "Popřát ráno") }], h: lerp(0.14, 0.07) },
    ];
  },
};
