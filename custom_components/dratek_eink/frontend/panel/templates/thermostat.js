// Everything about the "Topení" (Thermostat) display template.
export const template = {
  catalog: {
    id: "thermostat",
    number: "15",
    category: "home",
    title: "Topení",
    variables: [
      ["thermometer", "Teplota"],
      ["thermostat", "Cílová teplota"],
      ["fire", "Výkon topení"],
      ["clock-outline", "Další změna"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Aktuální teplota velkým číslem, cílová teplota a výkon topení vedle sebe dole.",
    integrations: [
      { name: "Integrace vašeho termostatu", domain: "climate", core: true, why: "Tado, Netatmo, Zigbee hlavice (Danfoss, Eurotronic) a další dodají jednu entitu climate.* se vším potřebným - aktuální i cílovou teplotou i stavem topení." },
      { name: "Generic thermostat", domain: "climate", core: true, why: "Termostat složený z libovolného teploměru a spínače topení přímo v Home Assistantu, pokud vaše topení chytrou integraci nemá." },
    ],
    steps: [
      "Přidejte termostat a v Nastavit přiřaďte stejnou entitu climate.* k údajům Teplota i Cílová teplota - šablona si z ní sama vezme aktuální i cílovou hodnotu, nejde o dva různé senzory.",
      "Výkon topení lze napojit buď na tutéž climate.* entitu (zobrazí se Topí/Klid/Vypnuto podle skutečné činnosti), nebo na samostatný senzor v procentech, pokud ho váš termostat nabízí (např. poloha ventilu).",
      "Další změna je volitelná - vyplňte, jen pokud máte plánovač nebo harmonogram, který příští změnu teploty poskytuje jako čas.",
    ],
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { dial: { percent: 54, value: v(0, "21,5 °C"), caption: "NYNÍ", min: "15°", max: "28°" }, h: 0.70 },
      { split: [
        { icon: "thermostat", label: "CÍL", value: v(1, "22 °C"), color: "red" },
        { icon: "fire", label: "VÝKON", value: v(2, "60 %") },
      ], h: 0.18 },
      { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: 0.12 },
    ];
    return [
      { dial: { percent: 54, value: v(0, "21,5 °C"), caption: "AKTUÁLNĚ", min: "15°", max: "28°" }, h: lerp(0.48, 0.55) },
      { strip: [
        { icon: "thermostat", label: "CÍL", value: v(1, "22 °C") },
        { icon: "fire", label: "VÝKON", value: v(2, "60 %"), color: "red" },
      ], h: lerp(0.34, 0.38) },
      { flex: true },
      { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: lerp(0.14, 0.07) },
    ];
  },
};
