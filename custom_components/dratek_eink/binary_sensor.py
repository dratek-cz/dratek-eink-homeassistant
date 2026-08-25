"""Connectivity entities for physical DRATEK eInk displays."""

from __future__ import annotations

import time
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DISCOVERY_GRACE_SECONDS
from .device_registry import (
    display_device_info,
    display_state,
    display_states,
    display_update_signal,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add one connectivity entity for each discovered physical display."""
    entities: dict[str, DisplayConnectivityBinarySensor] = {}

    def _add_or_refresh(address: str) -> None:
        normalized = str(address or "").strip().upper()
        if not normalized:
            return
        entity = entities.get(normalized)
        if entity is None:
            entity = DisplayConnectivityBinarySensor(normalized)
            entities[normalized] = entity
            async_add_entities([entity])
        elif entity.hass is not None:
            entity.async_write_ha_state()

    for address in display_states(hass):
        _add_or_refresh(address)
    entry.async_on_unload(
        async_dispatcher_connect(
            hass, display_update_signal(entry.entry_id), _add_or_refresh
        )
    )


class DisplayConnectivityBinarySensor(BinarySensorEntity):
    """Whether a display was heard during the current discovery window."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_name = "Dostupnost"
    _attr_icon = "mdi:bluetooth-connect"

    def __init__(self, address: str) -> None:
        self.address = address
        self._attr_unique_id = f"display_{address}_connectivity"

    @property
    def device_info(self) -> dict[str, Any]:
        return display_device_info(self.hass, self.address)

    @property
    def is_on(self) -> bool | None:
        state = display_state(self.hass, self.address)
        seen_at = state.get("last_seen_at")
        if not isinstance(seen_at, (int, float)) or seen_at <= 0:
            return None
        return (
            not bool(state.get("temporarily_unseen"))
            and time.time() - float(seen_at) <= DISCOVERY_GRACE_SECONDS
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        state = display_state(self.hass, self.address)
        return {
            "adresa": self.address,
            "dočasně_neviděn": bool(state.get("temporarily_unseen")),
        }
