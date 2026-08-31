"""Regression tests for entity sources used by automatic display refreshes."""

from __future__ import annotations

import ast
import base64
import importlib.util
import io
import json
from pathlib import Path
import asyncio
import sys
import time
import types
import unittest
import uuid
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from websocket_sources import find_top_level_function


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_automation_test"


async def _async_none(*_args, **_kwargs):
    return None


async def _async_gateway_preferences(hass, *_args, **_kwargs):
    return dict(getattr(hass, "gateway_preferences", {}))


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
            "DISCOVERY_CACHE_KEY": "dratek_eink.discovery_cache",
            "DISCOVERY_GRACE_SECONDS": 300,
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
        "gateway_preferences": {
            "async_load_gateway_preferences": _async_gateway_preferences,
        },
        "queue": {"get_transfer_queue": lambda _hass: None},
        "render": {
            "BWRY_CODES": {46, 78, 142, 270, 302, 310, 318, 558, 654, 686, 2670, 2702},
            "prepare_image_for_display": lambda _sdk, image, *_args: image,
            "render_automatic_refresh_image": lambda *_args, **_kwargs: None,
            "async_render_camera_binding_data_url": _async_none,
            "async_render_meteoradar_sidebar_data_url": _async_none,
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


def _solid_png_data_url(color: tuple[int, int, int]) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


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

        self.assertEqual(600, refresh_interval({}))
        self.assertEqual(30, refresh_interval({"refresh_interval_seconds": 1}))
        self.assertEqual(45, refresh_interval({"refresh_interval_seconds": 45}))

    def test_automation_overview_excludes_large_render_payloads(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        manager._configs = {
            address: {
                "enabled": True,
                "base_image": "data:image/png;base64," + ("A" * 10000),
                "svg_template": "<svg>large document</svg>",
                "bindings": [
                    {"type": "text", "entity_id": "sensor.temperature"},
                    {"type": "text", "entity_id": "sensor.humidity"},
                ],
                "refresh_interval_seconds": 300,
                "refresh_trigger_mode": "interval_only",
                "route_type": "local",
                "transport_name": "Home Assistant Bluetooth",
            }
        }

        summaries = asyncio.run(manager.async_list_configs())

        self.assertEqual(1, len(summaries))
        self.assertEqual(address, summaries[0]["address"])
        self.assertEqual(300, summaries[0]["refresh_interval_seconds"])
        self.assertTrue(summaries[0]["enabled"])
        self.assertEqual(
            ["sensor.humidity", "sensor.temperature"],
            summaries[0]["entity_ids"],
        )
        self.assertNotIn("base_image", summaries[0])
        self.assertNotIn("svg_template", summaries[0])

    def test_pausing_automation_persists_config_and_stops_scheduling(self):
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
        listener_updates = []
        interval_updates = []
        manager._refresh_listener = lambda: listener_updates.append(True)
        manager._sync_interval_timer = lambda value: interval_updates.append(value)

        asyncio.run(manager.async_set_enabled(address.lower(), False))

        self.assertFalse(manager._configs[address]["enabled"])
        self.assertNotIn(address, manager._pending_refreshes)
        self.assertNotIn(address, manager._last_refresh_at)
        self.assertEqual([address], timer_cancelled)
        self.assertEqual(False, manager._store.saved["configs"][address]["enabled"])
        self.assertEqual([True], listener_updates)
        self.assertEqual([address], interval_updates)

        scheduled = []
        manager._pending_refreshes = set()
        manager.hass = types.SimpleNamespace()
        manager._refresh_tasks = {}
        manager._timers = {}
        manager._schedule_refresh(address)
        scheduled.extend(manager._pending_refreshes)
        self.assertEqual([], scheduled)

    def test_resuming_automation_starts_a_fresh_interval(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        manager._configs = {
            address: {
                "enabled": False,
                "bindings": [{"type": "text", "entity_id": "sensor.time"}],
            }
        }
        manager._last_refresh_at = {}
        manager._pending_refreshes = set()
        manager._timers = {}
        manager._store = _Store()
        manager._refresh_listener = lambda: None
        manager._sync_interval_timer = lambda _address: None

        before = time.monotonic()
        asyncio.run(manager.async_set_enabled(address, True))

        self.assertTrue(manager._configs[address]["enabled"])
        self.assertGreaterEqual(manager._last_refresh_at[address], before)
        self.assertTrue(manager._store.saved["configs"][address]["enabled"])

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
            "DOMAIN": "dratek_eink",
            "PENDING_AUTOMATIONS_KEY": "pending_entity_automations",
            "get_entity_auto_update_manager": lambda _hass: Manager(),
        }
        exec(compile(isolated_module, "websocket.py", "exec"), namespace)

        class Hass:
            data = {}

        asyncio.run(
            namespace["_clear_previous_entity_automation"](
                Hass(), "FF:FF:92:81:46:32"
            )
        )

        self.assertEqual([("FF:FF:92:81:46:32", None)], calls)

    def test_queued_upload_activates_automation_only_after_transfer_succeeds(self):
        # A running manual upload owns the display exclusively. Its bindings
        # remain pending and become active only from the successful runner.
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
                self.assertGreaterEqual(len(runners), 1, f"{name} has no queued runner")
                runner_nodes = {
                    descendant
                    for runner in runners
                    for descendant in ast.walk(runner)
                }
                prepared = [
                    call
                    for call in ast.walk(handler)
                    if isinstance(call, ast.Call)
                    and getattr(call.func, "id", "") == "_install_entity_automation"
                    and call not in runner_nodes
                ]
                self.assertTrue(prepared, f"{name} does not prepare its automation")
                activated = all(
                    any(
                        isinstance(call, ast.Call)
                        and getattr(call.func, "id", "")
                        in {"_activate_entity_automation", "_after_successful_send"}
                        for call in ast.walk(runner)
                    )
                    for runner in runners
                )
                self.assertTrue(activated, f"{name} activates automation before confirmed success")
                rolled_back = all(
                    any(
                        isinstance(call, ast.Call)
                        and getattr(call.func, "id", "")
                        == "_clear_entity_automation_if_matches"
                        for call in ast.walk(runner)
                    )
                    for runner in runners
                )
                self.assertTrue(rolled_back, f"{name} leaves automation active after a failed write")
                reconciled = all(
                    any(
                        isinstance(call, ast.Call)
                        and getattr(call.func, "id", "")
                        in {"_request_entity_automation_refresh", "_after_successful_send"}
                        for call in ast.walk(runner)
                    )
                    for runner in runners
                )
                self.assertTrue(
                    reconciled,
                    f"{name} loses HA changes made while the image was uploading",
                )

        # The runners reach both through _after_successful_send now, so that
        # helper has to be the thing that really arms the automation - otherwise
        # accepting its name above would turn this whole test into a no-op.
        tail = find_top_level_function("_after_successful_send")
        tail_calls = {
            getattr(call.func, "id", "")
            for call in ast.walk(tail)
            if isinstance(call, ast.Call)
        }
        self.assertIn("_activate_entity_automation", tail_calls)
        self.assertIn("_request_entity_automation_refresh", tail_calls)
        self.assertIn("async_save_display_preview", tail_calls)

        prepare = find_top_level_function("_install_entity_automation")
        prepare_calls = {
            node.func.attr
            for node in ast.walk(prepare)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        }
        self.assertNotIn("async_set_config", prepare_calls)
        activate = find_top_level_function("_activate_entity_automation")
        activate_calls = {
            node.func.attr
            for node in ast.walk(activate)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        }
        self.assertIn("async_set_config", activate_calls)

    def test_image_cycle_without_entity_bindings_is_prepared_for_activation(self):
        prepare_function = find_top_level_function("_install_entity_automation")
        isolated_module = ast.Module(body=[prepare_function], type_ignores=[])
        ast.fix_missing_locations(isolated_module)

        class Manager:
            pass

        manager = Manager()
        cleared = []

        async def clear_previous(_hass, address):
            cleared.append(address)

        async def load_project_data(_hass):
            return {"device_gateway_preferences": {}}

        namespace = {
            "Any": object,
            "HomeAssistant": object,
            "DOMAIN": "dratek_eink",
            "LOCAL_ROUTE_ID": "local",
            "PENDING_AUTOMATIONS_KEY": "pending_entity_automations",
            "uuid": uuid,
            "get_entity_auto_update_manager": lambda _hass: manager,
            "_clear_previous_entity_automation": clear_previous,
            "_load_project_data": load_project_data,
        }
        exec(compile(isolated_module, "ws_shared.py", "exec"), namespace)

        class Hass:
            data = {}

        config = {
            "enabled": True,
            "bindings": [],
            "image_cycle": ["data:image/png;base64,ONE", "data:image/png;base64,TWO"],
            "image_cycle_interval_seconds": 600,
        }
        prepared = asyncio.run(
            namespace["_install_entity_automation"](
                Hass(), "ff:ff:92:81:46:32", config
            )
        )

        self.assertIsNotNone(prepared)
        self.assertEqual(config["image_cycle"], prepared["image_cycle"])
        self.assertEqual("auto", prepared["gateway_selection"])
        self.assertNotIn("manual_gateway_id", prepared)
        self.assertTrue(prepared["installation_id"])
        self.assertEqual([], cleared)
        self.assertIs(
            prepared,
            Hass.data["dratek_eink"]["pending_entity_automations"]["FF:FF:92:81:46:32"],
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

    def test_changing_config_does_not_cancel_an_in_flight_transfer(self):
        address = "FF:FF:92:81:46:32"

        class RunningTask:
            cancelled = False

            def done(self):
                return False

            def cancel(self):
                self.cancelled = True

        task = RunningTask()
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
        manager._last_refresh_wall_time = {}
        manager._pending_refreshes = {address}
        manager._timers = {}
        manager._refresh_tasks = {address: task}
        manager._store = _Store()
        manager._refresh_listener = lambda: None
        manager._sync_interval_timer = lambda _address: None

        asyncio.run(manager.async_set_config(address, None))

        self.assertFalse(task.cancelled)
        self.assertIs(task, manager._refresh_tasks[address])
        self.assertNotIn(address, manager._pending_refreshes)

    def test_deleting_gallery_image_removes_its_persisted_cycle_payload(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        manager._configs = {
            address: {
                "enabled": True,
                "bindings": [],
                "image_cycle_ids": ["one", "two", "three"],
                "image_cycle": ["IMAGE_ONE", "IMAGE_TWO", "IMAGE_THREE"],
            }
        }
        manager._last_refresh_at = {address: 123.0}
        manager._store = _Store()
        manager._refresh_listener = lambda: None

        asyncio.run(manager.async_remove_image_cycle_asset(address.lower(), "two"))

        saved = manager._store.saved["configs"][address]
        self.assertEqual(["one", "three"], saved["image_cycle_ids"])
        self.assertEqual(["IMAGE_ONE", "IMAGE_THREE"], saved["image_cycle"])

    def test_deleting_last_gallery_image_removes_empty_cycle_automation(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        manager._configs = {
            address: {
                "enabled": True,
                "bindings": [],
                "image_cycle_ids": ["only"],
                "image_cycle": ["IMAGE_ONLY"],
            }
        }
        manager._last_refresh_at = {address: 123.0}
        manager._store = _Store()
        manager._refresh_listener = lambda: None

        asyncio.run(manager.async_remove_image_cycle_asset(address, "only"))

        self.assertNotIn(address, manager._configs)
        self.assertNotIn(address, manager._last_refresh_at)
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
                "refresh_trigger_mode": "both",
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

    def test_series_attribute_change_schedules_bound_display(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            address: {
                "refresh_trigger_mode": "both",
                "bindings": [
                    {
                        "type": "series",
                        "entity_id": "sensor.spot_price",
                    }
                ]
            }
        }
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_state_change(
            _Event(
                "sensor.spot_price",
                _State("1.42", **{"2026-08-14T10:00:00+02:00": 1.2}),
                _State("1.42", **{"2026-08-14T10:00:00+02:00": 1.8}),
            )
        )

        self.assertEqual([address], scheduled)

    def test_refresh_tick_schedules_every_configured_display_regardless_of_entity_state(self):
        # camera.meteoradar's state never meaningfully changes between RainViewer
        # frames, so a camera-bound display must refresh from the periodic tick
        # (_handle_refresh_tick), not from _handle_state_change - and an ordinary
        # sensor-bound display now gets the exact same periodic insurance, not a
        # second, separate mechanism just for cameras.
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
        manager._last_refresh_at = {}
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_refresh_tick(None)

        self.assertEqual({"FF:FF:92:81:46:32", "AA:AA:11:22:33:44"}, set(scheduled))

    def test_refresh_tick_respects_each_displays_own_interval(self):
        # This is the setting the "refresh interval" dropdown in the device
        # settings dialog actually controls: before _handle_refresh_tick
        # existed, that setting only throttled *state-change*-triggered
        # refreshes and never drove a refresh on its own, so a display bound
        # to slow-changing data would go long past its chosen interval with
        # no update at all.
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        now = time.monotonic()
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "refresh_interval_seconds": 3600,
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            },
            "AA:AA:11:22:33:44": {
                "refresh_interval_seconds": 30,
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            },
        }
        # The hour-interval display refreshed a second ago - not due yet. The
        # 30-second-interval display refreshed a minute ago - overdue.
        manager._last_refresh_at = {
            "FF:FF:92:81:46:32": now - 1,
            "AA:AA:11:22:33:44": now - 60,
        }
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_refresh_tick(None)

        self.assertEqual(["AA:AA:11:22:33:44"], scheduled)

    def test_image_cycle_gets_its_own_exact_interval_timer(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager.hass = object()
        manager._configs = {
            address: {
                "refresh_interval_seconds": 600,
                "refresh_trigger_mode": "interval_only",
                "bindings": [],
                "image_cycle": ["ONE", "TWO"],
            }
        }
        manager._interval_timers = {}
        scheduled = []
        manager._schedule_refresh = scheduled.append
        callbacks = []
        cancelled = []

        def fake_call_later(_hass, seconds, callback):
            callbacks.append((seconds, callback))
            return lambda: cancelled.append(True)

        original = automation.async_call_later
        automation.async_call_later = fake_call_later
        try:
            manager._sync_interval_timer(address)
            self.assertGreater(callbacks[0][0], 0)
            self.assertLessEqual(callbacks[0][0], 600)
            callbacks[0][1](None)
        finally:
            automation.async_call_later = original

        self.assertEqual([address], scheduled)
        self.assertEqual(2, len(callbacks))
        self.assertGreater(callbacks[1][0], 0)
        self.assertLessEqual(callbacks[1][0], 600)
        self.assertEqual([], cancelled)

    def test_refresh_trigger_mode_defaults_to_both_and_rejects_invalid_values(self):
        trigger_mode = automation.EntityAutoUpdateManager._refresh_trigger_mode

        self.assertEqual("both", trigger_mode({}))
        self.assertEqual("both", trigger_mode({"refresh_trigger_mode": "both"}))
        self.assertEqual("change_only", trigger_mode({"refresh_trigger_mode": "change_only"}))
        self.assertEqual("interval_only", trigger_mode({"refresh_trigger_mode": "interval_only"}))
        # Unrecognised/garbage values fall back to the safe default rather than
        # silently enabling a trigger the stored config never actually chose.
        self.assertEqual("both", trigger_mode({"refresh_trigger_mode": "nonsense"}))

    def test_refresh_tick_skips_change_only_displays(self):
        # "change_only" means the periodic tick must never schedule this
        # display - only a real entity change may.
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "refresh_trigger_mode": "change_only",
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            },
            "AA:AA:11:22:33:44": {
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            },
        }
        manager._last_refresh_at = {}
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_refresh_tick(None)

        self.assertEqual(["AA:AA:11:22:33:44"], scheduled)

    def test_state_change_skips_interval_only_displays(self):
        # "interval_only" means an entity change must never schedule this
        # display - only the periodic tick may.
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "refresh_trigger_mode": "interval_only",
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            },
            "AA:AA:11:22:33:44": {
                "refresh_trigger_mode": "both",
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            },
        }
        scheduled = []
        manager._schedule_refresh = scheduled.append

        manager._handle_state_change(
            _Event("sensor.temperature", _State("20"), _State("21"))
        )

        self.assertEqual(["AA:AA:11:22:33:44"], scheduled)

    def test_refresh_listener_does_not_subscribe_entities_only_needed_on_interval(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._unsubscribe = None
        manager.hass = object()
        manager._configs = {
            "FF:FF:92:81:46:32": {
                "refresh_trigger_mode": "interval_only",
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.only_on_interval"}],
            },
            "AA:AA:11:22:33:44": {
                "refresh_trigger_mode": "both",
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.reacts_to_changes"}],
            },
        }
        captured = {}

        def fake_track(_hass, entity_ids, _callback):
            captured["entity_ids"] = entity_ids
            return lambda: None

        original = automation.async_track_state_change_event
        automation.async_track_state_change_event = fake_track
        try:
            manager._refresh_listener()
        finally:
            automation.async_track_state_change_event = original

        self.assertEqual(["sensor.reacts_to_changes"], captured["entity_ids"])

    def test_async_set_refresh_trigger_mode_persists_and_refreshes_listener(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        address = "FF:FF:92:81:46:32"
        manager._configs = {
            address: {
                "refresh_trigger_mode": "both",
                "bindings": [{"id": "temp", "type": "text", "entity_id": "sensor.temperature"}],
            }
        }
        manager._store = _Store()
        listener_calls = []
        manager._refresh_listener = lambda: listener_calls.append(True)

        asyncio.run(manager.async_set_refresh_trigger_mode(address.lower(), "interval_only"))

        self.assertEqual("interval_only", manager._configs[address]["refresh_trigger_mode"])
        self.assertEqual(
            "interval_only",
            manager._store.saved["configs"][address]["refresh_trigger_mode"],
        )
        self.assertEqual([True], listener_calls)

    def test_async_set_refresh_trigger_mode_is_a_no_op_when_unchanged(self):
        # Mirrors async_set_refresh_interval's short-circuit: no store write
        # (and no listener rebuild) when the mode is already what was asked.
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._initialized = True
        address = "FF:FF:92:81:46:32"
        manager._configs = {
            address: {"refresh_trigger_mode": "both", "bindings": []},
        }
        manager._store = _Store()
        listener_calls = []
        manager._refresh_listener = lambda: listener_calls.append(True)

        asyncio.run(manager.async_set_refresh_trigger_mode(address.lower(), "both"))

        self.assertIsNone(manager._store.saved)
        self.assertEqual([], listener_calls)

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

        async def fake_camera_render(
            _hass, entity_id, width, height, country="cz",
            show_precipitation=True, dotted_light=True, show_wind=False,
            preserve_yellow=False,
        ):
            captured["entity_id"] = entity_id
            captured["country"] = country
            captured["show_precipitation"] = show_precipitation
            captured["dotted_light"] = dotted_light
            captured["show_wind"] = show_wind
            captured["preserve_yellow"] = preserve_yellow
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
                        "sdk_type": 46,
                        "bindings": [
                            {
                                "id": "radar",
                                "type": "camera",
                                "entity_id": "camera.meteoradar",
                                "width": 400,
                                "height": 300,
                                "country": "pl",
                                "show_precipitation": True,
                                "dotted_light": False,
                                "show_wind": True,
                            }
                        ],
                    },
                )
            )
        finally:
            automation.async_render_camera_binding_data_url = original

        self.assertEqual("camera.meteoradar", captured["entity_id"])
        self.assertEqual("pl", captured["country"])
        self.assertTrue(captured["show_precipitation"])
        self.assertFalse(captured["dotted_light"])
        self.assertTrue(captured["show_wind"])
        self.assertTrue(captured["preserve_yellow"])

    def test_ratio_binding_computes_live_percent_with_its_divisor(self):
        # air.js's AQI dial: ratio(0, 21) / 2 - the /2 rides along as the
        # binding's own divisor field, applied after the same 0-100 clamp
        # _templatePercent uses, so a live AQI reading fills the dial the
        # same fraction the panel's own formula would.
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)
        manager.hass = types.SimpleNamespace(
            states=_States({"sensor.aqi": _State("42"), "sensor.humidity": _State("70", unit_of_measurement="%")})
        )
        manager._chart_series = {}
        bindings = [
            {
                "id": "dial",
                "type": "ratio",
                "meters": [{"entity_id": "sensor.aqi", "divisor": 2, "label": "", "color": "black"}],
            },
            {
                "id": "meters",
                "type": "ratio",
                "meters": [{"entity_id": "sensor.humidity", "divisor": 1, "label": "Vlhkost", "color": "red"}],
            },
        ]

        values = manager._current_binding_values("FF:FF:92:81:46:32", bindings)

        dial = json.loads(values["dial"])
        self.assertEqual(1, len(dial))
        self.assertAlmostEqual(21.0, dial[0]["percent"])
        self.assertEqual("42", dial[0]["text"])
        meters = json.loads(values["meters"])
        self.assertAlmostEqual(70.0, meters[0]["percent"])
        self.assertEqual("70 %", meters[0]["text"])
        self.assertEqual("Vlhkost", meters[0]["label"])
        self.assertEqual("red", meters[0]["color"])

    def test_current_binding_values_isolates_a_failing_binding(self):
        # A single binding raising (a non-numeric ratio divisor here, but any
        # bad stored value behaves the same) used to abort the whole render:
        # _current_binding_values propagated the exception straight out of
        # async_render_preview, so no binding on the display got a fresh
        # value and no display write ever happened. Because the failure never
        # reached the transfer queue, it produced no queue job and no visible
        # error either - the display just silently stopped receiving updates
        # for as long as that one binding kept failing. Every other binding
        # must still resolve from live state even while one of them is broken.
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)
        manager.hass = types.SimpleNamespace(
            states=_States({"sensor.temperature": _State("21.5", unit_of_measurement="°C")})
        )
        manager._chart_series = {}
        bindings = [
            {
                "id": "broken",
                "type": "ratio",
                "meters": [{"entity_id": "sensor.aqi", "divisor": "not-a-number"}],
                "fallback": "[]",
            },
            {"id": "temperature", "type": "text", "entity_id": "sensor.temperature"},
        ]

        values = manager._current_binding_values("FF:FF:92:81:46:32", bindings)

        self.assertEqual("[]", values["broken"])
        self.assertEqual("21,5 °C", values["temperature"])

    def test_async_refresh_loop_survives_a_render_failure(self):
        # The equivalent failure one layer up: a render/hardware-format
        # exception raised inside _async_refresh itself (before it ever
        # reaches the transfer queue) used to escape _async_refresh_loop as
        # an unretrieved task exception with no display address attached.
        # The loop must log it and keep its bookkeeping consistent so the
        # next scheduled refresh - not a wedged one - gets a real chance.
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
        attempts = []

        async def failing_refresh(current_address):
            attempts.append(current_address)
            raise ValueError("boom")

        manager._async_refresh = failing_refresh

        asyncio.run(manager._async_refresh_loop(address))

        self.assertEqual([address], attempts)
        self.assertNotIn(address, manager._pending_refreshes)
        self.assertIn(address, manager._last_refresh_at)

    def test_async_refresh_gives_up_on_a_render_that_never_returns(self):
        # A real incident: automatic refresh for every configured display went
        # completely silent for hours after one successful write, with nothing
        # logged anywhere. async_render_preview dispatches rendering (including
        # the resvg SVG rasteriser used for live text bindings) to an executor
        # thread with no bound on how long that can take - a render that never
        # returns there used to hang this address's refresh task forever, and
        # _schedule_refresh's own "already have an active task" guard then
        # silently refused every future attempt for that display too.
        # RENDER_TIMEOUT_SECONDS must cut a stuck render off instead of letting
        # it hang the task (and this display's automatic refresh) forever.
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager._configs = {
            address: {"enabled": True, "bindings": [], "sdk_type": 46}
        }

        async def never_returns(_address, _config):
            await asyncio.sleep(3600)

        manager.async_render_preview = never_returns

        original_timeout = automation.RENDER_TIMEOUT_SECONDS
        automation.RENDER_TIMEOUT_SECONDS = 0.05
        try:
            with self.assertRaises(RuntimeError):
                asyncio.run(manager._async_refresh(address))
        finally:
            automation.RENDER_TIMEOUT_SECONDS = original_timeout

    def test_series_binding_reads_the_live_timestamped_attribute_series(self):
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)
        manager.hass = types.SimpleNamespace(
            states=_States(
                {
                    "sensor.spot_price": _State(
                        "1.42",
                        **{
                            "2026-08-09T00:00:00+00:00": 1.1,
                            "2026-08-09T01:00:00+00:00": 1.3,
                            "2026-08-09T02:00:00+00:00": 1.2,
                        },
                    )
                }
            )
        )
        manager._chart_series = {}
        bindings = [{"id": "chart", "type": "series", "entity_id": "sensor.spot_price", "maxPoints": 96, "fallback": "[]"}]

        values = manager._current_binding_values("FF:FF:92:81:46:32", bindings)

        self.assertEqual("[1.1,1.3,1.2]", values["chart"])

    def test_series_binding_reads_today_prices_attribute(self):
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)
        manager.hass = types.SimpleNamespace(
            states=_States({"sensor.spot_price": _State("1.42", today_prices=[1.1, 1.3, 1.2])})
        )
        manager._chart_series = {}
        bindings = [{"id": "chart", "type": "series", "entity_id": "sensor.spot_price", "maxPoints": 96, "fallback": "[]"}]

        values = manager._current_binding_values("FF:FF:92:81:46:32", bindings)

        self.assertEqual("[1.1,1.3,1.2]", values["chart"])

    def test_series_binding_falls_back_to_a_missing_entitys_fallback(self):
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)
        manager.hass = types.SimpleNamespace(states=_States({}))
        manager._chart_series = {}
        bindings = [{"id": "chart", "type": "series", "entity_id": "sensor.missing", "fallback": "[1,2,3]"}]

        values = manager._current_binding_values("FF:FF:92:81:46:32", bindings)

        self.assertEqual("[1.0,2.0,3.0]", values["chart"])

    def test_forecast_binding_calls_weather_get_forecasts_for_its_entity(self):
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(states=_States({}), async_add_executor_job=executor)
        manager._chart_series = {}
        captured = {}

        async def fake_forecast_days(_hass, entity_id, count):
            captured["entity_id"] = entity_id
            captured["count"] = count
            return [{"label": "PÁ", "condition": "sunny", "value": "22°"}]

        original = automation._async_forecast_days
        automation._async_forecast_days = fake_forecast_days
        try:
            asyncio.run(
                manager.async_render_preview(
                    "FF:FF:92:81:46:32",
                    {
                        "base_image": "",
                        "svg_template": "",
                        "bindings": [
                            {"id": "strip", "type": "forecast", "entity_id": "weather.home", "days": 4}
                        ],
                    },
                )
            )
        finally:
            automation._async_forecast_days = original

        self.assertEqual("weather.home", captured["entity_id"])
        self.assertEqual(4, captured["count"])

    def test_calendar_binding_calls_calendar_get_events_for_its_entity_and_index(self):
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(states=_States({}), async_add_executor_job=executor)
        manager._chart_series = {}
        captured = {}

        async def fake_calendar_entry(_hass, entity_id, index):
            captured["entity_id"] = entity_id
            captured["index"] = index
            return {"day": "24", "month": "KVĚ", "title": "Narozeniny", "detail": "celý den"}

        original = automation._async_calendar_entry
        automation._async_calendar_entry = fake_calendar_entry
        try:
            asyncio.run(
                manager.async_render_preview(
                    "FF:FF:92:81:46:32",
                    {
                        "base_image": "",
                        "svg_template": "",
                        "bindings": [
                            {"id": "event-1", "type": "calendar", "entity_id": "calendar.family", "index": 1}
                        ],
                    },
                )
            )
        finally:
            automation._async_calendar_entry = original

        self.assertEqual("calendar.family", captured["entity_id"])
        self.assertEqual(1, captured["index"])

    def test_calendar_kind_text_binding_reads_the_first_events_title(self):
        # birthdays.js's "Jméno z kalendáře" is a plain text binding
        # (type text, not day()/event()) classified as kind "calendar" - a
        # manual send special-cases that kind to the first upcoming event's
        # title instead of the calendar entity's own on/off state
        # (_templateDisplayValue). Without this, _state_value had no way to
        # tell it apart from any other text binding and printed "on".
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(
            states=_States({"calendar.rodina": _State("on")}), async_add_executor_job=executor
        )
        manager._chart_series = {}
        captured = {}
        captured_values = {}

        async def fake_calendar_entry(_hass, entity_id, index):
            captured["entity_id"] = entity_id
            captured["index"] = index
            return {"day": "27", "month": "KVĚ", "title": "Lucie", "detail": ""}

        original_entry = automation._async_calendar_entry
        original_render = automation.render_automatic_refresh_image
        automation._async_calendar_entry = fake_calendar_entry

        def fake_render(_base_image, _svg_template, _clean_background, _bindings, values):
            captured_values.update(values)
            return None

        automation.render_automatic_refresh_image = fake_render
        try:
            asyncio.run(
                manager.async_render_preview(
                    "FF:FF:92:81:46:32",
                    {
                        "base_image": "",
                        "svg_template": "",
                        "bindings": [
                            {
                                "id": "name",
                                "type": "text",
                                "kind": "calendar",
                                "entity_id": "calendar.rodina",
                                "fallback": "Lucie",
                            }
                        ],
                    },
                )
            )
        finally:
            automation._async_calendar_entry = original_entry
            automation.render_automatic_refresh_image = original_render

        self.assertEqual("calendar.rodina", captured["entity_id"])
        self.assertEqual(0, captured["index"])
        self.assertEqual("Lucie", captured_values["name"])

    def test_calendar_kind_text_binding_keeps_the_fallback_without_an_event(self):
        # Same as a manual send: no upcoming event falls back to the
        # binding's own fallback text, never the entity's raw on/off state -
        # this has to hold even though the synchronous pass earlier in
        # async_render_preview already computed (and must be overwritten
        # away from) _state_value's "on" for this same binding.
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(
            states=_States({"calendar.rodina": _State("on")}), async_add_executor_job=executor
        )
        manager._chart_series = {}
        captured_values = {}

        async def empty_calendar_entry(_hass, _entity_id, _index):
            return {}

        original_entry = automation._async_calendar_entry
        original_render = automation.render_automatic_refresh_image
        automation._async_calendar_entry = empty_calendar_entry

        def fake_render(_base_image, _svg_template, _clean_background, _bindings, values):
            captured_values.update(values)
            return None

        automation.render_automatic_refresh_image = fake_render
        try:
            asyncio.run(
                manager.async_render_preview(
                    "FF:FF:92:81:46:32",
                    {
                        "base_image": "",
                        "svg_template": "",
                        "bindings": [
                            {
                                "id": "name",
                                "type": "text",
                                "kind": "calendar",
                                "entity_id": "calendar.rodina",
                                "fallback": "Lucie",
                            }
                        ],
                    },
                )
            )
        finally:
            automation._async_calendar_entry = original_entry
            automation.render_automatic_refresh_image = original_render

        self.assertEqual("Lucie", captured_values["name"])


class AutomaticGatewayRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_unconfirmed_display_uses_reliable_full_automatic_write(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(
            async_add_executor_job=executor,
            gateway_preferences={address: "local"},
        )
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
            routes = await manager._async_gateway_routes("ff:ff:92:81:46:32")
            route = await manager._async_best_gateway_route("ff:ff:92:81:46:32")
            cached_route = await manager._async_best_gateway_route("FF:FF:92:81:46:32")
        finally:
            automation.async_load_gateways = original_load
            automation.async_scan_gateway = original_scan

        self.assertEqual("office", route["id"])
        self.assertEqual(["office", "workshop"], [item["id"] for item in routes])
        self.assertEqual("Gateway kancelář", route["name"])
        self.assertEqual(-48, route["rssi"])
        self.assertEqual(route, cached_route)
        self.assertCountEqual(["workshop", "office"], scan_calls)

    async def test_uses_recent_discovery_route_when_short_scan_misses_display(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager.hass = types.SimpleNamespace(
            data={
                "dratek_eink.discovery_cache": {
                    address: {
                        "last_seen_at": time.time(),
                        "paths": [
                            {
                                "type": "gateway",
                                "id": "office",
                                "name": "Gateway kancelář",
                                "rssi": -51,
                            }
                        ],
                    }
                }
            }
        )
        manager._gateway_route_cache = {}
        manager._gateway_route_cache_at = 0.0
        manager._gateway_route_lock = asyncio.Lock()

        async def load_gateways(_hass):
            return [{"id": "office", "name": "Gateway kancelář"}]

        async def scan_gateway(_hass, _gateway_id, _seconds):
            return {"ok": True, "devices": []}

        original_load = automation.async_load_gateways
        original_scan = automation.async_scan_gateway
        automation.async_load_gateways = load_gateways
        automation.async_scan_gateway = scan_gateway
        try:
            routes = await manager._async_gateway_routes(address)
        finally:
            automation.async_load_gateways = original_load
            automation.async_scan_gateway = original_scan

        self.assertEqual(
            [
                {
                    "id": "office",
                    "name": "Gateway kancelář",
                    "rssi": -51.0,
                    "temporarily_unseen": True,
                }
            ],
            routes,
        )

    async def test_fresh_gateway_outranks_stronger_retained_gateway_like_connection_map(self):
        address = "FF:FF:92:81:46:32"
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager.hass = types.SimpleNamespace(
            data={
                "dratek_eink.discovery_cache": {
                    address: {
                        "last_seen_at": time.time(),
                        "paths": [
                            {
                                "type": "gateway",
                                "id": "old-strong",
                                "name": "Stará silnější gateway",
                                "rssi": -35,
                            }
                        ],
                    }
                }
            }
        )
        manager._gateway_route_cache = {}
        manager._gateway_route_cache_at = 0.0
        manager._gateway_route_lock = asyncio.Lock()

        async def load_gateways(_hass):
            return [
                {"id": "fresh", "name": "Aktuální gateway"},
                {"id": "old-strong", "name": "Stará silnější gateway"},
            ]

        async def scan_gateway(_hass, gateway_id, _seconds):
            devices = (
                [{"address": address, "rssi": -62}]
                if gateway_id == "fresh"
                else []
            )
            return {"ok": True, "devices": devices}

        original_load = automation.async_load_gateways
        original_scan = automation.async_scan_gateway
        automation.async_load_gateways = load_gateways
        automation.async_scan_gateway = scan_gateway
        try:
            routes = await manager._async_gateway_routes(address)
        finally:
            automation.async_load_gateways = original_load
            automation.async_scan_gateway = original_scan

        self.assertEqual(["fresh", "old-strong"], [route["id"] for route in routes])
        self.assertFalse(routes[0].get("temporarily_unseen", False))
        self.assertTrue(routes[1]["temporarily_unseen"])

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
        manager._async_gateway_routes = lambda _address: asyncio.sleep(
            0,
            result=[{"id": "office", "name": "Gateway kancelář", "rssi": -48}],
        )
        submitted = {}

        class _Queue:
            async def async_submit(self, **kwargs):
                submitted.update(kwargs)
                return await kwargs["runner"](lambda _line: None)

            async def async_submit_gateway_routes(self, **kwargs):
                route = kwargs["routes"][0]
                submitted.update(kwargs)
                submitted["resource"] = f"gateway:{route['id']}"
                submitted["transport_name"] = route["name"]
                return await kwargs["runner_factory"](route)(lambda _line: None)

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

        manager.hass = types.SimpleNamespace(
            async_add_executor_job=executor,
            gateway_preferences={address: "workshop"},
        )
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


class CzechNumberFormattingTests(unittest.TestCase):
    """A manual send formats every numeric value through
    Intl.NumberFormat("cs-CZ", ...), which uses a comma decimal separator -
    _state_value used to just str()-format the raw value, printing a Python
    float's decimal point ("21.4 °C") where a manual send shows the Czech
    comma ("21,4 °C") for the exact same reading."""

    def test_format_czech_number_uses_comma_and_trims_padding(self):
        cases = [
            (21.4, "21,4"), (21.0, "21"), (100, "100"), (21.456, "21,46"),
            ("21.4", "21,4"), (0, "0"), (-0.5, "-0,5"), (2.35, "2,35"),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(expected, automation._format_czech_number(value))

    def test_format_czech_number_passes_through_non_numeric_values(self):
        self.assertEqual("sunny", automation._format_czech_number("sunny"))

    def test_state_value_formats_a_temperature_attribute_with_a_czech_comma(self):
        state = _State("partlycloudy", temperature=21.4, temperature_unit="°C")
        binding = {"entity_attribute": "temperature", "value_suffix": " °C"}
        self.assertEqual("21,4 °C", automation.EntityAutoUpdateManager._state_value(state, binding))


class StateWordTranslationTests(unittest.TestCase):
    """A manual send reads Home-Assistant-internal states ("sunny",
    "not_home", "on") as Czech words (_templateStateWords in
    panel-devices.mixin.js). Nothing on the backend did that before - an
    automatic refresh's text binding just formatted state.state raw, which
    is why the weather template's condition caption showed "sunny" instead
    of "Jasno" during an automatic refresh."""

    def test_weather_condition_is_translated(self):
        self.assertEqual("Jasno", automation._state_words("weather.home", _State("sunny"), ""))
        self.assertEqual("Polojasno", automation._state_words("weather.home", _State("partlycloudy"), ""))
        self.assertEqual("", automation._state_words("weather.home", _State("made-up-condition"), ""))

    def test_lock_switch_and_light_states_are_translated(self):
        self.assertEqual("Zamčeno", automation._state_words("lock.front_door", _State("locked"), ""))
        self.assertEqual("Odemčeno", automation._state_words("lock.front_door", _State("unlocked"), ""))
        self.assertEqual("Zapnuto", automation._state_words("switch.socket", _State("on"), ""))
        self.assertEqual("Vypnuto", automation._state_words("light.lamp", _State("off"), ""))

    def test_person_reads_status_unless_kind_asks_for_the_name(self):
        self.assertEqual("Doma", automation._state_words("person.vilda", _State("home"), ""))
        self.assertEqual("Pryč", automation._state_words("person.vilda", _State("not_home"), ""))
        self.assertEqual(
            "Vilda",
            automation._state_words("person.vilda", _State("home", friendly_name="Vilda"), "person_name"),
        )

    def test_binary_sensor_uses_device_class_first_then_kind(self):
        self.assertEqual("Otevřeno", automation._state_words("binary_sensor.door", _State("on", device_class="door"), ""))
        self.assertEqual("Klid", automation._state_words("binary_sensor.hall", _State("off", device_class="motion"), ""))
        # No device_class on the entity - falls back to the slot's own kind.
        self.assertEqual("Pohyb", automation._state_words("binary_sensor.generic", _State("on"), "motion"))
        self.assertEqual("Ano", automation._state_words("binary_sensor.generic", _State("on"), ""))

    def test_plain_sensor_is_not_translated(self):
        self.assertEqual("", automation._state_words("sensor.temperature", _State("21.5"), ""))

    def test_state_value_keeps_a_template_literals_static_label_around_a_translated_word(self):
        # security.js writes `Dveře · ${v(1, "Zamčeno")}` - one <text> run
        # combining a static label with the bound value. The captured
        # binding carries that label as value_prefix; _state_value has to
        # wrap it around the word-translated result ("Zavřeno"), not just
        # the plain-number tail, or the label silently disappears on an
        # automatic refresh even though a manual send showed it.
        state = _State("off", device_class="door")
        binding = {"type": "text", "entity_id": "binary_sensor.dvere", "kind": "", "value_prefix": "Dveře · "}
        self.assertEqual("Dveře · Zavřeno", automation.EntityAutoUpdateManager._state_value(state, binding))

    def test_state_value_applies_translation_only_to_plain_text_bindings(self):
        # A "layered" binding reuses _state_value for its __selection__ (which
        # layer id to show) - that must keep reading the raw state to match a
        # layer's own id, or a switch bound to layer ids "on"/"off" would
        # never match anything once "on" became "Zapnuto".
        weather_state = _State("sunny")
        text_binding = {"type": "text", "entity_id": "weather.home", "kind": "weather"}
        layered_binding = {"type": "layered", "entity_id": "switch.socket"}
        self.assertEqual("Jasno", automation.EntityAutoUpdateManager._state_value(weather_state, text_binding))
        switch_state = _State("on")
        self.assertEqual("on", automation.EntityAutoUpdateManager._state_value(switch_state, layered_binding))


class GraphicBindingResolutionTests(unittest.TestCase):
    """Direct coverage of the module-level series()/ratio()/day()/event()
    resolvers, independent of the EntityAutoUpdateManager plumbing above."""

    def test_ratio_percent_clamps_and_applies_divisor(self):
        self.assertEqual(50.0, automation._ratio_percent(_State("50"), 1))
        self.assertEqual(100.0, automation._ratio_percent(_State("150"), 1))  # clamped at 100 first
        self.assertEqual(0.0, automation._ratio_percent(_State("-10"), 1))
        self.assertEqual(25.0, automation._ratio_percent(_State("50"), 2))
        self.assertEqual(0.0, automation._ratio_percent(None, 1))
        self.assertEqual(0.0, automation._ratio_percent(_State("unavailable"), 1))

    def test_series_numbers_reads_timestamped_attributes_first(self):
        state = _State(
            "ignored",
            **{
                "2026-08-09T02:00:00+00:00": 3,
                "2026-08-09T00:00:00+00:00": 1,
                "2026-08-09T01:00:00+00:00": 2,
                "not_a_timestamp": 99,
            },
        )
        self.assertEqual([1.0, 2.0, 3.0], automation._series_numbers(state, 96))

    def test_series_numbers_falls_back_to_the_values_attribute(self):
        state = _State("ignored", values=[5, 6, 7])
        self.assertEqual([5.0, 6.0, 7.0], automation._series_numbers(state, 96))

    def test_series_numbers_respects_max_points(self):
        state = _State("ignored", values=list(range(10)))
        self.assertEqual([7.0, 8.0, 9.0], automation._series_numbers(state, 3))

    def test_async_forecast_days_extracts_label_condition_and_temperature(self):
        async def fake_call(domain, service, data, target=None, **_kwargs):
            self.assertEqual("weather", domain)
            self.assertEqual("get_forecasts", service)
            self.assertEqual("daily", data.get("type"))
            self.assertEqual("weather.home", target.get("entity_id"))
            return {
                "weather.home": {
                    "forecast": [
                        {"datetime": "2026-08-10T00:00:00+00:00", "condition": "rainy", "temperature": 18.6},
                        {"datetime": "2026-08-11T00:00:00+00:00", "condition": "sunny", "temperature": 25.2},
                        {"datetime": "2026-08-12T00:00:00+00:00", "condition": "cloudy", "temperature": 20.0},
                        {"datetime": "2026-08-13T00:00:00+00:00", "condition": "snowy", "temperature": -1.0},
                        {"datetime": "2026-08-14T00:00:00+00:00", "condition": "windy", "temperature": 15.0},
                    ]
                }
            }

        hass = types.SimpleNamespace(services=types.SimpleNamespace(async_call=fake_call))
        days = asyncio.run(automation._async_forecast_days(hass, "weather.home", 4))

        self.assertEqual(4, len(days))
        self.assertEqual("rainy", days[0]["condition"])
        # Unit on every forecast cell, not just the main reading. render.py's
        # _temperature and the panel's own cells format it identically - an
        # automatic refresh redraws this strip, so a difference would show up
        # as the image changing when nobody changed the design.
        self.assertEqual("19°C", days[0]["value"])
        self.assertTrue(days[0]["label"])

    def test_async_forecast_days_without_entity_id_makes_no_call(self):
        async def fail_call(*_args, **_kwargs):
            raise AssertionError("should not be called without an entity_id")

        hass = types.SimpleNamespace(services=types.SimpleNamespace(async_call=fail_call))
        self.assertEqual([], asyncio.run(automation._async_forecast_days(hass, "", 4)))

    def test_async_forecast_days_tolerates_service_call_failure(self):
        async def failing_call(*_args, **_kwargs):
            raise RuntimeError("integration unavailable")

        hass = types.SimpleNamespace(services=types.SimpleNamespace(async_call=failing_call))
        self.assertEqual([], asyncio.run(automation._async_forecast_days(hass, "weather.home", 4)))

    def test_async_calendar_entry_formats_a_timed_event(self):
        async def fake_call(domain, service, data, target=None, **_kwargs):
            self.assertEqual("calendar", domain)
            self.assertEqual("get_events", service)
            self.assertEqual(21, data.get("duration", {}).get("days"))
            self.assertEqual("calendar.family", target.get("entity_id"))
            return {
                "calendar.family": {
                    "events": [
                        {"start": "2026-08-24T15:00:00+00:00", "summary": "Schůzka", "location": "kancelář"},
                        {"start": "2026-08-25", "summary": "Narozeniny"},
                    ]
                }
            }

        hass = types.SimpleNamespace(services=types.SimpleNamespace(async_call=fake_call))

        first = asyncio.run(automation._async_calendar_entry(hass, "calendar.family", 0))
        self.assertEqual("24", first["day"])
        self.assertEqual("Schůzka", first["title"])
        self.assertIn("kancelář", first["detail"])

        second = asyncio.run(automation._async_calendar_entry(hass, "calendar.family", 1))
        self.assertEqual("25", second["day"])
        self.assertIn("celý den", second["detail"])

    def test_async_calendar_entry_out_of_range_index_returns_empty(self):
        async def fake_call(*_args, **_kwargs):
            return {"calendar.family": {"events": [{"start": "2026-08-24T15:00:00+00:00", "summary": "x"}]}}

        hass = types.SimpleNamespace(services=types.SimpleNamespace(async_call=fake_call))
        self.assertEqual({}, asyncio.run(automation._async_calendar_entry(hass, "calendar.family", 5)))


class SplitLayoutAutomationTests(unittest.TestCase):
    def test_image_cycle_selects_a_pre_rendered_frame_for_the_interval(self):
        manager = automation.EntityAutoUpdateManager.__new__(automation.EntityAutoUpdateManager)

        async def executor(function, *args):
            return function(*args)

        manager.hass = types.SimpleNamespace(async_add_executor_job=executor)
        red = _solid_png_data_url((255, 0, 0))
        black = _solid_png_data_url((0, 0, 0))
        original_time = automation.time.time
        try:
            automation.time.time = lambda: 600
            image = asyncio.run(manager.async_render_preview("AA", {
                "image_cycle": [red, black],
                "image_cycle_interval_seconds": 600,
            }))
        finally:
            automation.time.time = original_time

        self.assertEqual((0, 0, 0), image.convert("RGB").getpixel((0, 0)))

    def test_single_layout_single_template_returns_false(self):
        config = {"layout": "single", "template_ids": ["weather"], "bindings": [{"id": "template-weather-temp-0"}]}
        self.assertFalse(automation.EntityAutoUpdateManager._is_split_or_multi_template_config(config))

    def test_side_by_side_layout_returns_true(self):
        config = {"layout": "side-by-side", "template_ids": ["weather"], "bindings": [{"id": "template-weather-temp-0"}]}
        self.assertTrue(automation.EntityAutoUpdateManager._is_split_or_multi_template_config(config))

    def test_stacked_layout_returns_true(self):
        config = {"layout": "stacked", "template_ids": ["weather"], "bindings": [{"id": "template-weather-temp-0"}]}
        self.assertTrue(automation.EntityAutoUpdateManager._is_split_or_multi_template_config(config))

    def test_large_grid_layouts_return_true(self):
        for layout in ("columns-3", "columns-4", "grid-4", "grid-6", "mixed-5"):
            config = {"layout": layout, "template_ids": ["weather"], "bindings": [{"id": "template-weather-temp-0"}]}
            self.assertTrue(automation.EntityAutoUpdateManager._is_split_or_multi_template_config(config))

    def test_multiple_template_ids_returns_true(self):
        config = {"layout": "single", "template_ids": ["weather", "air"], "bindings": []}
        self.assertTrue(automation.EntityAutoUpdateManager._is_split_or_multi_template_config(config))

    def test_multiple_template_binding_prefixes_returns_true(self):
        config = {
            "layout": "single",
            "bindings": [
                {"id": "template-weather-temp-0"},
                {"id": "template-air-co2-0"},
            ],
        }
        self.assertTrue(automation.EntityAutoUpdateManager._is_split_or_multi_template_config(config))


class SystemAndClimateAutomaticValueTests(unittest.TestCase):
    def test_internal_time_and_date_system_values_resolve_dynamically(self):
        time_binding = {"entity_id": "internal:time", "kind": "time", "fallback": "10:00"}
        date_binding = {"entity_id": "internal:date", "kind": "date", "fallback": "1. ledna"}
        interval_binding = {"entity_id": "internal:interval", "kind": "interval", "fallback": "10:00–11:00"}

        time_val = automation.EntityAutoUpdateManager._state_value(None, time_binding)
        date_val = automation.EntityAutoUpdateManager._state_value(None, date_binding)
        interval_val = automation.EntityAutoUpdateManager._state_value(None, interval_binding)

        self.assertRegex(time_val, r"^\d{2}:\d{2}$")
        self.assertRegex(date_val, r"^\d{1,2}\.\s+[a-zčěšžřšťúůáéíóý]+$")
        self.assertRegex(interval_val, r"^\d{2}:\d{2}–\d{2}:\d{2}$")

    def test_climate_entity_resolves_temperatures_and_action(self):
        class FakeState:
            def __init__(self, state, attributes):
                self.state = state
                self.attributes = attributes

        state = FakeState("heat", {
            "current_temperature": 21.5,
            "temperature": 22.0,
            "hvac_action": "heating",
            "temperature_unit": "°C",
        })

        temp_binding = {"entity_id": "climate.thermostat", "kind": "temperature", "label": "Teplota"}
        target_binding = {"entity_id": "climate.thermostat", "kind": "temperature", "label": "Cílová teplota"}
        action_binding = {"entity_id": "climate.thermostat", "kind": "text", "label": "Výkon topení"}

        self.assertEqual("21,5 °C", automation.EntityAutoUpdateManager._state_value(state, temp_binding))
        self.assertEqual("22 °C", automation.EntityAutoUpdateManager._state_value(state, target_binding))
        self.assertEqual("Topí", automation.EntityAutoUpdateManager._state_value(state, action_binding))

    def test_weather_entity_resolves_temperature_with_unit(self):
        class FakeState:
            def __init__(self, state, attributes):
                self.state = state
                self.attributes = attributes

        state = FakeState("sunny", {
            "temperature": 25.0,
            "temperature_unit": "°C",
        })

        weather_binding = {"entity_id": "weather.home", "kind": "temperature", "label": "Teplota"}
        self.assertEqual("25 °C", automation.EntityAutoUpdateManager._state_value(state, weather_binding))

    def test_weather_entity_resolves_humidity_wind_and_pressure(self):
        class FakeState:
            def __init__(self, state, attributes):
                self.state = state
                self.attributes = attributes

        state = FakeState("sunny", {
            "temperature": 25.0,
            "temperature_unit": "°C",
            "humidity": 46,
            "wind_speed": 12.3,
            "wind_speed_unit": "km/h",
            "pressure": 1013.2,
            "pressure_unit": "hPa",
        })

        humidity_binding = {"entity_id": "weather.home", "kind": "humidity", "label": "Vlhkost"}
        wind_binding = {"entity_id": "weather.home", "kind": "wind_speed", "label": "Vítr"}
        pressure_binding = {"entity_id": "weather.home", "kind": "pressure", "label": "Tlak"}

        self.assertEqual("46 %", automation.EntityAutoUpdateManager._state_value(state, humidity_binding))
        self.assertEqual("12,3 km/h", automation.EntityAutoUpdateManager._state_value(state, wind_binding))
        self.assertEqual("1013,2 hPa", automation.EntityAutoUpdateManager._state_value(state, pressure_binding))


if __name__ == "__main__":
    unittest.main()
