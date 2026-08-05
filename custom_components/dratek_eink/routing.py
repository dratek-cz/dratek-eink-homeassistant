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
