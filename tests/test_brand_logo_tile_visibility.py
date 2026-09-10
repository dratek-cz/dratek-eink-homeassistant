"""Hiding the brand-logo tile must not break a display already using it.

The DRÁTEK logo broadcast is a company tool, not something every installation
wants a button for, so the stable build ships without the catalog tile and the
pre-release ships with it. One flag, BRAND_LOGO_TEMPLATE_VISIBLE, is the whole
difference between the two builds.

The thing that would be easy to get wrong, and that this file exists to stop:
removing the template from DISPLAY_TEMPLATES or DISPLAY_TEMPLATES_BY_ID instead
of from the catalog. Those two are not the grid - they are what turns a
template id into a drawing:

    panel-template-svg.mixin.js  DISPLAY_TEMPLATES.map(entry => [id, design])
    panel-devices.mixin.js       DISPLAY_TEMPLATES_BY_ID[id]?.automation
    panel-brand-logo.mixin.js    DISPLAY_TEMPLATES_BY_ID[BRAND_LOGO_TEMPLATE_ID]

A hundred displays on the shelf already carry this template. Dropping it from
those lookups would leave every one of them unable to render, and would take
the broadcast itself with it - a far worse outcome than an extra tile.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
INDEX = (PANEL / "templates" / "index.js").read_text(encoding="utf-8")


class BrandLogoVisibilityTests(unittest.TestCase):
    def test_the_flag_exists_and_is_a_plain_boolean(self) -> None:
        match = re.search(
            r"export const BRAND_LOGO_TEMPLATE_VISIBLE = (true|false);", INDEX
        )
        self.assertIsNotNone(
            match, "the one switch between the stable and pre-release builds is gone"
        )

    def test_only_the_catalog_is_filtered(self) -> None:
        catalog = INDEX[INDEX.index("export const DISPLAY_TEMPLATE_CATALOG") :]
        catalog = catalog[: catalog.index("export const DISPLAY_TEMPLATES_BY_ID")]
        self.assertIn("BRAND_LOGO_TEMPLATE_VISIBLE", catalog)
        self.assertIn("dratek_logo", catalog)

    def test_the_template_stays_in_the_lists_that_render_it(self) -> None:
        # DISPLAY_TEMPLATES is built from the imported entries; dratekLogo has
        # to still be one of them whatever the flag says.
        listing = INDEX[INDEX.index("export const DISPLAY_TEMPLATES = [") :]
        listing = listing[: listing.index("];")]
        self.assertIn("dratekLogo", listing)
        self.assertNotIn(
            "BRAND_LOGO_TEMPLATE_VISIBLE",
            listing,
            "the flag must not reach DISPLAY_TEMPLATES - see this file's docstring",
        )

        by_id = INDEX[INDEX.index("export const DISPLAY_TEMPLATES_BY_ID") :]
        self.assertNotIn(
            "BRAND_LOGO_TEMPLATE_VISIBLE",
            by_id,
            "the flag must not reach DISPLAY_TEMPLATES_BY_ID - a display already "
            "carrying this template resolves its design through it",
        )

    def test_the_broadcast_still_finds_its_template(self) -> None:
        mixin = (PANEL / "panel-brand-logo.mixin.js").read_text(encoding="utf-8")
        self.assertIn("DISPLAY_TEMPLATES_BY_ID[BRAND_LOGO_TEMPLATE_ID]", mixin)

    def test_the_design_registry_is_built_from_the_unfiltered_list(self) -> None:
        svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.assertIn(
            "DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, () => entry.design(helpers)])",
            svg,
            "the id -> design registry must come from DISPLAY_TEMPLATES, not the catalog",
        )

    def test_the_template_file_is_still_shipped(self) -> None:
        # Hiding is a flag, not a deletion. If this file ever goes, every
        # display already showing the logo loses its design.
        self.assertTrue((PANEL / "templates" / "dratek_logo.js").exists())


if __name__ == "__main__":
    unittest.main()
