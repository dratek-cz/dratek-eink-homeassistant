"""Regression tests for projects saved by older frontend versions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    ROOT / "custom_components" / "dratek_eink" / "project_storage.py"
)
SPEC = importlib.util.spec_from_file_location("project_storage", MODULE_PATH)
assert SPEC and SPEC.loader
PROJECT_STORAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROJECT_STORAGE)


class ProjectStorageCompatibilityTests(unittest.TestCase):
    def test_normalizes_numeric_key_device_drafts_and_objects(self) -> None:
        data = PROJECT_STORAGE.normalize_project_data(
            {
                "device_drafts": {
                    "3": {
                        "device_address": "ff:ff:92:81:46:32",
                        "name": "Původní návrh",
                        "objects": {
                            "0": {"id": "obj-1", "type": "text"},
                            "3": {"id": "obj-4", "type": "rect"},
                        },
                    }
                }
            }
        )

        draft = data["device_drafts"]["FF:FF:92:81:46:32"]
        self.assertEqual("Původní návrh", draft["name"])
        self.assertEqual(["obj-1", "obj-4"], [item["id"] for item in draft["objects"]])

    def test_normalizes_legacy_draft_list(self) -> None:
        drafts = PROJECT_STORAGE.normalize_device_drafts(
            [
                {
                    "address": "aa:bb:cc:dd:ee:ff",
                    "objects": [{"id": "obj-1"}],
                },
                None,
            ]
        )

        self.assertIn("AA:BB:CC:DD:EE:FF", drafts)
        self.assertEqual("obj-1", drafts["AA:BB:CC:DD:EE:FF"]["objects"][0]["id"])

    def test_normalizes_custom_element_layers_saved_as_mappings(self) -> None:
        data = PROJECT_STORAGE.normalize_project_data(
            {
                "custom_elements": {
                    "3": {
                        "id": "socket",
                        "name": "Zásuvka",
                        "element_type": "layered",
                        "layers": {
                            "0": {
                                "id": "on",
                                "objects": {
                                    "3": {"id": "icon", "type": "image"}
                                },
                            }
                        },
                        "condition_rules": {
                            "0": {
                                "operator": "is_on",
                                "layer_id": "on",
                            }
                        },
                    }
                }
            }
        )

        element = data["custom_elements"][0]
        self.assertEqual("socket", element["id"])
        self.assertEqual("icon", element["layers"][0]["objects"][0]["id"])
        self.assertEqual("on", element["condition_rules"][0]["layer_id"])

    def test_invalid_sections_do_not_break_the_entire_store(self) -> None:
        data = PROJECT_STORAGE.normalize_project_data(
            {
                "projects": 3,
                "device_drafts": "broken",
                "device_names": ["broken"],
                "custom_elements": None,
            }
        )

        self.assertEqual([], data["projects"])
        self.assertEqual({}, data["device_drafts"])
        self.assertEqual({}, data["device_names"])
        self.assertEqual({}, data["device_gateway_preferences"])
        self.assertEqual([], data["custom_elements"])

    def test_normalizes_manual_gateway_preferences_by_display_address(self) -> None:
        data = PROJECT_STORAGE.normalize_project_data(
            {
                "device_gateway_preferences": {
                    "ff:ff:92:81:46:32": " gateway-office ",
                    "": "ignored",
                    "FF:FF:94:20:10:78": "",
                }
            }
        )

        self.assertEqual(
            {"FF:FF:92:81:46:32": "gateway-office"},
            data["device_gateway_preferences"],
        )

    def test_normalizes_shared_user_template_library(self) -> None:
        data = PROJECT_STORAGE.normalize_project_data(
            {
                "user_templates": {
                    "0": {
                        "id": "user-template-workshop",
                        "title": "Dílna",
                        "editor_elements": {"0": {"id": "shape-1", "type": "rect"}},
                    },
                    "1": {"id": "invalid-template", "title": "Přeskočit"},
                }
            }
        )

        self.assertEqual(["user-template-workshop"], [item["id"] for item in data["user_templates"]])
        self.assertEqual("shape-1", data["user_templates"][0]["editor_elements"][0]["id"])
        self.assertTrue(data["user_templates"][0]["user_created"])


if __name__ == "__main__":
    unittest.main()
