# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [1.0.2-beta.1] - 2026-09-10

Předběžné vydání (pre-release). Obsahem je totožné s 1.0.1 — jediný rozdíl je jedna věc:

### Přidáno

- **Firemní šablona DRÁTEK je v katalogu k dispozici**, včetně dlaždice „Odeslat na všechny displeje". Ve stabilním 1.0.1 se nenabízí.

Nic jiného se neliší. Ostatní opravy a firmware 0.1.76 jsou v obou vydáních stejné.

## [1.0.1] - 2026-09-10

Jedno vydání se všemi dosavadními opravami. Starší dílčí verze byly sloučeny sem a jejich popisy zůstaly beze změny.

**Firemní šablona DRÁTEK se v tomto vydání nenabízí** — je v předběžném vydání (pre-release). Displeje, které ji už mají nastavenou, se dál vykreslují normálně.

### Fronta se vrací k nezdařeným displejům, a gateway pozná, že je hluchá

#### Co selže, vrátí se samo na konec fronty — a gateway pozná, že je hluchá

Nejdřív měření z vašeho běhu na 1.0.6 (100 displejů): **67 uspělo, 33 selhalo**, a práce se konečně rozdělila mezi všechny čtyři gatewaje (34 / 33 / 16 / 15) — přes Home Assistant šly už jen 2. Směrování z 1.0.6 tedy funguje.

Jenže **28 z těch 33 chyb byla jedna a ta samá věc**: `Cannot connect to host 192.168.1.188:80`. Gatewaje během běhu vypadávají ze sítě.

#### Přidáno a vylepšeno

- **Hromadná šablona si nezdařené displeje sama zařadí znovu na konec fronty.** Až třikrát. Na regálu o sto displejích je selhání kvůli krátkému výpadku rádia normální jev, ne výjimka — a hledat potom ve stovce řádků těch pár, co nedojely, je nepoužitelné.

  Na **konec** fronty, ne na začátek, a to je celý smysl: displej, který právě selhal, má ze všech nejmenší šanci uspět hned teď — jeho rádio je zaneprázdněné, gateway couvá po chybě, nebo se panel ještě překresluje. Až se mezitím zapíše zbytek regálu, všechny tři důvody pominou. A hlavně: jeden nedosažitelný displej tím nikdy nezablokuje frontu za sebou.

  Řádek ve frontě se označí jako „2. pokus", aby nevypadal jako duplikát.

#### Opraveno

- **Firmware 0.1.76: gateway si už neplete „jsem připojená" s „jde to ke mně".**

  Měřeno na regálu, okno 25 minut, čtyři gatewaje: **20 samostatných výpadků, 8 až 441 sekund dlouhých**, dohromady víc nedostupného času než kolik trvalo celé okno. A u většiny z nich si toho deska vůbec nevšimla — `uptime` běžel dál a `wifi_disconnect_count` se nepohnul, takže `WiFi.status()` po celou dobu hlásil `WL_CONNECTED`, zatímco se k desce nedostal ani ping, ani HTTP.

  Ve firmwaru nebylo nic, co by tenhle stav mohlo vidět, natož z něj odejít — `maintainNetworkServices()` se ptal jen `WiFi.status()`. Deska tedy seděla v přesvědčení, že je na síti, dokud to o minuty později nespravil někdo jiný.

  Nově se spojení **ověřuje, ne věří**: každých 20 sekund malý DNS dotaz na router. Tři ticha po sobě (tedy asi minuta skutečného mlčení) a asociace se zbourá a postaví znovu — `WiFi.reconnect()` na tohle nestačí, protože deska si myslí, že už připojená je. Během přenosu nebo OTA se neprobuje vůbec, aby to nesoupeřilo s BLE o rádio.

- **Gateway hlásí, na kterém AP a kanálu vlastně visí** (`wifi_bssid`, `wifi_channel`), plus počet vynucených obnov spojení. Když zmlkne všechno naráz, tohle je to, co odliší jedno zlobící AP od čtyř desek selhávajících nezávisle. U vás už to jednu věc ukázalo: všechny čtyři gatewaje nevisí na routeru `192.168.1.1`, ale na přístupovém bodě `74:4D:28:85:7C:BE` (`192.168.1.254`) na kanálu 5.

**Aktualizujte gatewaje na 0.1.76.** 0.1.74 stále nepoužívejte.

### Jedna ztracená odpověď už neznamená, že gateway zmizí

#### Jedna ztracená odpověď už neznamená, že gateway zmizí

Tohle je oprava toho, proč vám gatewaje vypadávaly z nabídky a proč regál zapisovala jen Home Assistant, i když všechny čtyři gatewaje fungovaly.

Nejdřív co se změřilo na vašem regálu. Všechny čtyři gatewaje na 0.1.75 odpovídají za 0,1–0,5 s a jejich sken se vrací celý. Když se na ně nepřetržitě pinguje a nic jiného se nedělá, neztratí se ani jeden paket za 25 sekund. Ale ve chvíli, kdy se všechny čtyři skenují **současně** — což integrace dělala každých 30 sekund — se ztratí právě jeden paket na **každé z nich, v tu samou sekundu**.

Ty ztráty tedy nejsou nezávislé. Gatewaje stojí na jednom regálu, dělí se o jedno pásmo 2,4 GHz mezi sebou i se stovkou displejů, které skenují, a každý ESP32 má jediné rádio pro Wi-Fi i pro BLE. Ztráty proto přicházejí pohromadě, na všech gatewayích zároveň, a přicházejí přesně tehdy, když integrace sama pošle všechna rádia do práce.

Dvě místa v kódu z toho udělala nahlášený problém:

**Jedna pomalá odpověď smazala všechny cesty a i pamět na ně.** Seznam gatewayí se načítal uvnitř stejného časového limitu jako skeny, a když limit vypršel, seznam se vyprázdnil. To vypadá jako malá škoda, ale není: přes tento seznam se dohledávají **obě** záložní cesty — třicetiminutová paměť z vyhledávání i dříve potvrzené cesty. Jeden pomalý sken tak vypnul právě ty dva mechanismy, které mají vynechaný sken zakrýt, takže nezůstala žádná cesta přes gateway — a konec toho bloku pak tímto prázdnem přepsal i cache, která si cesty pamatovala.

To není zakolísání, to je západka. Všechno spadlo na vlastní Bluetooth adaptér Home Assistanta a zůstalo tam, dokud neproběhl čistý sken **všech** gatewayí. Se čtyřmi gatewayemi v jednom pásmu se stovkou displejů se na to čeká dlouho. Proto regál zapisovala jen HA.

**A jeden neúspěšný dotaz stačil na to označit gateway za offline.** Jednou za 30 sekund, jediným požadavkem — tedy přesně tím požadavkem, který se nejspíš ztratí.

#### Opraveno

- **Seznam gatewayí přežije neúspěšný sken.** Načítá se zvlášť a mimo časový limit skenů, takže obě záložní cesty mají pořád k čemu se dohledat.
- **Každý sken má vlastní strop.** Jedna zaseknutá gateway přijde jen o svůj výsledek; ostatní si své cesty ponechají. Dřív jeden společný limit zrušil i skeny gatewayí, které už dávno odpověděly.
- **Skeny se rozprostřou v čase.** Gatewaje se už nespouští v jeden okamžik, takže si navzájem neberou pásmo — a hlavně nezhasnou všechny naráz.
- **Neúspěšný dotaz se zopakuje.** Až gateway neodpoví dvakrát, teprve pak se řeší jako nedostupná. Stojí to jeden požadavek a jen tam, kde už něco selhalo; vyhledávání přes mDNS zůstává jako druhá linie pro gateway, která se opravdu přestěhovala.

Bez změny firmwaru — 0.1.75 zůstává aktuální. **0.1.74 nepoužívejte.**

### Gatewaye zase slyší displeje

#### Gatewaye zase slyší displeje — ověřeno na hardwaru

**Firmware 0.1.74 nepoužívejte.** Byla to moje chybná oprava a rozbila sken víc, než byl rozbitý předtím. Přeskočte ji na **0.1.75**.

Sken odpovídá tak, že se JSON posílá přes web server po malých kouscích. Dvě předchozí odpovědi byly špatné:
- Sestavení celého těla do jednoho `String` potřebuje souvislý blok asi dvojnásobku délky. Tyto gatewaje mají největší volný blok okolo 8 kB, takže sken slyšící regál byl mlčky odseknutý v půlce textu a integrace ho nepřečetla vůbec.
- Serializace přímo do `server.client()` sice vyrovnávací paměť odstranila, ale zapisovala do surového neblokujícího socketu. ArduinoJson posílá po drobných kouscích a každý zápis do plného socketu vrátil `EAGAIN` — `[E][WiFiClient.cpp:429] write(): fail on fd 49, errno: 11`. Tělo odešlo krátké nebo vůbec. Odtud „gatewaye nevidí displeje a odpojují se".

`sendContent` je kód, který se socketem umí pracovat. Plněný z 512bajtové vyrovnávací paměti nepotřebuje velkou alokaci ani žádné opakování, při jakékoli délce odpovědi.

Změřeno na gatewayi po nahrání 0.1.75:

```
http 200   10234 B   8,3 s
device_count: 90 | dorazilo: 90 | shoda: ANO
z toho DRATEK: 88 displejů
```

Dva a půl násobek starého 4kB stropu, kompletní a parsovatelné. Tatáž gateway předtím nabízela **nula** tras.

### „Gateway is busy" už aktualizaci neodmítne

#### „Gateway is busy" už aktualizaci neodmítne
`busy` neznamenalo, že gateway něco dělá – znamenalo, že **tahle integrace drží její HTTP zámek**. A předchozí zaseknuté nahrávání ho drželo celých 300 sekund, takže druhý pokus dostal „gateway je zaneprázdněná", zatímco ta krabička odpovídala na `/api/status` za desetinu sekundy. Aktualizace pak odmítla začít, což je to jediné, co dělat nesmí – nahrávání si ten zámek vezme stejně a klidně počká ve řadě.

- Sonda před aktualizací je tam jen kvůli zjištění typu čipu. Když se nedostane ke slovu, použije se **typ čipu z posledního úspěšného dotazu** a aktualizace pokračuje. Obraz se proti němu pořád kontroluje a firmware 0.1.70 a novější si cizí obraz odmítne sám, ještě než zapíše bajt – ta pojistka na téhle sondě nestojí.
- Limit nahrávání snížen z **300 na 90 sekund**. Funkční nahrávání proběhne v řádu sekund (ověřeno na železe, celých 1,1 MB napoprvé). Ten dlouhý limit jsem zvolil, když jsem ještě mylně podezříval propustnost, a jediné, co určoval, bylo jak dlouho si rozbitý pokus drží gateway jako rukojmí.

### Proč tři gatewaye „neslyšely" nic

#### Proč tři gatewaye „neslyšely" nic
Mapa připojení to ukázala naostro: 35 displejů na Bluetooth Home Assistantu, 66 na jedné gatewayi a **nula na třech ostatních**, přesto že stojí vedle sebe. Nebyla to chyba směrování – integrace si opravdu myslela, že neslyší nic.

Gateway staví odpověď na `/api/scan` do jednoho `String` v paměti. Ten potřebuje souvislý blok přibližně dvojnásobku své délky, a tyto gatewaje běží s největším volným blokem okolo 8 kB, jakmile si BLE a odložený obraz vezmou své. Sken, který slyší regál displejů, se serializuje na víc než 4 kB – `String` se nedokáže zvětšit, Arduino ho mlčky odsekne, a co odejde na síť je platný JSON přeseknutý v půlce textu. Změřeno přímo: odpověď 4123 bajtů končící `Unterminated string`.

Integrace takový sken nepřečte, vyhodnotí ho jako selhaný a **ta gateway nenabídne žádnou trasu**. Gateway zmizela ze směrování *právě proto*, že slyší hodně displejů.

- Firmware **0.1.74-gateway** posílá JSON přímo do socketu místo do vyrovnávací paměti. Žádný souvislý blok už není potřeba, při jakékoli délce.
- Odpověď navíc uvádí `device_count`, takže odseknutá odpověď je rozeznatelná od tiché sítě.
- Integrace nečitelný sken **nahlásí do logu** místo aby ho spolkla. Dosud to bylo to nejtišší možné selhání.

#### Fronta
- **Zařazená úloha už netvrdí, že má trasu.** Trasa u zařazení je jen záloha pro případ, že se výběr nepovede, a zástupný klíč zámku – skutečná volba padne až při zápisu. Řádek fronty teď říká „Trasa se určí při zápisu", dokud opravdu nezačne zapisovat.

### Fronta rozhoduje o trase až když na zápis dojde řada

#### Fronta rozhoduje o trase až když na zápis dojde řada
- Dosud se rádio vybralo ve chvíli zařazení do fronty. Hromadné odeslání zařadí stovku displejů během několika sekund, takže se celý regál rozdal z jednoho snímku toho, která gateway zrovna vypadala volně – a nic pozdějšího už úlohu nepřesunulo na rádio, které se mezitím uvolnilo. Gateway stojící přímo u displejů tak mohla celý běh prostát.
- Nově se trasa volí až při spuštění přenosu: zeptej se, co je nejlepší *teď*, vezmi to rádio pokud je volné, jinak počkej, až se nějaké vrátí, a zeptej se znovu. Čekající úloha z toho těží automaticky – její další pokus je běžné spuštění, takže displej, který byl při zařazení mimo dosah a probudí se u gatewaye, zapíše ta gateway.

#### Hromadné odeslání
- **Před odesláním proběhne sken a počká se na něj.** Panel staví seznam displejů z živých BLE advertisementů, takže čerstvě otevřený jich zná pár – proto první kliknutí odeslalo na jeden displej, druhé na hrstku a teprve čtvrté na celý regál.
- **Panel už neproklikává displeje.** `_device()` odpovídá podle displeje, který se zrovna vykresluje, takže každé překreslení na pozadí – dotaz fronty, dotaz stavu – vykreslilo celý panel jako *ten* displej. Během hromadné akce se překreslování na pozadí odloží a průběh se ukazuje nejvýš dvakrát za sekundu.
- Velké a na výšku otočené displeje dostávají zpět celé logo i s obrázkem displeje, malé samotný nápis. Žlutý pruh dole na čtyřbarevných zůstává oběma.

#### Fronta zápisu
- **Úspěch, který displej nepotvrdil, je jako takový označený.** V měřeném běhu skončilo 70 zápisů s potvrzením displeje a 23 bez něj – všech 23 přes Bluetooth Home Assistantu, kde se na potvrzovací paket čeká jen krátce. Ty se nemusely na displeji projevit, a fronta je přesto hlásila jako hotové.
- **Dvě gatewaje se stejným názvem jsou v řádku fronty rozlišené adresou.** Zámky byly celou dobu správné – dvě různé krabičky, každá svůj – ale ve frontě se obě jmenovaly stejně, takže to vypadalo jako jedno rádio zapisující dva displeje naráz.

### První vydání řady 1.0

Integrace pro Home Assistant k displejům DRATEK eInk přes Bluetooth a ESP32 Wi-Fi gatewaye.

#### Displeje a šablony
- Katalog šablon s vlastním editorem, vazbami na entity Home Assistantu a automatickou aktualizací po změně hodnoty nebo v intervalu.
- Firemní šablony **Logo Drátek** (hromadné odeslání na všechny známé displeje) a **DRÁTEK.CZ** (nápis přes celý displej, na čtyřbarevných se žlutým pruhem dole).
- Nahrání vlastního obrázku s převodem do palety e-papíru, částečné překreslení oblasti, meteoradar, ceny elektřiny, kalendář, odjezdy spojů a další.

#### Fronta zápisu
- Každý zápis je úloha ve frontě. Fronta je serializuje podle rádia, rozděluje zátěž mezi všechny dostupné gatewaye podle délky jejich fronty a drží úlohu pro nedosažitelný displej až 24 hodin – před každým dalším pokusem si znovu vyžádá trasu.
- Ověřeno na regálu se **101 displeji**: 99 úspěšných zápisů rozdělených mezi tři gatewaye a místní Bluetooth.

#### Gatewaye
- Vyhledávání přes mDNS, stav, diagnostika, nahrání firmwaru přes USB i OTA.
- Každý HTTP požadavek na gateway drží zámek dané krabičky – ESP32 obsluhuje jedno spojení naráz a souběžné dotazy ho umlčí.
- OTA aktualizace kontroluje typ čipu v hlavičce obrazu proti čipu, který cíl hlásí, a to na obou stranách. Firmware **0.1.73-gateway**.

#### Poznámka k aktualizaci gatewayí
Gatewaye s firmwarem starším než 0.1.71 potřebují **jednorázové nahrání přes USB kabel**. OTA na nich fungovat nemůže – oprava, která ho zprovozní, je právě v tom firmwaru. Od 0.1.73 dál už OTA funguje, ověřeno na skutečném zařízení.
