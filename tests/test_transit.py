"""Native Czech/Slovak timetable normalization tests."""

import asyncio
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
async_get_departures = _MODULE.async_get_departures


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
        {"line": "9", "destination": "Sídliště Řepy", "time": "za 3 min", "minutes": 3, "realtime": True, "mode": "TRAM", "platform": "A"},
        {"line": "4", "destination": "Slivenec", "time": "za 8 min", "minutes": 8, "realtime": False, "mode": "TRAM", "platform": ""},
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


def test_departure_request_includes_all_equivalent_platforms(monkeypatch) -> None:
    captured: dict = {}

    async def fake_get_json(hass, path, params):
        captured.update({"path": path, "params": params})
        return {"place": {"name": "Česká"}, "stopTimes": []}

    monkeypatch.setattr(_MODULE, "_get_json", fake_get_json)
    hass = type("Hass", (), {"data": {}})()
    asyncio.run(async_get_departures(hass, "cz-stop-platform-1", limit=4))

    assert captured["path"] == "/api/v6/stoptimes"
    assert captured["params"]["n"] >= 12
    assert captured["params"]["radius"] == 1
    assert captured["params"]["exactRadius"] == "false"
    assert captured["params"]["fetchStops"] == "true"
