# DRATEK eInk pro Home Assistant

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
