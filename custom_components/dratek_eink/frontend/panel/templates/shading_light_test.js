const LEVELS = [0.0625, 0.125, 0.25, 0.5, 0.75, 0.9375];

export const template = {
  catalog: {
    id: "shading_light_test",
    number: "25",
    category: "information",
    title: "Test světlých odstínů",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Pixelové směsi červené a žluté s bílou v šesti hustotách. Na displeji nejsou žádné popisky ani grafické prvky.",
    integrations: [],
    steps: ["Odešlete šablonu na BWRY displej a porovnejte, jak jednotlivé hustoty splývají z běžné pozorovací vzdálenosti."],
    note: "Horní polovina míchá červenou s bílou, spodní žlutou s bílou. Každé pole používá mřížku 4×4 pixelů.",
  },
  design: () => [{
    dither: [
      ...LEVELS.map((density) => ({ ink: "red", base: "white", density })),
      ...LEVELS.map((density) => ({ ink: "yellow", base: "white", density })),
    ],
    columns: 6,
    matrix: 4,
    pixelPerfect: true,
    h: 1,
  }],
};
