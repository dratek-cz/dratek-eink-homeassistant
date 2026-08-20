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

import voluptuous as vol

from .render import async_render_camera_binding_data_url, async_render_meteoradar_sidebar_data_url

# Matches DratekMeteoradarCamera's suggested object id (camera.py): the panel
# targets this one well-known entity rather than looking it up, the same way the
# "radar" template catalog entry already referenced it before this camera existed.
METEORADAR_CAMERA_ENTITY_ID = "camera.meteoradar"


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/render_meteoradar",
        "width": int,
        "height": int,
        vol.Optional("country"): str,
        vol.Optional("show_precipitation"): bool,
        vol.Optional("dotted_light"): bool,
        vol.Optional("show_wind"): bool,
        vol.Optional("preserve_yellow"): bool,
        # The map and its info sidebar are two separate blocks (see
        # panel-template-svg.mixin.js's _blockRadarMap), each fetched at its
        # own box's exact pixel size. Optional: older frontend builds (or a
        # caller that only wants the map) omit these and get the map alone.
        vol.Optional("sidebar_width"): int,
        vol.Optional("sidebar_height"): int,
    }
)
@websocket_api.async_response
async def websocket_render_meteoradar(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the current precipitation map (and, if requested, its info
    sidebar) for the requested country, each fit to its own requested size.
    """
    country = str(msg.get("country") or "cz").lower()
    show_precipitation = bool(msg.get("show_precipitation", True))
    dotted_light = bool(msg.get("dotted_light", True))
    show_wind = bool(msg.get("show_wind", False))
    preserve_yellow = bool(msg.get("preserve_yellow", False))

    data_url = await async_render_camera_binding_data_url(
        hass,
        METEORADAR_CAMERA_ENTITY_ID,
        msg["width"],
        msg["height"],
        country=country,
        show_precipitation=show_precipitation,
        dotted_light=dotted_light,
        show_wind=show_wind,
        preserve_yellow=preserve_yellow,
    )
    if data_url is None:
        connection.send_error(msg["id"], "meteoradar_unavailable", "Radarová mapa není momentálně dostupná.")
        return

    result: dict[str, Any] = {
        "ok": True,
        "image": data_url,
        "width": msg["width"],
        "height": msg["height"],
    }

    sidebar_width = msg.get("sidebar_width")
    sidebar_height = msg.get("sidebar_height")
    if sidebar_width and sidebar_height:
        sidebar_data_url = await async_render_meteoradar_sidebar_data_url(
            hass, int(sidebar_width), int(sidebar_height), preserve_yellow=preserve_yellow,
        )
        if sidebar_data_url is not None:
            result["sidebar_image"] = sidebar_data_url
            result["sidebar_width"] = sidebar_width
            result["sidebar_height"] = sidebar_height

    connection.send_result(msg["id"], result)
