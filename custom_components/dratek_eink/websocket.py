from __future__ import annotations

import base64
import io
import time
import uuid
from typing import Any

from homeassistant.components import bluetooth, websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from PIL import Image
import voluptuous as vol

from .const import PARTIAL_UPDATE_SDK_TYPES
from .discovery import parse_dratek_advertisement
from .gateway import (
    async_add_gateway,
    async_delete_gateway,
    async_discover_gateways,
    async_flash_gateway,
    async_list_serial_ports,
    async_load_gateways,
    async_refresh_all_gateways,
    async_refresh_gateway,
    async_scan_gateway,
)
from .render import render_text_image
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
    websocket_api.async_register_command(hass, websocket_list_gateways)
    websocket_api.async_register_command(hass, websocket_add_gateway)
    websocket_api.async_register_command(hass, websocket_delete_gateway)
    websocket_api.async_register_command(hass, websocket_refresh_gateway)
    websocket_api.async_register_command(hass, websocket_scan_gateway)
    websocket_api.async_register_command(hass, websocket_discover_gateways)
    websocket_api.async_register_command(hass, websocket_gateway_serial_ports)
    websocket_api.async_register_command(hass, websocket_flash_gateway)


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

        device = parse_dratek_advertisement(service_info)
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
                "partial_update": device.sdk_type in PARTIAL_UPDATE_SDK_TYPES,
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


def _project_store(hass: HomeAssistant) -> Store:
    return Store(hass, PROJECT_STORE_VERSION, PROJECT_STORE_KEY)


async def _load_project_data(hass: HomeAssistant) -> dict[str, Any]:
    data = await _project_store(hass).async_load()
    if not isinstance(data, dict):
        return {"projects": [], "device_drafts": {}}
    data.setdefault("projects", [])
    data.setdefault("device_drafts", {})
    return data


def _normalize_address(address: str) -> str:
    return address.upper()


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
        "type": "dratek_eink/gateways/discover",
        vol.Optional("seconds", default=4): int,
    }
)
@websocket_api.async_response
async def websocket_discover_gateways(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    try:
        discovered = await async_discover_gateways(hass, msg.get("seconds", 4))
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
    )
    connection.send_result(msg["id"], result)


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
        log(f"Sending editor design {image.width}x{image.height} to SDK type {sdk_type}.")
        if transform:
            log(f"Using display transform: {transform}.")
        transfer = DratekTransfer(log=log)
        await transfer.send_image(address, sdk_type, image, transform)
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

    log("Design sent.")
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "address": address,
            "log": log_lines,
        },
    )


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
        log(
            "Sending partial editor design "
            f"{image.width}x{image.height} to SDK type {sdk_type} at "
            f"x={msg['x']}, y={msg['y']}."
        )
        transfer = DratekTransfer(log=log)
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

    log("Partial design sent.")
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "address": address,
            "log": log_lines,
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
