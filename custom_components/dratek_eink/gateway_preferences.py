"""Persisted display-to-gateway route locks shared by every send path."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN


STORE_KEY = "dratek_eink.gateway_preferences"
STORE_VERSION = 1
STORE_DATA_KEY = "gateway_preferences_store"
CACHE_DATA_KEY = "gateway_preferences_cache"


def normalize_gateway_preferences(value: Any) -> dict[str, str]:
    """Normalize a stored route-lock mapping."""
    source = value.get("preferences") if isinstance(value, dict) else None
    if not isinstance(source, dict):
        return {}
    return {
        str(address or "").strip().upper(): str(gateway_id).strip()
        for address, gateway_id in source.items()
        if str(address or "").strip() and str(gateway_id or "").strip()
    }


def _store(hass: HomeAssistant) -> Store:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get(STORE_DATA_KEY)
    if store is None:
        store = Store(hass, STORE_VERSION, STORE_KEY)
        domain_data[STORE_DATA_KEY] = store
    return store


async def async_load_gateway_preferences(hass: HomeAssistant) -> dict[str, str]:
    """Load route locks once and share them with automation and websocket code."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    cached = domain_data.get(CACHE_DATA_KEY)
    if isinstance(cached, dict):
        return dict(cached)
    preferences = normalize_gateway_preferences(await _store(hass).async_load())
    domain_data[CACHE_DATA_KEY] = preferences
    return dict(preferences)


async def async_save_gateway_preferences(
    hass: HomeAssistant, preferences: dict[str, Any]
) -> dict[str, str]:
    """Save route locks and update the cache used by active automations."""
    normalized = normalize_gateway_preferences({"preferences": preferences})
    await _store(hass).async_save({"preferences": normalized})
    hass.data.setdefault(DOMAIN, {})[CACHE_DATA_KEY] = normalized
    return dict(normalized)
