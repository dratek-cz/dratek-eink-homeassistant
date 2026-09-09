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


## USB instalace od integrace 1.0.2

V panelu vyberte **Nová gateway**, připojte desku přímo k zařízení s Home Assistantem,
vyberte správný port a typ ESP32 / ESP32-S3 a vyplňte Wi-Fi. Nahrávání přes
prohlížeč počítače bylo odstraněno. Firmware 0.1.68-gateway obsluhuje u S3
UART i nativní USB; klasická ESP32 používá UART.

Pokud je firmware nahraný, ale Wi-Fi nebyla potvrzena, nestartujte nový flash.
Stiskněte RESET bez BOOT a použijte **Jen Wi-Fi**. **Ověřit USB** vrátí verzi,
uložené SSID a stav připojení. Potvrzené uložení hesla samo o sobě nepotvrzuje
úspěšné přihlášení k přístupovému bodu.
