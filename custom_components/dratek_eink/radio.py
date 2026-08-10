"""One radio slot shared by every Bluetooth path this integration drives.

Home Assistant's own adapter and every ESP32 gateway transmit into the same
2.4 GHz band, usually within a few metres of each other and of the displays.
Nothing in the transport layer knew that: TransferQueue serialises per display
(``_device_locks``) and per transport (``_locks``, keyed by ``"local"`` or a
gateway id), so a local transfer to one display and gateway transfers to two
others all ran at once by design.

That design is right about the software - those paths really are independent -
and wrong about the physics. A gateway that is scanning or streaming is
transmitting into the same air the local adapter needs for its own connection
events, and a BLE connection that loses connection events does not fail, it
just gets slower. Enough overlap turns a ten-second transfer into a
multi-minute one without a single error being logged anywhere.

This module is the one place that says "the radio is busy". It deliberately
costs throughput: two displays on two different gateways now wait for each
other. That is the trade being made, and it is the only way to keep one path
from silently degrading another.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

RADIO_LOCK_KEY = "dratek_eink_radio_lock"


def get_radio_lock(hass: HomeAssistant) -> asyncio.Lock:
    """Return the process-wide radio lock, creating it on first use."""
    lock = hass.data.get(RADIO_LOCK_KEY)
    if lock is None:
        lock = asyncio.Lock()
        hass.data[RADIO_LOCK_KEY] = lock
    return lock


@asynccontextmanager
async def async_radio_slot(hass: HomeAssistant) -> AsyncIterator[None]:
    """Hold the radio for one physical Bluetooth operation.

    Acquire this *inside* any per-display or per-transport lock, never around
    one. Every caller taking the locks in the same order is what keeps the
    combination deadlock-free.
    """
    async with get_radio_lock(hass):
        yield


@asynccontextmanager
async def async_try_radio_slot(
    hass: HomeAssistant, timeout: float
) -> AsyncIterator[bool]:
    """Hold the radio if it becomes free within ``timeout``, else yield False.

    For work that is worth skipping rather than queueing behind a transfer.
    A discovery scan is the case this exists for: waiting out an in-flight
    transfer could block the panel for minutes, and a scan that reports only
    what Home Assistant already knows is far better than one that hangs.
    """
    lock = get_radio_lock(hass)
    try:
        async with asyncio.timeout(timeout):
            await lock.acquire()
    except TimeoutError:
        yield False
        return
    try:
        yield True
    finally:
        lock.release()
