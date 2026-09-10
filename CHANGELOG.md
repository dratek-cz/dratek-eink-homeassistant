# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [1.0.19] - 2026-09-10

### Kritická oprava stránky Gatewaye
- Integrace se dotazovala gatewayí **souběžně a tím je sama umlčela**. Změřeno na třech živých gatewayích: dotazované po jedné odpoví každá zhruba za 100 ms; jakmile se dva dotazy překryjí, dvě ze tří přestanou odpovídat úplně – a to po celou dobu, co dotazy chodí. Na ping přitom odpovídají dál. ESP32 obsluhuje jedno HTTP spojení naráz a ostatní neřadí do fronty.
- Nic to přitom nekoordinovalo: kontrola stavu, BLE sken pro mapu tras, nahrávání přenosu a jeho vlastní dotaz na průběh (jednou za sekundu) mohly mířit na jednu krabičku současně. Při hromadném odesílání to byl trvalý stav. Výsledkem byly čtyři zapnuté gatewaye, dvě označené jako offline, OTA aktualizace zaseknutá na 20 % a nemožnost s nimi cokoli dělat.
- Každý HTTP požadavek na gateway teď drží zámek dané krabičky. Zámek je **na požadavek, ne na celou operaci** – dotazy na průběh přenosu ho drží pár milisekund, takže se mezi ně kontrola stavu vejde. A je **per gateway**, takže čtyři gatewaye pracují dál souběžně.
- Gateway, na kterou se integrace nedostane, protože je zaneprázdněná jiným požadavkem, se **už nehlásí jako offline**. Dosud právě přenos na regál – tedy okamžik, kdy je nejzjevněji funkční – způsobil, že v panelu zšedla.

## [1.0.18] - 2026-09-09

### Kritická oprava OTA aktualizace
- OTA aktualizace zjišťovala typ čipu na **jiné adrese, než na kterou pak firmware nahrála**. Stav se četl z uložené adresy hostitele, nahrávalo se na adresu podle probnuté IP – a ty se rozejdou přesně tehdy, když si mDNS jméno a DHCP zápůjčka přestanou odpovídat. Na regálu, kde jsou ESP32 i ESP32-S3 gatewaye, to znamenalo přečíst typ čipu z jedné krabičky a zapsat obraz aplikace do druhé. Výsledkem je deska, která se nerozeběhne a jde zachránit jen kabelem. Adresa se nyní určí jednou, potvrdí se dotazem přímo na ni a firmware jde tam a nikam jinam.
- Před nahráním se **porovná čip v hlavičce obrazu s čipem, který cíl hlásí**. `Update.setMD5` doloží jen to, že bajty dorazily v pořádku – neříká nic o tom, pro který procesor jsou.
- Firmware gatewaye **0.1.70-gateway** odmítne obraz pro cizí čip dřív, než zapíše jediný bajt do flash. Kontroluje magickou hodnotu 0xE9 a ID čipu v hlavičce. Tohle je pojistka, která z chybného odeslání dělá neúspěšnou aktualizaci místo cesty s USB kabelem.
- Neúspěšná aktualizace konečně řekne, co se stalo. Hlásila `OTA update failed:` a nic dalšího, protože chyby aiohttpu `ServerDisconnectedError` a `TimeoutError` mají prázdný text; teď se vypíše aspoň jejich typ.
- Časový limit nahrávání zvednut ze 120 na 300 sekund. ESP32 maže OTA oddíl průběžně při zápisu a verze 0.1.68 vrátila úsporný režim Wi-Fi, takže megabajt může trvat déle.

## [1.0.17] - 2026-09-09

### Rychlost zápisu na displeje
- Firmware gatewaye **0.1.69-gateway** ukončí vyhledávací sken ve chvíli, kdy se hledaný displej ozve, místo aby vystál celé šestisekundové okno. Ze 101 přenosů jich 23 muselo na sken přejít a 19 z nich displej našlo – a pak čekalo do konce okna. Displej vysílající v běžném intervalu se ozve hluboko pod sekundou; zbytek toho okna byl vysílací čas ubraný přenosu, který měl právě začít, a všem ostatním rádiím v místnosti.
- Sken, kterým se staví mapa tras, poslouchá **6 sekund místo 3**. Tři sekundy stačí na ověření jednoho displeje a zdaleka ne na zmapování regálu: displeje vysílají přerušovaně, takže vše, co gateway v tom okně neslyšela, se zapsalo jako „tenhle displej neslyší nikdo" a odeslalo přes Bluetooth Home Assistantu. V měřeném běhu takto skončilo 20 přenosů a nejslabší ze tří gatewayí dostala trasu jen k 9 displejům.

## [1.0.16] - 2026-09-09

### Výkon při stovce displejů
- Fronta zápisu se na pozadí dotazuje **bez řádků logu**. Jeden dotaz se stovkou úloh měl 296 kB, protože nesl každý řádek logu každé úlohy – i na záložky, které žádný log nezobrazují. Teď má 30 kB, tedy desetkrát méně; při dotazu jednou za sekundu je to rozdíl mezi 17 MB a 1,8 MB za minutu. Záložka *Fronta zápisu* i export logu si logy vyžádají celé, takže se nic neztratilo.
- Historie fronty se zapisuje na disk **jednou za dávku, ne po každé úloze**. Každá dokončená úloha dosud přepsala celý soubor historie – těch samých 296 kB – takže jedno hromadné odeslání znamenalo sto úplných zápisů, každý větší než předchozí.
- Panel přestal při každém dotazu serializovat všechny logy jen kvůli zjištění, zda se něco změnilo. Dělal to dvakrát za sekundu na stejném vlákně, na kterém se vykresluje další displej.

## [1.0.15] - 2026-09-09

### Přidáno
- Nová šablona **DRÁTEK.CZ**: firemní nápis přes celý displej, na rozdíl od dlaždice *Logo Drátek* se přiřazuje jednomu displeji a odesílá běžným tlačítkem. Čtyřbarevné displeje dostanou dole žlutý pruh na místě, kde mají ostatní šablony červenou patičku; tříbarevné vytisknou samotný nápis.

### Opraveno
- Oranžové **.CZ** a čárka nad Á se tisknou plnou červenou. Dosud se rastrovaly mezi červenou a bílou (na čtyřbarevných mezi červenou a žlutou), což je věrný způsob, jak zobrazit oranžovou, pro kterou displej nemá pigment – a na štítku v ruce to vypadalo jako tečkované, napůl smazané slovo vedle plného černého nápisu.
- Úloha, která čeká na nedosažitelný displej, si před každým dalším pokusem znovu vyžádá trasu. Trasa se dosud vybrala jednou, při zařazení do fronty, z tříseknudového skenu – displej, který zrovna nevysílal, tak zůstal do konce dne přiřazený místnímu Bluetooth, i když se mezitím probudil metr od gatewaye.

## [1.0.14] - 2026-09-09

### Opraveno
- Hromadné odeslání **Loga Drátek** se už nezastaví uprostřed seznamu kvůli chybě při překreslování. Překreslení průběhu bylo mimo ochranu chyb, takže cokoli, co panel vyhodil při *kreslení* - ne při odesílání - ukončilo celou akci tam, kde zrovna byla, a zbývající displeje se nikdy nezkusily.
- Když se hromadná akce přesto zastaví, panel to napíše. Dřív viděl prázdný seznam chyb a hlásil úspěch: běh, který skončil u 47. displeje ze 100, se tvářil jako "zařazeno pro všech 47 displejů".
- Chyby jednotlivých displejů se seskupují podle příčiny, takže padesát stejných hlášek je jeden řádek a ne nečitelná změť. Úplný výpis po displejích jde do konzole prohlížeče (F12).
- Fronta zápisu se během hromadné akce dotazuje po pěti sekundách místo po jedné. Sto úloh s osmdesáti řádky logu, stahovaných a překreslovaných každou sekundu, soupeřilo o stejné vlákno, na kterém se vykresluje další displej.

## [1.0.13] - 2026-09-09

### Opraveno
- Hromadná šablona **Logo Drátek** opět zařadí do fronty zápisu úlohu pro **každý** displej hned na začátku. Verze 1.0.9 čekala na dokončení každého přenosu, takže na regálu se stovkou displejů existovaly ve frontě jen dvě až tři úlohy a zbytek žil pouze v otevřeném panelu - po jeho zavření se ztratil.
- Tím se vrátily i dvě věci, které čekání na dokončení mlčky vypínalo: fronta znovu podrží úlohu pro displej mimo dosah a zapíše ji, jakmile se ohlásí, a hromadné odesílání znovu využívá gatewaye. Jediné zaškobrtnutí gatewaye dříve na tři minuty přesměrovalo celý regál na místní Bluetooth Home Assistantu.
- Fronta rozděluje čekající úlohy mezi všechny gatewaye, které displej slyší. Když jsou všechny obsazené, rozhoduje délka jejich fronty, ne pouze síla signálu - stovka displejů tak neskončí na jediné ESP32, zatímco druhá stojí vedle nečinně.
- Připnutá gateway se používá i během své ochranné prodlevy. Její přeskočení posílalo zápis na místní Bluetooth, což je na instalaci s displeji dosažitelnými jen přes gatewaye zaručené selhání.

## [1.0.12] - 2026-09-09

### Kritická oprava
- Firmware gatewaye **0.1.68-gateway** obnovuje modem sleep, který ESP-IDF vyžaduje pro souběh Wi-Fi a Bluetooth na sdíleném rádiu. Verze 0.1.67 mohla po startu Wi-Fi opakovaně restartovat ESP32 i ESP32-S3.
- Diagnostické počítadlo odpojení Wi-Fi zůstává zachované. Dočasná nedostupnost gatewaye se řeší směrováním a opakováním přenosu, nikoli zakázáním povinného režimu souběhu rádií.

## [1.0.11] - 2026-09-09

### Opraveno
- Hromadná šablona **Logo Drátek** používá současně místní Bluetooth Home Assistantu a všechny online gatewaye. Každé rádio zapisuje postupně, jednotlivá rádia však pracují souběžně.
- Počet cílových displejů není omezen. Zobrazený počet souběžných přenosů vyjadřuje počet dostupných rádií, nikoli maximální počet displejů.

## [1.0.10] - 2026-09-09

### Opraveno
- Firmware gatewaye **0.1.67-gateway** vypíná úsporný režim Wi-Fi. USB napájená ESP32 tak udržuje HTTP spojení s Home Assistantem i během intenzivního Bluetooth přenosu, kdy obě technologie sdílejí jedno 2,4GHz rádio.
- Stav gatewaye nově uvádí počet zjištěných odpojení Wi-Fi a čas posledního odpojení. Diagnostika tak rozliší výpadek sítě od chyby Bluetooth spojení s displejem.

## [1.0.9] - 2026-09-09

### Opraveno
- Hromadná šablona **Logo Drátek** čeká na skutečné dokončení každého přenosu. Do fronty už během několika sekund nevloží desítky úloh, které by blokovaly další odesílání.
- Před novým spuštěním jednorázově odstraní staré čekající úlohy všech cílových displejů. Rozpracovaný zápis bezpečně nechá dokončit.
- Když gateway selže, aktuální displej zkusí jinou dostupnou trasu a následující displeje nefunkční gateway během její ochranné prodlevy vynechají. Platí to i pro ručně zvolenou gateway.
- Průběh hromadné akce nyní odpovídá dokončeným přenosům místo pouhému zařazení do fronty.

## [1.0.8] - 2026-09-09

### Opraveno
- **Logo Drátek** je znovu přímo ve vestavěném seznamu šablon; není nutné importovat samostatný soubor.
- Dlaždice po potvrzení odešle logo na všechny známé displeje a před odesláním zruší jejich automatické aktualizace i čekající úlohy ve frontě.
- Dříve importovaná kopie stejné hromadné akce se v katalogu skryje, aby se šablona nezobrazovala dvakrát.

## [1.0.7] - 2026-09-09

### Opraveno
- Sériový port zařízení **SMLIGHT SLZB-06** je v instalátoru označen jako blokovaný a nelze na něj omylem nahrát firmware DRATEK gatewaye. Backend zápis odmítne i při ručně sestaveném požadavku.
- Instalátor automaticky vybere první bezpečný USB port. Pokud najde jen chráněná zařízení, vyžádá připojení ESP32/ESP32-S3 místo nabídnutí cizího zařízení k zápisu.
- Chyba při záměně ESP32 a ESP32-S3 nyní česky uvádí port, skutečně rozpoznaný čip a vybraný firmware.

## [1.0.6] - 2026-09-09

### Opraveno
- Přerušení USB zápisu s chybou esptool `No more data to read from the serial port` se nově správně rozpozná. Flashování se automaticky jednou zopakuje přes ROM loader rychlostí 57600 Bd, stejně jako u ostatních chyb přerušeného sériového přenosu.
- Rozpoznání zahrnuje také odpojené zařízení a dočasně nedostupný sériový port. Při neúspěchu zůstává v chybě zachována konkrétní příčina z esptoolu.

## [1.0.5] - 2026-09-09

### Dokumentace
- README už nezobrazuje starou vývojovou historii a odkazuje na přehled podporovaných vydání 1.x.
- Changelog obsahuje pouze vydání řady 1.x. Starý vydávací skript s pevně nastavenou vývojovou verzí byl odstraněn.

## [1.0.4] - 2026-09-09

### Připraveno pro HACS
- Doplněn správce integrace, popis a témata GitHub repozitáře a veřejné validace HACS a Hassfest.
- Dokumentace obsahuje přímý odkaz pro přidání do HACS. Ikony jsou součástí instalačního balíčku pro nativní službu Brands v Home Assistantu 2026.3 a novějším.

## [1.0.3] - 2026-09-09

### Přidáno
- Importovatelná šablona **Drátek – hromadné odeslání loga**. Obnovuje původní showroomové odeslání na všechny známé displeje včetně zrušení jejich automatických aktualizací a čekajících úloh. Rozpracované přenosy neruší.
- Funkce se zobrazí pouze po importu souboru `examples/dratek-hromadna.dratek-template.json`. Import nic neposílá; každé spuštění vyžaduje výslovné potvrzení. Malé displeje dostanou samotný nápis, velké a portrétní displeje celé logo.

### Opraveno
- Import a export uživatelských šablon zachovávají `editor_elements`, rozměry návrhu a podporovanou hromadnou akci. Starší soubory s polem `elements` se převádějí na pole používané editorem.

## [1.0.2] - 2026-09-09

### Opraveno
- Flashování gatewayí je dostupné pouze přes USB zařízení s Home Assistantem. Odstraněna cesta přes prohlížeč počítače.
- Vymazání starých Wi-Fi údajů a OTA metadat probíhá společně se zápisem firmwaru, bez mezilehlého restartu a druhého spojování s bootloaderem.
- Při přerušení sériového přenosu se zápis jednou zopakuje přes ROM loader nižší rychlostí. Chyba obsahuje příčinu z esptoolu místo samotného návratového kódu.
- Předání Wi-Fi čeká na návrat USB a potvrzení z firmwaru, zvládá přerušené spojení i rozdělenou odpověď a neopakuje reset desky. Port nelze souběžně používat pro další flashování nebo diagnostiku.
- Nahraný firmware a neúspěšné nastavení Wi-Fi se zobrazují odděleně; nastavení lze zopakovat tlačítkem **Jen Wi-Fi**.
- Firmware **0.1.66-gateway** pro ESP32-S3 přijímá nastavení a diagnostiku na UART i nativním USB. Opakované stejné Wi-Fi nastavení potvrdí bez dalšího restartu. Klasická ESP32 zachovává UART.

### Ověření
- Obě varianty firmwaru sestaveny v PlatformIO; reálné USB ověření proběhlo na ESP32-D0WD-V3 s CH9102.
- ESP32-S3 ověřeno sestavením, nikoli na fyzické desce. Uložení testovacích Wi-Fi údajů není testem připojení ke skutečné síti.

## [1.0.1] - 2026-09-08

### Opraveno
- **Hromadné odeslání na velký počet displejů většinu z nich tiše zahodilo.** Změřeno na reálné dávce: ze 100 displejů jich 43 skončilo chybou „Transfer exceeded the 600s safety timeout" přesně 600 sekund po zařazení do fronty — a v logu neměly nic než řádek o směrování. **Nikdy se o ně nikdo nepokusil.**
- Příčina: bezpečnostní limit úlohy začínal běžet už ve chvíli, kdy si ji fronta převzala, a obaloval i čekání na bránu. Jedna brána zapisuje displej po displeji, každý deset až dvacet sekund. Všechno, co se nedostalo na řadu do deseti minut, tedy umřelo tím, že stálo ve frontě. Limit teď měří jenom samotný přenos a začíná až v okamžiku, kdy má úloha bránu pro sebe — čekání ve frontě je čekání, ne selhání.
- Fronta o čekání nově píše: úloha, která stála víc než pět sekund, si do logu zapíše, jak dlouho čekala a na co. „Deset minut se nic nedělo" tak přestává být záhada a je z toho pozice ve frontě.
- **„Odesláno" znamenalo na každé cestě něco jiného.** Přenos přes bránu čeká na potvrzení `05 08` od řadiče displeje; místní Bluetooth v Home Assistantu předá bloky operačnímu systému a chybějící potvrzení bere jako přijaté. Ve zmíněné dávce potvrdilo příjem 43 ze 43 přenosů přes bránu a **0 ze 13** přes místní Bluetooth — a fronta všech 56 vykreslila stejně. Úloha si teď nese příznak `confirmed`, takže zápis bez potvrzení od displeje už nevypadá jako doručený.

### Poznámka k provozu
- Jedna brána zvládne displej po displeji. Dávka 100 displejů reálně trvá půl hodiny až hodinu — nově ale doběhne celá, místo aby se po deseti minutách začala sypat.

## [1.0.0] - 2026-09-08 — PRVNÍ PRODEJNÍ VYDÁNÍ

První verze určená pro prodej displejů. Obsahově je to 1.0.0-rc.1 bez interních firemních nástrojů — žádná funkce, kterou zákazník používá, se nemění.

### Odebráno
- **Interní šablona „Logo Drátek".** Hromadné odeslání loga na všechny displeje najednou, které u každého předtím zrušilo automatickou aktualizaci a vyprázdnilo frontu. Showroomový nástroj, ne funkce pro zákazníka. Katalog šablon má nově 24 položek místo 25.
- S ní i její vykreslovací blok, ditherovací mixin, CSS, překlady a testy. Obrázky `dratek-eink-logo.png` a `dratek-eink-header.png` zůstávají — používá je hlavička panelu.

## [1.0.0-rc.1] - 2026-09-08 — INTERNÍ / SHOWROOM BUILD

> **Kandidát na 1.0.0 s interní firemní šablonou uvnitř.** Obsahuje šablonu „Logo Drátek" — hromadné odeslání loga na všechny displeje najednou, které u každého předtím zruší automatickou aktualizaci a vyprázdní frontu. To je nástroj pro showroom, ne pro zákazníka. Vydáno jako předběžná verze, takže ji HACS ve stabilním kanálu nenabídne. Prodejní verze bez interních věcí je **1.0.0**.

### Opraveno
- **Meteoradar ve spodní řadě velkého displeje po automatické aktualizaci vyskočil nahoru.** Týkalo se to rozložení „2 nahoře, 3 dole" a stejně tak každého jiného rozložení, kde meteoradar neseděl v levé horní pozici. Ruční odeslání bylo pokaždé v pořádku, obrázek se posunul až při automatickém zápisu — a pak zůstal celý přesunutý do horní části panelu.
- Příčina: každá pozice rozložení je v SVG zabalená do vlastní posunuté skupiny, takže souřadnice mapy radaru platí uvnitř té pozice, ne na celém panelu. Panel si je ale ukládal, jako by platily na celém panelu. Ruční odeslání tenhle údaj vůbec nečte (kreslí celý panel najednou), zatímco automatická aktualizace podle něj čerstvý snímek radaru vlepuje — pro spodní řadu tedy o třetinu panelu výš, než měla.
- Panel nově souřadnice převede na souřadnice panelu úplně stejně, jako to už dělal u textových hodnot. Automatizace uložené dřív se opraví samy: integrace si správné umístění dopočítá ze zachycené šablony, takže není potřeba každou automatizaci znovu otevírat a ukládat.

### Změněno
- **Šablona „Logo Drátek" tiskne na malých displejích jen nápis DRÁTEK.CZ.** Doteď se na cenovku vedle nápisu vytiskl i obrázek eInk displeje — malý displej v ruce zákazníka tak ukazoval obrázek malého displeje. Nápis se z původní grafiky ořízne, nekreslí se znovu, takže písmo i barvy zůstávají přesně ty firemní. Vedlejší efekt: nápis je na cenovce zhruba 1,8× větší a čitelnější.
- Velké displeje se nemění — na výšku i na velký panel jde dál celá skládaná varianta loga i s modulem, na ni je tam místa dost.
