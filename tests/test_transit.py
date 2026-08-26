"""Native Czech/Slovak timetable normalization tests."""

from datetime import datetime, timezone
import importlib.util
from pathlib import Path

_PATH = Path(__file__).parents[1] / "custom_components" / "dratek_eink" / "transit.py"
_SPEC = importlib.util.spec_from_file_location("dratek_transit_test", _PATH)
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
normalize_departures = _MODULE.normalize_departures
normalize_stop_matches = _MODULE.normalize_stop_matches


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
        {"line": "9", "destination": "Sídliště Řepy", "time": "3 min", "minutes": 3, "realtime": True, "mode": "TRAM", "platform": "A"},
        {"line": "4", "destination": "Slivenec", "time": "8 min", "minutes": 8, "realtime": False, "mode": "TRAM", "platform": ""},
    ]


def test_departure_due_within_minute_is_now() -> None:
    result = normalize_departures(
        {"place": {"name": "Česká"}, "stopTimes": [{"place": {"departure": "2026-08-26T09:00:40Z"}, "displayName": "12", "headsign": "Komárov"}]},
        now=datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc),
    )
    assert result["departures"][0]["time"] == "teď"
