# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [0.1.178] - 2026-08-03

### Opraveno
- Zrychlený přenos z verze 0.1.177 mohl na BlueZ skončit falešným úspěchem: operační systém přijal nepotvrzované bloky do Bluetooth fronty, ale displej je nepřevzal a obraz se nepřekreslil. Rychlý přenos nyní uzavírá krátké dávky potvrzeným GATT zápisem každých 8 bloků a před každým kontrolním bodem nechá frontu 0,8 sekundy odtéct.
- Pokud kontrolní bod selže, další pokus automaticky přejde do spolehlivého režimu s potvrzením každého obrazového bloku. Celková bezpečnostní pojistka fronty byla zvýšena na 600 sekund, aby tento náhradní režim stihl dokončit i přenos 300×400; běžný rychlý pokus se tím nezpomaluje.

## [0.1.177] - 2026-08-03

### Opraveno a zrychleno
- Přímý Bluetooth přenos streamujících displejů, které nabízejí `write` i `write-without-response`, už nečeká na pomalý ATT round-trip u každého obrazového bloku. První blok je potvrzený, prostřední bloky tvoří 40ms tempovaný proud a poslední potvrzený blok funguje po sekundovém odtečení fronty jako doručovací bariéra. U displeje 128×296 se tak počet potvrzovaných zápisů snižuje ze 40 na 2; stejná oprava platí pro velký SDK 75.
- Zůstává zachována ochrana proti poškození obrazu: nejednoznačně timeoutovaný poslední blok se přijme pouze tehdy, když byla potvrzena vstupní bariéra a všechny předchozí bloky byly v pořadí předány. Charakteristiky s jediným režimem zápisu nadále používají plně potvrzovaný bezpečný přenos.

## [0.1.176] - 2026-08-03

### Opraveno
- Release ZIPy 0.1.174 a 0.1.175 vytvořené ve Windows obsahovaly zpětná lomítka v názvech položek. Linux je nerozbalil jako adresáře, ale vytvořil v kořeni integrace soubory pojmenované např. `frontend\dratek-eink-panel.js`; skutečný adresář `frontend/` proto neexistoval a panel končil na 404. Nový release builder zapisuje výhradně POSIX cesty a regresní test zakazuje jakékoli zpětné lomítko v archivu.

## [0.1.175] - 2026-08-03

### Opraveno
- Po aktualizaci integrace mohl panel odkazovat na novou verzovanou adresu, zatímco Home Assistant její statickou HTTP cestu kvůli starému booleovskému příznaku znovu nezaregistroval. Načtení pak končilo chybou `Unable to load custom panel` a všechny soubory pod `/dratek_eink_panel/<verze>/` vracely 404. Integrace nyní sleduje každou verzovanou cestu samostatně a při změně verze nahradí starou registraci panelu podporovaným API Home Assistantu.

## [0.1.174] - 2026-08-03

### Opraveno
- Náhledy na hlavní stránce a v nastavení displeje ukazují poslední obrázek, který byl na displej skutečně úspěšně odeslán. Snímek se ukládá v Home Assistantu a po restartu integrace se znovu načte; neodeslaná rozpracovaná šablona už nemění stav fyzického displeje v přehledu.
- Náhled v nastavení znovu obsahuje celý rámeček displeje. Kvantizované plátno je vloženo dovnitř obrazovky a nepřekrývá konstrukci zařízení.
- Kliknutí na dlaždici šablony, její přetažení, vyřešení konfliktu rozvržení ani změna cenové akce už nevytváří zápis ve frontě. Fyzický přenos se spustí pouze explicitním tlačítkem **Odeslat**.

## [0.1.171] - 2026-08-02

### Opraveno
- **Šablona se na displej zapisovala posunutá.** Odesílaný obrázek nevznikal ze stejného rendereru jako náhled – klonoval se viditelný DOM do SVG `foreignObject` a ten se rasterizoval. Klon při vyříznutí ztratil měřítko i pozicovací kontext svého rodiče, takže kresba v exportu sedla mimo, zatímco náhled na obrazovce vypadal správně a nic na příčinu neukazovalo. Na štítku na výšku zůstávalo vlevo 7 pixelů prázdna, na štítku na šířku 51 z 296, tedy šestina displeje. Obrázek pro panel nyní staví stejný renderer jako náhled, v nativním rozlišení displeje; snímání DOM je odstraněné i s celou svou obsluhou klonování a vkládání stylů. Ověřeno na šesti kombinacích velikostí a orientací: kresba dosedá na levý, pravý i spodní okraj přesně.
- **Ikony v šablonách se nenačítaly.** Home Assistant vykresluje `ha-icon` přes vnořený `ha-svg-icon`, který nejdřív vytvoří `<svg><g></g></svg>` a `<path>` doplní teprve po stažení příslušného balíku ikon. Panel považoval za hotovou každou neprázdnou `<svg>`, takže zachytil prázdnou skupinu, uložil si ji jako úspěšně načtenou a už ji nikdy nezkusil znovu – ikona, která tenhle závod prohrála, zůstala prázdná po celou relaci. Šablona počasí si žádá pět ikon z jednoho balíku naráz a prohrávala pokaždé, zatímco šablona domu vyhrávala. Ikona se nyní považuje za vykreslenou, až když `<svg>` obsahuje něco kreslitelného; stejnou slabinu měla i čekací smyčka před odesláním obrázku.
- **Šablona nevyplňovala celou plochu menšího displeje.** Byla umisťovaná jako přesunutelný objekt na 96 % plochy, což vlevo a nahoře nechávalo bílý pruh – naměřeno 11 pixelů vlevo proti jednomu vpravo. Přesouvání dává smysl jen na displeji 400×300, kde se na obrazovku vejdou dvě šablony vedle sebe; na menším displeji je šablona vždy přes celou plochu a nenabízí už uchopení, které by stejně nemělo kam pohnout.

### Přidáno
- **Průvodce nastavením u každé šablony.** Otazník na dlaždici a tlačítko v nastavení otevřou okno, které jmenuje konkrétní integrace Home Assistantu poskytující entity, jež šablona potřebuje – u kalendáře třeba Místní kalendář, Google Calendar a CalDAV, u zabezpečení ústřednu alarmu a kontakty dveří. Okno se zároveň podívá do vaší instalace a u každé integrace řekne, zda už ji máte, nebo které entity chybí; u údajů šablony ukáže, co se přiřadilo samo a co je potřeba vybrat ručně. Nahradilo bublinu, která pro všechny šablony opakovala tytéž tři obecné věty.

### Změněno
- Testovací harness napodobuje `ha-icon` tak, jak jej Home Assistant skutečně vykresluje: dvě vnořené komponenty, prázdná skupina nejdřív a cesta o okamžik později. Předchozí verze zapisovala hotovou ikonu v jednom kroku, takže okno, ve kterém chyba s prázdnými ikonami žila, vůbec neuměla vytvořit. Ikony v něm nově respektují velikost, kterou jim panel předepisuje, místo pevných 24 pixelů.

## [0.1.170] - 2026-08-02

### Opraveno
- **Náhled šablony v katalogu neodpovídal tomu, co se objevilo na displeji.** Katalogové dlaždice byly druhé, ručně psané HTML vykreslení všech dvaceti šablon, zatímco na displej se posílalo SVG – dva různé návrhy téže věci, každý ve vlastním kódu, a nic je nedrželo v souladu. Přepracování šablon ve verzi 0.1.169 rozdíl ještě zvětšilo, protože změnilo jen jednu z těch dvou cest. Dlaždice nyní kreslí přesně to SVG, které dostane displej, ve skutečném rozlišení a proporcích panelu. Ruční HTML varianta i její styly, dohromady přes 34 000 znaků, jsou pryč; renderer je jediný.
- **Wi-Fi šablona měla QR kód pouze v katalogu.** Na štítek se nikdy neodeslal – tag ukazoval jen název sítě a heslo jako text, přestože náhled kód sliboval. QR je nyní součástí SVG rendereru, takže se skutečně vytiskne. Jeho moduly se zarovnávají na celé pixely displeje: modul, který padne na půl pixelu, vyjde šedě a kvantizace na tři barvy jej pak strhne na černou nebo bílou, čímž kód přestane být čitelný.
- **Předpověď počasí ukazovala ukázková data na každé instalaci.** Home Assistant přestal předpověď publikovat jako atribut entity `weather.*` ve verzi 2024.4, ale šablona ten atribut četla dál. Předpověď se nyní načítá službou `weather.get_forecasts` a kalendářní události službou `calendar.get_events`; když integrace odpověď neposkytne, zůstanou ukázková data.
- **Automatické přiřazení entit se řídilo názvem.** Údaj „Teplota“ tak našel cokoli, co obsahovalo „teplo“, včetně spínače topení. Rozhoduje nyní především `device_class`, protože název je popis, kdežto device_class deklarace – přiřazení proto funguje i na instalaci, jejíž entity nejsou pojmenované česky.
- **Stavy entit se zobrazovaly anglicky.** Šablona přítomnosti tiskla `not_home`, zámky `locked`. Stavy osob, zámků, světel, alarmu, dveří, oken i pohybu a podmínky počasí se překládají do češtiny.

### Přidáno
- **Cenovky.** Dvě nové šablony – Cenovka a Regálová cenovka. Přepínač Akce zobrazí štítek, přeškrtne původní cenu a vyvede cenový blok bíle na červené, takže sleva je patrná z uličky bez čtení čísel. Přepínač se sčítá s entitou: akci lze zapnout ručně v nastavení šablony i pomocníkem typu spínač nebo binárním senzorem z pokladního systému, takže ruční start nevylučuje pozdější automatizaci.
- Grafy, ukazatele, budíky a mezikruží ve všech šablonách čtou hodnoty z navázané entity místo napevno zadaných čísel.

## [0.1.169] - 2026-08-01

### Opraveno
- **Logo v hlavičce panelu a přibalené písmo se nenačítaly.** Adresy obrázků a fontu se skládaly ručně na kořen `/dratek_eink_panel`, jenže od verze 0.1.168 se tento adresář servíruje pod cestou obsahující verzi (`/dratek_eink_panel/<verze>/`). Chyběl jediný segment cesty, takže každý statický soubor pod ním vracel 404 – logo DRATEK.CZ v hlavičce, obrázek v prázdném stavu i písmo Arimo. Samotný panel přitom fungoval dál, takže na příčinu nic neukazovalo. Adresy se nyní odvozují z umístění samotného modulu a nemohou se rozejít s tím, kam backend adresář skutečně připojil. Nový test hlídá, aby žádný soubor panelu kořen cesty nezapisoval natvrdo.
- **Ikony v náhledu displeje se načítaly pomalu.** Sešly se čtyři příčiny: jediný příznak „probíhá načítání“ serializoval sloty náhledu, takže druhý slot začal až po dokončení prvního – dvě kola načítání a dvě překreslení na jedno vykreslení; souběžné požadavky na stejnou ikonu se neslučovaly a spouštěly dvě čekací smyčky; čekalo se v pevných padesátimilisekundových krocích místo na nejbližší vykreslovací snímek; a mezipaměť si pamatovala i neúspěch, takže ikona, kterou Home Assistant nestihl dodat včas, zmizela z rozvržení natrvalo. Mezipaměť je nyní společná pro celý modul, takže přežije znovuvytvoření panelu, a po prvním náhledu se na pozadí předehřeje sada ikon všech šablon – přepnutí šablony v designeru je má hned na prvním snímku.
- **Odhad šířky textu byl plošná konstanta a mýlil se o −22 % až +21 %.** Verzálky podceňoval, takže zmenšování textu na šířku panelu ve skutečnosti nefungovalo a nápis „ZAPNUTO“ přetekl přes okraj 272pixelového displeje; naopak řetězce s číslicemi zmenšoval, přestože se vešly. Nahradil jej model po třídách znaků, změřený proti skutečným metrikám písma, přesný na ±5 %. Verzálky se rozpoznávají porovnáním velikosti písmen, takže Á, Č, Ř a Ž se neberou jako malá písmena.

### Změněno
- **Šablony se přizpůsobují tvaru displeje.** Byly psané jako svislý sloupec, jehož výšky řádků i velikosti písma jsou zlomky výšky panelu – což platí jen pro panel podobně vysoký a úzký, jako byl ten, pro který vznikly. Podporovaná rozlišení jdou od 168×384 po 1360×480, takže na širokém tagu se stejný sloupec mačkal deseti řádky do 128 pixelů: písmo na spodní hranici 6 px a dvě třetiny šířky prázdné. Panely výrazně širší než vysoké se nyní skládají do dvou sloupců – vlevo ikona, název a hlavní údaj, vpravo obsah, patka přes celou šířku. Medián velikosti písma na širokých displejích vzrostl přibližně dvojnásobně (na 1360×480 hlavní údaj ze 45 na 118 px); u panelů na výšku zůstává rozvržení beze změny.
- **Každá z dvaceti šablon displeje má vlastní podobu.** Renderer uměl jen šest druhů řádků – ikona, titulek, linka, hodnota, seznam, patka – a nic jiného tedy šablona být nemohla: dvacet šablon mělo dohromady jen sedm různých staveb. Fotovoltaika, Obývák, Zabezpečení, Topení a Stav serveru byly rozvržené naprosto stejně a lišily se pouze texty. Přibylo čtrnáct stavebních bloků (sloupcový graf, trendová křivka, vodorovné ukazatele, mezikruží, půlkruhový budík, dlaždice, časová osa, zaškrtávací seznam, sloupcový pruh, dělené poloviny, kalendářní dlaždice, tabule odjezdů, invertovaný pruh a velký údaj s jednotkou) a každá šablona je z nich poskládaná jinak. Indexy proměnných se nemění, takže existující navázání entit fungují dál. Nový test hlídá, aby žádné dvě šablony nesdílely stejnou stavbu.

## [0.1.168] - 2026-08-01

### Opraveno
- **Černý text už nemá červený lem.** Verze 0.1.167 sjednotila kvantizaci mezi náhledem v panelu a zápisem na pozadí, ale na nesprávném pravidle: pixel se považoval za červený, kdykoli červená složka převažovala nad zelenou a modrou. Přesně takové pixely ale vyrábí vyhlazování na hraně černého písma nad červenou plochou, takže každé černé písmeno na červené dostalo obrys. Pravidlo je vráceno na to, které fungovalo třicet vydání – červená jen tehdy, když je červená složka jasná a pixel je zároveň příliš tmavý na bílou. Regresní test vykreslí černý text na červené a vyžaduje, aby hraniční pixely zůstaly černé.
- **Panel po aktualizaci hlásil starou verzi a spouštěl starý kód.** Parametr proti mezipaměti dostával jen vstupní soubor `dratek-eink-panel.js`; jeho šestnáct modulů se načítá relativními cestami bez parametru, takže prohlížeč mohl servírovat moduly z instalace i desítky vydání staré – včetně toho, ze kterého se čte verze v hlavičce. Verze je nyní součástí cesty ke statickým souborům, takže se každým vydáním mění adresa všech souborů v jakékoli úrovni importů.
- Ukládání a načítání projektů končilo chybou `NameError`, protože rozdělení websocket vrstvy v 0.1.167 nechalo v modulu `ws_shared.py` odkaz na `DOMAIN` bez importu. Chyba se projevila až spuštěním, a protože moduly integrace nejdou v testech naimportovat bez Home Assistanta, žádný test ji nezachytil. Nová kontrola prochází všechny moduly a hlásí každé globální jméno, které modul používá, aniž by ho definoval nebo importoval.

### Změněno
- Z integrace zmizel websocket příkaz pro stahování libovolné URL ze serveru Home Assistanta. Nebyl nikdy zaregistrovaný a panel jej nevolá, takže jen rozšiřoval plochu odchozích spojení serveru; s ním odešlo 186 řádků nepoužívaného kódu.
- Odstraněny čtyři pomocné funkce inspektoru, které byly v jednom souboru definované dvakrát. V JavaScriptu pozdější definice tiše přebije dřívější, takže úpravy té první se nikde neprojevovaly. Nový test hlídá, aby žádná metoda panelu nebyla definovaná dvakrát.

## [0.1.167] - 2026-08-01

### Opraveno
- **Registrace osmi websocket příkazů, ztracená od verze 0.1.131, je obnovena.** Odeslání šablony přes gateway, ukládání a načítání projektů a vlastní prvky byly po třicet vydání nedostupné, aniž by to bylo v UI vidět. Příkazy jsou nyní registrované a pokryté regresním testem, který stejný typ výpadku odhalí, kdyby se opakoval.
- Kvantizace na černou/bílou/červenou byla mezi náhledem v panelu a zápisem prováděným na pozadí (backend) nesourodá – lišila se až na 16,6 % barevného prostoru. Obě strany nyní používají stejné pravidlo, ověřené na celé 24bitové barevné krychli.
- Náhled šablony v editoru se skládal jako samostatné HTML vykreslení, takže se mohl od skutečně odeslaného obrázku lišit. Nyní vzniká ze stejného SVG, které se posílá na displej.
- Ruční odeslání částečného překreslení a odeslání textu (přes panel i přes službu `dratek_eink.send_text`) nově zruší naplánovanou automatickou aktualizaci daného displeje – dřív mohla během několika sekund přepsat právě odeslaný obsah.
- Automatické opakování zápisu po dočasné nedostupnosti Bluetooth přenosové cesty drželo zámek přenosové cesty po celou dobu čekání, což blokovalo zápis na ostatní displeje sdílející stejnou cestu. Zámek se nyní drží jen po dobu jednoho pokusu.
- Vykreslování a balení obrázku pro displej běželo přímo ve smyčce událostí Home Assistanta na dvou místech (odeslání obrázku, zpracování nahrané ikony/vrstev vlastního prvku), což mohlo na chvíli zpomalit celou instanci. Nyní běží na pozadí.

### Změněno
- **Vykreslování obrazu do černé/bílé/červené je zrychlené přibližně 8–18×** díky přepisu z pixel-po-pixelu smyčky na operace nad celým obrázkem; výstup zůstává bajtově identický.
- Interní modul `websocket.py` (dříve přes 2000 řádků) je rozdělený podle domén do samostatných souborů (zařízení, gateway, fronta, projekty, vlastní prvky, odesílání) – bez dopadu na chování. Přenos po částech i řízení dokončení přenosu z verzí 0.1.152–0.1.166 zůstávají beze změny.
- Instalační balíček HACS již neobsahuje zkompilovaný Python bytecode ani duplicitní kopie firmwaru gateway; velikost balíčku integrace znatelně klesla.
- Kliknutí na náhled šablony v katalogu šablonu rovnou odešle na displej, místo aby otevřelo její nastavení. Tlačítko „Nastavit šablonu“ pro doladění zůstává.
- Vyhledávání v katalogu šablon už při psaní neposouvá stránku nahoru; sdílí stejný mechanismus udržení pozice jako ostatní vyhledávací pole v panelu.

## [0.1.166] - 2026-07-31

### Opraveno a zrychleno
- Přenos je znovu řízen skutečným dokončením každého GATT zápisu. Odpovídá tím dekompilovanému oficiálnímu Picksmart klientu, který u firmwaru s bitem `0x80` posílá další blok až z callbacku `onCharacteristicWrite`.
- Před aktivací notifikací se na BlueZ explicitně vyjedná velké ATT MTU stejným postupem, který doporučuje Bleak pro Linux. Displej tak může používat plný 244bajtový blok bez zbytečné fragmentace; při nedostupnosti privátního hooku se bezpečně použije MTU zvolená BlueZ.
- Timeout posledního bloku se smí považovat za ztracenou odpověď pouze tehdy, když všech 39 předchozích bloků skutečně obdrželo GATT potvrzení. Rychle lokálně zařazený, ale nedoručený proud už nemůže skončit falešným úspěchem bez vykreslení.
- Z horké smyčky bylo odstraněno ukládání diagnostického řádku pro každý jednotlivý blok. Stav se dál zapisuje po deseti blocích a při chybě, ale fronta, historie a panel během přenosu nezpracovávají desítky zbytečných aktualizací.
- Poslední blok má nadále zkrácený dvousekundový timeout, protože některé řadiče po jeho přijetí okamžitě zahájí eInk obnovu a ATT odpověď už nevrátí.

### Firmware gatewaye
- Firmware zůstává ve verzi `0.1.47-gateway`; změny se týkají přímého BlueZ přenosu Home Assistantu.

## [0.1.165] - 2026-07-31

### Opraveno
- Log ze skutečného SDK typu `51` potvrdil, že displej poslední blok přijme a začne vykreslovat, i když BlueZ nedoručí ATT odpověď. Tento přesně vymezený timeout posledního bloku už nezmění fyzicky úspěšný přenos na chybu a blok se neposílá znovu.
- Rychlý stream už nevkládá potvrzovaný blok po každých osmi blocích. Používá potvrzený první blok, tempovaný proud mezilehlých bloků a jedinou závěrečnou GATT bariéru po vyprázdnění fronty.
- Závěrečná odpověď má samostatnou dvousekundovou lhůtu. Po její ztrátě integrace ještě přijme volitelné potvrzení `05 08`, ale nespouští zbytečný kompletní druhý přenos, který dříve doběhl až k 240sekundové pojistce.
- Diagnostika rozlišuje skutečné potvrzení od bezpečného předání posledního bloku řadiči (`Final block handed off`).

### Firmware gatewaye
- Firmware zůstává ve verzi `0.1.47-gateway`; změna opravuje chování BlueZ při přímém přenosu z Home Assistantu.

## [0.1.164] - 2026-07-31

### Opraveno
- Rychlá dávka před každým potvrzovaným kontrolním blokem čeká na odtečení fronty BlueZ. Potvrzení se už neposílá do stále plné fronty, kde končilo osmivteřinovým timeoutem.
- Kontrolní GATT zápisy se používají pro všechny streamující displeje, které nabízejí oba režimy zápisu. Ochranu tak dostává i velký 400 × 300 displej, u něhož samotné `Bluetooth queued 100 %` nespouštělo překreslení.
- Nejednoznačně timeoutovaný ATT blok se nikdy neopakuje uvnitř stejného obrazového proudu, protože mohl být displejem přijat a jeho duplikace by posunula obrazový buffer. Následující pokus začne novým `prepare update` a přepne celý přenos na potvrzované bloky.
- Druhý a třetí pokus jsou záměrně spolehlivý fallback: každý blok musí obdržet GATT odpověď. Fronta se proto nemůže označit jako dokončená jen na základě lokálního zařazení dat do Bluetooth zásobníku.

### Firmware gatewaye
- Firmware zůstává ve verzi `0.1.47-gateway`; oprava se týká přímého Bluetooth přenosu z Home Assistantu.

## [0.1.163] - 2026-07-31

### Změněno
- SDK typ `51` s charakteristikou podporující oba režimy používá dávky po osmi blocích. První, každý osmý a poslední blok jsou ATT-confirmed; mezilehlé bloky používají tempovaný `write-without-response`.
- Poslední blok je bez výjimky zapisován s odpovědí, takže funguje jako pořadová a doručovací bariéra před odpojením a fyzickou obnovou displeje.
- Pro 40 bloků se počet sekvenčních GATT round-tripů snižuje ze 40 na přibližně 6. Charakteristiky bez obou režimů nadále používají svůj původní bezpečný způsob zápisu.

### Firmware gatewaye
- Firmware zůstává ve verzi `0.1.47-gateway`; optimalizace řeší pomalé potvrzované zápisy přes BlueZ v Home Assistantu.

## [0.1.162] - 2026-07-31

### Změněno
- Panel po dobu aktivní úlohy načítá `queue/list` každou sekundu. Viditelná fronta, karty displejů a mapa připojení se průběžně překreslují; v editoru se stav aktualizuje na pozadí bez narušení práce.
- Po přechodu poslední úlohy do koncového stavu se polling automaticky zastaví a časovač se vždy ruší při odpojení webové komponenty.
- U potvrzovaných bloků typu SDK `51` byla odstraněna nadbytečná 5ms prodleva po ATT odpovědi. Povinné potvrzení a spolehlivost přenosu zůstávají zachované.

### Firmware gatewaye
- Firmware zůstává ve verzi `0.1.47-gateway`; změny se týkají panelu a přímého Bluetooth přenosu Home Assistantu.

## [0.1.161] - 2026-07-31

### Opraveno
- Porovnání se známou funkční verzí `0.1.126` odhalilo odstraněnou množinu `WRITE_ACK_SDK_TYPES = {51}`. SDK typ `51` znovu vynucuje ATT/GATT odpověď pro každý blok bez ohledu na současně inzerovanou vlastnost `write-without-response`.
- Po potvrzeném zápisu se zachovává 5ms odstup funkční starší implementace; postup bloků tak řídí skutečné dokončení GATT zápisu, nikoli jen lokální fronta BlueZ.
- Příkaz `prepare update` je vrácen na šestibajtový tvar používaný funkční integrací a potvrzovaný testovaným displejem.

### Firmware gatewaye
- Verze `0.1.47-gateway` používá stejný šestibajtový přípravný paket; blokové zápisy přes NimBLE zůstávají potvrzované.

## [0.1.160] - 2026-07-31

### Opraveno
- Příkaz `prepare update` má nyní přesně osm bajtů jako v originálním Picksmart SDK: `02 + uint32 délka + režim + 00 00`. Chybějící dva rezervované bajty dovolovaly BLE přenos bloků, ale u firmwaru `0x80+` nemusely aktivovat následnou obnovu eInk řadiče.
- Přímý zápis bez GATT odpovědi ponechá spojení po posledním bloku deset sekund otevřené, aby BlueZ a řadič stihly vyprázdnit frontu před odpojením.
- Diagnostika rozlišuje `Display acknowledged` a `Bluetooth queued`; úspěšné vložení do lokální BLE fronty se již nevydává za potvrzení displejem.

### Firmware gatewaye
- Verze `0.1.46-gateway` posílá stejný úplný osmibajtový příkaz `prepare update`.

## [0.1.159] - 2026-07-31

### Opraveno
- Přímé odeslání celého návrhu nepřenáší velký Base64 obrázek v jediném websocketovém rámci. Frontend jej rozdělí na potvrzované 64KB části a samostatným malým požadavkem provede závěrečné zařazení do fronty.
- Backend kontroluje pořadí, úplnost, celkovou velikost, životnost nahrávání a platnost Base64 dat před dekódováním obrázku.
- Chyba před vytvořením úlohy nyní obsahuje číslo části, kterou Home Assistant nepřijal, nebo výslovně označí selhání závěrečného zařazení.

## [0.1.158] - 2026-07-31

### Opraveno
- Websocketové endpointy pro celý návrh přes přímé Bluetooth i gateway nyní vrátí odpověď ihned po bezpečném zařazení úlohy do fronty. Dlouhý BLE přenos už nemůže způsobit ukončení websocketového požadavku bez výsledku.
- Frontend po přijetí odpovědi okamžitě načte frontu a rozlišuje stav „zařazeno“ od skutečně dokončeného zápisu.
- Při přechodném selhání příkazu `queue/list` zůstávají poslední známé záznamy zachované a panel k nim pouze doplní chybu načtení.

## [0.1.157] - 2026-07-31

### Opraveno
- Přímý Bluetooth přenos přes Home Assistant používá u charakteristik nabízejících `write` i `write-without-response` řízený zápis bez odpovědi. Tím se obchází případ, kdy BlueZ čeká na GATT write response až do globální 240sekundové pojistky.
- Zápisy bez odpovědi jsou tempovány krátkým odstupem, aby obrazové bloky nepřetekly frontu Bluetooth adaptéru.
- Každý GATT zápis má vlastní osmivteřinový timeout a chyba uvádí konkrétní operaci i použitý režim zápisu.
- Fronta zápisů vrací a zobrazuje verzi běžícího backendu a umožňuje rozbalit celý protokol úlohy.

### Firmware gatewaye
- Firmware zůstává ve verzi `0.1.45-gateway`; změna se týká přímého Bluetooth přenosu z Home Assistantu.

## [0.1.156] - 2026-07-31

### Opraveno
- Přenos implementuje oba režimy originálního Picksmart SDK. Firmware displeje s bitem softwarové verze `0x80` používá GATT potvrzovaný proud bloků, zatímco starší firmware postupuje po jednotlivých notifikacích.
- Softwarová verze displeje se předává z BLE reklamy přes panel a websocket až do přímého Bluetooth přenosu i gatewaye.
- GATT zápis s odpovědí se použije vždy, když jej zapisovací charakteristika podporuje, i když současně nabízí zápis bez odpovědi.
- Celý neúspěšný přenos se neopakuje pětkrát; diagnostika 240sekundové pojistky obsahuje poslední zaznamenaný krok.

### Firmware gatewaye
- Verze `0.1.45-gateway` používá stejnou volbu protokolu podle softwarové verze displeje.

## [0.1.155] - 2026-07-31

### Opraveno
- Panel považuje `unknown_error`, `unknown error` a `unknown-error` za obecné zástupné kódy a přednostně zobrazí konkrétní zprávu backendu.
- Po ztrátě websocketové odpovědi panel načte poslední úlohu daného displeje z fronty. Dokončený zápis již neoznačí jako selhání a u neúspěšného zápisu zobrazí uloženou chybu nebo poslední řádek přenosového protokolu.
- Výjimky Bluetooth platformy bez textu se vracejí alespoň s názvem typu výjimky a jednoznačným popisem.

## [0.1.152] - 2026-07-31

### Opraveno
- Lokální Bluetooth přenos nyní používá GATT zápis s odpovědí pro každý obrazový blok, kdykoli jej zapisovací charakteristika displeje podporuje. Velké bitmapy tak nemohou tiše přetéct frontu lokálního BLE stacku a skončit neúplným obrazem.
- SDK typ `51` zůstává hardwarově ověřenou záložní výjimkou pro BLE stacky, které vlastnosti zapisovací charakteristiky hlásí neúplně.
- Záznam průběhu přenosu rozlišuje bloky potvrzené displejem od bloků pouze předaných bez jednotlivých GATT potvrzení.
- Lokální testovací panel používá platný přístup k náhradní SVG ikoně a po inicializaci provede první ruční načtení displejů.

## [0.1.151] - 2026-07-30

### Opraveno
- Ruční odeslání šablony nyní respektuje zvolenou přenosovou cestu displeje a použije jeho gateway místo chybného vynucení lokálního Bluetooth.
- Aplikace zobrazí úspěšný zápis až po skutečném dokončení přenosu. Chyba na pozadí již není vydávána za úspěšné nahrání.
- SDK typ `296` se správně zpracuje jako displej 800 × 480 a backend již nevytváří chybný obrazový buffer 296 × 128.
- Ruční režim bez automatických aktualizací zůstává zachovaný.

## [0.1.150] - 2026-07-30

### Změněno
- Integrace nyní pracuje v čistě ručním režimu. Staré uložené automatické aktualizace se při startu odstraní a změny entit již samy nespouštějí renderování ani zápis do displeje.
- Odstraněny byly periodické BLE skeny, polling fronty, automatické obnovování přehledové karty a backendové generování náhledů během editace.
- Panel vytváří pouze právě otevřenou záložku, zachovává statické styly mezi rendery a slučuje duplicitní překreslení canvasu.
- Gatewaye, fronta a sériové porty se načítají až při ručním otevření příslušné stránky.
- Projektové úložiště a úložiště historie přenosů se znovu používají z paměti místo opakovaného vytváření a čtení.
- Lokální testovací panel vykresluje Material Design Icons přímo jako SVG cesty, takže nepoužívá chybějící ikonový font ani náhradní čtverce.

### Opraveno
- Starší frontend uložený v cache již nemůže znovu aktivovat automatický zápis odesláním původního automation payloadu.
- Ručně odeslaný návrh zůstane na displeji, dokud uživatel neprovede další ruční upload.

## [0.1.149] - 2026-07-30

### Opraveno
- Nový ručně odeslaný návrh nyní okamžitě odstraní všechny automatické aktualizace předchozího návrhu pro stejný displej.
- Zruší se také čekající časovače a naplánované obnovení, takže staré hodiny nebo šablona již nový obsah nepřepíší.
- Po úspěšném zápisu se uloží pouze automatizace obsažené v novém návrhu; statický návrh zůstane bez automatických aktualizací.
- Stejné chování platí pro lokální Bluetooth i přenos přes gateway.

## [0.1.148] - 2026-07-30

### Změněno
- Vydán ověřený stav integrace jako verze `0.1.148` pro HACS.
- Verze backendu, hlavního panelu a přehledové karty byly sjednoceny.
- Funkční obsah odpovídá verzi `0.1.146`, včetně opravy registrace statických souborů panelu.

## [0.1.146] - 2026-07-30

### Opraveno
- Statická cesta `/dratek_eink_panel/` se nyní zaregistruje ještě před kontrolou již existujícího panelu.
- Panel po aktualizaci nebo opětovném načtení integrace již nekončí chybou `Unable to load custom panel` kvůli odpovědi HTTP 404.
- Opakovaná registrace statických cest je chráněna samostatným příznakem.

## [0.1.145] - 2026-07-30

### Opraveno
- Převod černého textu do tříbarevné palety již nevytváří červené okraje z barevných pixelů vyhlazování fontu.
- Červená barva se zachová pouze u pixelů s dostatečně silnou převahou červeného kanálu; neutrální a slabě zabarvené hrany se rozhodují podle jasu mezi černou a bílou.
- Nativní SVG renderer i záložní exportní cesta používají stejný způsob kvantizace.

## [0.1.144] - 2026-07-29

### Změněno
- **Šablony se nově generují přímo jako nativní SVG.** Dosavadní postup kopíroval živý HTML náhled do obrázku, což záviselo na vnitřní struktuře prvků Home Assistantu, na kompletním CSS panelu a na tom, jak prohlížeč rozvrhne HTML ve velikosti, pro kterou nikdy nebylo navržené – odtud opakované rozdíly mezi náhledem a odeslaným obrázkem. Šablona se teď skládá z nativních SVG prvků přímo v rozlišení displeje, hodnoty z Home Assistantu se dosazují jako text a ikony se vkládají jako skutečná vektorová data.
- Náhled i obrázek odeslaný do displeje vznikají z jednoho a téhož SVG, takže si odpovídají z principu, ne shodou okolností.
- Šablona vždy vyplní celou plochu displeje (u dvou šablon přesně polovinu) a text má výrazně větší, na e-inku čitelné velikosti.

## [0.1.143] - 2026-07-29

### Opraveno
- **Skutečná příčina chybějících ikon v odeslaném obrázku.** Home Assistant vykresluje ikonu `ha-icon` přes vnořený prvek `ha-svg-icon`, který má vlastní, samostatný shadow root – skutečné `<svg>` je tak o úroveň hlouběji, než kam `shadowRoot.querySelector("svg")` dosáhne. Export proto ikonu nikdy nenašel, bez ohledu na to, jak dlouho se čekalo (oprava délky čekání v 0.1.142 tohle sama o sobě nemohla vyřešit). Export teď prochází libovolně vnořené shadow roots, dokud `<svg>` nenajde.

## [0.1.142] - 2026-07-29

### Opraveno
- Čekání na dokreslení ikon před exportem obrázku (přidané v 0.1.140) bylo příliš krátké (max. 150 ms) a v praxi téměř vždy vypršelo dřív, než se ikona stihla vykreslit – ikony se tak v odeslaném i v novém 1:1 náhledu vůbec neobjevily. Čekání je nyní výrazně delší (až 3 sekundy), takže má ikona reálnou šanci se stihnout načíst.

## [0.1.141] - 2026-07-29

### Přidáno
- Náhled šablony v ploše pro šablony teď ukazuje stejný ditrovaný (černá/bílá/červená), pixelovaný obrázek v nativním rozlišení displeje, jaký se skutečně odesílá na fyzický displej – ne už hladce vykreslené HTML/SVG. Náhled se tak zobrazuje 1:1 s tím, co reálně uvidíš na displeji, včetně toho, jak dobře (nebo špatně) se čitelně vykreslí drobný text a ikony po ditheringu na malé rozlišení.

## [0.1.140] - 2026-07-29

### Opraveno
- **Zásadní oprava odesílání do displeje.** Export obrázku pro odeslání odstraňoval ikony (`ha-icon`), které se ještě nestihly asynchronně vykreslit do svého shadow DOM. Šablony ale rozmisťují prvky pomocí CSS grid podle pořadí v DOM, takže odstranění jedné ikony posunulo všechny další prvky o řádek – text a patička se pak zobrazily na úplně jiném místě a překrývaly se, přesně jak vypadal odeslaný obrázek oproti čistému náhledu. Export teď před vykreslením počká, až se ikony načtou, a i kdyby se to nestihlo, prázdnou ikonu z DOM neodstraňuje, takže rozložení šablony zůstává vždy zachované.

## [0.1.139] - 2026-07-29

### Opraveno
- Šablona Počasí používala proměnnou „Stav počasí" (index 1) na dvou různých místech (nadpis i popisek), ale nadpis měl zavádějící ukázkový text „Pátek" místo stavu počasí. Při napojení na reálnou HA entitu se dlouhý text stavu počasí mohl v úzkém řádku přetéct do sousedního řádku a vizuálně se překrýt s datem.
- Texty proměnných v šabloně Počasí (stav počasí, datum, čas, teplota) se nyní při přetečení ořežou třemi tečkami místo přetečení do sousedního řádku.

## [0.1.138] - 2026-07-29

### Opraveno
- Zobrazená verze v hlavičce panelu (`version-badge`), cache busting frontendových assetů a přehledové karty zůstávaly natvrdo na 0.1.134, přestože `manifest.json` už byl na novější verzi. Číslo verze bylo zdvojené na čtyřech místech (`manifest.json`, `const.py: PANEL_VERSION`, `panel-constants.js: DRATEK_EINK_VERSION`, `dratek-eink-overview-card.js`) a poslední tři se při vydávání verzí 0.1.135–0.1.137 neaktualizovaly. Nově jsou všechny sladěné.

## [0.1.137] - 2026-07-29

### Opraveno
- Obrázek odeslaný do displeje neodpovídal náhledu – export šablony do PNG klonoval jen vnitřní vrstvu bez rodičovského elementu `.template-designer-screen`, takže se v exportu neuplatnilo správné rozvržení a místo něj se použil nesouvisející styl se stejným názvem třídy z katalogového dialogu. Vzhled obrázku odeslaného do displeje teď odpovídá náhledu.

## [0.1.136] - 2026-07-29

### Opraveno
- Tlačítko **Odeslat do displeje** hlásilo „Unknown command“ a nikdy nefungovalo – příkaz `dratek_eink/send_design` byl v backendu definovaný, ale chyběla jeho registrace při startu integrace.

## [0.1.135] - 2026-07-29

### Přidáno
- Při přetahování šablony na velký displej se podle pozice kurzoru oranžově zvýrazní cílová polovina (jen na skutečné zobrazovací ploše, ne na celém rámečku) a šablona se umístí přesně tam, kam byla puštěna.

### Změněno
- Šablona v ploše pro šablony se vždy automaticky vyplní na celou plochu displeje, nebo celou polovinu u velkého displeje – bez ručního posouvání a bez chybějících pixelů po okrajích.
- Formát šablony (na výšku / na šířku) se nastavuje automaticky podle skutečného tvaru zobrazovací plochy.
- Zjednodušen informační blok aktuálního displeje na dva řádky (název s adresou, baterie a signál se stejnými ikonami jako na hlavní stránce).
- Zvětšeny náhledy displejů na hlavní stránce pro lepší čitelnost obsahu.
- Odstraněn rámeček, barevné pozadí a bublina s nápovědou v ploše pro šablony; náhled šablony lze umístit i kliknutím, ne jen přetažením.

### Opraveno
- Náhled displeje v nastavení šablon nyní vždy odpovídá tvarem rámečku náhledu na hlavní stránce – orientace se odvozuje automaticky ze skutečných rozměrů displeje místo pevně nastavené hodnoty.

## [0.1.134] - 2026-07-29

### Změněno
- Katalog šablon používá přehlednější karty ve stylu hlavních karet displejů.
- Šablony lze z katalogu přetáhnout přímo na plochu vybraného displeje.
- Horní souhrnný panel byl nahrazen kompaktním informačním blokem nad plochou displeje.

### Opraveno
- Odstraněn duplicitní náhled a opakované informace o aktuálním displeji.
- Název, model, adresa, fyzický kód, baterie a signál jsou seskupené na jednom místě.

## [0.1.133] - 2026-07-29

### Přidáno
- Nastavení displeje s katalogem šablon, kategoriemi, vyhledáváním a výběrem proměnných Home Assistantu.
- Ovládání orientace, zoomu, velikosti a pozice šablon v designeru.
- Podpora jedné velké nebo dvou malých šablon na kompatibilních displejích.

### Opraveno
- Export plátna a odesílání do displeje bez chyby cross-origin `getImageData`.
- Aktualizace náhledu displeje na hlavní stránce podle výsledku z designeru.
- Rozměry, rozložení a škálování šablon v náhledech různě velkých displejů.
- Výška editoru a rolování pravého panelu nastavení.

## [0.1.132] - 2026-07-29

### Publikování pro HACS
- Opraveno vydání jako skutečný GitHub Release.
- Release obsahuje soubor `dratek_eink.zip` se správnou kořenovou strukturou pro HACS `zip_release`.
- Verze byla zvýšena po tagu 0.1.131, který nebyl publikován jako skutečný GitHub Release.

## [0.1.131] - 2026-07-29

### Nastavení displeje a šablony
- Karty displejů otevírají nové nastavení s přehledem baterie, signálu, připojení a náhledu.
- Galerie obsahuje dvacet kategorií šablon, vyhledávání, požadované proměnné a označení právě používaných návrhů.
- Malý displej používá jednu šablonu, velký až dvě; při nahrazení lze vybrat konkrétní první nebo druhou šablonu.
- Editor šablony podporuje přesouvání po ploše, úzký i široký formát, otočení displeje a dvě rozložení velkého panelu.
- Náhledy šablon se při změně poměru stran škálují bez rozpadu rozložení a malé displeje využívají téměř celou obrazovku.
- Aktuální tříbarevný náhled lze oranžovým tlačítkem odeslat do fronty zápisu displeje.

### Odstranění Designeru HA prvků
- Samostatná záložka Designer HA prvků, její knihovna, frontendové moduly a testovací náhled byly odstraněny.
- Z běžného Designeru displeje byla odstraněna složka Moje a vstupy vedoucí do knihovny HA prvků.
- Websocketové příkazy pro správu knihovny vlastních prvků se již neregistrují.
- Vykreslení vrstvených prvků již uložených přímo v návrzích zůstává zachované kvůli zpětné kompatibilitě.

### Nahrazení původního Designeru displeje
- Původní samostatný designer byl nahrazen přehlednějším nastavením konkrétního displeje.
- Mapa připojení už neotevírá starý editor klávesnicí ani kliknutím na zařízení.
- Původní pracovní plocha, Inspector, projektové dialogy a samostatný modul ručního odesílání se již nevykreslují.
- Uložené návrhy a jejich backendové vykreslování zůstávají zachované pro náhledy a automatické aktualizace.

## [0.1.130] - 2026-07-28

### Fronta zápisu a paralelní gatewaye
- Odeslání návrhu z editoru se nyní okamžitě zařadí do fronty, takže lze přidat další návrh i během probíhajícího zápisu.
- Zápisy přes různé gatewaye mohou probíhat paralelně; každá gateway má vlastní sériovou frontu.
- Zápisy pro stejnou gateway nebo stejný displej zůstávají bezpečně seřazené a provedou se postupně.
- Uložení automatizace návrhu proběhne až po skutečně úspěšném přenosu.
- Doplněny byly regresní testy řazení úloh a paralelního zápisu přes dvě gatewaye.

## [0.1.129] - 2026-07-28

### Ikona integrace v HACS
- HACS nyní používá explicitní release balíček `dratek_eink.zip`, který vždy obsahuje lokální značku integrace včetně `brand/icon.png`.
- ZIP má přenositelnou strukturu pro Linux a rozbaluje obsah přímo do adresáře integrace bez chybného vnoření nebo zpětných lomítek.
- Přidány byly regresní testy rozměrů a shody ikon v repozitáři a instalované integraci.

## [0.1.128] - 2026-07-28

### Výběr entit Home Assistantu
- Hlavní designer i Designer HA prvků používají přímo nativní `ha-selector` Home Assistantu pro výběr entit.
- Výběr je sjednocen pro proměnné, texty, grafy, stavové prvky, pravidla a objekty ve vrstvách.

### Náhledy a orientace displejů
- Fyzický rámeček displeje se při změně orientace otáčí jako jeden celek, zatímco obrazová plocha zůstává přesně zarovnaná.
- Náhled velkého displeje 400 × 300 používá jeden souvislý šedý tvar pod obrazovou plochou bez zdvojených pásů nebo ořezu.
- Šedé tělo velkého displeje má přesně stejnou šířku jako obrazová plocha včetně okraje, a to také po otočení na výšku.
- Regresní testy kontrolují nativní výběr entit i správné skládání fyzického rámečku.

## [0.1.127] - 2026-07-28

### Rozhraní a lokalizace
- Celý panel lze přepínat mezi češtinou a angličtinou pomocí vlaječek v horní liště.
- Kontextová nápověda jednotlivých stránek je dostupná z horní lišty bez problikávání.
- Dialog symbolů se zobrazuje nad pevnou hlavičkou a není překrytý navigací.
- Byla odstraněna nákupní tlačítka a zjednodušeny rušivé informační panely.

### Hlavní stránka a náhledy displejů
- Text v kartách, designeru a výsledném náhledu používá stejný přibalený displejový font.
- Seznamové zobrazení má stabilní sloupce pro identitu displeje, baterii, signál, připojení a akce.
- Karty nezachovávají označení naposledy otevřeného displeje a vyberou se až po kliknutí.
- Vyhledávací pole mají dostatečnou šířku a během automatického překreslování neztrácejí fokus.

### Designery, fronta a připojení
- Designer HA prvků používá stejný pracovní prostor a nástroje jako hlavní designer, rozšířené o Home Assistant vrstvy a pravidla.
- Fronta zápisu a správa gatewayí byly vizuálně sjednoceny s ostatními částmi panelu.
- Mapa připojení podporuje trvalé ruční uzamčení displeje k lokálnímu Bluetooth adaptéru i ke gatewayi.
- Rozšířeny byly regresní testy frontendu, vykreslování a volby lokální přenosové cesty.

## [0.1.126] - 2026-07-27

### Gatewaye
- Sekce Gatewaye byla přepracována do přehledného pracovního prostoru pro správu, hledání v síti a USB instalaci.
- Karty gatewayí nyní používají stejný kompaktní vizuální styl jako karty displejů, včetně centrálního náhledu zařízení, stavu, připojených displejů a pevné lišty akcí.
- Přehled připojených displejů respektuje ručně uzamčenou gateway i automaticky vybranou aktivní cestu.

### Designer HA prvků
- Grafy, signalizace a další datové prvky mají spolehlivý výběr entity i možnost zadat Entity ID ručně.
- Pravidla vrstev podporují porovnání času pomocí samostatných polí **Od** a **Do**.
- Časové intervaly fungují také přes půlnoc, například `22:00–06:00`, a lze je přidávat samostatným tlačítkem.
- Časová pravidla se vyhodnocují shodně v živém náhledu i při automatickém vykreslení v Home Assistantu.

### Karty displejů a editor
- Stav probíhajícího a dokončeného nahrávání je umístěný přímo v náhledové oblasti a nemění rozložení ani polohu náhledu.
- Ovládací prvky editoru a stavové údaje displeje byly sjednoceny pro čitelnější a konzistentnější vzhled.

## [0.1.125] - 2026-07-27

### Mapa připojení a gatewaye
- Ruční volba gateway se přesunula z hlavních karet displejů do Mapy připojení.
- Displej lze v mapě přetáhnout na konkrétní gateway; ruční přiřazení je oranžově zvýrazněné a uzamčené, přičemž kliknutím na zámek se obnoví automatický výběr nejsilnější gateway.
- Mapa zobrazuje také prázdné nakonfigurované gatewaye a živé stavy nahrávání i následného vykreslování displeje.

### Přenos a stav displeje
- Po odeslání posledního bloku se BLE spojení uvolní bez čekání na volitelné potvrzení vykreslení, takže fronta může okamžitě pokračovat dalším displejem.
- Po úspěšném přenosu se karta displeje na několik sekund zeleně zvýrazní stavem, že se displej vykresluje.
- Firmware gateway byl aktualizován na `0.1.42-gateway` pro ESP32 i ESP32-S3.

### Vzhled panelu
- Hlavička používá nové společné logo DRÁTEK.CZ eInk, zarovnané zcela vlevo bez přidaného stínu, pozadí nebo zaoblení.

## [0.1.124] - 2026-07-27

### Konzistentní náhledy a designer
- Náhled na hlavní stránce přebírá fyzický rámeček i obsah přímo z designeru a celý se škáluje jako jeden celek, včetně textu, MAC štítku, čárového kódu, obrysů a radiusů.
- Vykreslení náhledu čeká na načtení použitého fontu, takže při otevření už neproblikne náhradní písmo.
- Přesouvaný objekt se v designeru vykresluje živě společně s výběrovým rámečkem, ne až po puštění myši.

### Výběr gateway a automatické aktualizace
- Automatický režim vybírá pro displej dostupnou gateway s nejsilnějším BLE signálem.
- Ke každému displeji lze uložit ruční volbu konkrétní gateway; nastavení se používá také při automatických aktualizacích.
- Fronta zápisu opakuje přenos při dočasně nedostupném BLE slotu místo okamžitého ukončení úlohy.

### Flashování ESP32
- Flashování používá pouze vhodné USB sériové porty, aktuální názvy příkazů `esptool` a bezpečnější výchozí rychlost.
- Předání Wi-Fi konfigurace po flashnutí opakovaně navazuje komunikaci bez resetování desky a poskytuje přesnější diagnostiku při chybě potvrzení.
- Závislost `esptool` byla zvýšena na podporovanou řadu 5.x.

## [0.1.123] - 2026-07-27

### Nové karty displejů a stav nahrávání
- Karty na hlavní obrazovce mají kompaktnější a přesně zarovnané indikátory baterie, signálu a připojení, větší prostor pro náhled a přímé přejmenování v názvu karty.
- Probíhající zápis se zobrazuje přímo na příslušné kartě světle oranžovým zvýrazněním a stavem **Právě se nahrává**.
- Náhledy používají radius úměrný své velikosti, takže rámečky vypadají stejně v kartě i v editoru.
- Doplněn fyzický náhled displeje 400 × 300 se spodním štítkem, čárovým kódem a MAC adresou.

### Designer
- Přepracován výběr objektů, škálování a rotace tak, aby ovládací prvky měly konzistentní velikost při každém rozlišení displeje.
- Text se automaticky přizpůsobuje velikosti oblasti; ručně zadaná velikost písma automatické přizpůsobení vypne a správně se propíše do panelu vlastností.
- Zjednodušen horní informační pruh aktivního displeje a sjednoceny panely Soubor, Proměnné, Mapování, Pozadí a zařízení a Zobrazení.

### Vývojářské
- Rozšířen lokální testovací harness a regresní testy frontendu a vykreslování.
- Přidán lokální preview server a GitHub Actions validace.

## [0.1.122] - 2026-07-27

### Částečný refresh displeje
- Přidáno tlačítko **Odeslat výběr**, které z vybraných objektů vypočítá ohraničující oblast, zarovná ji na osm řádků vyžadovaných protokolem a odešle pouze tento výřez.
- Částečný refresh lze nyní vyzkoušet na všech modelech displejů; model 2635 zůstává označený jako hardwarově potvrzený. Odeslání celého návrhu se nemění.

### Spolehlivější ukládání návrhů
- Chyba při načítání uloženého návrhu už nevymaže plátno ani nepřepíše uložený obsah prázdným návrhem.
- Nevyřízené automatické uložení se při opuštění panelu okamžitě dokončí.

### Opravy designeru a přehledu displejů
- Opraveny nefunkční ovladače zoomu; dostupné jsou celočíselné úrovně **1× až 4×** a režim **Fit**, který zvolí největší celočíselné zvětšení vhodné pro pracovní plochu.
- Vyhledávací pole v přehledu displejů po překreslení panelu zachová fokus i pozici kurzoru.
- Zjednodušeno rozložení karet displejů, upraveno zobrazení baterie, signálu a cesty připojení a obnoveno otevření designeru kliknutím na kartu.
- Odstraněno nefunkční ovládání RGB LED z uživatelského rozhraní; backendová služba zůstává zachována.
- Opraveno zarovnání ikony aktivního displeje v designeru.

## [0.1.121] - 2026-07-26

### Redesign hlavní stránky displejů
- Nový panel nad seznamem displejů: vyhledávání podle názvu, BLE adresy i rozlišení, tlačítko resetu hledání a přepínač zobrazení (Velké / Malé / Seznam) pouze s ikonami.
- Displeje jsou ve čtvercových kartách se zaoblenými rohy; ve spodním pruhu karty je baterie, signál a použitá cesta připojení.
- Kliknutí na kartu displej pouze vybere a zobrazí jej v novém pravém panelu s náhledem, údaji a akcemi. Designer se otevírá výhradně tlačítkem **Otevřít v designeru**.
- Záložka **Designer** v horní liště nahrazena záložkou **Mapa připojení**; mapa se přesunula ze spodní části stránky displejů.

### Rychlé akce displeje
- Nové tlačítko **Najdi mě** rozblikáním indikátoru pomůže fyzicky dohledat konkrétní displej (BLE příkaz `0x22`, nový websocket příkaz `dratek_eink/flash_identify`).
- Ovládání **RGB diody** je nově dostupné i v pravém panelu displeje jako rozbalovací sekce, bez nutnosti otevírat designer.

### Opravy náhledů displejů
- Opraveno rozmazané vykreslování náhledů: pravidlo `image-rendering` obsahovalo čtyři hodnoty za sebou jako fallback pro různé prohlížeče, ale Chrome zná i poslední z nich (`-webkit-optimize-contrast`), takže vždy vyhrála a náhledy vyhlazovala do šedých mezistupňů místo čistých eInk barev.
- Náhled displeje je vložen do neviditelného poměrového kontejneru a používá CSS `container query` jednotky, takže se vždy vejde do karty na jakémkoliv rozlišení monitoru a nepřetéká.
- Odstraněn stín za rámečkem náhledu a sjednoceno pozadí stavových ikon s pozadím karty.

### Designer
- Zoom se při výběru displeje, načtení šablony nebo projektu, změně orientace i po undo/redo nastaví na skutečné **1:1** rozlišení displeje místo automatického přizpůsobení oknu. Tlačítko **Fit** zůstává dostupné.
- Přehlednější horní část designeru: informační pruh o displeji a příkazová lišta mají větší odsazení a zaoblení.

### Vývojářské
- Přidán testovací harness `tests/dratek-eink-panel-harness.html`, který načte skutečný panel proti mockovanému `hass.callWS` pro rychlou vizuální kontrolu bez běžícího Home Assistantu.
- Test konzistence verzí nyní čte verzi panelu z `frontend/panel/panel-constants.js`, kam se přesunula po rozdělení panelu do ES modulů.

## [0.1.119] - 2026-07-26

### Oprava editoru displeje
- Opravena struktura obalovacích kontejnerů záložek v editoru.
- Obnoveno přepínání záložek Designer, Fronta zápisu a Gatewaye.
- Sjednocena verze panelu s integrací, aby Home Assistant načetl aktuální frontend.

## [0.1.118] - 2026-07-25

### Oprava obalů záložek a přepínání záložek
- Vyřešena chybná strukturace kontejnerů v `_render()`, kde se sekce Fronta zápisu a Gatewaye nenacházely ve správných obalových stavech.
- Odstraněno automatické přesměrování při kliknutí na Designer bez vybraného zařízení (zobrazuje se instruktážní obrazovka).
- Zaručeno okamžité přykreslení UI při kliku na jakoukoliv záložku v liště.

---

## [0.1.117] - 2026-07-25

### Optimalizace plátna Canvas2D (willReadFrequently)
- Přidána volba `{ willReadFrequently: true }` při získávání 2D kontextu plátna u všech vykreslovacích metod.
- Odstraněna konzolová varování Chrome při čtení obrazových dat (`getImageData`) a zrychleno generování eInk náhledů a ditheringu.

---

## [0.1.116] - 2026-07-25

### Podpora Dark Modu a oprava událostí tlačítek
- Doplněno optional chaining `?.` u tlačítka `#sendDesign`, čímž je zamezeno selhání registrace posluchačů událostí na záložkách Displeje, Fronta zápisu a Gatewaye.
- Odstraněny natvrdo zadané světlé barvy v pravidle `:host`, panely se nyní plně přizpůsobují Dark Modu v rozhraní Home Assistant.

---

## [0.1.115] - 2026-07-25

### Oprava uzavření metody _drawChart
- Doplněna chybějící ukončovací závorka `}` na řádku 6144 v `dratek-eink-panel.js`.
- Všechny metody třídy jsou správně uzavřené a editor zobrazuje kód bez jakéhokoliv červeného podtržení.

---

## [0.1.114] - 2026-07-25

### Bezpečnostní ošetření kreslicího plátna
- Přidána variabilní kontrola `width` a `height` před voláním `getImageData`.
- Odstraněn riziko chyby `IndexSizeError` v případě, že se plátno pokusí vykreslit před dokončením výpočtu rozměrů v DOM.

---

## [0.1.113] - 2026-07-25

### Podpora 3-barevných (BWR) eInk displejů dratek.cz
- Ověřena 100% kompatibilita všech funkcí (Floyd-Steinberg Dithering, Weather Forecast Widget, Časová okna u grafů, Bateriový Úsporný Režim, Šablony a Import/Export JSON).

---

## [0.1.112] - 2026-07-25

### Oprava duplicitních metod v panelu
- Odstraněn opakovaný duplicitní blok metod `_renderInspectorGeometry` a `_renderProperties`.
- Soubor `dratek-eink-panel.js` je plně validní a neobsahuje žádné chybné zvýraznění ani syntaktické chyby.

---

## [0.1.111] - 2026-07-25

### Oprava metody _renderProperties
- Obnoveny chybějící větve pro `text`, `rect`, `chart`, `weather`, `gauge`, `line`, `barcode`, `qr` v `_renderProperties`.
- Obnoveno správné uzavření těla metody na řádcích 5203–5210.

---

## [0.1.110] - 2026-07-25

### Oprava SyntaxError na řádku 4717
- Odstraněna nadbytečná ukončovací závorka v obsluze událostí záložek v `dratek-eink-panel.js`.
- Kód panelu se nyní parsuje a spouští bez jakýchkoliv syntaktických chyb.

---

## [0.1.109] - 2026-07-25

### Oprava vykreslování plátna a zobrazení editoru
- Obnoveny metody `_drawSelection`, `_box` a `_handles` v `dratek-eink-panel.js`.
- Panel v prostředí Home Assistantu se načte okamžitě v plném rozvržení bez černé obrazovky.

---

## [0.1.108] - 2026-07-25

### Oprava vykreslení v panelu a CSS tematu
- Přidáno okamžité vykreslení v `connectedCallback()` webové komponenty.
- Přidány výchozí CSS proměnné pro světlé i tmavé téma Home Assistantu.

---

## [0.1.107] - 2026-07-25

### Oprava načítání panelu v Home Assistantu
- Opravena chybějící podmínka v rozhraní Inspector v `dratek-eink-panel.js`.
- Panel v Home Assistantu se načte čistě bez chyb.

---

## [0.1.106] - 2026-07-25

### Floyd-Steinberg Dithering, Weather Widget, Časový rozsah grafů a Battery Saver
- Přidán režim stínování obrázků **Floyd-Steinberg Dithering** pro udržení polotónů a detailů fotografií.
- Integrován widget předpovědi počasí **Weather Forecast Widget** pro entity `weather.*`.
- Přidána volba časového okna u grafů (`1h`, `6h`, `24h`, `7d`).
- Doplněn automatický úsporný režim baterie (`Battery Saver Mode`), který při stavu < 15 % prodlouží minimální obměnu na 1 hodinu.
- Rozšířeny hotové šablonové layouty pro meteostanice, FVE, cenovky a status domu.
- Podpora importu a exportu projektů do `.json` souborů.

---

## [0.1.105] - 2026-07-25

### Redesign editoru a 1:1 pixelový eInk náhled
- Přidána podpora 1:1 pixelového renderingu displejů bez vyhlazování hran (`image-rendering: pixelated`).
- Přidané tlačítko `1:1 (100 %)` pro zobrazení v přesném fyzickém rozlišení displeje.
- Striktní barevné kvantování eInk barev (černá, bílá, červená, žlutá) bez jakýchkoliv šedých či antialiased přechodů.
- Vylepšený vizuální design editoru se studiovým bodovým pozadím plátna.

---

## [0.1.104] - 2026-07-24

### Stabilní náhled bez problikávání fontů
- Designer uchovává poslední hotový kanonický obraz vytvořený backendem.
- Při změně entity nebo vlastnosti zůstává tento obraz na canvasu, dokud backend nedokončí jeho novou verzi.
- Opakované lokální překreslení už nemůže mezi dvěma backendovými obrazy zobrazit odlišný prohlížečový font nebo jinou podobu grafu.
- Cache je oddělená podle adresy displeje a při odpojení panelu se bezpečně zahodí.
- Doplněn regresní test ochrany proti střídání rendererů.

---

## [0.1.103] - 2026-07-24

### Jeden renderer pro náhled, ruční zápis a automatické aktualizace
- Přidán backendový kanonický náhled, který používá úplně stejný renderer jako automatická aktualizace displeje.
- Designer si po změně dynamického prvku vyžádá hotový backendový PNG obraz a zobrazí jej bez vyhlazování.
- Ruční odeslání návrhu s dynamickými prvky posílá tento kanonický PNG obraz místo odlišného prohlížečového canvasu.
- Automatické aktualizace, náhled i ruční odeslání používají společný sběr aktuálních hodnot entit, grafických řad a podmínek vrstev.
- Chyba backendového renderu bezpečně zastaví ruční odeslání, takže se na displej neuloží jinak vypadající meziverze.
- Doplněny regresní testy společného sběru hodnot a použití kanonického náhledu v obou cestách odeslání.

---

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
