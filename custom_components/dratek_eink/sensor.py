"""Diagnostic sensors splitting the integration into its three working blocks.

Getting a display updated automatically runs through three independent
stages, and when nothing appears on the panel the interesting question is
always *which* of them stopped:

1. **Rozhraní** - the panel/frontend served to the browser (design, preview,
   manual send).
2. **Automatické zápisy** - the scheduler that decides a display is due and
   renders its new image (automation.py).
3. **Přenos do zařízení** - the queue that actually ships those bytes over
   BLE or through a gateway (queue.py).

Each block gets its own device here, so the integration page lists three
entries and each one's sensors answer "did this stage run, when, and how did
it end" on its own. Without this the only evidence was a queue-log export,
which by definition only shows stage 3 - a failure in stage 1 or 2 looked
identical to "nothing happened", which is exactly the dead end a real
all-displays-silent incident ran into.

Deliberately poll-based: every value is already kept live in memory by the
manager/queue, so there is nothing to subscribe to and a short poll keeps
this file free of callback wiring into two other modules.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, PANEL_VERSION

BLOCK_UI = "ui"
BLOCK_SCHEDULER = "scheduler"
BLOCK_TRANSFER = "transfer"

BLOCK_NAMES = {
    BLOCK_UI: "DRATEK eInk · Rozhraní",
    BLOCK_SCHEDULER: "DRATEK eInk · Automatické zápisy",
    BLOCK_TRANSFER: "DRATEK eInk · Přenos do zařízení",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    async_add_entities(
        [
            PanelBlockSensor(entry.entry_id),
            SchedulerHeartbeatSensor(entry.entry_id),
            SchedulerDisplaysSensor(entry.entry_id),
            SchedulerLastScheduleSensor(entry.entry_id),
            SchedulerLastRenderSensor(entry.entry_id),
            TransferLastJobSensor(entry.entry_id),
            TransferQueueSensor(entry.entry_id),
        ]
    )


class _BlockSensor(SensorEntity):
    """Shared wiring: one diagnostic sensor belonging to one of the blocks."""

    _attr_has_entity_name = True
    _attr_should_poll = True
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    block = BLOCK_UI
    key = "sensor"

    def __init__(self, entry_id: str) -> None:
        self._entry_id = entry_id
        self._attr_unique_id = f"{entry_id}_{self.block}_{self.key}"
        self._attr_device_info = {
            # A per-block identifier, so each block is its own device on the
            # integration page rather than all of them collapsing into the
            # single "DRATEK eInk" device camera.py already registers.
            "identifiers": {(DOMAIN, f"{entry_id}_{self.block}")},
            "name": BLOCK_NAMES[self.block],
            "manufacturer": "DRATEK.CZ",
            "model": "Diagnostika",
            "sw_version": PANEL_VERSION,
        }
        self._attr_extra_state_attributes: dict[str, Any] = {}

    def _manager(self) -> Any | None:
        try:
            from .automation import get_entity_auto_update_manager

            return get_entity_auto_update_manager(self.hass)
        except Exception:
            return None

    def _queue(self) -> Any | None:
        try:
            from .queue import get_transfer_queue

            return get_transfer_queue(self.hass)
        except Exception:
            return None


class PanelBlockSensor(_BlockSensor):
    """Block 1: the panel/frontend actually registered and being served."""

    block = BLOCK_UI
    key = "panel"
    _attr_name = "Stav rozhraní"
    _attr_icon = "mdi:monitor-dashboard"

    def update(self) -> None:
        paths = self.hass.data.get(DOMAIN, {}).get("registered_panel_static_paths", set())
        self._attr_native_value = "registrováno" if paths else "neregistrováno"
        self._attr_extra_state_attributes = {
            "verze_panelu": PANEL_VERSION,
            "registrované_cesty": sorted(str(path) for path in paths),
        }


class SchedulerHeartbeatSensor(_BlockSensor):
    """Block 2: proof the periodic scheduler sweep is still running at all.

    The single most diagnostic value here - if this stops advancing, nothing
    downstream can possibly fire, and the fault is in the scheduler rather
    than in rendering or transfer.
    """

    block = BLOCK_SCHEDULER
    key = "heartbeat"
    _attr_name = "Tep plánovače"
    _attr_icon = "mdi:heart-pulse"

    def update(self) -> None:
        manager = self._manager()
        diagnostics = getattr(manager, "diagnostics", {}) if manager else {}
        entry = diagnostics.get("heartbeat") or {}
        self._attr_native_value = entry.get("state") or "zatím neproběhl"
        overview = manager.scheduler_overview() if manager else {}
        self._attr_extra_state_attributes = {
            "plánovač_spuštěn": overview.get("initialized"),
            "periodická_kontrola_aktivní": overview.get("tick_listener_active"),
            "čekající_zápisy": overview.get("pending_refreshes"),
            "běžící_úlohy": overview.get("running_refresh_tasks"),
        }


class SchedulerDisplaysSensor(_BlockSensor):
    """Block 2: what the scheduler thinks it is responsible for."""

    block = BLOCK_SCHEDULER
    key = "displays"
    _attr_name = "Nastavené displeje"
    _attr_icon = "mdi:monitor-multiple"

    def update(self) -> None:
        manager = self._manager()
        overview = manager.scheduler_overview() if manager else {}
        self._attr_native_value = overview.get("configured_displays", 0)
        self._attr_extra_state_attributes = {
            "aktivní_časovače": overview.get("armed_interval_timers"),
            "displeje": overview.get("displays", []),
        }


class SchedulerLastScheduleSensor(_BlockSensor):
    """Block 2: the moment a display was last actually queued for a refresh.

    Distinguishes "the timer elapsed but nothing was scheduled" from "it was
    scheduled but never rendered" - the exact ambiguity that made a silent
    stall impossible to place from the outside.
    """

    block = BLOCK_SCHEDULER
    key = "last_schedule"
    _attr_name = "Poslední naplánování"
    _attr_icon = "mdi:calendar-clock"

    def update(self) -> None:
        manager = self._manager()
        diagnostics = getattr(manager, "diagnostics", {}) if manager else {}
        entry = diagnostics.get("last_schedule") or {}
        self._attr_native_value = entry.get("state") or "zatím neproběhlo"
        self._attr_extra_state_attributes = dict(entry.get("attributes") or {})


class SchedulerLastRenderSensor(_BlockSensor):
    """Block 2: how the last render attempt ended, before any transfer."""

    block = BLOCK_SCHEDULER
    key = "last_render"
    _attr_name = "Poslední vykreslení"
    _attr_icon = "mdi:image-refresh"

    def update(self) -> None:
        manager = self._manager()
        diagnostics = getattr(manager, "diagnostics", {}) if manager else {}
        entry = diagnostics.get("last_refresh") or {}
        self._attr_native_value = entry.get("state") or "zatím neproběhlo"
        self._attr_extra_state_attributes = dict(entry.get("attributes") or {})


class TransferLastJobSensor(_BlockSensor):
    """Block 3: the last job that actually reached the hardware, and its result."""

    block = BLOCK_TRANSFER
    key = "last_job"
    _attr_name = "Poslední přenos"
    _attr_icon = "mdi:upload-network"

    def update(self) -> None:
        queue = self._queue()
        entry = getattr(queue, "last_transfer_diagnostic", None) or {}
        self._attr_native_value = entry.get("status") or "zatím neproběhl"
        self._attr_extra_state_attributes = {
            "dokončeno": entry.get("finished_at"),
            "adresa": entry.get("address"),
            "operace": entry.get("operation"),
            "trasa": entry.get("transport_name"),
            "chyba": entry.get("error"),
        }


class TransferQueueSensor(_BlockSensor):
    """Block 3: how much work the transfer queue is currently holding."""

    block = BLOCK_TRANSFER
    key = "queue"
    _attr_name = "Fronta zápisu"
    _attr_icon = "mdi:tray-full"

    def update(self) -> None:
        queue = self._queue()
        jobs = list(getattr(queue, "_jobs", []) or []) if queue else []
        counts = {"queued": 0, "writing": 0, "succeeded": 0, "failed": 0, "skipped": 0}
        for job in jobs:
            status = str(job.get("status") or "")
            if status in counts:
                counts[status] += 1
        self._attr_native_value = counts["queued"] + counts["writing"]
        self._attr_extra_state_attributes = {
            "čeká": counts["queued"],
            "zapisuje": counts["writing"],
            "úspěšné": counts["succeeded"],
            "neúspěšné": counts["failed"],
            "přeskočené": counts["skipped"],
            "celkem_v_historii": len(jobs),
        }
