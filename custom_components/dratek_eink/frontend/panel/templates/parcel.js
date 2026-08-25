// Everything about the "Zásilka" (Parcel tracking) display template.
export const template = {
  catalog: {
    id: "parcel",
    number: "17",
    category: "information",
    title: "Zásilka",
    variables: [
      ["package-variant", "Stav zásilky"],
      ["barcode", "Sledovací číslo"],
      ["map-marker-path", "Průběh dopravy"],
      ["clock-outline", "Čas doručení"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Přepravní štítek se stavem zásilky, svislou cestou balíku a samostatným doručovacím oknem.",
    integrations: [
      { name: "17TRACK", domain: "sensor", core: true, why: "Součást Home Assistantu - sleduje zásilky napříč desítkami dopravců podle sledovacího čísla, dodá senzor se stavem (Připraveno k odeslání, Na cestě, Doručeno, ...)." },
      { name: "Vlastní REST senzor u dopravce", domain: "sensor", why: "Pokud váš dopravce (např. Zásilkovna, PPL, DPD) 17TRACK nepodporuje, lze stav parsovat z jeho veřejného API vlastním REST senzorem." },
    ],
    steps: [
      "Přidejte integraci 17TRACK v Nastavení → Zařízení a služby a zadejte sledovací číslo zásilky.",
      "V Nastavit přiřaďte Stav zásilky k senzoru 17TRACK a Sledovací číslo buď ke stejnému senzoru (pokud ho vrací jako atribut), nebo pomocníku typu text.",
      "Čas doručení vyplňte, jen pokud to dopravce poskytuje jako časové okno - jinak zůstane ukázková hodnota.",
    ],
    note: "Čtyři kolečka Převzato/Depo/Rozvoz/Doručeno pod textem jsou pevná grafika - první tři vždy vypadají hotová a poslední vždy nedokončené, bez ohledu na skutečný stav zásilky. Jen prostřední popisek (výchozí \"Rozvoz\") lze přepsat na aktuální krok textem, samotné odškrtnutí se nemění.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { band: { icon: "package-variant-closed", label: v(1, "RR 458 921 730 CZ"), value: v(0, "NA CESTĚ"), color: "black" }, bleed: true, h: 0.22 },
      { steps: [
        { label: "Převzato", done: true },
        { label: "Depo", done: true },
        { label: v(2, "Rozvoz"), done: true, color: "red" },
        { label: "Doručeno" },
      ], orientation: "horizontal", h: 0.66 },
      { footer: [{ label: "DORUČENÍ", value: v(3, "13–15 h") }], h: 0.12 },
    ];
    return [
      { band: { icon: "package-variant-closed", label: v(1, "RR 458 921 730 CZ"), value: v(0, "NA CESTĚ"), color: "black" }, bleed: true, h: lerp(0.20, 0.15) },
      { steps: [
        { label: "Převzato", done: true },
        { label: "Depo", done: true },
        { label: v(2, "Rozvoz"), done: true, color: "red" },
        { label: "Doručeno" },
      ], h: lerp(0.48, 0.57) },
      { split: [
        { icon: "truck-delivery-outline", value: v(3, "13:00–15:00"), label: "OKNO DORUČENÍ", color: "red" },
        { icon: "package-variant-closed", value: "1 BALÍK", label: "ZÁSILKA" },
      ], h: lerp(0.20, 0.23) },
      { flex: true },
      { footer: [{ label: "SLEDOVÁNÍ", value: "aktualizováno dopravcem" }], h: lerp(0.14, 0.08) },
    ];
  },
};
