from __future__ import annotations

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
DEBOUNCE_SECONDS = 2.0


class EntityAutoUpdateManager:
    """Persist entity bindings and refresh displays after state changes."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = Store(hass, STORE_VERSION, STORE_KEY)
        self._configs: dict[str, dict[str, Any]] = {}
        self._unsubscribe = None
        self._timers: dict[str, Any] = {}
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
    def _state_value(state: Any, binding: dict[str, Any]) -> str:
        if state is None:
            return str(binding.get("fallback", ""))
        attribute = str(binding.get("entity_attribute") or "")
        value = state.attributes.get(attribute) if attribute else state.state
        if value is None:
            return str(binding.get("fallback", ""))
        if isinstance(value, (list, dict, tuple)):
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        unit = state.attributes.get("unit_of_measurement") if binding.get("include_unit") and not attribute else ""
        return f"{value}{f' {unit}' if unit else ''}"

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
        cancel = self._timers.pop(address, None)
        if cancel:
            cancel()

        @callback
        def _run(_now: Any) -> None:
            self._timers.pop(address, None)
            self.hass.async_create_task(self._async_refresh(address))

        self._timers[address] = async_call_later(self.hass, DEBOUNCE_SECONDS, _run)

    async def _async_refresh(self, address: str) -> None:
        config = self._configs.get(address)
        if not config:
            return
        bindings = config.get("bindings", [])
        values = {
            str(binding.get("id")): self._state_value(
                self.hass.states.get(str(binding.get("entity_id"))), binding
            )
            for binding in bindings
        }
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

            await queue.async_submit(
                resource=f"gateway:{gateway_id}",
                transport_type="gateway",
                transport_name=str(config.get("transport_name") or "DRATEK eInk gateway"),
                address=address,
                operation="entity_update",
                runner=run_gateway,
            )
            return

        async def run_local(add_log):
            add_log("Automatic entity update via Home Assistant Bluetooth.")
            transfer = DratekTransfer(log=add_log)
            await transfer.send_image(address, sdk_type, image, transform)
            return {"ok": True, "address": address, "log": []}

        await queue.async_submit(
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
