// Hardware calibration card for checking palette mixing and one-pixel dithering.
// It deliberately has no entities: what appears on the panel must depend only
// on its physical pigments and the final raster/packing path.
export const template = {
  catalog: {
    id: "shading_test",
    number: "24",
    category: "information",
    title: "Test stínování",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Kalibrační karta s čistými barvami a pixelovým ditheringem. Oranžová vzniká střídáním žluté a červené, světlé a tmavé odstíny kombinací barvy s bílou nebo černou.",
    integrations: [],
    steps: [
      "Přetáhněte šablonu na displej a odešlete ji bez připojování entit.",
      "Prohlédněte pole zblízka: jemné odstíny jsou fyzicky střídané pixely, nikoli další barvy displeje.",
      "Na BWR displeji se žlutá převede na červenou; oranžové a žluté vzorky proto dávají smysl jen na BWRY panelu.",
    ],
    note: "Vzorky 25 %, 50 % a 75 % ukazují hustotu barevných pixelů v mřížce 2×2. Výsledek slouží ke kontrole panelu, balení obrazu a orientace pixelů.",
  },
  design: () => [
    {
      dither: [
        { ink: "white", base: "white", density: 1 },
        { ink: "black", base: "black", density: 1 },
        { ink: "red", base: "red", density: 1 },
        { ink: "yellow", base: "yellow", density: 1 },
        { ink: "red", base: "yellow", density: 0.5 },
        { ink: "yellow", base: "white", density: 0.5 },
        { ink: "yellow", base: "black", density: 0.5 },
        { ink: "red", base: "white", density: 0.5 },
        { ink: "red", base: "black", density: 0.5 },
        { ink: "black", base: "white", density: 0.5 },
        { ink: "red", base: "white", density: 0.25 },
        { ink: "red", base: "white", density: 0.75 },
      ],
      columns: 4,
      pixelPerfect: true,
      h: 1,
    },
  ],
};
