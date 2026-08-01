"""Every global a module uses has to be defined or imported in that module.

Splitting websocket.py into ws_*.py modules moved handlers away from the imports
they relied on. `DOMAIN` was left behind that way: ws_shared.py kept using it, but
nothing imported it there, so saving or loading a project raised NameError at
runtime. Nothing caught it, because these modules cannot be imported in the test
suite - Home Assistant is not installed - and a NameError only surfaces when the
line actually runs.

symtable answers the same question without importing anything: it reports which
names a function resolves in the global scope, and those must exist at module
level.
"""

from __future__ import annotations

import builtins
from pathlib import Path
import symtable
import unittest


COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "dratek_eink"

# Names Home Assistant or the runtime injects rather than the module importing them.
ALLOWED_IMPLICIT = {"__file__", "__name__", "__doc__", "__package__"}


def _globals_without_a_definition(path: Path) -> set[str]:
    """Global names a module reads but never binds at module level."""
    table = symtable.symtable(path.read_text(encoding="utf-8"), str(path), "exec")
    defined = set(table.get_identifiers()) | set(dir(builtins)) | ALLOWED_IMPLICIT
    missing: set[str] = set()

    def walk(scope: symtable.SymbolTable) -> None:
        for child in scope.get_children():
            for symbol in child.get_symbols():
                if symbol.is_global() and symbol.get_name() not in defined:
                    missing.add(symbol.get_name())
            walk(child)

    walk(table)
    return missing


class ModuleNameResolutionTests(unittest.TestCase):
    def test_every_module_defines_the_globals_it_uses(self) -> None:
        for path in sorted(COMPONENT.glob("*.py")):
            with self.subTest(module=path.name):
                self.assertEqual(
                    set(),
                    _globals_without_a_definition(path),
                    f"{path.name} uses these names without importing or defining "
                    "them, so the code path raises NameError when it runs",
                )

    def test_the_check_actually_catches_a_missing_import(self) -> None:
        # Guard against the check silently passing everything, which is how the
        # original registration loss went unnoticed for twenty releases.
        probe = Path(__file__).parent / "_name_resolution_probe.py"
        probe.write_text("def handler():\n    return MISSING_NAME\n", encoding="utf-8")
        try:
            self.assertEqual({"MISSING_NAME"}, _globals_without_a_definition(probe))
        finally:
            probe.unlink()


if __name__ == "__main__":
    unittest.main()
