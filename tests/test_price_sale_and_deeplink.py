"""Guards for the cenovka sale dialog and the overview card's deep link."""

from __future__ import annotations

import unittest
from pathlib import Path

COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "dratek_eink"
FRONTEND = COMPONENT / "frontend"


class PriceSaleDraftTests(unittest.TestCase):
    def test_sale_is_saved_for_the_card_it_was_opened_from(self) -> None:
        source = (FRONTEND / "panel" / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        apply_block = source[source.index("const applyPriceSale = async") : source.index("[data-price-sale-apply]")]
        # _saveCurrentDeviceDraft() only ever writes _selectedDeviceAddress, so
        # a sale set from a device card was dropped whenever a different
        # display (or none) was open in the editor.
        self.assertNotIn("await this._saveCurrentDeviceDraft", apply_block)
        self.assertIn("this._queueDeviceDraftSave?.(device, draft)", apply_block)

    def test_sale_values_land_in_the_shape_a_draft_is_reloaded_from(self) -> None:
        source = (FRONTEND / "panel" / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.assertIn('draft.template_config.bindings = {', source)
        self.assertIn('"price:tag-outline": values.title,', source)
        self.assertIn('"price:sale": isSaleActive,', source)

    def test_template_options_travel_with_the_draft(self) -> None:
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn("options: structuredClone(this._displayTemplateOptions || {}),", source)
        self.assertIn("this._displayTemplateOptions = structuredClone(config.options || {});", source)

    def test_dialog_and_badge_read_the_displays_own_draft(self) -> None:
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn("_devicePriceSaleBindings(address)", source)
        self.assertIn("this._devicePriceSaleActive(device.address)", source)

    def test_dialog_uses_listeners_instead_of_inline_onclick(self) -> None:
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        # Inline handlers do not survive a strict Content Security Policy.
        self.assertNotIn("onclick=", source)

    def test_live_recalculation_is_bound_on_render_not_from_a_timer(self) -> None:
        source = (FRONTEND / "panel" / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.assertIn('"#priceSaleTitle", "#priceSaleOldPrice", "#priceSaleNewPrice", "#priceSaleCode"', source)


class OverviewDeepLinkTests(unittest.TestCase):
    def test_card_passes_the_clicked_display_to_the_panel(self) -> None:
        source = (FRONTEND / "dratek-eink-overview-card.js").read_text(encoding="utf-8")
        self.assertIn("const address = element.dataset.openPanel", source)
        self.assertIn("?device=${encodeURIComponent(address)}", source)

    def test_panel_opens_the_display_named_in_the_query_string(self) -> None:
        source = (FRONTEND / "dratek-eink-panel.js").read_text(encoding="utf-8")
        self.assertIn('params.get("device")', source)
        self.assertIn("await this._openDisplaySettings(device.address)", source)
        # Consumed once: a later reload must not drag the user back onto it.
        self.assertIn('params.delete("device")', source)

    def test_the_second_display_clicked_is_the_one_that_opens(self) -> None:
        """Open a display, go back, open another - the second one must win.

        The panel used to read the pending address once into a local, and clear
        the slot when that run finished. A click that arrived while the first
        run was still waiting on its scan stored its address, found the deep
        link already in progress and returned - and then the first run threw
        that stored address away and opened its own display instead. From then
        on the panel was showing a display the URL no longer named.
        """
        source = (FRONTEND / "dratek-eink-panel.js").read_text(encoding="utf-8")
        # Re-read every time round, not captured once outside the loop.
        self.assertIn("while (this._pendingDeepLinkAddress) {", source)
        self.assertIn("const address = this._pendingDeepLinkAddress;", source)
        # A newer click seen after the scan restarts the loop rather than
        # falling through to the clear-and-open below it.
        self.assertIn("if (this._pendingDeepLinkAddress !== address) continue;", source)
        self.assertLess(
            source.index("if (this._pendingDeepLinkAddress !== address) continue;"),
            source.index('this._pendingDeepLinkAddress = "";\n        const device'),
        )

    def test_the_pending_address_survives_a_slow_scan(self) -> None:
        """The loop's own logic, run rather than read.

        Transcribed from _applyPendingDeepLink; `scan` standing in for the
        await that the second click lands in the middle of.
        """
        opened: list[str] = []
        pending = {"address": "AA"}
        clicked_again = {"done": False}

        def scan() -> None:
            # The user clicks a second display while the first scan is running.
            if not clicked_again["done"]:
                clicked_again["done"] = True
                pending["address"] = "BB"

        known: set[str] = set()
        while pending["address"]:
            address = pending["address"]
            if address not in known:
                scan()
                known.add(address)
            if pending["address"] != address:
                continue
            pending["address"] = ""
            opened.append(address)

        # Only the display the user actually asked for last, and only once.
        self.assertEqual(["BB"], opened)


class NameDayCalendarTests(unittest.TestCase):
    def test_seventh_of_may_is_not_truncated(self) -> None:
        for path in (COMPONENT / "automation.py", FRONTEND / "panel" / "panel-devices.mixin.js"):
            source = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertNotIn('"Stanisla"', source)
                self.assertIn('"Radoslav", "Stanislav", ""', source)


if __name__ == "__main__":
    unittest.main()
