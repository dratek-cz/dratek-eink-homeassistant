// Everything about the "Nákupní seznam" (Shopping list) display template.
//
// It used to be a picture of a shopping list: five hardcoded item names, with
// three text slots that could be pointed at input_text helpers if you wanted
// two of those names to be real. The only genuinely live thing on the page was
// the remaining-items count, because a todo.* entity's state is a number and
// its items are not in its attributes at all - they come back from the
// `todo.get_items` service, the same shape of fetch calendar.js already makes
// for `calendar.get_events`.
//
// Now it makes that fetch. One slot, "Nákupní seznam", takes the todo.* entity
// itself, and the rows below are the list: its real items, unchecked ones
// first, as many as the panel has room to print legibly.
// _blockChecklist fills its grid row by row, so three columns come out reading
// "Mléko, Chléb, Jablka" across the top. Nobody reads a shopping list that way -
// a column is a column - so the items are transposed before they go in, and the
// shared block stays exactly as every other template already knows it.
//
// Columns are filled as evenly as the list divides, longest first, which means
// the cells that end up empty are always the trailing ones of the last rows -
// so writing the transposed items out in row order lands each of them on the
// grid position it was aimed at, with no gap to skip over.
//
// render.py's `todo` slot repeats this for an automatic refresh, which is why
// the binding records `lines` as well as `columns`; tests/test_shopping_list.py
// pins the two together.
export const columnMajor = (items, lines, columns) => {
  if (columns <= 1) return items;
  const slices = [];
  let cursor = 0;
  for (let column = 0; column < columns; column += 1) {
    const size = Math.min(lines, Math.ceil((items.length - cursor) / (columns - column)));
    slices.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  const ordered = [];
  for (let line = 0; line < lines; line += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (slices[column][line]) ordered.push(slices[column][line]);
    }
  }
  return ordered;
};

export const template = {
  catalog: {
    id: "shopping",
    number: "13",
    category: "home",
    title: "Nákupní seznam",
    // The single slot is the list itself. The three text slots this replaced
    // ("Položky", "Splněné", "Počet zbývajících") were only ever a way to get
    // two real names onto a page that could not read the list; a display still
    // bound to them falls back to the sample list until the todo entity is
    // picked, which _suggestTemplateEntity does by itself on any install that
    // has one.
    variables: [
      ["format-list-checks", "Nákupní seznam"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Papírově čistý nákupní lístek: skutečné položky vašeho seznamu z Home Assistantu, nesplněné napřed, odškrtnuté přeškrtnuté.",
    integrations: [
      {
        name: "Nákupní seznam",
        domain: "todo",
        core: true,
        entityPrefixes: ["todo.shopping_list"],
        why: "Klasická vestavěná integrace Home Assistantu - po zapnutí vytvoří entitu todo.shopping_list, ze které se čtou jednotlivé položky.",
      },
      { name: "Místní úkolovník", domain: "todo", core: true, why: "Obecný seznam úkolů přímo v Home Assistantu - vhodný, pokud chcete nákupní seznam nazvat a spravovat sám. Funguje stejně, stačí ho vybrat." },
    ],
    steps: [
      "Přidejte integraci Nákupní seznam (nebo Místní úkolovník) v Nastavení → Zařízení a služby.",
      "V Nastavit vyberte u údaje Nákupní seznam svou entitu todo.* - obvykle ji Drátek najde a předvyplní sám.",
      "Odešlete šablonu do displeje a zapněte automatickou aktualizaci v kartě Automatizace; seznam se pak překresluje sám při každé změně.",
    ],
    note: "Položky se čtou službou todo.get_items. Kolik jich displej ukáže, si šablona spočítá sama z rozměrů panelu - malá cenovka zobrazí několik nejnutnějších ve sloupcích, velký panel celý seznam pod sebou. Nesplněné jsou vždy nahoře; odškrtnuté se doplní jen tam, kde na ně zbylo místo.",
  },
  design: ({ shoppingList, width, height }) => {
    const w = width || 296;
    const h = height || 128;
    // See home.js for why sqrt(area) rather than width alone.
    const t = Math.max(0, Math.min(1, (Math.sqrt(w * h) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    const list = shoppingList();
    const portrait = h > w;
    const smallLandscape = h <= 160 && w >= h;

    // Row heights first, because how many items fit is a question about the
    // checklist's own box, not about the panel.
    const layout = portrait
      ? { band: 0.13, list: 0.79, footer: 0.08 }
      : smallLandscape
        ? { band: 0.16, list: 0.74, footer: 0.10 }
        : { band: lerp(0.20, 0.24), list: lerp(0.68, 0.72), footer: lerp(0.12, 0.06) };
    const listHeight = h * layout.list;

    // A checklist line has to hold its marker, its label and the gap to the
    // next line - so this, not a fixed item count per panel size, is what
    // decides how much of the list the panel can honestly show.
    //
    // 17 is a floor with a reason, not a taste: _blockChecklist sizes the
    // checkbox at 42% of the line, and under 7 printed pixels a box cannot
    // hold an outline, a gap and a tick at once, so it drops the outline and
    // draws a filled square instead. At 16px pitch every unchecked item would
    // therefore look exactly like a checked one. 17 keeps the outline (7.14px)
    // and is the densest this list can be drawn and still be read.
    const LINE_PITCH = 17;
    const lines = Math.max(1, Math.floor(listHeight / LINE_PITCH));
    // A column narrower than this cannot hold a checkbox and a real item name
    // without ellipsising it away. _blockChecklist starts the label at
    // marker + 7 and stops 3 short of the column's right edge, so a 84px column
    // leaves about 67px of text - measured against the panel's own 10px Arial
    // that is "Toaletní papír" (63.5px) with a little to spare, and a longer
    // name than any of the sample list. Wider than this and a 250px tag is
    // stuck at two columns where three fit.
    const MIN_COLUMN_WIDTH = 84;
    const maxColumns = Math.max(1, Math.min(3, Math.floor(w / MIN_COLUMN_WIDTH)));
    // Columns follow the list, not the panel: a four-item list on a wall panel
    // stays one big legible column, and only a list too long for one column
    // splits into two or three. Splitting by panel size alone printed four
    // items as three near-empty columns of huge type.
    const columns = Math.min(maxColumns, Math.max(1, Math.ceil(list.items.length / lines)));
    const items = columnMajor(list.items.slice(0, lines * columns), lines, columns);
    // Red marks what is still missing, and only on a list short enough that
    // one red row still reads as "this one" rather than as decoration.
    const rows = items.map((item, index) => ({
      label: item.label,
      done: !!item.done,
      color: !item.done && index === 0 && items.length <= 8 ? "red" : undefined,
    }));

    const remaining = `${list.remaining}`;
    const footerValue = list.remaining
      ? `zbývá ${list.remaining} z ${list.total}`
      : list.total
        ? "vše odškrtnuto"
        : "seznam je prázdný";

    if (portrait) return [
      { band: { icon: "cart-outline", label: "NÁKUP", value: list.name, color: "black" }, bleed: true, h: layout.band },
      { checklist: rows, columns, marker: "box", strike: true, group: "shopping-list", h: layout.list },
      { footer: [{ label: "ZBÝVÁ", value: footerValue }], h: layout.footer },
    ];
    if (smallLandscape) return [
      { band: { icon: "cart-outline", label: "NÁKUP", value: list.name, color: "black" }, bleed: true, h: layout.band },
      { checklist: rows, columns, marker: "box", strike: true, compact: true, group: "shopping-list", h: layout.list },
      { footer: [{ label: "ZBÝVÁ", value: footerValue }], h: layout.footer },
    ];
    return [
      { stat: { value: remaining, caption: list.remaining === 1 ? "POLOŽKA ZBÝVÁ" : list.remaining >= 2 && list.remaining <= 4 ? "POLOŽKY ZBÝVAJÍ" : "POLOŽEK ZBÝVÁ" }, h: layout.band },
      { checklist: rows, columns, marker: "box", strike: true, group: "shopping-list", h: layout.list },
      { flex: true },
      { footer: [{ label: "NÁKUP", value: list.name }], h: layout.footer },
    ];
  },
};
