"""Stable Home Assistant config subentries for integration-owned services."""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType

from homeassistant.config_entries import ConfigEntry, ConfigSubentry
from homeassistant.core import HomeAssistant

from .const import DOMAIN


@dataclass(frozen=True, slots=True)
class InternalServiceGroup:
    """Metadata shared by config subentries, service devices and entities."""

    subentry_type: str
    title: str
    identifier_suffix: str | None
    model: str

    def identifier(self, config_entry_id: str) -> str:
        """Return the pre-0.1.341 device identifier so migration is lossless."""
        if self.identifier_suffix is None:
            return config_entry_id
        return f"{config_entry_id}_{self.identifier_suffix}"


INTERNAL_SERVICE_GROUPS = (
    InternalServiceGroup("ui", "Rozhraní", "ui", "Interní diagnostika"),
    InternalServiceGroup(
        "scheduler",
        "Automatické zápisy",
        "scheduler",
        "Interní diagnostika",
    ),
    InternalServiceGroup(
        "transfer",
        "Přenos do zařízení",
        "transfer",
        "Interní diagnostika",
    ),
    InternalServiceGroup(
        "meteoradar",
        "Meteoradar",
        None,
        "Interní obrazová služba",
    ),
)
INTERNAL_SERVICE_GROUP_BY_TYPE = {
    group.subentry_type: group for group in INTERNAL_SERVICE_GROUPS
}


def internal_service_subentries_data() -> list[dict[str, object]]:
    """Return subentry definitions accepted by ConfigFlow.async_create_entry."""
    return [
        {
            "subentry_type": group.subentry_type,
            "data": {},
            "title": group.title,
            "unique_id": f"{DOMAIN}:{group.subentry_type}",
        }
        for group in INTERNAL_SERVICE_GROUPS
    ]


def ensure_internal_service_subentries(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, str]:
    """Create any missing fixed subentries and return type-to-id mapping."""
    by_type = {
        subentry.subentry_type: subentry
        for subentry in entry.subentries.values()
        if subentry.subentry_type in INTERNAL_SERVICE_GROUP_BY_TYPE
    }
    for group in INTERNAL_SERVICE_GROUPS:
        if group.subentry_type in by_type:
            continue
        subentry = ConfigSubentry(
            data=MappingProxyType({}),
            subentry_type=group.subentry_type,
            title=group.title,
            unique_id=f"{DOMAIN}:{group.subentry_type}",
        )
        hass.config_entries.async_add_subentry(entry, subentry)
        by_type[group.subentry_type] = subentry
    return {
        subentry_type: subentry.subentry_id
        for subentry_type, subentry in by_type.items()
    }


def internal_service_subentry_id(entry: ConfigEntry, subentry_type: str) -> str:
    """Return the id of one required internal service group."""
    for subentry in entry.subentries.values():
        if subentry.subentry_type == subentry_type:
            return subentry.subentry_id
    raise RuntimeError(f"Missing DRATEK eInk service subentry: {subentry_type}")
