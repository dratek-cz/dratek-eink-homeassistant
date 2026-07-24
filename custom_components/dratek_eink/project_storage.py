"""Compatibility helpers for persisted display projects and custom elements."""

from __future__ import annotations

from typing import Any


def _record_list(value: Any) -> list[dict[str, Any]]:
    """Return records from both current lists and legacy numeric-key mappings."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [item for item in value.values() if isinstance(item, dict)]
    return []


def _normalize_record_objects(record: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(record)
    objects = normalized.get("objects")
    if isinstance(objects, dict):
        normalized["objects"] = _record_list(objects)
    elif not isinstance(objects, list):
        normalized["objects"] = []
    else:
        normalized["objects"] = [
            item for item in objects if isinstance(item, dict)
        ]
    return normalized


def normalize_device_drafts(value: Any) -> dict[str, dict[str, Any]]:
    """Normalize all historical device draft layouts into an address mapping."""
    candidates: list[tuple[Any, Any]]
    if isinstance(value, list):
        candidates = [(None, item) for item in value]
    elif isinstance(value, dict):
        if "objects" in value and ("device_address" in value or "address" in value):
            candidates = [(None, value)]
        else:
            candidates = list(value.items())
    else:
        candidates = []

    drafts: dict[str, dict[str, Any]] = {}
    for stored_key, source in candidates:
        if not isinstance(source, dict):
            continue
        address = str(
            source.get("device_address")
            or source.get("address")
            or stored_key
            or ""
        ).strip().upper()
        if not address:
            continue
        draft = _normalize_record_objects(source)
        draft["device_address"] = address
        variables = draft.get("variables")
        if not isinstance(variables, dict):
            draft["variables"] = {}
        drafts[address] = draft
    return drafts


def normalize_custom_elements(value: Any) -> list[dict[str, Any]]:
    """Normalize custom elements, layers and layer objects without dropping data."""
    elements: list[dict[str, Any]] = []
    sources = (
        [value]
        if isinstance(value, dict) and ("id" in value or "element_type" in value)
        else _record_list(value)
    )
    for source in sources:
        element = dict(source)
        layers = []
        for layer_source in _record_list(element.get("layers")):
            layers.append(_normalize_record_objects(layer_source))
        if element.get("element_type") == "layered" or "layers" in element:
            element["layers"] = layers
        rules = element.get("condition_rules")
        if isinstance(rules, dict):
            element["condition_rules"] = _record_list(rules)
        elif not isinstance(rules, list):
            element["condition_rules"] = []
        else:
            element["condition_rules"] = [
                item for item in rules if isinstance(item, dict)
            ]
        elements.append(element)
    return elements


def normalize_project_data(value: Any) -> dict[str, Any]:
    """Return a safe, current-shaped project store from any historical payload."""
    source = dict(value) if isinstance(value, dict) else {}
    normalized = dict(source)
    normalized["projects"] = [
        _normalize_record_objects(item)
        for item in _record_list(source.get("projects"))
    ]
    normalized["device_drafts"] = normalize_device_drafts(
        source.get("device_drafts")
    )
    names = source.get("device_names")
    normalized["device_names"] = {
        str(address).strip().upper(): str(name)
        for address, name in names.items()
        if str(address).strip() and isinstance(name, (str, int, float))
    } if isinstance(names, dict) else {}
    normalized["custom_elements"] = normalize_custom_elements(
        source.get("custom_elements")
    )
    return normalized
