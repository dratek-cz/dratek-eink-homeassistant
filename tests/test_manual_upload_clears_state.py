"""Every manual write to a display must cancel that display's scheduled refresh.

A manual upload replaces the whole picture on the panel. If the entity automation
configured for the previous design survives, its next tick repaints the display and
silently throws away what the user just sent. send_design cleared it from the
start; send_partial_design, send_text and the send_text service did not, so this
test walks the code and requires it of every image-writing path.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "dratek_eink"

# Queue operations that put a new picture on the panel. rgb_led and flash_identify
# only blink the indicator, so they leave any scheduled refresh alone, and
# entity_update *is* the scheduled refresh.
IMAGE_WRITE_OPERATIONS = {"design", "partial_design", "text", "service_text"}

# Either the shared helper or the manager call it wraps counts as clearing.
CLEARING_CALLS = {"_clear_previous_entity_automation", "async_set_config"}

SEARCHED_MODULES = ("ws_sending.py", "ws_gateways.py", "ws_devices.py", "__init__.py")


def _submitted_operations(node: ast.AST) -> set[str]:
    operations = set()
    for inner in ast.walk(node):
        if not isinstance(inner, ast.Call):
            continue
        name = inner.func.attr if isinstance(inner.func, ast.Attribute) else getattr(inner.func, "id", "")
        if name != "async_submit":
            continue
        for keyword in inner.keywords:
            if keyword.arg == "operation" and isinstance(keyword.value, ast.Constant):
                operations.add(keyword.value.value)
    return operations


def _called_names(node: ast.AST) -> set[str]:
    names = set()
    for inner in ast.walk(node):
        if not isinstance(inner, ast.Call):
            continue
        if isinstance(inner.func, ast.Attribute):
            names.add(inner.func.attr)
        elif isinstance(inner.func, ast.Name):
            names.add(inner.func.id)
    return names


def _image_writing_functions():
    """Yield (module, function name, node) for every path that writes a picture."""
    for module in SEARCHED_MODULES:
        tree = ast.parse((COMPONENT / module).read_text(encoding="utf-8"))
        candidates = [
            node
            for node in ast.walk(tree)
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
            and _submitted_operations(node) & IMAGE_WRITE_OPERATIONS
        ]
        # ast.walk reaches nested functions through their parent, so a handler
        # defined inside async_setup would match twice. Keep only the innermost
        # function that actually performs the submit.
        for node in candidates:
            nested = [
                other
                for other in ast.walk(node)
                if other is not node and other in candidates
            ]
            if nested:
                continue
            yield module, node.name, node


class ManualUploadClearsStateTests(unittest.TestCase):
    def test_every_image_write_path_was_found(self):
        found = {(module, name) for module, name, _node in _image_writing_functions()}
        self.assertEqual(
            {
                ("ws_sending.py", "websocket_send_design"),
                ("ws_sending.py", "websocket_commit_design_upload"),
                ("ws_sending.py", "websocket_send_partial_design"),
                ("ws_sending.py", "websocket_send_text"),
                ("ws_gateways.py", "websocket_send_gateway_design"),
                ("__init__.py", "handle_send_text"),
            },
            found,
        )

    def test_every_image_write_clears_the_scheduled_refresh(self):
        for module, name, node in _image_writing_functions():
            with self.subTest(module=module, handler=name):
                self.assertTrue(
                    _called_names(node) & CLEARING_CALLS,
                    f"{module}:{name} writes an image but never cancels the "
                    "display's scheduled entity refresh, so an automatic update "
                    "can overwrite what was just uploaded.",
                )

    def test_indicator_only_commands_do_not_touch_automation(self):
        # Blinking the LED is not an upload; it must not disable a user's
        # configured automatic refresh as a side effect.
        tree = ast.parse((COMPONENT / "ws_devices.py").read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            if not (_submitted_operations(node) & {"rgb_led", "flash_identify"}):
                continue
            with self.subTest(handler=node.name):
                self.assertFalse(_called_names(node) & CLEARING_CALLS)

    def test_panel_forgets_cached_images_of_the_replaced_design(self):
        source = (
            COMPONENT / "frontend" / "panel" / "panel-devices.mixin.js"
        ).read_text(encoding="utf-8")
        self.assertIn("_forgetCachedDisplayImages(address)", source)
        for cache in (
            "this._devicePreviewImages?.delete(key)",
            "this._devicePreviewRequests?.delete(key)",
            "delete this._ditheredPreviewCache[key]",
            "delete this._ditheredPreviewPending[key]",
        ):
            self.assertIn(cache, source)


if __name__ == "__main__":
    unittest.main()
