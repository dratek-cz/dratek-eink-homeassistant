"""Websocket API for the native departures-template stop picker."""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
import voluptuous as vol

from .transit import TransitError, async_get_departures, async_search_stops


@websocket_api.require_admin
@websocket_api.websocket_command({
    "type": "dratek_eink/transit/search_stops",
    "query": str,
    vol.Optional("limit", default=8): vol.All(int, vol.Range(min=1, max=12)),
})
@websocket_api.async_response
async def websocket_transit_search_stops(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    try:
        stops = await async_search_stops(hass, msg["query"], msg["limit"])
    except TransitError as err:
        connection.send_error(msg["id"], "transit_unavailable", str(err))
        return
    connection.send_result(msg["id"], {"stops": stops})


@websocket_api.require_admin
@websocket_api.websocket_command({
    "type": "dratek_eink/transit/departures",
    "stop_id": str,
    vol.Optional("limit", default=4): vol.All(int, vol.Range(min=1, max=12)),
})
@websocket_api.async_response
async def websocket_transit_departures(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    try:
        result = await async_get_departures(hass, msg["stop_id"], msg["limit"])
    except TransitError as err:
        connection.send_error(msg["id"], "transit_unavailable", str(err))
        return
    connection.send_result(msg["id"], result)
