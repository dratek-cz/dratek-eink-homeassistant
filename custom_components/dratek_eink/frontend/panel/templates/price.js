// Everything about the "Cenovka" (Price tag) display template.
import { helper } from "./shared.js";

export const template = {
  catalog: {
    id: "price",
    number: "21",
    category: "shop",
    title: "Cenovka",
    options: [["sale", "Akce", "Zobrazí štítek AKCE, původní cenu přeškrtne a novou zvýrazní."]],
    variables: [
      ["tag-outline", "Název zboží"],
      ["currency-usd", "Cena"],
      ["cash-multiple", "Původní cena"],
      ["barcode", "Kód zboží"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Cenovka se jménem zboží, velkou cenou a kódem/EAN v patičce - bez QR kódu (na to slouží šablona Regálová cenovka, ne tato).",
    integrations: [
      helper("text", "Název zboží a kód zboží (EAN)."),
      helper("číslo", "Cena a - jen pokud zapnete přepínač Akce - i původní cena."),
      helper("spínač", "Nepovinné: zapíná akci (přeškrtnutou původní cenu a červený štítek AKCE) automatizací nebo z pokladního systému, místo ručního přepínání v Nastavit."),
    ],
    steps: [
      "V Nastavení → Zařízení a služby → Pomocníci vytvořte pomocníky typu text (název, kód) a číslo (cena, případně původní cena).",
      "V Nastavit je přiřaďte k jednotlivým údajům.",
      "Akci zapnete přepínačem přímo v Nastavit u šablony, nebo pomocníkem typu spínač, pokud ji chcete ovládat automatizací nebo z pokladního systému - Původní cena se zobrazí, jen když je Akce zapnutá.",
    ],
  },
  design: ({ v, option }) => {
    const isSale = option("sale");
    if (!isSale) {
      // Plain black-and-white price tag: name, large price, product code in black footer
      return [
        { band: { value: "CENOVKA", color: "black" }, bleed: true, h: 0.13 },
        { text: v(0, "Jablka Golden"), h: 0.14, size: 0.075, bold: true },
        { pricetag: {
          price: v(1, "149,-"),
          currency: "Kč",
          sale: false,
        }, h: 0.59 },
        { flex: true },
        { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], color: "black", h: 0.14 },
      ];
    }
    // Sale variant: red band, struck old price, big new price, code in red footer
    return [
      { band: { value: "AKCE", color: "red" }, bleed: true, h: 0.13 },
      { text: v(0, "Jablka Golden"), h: 0.13, size: 0.068, bold: true },
      { pricetag: {
        price: v(1, "149,-"),
        currency: "Kč",
        was: v(2, "199,- Kč"),
        sale: true,
      }, h: 0.60 },
      { flex: true },
      { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], color: "red", h: 0.14 },
    ];
  },
};
