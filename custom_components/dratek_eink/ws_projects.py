"""Websocket commands for stored projects and per-display drafts."""

from __future__ import annotations

from typing import Any
import time
import uuid

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .automation import get_entity_auto_update_manager
from .display_preview import async_display_preview, async_load_display_previews
from .ws_shared import (
    _load_project_data,
    _normalize_address,
    _project_store,
)


@websocket_api.websocket_command({"type": "dratek_eink/user_templates/list"})
@websocket_api.async_response
async def websocket_list_user_templates(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return templates shared by every eInk display in this integration."""
    data = await _load_project_data(hass)
    connection.send_result(msg["id"], {"templates": data["user_templates"]})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/user_templates/save",
        "template": dict,
    }
)
@websocket_api.async_response
async def websocket_save_user_template(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create or update one template in the integration-wide library."""
    template = dict(msg["template"])
    template_id = str(template.get("id") or f"user-template-{uuid.uuid4()}")
    if not template_id.startswith("user-template-"):
        connection.send_error(msg["id"], "invalid_id", "Invalid user template id.")
        return
    template.update(
        {
            "id": template_id,
            "title": str(template.get("title") or "Vlastní šablona"),
            "user_created": True,
            "updated_at": template.get("updated_at") or int(time.time()),
        }
    )
    data = await _load_project_data(hass)
    data["user_templates"] = [
        item for item in data["user_templates"] if item.get("id") != template_id
    ]
    data["user_templates"].append(template)
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"template": template})

@websocket_api.websocket_command({"type": "dratek_eink/projects/list"})
@websocket_api.async_response
async def websocket_list_projects(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    projects = [
        {
            "id": project["id"],
            "name": project["name"],
            "width": project["width"],
            "height": project["height"],
            "sdk_type": project.get("sdk_type"),
            "updated_at": project.get("updated_at"),
        }
        for project in data["projects"]
    ]
    projects.sort(key=lambda item: (item["name"] or "").lower())
    connection.send_result(msg["id"], {"projects": projects})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/projects/save",
        "project": dict,
    }
)
@websocket_api.async_response
async def websocket_save_project(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    project = dict(msg["project"])
    project_id = project.get("id") or str(uuid.uuid4())
    now = int(time.time())
    project.update(
        {
            "id": project_id,
            "name": str(project.get("name") or "DRATEK eInk projekt"),
            "updated_at": now,
        }
    )

    data = await _load_project_data(hass)
    projects = [item for item in data["projects"] if item.get("id") != project_id]
    projects.append(project)
    data["projects"] = projects
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"project": project})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/projects/load",
        "project_id": str,
    }
)
@websocket_api.async_response
async def websocket_load_project(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    project = next((item for item in data["projects"] if item.get("id") == msg["project_id"]), None)
    if not project:
        connection.send_error(msg["id"], "not_found", "Project was not found.")
        return
    connection.send_result(msg["id"], {"project": project})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/projects/delete",
        "project_id": str,
    }
)
@websocket_api.async_response
async def websocket_delete_project(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    data["projects"] = [item for item in data["projects"] if item.get("id") != msg["project_id"]]
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/device_drafts/load",
        "address": str,
    }
)
@websocket_api.async_response
async def websocket_load_device_draft(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    draft = data["device_drafts"].get(_normalize_address(msg["address"]))
    preview = await async_display_preview(hass, msg["address"])
    if preview:
        draft = {**(draft or {}), **preview}
    connection.send_result(msg["id"], {"draft": draft})


@websocket_api.websocket_command({"type": "dratek_eink/device_drafts/list"})
@websocket_api.async_response
async def websocket_list_device_drafts(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return all display drafts in one request for fast card previews."""
    data = await _load_project_data(hass)
    previews = await async_load_display_previews(hass)
    drafts = {
        _normalize_address(address): {**draft, **previews.get(_normalize_address(address), {})}
        for address, draft in data["device_drafts"].items()
        if isinstance(address, str) and isinstance(draft, dict)
    }
    for address, preview in previews.items():
        drafts.setdefault(address, {}).update(preview)
    connection.send_result(msg["id"], {"drafts": drafts})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/device_drafts/save",
        "address": str,
        "draft": dict,
    }
)
@websocket_api.async_response
async def websocket_save_device_draft(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = _normalize_address(msg["address"])
    draft = dict(msg["draft"])
    draft.update(
        {
            "device_address": address,
            "updated_at": int(time.time()),
        }
    )
    data = await _load_project_data(hass)
    data["device_drafts"][address] = draft
    await _project_store(hass).async_save(data)
    if "refresh_interval_seconds" in draft:
        await get_entity_auto_update_manager(hass).async_set_refresh_interval(
            address, draft["refresh_interval_seconds"]
        )
    if "refresh_trigger_mode" in draft:
        await get_entity_auto_update_manager(hass).async_set_refresh_trigger_mode(
            address, draft["refresh_trigger_mode"]
        )
    preview = await async_display_preview(hass, address)
    connection.send_result(msg["id"], {"draft": {**draft, **(preview or {})}})
