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

from .const import DOMAIN, LOCAL_ROUTE_ID
from .display_preview import async_save_display_preview
from .render import render_text_image
from .queue import get_transfer_queue
from .transfer import DratekTransfer
from .automation import get_entity_auto_update_manager
from .gateway import async_send_gateway_payload
from .ws_shared import (
    _activate_entity_automation,
    _clear_entity_automation_if_matches,
    _clear_previous_entity_automation,
    _install_entity_automation,
    _load_project_data,
    _request_entity_automation_refresh,
)


DESIGN_UPLOADS_KEY = "design_uploads"
DESIGN_UPLOAD_CHUNK_BYTES = 64 * 1024
DESIGN_UPLOAD_MAX_CHUNKS = 128
DESIGN_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
DESIGN_UPLOAD_TTL_SECONDS = 10 * 60


async def _async_route_preference(
    hass: HomeAssistant, address: str
) -> tuple[Any, str, str]:
    """Return routing settings without depending on an active automation."""
    manager = get_entity_auto_update_manager(hass)
    config = manager._configs.get(address.upper()) or {}
    project_data = await _load_project_data(hass)
    saved_route = str(
        project_data.get("device_gateway_preferences", {}).get(address.upper()) or ""
    )
    if saved_route:
        return manager, "manual", saved_route
    return (
        manager,
        str(config.get("gateway_selection") or "auto"),
        str(config.get("manual_gateway_id") or ""),
    )


async def _async_submit_routed_transfer(
    hass: HomeAssistant,
    *,
    address: str,
    operation: str,
    local_runner,
    gateway_runner_factory,
    wait_for_completion: bool,
) -> dict[str, Any]:
    """Submit through a pinned route or the smart multi-gateway pool."""
    manager, gateway_selection, manual_route = await _async_route_preference(
        hass, address
    )
    queue = get_transfer_queue(hass)
    if (
        gateway_selection == "manual"
        and manual_route
        and manual_route != LOCAL_ROUTE_ID
    ):
        route = {"id": manual_route, "name": "DRATEK eInk gateway", "rssi": None}
        result = await queue.async_submit(
            resource=f"gateway:{manual_route}",
            transport_type="gateway",
            transport_name=str(route["name"]),
            address=address,
            operation=operation,
            runner=gateway_runner_factory(route),
            wait_for_completion=wait_for_completion,
        )
        if result and result.get("ok") is not False:
            return result
        _LOGGER.warning(
            "[%s] Pinned gateway %s failed or is offline (%s); falling back to other active gateways / local Bluetooth.",
            address, manual_route, result.get("error") if result else "unreachable"
        )

    routes = await manager._async_gateway_routes(address)
    if routes:
        result = await queue.async_submit_gateway_routes(
            routes=routes,
            address=address,
            operation=operation,
            runner_factory=gateway_runner_factory,
            wait_for_completion=wait_for_completion,
        )
        if result and result.get("ok") is not False:
            return result
    return await queue.async_submit(
        resource="local",
        transport_type="local",
        transport_name="Home Assistant Bluetooth",
        address=address,
        operation=operation,
        runner=local_runner,
        wait_for_completion=wait_for_completion,
    )


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
        vol.Optional("template_ids"): [str],
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
        automation = msg.get("automation")
        automation = await _install_entity_automation(
            hass, address, automation, image=image, svg_template=msg.get("svg_template")
        )


        target_gateway_id = str(msg.get("gateway_id") or "")
        transport_name = ""
        manager, gateway_selection, manual_route = await _async_route_preference(
            hass, address
        )
        gateway_routes: list[dict[str, Any]] = []

        if not target_gateway_id and gateway_selection == "manual" and manual_route:
            if manual_route != LOCAL_ROUTE_ID:
                target_gateway_id = manual_route
        elif not target_gateway_id and gateway_selection != "manual":
            gateway_routes = await manager._async_gateway_routes(address)
            if gateway_routes:
                best = gateway_routes[0]
                target_gateway_id = str(best["id"])
                transport_name = str(best["name"])

        use_gateway = bool(target_gateway_id and target_gateway_id != LOCAL_ROUTE_ID)

        def gateway_runner_factory(route: dict[str, Any]):
            selected_gateway_id = str(route.get("id") or target_gateway_id)
            selected_gateway_name = str(
                route.get("name") or transport_name or "DRATEK eInk gateway"
            )

            async def run_gateway(add_log) -> dict[str, Any]:
                try:
                    add_log(
                        f"Sending editor design {image.width}x{image.height} via gateway "
                        f"{selected_gateway_name} (display RSSI {route.get('rssi', 'unknown')} dBm)."
                    )
                    res = await async_send_gateway_payload(
                        hass,
                        selected_gateway_id,
                        address,
                        sdk_type,
                        image,
                        transform,
                        orientation,
                        msg.get("software_version"),
                        log_callback=add_log,
                    )
                    if res and res.get("ok") is not False:
                        try:
                            await async_save_display_preview(
                                hass, address, image, orientation, list(msg.get("template_ids") or [])
                            )
                        except Exception as exc:
                            add_log(f"Display updated, but preview could not be saved: {exc}")
                        await _activate_entity_automation(hass, address, automation)
                        await _request_entity_automation_refresh(hass, address, automation)
                        return res
                    return res or {"ok": False, "error": "Gateway transfer failed."}
                except BaseException:
                    await _clear_entity_automation_if_matches(hass, address, automation)
                    raise

            return run_gateway

        async def run_local(add_log) -> dict[str, Any]:
            try:
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
                try:
                    await async_save_display_preview(
                        hass, address, image, orientation, list(msg.get("template_ids") or [])
                    )
                except Exception as exc:
                    add_log(f"Display updated, but its preview could not be saved: {exc}")
                await _activate_entity_automation(hass, address, automation)
                await _request_entity_automation_refresh(hass, address, automation)
                return {"ok": True, "address": address, "log": []}
            except BaseException:
                await _clear_entity_automation_if_matches(hass, address, automation)
                raise

        queue = get_transfer_queue(hass)
        if use_gateway and gateway_selection != "manual" and gateway_routes:
            result = await queue.async_submit_gateway_routes(
                routes=gateway_routes,
                address=address,
                operation="design",
                runner_factory=gateway_runner_factory,
                wait_for_completion=False,
            )
        elif use_gateway:
            result = await queue.async_submit(
                resource=f"gateway:{target_gateway_id}",
                transport_type="gateway",
                transport_name=transport_name or "DRATEK eInk gateway",
                address=address,
                operation="design",
                runner=gateway_runner_factory(
                    {"id": target_gateway_id, "name": transport_name, "rssi": None}
                ),
                wait_for_completion=False,
            )
        else:
            result = await queue.async_submit(
                resource="local",
                transport_type="local",
                transport_name="Home Assistant Bluetooth",
                address=address,
                operation="design",
                runner=run_local,
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
        vol.Optional("template_ids"): [str],
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
        automation = msg.get("automation")
        automation = await _install_entity_automation(
            hass, address, automation, image=image, svg_template=msg.get("svg_template")
        )


        async def run_transfer(add_log) -> dict[str, Any]:
            try:
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
                try:
                    await async_save_display_preview(
                        hass,
                        address,
                        image,
                        msg.get("orientation", "landscape"),
                        list(msg.get("template_ids") or []),
                    )
                except Exception as exc:
                    add_log(f"Display updated, but its preview could not be saved: {exc}")
                await _activate_entity_automation(hass, address, automation)
                await _request_entity_automation_refresh(hass, address, automation)
                return {"ok": True, "address": address, "log": []}
            except BaseException:
                await _clear_entity_automation_if_matches(hass, address, automation)
                raise

        def gateway_runner_factory(route: dict[str, Any]):
            async def run_gateway(add_log) -> dict[str, Any]:
                try:
                    add_log(
                        f"Chunked editor design {image.width}x{image.height} routed via "
                        f"{route.get('name') or route['id']} ({route.get('rssi', 'unknown')} dBm)."
                    )
                    result = await async_send_gateway_payload(
                        hass,
                        str(route["id"]),
                        address,
                        sdk_type,
                        image,
                        msg.get("transform"),
                        msg.get("orientation", "landscape"),
                        msg.get("software_version"),
                        log_callback=add_log,
                    )
                    if result and result.get("ok") is not False:
                        try:
                            await async_save_display_preview(
                                hass,
                                address,
                                image,
                                msg.get("orientation", "landscape"),
                                list(msg.get("template_ids") or []),
                            )
                        except Exception as exc:
                            add_log(f"Display updated, but its preview could not be saved: {exc}")
                        await _activate_entity_automation(hass, address, automation)
                        await _request_entity_automation_refresh(hass, address, automation)
                    return result or {"ok": False, "error": "Gateway transfer failed."}
                except BaseException:
                    await _clear_entity_automation_if_matches(hass, address, automation)
                    raise

            return run_gateway

        result = await _async_submit_routed_transfer(
            hass,
            address=address,
            operation="design",
            local_runner=run_transfer,
            gateway_runner_factory=gateway_runner_factory,
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

        def gateway_runner_factory(route: dict[str, Any]):
            async def run_gateway(add_log) -> dict[str, Any]:
                add_log(
                    f"Sending partial design via {route.get('name') or route['id']} "
                    f"({route.get('rssi', 'unknown')} dBm)."
                )
                result = await async_send_gateway_payload(
                    hass,
                    str(route["id"]),
                    address,
                    sdk_type,
                    image,
                    software_version=0,
                    log_callback=add_log,
                    partial=(msg["x"], msg["y"], msg["width"], msg["height"]),
                )
                return result or {"ok": False, "error": "Gateway transfer failed."}

            return run_gateway

        result = await _async_submit_routed_transfer(
            hass,
            address=address,
            operation="partial_design",
            local_runner=run_transfer,
            gateway_runner_factory=gateway_runner_factory,
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
                await async_save_display_preview(hass, address, image, template_ids=[])
            except Exception as exc:
                add_log(f"Display updated, but its preview could not be saved: {exc}")
            return {"ok": True, "address": address, "text": text, "log": []}

        def gateway_runner_factory(route: dict[str, Any]):
            async def run_gateway(add_log) -> dict[str, Any]:
                add_log(
                    f"Sending text via {route.get('name') or route['id']} "
                    f"({route.get('rssi', 'unknown')} dBm)."
                )
                result = await async_send_gateway_payload(
                    hass,
                    str(route["id"]),
                    address,
                    sdk_type,
                    image,
                    log_callback=add_log,
                )
                if result and result.get("ok") is not False:
                    try:
                        await async_save_display_preview(hass, address, image, template_ids=[])
                    except Exception as exc:
                        add_log(f"Display updated, but its preview could not be saved: {exc}")
                return result or {"ok": False, "error": "Gateway transfer failed."}

            return run_gateway

        result = await _async_submit_routed_transfer(
            hass,
            address=address,
            operation="text",
            local_runner=run_transfer,
            gateway_runner_factory=gateway_runner_factory,
            wait_for_completion=True,
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
