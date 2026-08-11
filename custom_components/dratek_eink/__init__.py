from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP, Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, PANEL_VERSION
from .render import render_text_image
from .queue import get_transfer_queue
from .transfer import DratekTransfer

_LOGGER = logging.getLogger(__name__)
# The Meteoradar template needs a live, always-current radar snapshot. A plain
# fetch buried in the render path would be invisible to the rest of Home
# Assistant, so it is a real camera entity instead - inspectable in Developer
# Tools like any other camera, and read through the same camera.async_get_image
# API a user's own camera entities already go through.
PLATFORMS: list[Platform] = [Platform.CAMERA]
PANEL_URL_PATH = "dratek-eink"
# The version belongs in the path, not in a ?v= query on the entry file alone.
# dratek-eink-panel.js imports its mixins with plain relative specifiers, and those
# requests carry no query, so a browser could keep serving mixins from an earlier
# release while the entry file was fresh - the panel then reported an old version
# in its header and ran old code against a new backend. A versioned prefix makes
# every URL below it new on each release, at any import depth.
PANEL_STATIC_PATH = f"/{DOMAIN}_panel/{PANEL_VERSION}"
OVERVIEW_CARD_MODULE_URL = f"{PANEL_STATIC_PATH}/dratek-eink-overview-card.js"

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
        # The service writes the whole panel, so it counts as a manual upload:
        # drop the display's scheduled entity refresh, otherwise the next tick
        # would repaint over the text that was just sent.
        await get_entity_auto_update_manager(hass).async_set_config(address, None)

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
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    from .automation import get_entity_auto_update_manager
    auto_update = get_entity_auto_update_manager(hass)

    async def _async_on_stop(_event: Any) -> None:
        await auto_update.async_stop()

    entry.async_on_unload(
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _async_on_stop)
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    from .automation import get_entity_auto_update_manager
    auto_update = get_entity_auto_update_manager(hass)
    await auto_update.async_stop()
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data.get(DOMAIN, {}).get("entries", {}).pop(entry.entry_id, None)
    return unloaded


async def _async_register_panel(hass: HomeAssistant) -> None:
    # The panel path contains the release version, so a single boolean cannot
    # describe its registration. During an integration reload that boolean can
    # survive while aiohttp has already dropped the old static resource; the
    # frontend then points at the new version and receives a 404. Track every
    # versioned path separately and always register the current one once.
    registered_panel_paths = hass.data[DOMAIN].setdefault(
        "registered_panel_static_paths", set()
    )
    if PANEL_STATIC_PATH not in registered_panel_paths:
        frontend_path = Path(__file__).parent / "frontend"
        static_configs = [
            StaticPathConfig(PANEL_STATIC_PATH, str(frontend_path), cache_headers=False)
        ]
        # Migrate the old all-in-one marker without registering the stable brand
        # route twice. A fresh Home Assistant process registers both resources.
        brand_registered = bool(
            hass.data[DOMAIN].get("brand_static_path_registered")
            or hass.data[DOMAIN].get("static_paths_registered")
        )
        brand_path = Path(__file__).parent / "brand"
        if brand_path.exists() and not brand_registered:
            static_configs.append(
                StaticPathConfig(f"/{DOMAIN}_brand", str(brand_path), cache_headers=True)
            )
        await hass.http.async_register_static_paths(static_configs)
        registered_panel_paths.add(PANEL_STATIC_PATH)
        if brand_path.exists():
            hass.data[DOMAIN]["brand_static_path_registered"] = True
        hass.data[DOMAIN]["static_paths_registered"] = True

    # Remove any stale extra_js_url entries from previous versions or reloads so
    # the frontend never attempts to fetch an old versioned path that returns 404
    # and breaks Home Assistant until a host reboot.
    for key in ("frontend_extra_module_url", "frontend_extra_js_url"):
        extra_urls = hass.data.get(key)
        if isinstance(extra_urls, (set, list)):
            stale = [
                item for item in list(extra_urls)
                if "dratek-eink-overview-card.js" in str(getattr(item, "url", item))
                or f"{DOMAIN}_panel" in str(getattr(item, "url", item))
            ]
            for old_item in stale:
                if isinstance(extra_urls, set):
                    extra_urls.discard(old_item)
                elif isinstance(extra_urls, list):
                    try:
                        extra_urls.remove(old_item)
                    except ValueError:
                        pass

    frontend.add_extra_js_url(hass, OVERVIEW_CARD_MODULE_URL)


    registered_version = hass.data[DOMAIN].get("panel_registered_version")
    panel_exists = PANEL_URL_PATH in hass.data.get("frontend_panels", {})
    if panel_exists and registered_version == PANEL_VERSION:
        hass.data[DOMAIN]["panel_registered"] = True
        return
    if panel_exists:
        # The existing sidebar entry still contains the previous module URL.
        # Replacing it is the supported Home Assistant API for refreshing a
        # custom panel registration after an integration update.
        frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="dratek-eink-panel",
        frontend_url_path=PANEL_URL_PATH,
        sidebar_title="DRATEK eInk",
        sidebar_icon="mdi:tag-multiple-outline",
        module_url=f"{PANEL_STATIC_PATH}/dratek-eink-panel.js",
        embed_iframe=False,
        require_admin=False,
    )
    hass.data[DOMAIN]["panel_registered"] = True
    hass.data[DOMAIN]["panel_registered_version"] = PANEL_VERSION
