// Everything about the "Odjezdy" (Transit departures) display template.
import { TRANSIT_KIND_ICONS } from "./shared.js?v=transit-two-line-1";

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
      // Both filled from Home Assistant's own clock, not from the timetable -
      // _templateVariableMeta marks a slot automatic on the words "čas" and
      // "datum", so neither can be (or needs to be) pointed at an entity. They
      // replaced a "Vzdálenost" slot nothing could fill: the transit feed has
      // no idea how far the stop is from the display, so that slot printed its
      // own design-time "240 m" on every panel, forever.
      ["clock-outline", "Čas"],
      ["calendar-outline", "Datum"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Vyberte zastávku přímo v Drátku. Název, linka, směr, čas odjezdu i druh vozidla se pak načítají automaticky z internetu.",
    integrations: [
      { name: "Jízdní řády Drátek", domain: "dratek_eink", internal: true, why: "Je součástí této integrace a používá otevřené zdroje Transitous pro Česko, Slovensko i další evropské země." },
    ],
    steps: [
      "Otevřete Nastavit a napište město a název zastávky.",
      "Vyberte správnou zastávku ze seznamu; hned se načte živý náhled odjezdů.",
      "Odešlete šablonu do displeje a zapněte automatickou aktualizaci v kartě Automatizace.",
    ],
    note: "Přímé stahování z webu IDOS není použito, protože IDOS neposkytuje veřejné datové API. Transitous skládá oficiální otevřené jízdní řády dopravců; dostupnost údajů v reálném čase závisí na konkrétním dopravci. Čas a datum ve spodním pruhu si šablona doplňuje sama z hodin Home Assistantu - nejsou to údaje z jízdního řádu, takže se nedají přepojit na jinou entitu.",
  },
  design: ({ v, transit, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    const live = transit?.() || {};
    const fallback = [
      { line: v(1, "9"), destination: "Centrum", time: v(2, "3 min"), departure: "7:12", kind: "tram" },
      { line: "4", destination: "Univerzita", time: "8 min", departure: "7:17", kind: "trolleybus" },
      { line: "12", destination: "Nemocnice", time: "14 min", departure: "7:23", kind: "bus" },
      { line: "N2", destination: "Depo", time: "21 min", departure: "7:30", kind: "train" },
      { line: "3", destination: "Sídliště", time: "26 min", departure: "7:35", kind: "tram" },
      { line: "17", destination: "Letiště", time: "31 min", departure: "7:40", kind: "bus" },
      { line: "S4", destination: "Hlavní nádraží", time: "38 min", departure: "7:47", kind: "train" },
      { line: "A", destination: "Náměstí Míru", time: "44 min", departure: "7:53", kind: "subway" },
    ];
    const portrait = height > width;
    const smallLandscape = height <= 160 && width >= height;
    // The board's own share of the panel, decided before the rows are counted -
    // how many services fit is a question about that box, not about the panel.
    const boardFraction = portrait ? 0.75 : smallLandscape ? 0.66 : lerp(0.65, 0.77);
    const boardHeight = (height || 128) * boardFraction;
    // A service row has to hold its line plate, its destination and its
    // countdown. _blockBoard sizes the plate at 68% of the row and its digits
    // at 65% of that, so under about 20 printed pixels the line number is
    // already on _svgText's own floor; the two-line portrait board stacks the
    // scheduled time under the destination and needs half again as much.
    //
    // The pitch grows with the panel rather than staying at that floor, so a
    // wall panel shows more services *and* bigger ones - pinning it to the
    // minimum would have printed eighteen 10px rows on an 800x480 display.
    const rowPitch = portrait ? lerp(30, 46) : lerp(20, 34);
    const fits = Math.floor(boardHeight / rowPitch);
    // A portrait board gives each service two lines and puts the vehicle glyph
    // under its line plate, where the row's own height is the only thing that
    // can make the glyph bigger. Packing a narrow tag with everything that
    // fits therefore bought extra services by shrinking the one mark that says
    // whether this is the bus or the train. Small tags take four and spend the
    // rest of the panel on legibility; the count opens up with the panel.
    const portraitCap = Math.floor(lerp(4, 12));
    // Four is the floor everywhere: three services on a tag is a board you
    // have to trust rather than read, and the smallest landscape tag was
    // showing exactly that. Twelve is the ceiling because it is what the
    // timetable is asked for (TRANSIT_BOARD_LIMIT in
    // panel-template-svg.mixin.js) - a board cannot show services nobody
    // fetched, so the two numbers have to stay in step.
    const rowCount = Math.max(4, Math.min(portrait ? portraitCap : 12, fits));
    const departures = (Array.isArray(live.departures) && live.departures.length ? live.departures : fallback).slice(0, rowCount);
    const board = departures.map((item, index) => ({
      badge: item.line || "–",
      label: item.destination || "Spoj",
      value: item.time || "",
      // Both boards draw these now. The single-line one drops the clock, and
      // then the icon, if the destination would be squeezed under a third of
      // the row - so a narrow landscape tag degrades instead of clipping.
      clock: item.departure || "",
      icon: TRANSIT_KIND_ICONS[item.kind] || TRANSIT_KIND_ICONS.other,
      color: index === 0 ? "red" : "black",
    }));
    const stopName = live.stop_name || v(0, "Hlavní nádraží");
    if (portrait) return [
      { band: { icon: "tram", label: "ODJEZDY", value: stopName, color: "black" }, bleed: true, h: 0.15 },
      // `twoLine` is what makes this board give each service the full width for
      // its destination and a second line for the scheduled time next to the
      // countdown - see _blockBoardTwoLine for why a narrow panel needs it.
      { board: board, filled: true, twoLine: true, group: "transport-board", h: boardFraction },
      { footer: [{ label: "ČAS", value: v(3, "12:45") }, { label: "DATUM", value: v(4, "23. května") }], h: 0.10 },
    ];
    if (smallLandscape) return [
      { band: { icon: "tram", label: "ZASTÁVKA", value: stopName, color: "black" }, bleed: true, h: 0.22 },
      // `filled` makes the line numbers plates rather than outlines - see
      // _blockBoard. A real departures board prints the number knocked into a
      // solid field, and an empty rectangle around a single digit was the
      // thinnest thing on the page.
      { board: board, filled: true, group: "transport-board", h: boardFraction },
      { footer: [{ label: "ČAS", value: v(3, "12:45") }, { label: "DATUM", value: v(4, "23. května") }], h: 0.12 },
    ];
    return [
      { band: { icon: "tram", label: "ODJEZDY", value: stopName, color: "black" }, bleed: true, h: lerp(0.19, 0.14) },
      { board: board, filled: true, group: "transport-board", h: boardFraction },
      { flex: true },
      { footer: [{ label: "ČAS", value: v(3, "12:45") }, { label: "DATUM", value: v(4, "23. května") }], h: lerp(0.14, 0.08) },
    ];
  },
};
