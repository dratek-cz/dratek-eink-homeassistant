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
    note: "QR kód počítá s běžným zabezpečením WPA/WPA2 - pro otevřenou síť bez hesla nebo síť s WPA3 v enterprise režimu se kód nemusí naskenovat správně, i když text pod ním bude čitelný. Název sítě i heslo mají každý vlastní řádek a písmo se zmenšuje tak, aby se vešly celé: do 31 znaků se vejdou i na nejmenší cenovku, delší hesla potřebují panel od 280×480 výš. Na štítku na šířku (296×128) je kód vedle údajů a vyjde asi 8 mm, což je na hraně čitelnosti - pro časté skenování použijte raději štítek na výšku nebo větší."
  },
  design: ({ v, width, height }) => {
    // See home.js for why sqrt(area) rather than width alone.
    const area = width && height ? width * height : 296 * 128;
    const t = Math.max(0, Math.min(1, (Math.sqrt(area) - 190) / (800 - 190)));
    const lerp = (from, to) => from + (to - from) * t;
    const ssid = v(0, "Home_Network");
    const password = v(1, "MyPassword123");
    const qr = { text: `WIFI:T:WPA;S:${ssid};P:${password};;`, correction: "L" };
    // Both values on their own line, each with the whole column to itself.
    // Side by side - which is what the old `split` row did - a network name and
    // a password share the width, so anything longer than about a dozen
    // characters lost its end to an ellipsis. A Wi-Fi password with its end cut
    // off is not a shorter password, it is the wrong one.
    const credentials = [
      { label: "SÍŤ" },
      { label: ssid, bold: true, color: "red" },
      { label: "HESLO" },
      { label: password, bold: true },
    ];

    if (height <= 160 && width >= height) return [
      // A square symbol on a landscape tag leaves most of the panel empty
      // beside it, and this template used to spend that space on nothing while
      // squeezing the network name and the password into a 15px footer strip -
      // where, at that size, neither of them actually appeared. The code keeps
      // the full height it had; the credentials move into the room next to it.
      { duo: {
        ratio: 0.42,
        left: { qr },
        right: { list: credentials },
      }, h: 0.88 },
      { footer: [{ label: "NASKENUJ", value: "a připoj se" }], h: 0.12 },
    ];
    // A tall panel can give each value the panel's whole width, which is the
    // only arrangement that fits a long password without shrinking it into the
    // noise - so the stat rows here are deliberately full-bleed rather than a
    // two-column split.
    if (height > width) return [
      { qr, h: 0.46 },
      { stat: { value: ssid, caption: "SÍŤ", color: "red", clamp: true }, h: 0.19 },
      { stat: { value: password, caption: "HESLO", clamp: true }, h: 0.19 },
      { flex: true },
      { footer: [{ label: "NASKENUJ", value: "a připoj se" }], h: 0.16 },
    ];
    return [
      { qr, h: lerp(0.50, 0.58) },
      { stat: { value: ssid, caption: "SÍŤ", color: "red", clamp: true }, h: lerp(0.17, 0.16) },
      { stat: { value: password, caption: "HESLO", clamp: true }, h: lerp(0.17, 0.16) },
      { flex: true },
      { footer: [{ label: "NASKENUJ", value: "a připoj se" }], h: lerp(0.13, 0.07) },
    ];
  },
};
