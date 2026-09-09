# Ověření flashování 1.0.2 — 2026-09-09

- PlatformIO: esp32dev i esp32-s3-devkitc-1 sestaveny úspěšně; binární obrazy 0.1.66-gateway zahrnuty v integraci.
- Fyzická deska: ESP32-D0WD-V3, CH9102, COM9. Volána stejná funkce `_flash_gateway_sync`, kterou používá Home Assistant, s testovacím SSID Dratek-Flash-Test.
- Dva úplné zápisy. Po prvním zpětně přečtena verze 0.1.66-gateway, uložené SSID a hostname. Druhý vrátil `ok=true`, čtyři kontroly „Hash of data verified“ a strukturované potvrzení `wifi_config_saved`.
- Samostatné opakované předání stejných Wi-Fi údajů vrátilo potvrzení při prvním pokusu.
- Při úvodní identifikaci čipu se jednou objevil „Write timeout“ během nahrávání stubu; identifikace pomocí ROM loaderu následně uspěla. Zápis nyní při této třídě chyby jednou opakuje přenos přes ROM pomaleji.
- 17 testů backendu: profily a offsety, jedno spojení, chyba esptoolu, omezený retry, souběh na portu, skutečný timeout tichého podprocesu, opětovné otevření USB, rozdělená odpověď, odmítnutí falešného potvrzení a maskování hesla.
- Node: vykreslení instalace bez počítačové cesty, dostupnost tlačítka podle portu/SSID a samostatná chyba Wi-Fi po úspěšném flashování.
- Kompletní sada: 1034 testů. Tři stávající neúspěšné kontroly mimo flashování (celé pixely čárového kódu a dvě varianty SVG ciferníku) reprodukovány na nezměněném HEAD 05c728e. Kontrola verzí opravena a znovu spuštěna samostatně.

## Meze ověření

Test proběhl na Windows pomocí stejného backendu, nikoli přímo v běžícím Home Assistantu. ESP32-S3 nebyla fyzicky připojena. Testovací SSID není dostupná síť, takže bylo ověřeno nahrání a uložení údajů, ne připojení k přístupovému bodu. Testovací ESP zůstala s uvedeným SSID; skutečné údaje lze nastavit tlačítkem Jen Wi-Fi.
