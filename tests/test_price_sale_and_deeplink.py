"""Guards for the cenovka sale dialog and the overview card's deep link."""

from __future__ import annotations

import re
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

    def test_sale_values_land_under_the_keys_the_renderer_reads(self) -> None:
        """The dialog's fields have to use the template's own binding keys.

        This is the bug the dialog shipped with. A template variable resolves
        through _templateVariableMeta, whose key is built from the variable's
        index and its label - "price:0-nazev-zbozi", "price:1-cena", ... The
        dialog wrote "price:tag-outline", "price:currency-usd" and the other
        two MDI *icon* names instead, which nothing reads. It read its own keys
        straight back, so the dialog always redisplayed whatever was typed into
        it and the display went on printing the built-in sample. Proven by
        rendering the template with a draft written both ways: only the meta
        keys change the markup.

        Pinned as "derived, never restated": four literals is how it drifted
        apart in the first place.
        """
        source = (FRONTEND / "panel" / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.assertIn('draft.template_config.bindings = { ...(draft.template_config.bindings || {}), ...byKey };', source)
        self.assertIn("const keys = this._priceTemplateBindingKeys();", source)
        self.assertIn("[keys.title]: literal(values.title),", source)
        self.assertIn('"price:sale": isSaleActive,', source)
        # The icon-named keys must not be written any more - reading them back
        # for an older draft is the only place they may still appear.
        self.assertNotIn('"price:tag-outline": values', source)
        self.assertNotIn('"price:currency-usd": values', source)

    def test_typed_values_are_stored_as_literals(self) -> None:
        """A manual value has to carry the "literal:" prefix.

        Without it, both _templateDisplayValue here and _state_value in
        automation.py treat anything containing a dot as an entity id. That is
        not an edge case on a price tag: "I. jakost", "do 15. 9." and any price
        written with a decimal point all have one, and every one of them was
        looked up as an entity, found nothing and printed as blank - while the
        dialog went on showing the text, because it read its own storage back.
        The designer's own "Ruční hodnota" field has always stored values this
        way; the dialog simply did not.
        """
        source = (FRONTEND / "panel" / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.assertIn('const literal = (value) => (String(value ?? "").trim() ? `literal:${String(value).trim()}` : "");', source)
        for field in ("title", "price", "was", "code", "amount", "unitPrice",
                      "origin", "grade", "validity", "lowest", "club"):
            with self.subTest(field=field):
                self.assertRegex(source, rf"\[keys\.{field}\]: literal\(values\.\w+\),")
        # And the dialog shows the text back, not the storage form.
        devices = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn('if (stored.startsWith("literal:")) return stored.slice("literal:".length);', devices)

    def test_the_keys_are_derived_from_the_catalogue(self) -> None:
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn("_priceTemplateBindingKeys() {", source)
        self.assertIn("DISPLAY_TEMPLATES_BY_ID?.price?.catalog?.variables", source)
        self.assertIn("this._templateVariableMeta(variable, index).key", source)
        # And an older draft's icon-named keys are still readable, so reopening
        # the dialog shows what was set up before the fix.
        self.assertIn("_devicePriceSaleField(bindings, key, legacyIcon", source)

    def test_the_variable_order_is_treated_as_permanent(self) -> None:
        """Binding keys carry the variable's index, so order is storage.

        Inserting a variable in the middle silently re-points every later
        variable's saved binding on displays already in the field.
        """
        source = (FRONTEND / "panel" / "templates" / "price.js").read_text(encoding="utf-8")
        self.assertIn("POŘADÍ JE TRVALÉ", source)
        start = source.index("variables: [")
        variables = source[start:source.index("\n    ],", start)]
        expected = [
            "Název zboží", "Cena", "Původní cena", "Kód zboží", "Množství balení",
            "Měrná cena", "Země původu", "Třída jakosti", "Platnost akce",
            "Nejnižší cena za 30 dní", "Klubová cena",
        ]
        found = re.findall(r'\["[a-z-]+", "([^"]+)"\]', variables)
        self.assertEqual(expected, found)

    def test_template_options_travel_with_the_draft(self) -> None:
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn("options: structuredClone(this._displayTemplateOptions || {}),", source)
        self.assertIn("this._displayTemplateOptions = structuredClone(config.options || {});", source)

    def test_dialog_and_badge_read_the_displays_own_draft(self) -> None:
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn("_devicePriceSaleBindings(address)", source)
        self.assertIn("this._devicePriceSaleActive(device.address)", source)

    def test_the_badge_and_the_drawn_tag_read_one_resolver(self) -> None:
        """The AKCE badge and the tag it describes must not disagree.

        They used to walk different stores in different orders, and diverged in
        both directions at once. Turning the switch off in the designer left the
        drawn tag on promotion, because a stale flat `options.sale` in the draft
        outranked the live editor state inside _templateOptionActive. And a sale
        set from a card and then autosaved - which drops that flat key, since
        _projectPayload never writes one - left the badge lit over a tag drawn
        without it, because _templateOptionActive never read
        template_config.options at all. Both reproduced in the panel harness
        before the fix.
        """
        source = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.assertIn("_templateOptionState(template, option, address = \"\") {", source)
        # One resolver, and the two callers both go through it.
        self.assertIn("return this._templateOptionState(template, option);", source)
        self.assertIn('return this._templateOptionState({ id: "price" }, "sale", address);', source)
        resolver = source[source.index("_templateOptionState(template, option"):source.index("_templateOptionActive(template, option)")]
        # Live editor state first, and only for the display the editor has open.
        self.assertIn("if (isSelected && this._displayTemplateOptions?.[key] !== undefined)", resolver)
        # Then the shape a draft is reloaded from, then the pre-0.1.356 flat key.
        self.assertLess(
            resolver.index("draft.template_config?.options?.[key]"),
            resolver.index("draft.options?.[option]"),
        )

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
