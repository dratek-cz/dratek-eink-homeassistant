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
    summary: "Živá srážková mapa – černý obrys zvoleného státu, uvnitř červeně vyznačené srážky. Mapu integrace stahuje a vykresluje sama, nic se nemusí nastavovat ani napojovat na žádnou entitu.",
    integrations: [],
    steps: [
      "Přetáhněte šablonu Meteoradar na displej – mapa vyplní celou plochu.",
      "V Nastavit vyberte stát na interaktivní mapě: Česko, Slovensko, Německo, Rakousko, Polsko, nebo přehled celé Střední Evropy najednou.",
      "Radarová data (RainViewer) se aktualizují nejvýše jednou za 10 minut, stejně často jako je skutečně měří - častější odesílání na displej by tedy nepřineslo novější obrázek.",
    ],
    note: "Integrace si sama zakládá kamerovou entitu camera.meteoradar, kterou tato šablona používá - žádnou vlastní kameru ani URL adresu není potřeba nastavovat.",
  },
  design: () => [
    { radarMap: true, bleed: true, h: 1 },
  ],
};
