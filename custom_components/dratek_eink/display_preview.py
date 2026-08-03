"""Persistent snapshots of the image last written to each physical display."""

from __future__ import annotations

import base64
import asyncio
import io
import time
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from PIL import Image

from .const import DOMAIN

PREVIEW_STORE_KEY = "dratek_eink.display_previews"
PREVIEW_STORE_VERSION = 1
PREVIEW_STORE_DATA_KEY = "display_preview_store"
PREVIEW_DATA_CACHE_KEY = "display_preview_data"
PREVIEW_SAVE_LOCK_KEY = "display_preview_save_lock"


def _preview_store(hass: HomeAssistant) -> Store:
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = domain_data.get(PREVIEW_STORE_DATA_KEY)
    if store is None:
        store = Store(hass, PREVIEW_STORE_VERSION, PREVIEW_STORE_KEY)
        domain_data[PREVIEW_STORE_DATA_KEY] = store
    return store


async def async_load_display_previews(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Load the persistent last-written image map."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    cached = domain_data.get(PREVIEW_DATA_CACHE_KEY)
    if isinstance(cached, dict):
        return cached
    stored = await _preview_store(hass).async_load()
    previews = stored.get("previews", {}) if isinstance(stored, dict) else {}
    normalized = {
        str(address).strip().upper(): dict(preview)
        for address, preview in previews.items()
        if isinstance(address, str) and isinstance(preview, dict)
    }
    domain_data[PREVIEW_DATA_CACHE_KEY] = normalized
    return normalized


def _encode_png_data_url(image: Image.Image) -> str:
    output = io.BytesIO()
    image.convert("RGB").save(output, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


async def async_save_display_preview(
    hass: HomeAssistant,
    address: str,
    image: Image.Image,
    orientation: str | None = None,
    template_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Remember an image only after its transfer to the display succeeded."""
    normalized_address = str(address or "").strip().upper()
    if not normalized_address:
        raise ValueError("Display address is required.")
    source = image.convert("RGB")
    data_url = await hass.async_add_executor_job(_encode_png_data_url, source)
    preview = {
        "preview_image": data_url,
        "preview_updated_at": int(time.time() * 1000),
        "preview_width": source.width,
        "preview_height": source.height,
        "preview_orientation": orientation if orientation in {"portrait", "landscape"} else None,
    }
    domain_data = hass.data.setdefault(DOMAIN, {})
    lock = domain_data.setdefault(PREVIEW_SAVE_LOCK_KEY, asyncio.Lock())
    async with lock:
        previews = await async_load_display_previews(hass)
        previous = previews.get(normalized_address, {})
        if template_ids is None:
            if isinstance(previous.get("sent_template_ids"), list):
                preview["sent_template_ids"] = list(previous["sent_template_ids"])
        else:
            preview["sent_template_ids"] = [
                str(template_id).strip()
                for template_id in template_ids[:2]
                if str(template_id).strip()
            ]
        previews[normalized_address] = preview
        await _preview_store(hass).async_save({"previews": previews})
    return preview


async def async_display_preview(hass: HomeAssistant, address: str) -> dict[str, Any] | None:
    """Return the last successfully written image for one display."""
    previews = await async_load_display_previews(hass)
    return previews.get(str(address or "").strip().upper())
