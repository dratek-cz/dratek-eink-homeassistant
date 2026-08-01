"""Every panel file must get a new URL when the version changes.

dratek-eink-panel.js is served with the version in its URL, but it pulls in its
mixins with plain relative specifiers, and those requests carry nothing that
changes between releases. A browser was therefore free to keep serving mixins
from an older install: the entry file was current while the mixins - including
panel-constants.js, which holds the version shown in the header - were not. The
panel then reported an old version and ran old code against a new backend.

Putting the version in the static path prefix fixes it at every import depth, so
this test pins the prefix rather than any single ?v= query.
"""

from __future__ import annotations

import ast
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
INIT_SOURCE = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
FRONTEND = COMPONENT / "frontend"


def _without_comment_lines(source: str) -> str:
    # Only whole-line comments are dropped. Trimming to the first "//" anywhere
    # would cut into the panel's CSS template literals, which are full of https://
    # URLs, and could hide the very string this scan looks for.
    return "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith("//")
    )


def _assigned_value(name: str) -> ast.AST:
    tree = ast.parse(INIT_SOURCE)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == name for t in node.targets
        ):
            return node.value
    raise AssertionError(f"{name} is not assigned in __init__.py")


class FrontendCacheBustingTests(unittest.TestCase):
    def test_the_static_path_carries_the_version(self) -> None:
        source = ast.unparse(_assigned_value("PANEL_STATIC_PATH"))
        self.assertIn("PANEL_VERSION", source)

    def test_served_urls_do_not_rely_on_a_query_string(self) -> None:
        # A ?v= query only ever reached the entry file, so relying on one is the
        # bug this module exists to prevent.
        for name in ("OVERVIEW_CARD_MODULE_URL",):
            with self.subTest(constant=name):
                self.assertNotIn("?v=", ast.unparse(_assigned_value(name)))
        module_url = re.search(r"module_url=(f?\"[^\"]*\")", INIT_SOURCE)
        self.assertIsNotNone(module_url, "module_url is not passed to the panel")
        self.assertNotIn("?v=", module_url.group(1))
        self.assertIn("PANEL_STATIC_PATH", module_url.group(1))

    def test_images_and_fonts_are_resolved_relative_to_the_module(self) -> None:
        # _frontendAssetUrl used to build "/dratek_eink_panel/<file>" by hand,
        # which is exactly one segment short of where the files are served once
        # the version moved into the prefix. Every image and font below it 404'd -
        # the header logo disappeared and the bundled Arimo font never loaded -
        # while the panel itself kept working, so nothing pointed at the cause.
        # Resolving against import.meta.url cannot drift from the real mount.
        for path in sorted(FRONTEND.rglob("*.js")):
            with self.subTest(file=path.name):
                self.assertNotIn(
                    "/dratek_eink_panel",
                    _without_comment_lines(path.read_text(encoding="utf-8")),
                    "an asset URL hard-codes the panel root instead of resolving one",
                )
        source = (FRONTEND / "panel" / "panel-render-ui.mixin.js").read_text(encoding="utf-8")
        self.assertIn("import.meta.url", source)

    def test_panel_modules_use_relative_imports_below_that_path(self) -> None:
        # The versioned prefix only helps while every import stays relative to it.
        # An absolute specifier would escape the prefix and become cacheable again.
        pattern = re.compile(r"""^\s*import\s[^;]*?from\s+["']([^"']+)["']""", re.M)
        checked = 0
        for path in sorted(FRONTEND.rglob("*.js")):
            for specifier in pattern.findall(path.read_text(encoding="utf-8")):
                checked += 1
                with self.subTest(file=path.name, specifier=specifier):
                    self.assertTrue(
                        specifier.startswith("./") or specifier.startswith("../"),
                        "absolute import escapes the versioned static path",
                    )
        self.assertGreater(checked, 10, "the import scan stopped finding imports")


if __name__ == "__main__":
    unittest.main()
