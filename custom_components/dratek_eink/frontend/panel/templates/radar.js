// Everything about the "Meteoradar" display template. Unlike every other
// template here, it draws nothing from `variables` at all: the whole panel is
// one live precipitation map image composed server-side (see meteoradar.py),
// so there is nothing to bind and nothing else to draw over it.
export const template = {
  catalog: {
    id: "radar",
    number: "23",
    category: "nature",
    title: "Meteoradar",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Živá srážková mapa – černý obrys zvoleného státu, uvnitř přímo ditheringovaný radarový rastr, tečka na poloze domova a boční panel s aktuální teplotou a hodinovou předpovědí. Mapu integrace stahuje a vykresluje sama.",
    integrations: [
      { name: "Met.no", domain: "weather", core: true, why: "Dodá entitu weather.* pro předpověď a teplotu v bočním panelu - bez ní zůstane tato část panelu prázdná, mapa samotná funguje i bez ní." },
    ],
    steps: [
      "Přetáhněte šablonu Meteoradar na displej – mapa vyplní celou plochu.",
      "V Nastavit vyberte stát na interaktivní mapě: Česko, Slovensko, Německo, Rakousko, Polsko, nebo přehled celé Střední Evropy najednou.",
      "Poloha domova (červená tečka) se bere automaticky z Nastavení → Systém → Obecné v Home Assistantu - nic se ručně nezadává.",
      "Radarová data (RainViewer) se aktualizují nejvýše jednou za 10 minut, stejně často jako je skutečně měří - častější odesílání na displej by tedy nepřineslo novější obrázek.",
    ],
    note: "Integrace si sama zakládá kamerovou entitu camera.meteoradar, kterou tato šablona používá - žádnou vlastní kameru ani URL adresu není potřeba nastavovat. Boční panel odpovídá v0.1.330: ukazuje jednotlivé hodinové předpovědi jen jejich časem, bez číselných popisků +1 h, +2 h. Srážky nemají umělou stupnici slabé/střední/silné; skutečný radarový obrázek se ditheringem převádí přímo na barvy konkrétního displeje.",
  },
  design: () => [
    { radarMap: true, bleed: true, h: 1 },
  ],
};
