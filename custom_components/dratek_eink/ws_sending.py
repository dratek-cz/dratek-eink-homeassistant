"""Websocket commands that push a rendered design to a display."""

from __future__ import annotations

from typing import Any
import base64
import io
import time

from PIL import Image
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
import voluptuous as vol

from .const import DOMAIN
from .display_preview import async_save_display_preview
from .render import render_text_image
from .queue import get_transfer_queue
from .transfer import DratekTransfer
from .ws_shared import _clear_previous_entity_automation

DESIGN_UPLOADS_KEY = "design_uploads"
DESIGN_UPLOAD_CHUNK_BYTES = 64 * 1024
DESIGN_UPLOAD_MAX_CHUNKS = 128
DESIGN_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
DESIGN_UPLOAD_TTL_SECONDS = 10 * 60


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_design",
        "address": str,
        "sdk_type": int,
        "image": str,
        "orientation": str,
        "transform": str,
        vol.Optional("software_version"): int,
        vol.Optional("automation"): dict,
    }
)
@websocket_api.async_response
async def websocket_send_design(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = msg["address"]
    sdk_type = msg["sdk_type"]
    image_data = msg["image"]
    orientation = msg.get("orientation", "landscape")
    transform = msg.get("transform")
    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        raw = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        await _clear_previous_entity_automation(hass, address)

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(f"Sending editor design {image.width}x{image.height} to SDK type {sdk_type}.")
            if transform:
                add_log(f"Using display transform: {transform}.")
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_image(
                address,
                sdk_type,
                image,
                transform,
                orientation,
                msg.get("software_version"),
            )
            add_log("Design sent.")
            # Uploads are one-shot: drop any schedule that was registered while
            # this transfer was queued, so it cannot repaint over the new picture.
            await _clear_previous_entity_automation(hass, address)
            try:
                await async_save_display_preview(hass, address, image, orientation)
            except Exception as exc:
                add_log(f"Display updated, but its preview could not be saved: {exc}")
            return {"ok": True, "address": address, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="design",
            runner=run_transfer,
            wait_for_completion=False,
        )
    except Exception as exc:  # BLE stack can raise platform-specific exceptions
        log(f"Send failed: {exc}")
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": address,
                "error": str(exc),
                "log": log_lines,
            },
        )
        return

    connection.send_result(msg["id"], result)


def _design_uploads(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Return temporary chunked design uploads and discard abandoned sessions."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    uploads = domain_data.setdefault(DESIGN_UPLOADS_KEY, {})
    cutoff = time.time() - DESIGN_UPLOAD_TTL_SECONDS
    for upload_id, upload in list(uploads.items()):
        if float(upload.get("created_at", 0)) < cutoff:
            uploads.pop(upload_id, None)
    return uploads


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/upload_design_chunk",
        "upload_id": str,
        "index": vol.All(int, vol.Range(min=0, max=DESIGN_UPLOAD_MAX_CHUNKS - 1)),
        "total": vol.All(int, vol.Range(min=1, max=DESIGN_UPLOAD_MAX_CHUNKS)),
        "data": str,
    }
)
@websocket_api.async_response
async def websocket_upload_design_chunk(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Receive one bounded part of a rendered design without a huge WS frame."""
    data = msg["data"]
    if len(data) > DESIGN_UPLOAD_CHUNK_BYTES:
        connection.send_error(msg["id"], "chunk_too_large", "Část obrázku překročila povolenou velikost.")
        return
    if msg["index"] >= msg["total"]:
        connection.send_error(msg["id"], "invalid_chunk", "Číslo části je mimo deklarovaný počet.")
        return

    uploads = _design_uploads(hass)
    upload = uploads.setdefault(
        msg["upload_id"],
        {"created_at": time.time(), "total": msg["total"], "chunks": {}},
    )
    if upload["total"] != msg["total"]:
        uploads.pop(msg["upload_id"], None)
        connection.send_error(msg["id"], "invalid_upload", "Počet částí se během nahrávání změnil.")
        return
    upload["chunks"][msg["index"]] = data
    received_bytes = sum(len(chunk) for chunk in upload["chunks"].values())
    if received_bytes > DESIGN_UPLOAD_MAX_BYTES:
        uploads.pop(msg["upload_id"], None)
        connection.send_error(msg["id"], "upload_too_large", "Obrázek překročil maximální velikost přenosu.")
        return
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "upload_id": msg["upload_id"],
            "received": len(upload["chunks"]),
            "total": upload["total"],
        },
    )


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/commit_design_upload",
        "upload_id": str,
        "address": str,
        "sdk_type": int,
        "orientation": str,
        "transform": str,
        vol.Optional("software_version"): int,
        vol.Optional("automation"): dict,
    }
)
@websocket_api.async_response
async def websocket_commit_design_upload(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Reassemble a confirmed upload and enqueue its BLE transfer."""
    uploads = _design_uploads(hass)
    upload = uploads.pop(msg["upload_id"], None)
    if upload is None:
        connection.send_error(msg["id"], "upload_not_found", "Nahraný obrázek nebyl nalezen nebo vypršel.")
        return
    chunks = upload["chunks"]
    total = upload["total"]
    missing = [index for index in range(total) if index not in chunks]
    if missing:
        connection.send_error(
            msg["id"],
            "upload_incomplete",
            f"Chybí části obrázku: {', '.join(str(index + 1) for index in missing[:8])}.",
        )
        return

    try:
        image_data = "".join(chunks[index] for index in range(total))
        raw = base64.b64decode(image_data, validate=True)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        address = msg["address"]
        sdk_type = msg["sdk_type"]
        await _clear_previous_entity_automation(hass, address)

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(
                f"Chunked editor design {image.width}x{image.height} "
                f"({total} parts) received for SDK type {sdk_type}."
            )
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_image(
                address,
                sdk_type,
                image,
                msg.get("transform"),
                msg.get("orientation", "landscape"),
                msg.get("software_version"),
            )
            add_log("Design sent.")
            # Uploads are one-shot: drop any schedule that was registered while
            # this transfer was queued, so it cannot repaint over the new picture.
            await _clear_previous_entity_automation(hass, address)
            try:
                await async_save_display_preview(
                    hass, address, image, msg.get("orientation", "landscape")
                )
            except Exception as exc:
                add_log(f"Display updated, but its preview could not be saved: {exc}")
            return {"ok": True, "address": address, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="design",
            runner=run_transfer,
            wait_for_completion=False,
        )
    except Exception as exc:
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": msg["address"],
                "error": str(exc).strip() or type(exc).__name__,
                "log": [f"Chunked design commit failed: {type(exc).__name__}: {exc}"],
            },
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_partial_design",
        "address": str,
        "sdk_type": int,
        "image": str,
        "x": int,
        "y": int,
        "width": int,
        "height": int,
        "clear_screen": int,
        vol.Optional("transform"): str,
    }
)
@websocket_api.async_response
async def websocket_send_partial_design(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = msg["address"]
    sdk_type = msg["sdk_type"]
    image_data = msg["image"]
    transform = msg.get("transform")
    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        raw = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        # A partial write is still a manual write. Leaving the scheduled entity
        # refresh in place would let it repaint the whole panel a moment later and
        # wipe out what was just sent.
        await _clear_previous_entity_automation(hass, address)

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(
                "Sending partial editor design "
                f"{image.width}x{image.height} to SDK type {sdk_type} at "
                f"x={msg['x']}, y={msg['y']}."
            )
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_partial_image(
                address,
                sdk_type,
                image,
                msg["x"],
                msg["y"],
                msg["width"],
                msg["height"],
                msg.get("clear_screen", 0),
                transform,
            )
            add_log("Partial design sent.")
            return {"ok": True, "address": address, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="partial_design",
            runner=run_transfer,
            wait_for_completion=False,
        )
    except Exception as exc:  # BLE stack can raise platform-specific exceptions
        log(f"Partial send failed: {exc}")
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": address,
                "error": str(exc),
                "log": log_lines,
            },
        )
        return

    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/send_text",
        "address": str,
        "sdk_type": int,
        "text": str,
    }
)
@websocket_api.async_response
async def websocket_send_text(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = msg["address"]
    sdk_type = msg["sdk_type"]
    text = msg["text"]
    log_lines: list[str] = []

    def log(message: str) -> None:
        log_lines.append(message)

    try:
        image = await hass.async_add_executor_job(render_text_image, sdk_type, text, None, "black")
        # Sending text replaces the whole panel, so any refresh scheduled for the
        # previous design has to go with it.
        await _clear_previous_entity_automation(hass, address)

        async def run_transfer(add_log) -> dict[str, Any]:
            add_log(f"Rendering text '{text}' for SDK type {sdk_type}.")
            transfer = DratekTransfer(log=add_log, hass=hass)
            await transfer.send_image(address, sdk_type, image)
            add_log("Text sent.")
            try:
                await async_save_display_preview(hass, address, image)
            except Exception as exc:
                add_log(f"Display updated, but its preview could not be saved: {exc}")
            return {"ok": True, "address": address, "text": text, "log": []}

        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="text",
            runner=run_transfer,
        )
    except Exception as exc:  # BLE stack can raise platform-specific exceptions
        log(f"Send failed: {exc}")
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "address": address,
                "text": text,
                "error": str(exc),
                "log": log_lines,
            },
        )
        return

    connection.send_result(msg["id"], result)
