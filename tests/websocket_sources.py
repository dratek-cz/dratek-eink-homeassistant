"""Helpers for reading the websocket layer without importing Home Assistant.

The command handlers used to sit in one websocket.py. They are now grouped into
ws_*.py modules, so tests that inspect the source have to look across all of them
instead of a single file - otherwise they pin the file layout rather than the
behaviour they are meant to protect.
"""

from __future__ import annotations

import ast
from pathlib import Path


COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "dratek_eink"


def websocket_module_paths() -> list[Path]:
    """Every module that makes up the websocket layer, registration file first."""
    return [COMPONENT / "websocket.py", *sorted(COMPONENT.glob("ws_*.py"))]


def websocket_source() -> str:
    """All websocket module sources concatenated, for plain substring checks."""
    return "\n".join(path.read_text(encoding="utf-8") for path in websocket_module_paths())


def find_top_level_function(name: str) -> ast.AST:
    """Return the top-level (async) def with this name from any websocket module."""
    for path in websocket_module_paths():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if (
                isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
                and node.name == name
            ):
                return node
    raise AssertionError(f"{name} is not defined in any websocket module")


def top_level_function_names() -> set[str]:
    """Names of every top-level function across the websocket modules."""
    names: set[str] = set()
    for path in websocket_module_paths():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                names.add(node.name)
    return names


def decorated_command_handlers() -> dict[str, str]:
    """Map handler name -> websocket command type for every decorated handler."""
    handlers: dict[str, str] = {}
    for path in websocket_module_paths():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                if not ast.unparse(decorator.func).endswith("websocket_command"):
                    continue
                schema = decorator.args[0] if decorator.args else None
                command_type = ""
                if isinstance(schema, ast.Dict):
                    for key, value in zip(schema.keys, schema.values, strict=True):
                        if (
                            isinstance(key, ast.Constant)
                            and key.value == "type"
                            and isinstance(value, ast.Constant)
                        ):
                            command_type = value.value
                handlers[node.name] = command_type
    return handlers
