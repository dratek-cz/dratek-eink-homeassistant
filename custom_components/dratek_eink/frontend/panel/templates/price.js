// Everything about the "Cenovka" (Price tag) display template.

export const template = {
  catalog: {
    id: "price",
    number: "21",
    category: "shop",
    title: "Cenovka",
    manualValues: true,
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
    summary: "Cenovka se jménem zboží, velkou cenou a kódem/EAN v patičce. Název, cenu i kód můžete přímo napsat, nebo je napojit na entity Home Assistantu.",
    integrations: [],
    steps: [
      "V Nastavit napište přímo název zboží, cenu a kód/EAN do polí Ruční hodnota.",
      "Pokud se mají údaje měnit automaticky, nechte příslušné ruční pole prázdné a místo něj vyberte entitu nebo pomocníka Home Assistantu.",
      "Akci zapnete přepínačem přímo v Nastavit u šablony. Původní cena se zobrazí jen tehdy, když je Akce zapnutá.",
    ],
  },
  design: ({ v, option, width, height }) => {
    const isSale = option("sale");
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { band: { label: isSale ? "AKCE" : "CENOVKA", value: v(0, "JABLKA GOLDEN"), color: isSale ? "red" : "black" }, bleed: true, h: 0.16 },
      { pricetag: {
        price: v(1, "149,-"),
        currency: "Kč",
        was: isSale ? v(2, "199,- Kč") : undefined,
        sale: isSale,
      }, h: 0.72 },
      { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], h: 0.12 },
    ];
    if (!isSale) {
      return [
        { band: { label: "REGÁL", value: v(0, "JABLKA GOLDEN"), color: "black" }, bleed: true, h: lerp(0.20, 0.15) },
        { pricetag: {
          price: v(1, "149,-"),
          currency: "Kč",
          sale: false,
        }, h: lerp(0.68, 0.77) },
        { flex: true },
        { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], h: lerp(0.14, 0.08) },
      ];
    }
    // Sale variant: red band, struck old price, big new price, code in red footer
    return [
      { band: { label: "AKCE", value: v(0, "JABLKA GOLDEN"), color: "red" }, bleed: true, h: lerp(0.20, 0.15) },
      { pricetag: {
        price: v(1, "149,-"),
        currency: "Kč",
        was: v(2, "199,- Kč"),
        sale: true,
      }, h: lerp(0.68, 0.77) },
      { flex: true },
      { footer: [{ label: "KÓD / EAN", value: v(3, "8594001234567") }], h: lerp(0.14, 0.08) },
    ];
  },
};
