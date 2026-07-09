from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from .const import DOMAIN


class DratekEinkConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for DRATEK eInk."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="DRATEK eInk", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
