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
    if (height <= 160 && width >= height) return [
      { split: [
        { icon: "trash-can-outline", label: "PLAST", value: v(0, "ZÍTRA"), color: "red" },
        { icon: "recycle", label: "PAPÍR", value: v(1, "za 7 dní") },
      ], h: 0.88 },
      { footer: [{ label: "TERMÍNY SVOZU", value: v(2, "út 24. 5.") }], h: 0.12 },
    ];
    return [
      { datebox: { day: "01", month: "SVOZ", lines: ["NEJBLIŽŠÍ TERMÍN", v(0, "ZÍTRA")], color: "red" }, h: lerp(0.36, 0.43) },
      { split: [
        { icon: "trash-can-outline", label: "Plast", value: v(0, "ZÍTRA"), color: "red" },
        { icon: "recycle", label: "Papír", value: v(1, "za 7 dní") },
      ], h: lerp(0.43, 0.49) },
      { flex: true },
      { footer: [{ label: "KALENDÁŘ SVOZU", value: v(2, "út 24. 5.") }], h: lerp(0.14, 0.08) },
    ];
  },
};
