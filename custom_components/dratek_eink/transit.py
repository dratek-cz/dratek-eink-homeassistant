"""Native public-transport data for the departures display template.

Transitous combines Czech and Slovak GTFS feeds behind one open MOTIS API, so
the panel can offer a stop picker without asking the user to install another
Home Assistant integration.  Only normalized, display-sized records leave this
module; the upstream response format stays isolated here.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import time
from typing import Any

_LOGGER = logging.getLogger(__name__)

API_BASE = "https://api.transitous.org"
SOURCES_URL = "https://transitous.org/sources/"
USER_AGENT = "DRATEK-eInk-HomeAssistant/0.1 (https://github.com/DRATEK/DRATEK-eInk-HomeAssistant)"
SEARCH_TTL = 15 * 60
DEPARTURES_TTL = 45
REQUEST_TIMEOUT = 12


class TransitError(RuntimeError):
    """A user-facing failure while talking to the timetable provider."""


def _cache(hass: Any) -> dict[tuple[Any, ...], tuple[float, Any]]:
    domain_data = hass.data.setdefault("dratek_eink", {})
    return domain_data.setdefault("transit_cache", {})


async def _get_json(hass: Any, path: str, params: dict[str, Any]) -> Any:
    # Imported lazily so the pure normalizers (and the automation unit tests,
    # which intentionally provide only a tiny Home Assistant stub) do not need
    # the full aiohttp helper package at module import time.
    from homeassistant.helpers.aiohttp_client import async_get_clientsession

    session = async_get_clientsession(hass)
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            response = await session.get(
                f"{API_BASE}{path}",
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            if response.status != 200:
                detail = ""
                try:
                    payload = await response.json()
                    detail = str(payload.get("error") or payload.get("message") or "")
                except Exception:
                    pass
                raise TransitError(detail or f"Zdroj jízdních řádů vrátil chybu {response.status}.")
            return await response.json()
    except TimeoutError as err:
        raise TransitError("Zdroj jízdních řádů neodpověděl včas.") from err
    except TransitError:
        raise
    except Exception as err:
        _LOGGER.warning("Transitous request failed: %s", err)
        raise TransitError("Odjezdy se teď nepodařilo načíst.") from err


def normalize_stop_matches(payload: Any) -> list[dict[str, Any]]:
    """Reduce geocoder matches to stable stop-picker fields."""
    if not isinstance(payload, list):
        return []
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, dict) or item.get("type") != "STOP":
            continue
        stop_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        if not stop_id or not name or stop_id in seen:
            continue
        seen.add(stop_id)
        areas = [str(area.get("name") or "").strip() for area in item.get("areas", []) if isinstance(area, dict)]
        locality = next((area for area in reversed(areas) if area and area != name), "")
        results.append({
            "id": stop_id,
            "name": name,
            "locality": locality,
            "country": str(item.get("country") or ""),
            "lat": item.get("lat"),
            "lon": item.get("lon"),
            "modes": [str(mode) for mode in item.get("modes", []) if mode],
        })
    return results


def _parse_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def normalize_departures(payload: Any, now: datetime | None = None, limit: int = 4) -> dict[str, Any]:
    """Normalize MOTIS stop times into the four rows the eInk board needs."""
    if not isinstance(payload, dict):
        return {"stop_name": "", "departures": []}
    now = now or datetime.now(timezone.utc)
    place = payload.get("place") if isinstance(payload.get("place"), dict) else {}
    departures: list[dict[str, Any]] = []
    for item in payload.get("stopTimes", []):
        if not isinstance(item, dict) or item.get("cancelled") or item.get("tripCancelled"):
            continue
        item_place = item.get("place") if isinstance(item.get("place"), dict) else {}
        departure = _parse_time(item_place.get("departure") or item_place.get("scheduledDeparture"))
        if departure is None:
            continue
        minutes = max(0, int((departure.astimezone(timezone.utc) - now.astimezone(timezone.utc)).total_seconds() // 60))
        line = str(item.get("displayName") or item.get("routeShortName") or "–").strip()
        destination = str(item.get("headsign") or (item.get("tripTo") or {}).get("name") or "").strip()
        departures.append({
            "line": line or "–",
            "destination": destination or "Spoj",
            "time": "teď" if minutes == 0 else f"{minutes} min",
            "minutes": minutes,
            "realtime": bool(item.get("realTime")),
            "mode": str(item.get("mode") or ""),
            "platform": str(item_place.get("track") or ""),
        })
        if len(departures) >= max(1, min(12, limit)):
            break
    return {
        "stop_name": str(place.get("name") or "").strip(),
        "stop_id": str(place.get("stopId") or "").strip(),
        "departures": departures,
        "attribution_url": SOURCES_URL,
    }


async def async_search_stops(hass: Any, query: str, limit: int = 8) -> list[dict[str, Any]]:
    query = " ".join(str(query or "").split()).strip()
    if len(query) < 2:
        return []
    limit = max(1, min(12, int(limit)))
    key = ("search", query.casefold(), limit)
    cached = _cache(hass).get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    payload = await _get_json(hass, "/api/v1/geocode", {
        "text": query, "type": "STOP", "language": "cs,sk", "numResults": limit,
    })
    result = normalize_stop_matches(payload)[:limit]
    _cache(hass)[key] = (time.monotonic() + SEARCH_TTL, result)
    return result


async def async_get_departures(hass: Any, stop_id: str, limit: int = 4) -> dict[str, Any]:
    stop_id = str(stop_id or "").strip()
    if not stop_id or len(stop_id) > 512:
        raise TransitError("Není vybraná platná zastávka.")
    limit = max(1, min(12, int(limit)))
    key = ("departures", stop_id, limit)
    cached = _cache(hass).get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    payload = await _get_json(hass, "/api/v6/stoptimes", {
        "stopId": stop_id, "n": limit, "language": "cs,sk", "withAlerts": "false",
    })
    result = normalize_departures(payload, limit=limit)
    _cache(hass)[key] = (time.monotonic() + DEPARTURES_TTL, result)
    return result
