# Changelog – DRATEK eInk Home Assistant Integration

Všechny významné změny a historie verzí v projektu DRATEK eInk.

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
