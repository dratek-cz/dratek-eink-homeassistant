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
    ],
  },
  prepared: true,
  setup: {
    summary: "Aktuální teplota, stav počasí a čtyřdenní předpověď - vše z jedné entity weather.*, žádné ruční napojování jednotlivých údajů.",
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
  design: ({ v, day }) => [
    { icon: "weather-partly-cloudy", h: 0.19 },
    { stat: { value: v(0, "23"), unit: "°C", caption: v(1, "Polojasno") }, h: 0.30 },
    { text: v(3, "23. května"), h: 0.07, size: 0.045 },
    { rule: true, h: 0.02 },
    { strip: [day(0), day(1), day(2), day(3)], group: "forecast", h: 0.25 },
    { flex: true },
    { footer: [{ label: "AKTUALIZOVÁNO", value: v(2, "12:45") }], h: 0.13 },
  ],
};
