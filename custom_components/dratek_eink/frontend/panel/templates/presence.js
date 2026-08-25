// Everything about the "Kdo je doma" (Presence) display template.
export const template = {
  catalog: {
    id: "presence",
    number: "08",
    category: "home",
    title: "Kdo je doma",
    variables: [
      ["account-group-outline", "Osoby"],
      ["home-account", "Přítomnost"],
      ["school-outline", "Stav osoby"],
      ["clock-outline", "Aktualizace"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Domácí nástěnka osob v řádcích: jméno, aktuální přítomnost a rychle čitelný stav.",
    integrations: [
      { name: "Osoby", domain: "person", core: true, why: "Nastavení → Lidé. Každý člen domácnosti je entita person.*." },
      { name: "Home Assistant Companion", domain: "device_tracker", core: true, why: "Mobilní aplikace hlásí polohu, ze které se přítomnost odvodí - bez ní zůstane osoba trvale „Pryč“, i když je doma." },
    ],
    steps: [
      "V Nastavení → Lidé založte členy domácnosti.",
      "Propojte je se sledovacím zařízením z mobilní aplikace (Nastavení → Aplikace → nainstalovat Home Assistant Companion na telefon).",
      "V Nastavit přiřaďte Osoby ke konkrétní osobě (jméno) a Přítomnost ke stejné osobě (stav Doma/Pryč) - stavy se zobrazí česky.",
    ],
    note: "Šablona má tři řádky, ale plně dynamický je první (Osoby + Přítomnost). Jana a Eliška jsou ukázkové texty; u Elišky lze napojit Stav osoby. Pro více živých osob použijte vlastní šablonu v eInk Studiu.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { board: [
        { badge: "●", label: v(0, "Petr"), value: v(1, "Doma"), color: "red" },
        { badge: "●", label: "Jana", value: "Doma" },
        { badge: "○", label: "Eliška", value: v(2, "Ve škole") },
      ], h: 0.88 },
      { footer: [{ label: "AKTUALIZACE", value: v(3, "12:45") }], h: 0.12 },
    ];
    return [
      { board: [
        { badge: "●", label: v(0, "Petr"), value: v(1, "Doma"), color: "red" },
        { badge: "●", label: "Jana", value: "Doma" },
        { badge: "○", label: "Eliška", value: v(2, "Ve škole") },
      ], h: lerp(0.72, 0.81) },
      { strip: [
        { icon: "account", label: "DOMÁCNOST", value: "3 OSOBY", color: "red" },
      ], h: lerp(0.14, 0.10) },
      { flex: true },
      { footer: [{ label: "AKTUALIZACE", value: v(3, "12:45") }], h: lerp(0.14, 0.08) },
    ];
  },
};
