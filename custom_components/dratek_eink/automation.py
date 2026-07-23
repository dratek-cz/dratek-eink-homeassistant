from __future__ import annotations

import asyncio
import json
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

    async def async_set_config(self, address: str, config: dict[str, Any] | None) -> None:
        await self.async_initialize()
        normalized = address.upper()
        if not config or not config.get("enabled") or not config.get("bindings"):
            self._configs.pop(normalized, None)
        else:
            stored = dict(config)
            stored["address"] = normalized
            stored["enabled"] = True
            self._configs[normalized] = stored
        await self._store.async_save({"configs": self._configs})
        self._refresh_listener()

    def _refresh_listener(self) -> None:
        if self._unsubscribe:
            self._unsubscribe()
            self._unsubscribe = None
        entity_ids = sorted(
            {
                str(binding.get("entity_id"))
                for config in self._configs.values()
                for binding in config.get("bindings", [])
                if binding.get("entity_id")
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
            relevant = [
                binding
                for binding in config.get("bindings", [])
                if binding.get("entity_id") == entity_id
            ]
            if relevant and any(
                self._state_value(old_state, binding) != self._state_value(new_state, binding)
                for binding in relevant
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
                result = await self._async_refresh(address)
                if isinstance(result, dict) and result.get("skipped"):
                    self._pending_refreshes.add(address)
                    await asyncio.sleep(RETRY_AFTER_BUSY_SECONDS)
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
            values[str(binding.get("id"))] = (
                self._chart_value(address, state, binding)
                if binding.get("type") == "chart"
                else self._state_value(state, binding)
            )
        image = await self.hass.async_add_executor_job(
            render_entity_bound_image,
            str(config.get("base_image") or ""),
            bindings,
            values,
        )
        if config.get("orientation") == "portrait":
            image = image.rotate(-90, expand=True)

        route_type = config.get("route_type", "local")
        gateway_id = str(config.get("gateway_id") or "")
        sdk_type = int(config["sdk_type"])
        transform = config.get("transform")
        queue = get_transfer_queue(self.hass)

        if route_type == "gateway" and gateway_id:
            async def run_gateway(add_log):
                add_log(f"Automatic entity update via {config.get('transport_name') or 'gateway'}.")
                result = await async_send_gateway_payload(
                    self.hass, gateway_id, address, sdk_type, image, transform
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
            await transfer.send_image(address, sdk_type, image, transform)
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
