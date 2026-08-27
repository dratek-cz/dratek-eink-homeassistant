// Small helper shared by every template's setup recipe: an "install this
// helper entity" integration entry, used by templates whose data has no
// natural Home Assistant sensor (a Wi-Fi password, a price tag's numbers) and
// is meant to come from an input_text/input_number/input_boolean/input_datetime
// helper the user creates by hand.
export function helper(kind, why) {
  return {
    name: `Pomocník typu ${kind}`,
    domain: kind === "text" ? "input_text" : kind === "číslo" ? "input_number" : kind === "spínač" ? "input_boolean" : "input_datetime",
    why,
    core: true,
    helper: true,
  };
}

// Which glyph pictures each vehicle transit.py classified. Kept here rather than
// in transport.js because the automation capture has to warm and record every
// one of them, not only the kinds the board happens to be showing right now -
// an automatic refresh can and does bring back a different mix.
//
// MDI has no trolleybus glyph; bus-electric is the nearest true thing (the pole
// on the roof is what a passenger actually looks for) and is a good deal clearer
// than reusing the plain bus, which would erase the distinction the whole
// classification exists to draw.
export const TRANSIT_KIND_ICONS = {
  bus: "bus",
  trolleybus: "bus-electric",
  tram: "tram",
  train: "train",
  metro: "subway-variant",
  ferry: "ferry",
  cable: "gondola",
  funicular: "gondola",
  other: "transit-connection-variant",
};
