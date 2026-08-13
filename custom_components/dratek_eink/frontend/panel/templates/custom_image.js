export const template = {
  catalog: {
    id: "custom_image",
    number: "29",
    category: "custom",
    title: "Vlastní obrázek",
    variables: [],
  },
  prepared: true,
  setup: {
    summary: "Nahrajte libovolnou barevnou fotografii. Integrace ji ořízne na displej a pomocí pixelového stínování převede do opticky rozšířené palety e-paperu.",
    integrations: [],
    steps: [
      "Otevřete Nastavit a vyberte obrázek ve formátu PNG, JPEG nebo WebP.",
      "Zkontrolujte stínovaný náhled a odešlete jej na displej.",
    ],
    note: "Výchozí papoušek ukazuje červené, žluté, světlé i tmavé odstíny. Modrá a zelená se na čtyřbarevném e-paperu aproximují optickou směsí dostupných pigmentů.",
  },
  design: ({ customImage }) => [{
    customImage: { src: customImage() },
    pixelPerfect: true,
    h: 1,
  }],
};
