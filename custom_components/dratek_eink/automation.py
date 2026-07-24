from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .gateway import async_send_gateway_payload
from .queue import get_transfer_queue
from .render import render_entity_bound_image
from .transfer import DratekTransfer

STORE_KEY = "dratek_eink.entity_automations"
STORE_VERSION = 1
DATA_KEY = "entity_auto_update_manager"
DEBOUNCE_SECONDS = 0.15
RETRY_AFTER_BUSY_SECONDS = 1.0
DEFAULT_REFRESH_INTERVAL_SECONDS = 60
MIN_REFRESH_INTERVAL_SECONDS = 30
MAX_REFRESH_INTERVAL_SECONDS = 86400


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


def _source_value(state: Any, attribute: str) -> Any:
    if state is None:
        return None
    return state.attributes.get(attribute) if attribute else state.state


class EntityAutoUpdateManager:
    """Persist entity bindings and refresh displays after state changes."""

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
        self._initialized = False

    async def async_initialize(self) -> None:
        if self._initialized:
            return
        data = await self._store.async_load()
        configs = data.get("configs", {}) if isinstance(data, dict) else {}
        self._configs = {
            str(address).upper(): config
            for address, config in configs.items()
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
        if not config or not config.get("enabled") or not config.get("bindings"):
            self._configs.pop(normalized, None)
            self._last_refresh_at.pop(normalized, None)
        else:
            stored = dict(config)
            stored["address"] = normalized
            stored["enabled"] = True
            stored["refresh_interval_seconds"] = self._refresh_interval(stored)
            self._configs[normalized] = stored
            # The configuration is saved after a manual upload. Start the safety
            # interval now so an entity change cannot immediately write again.
            self._last_refresh_at[normalized] = time.monotonic()
        await self._store.async_save({"configs": self._configs})
        self._refresh_listener()

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

    def _refresh_listener(self) -> None:
        if self._unsubscribe:
            self._unsubscribe()
            self._unsubscribe = None
        entity_ids = sorted(
            {
                entity_id
                for config in self._configs.values()
                for binding in config.get("bindings", [])
                for entity_id, _attribute in _binding_sources(binding)
            }
        )
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
                result = await self._async_refresh(address)
                if isinstance(result, dict) and result.get("skipped"):
                    self._pending_refreshes.add(address)
                    await asyncio.sleep(RETRY_AFTER_BUSY_SECONDS)
                else:
                    # Count completed attempts, including failures, to protect
                    # the panel and battery from a rapid retry loop.
                    self._last_refresh_at[address] = time.monotonic()
        finally:
            self._refresh_tasks.pop(address, None)

    async def _async_refresh(self, address: str) -> dict[str, Any] | None:
        config = self._configs.get(address)
        if not config:
            return
        bindings = config.get("bindings", [])
        values = {}
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
        image = await self.hass.async_add_executor_job(
            render_entity_bound_image,
            str(config.get("base_image") or ""),
            bindings,
            values,
        )
        route_type = config.get("route_type", "local")
        gateway_id = str(config.get("gateway_id") or "")
        sdk_type = int(config["sdk_type"])
        transform = config.get("transform")
        orientation = config.get("orientation")
        queue = get_transfer_queue(self.hass)

        if route_type == "gateway" and gateway_id:
            async def run_gateway(add_log):
                add_log(f"Automatic entity update via {config.get('transport_name') or 'gateway'}.")
                result = await async_send_gateway_payload(
                    self.hass, gateway_id, address, sdk_type, image, transform, orientation
                )
                return result or {"ok": False, "error": "Gateway was not found.", "log": []}

            return await queue.async_submit(
                resource=f"gateway:{gateway_id}",
                transport_type="gateway",
                transport_name=str(config.get("transport_name") or "DRATEK eInk gateway"),
                address=address,
                operation="entity_update",
                runner=run_gateway,
            )

        async def run_local(add_log):
            add_log("Automatic entity update via Home Assistant Bluetooth.")
            transfer = DratekTransfer(log=add_log, hass=self.hass)
            await transfer.send_image(address, sdk_type, image, transform, orientation)
            return {"ok": True, "address": address, "log": []}

        return await queue.async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="entity_update",
            runner=run_local,
        )


def get_entity_auto_update_manager(hass: HomeAssistant) -> EntityAutoUpdateManager:
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = domain_data.get(DATA_KEY)
    if manager is None:
        manager = EntityAutoUpdateManager(hass)
        domain_data[DATA_KEY] = manager
    return manager
