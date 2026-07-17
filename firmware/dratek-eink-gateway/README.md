# DRATEK eInk Gateway firmware

Minimalni vlastni firmware pro ESP32 gateway.

Aktualni stav:

- pripojeni ESP32 do Wi-Fi
- HTTP status endpoint `GET /api/status`
- BLE scan endpoint `GET /api/scan?seconds=8`
- zakladni detekce DRATEK eInk reklam podle manufacturer id `0x5053`
- mDNS discovery sluzba `_dratek-eink-gateway._tcp.local`
- ulozeni Wi-Fi konfigurace do ESP32 NVS pameti pres USB serial
- asynchronni BLE prenos bitmapy pres `POST /api/transfer/upload`
- stav prenosove ulohy pres `GET /api/transfer/status`
- streamovana OTA aktualizace pres `POST /api/ota/upload`
- automaticke USB flashovani i OTA aktualizace z Home Assistant panelu
- dva OTA aplikacni sloty bez nepouzivaneho SPIFFS

## Nastaveni Wi-Fi

Firmware je univerzalni. Wi-Fi se nezapisuje do zdrojoveho kodu. Po flashi ceka ESP32 na JSON konfiguraci pres USB serial:

```json
{"ssid":"TvojeWifi","password":"TvojeHeslo","hostname":"dratek-eink-gateway"}
```

Home Assistant panel tuto konfiguraci posila automaticky po uspesnem flashi.

## Build targety

- `esp32dev` pro klasicke ESP32 / ESP32-WROOM
- `esp32-s3-devkitc-1` pro ESP32-S3
