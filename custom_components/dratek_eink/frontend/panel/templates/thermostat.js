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
  design: ({ v }) => [
    { icon: "thermostat", h: 0.15 },
    { stat: { value: v(0, "21,5"), unit: "°C", caption: "aktuálně" }, h: 0.3 },
    { split: [
      { value: v(1, "22 °C"), label: "Cíl" },
      { value: v(2, "60 %"), label: "Výkon", color: "red" },
    ], h: 0.28 },
    { flex: true },
    { footer: [{ label: "DALŠÍ ZMĚNA", value: v(3, "22:00") }], h: 0.14 },
  ],
};
