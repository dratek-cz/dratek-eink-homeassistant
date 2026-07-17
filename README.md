# DRATEK eInk pro Home Assistant

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
- vyhledavani gatewayi v Home Assistantu ceka na mDNS 10 sekund misto 5
- odesilani dat nadale pouziva nalezenou IP adresu, aby mDNS neovlivnovalo stabilitu prenosu

## Novinky ve verzi 0.1.30

- odesilani pres gateway pouziva asynchronni prenosove ulohy misto jednoho dlouheho HTTP spojeni
- gateway potvrdi prijeti obrazku okamzite a Home Assistant pak prubezne nacita stav a log prenosu
- odstranena rekurzivni obsluha HTTP serveru uvnitr BLE prenosu, ktera mohla zpusobit `Server disconnected`
- base64 payload se zbytecne nekopiruje a prenosovy log ma omezenou velikost
- BLE scan a dalsi prenos jsou pri obsazene gatewayi bezpecne odmitnuty chybou `gateway_busy`
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
