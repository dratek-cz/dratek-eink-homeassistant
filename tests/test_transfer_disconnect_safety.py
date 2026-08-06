"""A cancelled transfer must still disconnect from the display.

A manual upload replaces a running automatic refresh's automation config
(EntityAutoUpdateManager.async_set_config) or preempts it directly
(TransferQueue._preempt_automatic_update), and Home Assistant itself cancels
outstanding tasks on integration reload and shutdown. Any of these can land
while DratekTransfer is deep inside a block write, awaiting a GATT response.

`async with BleakClient(...)` calls disconnect() from its own __aexit__, but
that disconnect is itself just another await point: a cancellation already
pending on the task aborts it before the adapter ever receives the disconnect
request, leaving the BLE connection - and the adapter's limited connection slot
- half-open. Enough of those over a day of manual uploads landing mid-refresh is
what turns a 5-second transfer into one that needs the 10-minute safety timeout:
every slot is stuck waiting on a peer that was never told to let go.

These tests pin DratekTransfer._connected_client, which shields the disconnect
from that outer cancellation.
"""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _load_component_module(name: str):
    package_name = "dratek_transfer_test_component"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__path__ = [str(COMPONENT)]
        sys.modules[package_name] = package
    module_name = f"{package_name}.{name}"
    spec = importlib.util.spec_from_file_location(module_name, COMPONENT / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


transfer = _load_component_module("transfer")


class FakeBleakClient:
    """Records connect/disconnect calls without touching real Bluetooth."""

    def __init__(self, target, timeout: float = 20.0, *, disconnect_delay: float = 0.0) -> None:
        self.target = target
        self.is_connected = False
        self.events: list[str] = []
        self._disconnect_delay = disconnect_delay

    async def connect(self) -> None:
        self.events.append("connect")
        self.is_connected = True

    async def disconnect(self) -> None:
        if self._disconnect_delay:
            await asyncio.sleep(self._disconnect_delay)
        self.events.append("disconnect")
        self.is_connected = False


def _install_fake_client(disconnect_delay: float = 0.0):
    captured: dict[str, FakeBleakClient] = {}

    def factory(target, timeout: float = 20.0):
        client = FakeBleakClient(target, timeout, disconnect_delay=disconnect_delay)
        captured["client"] = client
        return client

    return factory, captured


class ConnectedClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_client_cls = transfer.BleakClient

    def tearDown(self) -> None:
        transfer.BleakClient = self._original_client_cls

    def test_normal_exit_connects_then_disconnects(self) -> None:
        factory, captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()

        async def run() -> None:
            async with dratek_transfer._connected_client("AA:BB:CC:DD:EE:FF"):
                pass

        asyncio.run(run())
        self.assertEqual(captured["client"].events, ["connect", "disconnect"])

    def test_cancellation_mid_transfer_still_disconnects(self) -> None:
        factory, captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()

        async def run() -> None:
            async def stuck_transfer() -> None:
                async with dratek_transfer._connected_client("AA:BB:CC:DD:EE:FF"):
                    # Stands in for an in-flight GATT write awaiting a response
                    # that will never arrive because the peer was preempted.
                    await asyncio.sleep(3600)

            task = asyncio.ensure_future(stuck_transfer())
            # Let the task actually reach the simulated GATT-write await point.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            self.assertEqual(captured["client"].events, ["connect"])

            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        asyncio.run(run())
        self.assertEqual(captured["client"].events, ["connect", "disconnect"])

    def test_shield_lets_a_slow_disconnect_finish(self) -> None:
        # A disconnect that itself takes a moment (a real GATT/D-Bus round trip)
        # must still be allowed to run to completion, not just be attempted.
        factory, captured = _install_fake_client(disconnect_delay=0.05)
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()

        async def run() -> None:
            async def stuck_transfer() -> None:
                async with dratek_transfer._connected_client("AA:BB:CC:DD:EE:FF"):
                    await asyncio.sleep(3600)

            task = asyncio.ensure_future(stuck_transfer())
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        asyncio.run(run())
        self.assertEqual(captured["client"].events, ["connect", "disconnect"])


class ConnectionSiteWiringTests(unittest.TestCase):
    def test_every_ble_operation_uses_the_shielded_connection(self) -> None:
        source = (COMPONENT / "transfer.py").read_text(encoding="utf-8")
        # A direct `async with BleakClient(...)` bypasses the shielded disconnect
        # and reintroduces the leaked-connection-slot bug for that operation.
        self.assertEqual(source.count("async with BleakClient("), 0)
        self.assertEqual(source.count("async with self._connected_client("), 3)


if __name__ == "__main__":
    unittest.main()
