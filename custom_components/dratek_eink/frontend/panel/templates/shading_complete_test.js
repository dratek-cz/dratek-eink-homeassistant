const COLORS = ["white", "black", "red", "yellow"];
const PAIRS = COLORS.flatMap((base, baseIndex) => (
  COLORS.slice(baseIndex + 1).map((ink) => ({ base, ink }))
));
const LEVELS = Array.from({ length: 17 }, (_, count) => count / 16);

export const template = {
  catalog: {
    id: "shading_complete_test",
    number: "28",
    category: "information",
    title: "Kompletní test barev",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Všech šest dvojic bílé, černé, červené a žluté v každém poměru, který lze vytvořit v mřížce 4×4 pixelů.",
    integrations: [],
    steps: ["Odešlete šablonu na BWRY displej a porovnejte všechny optické odstíny z běžné pozorovací vzdálenosti."],
    note: "Každý řádek je jedna dvojice barev. Sedmnáct sloupců obsahuje 0 až 16 pixelů druhé barvy z každých 16 pixelů.",
  },
  design: () => [{
    dither: PAIRS.flatMap(({ ink, base }) => (
      LEVELS.map((density) => ({ ink, base, density }))
    )),
    columns: 17,
    matrix: 4,
    pixelPerfect: true,
    h: 1,
  }],
};
