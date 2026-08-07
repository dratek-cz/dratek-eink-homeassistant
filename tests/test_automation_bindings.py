"""Regression tests for entity sources used by automatic display refreshes."""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path
import asyncio
import sys
import types
import unittest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from websocket_sources import find_top_level_function


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_automation_test"


async def _async_none(*_args, **_kwargs):
    return None


def _load_automation_module():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package

    homeassistant = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = object
    core.callback = lambda function: function
    event = types.ModuleType("homeassistant.helpers.event")
    event.async_call_later = lambda *_args, **_kwargs: None
    event.async_track_state_change_event = lambda *_args, **_kwargs: None
    event.async_track_time_interval = lambda *_args, **_kwargs: None
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = object
    helpers = types.ModuleType("homeassistant.helpers")
    sys.modules.update(
        {
            "homeassistant": homeassistant,
            "homeassistant.core": core,
            "homeassistant.helpers": helpers,
            "homeassistant.helpers.event": event,
            "homeassistant.helpers.storage": storage,
        }
    )

    local_modules = {
        "const": {
            "DOMAIN": "dratek_eink",
            "LOCAL_ROUTE_ID": "local",
            "PARTIAL_UPDATE_CONFIRMED_SDK_TYPES": {2635},
        },
        "gateway": {
            "async_gateway_status": lambda *_args, **_kwargs: None,
            "async_load_gateways": lambda *_args, **_kwargs: None,
            "async_scan_gateway": lambda *_args, **_kwargs: None,
            "async_send_gateway_payload": lambda *_args, **_kwargs: None,
        },
        "queue": {"get_transfer_queue": lambda _hass: None},
        "render": {
            "prepare_image_for_display": lambda _sdk, image, *_args: image,
            "render_automatic_refresh_image": lambda *_args, **_kwargs: None,
            "async_render_camera_binding_data_url": _async_none,
        },
        "display_preview": {"async_save_display_preview": lambda *_args, **_kwargs: None},
        "transfer": {"DratekTransfer": object},
    }
    for name, attributes in local_modules.items():
        module = types.ModuleType(f"{PACKAGE}.{name}")
        for key, value in attributes.items():
            setattr(module, key, value)
        sys.modules[module.__name__] = module

    spec = importlib.util.spec_from_file_location(
        f"{PACKAGE}.automation", COMPONENT / "automation.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


automation = _load_automation_module()


class _State:
    def __init__(self, state: str, **attributes):
        self.state = state
        self.attributes = attributes


class _Event:
    def __init__(self, entity_id: str, old_state: _State, new_state: _State):
        self.data = {
            "entity_id": entity_id,
            "old_state": old_state,
            "new_state": new_state,
        }


class _Store:
    def __init__(self):
        self.saved = None

    async def async_save(self, value):
        self.saved = value


class _States:
    def __init__(self, states):
        self._states = states

    def get(self, entity_id):
        return self._states.get(entity_id)


class AutomationBindingTests(unittest.TestCase):
    def test_refresh_interval_clamps_old_one_second_configs(self):
        refresh_interval = automation.EntityAutoUpdateManager._refresh_interval

        self.assertEqual(60, refresh_interval({}))
        self.assertEqual(30, refresh_interval({"refresh_interval_seconds": 1}))
        self.assertEqual(45, refresh_interval({"refresh_interval_seconds": 45}))

    def test_skipped_refresh_does_not_requeue_itself(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            address: {
                "enabled": True,
                "bindings": [{"type": "text", "entity_id": "sensor.time"}],
                "refresh_interval_seconds": 1,
            }
        }
        manager._pending_refreshes = {address}
        manager._refresh_tasks = {}
        manager._last_refresh_at = {}
        refreshes = []

        async def skipped_refresh(current_address):
            refreshes.append(current_address)
            return {"ok": True, "skipped": True}

        manager._async_refresh = skipped_refresh
        asyncio.run(manager._async_refresh_loop(address))

        self.assertEqual([address], refreshes)
        self.assertNotIn(address, manager._pending_refreshes)
        self.assertIn(address, manager._last_refresh_at)

    def test_changed_region_is_small_and_vertically_byte_aligned(self):
        previous = Image.new("RGB", (296, 128), "white")
        current = previous.copy()
        current.paste("black", (100, 41, 125, 54))

        region = automation.EntityAutoUpdateManager._changed_region(previous, current)

        self.assertIsNotNone(region)
        x0, y0, x1, y1 = region
        self.assertLess(x0, 100)
        self.assertGreaterEqual(x1, 125)
        self.assertEqual(0, y0 % 8)
        self.assertEqual(0, (y1 - y0) % 8)
        self.assertLess((x1 - x0) * (y1 - y0), 296 * 128)

    def test_starting_manual_upload_removes_all_previous_automation(self):
        clear_function = find_top_level_function("_clear_previous_entity_automation")
        isolated_module = ast.Module(body=[clear_function], type_ignores=[])
        ast.fix_missing_locations(isolated_module)
        calls = []

        class Manager:
            async def async_set_config(self, address, config):
                calls.append((address, config))

        namespace = {
            "HomeAssistant": object,
            "get_entity_auto_update_manager": lambda _hass: Manager(),
        }
        exec(compile(isolated_module, "websocket.py", "exec"), namespace)

        asyncio.run(
            namespace["_clear_previous_entity_automation"](
                object(), "FF:FF:92:81:46:32"
            )
        )

        self.assertEqual([("FF:FF:92:81:46:32", None)], calls)

    def test_queued_upload_installs_automation_before_transfer_starts(self):
        # E-ink writes are slow. The listener must already exist before the job
        # enters the queue or an entity change during that wait is lost forever.
        for name in (
            "websocket_send_design",
            "websocket_commit_design_upload",
            "websocket_send_gateway_design",
        ):
            with self.subTest(handler=name):
                handler = find_top_level_function(name)
                runners = [
                    node
                    for node in ast.walk(handler)
                    if isinstance(node, ast.AsyncFunctionDef) and node is not handler
                ]
                self.assertEqual(1, len(runners), f"{name} has no queued runner")
                installed = [
                    call
                    for call in ast.walk(handler)
                    if isinstance(call, ast.Call)
                    and getattr(call.func, "id", "") == "_install_entity_automation"
                    and call not in set(ast.walk(runners[0]))
                ]
                self.assertTrue(
                    installed,
                    f"{name} does not listen for entity changes until its slow "
                    "display write has already finished.",
                )
                rolled_back = any(
                    isinstance(call, ast.Call)
                    and getattr(call.func, "id", "")
                    == "_clear_entity_automation_if_matches"
                    for call in ast.walk(runners[0])
                )
                self.assertTrue(rolled_back, f"{name} leaves automation active after a failed write")
                reconciled = any(
                    isinstance(call, ast.Call)
                    and getattr(call.func, "id", "")
                    == "_request_entity_automation_refresh"
                    for call in ast.walk(runners[0])
                )
                self.assertTrue(
                    reconciled,
                    f"{name} loses HA changes made while the image was uploading",
                )

    def test_failed_old_upload_does_not_clear_newer_automation(self):
        address = "FF:FF:92:81:46:32"
        old = {"enabled": True, "bindings": [{"id": "old"}]}
        newer = {"enabled": True, "bindings": [{"id": "new"}], "refresh_interval_seconds": 2}
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)
        manager._initialized = True
        manager._configs = {address: newer}
        manager._store = _Store()
        manager._refresh_listener = lambda: None

        asyncio.run(manager.async_clear_config_if_matches(address, old))

        self.assertEqual(newer, manager._configs[address])
        self.assertIsNone(manager._store.saved)

    def test_disabling_automation_clears_pending_refresh_and_timer(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        manager._configs = {
            address: {
                "enabled": True,
                "bindings": [{"type": "text", "entity_id": "sensor.time"}],
            }
        }
        manager._last_refresh_at = {address: 123.0}
        manager._pending_refreshes = {address}
        timer_cancelled = []
        manager._timers = {address: lambda: timer_cancelled.append(address)}
        manager._store = _Store()
        manager._refresh_listener = lambda: None

        asyncio.run(manager.async_set_config(address.lower(), None))

        self.assertNotIn(address, manager._configs)
        self.assertNotIn(address, manager._last_refresh_at)
        self.assertNotIn(address, manager._pending_refreshes)
        self.assertNotIn(address, manager._timers)
        self.assertEqual([address], timer_cancelled)
        self.assertEqual({"configs": {}}, manager._store.saved)

    def test_time_condition_supports_daytime_and_overnight_intervals(self):
        matches = automation.EntityAutoUpdateManager._condition_matches

        self.assertTrue(matches("14:30", "time_between", "08:00|16:00"))
        self.assertFalse(matches("18:00", "time_between", "08:00|16:00"))
        self.assertTrue(matches("23:15", "time_between", "22:00|06:00"))
        self.assertTrue(matches("2026-07-27T05:45:00+02:00", "time_between", "22:00|06:00"))
        self.assertFalse(matches("12:00", "time_between", "22:00|06:00"))
        self.assertFalse(matches("08:00", "time_between", "08:00|08:00"))

    def test_layered_binding_subscribes_to_widget_entities(self):
        binding = {
            "type": "layered",
            "entity_id": "switch.socket",
            "layers": [
                {
                    "objects": [
                        {
                            "type": "gauge",
                            "entity_id": "sensor.temperature",
                            "entity_attribute": "value",
                        }
                    ]
                }
            ],
        }

        self.assertEqual(
            {
                ("switch.socket", ""),
                ("sensor.temperature", "value"),
            },
            automation._binding_sources(binding),
        )

    def test_widget_attribute_change_schedules_bound_display(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "bindings": [
                    {
                        "type": "layered",
                        "entity_id": "switch.socket",
                        "layers": [
                            {
                                "objects": [
                                    {
                                        "type": "gauge",
                                        "entity_id": "sensor.temperature",
                                        "entity_attribute": "value",
                                    }
                                ]
                            }
                        ],
                    }
                ]
            }
        }
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_state_change(
            _Event(
                "sensor.temperature",
                _State("ok", value=20),
                _State("ok", value=21),
            )
        )

        self.assertEqual(["FF:FF:92:81:46:32"], scheduled)

    def test_camera_binding_ticks_are_scheduled_regardless_of_entity_state(self):
        # camera.meteoradar's state never meaningfully changes between RainViewer
        # frames, so a camera-bound display must refresh from the periodic tick
        # (_handle_camera_tick), not from _handle_state_change.
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "bindings": [
                    {"id": "radar", "type": "camera", "entity_id": "camera.meteoradar"},
                ]
            },
            "AA:AA:11:22:33:44": {
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}]
            },
        }
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_camera_tick(None)

        self.assertEqual(["FF:FF:92:81:46:32"], scheduled)

    def test_custom_element_edit_does_not_schedule_display_in_manual_mode(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "bindings": [
                    {
                        "id": "custom-1",
                        "type": "layered",
                        "entity_id": "switch.old",
                        "layers": [{"id": "old", "objects": []}],
                    }
                ]
            }
        }
        manager._store = _Store()
        manager._refresh_listener = lambda: None
        scheduled = []
        manager._schedule_refresh = scheduled.append
        element = {
            "id": "element-1",
            "element_type": "layered",
            "entity_id": "switch.socket",
            "entity_attribute": "",
            "canvas_width": 296,
            "canvas_height": 128,
            "default_layer_id": "on",
            "condition_rules": [
                {"operator": "is_on", "value": "", "layer_id": "on", "symbol": "on"}
            ],
            "layers": [
                {
                    "id": "on",
                    "objects": [
                        {
                            "id": "label",
                            "type": "text",
                            "entity_id": "sensor.power",
                            "text": "Zapnuto",
                        }
                    ],
                }
            ],
        }

        affected = asyncio.run(
            manager.async_custom_element_changed(
                element,
                {"FF:FF:92:81:46:32": {"custom-1"}},
            )
        )

        self.assertEqual([], affected)
        self.assertEqual([], scheduled)

    def test_preview_and_automatic_refresh_share_binding_value_collection(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager.hass = types.SimpleNamespace(
            states=_States(
                {
                    "sensor.temperature": _State("21.5", unit_of_measurement="°C"),
                    "switch.socket": _State("on"),
                    "sensor.power": _State("48", unit_of_measurement="W"),
                }
            )
        )
        manager._chart_series = {}
        bindings = [
            {
                "id": "temperature",
                "type": "chart",
                "entity_id": "sensor.temperature",
                "fallback": "[18,19]",
                "maxPoints": 12,
            },
            {
                "id": "socket",
                "type": "layered",
                "entity_id": "switch.socket",
                "entity_ids": ["switch.socket", "sensor.power"],
            },
        ]

        values = manager._current_binding_values(
            "FF:FF:92:81:46:32",
            bindings,
        )

        self.assertEqual("[18.0,19.0,21.5]", values["temperature"])
        self.assertIn('"__selection__":"on"', values["socket"])
        self.assertIn('"sensor.power":{"state":"48"', values["socket"])

    def test_camera_binding_passes_its_selected_country_to_the_renderer(self):
        # A camera binding without this would always render "cz" during an
        # automatic refresh no matter which country the user picked in the
        # template, since async_render_camera_binding_data_url defaults to it.
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(
            states=_States({}), async_add_executor_job=executor
        )
        manager._chart_series = {}
        captured = {}

        async def fake_camera_render(_hass, entity_id, width, height, country="cz"):
            captured["entity_id"] = entity_id
            captured["country"] = country
            return "data:image/png;base64,AA=="

        original = automation.async_render_camera_binding_data_url
        automation.async_render_camera_binding_data_url = fake_camera_render
        try:
            asyncio.run(
                manager.async_render_preview(
                    "FF:FF:92:81:46:32",
                    {
                        "base_image": "",
                        "svg_template": "",
                        "bindings": [
                            {
                                "id": "radar",
                                "type": "camera",
                                "entity_id": "camera.meteoradar",
                                "width": 400,
                                "height": 300,
                                "country": "pl",
                            }
                        ],
                    },
                )
            )
        finally:
            automation.async_render_camera_binding_data_url = original

        self.assertEqual("camera.meteoradar", captured["entity_id"])
        self.assertEqual("pl", captured["country"])


class AutomaticGatewayRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_unconfirmed_display_uses_reliable_full_automatic_write(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(async_add_executor_job=executor)
        manager._configs = {
            address: {
                "route_type": "local",
                "gateway_selection": "manual",
                "manual_gateway_id": "local",
                "sdk_type": 64,
                "software_version": 145,
                "bindings": [{"type": "text"}],
            }
        }
        manager.async_render_preview = lambda *_args: asyncio.sleep(
            0, result=Image.new("RGB", (10, 8), "white")
        )
        manager._changed_region = lambda _previous, _current: (1, 0, 4, 8)
        manager._remember_rendered_image = lambda *_args: asyncio.sleep(0)
        sent = {}

        class _Queue:
            async def async_submit(self, **kwargs):
                return await kwargs["runner"](lambda line: sent.setdefault("log", []).append(line))

        class _Transfer:
            def __init__(self, **_kwargs):
                pass

            async def send_image(self, *args):
                sent["full"] = args

            async def send_partial_image(self, *args, **kwargs):
                sent["partial"] = (args, kwargs)

        original_queue = automation.get_transfer_queue
        original_transfer = automation.DratekTransfer
        automation.get_transfer_queue = lambda _hass: _Queue()
        automation.DratekTransfer = _Transfer
        try:
            result = await manager._async_refresh(address)
        finally:
            automation.get_transfer_queue = original_queue
            automation.DratekTransfer = original_transfer

        self.assertTrue(result["ok"])
        self.assertIn("full", sent)
        self.assertNotIn("partial", sent)
        self.assertEqual(145, sent["full"][-1])
        self.assertTrue(any("complete image" in line for line in sent["log"]))

    async def test_selects_gateway_with_strongest_display_signal(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(async_add_executor_job=executor)
        manager._gateway_route_cache = {}
        manager._gateway_route_cache_at = 0.0
        manager._gateway_route_lock = asyncio.Lock()
        scan_calls = []

        async def load_gateways(_hass):
            return [
                {"id": "workshop", "name": "Gateway dílna"},
                {"id": "office", "name": "Gateway kancelář"},
            ]

        async def scan_gateway(_hass, gateway_id, _seconds):
            scan_calls.append(gateway_id)
            rssi = -72 if gateway_id == "workshop" else -48
            return {
                "ok": True,
                "devices": [{"address": "FF:FF:92:81:46:32", "rssi": rssi}],
            }

        original_load = automation.async_load_gateways
        original_scan = automation.async_scan_gateway
        automation.async_load_gateways = load_gateways
        automation.async_scan_gateway = scan_gateway
        try:
            route = await manager._async_best_gateway_route("ff:ff:92:81:46:32")
            cached_route = await manager._async_best_gateway_route("FF:FF:92:81:46:32")
        finally:
            automation.async_load_gateways = original_load
            automation.async_scan_gateway = original_scan

        self.assertEqual("office", route["id"])
        self.assertEqual("Gateway kancelář", route["name"])
        self.assertEqual(-48, route["rssi"])
        self.assertEqual(route, cached_route)
        self.assertCountEqual(["workshop", "office"], scan_calls)

    async def test_automatic_refresh_uses_the_fresh_strongest_gateway(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(async_add_executor_job=executor)
        manager._configs = {
            address: {
                "route_type": "gateway",
                "gateway_id": "old-gateway",
                "transport_name": "Stará gateway",
                "sdk_type": 64,
                "bindings": [{"type": "text"}],
            }
        }
        manager.async_render_preview = lambda *_args: asyncio.sleep(
            0, result=Image.new("RGB", (10, 8), "white")
        )
        manager._changed_region = lambda _previous, _current: (0, 0, 10, 8)
        manager._remember_rendered_image = lambda *_args: asyncio.sleep(0)
        manager._async_best_gateway_route = lambda _address: asyncio.sleep(
            0,
            result={"id": "office", "name": "Gateway kancelář", "rssi": -48},
        )
        submitted = {}

        class _Queue:
            async def async_submit(self, **kwargs):
                submitted.update(kwargs)
                return await kwargs["runner"](lambda _line: None)

        async def send_gateway(_hass, gateway_id, *_args, **_kwargs):
            submitted["sent_gateway_id"] = gateway_id
            return {"ok": True}

        original_queue = automation.get_transfer_queue
        original_send = automation.async_send_gateway_payload
        automation.get_transfer_queue = lambda _hass: _Queue()
        automation.async_send_gateway_payload = send_gateway
        try:
            result = await manager._async_refresh(address)
        finally:
            automation.get_transfer_queue = original_queue
            automation.async_send_gateway_payload = original_send

        self.assertTrue(result["ok"])
        self.assertEqual("gateway:office", submitted["resource"])
        self.assertEqual("Gateway kancelář", submitted["transport_name"])
        self.assertEqual("office", submitted["sent_gateway_id"])

    async def test_manual_gateway_choice_overrides_stronger_automatic_route(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(async_add_executor_job=executor)
        manager._configs = {
            address: {
                "gateway_selection": "manual",
                "manual_gateway_id": "workshop",
                "route_type": "gateway",
                "gateway_id": "workshop",
                "transport_name": "Gateway dílna",
                "sdk_type": 64,
                "bindings": [{"type": "text"}],
            }
        }
        manager.async_render_preview = lambda *_args: asyncio.sleep(
            0, result=Image.new("RGB", (10, 8), "white")
        )
        manager._changed_region = lambda _previous, _current: (0, 0, 10, 8)
        manager._remember_rendered_image = lambda *_args: asyncio.sleep(0)
        route_scan_called = False

        async def best_route(_address):
            nonlocal route_scan_called
            route_scan_called = True
            return {"id": "office", "name": "Gateway kancelář", "rssi": -35}

        manager._async_best_gateway_route = best_route
        submitted = {}

        class _Queue:
            async def async_submit(self, **kwargs):
                submitted.update(kwargs)
                return await kwargs["runner"](lambda _line: None)

        async def send_gateway(_hass, gateway_id, *_args, **_kwargs):
            submitted["sent_gateway_id"] = gateway_id
            return {"ok": True}

        original_queue = automation.get_transfer_queue
        original_send = automation.async_send_gateway_payload
        automation.get_transfer_queue = lambda _hass: _Queue()
        automation.async_send_gateway_payload = send_gateway
        try:
            result = await manager._async_refresh(address)
        finally:
            automation.get_transfer_queue = original_queue
            automation.async_send_gateway_payload = original_send

        self.assertTrue(result["ok"])
        self.assertFalse(route_scan_called)
        self.assertEqual("workshop", submitted["sent_gateway_id"])
        self.assertEqual("gateway:workshop", submitted["resource"])


if __name__ == "__main__":
    unittest.main()
