<p align="center">
  <img src="https://raw.githubusercontent.com/dratek-cz/dratek-eink-homeassistant/main/custom_components/dratek_eink/frontend/dratek-eink-logo.png" alt="DRATEK.CZ eInk" width="360">
</p>

# DRATEK eInk pro Home Assistant

## Novinky ve verzi 0.1.103

- Designer zobrazuje dynamické texty a grafy přes stejný backendový renderer jako automatické aktualizace
- ruční odeslání používá tentýž kanonický PNG obrázek, takže první automatická aktualizace už nezmění font ani rozložení grafu
- hodnoty entit, grafické řady, vrstvy a podmínky se pro náhled i automatický zápis načítají jedinou společnou cestou
- pokud backend nedokáže kanonický obrázek vytvořit, odeslání se bezpečně zastaví místo odeslání odlišného náhledu

## Novinky ve verzi 0.1.102

- náhled i automatické překreslení používají stejný vestavěný font DRATEK eInk Sans
- opraveny sloupcové ukazatele, koláčové grafy, slidery a budíky v náhledu i na fyzickém displeji
- text hodnot má vlastní čitelné místo a už neleží přes grafiku nebo ručičku
- automatické grafy zachovávají typ, osy, popisky, limity, mřížku i nastavené barvy

## Novinky ve verzi 0.1.101

- náhled Designeru má při 100% zvětšení přesně stejné rozměry v pixelech jako fyzický displej
- text, ikony i tvary se škálují bez rozmazání a bez šedých interpolovaných okrajů
- malé náhledy na hlavní stránce se vytvářejí z hotového nativního eInk obrazu místo opakovaného přepočítávání

## Novinky ve verzi 0.1.100

- baterie, signál a použitá gateway jsou v kartě displeje přehledně v jednom řádku
- vrstvy Designeru jsou nově v přepínatelné záložce levého panelu a nezajíždějí pod nástroje
- mapa připojení používá čisté souvislé čáry a je opravená také pro úzké obrazovky

## Novinky ve verzi 0.1.99

- úprava uloženého prvku v Designeru HA prvků se automaticky propíše také do aktivních automatizací displejů
- dotčené displeje se po uložení prvku samy zařadí do fronty k překreslení
- automatické odeslání respektuje nastavený minimální interval displeje a nekoliduje s probíhajícím zápisem

## Novinky ve verzi 0.1.98

- klávesy `Delete` a `Backspace` mažou vybraný objekt v běžném Designeru i v Designeru HA prvků
- při psaní do textových a číselných polí zůstává mazání bezpečně omezené jen na obsah pole

## Novinky ve verzi 0.1.97

- běžný Designer má přehlednou knihovnu rozdělenou na Základní, Data, Stavy a Moje
- grafy, sloupcové ukazatele, koláče, posuvníky a budíky lze vložit přímo do displeje
- ON/OFF signalizaci lze vytvořit jedním kliknutím a pokročilé vícevrstvé prvky jsou ve složce Moje
- pravý Inspector je rozdělený do rozbalovacích sekcí a nezobrazuje všechna nastavení najednou
- datové prvky lze přímo napojit na entity Home Assistantu a jejich změny respektují minimální interval displeje

## Novinky ve verzi 0.1.96

- opraveno responzivní rozložení náhledů displejů na hlavní stránce
- baterie a signál mají stabilní samostatné bloky s nadpisem, barevnou ikonou a hodnotou
- automatické aktualizace grafů nyní ukládají podklad návrhu potřebný k vytvoření nového obrazu
- změna entity grafu se po nastaveném minimálním intervalu skutečně zařadí do fronty a odešle na displej
- sledovány jsou také entity grafů a měřidel uvnitř vrstev vlastních HA prvků

## Novinky ve verzi 0.1.95

- opraveno načtení posledního návrhu po kliknutí na již předvybraný displej
- doplněna automatická kompatibilita se staršími návrhy, které mají objekty nebo vrstvy uložené pod číselnými klíči
- opraveno otevření starších uložených prvků v Designeru HA prvků
- poškozená část úložiště už nezablokuje načtení ostatních návrhů a prvků
- přidány regresní testy migrace projektového úložiště

## Novinky ve verzi 0.1.94

- opraveno skutečné vykreslení rozsahů budíků `180°`, `240°` a `360°`, aby odpovídalo náhledu Designeru
- sjednocena verze hlavního panelu, dashboardové karty, backendu a manifestu
- Git remote už neobsahuje přístupový token; nahrávání používá token pouze z lokálního souboru
- přidány automatické testy grafů, budíků a konzistence verzí
- přidán lokální validační skript pro kontrolu Pythonu, JavaScriptu a unit testů před vydáním

Bezpečné ruční vydání přes tokenový soubor:

```powershell
$env:DRATEK_GITHUB_TOKEN_FILE = "C:\bezpecna-cesta\accesstoken.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\push-with-token.ps1 -PushTags
```

Token se při tomto postupu neukládá do Git remote URL ani do repozitáře.

Kontroly před vydáním lze spustit příkazem:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\validate.ps1
```

## Novinky ve verzi 0.1.93

- **Oprava ukládání grafů a budíků v Editoru prvku**:
  - Opravena validace ve `websocket.py`, která při uložení vlastního prvku nepropouštěla objekty typu `bar_gauge`, `pie`, `slider`, `potentiometer` a `gauge`.
  - Všechny vytvořené grafy se nyní trvale ukládají do úložiště Home Assistantu a při opětovném otevření zůstávají bezchybně na plátně.

## Novinky ve verzi 0.1.92

- **Kritická oprava načítání integrace v Home Assistantu**:
  - Opravena syntaktická chyba v `render.py` u pomocné funkce pro čtení entit grafů, která blokovala import integrace a konfigurace v Home Assistantu.
  - Všechny soubory integrace byly zkontrolovány a ověřeny pro bezproblémový běh.

## Novinky ve verzi 0.1.91

- **Výběr Home Assistant entity pro každý objekt (grafy, ukazatele, potenciometry, texty)**:
  - Do inspektoru vlastností v Editoru prvku přidán výběr entit Home Assistantu (`<ha-entity-picker>`) pro každý grafický objekt (sloupcový ukazatel, koláčový graf, posuvník, potenciometr i text).
  - Každý objekt ve vrstvě může cílit na konkrétní entitu Home Assistantu (`entity_id`) a libovolný její atribut (`entity_attribute`).
- **Nové přepracování Mapy připojení na hlavní stránce**:
  - Kompletně přebudovaný flex/grid systém spojovacích tras mezi Home Assistantem, Wi-Fi gatewayemi a BLE eInk displeji.
  - Čisté vizuální propojovací větve s dynamickým přizpůsobením, které se nerozbíjejí při více připojených displejích ani na mobilních zařízeních.

## Novinky ve verzi 0.1.90

- **Sjednocený Editor prvku s Editorem displeje**:
  - Objekty ve vrstvách vlastních prvků nyní mají 8 rohových a bočních úchytů pro změnu velikosti přímo na plátně.
  - Přidán horní oranžový rotační úchyt pro otáčení s podporou 15° krokového přichytávání (Shift).
  - Vnitřní plátno je zasazeno do totožného rámečku eInk displeje s indikací rozlišení.
  - Vytvořen 3-sloupcový layout s inspekčním panelem vpravo a novou liškou nástrojů.

## Novinky ve verzi 0.1.89

- **Oprava `this._saveProjects is not a function`**: Opraveno ukládání vlastních prvků v Editoru prvku.
- **Výběr zaměřené hodnoty / atributu u všech grafů**:
  - U sloupcových ukazatelů, koláčových/donut grafů, posuvníků a potenciometrů lze nastavit cílový `entity_attribute` (např. `temperature`, `humidity`, `battery`, `power`, `current`, `voltage`, `pressure` atd.).
  - Přidána testovací / náhledová hodnota (`sample_value`) pro otestování stupnice a ručičky přímo v inspektoru.
  - Modul `render.py` automaticky extrahuje zvolený atribut i pro automatické aktualizace na eInk displejích.

## Novinky ve verzi 0.1.88

- **Nové dynamické ukazatele v Editoru prvku**:
  - Sloupcový ukazatel (Bar / Progress Gauge), Koláčový a Donut graf (Pie / Donut Chart), Posuvník (Slider Widget) a Potenciometr / Rotační budík (Rotary Dial / Gauge).
  - Volitelné vlastní limity (min/max), jednotky (`°C`, `%`, `kW`, `bar`, `lx`, `Pa` atd.) a typy stupnic (240°, 180°, 360°).
- **Přepracovaná Fronta zápisu (Queue Suite)**:
  - Kapacita historie navýšena ze 20 na 100 záznamů, filtrování, vyhledávání, vyčištění a tlačítko rychlého obnovení (10s/15s).
  - Banner upozornění na přeskočené aktualizace s analytikou důvodů.
- **Oficiální `CHANGELOG.md`**: V kořenu repozitáře přidána podrobná dokumentace historie verzí.

## Novinky ve verzi 0.1.87 & 0.1.86

- Hotfix `SyntaxError` v `render.py` pro bezproblémové načítání integrace v Home Assistantu.
- Opraveno zobrazování ikony rozšíření při přidávání registrů v Home Assistantu.
- Sjednoceno otáčení displejů přímo v `render.py`.

## Novinky ve verzi 0.1.81

- přidána karta `DRATEK eInk – přehled` pro hlavní dashboard Home Assistantu
- karta zobrazuje malé náhledy displejů, barevnou baterii, sílu signálu v dBm a aktivní sloupce signálu
- u každého displeje je vidět použitá cesta přes Home Assistant Bluetooth nebo gateway
- součástí karty je kompaktní přehled gatewayí s online stavem, IP adresou a Wi-Fi signálem
- kliknutí na displej otevře panel DRATEK eInk a kliknutí na gateway otevře její webové rozhraní
- karta má grafické nastavení názvu, počtu displejů, gatewayí a intervalu obnovení
- více karet sdílí jeden výsledek vyhledávání, aby zbytečně neopakovaly BLE scan

### Přidání karty na Přehled

1. Otevři hlavní dashboard a zvol **Upravit dashboard**.
2. Klikni na **Přidat kartu**.
3. Vyber **DRATEK eInk – přehled**.
4. Nastav počet displejů, zobrazení gatewayí a interval obnovení.

Kartu lze vložit také přes YAML:

```yaml
type: custom:dratek-eink-overview-card
title: DRATEK eInk
max_displays: 6
show_gateways: true
refresh_interval: 60
```

## Novinky ve verzi 0.1.80

- správa gatewayí má nové moderní karty ve stejném vizuálním stylu jako hlavní přehled
- karta graficky ukazuje hardware ESP32 nebo ESP32-S3, na kterém gateway běží
- kliknutí kamkoliv na kartu otevře webové rozhraní gatewaye podle její IP adresy nebo hostitele
- na kartě jsou přehledně vidět firmware, BLE, Wi-Fi signál, doba běhu a připojené displeje
- technická diagnostika zůstává dostupná ve sbalovací části a ovládací tlačítka nevyvolávají otevření webu

## Novinky ve verzi 0.1.79

- levý panel Designeru HA prvků používá přehledné svislé karty: název, náhled a akce vrstvy
- pracovní náhled vrstvy má stejný rámeček zařízení jako Designer displeje
- barvy textu, tvarů, ikon a obrázků se vybírají z názorné barevné palety
- nahrané obrázky mohou zachovat původní barvy nebo být ručně přebarveny na černou, červenou či bílou
- přidána knihovna ikon: světlo, zásuvka, teploměr, voda, dům, napájení, baterie a signál

## Novinky ve verzi 0.1.78

- displej po jednom vynechaném BLE skenu okamžitě nezmizí; pět minut čeká na další reklamu
- dočasně nezachycený displej zůstane dostupný a je označen oranžovým stavem
- na hlavní stránce se sken automaticky opakuje každých 30 sekund
- návrhy displejů se načítají jedním společným požadavkem místo samostatného požadavku pro každou kartu
- náhledy displejů a vlastní HA prvky se ihned obnoví z lokální cache

## Novinky ve verzi 0.1.77

- vlastní HA prvky lze vložit přímo z palety hlavního Designeru displeje
- výběrové orámování objektu je samostatná UI vrstva a nikdy se neukládá do obrazu eInk
- Designer HA prvků má nové responzivní rozložení bez překrývání panelů
- texty, tvary a nahrané ikony lze přebarvit pro černobílý nebo červeno-černý eInk
- přebarvení obrázků zachovává průhlednost a funguje stejně v náhledu i při renderování

## Novinky ve verzi 0.1.76

- Designer HA prvků je nově samostatná knihovna vlastních rozhraní
- každý prvek obsahuje jednu nebo více grafických vrstev pro různé stavy zařízení
- do vrstev lze vkládat texty, tvary a vlastní obrázky, měnit jejich barvy, rozměry a polohu
- objekty lze přesouvat přímo myší v grafickém náhledu
- samostatný krok pravidel propojí prvek s entitou nebo atributem Home Assistantu
- vrstvy lze přepínat podle stavů zapnuto/vypnuto, přesné hodnoty, textu nebo číselných limitů
- výchozí vrstva se použije, pokud žádné pravidlo neplatí
- změna entity, která nevede ke změně vybrané vrstvy, nevytvoří zbytečnou aktualizaci displeje
- dřívější vlastní prvky se při otevření automaticky převedou do nového vrstveného formátu
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.75

- opravena rozbitá ikona v README na GitHubu použitím stabilní raw adresy
- ověřeny PNG soubory loga i všech světlých a tmavých brand variant pro Home Assistant / HACS
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.74

- v Designeru HA prvků přibyl nový typ **Vlastní ikona** s výběrem souboru i přetažením obrázku
- obrázek se před uložením bezpečně zmenší, normalizuje do PNG a zbaví metadat
- ikona se do hlavního designeru vloží jako čtvercový blok, který lze přesouvat, otáčet a měnit tažením za rohy
- každý displej má vlastní minimální interval automatické aktualizace od 30 sekund do 24 hodin
- výchozí bezpečný interval je jedna minuta a platí i po restartu Home Assistantu
- změny více senzorů se během intervalu sloučí a na displej se odešle pouze jeden nejnovější obraz
- interval lze změnit i u již aktivní automatizace bez opětovného nahrání návrhu
- interval se počítá i po neúspěšném pokusu, aby chyba přenosu nevytvořila rychlou smyčku vybíjející baterii
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.73

- Designer HA prvků je zjednodušený do čtyř kroků: typ, entita, chování a vzhled
- pokročilé atributy, jednotlivá podmínková pravidla a rozměry jsou schované v přehledných rozbalovacích blocích
- po uložení zůstane stejný prvek otevřený k dalším úpravám a formulář se už nevymaže
- překreslení formuláře zachovává pozici stránky, otevřené pokročilé bloky i pozici knihovny
- spodní ukládací lišta zůstává dostupná i při úpravě delší konfigurace
- výběr entity ignoruje duplicitní události, takže už nezpůsobuje zbytečné překreslování a nespolehlivé prokliky
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.72

- změna výsledné ikony nebo dynamické hodnoty spustí vytvoření nového obrazu přibližně do 150 ms
- automatické překreslení už po ručním uploadu neblokuje původní 50sekundový cooldown
- změny vzniklé během probíhajícího zápisu se sloučí a po jeho dokončení se vždy odešle nejnovější stav
- automatický zápis přerušený ručním uploadem se po uvolnění displeje sám zopakuje
- několik rychlých změn stejné entity nevytvoří souběžné BLE přenosy ani zbytečné duplicitní obrazy
- u podmíněné signalizace se přenos spustí jen tehdy, když změna entity skutečně změní výsledný symbol
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.71

- původní editor API prvků nahradil nový **Designer HA prvků** založený výhradně na entitách Home Assistantu
- stavová signalizace podporuje až osm seřazených pravidel a operátory zapnuto, vypnuto, rovná se, nerovná se, větší, menší a obsahuje
- ke každému pravidlu lze vybrat vlastní eInk symbol a nastavit výchozí symbol pro stav, kterému neodpovídá žádné pravidlo
- připravené šablony vytvoří jedním kliknutím signalizaci zásuvky ON/OFF, teplotní limity nebo obecný číselný limit
- graf může průběžně ukládat poslední změny číselného senzoru nebo vykreslit číselný seznam z vybraného atributu
- pravidla i grafy se vyhodnocují při změnách entit a automaticky spouštějí překreslení displeje
- externí API už není v uživatelském rozhraní dostupné a dřívější URL prvky se při odesílání nenačítají
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.70

- načítání JSON API je předělané na čtyřkrokový modulární průvodce: adresa, datová sada, přiřazení a náhled
- odpověď se automaticky rozdělí na srozumitelné datové sady a sloupce, takže uživatel nemusí znát ani psát JSON cesty
- pro ukázkovou strukturu lze jednoduše zvolit sadu `slots`, hodnotu `czk` a popisek `t`
- každá datová sada zobrazuje počet záznamů a každý sloupec ukázku skutečně načtených hodnot
- chybná nebo zastaralá cesta už nezablokuje načtení struktury API a uživatel může přiřazení opravit v menu
- výsledné technické přiřazení se zobrazuje pouze jako přehled a ukládá se automaticky s prvkem
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.69

- po načtení JSON API se zobrazí průzkumník nalezených datových polí s ukázkou hodnot a počtem položek
- uživatel může z rozbalovacího seznamu vybrat samostatně hodnoty grafu a textové nebo časové popisky
- podporované jsou projekce polí z pole objektů, například `slots[].czk` a `slots[].t`
- pro graf se automaticky předvybere první nalezená číselná řada a odpovídající textová řada ze stejné části JSON
- vybrané cesty, načtená data i popisky se ukládají s vlastním prvkem a znovu používají při každém nahrání návrhu
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.68

- na hlavní liště přibyla knihovna **Vytvořit vlastní prvek** pro opakovaně použitelné prvky Home Assistantu
- vlastní prvek může zobrazovat hodnotu, stavovou ikonu nebo čárový, plošný či sloupcový graf
- zdrojem dat může být entita Home Assistantu včetně atributu nebo HTTP/HTTPS adresa s volitelnou cestou v JSON datech
- stavové ikony podporují vlastní symbol zapnuto/vypnuto a nastavitelný seznam aktivních hodnot
- prvky lze vložit do právě vybraného návrhu nebo jedním krokem uložit do návrhů všech nalezených displejů
- prvky napojené na entity se po nahrání návrhu automaticky aktualizují stejně jako ostatní dynamický obsah
- data z URL se znovu načtou před každým ručním odesláním návrhu a jejich dostupnost lze ověřit přímo v editoru prvku
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.67

- nové logo DRATEK.CZ eInk je viditelně použité také v záhlaví repozitáře na GitHubu
- původní brand ikony integrace byly nahrazené stejným logem, které používá panel
- doplněné jsou světlé, tmavé a dvojnásobné varianty ikon a log pro Home Assistant 2026.3 a novější
- HACS a obrazovky integrace Home Assistantu tak používají nové logo místo původního tmavého symbolu

## Novinky ve verzi 0.1.66

- informace o aktivním displeji jsou sloučené do jednoho kompaktního bloku
- přepínač orientace má výrazné ikony pro zobrazení na šířku a na výšku
- levý panel používá úspornou mřížku ikon s názvy dostupnými po najetí myší
- Inspector i vrstvy jsou užší a mají kompaktnější ovládací prvky
- fyzický rámeček v designeru používá stejné proporce jako náhled na hlavní stránce
- při otočení displeje se správně otočí také fyzické rozložení obrazovky, adresa a čárový kód
- velikost adresy a čárového kódu v designeru se škáluje společně s náhledem zařízení

## Novinky ve verzi 0.1.65

- designer má nové jednoduché moderní rozložení sjednocené s hlavní stránkou rozšíření
- nad pracovní plochou je přehledný řádek s názvem, adresou, rozlišením, baterií, signálem a způsobem připojení displeje
- orientace displeje je výrazně dostupná přímo v informačním řádku
- katalog prvků je vlevo, fyzický náhled uprostřed a vlastnosti vybraného objektu v Inspectoru vpravo
- nástroje, vrstvy, pracovní plocha a Inspector používají stejné karty, barvy a ovládací prvky jako hlavní stránka
- RGB dioda je přesunutá do rozbalovacího doplňkového nastavení v nabídce Pozadí a zařízení
- designer se plynule skládá pro užší obrazovky

## Novinky ve verzi 0.1.64

- logo i font designeru se načítají ze správné statické cesty panelu `/dratek_eink_panel`
- svislá adresa v náhledu displeje 296 × 128 už není otočená o 180 stupňů
- stejný směr adresy je opravený také na fyzickém rámečku v designeru

## Novinky ve verzi 0.1.63

- mapa připojení má opravené větvení spojnic mezi jednou gatewayí a všemi jejími displeji
- fyzický náhled modelů 296 × 128 zobrazuje svislou adresu a skutečný Code 128 čárový kód na pravé straně rámečku
- stejné rozložení adresy a čárového kódu je použité také kolem pracovní plochy designeru
- designer obsahuje funkční ovládání RGB diody: vypnutí, trvalé svícení, blikání, vlastní barvu a barevné předvolby
- nastavení RGB diody se ukládá samostatně pro každý displej a odesílá se příkazem výrobního SDK `0x30`
- nové logo DRATEK.CZ eInk nahradilo původní značku DE v záhlaví a v prázdném stavu vyhledávání
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.62

- model EPA LCD 296x128 1 BWR se SDK typem 51 používá potvrzovaný GATT zápis každého obrazového bloku
- odmítnutý blok tohoto modelu se zopakuje až třikrát místo pokračování s neúplným obrazem
- ostatní typy displejů si zachovávají dosavadní rychlý zápis bez potvrzení jednotlivých bloků
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.61

- nad segmentovanou ikonou je název Baterie nebo Signál a naměřená hodnota je přehledně pod ní
- původní vodorovný ukazatel baterie byl odstraněn
- baterie i signál používají stupnici červená, oranžová, žlutá a zelená podle aktuální úrovně
- chybějící volitelné závěrečné potvrzení po kompletním odeslání obrazu už neoznačí přenos jako neúspěšný
- staré chyby závěrečného potvrzení se při načtení historie opraví na úspěšně odeslané přenosy
- duplicitní automatické aktualizace stejného displeje se neskládají ve frontě
- ruční upload přeruší automatickou aktualizaci stejného displeje a okamžitě získá prioritu
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.60

- uložené návrhy se po návratu na stránku znovu načtou do náhledů a nezůstanou označené jako prázdné
- cache displejů se zobrazí okamžitě a následný tichý scan na pozadí přidá nově dostupné displeje a odstraní zmizelé
- baterie i signál používají čtyři barevné segmenty, jejichž počet a barva odpovídají aktuální úrovni
- mapa připojení seskupuje displeje podle aktivní trasy, takže každou gateway zobrazuje pouze jednou se všemi jejími displeji
- celá karta náhledu displeje je klikací, při najetí se modře zvýrazní a otevře designer správného zařízení
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.59

- nalezené displeje se ukládají do desetiminutové lokální cache a po návratu do panelu se zobrazí okamžitě
- automatický scan se při čerstvé cache nespouští znovu; ruční Obnovit zůstává vždy dostupné
- zápisy stejného displeje se serializují společným zámkem i při použití rozdílných přenosových cest
- ruční upload má přednost před čekajícími automatickými aktualizacemi a po dokončení aktivuje 50sekundový cooldown
- zastaralé minutové automatické úlohy se bezpečně přeskočí místo hromadění ve frontě
- závěrečné potvrzení obnovy čeká až 45 sekund a po timeoutu se celý již odeslaný obraz neposílá znovu
- každá přenosová úloha má čtyřminutový bezpečnostní limit, po kterém se zámek vždy uvolní
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.58

- designer má nové stabilní třípanelové rozložení pro nástroje, pracovní plochu, Inspector a vrstvy
- pracovní canvas je zasazený do stejného symetrického fyzického rámečku displeje jako náhled na hlavní stránce
- celý panel používá barevnost Drátek.cz: tyrkysovou, oranžovou a tmavé neutrální odstíny
- obnovený grafický stav baterie s procenty, napětím a barevným ukazatelem kapacity
- obnovené dynamické sloupky signálu, které mění počet a barvu podle síly připojení
- ikona aktivní cesty rozlišuje lokální Bluetooth a Wi-Fi gateway
- náhled displeje se postupně zmenšuje v plném, velkém a malém zobrazení
- seznamové zobrazení náhled skrývá a soustředí se na identitu, stav a rychlé akce
- rozložení karet je upravené pro jednotlivé hustoty i úzké mobilní obrazovky
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.57

- panel po otevření automaticky vyhledá dostupné displeje; ruční tlačítko zůstává jen pro obnovení
- lokální BLE přenos používá přímo connectable zařízení vybrané Bluetooth managerem Home Assistantu
- při dočasně obsazeném Bluetooth slotu přenos počká a opakuje spojení s odstupňovanými prodlevami
- zobrazovací plocha je přesně uprostřed těla displeje se stejně širokým levým a pravým rámečkem
- svislý výrobní kód je umístěný přímo v levém rámečku a už neposouvá náhled obrazovky
- odstraněný je podklad a popis pod náhledem; rozlišení je nově v čistém štítku v záhlaví karty
- karty displejů mají nové záhlaví, stavové bloky pro baterii, signál a připojení a sjednocené akce
- z uživatelských karet byly odstraněné technické štítky SW, HW, interní profil a typ full/partial update
- přepracované jsou také kompaktní, seznamové a mobilní varianty karet
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.56

- každá karta nalezeného displeje zobrazuje živý náhled jeho uloženého pracovního návrhu
- náhled je zasazený do tvaru fyzického eInk displeje podle dodaného vzoru včetně svislého výrobního kódu
- rámeček i zobrazovací plocha se automaticky přizpůsobují rozlišení a orientaci konkrétního displeje
- náhledy fungují v plném, kompaktním i seznamovém zobrazení a používají skutečné černé, bílé a červené eInk barvy
- proměnné napojené na entity Home Assistantu se v náhledu vykreslují s aktuální hodnotou
- displej bez uloženého návrhu zobrazuje jasně označenou prázdnou obrazovku
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.55

- Inspector v designeru je rozdělený do přehledných sekcí pro pozici, obsah, vzhled a datový zdroj
- barvy textu, výplní, rámečků, grafů, QR a EAN kódů se vybírají pomocí skutečných barevných vzorků
- rotace, zarovnání textu a typ grafu používají rychlé ikonové přepínače
- volby jako tučné písmo, automatické přizpůsobení, mřížka nebo zachování poměru stran mají sjednocené karty s ikonami
- záhlaví Inspectoru zobrazuje ikonu a název právě vybraného objektu
- firmware gateway zůstává 0.1.41-gateway

## Novinky ve verzi 0.1.51

- promenny text lze zapnout pro automaticke odeslani pri zmene navazane entity nebo Pomocnika Home Assistantu
- vazba, ciste pozadi navrhu i zvolena cesta pres Bluetooth nebo gateway se ulozi do Home Assistantu po prvnim uspesnem rucnim odeslani
- dalsi zmeny hodnoty fungují i pri zavrenem designeru a po restartu Home Assistantu
- rychle zmeny stejne entity se slouci po 2 sekundach, aby se eInk zbytecne neprekresloval
- automaticke zapisy pouzivaji beznou frontu a jsou v ni oznaceny jako `Automaticka zmena entity`
- ruzne gatewaye mohou zpracovavat sve fronty nezavisle; zapisy pres stejnou gateway zustavaji bezpecne serializovane
- automaticky se v teto verzi aktualizuji textove objekty; grafy nad entitou se nadale aktualizuji pri rucnim odeslani
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.50

- opraveno psani do nazvu promenne v Inspectoru; pole uz po prvnim znaku neztrati fokus
- klavesy stisknute ve formularich designeru se nepredavaji globalnim zkratkam, hledani ani Assist chatu Home Assistantu
- promenny text a graf lze primo v Inspectoru propojit s existujici entitou nebo Pomocnikem Home Assistantu
- vyber entity pouziva standardni vyhledavac entit HA a podporuje napriklad `input_text`, `input_number` i senzory
- lze pouzit hlavni stav entity nebo zadat konkretni atribut, napriklad pole `prices` se spotovymi cenami
- Inspector i dialog Promenne zobrazuji zdrojovou entitu, jeji ID a aktualni hodnotu
- pri zmene navazane entity se otevreny nahled automaticky prekresli a pri odeslani se pouzije nejnovejsi hodnota
- vazba na entitu se uklada jako editovatelna soucast projektu i konceptu konkretniho displeje
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.49

- opravena interpretace baterie: hodnota z BLE reklamy je napeti CR2450 v desetinach voltu, nikoli procenta
- zbyvajici kapacita se odhaduje nelinearni interpolaci podle typickych vybijecich krivek CR2450 Panasonic a Energizer
- seznam displeju ukazuje odhad procent i skutecne napeti, napriklad `≈ 85 % · 3,0 V`
- ukazatel a jeho barva se ridi prepocitanym procentem, ne surovou hodnotou z BLE paketu
- backend poskytuje zvlast puvodni hodnotu, napeti, odhad procent a priznak, ze jde o odhad
- vypocet zachova presnejsi napeti, pokud je budouci scanner nebo firmware poskytne
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.48

- novy graf je ve vychozim stavu sloupcovy
- obsahuje 24 realistickych ukazkovych hodinovych cen pro denni spotovy trh
- kazdy graf automaticky vytvari datovou promennou, ktera je ihned dostupna v menu Promenne
- promenna grafu pouziva viceradkove datove pole s navodem pro JSON, seznam i ceskou desetinnou carku
- starsi grafy bez promenne se pri otevreni dialogu Promenne automaticky doplni
- sloupce mohou byt cerne, cervene nebo bile; bile sloupce maji jednopixelovy cerny ramecek
- lze nastavit velikost textu legendy, popisku os, hodin a zobrazovanych hodnot
- opravena je zmena nazvu promenne i duplikovani grafu vcetne jeho dat
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.47

- po odeslani navrhu se zobrazi pouze strucny vysledek; dlouhy technicky log uz designer neroztahuje
- nahled vzdy pouziva skutecne barvy eInk a tato volba se uzivateli jiz nenabizi
- projekt ma vlastni bile, cerne nebo cervene pozadi, ktere vyplni vsechny adresovatelne pixely displeje
- vice objektu lze oznacit vyberovym obdelnikem tazenim mysi; Shift zachova predchozi vyber
- vedle Inspectoru je novy panel Objekty se seznamem vrstev od popredi k pozadi
- kliknutim v panelu Objekty lze prvek vybrat a sipkami menit jeho poradi ve vrstvach
- barva pozadi se uklada do internich navrhu, automatickych konceptu i exportovanych projektu
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.46

- designer je zamceny, dokud uzivatel explicitne neotevre konkretni nalezeny displej
- scan jiz automaticky nevybira prvni nalezeny displej, takze nemuze vzniknout navrh pro nespravne rozliseni
- opravena poskozena cestina a Unicode znaky v mapovani 2,9palcoveho displeje, sablonach a celem katalogu symbolu
- kategorie symbolu a hlavni dialogy pouzivaji spravne ceske popisky
- pridan plnohodnotny objekt Graf se spojnicovym, sloupcovym a plosnym zobrazenim
- graf podporuje nazev, popisky os a bodu, mrizku, hodnoty, automaticke i rucni minimum a maximum a omezeni poctu bodu
- data grafu lze zadat jako seznam, JSON pole nebo ceska desetinna cisla oddelena strednikem
- data grafu lze oznacit jako promennou pro hodnoty z Home Assistantu
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.45

- horni ribbon designeru ma sjednocene zelene karty Soubor, Promenne, Zobrazeni, Nastroje a Rozlozeni
- Odeslat navrh je presunuto z hlavicky aplikace primo do designeru a barevne odliseno
- projekty lze exportovat do editovatelneho souboru a znovu je ze souboru otevrit
- export zachovava objekty, obrazky, promenne, orientaci, rozliseni i nastaveni barev
- karta Nastroje obsahuje inverzi cerne a bile vcetne vlozenych obrazku
- karta Rozlozeni obsahuje orientaci na sirku a na vysku i mapovani 2,9palcoveho displeje
- pri zmene orientace se existujici objekty otoci spolu s pracovni plochou; opraven je i zpetny smer otoceni
- zoom, prizpusobeni, prichytavani k mrizce a realne barvy eInk jsou presunuty do karty Zobrazeni
- firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.44

- karta Soubor je vyrazne zelena a pouziva prehledne rozlozeni ve stylu kancelarskych aplikaci
- rucni volba integrovaneho Bluetooth nebo gateway byla z designeru odstranena; vzdy se pouzije automaticky nejlepsi cesta
- technicka tlacitka pro odeslani pres gateway a testovaci text byla odstranena
- realne barvy eInk jsou dostupne cesky v nabidce Zobrazeni
- promenne navrhu se upravuji v samostatnem dialogu
- sablony jsou dostupne pres Soubor > Otevrit sablonu
- novy projekt nabidne prazdnou pracovni plochu nebo vyber sablony
- verze firmware gateway zustava 0.1.41-gateway

## Novinky ve verzi 0.1.43

- nalezene displeje lze pojmenovat vlastnim nazvem, napriklad Kuchyn nebo Obyvak
- nazvy jsou ulozene interne podle BLE adresy a zustavaji zachovane po restartu i aktualizaci
- uzivatelsky nazev se zobrazuje v kartach displeju, mape pripojeni a designeru
- karty displeju maji samostatne akce pro pojmenovani a otevreni v designeru
- horni cast designeru je zjednodusena na nazev displeje, BLE adresu a kompaktni rozliseni
- odstraneny siroke metriky rozliseni a poctu objektu
- projektove prikazy Novy, Ulozit, Nacist a Smazat jsou presunuty do rozbalovaci karty Soubor
- nabidka Soubor zobrazuje pouze projekty pro aktualni rozliseni displeje

## Novinky ve verzi 0.1.42

- sjednocen text `Sprava gateway` v cele uzivatelske casti
- verze Home Assistant integrace a firmware gateway jsou nyni verzovany nezavisle
- funkcne shodne firmware 0.1.40 a 0.1.41 se zobrazuji jako aktualni a nenabizeji zbytecnou OTA aktualizaci
- gateway nalezena pres mDNS se porovna s ulozenymi podle ID, IP a hostname
- u jiz ulozene gateway se zobrazi jeji uzivatelsky nazev a nenabizi se tlacitko Pridat

## Novinky ve verzi 0.1.41

- pridana hlavni karta Fronta zapisu s zivym stavem cekajicich a probihajicich prenosu
- zapisy se serializuji samostatne pro Home Assistant Bluetooth a pro kazdou DRATEK gateway
- poslednich 20 vysledku se uklada interne v Home Assistantu vcetne cesty, casu, vysledku a chyby
- karta nalezenych displeju se jiz sama neskenuje a obsahuje pouze rucni scan, displeje a mapu pripojeni
- mapa pripojeni je pod seznamem displeju a RSSI je zobrazeno graficky i barevne
- odstraneny souhrnne Bluetooth metriky a technicky Bluetooth debug z uzivatelskeho rozhrani
- doplneny brand assety pro svetly i tmavy motiv Home Assistantu a HACS

## Novinky ve verzi 0.1.40

- seznam displeju spojuje integrovane Bluetooth v Home Assistantu a vsechny ulozene gatewaye
- u kazdeho displeje je videt dostupna cesta, jeji signal a automaticky vybrana nejlepsi cesta
- nova graficka mapa zobrazuje vazby mezi Home Assistantem, pojmenovanymi gatewayemi a displeji
- sprava gateway je rozdelena na samostatne karty pro spravu, vyhledani v siti a vytvoreni gatewaye
- gateway lze kdykoliv prejmenovat, napr. na `Gateway chodba` nebo `Gateway patro`
- sprava gateway zobrazuje graficky Wi-Fi signal a stav BLE sluzby
- firmware gatewaye vraci kompletni vyrobni BLE data, takze HA rozpozna model i u displeje dostupneho pouze pres gateway

## Novinky ve verzi 0.1.39

- kompletne prepracovana webova administrace gatewaye na portu 80
- prehledny dashboard pro Wi-Fi, BLE, pamet, firmware, prenosy, mDNS a OTA
- BLE scan lze spustit primo z webu a vysledky se zobrazuji v tabulce se silou signalu
- sitove nastaveni je oddelene, podporuje DHCP i statickou IP a pouziva JSON API
- stranka je responzivni, funguje bez internetu a nacita se primo z flash pameti
- odstraneno stare formulare API `/config-form`

## Novinky ve verzi 0.1.38

- pridana aktualizace firmware gatewaye pres sit primo z Home Assistantu
- HA automaticky rozpozna ESP32 nebo ESP32-S3, nahraje spravny firmware a po restartu overi jeho verzi
- OTA zapis je streamovany, kontrolovany pomoci MD5 a behem aktualizace je BLE prenos uzamceny
- nove partition tabulky odstranuji nepouzivany SPIFFS a zvetsuji oba OTA sloty
- ESP32 ma nyni dva aplikacni sloty po 1,875 MB; ESP32-S3 dva sloty po 3,875 MB
- odstranena stara duplicitni prenosova API; aktualni multipart prenos do eInk zustava zachovan

> **Dulezite:** verzi 0.1.38 je nutne nahrat do kazde gatewaye jeste jednou pres USB. Tim se zapise nova partition tabulka a aktivuje OTA. Vsechny dalsi aktualizace uz lze instalovat tlacitkem v karte gatewaye.

## Novinky ve verzi 0.1.37

- Přenos obrazových bloků nyní přesněji kopíruje původní SDK: každý blok čeká na potvrzení GATT zápisu, nikoli na notifikaci displeje.
- Opraveno opakované odesílání prvního bloku u displejů se softwarem řady 129.
- Chybějící samostatná závěrečná notifikace již není chybně hlášena jako neúspěšný přenos, pokud BLE potvrdilo všechny bloky.

## Novinky ve verzi 0.1.36

- bloky se odesilaji request-driven podle originalniho Picksmart SDK protokolu
- gateway po kazdem bloku ceka na `05 00` pozadavek displeje na konkretni dalsi blok
- displej muze vyzadat opakovani ztraceneho bloku a gateway ho automaticky posle znovu
- kontroluje se navratova hodnota BLE write fronty a neuspesny zapis ma az pet pokusu
- po poslednim bloku se na fyzicke prekresleni a potvrzeni `05 08` ceka az 60 sekund

## Novinky ve verzi 0.1.35

- opraven restart ESP32 zpusobeny zakazanym `WiFi.setSleep(false)` pri soucasne aktivnim BLE
- Wi-Fi modem sleep je znovu zapnuty, jak vyzaduje ESP32 Wi-Fi/Bluetooth coexistence
- odstraneny neskodne NVS `NOT_FOUND` chyby pro dosud nenastavenou statickou IP, gateway, masku a DNS
- oprava resi boot loop s hlaskou `Should enable WiFi modem sleep when both WiFi and Bluetooth are enabled`

## Novinky ve verzi 0.1.34

- NimBLE se inicializuje pred Wi-Fi, mDNS, webserverem a alokaci obrazoveho payloadu
- gateway firmware zapina pouze BLE role central a observer a omezuje pocet BLE spojeni na jedno
- BLE GAP jmeno gatewaye je prazdne, protoze gateway jako central zadne reklamni jmeno nepotrebuje
- prenosova uloha startuje az sekundu po HTTP potvrzeni uploadu
- po `Connection reset by peer` HA automaticky nacte reset reason, uptime, heap a stav BLE gatewaye

## Novinky ve verzi 0.1.33

- obraz se do gatewaye nahrava jako streamovany binarni multipart misto base64 textu
- ESP32 uz pri uploadu nedrzi velkou textovou a dekodovanou kopii stejneho obrazku
- upload se zpracovava po blocich a ma ochranu proti prilis velkemu payloadu
- retry pouziva stejne ID ulohy a nemuze omylem spustit duplicitni BLE prenos
- oprava cilí na `Connection reset by peer` pri nahravani prenosove ulohy

## Novinky ve verzi 0.1.32

- BLE se inicializuje az pri prvnim BLE scanu nebo prenosu, ne pred spustenim sitovych sluzeb
- HTTP administrace a mDNS jsou tak dostupne i v pripade problemu inicializace Bluetooth
- `/api/status` ukazuje samostatne stav mDNS a inicializace BLE
- USB status cte seriovy vystup 12 sekund a zachyti cely start i pripadny pad po prvni JSON odpovedi
- vyhledavani zustava ciste pres mDNS; IP scan nebyl pridan

## Novinky ve verzi 0.1.31

- mDNS oznameni gatewaye se automaticky obnovi po vypadku a navratu Wi-Fi
- firmware zapina automaticke znovupripojeni Wi-Fi a periodicky obnovuje mDNS registraci
- gateway se oznamuje jako vlastni sluzba `_dratek-eink-gateway._tcp` i standardni HTTP sluzba
- vyhledavani gateway v Home Assistantu ceka na mDNS 10 sekund misto 5
- odesilani dat nadale pouziva nalezenou IP adresu, aby mDNS neovlivnovalo stabilitu prenosu

## Novinky ve verzi 0.1.30

- odesilani pres gateway pouziva asynchronni prenosove ulohy misto jednoho dlouheho HTTP spojeni
- gateway potvrdi prijeti obrazku okamzite a Home Assistant pak prubezne nacita stav a log prenosu
- odstranena rekurzivni obsluha HTTP serveru uvnitr BLE prenosu, ktera mohla zpusobit `Server disconnected`
- base64 payload se zbytecne nekopiruje a prenosovy log ma omezenou velikost
- BLE scan a dalsi prenos jsou pri obsazene gateway bezpecne odmitnuty chybou `gateway_busy`
- diagnostika gatewaye ukazuje duvod restartu, minimalni volnou heap a nejvetsi souvisly blok pameti
- Wi-Fi uspavani je behem provozu gatewaye vypnute kvuli stabilite soubezneho Wi-Fi a BLE provozu

## Novinky ve verzi 0.1.29

- gateway odesilani v HA preferuje posledni znamou IP adresu gatewaye misto `.local`
- pridani gatewaye z vyhledani ted uklada IP adresu, ne mDNS hostname
- HTTP odeslani pres gateway ma jeden retry pri vypadku spojeni
- firmware gatewaye po neuspesnem BLE connect pokusu vytvori novy BLE klient
- BLE scan pred connectem je prodlouzeny na 6 sekund

## Novinky ve verzi 0.1.28

- gateway pred pripojenim k displeji udela kratky BLE scan cilove adresy
- BLE connect pres gateway ma tri pokusy a detailnejsi log
- pokud gateway displej uvidi ve scanu, pripojuje se pres nalezeny advertised device

## Novinky ve verzi 0.1.27

- opraven UTF-8 BOM na zacatku manifestu a frontend souboru, ktery mohl shodit HACS update/install hlaskou `unexpected character: line 1 column 1`

## Novinky ve verzi 0.1.26

- opraveno zkraceni payloadu pri gateway odesilani do displeje
- gateway ted pouziva `/api/send-b64`, tedy base64 telo bez velkeho JSON obalu
- v logu gatewaye je videt delka prijateho base64 a skutecny pocet dekodovanych bajtu
- cerveny nebo poskozeny obraz po gateway prenosu byl zpusoben nekompletnim payloadem

## Novinky ve verzi 0.1.25

- odesilani pres gateway uz neposila velky base64 JSON, ale binarni payload pres `/api/send-bin`
- tim se vyrazne snizuje narocnost na RAM v ESP32 pri prenosu navrhu do displeje
- firmware gatewaye loguje volnou heap pamet pred a po BLE prenosu

## Novinky ve verzi 0.1.24

- flashovaci log gatewaye drzi scroll dole, aby byla videt ziva data
- v designeru lze vybrat ulozenou gateway a poslat navrh pres ni
- firmware gatewaye ma prvni implementaci `POST /api/send` pro BLE prenos payloadu do DRATEK eInk displeje
- na portu 80 bezi jednoducha administrace gatewaye
- administrace umi zobrazit stav gatewaye a ulozit Wi-Fi/static IP nastaveni
- `/api/config` umoznuje cist a menit sitovou konfiguraci gatewaye

## Novinky ve verzi 0.1.22

- flash ESP32 gatewaye ma prubezny log primo v panelu
- flash bezi jako job a panel si log aktualizuje kazdou sekundu
- pridana USB diagnostika ESP32 gatewaye pres serial port
- tlacitko `USB status` zobrazi firmware, ulozene SSID, stav Wi-Fi, IP adresu a RSSI
- tlacitko `Poslat Wi-Fi` umozni znovu poslat Wi-Fi konfiguraci do uz flashnute ESP32 gatewaye
- firmware gatewaye umi odpovedet na serial prikaz `status`

## Novinky ve verzi 0.1.21

- pridana podpora flashovani gateway firmwaru do ESP32-S3
- flash pruvodce ma volbu `Typ ESP32`: `ESP32-S3` nebo `ESP32 / ESP32-WROOM`
- pro ESP32-S3 se pouziva spravny esptool chip `esp32s3` a samostatne S3 binarky
- opravena chyba `This chip is ESP32-S3, not ESP32. Wrong chip argument?`

## Novinky ve verzi 0.1.20

- pokud flash pruvodce nenajde zadny USB/serial port, zobrazi jasne varovani
- varovani vysvetluje, ze ESP32 musi byt pripojene primo k hardwaru, na kterem bezi Home Assistant
- doplneno upozorneni, ze ESP32 pripojene do jineho PC v siti nejde z HA flashnout

## Novinky ve verzi 0.1.19

- gatewaye se uz nemusi pridavat rucne, panel je umi hledat v siti pres mDNS
- karta `Gatewaye` ma tlacitko `Vyhledat gatewaye v siti`
- pridany flash pruvodce pro ESP32 primo v Home Assistant panelu
- flash pruvodce umi nacist USB/serial porty
- pri flashovani lze zadat Wi-Fi SSID, heslo a hostname gatewaye
- firmware po flashi dostane Wi-Fi konfiguraci pres USB serial a ulozi si ji do ESP32 pameti
- firmware se v siti hlasi jako mDNS sluzba `_dratek-eink-gateway._tcp.local`
- do integrace jsou pribalene binarky firmwaru pro ESP32 DevKit / ESP32-WROOM

## Novinky ve verzi 0.1.18

- pridana karta `Gatewaye` pro pripravu vlastnich ESP32 DRATEK eInk opakovacu
- gatewaye lze ulozit podle IP adresy nebo `.local` hostname
- panel umi overit stav gatewaye pres HTTP endpoint `/api/status`
- panel umi spustit BLE scan pres gateway endpoint `/api/scan`
- v repozitari je prvni vlastni ESP32 firmware v `firmware/dratek-eink-gateway`
- firmware zatim umi Wi-Fi, status API a BLE scan; prenos obrazku do cenovek bude dalsi krok

## Novinky ve verzi 0.1.17

- opraveno skakani stranky nahoru pri psani textu v inspectoru
- vybrane objekty jde posouvat sipkami na klavesnici
- `Shift` + sipka posune vybrane objekty o 10 px
- posun sipkami funguje i pro vice vybranych objektu a pro cary vcetne koncoveho bodu

## Novinky ve verzi 0.1.16

- vybrane objekty v designeru jdou smazat klavesou `Delete` nebo `Backspace`
- pridana vicekrokova historie zmen pro navrh
- pridana tlacitka `Zpet` a `Dopredu` v panelu uprav
- funguje `Ctrl+Z`, `Ctrl+Y` a `Ctrl+Shift+Z`
- historie se uklada pro objekty, vyber, promenne, layout a nastaveni transformace displeje

## Novinky ve verzi 0.1.15

- knihovna symbolu je vyrazne rozsirena
- nove kategorie: bezpecnost, zdravi, media, jidlo, obchod a priroda
- doplnene symboly pro pocasi, domacnost, energie, senzory, stavove indikace, lidi, cas, dopravu, finance, sipky a obecne znacky
- symboly jsou zamerne vybrane tak, aby mely sanci byt citelne i na malem eInk bitmapovem displeji

## Novinky ve verzi 0.1.14

- pridana brand ikona `brand/icon.png` a `brand/logo.png` pro Home Assistant / HACS
- `Real eInk colors` je ve vychozim stavu vypnute
- sablony jsou v editoru zobrazene jen jednou
- inspector textu uz nezobrazuje minimalni velikost, pouziva ji jen interne jako hranici citelnosti
- zmena velikosti textu v inspectoru se projevi rovnou v canvasu
- pridany nastroj `Symbol` s vyhledavanim a kategoriemi symbolu
- sablony pri vlozeni lepe zarovnavaji mensi popisky a dlouhe texty

## Novinky ve verzi 0.1.13

- textovy renderer je prepracovany na citelnost pro nizka eInk rozliseni
- editor pouziva jeden pevny font `Arial`, ktery je na malych bitmapach citelnejsi a predvidatelnejsi
- text uz se pri auto-fit nezmensuje pod citelne minimum
- dlouhy text se po dosazeni minima radsi lehce zuzi nebo zkrati, nez aby byl necitelny
- v inspektoru textu je nastavitelna minimalni citelna velikost

## Novinky ve verzi 0.1.12

- texty v sablonach maji inteligentni auto-fit do sveho boxu
- upravene skálovani fontu pri vlozeni sablony na uzke portretove displeje
- textovy renderer respektuje vodorovne a svisle zarovnani
- inspektor textu ma volbu fontu, zarovnani a automatickeho prizpusobeni velikosti
- novy vychozi font v editoru je Roboto, aby navrh pusobil blize Home Assistant UI

## Novinky ve verzi 0.1.11

- sablony jsou v Designeru videt ve velkem samostatnem panelu `Sablony navrhu`
- galerie sablon zustava i v levem sloupci, ale hlavni vyber je ted primo nad editorem
- verze v UI je zvednuta na `0.1.11`, aby bylo hned videt, ze se nacetl novy frontend

## Novinky ve verzi 0.1.10

- designer obsahuje galerii 10 predpripravenych sablon podle domacich scenaru
- sablony jsou editovatelne objekty, ne jen vlozene obrazky
- pridane sablony: pocasi, cena energie, dum, odpady, fotovoltaika, pracka, obyvak, kdo je doma, Wi-Fi a kalendar
- texty v sablonach obsahuji pripravene promenne pro pozdejsi napojeni na Home Assistant entity
- vlozeni sablony prepne navrh na portretovy layout a prizpusobi objekty aktualnimu rozmeru displeje

## Novinky ve verzi 0.1.9

- z Android SDK/AAR byla vytazena rozsahlejsi mapa typu displeju, SDK hodnot a rozliseni
- sken ted zobrazuje presnejsi modely pro vice DRATEK/Picksmart kompatibilnich typu displeju
- opravena interpretace SDK typu `296`, ktery podle SDK znamena `EPA LCD 800x480 BW`, ne PE29
- PE29/PE29R_V4_BLE zustava navazany na SDK typy `40`, `43`, `46`, `48` a `51`
- backend ma pripravenou partial-update cestu pres SDK prikaz `0x60`
- partial update je zamerne povoleny jen pro SDK typ `2635` (`EPA LCD 960x680 BWR`), protoze Android SDK pro ostatni typy vraci `not support part display`
- karty displeju ukazuji, jestli SDK pro dany typ podporuje partial update nebo jen full update

## Novinky ve verzi 0.1.8

- v horní liště panelu je vidět aktuální verze doplňku
- JavaScript panelu se registruje s verzí v URL, aby Home Assistant a prohlížeč nenačítaly starý frontend z cache
- web component se neregistruje podruhé, pokud HA ve stejné relaci načte nový modul vedle starého

## Novinky ve verzi 0.1.7

- kompletni vizualni redesign celeho HA panelu DRATEK eInk
- horni aplikacni lista ma profesionalni command bar s ikonami
- karta `Nalezene displeje` ma prehledne metriky, lepsi karty displeju a uhlazeny Bluetooth debug
- designer ma moderni editorove rozvrzeni s nastroji vlevo, pracovnim platnem uprostred a inspectorem vpravo
- ovladani projektu, vyber displeje, orientace, test odeslani a realny eInk nahled jsou vizualne sjednocene
- nastroje, vrstvy, zarovnani, zoom a prace s objekty pouzivaji ikony misto technicky pusobicich textovych znaku

## Novinky ve verzi 0.1.6

- 2,9" PE29 / PE29R_V4_BLE displeje maji v designeru vlastni kalibraci mapovani obrazu
- pro PE29 jde zvolit otoceni a zrcadleni prenosovych dat bez zmeny SDK typu
- vybrana transformace se uklada ke konkretni BLE adrese displeje
- odesilani navrhu posila zvolenou PE29 transformaci do backendu
- backend umi pro PE29 zabalit obraz ve vice variantach, aby slo doladit zrcadleni nebo posun realneho displeje

## Novinky ve verzi 0.1.0

- editor ma modernejsi trisloupcove rozhrani s ikonovou paletou nastroju
- QR kody se generuji pres vestaveny QR encoder, ne rucne kreslenou matici
- EAN-13 se vykresluje podle realneho EAN vzoru a cisla jsou oddelena od car
- pri prepnuti na displej s jinym rozlisenim se pracovni plocha hned prepocita na novy rozmer
- pri odesilani se kontroluje, ze velikost navrhu odpovida vybranemu displeji

## Novinky ve verzi 0.1.1

- rohy vybraneho objektu maji vetsi aktivni plochu pro snazsi chyceni mysi
- obrazky a QR kody se pri tazeni rohu zvetsuji a zmensuji proporcne
- kurzor na platne lepe ukazuje, kdy jde objekt presouvat nebo menit jeho velikost

## Novinky ve verzi 0.1.2

- Home Assistant si pamatuje samostatny pracovni navrh pro kazdy displej podle BLE adresy
- pri prepnuti na jiny nalezeny displej se automaticky ulozi aktualni navrh a nacte navrh vybraneho displeje
- pokud displej jeste vlastni navrh nema, editor zobrazi prazdnou plochu ve spravnem rozliseni daneho displeje
- nacteny ulozeny projekt se rovnou ulozi jako pracovni navrh aktualne vybraneho displeje

## Novinky ve verzi 0.1.3

- editor umi prepnout layout displeje na sirku nebo na vysku
- orientace se uklada do pracovniho navrhu konkretniho displeje
- odesilani navrhu respektuje orientaci a portretovy layout se pred prenosem otoci do fyzickeho rozmeru displeje
- PE29R_V4_BLE / 296x128 typy se detekuji i pres SDK typy 40, 43, 46, 48 a 51
- pri prepnuti displeje se prekresli rozmer platna i ovladaci lista s aktualnim SDK typem a rozlisenim

## Novinky ve verzi 0.1.4

- PE29R_V4_BLE uz nepouziva zrcadleni obrazu urcene pro jine typy stitku
- prepinac layoutu na sirku / na vysku je viditelny take v levem panelu editoru
- pri zmene layoutu se objekty v navrhu otoci do nove orientace misto pouheho natazeni
- po uspesnem odeslani do displeje se aktualni navrh hned ulozi k BLE adrese displeje
- pracovni navrhy se ukladaji do Home Assistant storage a zustavaji zachovane i po aktualizaci integrace

## Novinky ve verzi 0.1.5

- hlavni rozhrani je rozdelene na karty `Nalezene displeje` a `Designer`
- karta displeju zobrazuje nalezene cenovky jako prehledne karty
- u displeju je videt baterie, RSSI signal, SDK typ, raw typ, SW/HW a profil
- sila signalu a baterie jsou zobrazene graficky a barevne
- klik na kartu displeje vybere displej, nacte jeho navrh a prepne do designeru

Integrace pro Home Assistant, která umí vyhledat dostupné BLE eInk cenovky DRATEK, zobrazit diagnostiku Bluetoothu a připravit grafický návrh přímo v Home Assistantu.

Instalace je určena výhradně přes HACS. Není potřeba nic kopírovat ručně ani psát do `configuration.yaml`.

## Instalace přes HACS

1. V Home Assistantu otevři `HACS`.
2. Vpravo nahoře otevři menu se třemi tečkami.
3. Zvol `Custom repositories`.
4. Do pole `Repository` vlož:

```text
https://github.com/dratek-cz/dratek-eink-homeassistant
```

5. Jako kategorii vyber `Integration`.
6. Potvrď přidání repozitáře.
7. V HACS najdi `DRATEK eInk`.
8. Nainstaluj integraci.
9. Restartuj Home Assistant.

## Povinný krok: Bluetooth integrace

Před použitím DRATEK eInk musí být v Home Assistantu přidaná a funkční integrace `Bluetooth`.

1. Otevři `Settings`.
2. Otevři `Devices & services`.
3. Klikni na `Add integration`.
4. Vyhledej `Bluetooth`.
5. Přidej Bluetooth adaptér nebo ověř, že už je Bluetooth integrace aktivní.

Bez této integrace Home Assistant neposkytuje BLE skenování a DRATEK eInk panel neuvidí žádné cenovky.

## Aktivace integrace

Po instalaci přes HACS je potřeba integraci jednou přidat do Home Assistantu:

1. Otevři `Settings`.
2. Otevři `Devices & services`.
3. Klikni na `Add integration`.
4. Vyhledej `DRATEK eInk`.
5. Klikni na integraci.
6. V okně `Aktivovat DRATEK eInk` klikni na `Odeslat`.

Tím se integrace aktivuje a v levém menu Home Assistantu se zobrazí nová položka `DRATEK eInk`.

## Vyhledání displejů

1. V levém menu otevři `DRATEK eInk`.
2. Klikni na `Vyhledat zařízení`.
3. Stránka zobrazí stav Bluetoothu, počet dostupných Bluetooth scannerů/proxy a počet BLE zařízení, která Home Assistant vidí.
4. Pokud jsou v dosahu DRATEK eInk cenovky, zobrazí se v tabulce.
5. U nalezené cenovky můžeš kliknout na `Odeslat dratek.cz` pro první test zápisu na displej.

U nalezených displejů se zobrazuje:

- fyzický kód displeje, například `92.80.95.16`
- BLE adresa
- model displeje
- RSSI
- SDK typ
- baterie
- SW/HW informace

## Editor grafiky

Panel obsahuje první verzi grafického editoru:

- výběr nalezeného displeje
- pracovní plocha podle rozlišení displeje
- textové objekty
- proměnné textové objekty
- hodnoty proměnných přímo v Home Assistant panelu
- výběr fontu a bold pro text
- obdélníky s výplní a rámečkem
- čáry
- obrázky z počítače
- EAN objekt
- QR objekt
- ikonová paleta nástrojů
- výběr objektu kliknutím
- posouvání objektů myší
- změna velikosti tažením rohů
- vlastnosti objektu v pravém sloupci
- přesné zadání X/Y/šířky/výšky
- posun vrstvy dopředu/dozadu
- smazání vybraného objektu
- interní uložení projektu přímo v Home Assistantu
- načtení uloženého projektu pro stejné rozlišení
- náhled v reálných barvách eInk displeje
- odeslání celého návrhu do vybraného displeje

Projekty se ukládají interně do Home Assistant storage. Nestahují se jako soubory do počítače.

## Proměnné v návrhu

Textový objekt může být označený jako proměnný. Každá proměnná má vlastní název a editor hlídá, aby se názvy v jednom návrhu neopakovaly.

V panelu `Proměnné návrhu` je možné zadat aktuální hodnoty proměnných. Náhled se po změně hodnoty překreslí hned a při odeslání návrhu do displeje se použije hodnota proměnné místo defaultního textu.

Aktuální verze posílá u běžných displejů celý bitmapový návrh. Backend už umí SDK partial-update příkaz `0x60`, ale povoluje ho jen pro SDK typ `2635`, kde Android SDK opravdu podporuje part display.

QR objekt používá vestavěný QR encoder pro běžné krátké texty a URL. EAN objekt odděluje čárový kód od čísla pod ním, aby text nezasahoval do čar.

## Debug Bluetoothu

Panel zobrazuje i obecná BLE zařízení, která Home Assistant zachytil. Díky tomu jde poznat rozdíl mezi těmito stavy:

- Home Assistant nemá žádný Bluetooth adaptér ani Bluetooth proxy.
- Bluetooth funguje, ale v dosahu není žádná DRATEK eInk cenovka.
- Bluetooth funguje a DRATEK eInk displeje jsou nalezené.

## Podporované displeje

Integrace obsahuje mapu rozměrů a modelů vytaženou z Android SDK/AAR. Důležité typy:

- `40`, `43`, `46`, `48`, `51`: PE29 / PE29R_V4_BLE 296x128
- `75`: EPA LCD 400x300 BWR
- `267`: EPA LCD 250x128 BWR
- `296`: EPA LCD 800x480 BW
- `2635`: EPA LCD 960x680 BWR, jediný typ s ověřenou SDK podporou partial update

## Poznámky k dosahu

Home Assistant musí mít Bluetooth LE dosah k cenovce. Pokud běží na místě, odkud na displeje nedosáhne, bude potřeba použít Bluetooth proxy nebo později samostatnou síťovou bránu.

Integrace je zatím experimentální. Aktuální verze řeší instalaci přes HACS, panel v levém menu, vyhledání dostupných DRATEK eInk displejů a první verzi grafického editoru.

## Aktualizace

Od verze `0.0.6` budou změny vydávané jako verzované GitHub releases, aby HACS uměl nabídnout standardní aktualizaci.
