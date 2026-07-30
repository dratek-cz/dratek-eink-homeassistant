"""Regression tests for entity sources used by automatic display refreshes."""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path
import asyncio
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_automation_test"


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
        "const": {"DOMAIN": "dratek_eink", "LOCAL_ROUTE_ID": "local"},
        "gateway": {
            "async_load_gateways": lambda *_args, **_kwargs: None,
            "async_scan_gateway": lambda *_args, **_kwargs: None,
            "async_send_gateway_payload": lambda *_args, **_kwargs: None,
        },
        "queue": {"get_transfer_queue": lambda _hass: None},
        "render": {"render_entity_bound_image": lambda *_args, **_kwargs: None},
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
    def test_starting_manual_upload_removes_all_previous_automation(self):
        source = (COMPONENT / "websocket.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        clear_function = next(
            node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "_clear_previous_entity_automation"
        )
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

    def test_manual_upload_without_new_bindings_disables_previous_automation(self):
        source = (COMPONENT / "websocket.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        save_function = next(
            node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "_save_entity_automation"
        )
        isolated_module = ast.Module(body=[save_function], type_ignores=[])
        ast.fix_missing_locations(isolated_module)
        calls = []

        class Manager:
            async def async_set_config(self, address, config):
                calls.append((address, config))

        namespace = {
            "Any": object,
            "HomeAssistant": object,
            "get_entity_auto_update_manager": lambda _hass: Manager(),
            "_clear_previous_entity_automation": (
                lambda _hass, address: Manager().async_set_config(address, None)
            ),
        }
        exec(compile(isolated_module, "websocket.py", "exec"), namespace)

        asyncio.run(
            namespace["_save_entity_automation"](
                object(),
                {"address": "ff:ff:92:81:46:32"},
                route_type="local",
            )
        )

        self.assertEqual([("ff:ff:92:81:46:32", None)], calls)

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

    def test_widget_attribute_change_does_not_schedule_in_manual_mode(self):
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

        self.assertEqual([], scheduled)

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


class AutomaticGatewayRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_selects_gateway_with_strongest_display_signal(self):
        manager = automation.EntityAutoUpdateManager.__new__(
            automation.EntityAutoUpdateManager
        )
        manager.hass = object()
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
        manager.hass = object()
        manager._configs = {
            address: {
                "route_type": "gateway",
                "gateway_id": "old-gateway",
                "transport_name": "Stará gateway",
                "sdk_type": 64,
                "bindings": [{"type": "text"}],
            }
        }
        manager.async_render_preview = lambda *_args: asyncio.sleep(0, result=object())
        manager._async_best_gateway_route = lambda _address: asyncio.sleep(
            0,
            result={"id": "office", "name": "Gateway kancelář", "rssi": -48},
        )
        submitted = {}

        class _Queue:
            async def async_submit(self, **kwargs):
                submitted.update(kwargs)
                return await kwargs["runner"](lambda _line: None)

        async def send_gateway(_hass, gateway_id, *_args):
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
        manager.hass = object()
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
        manager.async_render_preview = lambda *_args: asyncio.sleep(0, result=object())
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

        async def send_gateway(_hass, gateway_id, *_args):
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
