// Everything about the "Topení" (Thermostat) display template.
//
// The dial used to be `percent: 0.5` and its scale ends the literal strings
// "15°" and "28°": a drawing of a gauge, half full whatever the room was doing,
// over a range no thermostat had been asked about. The numbers now come off the
// bound entity - the fill is where the room sits inside the thermostat's own
// min_temp/max_temp span - and the page carries the one thing a heating display
// is actually asked twice a day: whether it is getting warmer or colder.
//
// That curve is the last twelve hours from the recorder. A climate.* entity has
// no history in its attributes for `series()` to read (see
// _templateHistorySeries) - one number for right now is all it publishes.
export const template = {
  catalog: {
    id: "thermostat",
    number: "15",
    category: "home",
    title: "Topení",
    variables: [
      ["thermometer", "Teplota"],
      ["thermostat", "Cílová teplota"],
      ["fire", "Výkon topení"],
      ["clock-outline", "Další změna"],
    ],
  },
  prepared: true,
  // Which variable feeds the dial, and how its fill is worked out. `thermostat`
  // is what tells the backend to read current_temperature and scale it between
  // min_temp and max_temp - a climate entity's own state is "heat"/"off", so
  // the plain numeric path every other gauge uses would resolve it to zero and
  // print an empty dial on every automatic refresh.
  automation: {
    ratio: [{ variableIndex: 0, source: "thermostat" }],
    history: { variableIndex: 0, hours: 12, points: 24 },
  },
  setup: {
    summary: "Aktuální teplota velkým číslem na půlkruhovém budíku, pod ním křivka posledních dvanácti hodin a cílová teplota s výkonem topení.",
    integrations: [
      { name: "Integrace vašeho termostatu", domain: "climate", core: true, why: "Tado, Netatmo, Zigbee hlavice (Danfoss, Eurotronic) a další dodají jednu entitu climate.* se vším potřebným - aktuální i cílovou teplotou, rozsahem i stavem topení." },
      { name: "Generic thermostat", domain: "climate", core: true, why: "Termostat složený z libovolného teploměru a spínače topení přímo v Home Assistantu, pokud vaše topení chytrou integraci nemá." },
      { name: "Recorder", domain: "recorder", core: true, why: "Vestavěná databáze historie Home Assistantu. Bez ní se nakreslí ukázková křivka - budík i všechna čísla fungují dál." },
    ],
    steps: [
      "Přidejte termostat a v Nastavit přiřaďte stejnou entitu climate.* k údajům Teplota i Cílová teplota - šablona si z ní sama vezme aktuální i cílovou hodnotu, nejde o dva různé senzory.",
      "Výkon topení lze napojit buď na tutéž climate.* entitu (zobrazí se Topí/Klid/Vypnuto podle skutečné činnosti), nebo na samostatný senzor v procentech, pokud ho váš termostat nabízí (např. poloha ventilu).",
      "Další změna je volitelná - vyplňte, jen pokud máte plánovač nebo harmonogram, který příští změnu teploty poskytuje jako čas.",
    ],
    note: "Stupnice budíku není pevná - bere se z rozsahu, na který lze váš termostat nastavit (min_temp a max_temp). U hlavice s rozsahem 7-35 °C je tedy budík hrubší než u termostatu s rozsahem 15-25 °C; čísla po stranách vždy říkají, jaká stupnice se právě kreslí. Křivku dodává Recorder - pokud je entita z historie vyloučená, zůstane ukázková.",
  },
  design: ({ v, thermostat, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    const room = thermostat();
    // A plausible twelve hours of a room warming through the evening, so the
    // template reads as itself before a recorder answers - and so the row is
    // never an empty rectangle, which is what _blockSpark draws for fewer than
    // two points.
    const sample = [19.4, 19.2, 19.1, 19.3, 19.8, 20.4, 20.9, 21.2, 21.4, 21.5, 21.6, 21.5];
    const curve = Array.isArray(room.history) && room.history.length > 1 ? room.history : sample;
    const dial = {
      percent: room.percent,
      value: v(0, "21,5 °C"),
      min: room.minLabel || "15°",
      max: room.maxLabel || "28°",
    };

    if (height <= 160 && width >= height) return [
      // The dial keeps its scale ends inside its own row now (see _blockDial),
      // so the pair below only has to clear the arc rather than the type
      // hanging under it.
      { dial: { ...dial, caption: "NYNÍ" }, group: "ratio", h: 0.58 },
      // 0.30 rather than 0.26 puts this row over _blockSplit's 38 px
      // single-line threshold on a 128 px tag, so the pair reads as two
      // captioned facts instead of as one run-on line.
      { split: [
        { label: "CÍL", value: v(1, "22 °C") },
        { label: "VÝKON", value: v(2, "60 %") },
      ], h: 0.30 },
      { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: 0.12 },
    ];
    return [
      { dial: { ...dial, caption: "AKTUÁLNĚ" }, group: "ratio", h: lerp(0.36, 0.40) },
      // The curve is the point of the page on anything with room for it: a
      // number says how warm it is, a line says whether the heating is winning.
      { spark: { values: curve, caption: "TEPLOTA / 12 H" }, group: "chart", h: lerp(0.26, 0.28) },
      // Stacked rows sit flush against each other, so the chart's own baseline
      // would otherwise be the line the labels below it stand on.
      { gap: true, h: 0.02 },
      // Without icons. The mdi "thermostat" glyph is a filled dial that prints
      // as a dark blob at this size and the "fire" one was the third red thing
      // on a page whose red is supposed to be the status bar; neither adds
      // anything the word above it does not already say.
      { strip: [
        { label: "CÍL", value: v(1, "22 °C") },
        { label: "VÝKON", value: v(2, "60 %") },
      ], h: lerp(0.20, 0.22) },
      { flex: true },
      { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: lerp(0.14, 0.07) },
    ];
  },
};
