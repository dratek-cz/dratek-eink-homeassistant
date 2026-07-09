from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .render import render_text_image
from .transfer import DratekTransfer

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)

SEND_TEXT_SCHEMA = vol.Schema(
    {
        vol.Required("address"): cv.string,
        vol.Required("sdk_type"): vol.Coerce(int),
        vol.Required("text"): cv.string,
        vol.Optional("font_size"): vol.Coerce(int),
        vol.Optional("color", default="black"): vol.In(["black", "red"]),
    }
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    async def handle_send_text(call: ServiceCall) -> None:
        address = call.data["address"]
        sdk_type = call.data["sdk_type"]
        text = call.data["text"]
        font_size = call.data.get("font_size")
        color = call.data["color"]

        image = await hass.async_add_executor_job(render_text_image, sdk_type, text, font_size, color)
        transfer = DratekTransfer(log=_LOGGER.info)
        await transfer.send_image(address, sdk_type, image)

    hass.services.async_register(DOMAIN, "send_text", handle_send_text, schema=SEND_TEXT_SCHEMA)
    return True
