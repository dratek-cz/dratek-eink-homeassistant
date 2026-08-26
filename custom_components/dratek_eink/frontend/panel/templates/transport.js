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
    summary: "Vyberte zastávku přímo v Drátku. Název, linka, směr i čas všech čtyř spojů se pak načítají automaticky z internetu.",
    integrations: [
      { name: "Jízdní řády Drátek", domain: "dratek_eink", internal: true, why: "Je součástí této integrace a používá otevřené zdroje Transitous pro Česko, Slovensko i další evropské země." },
    ],
    steps: [
      "Otevřete Nastavit a napište město a název zastávky.",
      "Vyberte správnou zastávku ze seznamu; hned se načte živý náhled čtyř odjezdů.",
      "Odešlete šablonu do displeje a zapněte automatickou aktualizaci v kartě Automatizace.",
    ],
    note: "Přímé stahování z webu IDOS není použito, protože IDOS neposkytuje veřejné datové API. Transitous skládá oficiální otevřené jízdní řády dopravců; dostupnost údajů v reálném čase závisí na konkrétním dopravci.",
  },
  design: ({ v, transit, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    const live = transit?.() || {};
    const fallback = [
      { line: v(1, "9"), destination: "Centrum", time: v(2, "3 min") },
      { line: "4", destination: "Univerzita", time: "8 min" },
      { line: "12", destination: "Nemocnice", time: "14 min" },
      { line: "N2", destination: "Depo", time: "21 min" },
    ];
    const departures = (Array.isArray(live.departures) && live.departures.length ? live.departures : fallback).slice(0, 4);
    const board = departures.map((item, index) => ({
      badge: item.line || "–", label: item.destination || "Spoj", value: item.time || "", color: index === 0 ? "red" : "black",
    }));
    const stopName = live.stop_name || v(0, "Hlavní nádraží");
    if (height > width) return [
      { band: { icon: "tram", label: "ODJEZDY", value: stopName, color: "black" }, bleed: true, h: 0.15 },
      // All four lines share the same board in portrait. The former split put
      // the first line in an icon/value card, so only the following lines got
      // the requested solid number plate.
      { board: board, filled: true, group: "transport-board", h: 0.75 },
      { footer: [{ label: "PĚŠKY", value: v(3, "240 m") }], h: 0.10 },
    ];
    if (height <= 160 && width >= height) return [
      { band: { icon: "tram", label: "ZASTÁVKA", value: stopName, color: "black" }, bleed: true, h: 0.22 },
      // `filled` makes the line numbers plates rather than outlines - see
      // _blockBoard. A real departures board prints the number knocked into a
      // solid field, and an empty rectangle around a single digit was the
      // thinnest thing on the page.
      { board: board, filled: true, group: "transport-board", h: 0.66 },
      { footer: [{ label: "PĚŠKY", value: v(3, "240 m") }], h: 0.12 },
    ];
    return [
      { band: { icon: "tram", label: "ODJEZDY", value: stopName, color: "black" }, bleed: true, h: lerp(0.19, 0.14) },
      { board: board, filled: true, group: "transport-board", h: lerp(0.65, 0.77) },
      { flex: true },
      { footer: [{ label: "PĚŠKY NA ZASTÁVKU", value: v(3, "240 m") }], h: lerp(0.14, 0.08) },
    ];
  },
};
