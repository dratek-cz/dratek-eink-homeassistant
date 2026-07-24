"""Regression tests for entity sources used by automatic display refreshes."""

from __future__ import annotations

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
        "const": {"DOMAIN": "dratek_eink"},
        "gateway": {"async_send_gateway_payload": lambda *_args, **_kwargs: None},
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


class AutomationBindingTests(unittest.TestCase):
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

    def test_widget_attribute_change_schedules_display_refresh(self):
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

    def test_custom_element_edit_updates_binding_and_schedules_display(self):
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

        binding = manager._configs["FF:FF:92:81:46:32"]["bindings"][0]
        self.assertEqual(["FF:FF:92:81:46:32"], affected)
        self.assertEqual(["FF:FF:92:81:46:32"], scheduled)
        self.assertEqual("element-1", binding["custom_element_id"])
        self.assertEqual("switch.socket", binding["entity_id"])
        self.assertEqual({"sensor.power", "switch.socket"}, set(binding["entity_ids"]))
        self.assertEqual("Zapnuto", binding["layers"][0]["objects"][0]["text"])


if __name__ == "__main__":
    unittest.main()
