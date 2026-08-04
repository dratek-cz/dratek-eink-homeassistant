"""Storage access and entity-automation helpers shared by the websocket commands."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .automation import get_entity_auto_update_manager
from .const import DOMAIN
from .project_storage import normalize_project_data

PROJECT_STORE_KEY = "dratek_eink.projects"
PROJECT_STORE_VERSION = 1
PROJECT_STORE_DATA_KEY = "project_store"
PROJECT_DATA_CACHE_KEY = "project_data_cache"
DISCOVERY_CACHE_KEY = "dratek_eink.discovery_cache"
DISCOVERY_GRACE_SECONDS = 5 * 60


async def _clear_previous_entity_automation(
    hass: HomeAssistant, address: str
) -> None:
    """Remove every scheduled update before accepting a replacement design."""
    await get_entity_auto_update_manager(hass).async_set_config(address, None)


async def _install_entity_automation(
    hass: HomeAssistant,
    address: str,
    automation: dict[str, Any] | None,
) -> None:
    """Activate the HA bindings that belong to a successfully written design."""
    config = dict(automation) if isinstance(automation, dict) else None
    if config and isinstance(config.get("bindings"), list) and config["bindings"]:
        config["enabled"] = True
        await get_entity_auto_update_manager(hass).async_set_config(address, config)
        return
    await _clear_previous_entity_automation(hass, address)


def _battery_payload(device: Any) -> dict[str, Any]:
    """Expose raw voltage data and the CR2450 capacity estimate."""
    return {
        "battery": device.battery,
        "battery_raw": device.battery,
        "battery_voltage": device.battery_voltage,
        "battery_percent": device.battery_percent,
        "battery_estimated": True,
    }


def _project_store(hass: HomeAssistant) -> Store:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get(PROJECT_STORE_DATA_KEY)
    if store is None:
        store = Store(hass, PROJECT_STORE_VERSION, PROJECT_STORE_KEY)
        domain_data[PROJECT_STORE_DATA_KEY] = store
    return store


async def _load_project_data(hass: HomeAssistant) -> dict[str, Any]:
    domain_data = hass.data.setdefault(DOMAIN, {})
    cached = domain_data.get(PROJECT_DATA_CACHE_KEY)
    if isinstance(cached, dict):
        return cached
    normalized = normalize_project_data(await _project_store(hass).async_load())
    domain_data[PROJECT_DATA_CACHE_KEY] = normalized
    return normalized


def _normalize_address(address: str) -> str:
    return str(address or "").strip().upper()
