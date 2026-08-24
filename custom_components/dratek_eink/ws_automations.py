"""Websocket commands for managing automatic display writes."""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .automation import get_entity_auto_update_manager


@websocket_api.require_admin
@websocket_api.websocket_command({"type": "dratek_eink/automations/list"})
@websocket_api.async_response
async def websocket_list_automations(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = get_entity_auto_update_manager(hass)
    connection.send_result(
        msg["id"], {"automations": await manager.async_list_configs()}
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": "dratek_eink/automations/update_interval",
        "address": str,
        "refresh_interval_seconds": int,
    }
)
@websocket_api.async_response
async def websocket_update_automation_interval(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = get_entity_auto_update_manager(hass)
    await manager.async_initialize()
    address = msg["address"].upper()
    if address not in manager._configs:
        connection.send_error(msg["id"], "not_found", "Automation was not found.")
        return
    await manager.async_set_refresh_interval(
        address, msg["refresh_interval_seconds"]
    )
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": "dratek_eink/automations/update_trigger_mode",
        "address": str,
        "refresh_trigger_mode": str,
    }
)
@websocket_api.async_response
async def websocket_update_automation_trigger_mode(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = get_entity_auto_update_manager(hass)
    await manager.async_initialize()
    address = msg["address"].upper()
    if address not in manager._configs:
        connection.send_error(msg["id"], "not_found", "Automation was not found.")
        return
    await manager.async_set_refresh_trigger_mode(
        address, msg["refresh_trigger_mode"]
    )
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": "dratek_eink/automations/update_enabled",
        "address": str,
        "enabled": bool,
    }
)
@websocket_api.async_response
async def websocket_update_automation_enabled(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = get_entity_auto_update_manager(hass)
    await manager.async_initialize()
    address = msg["address"].upper()
    if address not in manager._configs:
        connection.send_error(msg["id"], "not_found", "Automation was not found.")
        return
    await manager.async_set_enabled(address, msg["enabled"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": "dratek_eink/automations/update_always_send",
        "address": str,
        "always_send": bool,
    }
)
@websocket_api.async_response
async def websocket_update_automation_always_send(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = get_entity_auto_update_manager(hass)
    await manager.async_initialize()
    address = msg["address"].upper()
    if address not in manager._configs:
        connection.send_error(msg["id"], "not_found", "Automation was not found.")
        return
    await manager.async_set_always_send(address, msg["always_send"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": "dratek_eink/automations/delete",
        "address": str,
    }
)
@websocket_api.async_response
async def websocket_delete_automation(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = get_entity_auto_update_manager(hass)
    await manager.async_initialize()
    address = msg["address"].upper()
    if address not in manager._configs:
        connection.send_result(msg["id"], {"ok": False})
        return
    await manager.async_set_config(address, None)
    connection.send_result(msg["id"], {"ok": True})
