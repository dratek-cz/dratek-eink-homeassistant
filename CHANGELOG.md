# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

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
