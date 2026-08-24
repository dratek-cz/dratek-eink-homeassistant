"""Every Bluetooth path this integration drives shares one 2.4 GHz band.

TransferQueue serialises per display and per transport, so a local transfer to
one display and gateway transfers to two others were free to run at once - the
software paths really are independent. The radio is not. A gateway that is
scanning or streaming transmits into the same air the local adapter needs for
its own connection events, and a BLE connection that loses connection events
does not fail, it just gets slower. Enough overlap turns a ten-second transfer
into a multi-minute one with no error logged anywhere.

Three things keep that from happening, and all three are pinned here:

* radio.py hands out one exclusive slot, taken inside the per-transport lock.
* Discovery scans gateways one at a time instead of making every ESP32 start an
  active scan simultaneously, and gives up rather than queueing behind a
  transfer that can legitimately run for minutes.
* The gateway firmware connects straight to a known address instead of paying a
  six-second active scan before every transfer, including the ones that were
  going to succeed anyway.
"""

from __future__ import annotations

import ast
import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
FIRMWARE_SOURCE = (
    ROOT / "firmware" / "dratek-eink-gateway" / "src" / "main.cpp"
).read_text(encoding="utf-8")
QUEUE_SOURCE = (COMPONENT / "queue.py").read_text(encoding="utf-8")
WS_DEVICES_SOURCE = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")


def _load_component_module(name: str):
    package_name = "dratek_radio_test_component"
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


radio = _load_component_module("radio")


def _fake_hass() -> types.SimpleNamespace:
    return types.SimpleNamespace(data={})


def _function_named(source: str, name: str) -> ast.AST:
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"{name} is not defined in the given source")


def _called_names(node: ast.AST) -> set[str]:
    names = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            func = child.func
            if isinstance(func, ast.Name):
                names.add(func.id)
            elif isinstance(func, ast.Attribute):
                names.add(func.attr)
    return names


class RadioSlotTests(unittest.IsolatedAsyncioTestCase):
    async def test_slot_never_lets_two_operations_transmit_at_once(self) -> None:
        hass = _fake_hass()
        active = 0
        peak = 0

        async def operation() -> None:
            nonlocal active, peak
            async with radio.async_radio_slot(hass):
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(0.01)
                active -= 1

        await asyncio.gather(*(operation() for _ in range(4)))

        self.assertEqual(peak, 1, "gateway and local transfers overlapped on the radio")
        self.assertFalse(radio.get_radio_lock(hass).locked())

    async def test_slot_is_released_when_the_operation_raises(self) -> None:
        hass = _fake_hass()
        with self.assertRaises(RuntimeError):
            async with radio.async_radio_slot(hass):
                raise RuntimeError("BLE write failed")
        self.assertFalse(
            radio.get_radio_lock(hass).locked(),
            "a failed transfer left the radio permanently marked busy",
        )

    async def test_try_slot_gives_up_instead_of_queueing_behind_a_transfer(self) -> None:
        hass = _fake_hass()
        lock = radio.get_radio_lock(hass)
        await lock.acquire()
        try:
            loop = asyncio.get_running_loop()
            started = loop.time()
            async with radio.async_try_radio_slot(hass, 0.05) as granted:
                self.assertFalse(granted)
            # The panel must not sit on a held radio for the length of a
            # transfer, which can legitimately be minutes.
            self.assertLess(loop.time() - started, 1.0)
        finally:
            lock.release()

    async def test_try_slot_that_timed_out_does_not_corrupt_the_lock(self) -> None:
        """A slot it never acquired must not be released on the way out."""
        hass = _fake_hass()
        lock = radio.get_radio_lock(hass)
        await lock.acquire()
        try:
            async with radio.async_try_radio_slot(hass, 0.01) as granted:
                self.assertFalse(granted)
        finally:
            lock.release()

        async with radio.async_try_radio_slot(hass, 0.5) as granted:
            self.assertTrue(granted)
            self.assertTrue(lock.locked())
        self.assertFalse(lock.locked())

    async def test_lock_is_shared_across_callers_for_one_hass(self) -> None:
        hass = _fake_hass()
        self.assertIs(radio.get_radio_lock(hass), radio.get_radio_lock(hass))
        self.assertIsNot(radio.get_radio_lock(hass), radio.get_radio_lock(_fake_hass()))


class TransferQueueWiringTests(unittest.TestCase):
    def test_transfer_takes_the_radio_inside_the_transport_lock(self) -> None:
        """Lock order has to be identical everywhere or the three can deadlock."""
        run_attempt = _function_named(QUEUE_SOURCE, "run_attempt")
        transport_holds = [
            node
            for node in ast.walk(run_attempt)
            if isinstance(node, ast.AsyncWith)
            and any(
                isinstance(item.context_expr, ast.Name)
                and item.context_expr.id == "resource_lock"
                for item in node.items
            )
        ]
        self.assertEqual(len(transport_holds), 1)
        self.assertIn(
            "async_radio_slot",
            _called_names(transport_holds[0]),
            "the radio slot must be acquired inside the transport lock, not around it",
        )

    def test_the_actual_transfer_runs_while_the_radio_is_held(self) -> None:
        run_attempt = _function_named(QUEUE_SOURCE, "run_attempt")
        radio_holds = [
            node
            for node in ast.walk(run_attempt)
            if isinstance(node, ast.AsyncWith)
            and any(
                "async_radio_slot" in _called_names(item.context_expr)
                for item in node.items
            )
        ]
        self.assertEqual(len(radio_holds), 1)
        self.assertIn(
            "runner",
            _called_names(radio_holds[0]),
            "the transfer itself must run inside the radio slot",
        )


class DiscoveryScanTests(unittest.TestCase):
    def test_gateways_are_not_scanned_concurrently(self) -> None:
        scan = _function_named(WS_DEVICES_SOURCE, "websocket_scan")
        for node in ast.walk(scan):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
            if name != "gather":
                continue
            self.assertNotIn(
                "async_scan_gateway",
                _called_names(node),
                "fanning scans out concurrently makes every ESP32 transmit at once",
            )

    def test_the_gateway_scan_does_not_wait_on_the_local_adapter(self) -> None:
        """A gateway scan uses the ESP32's own radio, never Home Assistant's.

        This used to run under async_try_radio_slot and skip every gateway when
        the slot stayed busy, so any local transfer - minutes for an 800x480
        image - erased the whole gateway topology from the connection map. The
        scheduler's own _async_load_gateways_and_scan never gated on the radio,
        so the map and the write disagreed about which route existed.
        """
        scan = _function_named(WS_DEVICES_SOURCE, "websocket_scan")
        called = _called_names(scan)
        self.assertIn("async_scan_gateway", called)
        self.assertNotIn(
            "async_try_radio_slot",
            called,
            "an ESP32 gateway owns its own BLE adapter (see radio.py); making "
            "its scan wait on the local one only hides gateways from the map",
        )


class GatewayFirmwareScanTests(unittest.TestCase):
    def _connect_to_display_body(self) -> str:
        start = FIRMWARE_SOURCE.index("bool connectToDisplay(")
        end = FIRMWARE_SOURCE.index("\nbool ", start + 1)
        return FIRMWARE_SOURCE[start:end]

    def test_a_healthy_transfer_costs_no_scan_airtime(self) -> None:
        body = self._connect_to_display_body()
        direct_connect = body.index("client->connect(NimBLEAddress(")
        scan_start = body.index("scan->start(")
        self.assertLess(
            direct_connect,
            scan_start,
            "the six-second active scan must be the fallback, not the happy path",
        )

    def test_the_direct_probe_does_not_burn_the_full_connect_timeout(self) -> None:
        """Otherwise a powered-off display costs more than the old ordering did."""
        body = self._connect_to_display_body()
        self.assertIn("setConnectTimeout(DIRECT_CONNECT_TIMEOUT_SECONDS)", body)
        self.assertIn("setConnectTimeout(SCANNED_CONNECT_TIMEOUT_SECONDS)", body)
        self.assertLess(
            body.index("setConnectTimeout(DIRECT_CONNECT_TIMEOUT_SECONDS)"),
            body.index("client->connect(NimBLEAddress("),
        )

    def test_every_scan_runs_at_a_quarter_duty_cycle(self) -> None:
        self.assertNotIn("scan->setWindow(60)", FIRMWARE_SOURCE)
        self.assertNotIn("scan->setInterval(80)", FIRMWARE_SOURCE)
        self.assertEqual(FIRMWARE_SOURCE.count("scan->setInterval(160)"), 2)
        self.assertEqual(FIRMWARE_SOURCE.count("scan->setWindow(40)"), 2)


if __name__ == "__main__":
    unittest.main()
