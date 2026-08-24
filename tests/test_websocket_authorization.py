"""Every websocket command this integration exposes is admin-only.

Home Assistant does not gate websocket commands by default: any authenticated
user, admin or not, may send any registered command unless the handler carries
``@websocket_api.require_admin``. None of these handlers did, and between them
they enumerate the host's serial ports, run esptool against one, push firmware,
provision Wi-Fi credentials over a serial line and edit the integration's own
gateway configuration.

Registering the panel with ``require_admin=True`` is not a substitute: it only
hides the sidebar entry. The websocket commands are the actual authorization
boundary, so the check lives on them - and this test fails on a new command
that forgets it.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _decorator_names(node: ast.AST) -> list[str]:
    names = []
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        names.append(ast.unparse(target))
    return names


def _command_handlers():
    """Every handler carrying a websocket_command decorator, with its type."""
    for path in sorted(COMPONENT.glob("ws_*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            decorators = _decorator_names(node)
            if "websocket_api.websocket_command" not in decorators:
                continue
            command_type = None
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                if ast.unparse(decorator.func) != "websocket_api.websocket_command":
                    continue
                schema = decorator.args[0]
                if isinstance(schema, ast.Dict):
                    for key, value in zip(schema.keys, schema.values):
                        if isinstance(key, ast.Constant) and key.value == "type":
                            command_type = getattr(value, "value", None)
            yield path.name, node.name, command_type, decorators


class WebsocketAuthorizationTests(unittest.TestCase):
    def test_the_component_still_registers_commands(self):
        # Guards the test itself: an empty sweep must not read as a pass.
        handlers = list(_command_handlers())
        self.assertGreaterEqual(len(handlers), 51)

    def test_every_command_requires_an_admin(self):
        missing = [
            f"{module}:{func} ({command_type})"
            for module, func, command_type, decorators in _command_handlers()
            if "websocket_api.require_admin" not in decorators
        ]
        self.assertEqual(
            [],
            missing,
            "these websocket commands are reachable by any authenticated "
            "non-admin user:\n  " + "\n  ".join(missing),
        )

    def test_require_admin_is_the_outermost_decorator(self):
        # require_admin wraps the handler; websocket_command reads the schema
        # off whatever it is handed. Applied the other way round the schema
        # would be attached to the unwrapped function and lost.
        wrong = [
            f"{module}:{func}"
            for module, func, _command_type, decorators in _command_handlers()
            if decorators and decorators[0] != "websocket_api.require_admin"
        ]
        self.assertEqual([], wrong)

    def test_the_panel_is_registered_admin_only(self):
        source = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        self.assertIn("require_admin=True", source)
        self.assertNotIn("require_admin=False", source)


if __name__ == "__main__":
    unittest.main()
