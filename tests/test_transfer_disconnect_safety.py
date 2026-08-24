"""A cancelled transfer must still disconnect from the display, and a fresh
connection to the same display must not crowd the one that just ended.

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

Separately, a cheap embedded BLE stack can still be tearing down the previous
session when the next connection attempt lands right on top of it - a burst of
manual sends (testing a template, for example) can trigger this even with a
clean disconnect on our side. A short forced gap between one session's
disconnect and the next connect to the *same* address gives the peripheral time
to actually be ready.

These tests pin DratekTransfer._connected_client, which provides both.
"""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest


# Keep this focused unit test independent from Home Assistant's optional BLE
# runtime. The production integration declares bleak through HA; the fake is
# replaced by each test before a connection is opened.
if "bleak" not in sys.modules:
    bleak = types.ModuleType("bleak")
    bleak.BleakClient = object
    sys.modules["bleak"] = bleak


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
        # The reconnect cooldown is keyed by address in a module-level dict that
        # outlives any one test, so tests give it a fresh address each time
        # rather than relying on cross-test isolation here.
        self._address_counter = getattr(ConnectedClientTests, "_next_address", 0)
        ConnectedClientTests._next_address = self._address_counter + 1

    def tearDown(self) -> None:
        transfer.BleakClient = self._original_client_cls

    def _fresh_address(self) -> str:
        return f"AA:BB:CC:DD:EE:{self._address_counter:02X}"

    def test_disconnect_history_is_bounded(self) -> None:
        transfer._LAST_DISCONNECT_AT.clear()
        factory, _captured = _install_fake_client()
        transfer.BleakClient = factory

        async def run() -> None:
            for index in range(transfer.DISCONNECT_HISTORY_LIMIT + 2):
                address = f"AA:BB:{index // 65536:02X}:{index // 256 % 256:02X}:{index % 256:02X}:01"
                async with transfer.DratekTransfer()._connected_client(address, address):
                    pass

        asyncio.run(run())
        self.assertEqual(len(transfer._LAST_DISCONNECT_AT), transfer.DISCONNECT_HISTORY_LIMIT)

    def test_normal_exit_connects_then_disconnects(self) -> None:
        factory, captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()
        address = self._fresh_address()

        async def run() -> None:
            async with dratek_transfer._connected_client(address, address):
                pass

        asyncio.run(run())
        self.assertEqual(captured["client"].events, ["connect", "disconnect"])

    def test_cancellation_mid_transfer_still_disconnects(self) -> None:
        factory, captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()
        address = self._fresh_address()

        async def run() -> None:
            async def stuck_transfer() -> None:
                async with dratek_transfer._connected_client(address, address):
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
        address = self._fresh_address()

        async def run() -> None:
            async def stuck_transfer() -> None:
                async with dratek_transfer._connected_client(address, address):
                    await asyncio.sleep(3600)

            task = asyncio.ensure_future(stuck_transfer())
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        asyncio.run(run())
        self.assertEqual(captured["client"].events, ["connect", "disconnect"])


class ReconnectCooldownTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_client_cls = transfer.BleakClient
        self._original_last_disconnect = dict(transfer._LAST_DISCONNECT_AT)
        transfer._LAST_DISCONNECT_AT.clear()

    def tearDown(self) -> None:
        transfer.BleakClient = self._original_client_cls
        transfer._LAST_DISCONNECT_AT.clear()
        transfer._LAST_DISCONNECT_AT.update(self._original_last_disconnect)

    def test_reconnecting_the_same_address_waits_out_the_cooldown(self) -> None:
        factory, _captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()
        address = "AA:BB:CC:DD:EE:01"

        async def run() -> float:
            async with dratek_transfer._connected_client(address, address):
                pass
            loop = asyncio.get_running_loop()
            start = loop.time()
            async with dratek_transfer._connected_client(address, address):
                pass
            return loop.time() - start

        elapsed = asyncio.run(run())
        self.assertGreaterEqual(elapsed, transfer.MIN_RECONNECT_INTERVAL_SECONDS * 0.9)

    def test_a_different_address_is_never_delayed(self) -> None:
        factory, _captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()

        async def run() -> float:
            async with dratek_transfer._connected_client("AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:01"):
                pass
            loop = asyncio.get_running_loop()
            start = loop.time()
            async with dratek_transfer._connected_client("AA:BB:CC:DD:EE:02", "AA:BB:CC:DD:EE:02"):
                pass
            return loop.time() - start

        elapsed = asyncio.run(run())
        self.assertLess(elapsed, transfer.MIN_RECONNECT_INTERVAL_SECONDS * 0.5)

    def test_a_second_reconnect_after_the_cooldown_is_not_delayed_again(self) -> None:
        factory, _captured = _install_fake_client()
        transfer.BleakClient = factory
        dratek_transfer = transfer.DratekTransfer()
        address = "AA:BB:CC:DD:EE:03"

        async def run() -> float:
            async with dratek_transfer._connected_client(address, address):
                pass
            await asyncio.sleep(transfer.MIN_RECONNECT_INTERVAL_SECONDS)
            loop = asyncio.get_running_loop()
            start = loop.time()
            async with dratek_transfer._connected_client(address, address):
                pass
            return loop.time() - start

        elapsed = asyncio.run(run())
        self.assertLess(elapsed, transfer.MIN_RECONNECT_INTERVAL_SECONDS * 0.5)


class ConnectionSiteWiringTests(unittest.TestCase):
    def test_every_ble_operation_uses_the_shielded_connection(self) -> None:
        source = (COMPONENT / "transfer.py").read_text(encoding="utf-8")
        # A direct `async with BleakClient(...)` bypasses the shielded disconnect
        # and reintroduces the leaked-connection-slot bug for that operation.
        self.assertEqual(source.count("async with BleakClient("), 0)
        # Counted as a ratio rather than a fixed number: the RGB LED and find-me
        # paths used to open the client through two near-identical copies of the
        # same method and now share _control_command_once, so pinning "3 sites"
        # was pinning the duplication rather than the safety property. What has
        # to hold is that every client this module opens is opened as a shielded
        # context manager, and that the image transfer is not the only one.
        opened = source.count("self._connected_client(connection_target, address)")
        shielded = source.count("async with self._connected_client(connection_target, address)")
        self.assertEqual(opened, shielded)
        self.assertGreaterEqual(opened, 2)

    def test_local_transfer_does_not_use_retry_connector_write_acquisition(self) -> None:
        source = (COMPONENT / "transfer.py").read_text(encoding="utf-8")
        self.assertNotIn("from bleak_retry_connector import establish_connection", source)
        self.assertNotIn("await establish_connection(", source)
        self.assertIn("client = BleakClient(connection_target, timeout=20.0)", source)


if __name__ == "__main__":
    unittest.main()
