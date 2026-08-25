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
  prepared: true,
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
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { band: { icon: "tram", label: "ZASTÁVKA", value: v(0, "Hlavní nádraží"), color: "black" }, bleed: true, h: 0.22 },
      { board: [
        { badge: v(1, "9"), label: "Centrum", value: v(2, "3 min"), color: "red" },
        { badge: "4", label: "Univerzita", value: "8 min" },
        { badge: "12", label: "Nemocnice", value: "14 min" },
      ], h: 0.66 },
      { footer: [{ label: "PĚŠKY", value: v(3, "240 m") }], h: 0.12 },
    ];
    return [
      { band: { icon: "tram", label: "ODJEZDY", value: v(0, "Hlavní nádraží"), color: "black" }, bleed: true, h: lerp(0.19, 0.14) },
      { split: [
        { icon: "tram", value: v(1, "9"), label: "nejbližší linka", color: "red" },
        { icon: "clock-fast", value: v(2, "3 min"), label: "odjezd" },
      ], h: lerp(0.34, 0.39) },
      { board: [
        { badge: "4", label: "Univerzita", value: "8 min" },
        { badge: "12", label: "Nemocnice", value: "14 min" },
        { badge: "N2", label: "Depo", value: "21 min" },
      ], h: lerp(0.31, 0.38) },
      { flex: true },
      { footer: [{ label: "PĚŠKY NA ZASTÁVKU", value: v(3, "240 m") }], h: lerp(0.14, 0.08) },
    ];
  },
};
