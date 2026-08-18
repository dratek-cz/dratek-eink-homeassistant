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
  design: ({ v, option, width, height }) => {
    const isSale = option("sale");
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (!isSale) {
      // Plain black-and-white price tag: name, large price, product code in black footer
      return [
        // A small icon leads so the shared one-accent-per-tile auto-colour
        // (_fourColorTemplateRows) paints it yellow instead of the product
        // name text below - the identity search matches the first row with
        // an `icon` or `text` field, and the band below has neither, so
        // without this the product name (bound, potentially real data) was
        // the thing that mechanism repainted yellow and made illegible. See
        // cz_spot_prices.js for the same fix.
        { icon: "tag-outline", h: lerp(0.1, 0.07) },
        { band: { value: "CENOVKA", color: "black" }, bleed: true, h: lerp(0.12, 0.08) },
        { text: v(0, "Jablka Golden"), h: lerp(0.13, 0.11), size: 0.075, bold: true },
        { pricetag: {
          price: v(1, "149,-"),
          currency: "Kč",
          sale: false,
        }, h: lerp(0.59, 0.65) },
        { flex: true },
        { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], color: "black", h: lerp(0.14, 0.08) },
      ];
    }
    // Sale variant: red band, struck old price, big new price, code in red footer
    return [
      // Same icon-leads fix as the non-sale branch above - and here it also
      // protects the band's deliberate red "AKCE" alert colour, which the
      // auto-colour mechanism would otherwise be free to overwrite to
      // yellow if it ever became the identity row instead of the name text.
      { icon: "tag-outline", h: lerp(0.1, 0.07) },
      { band: { value: "AKCE", color: "red" }, bleed: true, h: lerp(0.12, 0.08) },
      { text: v(0, "Jablka Golden"), h: lerp(0.12, 0.1), size: 0.068, bold: true },
      { pricetag: {
        price: v(1, "149,-"),
        currency: "Kč",
        was: v(2, "199,- Kč"),
        sale: true,
      }, h: lerp(0.60, 0.66) },
      { flex: true },
      { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], color: "red", h: lerp(0.14, 0.08) },
    ];
  },
};
