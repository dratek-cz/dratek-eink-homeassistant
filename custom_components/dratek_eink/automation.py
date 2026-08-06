from __future__ import annotations

import asyncio
import base64
import io
import json
import re
import time
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.storage import Store
from PIL import Image, ImageChops

from .const import DOMAIN, LOCAL_ROUTE_ID, PARTIAL_UPDATE_CONFIRMED_SDK_TYPES
from .gateway import async_gateway_status, async_load_gateways, async_scan_gateway, async_send_gateway_payload
from .queue import get_transfer_queue
from .render import (
    prepare_image_for_display,
    render_entity_bound_image,
    render_entity_bound_svg_image,
)
from .svg_render import render_available
from .display_preview import async_save_display_preview
from .transfer import DratekTransfer

STORE_KEY = "dratek_eink.entity_automations"
STORE_VERSION = 1
DATA_KEY = "entity_auto_update_manager"
DEBOUNCE_SECONDS = 0.15
DEFAULT_REFRESH_INTERVAL_SECONDS = 60
MIN_REFRESH_INTERVAL_SECONDS = 30
MAX_REFRESH_INTERVAL_SECONDS = 86400
BATTERY_SAVER_THRESHOLD_PERCENT = 15
BATTERY_SAVER_MIN_INTERVAL_SECONDS = 3600
GATEWAY_ROUTE_SCAN_SECONDS = 3
GATEWAY_ROUTE_CACHE_SECONDS = 30


def _binding_sources(binding: dict[str, Any]) -> set[tuple[str, str]]:
    """Return every entity and attribute that can change a rendered binding."""
    sources: set[tuple[str, str]] = set()
    entity_id = str(binding.get("entity_id") or "")
    if entity_id:
        sources.add((entity_id, str(binding.get("entity_attribute") or "")))
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
    return state.attributes.get(attribute) if attribute else state.state


class EntityAutoUpdateManager:
    """Keep legacy automation data disabled while manual-only mode is active."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = Store(hass, STORE_VERSION, STORE_KEY)
        self._configs: dict[str, dict[str, Any]] = {}
        self._unsubscribe = None
        self._timers: dict[str, Any] = {}
        self._refresh_tasks: dict[str, Any] = {}
        self._pending_refreshes: set[str] = set()
        self._last_refresh_at: dict[str, float] = {}
        self._chart_series: dict[str, list[float]] = {}
        self._gateway_route_cache: dict[str, dict[str, Any]] = {}
        self._gateway_route_cache_at = 0.0
        self._gateway_route_lock = asyncio.Lock()
        self._initialized = False

    async def async_initialize(self) -> None:
        if self._initialized:
            return
        stored = await self._store.async_load() or {}
        configs = stored.get("configs") if isinstance(stored, dict) else {}
        self._configs = {
            str(address).upper(): dict(config)
            for address, config in (configs or {}).items()
            if isinstance(config, dict) and config.get("enabled")
        }
        self._initialized = True
        self._refresh_listener()

    @staticmethod
    def _refresh_interval(config: dict[str, Any]) -> int:
        try:
            interval = int(config.get("refresh_interval_seconds") or DEFAULT_REFRESH_INTERVAL_SECONDS)
        except (TypeError, ValueError):
            interval = DEFAULT_REFRESH_INTERVAL_SECONDS
        return max(MIN_REFRESH_INTERVAL_SECONDS, min(MAX_REFRESH_INTERVAL_SECONDS, interval))

    async def async_set_config(self, address: str, config: dict[str, Any] | None) -> None:
        await self.async_initialize()
        normalized = address.upper()
        self._configs.pop(normalized, None)
        self._last_refresh_at.pop(normalized, None)
        self._pending_refreshes.discard(normalized)
        cancel_timer = self._timers.pop(normalized, None)
        if cancel_timer:
            cancel_timer()
        refresh_task = getattr(self, "_refresh_tasks", {}).pop(normalized, None)
        if refresh_task is not None and not refresh_task.done():
            refresh_task.cancel()
        if isinstance(config, dict) and config.get("enabled") and config.get("bindings"):
            updated = dict(config)
            updated["enabled"] = True
            updated["refresh_interval_seconds"] = self._refresh_interval(updated)
            self._configs[normalized] = updated
        await self._store.async_save({"configs": self._configs})
        self._refresh_listener()

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
        if self._configs.get(normalized) == expected:
            await self.async_set_config(normalized, None)

    async def async_request_refresh(self, address: str) -> None:
        """Reconcile values that may have changed while a design was uploading."""
        await self.async_initialize()
        normalized = address.upper()
        if normalized in self._configs:
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
        if state is None:
            return str(binding.get("fallback", ""))
        attribute = str(binding.get("entity_attribute") or "")
        value = state.attributes.get(attribute) if attribute else state.state
        if value is None:
            return str(binding.get("fallback", ""))
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
        unit = state.attributes.get("unit_of_measurement") if binding.get("include_unit") and not attribute else ""
        prefix = str(binding.get("value_prefix") or "")
        suffix = str(binding.get("value_suffix") or "")
        return f"{prefix}{value}{f' {unit}' if unit else ''}{suffix}"

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

    def _current_binding_values(
        self,
        address: str,
        bindings: list[dict[str, Any]],
    ) -> dict[str, str]:
        """Read all binding values through the same path for previews and writes."""
        values: dict[str, str] = {}
        for binding in bindings:
            state = self.hass.states.get(str(binding.get("entity_id")))
            if binding.get("type") == "chart":
                value = self._chart_value(address, state, binding)
            elif binding.get("type") == "layered":
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
                value = json.dumps(
                    entity_values,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            else:
                value = self._state_value(state, binding)
            values[str(binding.get("id"))] = value
        return values

    async def async_render_preview(
        self,
        address: str,
        config: dict[str, Any],
    ) -> Any:
        """Render the exact image used by automatic entity refreshes."""
        bindings = [
            binding
            for binding in config.get("bindings", [])
            if isinstance(binding, dict)
        ]
        values = self._current_binding_values(address.upper(), bindings)
        # When the SVG rasteriser is present and the panel captured slot geometry,
        # render dynamic text the same way the manual send did (resvg + bundled
        # Arimo) so the automatic image matches it. Otherwise fall back to the PIL
        # compositor, which never leaves the panel without an update.
        renderer = render_entity_bound_image
        if render_available() and any(
            isinstance(binding, dict) and binding.get("svg") for binding in bindings
        ):
            renderer = render_entity_bound_svg_image
        return await self.hass.async_add_executor_job(
            renderer,
            str(config.get("base_image") or ""),
            bindings,
            values,
        )

    @callback
    def _handle_state_change(self, event: Any) -> None:
        entity_id = event.data.get("entity_id")
        old_state = event.data.get("old_state")
        new_state = event.data.get("new_state")
        for address, config in self._configs.items():
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

    @callback
    def _schedule_refresh(self, address: str) -> None:
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
                self._async_refresh_loop(address)
            )

        self._timers[address] = async_call_later(self.hass, DEBOUNCE_SECONDS, _run)

    async def _async_refresh_loop(self, address: str) -> None:
        try:
            while address in self._pending_refreshes:
                self._pending_refreshes.discard(address)
                config = self._configs.get(address)
                if not config:
                    return
                interval = self._refresh_interval(config)
                wait_seconds = max(
                    0.0,
                    self._last_refresh_at.get(address, 0.0) + interval - time.monotonic(),
                )
                if wait_seconds:
                    await asyncio.sleep(wait_seconds)
                # Values are read only after the wait. Changes that arrived
                # during the interval are therefore already part of this image.
                self._pending_refreshes.discard(address)
                await self._async_refresh(address)
                # A skipped/merged queue entry must not schedule itself again.
                # A manual upload explicitly requests one reconciliation after
                # it finishes, while genuine later state changes set pending
                # through _handle_state_change. Re-adding here created an
                # endless queue loop for the whole duration of a slow upload.
                # Count every attempt, including skips and failures, so old
                # one-second configurations are protected by the safety limit.
                self._last_refresh_at[address] = time.monotonic()
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

    async def _async_refresh(self, address: str) -> dict[str, Any] | None:
        config = self._configs.get(address)
        if not config:
            return None
        image = await self.async_render_preview(address, config)
        route_type = config.get("route_type", "local")
        gateway_id = str(config.get("gateway_id") or "")
        transport_name = str(config.get("transport_name") or "")
        gateway_selection = str(config.get("gateway_selection") or "auto")
        manual_route = str(config.get("manual_gateway_id") or "")
        if gateway_selection == "manual" and manual_route == LOCAL_ROUTE_ID:
            route_type = "local"
            gateway_id = ""
            transport_name = "Home Assistant Bluetooth"
        elif gateway_selection == "manual" and manual_route:
            route_type = "gateway"
            gateway_id = manual_route
        else:
            best_gateway = await self._async_best_gateway_route(address)
            if best_gateway:
                route_type = "gateway"
                gateway_id = str(best_gateway["id"])
                transport_name = str(best_gateway["name"])
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
        if changed is None:
            return {"ok": True, "unchanged": True, "address": address}
        x0, y0, x1, y1 = changed
        partial = (x0, y0, x1 - x0, y1 - y0)
        region = current_hardware.crop((x0, y0, x1, y1))
        use_partial = (
            sdk_type in PARTIAL_UPDATE_CONFIRMED_SDK_TYPES
            and
            partial[1] % 8 == 0
            and partial[3] % 8 == 0
            and partial[2] * partial[3]
            < current_hardware.width * current_hardware.height * 0.85
        )

        if route_type == "gateway" and gateway_id:
            gateway_partial = False
            if use_partial:
                gateway = next(
                    (item for item in await async_load_gateways(self.hass) if str(item.get("id")) == gateway_id),
                    None,
                )
                status = await async_gateway_status(self.hass, gateway) if gateway else {}
                gateway_partial = bool(status.get("partial_update"))

            async def run_gateway(add_log):
                add_log(f"Automatic entity update via {transport_name or 'gateway'}.")
                if gateway_partial:
                    add_log(f"Only changed area x={x0}, y={y0}, width={partial[2]}, height={partial[3]} will be sent.")
                elif use_partial:
                    add_log("Gateway firmware does not support safe area writes yet; sending the complete image.")
                result = await async_send_gateway_payload(
                    self.hass,
                    gateway_id,
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

            return await queue.async_submit(
                resource=f"gateway:{gateway_id}",
                transport_type="gateway",
                transport_name=transport_name or "DRATEK eInk gateway",
                address=address,
                operation="entity_update",
                runner=run_gateway,
            )

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

    async def _async_best_gateway_route(self, address: str) -> dict[str, Any] | None:
        """Return the gateway currently receiving this display with the strongest RSSI."""
        now = time.monotonic()
        if now - self._gateway_route_cache_at < GATEWAY_ROUTE_CACHE_SECONDS:
            return self._gateway_route_cache.get(address.upper())

        async with self._gateway_route_lock:
            now = time.monotonic()
            if now - self._gateway_route_cache_at < GATEWAY_ROUTE_CACHE_SECONDS:
                return self._gateway_route_cache.get(address.upper())

            try:
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
            except Exception:  # one unavailable gateway must not break local automation
                self._gateway_route_cache = {}
                self._gateway_route_cache_at = time.monotonic()
                return None
            scanned_gateways = [gateway for gateway in gateways if gateway.get("id")]
            routes: dict[str, dict[str, Any]] = {}
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
                    current = routes.get(device_address)
                    if current is not None and float(current["rssi"]) >= rssi:
                        continue
                    routes[device_address] = {
                        "id": str(gateway["id"]),
                        "name": str(
                            gateway.get("name")
                            or gateway.get("host")
                            or "DRATEK eInk gateway"
                        ),
                        "rssi": rssi,
                    }

            self._gateway_route_cache = routes
            self._gateway_route_cache_at = time.monotonic()
            return routes.get(address.upper())


def get_entity_auto_update_manager(hass: HomeAssistant) -> EntityAutoUpdateManager:
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = domain_data.get(DATA_KEY)
    if manager is None:
        manager = EntityAutoUpdateManager(hass)
        domain_data[DATA_KEY] = manager
    return manager
