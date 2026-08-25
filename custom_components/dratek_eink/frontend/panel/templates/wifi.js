// Everything about the "Wi-Fi" display template.

export const template = {
  catalog: {
    id: "wifi",
    number: "09",
    category: "information",
    title: "Wi-Fi",
    manualValues: true,
    variables: [
      ["wifi", "Název sítě"],
      ["key-outline", "Heslo"],
    ],
  },
  prepared: true,
  setup: {
    summary: "Velký skenovatelný QR kód vytvořený přímo ze zadaného názvu sítě a hesla; obě hodnoty lze případně napojit i na entity Home Assistantu.",
    integrations: [],
    steps: [
      "V Nastavit napište skutečný název sítě a heslo přímo do polí Ruční hodnota (bez uvozovek a mezer na konci).",
      "QR kód se z obou hodnot vygeneruje automaticky.",
      "Chcete-li údaje měnit automatizací, nechte ruční pole prázdné a vyberte místo nich entity nebo textové pomocníky Home Assistantu.",
    ],
    note: "QR kód počítá s běžným zabezpečením WPA/WPA2 - pro otevřenou síť bez hesla nebo síť s WPA3 v enterprise režimu se kód nemusí naskenovat správně, i když text pod ním bude čitelný. Na malých štítcích na šířku (296 × 128) vyjde kód asi 8 mm a je na hraně čitelnosti - použijte raději štítek na výšku nebo větší.",
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    if (height <= 160 && width >= height) return [
      { qr: { text: `WIFI:T:WPA;S:${v(0, "Home_Network")};P:${v(1, "MyPassword123")};;`, correction: "L" }, h: 0.92 },
      { footer: [{ label: v(0, "Home_Network"), value: v(1, "MyPassword123") }], h: 0.08 },
    ];
    return [
      { qr: { text: `WIFI:T:WPA;S:${v(0, "Home_Network")};P:${v(1, "MyPassword123")};;`, correction: "L" }, h: lerp(0.58, 0.66) },
      { split: [
        { icon: "wifi", label: "SÍŤ", value: v(0, "Home_Network"), color: "red" },
        { icon: "key-outline", label: "HESLO", value: v(1, "MyPassword123") },
      ], h: lerp(0.27, 0.29) },
      { flex: true },
      { footer: [{ label: "NASKENUJ", value: "a připoj se" }], h: lerp(0.13, 0.07) },
    ];
  },
};
