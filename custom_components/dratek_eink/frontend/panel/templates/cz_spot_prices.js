// Everything about the "České spotové ceny" (Czech spot electricity prices)
// display template - the only built-in template with its own auto-binding
// logic (see _czSpotTemplateBindings in panel-devices.mixin.js), because it
// targets one specific community integration closely enough to name its
// exact entity ids instead of guessing from device_class alone.
export const template = {
  catalog: {
    id: "cz_spot_prices",
    number: "22",
    category: "energy",
    title: "České spotové ceny",
    variables: [
      ["currency-usd", "Aktuální cena"],
      ["chart-line", "Cenový průběh dnes"],
      ["tray-arrow-down", "Minimum dnes"],
      ["arrow-up-down", "Maximum dnes"],
      ["weather-sunny", "Minimum zítra"],
      ["counter", "Aktuální pořadí"],
    ],
  },
  prepared: true,
  setup: {
    summary: "České spotové ceny elektřiny z integrace Czech Energy Spot Prices podle dat OTE. Šablona automaticky načte aktuální cenu, celý denní průběh, minimum, maximum, cenu na zítřek a pořadí aktuálního intervalu.",
    integrations: [
      {
        name: "Czech Energy Spot Prices",
        domain: "sensor",
        entityPrefixes: ["sensor.current_buy_electricity_price", "sensor.current_spot_electricity_price", "sensor.aktualni_spotova_cena_elektriny"],
        entityFriendlyNames: [
          "Aktuální spotová cena elektřiny",
          "Dnešní nejdražší spotová cena elektřiny",
          "Dnešní nejlevnější spotová cena elektřiny",
          "Dnešní pořadí hodin spotových cen elektřiny",
          "K dispozici zítřejší spotové ceny elektřiny",
          "Zítřejší nejdražší spotová cena elektřiny",
          "Zítřejší nejlevnější spotová cena elektřiny",
          "Zítřejší pořadí hodin spotových cen elektřiny",
        ],
        url: "https://github.com/rnovacek/homeassistant_cz_energy_spot_prices",
        linkLabel: "GitHub a instalace",
        why: "Komunitní integrace pro ceny elektřiny z OTE. Podporuje hodinové i 15minutové ceny a volitelnou skutečnou nákupní cenu včetně poplatků a DPH.",
      },
    ],
    steps: [
      "V HACS otevřete Integrace, vyhledejte Czech Energy Spot Prices a integraci nainstalujte. Potom restartujte Home Assistant.",
      "V Nastavení → Zařízení a služby → Přidat integraci vyberte Czech Energy Spot Prices.",
      "Zvolte elektřinu, měnu CZK, jednotku kWh a hodinový nebo 15minutový interval.",
      "Chcete-li zobrazovat skutečnou nákupní cenu, otevřete u integrace Konfigurovat a vyplňte šablonu nákupní ceny včetně distribuce, poplatků a DPH.",
      "Otevřete tuto šablonu znovu. Senzory se přiřadí automaticky; pokud máte více instancí integrace, můžete zdroje ručně změnit v Upravit data.",
    ],
    note: "Šablona preferuje nákupní cenu, pokud je v integraci nakonfigurovaná. Jinak použije základní spotovou cenu. Při současné hodinové a 15minutové instanci preferuje podrobnější 15minutová data.",
  },
  design: ({ v, series }) => {
    const prices = series(1, [1.62, 1.48, 1.36, 1.29, 1.34, 1.51, 1.88, 2.24, 2.06, 1.72, 1.38, 1.12, 0.86, 0.94, 1.08, 1.42, 1.96, 2.58, 2.74, 2.39, 2.05, 1.84, 1.71, 1.63]);
    const labels = prices.map((_price, index) => {
      const hour = Math.round((index * 24) / prices.length);
      return [0, 6, 12, 18].includes(hour) && index === Math.round((hour * prices.length) / 24) ? String(hour) : "";
    });
    const now = new Date();
    const highlight = Math.min(prices.length - 1, Math.floor((now.getHours() * 60 + now.getMinutes()) * prices.length / 1440));
    return [
      { text: "České spotové ceny", h: 0.075, size: 0.048, bold: true },
      { stat: { value: v(0, "2,45 Kč/kWh"), caption: "aktuální interval", color: "red" }, h: 0.22 },
      { bars: { values: prices, labels, highlight }, group: "chart", h: 0.36 },
      { strip: [
        { label: "MIN", value: v(2, "0,86 Kč") },
        { label: "MAX", value: v(3, "2,74 Kč"), color: "red" },
        { label: "POŘADÍ", value: v(5, "12 / 24") },
      ], h: 0.16 },
      { flex: true },
      { footer: [{ label: "ZÍTRA MIN", value: v(4, "1,02 Kč") }], h: 0.13 },
    ];
  },
};
