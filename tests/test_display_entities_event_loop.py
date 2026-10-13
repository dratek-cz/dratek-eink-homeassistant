"""Behavioural regression tests for display entities and the event loop.

The display platforms subscribe ``_add_or_refresh`` to a dispatcher signal.
Home Assistant runs a dispatcher target that is not a ``@callback`` in the
executor, and entity/platform APIs (``async_write_ha_state``,
``async_add_entities``, ``hass.async_create_task``) raise ``RuntimeError`` when
called from there. Home Assistant is not installable in the test environment,
so these tests load the real platform modules against small stand-ins that
reproduce exactly that contract: callbacks run on the loop, everything else
runs on a worker thread, and loop-only APIs reject worker threads.
"""

from __future__ import annotations

import asyncio
import gc
import importlib
from pathlib import Path
import sys
import threading
import types
import unittest
import warnings


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_event_loop_test"
ENTRY_ID = "entry-1"
GATEWAY_STABLE_ID = "GW-AAA"

_UNSET = object()


class _Enum(type):
    def __getattr__(cls, name: str) -> str:
        return f"{cls.__name__}.{name}"


def _enum(name: str) -> type:
    return _Enum(name, (), {})


class _State:
    world: "_World"


_state = _State()


def _require_loop(api: str) -> None:
    if threading.get_ident() != _state.world.loop_thread:
        raise RuntimeError(
            f"Detected that custom integration 'dratek_eink' calls {api} "
            "from a thread other than the event loop"
        )


class _Entity:
    hass = None
    writes = 0
    refreshes = 0

    def async_write_ha_state(self) -> None:
        _require_loop("async_write_ha_state")
        self.writes += 1

    async def async_update_ha_state(self, force_refresh: bool = False) -> None:
        _require_loop("async_update_ha_state")
        if force_refresh:
            self.refreshes += 1
            await self.async_update()
        self.async_write_ha_state()

    async def async_update(self) -> None:
        return None


class _Camera(_Entity):
    def __init__(self) -> None:
        pass


class _Device:
    def __init__(self, device_id: str, entry_id: str) -> None:
        self.id = device_id
        self.config_entry_id = entry_id
        self.via_device_id = None


class _DeviceRegistry:
    """Device registry keyed per config entry, like Home Assistant 2026.8+."""

    def __init__(self) -> None:
        self.devices: dict[tuple[str, tuple[str, str]], _Device] = {}
        self._counter = 0

    def async_get_or_create(
        self,
        *,
        config_entry_id,
        identifiers,
        name=None,
        manufacturer=None,
        model=None,
        hw_version=None,
        sw_version=None,
        serial_number=None,
        configuration_url=None,
        via_device_id=_UNSET,
    ) -> _Device:
        # No ``via_device`` parameter on purpose: passing the deprecated
        # argument is a TypeError here, as it will be in Home Assistant 2027.8.
        key = (config_entry_id, sorted(identifiers)[0])
        device = self.devices.get(key)
        if device is None:
            self._counter += 1
            device = _Device(f"dev-{self._counter}", config_entry_id)
            self.devices[key] = device
        if via_device_id is not _UNSET:
            device.via_device_id = via_device_id
        return device

    def find(self, identifier, config_entry_id):
        return self.devices.get((config_entry_id, identifier))


class _World:
    def __init__(self) -> None:
        self.loop_thread = threading.get_ident()
        self.listeners: dict[str, list] = {}
        self.executor_errors: list[BaseException] = []
        self.registry = _DeviceRegistry()


class FakeHass:
    def __init__(self) -> None:
        self.data: dict = {}
        self.tasks: list[asyncio.Task] = []

    def async_create_task(self, coro, name=None, eager_start=None):
        _require_loop("hass.async_create_task")
        task = asyncio.get_running_loop().create_task(coro)
        self.tasks.append(task)
        return task


class FakeEntry:
    def __init__(self) -> None:
        self.entry_id = ENTRY_ID
        self._unloaders: list = []

    def async_on_unload(self, func) -> None:
        self._unloaders.append(func)

    def unload(self) -> None:
        while self._unloaders:
            self._unloaders.pop()()


def _callback(func):
    func._hass_callback = True
    return func


def _dispatcher_connect(hass, signal, target):
    _state.world.listeners.setdefault(signal, []).append(target)

    def unsubscribe() -> None:
        _state.world.listeners[signal].remove(target)

    return unsubscribe


def _dispatcher_send(hass, signal, *args) -> None:
    _require_loop("async_dispatcher_send")
    world = _state.world
    for target in list(world.listeners.get(signal, [])):
        if getattr(target, "_hass_callback", False):
            target(*args)
            continue

        def run(target=target) -> None:
            try:
                target(*args)
            except BaseException as err:  # Home Assistant logs these
                world.executor_errors.append(err)

        worker = threading.Thread(target=run)
        worker.start()
        worker.join()


def _device_id_by_identifier(hass, identifier, *, config_entry_id):
    device = _state.world.registry.find(identifier, config_entry_id)
    if device is None:
        raise ValueError(f"no device {identifier!r}")
    return device.id


def _module(name: str, **attrs) -> types.ModuleType:
    module = types.ModuleType(name)
    module.__dict__.update(attrs)
    return module


_STUBBED: dict[str, types.ModuleType | None] = {}
_MODULES: dict[str, types.ModuleType] = {}


def _install(modules: dict[str, types.ModuleType]) -> None:
    for name, module in modules.items():
        _STUBBED.setdefault(name, sys.modules.get(name))
        sys.modules[name] = module


def setUpModule() -> None:
    async def add_noop(*_a, **_k):
        return None

    def _group(title: str):
        return types.SimpleNamespace(title=title)

    ha = {
        "homeassistant": _module("homeassistant"),
        "homeassistant.components": _module("homeassistant.components"),
        "homeassistant.components.sensor": _module(
            "homeassistant.components.sensor",
            SensorEntity=type("SensorEntity", (_Entity,), {}),
            SensorDeviceClass=_enum("SensorDeviceClass"),
            SensorStateClass=_enum("SensorStateClass"),
        ),
        "homeassistant.components.binary_sensor": _module(
            "homeassistant.components.binary_sensor",
            BinarySensorEntity=type("BinarySensorEntity", (_Entity,), {}),
            BinarySensorDeviceClass=_enum("BinarySensorDeviceClass"),
        ),
        "homeassistant.components.camera": _module(
            "homeassistant.components.camera", Camera=_Camera
        ),
        "homeassistant.config_entries": _module(
            "homeassistant.config_entries", ConfigEntry=object
        ),
        "homeassistant.core": _module(
            "homeassistant.core", HomeAssistant=object, callback=_callback
        ),
        "homeassistant.const": _module(
            "homeassistant.const",
            PERCENTAGE="%",
            SIGNAL_STRENGTH_DECIBELS_MILLIWATT="dBm",
            UnitOfElectricPotential=_enum("UnitOfElectricPotential"),
        ),
        "homeassistant.helpers": _module("homeassistant.helpers"),
        "homeassistant.helpers.entity": _module(
            "homeassistant.helpers.entity", EntityCategory=_enum("EntityCategory")
        ),
        "homeassistant.helpers.entity_platform": _module(
            "homeassistant.helpers.entity_platform",
            AddConfigEntryEntitiesCallback=object,
            AddEntitiesCallback=object,
        ),
        "homeassistant.helpers.dispatcher": _module(
            "homeassistant.helpers.dispatcher",
            async_dispatcher_connect=_dispatcher_connect,
            async_dispatcher_send=_dispatcher_send,
        ),
        "homeassistant.helpers.device_registry": _module(
            "homeassistant.helpers.device_registry",
            DeviceEntryType=_enum("DeviceEntryType"),
            async_get=lambda hass: _state.world.registry,
            async_get_device_id_by_identifier=_device_id_by_identifier,
        ),
    }
    ha["homeassistant.helpers"].device_registry = ha[
        "homeassistant.helpers.device_registry"
    ]
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    siblings = {
        PACKAGE: package,
        f"{PACKAGE}.meteoradar": _module(
            f"{PACKAGE}.meteoradar", async_render_meteoradar=add_noop
        ),
        f"{PACKAGE}.display_preview": _module(
            f"{PACKAGE}.display_preview", async_display_preview=add_noop
        ),
        f"{PACKAGE}.service_groups": _module(
            f"{PACKAGE}.service_groups",
            INTERNAL_SERVICE_GROUP_BY_TYPE={
                key: _group(key)
                for key in ("ui", "scheduler", "transfer", "meteoradar")
            },
            internal_service_subentry_id=lambda entry, block: f"sub-{block}",
        ),
    }
    _install(ha)
    _install(siblings)
    for name in ("device_registry", "sensor", "binary_sensor", "camera"):
        _MODULES[name] = importlib.import_module(f"{PACKAGE}.{name}")


def tearDownModule() -> None:
    for name in [n for n in sys.modules if n.startswith(f"{PACKAGE}.")]:
        del sys.modules[name]
    for name, original in _STUBBED.items():
        if original is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = original
    _STUBBED.clear()
    _MODULES.clear()


def _display(address: str, **extra) -> dict:
    display = {
        "address": address,
        "name": f"Display {address}",
        "physical_code": f"P-{address}",
        "sdk_type": 0,
        "battery_percent": 80,
        "battery_voltage": 3.01,
        "rssi": -60,
        "last_seen_at": 1_700_000_000,
    }
    display.update(extra)
    return display


class EventLoopTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.world = _state.world = _World()
        self.hass = FakeHass()
        self.entry = FakeEntry()
        self.registry_mod = _MODULES["device_registry"]
        self.added: dict[str, list] = {"sensor": [], "binary_sensor": [], "camera": []}

    def _adder(self, platform: str):
        def add(entities, config_subentry_id=None):
            _require_loop("async_add_entities")
            for entity in entities:
                entity.hass = self.hass
                self.added[platform].append(entity)

        return add

    async def setup_platforms(self) -> None:
        for platform in ("sensor", "binary_sensor", "camera"):
            await _MODULES[platform].async_setup_entry(
                self.hass, self.entry, self._adder(platform)
            )

    def displays(self, platform: str) -> list:
        return [
            entity
            for entity in self.added[platform]
            if str(getattr(entity, "_attr_unique_id", "")).startswith("display_")
        ]

    def discover(self, address: str, **extra) -> None:
        self.registry_mod.register_display_device(
            self.hass, ENTRY_ID, _display(address, **extra), []
        )

    async def settle(self) -> None:
        if self.hass.tasks:
            await asyncio.gather(*self.hass.tasks)
            self.hass.tasks.clear()

    def assert_loop_safe(self) -> None:
        self.assertEqual(
            self.world.executor_errors,
            [],
            "dispatcher targets must run on the event loop",
        )


class DisplayDiscoveryTests(EventLoopTestCase):
    async def test_display_known_at_startup_gets_all_entities(self) -> None:
        self.registry_mod.display_states(self.hass)["AA:BB"] = _display("AA:BB")
        await self.setup_platforms()

        self.assertEqual(
            sorted(e._attr_unique_id for e in self.displays("sensor")),
            [
                "display_AA:BB_battery",
                "display_AA:BB_battery_voltage",
                "display_AA:BB_last_seen",
                "display_AA:BB_route",
                "display_AA:BB_signal",
            ],
        )
        self.assertEqual(
            [e._attr_unique_id for e in self.displays("binary_sensor")],
            ["display_AA:BB_connectivity"],
        )
        self.assertEqual(
            [e._attr_unique_id for e in self.displays("camera")],
            ["display_AA:BB_preview"],
        )
        self.assert_loop_safe()

    async def test_display_discovered_after_startup_needs_no_reload(self) -> None:
        await self.setup_platforms()
        self.assertEqual(self.displays("sensor"), [])

        self.discover("aa:bb")

        self.assert_loop_safe()
        self.assertEqual(len(self.displays("sensor")), 5)
        self.assertEqual(len(self.displays("binary_sensor")), 1)
        self.assertEqual(len(self.displays("camera")), 1)
        self.assertEqual(self.displays("sensor")[0].address, "AA:BB")

    async def test_rediscovery_does_not_duplicate_entities_or_devices(self) -> None:
        await self.setup_platforms()
        for _ in range(3):
            self.discover("AA:BB")
        await self.settle()

        self.assert_loop_safe()
        self.assertEqual(len(self.displays("sensor")), 5)
        self.assertEqual(len(self.displays("binary_sensor")), 1)
        self.assertEqual(len(self.displays("camera")), 1)
        self.assertEqual(len(self.world.registry.devices), 1)


class DisplayUpdateTests(EventLoopTestCase):
    async def test_telemetry_updates_write_state_for_every_sensor(self) -> None:
        await self.setup_platforms()
        self.discover("AA:BB")
        sensors = {e.key: e for e in self.displays("sensor")}
        connectivity = self.displays("binary_sensor")[0]
        before = {key: sensor.writes for key, sensor in sensors.items()}
        before_connectivity = connectivity.writes

        self.discover(
            "AA:BB",
            battery_percent=55,
            battery_voltage=2.74,
            rssi=-71,
            last_seen_at=1_700_000_500,
        )

        self.assert_loop_safe()
        for key, sensor in sensors.items():
            self.assertEqual(sensor.writes, before[key] + 1, key)
        self.assertEqual(connectivity.writes, before_connectivity + 1)
        self.assertEqual(sensors["battery"].native_value, 55)
        self.assertEqual(sensors["battery_voltage"].native_value, 2.74)
        self.assertEqual(sensors["signal"].native_value, -71)
        self.assertEqual(
            int(sensors["last_seen"].native_value.timestamp()), 1_700_000_500
        )

    async def test_preview_camera_refreshes_after_a_transfer(self) -> None:
        await self.setup_platforms()
        self.discover("AA:BB")
        camera = self.displays("camera")[0]
        self.assertEqual(camera.refreshes, 0)

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self.discover("AA:BB")
            await self.settle()
            gc.collect()

        self.assert_loop_safe()
        self.assertEqual(camera.refreshes, 1)
        self.assertEqual(
            [w for w in caught if "never awaited" in str(w.message)], []
        )

    async def test_rapid_events_are_handled_without_errors_or_warnings(self) -> None:
        await self.setup_platforms()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            for index in range(25):
                self.discover("AA:BB", rssi=-50 - index)
                self.discover(f"CC:{index:02d}")
            await self.settle()
            gc.collect()

        self.assert_loop_safe()
        self.assertEqual(len(self.displays("camera")), 26)
        self.assertEqual(len(self.displays("sensor")), 26 * 5)
        self.assertEqual(self.displays("camera")[0].refreshes, 24)
        self.assertEqual(
            [w for w in caught if "never awaited" in str(w.message)], []
        )


class ReloadTests(EventLoopTestCase):
    def listener_count(self) -> int:
        signal = self.registry_mod.display_update_signal(ENTRY_ID)
        return len(self.world.listeners.get(signal, []))

    async def test_unload_removes_listeners_and_reload_does_not_stack_them(self) -> None:
        await self.setup_platforms()
        self.assertEqual(self.listener_count(), 3)

        self.entry.unload()
        self.assertEqual(self.listener_count(), 0)

        self.added = {"sensor": [], "binary_sensor": [], "camera": []}
        await self.setup_platforms()
        self.assertEqual(self.listener_count(), 3)

        self.discover("AA:BB")
        self.assert_loop_safe()
        self.assertEqual(len(self.displays("sensor")), 5)
        self.assertEqual(len(self.displays("binary_sensor")), 1)
        self.assertEqual(len(self.displays("camera")), 1)


class GatewayRelationTests(EventLoopTestCase):
    def register_gateway(self, stable_id: str = GATEWAY_STABLE_ID):
        return self.world.registry.async_get_or_create(
            config_entry_id=ENTRY_ID, identifiers={("dratek_eink", f"gateway:{stable_id}")}
        )

    def register_display(self, address: str, gateway_ref: str | None = "g1", **extra):
        display = _display(address, **extra)
        if gateway_ref is not None:
            display["preferred_path"] = {"type": "gateway", "id": gateway_ref}
        gateways = [{"id": "g1", "gateway_id": GATEWAY_STABLE_ID}]
        self.registry_mod.register_display_device(
            self.hass, ENTRY_ID, display, gateways
        )
        return self.world.registry.find(("dratek_eink", f"display:{address}"), ENTRY_ID)

    async def test_display_is_linked_to_the_resolved_gateway_id(self) -> None:
        gateway = self.register_gateway()
        display = self.register_display("AA:BB")

        self.assertEqual(display.via_device_id, gateway.id)

    async def test_registering_again_never_duplicates_devices(self) -> None:
        self.register_gateway()
        self.register_display("AA:BB")
        self.register_display("AA:BB")
        self.register_display("CC:DD")

        self.assertEqual(len(self.world.registry.devices), 3)

    async def test_missing_gateway_creates_the_display_without_a_parent(self) -> None:
        display = self.register_display("AA:BB")

        self.assertIsNotNone(display)
        self.assertIsNone(display.via_device_id)
        self.assertEqual(len(self.world.registry.devices), 1)

    async def test_display_is_linked_once_its_gateway_appears(self) -> None:
        display = self.register_display("AA:BB")
        self.assertIsNone(display.via_device_id)

        gateway = self.register_gateway()
        display = self.register_display("AA:BB")

        self.assertEqual(display.via_device_id, gateway.id)
        self.assertEqual(len(self.world.registry.devices), 2)

    async def test_non_gateway_route_and_unknown_gateway_ref_have_no_parent(self) -> None:
        self.register_gateway()

        self.assertIsNone(self.register_display("AA:BB", gateway_ref=None).via_device_id)
        self.assertIsNone(self.register_display("CC:DD", gateway_ref="nope").via_device_id)

    async def test_unexpected_registry_errors_are_not_swallowed(self) -> None:
        self.register_gateway()
        registry_stub = sys.modules["homeassistant.helpers.device_registry"]
        original = registry_stub.async_get_device_id_by_identifier

        def broken(*_args, **_kwargs):
            raise RuntimeError("registry exploded")

        registry_stub.async_get_device_id_by_identifier = broken
        try:
            with self.assertRaises(RuntimeError):
                self.register_display("AA:BB")
        finally:
            registry_stub.async_get_device_id_by_identifier = original


if __name__ == "__main__":
    unittest.main()
