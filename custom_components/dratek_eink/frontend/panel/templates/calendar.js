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
  design: ({ v, event }) => [
    { text: "Kalendář", h: 0.075, size: 0.05, bold: true },
    { rule: true, h: 0.02 },
    { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: 0.27 },
    { datebox: { day: event(1).day, month: event(1).month, lines: [event(1).title, event(1).detail] }, group: "event-1", h: 0.27 },
    { flex: true },
    { footer: [{ label: "SVÁTEK MÁ", value: v(2, "Jana") }], h: 0.14 },
  ],
};
