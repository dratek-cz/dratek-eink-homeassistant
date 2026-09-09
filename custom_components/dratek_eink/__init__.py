from __future__ import annotations

import logging
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP, Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_interval

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
PLATFORMS: list[Platform] = [Platform.BINARY_SENSOR, Platform.CAMERA, Platform.SENSOR]
GATEWAY_MONITOR_INTERVAL = timedelta(seconds=30)
GATEWAY_DISPLAY_DISCOVERY_INTERVAL_SECONDS = 5 * 60
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
    from .service_groups import ensure_internal_service_subentries

    ensure_internal_service_subentries(hass, entry)
    _register_internal_service_devices(hass, entry)
    _migrate_internal_service_entities(hass, entry)

    from .gateway import async_load_gateways, async_register_gateway_device
    gateways = await async_load_gateways(hass)
    for gateway in gateways:
        async_register_gateway_device(hass, entry.entry_id, gateway)

    # Migrate displays already known by an older integration version into HA's
    # device registry immediately, without waiting for a new BLE advertisement.
    from .device_registry import (
        async_register_gateway_displays,
        register_display_device,
        restore_registered_display_states,
    )
    from .ws_shared import _load_project_data

    # Entity platforms used to be forwarded before this state existed. After a
    # restart they therefore saw zero displays and the already persisted device
    # page stayed empty until a later scan happened to add entities dynamically.
    # Restore registry-known displays first, then overlay fresher config/project
    # metadata, and only then let sensor/camera/binary_sensor enumerate them.
    restore_registered_display_states(hass, entry.entry_id)
    discovered_display = entry.data.get("discovered_display")
    if isinstance(discovered_display, dict):
        register_display_device(
            hass, entry.entry_id, discovered_display, gateways
        )
    project_data = await _load_project_data(hass)
    device_names = project_data.get("device_names", {})
    for address, draft in project_data.get("device_drafts", {}).items():
        if not isinstance(draft, dict):
            continue
        register_display_device(
            hass,
            entry.entry_id,
            {
                **draft,
                "address": address,
                "display_name": str(device_names.get(address, "")),
            },
            gateways,
        )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    from .automation import get_entity_auto_update_manager
    auto_update = get_entity_auto_update_manager(hass)
    # async_unload_entry stops the manager. A config-entry reload does not run
    # async_setup again, so explicitly re-arm persisted automation timers here.
    await auto_update.async_initialize()

    if "gateway_monitor_unsubscribe" not in hass.data[DOMAIN]:
        from .gateway import async_refresh_all_gateways

        async def _async_refresh_known_gateways(_now: Any = None) -> None:
            try:
                gateways = await async_refresh_all_gateways(hass)
                for gateway in gateways:
                    async_register_gateway_device(hass, entry.entry_id, gateway)
                now = time.monotonic()
                last_scan = float(
                    hass.data[DOMAIN].get("gateway_display_registry_scan_at") or 0
                )
                if now - last_scan >= GATEWAY_DISPLAY_DISCOVERY_INTERVAL_SECONDS:
                    hass.data[DOMAIN]["gateway_display_registry_scan_at"] = now
                    await async_register_gateway_displays(
                        hass, entry.entry_id, gateways
                    )
            except Exception as exc:
                _LOGGER.debug("Automatic gateway refresh failed: %s", exc)

        unsubscribe = async_track_time_interval(
            hass,
            _async_refresh_known_gateways,
            GATEWAY_MONITOR_INTERVAL,
        )
        hass.data[DOMAIN]["gateway_monitor_unsubscribe"] = unsubscribe
        hass.async_create_task(_async_refresh_known_gateways())

        def _stop_gateway_monitor() -> None:
            cancel = hass.data.get(DOMAIN, {}).pop(
                "gateway_monitor_unsubscribe", None
            )
            if callable(cancel):
                cancel()

        entry.async_on_unload(_stop_gateway_monitor)

    async def _async_on_stop(_event: Any) -> None:
        await auto_update.async_stop()

    entry.async_on_unload(
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _async_on_stop)
    )
    return True


async def async_migrate_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    """Add service subentries to installations created before version 2."""
    from .service_groups import ensure_internal_service_subentries

    ensure_internal_service_subentries(hass, entry)
    if entry.version < 2:
        hass.config_entries.async_update_entry(entry, version=2, minor_version=0)
    return True


def _register_internal_service_devices(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:
    """Create or migrate integration-only blocks into HA's Services section.

    Re-registering the stable identifiers updates installations that created
    these records as ordinary devices in an older release. Physical gateways
    and displays use different identifiers and deliberately keep entry_type
    unset, so they remain in the Devices section.
    """
    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers.device_registry import DeviceEntryType

    from .service_groups import (
        INTERNAL_SERVICE_GROUPS,
        internal_service_subentry_id,
    )

    registry = dr.async_get(hass)
    for group in INTERNAL_SERVICE_GROUPS:
        identifier = group.identifier(entry.entry_id)
        subentry_id = internal_service_subentry_id(entry, group.subentry_type)
        identifiers = {(DOMAIN, identifier)}
        device = registry.async_get_device_by_identifier(
            (DOMAIN, identifier), entry.entry_id
        )
        if (
            device is not None
            and device.config_subentry_id != subentry_id
        ):
            registry.async_update_device(
                device.id,
                new_config_subentry_id=subentry_id,
                name=group.title,
            )
        registry.async_get_or_create(
            config_entry_id=entry.entry_id,
            config_subentry_id=subentry_id,
            identifiers=identifiers,
            name=group.title,
            manufacturer="DRATEK.CZ",
            model=group.model,
            sw_version=PANEL_VERSION,
            entry_type=DeviceEntryType.SERVICE,
        )


def _migrate_internal_service_entities(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:
    """Move existing internal entities under their matching service cards."""
    from homeassistant.helpers import entity_registry as er

    from .service_groups import internal_service_subentry_id

    registry = er.async_get(hass)
    targets = {
        "ui": internal_service_subentry_id(entry, "ui"),
        "scheduler": internal_service_subentry_id(entry, "scheduler"),
        "transfer": internal_service_subentry_id(entry, "transfer"),
        "meteoradar": internal_service_subentry_id(entry, "meteoradar"),
    }
    prefixes = {
        f"{entry.entry_id}_ui_": targets["ui"],
        f"{entry.entry_id}_scheduler_": targets["scheduler"],
        f"{entry.entry_id}_transfer_": targets["transfer"],
    }
    meteoradar_unique_id = f"{entry.entry_id}_meteoradar"
    for entity in er.async_entries_for_config_entry(registry, entry.entry_id):
        target = (
            targets["meteoradar"]
            if entity.unique_id == meteoradar_unique_id
            else next(
                (
                    subentry_id
                    for prefix, subentry_id in prefixes.items()
                    if str(entity.unique_id).startswith(prefix)
                ),
                None,
            )
        )
        if target is not None and entity.config_subentry_id != target:
            registry.async_update_entity(
                entity.entity_id,
                config_subentry_id=target,
            )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Platforms first. Stopping the scheduler up front meant that whenever a
    # platform refused to unload - the entry then stays loaded and Home
    # Assistant carries on using it - automatic updates were already dead, with
    # nothing to restart them short of restarting Home Assistant.
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unloaded:
        return False

    from .automation import get_entity_auto_update_manager

    await get_entity_auto_update_manager(hass).async_stop()
    hass.data.get(DOMAIN, {}).get("entries", {}).pop(entry.entry_id, None)
    return True


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
            static_configs.extend([
                StaticPathConfig(f"/{DOMAIN}_brand", str(brand_path), cache_headers=True),
                StaticPathConfig(f"/api/brands/{DOMAIN}", str(brand_path), cache_headers=True),
                StaticPathConfig(f"/api/brands/custom_integrations/{DOMAIN}", str(brand_path), cache_headers=True),
            ])
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
        # Every one of the panel's websocket commands is @require_admin: they
        # reach the host's serial ports, run esptool against them, push
        # firmware and edit the integration's own configuration. Leaving the
        # sidebar entry visible to non-admins would only offer a panel whose
        # every action comes back Unauthorized.
        require_admin=True,
    )
    hass.data[DOMAIN]["panel_registered"] = True
    hass.data[DOMAIN]["panel_registered_version"] = PANEL_VERSION
