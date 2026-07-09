from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components import bluetooth
from homeassistant.const import CONF_ADDRESS, CONF_NAME

from .const import DOMAIN
from .discovery import DratekAdvertisement, is_supported_sdk_type, parse_picksmart_advertisement

_LOGGER = logging.getLogger(__name__)


class DratekEinkConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for DRATEK eInk."""

    VERSION = 1

    def __init__(self) -> None:
        self._devices: dict[str, DratekAdvertisement] = {}
        self._generic_ble_count = 0
        self._scanner_count = 0

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        self._scan()

        if self._scanner_count == 0:
            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema({}),
                errors={"base": "no_bluetooth_adapter"},
                description_placeholders={"generic_ble_count": str(self._generic_ble_count)},
            )

        if not self._devices:
            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema({}),
                errors={"base": "no_devices_found"},
                description_placeholders={
                    "scanner_count": str(self._scanner_count),
                    "generic_ble_count": str(self._generic_ble_count),
                },
            )

        return await self.async_step_pick_device()

    async def async_step_pick_device(self, user_input: dict[str, Any] | None = None):
        if not self._devices:
            self._scan()

        if user_input is not None:
            address = user_input[CONF_ADDRESS]
            device = self._devices[address]
            await self.async_set_unique_id(address)
            self._abort_if_unique_id_configured()

            if not is_supported_sdk_type(device.sdk_type):
                return self.async_show_form(
                    step_id="pick_device",
                    data_schema=self._device_schema(),
                    errors={"base": "unsupported_display_type"},
                    description_placeholders={"sdk_type": str(device.sdk_type)},
                )

            return self.async_create_entry(
                title=f"DRATEK eInk {device.physical_code}",
                data={
                    CONF_ADDRESS: device.address,
                    CONF_NAME: device.name,
                    "physical_code": device.physical_code,
                    "sdk_type": device.sdk_type,
                    "raw_type": device.raw_type,
                    "profile": device.profile,
                    "battery": device.battery,
                    "sw": device.sw,
                    "hw": device.hw,
                    "model": device.model,
                },
            )

        return self.async_show_form(
            step_id="pick_device",
            data_schema=self._device_schema(),
            description_placeholders={
                "device_count": str(len(self._devices)),
                "scanner_count": str(self._scanner_count),
                "generic_ble_count": str(self._generic_ble_count),
            },
        )

    def _scan(self) -> None:
        self._scanner_count = bluetooth.async_scanner_count(self.hass, connectable=True)
        service_infos = bluetooth.async_discovered_service_info(self.hass, connectable=True)
        self._generic_ble_count = len(service_infos)
        devices: dict[str, DratekAdvertisement] = {}

        for service_info in service_infos:
            device = parse_picksmart_advertisement(service_info)
            if device is None:
                continue
            devices[device.address] = device

        self._devices = dict(sorted(devices.items(), key=lambda item: item[1].physical_code))
        _LOGGER.debug(
            "Found %s DRATEK eInk displays from %s BLE advertisements via %s scanners",
            len(self._devices),
            self._generic_ble_count,
            self._scanner_count,
        )

    def _device_schema(self) -> vol.Schema:
        options = {address: device.title for address, device in self._devices.items()}
        return vol.Schema({vol.Required(CONF_ADDRESS): vol.In(options)})
