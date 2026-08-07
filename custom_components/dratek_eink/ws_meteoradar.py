"""Websocket command returning the live Meteoradar snapshot, fit to a display slot.

The camera entity (camera.py) always returns its own natural crop of the Czech
Republic. Templates need it sized to one specific slot and quantized to the
panel's actual three colours - the same job an automatic refresh's own camera
binding does (render.async_render_camera_binding_data_url), so this command is
a thin websocket wrapper around that shared function rather than a second copy
of the fetch-and-quantise logic.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .render import async_render_camera_binding_data_url

# Matches DratekMeteoradarCamera's suggested object id (camera.py): the panel
# targets this one well-known entity rather than looking it up, the same way the
# "radar" template catalog entry already referenced it before this camera existed.
METEORADAR_CAMERA_ENTITY_ID = "camera.meteoradar"


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/render_meteoradar",
        "width": int,
        "height": int,
        websocket_api.Optional("country"): str,
    }
)
@websocket_api.async_response
async def websocket_render_meteoradar(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the current precipitation map for the requested country, fit to size."""
    country = str(msg.get("country") or "cz").lower()
    data_url = await async_render_camera_binding_data_url(
        hass, METEORADAR_CAMERA_ENTITY_ID, msg["width"], msg["height"], country=country
    )
    if data_url is None:
        connection.send_error(msg["id"], "meteoradar_unavailable", "Radarová mapa není momentálně dostupná.")
        return
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "image": data_url,
            "width": msg["width"],
            "height": msg["height"],
        },
    )
