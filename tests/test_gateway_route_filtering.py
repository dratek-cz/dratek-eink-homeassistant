"""Regression tests for exclusive, restart-safe display route locks."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE_NAME = "custom_components.dratek_eink"


def _load_component_module(name: str):
    """Load a dependency-free component module without importing HA's package."""
    package = sys.modules.setdefault(PACKAGE_NAME, types.ModuleType(PACKAGE_NAME))
    package.__path__ = [str(COMPONENT)]
    qualified_name = f"{PACKAGE_NAME}.{name}"
    spec = importlib.util.spec_from_file_location(
        qualified_name, COMPONENT / f"{name}.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {qualified_name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[qualified_name] = module
    spec.loader.exec_module(module)
    return module


_load_component_module("const")
paths_allowed_by_gateway_lock = _load_component_module(
    "routing"
).paths_allowed_by_gateway_lock


PATHS = [
    {"type": "local", "id": "local", "name": "Home Assistant Bluetooth"},
    {"type": "gateway", "id": "workshop", "name": "Gateway dílna"},
    {"type": "gateway", "id": "office", "name": "Gateway kancelář"},
]


class GatewayRouteFilteringTests(unittest.TestCase):
    def test_automatic_routing_keeps_every_observed_path(self) -> None:
        self.assertEqual(PATHS, paths_allowed_by_gateway_lock(PATHS, ""))

    def test_gateway_lock_hides_local_and_other_gateway_paths(self) -> None:
        self.assertEqual(
            [{"type": "gateway", "id": "workshop", "name": "Gateway dílna"}],
            paths_allowed_by_gateway_lock(PATHS, "workshop"),
        )

    def test_local_lock_hides_every_gateway_path(self) -> None:
        self.assertEqual(
            [{"type": "local", "id": "local", "name": "Home Assistant Bluetooth"}],
            paths_allowed_by_gateway_lock(PATHS, "local"),
        )

    def test_gateway_id_alias_is_supported(self) -> None:
        paths = [{"type": "gateway", "gateway_id": "workshop"}]
        self.assertEqual(paths, paths_allowed_by_gateway_lock(paths, "workshop"))


if __name__ == "__main__":
    unittest.main()
