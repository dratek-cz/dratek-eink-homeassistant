<p align="center">
  <img src="https://raw.githubusercontent.com/dratek-cz/dratek-eink-homeassistant/main/custom_components/dratek_eink/frontend/dratek-eink-logo.png" alt="DRATEK.CZ eInk" width="360">
</p>

# DRATEK eInk pro Home Assistant

## Novinky ve verzi 0.1.338

- **Mapa připojení konečně odpovídá skutečnosti** – gateway, která displeje obsluhuje, se v ní zobrazí i během probíhajícího přenosu, a z několika gatewayí vyhrává ta nejsilnější.
- **Ovládání panelu je nově jen pro správce** – flashování gatewaye přes USB ani zásahy do nastavení integrace už nejsou dostupné běžnému uživateli Home Assistantu.
- **Adresa gatewaye se ověřuje** a přijímá jen jméno počítače nebo IP adresu, volitelně s portem.
- **Předpověď ukazuje jednotku u každého dne**, nejen u hlavní teploty.
- **Pod mapou připojení přibyly podrobnosti skenu**, které vysvětlí, proč některá gateway zrovna nic neobsluhuje.

## Novinky ve verzi 0.1.337

- **BWRY používá škálu žlutá → červená → tmavě červená** bez bílého vyšisování slabých srážek; černá simuluje tmavší červenou pouze několika body v maximu.
- **BWR je výrazně červenější a silné odrazy stínuje černou**, která ani v maximu nepřekročí přibližně třetinu srážkové plochy.
- **Srážky pokračují přes hranice států v celé mapové sekci** a zřetelné 2px obrysy se kreslí navrch.
- **Na výšku je předpověď pod meteoradarem**, na šířku a ve čtverci zůstává vlevo.

## Novinky ve verzi 0.1.336

- **Srážky jsou tmavší a výraznější** – žlutý rastr na BWRY i červený rastr na BWR má vyšší hustotu, zejména u středních a silných srážek.
- Bílé mezery a odstupňování intenzity zůstávají zachované, takže radar není jednolitá barevná plocha.

## Novinky ve verzi 0.1.335

- **BWRY meteoradar používá žlutý polotónový rastr pro běžné srážky** a červenou pro nejsilnější odrazy, podobně jako klasická e-ink radarová mapa.
- **BWR displeje používají stejný rastr v červené**, protože nemají žlutý pigment.
- **Černá zůstává pouze pro jemné hranice, popisky a další mapové prvky**, nikoli pro srážkové plochy.

## Novinky ve verzi 0.1.334

- **Opravené černé plochy srážek** – modrá a azurová data RainVieweru se nyní převádějí na postupně houstnoucí černobílý rastr, nikoli na souvislou černou.
- **Teplé odrazy používají akcentní pigment** – na BWR červenou, na BWRY žlutou a červenou; běžná modrá srážka nemůže dostat falešné červené body.
- **Hranice států mají jemný 1px obrys** a nepřekrývají radarová data.

## Novinky ve verzi 0.1.333

- **Meteoradar má znovu rozložení z v0.1.330** – mapa a hodinová předpověď jsou vedle sebe bez pozdějšího skládání a vícesloupcového panelu.
- **Předpověď ukazuje pouze skutečné časy** – například `14:00`, `15:00`; číselné popisky `+1 h`, `+2 h` a `+3 h` se nezobrazují.
- **Radarový snímek se ditheringuje přímo do fyzické palety displeje** – BWR používá bílou, černou a červenou, BWRY navíc žlutou. Umělá legenda „slabé / střední / silné“ i volba tečkování byly odstraněny.
- **Srážky jsou znovu oříznuté hranicí zvoleného státu**, zatímco optimalizace výkonu z v0.1.332 zůstávají zachované.

## Novinky ve verzi 0.1.332

- **Mapa připojení ukazuje všechny právě naměřené cesty** – při otevření i každých 30 sekund se obnoví lokální Bluetooth a scany gatewayí. Ruční zámek už z mapy neschová ostatní gatewaye ani jádro Home Assistantu, které displej skutečně slyší; zámek nadále omezuje jen cestu použitou pro odesílání.
- **800×480 funguje i přes obyčejnou ESP32 gateway** – firmware gatewaye `0.1.60` ukládá velký payload do neaktivního OTA oddílu flash místo požadavku na jeden obří souvislý blok RAM. BLE přenos zůstává blokový a umí z flash znovu načíst i blok, který si displej vyžádá opakovaně. Po aktualizaci integrace je nutné nahrát nový firmware také do gatewaye.
- **Meteoradar už nezablokuje Home Assistant** – displeje se stejnými parametry sdílejí jeden probíhající render, náročná kompozice běží nejvýše jedna současně a timeout jednoho displeje nezruší práci ostatním.
- **Meteoradar se počítá rovnou pro cílový displej** – pixelové Python smyčky nahradily nativní operace Pillow a mapa se ořízne a zmenší ještě před barvením. Malý panel tak už neplatí cenu za zpracování velké megapixelové mapy.
- **Fronta zápisu zůstává ovladatelná během přenosu** – každou sekundu se aktualizuje jen živý stav a log konkrétní úlohy, nikoli celé rozhraní.
- **Zeroconf discovery neblokuje jádro HA** – hledání gatewayí i načtení detailů služeb je plně asynchronní.

## Novinky ve verzi 0.1.327

- **Při více šablonách v mřížce se aktualizovala jen jedna** – ostatní se odesílaly bez hodnot a grafů. Grafické bloky se hledaly v celém dokumentu, ale jejich pořadí se počítalo zvlášť pro každou šablonu, takže dvě šablony se stejným názvem bloku obě sáhly po prvním slotu. Nově se blok hledá i počítá v rámci konkrétního slotu.

## Novinky ve verzi 0.1.326

- **Při automatickém zápisu mizely části šablony** – prázdná skupina `<g/>` rozhodila počítání vnoření, takže se při aktualizaci grafu vymazaly sousední prvky (text, obrázky, celé bloky); a slot s prázdnou hodnotou se uložil jako samouzavírací `<text/>`, načež hledání jeho konce smazalo i následující slot. Projevovalo se to jen občas a ruční odeslání téhož návrhu bylo v pořádku.
- **Náhled Meteoradaru v katalogu šablon** zůstával na „Načítám radarovou mapu…" – miniatura se ukládala do cache dřív, než mapa dorazila. Nyní se uloží až s hotovou mapou.

## Novinky ve verzi 0.1.325

- **Meteoradar se při automatickém zápisu nikdy neaktualizoval** – čerstvá radarová mapa se sice pokaždé stáhla, ale při vkládání do šablony se zahodila, protože vyhledávací vzor vyžadoval atribut `id` před `href`; prohlížeč ho ale vždy zapisuje až za něj. Na displeji tak zůstával snímek z posledního ručního odeslání. Opraveno – `id` se nyní hledá nezávisle na pořadí atributů.

## Novinky ve verzi 0.1.324

- **Mapa připojení je konečně čitelná** – dosud dostala vlastní šedou linku každá gateway, která displej jen slyší, takže při více gatewayích vznikla změť čar přes celou mapu a zdravý displej vypadal jako „chytaný, ale nepřipojený". Nově se kreslí jen trasa, po které displej skutečně komunikuje; záložní trasy se zobrazí po kliknutí na displej nebo přepínačem „Zobrazit záložní trasy". Gatewaye se navíc rozmísťují podle sdílených displejů, aby záložní trasa byla krátký skok k sousedovi místo čáry napříč mapou.

## Novinky ve verzi 0.1.323

- **Dokončen anglický překlad celého rozhraní** – doplněno přes 580 chybějících překladů napříč všemi sekcemi panelu (Displeje, Mapa připojení, Fronta zápisu, Automatické zápisy, Gatewaye, Designer, Inspector, Proměnné, Šablony i Lovelace karta). Po přepnutí na angličtinu už nikde nezůstávají české texty. Nový test navíc hlídá, že se s každým dalším českým textem doplní i jeho anglická verze.

## Novinky ve verzi 0.1.322

- **Automatický zápis se po doběhnutí intervalu odešle vždy** – přepínač „Odesílat i beze změny" je nově výchozím stavu zapnutý. Dřív se zápis přeskočil, když vyšel obrázek shodný s tím na displeji, takže po prvním automatickém zápisu se displej už nikdy nepřepsal. Kdo chce šetřit baterii, může přepínač u displeje vypnout.

## Novinky ve verzi 0.1.321

- **Přepínač „Odesílat i beze změny"** – v záložce Automatizace u každého displeje. Zapnutý přepíše displej i tehdy, když je obrázek shodný s tím, co už na něm je (vhodné pro statické šablony nebo pročištění e-inku od duchů). Výchozí stav je vypnuto, protože překreslení stojí baterii a viditelně blikne.

## Novinky ve verzi 0.1.320

- **Zjištěna příčina „časovač doběhne, ale nic se nezapíše"** – pokud automatická obnova vykreslí obrázek shodný s tím, co už na displeji je, zápis se záměrně přeskočí (šetří baterii a zbytečné překreslení e-inku). Dosud to bylo neviditelné a vypadalo to jako rozbitý plánovač; nově se to vypisuje do protokolu a zobrazuje na senzoru **Poslední vykreslení** jako „beze změny (nic se neodesílá)".

## Novinky ve verzi 0.1.319

- **Integrace rozdělena na tři diagnostické bloky** – na stránce integrace jsou nyní tři samostatná zařízení: **Rozhraní**, **Automatické zápisy** a **Přenos do zařízení**. Každé má vlastní senzory ukazující, zda a kdy naposledy daná část proběhla a jak dopadla, takže jde hned poznat, ve které části řetězce automatický zápis vázne.

## Novinky ve verzi 0.1.318

- **Živé diagnostické stavy pro automatické zápisy** – čtyři nové stavy viditelné v Nástroje pro vývojáře → Stavy ukazují, kdy naposledy proběhl tik plánovače, kdy byl naposledy naplánován zápis pro konkrétní displej, jak dopadl poslední pokus o vykreslení a jak dopadl poslední přenos do zařízení – pomáhá poznat, kde přesně automatický zápis vázne, bez nutnosti exportovat log.

## Novinky ve verzi 0.1.317

- **Šablona Meteoradar přestavěna na dva samostatné bloky** – boční panel (legenda intenzity srážek a předpověď na 3 h dopředu) a samotná mapa se nyní vykreslují jako dva nezávislé bloky vedle sebe, boční panel vždy vyplňuje celou výšku displeje stejně jako u ostatních šablon. Opravuje to, že se mapa dřív neroztahovala přesně podle plochy displeje.

## Novinky ve verzi 0.1.316

- **Automatické zápisy se mohly navždy zaseknout beze stopy v protokolu** – vykreslení šablony při automatickém zápisu nemělo žádný časový limit; nově je omezeno 90sekundovým bezpečnostním limitem, po kterém se pokus vyhodnotí jako neúspěšný a displej se normálně zkusí znovu podle svého intervalu.
- **Odolnost plánovače automatických zápisů proti jedné rozbité položce** – chyba u jednoho displeje/konfigurace už nemůže tiše zastavit kontrolu i pro všechny další displeje.

## Novinky ve verzi 0.1.315

- **Oprava žlutých ikon v náhledu na velkých displejích** – opraveno přiřazení barevného profilu u velkých displejů (800x480, 400x300, 960x640, 1360x480 apod.), které byly mylně vyhodnocovány jako 4-barevné (BWRY). V náhledech na hlavní stránce i v editoru se ikony šablon nyní správně zobrazují v červené barvě odpovídající fyzickému tříbarevnému BWR e-ink panelu.

## Novinky ve verzi 0.1.314

- **Aktualizace času a data při automatické obnově** – vyřešena chyba, kdy se čas v šablonách (např. čas poslední aktualizace u počasí, datum) při automatických zápisech neměnil a zůstával na hodnotě z manuálního odeslání. Čas a datum se nyní při každém automatickém zápisu překreslují s aktuálním časem Home Assistantu.

## Novinky ve verzi 0.1.313

- **Přesná synchronizace automatické obnovy s hodinami Home Assistantu** – intervaly obnovy se nyní zarovnávají na systémové hodiny (např. 10minutový interval přesně v :00, :10, :20, :30, :40, :50) a bylo odstraněno vnitřní zpoždění, takže displeje nečekají 15–20 minut namísto nastavených 10 minut.

## Novinky ve verzi 0.1.312

- **Odstraněn odpočítávací pruh z hlavní stránky displejů** – karty na hlavní stránce jsou nyní čistší a soustředí se na přehled zařízení (baterie, signál, trasa). Časovače automatických obnov zůstávají k dispozici v záložce Automatizace.

## Novinky ve verzi 0.1.311

- **Oprava pádu `abort()` na deskách ESP32 (WROOM)** – vyřešen pád `std::bad_alloc` způsobený pokusem o alokaci 128KB bloku v interní SRAM na ESP32 bez PSRAM. Vyrovnávací paměť se nyní inicializuje bezpečně podle reálně dostupné souvislé paměti.

## Novinky ve verzi 0.1.310

- **Spolehlivé spuštění ESP32 po flashnutí přes USB** – přidán hard reset parametr do `esptool` a pulzní start aplikace při otevírání sériové linky, což eliminuje stav, kdy ESP32 po nahrání zůstalo viset v bootloaderu a nepotvrdilo Wi-Fi konfiguraci.

## Novinky ve verzi 0.1.309

- **Oprava překrývání grafiky a terminálu v záložce Gatewayí** – odstraněny problematické fixní výšky a vnitřní scroll-trapy, mřížka kroků i terminálová konzole nahrávání se plynule přizpůsobují rozměrům obrazovky a terminál se po startu flashování automaticky nascrolluje na viditelné místo.
- **Oprava čísla verze ve frontendu** – přebumpnuté importy a konstanty pro okamžitou aktualizaci záhlaví panelu i Lovelace karty bez držení staré cache.

## Novinky ve verzi 0.1.308

- **Živý odpočítávací časovač a dynamický barevný bar** – na hlavní stránce u každého displeje s aktivním automatickým zápisem, v záložce Automatizace i na přehledové kartě se zobrazuje reálný čas do příštího nahrání a ubíhající barevný progress bar (zelený >50 %, jantarový 20–50 %, červený <20 % a pulzující stream při odesílání).
- **Oprava bootloopu ESP32 po flashnutí gatewaye** – kompletní výmaz NVS a OTA metadat před nahráním firmwaru eliminuje pád `abort()` způsobený starými daty v NVS.
- **Moderní uspořádání sekce Nová gateway a plnošířkový terminál** – přehledné 4 kroky instalace a čitelná tmavá vývojářská konzole pro diagnostiku a nahrávání přes USB.

## Novinky ve verzi 0.1.307

- **Nový výchozí režim automatického obnovování „Jen podle intervalu“** (10 minut) – rychle se měnící navázaná entita už defaultně nespouští odesílání mnohem častěji, než uživatel čeká. Kdo chce reagovat i na změnu hodnoty, může to v nastavení automatiky displeje zvolit ručně.
- **Bezpečnostní strop pro vyhledávání trasy ke gatewayi** – sdílené napříč všemi displeji; pokud by cokoliv uvnitř viselo déle, než je jeho vlastní timeout, dřív mohlo navždy zablokovat automatické obnovování pro úplně všechny displeje najednou beze stopy v protokolu.
- **Gateway firmware v0.1.58** – po OTA aktualizaci firmware nyní potvrzuje bootloaderu, že nová verze úspěšně naběhla, aby se nemohl tiše vrátit na předchozí verzi.
- **Opravena chyba při tažení plátna v Designeru** na některých kombinacích prohlížeč/vstupní zařízení.

## Novinky ve verzi 0.1.306

- **Spolehlivější gateway** – přenosový buffer firmwaru se po hodinách provozu už nerozpadá kvůli fragmentaci paměti (chyba `insufficient_contiguous_memory`); alokuje se jednou při startu a mezi přenosy se jen recykluje.
- **Automatický zápis přežije výpadek gatewaye** – displej připnutý na konkrétní gateway teď při jejím výpadku automaticky zkusí ostatní dostupné gateway místo toho, aby rovnou čekal na Home Assistant Bluetooth.
- **Šablona Kalendář se svátky bez vlastní entity** – vestavěný český jmenný kalendář, odstraněné ikony z horního a spodního pruhu pro víc místa na text a odstraněné duplicitní zobrazení svátku.
- **Nová zkratka Automatika ve Frontě zápisu** – rychlý přechod k nastavení automatického obnovování vybraného displeje bez hledání v seznamu.
- **Galerie vlastních obrázků** – dvě tlačítka nahrazena jedním tlačítkem Uložit a opravena chyba „Connection lost“ při ukládání větších obrázků.
- **Grafy a ukazatele fungují ve všech slotech velkého rozložení** – dřív se v rozložení 2×3 a podobných zobrazovaly jen v prvních dvou slotech.
- **Správná barevná paleta v náhledech** – displeje bez žluté barvy ji už nezobrazují v seznamu jen proto, že je zrovna vybraný jiný, žlutou podporující displej.

## Novinky ve verzi 0.1.305

- **Šablona České spotové ceny** – odstraněny všechny ikony z grafiky; dolarová ikona nedávala pro koruny smysl a odznaky MIN/MAX byly na hardwaru bez žluté barvy k nerozeznání od sebe.

## Novinky ve verzi 0.1.304

- **Devět šablon bez zbytečného nadpisu** – Dům, Spotřeba vody, Stav serveru, Kdo je doma, Nákupní seznam, Odpady, Wi-Fi, Fotovoltaika a Pračka dostaly víc místa pro hlavní obsah místo opakování názvu šablony.
- **Přeuspořádaná šablona Pračka** – zbývající čas je teď hlavní velké číslo, průběh praní/máchání je zmenšený doplňkový pruh pod ním.

## Novinky ve verzi 0.1.303

- **18 nových šablon v katalogu** – Dům, Obývák, Topení, Zabezpečení, Kdo je doma, Odjezdy, Nákupní seznam, Kvalita vzduchu, Spotřeba vody, Zásilka, Narozeniny, Stav serveru, Zahrada, Cenovka, Odpady, Fotovoltaika, Pračka a Wi-Fi – zkontrolované a ověřené na všech velikostech displeje.
- **Opraven žlutě vykreslený text u řady šablon** – barevný akcent dřív občas dopadl na popisek nebo hodnotu místo na ikonu, což je ve žluté barvě na displeji prakticky nečitelné; teď vždy dopadne na ikonu nebo tenkou linku.
- **Opraveno zdvojení jednotky** – šablony Obývák, Topení, Spotřeba vody a Zahrada po automatické aktualizaci nezobrazují jednotku dvakrát.

## Novinky ve verzi 0.1.302

- **Přepracovaná šablona České spotové ceny** – graf je nově dominantní prvek rozvržení, MIN/MAX nesou barevný akcent na plné plaketě místo obarveného (a ve žluté špatně čitelného) textu.
- **Opravená šablona Počasí** – ikona nad teplotou odpovídá skutečnému stavu počasí, ikony v týdenní předpovědi a řádku vlhkost/vítr/tlak jsou větší, teplota se po aktualizaci nezobrazuje se zdvojeným „°C“.
- **Sken zařízení už nespadne** – tlačítko „Načíst zařízení“ nemůže vrátit nulu displejů kvůli poškozené mezipaměti objevování; takové zařízení se místo pádu celého skenu označí jako nedostupné.

## Novinky ve verzi 0.1.301

- **Šablona Kalendář** – zprovozněna šablona pro zobrazení dvou nejbližších událostí z lokálního, Google nebo CalDAV kalendáře s velkým červeným rámečkem data a spodním řádkem pro jmeniny / svátek.
- **Spolehlivý přímý Bluetooth přenos do velkých displejů** – zápis z Home Assistantu do panelů 800×480 a větších používá časovaný proud a nečeká na potvrzení každého z 419 bloků, což zkracuje přenos z 17 minut na pár sekund.
- **Bezchybné dokončení zápisu** – přenos se neoznačí jako selhaný, pokud displej po přijetí 100 % dat nestihne poslat volitelný paket `05 08`.

## Novinky ve verzi 0.1.300

- **Kompletní přepracování Meteoradaru** – radarová mapa s podporou čtyřbarevných panelů BWRY, zobrazením domova a spolehlivým umisťováním více šablon na velkých displejích.

## Novinky ve verzi 0.1.299

- **Spotové ceny se aktualizují spolehlivě** – sériové vazby uložené v atributech entity (např. České spotové ceny elektřiny) se obnoví i tehdy, když se změní jen zítřejší ceny nebo jiné atributy, ne hlavní stav senzoru.
- **Graf bez duchů starých hodnot** – při automatické aktualizaci se graf v šabloně nahradí celý najednou, takže pod novými sloupci nebo čárami nezůstávají staré.
- **Zoom náhledu se vejde do rámečku** – vysoké přiblížení náhledu šablony a obrázkového studia už nepřetéká mimo displej.

## Novinky ve verzi 0.1.298

- **Pozastavení automatických aktualizací** – každá karta má skutečný přepínač ON/OFF; vypnutí zastaví časovač i reakce na entity, ale zachová šablonu, interval a vazby i po restartu Home Assistantu.
- **Stabilní stránka bez problikávání** – pravidelné načítání stavů už nepřekresluje celé rozhraní, nemaže na okamžik ikony a nezavírá otevřená okna, nabídky ani rozbalené podrobnosti.
- **Kompaktnější přehledy** – seznam displejů a karty automatických zápisů zabírají méně místa a nechávají hlavní stav, náhled, interval a důležité akce v jednom přehledném řádku.
- **Zoom náhledu až na jednotlivé pixely** – kolečko myši přibližuje náhled displeje i obrázkové studio až na 1600 %, levé tlačítko obraz posouvá a při vysokém zvětšení se zachová ostrá fyzická pixelová mřížka.
- **Čistší katalog šablon** – technické vizuální testy barev byly odstraněny z nabídky a načítání šablon zůstává zaměřené na skutečně použitelné návrhy.

## Novinky ve verzi 0.1.297

- **Automatické zápisy opravdu běží podle časovače** – každý displej má vlastní přesný interval, po jeho uplynutí se šablona znovu vykreslí a odešle bez čekání na změnu entity.
- **Správná gateway podle aktuální mapy spojení** – při automatickém i ručním zápisu dostane přednost gateway, která displej zachytila v posledním skenu; stará silnější trasa slouží jen jako záloha.
- **Trvalé mazání obrázků z galerie** – odstraněním snímku se smažou i jeho uložená data, barevné varianty a vazba v automatickém cyklu.
- **Automatické vyplnění displeje obrázkem** – galerie nabízí režimy Vyplnit, Přizpůsobit a Roztáhnout a při změně přepočítá obrázky přímo pro rozlišení cílového panelu.
- **Čitelný Meteoradar po každé aktualizaci** – informační vrstva už po obnovení nezmizí a intenzita srážek používá pro BWRY jemné žluté, žluto-červené a červené stínování včetně legendy Slabé / Střed / Silné.

## Novinky ve verzi 0.1.296

- **Správně otočené čtyřbarevné displeje** – hotový obraz pro všechny BWRY panely se před fyzickým zápisem otočí o 180° bez změny náhledu nebo tříbarevných variant.
- **Funkční automatické cyklování** – obrázkový cyklus vytvoří automatický zápis i bez navázané HA entity a střídá vybrané snímky v nastaveném intervalu.
- **Stejný obrázek ve všech náhledech** – hlavní stránka, nastavení displeje i editor ukazují současně totožný snímek aktivního cyklu.
- **Přehlednější automatické zápisy** – cyklus je zřetelně označený a zobrazuje počet zařazených obrázků.
- **Přirozené ovládání mapy spojení** – mapu lze posouvat tažením levým tlačítkem bez nechtěného otevření zařízení.

## Novinky ve verzi 0.1.295

- **Správná orientace 296×128 BWRY** – čtyřbarevná varianta je při každém nastavení otočení vždy přesně o 180° proti stejné tříbarevné PE29 variantě.
- **Domov na radarové mapě** – do nastavení Meteoradaru lze zadat adresu; mapa ji dohledá a vykreslí na displeji malou červenou ikonou domu.
- **Spolehlivé menu vlastního obrázku** – karta má samostatné funkční volby pro stažení, úpravu obrázků a galerii se střídáním.
- **Opravný HACS balíček** – verze, frontendové cache klíče a ZIP asset jsou znovu sjednocené, aby HACS nový update správně rozpoznal.

## Novinky ve verzi 0.1.294

- **Samostatné vykreslení pro BWR a BWRY** – fotografie se vždy znovu převádí přímo pro paletu cílového displeje; tříbarevný a čtyřbarevný výsledek se už nepřevádějí jeden z druhého.
- **Přirozenější fotografie na tříbarevném e-paperu** – nové optické míchání pixelů zachovává světla, stíny a prostorový dojem bez přepálených červených ploch.
- **Obrázkové studio a galerie** – vlastní obrázek má samostatnou obrazovku pro přidávání, stažení, výběr a odstranění uložených snímků.
- **Automatické střídání obrázků** – lze vybrat až 12 snímků a nastavit jejich skutečné intervalové střídání na displeji od 1 do 60 minut.
- **Zoom bez poškození náhledu** – kolečko myši přibližuje a levé tlačítko posouvá hotový obraz bez nové kvantizace nebo překreslení canvasu; stará tlačítka zoomu byla odstraněna.
- **Rychlejší katalog šablon** – miniatury se načítají pouze podle viditelnosti, hotové náhledy se ukládají do cache a prázdná obrazová karta má srozumitelný stav pro přidání obrázku.

## Novinky ve verzi 0.1.293

- **Věrnější barvy na BWRY displejích** – oranžová se skládá z pravidelně střídaných červených a žlutých pixelů; zelené a modré plochy fotografie se už chybně nemění na velké žlutočervené oblasti.
- **Papoušek je součástí integrace** – původní fotografie je uložená přímo v HA, lze ji kdykoli znovu vybrat a při použití se uloží k danému displeji v jeho přesném rozlišení.
- **Statický obrázek zůstane na displeji** – odeslání obrázkové šablony zruší starou automatickou obnovu, takže dřívější obsah papouška později nepřepíše.
- **Gatewaye zůstávají dostupné** – integrace je průběžně kontroluje, po dočasném výpadku zachová jejich identitu a při změně IP adresy je automaticky znovu dohledá přes mDNS.

## Novinky ve verzi 0.1.292

- **Vlastní barevné obrázky** – nová šablona přijímá PNG, JPEG i WebP, nabízí výchozí fotografii papouška a převede obraz do fyzických barev e-paperu pomocí pixelového ditheringu.
- **Automaticky podle displeje** – při vložení se obrázek ořízne, přizpůsobí rozměrům zvoleného displeje a převede do jeho pixelové mřížky.
- **Opravený přímý přenos 800×480** – Home Assistant posílá velký displej časovaným proudem bez pomalého potvrzování všech 419 bloků, i když BlueZ neohlásí podporu zápisu bez odpovědi.

## Novinky ve verzi 0.1.291

- **Kompletní test barev** – jedna šablona zobrazuje všech šest dvojic bílé, černé, červené a žluté ve všech 17 poměrech mřížky 4×4, tedy od 0 do 16 pixelů druhé barvy.
- **Další kalibrační palety** – samostatné testy světlých, tmavých a teplých odstínů jsou tvořené pouze fyzickými pixely bez textu, mezer a rámečků.

## Novinky ve verzi 0.1.290

- **Rychlý lokální přenos na displeje 800×480** – SDK 299/315 už nečeká přibližně 2,5 sekundy na potvrzení každého ze 419 bloků. Data se posílají přesně časovaným proudem a poslední blok zůstá bezpečnou GATT bariérou.
- **Test pixelového stínování** – nová kalibrační šablona vyplní displej pouze čistými barvami a skutečnými 2×2 pixelovými vzorky bez textu, mezer a rámečků.
- **Odolnější automatické aktualizace** – chybná vazba už nezastaví celý displej, interní čas a datum se vyhodnocují dynamicky a výchozí interval je bezpečných 10 minut. Lze zvolit obnovu při změně, podle intervalu, nebo obojí.
- **Přehlednější správa** – automatizace zvýrazní právě zapisovaný displej, ovládání fronty zůstá připnuté a mapa připojení umí nový interaktivní pohled na gatewaye a jejich trasy.
- **Gateway firmware 0.1.56** – ESP32/ESP32-S3 po připojení požádá o rychlejší BLE interval 15–30 ms, takže potvrzovaný přenos velkého obrazu netrvá zbytečně dlouho.

## Novinky ve verzi 0.1.289

- **Přesný rámeček displeje 800×480** – náhled odpovídá dodanému SVG včetně proporcí displeje a spodního tmavého štítku.
- **Čárový kód i adresa přímo na štítku** – čárový kód je dominantní, adresa menší a oba prvky zůstávají uvnitř tmavé plochy.
- **Správný první přenos po restartu** – integrace dohledá inzerovaný typ displeje také v Bluetooth cache Home Assistantu, takže automatický zápis nepoužije chybné formátování obrazu.

## Novinky ve verzi 0.1.288

- **Rozložení velkých displejů** – osm variant se vybírá v kompaktním popupu s grafickými ikonami; kliknutí i drag & drop používají stejné pozice.
- **Správné otočení mřížky** – otočení zachová šablony i typ rozložení a pouze prohodí řádky se sloupci, například 3×2 na 2×3.
- **Větší náhled bez přetékání** – levý panel končí ve výšce okna, hlavičky jsou menší a fyzický náhled dostal více prostoru.
- **Čtyřbarevný import obrázků** – import zachová žlutou pro BWRY; při použití na tříbarevném BWR displeji se žlutá automaticky odešle jako červená.
- **Spolehlivější přenos** – lokální Bluetooth potvrzuje bloky vendorového QuickLZ streamu a gateway opakuje také GATT discovery. Součástí je firmware gatewaye 0.1.55.

## Novinky ve verzi 0.1.287

- **Všechny šablony jsou čtyřbarevné** – vestavěné návrhy používají bílou, černou, červenou i žlutou včetně nové legendy Meteoradaru.
- **Automatická kompatibilita BWR** – na tříbarevném displeji se každá žlutá část šablony automaticky změní na červenou, a to i při automatickém zápisu.
- **Přesné náhledy a lepší Designer** – uložené kopie odpovídají výslednému obrazu a grafy, měřidla i přesná geometrie prvků mají sjednocené ovládání.
- **Opravené vykreslení BWR 800×480** – panelům, které nepožadují syrová obrazová data, se payload posílá v očekávaném vendorovém QuickLZ rámci.

## Novinky ve verzi 0.1.286

- **Displeje 800×480 se překreslí** – panely, které v inzerci nemají příznak „syrová data“, dostávají obraz ve vendorově QuickLZ formátu. Dosud přenos doběhl a displej zůstal beze změny.
- **Čtyřbarevné šablony a Designer** – BWRY displeje mohou v šablonách i volném návrhu používat žlutou. Na tříbarevném displeji se žlutá automaticky odešle jako červená.
- **QR a čárové kódy** – nový Designer generuje QR, Wi-Fi QR, QR odkazy a EAN-13 včetně skutečného vykreslení do displeje.
- **Správný formát všech BWRY panelů** – celá rodina čtyřbarevných SDK typů používá vendorový dvoubitový framebuffer, nejen 296×128.
- **Přesné náhledy vlastních šablon** – po uložení se karta šablony vyrenderuje stejnou cestou jako fyzický displej, včetně nových a přesunutých prvků.
- **Přepracované grafy a ukazatele** – Designer nabízí čitelné grafy, měřidla a průběhy s vlastními daty, jednotkami, rozsahem os a přesnou geometrií.

## Novinky ve verzi 0.1.285

- **Opravené fyzické překreslení** – přípravný příkaz obrazu má nyní všech osm bajtů vyžadovaných Picksmart protokolem. Displeje se softwarem 129 tak po přijetí dat skutečně spustí eInk refresh.
- **Nový firmware gatewaye 0.1.54** – stejná oprava platí pro lokální Bluetooth i přenosy přes ESP32/ESP32-S3 gateway.

## Novinky ve verzi 0.1.284

- **Jednodušší USB připojení** – port se vybírá ve stejném formulářovém stylu jako síťové údaje, bez samostatného obrázkového panelu.
- **Přímá volba desky** – ESP32 nebo ESP32-S3 lze zvolit kliknutím kamkoliv na kartu včetně obrázku; rušivé štítky Standard a Doporučeno byly odstraněny.
- **Paleta přímo u displeje** – vedle tužky jsou tři barevné záložky pro BWR a čtyři pro BWRY včetně žluté.
- **Kompaktní barevný proužek** – podporované barvy jsou spojené do jednoho čistého zaobleného obdélníku bez mezer.
- **Spolehlivé dokončení BWR 800×480** – poslední blok rychlého streamu je potvrzený a integrace čeká až 60 sekund na `05 08`, tedy na skutečné fyzické překreslení; pouhé zařazení 400 bloků do Bluetooth fronty už není považované za úspěch.

## Novinky ve verzi 0.1.283

  - **Přehledné menu nové gatewaye** – menší USB a síťový sloupec doplňuje velká volba ESP32/ESP32-S3 a přepracovaná instalace s kontrolou připravenosti, bez vnitřního posuvníku.
- **Stejná výška obou panelů** – instalační blok nové gatewaye odpovídá výšce levého navigačního panelu a na menších obrazovkách se bezpečně přeskupí pod sebe.
  - **Jednotné horní souhrny** – Gatewaye i Automatické zápisy používají stejné stavové dlaždice jako Fronta zápisu.
- **Bez kolize ručního a automatického zápisu** – ruční přenos má pro daný displej přednost a jeho automatika se aktivuje teprve po úspěšném nahrání.
- **BWR 800×480 se softwarem 129** – přenos už nekončí na 16. bloku nepodporovaným potvrzeným GATT zápisem; 96kB stream je místo toho bezpečně časovaný.

## Novinky ve verzi 0.1.282

- kompletně přepracovaný grafický vzhled sekce **Automatické zápisy** se souhrnnými metrikami, harmonogramem a přehlednějšími kartami displejů
- vylepšené mobilní rozložení a odstraněné vodorovné přetékání stránky
- spolehlivé dávkové potvrzování 96kB obrazu pro BWR 800×480, aby se displej neodpojil s posledními bloky pouze ve frontě BlueZ
- stabilní slučování nálezů z více gatewayí a 30minutová ochrana proti mizení displejů při krátce vynechaném BLE skenu

## Novinky ve verzi 0.1.281

- odstraněno 2,5sekundové čekání na každý BLE blok u streaming displejů SDK 46 a 299/315
- rychlý přenos zůstává dávkovaný a spojení se zavře až po bezpečném doposlání dat

## Novinky ve verzi 0.1.280

- opravené barvy a orientace BWRY 296×128 (SDK 46) podle čtyřbarevného formátu výrobce
- opravené obrazové roviny BWR 800×480 (SDK 299/315) a pád gatewaye během 96kB uploadu
- přibalený gateway firmware `0.1.53-gateway` pro ESP32 i ESP32-S3

## Novinky ve verzi 0.1.279

- přidána hlavní karta **Automatické zápisy** pro přehled, změnu intervalu a mazání plánovaných obnov displejů
- opraveno selhávání lokálního Bluetooth přenosu s chybou BlueZ `Write acquired` a navazující série přeskočených aktualizací

## Novinky ve verzi 0.1.278

- přegenerovány všechny PNG ikony v plné 512x512 / 1024x1024 velikosti dle specifikace HACS UI tabulky custom repozitářů

## Novinky ve verzi 0.1.277

- zaregistrovány lokální API brand cesty pro Home Assistant frontend server (`/api/brands/dratek_eink` a `/api/brands/custom_integrations/dratek_eink`)

## Novinky ve verzi 0.1.276

- přidány ikony `icon.png` a `logo.png` přímo do kořene GitHub repozitáře pro maximální kompatibilitu s HACS

## Novinky ve verzi 0.1.275

- opraveno zobrazování obrázkové PNG ikony v rozhraní Home Assistantu (odstraněn zbytečný override na MDI ikonku štítku v `manifest.json`)

## Novinky ve verzi 0.1.274

- odstraněn duplicitní nadpis sekce Gatewaye z rozvržení
- přizpůsobena výška a layout sekce flashování ESP32 tak, aby se vešla elegantně vedle levého panelu

## Novinky ve verzi 0.1.273

- vyřešeno zobrazování nového loga a ikony v HACS při vyhledání aktualizace i před stažením
- aktualizovány všechny brand ikony integrace pro světelný i tmavý režim Home Assistantu

## Novinky ve verzi 0.1.272

- kompletní grafické a rozvrhové vylepšení záložky **Nová gateway (USB Flash)**
- nová kaskáda kroků s přehlednými odznaky desek ESP32 / ESP32-S3 a specifikacemi
- zřetelný alert panel s checklistem pro případ chybějícího USB portu
- nová vývojářská konzole USB diagnostiky a nahrávání v dark terminálovém rozhraní

## Novinky ve verzi 0.1.271

- opraveno neočekávané odesílání přes lokální Bluetooth, když krátký sken právě nezachytil displej dostupný přes gateway
- ručně zvolená gateway se nyní zachová také při odesílání nové šablony

## Novinky ve verzi 0.1.270

- opraveno vyjednávání ATT MTU (247 bajtů vs 23 bajtů): vyřešeno uvíznutí na malém MTU, které způsobovalo zpomalení přenosu ze 3.4 s na 134 s

## Novinky ve verzi 0.1.269

- vylepšeno zpracování Bluetooth fronty a směrování přenosů pro ještě stabilnější odesílání na více displejů současně
- rozšířeny automatizované testy spolehlivosti fronty a správy zámků rádio rozhraní

## Novinky ve verzi 0.1.268

- šipky Meteoradaru ukazují skutečný aktuální směr proudění podle více bodů Open-Meteo
- tlačítko **Odeslat do displeje** po úspěchu dočasně zezelená a zobrazí potvrzovací ikonu
- opravena podoba slovenské vlajky v nastavení Meteoradaru

## Novinky ve verzi 0.1.267

- Meteoradar nyní rozlišuje slabé, střední a silné srážky pomocí čitelných e-Paper vzorů
- odstraněn spodní textový štítek a vylepšeny šipky orientačního proudění
- automatická obnova zachovává stejný stát a radarové volby jako ruční odeslání

## Novinky ve verzi 0.1.266

- opraveno zobrazování stavu `Zapisuje`: úloha je označena jako zapisující až v momentu získání Bluetooth rozhraní
- vylepšena reakce na vypršení časového limitu zápisu bloku pro okamžité obnovení přenosu

## Novinky ve verzi 0.1.265

- přidána nastavitelná zaškrtávací políčka u Meteoradaru pro volbu zobrazení srážek, tečkovaného rasteru a větrných šipek přímo v administraci displeje

## Novinky ve verzi 0.1.264

- přidáno rozlišení intenzity srážek na Meteoradaru: slabší srážky se vykreslují jako **tečkovaný červený vzor**, silné srážky jako **plná červená barva**

## Novinky ve verzi 0.1.263

- přidáno tlačítko **"Stáhnout protokol"** pro stažení kompletní historie fronty a detailních logů do `.txt` souboru
- opravena 282s blokace u neexistujících BLE zařízení (`never seen by any scanner` okamžitě selže)

## Novinky ve verzi 0.1.262

- vyřešen rozdíl rychlostí mezi displeji (3.4 s vs 455 s): opravena detekce verze firmware tak, aby všechny přenosy automaticky běžely v rychlém režimu streaming

## Novinky ve verzi 0.1.261

- opraven 455s zásek: zavedena fail-fast ochrana při selhání zápisu bloku – poškozené spojení se okamžitě ukončí a nahradí novým přenosem místo 455sekundového zacyklení po blocích

## Novinky ve verzi 0.1.260

- odstraněny duplicitní výpisy v logu `ha core logs` pro maximální přehlednost

## Novinky ve verzi 0.1.259

- opraveno zpomalování po několika nahráních: odstraněn neplatný parametr `use_services_cache`, který způsoboval fallback na neoptimalizovaný přímý `BleakClient`
- zprovozněno okamžité viditelné logování všech kroků přenosu pro `ha core logs`

## Novinky ve verzi 0.1.258

- opraveno ruční odesílání návrhu z panelu: odstraněna chyba `ReferenceError: request is not defined` v JavaScriptu panelu

## Novinky ve verzi 0.1.257

- ochrana automatických aktualizací pro displeje mimo dosah nebo vypnuté: bleskové přeskočení (0 ms) při neexistenci BLE vysílání a 15minutový penalizační backoff po selhání přenosu (ruční nahrávání "Odeslat" zůstává vždy aktivní)

## Novinky ve verzi 0.1.256

- vyřešeno postupné zpomalování přenosů po celodenním běhu (ze 10s na stovky sekund): deaktivováno ukládání zastaralých GATT služeb do paměti (`use_services_cache=False`) a přidáno čistění odkazů skeneru po odpojení (`async_rediscover_address`)

## Novinky ve verzi 0.1.255

- automatické rušení všech běžících smyček automatické obnovy při vypínání a restartu Home Assistantu (`EVENT_HOMEASSISTANT_STOP`)

## Novinky ve verzi 0.1.254

- možnost mazání uživatelských šablon přímo z knihovny v panelu, oprava partial update u dělených rozvržení, zvýšení čitelnosti fontů u malých bloků a oprava `bleak-retry-connector` pro MAC adresy v logu

## Novinky ve verzi 0.1.253

- vyřešeno hromadění starých úloh na pozadí při opakovaném reloadu integrace ve vývoji: automatické rušení smyček v `async_unload_entry`

## Novinky ve verzi 0.1.251

- opraveno zpomalení 2. a dalších cyklů automatických aktualizací pro více displejů: zachována rychlá vyhledávací mezipaměť BLE zařízení v Home Assistantu

## Novinky ve verzi 0.1.250

- opraveno zablokování přenosu na `Transfer attempt 1/3`: rádio zámek `async_radio_slot` upraven na re-entrantní režim pro vnořené úlohy fronty

## Novinky ve verzi 0.1.249

- vyřešeno zpomalení při nahrávání do více displejů současně: přímé přenosy nově striktně dodržují rádio slot, takže přenosy nekolidují v paměti Bluetooth adaptéru

## Novinky ve verzi 0.1.248

- automatické uvolňování BlueZ D-Bus socketů a 5ms pacing pro prevenci postupného zpomalování Bluetooth adaptéru v Linuxu

## Novinky ve verzi 0.1.247

- vylepšena diagnostika a směrování pro displeje mimo dosah Bluetooth adaptéru HA (`No backend with an available connection slot...`)

## Novinky ve verzi 0.1.246

- vyřešeno varování `BleakClient.connect() called without bleak-retry-connector` v logu Home Assistantu pomocí bezpečné integrace `establish_connection` s fallbackem

## Novinky ve verzi 0.1.245

- opraveno fyzické překreslování displejů: obnoveno potvrzování bloků (Write With Response / GATT ACK), které mikrokontrolér eInk displeje vyžaduje pro uložení snímku do paměti a spuštění obnovy e-paper panelu

## Novinky ve verzi 0.1.244

- radikální zrychlení nahrávání do displejů (z ~80 s na ~2 s): opraveno zbytečné vynucování ATT ACK potvrzování pro každý ze 40 bloků a zkráceny čekací pauzy před novým připojením

## Novinky ve verzi 0.1.243

- opravena chyba syntaxe v `transfer.py` z verze 0.1.242 (`SyntaxError: expected 'except' or 'finally' block`), díky čemuž se integrace po restartu Home Assistantu v pořádku načte

## Novinky ve verzi 0.1.242

- opravena chyba `[org.bluez.Error.NotPermitted] Write acquired` při lokálním Bluetooth přenosu do displeje: obnoveno přímé připojení `BleakClient` pro dávkový zápis obrázků

## Novinky ve verzi 0.1.241

- opraveno varování v logu Home Assistantu o druhé instanci Zeroconf (`async_discover_gateways` nově využívá sdílenou instanci z HA)
- lokální Bluetooth přenosy nově využívají `bleak_retry_connector` (pokud je k dispozici v HA), čímž se odstraňuje varování v logu a zlepšuje spolehlivost BLE spojení

## Novinky ve verzi 0.1.240

- opraveno OTA selhání u ESP32 gatewayí: přibaleny správně zkompilované binární soubory `0.1.52-gateway` pro všechny čipy (ESP32 i ESP32-S3), takže OTA aktualizace projde a správně přejde na novou verzi

## Novinky ve verzi 0.1.239

- navýšena cílová verze firmware gatewayí na `0.1.52-gateway` v panelu i v integraci, aby Home Assistant u připojených gatewayí správně detekoval novou verzi a umožnil jejich OTA aktualizaci

## Novinky ve verzi 0.1.238

- opraveno postupující zpomalování BLE přenosů (i lokálních) při připojení více gatewayí: přenosy se tiše zpomalovaly kvůli zahlcení pásma 2.4 GHz aktivními BLE scany z ESP32
- firmware gatewaye (0.1.51-gateway): `connectToDisplay()` nově zkouší nejprve přímé připojení na známou BLE adresu bez předchozího 6s scanu; duty cycle scanů snížen ze 75 % na 25 %
- Home Assistant: nový `radio.py` zavádí sdílený zámek (radio slot) pro všechny fyzické BLE operace (lokální i přes gatewaye) a skenování gatewayí v `ws_devices.py` probíhá sériově místo současně

## Novinky ve verzi 0.1.237

- opraveno, že se displej automaticky obnovil jen jednou a pak už nikdy: zrušený přenos (stačilo ručně odeslat návrh během probíhající automatické aktualizace) zůstal navždy ve stavu „probíhá" a každou další automatickou aktualizaci toho displeje pak fronta tiše zahodila
- interval automatické obnovy a volba, co ji spouští, se přesunuly z dialogu „Nastavení šablony" k displeji - na vlastní řádek hned pod tlačítko „Odeslat do displeje" (patří k displeji, ne k šabloně)
- zelené a oranžové stavové odznaky na kartách šablon i displejů jsou nově čitelné i v tmavém režimu; řídí se motivem Home Assistantu, ne nastavením operačního systému

## Novinky ve verzi 0.1.236

- opraven cizí text kreslený přes dny a teploty v pruhu předpovědi: stačil jeden údaj šablony, který je právě nedostupný, a zachytávání vazeb přiřadilo jedné entitě i buňky pruhu předpovědi - automatická aktualizace pak její hodnotu kreslila přes ně
- textový běh uvnitř řádku s grafem, měřidlem, předpovědí nebo kalendářem se už nezachytává zvlášť; celý řádek si překresluje jeho vlastní vazba, takže se hodnota nevykreslí dvakrát
- pozor: vazby vznikají při ručním odeslání, takže displej, který problém už má, je potřeba jednou znovu ručně odeslat

## Novinky ve verzi 0.1.235

- automatická aktualizace teď kreslí obsah šablony úplně stejně jako ruční odeslání, ne jen podobně: text i grafické řádky (graf, měřidlo, předpověď, kalendář) se skládají ze stejného SVG, jaké zapsal panel, místo aby se překreslovaly ručně dopočítaným přiblížením
- na měřené šabloně se ruční a automatické odeslání dřív lišilo v 6,99 % pixelů, teď v 0,00 % - obrazy jsou shodné
- opraven pád automatické aktualizace u návrhů obsahujících půlkruhové měřidlo s ručičkou (chybějící `import math` v `render.py`) - taková aktualizace dosud neproběhla vůbec

## Novinky ve verzi 0.1.234

- grafy/sloupce, měřidla (ciferník i mezikruží), předpověď počasí a kalendářní událost teď v automatické aktualizaci kreslí stejné fonty, velikosti a rozložení jako ruční odeslání - dosud se lišily formulemi na pozadí, i když se souřadnice zachytávaly správně
- řádek grafu uvnitř šablony (Spotové ceny, Cena elektřiny) se přestal kreslit jako ozdobný graf s osami a mřížkou a kreslí se jako prostý sloupcový/spark graf, přesně jako ruční odeslání; popisky sloupců a zvýraznění aktuálního intervalu červeně se teď přenášejí taky
- barva kalendářního rámečku (např. červené datum u Narozenin) se přestala ztrácet na automatické aktualizaci

## Novinky ve verzi 0.1.233

- opraveny čtyři další rozdíly mezi ručním a automatickým odesláním nalezené rozsáhlým porovnáním všech 24 šablon: přehnaně zvětšený text u seznamů a velkých čísel, mizející pevný text kombinovaný s hodnotou (např. "Dveře · Zamčeno" u Zabezpečení), a chybějící název nejbližší kalendářní události u Narozenin

## Novinky ve verzi 0.1.232

- předpověď počasí v automatické aktualizaci teď kreslí skutečné ikony (slunce, mrak, déšť, sníh...) místo textové zkratky - stejná grafika jako u ručního odeslání

## Novinky ve verzi 0.1.231

- opravena chyba, kvůli které šlo Stav počasí navždy jen na statický text z návrhu - nikdy nešel přiřadit k entitě, protože ho detekce "interních" polí omylem zaměnila za čas (slovo "čas" se schovávalo uvnitř "počasí")
- automatická aktualizace teď stavy jako "sunny"/"not_home"/"zamčeno" překládá do češtiny stejně jako ruční odeslání, místo aby vypsala syrový anglický stav Home Assistantu

## Novinky ve verzi 0.1.230

- opravena chyba z 0.1.229: u šablon s měřidlem/ciferníkem (Kvalita vzduchu, Obývák, Stav serveru, Fotovoltaika) se hodnota při automatické aktualizaci kreslila dvakrát přes sebe
- přidána pojistka proti rozbitému vykreslení předpovědi počasí, pokud meteo integrace vrátí neočekávaně mnoho dnů

## Novinky ve verzi 0.1.229

- opravena automatická aktualizace u 10 šablon (Počasí, Kalendář, Kvalita vzduchu, Obývák, Stav serveru, Fotovoltaika, Cena elektřiny, Zahrada, Spotřeba vody, České spotové ceny) - grafy, měřidla/ciferníky, předpověď počasí a kalendářní události se dosud do automatické aktualizace vůbec nezachytávaly a zůstávaly zamrzlé na hodnotě z posledního ručního odeslání
- backend nyní pro předpověď počasí a kalendářní události sám volá `weather.get_forecasts` / `calendar.get_events`, stejně jako to dosud dělal jen prohlížeč

## Novinky ve verzi 0.1.228

- možnost zrušení čekající úlohy ve frontě odesílání přímo z UI (tlačítko s ikonou křížku u úloh ve stavu `queued`)
- přidána WebSocket služba `dratek_eink/queue/cancel` a metoda `async_cancel_job` v backendu fronty

## Novinky ve verzi 0.1.208

- opraven stav, kdy Meteoradar zůstával navždy na "Načítám mapu…" bez jakékoli chyby – po neúspěšném pokusu (nejčastěji: HA po aktualizaci ještě neprošel restartem, takže kamerová entita zatím neexistuje) se nyní zobrazí konkrétní chybová hláška a další pokus proběhne mnohem dřív
- hranice České republiky nahrazeny přesnými daty ČÚZK (221 bodů) místo hrubého 35bodového přiblížení – obrys je nyní na displeji skutečně rozpoznatelný

## Novinky ve verzi 0.1.207

- šablona Meteoradar teď obsahuje jen samotnou mapu – bez nadpisu, popisku počasí a patičky – mapa vyplňuje celou plochu displeje

## Novinky ve verzi 0.1.206

- šablona Meteoradar konečně vykresluje skutečnou mapu – integrace má vlastní kamerovou entitu `camera.meteoradar`, která sama stahuje živá srážková data z RainViewer a skládá je do obrázku: černý obrys České republiky, uvnitř červeně vyznačené srážky, bíle tam, kde neprší
- žádné ruční nastavování kamery ani URL adres – funguje ihned po instalaci
- mapa se vykresluje na backendu, takže je pixelově shodná v náhledu, po ručním odeslání i po automatické aktualizaci displeje; data se obnovují nejvýše jednou za 10 minut (rychleji stejně RainViewer nová data nemá)

## Novinky ve verzi 0.1.193

- opravena skutečná příčina, proč se automaticky aktualizovaný obrázek vůbec nepodobal ručně odeslanému – automatika dosud jen "záplatovala" text přes uložený obrázek a hádala barvu pozadí za ním; pokud hodnota seděla na ikoně, přechodu barev nebo obrázku, přemalovala ji neprůhledným blokem
- automatická aktualizace nyní znovu použije celý obrázek šablony zachycený při posledním ručním odeslání a dosadí do něj jen aktuální hodnoty – výsledek je pixelově shodný s ručním odesláním
- vynucená krátká prodleva mezi odpojením a dalším připojením ke stejnému displeji zmírňuje zpomalení po několika nahráních rychle za sebou

## Novinky ve verzi 0.1.192

- opraveno postupné zpomalování nahrávání do displeje po delším běhu Home Assistantu – ruční odeslání, které přerušilo běžící automatickou aktualizaci, po sobě nechávalo napůl otevřené Bluetooth spojení a postupně zabíralo volné spojovací sloty, až nahrávání trvalo místo pár sekund celých 10 minut
- odpojení od displeje je nyní chráněné i před přerušením přenosu, takže se Bluetooth spojení vždy korektně uzavře

## Novinky ve verzi 0.1.191

- automatická aktualizace textu v šablonách vypadá stejně jako ruční odeslání – stejná velikost, tučnost i poloha písma; zmizelo nafouknuté a posunuté písmo z dřívějšího přerenderování na pozadí
- pozadí každého slotu se při automatické aktualizaci překreslí, takže předchozí hodnota je vždy překryta
- opraveno vynechávání hodnot – sloty šablony, které přeformátovaly interní značku (čísla, prázdné hodnoty, zkrácení textu), se nyní na automatickou aktualizaci napojí spolehlivě
- kde vykreslovací knihovna není dostupná (např. 32bitové ARM), aktualizace bezpečně spadne zpět na původní vykreslení – instalace se nikdy nezablokuje

## Novinky ve verzi 0.1.190

- automatický zápis přeskočený nebo sloučený během aktivního uploadu už sám sebe znovu nezařazuje a nevytváří nekonečnou smyčku ve frontě
- dříve uložené jednosekundové intervaly se na backendu automaticky omezí na bezpečné minimum 30 sekund
- nové předpřipravené šablony používají nastavený interval uživatele, standardně 60 sekund, místo pevné jedné sekundy
- skutečné změny entit vzniklé během uploadu se dál sloučí a po jeho dokončení proběhne nejvýše jeden následný zápis

## Novinky ve verzi 0.1.189

- přenos obrazu už neposílá další blok, dokud displej nepotvrdí předchozí GATT zápis; starší displeje pokračují až po vlastní blokové notifikaci
- nebezpečný nepotvrzovaný BLE stream byl odstraněn z Home Assistantu i gatewaye, aby displej nepřišel o bloky při zahlcení
- gateway firmware 0.1.50 přidává stejné potvrzované řízení toku pro ESP32 i ESP32-S3
- hodinový graf českých spotových cen zobrazuje jen dnešních 24 hodnot, i když integrace po poledni zpřístupní také zítřek; 15minutový režim zobrazuje 96 hodnot
- pořadí aktuální ceny správně používá rozsah 24 nebo 96 podle skutečného časového intervalu dat

## Novinky ve verzi 0.1.188

- proměnné šablony českých spotových cen se automaticky párují podle oficiálních ID entit i českých názvů z integrace Czech Energy Spot Prices; neplatné staré vazby se samy obnoví
- graf spotových cen čte časové atributy aktuálního dne, podporuje 24 hodinových i 96 čtvrthodinových hodnot a pořadí zobrazuje jako hodnotu z 24 nebo 96
- přenos do displeje z Home Assistantu i přes gateway je znovu rychlý díky správnému použití nepotvrzovaných BLE zápisů a řízení toku; gateway firmware byl zvýšen na 0.1.49
- texty a čísla v šablonách a grafech mají čitelnější velikost a běžnou tloušťku písma

## Novinky ve verzi 0.1.187

- designer šablon má sjednocené kompaktní rozhraní, samostatnou lištu nástrojů, přepínání formátu plátna a přehlednější vlastnosti vybraného prvku
- více změn jedné šablony se ukládá jako úplný snapshot a ve správném pořadí, takže starší automatické uložení už nepřepíše novější polohu, barvu, otočení ani typografii
- přibyla šablona Českých spotových cen pro integraci Czech Energy Spot Prices; graf je jeden přesouvatelný celek a automaticky se překresluje podle dat Home Assistantu
- katalog odděluje úpravu zdrojů dat od úpravy vzhledu, náhledy šablon zachovávají uložené změny a opakované vložení stejné šablony už náhled nesmaže
- stav displejů se na hlavní stránce průběžně obnovuje bez ručního načtení a ruční zámek gatewaye skryje ostatní přenosové cesty

## Novinky ve verzi 0.1.186

- proměnné předpřipravených šablon se nyní skutečně ukládají jako automatické vazby na entity Home Assistantu, takže jejich změna vytvoří položku „Změna entity“ ve Frontě zápisu
- backend překreslí hodnotu na její skutečné pozici ve výsledném SVG návrhu a zachová zarovnání, barvu i pozadí daného bloku
- automatické aktualizace na modelech bez hardwarově potvrzeného dílčího překreslení použijí spolehlivý kompletní zápis, aby displej přijatou změnu opravdu zobrazil
- automatický přenos dostává správnou verzi firmwaru displeje pro volbu odpovídajícího Bluetooth režimu

## Novinky ve verzi 0.1.185

- změna hodnoty navázané entity Home Assistantu se spolehlivě zařadí do Fronty zápisu i tehdy, když nastane během čekání nebo probíhajícího zápisu šablony
- po dokončení zápisu se aktuální hodnoty automaticky porovnají s odeslaným obrazem a případná mezitím vzniklá změna se doplní jako „Změna entity“
- zamčení displeje k vybrané gateway nebo lokálnímu Bluetooth zůstává zachované i po restartu Home Assistantu
- vlastní a předpřipravené šablony mají zcela oddělené prvky a stav editoru, takže se jejich obsah navzájem neprokresluje
- neúspěšný starší zápis už nemůže odstranit automatické vazby novější šablony

## Novinky ve verzi 0.1.184

- prvky designeru navázané na entity Home Assistantu se po změně hodnoty automaticky překreslí ve stejné šabloně
- do displeje se přenáší pouze skutečně změněná oblast; při nepodporovaném nebo nezarovnatelném výřezu se bezpečně použije celý obraz
- automatické vazby se ukládají spolu s úspěšně zapsaným návrhem a obnoví se i po restartu Home Assistantu
- grafy dál uchovávají nastavených 1–20 posledních hodnot a aktualizují pouze svůj vlastní prostor
- gateway firmware 0.1.48 přidává bezpečný dílčí přenos pro ESP32 i ESP32-S3

## Novinky ve verzi 0.1.183

- designer při posouvání stránky drží horní lištu, levou paletu i náhled displeje na místě
- grafy, ukazatele a signalizace lze napojit na entity Home Assistantu a grafy uchovávají nastavitelnou historii 1–20 hodnot
- vlastní prázdná šablona otevírá zcela čistý designer
- šablona skutečně uložená na displeji se pamatuje i po restartu a její celá karta je zelená
- náhled displeje na hlavní stránce se při najetí myší zvýrazní modře

## Novinky ve verzi 0.1.181

- odstraněny experimentální rychlé BlueZ přenosy, které mohly hlásit úspěch bez skutečného překreslení displeje
- přímý Bluetooth přenos opět potvrzuje každý obrazový blok; je pomalejší, ale na problematickém adaptéru prokazatelně doručuje celý obraz

## Novinky ve verzi 0.1.180

- přímý přenos na Linuxu používá flow-controlled socket BlueZ `AcquireWrite` místo neřízené D-Bus fronty, která mohla zahodit všechny obrazové bloky
- rychlá cesta předává celé 244bajtové bloky s kernelovým zpětným tlakem; při nedostupnosti socketu se automaticky použije bezpečný potvrzovaný pokus

## Novinky ve verzi 0.1.179

- rychlý Bluetooth přenos už nestřídá potvrzované a nepotvrzované zápisy, jejichž přechod na některých BlueZ adaptérech timeoutoval
- celý obraz včetně posledního bloku se odesílá jednotným tempovaným proudem; spojení zůstává otevřené pro bezpečné odtečení Bluetooth fronty

## Novinky ve verzi 0.1.178

- opraven falešně úspěšný rychlý Bluetooth přenos, po kterém se displej nepřekreslil: proud dat nyní potvrzuje každý osmý blok
- při selhání kontrolního bodu se přenos automaticky zopakuje bezpečným režimem s potvrzením každého bloku; velký displej má pro tento náhradní pokus dostatečný čas

## Novinky ve verzi 0.1.177

- výrazně zrychlen přímý Bluetooth přenos přes Home Assistant: u streamujících displejů se potvrzuje první a poslední blok, prostřední bloky se posílají jako bezpečně tempovaný proud
- displej 128×296 nyní potřebuje pouze 2 potvrzované BLE zápisy místo 40; oprava platí také pro velký SDK typ 75

## Novinky ve verzi 0.1.176

- opraven instalační ZIP pro Linux: frontend se nyní rozbalí do skutečného adresáře `frontend/`, takže panel již nekončí chybou 404

## Novinky ve verzi 0.1.175

- opraveno `Unable to load custom panel` po aktualizaci: nová verzovaná cesta panelu se v Home Assistantu vždy zaregistruje a stará registrace se při upgradu nahradí

## Novinky ve verzi 0.1.174

- hlavní přehled i nastavení displeje si pamatují poslední skutečně odeslaný obraz, a to i po restartu Home Assistantu
- náhled v nastavení znovu zobrazuje celý fyzický rámeček displeje
- výběr, přetažení nebo úprava šablony již nevytváří zbytečné zápisy ve frontě; na displej se odešle pouze po kliknutí na **Odeslat**

## Novinky ve verzi 0.1.173

- opravena chyba z verze 0.1.172: footer všech šablon byl nesprávně černý místo červeného; nyní je opět červený a cenovka bez akce má správně černý footer

## Novinky ve verzi 0.1.172


- cenovka bez akce je čistě černobílá – pruh je černý, footer s kódem zboží je černý, cena se zobrazuje jen jednou
- cenovka s akcí má červený pruh, přeškrtnutou původní cenu a novou zvýrazněnou cenu; footer s kódem zboží je červený
- opravena barva footeru u všech šablon: dříve byl vždy červený, nyní se řídí nastavením každé šablony
- v hlavičce displeje se adresa zobrazuje pod názvem na samostatném řádku; odstraněn text „Váš displej · Plocha pro šablony"

## Novinky ve verzi 0.1.171


- šablona se na displej zapisuje přesně, bez bílého pruhu u levého okraje
- ikony v šablonách se načítají spolehlivě, včetně počasí
- šablona vyplňuje celou plochu i na menším displeji
- každá šablona má průvodce, který ukáže, jaké integrace Home Assistantu potřebuje a co z nich už máte

## Novinky ve verzi 0.1.170

- náhled šablony v katalogu nyní odpovídá tomu, co se objeví na displeji – obojí kreslí jediný renderer
- přibyly cenovky s přepínačem Akce, který zvýrazní slevu; zapnout ji lze ručně i entitou
- šablony se napojují na entity samy podle jejich typu, předpověď a kalendář se načítají službami Home Assistantu
- Wi-Fi šablona posílá na štítek skutečný QR kód a stavy entit se zobrazují česky

## Novinky ve verzi 0.1.169

- každá z dvaceti šablon displeje má vlastní rozvržení – dosud jich dvacet sdílelo jen sedm opakujících se staveb a lišily se pouze texty
- šablony se přizpůsobují tvaru displeje: široké panely se skládají do dvou sloupců a písmo je na nich zhruba dvakrát větší
- opraveno logo v hlavičce panelu a přibalené písmo, které se od verze 0.1.168 nenačítaly
- ikony v náhledu displeje se načítají výrazně rychleji a už nemizí, když je Home Assistant nestihne dodat včas

## Novinky ve verzi 0.1.168

- opraven červený lem kolem černého textu na červené ploše, který se objevil ve verzi 0.1.167
- panel po aktualizaci už neukazuje starou verzi v hlavičce a nespouští staré moduly z mezipaměti prohlížeče
- opraveno ukládání a načítání projektů, které ve verzi 0.1.167 končilo chybou
- z integrace odstraněn nepoužívaný příkaz pro stahování libovolné URL ze serveru Home Assistanta

## Novinky ve verzi 0.1.167

- obnovena registrace osmi websocket příkazů (odeslání šablony přes gateway, ukládání i načítání projektů, vlastní prvky), která chyběla od verze 0.1.131
- kvantizace na černou/bílou/červenou je shodná v náhledu i v backendu a vykreslení obrazu je přibližně 8–18× rychlejší
- náhled šablony v editoru vzniká ze stejného SVG, které se odesílá na displej
- ruční odeslání textu i částečného překreslení zruší naplánovanou automatickou aktualizaci daného displeje
- opakování zápisu po výpadku Bluetooth již neblokuje ostatní displeje na stejné přenosové cestě
- instalační balíček HACS neobsahuje bytecode ani duplicitní firmware gateway
- klik na náhled v katalogu šablonu rovnou odešle na displej
- websocket vrstva je rozdělená do modulů `ws_*.py`; přenos po částech i řízení dokončení z verzí 0.1.152–0.1.166 zůstávají beze změny

## Novinky ve verzi 0.1.166

- přenos nyní přesně kopíruje řízení toku oficiálního Picksmart klienta: další blok následuje po skutečném dokončení předchozího GATT zápisu
- Home Assistant na BlueZ před přenosem explicitně vyjedná velké ATT MTU; v logu se zobrazí řádek `Negotiated ATT MTU`
- falešný úspěch bez vykreslení je odstraněn: timeout posledního bloku lze přijmout jen po potvrzení všech předchozích bloků
- diagnostika už neukládá samostatný řádek pro každý blok, takže fronta a panel nezpomalují horkou přenosovou smyčku; průběh zůstává viditelný po deseti blocích
- poslední odpověď má stále pouze dvousekundový timeout, aby přijatý a vykreslený obraz zbytečně nečekal
- firmware gatewaye zůstává `0.1.47-gateway`

## Novinky ve verzi 0.1.165

- SDK typ `51` už nekončí chybou, když displej přijme poslední blok a začne vykreslovat, ale BlueZ ztratí pouze jeho ATT odpověď
- rychlý přenos používá potvrzený první blok, tempované mezilehlé bloky a jednu závěrečnou GATT bariéru místo problematických bariér po osmi blocích
- závěrečná odpověď čeká maximálně dvě sekundy; její ztráta nezpůsobí opakování posledního bloku ani celého již přijatého obrazu
- po závěrečném předání se stále krátce čeká na volitelné potvrzení displeje `05 08`
- firmware gatewaye zůstává `0.1.47-gateway`

## Novinky ve verzi 0.1.164

- opraven timeout kontrolních bloků `7`, `15`, `23`, `31` a posledního bloku: před potvrzovaným blokem se nyní vyprázdní předchozí dávka BlueZ
- rychlé dávky s potvrzovací bariérou se používají také pro velké streamující displeje; pouhé lokální `Bluetooth queued 100 %` se už nepovažuje za dostatečné řízení toku
- timeoutovaný potvrzovaný blok se neopakuje a nemůže tak vložit stejná obrazová data dvakrát nebo poškodit buffer displeje
- pokud rychlý první pokus selže, nový přenos od začátku automaticky použije bezpečný potvrzovaný zápis každého bloku
- automatické obnovování fronty zůstává aktivní; firmware gatewaye zůstává `0.1.47-gateway`

## Novinky ve verzi 0.1.163

- přímý Bluetooth přenos SDK typu `51` používá rychlé dávky po osmi blocích místo pomalého ATT round-tripu po každém bloku
- první blok, každý osmý blok a vždy poslední blok se zapisují s GATT odpovědí; potvrzený poslední blok tvoří bariéru, před kterou musí Bluetooth zachovat pořadí celé dávky
- nepotvrzované bloky uvnitř dávky zůstávají krátce tempované, aby se nepřeplnila fronta BlueZ
- u 40blokového displeje klesá počet pomalých potvrzení ze 40 přibližně na 6, přičemž závěrečné potvrzení potřebné pro spolehlivé překreslení zůstává zachované
- automatické sekundové obnovování fronty z verze 0.1.162 zůstává aktivní; firmware gatewaye zůstává `0.1.47-gateway`

## Novinky ve verzi 0.1.162

- fronta se během stavu `Ve frontě` nebo `Zapisuje` automaticky obnovuje každou sekundu a po dokončení sama zastaví dotazování
- aktuální stav a poslední blok se průběžně promítají na kartu fronty, displejů i mapu připojení bez ručního tlačítka pro obnovení
- časovač se bezpečně ruší při zavření panelu a při otevření panelu se fronta načte automaticky
- po skutečně potvrzeném GATT zápisu byla odstraněna dodatečná pevná prodleva; ATT odpověď sama zajišťuje potřebné řízení toku a velké displeje tak neztrácejí další čas navíc
- firmware gatewaye zůstává `0.1.47-gateway`

## Novinky ve verzi 0.1.161

- přenos byl přímo porovnán se starší funkční integrací `0.1.126` z `D:\\28.7`; pro SDK typ `51` je obnovena její hardwarově ověřená výjimka vyžadující GATT odpověď u každého obrazového bloku
- charakteristika typu `51` už nepoužívá nepotvrzovaný zápis jen proto, že jej současně inzeruje; další blok se odešle až po potvrzení předchozího Bluetooth zápisu
- obnoven přesný šestibajtový příkaz `prepare update`, který používala funkční starší integrace
- po potvrzeném bloku zůstává zachována krátká 5ms prodleva ze staré implementace
- přiložen firmware gatewaye `0.1.47-gateway` pro ESP32 a ESP32-S3

## Novinky ve verzi 0.1.160

- opraven řídicí příkaz `prepare update`: podle originálního Picksmart SDK musí mít osm bajtů včetně dvou koncových rezervovaných nul, zatímco integrace i gateway dosud posílaly jen šest bajtů
- displej s firmwarem `0x80+` nyní dostane úplné parametry aktualizace a po přenosu bloků může skutečně spustit fyzické překreslení eInk panelu
- u zápisu bez GATT odpovědi zůstává Bluetooth připojení po posledním bloku déle otevřené, aby řadič bezpečně vyprázdnil frontu
- protokol nově rozlišuje blok potvrzený displejem od bloku pouze zařazeného Bluetooth stackem
- přiložen opravený firmware gatewaye `0.1.46-gateway` pro ESP32 a ESP32-S3

## Novinky ve verzi 0.1.159

- velký náhled se už neposílá Home Assistantu v jediné websocketové zprávě, ale v potvrzovaných 64KB částech
- backend části bezpečně složí, ověří úplnost a Base64 obsah a teprve potom vytvoří úlohu Bluetooth ve frontě
- rozpracovaná nahrávání mají omezenou velikost, počet částí i životnost, aby nezůstávala v paměti
- pokud Home Assistant odmítne data ještě před vytvořením úlohy, panel nově uvede přesné číslo odmítnuté části nebo chybu závěrečného zařazení

## Novinky ve verzi 0.1.158

- ruční odeslání návrhu přes Home Assistant Bluetooth i gateway se nyní okamžitě zařadí do fronty a websocket nečeká několik minut na dokončení BLE přenosu
- panel proto vždy dostane identifikátor úlohy a zobrazí ji ve frontě ještě před zahájením zápisu
- dočasná chyba při načítání fronty už nesmaže dříve načtené záznamy a nezobrazí falešně prázdnou historii
- úspěšné zařazení se už nevydává za dokončený zápis; panel jasně odlišuje čekající úlohu od skutečně zapsaného obrazu

## Novinky ve verzi 0.1.157

- opraveno zaseknutí přímého Bluetooth přenosu v Home Assistantu na 240sekundové pojistce: zapisovací charakteristika podporující oba GATT režimy nyní používá řízený zápis bez odpovědi, který je na Linuxu/BlueZ spolehlivější
- obrazové bloky se odesílají s krátkým odstupem, takže se nezaplní fronta Bluetooth adaptéru a displej dostane celý obraz
- každá GATT operace má vlastní osmivteřinový timeout s konkrétním názvem kroku místo čekání na obecný čtyřminutový timeout
- fronta zobrazuje skutečnou verzi backendu a nabízí rozbalení celého protokolu přenosu
- pro tuto opravu není potřeba aktualizovat firmware gatewaye

## Novinky ve verzi 0.1.156

- opraven skutečný důvod 240sekundového timeoutu: přenos nyní rozlišuje dva protokoly výrobce podle bitu `0x80` softwarové verze displeje
- novější displeje po prvním požadavku dostanou souvislý proud bloků potvrzovaných GATT zápisem; starší displeje zůstávají v režimu řízeném notifikací po každém bloku
- softwarová verze z BLE reklamy se předává přímému Bluetooth i gatewayi, takže velké displeje už nezůstanou po prvním bloku čekat
- počet úplných opakování přenosu byl omezen a bezpečnostní timeout nyní vypíše poslední dosažený krok
- přiložen firmware gatewaye `0.1.45-gateway` pro ESP32 a ESP32-S3

## Novinky ve verzi 0.1.155

- opraveno zobrazení websocketové chyby `unknown_error`, která ve verzi 0.1.154 překryla podrobnější zprávu Home Assistantu
- pokud odpověď websocketu vypadne během přenosu, panel nyní ověří skutečný stav úlohy ve frontě a rozliší dokončený, pokračující a neúspěšný přenos
- prázdná výjimka Bluetooth vrstvy se uloží s názvem svého typu, takže už nikdy nezmizí za obecným textem bez diagnostiky

## Novinky ve verzi 0.1.154

- opraveno chybné ukončení přenosu hláškou `Unknown error` u displejů, které po posledním vyžádaném bloku neposílají volitelné potvrzení `05 08`
- řízení toku po jednotlivých požadavcích displeje zůstává zachované, takže se bloky neztrácejí ani u velkých obrazů
- přímý Bluetooth i firmware gatewaye nyní dokončí přenos po doručení všech bloků a krátce přijmou případné dodatečné potvrzení nebo požadavek na retransmisi
- panel zobrazuje konkrétní chybový kód a zprávu Home Assistantu místo obecného textu `Unknown error`
- přiložen nový firmware gatewaye `0.1.44-gateway` pro ESP32 a ESP32-S3

## Novinky ve verzi 0.1.153

- BLE přenos nyní posílá vždy jen blok, který si displej výslovně vyžádá, takže velké obrazy nepřetékají frontu kolem bloků 11–13
- ztracený blok se na požádání displeje automaticky odešle znovu a přenos skončí až po potvrzení `05 08`, že displej přijal celý obraz
- plná aktualizace už není označena jako hotová po pouhém lokálním GATT zápisu; tím se předchází nedokončenému obrazu, oříznutí a překrytí staré a nové šablony
- stejný opravený protokol používá přímý Bluetooth Home Assistantu i firmware gatewaye `0.1.43-gateway`
- velikost BLE bloku se správně čte jako 16bitová little-endian hodnota pro všechny podporované modely
- hlavní lišta zůstává dostupná také v nastavení displeje a informace o displeji jsou sjednocené do jednoho kompaktního panelu
- náhledy šablon respektují skutečný formát displeje, živé hodnoty a umožňují přesouvat i měnit velikost částí šablony před uložením a odesláním

## Novinky ve verzi 0.1.152

- lokální Bluetooth přenos používá potvrzení GATT pro každý blok, kdykoli je displej podporuje, takže se při odesílání velkých obrázků neztrácejí bloky ve frontě BLE
- průběh přenosu nyní přesně rozlišuje bloky potvrzené displejem od bloků pouze předaných lokálnímu Bluetooth stacku
- opraven lokální testovací panel: bezpečně vykreslí náhradní ikonu a po spuštění načte aktuální seznam displejů

## Novinky ve verzi 0.1.151

- opraveno ruční nahrávání návrhů do velkých displejů přes jejich zvolenou gateway
- SDK typ `296` používá správné rozlišení 800 × 480 také v backendovém obrazovém bufferu
- potvrzení úspěchu se zobrazí až po skutečně dokončeném zápisu; případná chyba přenosu se nyní zobrazí přímo v aplikaci
- displeje zůstávají v čistě ručním režimu bez automatických aktualizací

## Novinky ve verzi 0.1.150

- integrace je přepnuta do čistě ručního režimu bez automatických zápisů při změnách entit
- při startu se odstraní staré uložené automatiky, takže hodiny ani dřívější šablona již nový obsah nepřepíšou
- vypnuty jsou periodické BLE skeny, polling fronty, automatické obnovování přehledu a backendové náhledy při editaci
- panel vykresluje pouze otevřenou záložku, zachovává statické styly a neduplikuje překreslení canvasu
- data gatewayí, fronty a sériových portů se načtou až po ručním otevření příslušné stránky
- lokální náhled používá SVG cesty ikon a nezobrazuje náhradní čtverce

## Novinky ve verzi 0.1.149

- odeslání nového návrhu odstraní všechny staré automatické aktualizace daného displeje
- čekající časovače a naplánované aktualizace předchozího návrhu se zruší
- po úspěšném zápisu zůstanou aktivní pouze automatizace obsažené v novém návrhu
- návrh bez automatizací již nemůže být později přepsán starými hodinami nebo jinou dřívější šablonou

## Novinky ve verzi 0.1.148

- technické vydání ověřeného stavu integrace pro HACS
- sjednocena verze backendu, panelu a přehledové karty na `0.1.148`
- zachovány opravy registrace statických souborů a načítání panelu z verze `0.1.146`

## Novinky ve verzi 0.1.146

- opravena registrace statických souborů panelu po aktualizaci nebo opětovném načtení integrace
- URL `/dratek_eink_panel/dratek-eink-panel.js` již nezůstane bez obsluhy, pokud Home Assistant panel zná z předchozí registrace
- odstraněna chyba `Unable to load custom panel` způsobená odpovědí HTTP 404

## Novinky ve verzi 0.1.145

- opraven převod černého textu do tříbarevného obrazu bez červeného obrysu kolem vyhlazených hran
- červená se zachová pouze u skutečně červeně dominantních pixelů; neutrální okraje textu se převedou jen na černou nebo bílou
- stejná opravená kvantizace se používá v nativním SVG rendereru i záložní exportní cestě

## Novinky ve verzi 0.1.144

- šablony se nově generují přímo jako nativní SVG v rozlišení displeje, s dosazenými hodnotami z Home Assistantu a ikonami jako skutečnými vektory
- náhled i obrázek odeslaný do displeje vznikají z jednoho a téhož SVG, takže si odpovídají z principu
- šablona vždy vyplní celou plochu displeje a text má výrazně větší, na e-inku čitelné velikosti

## Novinky ve verzi 0.1.143

- opravena skutečná příčina chybějících ikon v odeslaném obrázku – ikona `ha-icon` v Home Assistantu vykresluje SVG přes vnořený prvek s vlastním shadow rootem, což export dřív vůbec nedokázal najít; export teď prochází libovolně vnořené shadow roots

## Novinky ve verzi 0.1.142

- prodlouženo čekání na dokreslení ikon před exportem obrázku (ze 150 ms na až 3 sekundy) – ikony se předtím do odeslaného obrázku i do nového 1:1 náhledu téměř nikdy nestihly zahrnout

## Novinky ve verzi 0.1.141

- náhled v ploše pro šablony teď ukazuje stejný ditrovaný, pixelovaný obrázek v nativním rozlišení displeje, jaký se skutečně odesílá na fyzický displej, místo hladkého HTML náhledu – vidíš tak 1:1, jak bude displej opravdu vypadat

## Novinky ve verzi 0.1.140

- zásadní oprava odesílání do displeje – export obrázku odstraňoval ikony, které se ještě nestihly vykreslit, což posunulo celé rozložení šablony a způsobilo, že odeslaný obrázek vůbec neodpovídal náhledu (text přes text, chybějící ikony); export teď na ikony počká a rozložení šablony už nikdy nenaruší

## Novinky ve verzi 0.1.139

- opravena šablona Počasí – nadpis omylem ukazoval ukázkový text dne v týdnu místo stavu počasí, což při napojení na reálnou entitu způsobovalo zmatený/přetékající text
- texty proměnných v šabloně Počasí se při přetečení teď ořežou třemi tečkami místo přetečení do sousedního řádku

## Novinky ve verzi 0.1.138

- opravena verze zobrazená v hlavičce panelu, která zůstávala natvrdo na 0.1.134 – číslo verze bylo zdvojené na čtyřech místech a tři z nich se při minulých vydáních neaktualizovaly

## Novinky ve verzi 0.1.137

- opraven export šablony do obrázku odesílaného na displej – dřív se v exportu neuplatnilo správné rozvržení a použil se nesouvisející styl se stejným názvem třídy, takže odeslaný obrázek vůbec neodpovídal náhledu

## Novinky ve verzi 0.1.136

- opraveno tlačítko **Odeslat do displeje**, které hlásilo „Unknown command“ a nikdy neodeslalo návrh – chyběla registrace příkazu při startu integrace

## Novinky ve verzi 0.1.135

- šablona v ploše pro šablony se automaticky vyplní na celou plochu displeje nebo celou polovinu u velkého displeje, bez ručního posouvání a bez chybějících pixelů po okrajích
- formát šablony (na výšku/na šířku) se nastavuje automaticky podle skutečného tvaru zobrazovací plochy
- při přetahování šablony na velký displej se podle pozice kurzoru oranžově zvýrazní cílová polovina a šablona se umístí přesně tam, kam byla puštěna
- zjednodušený informační blok aktuálního displeje na dva řádky se stejnými ikonami baterie a signálu jako na hlavní stránce
- zvětšené náhledy displejů na hlavní stránce pro lepší čitelnost obsahu
- náhled displeje v nastavení šablon nyní vždy odpovídá tvarem rámečku náhledu na hlavní stránce

## Novinky ve verzi 0.1.134

- Katalog šablon má nové karty ve stylu karet displejů a podporuje přetažení šablony přímo na displej.
- Informace o aktuálním displeji jsou nyní v kompaktním bloku nad plochou displeje bez duplicitního náhledu.
- Název displeje, model, adresa, fyzický kód, baterie a signál zůstávají dostupné na jednom místě.

## Novinky ve verzi 0.1.133

- Nové nastavení displeje se šablonami, vyhledáváním, kategoriemi a napojením proměnných z Home Assistantu.
- Designer podporuje orientaci, přiblížení, velikost a přesouvání šablon včetně rozložení jedné nebo dvou šablon.
- Opraveno odesílání náhledu do displeje, tříbarevný převod a zpracování obrázků bez chyby CORS canvasu.
- Náhled na hlavní stránce se po odeslání aktualizuje podle skutečného rozložení a velikosti v designeru.
- Editor má stabilní výšku a samostatně posuvný panel nastavení.

## Novinky ve verzi 0.1.132

- opraveno publikování aktualizací pro HACS
- verze je publikována jako skutečný GitHub Release s přiloženým `dratek_eink.zip`
- balíček obsahuje integrační soubory přímo v kořeni, jak vyžaduje `zip_release`

## Novinky ve verzi 0.1.131

- karty displejů otevírají nové nastavení s informacemi o zařízení, galerií šablon a editorem
- malý displej používá jednu šablonu, velký až dvě s výběrem konkrétní pozice při nahrazení
- šablony lze přesouvat, přepínat mezi úzkým a širokým formátem a odeslat přímo do displeje
- náhledy se přizpůsobují orientaci i velikosti panelu bez rozpadu rozložení
- samostatný Designer HA prvků a původní Designer displeje byly odstraněny
- starší uložené návrhy zůstávají zachované pro náhledy a automatické aktualizace

## Novinky ve verzi 0.1.130

- návrhy lze přidávat do fronty i během probíhajícího zápisu
- různé gatewaye mohou zapisovat na různé displeje současně
- každá gateway zachovává bezpečné pořadí vlastních úloh
- editor ihned potvrdí zařazení návrhu do fronty a nezůstává blokovaný až do dokončení přenosu

## Novinky ve verzi 0.1.129

- HACS stahuje explicitní release ZIP obsahující ikonu a ostatní lokální značky integrace
- balíček má správnou strukturu pro přímé rozbalení do `custom_components/dratek_eink`
- cesty uvnitř ZIPu jsou přenositelné mezi Windows a Linuxem

## Novinky ve verzi 0.1.128

- hlavní designer i Designer HA prvků používají přímo nativní výběr entit Home Assistantu
- výběr entit je sjednocen pro proměnné, texty, grafy, stavové prvky, pravidla a vrstvy
- fyzické rámečky displejů se při změně orientace otáčejí jako jeden celek
- velký displej 400 × 300 má opravené tělo bez zdvojených šedých pásů a přesně zarovnanou obrazovou plochu

## Novinky ve verzi 0.1.127

- celé rozhraní lze přepínat mezi češtinou a angličtinou přímo v horní liště
- každá sekce má kontextovou nápovědu a dialogy se správně zobrazují nad hlavičkou
- hlavní stránka má opravené náhledy, shodný displejový font a přehledné seznamové zobrazení
- vyhledávací pole udrží fokus i během automatického překreslování stránky
- Designer HA prvků sdílí nástroje hlavního designeru a podporuje pokročilé vrstvy a pravidla
- mapa připojení umožňuje spolehlivě uzamknout displej také k lokálnímu Bluetooth adaptéru

## Novinky ve verzi 0.1.126

- sekce **Gatewaye** má nové přehledné rozložení a karty ve stejném vizuálním stylu jako displeje
- grafy a signalizace umožňují vybrat Home Assistant entitu nebo zadat její Entity ID ručně
- Designer HA prvků podporuje časová pravidla **Od–Do**, včetně intervalů přes půlnoc
- živý náhled a automatické vykreslování používají stejné vyhodnocení časových pravidel
- signalizace nahrávání na kartě displeje už neposouvá ani nezmenšuje náhled

## Novinky ve verzi 0.1.125

- ruční volba gateway se přesunula do **Mapy připojení**, kde lze displej přetáhnout na požadovanou gateway
- ručně přiřazený displej je v mapě oranžově zvýrazněný a uzamčený; zámkem lze obnovit automatický výběr nejsilnější gateway
- mapa ukazuje oranžový stav probíhajícího nahrávání a krátký zelený stav úspěšného přenosu a vykreslování
- po odeslání posledního bloku se BLE spojení uvolní bez čekání na volitelné potvrzení vykreslení, takže fronta může pokračovat dalším displejem
- firmware gateway byl aktualizován na `0.1.42-gateway`
- hlavička používá nové společné logo DRÁTEK.CZ eInk bez přidaných efektů a zarovnané zcela vlevo

## Novinky ve verzi 0.1.124

- náhled displeje na hlavní stránce nyní používá stejný fyzický rámeček a obsah jako designer a celý se zmenšuje přesně 1:1
- opraveno krátké probliknutí nesprávného fontu při načítání náhledů
- při přesouvání objektu v designeru se objekt pohybuje živě společně s výběrovým rámečkem
- displej automaticky vybírá dostupnou gateway s nejsilnějším signálem a pro každý displej lze gateway zvolit také ručně
- automatické aktualizace lépe opakují přenos při dočasně obsazeném BLE spojení
- spolehlivější flashování ESP32: filtrování vhodných sériových portů, aktuální příkazy `esptool` a odolnější předání Wi-Fi konfigurace po restartu

## Novinky ve verzi 0.1.123

- přepracované karty displejů s větším náhledem a přesně zarovnanými indikátory baterie, signálu a připojení
- karta právě zapisovaného displeje se světle oranžově zvýrazní a zobrazí stav **Právě se nahrává**
- přímé přejmenování displeje v názvu karty s potvrzením pomocí fajfky
- nový fyzický náhled displeje 400 × 300 se štítkem, čárovým kódem a MAC adresou
- konzistentní radiusy rámečků mezi malým náhledem a editorem
- vylepšený výběr, změna velikosti a rotace objektů v designeru
- automatické přizpůsobení velikosti textu oblasti s možností ručního přepsání
- sjednocené ovládací panely designeru a kompaktní informační řádek aktivního displeje

## Novinky ve verzi 0.1.122

- přidáno tlačítko **Odeslat výběr**, které odešle do displeje jen oblast se zvolenými objekty; oblast se automaticky zarovná na osm řádků podle protokolu
- částečný refresh lze nyní vyzkoušet na všech modelech displejů; celý návrh lze dál odeslat původním způsobem
- opraveno riziko ztráty uloženého návrhu při výpadku spojení s Home Assistantem během načítání
- rozpracované změny se při opuštění panelu uloží okamžitě, i když ještě nevypršel čas automatického ukládání
- opraveny ovladače zoomu a přidány celočíselné úrovně **1× až 4×** a **Fit**
- vyhledávání displejů už při psaní neztrácí fokus ani pozici kurzoru
- zjednodušeny karty displejů, upraveno zobrazení baterie, signálu a cesty připojení a obnoveno otevření designeru kliknutím na kartu
- opraveno zarovnání ikony aktivního displeje v designeru

## Novinky ve verzi 0.1.121

- hlavní stránka **Nalezené displeje** má nový přehledný panel s vyhledáváním displejů podle názvu, adresy i rozlišení
- vedle vyhledávání je tlačítko pro reset hledání a nové obnovení seznamu, vpravo pak přepínač zobrazení Velké / Malé / Seznam
- displeje jsou nově ve čtvercových kartách a kliknutí na kartu displej pouze **vybere**; vpravo se zobrazí jeho náhled, údaje a nastavení
- editor se otevírá až tlačítkem **Otevřít v designeru**, takže prohlížení displejů už needituje omylem návrh
- v pravém panelu je nové tlačítko **Najdi mě**, které nechá displej bliknout pro snadné dohledání na regálu
- v pravém panelu lze také rozbalit ovládání **RGB diody** displeje bez otevírání designeru
- náhledy displejů se vždy vejdou do karty na jakémkoliv rozlišení monitoru a už nepřetékají
- **opraven rozmazaný náhled**: náhledy nyní ukazují čisté eInk barvy (černá, bílá, červená) bez šedých mezistupňů
- záložka Designer v horní liště byla nahrazena záložkou **Mapa připojení**, kam se mapa přesunula ze spodní části stránky displejů
- designer se otevírá v přesném rozlišení displeje 1:1 místo automatického přizpůsobení oknu
- přehlednější horní část designeru s informacemi o displeji a příkazovou lištou

## Novinky ve verzi 0.1.120

- opraveno tlačítko **Otevřít v designeru** i kliknutí na náhled displeje v hlavním přehledu
- vybraný displej se nyní načte a editor se automaticky otevře na záložce Designer

## Novinky ve verzi 0.1.119

- opravena struktura záložek v editoru displeje a jejich přepínání
- sjednocena verze frontendu s integrací, aby se po aktualizaci načetl opravený panel

## Novinky ve verzi 0.1.118

- opravena chybná HTML struktura obalovacích kontejnerů záložek v `_render()`
- opraveno přepínání záložek Fronta zápisu, Gatewaye a Designer
- zrušeno nucené přesměrování při přepnutí na záložku Designer (zobrazí se prázdný naváděcí stav)

## Novinky ve verzi 0.1.117

- přidán parametr `{ willReadFrequently: true }` do všech volání `getContext("2d")` v `dratek-eink-panel.js`
- odstraněna varování Chrome Canvas2D a zrychlen čtení pixelů při ditheringu i náhledech

## Novinky ve verzi 0.1.116

- opravena výjimka při registraci posluchačů událostí (přidáno `?.` k tlačíku `#sendDesign`)
- opravena plná podpora Dark Modu z Home Assistantu (odstraněny natvrdo zadané světlé barvy z `:host`)

## Novinky ve verzi 0.1.115

- opravena chybějící ukončovací závorka na řádku 6144 u metody `_drawChart` v `dratek-eink-panel.js`
- vyřešeno chybné červené podtržení v editoru a obnovena správná struktura třídy

## Novinky ve verzi 0.1.114

- přidány bezpečnostní kontroly nulových rozměrů v `_drawScene`, `_applyEinkPreview` a `_applyColorInversion`
- zamezeno možným výjimkám `IndexSizeError` / `DOMException` při inicializaci plátna

## Novinky ve verzi 0.1.113

- optimalizováno pro 3-barevné eInk displeje dratek.cz (Červená / Bílá / Černá - BWR)
- zapnuty a prověřeny všechny nové funkce (Floyd-Steinberg dithering pro fotky, Weather Forecast Widget, Časová okna u grafů, Bateriový Úsporný Režim, Šablony a Import/Export JSON)

## Novinky ve verzi 0.1.112

- odstraněn duplicitní blok metod `_renderInspectorGeometry` a `_renderProperties` v `dratek-eink-panel.js`
- kompletně opraveny všechny syntaktické chyby a zvýrazňování editoru v celém souboru

## Novinky ve verzi 0.1.111

- kompletně opravena a obnovena struktura metody `_renderProperties` na řádcích 5203–5210 v `dratek-eink-panel.js`
- všechny metody třídy a zálohování vlastností fungují 100% čistě bez syntaktických chyb

## Novinky ve verzi 0.1.110

- opravena chybná ukončovací závorka na řádku 4717 v obsluze záložek v `dratek-eink-panel.js`
- odstraněn `SyntaxError: missing ) after argument list` z konzolových chyb prohlížeče

## Novinky ve verzi 0.1.109

- opravena kritická chyba vykreslování plátna v metodě `_drawSelection` v `dratek-eink-panel.js`
- rozhraní editoru v Home Assistantu se načte okamžitě bez jakékoliv chybové nebo černé obrazovky

## Novinky ve verzi 0.1.108

- opraveno prvotní vykreslení rozhraní v `connectedCallback()`
- přidány záložní CSS proměnné na `:host` pro kompletní podporu světlého i tmavého režimu Home Assistantu

## Novinky ve verzi 0.1.107

- opravena chyba syntaxe v rozhraní Inspector v souboru frontendového panelu `dratek-eink-panel.js`
- panel se v prostředí Home Assistantu po aktualizaci načte bez chybové bílé obrazovky

## Novinky ve verzi 0.1.106

- přidán režim **Floyd-Steinberg Dithering** pro jemné tečkované zobrazení fotografií na eInku
- nový **Weather Forecast Widget** (Předpověď počasí) napojený na `weather.*` entity s ikonami a teplotami
- přidán **výběr časového okna u grafů** (1h / 6h / 24h / 7 dní)
- rozšířena knihovna hotových šablon (Meteo, FVE, Cenovka, Status Domu)
- automatický **Úsporný režim baterie (Battery Saver Mode)** zastropuje obměnu na 1 hodinu při baterii < 15 %
- podpora **Importu a Exportu** komplet návrhů do `.json` souborů v nabídce Soubor

## Novinky ve verzi 0.1.105

- kompletní redesign editoru s novým studiovým pozadím a vylepšenými ovládacími prvky
- přidané tlačítko 1:1 pro zobrazení náhledu v přesném fyzickém rozlišení displeje (100 %)
- striktní pixelový eInk rozklad s ostrou paletou barev (černá, bílá, červená, žlutá) bez antialiased šedých přechodů
- doplněna CSS pravidla pro zachování ostrých pixelových hran při jakémkoliv zvětšení

## Novinky ve verzi 0.1.104

- odstraněno problikávání dvou fontů v náhledu Designeru při změnách entit
- poslední potvrzený backendový obraz zůstává viditelný, dokud není připravený celý nový obraz
- lokální canvas už nemůže na okamžik překrýt kanonický náhled odlišným fontem nebo grafem

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
