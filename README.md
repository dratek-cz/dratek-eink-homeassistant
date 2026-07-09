# DRATEK eInk pro Home Assistant

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

QR objekt používá vestavěný QR encoder pro běžné krátké texty a URL. EAN objekt odděluje čárový kód od čísla pod ním, aby text nezasahoval do čar.

## Debug Bluetoothu

Panel zobrazuje i obecná BLE zařízení, která Home Assistant zachytil. Díky tomu jde poznat rozdíl mezi těmito stavy:

- Home Assistant nemá žádný Bluetooth adaptér ani Bluetooth proxy.
- Bluetooth funguje, ale v dosahu není žádná DRATEK eInk cenovka.
- Bluetooth funguje a DRATEK eInk displeje jsou nalezené.

## Podporované displeje

Zatím jsou připraveny tyto typy:

- `75`: EPA LCD 400x300 BWR
- `296`: PE29R_V4_BLE 296x128 BWR
- `267`: EPA LCD 250x122 BWR

## Poznámky k dosahu

Home Assistant musí mít Bluetooth LE dosah k cenovce. Pokud běží na místě, odkud na displeje nedosáhne, bude potřeba použít Bluetooth proxy nebo později samostatnou síťovou bránu.

Integrace je zatím experimentální. Aktuální verze řeší instalaci přes HACS, panel v levém menu, vyhledání dostupných DRATEK eInk displejů a první verzi grafického editoru.

## Aktualizace

Od verze `0.0.6` budou změny vydávané jako verzované GitHub releases, aby HACS uměl nabídnout standardní aktualizaci.
