# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [0.1.252] - 2026-08-10

### Opraveno – Obnovení fyzických pauz po obnovení obrazovky displeje
- **`transfer.py` / `queue.py`**: Navráceny bezpečné pauzy pro fyzický reconnect (6.0s pro standardní displeje, 15.0s pro velké panely). Příliš agresivní opakované pripojování během fyzického EPD překreslování HW displeje způsobovalo vícenásobné vypršení časových limitů na vývojových strojích s 100+ nahráváními.

## [0.1.251] - 2026-08-10

### Opraveno – Zachování BLEDevice v paměti skeneru pro bleskové opacity opakovaných aktualizací
- **`transfer.py`**: Odstraněno nucené promazávání skeneru (`async_rediscover_address`). Home Assistant si tak pamatuje detekované BLE zařízení mezi opakovanými cykly automatických aktualizací, což zabraňuje 20s prodlevám při znovunalezení rozhraní u 2. a dalších cyklů.

## [0.1.250] - 2026-08-10

### Opraveno – Odstranění zablokování rádio zamknutí (re-entrant radio slot lock)
- **`radio.py`**: Předěláno zamykání `async_radio_slot` a `async_try_radio_slot` na re-entrantní režim svázaný s aktuální asyncio úlohou. Tím je odstraněn deadlock vznikající na `Transfer attempt 1/3`, když fronta `TransferQueue` vyvolá vnořený přenos `send_image`.

## [0.1.249] - 2026-08-10

### Opraveno – Synchronizace fyzického rádio slotu u přímých nahrávání pro více displejů současně
- **`transfer.py`**: Zajištěno přísné zamykání `async_radio_slot` i u přímých volání `send_image`. Při odesílání do více displejů současně nyní přenosy nekolidují v paměti jednoho Bluetooth adaptéru, ale řadí se korektně za sebe, čímž se eliminuje jejich vzájemné zpomalení.

## [0.1.248] - 2026-08-10

### Opraveno – Automatické uvolňování BlueZ soketů a mikro-pauzy pro předcházení hromadění paměti
- **`transfer.py`**: Přidáno automatické invalidování a uvolňování neaktivních GATT repozitářů v HA pomoci `async_rediscover_address` po ukončení spojení.
- **`transfer.py`**: Přidána 5 ms mikro-pauza mezi potvrzovanými zápisy bloků (`Write With Response`), která dává Linuxovému BlueZ a D-Bus smyčce čas zpracovat přijatá potvrzení bez zahlcení vyrovnávací paměti.

## [0.1.247] - 2026-08-10

### Opraveno – Ošetření nedetekovaných BLE zařízení v rozhraní Home Assistantu
- **`transfer.py`**: Pokud Home Assistant skener ještě nedetekoval MAC adresu displeje (zařízení mimo dosah lokálního BT adaptéru nebo vypnuté), `establish_connection` bezpečně ignoruje skener a zobrazí jasné diagnostické doporučení pro přepnutí trasy na ESP32 Gateway.

## [0.1.246] - 2026-08-10

### Opraveno – Potlačení varování BleakClient.connect() v logu HA
- **`transfer.py`**: Integrováno volání `establish_connection` z knihovny `bleak_retry_connector` s ošetřeným záložním fallbackem na přímý `BleakClient`. Tím je eliminována výstraha `habluetooth.wrappers` v logu Home Assistantu bez rizika pádů přenosu.

## [0.1.245] - 2026-08-10

### Opraveno – Obnovení potvrzovaných zápisů bloků (display-acknowledged GATT flow control)
- **`transfer.py`**: Navrácena podmínka `require_gatt_response`. Mikrokontrolér eInk displeje (SDK 51) vyžaduje potvrzení každého bloku (GATT Write ACK / Write With Response), bez kterého neuloží snímek do flash paměti a neprovode fyzické prekreslení obrazovky.

## [0.1.244] - 2026-08-10

### Opraveno – Zrychlení nahrávání a odstranění zbytečného vynucování GATT ACK
- **`transfer.py`**: Opraven vyhodnocovací výraz `require_gatt_response`. Pokud charakteristika podporuje `write-without-response`, použije se nepotvrzovaný přenos bloku (`response=False`), což zrychluje přenos z 80 sekund na ~2 sekundy.
- **`queue.py` / `transfer.py`**: Sníženy nucené pauzy (cooldown) mezi novým pripojením ze 6-15 s na 2-3 s, což dramaticky zrychluje odesílání návrhů na displeje.

## [0.1.243] - 2026-08-10

### Opraveno – Chyba syntaxe v transfer.py bránící importu integrace
- **`transfer.py`**: Odstraněn duplicitní blok `try:` vzniklý při opravě v 0.1.242, který způsoboval `SyntaxError: expected 'except' or 'finally' block` a bránil načtení integrace `dratek_eink` při startu Home Assistantu.

## [0.1.242] - 2026-08-10

### Opraveno – Zrušení bleak_retry_connector u přímých BLE streamovacích přenosů
- **`transfer.py`**: Návrat k přímé instanciaci `BleakClient`. Použití wraperu `bleak_retry_connector.establish_connection` způsobovalo v BlueZ DBus rozhraní chybu `[org.bluez.Error.NotPermitted] Write acquired` při sekvenčním zapisování datových bloků displeje bez potvrzení.

## [0.1.241] - 2026-08-10

### Opraveno – Varování Zeroconf instancí a přímého pripojení BleakClient
- **`gateway.py`**: Detekce gatewayí v síti přes mDNS (`async_discover_gateways`) nově využívá sdílenou instanci Zeroconf z Home Assistantu (`await homeassistant.components.zeroconf.async_get_instance(hass)`), čímž se zamezilo vytváření druhé samostatné instance Zeroconf a souvisejícímu varování v logu.
- **`transfer.py`**: Lokální BLE připojení k displeji při existenci `bleak_retry_connector` v Home Assistantu automaticky využívá `establish_connection()`, což zvyšuje spolehlivost BLE spojení a předchází varování v logu.

## [0.1.240] - 2026-08-10

### Opraveno – Překompilovány binárky ESP32 gatewaye pro OTA na 0.1.52-gateway
- Předchozí build verze 0.1.239 obsahoval starou binárku `dratek-eink-gateway-esp32.bin`, takže se ESP32 gateway po OTA probudila zpět s verzí `0.1.51-gateway` a OTA selhalo na kontrole očekávané verze.
- Všechny binární OTA soubory (`esp32` i `esp32s3`) byly znova v plné kompilaci sestaveny s verzí `0.1.52-gateway`. Akceptovaný seznam verzí v panelu nyná obsahuje `0.1.51-gateway` i `0.1.52-gateway`.

## [0.1.239] - 2026-08-10

### Změněno – Navýšení verze firmware gatewayí na 0.1.52-gateway
- Navýšení verze firmware gatewaye na `0.1.52-gateway` a příslušných konstant v rozhraní (`CURRENT_GATEWAY_FIRMWARES` a `GATEWAY_FIRMWARE_VERSION`), aby panel Home Assistantu správně detekoval novější verzi a nabídl tlačítko **Aktualizovat firmware (OTA)** pro všechny připojené gatewaye.

## [0.1.238] - 2026-08-10

### Opraveno – Gatewaye postupně zpomalily BLE přenosy, i ty, které přes ně vůbec nešly
Na instalaci s připojenými gatewayemi se přenosy po čase protáhly z ~10 s na jednotky minut. Netýkalo se to jen přenosů přes gateway – zpomalilo i odesílání přímo přes Bluetooth Home Assistantu. Příčina není v software cestě, ale ve fyzice: adaptér Home Assistantu i každý ESP32 vysílají do stejného pásma 2,4 GHz, obvykle pár metrů od sebe i od displejů. BLE spojení, které přijde o connection events, **neselže** – jen se zpomalí, takže se v logu neobjeví jediná chyba.

- **Firmware gatewaye (`main.cpp`, verze `0.1.51-gateway`):** `connectToDisplay()` spouštěl před **každým** pokusem o připojení šestisekundový aktivní BLE scan – i u přenosů, které by prošly rovnou. Aktivní scan je to nejdražší, co firmware může s pásmem udělat: na každý zachycený advertisement odpovídá vlastním `SCAN_REQ`, takže šest sekund scanu je šest sekund téměř nepřetržitého vysílání. Přitom scan na šťastné cestě nikdy nebyl potřeba – NimBLE se umí připojit rovnou na známou adresu, a adresu má každý volající k dispozici. Nově se zkouší přímé připojení první a scan zůstává jako záloha. Aby vypnutý displej nestál víc než dřív, používá přímý pokus kratší `setConnectTimeout` (6 s) než následný scan-assisted (18 s).
- **Firmware gatewaye:** Oba scany (`connectToDisplay()` i `GET /api/scan`) jely s duty cycle 75 % (`setInterval(80)` / `setWindow(60)`). Nově 25 % (`setInterval(160)` / `setWindow(40)`) – displej vysílající v běžném intervalu se pořád najde uvnitř šestisekundového okna, za třetinu vysílacího času. Discovery zůstává aktivní scan záměrně: identifikuje displeje podle DRATEK manufacturer payloadu, který by pasivní scan na firmwaru nesoucím ho ve scan response minul.
- **`ws_devices.py`:** `websocket_scan` posílal scan do všech gatewayí přes `asyncio.gather`. Vypadalo to jako zadarmo získaná paralelita – každý požadavek jde na jiný ESP32 přes HTTP – ale fyzicky to znamenalo, že všechny gatewaye začaly aktivně skenovat v tutéž chvíli, navrch k tomu, co zrovna dělal lokální adaptér. Nově se skenuje sériově.
- **Nový `radio.py`:** `TransferQueue` serializovala přenosy per displej (`_device_locks`) a per transport (`_locks`), takže lokální přenos na jeden displej a gateway přenosy na dva další běžely současně – v software jsou to opravdu nezávislé cesty. Rádio nezávislé není. Nový sdílený „radio slot" drží každá fyzická BLE operace; bere se **uvnitř** transportního zámku, aby se tři zámky nemohly zablokovat navzájem. **Stojí to propustnost**: dva displeje na dvou různých gatewayích na sebe teď čekají. To je vědomě zaplacená cena za to, aby jedna cesta tiše nedegradovala druhou.
- **`ws_devices.py`:** Discovery scan si rádio bere jen s časovým limitem (5 s) a když ho nedostane, vrátí to, co Home Assistant už zná, místo aby se zařadil za přenos, který může legitimně běžet minuty. Panel tak nikdy nevypadá zaseknutě.

> **Pozor:** Firmwarová část se projeví až po aktualizaci gatewayí na `0.1.51-gateway` (OTA v detailu gatewaye). Části v Home Assistantu se projeví hned po restartu integrace.

## [0.1.237] - 2026-08-09

### Opraveno – Automatická aktualizace proběhla jednou a pak už nikdy
- `queue.py`: `asyncio.CancelledError` nedědí z `Exception`, ale z `BaseException`, takže proletěla kolem `except Exception` ve `_execute` a job zůstal ve stavu `"writing"`. `_prune` aktivní joby nikdy nezahazuje a `_automatic_skip_reason` každý takový job považuje za probíhající přenos, takže se od té chvíle **každá** další automatická aktualizace toho displeje tiše zahodila jako „sloučená". Displej se obnovil jednou a pak už nikdy.
- Spustit to bylo snadné: `async_set_config` ruší úlohu obnovy při každém ručním nahrání, takže stačilo ručně odeslat návrh ve chvíli, kdy zrovna běžela automatická aktualizace.
- `_execute` teď zrušený přenos řádně dokončí (stav, `finished_at`) a teprve pak výjimku pošle dál. Dělá to synchronně a bez čekání na zápis historie - úloha už je zrušená a další `await` by šel přerušit dřív, než se stav opraví.
- `queue.py`: Nový `_is_active_job` je pojistka pro případ, že by úloha zemřela jinou cestou: job, který přežil vlastní časový limit přenosu, přestává platit za aktivní a `_prune` ho pustí do historie. Nic legitimního tak dlouho neběží, takže dřív nebo později se displej odblokuje sám.

### Změněno – Nastavení automatické obnovy se přesunulo k displeji
- `panel-devices.mixin.js`: Interval automatické obnovy a volba, co ji spouští, byly v dialogu „Nastavení šablony". Nepatří k šabloně, ale k displeji - jednu šablonu lze poslat na víc displejů, každý s jinou kadencí. Nově jsou v liště akcí displeje, na vlastním řádku hned pod tlačítkem „Odeslat do displeje".

### Opraveno – Zelené a oranžové stavové odznaky byly v tmavém režimu nečitelné
- `panel-render-ui.mixin.js`: Odznaky na kartách šablon i displejů měly barvu napevno - tmavě zelený/oranžový text na téměř průhledném světlém podkladu. To funguje jen na světlé kartě; v tmavém režimu prosvítala tmavá karta a tmavý text na ní nebyl vidět. Barvy jsou teď v proměnných (`--dratek-status-ok-*`, `--dratek-status-warn-*`, `--dratek-status-missing-*`), které se v tmavém režimu přepnou na světlý text nad výraznějším podkladem.
- `dratek-eink-panel.js`: Panel si zrcadlí `hass.themes.darkMode` na atribut `data-dratek-dark`. Samotný `prefers-color-scheme` by nestačil - motiv Home Assistantu se nastavuje zvlášť a může být tmavý, i když je systém světlý (a naopak); media query zůstává jako záloha pro testovací harness, který žádný `hass` nemá.
- Ověřeno v prohlížeči: všech osm variant odznaků (karty šablon, odznaky nastavení, karty integrací, poznámka) mění barvu podle motivu.

## [0.1.236] - 2026-08-09

### Opraveno – Přes dny a teploty v pruhu předpovědi se kreslil cizí text
- `panel-devices.mixin.js`: Zachytávání textových vazeb porovnávalo `<text>` běhy zamarkovaného a aktuálního dokumentu **podle pořadí**. To mlčky předpokládá, že oba dokumenty mají stejné běhy ve stejném pořadí - jenže nemají: údaj, který je právě teď prázdný (nedostupná entita, senzor, který ještě nic nenahlásil), nevykreslí žádný `<text>` element (`_svgText` vrací pro prázdný řetězec `""`, ne prázdný element). Vložení markeru tedy jeden běh **přidá** a všechny další se posunou o jedna.
- Důsledek: od prázdného údaje dál se každý běh porovnal jako změněný a přiřadil se právě zkoumané proměnné - i s geometrií toho běhu, který se na jeho pozici posunul. U šablony Počasí stačila jedna nedostupná entita a jedné entitě se přiřadilo jedenáct běhů, z toho **osm buněk pruhu předpovědi**. Automatická aktualizace pak kreslila hodnotu té entity přes dny a teploty, které si pruh vykresluje sám. Ručního odeslání se to netýkalo, proto to bylo vidět až po první automatické aktualizaci.
- Nový `_alignTemplateTextRuns` páruje běhy nejdelší společnou podposloupností místo podle pořadí: nezměněné běhy se spárují samy se sebou, změněný běh se spáruje s tím, který nahradil, a vložený běh bez protějšku (což je přesně ten prázdný údaj) se přeskočí - na displeji pro něj žádný text není, takže není co ani kam vázat.
- `panel-devices.mixin.js`: Textový běh uvnitř řádku `series()`/`ratio()`/`day()`/`event()` se navíc nezachytává vůbec. Celý takový řádek si překresluje jeho vlastní vazba (`_blockBars`/`_blockDial`/`_blockStrip`/`_blockDatebox`) včetně textu, takže druhá vazba na tentýž běh by hodnotu vykreslila dvakrát. Dosud to platilo jen pro řádky `ratio()` (`ratioClaimedIndices`), teď pro všechny.
- Ověřeno na skutečném panelu v prohlížeči: se šablonou Počasí a nedostupnou entitou počasí vzniká jedna vazba místo dvanácti, a se zdravou entitou zůstávají přesně tři správné vazby jako dosud.
- **Pozor:** vazby se zachytávají při ručním odeslání. Aby se oprava projevila na displeji, který už problém má, je potřeba návrh jednou znovu ručně odeslat.

## [0.1.235] - 2026-08-09

### Opraveno – Automatická aktualizace teď kreslí obsah šablony úplně stejně jako ruční odeslání, ne jen podobně
- Předchozí dvě kola (v0.1.233, v0.1.234) opravovala jednotlivé odchylky mezi ručním a automatickým odesláním jednu po druhé. Tohle kolo řeší jejich společnou příčinu: nejpoužívanější vykreslovací větev backendu (`render_entity_bound_clean_background_image` - ta, která se zkouší jako první a používá se pro každý návrh uložený současnou verzí panelu) překreslovala text i grafické řádky šablony přes PIL, tedy ručně dopočítaným přiblížením toho, co v prohlížeči kreslí SVG. Nikdy to nemohlo sedět přesně, jen se to k tomu postupnými opravami blížilo.
- `render.py`: Textové běhy se teď skládají ze stejných `<text>` elementů, jaké zapsal panel (`svg_text.py` je jeho doslovný port), a rasterizují se přes resvg s přibaleným písmem Arimo. PIL text naopak zvětšoval do rámečku (ne jen zmenšoval, aby se vešel) a centroval podle inkoustového obrysu glyfů místo podle střední účaří písma, takže se každá hodnota na každé šabloně vykreslila jinak velká a o kus jinde než při ručním odeslání.
- Nový `svg_blocks.py`: Doslovný port sedmi funkcí, kterými panel kreslí živé řádky šablony - `_blockBars`, `_blockSpark`, `_blockMeters`, `_blockRing`, `_blockDial`, `_blockStrip` a `_blockDatebox`. Graf/sloupce (`series()`), měřidlo (`ratio()`), předpověď (`day()`) i kalendářní událost (`event()`) se tedy při automatické aktualizaci kreslí ze stejného značkování, jaké by vytvořil prohlížeč, místo aby se jejich oblouky, rozestupy sloupců a velikosti písma dopočítávaly znovu ručně. Mimo jiné tím zmizel rozdíl v desetipixelovém minimu čitelnosti, které `_svgText` uplatňuje na každý popisek a které PIL větev neměla.
- Ověřeno měřením: stejná šablona (ciferník, pruh předpovědi se skutečnými ikonami počasí, kalendářní rámeček a textový nadpis) se ručním a automatickým odesláním dřív lišila v 6,99 % pixelů, teď v 0,00 % - obrazy jsou bit po bitu shodné.
- `render.py`: Doplněn chybějící `import math`. `_render_bound_layer` ho používá při kreslení ručičky půlkruhového měřidla (widget designéru s variantou "semicircle"), takže každá automatická aktualizace návrhu s tímto prvkem dosud spadla na `NameError` a neproběhla vůbec.
- PIL větev zůstává beze změny jako záloha pro platformy, kam se rasterizér (resvg-py) neinstaluje, a nadále je správným modelem pro volně umístěné widgety designéru, které se i při ručním odeslání kreslí na plátno jako boxy. Nově v ní ale text drží zachycenou velikost písma místo dopočítaného zvětšení.
- Nový `tests/test_svg_blocks_port.py` spouští skutečný `panel-template-svg.mixin.js` v Node a porovnává značkování obou stran znak po znaku, takže se port a předloha nemůžou nepozorovaně rozejít. `tests/test_svg_render.py` navíc nově hlídá, že automatická aktualizace vyjde pixel po pixelu shodně s ručním odesláním.

## [0.1.234] - 2026-08-09

### Opraveno – Grafy, měřidla, předpověď a kalendář v automatické aktualizaci měly jiná písma, velikosti a rozložení než ruční odeslání
- Rozšířené QA porovnání (viz v0.1.233) se dosud soustředilo na obyčejný text; toto kolo prošlo zbylých pět grafických vazeb - graf/sloupce, měřidlo (ciferník i mezikruží), předpověď počasí a kalendářní událost - a odhalilo, že vykreslovací vzorce na pozadí (`render.py`) se u většiny z nich lišily od toho, co skutečně kreslí prohlížeč (`panel-template-svg.mixin.js`), přestože souřadnice/box se už dřív zachytávaly správně.
- `render.py`: Ciferníkové měřidlo (`_render_bound_ratio`, dial) kreslilo o poznání menší a jinak tvarované měřidlo (~240° "tachometr" místo skutečného 180° půlkruhu otevřeného nahoru) na nezávisle spočítaném poloměru - nyní přesně podle `_blockDial`. Mezikruží (ring) mělo popisky a hodnotu o 20-25 % menší, než kreslí ruční odeslání - opraveno na stejný poměr k vnitřnímu poloměru jako `_blockRing`.
- `render.py`: Pruh předpovědi počasí (`_render_bound_forecast`) používal pevné velikosti písma podle výšky řádku; u úzkého pruhu (víc dnů, menší panel) tak text vycházel o 30-40 % menší, než kreslí `_blockStrip`, který velikost odvozuje i od šířky buňky. Opraveno na stejný vzorec.
- `render.py`, `panel-devices.mixin.js`: Kalendářní událost (`_render_bound_calendar`) kreslila datový rámeček přes celou výšku řádku místo čtverce vystředěného na výšku, s písmem o ~14 % menším, než kreslí `_blockDatebox`. Barva rámečku (`row.datebox.color`, např. červené datum u šablony Narozeniny) se navíc vůbec nezachytávala, takže na displeji vždy vyšla černá bez ohledu na návrh - opraveno na obou místech.
- `render.py`, `panel-devices.mixin.js`: Řádek grafu/sloupců uvnitř šablony (`series()`, např. Spotové ceny, Cena elektřiny) se dosud vykresloval přes stejnou funkci jako volně umístěný grafový prvek designéru - tedy s osami, mřížkou a legendou, které ruční odeslání pro tento řádek vůbec nekreslí (`_blockBars`/`_blockSpark` je čistý sloupcový/spark graf bez ozdob). Nová funkce `_render_bound_series` kreslí přesně tento jednodušší tvar. Popisky sloupců a zvýraznění aktuálního intervalu červeně (`row.bars.labels`/`highlight`, použité u Spotových cen a Ceny elektřiny) se navíc vůbec nezachytávaly - teď ano.
- `render.py`, `panel-devices.mixin.js`: Volně umístěný grafový prvek designéru (typ `chart`) nikdy nezachytával svůj nadpis, popisky os, ruční rozsah min/max ani velikost legendy - na automatické aktualizaci se tak vždy použily výchozí hodnoty backendu místo skutečného nastavení z návrhu. Výchozí velikost legendy a její rozsah na backendu navíc neodpovídaly frontendu (8, rozsah 6-14 místo 12, rozsah 10-24).
- `render.py`: Posuvník a otočný ovladač/ciferník (volně umístěné widgety) měly mírně odlišné okraje, poloměr úchytu a velikost ručičky/středového bodu než `_drawSliderWidget`/`_drawPotentiometerWidget` - sladěno.
- Přidána sada testů pokrývající novou funkci pro graf/sloupce v řádku šablony, barvu kalendářního rámečku a zvýraznění/popisky sloupcového grafu.

## [0.1.233] - 2026-08-09

### Opraveno – Rozsáhlé QA porovnání ručního a automatického odeslání u všech 24 šablon odhalilo čtyři další chyby
- `panel-devices.mixin.js`: Zachycená šířka boxu pro automatickou aktualizaci textu byla odvozená ze vzdálenosti ke kraji panelu, ne ze skutečné šířky textu. Backendový PIL renderer bere tento box jako cíl, který se snaží vyplnit (ne jen limit, ke kterému text zmenší), takže krátká hodnota v širokém boxu se zvětšila - u seznamů (např. CO₂/PM2.5/Vlhkost u šablony Kvalita vzduchu) až 3×, u velkých nadpisových čísel (např. "47 %" u Zahrady) natolik, že přesahovala do sousedního obsahu. Box se nyní odvozuje především ze skutečné šířky aktuálně zobrazeného textu.
- `panel-devices.mixin.js`, `automation.py`: Řádek kombinující pevný text s vázanou hodnotou v jednom běhu (např. šablona Zabezpečení: `` `Dveře · ${v(1, "Zamčeno")}` ``) se zachytí jako jedna vazba pro celý běh - automatická aktualizace dosud nahrazovala celý text jen vyřešenou hodnotou a tichě tak mazala pevný text "Dveře · ". Zachytávání teď z odděleného markeru vytáhne i to, co ho obklopovalo, a backend to skládá zpátky kolem výsledné hodnoty (i po překladu do češtiny).
- `automation.py`: Textové pole s druhem (kind) "calendar" navázané přímo na kalendářovou entitu (např. šablona Narozeniny, pole "Jméno z kalendáře") čte při ručním odeslání název nejbližší události, ne surový stav entity zapnuto/vypnuto - backend tuto výjimku vůbec neznal a vypisoval doslova "on".
- Všechny čtyři chyby nalezeny a ověřeny přes nové end-to-end QA porovnání: skutečné vykreslení všech 24 šablon ručně i automaticky vedle sebe.

## [0.1.232] - 2026-08-09

### Vylepšeno – Automatická aktualizace šablony Počasí teď kreslí skutečné ikony předpovědi, ne jen text
- `render.py`: Předpověď na 4 dny dosud v automatické aktualizaci ukazovala jen zkratku textem ("JASNO", "DÉŠŤ"...) místo skutečné ikony, protože backend neuměl vykreslit MDI ikony jako prohlížeč. Nově se pro 14 stavů počasí (stejná mapa jako `_weatherConditionIcon` v panelu) vykresluje skutečná ikona přes stejný SVG rasterizér (`resvg`), jaký backend už používá pro text - se stejnou grafikou, jakou kreslí ruční odeslání. Pokud `resvg` na dané instalaci není k dispozici nebo stav počasí nemá namapovanou ikonu, zůstává textová zkratka jako záloha.
- Ověřeno end-to-end přes `tests/dratek-eink-panel-harness.html` - skutečné zachycení `clean_background`, skutečné hodnoty, skutečně vykreslené ikony.

## [0.1.231] - 2026-08-09

### Opraveno – Automatická aktualizace šablony Počasí vypisovala anglický stav ("sunny") místo českého slova
- `panel-devices.mixin.js`: Ve `_templateVariableMeta` detekce "interních" (automaticky doplňovaných) údajů testovala pouhý podřetězec - `"čas"` se shodovalo i uvnitř slova `"počasí"` (po-**čas**-í). Proto byl údaj Stav počasí u šablony Počasí navždy uvězněný jako interní pole: nešlo mu vůbec přiřadit entitu, takže vždy zůstávalo na svém statickém textu z návrhu ("Polojasno") - v ručním odeslání stejně jako v automatické aktualizaci. Detekce nyní porovnává celá slova, ne podřetězec.
- `panel-devices.mixin.js`, `automation.py`: I po opravě výše zůstal rozdíl mezi ručním a automatickým odesláním - ruční odeslání překládá stavy jako `sunny`/`not_home`/`on` do češtiny (`_templateStateWords`), backend pro automatickou aktualizaci ale žádný takový překlad neměl a vypisoval syrový stav Home Assistantu. Textové bindingy nyní nesou i svůj `kind` a `automation.py` má vlastní český překladový slovník (počasí, zámek, alarm, osoba/tracker, binary_sensor podle device_class) - přesně podle stejné logiky jako panel.
- Ověřeno end-to-end přes `tests/dratek-eink-panel-harness.html`: skutečné zachycení `clean_background` z prohlížeče, doplněné o skutečně přeloženou hodnotu, složené skutečným `render.py`.

## [0.1.230] - 2026-08-09

### Opraveno – Automatická aktualizace šablony Počasí (a měřidel u 0.1.229) vykreslovala rozbitý/zdvojený obsah
- `panel-devices.mixin.js`: U šablon s `ratio()` (Kvalita vzduchu, Obývák, Stav serveru, Fotovoltaika) se hodnota u ciferníku/měřidla kreslila dvakrát přes sebe - jednou starým mechanismem jako přesný textový uzel, podruhé znovu jako součást celého nově překresleného řádku. Variabilní indexy použité v `ratio()` se teď z prostého textového zachytávání vyřazují (`ratioClaimedIndices`), takže je kreslí výhradně nová "ratio" vazba.
- `render.py`: Do `_render_bound_forecast` přidána pojistka - pokud by meteorologická integrace na `weather.get_forecasts` s `"type": "daily"` odpověděla přesto hodinovými daty (desítky záznamů místo čtyř), pruh předpovědi by se zmenšoval na nečitelnou, přes sebe se překrývající změť. Nyní se počet dnů tvrdě ořízne na očekávaný počet a při příliš úzkých sloupcích (pod 18 px) se pruh vůbec nekreslí, místo aby se nakreslil nečitelně.
- Ověřeno end-to-end přes testovací harness (`tests/dratek-eink-panel-harness.html`) - skutečné zachycení `clean_background` z prohlížeče provedené skutečným Python vykreslovačem `render.py`.

## [0.1.229] - 2026-08-09

### Opraveno – Automatická aktualizace u 10 šablon nevykreslovala grafy, měřidla, předpověď počasí ani kalendář
- Šablony postavené na pomocných funkcích `series()` (graf/sparkline), `ratio()` (výplň měřidla/ciferníku), `day()` (denní předpověď počasí) a `event()` (kalendářní událost) - tedy Počasí, Kalendář, Kvalita vzduchu, Obývák, Stav serveru, Fotovoltaika, Cena elektřiny, Zahrada, Spotřeba vody a České spotové ceny - se do zachytávání bindingů pro automatickou aktualizaci vůbec nedostaly. Tyto čtyři funkce nikdy neprodukují `<text>` uzel s doslovnou hodnotou (graf kreslí čísla jako výšku sloupců, `day()`/`event()` čtou data ze service volání), takže je stávající mechanismus (diffování `<text>` uzlů podle vloženého markeru) neviděl. Výsledkem bylo, že se po automatické aktualizaci tyto prvky netvářily jako aktuální stav, ale zůstávaly zamrzlé na hodnotě z posledního ručního odeslání - u šablony Počasí to bylo nejvýraznější, protože čtyřdenní předpověď se tak nikdy sama neaktualizovala.
- `panel-devices.mixin.js`, `panel-template-svg.mixin.js`: Řádky používající tyto čtyři funkce nesou nově vlastní `group` značku (a u ratio()/series() i deklaraci `automation: { ... }` přímo v souboru šablony - viz `air.js`), podle které se dají dohledat, vyříznout z `clean_background` stejně jako text, a zachytit jako plnohodnotný binding.
- `automation.py`: Nové resolvery - `_ratio_value`/`_series_value` čtou aktuální stav navázané entity synchronně (žádné service volání není potřeba), `_async_forecast_days`/`_async_calendar_entry` nově volají `weather.get_forecasts` a `calendar.get_events` přímo z backendu (dosud to uměl jen prohlížeč při ručním zobrazení editoru).
- `render.py`: Nové vykreslovací funkce `_render_bound_ratio` (ciferník/mezikruží/vodorovné pruhy), `_render_bound_forecast` (pruh čtyř dnů) a `_render_bound_calendar` (datový rámeček) zapojené do stejné cesty jako ostatní typy bindingů (`clean_background` i záložní PIL vrstva).
- Přidána sada testů pokrývající backend resolvery, vykreslování i frontendové zachytávání bindingů.

## [0.1.228] - 2026-08-08

### Přidáno – Možnost zrušení čekající úlohy ve frontě odesílání z UI
- `queue.py`, `websocket.py`, `ws_queue.py`: Přidána metoda `async_cancel_job` a nová WebSocket příkazová služba `dratek_eink/queue/cancel`. Umožňuje bezpečně zrušit naplánovanou úlohu odeslání na displej, pokud ještě nezačalo fyzické přenášení bajtů (stav `queued`). Úlohy ve stavu `writing` nelze zrušit, aby nedošlo k zamrznutí e-ink ovladače uprostřed přenosu.
- `panel-queue.mixin.js`, `panel-inspector.mixin.js`, `panel-render-ui.mixin.js`: U čekajících úloh ve frontě odesílání přibylo tlačítko pro zrušení (`mdi:close-circle-outline`). Po kliknutí se úloha okamžitě přeruší a odstraní z aktivní fronty.

## [0.1.227] - 2026-08-08

### Opraveno – Automatická obnova displeje po šablonách nevykreslovala správně texty ani data
- `render.py`, `automation.py`: Automatická obnova (na časovač i na změnu entity) dosud vykreslovala každou hodnotu (text, graf, měřidlo, počasí) bez skutečné znalosti toho, co je za ní na pozadí - buď potřebovala nativní SVG rasterizér `resvg_py`, který se na některých instalacích Home Assistanta (ARM, HAOS na muslu) vůbec nenačte, nebo (bez něj) prostě přelepila celé místo plnou bílou/černou/červenou obdélníkovou "hádankou" a teprve na ni napsala novou hodnotu. Kdekoliv pod hodnotou ve skutečnosti byla ikona, barevný přechod nebo fotka - typicky u šablon jako Počasí - vypadal výsledek zjevně rozbitě a neodpovídal ručnímu odeslání.
- Panel teď při ručním odeslání zachytí navíc i `clean_background`: skutečné vykreslení šablony s úplně vyprázdněnými dynamickými hodnotami (bez textu, bez kamerového snímku, bez grafů/měřidel) - stejným prohlížečovým vykreslovačem jako ruční odeslání, takže tu nikdy nic nehádá. Automatická obnova pak na tento opravdový podklad skládá čerstvé hodnoty (`render_entity_bound_clean_background_image`), a to pro každý typ prvku, na jakékoliv platformě, bez závislosti na `resvg_py`.
- `panel-devices.mixin.js`, `panel-template-svg.mixin.js`: Nová metoda `_blankedDisplayTemplateBackground` klonuje zachycený dokument šablony, odstraní zaznačené textové uzly a href kamerového snímku a vynechá vykreslení volných widgetů (graf/měřidlo/signál/posuvník), protože ty se do plátna dostávají jen přes `paintOverlay`, který se pro tento průchod vůbec nevolá.
- Starší již uložené automatizace (bez `clean_background`) fungují beze změny přes původní řetězec náhradních cest - jde čistě o přidání, žádná migrace není potřeba.

### Přidáno – Volba, co spouští automatickou obnovu displeje
- `automation.py`: Nové nastavení `refresh_trigger_mode` (výchozí `both`, jako dosud) rozhoduje, co u daného displeje smí spustit obnovu - **při změně i pravidelně** (dosavadní chování), **jen při změně entity** (`change_only` - periodický časovač tento displej úplně přeskočí, užitečné pro displeje bez potřeby pravidelné pojistky, např. bez kamerové vazby), nebo **jen pravidelně podle intervalu** (`interval_only` - změny navázané entity se ignorují, užitečné pro entitu měnící se moc často, kterou chce uživatel spíš omezit na pevný interval).
- `_handle_refresh_tick` přeskakuje displeje v režimu `change_only`, `_handle_state_change` přeskakuje displeje v režimu `interval_only` a `_refresh_listener` navíc vůbec nepřihlašuje k odběru entity, které žádný displej v režimu `both`/`change_only` nepotřebuje - `interval_only` displej tak nikdy nezareaguje na cizí sdílenou entitu jiného displeje.
- `ws_projects.py`: Uložení konceptu displeje (`dratek_eink/device_drafts/save`) teď kromě intervalu prosadí i změnu tohoto režimu okamžitě do běžící automatizace (`async_set_refresh_trigger_mode`), bez nutnosti displej znovu odeslat.
- V nastavení šablony/designeru displeje (`panel-devices.mixin.js`) přibyl výběr vedle intervalu obnovy s těmito třemi možnostmi.
- Starší uložené automatizace (bez `refresh_trigger_mode`) fungují beze změny - výchozí `both` odpovídá přesně dosavadnímu chování.

## [0.1.225] - 2026-08-07

### Opraveno – Interval automatické obnovy displeje konečně skutečně odesílá nový náhled
- `automation.py`: Volba intervalu obnovy v nastavení displeje ("30 s" až "24 hod") dosud jen omezovala, jak často se displej smí obnovit, když se změnila napojená entita - žádný časovač ale sám o sobě nikdy nespustil obnovu jen proto, že uplynul zvolený čas. Displej napojený na pomalu se měnící data (nebo bez reálné změny vůbec) tak nikdy automaticky neobnovil, ať byl interval nastavený na cokoliv.
- Jediná výjimka byla šablona Meteoradar, která měla vlastní pevný desetiminutový časovač (`_handle_camera_tick`) - ignoroval ale zvolený interval v nastavení a fungoval jen pro kamerové vazby.
- Oba nahrazeny jedním obecným mechanismem (`_handle_refresh_tick`): kontrola všech nastavených displejů co `REFRESH_TICK_SECONDS` (30 s), a jakmile displeji uplyne jeho vlastní `refresh_interval_seconds`, naplánuje se mu skutečná obnova - stejnou cestou (`_schedule_refresh` → `_async_refresh_loop`), jakou dosud spouštěly jen změny entit. Odesílá se přitom (stejně jako dosud) jen když se vykreslený obrázek opravdu liší od naposledy odeslaného, takže baterie displeje ani jeho e-ink cykly netrpí zbytečným přepisováním nezměněného obsahu.
- Zastaralý popis třídy `EntityAutoUpdateManager` ("Keep legacy automation data disabled while manual-only mode is active") nahrazen popisem odpovídajícím tomu, co třída doopravdy dělá.

## [0.1.224] - 2026-08-07

### Rozšířeno – Podrobné návody na zprovoznění pro všech 25 šablon
- Každá šablona v `templates/<id>.js` má nyní důkladnější `setup`: konkrétní integrace se skutečnými názvy (ne jen "integrace vašeho X"), krok za krokem postup a u řady šablon novou poznámku upozorňující na to, co šablona ve skutečnosti dělá - typicky že karta má pevný počet řádků/dlaždic, ale jen část z nich je skutečně napojitelná na živá data (Kdo je doma, Odjezdy, Nákupní seznam, Zásilka), zbytek je ilustrační grafika.

### Opraveno – Čtyři reálné chyby v automatickém rozpoznávání zdrojů dat
- `panel-devices.mixin.js` (`_templateSlotKind`): Údaj **Osoby** v šabloně Kdo je doma se napojoval na entitu `person.*`, ale zobrazovala se jen Doma/Pryč místo jména - `person.*` entity totiž ve svém stavu jméno nikdy nenesou. Kategorie `person` rozdělena na `person_name` (čte se `friendly_name`) a `person_status` (čte se stav), takže Osoby teď skutečně ukáže jméno a Přítomnost stav.
- Obdobně **Teplota**/**Cílová teplota** v šabloně Topení: `climate.*` entita má ve stavu režim topení (heat/off/auto), ne číslo - `_templateDisplayValue` nyní pro tyto údaje čte atributy `current_temperature`/`temperature`, a Výkon topení navíc umí zobrazit skutečnou činnost (Topí/Klid/Vypnuto) z atributu `hvac_action`.
- **Úspora CO₂** ve Fotovoltaice a **Další zálivka** v Zahradě se kvůli sdíleným slovům ("CO₂", "zálivk") mylně napojovaly na senzor kvality ovzduší (ppm), resp. spotřeby vody (litry) - úplně jiná fyzikální veličina, než o kterou jde (kg uspořeného CO₂, čas příští zálivky). Opraveno na obecný senzor, resp. časový/trvání senzor.
- **Počet zbývajících** v Nákupním seznamu se kvůli slovu "zbývaj" mylně napojovalo na stejnou kategorii jako "Zbývající čas" pračky (časový senzor) - opraveno na novou kategorii `todo_count`, která správně cílí na `todo.*` entitu (jejíž stav je počet nevyřízených položek).
- **Jméno** v šabloně Narozeniny přejmenováno na **Jméno z kalendáře** - se stejným slovem jako v Kdo je doma by nově rozdělená kategorie `person_name` mylně nabízela osobu místo kalendáře; přejmenování opravuje i to, že položka narozenin se ve skutečnosti čte jako název kalendářové události, ne stav entity.

## [0.1.223] - 2026-08-07

### Refaktorováno – Každá šablona má vlastní soubor
- Nová složka `custom_components/dratek_eink/frontend/panel/templates/` obsahuje jeden soubor na jednu šablonu (`weather.js`, `price.js`, `radar.js`, ...). Každý soubor nese úplně vše o dané šabloně: katalogový záznam (číslo, kategorie, název, použité údaje), návod na zprovoznění (jaká integrace je potřeba, kroky nastavení) i samotný kód, který kreslí vzhled šablony na displeji.
- Dosud byly tyto tři věci rozeseté na třech místech ve dvou velkých souborech - katalog a návody v `panel-devices.mixin.js`, kód vzhledu v `panel-template-svg.mixin.js` - takže úprava jedné šablony znamenala hledat a upravovat na třech různých místech. `panel-devices.mixin.js` a `panel-template-svg.mixin.js` nyní jen importují `templates/index.js` a z něj katalog, návody i vzhledy sestaví - žádná duplicita, jedno místo pravdy na šablonu.
- Objevena a doplněna zapomenutá šablona **Regálová cenovka** (`priceshelf`) - měla už hotový vzhled i návod na zprovoznění, ale chyběl jí katalogový záznam, takže se v nabídce šablon nikdy nezobrazila. Katalog má nyní 25 šablon místo 24.
- `tests/test_display_template_shapes.py`: Sken, který hlídá, že žádné dvě šablony nemají stejný tvar, přepsán z hledání pevného sloupce odsazení na sledování hloubky závorek - funguje napříč soubory bez ohledu na to, jak je která šablona odsazená.
- `tests/test_frontend_tool_library.py`: Sken zdrojového kódu panelu nyní prochází i podsložky (`templates/`), ne jen `panel/*.js`.

## [0.1.222] - 2026-08-07

### Změněno – Katalog šablon zobrazuje vše najednou
- `panel-devices.mixin.js`: Záložky **Předpřipravené** / **Vlastní nastavení** dosud rozdělovaly katalog na dvě poloviny a defaultně schovávaly deset z dvaceti čtyř šablon, dokud na ně uživatel neklikl. Katalog teď zobrazuje všech 24 šablon (i uživatelské) v jedné mřížce najednou; vyhledávání zůstává. Odznak "Automatické nastavení" / "Vlastní zdroje dat" na každé kartě dál říká, jestli se zdroje dat napojí samy, nebo je potřeba je vybrat ručně.
- `panel-render-ui.mixin.js` & `panel-inspector.mixin.js`: Odstraněn mrtvý kód po záložkách (přepínač kategorie, jeho stav a styly).

### Opraveno – Automatické napojování zdrojů dat pro šablony Spotřeba vody a Nákupní seznam
- `panel-devices.mixin.js` (`_templateSlotKind`): Údaje šablony **Spotřeba vody** ("Spotřeba dnes/týden/měsíc") se kvůli sdílenému slovu "spotřeba" napojovaly na senzory s device_class `energy` místo `water` - klíčové slovo pro energii se kontrolovalo dřív než pro vodu. Opraveno pořadí a popisky údajů upřesněny na "Spotřeba vody dnes/týden/měsíc", takže se teď správně napojí na vodoměr.
- Údaj "Počet zbývajících" v šabloně **Nákupní seznam** se kvůli podřetězci "zbývaj" mylně klasifikoval jako časový/trvání senzor (stejné klíčové slovo jako u "Zbývající čas" pračky). Rozpoznávání teď vyžaduje celou frázi "zbývající čas", takže si obě šablony nepřekáží.

### Přidáno – Rozpoznávání zdrojů dat pro Odpady a Odjezdy
- `panel-devices.mixin.js`: Šablony **Odpady** a **Odjezdy** dosud neměly žádná klíčová slova pro automatické rozpoznání vhodné entity - všechny jejich údaje spadaly do obecné kategorie a napojení senzoru integrace svozu odpadu nebo dopravce bylo čistě náhodné. Přidány kategorie `waste` (svoz, odpad, popelnice → `calendar`/`sensor`) a `transport` (zastávka, odjezd, linka, spoj → `sensor`), a `narozenin` nyní míří ke stejné kategorii jako svátek. Ověřeno živě: se senzorem `sensor.svoz_odpadu_smesny` a `sensor.pid_zastavka_odjezdy` v Home Assistantu si šablony teď entitu vyberou samy.

## [0.1.221] - 2026-08-07

### Předěláno – Panel s informacemi o displeji v nastavení šablony
- `panel-devices.mixin.js` & `panel-render-ui.mixin.js`: Panel nad náhledem displeje v nastavení šablony (jméno, adresa, baterie, signál, rozlišení) byl dosud jeden vodorovně scrollovatelný pruh natěsno poskládaný pomocí `!important` oprav. Nově je to přehledná karta se dvěma jasně oddělenými sekcemi - nahoře ikona, jméno a adresa displeje, pod tím samostatný řádek se třemi stejně velkými dlaždicemi (baterie, signál, rozlišení). Žádné vodorovné scrollování, vše čitelné najednou.
- Výběr intervalu automatické obnovy byl z tohoto panelu odstraněn (konzistentně s předchozím odstraněním z karet na hlavní stránce) - nastavení intervalu zůstává dostupné v dialogu nastavení displeje.

## [0.1.220] - 2026-08-07

### Odstraněno – Ikona a čas obnovy z karet displejů na hlavní stránce
- `panel-devices.mixin.js`: Karty displejů v přehledu ("Nalezené displeje") dosud v řádku se stavem baterie a signálu zobrazovaly i ovládací prvek intervalu automatické obnovy (ikona `mdi:timer-refresh-outline` a výběr času typu "5 min", "1 hod"...). Ten je nyní z karty úplně odstraněn - nastavení intervalu obnovy zůstává dostupné v nastavení konkrétního displeje, jen se už nezobrazuje na kartě v hlavním přehledu.

## [0.1.219] - 2026-08-07

### Opraveno – Tenké hranice v přehledu celé Evropy a chybějící zvýraznění volby "eu"
- `meteoradar.py`: Hranice států se kreslí v plném zoomu-6 rozlišení a teprve pak se celý obrázek zmenšuje na velikost displeje - přehled celé střední Evropy pokrývá několikanásobně větší plochu než jeden stát při stejném pixelovém rozpočtu, takže původní tloušťka čáry (2 px) se po zmenšení a kvantizaci na tři barvy prakticky ztrácela. Nová funkce `_scaled_border_width` tloušťku čáry zesílí úměrně tomu, o kolik zmenšení překračuje limit `MAX_NATIVE_DIMENSION` - u jednotlivých států (menší plocha) se vzhled nezmění, u přehledu Evropy zůstanou hranice po zmenšení zřetelně vidět.
- `meteoradar.py`: Do rohu vykreslené mapy (stejný obrázek pro náhled v nastavení šablony i pro displej) nově funkce `draw_corner_badge` přidává malý štítek se zkráceným názvem státu a časem poslední srážkové snímky z RainVieweru (např. "Česko · 14:32") - dosud mapa žádnou informaci o tom, kdy byla pořízena, neposkytovala.
- `panel-devices.mixin.js`: Interaktivní mapa výběru státu v nastavení šablony při volbě "Střední Evropa" dosud nezvýrazňovala žádný stát, protože porovnávala vybrané `eu` proti jednotlivým kódům zemí. Nyní se při volbě "eu" zvýrazní všech pět tvarů najednou, stejně jako skutečná vykreslená mapa ukazuje hranice všech pěti zemí.

## [0.1.218] - 2026-08-07

### Opraveno – Odesílání se po několika nahráních za sebou postupně zpomalovalo
- `transfer.py`: Zápis bloků obrázku (`write_gatt_char`) měl už dřív ohraničený timeout (`GATT_OPERATION_TIMEOUT`), ale `disconnect()` a `start_notify`/`stop_notify` kolem něj ne. Na tomto levném BLE stacku displeje umí některé z nich místo chyby prostě zaseknout - a protože je každý BLE přenos na jednu adresu serializovaný přes zámek `TransferQueue`, zaseklý úklid po přenosu N zablokoval přenos N+1 na dobu, po kterou visel, ohraničenou jen 10minutovým bezpečnostním timeoutem celé fronty. Přesně tenhle vzorec ("čím víc nahrání za sebou, tím pomalejší") byl vidět ve frontě - jeden zápis trval 432s místo obvyklých pár sekund.
- `transfer.py`: Nové metody `_start_notify`/`_stop_notify` a ohraničení `disconnect()` konstantou `TEARDOWN_OPERATION_TIMEOUT` (5s) zajišťují, že se zaseklý úklid spojení maximálně po pár sekundách vzdá a uvolní zámek pro další nahrání - desáté nahrátí za sebou by tak mělo připojovat stejně rychle jako první, bez ohledu na to, jak dopadl úklid po tom předchozím.

## [0.1.217] - 2026-08-07

### Opraveno – Hranice sousedních států dotaženy na stejnou kvalitu jako ČR
- `meteoradar.py`: Slovensko, Německo, Rakousko a Polsko dříve zjednodušeny na sdílený rozpočet ~150-220 bodů, což u složitějších tvarů (německé pobřeží Baltu/Severního moře) ořízlo víc reálného detailu než u ČR. Nově zjednodušeny algoritmem Douglas-Peucker se stejnou tolerancí (epsilon 0.02°) jako ČR, takže výsledná věrnost je skutečně 1:1 - Německo tak dostalo 603 bodů místo dřívějších ~200, protože jeho pobřeží si to při stejné toleranci žádá.
- `meteoradar.py`: Zdroj hranic Polska nahrazen - geoBoundaries mělo pro Polsko jen hrubý ~1200bodový obrys (Wiki Commons), zatímco ostatní země těžily z desítek tisíc bodů OpenStreetMap. Polská hranice nyní stažena přímo z OpenStreetMap (Overpass API, relace 49715) a poskládána z member ways do jednoho ~67 000bodového obrysu před zjednodušením.
- `panel-devices.mixin.js`: Interaktivní mapa výběru státu (nastavení šablony i lokální náhled) přegenerována z aktualizovaných dat.

## [0.1.216] - 2026-08-07

### Přidáno – Dokončení šablony Meteoradar: přesné hranice, přehled Evropy, automatická obnova
- `meteoradar.py`: Hranice Slovenska, Německa, Rakouska a Polska nahrazeny přesnou geometrií z geoBoundaries (zjednodušenou algoritmem Douglas-Peucker), stejně jako u ČR.
- `meteoradar.py`: Přidána funkce `compose_multi_country_radar_image` a volba státu `eu` nyní vykresluje skutečný přehled celé střední Evropy (hranice všech pěti zemí najednou) místo prázdného obdélníku.
- `panel-devices.mixin.js` & `automation.py`: Vybraný stát srážkové mapy se nyní správně přenáší i do automatických obnov (dříve automatika vždy vykreslila ČR bez ohledu na výběr).
- `automation.py`: Přidána periodická obnova (`_handle_camera_tick`, každých 10 minut) pro šablony s kamerovou vazbou (Meteoradar) – entita `camera.meteoradar` nemění svůj stav, takže se dosud nikdy automaticky neobnovovala; nyní se pravidelně znovu vykreslí a odešle frontou na displej, kde je šablona nastavena.
- `panel-devices.mixin.js` & `panel-render-ui.mixin.js`: Interaktivní mapa výběru státu v nastavení šablony (a tedy i v lokálním náhledu `preview.html`, který stejnou komponentu sdílí) nahrazena přesnými obrysy hranic (stejná data jako na displeji) místo ručně kreslených přibližných tvarů; ke každému státu přidána výrazná vlajka nad zkratkou kódu.

## [0.1.215] - 2026-08-07

### Opraveno – Oprava chyby voluptuous schématu ve websocket_api
- `ws_meteoradar.py`: Opraven import `voluptuous as vol` a nahrazen neexistující atribut `websocket_api.Optional` za správný `vol.Optional("country")`, čímž se zamezilo chybě `AttributeError` při spuštění integrace v Home Assistantu.

## [0.1.214] - 2026-08-07

### Přidáno – Výběr státu meteoradaru s přesnými geografickými hranicemi & Odznaky stavu šablon
- `meteoradar.py` & `panel-devices.mixin.js`: Přidány reálné geografické hranice ČR, Slovenska, Německa, Rakouska a Polska v plném geografickém detailu.
- `panel-devices.mixin.js`: Přesunuta interaktivní mapa států do pravého panelu nastavení šablony přímo k nastavení entit.
- `panel-devices.mixin.js` & `panel-render-ui.mixin.js`: Přidány jasné indikátory stavu nastavení (`Nastaveno` / `Nenastaveno` / `Částečně`) na všechny karty šablon v katalogu i přehledu.
- `panel-devices.mixin.js`: Přidán volitelný interval automatické obnovy displeje u každého zařízení.

## [0.1.213] - 2026-08-07

### Přidáno – Zamknutí scrollování na pozadí při otevřeném dialogu nastavení
- `panel-devices.mixin.js`: Přidána metoda `_toggleModalScrollLock(active)`, která při otevření nastavení zamkne scrollování na `document.body` a na panelových kontejnerech a po zavření nastavení scrollování pozadí automaticky odemkne.
- `panel-render-ui.mixin.js`: Přidáno pravidlo `overscroll-behavior: contain` na backdrop dialogu, aby se scrollování uvnitř dialogu nepřenášelo na hlavní stránku šablon.

## [0.1.212] - 2026-08-07

### Opraveno – Přetékání a překrývání karet integrací v návodu k zprovoznění
- `panel-devices.mixin.js`: Nahrazeny kolidující CSS třídy v návodu novými izolovanými třídami (`template-guide-integration-card`, `template-guide-integration-top`, `template-guide-steps-list`, `template-guide-step-card`).
- `panel-render-ui.mixin.js`: Přidán čistý flexbox layout pro karty integrací a kroků, čímž se eliminovalo překrývání odznaků a textů v levém panelu.

## [0.1.211] - 2026-08-07

### Předesignováno – Dvousloupcové grafické menu nastavení šablony
- `panel-devices.mixin.js`: Sjednocení dialogu nastavení šablony a návodu k zprovoznění do přehledného 2-sloupcového grafického rozvržení.
- Vlevo: Grafický návod krok za krokem s indikátory nalezených/chybějících integrací a odkazů na dokumentaci.
- Vpravo: Přehledné napojení proměnných na entity Home Assistantu.
- `panel-render-ui.mixin.js`: Přidán moderní CSS design s glassmorphism pozadím, novými kartami integrací a stavovými odznaky.

## [0.1.210] - 2026-08-07

### Opraveno – Bluetooth konektivita po opakovaných zápisech a automatické retry
- `transfer.py`: Přidáno záložní vyhledání BLE zařízeni s `connectable=False` a záloha na přímou MAC adresu v `_connection_target`, pokud skener HA ještě nestihl aktualizovat stav po odpojení.
- `queue.py`: Rozšířen automatický Bluetooth retry i na manuální zápisy z editoru (`editor_design`), čímž se eliminuje selhání zápisu při dočasně obsazeném Bluetooth adaptéru.

## [0.1.209] - 2026-08-06

### Opraveno – Celoplošné nativní vykreslování srážkového radaru a viditelnost aktualizace v HACS
- Vydána verze 0.1.209 s přímou fallback cestou v `render.py` na `async_render_meteoradar(hass)`.
- Zajištěno zobrazení celoplošné srážkové mapy v editoru i na e-Ink displeji bez nutnosti manuálního zakládání kamerových entit.

## [0.1.208] - 2026-08-06


### Opraveno – Meteoradar zůstával navždy na "Načítám mapu…"
- Zdroj problému: `<dratek-eink-panel-harness.html>` nemá backend, takže lokální náhled nikdy nedostal odpověď na dotaz na mapu a zůstal trvale na placeholderu bez jakékoli chyby. Přidán mock, který lokální náhled skutečně vykreslí.
- V ostrém HA se stejný stav nejčastěji stává, když integrace přibyla o novou kamerovou entitu (`camera.meteoradar`), ale Home Assistant od aktualizace ještě neproběhl restartem – entita tak zatím neexistuje. Panel teď rozlišuje "ještě se nezkusilo" od "zkusilo se a selhalo" a u druhého stavu ukáže konkrétní chybovou hlášku namísto věčného "Načítám…". Neúspěšný pokus se navíc zopakuje mnohem dřív (15 s místo 2 min), takže se mapa objeví sama krátce po vyřešení příčiny.

### Opraveno – hranice České republiky byly hrubé a nepřesné
- Nahrazen zjednodušený 35bodový obrys (jen orientační přiblížení) skutečnou hranicí ČÚZK (Český úřad zeměměřický a katastrální) staženou přes geoBoundaries.org, zjednodušenou na 221 bodů Douglas-Peucker algoritmem – dost detailů na to, aby byla hranice na displeji skutečně rozpoznatelná, aniž by rostla velikost integrace.

## [0.1.207] - 2026-08-06

### Zjednodušeno – šablona Meteoradar obsahuje už jen mapu
- Odstraněny všechny doplňkové prvky šablony (nadpis, popisek se stavem počasí, patička s časem aktualizace) – šablona je nyní tvořená jediným blokem, radarovou mapou, která vyplňuje celou plochu displeje.
- Katalogová položka už neuvádí proměnné k navázání, protože šablona žádné textové hodnoty nezobrazuje.

## [0.1.206] - 2026-08-06

### Opraveno – Meteoradar konečně vykresluje skutečnou mapu se srážkami
- Šablona **Meteoradar** dosud jen slibovala "celoplošnou mapu", ale reálně vykreslovala pouze textový placeholder – žádná mapa se nikdy nestáhla ani nezobrazila.
- Integrace nyní obsahuje vlastní kamerovou entitu `camera.meteoradar`, která si sama stahuje aktuální srážková data z RainViewer a skládá je do obrázku: **černý obrys celé České republiky, uvnitř červeně vyznačené srážky** (bílá tam, kde neprší). Žádné nastavování kamery ani URL adres – funguje ihned po instalaci.
- Mapa se vykresluje na backendu (server-side), takže je pixelově shodná mezi náhledem, ručním odesláním i automatickou aktualizací displeje.
- RainViewer poskytuje nová data nejvýše jednou za 10 minut, takže se mapa (a automatická aktualizace displeje) přiměřeně aktualizuje ve stejném rytmu – rychlejší dotazování by beztak vracelo stejná data.
- Odstraněn zastaralý pokyn "nastavte si kameru RainViewer/OpenStreetMap sami" ze setup průvodce – tento krok už není potřeba.

## [0.1.206] - 2026-08-06

### Opraveno – Nativní záložní generování srážkového radaru RainViewer při absenci kamerové entity
- V `render.py` (`async_render_camera_binding_data_url`) přidán automatický záložní zdroj (fallback) na `async_render_meteoradar(hass)`.
- Srážková mapa se nyní správně vykresluje a načítá, i když v Home Assistantu není ručně přidána žádná samostatná `camera.meteoradar` entita.

## [0.1.205] - 2026-08-06

### Přidáno – Celoplošný Meteoradar přes celý displej propojený s Met.no
- Aktualizována šablona **Meteoradar (Met.no)** na **100% celoplošné zobrazení mapa přes celý displej**.
- Šablona je nativně propojena s integrací **Met.no (Meteorologisk institutt)** pro předpověď/teplotu a živou celoplošnou srážkovou mapu.

## [0.1.204] - 2026-08-06

### Opraveno – Registrace Meteoradar šablony v katalogu předpřipravených šablon UI
- Registrována šablona `radar` v seznamu `_displayTemplateCards()` a v množině `prepared` v `panel-devices.mixin.js`.
- Šablona **Meteoradar** se nyní správně zobrazuje v nabídce **Šablony** v editoru i katalogu.

## [0.1.203] - 2026-08-06

### Přidáno – Nová vestavěná šablona Meteoradar s volbou státu
- Přidána nová oficiální šablona **Meteoradar** v editoru DRATEK eInk.
- Šablona podporuje výběr státu (Česko, Slovensko, Německo, Rakousko, Polsko...) a propojení se srážkovou kamerovou entitou (např. `camera.meteoradar`).

## [0.1.202] - 2026-08-06

### Opraveno – Dynamická detekce/respektování zvolené gateway a zavedení prodlevy překreslení velkých displejů (400x300)
- V `ws_sending.py` přidaná podpora dynamického směrování přes manuálně přiřazenou nebo nejsilnější auto-detekovanou gateway (redukován cache interval směrování na 5 sekund).
- V `queue.py` přidána 15sekundová pauza mezi zápisy na velkých displejích (SDK type 75 / 400x300, 30 kB payload). Zamezuje zkoušení BLE připojení v době, kdy displej fyzicky přepumpovává náboj a má vypnuté BLE rádio.

## [0.1.201] - 2026-08-06

### Opraveno – Ochrana proti nešetrnému přerušení aktivního BLE přenosu při ručním odeslání
- Změna v `_preempt_automatic_update`: Pokud již probíhá fyzický zápis dat na displej/gateway (`status == "writing"`), úloha se nezruší natvrdo uprostřed přenosu.
- Důvod: Natvrdo zrušený přenos nechal řadič displeje v zamrzlém stavu očekávajícím další bloky. Nově se rozběhnutý přenos nechá v klidu dokončit/uvolnit BLE rozhraní a manuální požadavky počkají na uvolnění zámku zařízení, čímž se zamezí 15minutovým vytuhnutím.

## [0.1.199] - 2026-08-06


### Opraveno – Odstranění zbytečného okamžitého auto-updatu s prázdnými hodnotami po manuálním odeslání
- Uložení `base_image` a `svg_template` do konfigurace automatizace při registraci návrhu, aby budoucí aktualizace entit měly kompletní podkladový obrázek.
- Změna `_request_entity_automation_refresh`: po manuálním odeslání návrhu se nastaví časové razítko `_last_refresh_at`, aniž by se ihned spouštěl druhý nadbytečný přenos z Pythonu, který přemazával právě nahraný displej prázdnými poli.

## [0.1.198] - 2026-08-06

### Opraveno – Zvýšení intervalu opakováné komunikace u stejného displeje na 6,0s
- Zvýšen `MIN_RECONNECT_INTERVAL_SECONDS` z 3,0 s na 6,0 s pro lokální BLE přenosy na stejnou MAC adresu.
- Důvod: Po dokončení přenosu dat mikrokontrolér displeje provádí fyzickou obnovu e-ink čipu (3–15 sekund) a vypíná BLE rádio k zamezení poklesu napětí. Zvýšení pauzy zamezí situaci, kdy se opakovaný pokus spustil v době fyzického překreslování a zablokoval Bluetooth stack operačního systému.

## [0.1.197] - 2026-08-06

### Opraveno – Stabilizace BLE přenosů a chybějících CCCD notifikací dle specifikace v1.0.5
- Na základě analýzy oficiální dokumentace a reverzního inženýrství SDK (API v1.0.5):
  - Ošetřeno selhání přihlášení k notifikacím na zápisové charakteristice (`write_char` `start_notify` wrapped in `try...except`), což zabraňuje výpadkům na displejích s absencí CCCD deskriptoru.
  - Povoleno streamování dat i na charakteristikách s nepodporovanými potvrzovanými zápisy s bezpečnými fallback prodlevami.

## [0.1.196] - 2026-08-06

### Opraveno – Optimalizace automatického nahrávání, paměti a frontend posluchačů
- Ruční nahrání z editoru/studia již nezakládá nechtěné automatické aktualizace na pozadí a nepřenáší chybové texty `unavailable`.
- Skenování tras ESP32 Gatewayí prodlouženo z 30 s na 120 s pro zklidnění provozu a ochranu BLE komunikace.
- Přidáno automatické promazávání neaktuálních historických dat grafů z paměti RAM v `automation.py`.
- Ošetřeno uvolňování posluchačů událostí okna v `disconnectedCallback` na frontendu.

## [0.1.195] - 2026-08-06

### Opraveno – aktualizace integrace již nevyžaduje restart celého hostitele Home Assistant
- Nalezena a opravena přesná příčina, proč bylo po každém stáhnutí aktualizace v HACS nutné provést plný restart hostitele (`ha host restart`): volání `frontend.add_extra_js_url` v Home Assistantu vrství skripty starých i nových verzí v `frontend_extra_module_url`. Při dalším načtení UI se tak prohlížeč dotazoval na staré verze cesta `/dratek_eink_panel/0.1.193/...`, které po přepsání souborů vracely HTTP 404 a zamrzly načítání Lovelace.
- `_async_register_panel` nyní před přidáním nového skriptu automaticky promaže všechny neaktuální URL z `frontend_extra_module_url` / `frontend_extra_js_url`. Po aktualizaci v HACS a restartu Home Assistant Core (nebo znovunačtení integrace) se frontend načte okamžitě bez nutnosti restartovat celý počítač / hostitel.

## [0.1.194] - 2026-08-06

### Opraveno – uvíznutí Bluetooth notifikací a zaciklení nahrávání do displejů
- Všechna volání notifikací (`start_notify`) v BLE přenosu jsou nyní zabezpečena blokem `try ... finally`, takže při chybě, stornu nebo timeoutu nezůstávají v Bluetooth stacku (BlueZ / DBus) visící notifikace ucpávající spojovací sloty.
- Odstup mezi odpojením a novým připojením k témuž displeji byl navýšen na 3,0 s pro spolehlivé uvolnění vnitřního BLE serveru na displeji.
- Opravena retransmisní logika v `streaming_mode` při vyžádání chybějícího bloku displejem (promazání stavu již poslaných bloků nad vyžádaným indexem).
- Ochrana v `automation.py` před hromaděním požadavků v obnovovací smyčce u pomalých nebo přerušených uploadů.

## [0.1.193] - 2026-08-06

### Opraveno – automatická aktualizace skutečně odpovídá ručnímu odeslání
- Nalezena skutečná příčina, proč se automaticky aktualizovaný obrázek vůbec nepodobal ručně odeslanému: automatika dosud "záplatovala" jen samotný text přes uložený obrázek a hádala barvu pozadí za ním (bílá, nebo barva nejbližšího nalezeného obdélníku). Pokud hodnota seděla na ikoně, přechodu barev nebo obrázku na pozadí, automatika ji přemalovala neprůhledným barevným blokem.
- Automatická aktualizace nyní znovu použije **celý** SVG obrázek šablony zachycený při posledním ručním odeslání (včetně veškeré grafiky) a dosadí do něj jen aktuální hodnoty. Výsledek je pixelově shodný s ručním odesláním, ne přibližný odhad.
- Pokud vykreslovací knihovna chybí nebo šablona nemá zachycený podklad (starší konfigurace), automatika bezpečně spadne zpět na předchozí přiblížení, nikdy ne na chybějící hodnotu.

### Vylepšeno – zmírnění zpomalení po několika nahráních za sebou
- Mezi odpojením od displeje a dalším připojením ke stejnému displeji je nyní vynucená krátká prodleva. Levný displej může být uprostřed vlastního odpojování, když na něj hned dorazí další pokus o připojení – to se dřív mohlo projevit jako postupné zpomalování po několika nahráních rychle za sebou. Jiné displeje a gateway přenosy tato prodleva nijak neovlivňuje.

## [0.1.192] - 2026-08-06

### Opraveno – nahrávání do displeje se postupně zpomalovalo
- Nalezena a opravena příčina, proč nahrávání po delším běhu Home Assistantu (hodiny až dny) postupně zpomalovalo z jednotek sekund až na plné 10minutové bezpečnostní omezení: když ruční odeslání převzalo přednost před běžící automatickou aktualizací, přerušený přenos nestihl řádně odpojit Bluetooth spojení – zůstalo "napůl otevřené" a zabralo displeji nebo adaptéru spojovací slot navždy.
- Odpojení od displeje je nyní chráněné i před přerušením běžícího přenosu, takže Bluetooth spojení se vždy korektně uzavře – ať už ho přeruší ruční odeslání, nebo restart/aktualizace Home Assistantu. Nové spojovací sloty se tak přestanou postupně "ucpávat".

## [0.1.191] - 2026-08-06

### Opraveno – automatická aktualizace šablon 1:1 s ručním odesláním
- Automatická aktualizace textu v šablonách nyní vykresluje stejné SVG jako ruční odeslání a rasterizuje ho na pozadí (resvg) přibaleným fontem Arimo. Text má stejnou velikost, tučnost i polohu jako při ručním odeslání – zmizelo nafouknuté a posunuté písmo z dřívějšího přerenderování přes PIL.
- Každý slot si při automatické aktualizaci překreslí vlastní pozadí, takže předchozí hodnota zapečená do obrázku je vždy překryta.
- Kde rasterizér není k dispozici (např. 32bitové ARM), spadne vykreslení automaticky zpět na PIL bez nafukování textu – instalace se nikdy nezablokuje.
- Opraveno vynechávání hodnot: sloty šablony, které přeformátovaly interní značku (čísla, prázdné hodnoty, zkrácení), se dříve vůbec nenapojily na automatickou aktualizaci. Nově se slot pozná podle změny obsahu, takže žádná hodnota nevypadne.

## [0.1.190] - 2026-08-05

### Opraveno – smyčka automatických zápisů
- Přeskočený nebo sloučený automatický zápis už znovu nenastavuje vlastní příznak čekající aktualizace, takže během dlouhého uploadu nevznikají nové položky fronty v nekonečné smyčce.
- Backend omezuje také staré uložené jednosekundové konfigurace na minimálně 30 sekund; výchozí bezpečný interval je 60 sekund.
- Předpřipravené šablony ukládají uživatelem nastavený interval v rozsahu 30 sekund až 24 hodin namísto pevné jedné sekundy.
- Změny entit během probíhajícího zápisu zůstávají sloučené a ruční upload po dokončení vyžádá jedinou kontrolní aktualizaci.

## [0.1.189] - 2026-08-05

### Opraveno – potvrzovaný přenos a jednodenní spotový graf
- Streamovací displeje čekají po každém obrazovém bloku na potvrzený GATT response. Starší protokol dál postupuje až po blokové notifikaci displeje.
- Home Assistant ani gateway už nepoužívají pevně zpožděný nepotvrzovaný stream, který mohl zahltit řadič displeje a ztratit část obrazu.
- Gateway firmware 0.1.50 používá potvrzované řízení toku na ESP32 i ESP32-S3 a nepodporovaný nebezpečný režim odmítne.
- Šablona českých spotových cen rozpozná interval podle rozestupu časových bodů. Pro 60 minut vykreslí dnešních 24 hodnot, pro 15 minut dnešních 96 hodnot, bez připojeného zítřka.
- Pořadí ceny se zobrazuje vůči správnému počtu intervalů i tehdy, když atributy senzoru obsahují dnešek a zítřek současně.

## [0.1.188] - 2026-08-05

### Opraveno – spotové ceny, čitelnost a rychlost přenosu
- Automatické vazby šablony českých spotových cen rozpoznají oficiální ID entit i jejich české názvy a obnoví neplatné dříve uložené vazby.
- Graf používá seřazené časové atributy aktuálního dne pro hodinová i čtvrthodinová data; pořadí ceny se zobrazuje vůči 24 nebo 96 intervalům.
- Přenos z Home Assistantu a gateway opět používá rychlou BLE cestu s odpovídajícím řízením toku. Součástí vydání je gateway firmware 0.1.49 pro ESP32 a ESP32-S3.
- Minimální velikosti textů a čísel v šablonách a grafech byly upraveny pro čitelnost bez zbytečně tučného písma.

## [0.1.183] - 2026-08-04

### Vylepšeno – zamčený designer a datové prvky
- Horní lišta eInk Studia, levá paleta nástrojů a náhled displeje zůstávají při posouvání stránky na místě; pravý panel nastavení lze dál samostatně posouvat.
- Grafy, ukazatele, průběhy a signalizace lze napojit na entity Home Assistantu. Graf uchovává 1 až 20 posledních hodnot, podporuje časové vzorkování a automatické mazání historie.
- Prvky vlastních šablon používají pouze černou, červenou a bílou barvu.

## [0.1.182] - 2026-08-03

### Vylepšeno – šablony, náhledy a gateway fronta
- Fronta zápisu nyní průběžně zobrazuje také jednotlivé kroky nahrávání přes gateway, včetně automatických aktualizací.
- Kliknutí na vlastní prázdnou šablonu otevře designer bez jediného objektu a bez obsahu předchozího návrhu.
- Integrace si po úspěšném zápisu trvale pamatuje, která šablona je skutečně na displeji. Její karta je celá zeleně zvýrazněná; pouhá změna výběru v editoru tento stav nepřepíše.
- Karty displejů na hlavní stránce se při najetí myší zvýrazní modře místo zeleně.

## [0.1.181] - 2026-08-03

### Opraveno – návrat ke spolehlivému přenosu
- Experimentální rychlé cesty z verzí 0.1.177 až 0.1.180 mohly na počítačovém BlueZ předat obraz pouze lokální frontě nebo socketu a přesto ohlásit úspěch, zatímco displej neobdržel poslední či žádný blok a nepřekreslil se. Tyto cesty byly odstraněny.
- Streamující displeje nyní znovu používají potvrzovaný GATT zápis pro každý obrazový blok. Je to pomalejší, ale jde o jediný režim, u kterého protokol na dotčeném adaptéru prokázal převzetí všech bloků displejem. Bez fyzického ověření už integrace rychlou neřízenou cestu nepoužije.

## [0.1.180] - 2026-08-03

### Opraveno a zrychleno
- Běžné volání Bleaku `write_gatt_char(..., response=False)` mohlo přes D-Bus přijmout všech 40 nebo 125 bloků do lokální fronty BlueZ, aniž je Bluetooth adaptér skutečně odvysílal. Integrace pak nesprávně hlásila dokončený přenos, ale displej nepřekreslil obraz.
- Streamující displeje na Linuxu nyní používají rozhraní BlueZ `AcquireWrite`. Každý celý 244bajtový blok se zapisuje do samostatně získaného GATT socketu, který poskytuje zpětný tlak kernelu bez pomalého ATT potvrzení každého bloku. Tím se zachová rychlost i fyzické předání posledního bloku.
- Pokud `AcquireWrite` na konkrétní kombinaci BlueZ a adaptéru selže, další pokus automaticky použije pomalejší potvrzované zápisy; přenos tedy nebude označen jako úspěšný pouze na základě lokální D-Bus fronty.

## [0.1.179] - 2026-08-03

### Opraveno a zrychleno
- Přímý Bluetooth přenos už uvnitř jednoho obrazu nestřídá nepotvrzované GATT příkazy s potvrzovanými GATT požadavky. Na některých BlueZ adaptérech právě první změna režimu po osmi blocích timeoutovala, takže verze 0.1.178 spadla do velmi pomalého potvrzování každého bloku.
- Streamující displej nyní dostává všechny obrazové bloky, včetně rozhodujícího posledního bloku, jako jeden rovnoměrně tempovaný proud `write-without-response`. Po odeslání zůstává Bluetooth spojení otevřené až 10 sekund pro odtečení fronty a volitelné potvrzení překreslení. Potvrzovaný režim zůstává zachovaný pro charakteristiky, které rychlý způsob zápisu nenabízejí.

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
