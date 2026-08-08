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
  prepared: false,
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
  design: ({ v }) => [
    { text: "Kdo je doma", h: 0.08, size: 0.052, bold: true },
    { rule: true, h: 0.02 },
    { grid: [
      { icon: "account", value: v(0, "Petr"), label: v(1, "Doma"), color: "red" },
      { icon: "account", value: "Jana", label: "Doma" },
      { icon: "account", value: "Eliška", label: v(2, "Ve škole") },
    ], columns: 3, h: 0.5 },
    { flex: true },
    { footer: [{ label: "AKTUALIZACE", value: v(3, "12:45") }], h: 0.14 },
  ],
};
