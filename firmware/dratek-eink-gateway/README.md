# DRATEK eInk Gateway firmware

Minimalni vlastni firmware pro ESP32 gateway.

Aktualni stav:

- pripojeni ESP32 do Wi-Fi
- HTTP status endpoint `GET /api/status`
- BLE scan endpoint `GET /api/scan?seconds=8`
- zakladni detekce DRATEK eInk reklam podle manufacturer id `0x5053`

Pripravene dalsi kroky:

- endpoint `POST /api/send` pro prenos bitmapy do konkretni cenovky
- retry logika BLE prenosu
- OTA update
- automaticke flashovani z Home Assistant panelu

## Nastaveni Wi-Fi

Pro rychly vyvoj uprav `src/main.cpp`:

```cpp
static const char* WIFI_SSID = "TvojeWifi";
static const char* WIFI_PASSWORD = "TvojeHeslo";
```

Pozdeji bude Wi-Fi konfigurace doplnene primo do flashovaciho pruvodce v Home Assistant panelu.
