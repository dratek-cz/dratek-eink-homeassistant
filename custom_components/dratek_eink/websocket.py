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
    websocket_list_custom_elements,
    websocket_save_custom_element,
)
from .ws_automations import (
    websocket_delete_automation,
    websocket_list_automations,
    websocket_update_automation_interval,
    websocket_update_automation_trigger_mode,
)
from .ws_devices import (
    websocket_flash_identify,
    websocket_render_preview,
    websocket_scan,
    websocket_set_device_gateway,
    websocket_set_device_name,
    websocket_set_rgb_led,
)
from .ws_meteoradar import websocket_render_meteoradar
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
    websocket_delete_device_draft_image,
    websocket_delete_user_template,
    websocket_list_device_drafts,
    websocket_list_projects,
    websocket_load_device_draft,
    websocket_load_project,
    websocket_save_device_draft,
    websocket_save_project,
    websocket_list_user_templates,
    websocket_save_user_template,
)
from .ws_queue import websocket_cancel_queue_job, websocket_clear_queue, websocket_transfer_queue
from .ws_sending import (
    websocket_commit_design_upload,
    websocket_send_design,
    websocket_send_partial_design,
    websocket_send_text,
    websocket_upload_design_chunk,
)

# Escape hatch for handlers that carry a @websocket_command decorator but must
# stay unexposed. test_websocket_registration.py compares the decorated handlers
# against the registrations below, so anything left out has to be named here on
# purpose - that check exists because v0.1.131 silently dropped ten registrations
# and the panel lost gateway sending, projects and custom elements for twenty
# releases. Empty is the healthy state: an unreachable handler is dead code.
INTENTIONALLY_UNREGISTERED = frozenset()

COMMANDS = (
    websocket_list_automations,
    websocket_update_automation_interval,
    websocket_update_automation_trigger_mode,
    websocket_delete_automation,
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
    websocket_delete_device_draft_image,
    websocket_list_user_templates,
    websocket_save_user_template,
    websocket_delete_user_template,
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
    websocket_cancel_queue_job,
    websocket_render_meteoradar,
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
]
