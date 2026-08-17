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
    const w = width || 296;
    const h = height || 128;
    const area = w * h;

    // 1. Nejmenší cenovky (např. 212x104, 196x96):
    // 1 událost s velkým rámečkem data a spodní lištou pro svátek
    if (area <= 26000) {
      return [
        { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: 0.68 },
        { flex: true },
        { footer: [{ label: "SVÁTEK", value: v(2, "Jana") }], h: 0.24 },
      ];
    }

    // 2. Velké displeje a dashboardy (400x300, 640x384, 800x480, 960x640+):
    // Karty událostí si zachovávají rozumnou výšku jako na menším displeji,
    // ale podle dostupné výšky přibývají další události (3 až 4 události)
    if (area >= 110000) {
      const eventCount = h >= 450 ? 4 : h >= 320 ? 3 : 2;
      const eventHeight = eventCount === 4 ? 0.18 : eventCount === 3 ? 0.23 : 0.32;

      return [
        { text: "Kalendář", h: 0.06, size: 0.042, bold: true },
        { rule: true, h: 0.02 },
        { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: eventHeight },
        { datebox: { day: event(1).day, month: event(1).month, lines: [event(1).title, event(1).detail] }, group: "event-1", h: eventHeight },
        ...(eventCount >= 3 ? [{ datebox: { day: event(2).day, month: event(2).month, lines: [event(2).title, event(2).detail] }, group: "event-2", h: eventHeight }] : []),
        ...(eventCount >= 4 ? [{ datebox: { day: event(3).day, month: event(3).month, lines: [event(3).title, event(3).detail] }, group: "event-3", h: eventHeight }] : []),
        { flex: true },
        { footer: [{ icon: "cake-variant-outline", label: "SVÁTEK MÁ", value: v(2, "Jana") }], h: 0.10 },
      ];
    }

    // 3. Střední a standardní štítky (296x128, 250x122, 240x416, 210x480):
    // Na výšku orientované panely pojmou 3 události, standardní 296x128 má 2 události
    const isTall = h >= 300;
    return [
      { text: "Kalendář", h: isTall ? 0.06 : 0.075, size: isTall ? 0.04 : 0.05, bold: true },
      { rule: true, h: 0.02 },
      { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: isTall ? 0.24 : 0.35 },
      { datebox: { day: event(1).day, month: event(1).month, lines: [event(1).title, event(1).detail] }, group: "event-1", h: isTall ? 0.24 : 0.35 },
      ...(isTall ? [{ datebox: { day: event(2).day, month: event(2).month, lines: [event(2).title, event(2).detail] }, group: "event-2", h: 0.24 }] : []),
      { flex: true },
      { footer: [{ label: "SVÁTEK MÁ", value: v(2, "Jana") }], h: isTall ? 0.10 : 0.14 },
    ];
  },
};
