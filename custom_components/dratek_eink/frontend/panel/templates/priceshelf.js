// Everything about the "Regálová cenovka" (Shelf price tag) display
// template. Its design and setup guide already existed in the codebase, but
// it had no catalog entry, so it never actually appeared in the template
// catalog - added here (number 24, same "shop" category as Cenovka) so this
// file is what makes it a real, selectable template.
import { helper } from "./shared.js";

export const template = {
  catalog: {
    id: "priceshelf",
    number: "24",
    category: "shop",
    title: "Regálová cenovka",
    options: [["sale", "Akce", "Zobrazí štítek AKCE, původní cenu přeškrtne a novou zvýrazní."]],
    variables: [
      ["tag-outline", "Název zboží"],
      ["currency-usd", "Cena"],
      ["barcode", "Kód zboží"],
      ["cash-multiple", "Původní cena"],
      ["scale-balance", "Jednotková cena"],
      ["package-variant", "Skladem"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Regálová cenovka s barevným pruhem nahoře, cenou uprostřed, jednotkovou cenou a skladovou zásobou pod ní - stejná stavba jako Cenovka, jen s víc údaji.",
    integrations: [
      helper("text", "Název zboží a kód zboží (EAN)."),
      helper("číslo", "Cena, jednotková cena (Kč/kg apod.) a počet kusů skladem; Původní cena jen pokud používáte Akci."),
      helper("spínač", "Nepovinné: zapíná akci automatizací nebo z pokladního systému místo ručního přepínání."),
    ],
    steps: [
      "Vytvořte pomocníky pro název, cenu, jednotkovou cenu a skladovou zásobu.",
      "V Nastavit je přiřaďte k údajům šablony.",
      "Přepínačem Akce v Nastavit zvýrazníte slevu (nebo napojte pomocníka typu spínač, aby to šlo zapnout automaticky).",
    ],
    note: "Jednotková cena (Kč/kg, Kč/l apod.) se nedopočítává sama z Ceny a váhy balení - je to samostatný údaj, který musíte buď zadat ručně, nebo si nechat dopočítat šablonovým senzorem.",
  },
  design: ({ v, option }) => [
    { band: { value: option("sale") ? "AKCE" : "CENOVKA", color: option("sale") ? "red" : "black" }, bleed: true, h: 0.14 },
    { text: v(0, "Jablka Golden"), h: 0.11, size: 0.06, bold: true },
    { pricetag: {
      price: v(1, "24,90"),
      currency: "Kč",
      unit: v(4, "49,80 Kč / kg"),
      was: v(3, "34,90 Kč"),
      sale: option("sale"),
    }, h: 0.46 },
    { rule: true, h: 0.02 },
    { list: [{ icon: "package-variant", label: "Skladem", value: v(5, "18 ks") }], h: 0.12 },
    { flex: true },
    { footer: [{ label: "KÓD", value: v(2, "8594001234567") }], color: option("sale") ? "red" : "black", h: 0.13 },
  ],
};
