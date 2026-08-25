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
import base64
from typing import Any

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN
from .meteoradar import async_render_meteoradar
from .device_registry import (
    display_device_info,
    display_states,
    display_update_signal,
)
from .display_preview import async_display_preview

_LOGGER = logging.getLogger(__name__)


def _encode_png(image) -> bytes:
    """PNG-encode off the event loop.

    A whole-country radar frame is large enough that encoding it inline blocked
    the loop on every snapshot request, and a camera entity is polled by
    anything that shows a preview.
    """
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    async_add_entities([DratekMeteoradarCamera(entry.entry_id)])

    display_cameras: dict[str, DratekDisplayPreviewCamera] = {}

    def _add_or_refresh(address: str) -> None:
        normalized = str(address or "").strip().upper()
        if not normalized:
            return
        camera = display_cameras.get(normalized)
        if camera is None:
            camera = DratekDisplayPreviewCamera(normalized)
            display_cameras[normalized] = camera
            async_add_entities([camera], update_before_add=True)
        elif camera.hass is not None:
            camera.hass.async_create_task(camera.async_update_ha_state(force_refresh=True))

    for address in display_states(hass):
        _add_or_refresh(address)
    entry.async_on_unload(
        async_dispatcher_connect(
            hass, display_update_signal(entry.entry_id), _add_or_refresh
        )
    )


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
            "name": "DRATEK eInk · Interní · Meteoradar",
            "manufacturer": "DRATEK.CZ",
            "model": "Interní obrazová služba",
            "entry_type": DeviceEntryType.SERVICE,
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
        return await self.hass.async_add_executor_job(_encode_png, image)


def _decode_png_data_url(data_url: str) -> bytes | None:
    """Decode only the PNG data URLs written by display_preview.py."""
    prefix = "data:image/png;base64,"
    if not isinstance(data_url, str) or not data_url.startswith(prefix):
        return None
    try:
        return base64.b64decode(data_url[len(prefix):], validate=True)
    except (ValueError, TypeError):
        return None


class DratekDisplayPreviewCamera(Camera):
    """The image most recently transferred successfully to one display."""

    _attr_has_entity_name = True
    _attr_name = "Poslední obraz"
    _attr_icon = "mdi:image-outline"
    _attr_should_poll = False
    _attr_content_type = "image/png"

    def __init__(self, address: str) -> None:
        super().__init__()
        self.address = address
        self._attr_unique_id = f"display_{address}_preview"
        self._attr_available = False
        self._preview: dict[str, Any] | None = None

    @property
    def device_info(self) -> dict[str, Any]:
        return display_device_info(self.hass, self.address)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        preview = self._preview or {}
        return {
            "aktualizováno": preview.get("preview_updated_at"),
            "šířka": preview.get("preview_width"),
            "výška": preview.get("preview_height"),
            "orientace": preview.get("preview_orientation"),
        }

    async def async_update(self) -> None:
        self._preview = await async_display_preview(self.hass, self.address)
        self._attr_available = bool(
            self._preview and self._preview.get("preview_image")
        )

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        preview = await async_display_preview(self.hass, self.address)
        if not preview:
            return None
        data_url = preview.get("preview_image")
        return await self.hass.async_add_executor_job(_decode_png_data_url, data_url)
