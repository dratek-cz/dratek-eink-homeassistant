"""Websocket commands and validation for reusable custom elements."""

from __future__ import annotations

from contextlib import suppress
from typing import Any
import base64
import io
import time
import uuid

from PIL import Image
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .automation import get_entity_auto_update_manager
from .ws_shared import _load_project_data, _project_store


@websocket_api.websocket_command({"type": "dratek_eink/custom_elements/list"})
@websocket_api.async_response
async def websocket_list_custom_elements(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    elements = sorted(
        (item for item in data["custom_elements"] if isinstance(item, dict)),
        key=lambda item: str(item.get("name") or "").lower(),
    )
    connection.send_result(msg["id"], {"elements": elements})


def _clamped_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _normalized_icon_image(value: Any) -> str:
    """Validate, resize and strip metadata from a user supplied icon."""
    source = str(value or "")
    if not source:
        return ""
    encoded = source.split(",", 1)[1] if "," in source else source
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("Soubor ikony je příliš velký.")
        image = Image.open(io.BytesIO(raw))
        image.load()
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        normalized = Image.new("RGBA", image.size, (255, 255, 255, 0))
        normalized.alpha_composite(image.convert("RGBA"))
        output = io.BytesIO()
        normalized.save(output, format="PNG", optimize=True)
        result = output.getvalue()
        if len(result) > 1024 * 1024:
            raise ValueError("Zpracovaná ikona je příliš velká.")
    except (ValueError, TypeError, OSError) as exc:
        raise ValueError(f"Ikonu se nepodařilo načíst: {exc}") from exc
    return f"data:image/png;base64,{base64.b64encode(result).decode('ascii')}"


def _normalized_layered_layers(value: Any, canvas_width: int, canvas_height: int) -> list[dict[str, Any]]:
    """Validate graphical layers used by the Home Assistant element designer."""
    layers: list[dict[str, Any]] = []
    total_image_size = 0
    if not isinstance(value, list):
        return layers
    for layer_index, layer_source in enumerate(value[:12]):
        if not isinstance(layer_source, dict):
            continue
        layer_id = str(layer_source.get("id") or f"layer-{layer_index}")[:80]
        objects: list[dict[str, Any]] = []
        raw_objects = layer_source.get("objects")
        for object_index, source in enumerate(raw_objects[:40] if isinstance(raw_objects, list) else []):
            if not isinstance(source, dict):
                continue
            object_type = str(source.get("type") or "text")
            if object_type not in {"text", "rect", "image", "bar_gauge", "pie", "slider", "potentiometer", "gauge"}:
                continue
            item: dict[str, Any] = {
                "id": str(source.get("id") or f"item-{layer_index}-{object_index}")[:80],
                "type": object_type,
                "x": _clamped_int(source.get("x"), 0, 0, canvas_width - 1),
                "y": _clamped_int(source.get("y"), 0, 0, canvas_height - 1),
                "w": _clamped_int(source.get("w"), 80, 1, canvas_width),
                "h": _clamped_int(source.get("h"), 40, 1, canvas_height),
            }
            if source.get("entity_id") or source.get("entityId"):
                item["entity_id"] = str(source.get("entity_id") or source.get("entityId") or "")[:255]
                item["entityId"] = item["entity_id"]
            if source.get("entity_attribute") or source.get("entityAttribute"):
                item["entity_attribute"] = str(source.get("entity_attribute") or source.get("entityAttribute") or "")[:120]
                item["entityAttribute"] = item["entity_attribute"]
            if source.get("sample_value") is not None and str(source.get("sample_value")).strip() != "":
                # A non-numeric sample is fine - it just stays out of the element.
                with suppress(ValueError, TypeError):
                    item["sample_value"] = float(source.get("sample_value"))
            if source.get("rotation"):
                item["rotation"] = _clamped_int(source.get("rotation"), 0, 0, 360)

            if object_type == "text":
                align = str(source.get("align") or "left")
                item.update({
                    "text": str(source.get("text") or "Text")[:500],
                    "color": "red" if source.get("color") == "red" else "black",
                    "font_size": _clamped_int(source.get("font_size"), 24, 8, 120),
                    "bold": bool(source.get("bold")),
                    "align": align if align in {"left", "center", "right"} else "left",
                })
            elif object_type == "rect":
                fill = str(source.get("fill") or "none")
                stroke = str(source.get("stroke") or "black")
                item.update({
                    "fill": fill if fill in {"none", "black", "red", "white"} else "none",
                    "stroke": stroke if stroke in {"none", "black", "red", "white"} else "black",
                    "stroke_width": _clamped_int(source.get("stroke_width"), 2, 1, 20),
                })
            elif object_type == "bar_gauge":
                fill = str(source.get("fill") or "black")
                stroke = str(source.get("stroke") or "black")
                orientation = str(source.get("orientation") or "horizontal")
                item.update({
                    "label": str(source.get("label") or "Ukazatel")[:120],
                    "min_value": float(source.get("min_value") if source.get("min_value") is not None else 0),
                    "max_value": float(source.get("max_value") if source.get("max_value") is not None else 100),
                    "unit": str(source.get("unit") or "%")[:32],
                    "orientation": orientation if orientation in {"horizontal", "vertical"} else "horizontal",
                    "fill": fill if fill in {"black", "red", "white", "none"} else "black",
                    "stroke": stroke if stroke in {"black", "red", "none"} else "black",
                    "show_value": source.get("show_value") is not False,
                })
            elif object_type == "pie":
                color = str(source.get("color") or "black")
                item.update({
                    "label": str(source.get("label") or "Koláčový graf")[:120],
                    "min_value": float(source.get("min_value") if source.get("min_value") is not None else 0),
                    "max_value": float(source.get("max_value") if source.get("max_value") is not None else 100),
                    "unit": str(source.get("unit") or "%")[:32],
                    "hole_percent": _clamped_int(source.get("hole_percent"), 45, 0, 80),
                    "color": color if color in {"black", "red"} else "black",
                    "show_value": source.get("show_value") is not False,
                })
            elif object_type == "slider":
                color = str(source.get("color") or "black")
                item.update({
                    "label": str(source.get("label") or "Posuvník")[:120],
                    "min_value": float(source.get("min_value") if source.get("min_value") is not None else 0),
                    "max_value": float(source.get("max_value") if source.get("max_value") is not None else 100),
                    "unit": str(source.get("unit") or "°C")[:32],
                    "color": color if color in {"black", "red"} else "black",
                    "show_value": source.get("show_value") is not False,
                })
            elif object_type in {"potentiometer", "gauge"}:
                color = str(source.get("color") or "black")
                arc_mode = str(source.get("arc_mode") or "240")
                item.update({
                    "label": str(source.get("label") or "Potenciometr")[:120],
                    "min_value": float(source.get("min_value") if source.get("min_value") is not None else 0),
                    "max_value": float(source.get("max_value") if source.get("max_value") is not None else 100),
                    "unit": str(source.get("unit") or "°C")[:32],
                    "color": color if color in {"black", "red"} else "black",
                    "stroke_width": _clamped_int(source.get("stroke_width"), 6, 2, 20),
                    "arc_mode": arc_mode if arc_mode in {"180", "240", "360"} else "240",
                    "show_arc": source.get("show_arc") is not False,
                    "show_needle": source.get("show_needle") is not False,
                    "show_value": source.get("show_value") is not False,
                })
            else:
                item["image"] = _normalized_icon_image(source.get("image"))
                tint = str(source.get("tint") or "original")
                item["tint"] = tint if tint in {"original", "black", "red", "white"} else "original"
                if not item["image"]:
                    continue
                total_image_size += len(item["image"])
                if total_image_size > 8 * 1024 * 1024:
                    raise ValueError("Obrazky ve vrstvach jsou dohromady prilis velke.")
            objects.append(item)
        layers.append({
            "id": layer_id,
            "name": str(layer_source.get("name") or f"Vrstva {layer_index + 1}").strip()[:80],
            "objects": objects,
        })
    return layers


def _sync_custom_element_object(
    obj: dict[str, Any],
    element: dict[str, Any],
) -> bool:
    """Update a stored display object that references a custom element."""
    element_id = str(element.get("id") or "")
    if str(obj.get("customElementId") or obj.get("custom_element_id") or "") != element_id:
        return False
    element_type = str(element.get("element_type") or "")
    if element_type == "layered":
        obj["customLayers"] = element.get("layers", [])
        obj["customCanvasWidth"] = int(element.get("canvas_width") or 296)
        obj["customCanvasHeight"] = int(element.get("canvas_height") or 128)
        obj["conditionRules"] = [
            {
                "operator": rule.get("operator"),
                "value": rule.get("value", ""),
                "symbol": rule.get("layer_id") or rule.get("symbol") or "",
            }
            for rule in element.get("condition_rules", [])
            if isinstance(rule, dict)
        ]
        obj["defaultSymbol"] = str(element.get("default_layer_id") or "")
    if element.get("entity_id"):
        obj["entityId"] = str(element.get("entity_id") or "")
        obj["entityAttribute"] = str(element.get("entity_attribute") or "")
    if element_type == "chart":
        obj["chartType"] = str(element.get("chart_type") or "line")
        obj["maxPoints"] = int(element.get("history_points") or 24)
        obj["historyMode"] = str(element.get("history_mode") or "rolling")
    if element_type == "status":
        obj["statusOnSymbol"] = str(element.get("on_symbol") or "●")
        obj["statusOffSymbol"] = str(element.get("off_symbol") or "○")
        obj["statusOnValues"] = str(
            element.get("on_values") or "on,true,1,open,home"
        )
        obj["defaultSymbol"] = str(element.get("default_symbol") or "○")
        obj["conditionRules"] = element.get("condition_rules", [])
    if element_type == "icon" and element.get("icon_image"):
        obj["image"] = element["icon_image"]
    return True


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/custom_elements/save",
        "element": dict,
    }
)
@websocket_api.async_response
async def websocket_save_custom_element(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    source = dict(msg["element"])
    element_type = str(source.get("element_type") or "value")
    if element_type not in {"value", "status", "chart", "icon", "layered"}:
        connection.send_error(msg["id"], "invalid_type", "Unsupported custom element type.")
        return
    try:
        # Decoding, resampling and re-encoding a user supplied icon is CPU bound and
        # the payload may be several megabytes, so it must not run on the event loop.
        icon_image = (
            await hass.async_add_executor_job(
                _normalized_icon_image, source.get("icon_image")
            )
            if element_type == "icon"
            else ""
        )
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_icon", str(exc))
        return
    if element_type == "icon" and not icon_image:
        connection.send_error(msg["id"], "missing_icon", "Nejprve nahrajte obrázek ikony.")
        return
    canvas_width = _clamped_int(source.get("canvas_width"), 296, 128, 800)
    canvas_height = _clamped_int(source.get("canvas_height"), 128, 64, 480)
    try:
        # A layered element can carry dozens of embedded images, each normalised the
        # same expensive way, so this offload matters even more than the icon above.
        layers = (
            await hass.async_add_executor_job(
                _normalized_layered_layers,
                source.get("layers"),
                canvas_width,
                canvas_height,
            )
            if element_type == "layered"
            else []
        )
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_layer_image", str(exc))
        return
    if element_type == "layered" and not layers:
        connection.send_error(msg["id"], "missing_layers", "Prvek musi obsahovat alespon jednu vrstvu.")
        return
    layer_ids = {layer["id"] for layer in layers}
    element_id = str(source.get("id") or uuid.uuid4())
    now = int(time.time())
    condition_rules = []
    for rule_source in source.get("condition_rules", [])[:12] if isinstance(source.get("condition_rules"), list) else []:
        if not isinstance(rule_source, dict):
            continue
        operator = str(rule_source.get("operator") or "equals")
        if operator not in {"equals", "not_equals", "greater", "greater_equal", "less", "less_equal", "contains", "is_on", "is_off", "time_between"}:
            operator = "equals"
        condition_rules.append({
            "operator": operator,
            "value": str(rule_source.get("value") or "")[:120],
            "symbol": str(rule_source.get("symbol") or "●")[:8],
        })
        if element_type == "layered":
            layer_id = str(rule_source.get("layer_id") or "")
            if layer_id not in layer_ids:
                condition_rules.pop()
                continue
            condition_rules[-1]["layer_id"] = layer_id
            condition_rules[-1]["symbol"] = layer_id
    element = {
        "id": element_id,
        "name": str(source.get("name") or "Vlastní prvek").strip()[:80],
        "element_type": element_type,
        "source_type": "entity",
        "entity_id": str(source.get("entity_id") or "").strip()[:255],
        "entity_attribute": str(source.get("entity_attribute") or "").strip()[:120],
        "label": str(source.get("label") or "").strip()[:120],
        "unit": str(source.get("unit") or "").strip()[:32],
        "color": "red" if source.get("color") == "red" else "black",
        "chart_type": str(source.get("chart_type") or "line") if str(source.get("chart_type") or "line") in {"line", "bar", "area"} else "line",
        "history_mode": "attribute" if source.get("history_mode") == "attribute" else "rolling",
        "history_points": _clamped_int(source.get("history_points"), 24, 2, 96),
        "condition_rules": condition_rules,
        "default_symbol": str(source.get("default_symbol") or "○")[:8],
        "on_symbol": str(source.get("on_symbol") or "●")[:8],
        "off_symbol": str(source.get("off_symbol") or "○")[:8],
        "on_values": str(source.get("on_values") or "on,true,1,open,home")[:255],
        "sample_data": str(source.get("sample_data") or "")[:65535],
        "sample_labels": str(source.get("sample_labels") or "")[:65535],
        "width_percent": _clamped_int(source.get("width_percent"), 55, 10, 100),
        "height_percent": _clamped_int(source.get("height_percent"), 35, 10, 100),
        "icon_image": icon_image,
        "canvas_width": canvas_width,
        "canvas_height": canvas_height,
        "layers": layers,
        "default_layer_id": (
            str(source.get("default_layer_id"))
            if str(source.get("default_layer_id") or "") in layer_ids
            else (layers[0]["id"] if layers else "")
        ),
        "updated_at": now,
    }
    data = await _load_project_data(hass)
    data["custom_elements"] = [
        item for item in data["custom_elements"]
        if isinstance(item, dict) and item.get("id") != element_id
    ]
    data["custom_elements"].append(element)
    affected_object_ids: dict[str, set[str]] = {}
    for address, draft in data["device_drafts"].items():
        if not isinstance(draft, dict):
            continue
        for obj in draft.get("objects", []):
            if not isinstance(obj, dict) or not _sync_custom_element_object(obj, element):
                continue
            object_id = str(obj.get("id") or "")
            if object_id:
                affected_object_ids.setdefault(str(address).upper(), set()).add(object_id)
    for project in data["projects"]:
        if not isinstance(project, dict):
            continue
        for obj in project.get("objects", []):
            if isinstance(obj, dict):
                _sync_custom_element_object(obj, element)
    await _project_store(hass).async_save(data)
    scheduled_displays = await get_entity_auto_update_manager(
        hass
    ).async_custom_element_changed(element, affected_object_ids)
    connection.send_result(
        msg["id"],
        {
            "element": element,
            "scheduled_displays": scheduled_displays,
        },
    )


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/custom_elements/delete",
        "element_id": str,
    }
)
@websocket_api.async_response
async def websocket_delete_custom_element(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    data = await _load_project_data(hass)
    before = len(data["custom_elements"])
    data["custom_elements"] = [
        item for item in data["custom_elements"]
        if isinstance(item, dict) and item.get("id") != msg["element_id"]
    ]
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"ok": True, "deleted": len(data["custom_elements"]) < before})

