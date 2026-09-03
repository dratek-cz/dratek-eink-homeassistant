from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timedelta
import io
import json
import logging
import math
import re
import time
import unicodedata
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
try:
    from homeassistant.util import dt as dt_util
    def _current_local_datetime() -> datetime:
        return dt_util.now()
except Exception:
    def _current_local_datetime() -> datetime:
        return datetime.now()
from PIL import Image, ImageChops

from .const import (
    DISCOVERY_CACHE_KEY,
    DISCOVERY_GRACE_SECONDS,
    DOMAIN,
    LOCAL_ROUTE_ID,
    PARTIAL_UPDATE_CONFIRMED_SDK_TYPES,
)
from .gateway import (
    async_gateway_route,
    async_gateway_status,
    async_load_gateways,
    async_scan_gateway,
    async_send_gateway_payload,
    gateway_send_endpoint,
)
from .gateway_preferences import async_load_gateway_preferences
from .queue import gateway_resource, get_transfer_queue
from .routing import route_preference_key
from .render import (
    BWRY_CODES,
    async_render_camera_binding_data_url,
    async_render_meteoradar_sidebar_data_url,
    prepare_image_for_display,
    render_automatic_refresh_image,
)
from .display_preview import async_save_display_preview
from .transfer import DratekTransfer
from .transit import TransitError, async_get_departures

_LOGGER = logging.getLogger(__name__)

STORE_KEY = "dratek_eink.entity_automations"
STORE_VERSION = 1
DATA_KEY = "entity_auto_update_manager"
DEBOUNCE_SECONDS = 0.15
DEFAULT_REFRESH_INTERVAL_SECONDS = 600
MIN_REFRESH_INTERVAL_SECONDS = 30
MAX_REFRESH_INTERVAL_SECONDS = 86400
GATEWAY_ROUTE_SCAN_SECONDS = 3
GATEWAY_ROUTE_CACHE_SECONDS = 30
# Backstop for _async_gateway_routes's lock-held section (see the comment at
# its call site): comfortably above the ~8s each individual gateway scan is
# already bounded to (see gateway.py's DEFAULT_TIMEOUT), so it never fires in
# normal operation - it only matters if something manages to hang past its
# own nominal timeout.
GATEWAY_ROUTE_LOOKUP_TIMEOUT_SECONDS = 20
# Backstop for async_render_preview. Rendering normally takes well under a
# second even for a complex 800x480 template; this only matters if something
# in that chain (a service call, or the resvg SVG rasteriser this integration
# shells out to via an executor thread for automatic text bindings) never
# returns. asyncio.wait_for cannot reclaim a thread genuinely stuck in a
# native/blocking call - the executor slot stays lost - but it does stop that
# one hang from silently ending this display's automatic refresh forever: the
# task un-blocks, the failure gets logged, and the next scheduled attempt (a
# fresh executor thread) still runs normally.
RENDER_TIMEOUT_SECONDS = 90
# Every configured display is checked on this cadence to see whether its own
# refresh_interval_seconds has elapsed - the shortest interval a user can pick
# (MIN_REFRESH_INTERVAL_SECONDS) sets the floor, since checking any less often
# than that would make picking a short interval pointless.
REFRESH_TICK_SECONDS = MIN_REFRESH_INTERVAL_SECONDS
# What actually triggers a refresh for a given display:
# - "both" (default): a bound entity changing state AND the periodic tick,
#   same as every display got before this setting existed.
# - "change_only": only a bound entity changing state - the periodic tick
#   skips this display entirely. For displays with nothing that benefits from
#   periodic insurance (e.g. no camera binding) and where the user would
#   rather it never redraw between real changes.
# - "interval_only": only the periodic tick - entity state changes
#   are ignored. For a fast-changing entity the user wants throttled to a
#   fixed cadence instead of redrawing on every update.
VALID_REFRESH_TRIGGER_MODES = {"both", "change_only", "interval_only"}
DEFAULT_REFRESH_TRIGGER_MODE = "both"
ALL_ATTRIBUTES_SOURCE = "__dratek_all_attributes__"


def _binding_sources(binding: dict[str, Any]) -> set[tuple[str, str]]:
    """Return every entity and attribute that can change a rendered binding."""
    sources: set[tuple[str, str]] = set()
    entity_id = str(binding.get("entity_id") or "")
    if entity_id:
        sources.add((entity_id, str(binding.get("entity_attribute") or "")))
        # A series such as Czech spot prices is commonly stored entirely in
        # timestamp-keyed attributes.  Its scalar state can stay unchanged
        # while tomorrow's prices (and therefore the graph) change.
        if binding.get("type") == "series":
            sources.add((entity_id, ALL_ATTRIBUTES_SOURCE))
    if binding.get("type") != "layered":
        return sources
    for layer in binding.get("layers", []):
        if not isinstance(layer, dict):
            continue
        for item in layer.get("objects", []):
            if not isinstance(item, dict):
                continue
            item_entity_id = str(item.get("entity_id") or item.get("entityId") or "")
            if item_entity_id:
                sources.add(
                    (
                        item_entity_id,
                        str(
                            item.get("entity_attribute")
                            or item.get("entityAttribute")
                            or ""
                        ),
                    )
                )
    for extra_entity_id in binding.get("entity_ids", []):
        normalized_extra = str(extra_entity_id or "")
        if normalized_extra and not any(
            source_entity_id == normalized_extra
            for source_entity_id, _attribute in sources
        ):
            sources.add((normalized_extra, ""))
    return sources


def _update_binding_from_custom_element(
    binding: dict[str, Any],
    element: dict[str, Any],
) -> bool:
    """Replace the cached rendering definition of one saved custom element."""
    element_type = str(element.get("element_type") or "")
    if element_type == "layered" and binding.get("type") == "layered":
        layers = element.get("layers") if isinstance(element.get("layers"), list) else []
        binding["layers"] = layers
        binding["canvas_width"] = int(element.get("canvas_width") or 296)
        binding["canvas_height"] = int(element.get("canvas_height") or 128)
        binding["condition_rules"] = (
            element.get("condition_rules")
            if isinstance(element.get("condition_rules"), list)
            else []
        )
        binding["default_symbol"] = str(
            element.get("default_layer_id")
            or (layers[0].get("id") if layers and isinstance(layers[0], dict) else "")
        )
        binding["fallback"] = binding["default_symbol"]
        binding["entity_id"] = str(element.get("entity_id") or "")
        binding["entity_attribute"] = str(element.get("entity_attribute") or "")
        binding["entity_ids"] = []
        binding["entity_ids"] = sorted(
            {
                entity_id
                for entity_id, _attribute in _binding_sources(binding)
            }
        )
        return True
    if element_type == "chart" and binding.get("type") == "chart":
        binding["entity_id"] = str(element.get("entity_id") or "")
        binding["entity_attribute"] = str(element.get("entity_attribute") or "")
        binding["chartType"] = str(element.get("chart_type") or "line")
        binding["maxPoints"] = int(element.get("history_points") or 24)
        binding["history_mode"] = str(element.get("history_mode") or "rolling")
        return True
    if element_type == "status" and binding.get("type") != "layered":
        binding["entity_id"] = str(element.get("entity_id") or "")
        binding["entity_attribute"] = str(element.get("entity_attribute") or "")
        binding["status_icons"] = True
        binding["status_on_symbol"] = str(element.get("on_symbol") or "●")
        binding["status_off_symbol"] = str(element.get("off_symbol") or "○")
        binding["status_on_values"] = str(
            element.get("on_values") or "on,true,1,open,home"
        )
        binding["condition_rules"] = (
            element.get("condition_rules")
            if isinstance(element.get("condition_rules"), list)
            else []
        )
        binding["default_symbol"] = str(element.get("default_symbol") or "○")
        return True
    if element_type == "value" and binding.get("type") not in {"chart", "layered"}:
        binding["entity_id"] = str(element.get("entity_id") or "")
        binding["entity_attribute"] = str(element.get("entity_attribute") or "")
        return True
    return False


def _source_value(state: Any, attribute: str) -> Any:
    if state is None:
        return None
    if attribute == ALL_ATTRIBUTES_SOURCE:
        return state.attributes
    return state.attributes.get(attribute) if attribute else state.state


# --- Home-Assistant-internal state words -----------------------------------
#
# A manual send reads a plain state ("sunny", "not_home", "on", "locked")
# through _templateStateWords (panel-devices.mixin.js) and shows the Czech
# word a person actually reads on the display. Nothing on the backend ever
# did that translation - an automatic refresh's text binding just formatted
# state.state directly, which for anything other than a temperature/plain
# number reads as raw English or a Home-Assistant-internal token: a weather
# condition prints "sunny" instead of "Jasno", a lock prints "locked" instead
# of "Zamčeno". _templateAutomationTextBinding now captures which `kind` the
# panel resolved the slot as (the same input _templateStateWords itself
# takes), so this mirrors it exactly instead of guessing from the entity_id
# alone.

_WEATHER_CONDITION_LABELS_CS = {
    "clear-night": "Jasná noc", "cloudy": "Zataženo", "exceptional": "Výjimečné", "fog": "Mlha",
    "hail": "Krupobití", "lightning": "Bouřky", "lightning-rainy": "Bouřky s deštěm",
    "partlycloudy": "Polojasno", "pouring": "Vydatný déšť", "rainy": "Déšť", "snowy": "Sněžení",
    "snowy-rainy": "Déšť se sněhem", "sunny": "Jasno", "windy": "Větrno", "windy-variant": "Větrno",
}

_ALARM_STATE_LABELS_CS = {
    "disarmed": "Vypnuto", "armed_home": "Doma", "armed_away": "Mimo dům", "armed_night": "Noc",
    "arming": "Aktivuji", "pending": "Čekám", "triggered": "POPLACH",
}


def _format_czech_number(value: Any) -> str:
    """Mirrors Intl.NumberFormat("cs-CZ", {maximumFractionDigits: 2}): comma
    as the decimal separator, up to 2 decimals, no padded trailing zeros.

    A manual send formats every numeric value this way (_templateDisplayValue
    in panel-devices.mixin.js); _state_value used to just str()-format the
    raw value, which for a Python float prints "21.4" - a decimal point, not
    the Czech comma a manual send shows for the exact same reading.
    Non-numeric values pass through unchanged, same as the frontend falling
    back to String(raw) when Number(raw) is not finite.
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if not math.isfinite(number):
        return str(value)
    text = f"{round(number, 2):.2f}".rstrip("0").rstrip(".")
    if text in ("", "-"):
        text = "0"
    return text.replace(".", ",")


def _state_words(entity_id: str, state: Any, kind: str) -> str:
    """The Czech word a manual send would show for this state, or "" if this
    slot is not one _templateStateWords translates (a plain sensor reading,
    for instance) - the caller falls back to the raw formatted value then."""
    domain = str(entity_id or "").split(".", 1)[0]
    attributes = state.attributes if state is not None else {}
    value = str(state.state if state is not None else "").lower()
    device_class = str(attributes.get("device_class") or "")
    if domain == "weather":
        return _WEATHER_CONDITION_LABELS_CS.get(value, "")
    if domain in ("person", "device_tracker"):
        if kind == "person_name":
            return str(attributes.get("friendly_name") or "")
        if value == "home":
            return "Doma"
        if value == "not_home":
            return "Pryč"
        return str(state.state) if state is not None and state.state else ""
    if domain == "lock":
        return {"locked": "Zamčeno", "unlocked": "Odemčeno"}.get(value, "")
    if domain in ("light", "switch"):
        return {"on": "Zapnuto", "off": "Vypnuto"}.get(value, "")
    if domain == "alarm_control_panel":
        return _ALARM_STATE_LABELS_CS.get(value, "")
    if domain == "binary_sensor":
        on = value == "on"
        if device_class in ("door", "garage_door", "opening") or kind == "door":
            return "Otevřeno" if on else "Zavřeno"
        if device_class == "window" or kind == "window":
            return "Otevřeno" if on else "Zavřeno"
        if device_class in ("motion", "occupancy", "presence") or kind == "motion":
            return "Pohyb" if on else "Klid"
        if device_class == "moisture":
            return "Vlhko" if on else "Sucho"
        return "Ano" if on else "Ne"
    return ""


# --- series()/ratio()/day()/event() resolution -----------------------------
#
# These four template design() helpers (panel-template-svg.mixin.js) draw a
# sparkline/bar chart, a gauge/bar fill, a weather forecast strip or a
# calendar entry. None of them ever produce a <text> node whose content is
# the literal bound value - a chart draws numbers as bar heights, forecast
# and calendar data come from a service call the plain v()-marker capture in
# panel-devices.mixin.js has no way to reach - so an automatic refresh used
# to leave all four frozen at whatever was true on the last manual send. The
# functions below are the backend's own read of the same data, mirroring
# their frontend counterparts (_templateSeries, _templatePercent,
# _templateForecastDay, _templateCalendarEntry) closely enough that an
# automatic refresh matches a manual send instead of guessing.

_WEEKDAY_ABBR_CS = ("PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE")
_MONTH_ABBR_CS = ("LED", "ÚNO", "BŘE", "DUB", "KVĚ", "ČVN", "ČVC", "SRP", "ZÁŘ", "ŘÍJ", "LIS", "PRO")
_MONTH_NAMES_GENITIVE_CS = (
    "ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince"
)
# The standard Czech civil name-day calendar, indexed [month - 1][day - 1].
# Days with no name day (state/religious holidays only, e.g. 1.1, 24.12) are
# "". Sourced from the public domain calendar data used by the WebChemistry/
# svatky project (github.com/WebChemistry/svatky), with holiday labels
# (Štědrý den, Den vítězství, ...) filtered out, keeping only person names.
_CZECH_NAME_DAYS: tuple[tuple[str, ...], ...] = (
    ("", "Karina", "Radmila", "Diana", "Dalimil", "", "Vilma", "Čestmír", "Vladan", "Břetislav", "Bohdana", "Pravoslav", "Edita", "Radovan", "Alice", "Ctirad", "Drahoslav", "Vladislav", "Doubravka", "Ilona", "Běla", "Slavomír", "Zdeněk", "Milena", "Miloš", "Zora", "Ingrid", "Otýlie", "Zdislava", "Robin", "Marika"),
    ("Hynek", "Nela", "Blažej", "Jarmila", "Dobromila", "Vanda", "Veronika", "Milada", "Apolena", "Mojmír", "Božena", "Slavěna", "Věnceslav", "Valentýn", "Jiřina", "Ljuba", "Miloslava", "Gizela", "Patrik", "Oldřich", "Lenka", "Petr", "Svatopluk", "Matěj", "Liliana", "Dorota", "Alexandr", "Lumír", "Horymír"),
    ("Bedřich", "Anežka", "Kamil", "Stela", "Kazimír", "Miroslav", "Tomáš", "Gabriela", "Františka", "Viktorie", "Anděla", "Řehoř", "Růžena", "Rút, Matylda", "Ida", "Elena, Herbert", "Vlastimil", "Eduard", "Josef", "Světlana", "Radek", "Leona", "Ivona", "Gabriel", "Marián", "Emanuel", "Dita", "Soňa", "Taťána", "Arnošt", "Kvido"),
    ("Hugo", "Erika", "Richard", "Ivana", "Miroslava", "Vendula", "Heřman, Hermína", "Ema", "Dušan", "Darja", "Izabela", "Julius", "Aleš", "Vincenc", "Anastázie", "Irena", "Rudolf", "Valérie", "Rostislav", "Marcela", "Alexandra", "Evženie", "Vojtěch", "Jiří", "Marek", "Oto", "Jaroslav", "Vlastislav", "Robert", "Blahoslav"),
    ("", "Zikmund", "Alexej", "Květoslav", "Klaudie", "Radoslav", "Stanislav", "", "Ctibor", "Blažena", "Svatava", "Pankrác", "Servác", "Bonifác", "Žofie", "Přemysl", "Aneta", "Nataša", "Ivo", "Zbyšek", "Monika", "Emil", "Vladimír", "Jana", "Viola", "Filip", "Valdemar", "Vilém", "Maxmilián", "Ferdinand", "Kamila"),
    ("Laura", "Jarmil", "Tamara", "Dalibor", "Dobroslav", "Norbert", "Iveta, Slavoj", "Medard", "Stanislav", "Gita", "Bruno", "Antonie", "Antonín", "Roland", "Vít", "Zbyněk", "Adolf", "Milan", "Leoš", "Květa", "Alois", "Pavla", "Zdeňka", "Jan", "Ivan", "Adriana", "Ladislav", "Lubomír", "Petr, Pavel", "Šárka"),
    ("Jaroslava", "Patricie", "Radomír", "Prokop", "", "", "Bohuslava", "Nora", "Drahoslava", "Libuše, Amálie", "Olga", "Bořek", "Markéta", "Karolína", "Jindřich", "Luboš", "Martina", "Drahomíra", "Čeněk", "Ilja", "Vítězslav", "Magdeléna", "Libor", "Kristýna", "Jakub", "Anna", "Věroslav", "Viktor", "Marta", "Bořivoj", "Ignác"),
    ("Oskar", "Gustav", "Miluše", "Dominik", "Kristián", "Oldřiška", "Lada", "Soběslav", "Roman", "Vavřinec", "Zuzana", "Klára", "Alena", "Alan", "Hana", "Jáchym", "Petra", "Helena", "Ludvík", "Bernard", "Johana", "Bohuslav", "Sandra", "Bartoloměj", "Radim", "Luděk", "Otakar", "Augustýn", "Evelína", "Vladěna", "Pavlína"),
    ("Linda, Samuel", "Adéla", "Bronislav", "Jindřiška", "Boris", "Boleslav", "Regína", "Mariana", "Daniela", "Irma", "Denisa", "Marie", "Lubor", "Radka", "Jolana", "Ludmila", "Naděžda", "Kryštof", "Zita", "Oleg", "Matouš", "Darina", "Berta", "Jaromír", "Zlata", "Andrea", "Jonáš", "Václav", "Michal", "Jeroným"),
    ("Igor", "Olívie", "Bohumil", "František", "Eliška", "Hanuš", "Justýna", "Věra", "Štefan, Sára", "Marina", "Andrej", "Marcel", "Renáta", "Agáta", "Tereza", "Havel", "Hedvika", "Lukáš", "Michaela", "Vendelín", "Brigita", "Sabina", "Teodor", "Nina", "Beáta", "Erik", "Šarlota, Zoe", "", "Silvie", "Tadeáš", "Štěpánka"),
    ("Felix", "", "Hubert", "Karel", "Miriam", "Liběna", "Saskie", "Bohumír", "Bohdan", "Evžen", "Martin", "Benedikt", "Tibor", "Sáva", "Leopold", "Otmar", "Mahulena", "Romana", "Alžběta", "Nikola", "Albert", "Cecílie", "Klement", "Emílie", "Kateřina", "Artur", "Xenie", "René", "Zina", "Ondřej"),
    ("Iva", "Blanka", "Svatoslav", "Barbora", "Jitka", "Mikuláš", "Ambrož, Benjamín", "Květoslava", "Vratislav", "Julie", "Dana", "Simona", "Lucie", "Lýdie", "Radana", "Albína", "Daniel", "Miloslav", "Ester", "Dagmar", "Natálie", "Šimon", "Vlasta", "Adam, Eva", "", "Štěpán", "Žaneta", "Bohumila", "Judita", "David", "Silvestr"),
)


def _czech_name_day(when: datetime) -> str:
    month_row = _CZECH_NAME_DAYS[when.month - 1]
    if when.day - 1 >= len(month_row):
        return ""
    return month_row[when.day - 1]


def _remove_diacritics(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(c) != "Mn"
    ).lower()


def _resolve_internal_system_value(binding: dict[str, Any]) -> str | None:
    """Resolve system variables (time, date, interval, update_time) dynamically."""
    entity_id = str(binding.get("entity_id") or "")
    kind = str(binding.get("kind") or "")
    label = str(binding.get("label") or "")
    key = str(binding.get("key") or "")
    prefix = str(binding.get("value_prefix") or "")
    suffix = str(binding.get("value_suffix") or "")

    # A binding is never bound to a real entity if entity_id is empty or the
    # literal "internal:..." placeholder - anything with a "." is a genuine
    # domain.entity_id (sensor.foo, ...) and must always win over anything
    # below, including nameday: calendar.js's own setup notes used to tell
    # users to bind their own name-day-providing sensor here (there was no
    # working built-in default), so an existing real binding from before this
    # calendar existed must keep working exactly as configured.
    bound_to_real_entity = "." in entity_id

    is_internal = (
        entity_id.startswith("internal:")
        or (kind in ("time", "date", "clock", "datetime", "update_time", "interval", "nameday") and not bound_to_real_entity)
        or entity_id in ("sensor.time", "sensor.date", "sensor.date_time")
    )
    if not is_internal:
        return None

    normalized = _remove_diacritics(f"{entity_id} {kind} {label} {key}")
    now = _current_local_datetime()

    if "datum" in normalized or "date" in normalized:
        formatted = f"{now.day}. {_MONTH_NAMES_GENITIVE_CS[now.month - 1]}"
        return f"{prefix}{formatted}{suffix}"
    if kind == "nameday" or "svatek" in normalized or "jmenin" in normalized:
        # A handful of days (1.1, 24.12, ...) are state/religious holidays with
        # no name day at all - fall through to the binding's own fallback text
        # instead of showing a blank value on exactly those days.
        today_name = _czech_name_day(now)
        return f"{prefix}{today_name}{suffix}" if today_name else None
    if "interval" in normalized:
        next_hour = now + timedelta(hours=1)
        return f"{prefix}{now.strftime('%H:%M')}–{next_hour.strftime('%H:%M')}{suffix}"
    if (
        "cas" in normalized
        or "time" in normalized
        or "aktualizace" in normalized
        or "clock" in normalized
        or entity_id.startswith("internal:")
    ):
        return f"{prefix}{now.strftime('%H:%M')}{suffix}"
    return None


def _parse_iso_datetime(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _ratio_percent(state: Any, divisor: float, source: str = "") -> float:
    """Percent-fill for a ratio() gauge/bar - mirrors _templatePercent.

    `source` names how the entity becomes a fill. The default reads the state
    as a number. "thermostat" reads current_temperature and scales it between
    the thermostat's own min_temp and max_temp - the only way a climate.*
    entity can drive a gauge at all, because its state is "heat"/"off" and the
    numeric path below resolves that to an empty dial. Mirrors
    _templateThermostat in panel-devices.mixin.js.
    """
    if state is None:
        return 0.0
    if source == "thermostat":
        current = _float_or_none((state.attributes or {}).get("current_temperature"))
        if current is None:
            return 0.0
        low = _float_or_none((state.attributes or {}).get("min_temp"))
        high = _float_or_none((state.attributes or {}).get("max_temp"))
        low = 10.0 if low is None else low
        high = 30.0 if high is None else high
        if high - low <= 0:
            return 0.0
        return max(0.0, min(100.0, (current - low) / (high - low) * 100.0))
    match = re.search(r"-?\d+(?:\.\d+)?", str(state.state))
    if not match:
        return 0.0
    clamped = max(0.0, min(100.0, float(match.group(0))))
    return clamped / max(0.0001, divisor)


def _ratio_text(state: Any) -> str:
    """The "value unit" text a ratio() meter shows beside its fill."""
    if state is None:
        return ""
    value = state.state
    if value is None or str(value).strip().lower() in {"unavailable", "unknown"}:
        return ""
    unit = str(state.attributes.get("unit_of_measurement") or "")
    return f"{value}{f' {unit}' if unit else ''}"


def _series_numbers(state: Any, max_points: int) -> list[float]:
    """A live number series straight from entity attributes - mirrors
    _templateSeries. No service call needed: every source it reads
    (a timestamp-keyed attribute dict, `.values`/`.prices`/`.data`/
    `.history`, or the bare state) is already on `state` in Python exactly
    as it is on the frontend's copy of the same entity."""
    if state is None:
        return []
    attributes = state.attributes or {}
    timestamp_prices = [
        (key, value)
        for key, value in attributes.items()
        if _parse_iso_datetime(key) is not None and _is_finite_number(value)
    ]
    if len(timestamp_prices) > 1:
        ordered = sorted(timestamp_prices, key=lambda item: item[0])
        return [float(value) for _key, value in ordered][-max_points:]
    for candidate in (
        attributes.get("today_prices"),
        attributes.get("today"),
        attributes.get("raw_today"),
        attributes.get("current_day"),
        attributes.get("values"),
        attributes.get("prices"),
        attributes.get("data"),
        attributes.get("history"),
        state.state,
    ):
        value: Any = candidate
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (TypeError, ValueError, json.JSONDecodeError):
                value = re.split(r"[;,\s]+", value.strip())
        if isinstance(value, dict):
            value = list(value.values())
        if not isinstance(value, list):
            continue
        numbers: list[float] = []
        for item in value:
            if isinstance(item, dict):
                item = item.get("value", item.get("price", item.get("state")))
            try:
                numbers.append(float(item))
            except (TypeError, ValueError):
                continue
        if len(numbers) > 1:
            return numbers[-max_points:]
    return []


def _is_finite_number(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


async def _async_forecast_days(hass: HomeAssistant, entity_id: str, count: int) -> list[dict[str, str]]:
    """The next `count` forecast days - mirrors _templateForecastDay.

    Forecasts stopped being a state attribute in Home Assistant 2024.4; they
    only come from this service call now, which is why this needs the event
    loop (hass.async_add_executor_job cannot make service calls) and has to
    run before the synchronous PIL/SVG compositing step, the same way a
    camera binding's snapshot is fetched first.
    """
    if not entity_id:
        return []
    try:
        response = await hass.services.async_call(
            "weather", "get_forecasts", {"type": "daily"},
            target={"entity_id": entity_id}, blocking=True, return_response=True,
        )
    except Exception:
        return []
    forecast = (response or {}).get(entity_id, {}).get("forecast")
    if not isinstance(forecast, list):
        return []
    days: list[dict[str, str]] = []
    for entry in forecast[:count]:
        if not isinstance(entry, dict):
            days.append({"label": "", "condition": "", "value": ""})
            continue
        parsed = _parse_iso_datetime(entry.get("datetime"))
        label = _WEEKDAY_ABBR_CS[parsed.weekday()] if parsed else ""
        try:
            # Mirrors render.py's _temperature and the panel's own sample
            # cells; see the comment there.
            value = f"{round(float(entry.get('temperature')))}°C"
        except (TypeError, ValueError):
            value = ""
        days.append({"label": label, "condition": str(entry.get("condition") or ""), "value": value})
    return days


def _float_or_none(value: Any) -> float | None:
    """A finite float, or None for anything that is not one."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _resample_series(numbers: list[float], points: int) -> list[float]:
    """Port of _resampleSeries - evenly spaced buckets, each its own mean.

    A thermostat can report twice a minute or twice an hour; a curve drawn
    straight from the recorder's rows would show the sampling rate rather than
    the temperature.
    """
    if len(numbers) <= points:
        return numbers
    out: list[float] = []
    for index in range(points):
        start = (index * len(numbers)) // points
        end = max(start + 1, ((index + 1) * len(numbers)) // points)
        chunk = numbers[start:end]
        out.append(sum(chunk) / len(chunk))
    return out


async def _async_history_series(
    hass: HomeAssistant, entity_id: str, hours: int, points: int
) -> list[float] | None:
    """A recorded series for one entity - mirrors _templateHistorySeries.

    None, not [], when the recorder cannot answer: an entity excluded from
    history, or an installation without the recorder at all. The caller then
    keeps the curve the manual send drew rather than flattening the row.
    """
    if not entity_id:
        return None
    try:
        from homeassistant.components.recorder import get_instance, history
        from homeassistant.util import dt as dt_util
    except Exception:
        return None
    end = dt_util.utcnow()
    start = end - timedelta(hours=max(1, hours))
    # A climate entity keeps the room temperature in an attribute, so asking
    # for states without attributes would come back as a list of "heat".
    climate = entity_id.startswith("climate.")
    try:
        rows = await get_instance(hass).async_add_executor_job(
            lambda: history.state_changes_during_period(
                hass, start, end, entity_id,
                include_start_time_state=True,
                no_attributes=not climate,
            )
        )
    except Exception:
        return None
    numbers: list[float] = []
    for item in (rows or {}).get(entity_id) or []:
        raw = (
            (getattr(item, "attributes", None) or {}).get("current_temperature")
            if climate
            else getattr(item, "state", None)
        )
        parsed = _float_or_none(raw)
        if parsed is not None:
            numbers.append(parsed)
    if len(numbers) < 2:
        return None
    return _resample_series(numbers, max(2, points))


def _departure_minutes(row: dict[str, Any]) -> int:
    """A departure's countdown, for merging two stops onto one board.

    transit.py always writes `minutes`; anything without it sorts last rather
    than to the top, where a missing value would push an unknown service ahead
    of every real one.
    """
    try:
        return int(row.get("minutes"))
    except (TypeError, ValueError):
        return 10 ** 6


async def _async_todo_items(hass: HomeAssistant, entity_id: str) -> list[dict[str, str]] | None:
    """Every item of a todo.* list - mirrors _templateTodoItems.

    A todo entity's own state is the number of items left; the items are not in
    its attributes at all, so this service call is the only way to read them,
    the same as calendar.get_events below.

    None, not [], when the list could not be read: an empty list is a real
    answer a shopping display should print ("vše odškrtnuto"), and a failed
    read is not - the caller keeps the last rendered rows for that one.
    """
    if not entity_id:
        return None
    try:
        response = await hass.services.async_call(
            "todo", "get_items", {},
            target={"entity_id": entity_id}, blocking=True, return_response=True,
        )
    except Exception:
        return None
    items = (response or {}).get(entity_id, {}).get("items")
    if not isinstance(items, list):
        return None
    return [
        {"summary": str(item.get("summary") or ""), "status": str(item.get("status") or "")}
        for item in items
        if isinstance(item, dict)
    ]


async def _async_calendar_entry(hass: HomeAssistant, entity_id: str, index: int) -> dict[str, str]:
    """The event `index` positions into the next 21 days - mirrors _templateCalendarEntry."""
    if not entity_id:
        return {}
    try:
        response = await hass.services.async_call(
            "calendar", "get_events", {"duration": {"days": 21}},
            target={"entity_id": entity_id}, blocking=True, return_response=True,
        )
    except Exception:
        return {}
    events = (response or {}).get(entity_id, {}).get("events")
    if not isinstance(events, list) or index >= len(events):
        return {}
    event = events[index]
    if not isinstance(event, dict):
        return {}
    title = str(event.get("summary") or "")
    start_raw = str(event.get("start") or "")
    start = _parse_iso_datetime(start_raw)
    if start is None:
        return {"day": "", "month": "", "title": title, "detail": ""}
    all_day = "T" not in start_raw
    detail_time = "celý den" if all_day else start.strftime("%H:%M")
    location = str(event.get("location") or "")
    return {
        "day": str(start.day),
        "month": _MONTH_ABBR_CS[start.month - 1],
        "title": title,
        "detail": " · ".join(part for part in (detail_time, location) if part),
    }


def _next_clock_aligned_time(interval: int, now: float | None = None) -> float:
    """Calculate the next wall-clock aligned timestamp for an interval in seconds."""
    if now is None:
        now = time.time()
    if interval <= 0:
        return now
    next_time = (int(now) // interval + 1) * interval
    if next_time - now < 1.0:
        next_time += interval
    return float(next_time)


class EntityAutoUpdateManager:
    """Keep every display's design current: on-demand when a bound entity's
    state changes, and periodically on the interval chosen in its settings.

    The two triggers cover different gaps. A bound entity changing state
    (_handle_state_change) refreshes as soon as new data exists, but a camera
    binding (the Meteoradar map) has no HA entity whose *state* ever changes
    when a fresh frame appears, and even an ordinary sensor-bound display
    should still redraw periodically as insurance against a missed event or
    e-ink ghosting. _handle_refresh_tick is what covers both: every configured
    display is checked on REFRESH_TICK_SECONDS and re-queued once its own
    refresh_interval_seconds has actually elapsed - the same interval the
    settings dropdown lets a user pick, which used to only throttle
    state-change refreshes rather than drive one on its own.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = Store(hass, STORE_VERSION, STORE_KEY)
        self._configs: dict[str, dict[str, Any]] = {}
        self._unsubscribe = None
        self._timers: dict[str, Any] = {}
        self._interval_timers: dict[str, Any] = {}
        self._refresh_tasks: dict[str, Any] = {}
        self._pending_refreshes: set[str] = set()
        self._last_refresh_at_dict: dict[str, float] = {}
        self._last_refresh_wall_time_dict: dict[str, float] = {}
        self._next_scheduled_wall_time_dict: dict[str, float] = {}
        self._chart_series: dict[str, list[float]] = {}
        self._gateway_route_cache: dict[str, list[dict[str, Any]]] = {}
        self._gateway_route_cache_at = 0.0
        self._gateway_route_lock = asyncio.Lock()
        self._force_full_refresh: set[str] = set()
        self._initialized = False
        self._refresh_tick_unsubscribe = None

    def _publish_diagnostic_state(
        self, key: str, state: str, attributes: dict[str, Any] | None = None
    ) -> None:
        """Record which stage of the automatic-refresh chain last ran, and when.

        Read by the "Automatické zápisy" diagnostic device's sensors
        (sensor.py). Stored on the manager rather than written straight to
        hass.states so the values are backed by real registry entities that
        survive a restart and can be graphed/alerted on like any other sensor.

        A genuine incident motivated this: automatic writes went completely
        silent for every display with no queue job and no logged exception
        anywhere, and there was no way to tell which link in the chain
        (periodic tick -> per-display schedule -> render -> transfer) had
        stopped without exporting a queue log and reading it by hand.
        """
        diagnostics = self.__dict__.setdefault("_diagnostics", {})
        diagnostics[key] = {
            "state": state,
            "attributes": dict(attributes or {}),
            "at": time.time(),
        }

    @property
    def diagnostics(self) -> dict[str, dict[str, Any]]:
        """Latest recorded stage of the automatic-refresh chain, for sensor.py."""
        return self.__dict__.setdefault("_diagnostics", {})

    def scheduler_overview(self) -> dict[str, Any]:
        """Live scheduler bookkeeping, for the diagnostic sensors to expose."""
        configs = getattr(self, "_configs", {}) or {}
        displays = []
        for address, config in configs.items():
            try:
                displays.append({
                    "address": address,
                    "enabled": self._automation_enabled(config),
                    "trigger_mode": self._refresh_trigger_mode(config),
                    "interval_seconds": self._refresh_interval(config),
                    "next_scheduled": self._next_scheduled_wall_time.get(address),
                })
            except Exception:
                continue
        return {
            "configured_displays": len(configs),
            "armed_interval_timers": len(getattr(self, "_interval_timers", {}) or {}),
            "pending_refreshes": len(getattr(self, "_pending_refreshes", ()) or ()),
            "running_refresh_tasks": len(getattr(self, "_refresh_tasks", {}) or {}),
            "initialized": bool(getattr(self, "_initialized", False)),
            "tick_listener_active": getattr(self, "_refresh_tick_unsubscribe", None) is not None,
            "displays": displays,
        }

    @property
    def _last_refresh_at(self) -> dict[str, float]:
        if not hasattr(self, "_last_refresh_at_dict"):
            self._last_refresh_at_dict = {}
        return self._last_refresh_at_dict

    @_last_refresh_at.setter
    def _last_refresh_at(self, value: dict[str, float]) -> None:
        self._last_refresh_at_dict = value

    @property
    def _last_refresh_wall_time(self) -> dict[str, float]:
        if not hasattr(self, "_last_refresh_wall_time_dict"):
            self._last_refresh_wall_time_dict = {}
        return self._last_refresh_wall_time_dict

    @_last_refresh_wall_time.setter
    def _last_refresh_wall_time(self, value: dict[str, float]) -> None:
        self._last_refresh_wall_time_dict = value

    @property
    def _next_scheduled_wall_time(self) -> dict[str, float]:
        if not hasattr(self, "_next_scheduled_wall_time_dict"):
            self._next_scheduled_wall_time_dict = {}
        return self._next_scheduled_wall_time_dict

    @_next_scheduled_wall_time.setter
    def _next_scheduled_wall_time(self, value: dict[str, float]) -> None:
        self._next_scheduled_wall_time_dict = value

    async def async_initialize(self) -> None:
        if self._initialized:
            return
        stored = await self._store.async_load() or {}
        configs = stored.get("configs") if isinstance(stored, dict) else {}
        self._configs = {
            str(address).upper(): dict(config)
            for address, config in (configs or {}).items()
            if isinstance(config, dict)
            and (config.get("bindings") or config.get("image_cycle"))
        }
        self._initialized = True
        self._refresh_listener()
        initialized_at = time.monotonic()
        initialized_wall = time.time()
        for address, config in self._configs.items():
            if self._automation_enabled(config):
                self._last_refresh_at.setdefault(address, initialized_at)
                self._last_refresh_wall_time.setdefault(address, initialized_wall)
            self._sync_interval_timer(address)
        if self._refresh_tick_unsubscribe is None:
            self._refresh_tick_unsubscribe = async_track_time_interval(
                self.hass,
                self._handle_refresh_tick,
                timedelta(seconds=REFRESH_TICK_SECONDS),
            )

    async def async_stop(self) -> None:
        """Cancel all timers, listeners, and pending tasks on integration unload."""
        if self._unsubscribe is not None:
            self._unsubscribe()
            self._unsubscribe = None
        if self._refresh_tick_unsubscribe is not None:
            self._refresh_tick_unsubscribe()
            self._refresh_tick_unsubscribe = None
        for timer in list(self._timers.values()):
            try:
                timer()
            except Exception:
                pass
        self._timers.clear()
        # Bound once and reused: `getattr(self, "_interval_timers", {}).clear()`
        # cleared a throwaway dict whenever the attribute was missing, so the
        # cancel loop above ran and the timers stayed in the map afterwards.
        interval_timers = getattr(self, "_interval_timers", None)
        if isinstance(interval_timers, dict):
            for timer in list(interval_timers.values()):
                try:
                    timer()
                except Exception:
                    pass
            interval_timers.clear()
        for task in list(self._refresh_tasks.values()):
            if not task.done():
                task.cancel()
        self._refresh_tasks.clear()
        self._pending_refreshes.clear()
        # Cleared alongside _last_refresh_at, which they shadow: leaving them
        # behind kept per-display schedule state for displays this manager no
        # longer has a config for.
        self._last_refresh_wall_time.clear()
        self._next_scheduled_wall_time.clear()
        self._last_refresh_at.clear()
        self._initialized = False

    @callback
    def _handle_refresh_tick(self, _now: Any) -> None:
        now_wall = time.time()
        now_mono = time.monotonic()
        self._publish_diagnostic_state("heartbeat", _current_local_datetime().isoformat())
        # This sweep is the fallback that is supposed to catch and repair any
        # single display whose own dedicated timer chain (_sync_interval_timer)
        # broke - so one address raising here must never be allowed to abort
        # the loop before it reaches every address after it. An unguarded
        # exception on one bad config used to do exactly that: it silently
        # wedged automatic refresh for every display listed after the broken
        # one, every single tick, forever, with nothing about it logged.
        for address, config in list(self._configs.items()):
            try:
                if self._refresh_trigger_mode(config) == "change_only":
                    continue
                if not self._automation_enabled(config):
                    continue
                interval = self._refresh_interval(config)
                last_mono = self._last_refresh_at.get(address)
                if last_mono is None:
                    self._schedule_refresh(address)
                    self._sync_interval_timer(address)
                    continue
                overdue_mono = now_mono - last_mono
                next_wall = self._next_scheduled_wall_time.get(address, 0.0)
                if (next_wall > 0 and now_wall >= next_wall) or overdue_mono >= interval:
                    if overdue_mono >= interval * 2:
                        _LOGGER.warning(
                            "[%s] Automatic refresh is %.0fs overdue (interval %ds) - "
                            "the periodic fallback tick just caught it now.",
                            address, overdue_mono, interval,
                        )
                    self._schedule_refresh(address)
                    self._sync_interval_timer(address)
            except Exception:
                _LOGGER.exception(
                    "[%s] Periodic refresh fallback tick failed for this display; "
                    "continuing with the rest of the fleet.",
                    address,
                )

    @staticmethod
    def _refresh_interval(config: dict[str, Any]) -> int:
        try:
            interval = int(config.get("refresh_interval_seconds") or DEFAULT_REFRESH_INTERVAL_SECONDS)
        except (TypeError, ValueError):
            interval = DEFAULT_REFRESH_INTERVAL_SECONDS
        return max(MIN_REFRESH_INTERVAL_SECONDS, min(MAX_REFRESH_INTERVAL_SECONDS, interval))

    @staticmethod
    def _refresh_trigger_mode(config: dict[str, Any]) -> str:
        mode = str(config.get("refresh_trigger_mode") or DEFAULT_REFRESH_TRIGGER_MODE)
        return mode if mode in VALID_REFRESH_TRIGGER_MODES else DEFAULT_REFRESH_TRIGGER_MODE

    @staticmethod
    def _automation_enabled(config: dict[str, Any]) -> bool:
        """Treat legacy configurations without the flag as active."""
        return config.get("enabled") is not False

    @staticmethod
    def _always_send(config: dict[str, Any]) -> bool:
        """Whether to write even when the new image is identical to the old one.

        **On by default.** Skipping an unchanged image saves battery and
        avoids a pointless e-ink flash, and that was the original default -
        but in practice it made a working automation indistinguishable from a
        broken one: the very first automatic write would land (its content
        differed from the manually uploaded design), every later render came
        out byte-identical, and the display then silently never wrote again.
        Users reasonably read "the timer ran out and nothing was sent" as a
        bug, and no amount of logging changes that a scheduled write they
        asked for did not happen.

        So the guarantee wins over the optimisation: an interval that elapses
        now always produces a real write. Turn it off per display to get the
        battery-saving behaviour back on a design that does change on its own.
        """
        return config.get("always_send") is not False

    def _sync_interval_timer(self, address: str) -> None:
        """Arm one exact per-display interval aligned to HA internal clock."""
        timers = getattr(self, "_interval_timers", None)
        if timers is None:
            timers = self._interval_timers = {}
        cancel = timers.pop(address, None)
        if callable(cancel):
            cancel()
        config = self._configs.get(address)
        if (
            not config
            or not self._automation_enabled(config)
            or self._refresh_trigger_mode(config) == "change_only"
            or getattr(self, "hass", None) is None
        ):
            self._next_scheduled_wall_time.pop(address, None)
            return
        interval = self._refresh_interval(config)
        now_wall = time.time()
        next_wall = _next_clock_aligned_time(interval, now_wall)
        self._next_scheduled_wall_time[address] = next_wall
        delay = max(0.5, next_wall - now_wall)

        @callback
        def _run(_now: Any) -> None:
            timers.pop(address, None)
            config = self._configs.get(address)
            if not config or not self._automation_enabled(config):
                return
            # This per-display chain only survives as long as every link
            # re-arms the next one. An exception here used to end the chain
            # for this address forever - silently, since a callback exception
            # escaping to the event loop is not logged under this integration's
            # own logger - leaving it to be caught (if at all) by the 30s
            # fallback sweep in _handle_refresh_tick. Re-arm unconditionally so
            # a single failed attempt costs one missed refresh, not all of them.
            try:
                self._schedule_refresh(address)
            except Exception:
                _LOGGER.exception(
                    "[%s] Failed to schedule the clock-aligned automatic refresh.",
                    address,
                )
            try:
                self._sync_interval_timer(address)
            except Exception:
                _LOGGER.exception(
                    "[%s] Failed to re-arm the next clock-aligned automatic refresh; "
                    "the periodic fallback sweep should still catch it.",
                    address,
                )

        timers[address] = async_call_later(self.hass, delay, _run)

    async def async_set_config(self, address: str, config: dict[str, Any] | None) -> None:
        await self.async_initialize()
        normalized = address.upper()
        self._configs.pop(normalized, None)
        self._last_refresh_at.pop(normalized, None)
        self._pending_refreshes.discard(normalized)
        # Prune cached chart series for this address to avoid memory leaks
        chart_series = getattr(self, "_chart_series", None)
        if isinstance(chart_series, dict):
            for key in list(chart_series):
                if key.startswith(f"{normalized}:"):
                    chart_series.pop(key, None)

        cancel_timer = self._timers.pop(normalized, None)
        if cancel_timer:
            cancel_timer()
        refresh_task = getattr(self, "_refresh_tasks", {}).get(normalized)
        if refresh_task is not None and refresh_task.done():
            self._refresh_tasks.pop(normalized, None)
        # A refresh task may already be inside a physical BLE/gateway write.
        # Cancelling it here used to cut a gateway transfer mid-block, release
        # TransferQueue's resource lock and leave the ESP32 itself busy. Every
        # job that had waited behind it then reached the gateway at once and
        # failed with gateway_busy. Clearing _pending_refreshes above is enough
        # to stop another loop iteration; an in-flight write must finish. The
        # manual upload that changed this config is already serialised by the
        # queue's device/resource locks and safely runs next.
        if (
            isinstance(config, dict)
            and (config.get("bindings") or config.get("image_cycle"))
        ):
            updated = dict(config)
            updated["enabled"] = self._automation_enabled(updated)
            updated["refresh_interval_seconds"] = self._refresh_interval(updated)
            updated["refresh_trigger_mode"] = self._refresh_trigger_mode(updated)
            self._configs[normalized] = updated
            # The transfer that activates this config has just written the
            # current frame. Start its interval from that confirmed write,
            # instead of treating a missing timestamp as immediately overdue.
            if updated["enabled"]:
                self._last_refresh_at[normalized] = time.monotonic()
                self._last_refresh_wall_time[normalized] = time.time()
        await self._store.async_save({"configs": self._configs})
        self._refresh_listener()
        self._sync_interval_timer(normalized)

    async def async_clear_config_if_matches(
        self,
        address: str,
        config: dict[str, Any] | None,
    ) -> None:
        """Clear a failed upload's automation without deleting a newer design."""
        if not isinstance(config, dict):
            return
        await self.async_initialize()
        normalized = address.upper()
        expected = dict(config)
        expected["enabled"] = True
        expected["refresh_interval_seconds"] = self._refresh_interval(expected)
        expected["refresh_trigger_mode"] = self._refresh_trigger_mode(expected)
        if self._configs.get(normalized) == expected:
            await self.async_set_config(normalized, None)

    async def async_request_refresh(self, address: str) -> None:
        """Reconcile values that may have changed while a design was uploading."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if config and self._automation_enabled(config):
            self._schedule_refresh(normalized)

    async def async_set_refresh_interval(self, address: str, seconds: Any) -> None:
        """Update the safety interval without requiring another display upload."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if not config:
            return
        interval = self._refresh_interval({"refresh_interval_seconds": seconds})
        if self._refresh_interval(config) == interval:
            return
        updated = dict(config)
        updated["refresh_interval_seconds"] = interval
        self._configs[normalized] = updated
        await self._store.async_save({"configs": self._configs})
        self._sync_interval_timer(normalized)

    async def async_list_configs(self) -> list[dict[str, Any]]:
        """Return lightweight metadata for the automation management UI.

        Stored configurations also contain base64 images and full SVG documents.
        Those can be several hundred kilobytes per display and must not be sent
        merely to render the overview page.
        """
        await self.async_initialize()
        result: list[dict[str, Any]] = []
        for address, config in sorted(self._configs.items()):
            entity_ids: set[str] = set()
            bindings = config.get("bindings")
            if isinstance(bindings, list):
                for binding in bindings:
                    if isinstance(binding, dict):
                        entity_ids.update(
                            entity_id
                            for entity_id, _attribute in _binding_sources(binding)
                            if entity_id
                        )
            interval = self._refresh_interval(config)
            now_wall = time.time()
            next_wall = self._next_scheduled_wall_time.get(address) or _next_clock_aligned_time(interval, now_wall)
            remaining_seconds = max(0, int(round(next_wall - now_wall)))
            last_wall = self._last_refresh_wall_time.get(address, 0.0)
            if not last_wall:
                last_wall = next_wall - interval
            result.append(
                {
                    "address": address,
                    "enabled": self._automation_enabled(config),
                    "refresh_interval_seconds": interval,
                    "refresh_trigger_mode": self._refresh_trigger_mode(config),
                    "always_send": self._always_send(config),
                    "last_refresh_time": round(last_wall, 1),
                    "next_refresh_time": round(next_wall, 1),
                    "remaining_seconds": remaining_seconds,
                    "binding_count": len(bindings) if isinstance(bindings, list) else 0,
                    "image_cycle_count": len(config.get("image_cycle", []))
                    if isinstance(config.get("image_cycle"), list)
                    else 0,
                    "entity_ids": sorted(entity_ids),
                    "template_ids": [
                        str(template_id)
                        for template_id in config.get("template_ids", [])
                        if template_id
                    ] if isinstance(config.get("template_ids"), list) else [],
                    "route_type": str(config.get("route_type") or "local"),
                    "gateway_id": str(config.get("gateway_id") or ""),
                    "transport_name": str(config.get("transport_name") or ""),
                }
            )
        return result

    async def async_set_refresh_trigger_mode(self, address: str, mode: Any) -> None:
        """Update what triggers a refresh (change, interval, or both) in place."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if not config:
            return
        resolved = self._refresh_trigger_mode({"refresh_trigger_mode": mode})
        if self._refresh_trigger_mode(config) == resolved:
            return
        updated = dict(config)
        updated["refresh_trigger_mode"] = resolved
        self._configs[normalized] = updated
        await self._store.async_save({"configs": self._configs})
        # The periodic tick re-checks each config's mode on every tick, so
        # nothing extra is needed for "change_only". Switching into or out of
        # "interval_only" does need this: it changes which entities this
        # display's bindings should ever be able to trigger a refresh through.
        self._refresh_listener()
        self._sync_interval_timer(normalized)

    async def async_set_always_send(self, address: str, always_send: Any) -> None:
        """Toggle writing even when the rendered image has not changed."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if not config:
            return
        resolved = bool(always_send)
        if self._always_send(config) == resolved:
            return
        updated = dict(config)
        updated["always_send"] = resolved
        self._configs[normalized] = updated
        await self._store.async_save({"configs": self._configs})

    async def async_set_enabled(self, address: str, enabled: Any) -> None:
        """Pause or resume a stored automatic display update in place."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if not config:
            return
        resolved = bool(enabled)
        if self._automation_enabled(config) == resolved:
            return
        updated = dict(config)
        updated["enabled"] = resolved
        self._configs[normalized] = updated
        if resolved:
            # A resumed automation starts a fresh interval instead of firing an
            # overdue write immediately after the user switches it on.
            self._last_refresh_at[normalized] = time.monotonic()
            self._last_refresh_wall_time[normalized] = time.time()
        else:
            self._last_refresh_at.pop(normalized, None)
            self._last_refresh_wall_time.pop(normalized, None)
            self._pending_refreshes.discard(normalized)
            cancel_timer = self._timers.pop(normalized, None)
            if callable(cancel_timer):
                cancel_timer()
        await self._store.async_save({"configs": self._configs})
        self._refresh_listener()
        self._sync_interval_timer(normalized)

    async def async_set_gateway_preference(
        self,
        address: str,
        gateway_id: str,
        transport_name: str = "",
    ) -> None:
        """Apply a persisted manual/automatic gateway choice to active automation."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if not config:
            return
        updated = dict(config)
        if gateway_id == LOCAL_ROUTE_ID:
            # Zamčeno na adaptéru Home Assistantu - žádná gateway se nehledá.
            updated["gateway_selection"] = "manual"
            updated["manual_gateway_id"] = LOCAL_ROUTE_ID
            updated["route_type"] = "local"
            updated["gateway_id"] = ""
            updated["transport_name"] = transport_name or "Home Assistant Bluetooth"
        elif gateway_id:
            updated["gateway_selection"] = "manual"
            updated["manual_gateway_id"] = gateway_id
            updated["route_type"] = "gateway"
            updated["gateway_id"] = gateway_id
            updated["transport_name"] = transport_name or "DRATEK eInk gateway"
        else:
            updated["gateway_selection"] = "auto"
            updated.pop("manual_gateway_id", None)
        self._configs[normalized] = updated
        self._gateway_route_cache_at = 0.0
        await self._store.async_save({"configs": self._configs})

    async def async_remove_image_cycle_asset(self, address: str, image_id: str) -> None:
        """Remove a deleted gallery asset from the persisted automatic cycle."""
        await self.async_initialize()
        normalized = address.upper()
        config = self._configs.get(normalized)
        if not config:
            return
        ids = [str(value) for value in config.get("image_cycle_ids", [])]
        if image_id not in ids:
            return
        images = list(config.get("image_cycle", []))
        kept = [index for index, value in enumerate(ids) if value != image_id]
        updated = dict(config)
        updated["image_cycle_ids"] = [ids[index] for index in kept]
        updated["image_cycle"] = [images[index] for index in kept if index < len(images)]
        if not updated["image_cycle"] and not updated.get("bindings"):
            self._configs.pop(normalized, None)
            self._last_refresh_at.pop(normalized, None)
        else:
            self._configs[normalized] = updated
        await self._store.async_save({"configs": self._configs})
        self._refresh_listener()
        self._sync_interval_timer(normalized)

    async def async_custom_element_changed(
        self,
        element: dict[str, Any],
        affected_object_ids: dict[str, set[str]],
    ) -> list[str]:
        """Do not schedule display writes when a reusable element is edited."""
        await self.async_initialize()
        return []

    def _refresh_listener(self) -> None:
        if self._unsubscribe:
            self._unsubscribe()
            self._unsubscribe = None
        entity_ids = sorted({
            entity_id
            for config in self._configs.values()
            if self._refresh_trigger_mode(config) != "interval_only"
            if self._automation_enabled(config)
            for binding in config.get("bindings", [])
            if isinstance(binding, dict)
            for entity_id, _attribute in _binding_sources(binding)
        })
        if entity_ids:
            self._unsubscribe = async_track_state_change_event(
                self.hass, entity_ids, self._handle_state_change
            )

    @staticmethod
    def _condition_matches(value: Any, operator: str, target: str) -> bool:
        normalized = str(value).strip().lower()
        expected = str(target).strip().lower()
        if operator == "is_on":
            return normalized in {"on", "true", "1", "open", "home", "active", "heat", "heating", "playing", "unlocked"}
        if operator == "is_off":
            return normalized in {"off", "false", "0", "closed", "not_home", "idle", "unavailable", "unknown", "locked"}
        if operator == "contains":
            return expected in normalized
        if operator == "time_between":
            match = re.search(r"(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?", str(value))
            parts = str(target).split("|", 1)
            if match is None or len(parts) != 2:
                return False

            def minutes(raw: str) -> int | None:
                parsed = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", raw)
                if parsed is None:
                    return None
                hour, minute = int(parsed.group(1)), int(parsed.group(2))
                return hour * 60 + minute if 0 <= hour <= 23 and 0 <= minute <= 59 else None

            current = int(match.group(1)) * 60 + int(match.group(2))
            start, end = minutes(parts[0]), minutes(parts[1])
            if start is None or end is None or start == end:
                return False
            return start <= current < end if start < end else current >= start or current < end
        if operator in {"greater", "greater_equal", "less", "less_equal"}:
            try:
                current_number = float(value)
                target_number = float(target)
            except (TypeError, ValueError):
                return False
            return {
                "greater": current_number > target_number,
                "greater_equal": current_number >= target_number,
                "less": current_number < target_number,
                "less_equal": current_number <= target_number,
            }[operator]
        equal = normalized == expected
        return not equal if operator == "not_equals" else equal

    @staticmethod
    def _state_value(state: Any, binding: dict[str, Any]) -> str:
        fallback = str(binding.get("fallback", ""))
        prefix = str(binding.get("value_prefix") or "")
        suffix = str(binding.get("value_suffix") or "")

        internal_val = _resolve_internal_system_value(binding)
        if internal_val is not None:
            return internal_val

        if state is None:
            return fallback

        entity_id = str(binding.get("entity_id") or "")
        attribute = str(binding.get("entity_attribute") or "")
        kind = str(binding.get("kind") or "")
        label = str(binding.get("label") or "")
        domain = entity_id.split(".", 1)[0] if "." in entity_id else ""

        value = state.attributes.get(attribute) if attribute else state.state

        # Handle climate entities specifically when attribute is not explicitly provided
        if domain == "climate" and not attribute:
            normalized_meta = _remove_diacritics(f"{kind} {label} {entity_id}")
            if "vykon" in normalized_meta or kind == "hvac_action":
                action = str(state.attributes.get("hvac_action") or state.state or "").lower()
                action_text = {
                    "heating": "Topí", "idle": "Klid", "off": "Vypnuto",
                    "cooling": "Chladí", "drying": "Vysouší", "fan": "Ventilace"
                }.get(action, fallback)
                return f"{prefix}{action_text}{suffix}"
            if kind == "temperature" or "teplot" in normalized_meta or not attribute:
                if "cil" in normalized_meta:
                    value = state.attributes.get("temperature")
                else:
                    value = state.attributes.get("current_temperature")
                    if value is None:
                        value = state.attributes.get("temperature")
                unit = str(state.attributes.get("temperature_unit") or "°C")
                if value is not None and value != "" and str(value).lower() not in {"unavailable", "unknown"}:
                    return f"{prefix}{_format_czech_number(value)} {unit}{suffix}"

        # Handle weather entity temperature
        if domain == "weather" and (attribute == "temperature" or kind == "temperature" or "teplot" in _remove_diacritics(f"{kind} {label}")):
            value = state.attributes.get("temperature") if attribute == "temperature" else (state.attributes.get("temperature") or value)
            unit = str(state.attributes.get("temperature_unit") or state.attributes.get("unit_of_measurement") or "°C")
            if value is not None and value != "" and str(value).lower() not in {"unavailable", "unknown"}:
                return f"{prefix}{_format_czech_number(value)} {unit}{suffix}"

        # weather.js's detail strip (humidity/wind/pressure) reads these off
        # the same weather.* entity as temperature/condition above - none of
        # them are the entity's own `state` (that stays the condition word),
        # so each needs its own attribute read the way temperature does.
        if domain == "weather" and kind == "humidity":
            value = state.attributes.get("humidity")
            if value is not None and value != "" and str(value).lower() not in {"unavailable", "unknown"}:
                return f"{prefix}{_format_czech_number(value)} %{suffix}"
        if domain == "weather" and kind == "wind_speed":
            value = state.attributes.get("wind_speed")
            unit = str(state.attributes.get("wind_speed_unit") or "km/h")
            if value is not None and value != "" and str(value).lower() not in {"unavailable", "unknown"}:
                return f"{prefix}{_format_czech_number(value)} {unit}{suffix}"
        if domain == "weather" and kind == "pressure":
            value = state.attributes.get("pressure")
            unit = str(state.attributes.get("pressure_unit") or "hPa")
            if value is not None and value != "" and str(value).lower() not in {"unavailable", "unknown"}:
                return f"{prefix}{_format_czech_number(value)} {unit}{suffix}"

        if value is None or str(value).strip().lower() in {"unavailable", "unknown"}:
            return fallback

        rules = binding.get("condition_rules")
        if isinstance(rules, list) and rules:
            for rule in rules:
                if isinstance(rule, dict) and EntityAutoUpdateManager._condition_matches(value, str(rule.get("operator") or "equals"), str(rule.get("value") or "")):
                    return str(rule.get("symbol") or "●")
            return str(binding.get("default_symbol") or "○")
        if binding.get("status_icons"):
            active_values = {
                item.strip().lower()
                for item in str(binding.get("status_on_values") or "on,true,1,open,home").split(",")
                if item.strip()
            }
            return str(binding.get("status_on_symbol") or "●") if str(value).strip().lower() in active_values else str(binding.get("status_off_symbol") or "○")
        if isinstance(value, (list, dict, tuple)):
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

        if not attribute and binding.get("type") in (None, "", "text"):
            words = _state_words(entity_id, state, kind)
            if words:
                return f"{prefix}{words}{suffix}"

        unit = ""
        if binding.get("include_unit") or kind == "temperature" or domain in ("sensor", "number", "weather", "climate") or state.attributes.get("unit_of_measurement"):
            unit = str(state.attributes.get("unit_of_measurement") or state.attributes.get("temperature_unit") or "")

        raw_result = f"{prefix}{_format_czech_number(value)}{f' {unit}' if unit else ''}{suffix}"
        for u in ("°C", "%", "kW", "kWh", "hPa", "bar", "V", "A", "W", "l/min", "ppm", "°", "dBm", "EUR", "Kč"):
            dupe = f"{u} {u}"
            while dupe in raw_result:
                raw_result = raw_result.replace(dupe, u)
        return raw_result

    def _chart_value(self, address: str, state: Any, binding: dict[str, Any]) -> str:
        if state is None:
            return str(binding.get("fallback", ""))
        attribute = str(binding.get("entity_attribute") or "")
        raw_value = state.attributes.get(attribute) if attribute else state.state
        if binding.get("history_mode") == "attribute" or isinstance(raw_value, (list, dict, tuple)):
            return json.dumps(raw_value, ensure_ascii=False, separators=(",", ":"))
        try:
            number = float(raw_value)
        except (TypeError, ValueError):
            return str(binding.get("fallback", ""))
        key = f"{address}:{binding.get('id')}"
        series = self._chart_series.setdefault(key, [])
        if not series:
            try:
                fallback = json.loads(str(binding.get("fallback") or "[]"))
                if isinstance(fallback, list):
                    series.extend(float(item) for item in fallback if isinstance(item, (int, float)))
            except (TypeError, ValueError, json.JSONDecodeError):
                pass
        if not series or series[-1] != number:
            series.append(number)
        maximum = max(2, min(96, int(binding.get("maxPoints") or 24)))
        del series[:-maximum]
        return json.dumps(series, separators=(",", ":"))

    def _ratio_value(self, binding: dict[str, Any]) -> str:
        """Every meter a ratio() dial/ring/bar-list binding draws, resolved live."""
        meters = binding.get("meters") if isinstance(binding.get("meters"), list) else []
        resolved = []
        for meter in meters:
            if not isinstance(meter, dict):
                continue
            state = self.hass.states.get(str(meter.get("entity_id")))
            resolved.append({
                "percent": _ratio_percent(
                    state, float(meter.get("divisor") or 1), str(meter.get("source") or "")
                ),
                "text": _ratio_text(state),
                "label": str(meter.get("label") or ""),
                "color": str(meter.get("color") or "black"),
            })
        return json.dumps(resolved, ensure_ascii=False, separators=(",", ":"))

    def _series_value(self, state: Any, binding: dict[str, Any]) -> str:
        numbers = _series_numbers(state, int(binding.get("maxPoints") or 96))
        if not numbers:
            try:
                fallback = json.loads(str(binding.get("fallback") or "[]"))
                if isinstance(fallback, list):
                    numbers = [float(item) for item in fallback if isinstance(item, (int, float))]
            except (TypeError, ValueError, json.JSONDecodeError):
                numbers = []
        return json.dumps(numbers, separators=(",", ":"))

    def _current_binding_values(
        self,
        address: str,
        bindings: list[dict[str, Any]],
    ) -> dict[str, str]:
        """Read all binding values through the same path for previews and writes.

        One binding with unexpected data (a non-numeric ratio divisor, a
        malformed chart fallback) used to raise straight out of this loop and
        abort the whole render. Because that happens before automation.py ever
        reaches the transfer queue, the failure produced no queue job and no
        visible error - just a display that silently stopped receiving new
        images every cycle, forever, since the same bad value keeps recurring.
        Isolating each binding keeps every *other* binding on the display
        updating even while one of them is broken.
        """
        values: dict[str, str] = {}
        for binding in bindings:
            binding_id = str(binding.get("id"))
            try:
                values[binding_id] = self._resolve_binding_value(address, binding)
            except Exception:
                _LOGGER.exception(
                    "[%s] Automatic refresh could not resolve binding %r; using its fallback.",
                    address,
                    binding_id,
                )
                values[binding_id] = str(binding.get("fallback", ""))
        return values

    def _resolve_binding_value(self, address: str, binding: dict[str, Any]) -> str:
        binding_type = binding.get("type")
        # A ratio() binding has no single entity_id of its own - a dial or
        # ring reads one meter, a bar list several - so it resolves each
        # meter's own state itself instead of the single lookup below.
        if binding_type == "ratio":
            return self._ratio_value(binding)
        state = self.hass.states.get(str(binding.get("entity_id")))
        if binding_type == "series":
            return self._series_value(state, binding)
        if binding_type == "chart":
            return self._chart_value(address, state, binding)
        if binding_type == "layered":
            entity_values = {
                "__selection__": self._state_value(state, binding),
            }
            for entity_id, _attribute in _binding_sources(binding):
                entity_state = self.hass.states.get(entity_id)
                if entity_state is None:
                    continue
                entity_values[entity_id] = {
                    "state": entity_state.state,
                    **dict(entity_state.attributes),
                }
            return json.dumps(entity_values, ensure_ascii=False, separators=(",", ":"))
        return self._state_value(state, binding)

    async def async_render_preview(
        self,
        address: str,
        config: dict[str, Any],
    ) -> Any:
        """Render the exact image used by automatic entity refreshes."""
        cycle = [
            str(image)
            for image in config.get("image_cycle", [])
            if str(image).startswith("data:image/")
        ]
        if cycle:
            try:
                interval = max(60, int(config.get("image_cycle_interval_seconds") or 600))
            except (TypeError, ValueError):
                interval = 600
            selected = cycle[int(time.time() // interval) % len(cycle)]
            return await self.hass.async_add_executor_job(self._decode_base_image, selected)
        bindings = [
            binding
            for binding in config.get("bindings", [])
            if isinstance(binding, dict)
        ]
        values = self._current_binding_values(address.upper(), bindings)
        # A camera snapshot (the Meteoradar map) needs the event loop to fetch,
        # which the synchronous compositor below does not have - so it is
        # resolved to a data: URL here, the same way entity state values already
        # are, before handing everything off to the executor.
        for binding in bindings:
            if binding.get("type") != "camera":
                continue
            preserve_yellow = int(config.get("sdk_type") or 0) in BWRY_CODES
            # The Meteoradar map and its info sidebar are two separate blocks
            # (see panel-template-svg.mixin.js's _blockRadarMap) captured as
            # two separate camera-type bindings, each re-fetched at its own
            # box's exact size - not one image letterboxed into both shapes.
            if binding.get("radar_part") == "sidebar":
                data_url = await async_render_meteoradar_sidebar_data_url(
                    self.hass,
                    int(binding.get("width") or 0) or 200,
                    int(binding.get("height") or 0) or 300,
                    preserve_yellow=preserve_yellow,
                )
            else:
                data_url = await async_render_camera_binding_data_url(
                    self.hass,
                    str(binding.get("entity_id") or ""),
                    int(binding.get("width") or 0) or 400,
                    int(binding.get("height") or 0) or 300,
                    country=str(binding.get("country") or "cz"),
                    show_precipitation=bool(binding.get("show_precipitation", True)),
                    dotted_light=bool(binding.get("dotted_light", True)),
                    show_wind=bool(binding.get("show_wind", False)),
                    preserve_yellow=preserve_yellow,
                )
            if data_url:
                values[str(binding.get("id"))] = data_url
        # day() and event() need the same treatment: the forecast/calendar data
        # they draw only ever comes from a service call, never a state attribute,
        # so it has to be fetched here (with the event loop) before the
        # synchronous compositor runs.
        for binding in bindings:
            binding_type = binding.get("type")
            if binding_type == "forecast":
                days = await _async_forecast_days(
                    self.hass, str(binding.get("entity_id") or ""), int(binding.get("days") or 4)
                )
                values[str(binding.get("id"))] = json.dumps(days, ensure_ascii=False, separators=(",", ":"))
            elif binding_type == "calendar":
                entry = await _async_calendar_entry(
                    self.hass, str(binding.get("entity_id") or ""), int(binding.get("index") or 0)
                )
                values[str(binding.get("id"))] = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
            elif binding_type == "transit":
                try:
                    limit = int(binding.get("limit") or 4)
                    # One or two stops, merged by countdown - the port of
                    # _mergeTransitDepartures in panel-template-svg.mixin.js.
                    # A display watching a village's train halt and bus stop
                    # together must keep watching both when it refreshes itself.
                    stop_ids = [str(binding.get("stop_id") or "")]
                    second = str(binding.get("stop_id_2") or "").strip()
                    if second:
                        stop_ids.append(second)
                    departures: list[Any] = []
                    for stop_id in stop_ids:
                        board = await async_get_departures(self.hass, stop_id, limit)
                        rows = board.get("departures") if isinstance(board, dict) else []
                        departures.extend(
                            row for row in (rows or []) if isinstance(row, dict)
                        )
                    if len(stop_ids) > 1:
                        # Stable, single-key, exactly as the panel sorts it:
                        # two services leaving in the same minute keep the
                        # order their own timetable gave them.
                        departures.sort(key=lambda row: _departure_minutes(row))
                    values[str(binding.get("id"))] = json.dumps(
                        departures[:limit], ensure_ascii=False, separators=(",", ":")
                    )
                except TransitError:
                    # Keep the last manually rendered board when the public
                    # timetable is temporarily unavailable. Other live slots
                    # on the display must still refresh normally.
                    values[str(binding.get("id"))] = str(binding.get("fallback") or "[]")
            elif binding_type == "history":
                series = await _async_history_series(
                    self.hass,
                    str(binding.get("entity_id") or ""),
                    int(binding.get("hours") or 12),
                    int(binding.get("points") or 24),
                )
                values[str(binding.get("id"))] = (
                    str(binding.get("fallback") or "[]")
                    if series is None
                    else json.dumps(series, ensure_ascii=False, separators=(",", ":"))
                )
            elif binding_type == "todo":
                items = await _async_todo_items(self.hass, str(binding.get("entity_id") or ""))
                values[str(binding.get("id"))] = (
                    str(binding.get("fallback") or "[]")
                    if items is None
                    else json.dumps(items, ensure_ascii=False, separators=(",", ":"))
                )
            elif binding_type in (None, "", "text") and str(binding.get("kind") or "") == "calendar":
                # A plain text slot classified as kind "calendar" (birthdays.js's
                # "Jméno z kalendáře") reads a calendar entity directly, not
                # through day()/event() - a manual send still special-cases it
                # to the first upcoming event's title (_templateDisplayValue),
                # not the entity's own on/off state. Mirrors that here instead
                # of falling through to _state_value, which has no way to tell
                # this apart from a plain state-backed text binding and would
                # print the raw "on"/"off" state.
                entry = await _async_calendar_entry(self.hass, str(binding.get("entity_id") or ""), 0)
                title = str(entry.get("title") or "").strip()
                prefix = str(binding.get("value_prefix") or "")
                suffix = str(binding.get("value_suffix") or "")
                # Always overwrite, even without an event: the synchronous
                # pass above already ran _state_value on this binding and
                # left the entity's raw "on"/"off" state sitting in `values`,
                # which a manual send never shows for this kind either - it
                # falls back to the binding's own fallback text instead.
                values[str(binding.get("id"))] = f"{prefix}{title}{suffix}" if title else str(binding.get("fallback") or "")
        return await self.hass.async_add_executor_job(
            render_automatic_refresh_image,
            str(config.get("base_image") or ""),
            str(config.get("svg_template") or ""),
            str(config.get("clean_background") or ""),
            bindings,
            values,
        )

    @callback
    def _handle_state_change(self, event: Any) -> None:
        entity_id = event.data.get("entity_id")
        old_state = event.data.get("old_state")
        new_state = event.data.get("new_state")
        # Same isolation as _handle_refresh_tick: this fires on every relevant
        # HA state change, so one config with a binding that raises here would
        # otherwise abort the loop before every address after it ever gets
        # checked, for as long as that bad binding persists.
        for address, config in list(self._configs.items()):
            try:
                if self._refresh_trigger_mode(config) == "interval_only":
                    continue
                if not self._automation_enabled(config):
                    continue
                sources = {
                    (source_entity_id, attribute)
                    for binding in config.get("bindings", [])
                    for source_entity_id, attribute in _binding_sources(binding)
                    if source_entity_id == entity_id
                }
                if sources and any(
                    _source_value(old_state, attribute) != _source_value(new_state, attribute)
                    for _source_entity_id, attribute in sources
                ):
                    self._schedule_refresh(address)
            except Exception:
                _LOGGER.exception(
                    "[%s] Handling a state change failed for this display; "
                    "continuing with the rest of the fleet.",
                    address,
                )

    @callback
    def _schedule_refresh(self, address: str, immediate: bool = False) -> None:
        config = self._configs.get(address)
        if not config or not self._automation_enabled(config):
            return
        self._publish_diagnostic_state(
            "last_schedule",
            _current_local_datetime().isoformat(),
            {"address": address, "immediate": immediate},
        )
        self._pending_refreshes.add(address)
        active_task = self._refresh_tasks.get(address)
        if active_task is not None and not active_task.done():
            return
        cancel = self._timers.pop(address, None)
        if cancel:
            cancel()

        @callback
        def _run(_now: Any) -> None:
            self._timers.pop(address, None)
            self._refresh_tasks[address] = self.hass.async_create_task(
                self._async_refresh_loop(address, immediate=immediate)
            )

        if immediate:
            _run(None)
        else:
            self._timers[address] = async_call_later(self.hass, DEBOUNCE_SECONDS, _run)

    async def _async_refresh_loop(self, address: str, immediate: bool = False) -> None:
        try:
            while address in self._pending_refreshes:
                self._pending_refreshes.discard(address)
                config = self._configs.get(address)
                if not config or not self._automation_enabled(config):
                    return
                if not immediate:
                    interval = min(30, self._refresh_interval(config))
                    elapsed = time.monotonic() - self._last_refresh_at.get(address, 0.0)
                    if elapsed < interval:
                        await asyncio.sleep(interval - elapsed)
                immediate = False
                config = self._configs.get(address)
                if not config or not self._automation_enabled(config):
                    return
                # Values are read only after the wait. Changes that arrived
                # during the interval are therefore already part of this image.
                self._pending_refreshes.discard(address)
                self._publish_diagnostic_state(
                    "last_refresh", "probíhá", {"address": address, "started": _current_local_datetime().isoformat()},
                )
                try:
                    result = await self._async_refresh(address)
                    # "beze změny" is reported separately from "ok" on purpose:
                    # it is the one successful outcome that produces no queue
                    # job at all, which is otherwise indistinguishable from a
                    # broken scheduler when looking at the queue.
                    unchanged = bool((result or {}).get("unchanged"))
                    self._publish_diagnostic_state(
                        "last_refresh",
                        "beze změny (nic se neodesílá)" if unchanged else "ok",
                        {
                            "address": address,
                            "finished": _current_local_datetime().isoformat(),
                            "zapsáno_do_fronty": not unchanged,
                        },
                    )
                except Exception:
                    # Rendering and hardware-format conversion run before
                    # _async_refresh ever reaches the transfer queue, so a
                    # failure there (a bad binding value, a corrupt stored
                    # base_image) never became a queue job and never surfaced
                    # anywhere - just a task exception nobody awaited, logged
                    # by asyncio (if at all) with no display address attached.
                    # The loop still retried every interval, so the display
                    # looked like it had simply stopped: the same failure kept
                    # recurring silently for as long as its cause persisted.
                    _LOGGER.exception(
                        "[%s] Automatic refresh failed before reaching the transfer queue.",
                        address,
                    )
                    self._publish_diagnostic_state(
                        "last_refresh", "chyba", {"address": address, "finished": _current_local_datetime().isoformat()},
                    )
                finally:
                    # A skipped/merged queue entry must not schedule itself again.
                    # A manual upload explicitly requests one reconciliation after
                    # it finishes, while genuine later state changes set pending
                    # through _handle_state_change. Re-adding here created an
                    # endless queue loop for the whole duration of a slow upload.
                    # Count every attempt, including skips and failures, so old
                    # one-second configurations are protected by the safety limit.
                    self._last_refresh_at[address] = time.monotonic()
                    self._last_refresh_wall_time[address] = time.time()
        finally:
            self._refresh_tasks.pop(address, None)


    @staticmethod
    def _decode_base_image(value: str) -> Image.Image:
        encoded = str(value or "")
        if "," in encoded:
            encoded = encoded.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")

    @staticmethod
    def _encode_base_image(image: Image.Image) -> str:
        output = io.BytesIO()
        image.convert("RGB").save(output, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")

    @staticmethod
    def _is_split_or_multi_template_config(config: dict[str, Any]) -> bool:
        """Return True if config represents a split-template or multi-template layout."""
        layout = str(config.get("layout") or "single")
        if layout in ("side-by-side", "stacked", "rows-3", "columns-3", "columns-4", "grid-4", "grid-6", "mixed-5"):
            return True
        template_ids = config.get("template_ids")
        if isinstance(template_ids, list) and len(template_ids) > 1:
            return True
        bindings = config.get("bindings")
        if isinstance(bindings, list):
            prefixes = set()
            for b in bindings:
                if isinstance(b, dict):
                    b_id = str(b.get("id") or "")
                    if b_id.startswith("template-"):
                        parts = b_id.split("-")
                        if len(parts) >= 2:
                            prefixes.add(parts[1])
            if len(prefixes) > 1:
                return True
        return False

    @staticmethod
    def _changed_region(previous: Image.Image, current: Image.Image) -> tuple[int, int, int, int] | None:
        if previous.size != current.size:
            return (0, 0, current.width, current.height)
        box = ImageChops.difference(previous.convert("RGB"), current.convert("RGB")).getbbox()
        if box is None:
            return None
        x0, y0, x1, y1 = box
        # Picksmart's area command requires vertical coordinates to be aligned
        # to eight pixels. A one-pixel safety margin also covers antialiasing.
        x0 = max(0, x0 - 1)
        x1 = min(current.width, x1 + 1)
        y0 = max(0, ((y0 - 1) // 8) * 8)
        y1 = min(current.height, ((y1 + 8) // 8) * 8)
        if y1 <= y0:
            y1 = min(current.height, y0 + 8)
        if y0 % 8 or (y1 - y0) % 8:
            # A panel whose physical height is not byte-aligned (for example
            # 400x300) cannot express a safe area touching its last four rows.
            # Let the caller choose the full-image fallback in that case.
            return (0, 0, current.width, current.height)
        return (x0, y0, x1, y1)

    async def _remember_rendered_image(self, address: str, image: Image.Image) -> None:
        config = self._configs.get(address)
        if not config:
            return
        config["base_image"] = await self.hass.async_add_executor_job(
            self._encode_base_image, image
        )
        await self._store.async_save({"configs": self._configs})
        # setdefault: tests build this manager via __new__, bypassing __init__.
        self.__dict__.setdefault("_force_full_refresh", set()).discard(address)

    async def _async_refresh(self, address: str) -> dict[str, Any] | None:
        config = self._configs.get(address)
        if not config or not self._automation_enabled(config):
            return None
        try:
            async with asyncio.timeout(RENDER_TIMEOUT_SECONDS):
                image = await self.async_render_preview(address, config)
        except TimeoutError as exc:
            raise RuntimeError(
                f"Rendering exceeded the {RENDER_TIMEOUT_SECONDS}s safety timeout."
            ) from exc
        route_type = config.get("route_type", "local")
        gateway_id = str(config.get("gateway_id") or "")
        transport_name = str(config.get("transport_name") or "")
        # Read the route lock itself, not the historical route snapshot stored
        # with the design. This also repairs automations created by older
        # frontends that accidentally marked an automatic gateway as manual.
        gateway_preferences = await async_load_gateway_preferences(self.hass)
        manual_route = str(gateway_preferences.get(address.upper()) or "")
        gateway_selection = "manual" if manual_route else "auto"
        gateway_routes: list[dict[str, Any]] = []
        if gateway_selection == "manual" and manual_route == LOCAL_ROUTE_ID:
            route_type = "local"
            gateway_id = ""
            transport_name = "Home Assistant Bluetooth"
        elif gateway_selection == "manual" and manual_route:
            route_type = "gateway"
            gateway_id = manual_route
        else:
            gateway_routes = await self._async_gateway_routes(address)
            if gateway_routes:
                best_gateway = gateway_routes[0]
                route_type = "gateway"
                gateway_id = str(best_gateway["id"])
                transport_name = str(best_gateway["name"])
            else:
                route_type = "local"
                gateway_id = ""
                transport_name = "Home Assistant Bluetooth"
        sdk_type = int(config["sdk_type"])
        software_version = int(config.get("software_version") or 0)
        transform = config.get("transform")
        orientation = config.get("orientation")
        queue = get_transfer_queue(self.hass)
        try:
            previous = await self.hass.async_add_executor_job(
                self._decode_base_image, str(config.get("base_image") or "")
            )
        except Exception:
            previous = image.copy()
        previous_hardware, current_hardware = await asyncio.gather(
            self.hass.async_add_executor_job(
                prepare_image_for_display, sdk_type, previous, transform, orientation
            ),
            self.hass.async_add_executor_job(
                prepare_image_for_display, sdk_type, image, transform, orientation
            ),
        )
        changed = self._changed_region(previous_hardware, current_hardware)
        if changed is None and self._always_send(config):
            # "Odesílat i beze změny" is on: rewrite the whole panel anyway.
            changed = (0, 0, current_hardware.width, current_hardware.height)
        if changed is None:
            # Nothing to send: the freshly rendered image is pixel-identical to
            # what the display is already showing, so a write would spend a
            # full e-ink refresh (and battery) redrawing the same picture.
            #
            # Deliberate, but it used to be completely invisible: no queue job
            # is created, so from the outside an interval elapsing and being
            # skipped here looks exactly like a scheduler that has stopped
            # working. That cost a long investigation once already, so say so
            # plainly - both in the log and on the "Poslední vykreslení"
            # diagnostic sensor.
            _LOGGER.info(
                "[%s] Automatic refresh rendered an image identical to the one already "
                "on the display, so no write was queued. This is normal when no bound "
                "value has changed since the last write.",
                address,
            )
            return {"ok": True, "unchanged": True, "address": address}
        x0, y0, x1, y1 = changed
        partial = (x0, y0, x1 - x0, y1 - y0)
        region = current_hardware.crop((x0, y0, x1, y1))
        use_partial = (
            sdk_type in PARTIAL_UPDATE_CONFIRMED_SDK_TYPES
            and not self._is_split_or_multi_template_config(config)
            and not config.get("disable_partial")
            and partial[1] % 8 == 0
            and partial[3] % 8 == 0
            and partial[2] * partial[3]
            < current_hardware.width * current_hardware.height * 0.85
        )
        # setdefault: tests build this manager via __new__, bypassing __init__.
        force_full_refresh = self.__dict__.setdefault("_force_full_refresh", set())
        if address in force_full_refresh:
            use_partial = False
        # Assume the worst until _remember_rendered_image proves the new image
        # actually landed. If the send below fails or is interrupted partway
        # (gateway crashes mid-stream, a failover gateway takes over, etc.)
        # the display's own framebuffer may already hold a partial write that
        # does not match what HA thinks it sent. The next attempt then sends
        # the complete image instead of trusting a stale partial-region diff.
        force_full_refresh.add(address)

        if route_type == "gateway" and gateway_id:
            def gateway_runner_factory(route: dict[str, Any]):
                selected_gateway_id = str(route.get("id") or gateway_id)
                selected_gateway_name = str(
                    route.get("name") or transport_name or "DRATEK eInk gateway"
                )

                async def run_gateway(add_log):
                    gateway_partial = False
                    if use_partial:
                        configured_gateways = await async_load_gateways(self.hass)
                        gateway = next(
                            (
                                item
                                for item in configured_gateways
                                if str(item.get("id")) == selected_gateway_id
                            ),
                            None,
                        )
                        status = (
                            await async_gateway_status(self.hass, gateway)
                            if gateway
                            else {}
                        )
                        gateway_partial = bool(status.get("partial_update"))
                    add_log(
                        f"Automatic entity update via {selected_gateway_name} "
                        f"(display RSSI {route.get('rssi', 'unknown')} dBm)."
                    )
                    if gateway_partial:
                        add_log(f"Only changed area x={x0}, y={y0}, width={partial[2]}, height={partial[3]} will be sent.")
                    elif use_partial:
                        add_log("Gateway firmware does not support safe area writes yet; sending the complete image.")
                    result = await async_send_gateway_payload(
                        self.hass,
                        selected_gateway_id,
                        address,
                        sdk_type,
                        region if gateway_partial else image,
                        None if gateway_partial else transform,
                        None if gateway_partial else orientation,
                        software_version,
                        log_callback=add_log,
                        partial=partial if gateway_partial else None,
                    )
                    if result and result.get("ok") is not False:
                        await self._remember_rendered_image(address, image)
                        try:
                            await async_save_display_preview(self.hass, address, image, orientation)
                        except Exception as exc:
                            add_log(f"Display updated, but its preview could not be saved: {exc}")
                    return result or {"ok": False, "error": "Gateway was not found.", "log": []}

                return run_gateway

            if gateway_selection != "manual" and gateway_routes:
                result = await queue.async_submit_gateway_routes(
                    routes=gateway_routes,
                    address=address,
                    operation="entity_update",
                    runner_factory=gateway_runner_factory,
                )
                if result and result.get("ok") is not False:
                    return result
            else:
                manual_gateway_route = await async_gateway_route(self.hass, gateway_id) or {
                    "id": gateway_id,
                    "name": transport_name or "DRATEK eInk gateway",
                    "rssi": None,
                }
                result = await queue.async_submit(
                    resource=gateway_resource(manual_gateway_route),
                    transport_type="gateway",
                    transport_name=str(manual_gateway_route["name"]),
                    address=address,
                    operation="entity_update",
                    runner=gateway_runner_factory(manual_gateway_route),
                )
                if result and result.get("ok") is not False:
                    return result
                # The pinned gateway is offline or failed. Don't strand the
                # display on Home Assistant's own Bluetooth radio alone -
                # fall back to whichever other gateways currently hear it,
                # same as the manual "send now" path in ws_sending.py.
                fallback_routes = await self._async_gateway_routes(address)
                if fallback_routes:
                    result = await queue.async_submit_gateway_routes(
                        routes=fallback_routes,
                        address=address,
                        operation="entity_update",
                        runner_factory=gateway_runner_factory,
                    )
                    if result and result.get("ok") is not False:
                        return result

        async def run_local(add_log):
            add_log("Automatic entity update via Home Assistant Bluetooth.")
            transfer = DratekTransfer(log=add_log, hass=self.hass)
            if use_partial:
                add_log(f"Sending only changed area x={x0}, y={y0}, width={partial[2]}, height={partial[3]}.")
                await transfer.send_partial_image(
                    address,
                    sdk_type,
                    region,
                    x0,
                    y0,
                    partial[2],
                    partial[3],
                    software_version=software_version,
                )
            else:
                if partial[2] * partial[3] < current_hardware.width * current_hardware.height * 0.85:
                    add_log(
                        f"SDK type {sdk_type} has no hardware-confirmed partial refresh; "
                        "sending the complete image so the display really redraws."
                    )
                await transfer.send_image(
                    address,
                    sdk_type,
                    image,
                    transform,
                    orientation,
                    software_version,
                )
            await self._remember_rendered_image(address, image)
            try:
                await async_save_display_preview(self.hass, address, image, orientation)
            except Exception as exc:
                add_log(f"Display updated, but its preview could not be saved: {exc}")
            return {"ok": True, "address": address, "log": []}

        return await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="entity_update",
            runner=run_local,
        )

    async def _async_load_gateways_and_scan(self) -> tuple[list[dict[str, Any]], list[Any]]:
        """Load configured gateways and scan every one of them in parallel."""
        gateways = await async_load_gateways(self.hass)
        scan_results = await asyncio.gather(
            *(
                async_scan_gateway(
                    self.hass,
                    str(gateway.get("id") or ""),
                    GATEWAY_ROUTE_SCAN_SECONDS,
                )
                for gateway in gateways
                if gateway.get("id")
            ),
            return_exceptions=True,
        )
        return gateways, scan_results

    async def _async_gateway_routes(self, address: str) -> list[dict[str, Any]]:
        """Return every gateway receiving this display, strongest first."""
        now = time.monotonic()
        if now - self._gateway_route_cache_at < GATEWAY_ROUTE_CACHE_SECONDS:
            return list(self._gateway_route_cache.get(address.upper(), []))

        async with self._gateway_route_lock:
            now = time.monotonic()
            if now - self._gateway_route_cache_at < GATEWAY_ROUTE_CACHE_SECONDS:
                return list(self._gateway_route_cache.get(address.upper(), []))

            try:
                # self._gateway_route_lock is shared by every device's automatic
                # refresh (and, since today, the manual-pin failover path too) -
                # if async_load_gateways or any single gateway's scan ever hangs
                # past its own nominal timeout (a stalled TCP handshake to a
                # gateway that's down in a way that doesn't cleanly refuse the
                # connection, for instance), this lock would otherwise never be
                # released, silently wedging automatic updates for every display
                # forever, with nothing logged since nothing ever completes.
                # wait_for is the backstop: whatever the underlying cause, this
                # call can never hold the lock past GATEWAY_ROUTE_LOOKUP_TIMEOUT.
                gateways, scan_results = await asyncio.wait_for(
                    self._async_load_gateways_and_scan(),
                    timeout=GATEWAY_ROUTE_LOOKUP_TIMEOUT_SECONDS,
                )
            except Exception:  # one unavailable gateway must not break local automation
                gateways = []
                scan_results = []
            scanned_gateways = [gateway for gateway in gateways if gateway.get("id")]
            routes: dict[str, list[dict[str, Any]]] = {}
            for gateway, scan_result in zip(scanned_gateways, scan_results, strict=False):
                if isinstance(scan_result, Exception) or not scan_result or not scan_result.get("ok"):
                    continue
                for device in scan_result.get("devices", []):
                    device_address = str(device.get("address") or "").upper()
                    if not device_address:
                        continue
                    try:
                        rssi = float(device.get("rssi"))
                    except (TypeError, ValueError):
                        rssi = -999.0
                    routes.setdefault(device_address, []).append({
                        "id": str(gateway["id"]),
                        "name": str(
                            gateway.get("name")
                            or gateway.get("host")
                            or "DRATEK eInk gateway"
                        ),
                        # The address the transfer is really sent to, so the
                        # queue can serialise per radio rather than per stored
                        # record - see TransferQueue._gateway_resource.
                        "endpoint": gateway_send_endpoint(gateway),
                        "rssi": rssi,
                    })

            # BLE advertisements are intentionally intermittent.  A three-second
            # scan can therefore return nothing even though the device panel saw
            # the same display through a gateway moments earlier.  Reuse those
            # still-fresh observations as a fallback instead of unexpectedly
            # routing the write through Home Assistant's local adapter.
            configured_gateways = {
                str(gateway.get("id") or ""): gateway
                for gateway in gateways
                if gateway.get("id")
            }
            discovery_cache = getattr(self.hass, "data", {}).get(
                DISCOVERY_CACHE_KEY, {}
            )
            for cached_address, cached_device in discovery_cache.items():
                normalized_address = str(cached_address or "").upper()
                cached_at = float(cached_device.get("last_seen_at") or 0)
                if not cached_at or time.time() - cached_at > DISCOVERY_GRACE_SECONDS:
                    continue
                live_ids = {
                    str(route.get("id") or "")
                    for route in routes.get(normalized_address, [])
                }
                for path in cached_device.get("paths", []):
                    gateway_id = str(path.get("id") or "")
                    gateway = configured_gateways.get(gateway_id)
                    if (
                        path.get("type") != "gateway"
                        or not gateway
                        or gateway_id in live_ids
                    ):
                        continue
                    try:
                        rssi = float(path.get("rssi"))
                    except (TypeError, ValueError):
                        rssi = -999.0
                    routes.setdefault(normalized_address, []).append(
                        {
                            "id": gateway_id,
                            "name": str(
                                path.get("name")
                                or gateway.get("name")
                                or gateway.get("host")
                                or "DRATEK eInk gateway"
                            ),
                            # Every builder in this function has to stamp this.
                            # A route without it falls back to queue.py's
                            # id-keyed resource, so the same gateway ends up
                            # holding two locks depending on which builder
                            # produced the route - and a broadcast that fires
                            # eight sends in one second gets some routes from
                            # the live scan and some from here.
                            "endpoint": gateway_send_endpoint(gateway),
                            "rssi": rssi,
                            "temporarily_unseen": True,
                        }
                    )
                    live_ids.add(gateway_id)

            # In background automations where discovery_cache may be empty/stale,
            # preserve previously confirmed routes from self._gateway_route_cache
            # so a single missed 3-second scan doesn't instantly drop the gateway route.
            for cached_addr, cached_routes in getattr(self, "_gateway_route_cache", {}).items():
                normalized_addr = str(cached_addr or "").upper()
                live_ids = {
                    str(route.get("id") or "")
                    for route in routes.get(normalized_addr, [])
                }
                for prev_route in cached_routes if isinstance(cached_routes, list) else []:
                    if not isinstance(prev_route, dict):
                        continue
                    gateway_id = str(prev_route.get("id") or "")
                    gateway = configured_gateways.get(gateway_id)
                    if not gateway or gateway_id in live_ids:
                        continue
                    routes.setdefault(normalized_addr, []).append({
                        **prev_route,
                        # Repaired rather than trusted: a route cached by an
                        # older build carries no endpoint, and the gateway may
                        # since have moved anyway.
                        "endpoint": gateway_send_endpoint(gateway),
                        "temporarily_unseen": True,
                    })
                    live_ids.add(gateway_id)

            for device_routes in routes.values():
                # Shared with the transfer queue and the connection map; see
                # routing.route_preference_key.
                device_routes.sort(key=route_preference_key, reverse=True)

            self._gateway_route_cache = routes
            self._gateway_route_cache_at = time.monotonic()
            return list(routes.get(address.upper(), []))

    async def _async_best_gateway_route(self, address: str) -> dict[str, Any] | None:
        """Compatibility helper returning the strongest observed gateway."""
        routes = await self._async_gateway_routes(address)
        return routes[0] if routes else None


def get_entity_auto_update_manager(hass: HomeAssistant) -> EntityAutoUpdateManager:
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = domain_data.get(DATA_KEY)
    if manager is None:
        manager = EntityAutoUpdateManager(hass)
        domain_data[DATA_KEY] = manager
    return manager
