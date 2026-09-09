// The DRÁTEK.CZ wordmark across a whole panel, with the shop's yellow bar
// closing it on four-colour displays.
//
// The other company tile in the catalog, "Logo Drátek", is not a template
// anyone arranges - clicking it resets every display in the room at once. This
// one is ordinary: it is assigned to the display that is open and sent with the
// same button as a weather panel. Same artwork, different job - a price-tag
// shelf that should read as the shop rather than as a reset.
//
// A three-colour display prints the wordmark exactly as the broadcast does,
// black and red on white, and gets no bar: there is no yellow pigment in that
// panel, and neither a red bar (a different design) nor a dithered
// pretend-yellow (a speckle) is the same thing. See _brandLogoBandHeight.
export const template = {
  catalog: {
    id: "dratek_wordmark",
    number: "31",
    category: "custom",
    title: "DRÁTEK.CZ",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Firemní nápis DRÁTEK.CZ přes celý displej. Nepotřebuje žádnou entitu ani nastavení – šablonu stačí přiřadit displeji a odeslat.",
    integrations: [],
    steps: [
      "Vyberte displej a klikněte na tuto dlaždici.",
      "Odešlete náhled na displej běžným tlačítkem Odeslat.",
    ],
    note: "Čtyřbarevné displeje dostanou dole žlutý pruh na místě, kde mají ostatní šablony červenou patičku. Tříbarevné vytisknou samotný nápis černě a červeně na bílé.",
  },
  // Never the stacked lockup, on any panel shape. The stacked file puts a
  // drawing of an eInk module under the wordmark, and a tag showing a picture
  // of a tag is the one thing a shelf does not need - the wide file is cropped
  // to its wordmark before it is drawn (see _brandLogoWordmarkCrop), which is
  // exactly this template's subject.
  design: () => [{
    brandLogo: { stacked: false, band: "yellow" },
    pixelPerfect: true,
    h: 1,
  }],
};
