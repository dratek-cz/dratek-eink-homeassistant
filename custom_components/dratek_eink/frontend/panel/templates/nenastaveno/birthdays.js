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
  prepared: false,
  setup: {
    summary: "Kdo dnes slaví velkým jménem nahoře, kdo je na řadě příště jako datum dole.",
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
    return [
      { icon: "cake-variant", h: lerp(0.15, 0.12) },
      { stat: { value: v(0, "Lucie"), caption: v(1, "32 let"), color: "red" }, h: lerp(0.28, 0.32) },
      { rule: true, h: 0.02 },
      { datebox: { day: "27", month: "KVĚ", lines: [v(2, "Tomáš"), "za 4 dny"] }, h: lerp(0.4, 0.44) },
      { flex: true },
      { footer: [{ label: "PŘIPOMÍNKA", value: v(3, "Popřát ráno") }], h: lerp(0.14, 0.07) },
    ];
  },
};
