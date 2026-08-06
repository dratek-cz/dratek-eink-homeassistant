"""A live black-outlined, red/white precipitation map of the Czech Republic.

The Meteoradar display template used to bind to `camera.meteoradar` - an entity
the user was expected to configure themselves, pointed at a RainViewer URL - but
RainViewer's tile path changes every ten minutes as new radar frames are
generated, so a plain Generic Camera stuck on one fixed URL would quietly start
serving a stale image once that frame aged out. This platform provides that
camera entity directly: it does the frame-path lookup itself on every snapshot
request (meteoradar.py, cached to that same ten-minute cadence RainViewer's data
actually changes on), so the entity behaves like any other camera - inspectable
in Developer Tools, readable through the same `camera.async_get_image` API a
user's own cameras go through - without any setup step.
"""

from __future__ import annotations

import io
import logging

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .meteoradar import async_render_meteoradar

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    async_add_entities([DratekMeteoradarCamera(entry.entry_id)])


class DratekMeteoradarCamera(Camera):
    """Snapshot camera for the whole-country precipitation map used by templates."""

    _attr_has_entity_name = True
    _attr_name = "Meteoradar"
    _attr_icon = "mdi:radar"
    _attr_entity_registry_enabled_default = True
    # ws_meteoradar.py and the Meteoradar template target camera.meteoradar
    # directly rather than looking the entity up, so the id has to land here on
    # first setup - this is only a suggestion for a brand new entity, not a
    # guarantee if that id is somehow already taken.
    _attr_suggested_object_id = "meteoradar"

    def __init__(self, entry_id: str) -> None:
        super().__init__()
        self._attr_unique_id = f"{entry_id}_meteoradar"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry_id)},
            "name": "DRATEK eInk",
            "manufacturer": "DRATEK.CZ",
        }

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        try:
            image = await async_render_meteoradar(self.hass)
        except Exception as exc:  # a radar-data hiccup must not break the entity
            _LOGGER.debug("Meteoradar render failed: %s", exc)
            return None
        if image is None:
            return None
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()
