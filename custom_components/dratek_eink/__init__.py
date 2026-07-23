from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, PANEL_VERSION
from .render import render_text_image
from .queue import get_transfer_queue
from .transfer import DratekTransfer

_LOGGER = logging.getLogger(__name__)
PANEL_URL_PATH = "dratek-eink"
PANEL_STATIC_PATH = f"/{DOMAIN}_panel"
OVERVIEW_CARD_MODULE_URL = (
    f"{PANEL_STATIC_PATH}/dratek-eink-overview-card.js?v={PANEL_VERSION}"
)

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
    from .automation import get_entity_auto_update_manager
    from .websocket import async_setup as async_setup_websocket

    hass.data.setdefault(DOMAIN, {})
    if not hass.data[DOMAIN].get("websocket_setup"):
        async_setup_websocket(hass)
        hass.data[DOMAIN]["websocket_setup"] = True
    await get_entity_auto_update_manager(hass).async_initialize()

    async def handle_send_text(call: ServiceCall) -> None:
        address = call.data["address"]
        sdk_type = call.data["sdk_type"]
        text = call.data["text"]
        font_size = call.data.get("font_size")
        color = call.data["color"]

        image = await hass.async_add_executor_job(render_text_image, sdk_type, text, font_size, color)
        async def run_transfer(add_log):
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_image(address, sdk_type, image)
            return {"ok": True, "address": address, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="service_text",
            runner=run_transfer,
        )
        if not result.get("ok"):
            raise RuntimeError(result.get("error") or "DRATEK eInk transfer failed.")

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
        frontend.add_extra_js_url(hass, OVERVIEW_CARD_MODULE_URL)
        return
    if PANEL_URL_PATH in hass.data.get("frontend_panels", {}):
        frontend.add_extra_js_url(hass, OVERVIEW_CARD_MODULE_URL)
        hass.data[DOMAIN]["panel_registered"] = True
        return

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_STATIC_PATH, str(frontend_path), cache_headers=False)]
    )
    frontend.add_extra_js_url(hass, OVERVIEW_CARD_MODULE_URL)

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
