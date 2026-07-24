# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [0.1.102] - 2026-07-24

### Shodné fonty a opravené grafické prvky
- Designer i backend automatických aktualizací používají stejný přibalený proměnný font Arimo pod názvem DRATEK eInk Sans a stejné řezy 600/700.
- Odstraněna nabídka systémových fontů, které backend fyzického displeje nemohl spolehlivě reprodukovat.
- Zarovnání textu používá skutečnou horní hranu glyfů, takže se náhled a výsledný obraz shodují také svisle.
- Sloupcový ukazatel má oddělený bílý pás pro hodnotu a samostatnou ohraničenou stupnici.
- Koláčový graf přizpůsobí velikost textu otvoru; bez dostatečného otvoru přesune hodnotu do samostatného pásu.
- Slider odděluje aktuální hodnotu, stupnici a krajní hodnoty.
- Budík vykresluje základní oblouk černě a hodnotu v bílém poli mimo ručičku.
- Automatický graf nově přenáší do backendu popisky, názvy os, ruční limity, velikost textu, mřížku, hodnoty a všechny barvy.
- Backendové grafy mají adaptivní okraje a hodnoty s bílým podkladem, takže text nezakrývá datovou plochu.
- Doplněny regresní testy fontu, grafických prvků a úplného automatizačního payloadu.

---

## [0.1.101] - 2026-07-24

### Pixelově přesné náhledy displejů
- Vykreslovací plocha Designeru má při 100% zvětšení přesný fyzický rozměr displeje, například `296 × 128` místo dřívějšího `294 × 126`.
- Okraj náhledu už neubírá pixely z pracovní plochy.
- CSS škálování canvasů používá nejbližší pixel a nevytváří šedé mezilehlé hrany kolem textu, ikon ani tvarů.
- Souřadnice ukazatele se přepočítávají podle skutečné velikosti canvasu, takže výběr a přesouvání zůstávají přesné při libovolném zvětšení.
- Náhledy v kartách displejů se nejprve vykreslí a převedou do eInk palety v nativním rozlišení a až potom se zmenší bez vyhlazování.
- Doplněny regresní testy pixelové geometrie a nativního vykreslovacího řetězce.

---

## [0.1.100] - 2026-07-24

### Přehlednější karty, vrstvy a mapa připojení
- Stav baterie, síla signálu a gateway jsou v náhledu displeje sjednocené do jednoho řádku.
- Nad ikonami baterie a signálu zůstávají viditelné názvy a pod nimi jejich aktuální hodnoty.
- Vrstvy běžného Designeru se otevírají v samostatné záložce stejného levého panelu jako knihovna prvků.
- Seznam vrstev má vlastní bezpečné posouvání a ovládací tlačítka už se nepřekrývají ani nezajíždějí pod panel.
- Mapa připojení používá jednoduché souvislé čáry bez šipek, uzlů a pohybujících se spojů.
- Opraveno napojení čar mezi gatewayí a displeji také v mobilním rozložení.
- Doplněny regresní testy nového rozložení.

---

## [0.1.99] - 2026-07-24

### Automatické odeslání změn z Designeru HA prvků
- Uložení upraveného HA prvku aktualizuje jeho kopie ve všech uložených návrzích displejů.
- Backend obnoví vrstvy, pravidla, zdrojové entity a další parametry v již aktivních automatizačních konfiguracích.
- Všechny displeje používající upravený prvek se automaticky zařadí do fronty k překreslení.
- Odeslání respektuje minimální interval každého displeje a při probíhajícím zápisu používá existující bezpečné opakování fronty.
- Funguje také pro starší automatizace bez uloženého ID prvku díky dohledání objektu v návrhu displeje.
- Přidán regresní test aktualizace vazby, změny zdrojových entit a naplánování zápisu.

---

## [0.1.98] - 2026-07-24

### Mazání klávesou Delete v obou designerech
- Vybraný objekt lze odstranit klávesou `Delete` nebo `Backspace` v běžném Designeru i v Designeru HA prvků.
- Klávesové mazání je aktivní pouze při práci s návrhem a nezasahuje do psaní v textových polích, číselných polích ani výběrech.
- Tlačítko pro odstranění objektu v Designeru HA prvků používá stejnou společnou a bezpečnou logiku.
- Doplněn regresní test klávesové zkratky.

---

## [0.1.97] - 2026-07-24

### Přehlednější Designer a přímé HA ukazatele
- Levá knihovna běžného Designeru je rozdělená do složek Základní, Data, Stavy a Moje.
- Graf, sloupcový ukazatel, koláč, posuvník a budík lze vložit přímo do návrhu displeje.
- Přibyla rychlá ON/OFF signalizace a uložené vícevrstvé HA prvky zůstávají dostupné ve složce Moje.
- Každý datový prvek má přímo v Inspectoru výběr entity, rozsah, testovací hodnotu, jednotku a eInk barvy.
- Inspector používá rozbalovací sekce, takže současně ukazuje jen právě potřebná nastavení.
- Přímé ukazatele reagují na změny entit a automatické zápisy respektují minimální interval nastavený pro displej.
- Přidány regresní testy knihovny, widgetů a automatického napojení na entity.

---

## [0.1.96] - 2026-07-24

### Oprava karet displejů a automatického odesílání grafů
- Stavová část karty používá odolné dvousloupcové rozložení baterie a signálu; připojení je zobrazené přes celou šířku.
- Nadpisy, barevné segmenty a číselné hodnoty baterie i signálu se už nepřekrývají v plném, velkém ani malém zobrazení.
- Automatizační konfigurace ukládá čistý podklad návrhu bez dynamických objektů, takže backend dokáže při změně entity sestavit nový obraz.
- Grafy se po změně zdrojové hodnoty zařadí do fronty s respektováním nastaveného minimálního intervalu displeje.
- Vrstvené HA prvky sledují také entity jednotlivých grafů, budíků, posuvníků a dalších měřidel uvnitř vrstvy.
- Přidány regresní testy kompozice grafu, hodnot ve vrstvených měřidlech a plánování aktualizace při změně atributu.

---

## [0.1.95] - 2026-07-24

### Oprava načítání uložených návrhů
- Kliknutí na již předvybraný displej nyní vždy načte jeho poslední uložený návrh, pokud ještě nebyl načtený v aktuálním editoru.
- Projektové úložiště automaticky normalizuje starší formáty návrhů, vrstev, objektů a pravidel uložených jako seznamy nebo objekty s číselnými klíči.
- Designer HA prvků bezpečně otevře starší vrstvené prvky a nezhavaruje kvůli nekompatibilnímu formátu pravidel.
- Neplatná část uložených dat už nezablokuje všechny ostatní návrhy, názvy zařízení ani vlastní prvky.
- Přidány regresní testy kompatibility starších dat a interaktivně ověřeno načtení v obou designerech.

---

## [0.1.94] - 2026-07-24

### Oprava budíků, verzí a zabezpečení publikačního procesu
- Rozsahy budíků `180°`, `240°` a `360°` se nyní stejně vykreslují v Designeru i v obrazu odeslaném na eInk displej.
- Verze hlavního panelu, dashboardové karty, backendu a manifestu jsou sjednoceny na `0.1.94`.
- Git remote již neobsahuje přístupový token; bezpečný publish skript načítá token pouze z lokálního souboru.
- Přidány automatické testy dynamických widgetů, konzistence verzí a lokální validační skript pro Python a JavaScript.

---

## [0.1.93] - 2026-07-24

### 🚀 Oprava ukládání grafů v Editoru prvku
- **Podpora ukládání všech typů grafů a měřidel (`bar_gauge`, `pie`, `slider`, `potentiometer`, `gauge`)**:
  - Opraven filtr `_normalized_layered_layers` ve `websocket.py`, který dříve odfiltrovával všechny objekty typu graf a měřidlo při uložení vlastního prvku.
  - Všechny vytvořené grafy, indikátory i potenciometry se nyní správně ukládají do úložiště Home Assistantu a při opětovném otevření prvku zůstávají zachovány.

---

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
