// Everything about the "Kalendář" (Calendar) display template.
export const template = {
  catalog: {
    id: "calendar",
    number: "10",
    category: "information",
    title: "Kalendář",
    variables: [
      ["calendar", "Kalendář s událostmi"],
      ["clock-outline", "Dnešní datum a den"],
      ["cake-variant-outline", "Dnes má svátek"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Nahoře dnešní datum, den v týdnu a svátek, pod tím přehledný seznam nadcházejících událostí. Na velkých displejích se automaticky uspořádá do dvou sloupců až s 20 událostmi.",
    integrations: [
      { name: "Místní kalendář", domain: "calendar", core: true, why: "Kalendář přímo v Home Assistantu, bez cloudu a bez účtu." },
      { name: "Google Calendar", domain: "calendar", core: true, why: "Napojení na Google účet; události se načtou automaticky." },
      { name: "CalDAV", domain: "calendar", core: true, why: "Pro Nextcloud, iCloud a další servery podporující CalDAV protokol." },
    ],
    steps: [
      "Přidejte kalendářovou integraci v Nastavení → Zařízení a služby.",
      "Přetáhněte šablonu na displej; kalendářová entita calendar.* se přiřadí automaticky.",
      "Dnešní den a datum se doplňují automaticky ze systému.",
      "U údaje „Dnes má svátek“ v Nastavit vyberte entitu poskytující jmeniny (nebo nechte výchozí).",
    ],
    note: "Události se čtou službou calendar.get_events na 21 dní dopředu. Aktuální/nejbližší událost je vždy vizuálně zvýrazněna červeným záhlavím data.",
  },
  design: ({ v, event, width, height }) => {
    const w = width || 296;
    const h = height || 128;
    const area = w * h;

    // České názvy dnů v týdnu a měsíců
    const now = new Date();
    const weekdays = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
    const months = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
    const todayStr = `${weekdays[now.getDay()]} ${now.getDate()}. ${months[now.getMonth()]}`;
    const namedayVal = v(2, "Jana");

    // 1. NEJMENŠÍ CENOVKY (např. 212x104, 196x96):
    if (area <= 26000) {
      return [
        // A tiny accent rule leads so the shared one-accent-per-tile auto-
        // colour (_fourColorTemplateRows) paints it yellow instead of
        // today's date below - none of this template's rows carry a
        // row-level icon/text field (every icon lives inside a split/datebox
        // cell), so without this the identity search fell back to the first
        // split row and painted its first cell's value text yellow, making
        // the date illegible. See cz_spot_prices.js for the same fix.
        { rule: true, h: 0.015 },
        { split: [
          { label: weekdays[now.getDay()].toUpperCase(), value: `${now.getDate()}. ${months[now.getMonth()]}` },
          { label: "SVÁTEK", value: namedayVal, color: "red" },
        ], card: true, color: "white", h: 0.225 },
        { rule: true, h: 0.02 },
        { datebox: { day: event(0).day, month: event(0).month, color: "red", lines: [event(0).title, event(0).detail] }, group: "event-0", h: 0.54 },
        // No footer repeating the nameday - the split row above already shows it.
        { flex: true },
      ];
    }

    // 2. VELKÉ DISPLEJE A DASHBOARDY (400x300, 640x384, 800x480, 960x640, 1360x480):
    if (area >= 110000) {
      const isWide = w / h >= 1.35;
      if (isWide && w >= 600) {
        // Skutečné 2 sloupce událostí vedle sebe (až 10-18 událostí celkem!)
        const rowsPerCol = h >= 600 ? 9 : h >= 450 ? 6 : h >= 350 ? 5 : 4;
        const totalEvents = rowsPerCol * 2;
        const rowHeight = 0.77 / rowsPerCol;

        const rows = [
          // Same accent-rule fix as the small tier above: intercepts the
          // shared auto-yellow paint before it reaches the split cells'
          // icons/values (today's date, the nameday) below.
          { rule: true, h: 0.012 },
          { split: [
            { label: "DNEŠNÍ DEN", value: todayStr },
            { label: "DNES MÁ SVÁTEK", value: namedayVal, color: "red" },
            { label: "PŘEHLED KALENDÁŘE", value: `${totalEvents} UDÁLOSTÍ` },
          ], card: true, color: "white", h: 0.128 },
          { rule: true, h: 0.02 },
        ];

        // Každý řádek obsahuje 2 události vedle sebe (levý a pravý sloupec)
        for (let r = 0; r < rowsPerCol; r++) {
          const idxLeft = r;
          const idxRight = r + rowsPerCol;
          const leftEv = event(idxLeft);
          const rightEv = event(idxRight);

          rows.push({
            splitDates: [
              {
                datebox: {
                  day: leftEv.day,
                  month: leftEv.month,
                  color: idxLeft === 0 ? "red" : "black",
                  lines: [leftEv.title, leftEv.detail],
                },
                group: `event-${idxLeft}`,
              },
              {
                datebox: {
                  day: rightEv.day,
                  month: rightEv.month,
                  color: "black",
                  lines: [rightEv.title, rightEv.detail],
                },
                group: `event-${idxRight}`,
              },
            ],
            h: rowHeight,
          });
        }

        rows.push({ flex: true });
        // Just the nearest event here - the nameday already sits in the split
        // row above, and repeating it as well as a bound value 2x on the same
        // display was never intentional.
        rows.push({
          footer: [
            { label: "NEJBLIŽŠÍ UDÁLOST", value: event(0).title || "Žádná" },
          ],
          h: 0.075,
        });
        return rows;
      }

      // Velký displej s 1 sloupcem (např. 400x300, 480x800 na výšku)
      const count = h >= 650 ? 7 : h >= 450 ? 5 : h >= 350 ? 4 : 3;
      const eventH = 0.77 / count;
      const rows = [
        // Same accent-rule fix as above: intercepts the shared auto-yellow
        // paint before it reaches the split cells' icons/values below.
        { rule: true, h: 0.012 },
        { split: [
          { label: "DNEŠNÍ DEN", value: todayStr },
          { label: "SVÁTEK MÁ", value: namedayVal, color: "red" },
        ], card: true, color: "white", h: 0.128 },
        { rule: true, h: 0.02 },
      ];
      for (let i = 0; i < count; i++) {
        const ev = event(i);
        rows.push({
          datebox: { day: ev.day, month: ev.month, color: i === 0 ? "red" : "black", lines: [ev.title, ev.detail] },
          group: `event-${i}`,
          h: eventH,
        });
      }
      // No footer repeating the nameday - the split row above already shows it.
      rows.push({ flex: true });
      return rows;
    }

    // 3. STŘEDNÍ A STANDARDNÍ ŠTÍTKY (296x128, 250x122, 240x416, 210x480):
    const isTall = h >= 250;
    const count = isTall ? 4 : 2;
    const eventH = isTall ? 0.19 : 0.34;

    const rows = [
      // Same accent-rule fix as above: intercepts the shared auto-yellow
      // paint before it reaches the split cells' date/nameday values below.
      { rule: true, h: 0.012 },
      { split: [
        { label: weekdays[now.getDay()].toUpperCase(), value: `${now.getDate()}. ${months[now.getMonth()]}` },
        { label: "SVÁTEK MÁ", value: namedayVal, color: "red" },
      ], card: true, color: "white", h: (isTall ? 0.12 : 0.18) - 0.012 },
      { rule: true, h: 0.02 },
    ];
    for (let i = 0; i < count; i++) {
      const ev = event(i);
      rows.push({
        datebox: { day: ev.day, month: ev.month, color: i === 0 ? "red" : "black", lines: [ev.title, ev.detail] },
        group: `event-${i}`,
        h: eventH,
      });
    }
    // No footer repeating the nameday - the split row above already shows it.
    rows.push({ flex: true });
    return rows;
  },
};
