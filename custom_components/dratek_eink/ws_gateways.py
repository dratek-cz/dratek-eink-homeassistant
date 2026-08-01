"""Websocket commands for managing DRATEK eInk gateways."""

from __future__ import annotations

from typing import Any
import base64
import io

from PIL import Image
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
import voluptuous as vol

from .automation import get_entity_auto_update_manager
from .const import GATEWAY_FIRMWARE_VERSION
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
from .queue import get_transfer_queue
from .ws_shared import (
    _clear_previous_entity_automation,
    _load_project_data,
    _project_store,
)


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
    if deleted:
        data = await _load_project_data(hass)
        preferences = data["device_gateway_preferences"]
        affected_addresses = [
            address
            for address, gateway_id in preferences.items()
            if gateway_id == msg["gateway_id"]
        ]
        for address in affected_addresses:
            preferences.pop(address, None)
        if affected_addresses:
            await _project_store(hass).async_save(data)
            manager = get_entity_auto_update_manager(hass)
            for address in affected_addresses:
                await manager.async_set_gateway_preference(address, "")
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
        vol.Optional("software_version"): int,
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
        gateways = await async_load_gateways(hass)
        gateway = next((item for item in gateways if item.get("id") == msg["gateway_id"]), None)
        if gateway is None:
            connection.send_result(
                msg["id"],
                {"ok": False, "error": "Gateway nebyla nalezena.", "log": log_lines},
            )
            return
        await _clear_previous_entity_automation(hass, msg["address"])

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(f"Zapis pres gateway {gateway.get('name') or gateway.get('host')} zarazen do zpracovani.")
            transfer_result = await async_send_gateway_payload(
                hass,
                msg["gateway_id"],
                msg["address"],
                msg["sdk_type"],
                image,
                msg.get("transform"),
                msg.get("orientation"),
                msg.get("software_version"),
            )
            if transfer_result and transfer_result.get("ok") is not False:
                # Uploads are one-shot: drop any schedule that was registered while
                # this transfer was queued, so it cannot repaint over the new picture.
                await _clear_previous_entity_automation(hass, msg["address"])
            return transfer_result or {"ok": False, "error": "Gateway nebyla nalezena.", "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource=f"gateway:{msg['gateway_id']}",
            transport_type="gateway",
            transport_name=str(gateway.get("name") or gateway.get("host") or "DRATEK eInk gateway"),
            address=msg["address"],
            operation="design",
            runner=run_transfer,
            wait_for_completion=False,
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
