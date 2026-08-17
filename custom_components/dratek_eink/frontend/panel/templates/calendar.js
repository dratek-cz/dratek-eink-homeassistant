// Everything about the "Kalendář" (Calendar) display template.
export const template = {
  catalog: {
    id: "calendar",
    number: "10",
    category: "information",
    title: "Kalendář",
    variables: [
      ["calendar", "První událost"],
      ["calendar-multiple", "Druhá událost"],
      ["cake-variant-outline", "Svátek"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Dvě nejbližší události z kalendáře nahoře, svátek dole - na rozdíl od Data a Času se svátek nedoplňuje automaticky, potřebuje vlastní zdroj (viz poznámka).",
    integrations: [
      { name: "Místní kalendář", domain: "calendar", core: true, why: "Kalendář přímo v Home Assistantu, bez cloudu a bez účtu - nejrychlejší způsob, jak šablonu vyzkoušet, i jak si založit čistě lokální kalendář na svátky." },
      { name: "Google Calendar", domain: "calendar", core: true, why: "Napojení na Google účet; události se načtou automaticky, žádné ruční zadávání." },
      { name: "CalDAV", domain: "calendar", core: true, why: "Pro Nextcloud, iCloud a další servery podporující CalDAV protokol." },
    ],
    steps: [
      "Přidejte některou kalendářovou integraci v Nastavení → Zařízení a služby.",
      "Přetáhněte šablonu na displej; entita calendar.* se najde sama u obou událostí.",
      "Události se čtou službou calendar.get_events na 21 dní dopředu - pokud v tomto okně nic není, dlaždice zůstane prázdná.",
      "U údaje Svátek v Nastavit vyberte entitu, která jmeniny poskytuje (viz poznámka) - bez toho zůstane jen ukázkové jméno.",
    ],
    note: "Home Assistant nemá vestavěný seznam českých svátků (jmenin) - narozdíl od Data a Času, které si šablona doplní sama z hodin systému, potřebuje Svátek vlastní zdroj: buď šablonový senzor postavený na knihovně jmenin/svátků, nebo samostatný kalendář se svátky jako celodenními událostmi (podobně jako u šablony Narozeniny).",
  },
  design: ({ v, event, width, height }) => {
    // Determine screen geometry budget
    const twoColumn = width && height && width / height >= 1.35;
    const columnWidth = twoColumn ? width / 2 : (width || 296);
    const area = width && height ? width * height : 296 * 128;

    // Smallest tags: 212x104, 196x96
    if (area <= 26000) {
      return [
        { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: 0.72 },
        { flex: true },
        { footer: [{ label: "SVÁTEK", value: v(2, "Jana") }], h: 0.22 },
      ];
    }

    // Large dashboards: 400x300, 640x384, 800x480, 960x640+
    if (area >= 110000) {
      // Sized comfortably with up to 3 or 4 upcoming events on large/wide panels
      const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 340) / (800 - 340)));
      const lerp = (from, to) => from + (to - from) * t;
      const showThird = columnWidth >= 340 || height >= 350;

      return [
        { text: "Kalendář", h: lerp(0.065, 0.05), size: 0.045, bold: true },
        { rule: true, h: 0.02 },
        { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: showThird ? lerp(0.24, 0.26) : lerp(0.34, 0.38) },
        { datebox: { day: event(1).day, month: event(1).month, lines: [event(1).title, event(1).detail] }, group: "event-1", h: showThird ? lerp(0.24, 0.26) : lerp(0.34, 0.38) },
        ...(showThird ? [{ datebox: { day: event(2).day, month: event(2).month, lines: [event(2).title, event(2).detail] }, group: "event-2", h: lerp(0.24, 0.26) }] : []),
        { flex: true },
        { footer: [{ icon: "cake-variant-outline", label: "SVÁTEK MÁ", value: v(2, "Jana") }], h: lerp(0.12, 0.08) },
      ];
    }

    // Standard tags: 296x128, 250x122, 240x416, 210x480, etc.
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (330 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    return [
      { text: "Kalendář", h: lerp(0.075, 0.06), size: 0.05, bold: true },
      { rule: true, h: 0.02 },
      { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: lerp(0.34, 0.37) },
      { datebox: { day: event(1).day, month: event(1).month, lines: [event(1).title, event(1).detail] }, group: "event-1", h: lerp(0.34, 0.37) },
      { flex: true },
      { footer: [{ label: "SVÁTEK MÁ", value: v(2, "Jana") }], h: lerp(0.14, 0.10) },
    ];
  },
};
