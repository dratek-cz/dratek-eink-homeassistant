"""Pure helpers for deciding which transport may own a display."""

from __future__ import annotations

from typing import Any

from .const import LOCAL_ROUTE_ID


def paths_allowed_by_gateway_lock(
    paths: list[dict[str, Any]], selected_gateway_id: str
) -> list[dict[str, Any]]:
    """Return only paths that belong to a display's manual route lock.

    An empty selection means automatic routing and therefore keeps every
    measured path.  A manual selection is exclusive: observations reported by
    another gateway must not make that gateway treat the display as its own.
    """
    selected = str(selected_gateway_id or "").strip()
    if not selected:
        return list(paths)
    if selected == LOCAL_ROUTE_ID:
        return [path for path in paths if path.get("type") == "local"]
    return [
        path
        for path in paths
        if path.get("type") == "gateway"
        and str(path.get("id") or path.get("gateway_id") or "") == selected
    ]


def route_rssi(path: dict[str, Any]) -> float:
    """Signal strength as a sortable number; an unreadable reading sorts last."""
    try:
        return float(path.get("rssi"))
    except (TypeError, ValueError):
        return -999.0


def route_preference_key(path: dict[str, Any]) -> tuple[bool, float]:
    """Sort key for choosing between transports - use with ``reverse=True``.

    A path measured in the current scan beats one carried forward from the
    discovery cache even when the retained reading is numerically stronger;
    RSSI only decides between paths of equal freshness.

    This rule existed in three separate copies - the transfer queue's
    ``_select_gateway_route``, the scheduler's ``_async_gateway_routes``, and
    the connection map - and the map's copy had drifted: it ignored RSSI
    entirely and took whichever gateway happened to come first in the store.
    The map could therefore name a different gateway than the one that would
    actually carry the write.
    """
    return (not bool(path.get("temporarily_unseen")), route_rssi(path))
