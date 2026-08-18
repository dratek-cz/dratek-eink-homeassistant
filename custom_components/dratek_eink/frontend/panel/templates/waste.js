// Everything about the "Odpady" (Waste collection) display template.
import { helper } from "./shared.js";

export const template = {
  catalog: {
    id: "waste",
    number: "04",
    category: "home",
    title: "Odpady",
    variables: [
      ["trash-can-outline", "První svoz"],
      ["recycle", "Druhý svoz"],
      ["calendar-clock", "Termíny svozu"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Nejbližší dva svozy odpadu a jejich druh, plus přehled dalších termínů - žádná celostátní integrace pro tohle neexistuje, řeší se buď obecní kalendář, nebo ruční termíny.",
    integrations: [
      {
        name: "Waste Collection Schedule",
        domain: "sensor",
        url: "https://github.com/mampfes/hacs_waste_collection_schedule",
        linkLabel: "GitHub a instalace",
        why: "Obecná HACS integrace s podporou desítek obcí a svozových firem (i českých) - po zadání adresy a druhu odpadu vytvoří senzory s datem nejbližšího svozu.",
      },
      helper("datum", "Pokud integrace pro vaši obec/firmu neexistuje, zadejte termíny svozu ručně - stačí je pak jednou za čas přepsat."),
    ],
    steps: [
      "Zkuste nejdřív Waste Collection Schedule - v konfiguraci vyberte poskytovatele podle své obce nebo svozové firmy.",
      "Pokud vaše obec podporovaná není, vytvořte v Nastavení → Zařízení a služby → Pomocníci dva pomocníky typu datum (První svoz, Druhý svoz) a vyplňte je ručně.",
      "V Nastavit přiřaďte První a Druhý svoz k senzorům nebo pomocníkům; Termíny svozu je volitelný přehledový text pro delší výhled.",
    ],
    note: "Integrace pro svoz odpadu je vždy vázaná na konkrétní obec nebo firmu - pokud „Nalezeno“ v tomto dialogu nesvítí, nejde o chybu šablony, ale o to, že žádná odpovídající entita zatím v Home Assistantu neexistuje.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    return [
      // A small icon leads so the shared one-accent-per-tile auto-colour
      // (_fourColorTemplateRows) paints it yellow instead of the title text
      // below - yellow letterforms are close to unreadable on this hardware,
      // a filled icon glyph reads fine (see cz_spot_prices.js for the same fix).
      { icon: "trash-can-outline", h: lerp(0.1, 0.075) },
      // No title text: "Odpady" only restated what the two collection
      // tiles right below it already are.
      { rule: true, h: 0.02 },
      { split: [
        { icon: "trash-can-outline", value: v(0, "ZÍTRA"), label: "Plast", color: "red" },
        { icon: "recycle", value: v(1, "za 7 dní"), label: "Papír" },
      ], h: lerp(0.68, 0.76) },
      { flex: true },
      { footer: [{ label: "NEJBLIŽŠÍ SVOZ", value: v(2, "út 24. 5.") }], h: lerp(0.14, 0.08) },
    ];
  },
};
