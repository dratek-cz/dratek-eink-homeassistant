// Everything about the "Logo Drátek" display template: the shop's own lockup
// printed across a whole panel, used to put every display in the room into a
// clean, identical showroom state in one click.
//
// It behaves unlike every other template in the catalog, on purpose:
// clicking its tile does not assign it to the display currently open. It wipes
// each display's automatic update and its pending queue jobs and sends the logo
// to all of them - see _broadcastBrandLogoToAllDisplays in
// panel-brand-logo.mixin.js, which owns that flow.
export const template = {
  catalog: {
    id: "dratek_logo",
    number: "30",
    category: "custom",
    title: "Logo Drátek",
    variables: [],
    // Read by the catalog grid and by the click handler.
    broadcast: true,
  },
  prepared: true,
  setup: {
    summary: "Firemní šablona. Kliknutím na dlaždici se logo Drátek pošle na všechny známé displeje najednou – u každého se předtím zruší automatická aktualizace a vyprázdní čekající fronta.",
    integrations: [],
    steps: [
      "Klikněte na dlaždici šablony a potvrďte hromadné odeslání.",
      "U každého displeje se zruší automatizace a zrušené zůstanou i čekající úlohy ve frontě.",
      "Logo se odešle na všechny displeje; nedosažitelné se zapíší, jakmile se ohlásí gatewayi.",
    ],
    note: "Hromadné odeslání se spustí až po výslovném potvrzení.",
  },
  // One row, full bleed. `pixelPerfect` is what makes _layoutTemplateSvg hand
  // the block the display's exact rectangle instead of the padded page box the
  // other templates are laid out in, so the lockup really does span the panel.
  //
  // The DRÁTEK.CZ wordmark on every panel, whatever its shape, closed on
  // four-colour displays by a yellow bar where every other template puts its
  // red footer.
  //
  // Never the stacked lockup, which large and portrait panels used to get: it
  // puts a drawing of an eInk module under the wordmark, and a tag in a
  // customer's hand showing a picture of a tag is the one thing a shelf does
  // not need. The wide artwork is cropped to its wordmark before it is drawn
  // (see _brandLogoWordmarkCrop), which is the whole subject here. On a
  // portrait panel that leaves a band above and below the type, which is a
  // layout rather than a gap.
  //
  // A three-colour display prints the same wordmark, black and red on white,
  // and gets no bar - it has no yellow pigment, and neither a red bar (a
  // different design) nor a dithered pretend-yellow (a speckle) is the same
  // thing. See _brandLogoBandHeight.
  design: () => [{
    brandLogo: { stacked: false, band: "yellow" },
    pixelPerfect: true,
    h: 1,
  }],
};
