// The DRÁTEK.CZ wordmark printed on the shop's yellow, full bleed.
//
// The other company tile in the catalog, "Logo Drátek", is not a template
// anyone arranges - clicking it resets every display in the room at once. This
// one is an ordinary template: it is assigned to the display that is open, sent
// with the same button as a weather panel, and can sit in a slot beside
// anything else. Same artwork, different job - a price-tag shelf that should
// read as the shop rather than as a reset.
//
// The yellow is the point of it, so this template is at its best on a
// four-colour panel. On a three-colour one there is no yellow pigment at all
// and the field prints white; see _brandLogoGround for why that is a fallback
// to white rather than an attempt at yellow made out of red dots.
export const template = {
  catalog: {
    id: "dratek_yellow",
    number: "31",
    category: "custom",
    title: "DRÁTEK.CZ na žluté",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Firemní nápis DRÁTEK.CZ přes celý displej na žlutém podkladu. Nepotřebuje žádnou entitu ani nastavení – šablonu stačí přiřadit displeji a odeslat.",
    integrations: [],
    steps: [
      "Vyberte displej a klikněte na tuto dlaždici.",
      "Odešlete náhled na displej běžným tlačítkem Odeslat.",
    ],
    note: "Žlutý podklad se vytiskne jen na čtyřbarevných displejích. Tříbarevné žlutý pigment nemají a vytisknou stejný nápis na bílé.",
  },
  // Never the stacked lockup, on any panel shape. The stacked file puts a
  // drawing of an eInk module under the wordmark, and a tag showing a picture
  // of a tag is the one thing a shelf does not need - the wide file is cropped
  // to its wordmark before it is drawn (see _brandLogoWordmarkCrop), which is
  // exactly this template's subject. On a portrait panel that leaves a band of
  // yellow above and below the type, which is a layout, not a gap.
  design: () => [{
    brandLogo: { stacked: false, ground: "yellow" },
    pixelPerfect: true,
    h: 1,
  }],
};
