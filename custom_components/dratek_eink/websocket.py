from __future__ import annotations

import base64
import asyncio
import io
import json
import time
import uuid
from typing import Any
from urllib.parse import urlparse

from homeassistant.components import bluetooth, websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from PIL import Image
import voluptuous as vol

from .automation import get_entity_auto_update_manager
from .const import GATEWAY_FIRMWARE_VERSION, PARTIAL_UPDATE_SDK_TYPES
from .discovery import parse_dratek_advertisement, parse_dratek_manufacturer_data
from .gateway import (
    async_add_gateway,
    async_delete_gateway,
    async_discover_gateways,
    async_flash_gateway,
    async_get_gateway_ota_job,
    async_get_flash_job,
    async_list_serial_ports,
    async_load_gateways,
    async_rename_gateway,
    async_refresh_all_gateways,
    async_refresh_gateway,
    async_scan_gateway,
    async_send_gateway_payload,
    async_serial_gateway_status,
    async_serial_gateway_wifi,
    async_start_flash_gateway,
    async_start_gateway_ota,
)
from .render import render_text_image
from .queue import get_transfer_queue
from .transfer import DratekTransfer

PROJECT_STORE_KEY = "dratek_eink.projects"
PROJECT_STORE_VERSION = 1
DISCOVERY_CACHE_KEY = "dratek_eink.discovery_cache"
DISCOVERY_GRACE_SECONDS = 5 * 60


def _battery_payload(device: Any) -> dict[str, Any]:
    """Expose raw voltage data and the CR2450 capacity estimate."""
    return {
        "battery": device.battery,
        "battery_raw": device.battery,
        "battery_voltage": device.battery_voltage,
        "battery_percent": device.battery_percent,
        "battery_estimated": True,
    }


async def _save_entity_automation(
    hass: HomeAssistant,
    msg: dict[str, Any],
    *,
    route_type: str,
    gateway_id: str = "",
    transport_name: str = "",
) -> None:
    if "automation" not in msg:
        return
    config = dict(msg.get("automation") or {})
    config.update(
        {
            "sdk_type": int(msg["sdk_type"]),
            "orientation": msg.get("orientation", "landscape"),
            "transform": msg.get("transform"),
            "route_type": route_type,
            "gateway_id": gateway_id,
            "transport_name": transport_name,
        }
    )
    await get_entity_auto_update_manager(hass).async_set_config(msg["address"], config)


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_scan)
    websocket_api.async_register_command(hass, websocket_send_text)
    websocket_api.async_register_command(hass, websocket_send_design)
    websocket_api.async_register_command(hass, websocket_send_partial_design)
    websocket_api.async_register_command(hass, websocket_set_rgb_led)
    websocket_api.async_register_command(hass, websocket_list_projects)
    websocket_api.async_register_command(hass, websocket_save_project)
    websocket_api.async_register_command(hass, websocket_load_project)
    websocket_api.async_register_command(hass, websocket_delete_project)
    websocket_api.async_register_command(hass, websocket_load_device_draft)
    websocket_api.async_register_command(hass, websocket_list_device_drafts)
    websocket_api.async_register_command(hass, websocket_save_device_draft)
    websocket_api.async_register_command(hass, websocket_list_custom_elements)
    websocket_api.async_register_command(hass, websocket_save_custom_element)
    websocket_api.async_register_command(hass, websocket_delete_custom_element)
    websocket_api.async_register_command(hass, websocket_set_device_name)
    websocket_api.async_register_command(hass, websocket_list_gateways)
    websocket_api.async_register_command(hass, websocket_add_gateway)
    websocket_api.async_register_command(hass, websocket_delete_gateway)
    websocket_api.async_register_command(hass, websocket_rename_gateway)
    websocket_api.async_register_command(hass, websocket_refresh_gateway)
    websocket_api.async_register_command(hass, websocket_scan_gateway)
    websocket_api.async_register_command(hass, websocket_send_gateway_design)
    websocket_api.async_register_command(hass, websocket_discover_gateways)
    websocket_api.async_register_command(hass, websocket_gateway_serial_ports)
    websocket_api.async_register_command(hass, websocket_flash_gateway)
    websocket_api.async_register_command(hass, websocket_start_flash_gateway)
    websocket_api.async_register_command(hass, websocket_flash_gateway_job)
    websocket_api.async_register_command(hass, websocket_gateway_serial_status)
    websocket_api.async_register_command(hass, websocket_gateway_serial_wifi)
    websocket_api.async_register_command(hass, websocket_start_gateway_ota)
    websocket_api.async_register_command(hass, websocket_gateway_ota_job)
    websocket_api.async_register_command(hass, websocket_transfer_queue)
    websocket_api.async_register_command(hass, websocket_clear_queue)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/set_rgb_led",
        "address": str,
        "mode": vol.All(int, vol.Range(min=0, max=2)),
        "flash_time": vol.All(int, vol.Range(min=0, max=255)),
        "red": vol.All(int, vol.Range(min=0, max=255)),
        "green": vol.All(int, vol.Range(min=0, max=255)),
        "blue": vol.All(int, vol.Range(min=0, max=255)),
    }
)
@websocket_api.async_response
async def websocket_set_rgb_led(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Control the RGB indicator LED over the display's local BLE connection."""
    address = msg["address"]

    async def run_transfer(add_log) -> dict[str, Any]:
        transfer = DratekTransfer(log=add_log, hass=hass)
        await transfer.set_rgb_led(
            address,
            msg["mode"],
            msg["flash_time"],
            msg["red"],
            msg["green"],
            msg["blue"],
        )
        return {"ok": True, "address": address, "log": []}

    try:
        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="rgb_led",
            runner=run_transfer,
        )
    except Exception as exc:  # noqa: BLE stack can raise platform-specific exceptions
        connection.send_result(
            msg["id"],
            {"ok": False, "address": address, "error": str(exc), "log": []},
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({"type": "dratek_eink/scan"})
@websocket_api.async_response
async def websocket_scan(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    local_scan_error = ""
    try:
        scanner_count = bluetooth.async_scanner_count(hass, connectable=True)
        service_infos = bluetooth.async_discovered_service_info(hass, connectable=True)
    except Exception as exc:  # noqa: BLE availability can differ by HA installation
        scanner_count = 0
        service_infos = []
        local_scan_error = str(exc)

    devices_by_address: dict[str, dict[str, Any]] = {}
    ble_devices = []
    debug = [
        f"Bluetooth scanners detected: {scanner_count}",
        f"BLE advertisements currently cached by Home Assistant: {len(service_infos)}",
    ]
    if local_scan_error:
        debug.append(f"Integrated Bluetooth scan failed: {local_scan_error}")

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

        device = parse_dratek_advertisement(service_info)
        if device is None:
            continue

        normalized_address = device.address.upper()
        devices_by_address[normalized_address] = {
                "address": device.address,
                "name": device.name,
                "physical_code": device.physical_code,
                "rssi": device.rssi,
                "raw_type": device.raw_type,
                "sdk_type": device.sdk_type,
                "profile": f"0x{device.profile:02X}",
                **_battery_payload(device),
                "sw": device.sw,
                "hw": device.hw,
                "model": device.model,
                "partial_update": device.sdk_type in PARTIAL_UPDATE_SDK_TYPES,
                "paths": [{
                    "type": "local",
                    "id": "local",
                    "name": "Home Assistant Bluetooth",
                    "rssi": device.rssi,
                }],
            }

    gateways = await async_load_gateways(hass)
    gateway_results = await asyncio.gather(
        *(async_scan_gateway(hass, gateway["id"], 5) for gateway in gateways),
        return_exceptions=True,
    )
    for gateway, scan_result in zip(gateways, gateway_results, strict=False):
        gateway_name = gateway.get("name") or "DRATEK eInk gateway"
        if isinstance(scan_result, Exception):
            debug.append(f"Gateway {gateway_name}: scan failed: {scan_result}")
            continue
        if not scan_result or not scan_result.get("ok"):
            debug.append(f"Gateway {gateway_name}: scan failed: {(scan_result or {}).get('error', 'offline')}")
            continue
        remote_devices = scan_result.get("devices", [])
        debug.append(f"Gateway {gateway_name}: {len(remote_devices)} BLE advertisements")
        for remote in remote_devices:
            if not remote.get("dratek"):
                continue
            address = str(remote.get("address") or "").upper()
            if not address:
                continue
            parsed = None
            manufacturer_hex = str(remote.get("manufacturer_data") or "")
            try:
                manufacturer = bytes.fromhex(manufacturer_hex)
                if len(manufacturer) >= 2 and int.from_bytes(manufacturer[:2], "little") == 0x5053:
                    manufacturer = manufacturer[2:]
                parsed = parse_dratek_manufacturer_data(
                    address, remote.get("name"), remote.get("rssi"), manufacturer
                )
            except ValueError:
                debug.append(f"Gateway {gateway_name}: invalid manufacturer data for {address}")

            path = {
                "type": "gateway",
                "id": gateway["id"],
                "name": gateway_name,
                "host": gateway.get("host"),
                "rssi": remote.get("rssi"),
            }
            existing = devices_by_address.get(address)
            if existing:
                existing["paths"].append(path)
                continue
            if parsed is None:
                continue
            devices_by_address[address] = {
                "address": parsed.address.upper(),
                "name": parsed.name,
                "physical_code": parsed.physical_code,
                "rssi": parsed.rssi,
                "raw_type": parsed.raw_type,
                "sdk_type": parsed.sdk_type,
                "profile": f"0x{parsed.profile:02X}",
                **_battery_payload(parsed),
                "sw": parsed.sw,
                "hw": parsed.hw,
                "model": parsed.model,
                "partial_update": parsed.sdk_type in PARTIAL_UPDATE_SDK_TYPES,
                "paths": [path],
            }

    now = int(time.time())
    discovery_cache = hass.data.setdefault(DISCOVERY_CACHE_KEY, {})
    for address, device in devices_by_address.items():
        device["last_seen_at"] = now
        device["temporarily_unseen"] = False
        discovery_cache[address] = dict(device)
    for address, cached_device in list(discovery_cache.items()):
        if address in devices_by_address:
            continue
        last_seen_at = int(cached_device.get("last_seen_at") or 0)
        if last_seen_at and now - last_seen_at <= DISCOVERY_GRACE_SECONDS:
            retained = dict(cached_device)
            retained["temporarily_unseen"] = True
            devices_by_address[address] = retained
        else:
            discovery_cache.pop(address, None)

    devices = list(devices_by_address.values())
    project_data = await _load_project_data(hass)
    device_names = project_data.get("device_names", {})
    for device in devices:
        device["paths"].sort(
            key=lambda path: path.get("rssi") if isinstance(path.get("rssi"), (int, float)) else -999,
            reverse=True,
        )
        device["preferred_path"] = device["paths"][0]
        device["rssi"] = device["preferred_path"].get("rssi")
        device["display_name"] = str(device_names.get(_normalize_address(device["address"]), ""))

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


def _project_store(hass: HomeAssistant) -> Store:
    return Store(hass, PROJECT_STORE_VERSION, PROJECT_STORE_KEY)


async def _load_project_data(hass: HomeAssistant) -> dict[str, Any]:
    data = await _project_store(hass).async_load()
    if not isinstance(data, dict):
        return {"projects": [], "device_drafts": {}, "device_names": {}, "custom_elements": []}
    data.setdefault("projects", [])
    data.setdefault("device_drafts", {})
    data.setdefault("device_names", {})
    data.setdefault("custom_elements", [])
    return data


def _normalize_address(address: str) -> str:
    return address.upper()


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/devices/set_name",
        "address": str,
        "name": str,
    }
)
@websocket_api.async_response
async def websocket_set_device_name(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = _normalize_address(msg["address"])
    name = str(msg["name"] or "").strip()[:80]
    data = await _load_project_data(hass)
    if name:
        data["device_names"][address] = name
    else:
        data["device_names"].pop(address, None)
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"address": address, "name": name})


@websocket_api.websocket_command({"type": "dratek_eink/gateways/list"})
@websocket_api.async_response
async def websocket_list_gateways(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    gateways = await async_load_gateways(hass)
    connection.send_result(msg["id"], {"gateways": gateways})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/add",
        "name": str,
        "host": str,
    }
)
@websocket_api.async_response
async def websocket_add_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    gateway = await async_add_gateway(hass, msg["name"], msg["host"])
    gateway = await async_refresh_gateway(hass, gateway["id"]) or gateway
    connection.send_result(msg["id"], {"gateway": gateway})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/delete",
        "gateway_id": str,
    }
)
@websocket_api.async_response
async def websocket_delete_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    deleted = await async_delete_gateway(hass, msg["gateway_id"])
    connection.send_result(msg["id"], {"ok": deleted})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/rename",
        "gateway_id": str,
        "name": str,
    }
)
@websocket_api.async_response
async def websocket_rename_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    try:
        gateway = await async_rename_gateway(hass, msg["gateway_id"], msg["name"])
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_name", str(exc))
        return
    if not gateway:
        connection.send_error(msg["id"], "not_found", "Gateway was not found.")
        return
    connection.send_result(msg["id"], {"gateway": gateway})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/refresh",
        vol.Optional("gateway_id"): str,
    }
)
@websocket_api.async_response
async def websocket_refresh_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    gateway_id = msg.get("gateway_id")
    if gateway_id:
        gateway = await async_refresh_gateway(hass, gateway_id)
        if not gateway:
            connection.send_error(msg["id"], "not_found", "Gateway was not found.")
            return
        connection.send_result(msg["id"], {"gateways": [gateway]})
        return
    gateways = await async_refresh_all_gateways(hass)
    connection.send_result(msg["id"], {"gateways": gateways})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/scan",
        "gateway_id": str,
        vol.Optional("seconds", default=8): int,
    }
)
@websocket_api.async_response
async def websocket_scan_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    result = await async_scan_gateway(hass, msg["gateway_id"], msg.get("seconds", 8))
    if result is None:
        connection.send_error(msg["id"], "not_found", "Gateway was not found.")
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/send_design",
        "gateway_id": str,
        "address": str,
        "sdk_type": int,
        "image": str,
        "orientation": str,
        "transform": str,
        vol.Optional("automation"): dict,
    }
)
@websocket_api.async_response
async def websocket_send_gateway_design(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    image_data = msg["image"]
    log_lines: list[str] = []
    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        raw = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        if msg.get("orientation", "landscape") == "portrait":
            image = image.rotate(-90, expand=True)
        gateways = await async_load_gateways(hass)
        gateway = next((item for item in gateways if item.get("id") == msg["gateway_id"]), None)
        if gateway is None:
            connection.send_result(
                msg["id"],
                {"ok": False, "error": "Gateway nebyla nalezena.", "log": log_lines},
            )
            return

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(f"Zapis pres gateway {gateway.get('name') or gateway.get('host')} zarazen do zpracovani.")
            transfer_result = await async_send_gateway_payload(
                hass,
                msg["gateway_id"],
                msg["address"],
                msg["sdk_type"],
                image,
                msg.get("transform"),
            )
            return transfer_result or {"ok": False, "error": "Gateway nebyla nalezena.", "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource=f"gateway:{msg['gateway_id']}",
            transport_type="gateway",
            transport_name=str(gateway.get("name") or gateway.get("host") or "DRATEK eInk gateway"),
            address=msg["address"],
            operation="design",
            runner=run_transfer,
        )
        if result is None:
            connection.send_result(
                msg["id"],
                {"ok": False, "error": "Gateway nebyla nalezena.", "log": log_lines},
            )
            return
        if result.get("ok") is not False:
            await _save_entity_automation(
                hass,
                msg,
                route_type="gateway",
                gateway_id=msg["gateway_id"],
                transport_name=str(gateway.get("name") or gateway.get("host") or "DRATEK eInk gateway"),
            )
    except Exception as exc:
        log_lines.append(f"Gateway send failed: {exc}")
        connection.send_result(msg["id"], {"ok": False, "error": str(exc), "log": log_lines})
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({"type": "dratek_eink/queue/list"})
@websocket_api.async_response
async def websocket_transfer_queue(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    connection.send_result(msg["id"], await get_transfer_queue(hass).async_snapshot())


@websocket_api.websocket_command({"type": "dratek_eink/queue/clear"})
@websocket_api.async_response
async def websocket_clear_queue(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    queue = get_transfer_queue(hass)
    await queue.async_clear_completed()
    connection.send_result(msg["id"], await queue.async_snapshot())


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/discover",
        vol.Optional("seconds", default=10): int,
    }
)
@websocket_api.async_response
async def websocket_discover_gateways(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    try:
        discovered = await async_discover_gateways(hass, msg.get("seconds", 10))
    except Exception as exc:
        connection.send_result(msg["id"], {"ok": False, "error": str(exc), "discovered": []})
        return
    connection.send_result(msg["id"], {"ok": True, "discovered": discovered})


@websocket_api.websocket_command({"type": "dratek_eink/gateways/serial_ports"})
@websocket_api.async_response
async def websocket_gateway_serial_ports(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    try:
        ports = await async_list_serial_ports(hass)
    except Exception as exc:
        connection.send_result(msg["id"], {"ok": False, "error": str(exc), "ports": []})
        return
    connection.send_result(msg["id"], {"ok": True, "ports": ports})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/flash",
        "port": str,
        "ssid": str,
        "password": str,
        vol.Optional("hostname", default="dratek-eink-gateway"): str,
        vol.Optional("chip", default="esp32"): vol.In(["esp32", "esp32s3"]),
    }
)
@websocket_api.async_response
async def websocket_flash_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    result = await async_flash_gateway(
        hass,
        msg["port"],
        msg["ssid"],
        msg["password"],
        msg.get("hostname", "dratek-eink-gateway"),
        msg.get("chip", "esp32"),
    )
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/flash_start",
        "port": str,
        "ssid": str,
        "password": str,
        vol.Optional("hostname", default="dratek-eink-gateway"): str,
        vol.Optional("chip", default="esp32"): vol.In(["esp32", "esp32s3"]),
    }
)
@websocket_api.async_response
async def websocket_start_flash_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    job = await async_start_flash_gateway(
        hass,
        msg["port"],
        msg["ssid"],
        msg["password"],
        msg.get("hostname", "dratek-eink-gateway"),
        msg.get("chip", "esp32"),
    )
    connection.send_result(msg["id"], {"job": job})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/flash_job",
        "job_id": str,
    }
)
@websocket_api.async_response
async def websocket_flash_gateway_job(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    job = async_get_flash_job(hass, msg["job_id"])
    if not job:
        connection.send_error(msg["id"], "not_found", "Flash job was not found.")
        return
    connection.send_result(msg["id"], {"job": job})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/serial_status",
        "port": str,
    }
)
@websocket_api.async_response
async def websocket_gateway_serial_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    result = await async_serial_gateway_status(hass, msg["port"])
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/serial_wifi",
        "port": str,
        "ssid": str,
        "password": str,
        vol.Optional("hostname", default="dratek-eink-gateway"): str,
    }
)
@websocket_api.async_response
async def websocket_gateway_serial_wifi(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    result = await async_serial_gateway_wifi(
        hass,
        msg["port"],
        msg["ssid"],
        msg["password"],
        msg.get("hostname", "dratek-eink-gateway"),
    )
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/ota_start",
        "gateway_id": str,
    }
)
@websocket_api.async_response
async def websocket_start_gateway_ota(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    job = await async_start_gateway_ota(
        hass,
        msg["gateway_id"],
        GATEWAY_FIRMWARE_VERSION,
    )
    if job is None:
        connection.send_error(msg["id"], "not_found", "Gateway was not found.")
        return
    connection.send_result(msg["id"], {"job": job})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/gateways/ota_job",
        "job_id": str,
    }
)
@websocket_api.async_response
async def websocket_gateway_ota_job(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    job = async_get_gateway_ota_job(hass, msg["job_id"])
    if not job:
        connection.send_error(msg["id"], "not_found", "OTA job was not found.")
        return
    connection.send_result(msg["id"], {"job": job})


@websocket_api.websocket_command({"type": "dratek_eink/projects/list"})
@websocket_api.async_response
async def websocket_list_projects(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    projects = [
        {
            "id": project["id"],
            "name": project["name"],
            "width": project["width"],
            "height": project["height"],
            "sdk_type": project.get("sdk_type"),
            "updated_at": project.get("updated_at"),
        }
        for project in data["projects"]
    ]
    projects.sort(key=lambda item: (item["name"] or "").lower())
    connection.send_result(msg["id"], {"projects": projects})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/projects/save",
        "project": dict,
    }
)
@websocket_api.async_response
async def websocket_save_project(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    project = dict(msg["project"])
    project_id = project.get("id") or str(uuid.uuid4())
    now = int(time.time())
    project.update(
        {
            "id": project_id,
            "name": str(project.get("name") or "DRATEK eInk projekt"),
            "updated_at": now,
        }
    )

    data = await _load_project_data(hass)
    projects = [item for item in data["projects"] if item.get("id") != project_id]
    projects.append(project)
    data["projects"] = projects
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"project": project})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/projects/load",
        "project_id": str,
    }
)
@websocket_api.async_response
async def websocket_load_project(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    project = next((item for item in data["projects"] if item.get("id") == msg["project_id"]), None)
    if not project:
        connection.send_error(msg["id"], "not_found", "Project was not found.")
        return
    connection.send_result(msg["id"], {"project": project})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/projects/delete",
        "project_id": str,
    }
)
@websocket_api.async_response
async def websocket_delete_project(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    data["projects"] = [item for item in data["projects"] if item.get("id") != msg["project_id"]]
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/device_drafts/load",
        "address": str,
    }
)
@websocket_api.async_response
async def websocket_load_device_draft(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    draft = data["device_drafts"].get(_normalize_address(msg["address"]))
    connection.send_result(msg["id"], {"draft": draft})


@websocket_api.websocket_command({"type": "dratek_eink/device_drafts/list"})
@websocket_api.async_response
async def websocket_list_device_drafts(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return all display drafts in one request for fast card previews."""
    data = await _load_project_data(hass)
    drafts = {
        _normalize_address(address): draft
        for address, draft in data["device_drafts"].items()
        if isinstance(address, str) and isinstance(draft, dict)
    }
    connection.send_result(msg["id"], {"drafts": drafts})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/device_drafts/save",
        "address": str,
        "draft": dict,
    }
)
@websocket_api.async_response
async def websocket_save_device_draft(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = _normalize_address(msg["address"])
    draft = dict(msg["draft"])
    draft.update(
        {
            "device_address": address,
            "updated_at": int(time.time()),
        }
    )
    data = await _load_project_data(hass)
    data["device_drafts"][address] = draft
    await _project_store(hass).async_save(data)
    if "refresh_interval_seconds" in draft:
        await get_entity_auto_update_manager(hass).async_set_refresh_interval(
            address, draft["refresh_interval_seconds"]
        )
    connection.send_result(msg["id"], {"draft": draft})


@websocket_api.websocket_command({"type": "dratek_eink/custom_elements/list"})
@websocket_api.async_response
async def websocket_list_custom_elements(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    elements = sorted(
        (item for item in data["custom_elements"] if isinstance(item, dict)),
        key=lambda item: str(item.get("name") or "").lower(),
    )
    connection.send_result(msg["id"], {"elements": elements})


def _clamped_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _normalized_icon_image(value: Any) -> str:
    """Validate, resize and strip metadata from a user supplied icon."""
    source = str(value or "")
    if not source:
        return ""
    encoded = source.split(",", 1)[1] if "," in source else source
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("Soubor ikony je příliš velký.")
        image = Image.open(io.BytesIO(raw))
        image.load()
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        normalized = Image.new("RGBA", image.size, (255, 255, 255, 0))
        normalized.alpha_composite(image.convert("RGBA"))
        output = io.BytesIO()
        normalized.save(output, format="PNG", optimize=True)
        result = output.getvalue()
        if len(result) > 1024 * 1024:
            raise ValueError("Zpracovaná ikona je příliš velká.")
    except (ValueError, TypeError, OSError) as exc:
        raise ValueError(f"Ikonu se nepodařilo načíst: {exc}") from exc
    return f"data:image/png;base64,{base64.b64encode(result).decode('ascii')}"


def _normalized_layered_layers(value: Any, canvas_width: int, canvas_height: int) -> list[dict[str, Any]]:
    """Validate graphical layers used by the Home Assistant element designer."""
    layers: list[dict[str, Any]] = []
    total_image_size = 0
    if not isinstance(value, list):
        return layers
    for layer_index, layer_source in enumerate(value[:12]):
        if not isinstance(layer_source, dict):
            continue
        layer_id = str(layer_source.get("id") or f"layer-{layer_index}")[:80]
        objects: list[dict[str, Any]] = []
        raw_objects = layer_source.get("objects")
        for object_index, source in enumerate(raw_objects[:40] if isinstance(raw_objects, list) else []):
            if not isinstance(source, dict):
                continue
            object_type = str(source.get("type") or "text")
            if object_type not in {"text", "rect", "image"}:
                continue
            item: dict[str, Any] = {
                "id": str(source.get("id") or f"item-{layer_index}-{object_index}")[:80],
                "type": object_type,
                "x": _clamped_int(source.get("x"), 0, 0, canvas_width - 1),
                "y": _clamped_int(source.get("y"), 0, 0, canvas_height - 1),
                "w": _clamped_int(source.get("w"), 80, 1, canvas_width),
                "h": _clamped_int(source.get("h"), 40, 1, canvas_height),
            }
            if object_type == "text":
                align = str(source.get("align") or "left")
                item.update({
                    "text": str(source.get("text") or "Text")[:500],
                    "color": "red" if source.get("color") == "red" else "black",
                    "font_size": _clamped_int(source.get("font_size"), 24, 8, 120),
                    "bold": bool(source.get("bold")),
                    "align": align if align in {"left", "center", "right"} else "left",
                })
            elif object_type == "rect":
                fill = str(source.get("fill") or "none")
                stroke = str(source.get("stroke") or "black")
                item.update({
                    "fill": fill if fill in {"none", "black", "red", "white"} else "none",
                    "stroke": stroke if stroke in {"none", "black", "red", "white"} else "black",
                    "stroke_width": _clamped_int(source.get("stroke_width"), 2, 1, 12),
                })
            else:
                item["image"] = _normalized_icon_image(source.get("image"))
                tint = str(source.get("tint") or "original")
                item["tint"] = tint if tint in {"original", "black", "red", "white"} else "original"
                if not item["image"]:
                    continue
                total_image_size += len(item["image"])
                if total_image_size > 8 * 1024 * 1024:
                    raise ValueError("Obrazky ve vrstvach jsou dohromady prilis velke.")
            objects.append(item)
        layers.append({
            "id": layer_id,
            "name": str(layer_source.get("name") or f"Vrstva {layer_index + 1}").strip()[:80],
            "objects": objects,
        })
    return layers


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/custom_elements/save",
        "element": dict,
    }
)
@websocket_api.async_response
async def websocket_save_custom_element(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    source = dict(msg["element"])
    element_type = str(source.get("element_type") or "value")
    if element_type not in {"value", "status", "chart", "icon", "layered"}:
        connection.send_error(msg["id"], "invalid_type", "Unsupported custom element type.")
        return
    try:
        icon_image = _normalized_icon_image(source.get("icon_image")) if element_type == "icon" else ""
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_icon", str(exc))
        return
    if element_type == "icon" and not icon_image:
        connection.send_error(msg["id"], "missing_icon", "Nejprve nahrajte obrázek ikony.")
        return
    canvas_width = _clamped_int(source.get("canvas_width"), 296, 128, 800)
    canvas_height = _clamped_int(source.get("canvas_height"), 128, 64, 480)
    try:
        layers = _normalized_layered_layers(source.get("layers"), canvas_width, canvas_height) if element_type == "layered" else []
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_layer_image", str(exc))
        return
    if element_type == "layered" and not layers:
        connection.send_error(msg["id"], "missing_layers", "Prvek musi obsahovat alespon jednu vrstvu.")
        return
    layer_ids = {layer["id"] for layer in layers}
    element_id = str(source.get("id") or uuid.uuid4())
    now = int(time.time())
    condition_rules = []
    for rule_source in source.get("condition_rules", [])[:12] if isinstance(source.get("condition_rules"), list) else []:
        if not isinstance(rule_source, dict):
            continue
        operator = str(rule_source.get("operator") or "equals")
        if operator not in {"equals", "not_equals", "greater", "greater_equal", "less", "less_equal", "contains", "is_on", "is_off"}:
            operator = "equals"
        condition_rules.append({
            "operator": operator,
            "value": str(rule_source.get("value") or "")[:120],
            "symbol": str(rule_source.get("symbol") or "●")[:8],
        })
        if element_type == "layered":
            layer_id = str(rule_source.get("layer_id") or "")
            if layer_id not in layer_ids:
                condition_rules.pop()
                continue
            condition_rules[-1]["layer_id"] = layer_id
            condition_rules[-1]["symbol"] = layer_id
    element = {
        "id": element_id,
        "name": str(source.get("name") or "Vlastní prvek").strip()[:80],
        "element_type": element_type,
        "source_type": "entity",
        "entity_id": str(source.get("entity_id") or "").strip()[:255],
        "entity_attribute": str(source.get("entity_attribute") or "").strip()[:120],
        "label": str(source.get("label") or "").strip()[:120],
        "unit": str(source.get("unit") or "").strip()[:32],
        "color": "red" if source.get("color") == "red" else "black",
        "chart_type": str(source.get("chart_type") or "line") if str(source.get("chart_type") or "line") in {"line", "bar", "area"} else "line",
        "history_mode": "attribute" if source.get("history_mode") == "attribute" else "rolling",
        "history_points": _clamped_int(source.get("history_points"), 24, 2, 96),
        "condition_rules": condition_rules,
        "default_symbol": str(source.get("default_symbol") or "○")[:8],
        "on_symbol": str(source.get("on_symbol") or "●")[:8],
        "off_symbol": str(source.get("off_symbol") or "○")[:8],
        "on_values": str(source.get("on_values") or "on,true,1,open,home")[:255],
        "sample_data": str(source.get("sample_data") or "")[:65535],
        "sample_labels": str(source.get("sample_labels") or "")[:65535],
        "width_percent": _clamped_int(source.get("width_percent"), 55, 10, 100),
        "height_percent": _clamped_int(source.get("height_percent"), 35, 10, 100),
        "icon_image": icon_image,
        "canvas_width": canvas_width,
        "canvas_height": canvas_height,
        "layers": layers,
        "default_layer_id": (
            str(source.get("default_layer_id"))
            if str(source.get("default_layer_id") or "") in layer_ids
            else (layers[0]["id"] if layers else "")
        ),
        "updated_at": now,
    }
    data = await _load_project_data(hass)
    data["custom_elements"] = [
        item for item in data["custom_elements"]
        if isinstance(item, dict) and item.get("id") != element_id
    ]
    data["custom_elements"].append(element)
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"element": element})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/custom_elements/delete",
        "element_id": str,
    }
)
@websocket_api.async_response
async def websocket_delete_custom_element(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    before = len(data["custom_elements"])
    data["custom_elements"] = [
        item for item in data["custom_elements"]
        if isinstance(item, dict) and item.get("id") != msg["element_id"]
    ]
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"ok": True, "deleted": len(data["custom_elements"]) < before})


def _json_path_value(value: Any, path: str) -> Any:
    """Resolve object paths and project fields from arrays using [] or [*]."""
    parts = [part for part in path.replace("[*]", "[]").split(".") if part]

    def _walk(current: Any, index: int) -> Any:
        if index >= len(parts):
            return current
        part = parts[index]
        project = part.endswith("[]")
        key = part[:-2] if project else part
        if project:
            sequence = current.get(key) if key and isinstance(current, dict) else current
            if not isinstance(sequence, list):
                raise KeyError(part)
            return [_walk(item, index + 1) for item in sequence]
        if isinstance(current, list):
            if key.isdigit():
                return _walk(current[int(key)], index + 1)
            return [_walk(item, index) for item in current]
        if isinstance(current, dict):
            return _walk(current[key], index + 1)
        raise KeyError(part)

    return _walk(value, 0)


def _json_field_options(value: Any, prefix: str = "", depth: int = 0) -> list[dict[str, Any]]:
    """Return selectable scalar and series fields from a JSON response."""
    if depth > 6:
        return []
    fields: list[dict[str, Any]] = []
    if isinstance(value, dict):
        for key, item in list(value.items())[:80]:
            path = f"{prefix}.{key}" if prefix else str(key)
            fields.extend(_json_field_options(item, path, depth + 1))
        return fields[:160]
    if isinstance(value, list):
        scalar_items = [item for item in value if not isinstance(item, (dict, list)) and item is not None]
        if scalar_items and len(scalar_items) == len([item for item in value if item is not None]):
            numeric = all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in scalar_items)
            fields.append({
                "path": prefix,
                "kind": "number_series" if numeric else "text_series",
                "count": len(scalar_items),
                "preview": [str(item)[:60] for item in scalar_items[:4]],
            })
            return fields
        first_object = next((item for item in value if isinstance(item, dict)), None)
        if first_object is not None:
            array_prefix = f"{prefix}[]" if prefix else "[]"
            objects = [item for item in value if isinstance(item, dict)]
            for key in list(first_object)[:80]:
                projected = [item.get(key) for item in objects if item.get(key) is not None]
                path = f"{array_prefix}.{key}"
                fields.extend(_json_field_options(projected, path, depth + 1))
        return fields[:160]
    if prefix and value is not None:
        numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
        fields.append({
            "path": prefix,
            "kind": "number" if numeric else "text",
            "count": 1,
            "preview": [str(value)[:60]],
        })
    return fields


def _json_collections(value: Any, prefix: str = "", depth: int = 0) -> list[dict[str, Any]]:
    """Describe JSON objects and arrays as user-friendly datasets and columns."""
    if depth > 6:
        return []
    collections: list[dict[str, Any]] = []
    if isinstance(value, dict):
        scalar_fields = []
        for key, item in list(value.items())[:80]:
            if item is None or isinstance(item, (dict, list)):
                continue
            numeric = isinstance(item, (int, float)) and not isinstance(item, bool)
            scalar_fields.append({"key": str(key), "kind": "number" if numeric else "text", "preview": [str(item)[:60]]})
        if scalar_fields:
            collections.append({"path": prefix, "label": prefix or "Kořen odpovědi", "count": 1, "fields": scalar_fields})
        for key, item in list(value.items())[:80]:
            child_path = f"{prefix}.{key}" if prefix else str(key)
            collections.extend(_json_collections(item, child_path, depth + 1))
        return collections[:120]
    if isinstance(value, list):
        objects = [item for item in value if isinstance(item, dict)][:512]
        if objects:
            keys: list[str] = []
            for item in objects:
                for key in item:
                    if key not in keys and len(keys) < 80:
                        keys.append(str(key))
            fields = []
            for key in keys:
                samples = [item.get(key) for item in objects if item.get(key) is not None and not isinstance(item.get(key), (dict, list))]
                if not samples:
                    continue
                numeric = all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in samples)
                fields.append({
                    "key": key,
                    "kind": "number" if numeric else "text",
                    "preview": [str(item)[:60] for item in samples[:4]],
                })
            if fields:
                collections.append({"path": prefix, "label": prefix or "Seznam", "count": len(value), "fields": fields})
            first = objects[0]
            for key, item in list(first.items())[:80]:
                if isinstance(item, (dict, list)):
                    projected = [obj.get(key) for obj in objects if obj.get(key) is not None]
                    child_path = f"{prefix}[].{key}" if prefix else str(key)
                    collections.extend(_json_collections(projected, child_path, depth + 1))
            return collections[:120]
        scalars = [item for item in value if item is not None and not isinstance(item, (dict, list))]
        if scalars:
            numeric = all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in scalars)
            collections.append({
                "path": prefix,
                "label": prefix or "Seznam hodnot",
                "count": len(scalars),
                "fields": [{"key": "$value", "kind": "number" if numeric else "text", "preview": [str(item)[:60] for item in scalars[:4]]}],
            })
    return collections[:120]


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/custom_elements/fetch_url",
        "url": str,
        vol.Optional("json_path", default=""): str,
        vol.Optional("label_json_path", default=""): str,
    }
)
@websocket_api.async_response
async def websocket_fetch_custom_element_url(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    url = str(msg["url"] or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        connection.send_error(msg["id"], "invalid_url", "URL must use HTTP or HTTPS.")
        return
    try:
        session = async_get_clientsession(hass)
        async with asyncio.timeout(12):
            async with session.get(url, allow_redirects=True, max_redirects=3) as response:
                response.raise_for_status()
                raw = await response.content.read(1_048_577)
                if len(raw) > 1_048_576:
                    raise ValueError("Response is larger than 1 MB.")
                text = raw.decode(response.charset or "utf-8", errors="replace")
        try:
            root_value: Any = json.loads(text)
        except json.JSONDecodeError:
            root_value = text.strip()
        fields = _json_field_options(root_value)
        collections = _json_collections(root_value)
        value = root_value
        mapping_error = ""
        path = str(msg.get("json_path") or "").strip()
        if path:
            try:
                value = _json_path_value(root_value, path)
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                mapping_error = f"Hodnoty: cesta {path} nebyla nalezena ({exc})."
        labels: Any = []
        label_path = str(msg.get("label_json_path") or "").strip()
        if label_path:
            try:
                labels = _json_path_value(root_value, label_path)
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                mapping_error = f"{mapping_error} Popisky: cesta {label_path} nebyla nalezena ({exc}).".strip()
        serialized = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        serialized_labels = labels if isinstance(labels, str) else json.dumps(labels, ensure_ascii=False, separators=(",", ":"))
        connection.send_result(msg["id"], {
            "ok": True,
            "value": serialized[:65535],
            "labels": serialized_labels[:65535],
            "fields": fields,
            "collections": collections,
            "mapping_error": mapping_error,
        })
    except Exception as exc:
        connection.send_error(msg["id"], "fetch_failed", str(exc))


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_design",
        "address": str,
        "sdk_type": int,
        "image": str,
        "orientation": str,
        "transform": str,
        vol.Optional("automation"): dict,
    }
)
@websocket_api.async_response
async def websocket_send_design(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = msg["address"]
    sdk_type = msg["sdk_type"]
    image_data = msg["image"]
    orientation = msg.get("orientation", "landscape")
    transform = msg.get("transform")
    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        raw = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        if orientation == "portrait":
            image = image.rotate(-90, expand=True)
        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(f"Sending editor design {image.width}x{image.height} to SDK type {sdk_type}.")
            if transform:
                add_log(f"Using display transform: {transform}.")
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_image(address, sdk_type, image, transform)
            add_log("Design sent.")
            return {"ok": True, "address": address, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="design",
            runner=run_transfer,
        )
        if result.get("ok") is not False:
            await _save_entity_automation(
                hass,
                msg,
                route_type="local",
                transport_name="Home Assistant Bluetooth",
            )
    except Exception as exc:  # noqa: BLE stack can raise platform-specific exceptions
        log(f"Send failed: {exc}")
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": address,
                "error": str(exc),
                "log": log_lines,
            },
        )
        return

    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_partial_design",
        "address": str,
        "sdk_type": int,
        "image": str,
        "x": int,
        "y": int,
        "width": int,
        "height": int,
        "clear_screen": int,
        vol.Optional("transform"): str,
    }
)
@websocket_api.async_response
async def websocket_send_partial_design(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = msg["address"]
    sdk_type = msg["sdk_type"]
    image_data = msg["image"]
    transform = msg.get("transform")
    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        raw = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(
                "Sending partial editor design "
                f"{image.width}x{image.height} to SDK type {sdk_type} at "
                f"x={msg['x']}, y={msg['y']}."
            )
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_partial_image(
                address,
                sdk_type,
                image,
                msg["x"],
                msg["y"],
                msg["width"],
                msg["height"],
                msg.get("clear_screen", 0),
                transform,
            )
            add_log("Partial design sent.")
            return {"ok": True, "address": address, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="partial_design",
            runner=run_transfer,
        )
    except Exception as exc:  # noqa: BLE stack can raise platform-specific exceptions
        log(f"Partial send failed: {exc}")
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": address,
                "error": str(exc),
                "log": log_lines,
            },
        )
        return

    connection.send_result(msg["id"], result)


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
        image = await hass.async_add_executor_job(render_text_image, sdk_type, text, None, "black")

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(f"Rendering text '{text}' for SDK type {sdk_type}.")
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_image(address, sdk_type, image)
            add_log("Text sent.")
            return {"ok": True, "address": address, "text": text, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="text",
            runner=run_transfer,
        )
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

    connection.send_result(msg["id"], result)
