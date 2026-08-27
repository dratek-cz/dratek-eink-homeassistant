"""Native Czech/Slovak timetable normalization tests.

Written as plain functions, and collected into a TestCase at the bottom so
the project's own runner (`python -m unittest`, no pytest here) actually
executes them - discovery imports a module like this one but collects
nothing from it, so every assertion in the file was dead weight.
"""

import asyncio
from datetime import datetime, timezone
import importlib.util
import unittest
from pathlib import Path

_PATH = Path(__file__).parents[1] / "custom_components" / "dratek_eink" / "transit.py"
_SPEC = importlib.util.spec_from_file_location("dratek_transit_test", _PATH)
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
normalize_departures = _MODULE.normalize_departures
normalize_stop_matches = _MODULE.normalize_stop_matches
async_get_departures = _MODULE.async_get_departures
vehicle_kind = _MODULE.vehicle_kind


def _clock(iso: str) -> str:
    """The wall-clock string the module produces for a stop with no timezone.

    Spelled out rather than hard-coded so the test says the same thing on a
    machine in any zone - the point of these assertions is the fields, not the
    tester's own offset.
    """
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().strftime("%H:%M")


def test_stop_search_keeps_only_unique_stops() -> None:
    payload = [
        {"type": "STOP", "id": "cz-PID_U1", "name": "Hlavní nádraží", "country": "CZ", "areas": [{"name": "Praha"}], "modes": ["TRAM"]},
        {"type": "ADDRESS", "id": "address", "name": "Hlavní nádraží 1"},
        {"type": "STOP", "id": "cz-PID_U1", "name": "Duplikát"},
        {"type": "STOP", "id": "sk-ZSSK_1", "name": "Bratislava hl. st.", "country": "SK", "areas": [{"name": "Bratislava"}]},
    ]

    assert normalize_stop_matches(payload) == [
        {"id": "cz-PID_U1", "name": "Hlavní nádraží", "locality": "Praha", "country": "CZ", "lat": None, "lon": None, "modes": ["TRAM"]},
        {"id": "sk-ZSSK_1", "name": "Bratislava hl. st.", "locality": "Bratislava", "country": "SK", "lat": None, "lon": None, "modes": []},
    ]


def test_departures_include_line_destination_and_relative_time() -> None:
    now = datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc)
    payload = {
        "place": {"name": "Hlavní nádraží", "stopId": "cz-PID_U142S1"},
        "stopTimes": [
            {
                "place": {"departure": "2026-08-26T09:03:30Z", "track": "A"},
                "displayName": "9", "headsign": "Sídliště Řepy", "mode": "TRAM", "realTime": True,
            },
            {"place": {"departure": "2026-08-26T09:04:00Z"}, "displayName": "C", "headsign": "Háje", "tripCancelled": True},
            {
                "place": {"scheduledDeparture": "2026-08-26T09:08:00Z"},
                "routeShortName": "4", "tripTo": {"name": "Slivenec"}, "mode": "TRAM",
            },
        ],
    }

    result = normalize_departures(payload, now=now, limit=4)

    assert result["stop_name"] == "Hlavní nádraží"
    assert result["stop_id"] == "cz-PID_U142S1"
    assert result["departures"] == [
        {
            "line": "9", "destination": "Sídliště Řepy", "time": "za 3 min",
            "departure": _clock("2026-08-26T09:03:30Z"), "minutes": 3, "realtime": True,
            "mode": "TRAM", "kind": "tram", "platform": "A",
        },
        {
            "line": "4", "destination": "Slivenec", "time": "za 8 min",
            "departure": _clock("2026-08-26T09:08:00Z"), "minutes": 8, "realtime": False,
            "mode": "TRAM", "kind": "tram", "platform": "",
        },
    ]


def test_departure_due_within_minute_is_now() -> None:
    result = normalize_departures(
        {"place": {"name": "Česká"}, "stopTimes": [{"place": {"departure": "2026-08-26T09:00:40Z"}, "displayName": "12", "headsign": "Komárov"}]},
        now=datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc),
    )
    assert result["departures"][0]["time"] == "teď"


def test_departures_are_sorted_before_display_limit_is_applied() -> None:
    now = datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc)
    payload = {
        "place": {"name": "Česká"},
        "stopTimes": [
            {"place": {"departure": "2026-08-26T09:12:00Z"}, "displayName": "12", "headsign": "Komárov"},
            {"place": {"departure": "2026-08-26T09:03:00Z"}, "displayName": "3", "headsign": "Stará osada"},
            {"place": {"departure": "2026-08-26T09:05:00Z"}, "displayName": "5", "headsign": "Štefánikova čtvrť"},
        ],
    }

    result = normalize_departures(payload, now=now, limit=2)

    assert [entry["destination"] for entry in result["departures"]] == ["Stará osada", "Štefánikova čtvrť"]


def test_destination_falls_back_to_last_following_stop() -> None:
    result = normalize_departures(
        {
            "place": {"name": "Česká"},
            "stopTimes": [{
                "place": {"departure": "2026-08-26T09:04:00Z"},
                "displayName": "34",
                "nextStops": [{"name": "Smetanova"}, {"name": "Vychodilova"}],
            }],
        },
        now=datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc),
    )

    assert result["departures"][0]["destination"] == "Vychodilova"


def test_departure_request_includes_all_equivalent_platforms() -> None:
    captured: dict = {}

    async def fake_get_json(hass, path, params):
        captured.update({"path": path, "params": params})
        return {"place": {"name": "Česká"}, "stopTimes": []}

    original_get_json = _MODULE._get_json
    _MODULE._get_json = fake_get_json
    try:
        hass = type("Hass", (), {"data": {}})()
        asyncio.run(async_get_departures(hass, "cz-stop-platform-1", limit=4))
    finally:
        _MODULE._get_json = original_get_json

    assert captured["path"] == "/api/v6/stoptimes"
    assert captured["params"]["n"] >= 12
    assert captured["params"]["radius"] == 1
    assert captured["params"]["exactRadius"] == "false"
    assert captured["params"]["fetchStops"] == "true"


def test_trolleybus_is_told_apart_from_a_bus_by_its_gtfs_route_type() -> None:
    # MOTIS folds every road vehicle into mode BUS, so a Plzeň trolleybus and a
    # Plzeň bus arrive indistinguishable there. route_type 11 is the operator's
    # own answer and is what the board pictures.
    now = datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc)
    payload = {
        "place": {"name": "Hlavní nádraží", "stopId": "cz-PMDP_21"},
        "stopTimes": [
            {
                "place": {"departure": "2026-08-26T09:05:00Z"},
                "displayName": "16", "headsign": "Bory", "mode": "BUS", "routeType": 11,
            },
            {
                "place": {"departure": "2026-08-26T09:06:00Z"},
                "displayName": "49", "headsign": "Doubravka", "mode": "BUS", "routeType": 3,
            },
        ],
    }

    kinds = [entry["kind"] for entry in normalize_departures(payload, now=now)["departures"]]

    assert kinds == ["trolleybus", "bus"]


def test_vehicle_kind_falls_back_to_the_mode_when_the_feed_omits_route_type() -> None:
    # Long-distance and night rail have no GTFS number at all, and plenty of
    # feeds never send route_type, so the coarse mode has to carry those.
    assert vehicle_kind({"mode": "REGIONAL_RAIL"}) == "train"
    assert vehicle_kind({"mode": "NIGHT_RAIL"}) == "train"
    assert vehicle_kind({"mode": "SUBWAY"}) == "metro"
    assert vehicle_kind({"mode": "COACH"}) == "bus"
    assert vehicle_kind({"mode": "FERRY"}) == "ferry"
    assert vehicle_kind({}) == "other"
    assert vehicle_kind({"mode": "SOMETHING_NEW"}) == "other"


def test_route_type_wins_over_the_mode_but_only_when_it_is_a_real_number() -> None:
    assert vehicle_kind({"mode": "BUS", "routeType": 0}) == "tram"
    # bool is an int subclass and would otherwise read as route_type 1 (metro).
    assert vehicle_kind({"mode": "BUS", "routeType": True}) == "bus"
    assert vehicle_kind({"mode": "TRAM", "routeType": 99}) == "tram"


def test_departure_carries_the_wall_clock_time_of_the_stops_own_zone() -> None:
    # A board for a stop one country over should read the way its own departure
    # board does, not the way the Home Assistant host's clock does.
    now = datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc)
    payload = {
        "place": {"name": "Hlavní nádraží", "stopId": "cz-PID_U1"},
        "stopTimes": [{
            "place": {"departure": "2026-08-26T09:12:00Z", "tz": "Europe/Prague"},
            "displayName": "9", "headsign": "Řepy", "mode": "TRAM",
        }],
    }

    entry = normalize_departures(payload, now=now)["departures"][0]

    # Prague is UTC+2 in August.
    assert entry["departure"] == "11:12"
    assert entry["time"] == "za 12 min"


class TransitTests(unittest.TestCase):
    """Runs every plain `test_*` above, so unittest discovery sees them."""


for _name, _function in sorted(dict(globals()).items()):
    if _name.startswith("test_") and callable(_function):
        setattr(TransitTests, _name, staticmethod(_function))


if __name__ == "__main__":
    unittest.main()
