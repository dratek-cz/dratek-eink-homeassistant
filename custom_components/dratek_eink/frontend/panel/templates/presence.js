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
    summary: "Kdo z domácnosti je doma a kdo ne - první dlaždice ukazuje jméno a stav, druhá a třetí jsou spíš ukázkové (viz poznámka níže).",
    integrations: [
      { name: "Osoby", domain: "person", core: true, why: "Nastavení → Lidé. Každý člen domácnosti je entita person.*." },
      { name: "Home Assistant Companion", domain: "device_tracker", core: true, why: "Mobilní aplikace hlásí polohu, ze které se přítomnost odvodí - bez ní zůstane osoba trvale „Pryč“, i když je doma." },
    ],
    steps: [
      "V Nastavení → Lidé založte členy domácnosti.",
      "Propojte je se sledovacím zařízením z mobilní aplikace (Nastavení → Aplikace → nainstalovat Home Assistant Companion na telefon).",
      "V Nastavit přiřaďte Osoby ke konkrétní osobě (jméno) a Přítomnost ke stejné osobě (stav Doma/Pryč) - stavy se zobrazí česky.",
    ],
    note: "Šablona má na displeji fixně tři dlaždice, ale jen první má skutečně dynamické jméno i stav (Osoby + Přítomnost) - prostřední (\"Jana\") a jméno u třetí (\"Eliška\") jsou pevný text v návrhu šablony, pouze stav třetí dlaždice lze napojit přes Stav osoby. Pro víc lidí opravdu naživo si založte vlastní šablonu v eInk Studiu.",
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
      { icon: "account-group-outline", h: lerp(0.1, 0.075) },
      // No title text: "Kdo je doma" only restated what the three named,
      // photo-less tiles below already show at a glance.
      { rule: true, h: 0.02 },
      // 0.5 left roughly a quarter of the panel as bare flex space below the
      // grid - grid cells scale with their own box (see _blockGrid), so this
      // reclaimed height goes straight into bigger, more legible tiles instead
      // of an oversized gap before the footer. The lerp grows that further
      // still on a genuinely large panel.
      { grid: [
        { icon: "account", value: v(0, "Petr"), label: v(1, "Doma"), color: "red" },
        { icon: "account", value: "Jana", label: "Doma" },
        { icon: "account", value: "Eliška", label: v(2, "Ve škole") },
      ], columns: 3, h: lerp(0.76, 0.82) },
      { flex: true },
      { footer: [{ label: "AKTUALIZACE", value: v(3, "12:45") }], h: lerp(0.14, 0.08) },
    ];
  },
};
