"""Every websocket command the panel can call must actually be registered.

Release v0.1.131 dropped ten `async_register_command` lines from async_setup while
leaving the handlers and their decorators in place. Nothing failed to import and no
test noticed, so gateway sending, project storage and custom elements stayed dead
for twenty releases. A decorated handler that is not registered is not reachable,
so the two sets have to match.
"""

from __future__ import annotations

import ast
from pathlib import Path
import sys
import unittest

# Works whether the suite is started with `unittest discover -s tests` or as
# `python -m unittest tests.test_websocket_registration`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from websocket_sources import decorated_command_handlers


COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "dratek_eink"
REGISTRATION_SOURCE = (COMPONENT / "websocket.py").read_text(encoding="utf-8")
FRONTEND = COMPONENT / "frontend"


def _module_level_names(assignment: str) -> set[str]:
    """Read a module-level tuple/set of bare names without importing the module."""
    tree = ast.parse(REGISTRATION_SOURCE)
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(
            isinstance(target, ast.Name) and target.id == assignment
            for target in node.targets
        ):
            continue
        value = node.value
        if isinstance(value, ast.Call):  # frozenset({...})
            value = value.args[0]
        return {
            element.id if isinstance(element, ast.Name) else element.value
            for element in value.elts
        }
    raise AssertionError(f"{assignment} is not defined in websocket.py")


class WebsocketRegistrationTests(unittest.TestCase):
    def test_every_decorated_command_is_registered(self) -> None:
        decorated = set(decorated_command_handlers())
        registered = _module_level_names("COMMANDS")
        allowed_missing = _module_level_names("INTENTIONALLY_UNREGISTERED")

        unreachable = decorated - registered - allowed_missing
        self.assertEqual(
            set(),
            unreachable,
            "Handlers are decorated but never registered, so the panel cannot call "
            f"them: {sorted(unreachable)}",
        )

    def test_registration_list_has_no_unknown_or_duplicate_entries(self) -> None:
        tree = ast.parse(REGISTRATION_SOURCE)
        commands = next(
            node.value
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "COMMANDS"
                for target in node.targets
            )
        )
        names = [element.id for element in commands.elts]
        self.assertEqual(sorted(names), sorted(set(names)), "Duplicate registration")
        self.assertLessEqual(set(names), set(decorated_command_handlers()))

    def test_allowlist_only_covers_handlers_the_frontend_never_calls(self) -> None:
        # An entry may stay unregistered only while nothing in the panel needs it.
        handlers = decorated_command_handlers()
        frontend_source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(FRONTEND.rglob("*.js"))
        )
        for name in _module_level_names("INTENTIONALLY_UNREGISTERED"):
            with self.subTest(handler=name):
                command_type = handlers.get(name)
                self.assertIsNotNone(command_type, f"{name} is not a websocket handler")
                self.assertNotIn(
                    f'"{command_type}"',
                    frontend_source,
                    f"{name} is called by the panel but left unregistered",
                )

    def test_commands_the_panel_calls_are_all_reachable(self) -> None:
        # Walk the panel's own callWS types and require a registration for each.
        handlers = decorated_command_handlers()
        registered_types = {
            handlers[name] for name in _module_level_names("COMMANDS")
        }
        frontend_source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(FRONTEND.rglob("*.js"))
        )
        for command_type in sorted(set(handlers.values())):
            if not command_type or f'"{command_type}"' not in frontend_source:
                continue
            with self.subTest(command=command_type):
                self.assertIn(command_type, registered_types)


if __name__ == "__main__":
    unittest.main()
