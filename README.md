# DRATEK eInk pro Home Assistant

Integrace pro Home Assistant, která umí vyhledat dostupné BLE eInk cenovky DRATEK/Picksmart a připravuje jejich ovládání přímo z Home Assistantu.

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

## Přidání displeje v Home Assistantu

1. Otevři `Settings`.
2. Otevři `Devices & services`.
3. Klikni na `Add integration`.
4. Vyhledej `DRATEK eInk`.
5. Klikni na integraci.
6. Home Assistant zkontroluje Bluetooth a nabídne dostupné DRATEK eInk displeje.
7. Vyber displej ze seznamu a potvrď přidání.

## Co má vyhledávání ukázat

Pokud je Bluetooth v pořádku a v dosahu jsou DRATEK eInk displeje, zobrazí se seznam zařízení. U každého zařízení je vidět:

- fyzický kód displeje, například `92.80.95.16`
- BLE adresa
- model displeje
- RSSI
- typ displeje podle SDK

Pokud Home Assistant najde Bluetooth adaptér nebo Bluetooth proxy, ale nenajde žádnou DRATEK eInk cenovku, zobrazí informaci, kolik obecných BLE zařízení v dosahu vidí. Díky tomu jde poznat, jestli samotné BLE skenování funguje.

Pokud Home Assistant nenajde žádný aktivní Bluetooth adaptér ani Bluetooth proxy, integrace zobrazí chybu, že Bluetooth není dostupné.

## Podporované displeje

Zatím jsou připraveny tyto typy:

- `75`: EPA LCD 400x300 BWR
- `267`: EPA LCD 250x122 BWR

## Poznámky k dosahu

Home Assistant musí mít Bluetooth LE dosah k cenovce. Pokud běží na místě, odkud na displeje nedosáhne, bude potřeba použít Bluetooth proxy nebo později samostatnou síťovou bránu.

Integrace je zatím experimentální. Aktuální verze řeší hlavně instalaci přes HACS a vyhledání dostupných DRATEK eInk displejů.
