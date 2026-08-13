const LEVELS = [0.0625, 0.125, 0.25, 0.5, 0.75, 0.9375];

export const template = {
  catalog: {
    id: "shading_dark_test",
    number: "26",
    category: "information",
    title: "Test tmavých odstínů",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Pixelové směsi červené a žluté s černou v šesti hustotách, bez textu, mezer a rámečků.",
    integrations: [],
    steps: ["Odešlete šablonu na BWRY displej a zkontrolujte tmavě červené, olivové a černožluté optické směsi."],
    note: "Horní polovina míchá červenou s černou, spodní žlutou s černou. Každé pole používá mřížku 4×4 pixelů.",
  },
  design: () => [{
    dither: [
      ...LEVELS.map((density) => ({ ink: "red", base: "black", density })),
      ...LEVELS.map((density) => ({ ink: "yellow", base: "black", density })),
    ],
    columns: 6,
    matrix: 4,
    pixelPerfect: true,
    h: 1,
  }],
};
