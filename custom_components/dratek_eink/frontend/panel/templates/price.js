// Everything about the "Cenovka" (Price tag) display template.

export const template = {
  catalog: {
    id: "price",
    number: "21",
    category: "shop",
    title: "Cenovka",
    manualValues: true,
    options: [["sale", "Akce", "Zobrazí štítek AKCE, původní cenu přeškrtne, novou vysází červeně a doplní slevu v procentech."]],
    // POŘADÍ JE TRVALÉ. Klíč vazby je odvozený z indexu a popisku (viz
    // _templateVariableMeta), takže vložení proměnné doprostřed přepíše vazby
    // všech následujících na už nasazených displejích. Nové proměnné patří na
    // konec; přejmenování popisku je stejně destruktivní jako přeskládání.
    variables: [
      ["tag-outline", "Název zboží"],
      ["currency-usd", "Cena"],
      ["cash-multiple", "Původní cena"],
      ["barcode", "Kód zboží"],
      ["weight", "Množství balení"],
      ["scale-balance", "Měrná cena"],
      ["earth", "Země původu"],
      ["medal-outline", "Třída jakosti"],
      ["calendar-range", "Platnost akce"],
      ["chart-timeline-variant", "Nejnižší cena za 30 dní"],
      ["card-account-details-outline", "Klubová cena"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Regálová cenovka v podobě, jakou používají obchody: název zboží, velká cena, měrná cena za kilo nebo litr, akční sleva v procentech a skutečný čárový kód. Všechno lze napsat ručně, nebo napojit na entity Home Assistantu.",
    integrations: [],
    steps: [
      "V Nastavit napište název zboží, cenu a kód/EAN do polí Ruční hodnota. To je minimum, se kterým cenovka dává smysl.",
      "Do Množství balení napište obsah balení včetně jednotky – „1 kg“, „0,75 l“, „500 g“, „6 ks“. Měrná cena za kilo, litr nebo kus se z ceny dopočítá sama; políčko Měrná cena vyplňte jen tehdy, když ji chcete uvést jinak.",
      "Kód se vykreslí jako skutečný čárový kód. Třináct nebo dvanáct číslic dá EAN-13, sedm nebo osm EAN-8, cokoli s písmeny se zakóduje jako Code 128.",
      "U ovoce, zeleniny a masa doplňte Zemi původu a Třídu jakosti – na regálové cenovce je obojí povinné a vytiskne se do horního pruhu vedle názvu.",
      "Akci zapnete tlačítkem AKCE / SLEVA přímo na kartě displeje. Vyplňte k ní Původní cenu, Platnost akce a Nejnižší cenu za 30 dní: sleva se z obou cen dopočítá a údaj o nejnižší ceně za posledních třicet dní musí u zlevněného zboží být uvedený.",
      "Klubová cena je nepovinná. Když ji vyplníte, přibude vedle běžné ceny orámované pole s cenou pro držitele věrnostní karty.",
    ],
  },
  // Rozvržení je stejné ve všech velikostech i v obou stavech: pruh s názvem
  // zboží a jeho původem, cena přes celý zbytek štítku, čárový kód dole.
  //
  // Řádky pod cenou mají pevné pořadí podle toho, jak je zákazník čte a co
  // z nich musí být na cenovce ze zákona: měrná cena hned pod cenou (podle ní
  // se srovnává zboží mezi sebou), pak drobným písmem platnost akce a nejnižší
  // cena za posledních třicet dní. Když políčka nejsou vyplněná, řádky prostě
  // nejsou - cenovka se nesmí roztáhnout kvůli údajům, které nikdo nezadal.
  design: ({ v, option, width, height }) => {
    const isSale = option("sale");
    const w = width || 296;
    const h = height || 128;
    const text = (index, fallback = "") => String(v(index, fallback) || "").trim();
    const code = text(3, "8594001234561");
    // Žádné vzorové hodnoty u nepovinných polí. Původ, jakost i množství jsou
    // tvrzení o konkrétním zboží - vzor „I. jakost · ČR“, který by se objevil
    // sám od sebe, by na regál pověsil údaj, který nikdo nezadal a který u
    // spousty zboží ani neplatí. Prázdné pole tedy znamená prázdný řádek.
    const amount = text(4);
    const price = text(1, "149,90");
    const origin = text(6);
    const grade = text(7);
    // Množství a měrná cena jsou jeden řádek: „1 kg · 149,90 Kč/kg“. Měrná cena
    // se dopočítá z ceny a množství, ruční hodnota ji přebije.
    const unitLine = [amount, text(5)].filter(Boolean).join(" · ");
    // Drobný text pod cenou nese jen to, co u akce musí být uvedeno.
    const notes = isSale
      ? [text(8) && `Akce ${text(8)}`, text(9) && `Nejnižší cena za 30 dní ${text(9)}`].filter(Boolean).join(" · ")
      : "";
    const portrait = h > w * 1.15;
    const codeBand = Math.min(Math.max(22, h * (portrait ? 0.3 : 0.22)), h * 0.36);
    const bandRatio = h <= 160 ? 0.17 : 0.15;
    const banner = {
      icon: "tag-outline",
      label: isSale ? "AKCE" : "CENA",
      // Původ a jakost patří k názvu zboží, ne pod cenu: zákazník je čte
      // zároveň s tím, co drží v ruce.
      value: [text(0, "JABLKA GOLDEN"), [grade, origin].filter(Boolean).join(" · ")].filter(Boolean).join("  ·  "),
      color: isSale ? "red" : "black",
    };
    const tag = {
      price,
      currency: "Kč",
      was: isSale ? text(2, "199,90") : undefined,
      sale: isSale,
      unit: unitLine,
      amount,
      note: notes,
      club: text(10),
    };
    if (code && h >= 96) {
      return [
        { band: banner, bleed: true, h: bandRatio },
        { pricetag: tag, h: 1 - bandRatio - codeBand / h },
        { barcode: { value: code, text: true }, h: codeBand / h },
      ];
    }
    if (!code) {
      return [
        { band: banner, bleed: true, h: bandRatio },
        { pricetag: tag, h: 1 - bandRatio },
      ];
    }
    // Na nízkém štítku by z čárového kódu zbylo pár čar bez čitelných číslic,
    // takže jde kód aspoň jako text - tutéž informaci přečte člověk místo
    // skeneru, což je pořád lepší než nesnímatelný symbol.
    return [
      { band: banner, bleed: true, h: bandRatio },
      { pricetag: tag, h: 1 - bandRatio - 0.13 },
      { footer: [{ label: "KÓD / EAN", value: code }], h: 0.13 },
    ];
  },
};
