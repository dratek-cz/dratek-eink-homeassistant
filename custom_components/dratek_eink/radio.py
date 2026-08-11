"""One radio slot for transfers driven by Home Assistant's local BLE adapter.

Local writes share one physical adapter and therefore remain serialized. Each
ESP32 gateway owns a separate BLE adapter and is protected by its own resource
lock in ``TransferQueue`` instead, allowing different gateways to serve
different displays in parallel while each gateway still handles only one.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

RADIO_LOCK_KEY = "dratek_eink_radio_lock"
RADIO_TASK_KEY = "dratek_eink_radio_task"
RADIO_COUNT_KEY = "dratek_eink_radio_count"


def get_radio_lock(hass: HomeAssistant) -> asyncio.Lock:
    """Return the process-wide radio lock, creating it on first use."""
    lock = hass.data.get(RADIO_LOCK_KEY)
    if lock is None:
        lock = asyncio.Lock()
        hass.data[RADIO_LOCK_KEY] = lock
    return lock


@asynccontextmanager
async def async_radio_slot(hass: HomeAssistant) -> AsyncIterator[None]:
    """Hold the radio for one physical Bluetooth operation (re-entrant)."""
    current_task = asyncio.current_task()
    lock = get_radio_lock(hass)
    owner = hass.data.get(RADIO_TASK_KEY)

    if owner is current_task:
        count = int(hass.data.get(RADIO_COUNT_KEY) or 1) + 1
        hass.data[RADIO_COUNT_KEY] = count
        try:
            yield
        finally:
            c = int(hass.data.get(RADIO_COUNT_KEY) or 1) - 1
            hass.data[RADIO_COUNT_KEY] = c
            if c <= 0:
                hass.data.pop(RADIO_TASK_KEY, None)
                hass.data.pop(RADIO_COUNT_KEY, None)
        return

    async with lock:
        hass.data[RADIO_TASK_KEY] = current_task
        hass.data[RADIO_COUNT_KEY] = 1
        try:
            yield
        finally:
            hass.data.pop(RADIO_TASK_KEY, None)
            hass.data.pop(RADIO_COUNT_KEY, None)


@asynccontextmanager
async def async_try_radio_slot(
    hass: HomeAssistant, timeout: float
) -> AsyncIterator[bool]:
    """Hold the radio if it becomes free within ``timeout``, else yield False (re-entrant)."""
    current_task = asyncio.current_task()
    owner = hass.data.get(RADIO_TASK_KEY)
    if owner is current_task:
        yield True
        return

    lock = get_radio_lock(hass)
    try:
        async with asyncio.timeout(timeout):
            await lock.acquire()
    except TimeoutError:
        yield False
        return
    try:
        hass.data[RADIO_TASK_KEY] = current_task
        hass.data[RADIO_COUNT_KEY] = 1
        yield True
    finally:
        hass.data.pop(RADIO_TASK_KEY, None)
        hass.data.pop(RADIO_COUNT_KEY, None)
        lock.release()
