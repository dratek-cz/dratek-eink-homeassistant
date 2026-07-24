# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [0.1.92] - 2026-07-24

### 🛠️ Critical Hotfix načítání integrace v Home Assistantu
- **Oprava SyntaxError v `render.py`**:
  - Opravena pozice pomocné funkce `_extract_item_value`, která se nacházela uprostřed `if/elif` větvení vykreslovací smyčky a způsobovala `SyntaxError` při importu integrace v Home Assistantu.
  - Všechny moduly integrace nyní kompilují a načítají se v Home Assistantu bez chyb (`config_flow` & `__init__.py`).

---

## [0.1.91] - 2026-07-24

### 🚀 HA Entity Picker pro grafy v Editoru prvku & Přepracování Mapy připojení
- **Výběr Home Assistant entity pro každý objekt (grafy, ukazatele, potenciometry, texty)**:
  - Do inspektoru vlastností v Editoru prvku přidán výběr entit Home Assistantu (`<ha-entity-picker>`) pro každý grafický objekt (sloupcový ukazatel, koláčový graf, posuvník, potenciometr i text).
  - Každý objekt ve vrstvě může cílit na konkrétní entitu Home Assistantu (`entity_id`) a libovolný její atribut (`entity_attribute`).
- **Nové přepracování Mapy připojení**:
  - Kompletně přebudovaný flex/grid systém spojovacích tras mezi Home Assistantem, Wi-Fi gatewayemi a BLE eInk displeji.
  - Čisté vizuální propojovací větve s dynamickým přizpůsobením, které se nerozbíjejí při více připojených displejích ani na mobilních zařízeních.

---

## [0.1.90] - 2026-07-24

### 🚀 Přepracování Editoru prvku na sjednocený design s Editorem displeje
- **Kompletně sjednocený systém označování a manipulace (8 úchytů + rotace)**:
  - Editor prvku nyní používá totožný vizuální systém označování jako hlavní Editor displeje:
  - 8 rohových a bočních úchytů (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`) pro změnu velikosti objektu v reálném čase.
  - Horní oranžový rotační úchyt pro otáčení s podporou 15° krokového přichytávání (Shift).
  - Vodicí spojka rotace a čárkovaný tyrant-teal rámeček označení (`#00a2a5`).
- **Nové interaktivní ovládání plátna v Editoru prvku**:
  - Drag-to-resize, plynulý posun i přesná rotace objektů přímo na plátně.
- **Sjednocený 3-sloupcový layout s inspekčním panelem**:
  - Levý panel vrstev s živými náhledy, prostřední plátno v rámečku fyzického displeje s nástrojovou lištou a pravý panel inspektoru vlastností.

---

## [0.1.89] - 2026-07-24
- Oprava `this._saveProjects is not a function` & Výběr cílového atributu / testovací hodnoty u všech grafů.

## [0.1.88] - 2026-07-24
- Dynamické ukazatele (Sloupcový, Koláč/Donut, Posuvník, Potenciometr), Queue Suite Overhaul & Oficiální CHANGELOG.md.

## [0.1.87] - 2026-07-24
- Hotfix SyntaxError v `render.py` pro bezproblémové nahrání integrace v Home Assistantu.

## [0.1.86] - 2026-07-24
- Vydání dynamických grafů, posuvníků, potenciometrů a opravy ikon entit.

## [0.1.85] - 2026-07-23
- Vylepšení vizualizací a stabilizace přenosových front.

## [0.1.84] - 2026-07-23
- Kompletní oprava otáčení displejů (Orientation & Transform Overhaul).

## [0.1.82] - 2026-07-23
- Vyčištění repozitáře pro plnou kompatibilitu s HACS.
