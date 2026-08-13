// Everything about the "Odjezdy" (Transit departures) display template.
export const template = {
  catalog: {
    id: "transport",
    number: "12",
    category: "information",
    title: "Odjezdy",
    variables: [
      ["map-marker-outline", "Zastávka"],
      ["tram", "Linky"],
      ["clock-fast", "Časy odjezdů"],
      ["walk", "Vzdálenost"],
    ],
  },
  prepared: false,
  setup: {
    summary: "Název zastávky nahoře, čtyři řádky odjezdů pod ním - jen ten první je opravdu živý (viz poznámka).",
    integrations: [
      { name: "Integrace vašeho dopravce", domain: "sensor", why: "Obvykle z HACS podle města (např. PID pro Prahu a Střední Čechy, DPMB pro Brno), nebo vlastní REST senzor nad otevřeným API dopravce." },
    ],
    steps: [
      "Zprovozněte senzor, který vrací nejbližší odjezd (číslo linky a čas do odjezdu jako atributy nebo samostatné senzory).",
      "V Nastavit přiřaďte Zastávku (název), Linky (číslo linky prvního spoje) a Časy odjezdů (čas do odjezdu prvního spoje).",
      "Vzdálenost je volitelná - pokud máte senzor vzdálenosti k zastávce (např. z GPS trasy), přiřaďte ho tady; jinak zůstane ukázková hodnota.",
    ],
    note: "Deska odjezdů má na displeji fixně čtyři řádky, ale opravdu dynamický je jen první (linka + čas) - zbylé tři (Univerzita/Nemocnice/Depo) jsou pevný text v návrhu šablony pro ukázku vzhledu. Pro víc skutečně živých spojů najednou si založte vlastní šablonu v eInk Studiu.",
  },
  design: ({ v }) => [
    { text: v(0, "Hlavní nádraží"), h: 0.085, size: 0.052, bold: true },
    { rule: true, h: 0.02 },
    // 0.55 left a 20%-of-panel gap before the footer - board rows scale with
    // their own share of box height, so growing this fills that space with
    // bigger, easier-to-read departure rows instead of leaving it blank.
    { board: [
      { badge: v(1, "9"), label: "Náměstí", value: v(2, "3 min"), color: "red" },
      { badge: "4", label: "Univerzita", value: "8 min" },
      { badge: "12", label: "Nemocnice", value: "14 min" },
      { badge: "N2", label: "Depo", value: "21 min" },
    ], h: 0.72 },
    { flex: true },
    { footer: [{ label: "ZASTÁVKA", value: v(3, "240 m") }], h: 0.14 },
  ],
};
