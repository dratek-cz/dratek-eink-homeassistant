// INTERNAL TEMPLATE - MUST NOT SHIP IN THE PUBLIC / RETAIL RELEASE.
// See PRIVATE-NOTES.md in the repository root for the full removal checklist.
//
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
    // Read by the catalog grid and by the click handler. Nothing else in the
    // panel special-cases the id itself, so removing this template removes the
    // behaviour with it.
    broadcast: true,
    internal: true,
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
    note: "Tato šablona není určena zákazníkům – před finálním prodejním vydáním se odstraňuje podle PRIVATE-NOTES.md.",
  },
  // One row, full bleed. `pixelPerfect` is what makes _layoutTemplateSvg hand
  // the block the display's exact rectangle instead of the padded page box the
  // other templates are laid out in, so the lockup really does span the panel.
  //
  // Which lockup: the wide one on small panels, where a stacked logo would
  // leave the wordmark tiny between two bands of white, and the stacked one on
  // large panels and on anything portrait, where the wide lockup would be a
  // thin strip across the middle of an empty page.
  design: ({ width, height }) => {
    const w = width || 296;
    const h = height || 128;
    const stacked = h > w || Math.min(w, h) >= 200;
    return [{ brandLogo: { stacked }, pixelPerfect: true, h: 1 }];
  },
};
