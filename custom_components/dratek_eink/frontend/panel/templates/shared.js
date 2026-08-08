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
