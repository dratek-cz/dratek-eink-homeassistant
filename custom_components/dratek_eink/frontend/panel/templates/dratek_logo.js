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
  // Which lockup depends on how much room the panel has.
  //
  // A small landscape tag gets the wide artwork cropped to the DRÁTEK.CZ
  // wordmark alone (see _brandLogoWordmarkCrop): the drawing of an eInk module
  // beside it would shrink the type to a smudge, and a tag in a customer's hand
  // showing a picture of a tag helps nobody.
  //
  // A large or portrait panel gets the stacked lockup, module and all - it has
  // the room for both, and there the product picture is the point rather than
  // an obstacle. Its screen is dithered and framed by a one-pixel outline drawn
  // after the dither, so the module keeps a sharp edge around a tone.
  //
  // Either way a four-colour display is closed by a yellow bar where every
  // other template puts its red footer. A three-colour one has no yellow
  // pigment and gets no bar: not a red one, which would be a different design,
  // and not a dithered pretend-yellow, which is a speckle. See
  // _brandLogoBandHeight.
  design: ({ width, height }) => {
    const w = width || 296;
    const h = height || 128;
    const stacked = h > w || Math.min(w, h) >= 200;
    return [{ brandLogo: { stacked, band: "yellow" }, pixelPerfect: true, h: 1 }];
  },
};
