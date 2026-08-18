// Everything about the "Počasí" (Weather) display template: its catalog
// entry, its Home Assistant setup guide, and the SVG row layout it draws.
export const template = {
  catalog: {
    id: "weather",
    number: "01",
    category: "nature",
    title: "Počasí",
    variables: [
      ["thermometer", "Teplota"],
      ["weather-partly-cloudy", "Stav počasí"],
      ["clock-outline", "Čas"],
      ["calendar-outline", "Datum"],
      ["weather-rainy", "Předpověď"],
      ["water-percent", "Vlhkost"],
      ["fan", "Vítr"],
      ["gauge", "Tlak"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Aktuální teplota, stav počasí a vícedenní předpověď (počet dnů se přizpůsobí velikosti displeje) - vše z jedné entity weather.*, žádné ruční napojování jednotlivých údajů. Na dostatečně širokém displeji navíc přibude vlhkost, vítr a tlak.",
    integrations: [
      { name: "Met.no", domain: "weather", core: true, why: "Dodá entitu weather.* s předpovědí zdarma a bez API klíče. V Home Assistantu bývá už po instalaci - je to výchozí zdroj předpovědi pro nově založenou lokaci." },
      { name: "OpenWeatherMap", domain: "weather", core: true, why: "Alternativa, pokud chcete jiný zdroj předpovědi nebo přesnější lokální data; vyžaduje zdarma dostupný API klíč od OpenWeatherMap." },
      { name: "AccuWeather", domain: "weather", core: true, why: "Další alternativa s vlastním API klíčem, obvykle přesnější pro delší předpověď." },
    ],
    steps: [
      "Zkontrolujte, že v Nastavení → Zařízení a služby máte nějakou integraci počasí (Met.no je tam u čerstvé instalace Home Assistantu skoro vždy).",
      "Přetáhněte šablonu na náhled displeje; entita weather.* se najde sama - teplota i stav počasí se berou ze stejné entity, není potřeba nic napojovat zvlášť.",
      "Předpověď se načítá službou weather.get_forecasts s typem „daily“ – integrace ji musí podporovat, jinak zůstanou ukázkové dny místo skutečné předpovědi.",
      "Máte-li entit weather.* víc (např. domácí i chatu), zkontrolujte v Nastavit u údaje Teplota, že je vybraná ta správná - šablona bez zásahu vezme první nalezenou.",
    ],
    note: "Čas a datum si šablona doplňuje sama z hodin Home Assistantu - nejsou to údaje z počasí, takže se nedají přepojit na jinou entitu.",
  },
  design: ({ v, day, conditionIcon, width, height }) => {
    // Panels wide enough for LANDSCAPE_ASPECT (panel-template-svg.mixin.js)
    // to kick in render this template as two side-by-side columns, so the
    // forecast strip only ever gets roughly half the panel's own width, not
    // all of it - sizing the strip off the full `width` overestimated how
    // much room each day's card actually had (many thin days, tiny icons on
    // exactly the panels this was meant to make bigger). `columnWidth` is
    // the real budget the strip renders into either way.
    const twoColumn = width && height && width / height >= 1.35;
    const columnWidth = twoColumn ? width / 2 : width;

    // A fixed 4-day strip either wastes most of a wide wall panel's width
    // (four cards stretched thin with empty space around each one) or
    // crowds a small badge - neither is what a manual send on that specific
    // panel would look like. A flat px-per-day budget kept missing the full
    // week in practice: weather is rarely the only template on a big panel -
    // sharing a grid with five others (the default big-panel demo layout,
    // for one) leaves its own slot only ~267px wide, well short of what even
    // a modest per-day budget needs for 7 cells. These steps are calibrated
    // off that real shared-grid width, not an idealized full-panel one, so
    // "big enough to share a six-up grid" already reads as the full week;
    // only a genuinely small standalone badge (well under 300px) trims it.
    const dayCount = !columnWidth ? 4
      : columnWidth < 100 ? 3
      : columnWidth < 150 ? 4
      : columnWidth < 200 ? 5
      : columnWidth < 250 ? 6
      : 7;

    // Row heights are fractions of the panel's own height, so a panel that is
    // wide but no taller (800x480 vs. 1360x480 are the same height) drew the
    // exact same icon and temperature size on both - only the day count above
    // changed. `t` ramps from 0 at the narrowest column this catalog actually
    // renders into (150px) to 1 at the widest (700px, roughly half of the
    // 1360-wide panel); the icon, temperature and forecast rows grow along
    // it, and the footer and date line shrink to pay for that growth - they
    // are supporting information, not the thing someone glances at the
    // display to read, and stay well above the panel's own readability floor
    // even smaller.
    const t = columnWidth ? Math.max(0, Math.min(1, (columnWidth - 150) / (700 - 150))) : 0;
    const lerp = (from, to) => from + (to - from) * t;

    // A small badge has no room to spare - every pixel already goes to the
    // temperature and the forecast it was dragged onto the display to show.
    // A wide wall panel is the opposite problem: past a full week of
    // forecast cards it still has height left in the `flex` row below doing
    // nothing. These three cells fill that growing gap with more of what a
    // weather.* entity already carries (humidity, wind, pressure) instead of
    // leaving it blank - each one switching on at a wider columnWidth than
    // the last, so a mid-size panel gains a fact or two rather than all
    // three arriving in a single jump.
    const detailCells = [];
    if (columnWidth >= 260) detailCells.push({ icon: "water-percent", label: "VLHKOST", value: v(5, "46 %") });
    if (columnWidth >= 380) detailCells.push({ icon: "fan", label: "VÍTR", value: v(6, "12 km/h") });
    if (columnWidth >= 500) detailCells.push({ icon: "gauge", label: "TLAK", value: v(7, "1013 hPa") });

    return [
      // Ikonový řádek sedí na stejné výšce (0.15) jako u home/living/security/
      // thermostat/parcel/birthdays - dřívějších 0.19 nechávalo nahoře pruh
      // prázdna, který nikde jinde v katalogu není.
      // conditionIcon() čte skutečný stav weather.* entity (stejné jako v(1)
      // "Stav počasí") - dřív tu byl natvrdo "weather-partly-cloudy", takže
      // ikona nikdy neodpovídala aktuálnímu předpovědnímu stavu.
      { icon: conditionIcon("weather-partly-cloudy"), h: lerp(0.15, 0.22) },
      // No separate `unit` field here on purpose: a weather.* entity's own
      // "Teplota" already comes back with "°C" baked into the value itself
      // (_templateDisplayValue client-side, automation.py's _state_value on
      // an automatic refresh) - a second literal unit field used to draw a
      // static "°C" beside it that automatic refresh's marker substitution
      // never re-deduped against, so every live update showed "25 °C°C".
      { stat: { value: v(0, "23°C"), caption: v(1, "Polojasno") }, h: lerp(0.30, 0.32) },
      { text: v(3, "23. května"), h: lerp(0.07, 0.035), size: 0.045 },
      { rule: true, h: 0.02 },
      { strip: Array.from({ length: dayCount }, (_, i) => day(i)), group: "forecast", h: lerp(0.29, 0.375) },
      // valueIcon: icon sits beside the number instead of stacked above it -
      // roughly double the size, and reads far less cramped for three dense
      // facts (vlhkost/vítr/tlak) sharing one row. This strip is never a live
      // automation binding (see the detailCells comment above), so there is
      // no backend svg_blocks.py counterpart that needs to mirror it.
      ...(detailCells.length ? [{ rule: true, h: 0.02 }, { strip: detailCells, valueIcon: true, h: lerp(0.16, 0.22) }] : []),
      { flex: true },
      { footer: [{ label: "AKTUALIZOVÁNO", value: v(2, "12:45") }], h: lerp(0.13, 0.03) },
    ];
  },
};
