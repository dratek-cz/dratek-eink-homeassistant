# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

## [1.0.2] - 2026-09-10

### Fronta rozhoduje o trase až když na zápis dojde řada
- Dosud se rádio vybralo ve chvíli zařazení do fronty. Hromadné odeslání zařadí stovku displejů během několika sekund, takže se celý regál rozdal z jednoho snímku toho, která gateway zrovna vypadala volně – a nic pozdějšího už úlohu nepřesunulo na rádio, které se mezitím uvolnilo. Gateway stojící přímo u displejů tak mohla celý běh prostát.
- Nově se trasa volí až při spuštění přenosu: zeptej se, co je nejlepší *teď*, vezmi to rádio pokud je volné, jinak počkej, až se nějaké vrátí, a zeptej se znovu. Čekající úloha z toho těží automaticky – její další pokus je běžné spuštění, takže displej, který byl při zařazení mimo dosah a probudí se u gatewaye, zapíše ta gateway.

### Hromadné odeslání
- **Před odesláním proběhne sken a počká se na něj.** Panel staví seznam displejů z živých BLE advertisementů, takže čerstvě otevřený jich zná pár – proto první kliknutí odeslalo na jeden displej, druhé na hrstku a teprve čtvrté na celý regál.
- **Panel už neproklikává displeje.** `_device()` odpovídá podle displeje, který se zrovna vykresluje, takže každé překreslení na pozadí – dotaz fronty, dotaz stavu – vykreslilo celý panel jako *ten* displej. Během hromadné akce se překreslování na pozadí odloží a průběh se ukazuje nejvýš dvakrát za sekundu.
- Velké a na výšku otočené displeje dostávají zpět celé logo i s obrázkem displeje, malé samotný nápis. Žlutý pruh dole na čtyřbarevných zůstává oběma.

### Fronta zápisu
- **Úspěch, který displej nepotvrdil, je jako takový označený.** V měřeném běhu skončilo 70 zápisů s potvrzením displeje a 23 bez něj – všech 23 přes Bluetooth Home Assistantu, kde se na potvrzovací paket čeká jen krátce. Ty se nemusely na displeji projevit, a fronta je přesto hlásila jako hotové.
- **Dvě gatewaje se stejným názvem jsou v řádku fronty rozlišené adresou.** Zámky byly celou dobu správné – dvě různé krabičky, každá svůj – ale ve frontě se obě jmenovaly stejně, takže to vypadalo jako jedno rádio zapisující dva displeje naráz.

## [1.0.1] - 2026-09-10

Integrace pro Home Assistant k displejům DRATEK eInk přes Bluetooth a ESP32 Wi-Fi gatewaye.

### Displeje a šablony
- Katalog šablon s vlastním editorem, vazbami na entity Home Assistantu a automatickou aktualizací po změně hodnoty nebo v intervalu.
- Firemní šablony **Logo Drátek** (hromadné odeslání na všechny známé displeje) a **DRÁTEK.CZ** (nápis přes celý displej, na čtyřbarevných se žlutým pruhem dole).
- Nahrání vlastního obrázku s převodem do palety e-papíru, částečné překreslení oblasti, meteoradar, ceny elektřiny, kalendář, odjezdy spojů a další.

### Fronta zápisu
- Každý zápis je úloha ve frontě. Fronta je serializuje podle rádia, rozděluje zátěž mezi všechny dostupné gatewaye podle délky jejich fronty a drží úlohu pro nedosažitelný displej až 24 hodin – před každým dalším pokusem si znovu vyžádá trasu.
- Ověřeno na regálu se **101 displeji**: 99 úspěšných zápisů rozdělených mezi tři gatewaye a místní Bluetooth.

### Gatewaye
- Vyhledávání přes mDNS, stav, diagnostika, nahrání firmwaru přes USB i OTA.
- Každý HTTP požadavek na gateway drží zámek dané krabičky – ESP32 obsluhuje jedno spojení naráz a souběžné dotazy ho umlčí.
- OTA aktualizace kontroluje typ čipu v hlavičce obrazu proti čipu, který cíl hlásí, a to na obou stranách. Firmware **0.1.73-gateway**.

### Poznámka k aktualizaci gatewayí
Gatewaye s firmwarem starším než 0.1.71 potřebují **jednorázové nahrání přes USB kabel**. OTA na nich fungovat nemůže – oprava, která ho zprovozní, je právě v tom firmwaru. Od 0.1.73 dál už OTA funguje, ověřeno na skutečném zařízení.
