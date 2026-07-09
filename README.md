# DRATEK eInk pro Home Assistant

Minimální experimentální integrace pro Home Assistant, která umí poslat text na BLE eInk cenovky DRATEK/Picksmart.

Projekt je zatím první proof of concept. Cílem je později přidat automatické vyhledávání displejů, šablony a editor grafiky přímo pro Home Assistant.

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
7. V HACS najdi `DRATEK eInk` a nainstaluj integraci.
8. Restartuj Home Assistant.

## Ruční instalace

Pokud nechceš použít HACS, zkopíruj složku:

```text
custom_components/dratek_eink
```

do konfigurace Home Assistantu sem:

```text
config/custom_components/dratek_eink
```

Potom restartuj Home Assistant.

## Zapnutí integrace

Do `configuration.yaml` přidej:

```yaml
dratek_eink:
```

Po uložení restartuj Home Assistant.

## Prvni test

V Home Assistantu otevři `Developer Tools` -> `Services` a zavolej službu:

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
- `text`: text, který se má zobrazit.

## Podporované typy displejů

Zatím jsou připraveny tyto typy:

- `75`: EPA LCD 400x300 BWR
- `267`: EPA LCD 250x122 BWR

## Poznámky

- Home Assistant musí běžet na zařízení, které má Bluetooth LE dosah k cenovce.
- Pokud Home Assistant běží mimo dosah, bude později potřeba řešit Bluetooth proxy nebo síťový gateway.
- Integrace je zatím experimentální a slouží hlavně pro ověření komunikace s displejem.
