from __future__ import annotations

from typing import Any

from homeassistant.components import bluetooth, websocket_api
from homeassistant.core import HomeAssistant, callback

from .discovery import parse_picksmart_advertisement
from .render import render_text_image
from .transfer import DratekTransfer


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_scan)
    websocket_api.async_register_command(hass, websocket_send_text)


@websocket_api.websocket_command({"type": "dratek_eink/scan"})
@websocket_api.async_response
async def websocket_scan(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    try:
        scanner_count = bluetooth.async_scanner_count(hass, connectable=True)
        service_infos = bluetooth.async_discovered_service_info(hass, connectable=True)
    except Exception as exc:  # noqa: BLE availability can differ by HA installation
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "scanner_count": 0,
                "ble_count": 0,
                "devices": [],
                "ble_devices": [],
                "debug": [f"Bluetooth scan failed: {exc}"],
            },
        )
        return

    devices = []
    ble_devices = []
    debug = [
        f"Bluetooth scanners detected: {scanner_count}",
        f"BLE advertisements currently cached by Home Assistant: {len(service_infos)}",
    ]

    for service_info in service_infos:
        address = getattr(service_info, "address", "")
        manufacturer_data = getattr(service_info, "manufacturer_data", {}) or {}
        service_uuids = getattr(service_info, "service_uuids", []) or []
        name = getattr(service_info, "name", "") or ""
        rssi = getattr(service_info, "rssi", None)

        ble_devices.append(
            {
                "address": address,
                "name": name,
                "rssi": rssi,
                "manufacturer_ids": [f"0x{int(key):04X}" for key in manufacturer_data],
                "service_uuids": list(service_uuids),
            }
        )

        device = parse_picksmart_advertisement(service_info)
        if device is None:
            continue

        devices.append(
            {
                "address": device.address,
                "name": device.name,
                "physical_code": device.physical_code,
                "rssi": device.rssi,
                "raw_type": device.raw_type,
                "sdk_type": device.sdk_type,
                "profile": f"0x{device.profile:02X}",
                "battery": device.battery,
                "sw": device.sw,
                "hw": device.hw,
                "model": device.model,
            }
        )

    devices.sort(key=lambda item: item["physical_code"])
    ble_devices.sort(key=lambda item: (item["name"] or "", item["address"]))

    if scanner_count == 0:
        debug.append("No active Bluetooth adapter or Bluetooth proxy was detected.")
    elif not devices:
        debug.append("Bluetooth works, but no DRATEK eInk advertisement was found.")
    else:
        debug.append(f"DRATEK eInk displays found: {len(devices)}")

    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "scanner_count": scanner_count,
            "ble_count": len(service_infos),
            "devices": devices,
            "ble_devices": ble_devices,
            "debug": debug,
        },
    )


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_text",
        "address": str,
        "sdk_type": int,
        "text": str,
    }
)
@websocket_api.async_response
async def websocket_send_text(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = msg["address"]
    sdk_type = msg["sdk_type"]
    text = msg["text"]
    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    try:
        log(f"Rendering text '{text}' for SDK type {sdk_type}.")
        image = await hass.async_add_executor_job(render_text_image, sdk_type, text, None, "black")
        transfer = DratekTransfer(log=log)
        await transfer.send_image(address, sdk_type, image)
    except Exception as exc:  # noqa: BLE stack can raise platform-specific exceptions
        log(f"Send failed: {exc}")
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": address,
                "text": text,
                "error": str(exc),
                "log": log_lines,
            },
        )
        return

    log("Text sent.")
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "address": address,
            "text": text,
            "log": log_lines,
        },
    )
