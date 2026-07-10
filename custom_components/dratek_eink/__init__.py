from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .render import render_text_image
from .transfer import DratekTransfer

_LOGGER = logging.getLogger(__name__)
PANEL_URL_PATH = "dratek-eink"
PANEL_STATIC_PATH = f"/{DOMAIN}_panel"
PANEL_VERSION = "0.1.8"

SEND_TEXT_SCHEMA = vol.Schema(
    {
        vol.Required("address"): cv.string,
        vol.Required("sdk_type"): vol.Coerce(int),
        vol.Required("text"): cv.string,
        vol.Optional("font_size"): vol.Coerce(int),
        vol.Optional("color", default="black"): vol.In(["black", "red"]),
    }
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    from .websocket import async_setup as async_setup_websocket

    hass.data.setdefault(DOMAIN, {})
    if not hass.data[DOMAIN].get("websocket_setup"):
        async_setup_websocket(hass)
        hass.data[DOMAIN]["websocket_setup"] = True

    async def handle_send_text(call: ServiceCall) -> None:
        address = call.data["address"]
        sdk_type = call.data["sdk_type"]
        text = call.data["text"]
        font_size = call.data.get("font_size")
        color = call.data["color"]

        image = await hass.async_add_executor_job(render_text_image, sdk_type, text, font_size, color)
        transfer = DratekTransfer(log=_LOGGER.info)
        await transfer.send_image(address, sdk_type, image)

    hass.services.async_register(DOMAIN, "send_text", handle_send_text, schema=SEND_TEXT_SCHEMA)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("entries", {})
    hass.data[DOMAIN]["entries"][entry.entry_id] = entry.data
    await _async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.get(DOMAIN, {}).get("entries", {}).pop(entry.entry_id, None)
    return True


async def _async_register_panel(hass: HomeAssistant) -> None:
    if hass.data[DOMAIN].get("panel_registered"):
        return
    if PANEL_URL_PATH in hass.data.get("frontend_panels", {}):
        hass.data[DOMAIN]["panel_registered"] = True
        return

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_STATIC_PATH, str(frontend_path), cache_headers=False)]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="dratek-eink-panel",
        frontend_url_path=PANEL_URL_PATH,
        sidebar_title="DRATEK eInk",
        sidebar_icon="mdi:tag-multiple-outline",
        module_url=f"{PANEL_STATIC_PATH}/dratek-eink-panel.js?v={PANEL_VERSION}",
        embed_iframe=False,
        require_admin=False,
    )
    hass.data[DOMAIN]["panel_registered"] = True
