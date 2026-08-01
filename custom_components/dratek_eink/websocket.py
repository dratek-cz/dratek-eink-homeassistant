"""Registration entry point for the DRATEK eInk websocket API.

The command handlers live in the ws_* modules next to this one, grouped by the
part of the integration they serve. This module only wires them into Home
Assistant, so the registration list stays readable in one screen.
"""

from __future__ import annotations

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .ws_custom_elements import (
    websocket_delete_custom_element,
    websocket_fetch_custom_element_url,
    websocket_list_custom_elements,
    websocket_save_custom_element,
)
from .ws_devices import (
    websocket_flash_identify,
    websocket_render_preview,
    websocket_scan,
    websocket_set_device_gateway,
    websocket_set_device_name,
    websocket_set_rgb_led,
)
from .ws_gateways import (
    websocket_add_gateway,
    websocket_delete_gateway,
    websocket_discover_gateways,
    websocket_flash_gateway,
    websocket_flash_gateway_job,
    websocket_gateway_ota_job,
    websocket_gateway_serial_ports,
    websocket_gateway_serial_status,
    websocket_gateway_serial_wifi,
    websocket_list_gateways,
    websocket_refresh_gateway,
    websocket_rename_gateway,
    websocket_scan_gateway,
    websocket_send_gateway_design,
    websocket_start_flash_gateway,
    websocket_start_gateway_ota,
)
from .ws_projects import (
    websocket_delete_project,
    websocket_list_device_drafts,
    websocket_list_projects,
    websocket_load_device_draft,
    websocket_load_project,
    websocket_save_device_draft,
    websocket_save_project,
)
from .ws_queue import websocket_clear_queue, websocket_transfer_queue
from .ws_sending import (
    websocket_commit_design_upload,
    websocket_send_design,
    websocket_send_partial_design,
    websocket_send_text,
    websocket_upload_design_chunk,
)

# Handlers that carry a @websocket_command decorator but are deliberately not
# exposed. test_websocket_registration.py compares the decorated handlers against
# the registrations below, so anything left out has to be listed here on purpose -
# that check exists because v0.1.131 silently dropped ten registrations and the
# panel lost gateway sending, projects and custom elements for twenty releases.
INTENTIONALLY_UNREGISTERED = frozenset(
    {
        # Fetches an arbitrary client supplied URL from the Home Assistant host.
        # No frontend code calls it, so it stays off rather than widening the
        # server's outbound surface for a feature nothing uses.
        "websocket_fetch_custom_element_url",
    }
)

COMMANDS = (
    websocket_scan,
    websocket_render_preview,
    websocket_set_rgb_led,
    websocket_flash_identify,
    websocket_send_text,
    websocket_send_design,
    websocket_send_partial_design,
    websocket_upload_design_chunk,
    websocket_commit_design_upload,
    websocket_send_gateway_design,
    websocket_load_device_draft,
    websocket_list_device_drafts,
    websocket_save_device_draft,
    websocket_set_device_name,
    websocket_set_device_gateway,
    websocket_list_projects,
    websocket_save_project,
    websocket_load_project,
    websocket_delete_project,
    websocket_list_custom_elements,
    websocket_save_custom_element,
    websocket_delete_custom_element,
    websocket_list_gateways,
    websocket_add_gateway,
    websocket_delete_gateway,
    websocket_rename_gateway,
    websocket_refresh_gateway,
    websocket_scan_gateway,
    websocket_discover_gateways,
    websocket_gateway_serial_ports,
    websocket_flash_gateway,
    websocket_start_flash_gateway,
    websocket_flash_gateway_job,
    websocket_gateway_serial_status,
    websocket_gateway_serial_wifi,
    websocket_start_gateway_ota,
    websocket_gateway_ota_job,
    websocket_transfer_queue,
    websocket_clear_queue,
)


@callback
def async_setup(hass: HomeAssistant) -> None:
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)


__all__ = [
    "COMMANDS",
    "INTENTIONALLY_UNREGISTERED",
    "async_setup",
    *(command.__name__ for command in COMMANDS),
    "websocket_fetch_custom_element_url",
]
