"""Serves the bundled gateway firmware to the panel's in-browser installer."""

from __future__ import annotations

from aiohttp import web
from homeassistant.components.http import HomeAssistantView

from .gateway import gateway_firmware_part_path


class GatewayFirmwareView(HomeAssistantView):
    """One bundled firmware image, for the browser route of gateway setup.

    The host route never needs this: esptool runs next to the files and opens
    them directly. A browser cannot, so it fetches the same images over HTTP
    and writes them to the ESP32 itself over Web Serial.

    Only the parts FLASH_PROFILES already names are reachable - the request
    selects an entry rather than contributing to a path - so a crafted
    chip/part pair cannot walk out of the firmware directory.
    """

    url = "/api/dratek_eink/firmware/{chip}/{part}"
    name = "api:dratek_eink:firmware"
    requires_auth = True

    async def get(self, request: web.Request, chip: str, part: str) -> web.StreamResponse:
        path = gateway_firmware_part_path(chip, part)
        if path is None:
            return web.Response(status=404, text="Unknown firmware image.")
        hass = request.app["hass"]
        if not await hass.async_add_executor_job(path.is_file):
            return web.Response(
                status=404,
                text="This installation does not bundle that firmware image.",
            )
        # The images change only with the integration itself, and the panel
        # asks for them behind a signed URL that expires on its own, so there
        # is nothing here worth revalidating on every retry of a flash.
        return web.FileResponse(
            path,
            headers={
                "Content-Type": "application/octet-stream",
                "Cache-Control": "private, max-age=3600",
            },
        )
