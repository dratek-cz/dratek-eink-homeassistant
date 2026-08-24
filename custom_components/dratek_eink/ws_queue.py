"""Websocket commands exposing the transfer queue."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .queue import get_transfer_queue

@websocket_api.require_admin
@websocket_api.websocket_command({"type": "dratek_eink/queue/list"})
@websocket_api.async_response
async def websocket_transfer_queue(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    connection.send_result(msg["id"], await get_transfer_queue(hass).async_snapshot())


@websocket_api.require_admin
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


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        "type": "dratek_eink/queue/cancel",
        vol.Required("job_id"): str,
    }
)
@websocket_api.async_response
async def websocket_cancel_queue_job(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    queue = get_transfer_queue(hass)
    cancelled = queue.async_cancel_job(msg["job_id"])
    connection.send_result(msg["id"], {"ok": cancelled, **(await queue.async_snapshot())})
