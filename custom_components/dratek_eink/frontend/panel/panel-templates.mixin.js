export const templatesMixin = {


  _templateDefinitions() {
    return [
      {
        id: "weather", title: "Počasí", icon: "mdi:weather-partly-cloudy", objects: [
          this._tt(92, 22, 66, 28, "☁", "black", true),
          this._tt(83, 50, 86, 16, "Pátek", "black", true),
          this._tt(72, 68, 110, 14, "23. května"),
          this._ln(45, 84, 205, 84),
          this._tt(83, 92, 88, 18, "12:45", "red", true, "cas"),
          this._ln(45, 112, 205, 112),
          this._tt(69, 126, 112, 30, "23°C", "black", true, "teplota"),
          this._tt(92, 157, 70, 12, "Polojasno"),
          this._tt(95, 171, 60, 11, "24° / 13°"),
          this._rr(0, 195, 250, 55, "red", "none"),
          this._tt(18, 205, 28, 11, "SO", "white"),
          this._tt(76, 205, 28, 11, "NE", "white"),
          this._tt(134, 205, 28, 11, "PO", "white"),
          this._tt(195, 205, 28, 11, "ÚT", "white"),
          this._tt(13, 221, 38, 16, "22°", "white", true),
          this._tt(73, 221, 38, 16, "25°", "white", true),
          this._tt(132, 221, 38, 16, "18°", "white", true),
          this._tt(190, 221, 38, 16, "20°", "white", true),
        ]
      },
      {
        id: "energy", title: "Cena energie", icon: "mdi:lightning-bolt", objects: [
          this._tt(18, 17, 30, 32, "⚡", "red", true),
          this._tt(57, 20, 150, 18, "Cena elektřiny", "black", true),
          this._tt(58, 41, 72, 11, "Kč / kWh"),
          this._ln(15, 62, 235, 62),
          this._tt(24, 82, 132, 34, "2,45 Kč", "red", true, "cena_elektriny"),
          this._tt(27, 123, 110, 12, "12:00 - 13:00"),
          this._tt(27, 141, 50, 12, "Dnes"),
          this._ln(42, 192, 58, 192, "red", 2),
          this._ln(58, 192, 58, 180, "red", 2),
          this._ln(58, 180, 73, 180, "red", 2),
          this._ln(73, 180, 73, 166, "red", 2),
          this._ln(73, 166, 91, 166, "red", 2),
          this._ln(91, 166, 91, 151, "red", 2),
          this._ln(91, 151, 107, 151, "red", 2),
          this._ln(107, 151, 107, 139, "red", 2),
          this._ln(107, 139, 126, 139, "red", 2),
          this._ln(126, 139, 126, 130, "red", 2),
          this._ln(126, 130, 145, 130, "red", 2),
          this._ln(145, 130, 145, 143, "red", 2),
          this._ln(145, 143, 167, 143, "red", 2),
          this._ln(167, 143, 167, 154, "red", 2),
          this._ln(167, 154, 191, 154, "red", 2),
          this._ln(191, 154, 191, 183, "red", 2),
          this._ln(191, 183, 212, 183, "red", 2),
          this._rr(0, 196, 250, 54, "red", "none"),
          this._tt(58, 207, 116, 15, "Nejlevnější dnes", "white", true),
          this._tt(83, 226, 74, 20, "2,45 Kč", "white", true, "nejlevnejsi_cena"),
          this._tt(178, 230, 60, 11, "12:00 - 13:00", "white"),
        ]
      },
      {
        id: "home", title: "Dům", icon: "mdi:home", objects: [
          this._tt(19, 18, 80, 20, "Dům", "black", true),
          this._tt(82, 57, 92, 64, "⌂", "red", true),
          this._tt(39, 147, 20, 15, "♨", "black"),
          this._tt(75, 147, 82, 16, "21,5 °C", "black", false, "teplota_dum"),
          this._tt(39, 174, 20, 15, "●", "black"),
          this._tt(75, 174, 62, 16, "45 %", "black", false, "vlhkost"),
          this._tt(39, 201, 20, 15, "◉", "black"),
          this._tt(75, 201, 106, 16, "3 svetla ON", "black", false, "svetla"),
          this._tt(39, 228, 20, 15, "▣", "black"),
          this._tt(75, 228, 104, 16, "Vse zamceno", "black", false, "zamky"),
          this._ln(20, 267, 230, 267),
          this._rr(31, 276, 31, 31, "red", "none"),
          this._tt(42, 285, 26, 20, "✓", "white", true),
          this._tt(82, 286, 126, 14, "Všechno v pořádku", "red", true, "stav_domu"),
        ]
      },
      {
        id: "waste", title: "Odpady", icon: "mdi:trash-can-outline", objects: [
          this._tt(20, 18, 92, 20, "Odpady", "black", true),
          this._tt(49, 79, 72, 54, "♜", "black", true),
          this._tt(140, 86, 68, 22, "ZÍTRA", "red", true, "odpad_1_kdy"),
          this._tt(140, 117, 60, 18, "Plast", "black", false, "odpad_1_typ"),
          this._ln(15, 158, 235, 158),
          this._tt(51, 194, 68, 48, "♻", "black", true),
          this._tt(138, 200, 70, 18, "za 7 dní", "red", true, "odpad_2_kdy"),
          this._tt(140, 230, 62, 18, "Papír", "black", false, "odpad_2_typ"),
        ]
      },
      {
        id: "solar", title: "Fotovoltaika", icon: "mdi:solar-power", objects: [
          this._tt(22, 18, 34, 28, "☼", "black", false),
          this._tt(78, 20, 142, 19, "Fotovoltaika", "black", true),
          this._tt(80, 42, 96, 11, "Aktuální výkon"),
          this._tt(78, 75, 96, 58, "▦", "black", true),
          this._tt(66, 136, 132, 31, "2,35 kW", "black", true, "vykon_fve"),
          this._ln(15, 183, 235, 183),
          this._tt(20, 197, 70, 13, "Dnes"),
          this._tt(165, 197, 58, 13, "8,2 kWh", "black", true, "fve_dnes"),
          this._ln(15, 214, 235, 214),
          this._tt(20, 228, 82, 13, "Tento měsíc"),
          this._tt(158, 228, 65, 13, "152 kWh", "black", true, "fve_mesic"),
          this._ln(15, 245, 235, 245),
          this._tt(20, 259, 70, 13, "Celkem"),
          this._tt(155, 259, 70, 13, "3,45 MWh", "black", true, "fve_celkem"),
          this._rr(0, 290, 250, 40, "red", "none"),
          this._tt(58, 305, 132, 15, "Úspora CO2: 125 kg", "white", true, "uspora_co2"),
        ]
      },
      {
        id: "washer", title: "Pračka", icon: "mdi:washing-machine", objects: [
          this._tt(18, 18, 80, 20, "Pračka", "black", true),
          this._tt(50, 62, 94, 76, "▣", "black", true),
          this._tt(22, 154, 54, 14, "Program"),
          this._tt(22, 174, 112, 18, "Bavlna 60°", "red", true, "program_pracky"),
          this._ln(15, 203, 235, 203),
          this._tt(22, 221, 18, 15, "◷"),
          this._tt(59, 222, 48, 13, "Zbyva"),
          this._tt(143, 217, 70, 22, "01:15", "red", true, "pracka_zbyva"),
          this._ln(15, 250, 235, 250),
          this._tt(59, 267, 116, 15, "Skončí v 14:30", "black", true, "pracka_konec"),
        ]
      },
      {
        id: "living", title: "Obývák", icon: "mdi:sofa-outline", objects: [
          this._tt(20, 18, 88, 20, "Obývák", "black", true),
          this._tt(38, 78, 36, 50, "♨", "red", true),
          this._tt(96, 88, 118, 32, "23,5 °C", "black", true, "teplota_obyvak"),
          this._ln(20, 154, 230, 154),
          this._tt(48, 188, 30, 30, "●", "black", true),
          this._tt(94, 193, 104, 18, "Vlhkost: 40 %", "black", true, "vlhkost_obyvak"),
          this._ln(20, 230, 230, 230),
          this._tt(66, 267, 124, 18, "CO2: 650 ppm", "black", true, "co2_obyvak"),
        ]
      },
      {
        id: "presence", title: "Kdo je doma", icon: "mdi:account-group", objects: [
          this._tt(17, 18, 124, 20, "Kdo je doma", "black", true),
          this._tt(25, 67, 18, 18, "●"),
          this._tt(57, 68, 80, 16, "Petr", "black", false, "petr_stav"),
          this._tt(205, 65, 28, 22, "⌂", "red", true),
          this._ln(15, 100, 235, 100),
          this._tt(25, 118, 18, 18, "●"),
          this._tt(57, 119, 80, 16, "Jana", "black", false, "jana_stav"),
          this._tt(205, 116, 28, 22, "⌂", "red", true),
          this._ln(15, 151, 235, 151),
          this._tt(25, 168, 18, 18, "●"),
          this._tt(57, 169, 80, 16, "Eliska", "black", false, "eliska_jmeno"),
          this._tt(165, 171, 70, 15, "Ve skole", "red", true, "eliska_stav"),
          this._rr(0, 218, 250, 54, "red", "none"),
          this._tt(35, 229, 24, 22, "◷", "white", true),
          this._tt(76, 229, 128, 13, "Poslední aktualizace", "white", true),
          this._tt(76, 246, 64, 20, "12:45", "white", true, "cas_update"),
        ]
      },
      {
        id: "wifi", title: "Wi-Fi", icon: "mdi:wifi", objects: [
          this._tt(17, 18, 60, 20, "Wi-Fi", "black", true),
          this._qr(72, 58, 106, "WIFI:T:WPA;S:Home_Network;P:MyPassword123;;"),
          this._tt(20, 181, 34, 12, "Sit"),
          this._tt(20, 198, 130, 14, "Home_Network", "red", true, "wifi_ssid"),
          this._ln(15, 220, 235, 220),
          this._tt(20, 234, 48, 12, "Heslo"),
          this._tt(20, 251, 140, 14, "MyPassword123", "red", true, "wifi_heslo"),
          this._ln(15, 277, 235, 277),
          this._tt(37, 293, 28, 20, "≋", "black", true),
          this._tt(82, 297, 120, 12, "Naskenuj pro připojení"),
        ]
      },
      {
        id: "calendar", title: "Kalendář", icon: "mdi:calendar-month", objects: [
          this._tt(19, 18, 96, 20, "Kalendář", "black", true),
          this._tt(26, 69, 52, 45, "23", "black", true),
          this._tt(99, 64, 68, 16, "PÁTEK", "red", true, "udalost_1_den"),
          this._tt(99, 85, 72, 15, "Schůzka", "black", false, "udalost_1_nazev"),
          this._tt(99, 104, 58, 14, "15:00", "black", false, "udalost_1_cas"),
          this._ln(15, 137, 235, 137),
          this._tt(26, 166, 52, 45, "24", "black", true),
          this._tt(99, 161, 82, 16, "SOBOTA", "red", true, "udalost_2_den"),
          this._tt(99, 182, 96, 15, "Narozeniny", "black", false, "udalost_2_nazev"),
          this._tt(99, 201, 70, 14, "Tomáš", "black", false, "udalost_2_detail"),
          this._rr(0, 240, 250, 58, "red", "none"),
          this._tt(34, 254, 34, 23, "♛", "white", true),
          this._tt(78, 253, 112, 13, "Zítra má svátek", "white"),
          this._tt(78, 271, 70, 18, "Jana", "white", true, "svatek"),
        ]
      },
      {
        id: "radar", title: "Meteoradar (Met.no)", icon: "mdi:radar", objects: [
          this._img(0, 0, 250, 128, "https://www.rainviewer.com/api/v2/radar/nowcast/512/0/0/1_0.png", "radar_mapa"),
          this._rr(0, 0, 250, 24, "red", "none"),
          this._tt(8, 3, 20, 18, "📡", "white", true),
          this._tt(30, 4, 110, 16, "Meteoradar", "white", true),
          this._tt(145, 4, 100, 16, "Česká republika", "white", true, "radar_stat", "right"),
          this._rr(0, 100, 250, 28, "white", "black", 1),
          this._tt(6, 104, 110, 14, "Met.no: 21.5°C • Déšť", "black", true, "radar_metno", "left"),
          this._tt(185, 104, 60, 14, "12:40", "black", true, "radar_cas", "right"),
        ]
      },

    ];
  },

  _img(x, y, w, h, image, variableName = "") {
    return {
      type: "image",
      x,
      y,
      w,
      h,
      rotation: 0,
      flipH: false,
      image,
      tint: "original",
      keepRatio: true,
      variable: !!variableName,
      variableName,
      entityId: "camera.meteoradar",
    };
  },


  _tt(x, y, w, h, text, color = "black", bold = false, variableName = "", align = "center") {
    const minFontSize = h >= 28 ? 18 : h >= 18 ? 13 : 11;
    return {
      type: "text",
      x,
      y,
      w,
      h,
      text,
      color,
      fontSize: h,
      fontFamily: "Arial",
      minFontSize,
      bold,
      rotation: 0,
      variable: !!variableName,
      variableName,
      textAlign: align,
      verticalAlign: "middle",
      autoFit: true,
    };
  },

  _rr(x, y, w, h, fill = "none", stroke = "black", strokeWidth = 1) {
    return { type: "rect", x, y, w, h, fill, stroke, strokeWidth, color: stroke, rotation: 0 };
  },

  _ln(x, y, x2, y2, color = "black", strokeWidth = 1) {
    return { type: "line", x, y, x2, y2, color, strokeWidth, rotation: 0 };
  },

  _qr(x, y, side, text) {
    return { type: "qr", x, y, w: side, h: side, text, color: "black", rotation: 0, keepRatio: true };
  },

  _symbolCategories() {
    return [
      ["all", "Vše"],
      ["weather", "Počasí"],
      ["home", "Domácnost"],
      ["energy", "Energie"],
      ["tech", "Technika"],
      ["status", "Stavy"],
      ["people", "Lidé"],
      ["time", "Čas"],
      ["transport", "Doprava"],
      ["finance", "Finance"],
      ["security", "Bezpečnost"],
      ["health", "Zdraví"],
      ["media", "Media"],
      ["food", "Jídlo"],
      ["shop", "Obchod"],
      ["nature", "Příroda"],
      ["arrows", "Šipky"],
      ["symbols", "Značky"],
    ];
  },

  _symbolCatalog() {
    return [
      ["weather", "slunce", "☀"], ["weather", "slunce male", "☼"], ["weather", "mrak", "☁"], ["weather", "dest", "☂"], ["weather", "snih", "❄"], ["weather", "blesk", "⚡"], ["weather", "teplota", "℃"], ["weather", "teplota f", "℉"], ["weather", "vitr", "≋"], ["weather", "noc", "☾"], ["weather", "mesic", "☽"], ["weather", "hvezda", "★"], ["weather", "kapka", "●"], ["weather", "vlhkost", "%"], ["weather", "tlak", "hPa"], ["weather", "uv", "UV"], ["weather", "mlha", "≡"], ["weather", "mrholeni", "⋮"], ["weather", "duha", "⌒"], ["weather", "mraz", "*"],
      ["home", "dum", "⌂"], ["home", "doma", "⌂"], ["home", "zamek", "▣"], ["home", "odemceno", "▢"], ["home", "klic", "⚿"], ["home", "svetlo", "◉"], ["home", "zarovka", "●"], ["home", "voda", "●"], ["home", "kohout", "⌐"], ["home", "odpad", "♜"], ["home", "recyklace", "♻"], ["home", "pracka", "▣"], ["home", "mycka", "▤"], ["home", "lednice", "▯"], ["home", "trouba", "▥"], ["home", "topeni", "♨"], ["home", "termostat", "℃"], ["home", "ventilator", "✶"], ["home", "okno", "▥"], ["home", "dvere", "▯"], ["home", "garaz", "▰"], ["home", "zahrada", "♧"], ["home", "bazén", "≈"], ["home", "zaluzie", "▤"],
      ["energy", "blesk", "⚡"], ["energy", "solar", "▦"], ["energy", "panel", "▦"], ["energy", "uspora", "✓"], ["energy", "list", "♧"], ["energy", "graf", "▥"], ["energy", "baterie plna", "▰"], ["energy", "baterie pul", "▱"], ["energy", "zasuvka", "⌁"], ["energy", "nabijeni", "⚡"], ["energy", "vykon", "kW"], ["energy", "energie", "kWh"], ["energy", "plyn", "◌"], ["energy", "voda", "≈"], ["energy", "co2", "CO₂"], ["energy", "nahoru", "▲"], ["energy", "dolu", "▼"], ["energy", "tarif", "T"], ["energy", "cena", "Kč"], ["energy", "sit", "▤"],
      ["tech", "wifi", "≋"], ["tech", "signal", "▂"], ["tech", "signal 2", "▃"], ["tech", "signal 3", "▄"], ["tech", "qr", "▦"], ["tech", "barcode", "▥"], ["tech", "server", "▤"], ["tech", "senzor", "◌"], ["tech", "chip", "▣"], ["tech", "bluetooth", "B"], ["tech", "mobil", "▯"], ["tech", "tablet", "▭"], ["tech", "pc", "▰"], ["tech", "router", "▤"], ["tech", "cloud", "☁"], ["tech", "database", "▦"], ["tech", "api", "API"], ["tech", "kamera", "▣"], ["tech", "mikrofon", "♪"], ["tech", "reproduktor", "◁"], ["tech", "nastaveni", "⚙"], ["tech", "terminal", ">_"], ["tech", "download", "↓"], ["tech", "upload", "↑"],
      ["status", "ok", "✓"], ["status", "hotovo", "✓"], ["status", "chyba", "✕"], ["status", "krizek", "×"], ["status", "varovani", "!"], ["status", "info", "i"], ["status", "otazka", "?"], ["status", "nahoru", "▲"], ["status", "dolu", "▼"], ["status", "zapnuto", "●"], ["status", "vypnuto", "○"], ["status", "stop", "■"], ["status", "pauza", "Ⅱ"], ["status", "play", "▶"], ["status", "record", "●"], ["status", "minus", "−"], ["status", "plus", "+"], ["status", "rovna se", "="], ["status", "stav dobry", "OK"], ["status", "stav low", "LOW"], ["status", "stav high", "HI"],
      ["people", "osoba", "●"], ["people", "clovek", "●"], ["people", "doma", "⌂"], ["people", "prace", "▣"], ["people", "skola", "▥"], ["people", "srdce", "♥"], ["people", "hvezda", "★"], ["people", "rodina", "●●"], ["people", "dite", "•"], ["people", "spanek", "Zz"], ["people", "aktivita", "▲"], ["people", "prichod", "→"], ["people", "odchod", "←"], ["people", "host", "G"], ["people", "uzivatel", "U"], ["people", "telefon", "▯"],
      ["time", "hodiny", "◷"], ["time", "cas", "◷"], ["time", "kalendar", "▣"], ["time", "den", "☀"], ["time", "noc", "☾"], ["time", "alarm", "!"], ["time", "pauza", "Ⅱ"], ["time", "timer", "◴"], ["time", "stopky", "◵"], ["time", "obnovit", "↻"], ["time", "opakovat", "↺"], ["time", "dnes", "D"], ["time", "zitra", "Z"], ["time", "tyden", "T"], ["time", "mesic", "M"], ["time", "rok", "R"],
      ["transport", "auto", "▰"], ["transport", "bus", "▣"], ["transport", "vlak", "▤"], ["transport", "kolo", "○"], ["transport", "kolobezka", "o"], ["transport", "nabijeni", "⚡"], ["transport", "parkovani", "P"], ["transport", "letadlo", "✈"], ["transport", "lod", "⌁"], ["transport", "pesky", "●"], ["transport", "trasa", "→"], ["transport", "sever", "N"], ["transport", "jih", "S"], ["transport", "vychod", "E"], ["transport", "zapad", "W"], ["transport", "domu", "⌂"],
      ["finance", "koruna", "Kč"], ["finance", "euro", "€"], ["finance", "dolar", "$"], ["finance", "libra", "£"], ["finance", "yen", "¥"], ["finance", "procenta", "%"], ["finance", "promile", "‰"], ["finance", "tag", "◆"], ["finance", "sleva", "-%"], ["finance", "nahoru", "▲"], ["finance", "dolu", "▼"], ["finance", "cena", "Kč"], ["finance", "faktura", "▤"], ["finance", "platba", "✓"], ["finance", "kosik", "▢"], ["finance", "nejlevnejsi", "★"],
      ["security", "alarm", "!"], ["security", "zamek", "▣"], ["security", "odemceno", "▢"], ["security", "straz", "◉"], ["security", "kamera", "▣"], ["security", "pohyb", "◌"], ["security", "sirena", ")))"], ["security", "pozar", "▲"], ["security", "kour", "≋"], ["security", "voda", "≈"], ["security", "okno", "▥"], ["security", "dvere", "▯"], ["security", "bezpecne", "✓"], ["security", "problem", "✕"], ["security", "pin", "●●●"], ["security", "sos", "SOS"],
      ["health", "srdce", "♥"], ["health", "tep", "♥"], ["health", "teplota", "℃"], ["health", "kroky", "●"], ["health", "spanek", "Zz"], ["health", "vaha", "kg"], ["health", "lek", "+"], ["health", "prvni pomoc", "✚"], ["health", "voda", "●"], ["health", "jidlo", "◐"], ["health", "sport", "▲"], ["health", "klid", "○"], ["health", "varovani", "!"], ["health", "ok", "✓"],
      ["media", "play", "▶"], ["media", "pause", "Ⅱ"], ["media", "stop", "■"], ["media", "record", "●"], ["media", "prev", "◀"], ["media", "next", "▶"], ["media", "volume", ")))"], ["media", "mute", "×"], ["media", "hudba", "♪"], ["media", "radio", "▤"], ["media", "tv", "▭"], ["media", "film", "▥"], ["media", "foto", "▣"], ["media", "kamera", "▣"], ["media", "playlist", "≡"],
      ["food", "jidlo", "◐"], ["food", "kava", "☕"], ["food", "caj", "☕"], ["food", "voda", "●"], ["food", "vino", "◡"], ["food", "pivo", "▱"], ["food", "snidane", "☀"], ["food", "obed", "○"], ["food", "vecere", "☾"], ["food", "nakup", "▢"], ["food", "lednice", "▯"], ["food", "teplota", "℃"], ["food", "hotovo", "✓"], ["food", "cas", "◷"],
      ["shop", "kosik", "▢"], ["shop", "tag", "◆"], ["shop", "sleva", "%"], ["shop", "cena", "Kč"], ["shop", "ean", "▥"], ["shop", "qr", "▦"], ["shop", "balik", "▣"], ["shop", "sklad", "▤"], ["shop", "doprava", "→"], ["shop", "hotovo", "✓"], ["shop", "chybi", "!"], ["shop", "plus", "+"], ["shop", "minus", "−"], ["shop", "favorite", "★"],
      ["nature", "list", "♧"], ["nature", "strom", "♣"], ["nature", "kvetina", "✿"], ["nature", "slunce", "☀"], ["nature", "voda", "≈"], ["nature", "hora", "▲"], ["nature", "oheň", "▲"], ["nature", "snih", "❄"], ["nature", "mesic", "☾"], ["nature", "hvezda", "★"], ["nature", "recyklace", "♻"], ["nature", "co2", "CO₂"], ["nature", "eko", "ECO"],
      ["arrows", "vpravo", "→"], ["arrows", "vlevo", "←"], ["arrows", "nahoru", "↑"], ["arrows", "dolu", "↓"], ["arrows", "severovychod", "↗"], ["arrows", "severozapad", "↖"], ["arrows", "jihovychod", "↘"], ["arrows", "jihozapad", "↙"], ["arrows", "obnovit", "↻"], ["arrows", "zpet", "↺"], ["arrows", "enter", "↵"], ["arrows", "tam zpet", "↔"], ["arrows", "nahoru dolu", "↕"], ["arrows", "rychle", "»"], ["arrows", "pomalu", "«"], ["arrows", "pokračovat", "▶"],
      ["symbols", "check", "✓"], ["symbols", "cross", "✕"], ["symbols", "krat", "×"], ["symbols", "plus", "+"], ["symbols", "minus", "−"], ["symbols", "star", "★"], ["symbols", "heart", "♥"], ["symbols", "circle", "●"], ["symbols", "circle empty", "○"], ["symbols", "square", "■"], ["symbols", "square empty", "□"], ["symbols", "diamond", "◆"], ["symbols", "diamond empty", "◇"], ["symbols", "triangle up", "▲"], ["symbols", "triangle down", "▼"], ["symbols", "dot", "•"], ["symbols", "hash", "#"], ["symbols", "at", "@"], ["symbols", "ampersand", "&"], ["symbols", "degree", "°"], ["symbols", "copyright", "©"], ["symbols", "registered", "®"], ["symbols", "section", "§"],
    ].map(([category, label, symbol]) => ({ category, label, symbol }));
  },

  _addSymbol(symbol) {
    this._pushHistory();
    const size = this._displaySize();
    const object = {
      id: `obj-${this._nextId++}`,
      type: "text",
      x: this._snapValue(size.width * 0.42),
      y: this._snapValue(size.height * 0.38),
      w: this._snapValue(Math.max(36, size.width * 0.16)),
      h: this._snapValue(Math.max(36, size.height * 0.16)),
      rotation: 0,
      flipH: false,
      color: "black",
      text: symbol,
      fontSize: Math.max(26, Math.round(Math.min(size.width, size.height) * 0.12)),
      fontFamily: "Arial",
      minFontSize: 18,
      bold: true,
      variable: false,
      variableName: "",
      entityId: "",
      entityAttribute: "",
      textAlign: "center",
      verticalAlign: "middle",
      autoFit: true,
    };
    this._objects.push(object);
    this._selectedIds = [object.id];
    this._symbolPickerOpen = false;
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _applyTemplate(templateId, skipConfirm = false) {
    this._templateUndoStack = [];
    this._templateRedoStack = [];
    this._templatePropertyHistoryKey = "";
    if (templateId === "blank") {
      if (!skipConfirm && this._objects.length && !confirm("Nahradit aktuální návrh prázdnou šablonou?")) return;
      this._pushHistory();
      const device = this._device();
      const size = this._displaySize(device);
      this._orientation = device?.orientation || (size.width > size.height ? "landscape" : "portrait");
      this._objects = [];
      this._variables = {};
      this._templateEditorElements = [];
      this._selectedTemplateEditorElementId = "";
      this._templateOverlayDrag = null;
      this._templateElementAdjustments = {};
      this._displayTemplateBindings = {};
      this._templateCanvasPlacements = {
        primary: { x: 9, y: 9 },
        secondary: { x: 9, y: 9 },
      };
      this._selectedTemplatePart = "";
      this._restoreTemplateEditorState?.("blank");
      this._invertColors = false;
      this._backgroundColor = "white";
      this._selectedIds = [];
      this._selectedProjectId = "";
      this._projectName = "Vlastní šablona";
      this._nextId = 1;
      this._templateDialogOpen = false;
      this._newProjectDialogOpen = false;
      this._fileMenuOpen = false;
      this._fitZoom();
      this._render();
      this._paint();
      this._scheduleDraftSave();
      return;
    }
    const template = this._templateDefinitions().find((item) => item.id === templateId);
    if (!template) return;
    if (!skipConfirm && this._objects.length && !confirm(`Nahradit aktualni navrh sablonou "${template.title}"?`)) return;
    this._pushHistory();
    const device = this._device();
    const size = this._displaySize(device);
    this._orientation = device?.orientation || (size.width > size.height ? "landscape" : "portrait");
    const sourceWidth = Math.max(250, ...template.objects.map((object) => Math.max(Number(object.x || 0), Number(object.x2 || 0)) + Number(object.w || 0)));
    const sourceHeight = Math.max(300, ...template.objects.map((object) => Math.max(Number(object.y || 0), Number(object.y2 || 0)) + Number(object.h || 0)));
    const sx = size.width / sourceWidth;
    const sy = size.height / sourceHeight;
    const variables = {};
    this._objects = template.objects.map((object, index) => {
      const next = structuredClone(object);
      next.id = `obj-${index + 1}`;
      next.x = this._snapValue(Number(next.x || 0) * sx);
      next.y = this._snapValue(Number(next.y || 0) * sy);
      if (next.x2 !== undefined) next.x2 = this._snapValue(Number(next.x2 || 0) * sx);
      if (next.y2 !== undefined) next.y2 = this._snapValue(Number(next.y2 || 0) * sy);
      if (next.w !== undefined) next.w = Math.max(1, this._snapValue(Number(next.w || 1) * sx));
      if (next.h !== undefined) next.h = Math.max(1, this._snapValue(Number(next.h || 1) * sy));
      if (next.fontSize !== undefined) next.fontSize = Math.max(7, Math.round(Number(next.fontSize || 12) * Math.min(sx, sy)));
      if (next.minFontSize !== undefined) next.minFontSize = Math.max(11, Math.round(Number(next.minFontSize || 11) * Math.min(sx, sy)));
      if (next.strokeWidth !== undefined) next.strokeWidth = Math.max(1, Math.round(Number(next.strokeWidth || 1) * Math.min(sx, sy)));
      if (next.type === "text" && Number(next.fontSize || 0) <= 16 && Number(next.w || 0) >= 48) {
        next.textAlign = "left";
      }
      if (next.variable && next.variableName) variables[next.variableName] = next.type === "chart" ? (next.data || "") : (next.text || "");
      return next;
    });
    this._variables = variables;
    this._restoreTemplateEditorState?.(templateId, template);
    this._invertColors = false;
    this._backgroundColor = "white";
    this._selectedIds = [];
    this._selectedProjectId = "";
    this._projectName = `Sablona ${template.title}`;
    this._nextId = this._nextObjectId();
    this._templateDialogOpen = false;
    this._newProjectDialogOpen = false;
    this._fileMenuOpen = false;
    this._fitZoom();
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _addObject(type) {
    this._pushHistory();
    const size = this._displaySize();
    const requestedType = type;
    if (type === "status") type = "text";
    const object = {
      id: `obj-${this._nextId++}`,
      type,
      x: this._snapValue(size.width * 0.12),
      y: this._snapValue(size.height * 0.15),
      w: this._snapValue(size.width * 0.35),
      h: this._snapValue(size.height * 0.2),
      rotation: 0,
      flipH: false,
      color: "black",
      backgroundColor: "white",
      fill: "none",
      stroke: "black",
      strokeWidth: 2,
      text: type === "text" ? "Text" : type === "qr" ? "https://dratek.cz" : "8591234567890",
      fontSize: Math.max(16, Math.round(size.height * 0.16)),
      fontFamily: "Arial",
      minFontSize: 12,
      bold: false,
      variable: false,
      variableName: "",
      textAlign: "left",
      verticalAlign: "middle",
      autoFit: true,
      image: "",
      keepRatio: type === "image",
    };
    if (type === "rect") object.fill = "red";
    if (requestedType === "status") {
      object.text = "●";
      object.w = this._snapValue(size.width * 0.28);
      object.h = this._snapValue(size.height * 0.34);
      object.fontSize = Math.max(22, Math.round(size.height * 0.24));
      object.bold = true;
      object.variable = true;
      object.variableName = this._uniqueVariableName("stav_on_off", object.id);
      object.textAlign = "center";
      object.statusIcons = true;
      object.statusOnSymbol = "●";
      object.statusOffSymbol = "○";
      object.statusOnValues = "on,true,1,open,home";
      object.conditionRules = [];
      object.defaultSymbol = "○";
      object.autoUpdate = true;
    }
    if (type === "line") {
      object.x2 = object.x + this._snapValue(size.width * 0.38);
      object.y2 = object.y + this._snapValue(size.height * 0.2);
    }
    if (type === "barcode") object.h = this._snapValue(size.height * 0.32);
    if (type === "chart") {
      object.w = this._snapValue(size.width * 0.72);
      object.h = this._snapValue(size.height * 0.62);
      object.chartType = "bar";
      object.data = "1.62, 1.48, 1.36, 1.29, 1.34, 1.51, 1.88, 2.24, 2.06, 1.72, 1.38, 1.12, 0.94, 0.86, 0.91, 1.08, 1.42, 1.96, 2.58, 2.74, 2.39, 2.05, 1.84, 1.68";
      object.chartLabels = "00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23";
      object.chartTitle = "Cena elektřiny";
      object.xLabel = "Hodina";
      object.yLabel = "Kč/kWh";
      object.chartMin = "";
      object.chartMax = "";
      object.maxPoints = 24;
      object.showAxes = true;
      object.showGrid = true;
      object.showValues = false;
      object.barColor = "red";
      object.graphColor = "black";
      object.legendFontSize = 12;
      object.variable = true;
      object.variableName = this._uniqueVariableName("ceny_spot_24h", object.id);
    }
    if (requestedType === "bar_gauge") {
      Object.assign(object, {
        type: "bar_gauge", w: this._snapValue(size.width * 0.68), h: this._snapValue(size.height * 0.25),
        label: "Ukazatel", min_value: 0, max_value: 100, sample_value: 65, unit: "%",
        orientation: "horizontal", fill: "red", stroke: "black", stroke_width: 2,
        show_value: true, entityId: "", entityAttribute: "", autoUpdate: true,
      });
    }
    if (requestedType === "pie") {
      const side = this._snapValue(Math.min(size.width * 0.38, size.height * 0.72));
      Object.assign(object, {
        type: "pie", w: side, h: side, label: "Koláč", min_value: 0, max_value: 100,
        sample_value: 65, unit: "%", hole_percent: 45, color: "red",
        show_value: true, entityId: "", entityAttribute: "", autoUpdate: true, keepRatio: true,
      });
    }
    if (requestedType === "slider") {
      Object.assign(object, {
        type: "slider", w: this._snapValue(size.width * 0.64), h: this._snapValue(size.height * 0.34),
        label: "Hodnota", min_value: 0, max_value: 100, sample_value: 50, unit: "%",
        color: "red", show_value: true, entityId: "", entityAttribute: "", autoUpdate: true,
      });
    }
    if (requestedType === "gauge" || requestedType === "potentiometer") {
      Object.assign(object, {
        type: "gauge", w: this._snapValue(size.width * 0.45), h: this._snapValue(size.height * 0.68),
        label: "Budík", min_value: 0, max_value: 100, sample_value: 62, unit: "%",
        color: "red", stroke_width: 6, arc_mode: "240", show_arc: true,
        show_needle: true, show_value: true, entityId: "", entityAttribute: "", autoUpdate: true,
      });
    }
    if (type === "qr") {
      object.w = Math.min(object.w, object.h);
      object.h = object.w;
      object.keepRatio = true;
    }
    this._objects.push(object);
    if (object.variable && object.variableName) this._variables[object.variableName] = object.type === "chart" ? object.data : object.text;
    this._selectedIds = [object.id];
    this._render();
    this._paint();
    this._scheduleDraftSave();
  },

  _addImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = this._displaySize();
        const maxW = Math.round(size.width * 0.45);
        const scale = Math.min(1, maxW / img.width);
        this._pushHistory();
        const object = {
          id: `obj-${this._nextId++}`,
          type: "image",
          x: this._snapValue(size.width * 0.12),
          y: this._snapValue(size.height * 0.15),
          w: Math.max(20, this._snapValue(img.width * scale)),
          h: Math.max(20, this._snapValue(img.height * scale)),
          rotation: 0,
          flipH: false,
          image: reader.result,
          tint: "original",
          keepRatio: true,
        };
        this._objects.push(object);
        this._selectedIds = [object.id];
        this._render();
        this._paint();
        this._scheduleDraftSave();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  },

  _renderSymbolDialog() {
    if (!this._symbolPickerOpen) return "";
    const query = this._symbolSearch.trim().toLowerCase();
    const symbols = this._symbolCatalog().filter((item) => {
      const categoryMatch = this._symbolCategory === "all" || item.category === this._symbolCategory;
      const queryMatch = !query || item.label.toLowerCase().includes(query) || item.symbol.includes(query);
      return categoryMatch && queryMatch;
    });
    return `<div class="modal-backdrop symbol-modal-backdrop">
      <div class="symbol-dialog" role="dialog" aria-modal="true" aria-labelledby="symbolDialogTitle">
        <div class="section-title"><h2 id="symbolDialogTitle">Vložit symbol</h2><button id="closeSymbols" class="secondary"><ha-icon icon="mdi:close"></ha-icon>Zavřít</button></div>
        <div class="symbol-search"><input type="search" id="symbolSearch" value="${this._escape(this._symbolSearch)}" placeholder="Hledat symbol, například Wi-Fi, teplota, světlo..."><span class="pill muted">${symbols.length} symbolů</span></div>
        <div class="category-row">${this._symbolCategories().map(([id, label]) => `<button class="secondary ${this._symbolCategory === id ? "active" : ""}" data-symbol-category="${this._escape(id)}">${this._escape(label)}</button>`).join("")}</div>
        <div class="symbol-grid">${symbols.map((item) => {
      const label = this._translateSymbolLabel(item.label);
      return `<button class="symbol-tile" data-symbol="${this._escape(item.symbol)}" title="${this._escape(label)}"><strong>${this._escape(item.symbol)}</strong><span>${this._escape(label)}</span></button>`;
    }).join("")}</div>
      </div>
    </div>`;
  },

  _renderTemplates() {
    return this._templateDefinitions().map((template) => `
      <button class="template-card" data-template="${this._escape(template.id)}" title="Pouzit sablonu ${this._escape(template.title)}">
        <ha-icon icon="${this._escape(template.icon)}"></ha-icon>
        <div><strong>${this._escape(template.title)}</strong><span>vlozit layout</span></div>
      </button>
    `).join("");
  },
};
