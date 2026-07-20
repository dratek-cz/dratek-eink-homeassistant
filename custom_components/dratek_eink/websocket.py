from __future__ import annotations

import base64
import asyncio
import io
import time
import uuid
from typing import Any

from homeassistant.components import bluetooth, websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from PIL import Image
import voluptuous as vol

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


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_scan)
    websocket_api.async_register_command(hass, websocket_send_text)
    websocket_api.async_register_command(hass, websocket_send_design)
    websocket_api.async_register_command(hass, websocket_send_partial_design)
    websocket_api.async_register_command(hass, websocket_list_projects)
    websocket_api.async_register_command(hass, websocket_save_project)
    websocket_api.async_register_command(hass, websocket_load_project)
    websocket_api.async_register_command(hass, websocket_delete_project)
    websocket_api.async_register_command(hass, websocket_load_device_draft)
    websocket_api.async_register_command(hass, websocket_save_device_draft)
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
                "battery": device.battery,
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
                "battery": parsed.battery,
                "sw": parsed.sw,
                "hw": parsed.hw,
                "model": parsed.model,
                "partial_update": parsed.sdk_type in PARTIAL_UPDATE_SDK_TYPES,
                "paths": [path],
            }

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
        return {"projects": [], "device_drafts": {}, "device_names": {}}
    data.setdefault("projects", [])
    data.setdefault("device_drafts", {})
    data.setdefault("device_names", {})
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
    connection.send_result(msg["id"], {"draft": draft})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_design",
        "address": str,
        "sdk_type": int,
        "image": str,
        "orientation": str,
        "transform": str,
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
            transfer = DratekTransfer(log=add_log)
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
            transfer = DratekTransfer(log=add_log)
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
            transfer = DratekTransfer(log=add_log)
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
