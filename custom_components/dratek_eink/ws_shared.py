"""Storage access and entity-automation helpers shared by the websocket commands."""

from __future__ import annotations

from typing import Any
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .automation import get_entity_auto_update_manager
from .const import DOMAIN
from .project_storage import normalize_project_data

PROJECT_STORE_KEY = "dratek_eink.projects"
PROJECT_STORE_VERSION = 1
GATEWAY_PREFERENCES_STORE_KEY = "dratek_eink.gateway_preferences"
GATEWAY_PREFERENCES_STORE_VERSION = 1
PROJECT_STORE_DATA_KEY = "project_store"
GATEWAY_PREFERENCES_STORE_DATA_KEY = "gateway_preferences_store"
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
) -> dict[str, Any] | None:
    """Activate the HA bindings that belong to a successfully written design if enabled."""
    config = dict(automation) if isinstance(automation, dict) else None
    if (
        config
        and config.get("enabled") is True
        and isinstance(config.get("bindings"), list)
        and config["bindings"]
    ):
        # Identifies this exact queued design. If an older transfer fails after a
        # newer one was queued, its rollback must not delete the newer bindings.
        config["installation_id"] = uuid.uuid4().hex
        await get_entity_auto_update_manager(hass).async_set_config(address, config)
        return config
    await _clear_previous_entity_automation(hass, address)
    return None


async def _clear_entity_automation_if_matches(
    hass: HomeAssistant,
    address: str,
    automation: dict[str, Any] | None,
) -> None:
    """Rollback only the automation belonging to a failed queued upload."""
    await get_entity_auto_update_manager(hass).async_clear_config_if_matches(
        address, automation
    )


async def _request_entity_automation_refresh(
    hass: HomeAssistant,
    address: str,
    automation: dict[str, Any] | None,
) -> None:
    """Check current HA values after a queued design reaches the display if enabled."""
    if automation and isinstance(automation, dict) and automation.get("enabled") is True:
        await get_entity_auto_update_manager(hass).async_request_refresh(address)



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


def _gateway_preferences_store(hass: HomeAssistant) -> Store:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get(GATEWAY_PREFERENCES_STORE_DATA_KEY)
    if store is None:
        store = Store(
            hass,
            GATEWAY_PREFERENCES_STORE_VERSION,
            GATEWAY_PREFERENCES_STORE_KEY,
        )
        domain_data[GATEWAY_PREFERENCES_STORE_DATA_KEY] = store
    return store


def _normalize_gateway_preferences(value: Any) -> dict[str, str]:
    source = value.get("preferences") if isinstance(value, dict) else None
    if not isinstance(source, dict):
        return {}
    return {
        _normalize_address(address): str(gateway_id).strip()
        for address, gateway_id in source.items()
        if _normalize_address(address) and str(gateway_id or "").strip()
    }


async def _save_gateway_preferences(
    hass: HomeAssistant, preferences: dict[str, Any]
) -> dict[str, str]:
    normalized = _normalize_gateway_preferences({"preferences": preferences})
    await _gateway_preferences_store(hass).async_save({"preferences": normalized})
    return normalized


async def _load_project_data(hass: HomeAssistant) -> dict[str, Any]:
    domain_data = hass.data.setdefault(DOMAIN, {})
    cached = domain_data.get(PROJECT_DATA_CACHE_KEY)
    if isinstance(cached, dict):
        return cached
    normalized = normalize_project_data(await _project_store(hass).async_load())
    persisted_preferences = _normalize_gateway_preferences(
        await _gateway_preferences_store(hass).async_load()
    )
    if persisted_preferences:
        normalized["device_gateway_preferences"].update(persisted_preferences)
    elif normalized["device_gateway_preferences"]:
        # One-time migration from the original shared project store.
        await _save_gateway_preferences(
            hass, normalized["device_gateway_preferences"]
        )
    domain_data[PROJECT_DATA_CACHE_KEY] = normalized
    return normalized


def _normalize_address(address: str) -> str:
    return str(address or "").strip().upper()
