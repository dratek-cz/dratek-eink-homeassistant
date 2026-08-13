const LEVELS = [0, 0.0625, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.9375, 1];

export const template = {
  catalog: {
    id: "shading_warm_test",
    number: "27",
    category: "information",
    title: "Test teplých barev",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Souvislý pixelový přechod od žluté přes optickou oranžovou až k červené, bez jakéhokoli textu.",
    integrations: [],
    steps: ["Odešlete šablonu na BWRY displej a vyberte poměr žluté a červené, který z požadované vzdálenosti působí nejvíce oranžově."],
    note: "Jedenáct pruhů používá od 0 do 100 % červených pixelů na žlutém podkladu v mřížce 4×4.",
  },
  design: () => [{
    dither: LEVELS.map((density) => ({ ink: "red", base: "yellow", density })),
    columns: 11,
    matrix: 4,
    pixelPerfect: true,
    h: 1,
  }],
};
