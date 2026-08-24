from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from .const import DOMAIN


class DratekEinkConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for DRATEK eInk."""

    VERSION = 1

    def __init__(self) -> None:
        super().__init__()
        self._discovered_gateway: dict[str, Any] | None = None
        self._discovered_display: dict[str, Any] | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="DRATEK eInk", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    async def async_step_zeroconf(self, discovery_info: Any):
        """Offer a gateway announced by the ESP32 firmware as nearby."""
        properties = dict(getattr(discovery_info, "properties", {}) or {})
        gateway_id = str(properties.get("id") or "").strip()
        if not gateway_id:
            return self.async_abort(reason="not_dratek_gateway")
        host = str(getattr(discovery_info, "host", "") or "").strip()
        if not host:
            return self.async_abort(reason="cannot_connect")
        hostname = str(properties.get("name") or getattr(discovery_info, "hostname", "") or "")
        name = hostname.removesuffix(".local.").removesuffix(".local") or gateway_id
        self._discovered_gateway = {
            "gateway_id": gateway_id,
            "name": name,
            "host": host,
            "port": int(getattr(discovery_info, "port", 80) or 80),
            "firmware": str(properties.get("fw") or ""),
            "chip": str(properties.get("chip") or ""),
        }

        entries = self._async_current_entries()
        if entries:
            gateway = await self._async_store_discovery()
            from .gateway import async_register_gateway_device

            async_register_gateway_device(self.hass, entries[0].entry_id, gateway)
            return self.async_abort(reason="already_configured")

        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        self.context["title_placeholders"] = {"name": name}
        return self.async_show_form(
            step_id="zeroconf_confirm",
            data_schema=vol.Schema({}),
            description_placeholders={"name": name, "host": host},
        )

    async def async_step_zeroconf_confirm(
        self, user_input: dict[str, Any] | None = None
    ):
        if self._discovered_gateway is None:
            return self.async_abort(reason="cannot_connect")
        if user_input is None:
            return self.async_show_form(
                step_id="zeroconf_confirm", data_schema=vol.Schema({})
            )
        await self._async_store_discovery()
        return self.async_create_entry(title="DRATEK eInk", data={})

    async def _async_store_discovery(self) -> dict[str, Any]:
        from .gateway import async_upsert_discovered_gateway

        assert self._discovered_gateway is not None
        return await async_upsert_discovered_gateway(self.hass, **self._discovered_gateway)

    async def async_step_bluetooth(self, discovery_info: Any):
        """Register a physical display heard by HA or a Bluetooth proxy."""
        from .device_registry import register_display_device
        from .discovery import parse_dratek_advertisement

        parsed = parse_dratek_advertisement(discovery_info)
        if parsed is None:
            return self.async_abort(reason="not_dratek_display")
        self._discovered_display = {
            "address": parsed.address.upper(),
            "name": parsed.name,
            "physical_code": parsed.physical_code,
            "sdk_type": parsed.sdk_type,
            "model": parsed.model,
            "hw": parsed.hw,
            "sw": parsed.sw,
        }
        entries = self._async_current_entries()
        if entries:
            register_display_device(
                self.hass, entries[0].entry_id, self._discovered_display
            )
            return self.async_abort(reason="already_configured")

        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        self.context["title_placeholders"] = {"name": parsed.physical_code}
        return self.async_show_form(
            step_id="bluetooth_confirm",
            data_schema=vol.Schema({}),
            description_placeholders={"name": parsed.physical_code},
        )

    async def async_step_bluetooth_confirm(
        self, user_input: dict[str, Any] | None = None
    ):
        if self._discovered_display is None:
            return self.async_abort(reason="cannot_connect")
        if user_input is None:
            return self.async_show_form(
                step_id="bluetooth_confirm", data_schema=vol.Schema({})
            )
        return self.async_create_entry(
            title="DRATEK eInk",
            data={"discovered_display": self._discovered_display},
        )
