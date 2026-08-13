// Everything about the "Wi-Fi" display template.
import { helper } from "./shared.js";

export const template = {
  catalog: {
    id: "wifi",
    number: "09",
    category: "information",
    title: "Wi-Fi",
    variables: [
      ["wifi", "Název sítě"],
      ["key-outline", "Heslo"],
    ],
  },
  prepared: false,
  setup: {
    summary: "QR kód pro připojení k Wi-Fi, název sítě a heslo pod ním - žádný živý senzor, jen dvě hodnoty, které se nastaví jednou a pak se skoro nemění.",
    integrations: [
      helper("text", "Jeden pomocník na název sítě (SSID) a druhý na heslo. Nejde o senzorová data, proto stačí obyčejný textový pomocník, ne integrace."),
    ],
    steps: [
      "V Nastavení → Zařízení a služby → Pomocníci vytvořte dva pomocníky typu text - třeba \"Wi-Fi název\" a \"Wi-Fi heslo\".",
      "Vyplňte do nich skutečný název sítě a heslo (bez uvozovek a bez zbytečných mezer na konci).",
      "V Nastavit je u šablony vyberte u údajů Název sítě a Heslo. QR kód se vygeneruje sám z obou hodnot.",
    ],
    note: "QR kód počítá s běžným zabezpečením WPA/WPA2 - pro otevřenou síť bez hesla nebo síť s WPA3 v enterprise režimu se kód nemusí naskenovat správně, i když text pod ním bude čitelný. Na malých štítcích na šířku (296 × 128) vyjde kód asi 8 mm a je na hraně čitelnosti - použijte raději štítek na výšku nebo větší.",
  },
  design: ({ v }) => [
    { text: "Wi-Fi", h: 0.075, size: 0.055, bold: true },
    // Low redundancy on purpose: it costs four modules of symbol size, and on a
    // tag this small every module is a device pixel that decides whether a phone
    // can read the code at all. The QR's own box is height-bound (its side is
    // min(box.w, box.h) rounded to whole device pixels), so a wider row does
    // nothing - only a taller one grows the code. 0.36 left the code noticeably
    // smaller than the box around it; the setup note already warns the printed
    // code is borderline readable on small tags, so this reclaims height from
    // the two text bands below (still fully readable at 0.145) instead.
    { qr: { text: `WIFI:T:WPA;S:${v(0, "Home_Network")};P:${v(1, "MyPassword123")};;`, correction: "L" }, h: 0.44 },
    { band: { label: "SÍŤ", value: v(0, "Home_Network") }, bleed: true, h: 0.145 },
    { gap: true, h: 0.02 },
    { band: { label: "HESLO", value: v(1, "MyPassword123"), color: "black" }, bleed: true, h: 0.145 },
    { flex: true },
    { footer: [{ label: "NASKENUJ", value: "a připoj se" }], h: 0.13 },
  ],
};
