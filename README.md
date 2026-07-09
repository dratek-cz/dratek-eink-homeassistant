# DRATEK eInk pro Home Assistant

Minimalni experimentalni integrace pro Home Assistant, ktera umi poslat text na BLE eInk cenovky DRATEK/Picksmart.

Projekt je zatim prvni proof of concept. Cilem je pozdeji pridat automaticke vyhledavani displeju, sablony a editor grafiky primo pro Home Assistant.

## Instalace pres HACS

1. V Home Assistantu otevri `HACS`.
2. Vpravo nahore otevri menu se tremi teckami.
3. Zvol `Custom repositories`.
4. Do pole `Repository` vloz:

```text
https://github.com/dratek-cz/dratek-eink-homeassistant
```

5. Jako kategorii vyber `Integration`.
6. Potvrd pridani repozitare.
7. V HACS najdi `DRATEK eInk` a nainstaluj integraci.
8. Restartuj Home Assistant.

## Rucni instalace

Pokud nechces pouzit HACS, zkopiruj slozku:

```text
custom_components/dratek_eink
```

do konfigurace Home Assistantu sem:

```text
config/custom_components/dratek_eink
```

Potom restartuj Home Assistant.

## Zapnuti integrace

Do `configuration.yaml` pridej:

```yaml
dratek_eink:
```

Po ulozeni restartuj Home Assistant.

## Prvni test

V Home Assistantu otevri `Developer Tools` -> `Services` a zavolej sluzbu:

```yaml
service: dratek_eink.send_text
data:
  address: "FF:FF:94:20:10:78"
  sdk_type: 75
  text: "Hello from HA"
```

Parametry:

- `address`: BLE adresa cenovky.
- `sdk_type`: typ displeje podle SDK.
- `text`: text, ktery se ma zobrazit.

## Podporovane typy displeju

Zatim jsou pripraveny tyto typy:

- `75`: EPA LCD 400x300 BWR
- `267`: EPA LCD 250x122 BWR

## Poznamky

- Home Assistant musi bezet na zarizeni, ktere ma Bluetooth LE dosah k cenovce.
- Pokud Home Assistant bezi mimo dosah, bude pozdeji potreba resit Bluetooth proxy nebo sitovy gateway.
- Integrace je zatim experimentalni a slouzi hlavne pro overeni komunikace s displejem.
