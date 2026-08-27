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
import re
import time
from typing import Any

_LOGGER = logging.getLogger(__name__)

API_BASE = "https://api.transitous.org"
SOURCES_URL = "https://transitous.org/sources/"
USER_AGENT = "DRATEK-eInk-HomeAssistant/0.1 (https://github.com/DRATEK/DRATEK-eInk-HomeAssistant)"
SEARCH_TTL = 15 * 60
DEPARTURES_TTL = 45
REQUEST_TIMEOUT = 12
DEPARTURE_CANDIDATE_MINIMUM = 12


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


# Which vehicle is actually pulling in. Two sources, because neither is enough
# on its own:
#
# `mode` is MOTIS's own coarse classification and folds every road vehicle into
# BUS - a Plzeň trolleybus and a Plzeň bus are both "BUS" there. `routeType` is
# the raw GTFS route_type from the operator's own feed, where 11 means
# trolleybus, so that is what tells the two apart. It is also the more precise
# of the two everywhere else, hence the order below.
#
# routeType is absent from some feeds, and `mode` carries values (LONG_DISTANCE,
# NIGHT_RAIL) that have no GTFS number at all, so the fallback is not optional.
_ROUTE_TYPE_KINDS = {
    0: "tram", 1: "metro", 2: "train", 3: "bus", 4: "ferry",
    5: "tram", 6: "cable", 7: "funicular", 11: "trolleybus", 12: "metro",
}
_MODE_KINDS = {
    "TRAM": "tram",
    "SUBWAY": "metro", "METRO": "metro",
    "RAIL": "train", "REGIONAL_RAIL": "train", "REGIONAL_FAST_RAIL": "train",
    "LONG_DISTANCE": "train", "HIGHSPEED_RAIL": "train", "NIGHT_RAIL": "train",
    "BUS": "bus", "COACH": "bus",
    "FERRY": "ferry",
    "CABLE_CAR": "cable", "FUNICULAR": "funicular", "AREAL_LIFT": "cable",
}


def vehicle_kind(item: dict[str, Any]) -> str:
    """Classify one departure into the vehicle the board should picture."""
    route_type = item.get("routeType")
    if isinstance(route_type, bool):  # bool is an int subclass; never a route type
        route_type = None
    if isinstance(route_type, (int, float)) and int(route_type) in _ROUTE_TYPE_KINDS:
        return _ROUTE_TYPE_KINDS[int(route_type)]
    return _MODE_KINDS.get(str(item.get("mode") or "").upper(), "other")


def _local_clock(departure: datetime, tz_name: str) -> str:
    """The wall-clock departure time as it is printed at the stop itself.

    Deliberately the stop's own timezone rather than the Home Assistant host's:
    a board for a stop one country over should read the way its own departure
    board does. MOTIS hands the zone back with every place, and falling back to
    the host's zone only matters for a feed that omits it.
    """
    try:
        if tz_name:
            from zoneinfo import ZoneInfo

            return departure.astimezone(ZoneInfo(tz_name)).strftime("%H:%M")
    except Exception:  # unknown zone name, or no tzdata on this platform
        pass
    return departure.astimezone().strftime("%H:%M")


def _departure_destination(item: dict[str, Any], current_stop: str = "") -> str:
    """Return the public-facing terminal, with fetched following stops as fallback."""
    headsign = str(item.get("headsign") or "").strip()
    if headsign:
        return headsign

    trip_to = item.get("tripTo") if isinstance(item.get("tripTo"), dict) else {}
    destination = str(trip_to.get("name") or "").strip()
    if destination:
        return destination

    next_stops = item.get("nextStops") if isinstance(item.get("nextStops"), list) else []
    for stop in reversed(next_stops):
        if isinstance(stop, dict) and str(stop.get("name") or "").strip():
            return str(stop["name"]).strip()

    # Some feeds expose only a route name such as "Česká - Vychodilova".
    route_name = str(item.get("routeLongName") or "").strip()
    if route_name:
        endpoints = [part.strip() for part in re.split(r"\s+[-–—]\s+", route_name) if part.strip()]
        for endpoint in reversed(endpoints):
            if endpoint.casefold() != current_stop.casefold():
                return endpoint
    return "Cíl neuveden"


def normalize_departures(payload: Any, now: datetime | None = None, limit: int = 4) -> dict[str, Any]:
    """Normalize and sort departures from every equivalent stop/platform."""
    if not isinstance(payload, dict):
        return {"stop_name": "", "departures": []}
    now = now or datetime.now(timezone.utc)
    place = payload.get("place") if isinstance(payload.get("place"), dict) else {}
    stop_name = str(place.get("name") or "").strip()
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
        destination = _departure_destination(item, stop_name)
        departures.append({
            "line": line or "–",
            "destination": destination,
            "time": "teď" if minutes == 0 else f"za {minutes} min",
            # The scheduled wall-clock time as well as the countdown. "za 3 min"
            # answers "do I run?", "07:12" answers "which connection is this?" -
            # and only the second one is still true a minute after the panel
            # last refreshed, which on e-ink is most of the time.
            "departure": _local_clock(departure, str(item_place.get("tz") or "")),
            "minutes": minutes,
            "realtime": bool(item.get("realTime")),
            "mode": str(item.get("mode") or ""),
            "kind": vehicle_kind(item),
            "platform": str(item_place.get("track") or ""),
        })
    row_limit = max(1, min(12, limit))
    departures.sort(key=lambda entry: entry["minutes"])
    return {
        "stop_name": stop_name,
        "stop_id": str(place.get("stopId") or "").strip(),
        "departures": departures[:row_limit],
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
    candidate_count = max(DEPARTURE_CANDIDATE_MINIMUM, limit * 3)
    payload = await _get_json(hass, "/api/v6/stoptimes", {
        "stopId": stop_id,
        "n": candidate_count,
        # A one-metre radius with exactRadius=false asks MOTIS for the selected stop's
        # parent, children/platforms and same-name equivalents, but does not
        # pull unrelated nearby stops into the board. This covers all travel
        # directions even when the picker happened to return one bay's ID.
        # Production currently returns no rows for the documented radius=0
        # boundary, hence the smallest non-zero radius here.
        "radius": 1,
        "exactRadius": "false",
        # Lets the normalizer recover a terminal from the final following stop
        # when a feed omits both headsign and tripTo.
        "fetchStops": "true",
        "language": "cs,sk",
        "withAlerts": "false",
    })
    result = normalize_departures(payload, limit=limit)
    _cache(hass)[key] = (time.monotonic() + DEPARTURES_TTL, result)
    return result
