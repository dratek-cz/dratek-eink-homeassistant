"""In a grid layout every slot must bind its own blocks.

The automation capture tags each graphic block (chart, gauge, forecast
strip, …) with an id so the backend can redraw it with live values. Finding
those blocks across the whole document while counting occurrences per
template made the two disagree: two slots drawing the same block name each
took the first slot's node, so one overwrote the other's id and the later
slot was never tagged at all. Only one template then refreshed and every
other slot went to the display with no values and no chart.

Verified in a live browser before fixing: with the same template in two
slots, the old pairing picked the *same* node for both, in slot 0.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"


class MultiTemplateBindingSlotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")

    def test_each_slot_is_marked_in_the_built_svg(self) -> None:
        # Without the marker there is nothing to scope the search to.
        self.assertIn('<g data-template-slot="${index}"', self.svg)

    def test_block_lookup_is_scoped_to_the_slot(self) -> None:
        self.assertIn(
            'const slotRoot = currentDocument.querySelector(`[data-template-slot="${slotIndex}"]`) || currentDocument;',
            self.devices,
        )
        self.assertIn("slotRoot.querySelectorAll(`[data-template-block=", self.devices)
        # The whole-document lookup must be gone, or the bug is still reachable.
        self.assertNotIn(
            'currentDocument.querySelectorAll(`[data-template-block="${group}"]`)',
            self.devices,
        )

    def test_occurrences_are_counted_per_slot_not_per_template(self) -> None:
        self.assertIn("const occurrenceKey = `${slotIndex}:${group}`;", self.devices)
        self.assertNotIn("const occurrenceKey = `${template.id}:${group}`;", self.devices)

    def test_binding_ids_stay_unique_across_slots(self) -> None:
        # Counting per slot means the same template in two slots would repeat
        # an id unless the slot is part of it - and a duplicate id silently
        # makes the backend substitute only the first occurrence.
        match = re.search(r"binding\.id = `template-\$\{template\.id\}-\$\{group\}-([^`]*)`;", self.devices)
        self.assertIsNotNone(match, "graphic binding id assignment not found")
        self.assertIn("slotIndex", match.group(1), "the slot must be part of the binding id")

    # --- the same rules, for the text runs ---------------------------------
    #
    # The graphic rows above were fixed first; the value text captured for every
    # <text> run was left on the whole document. Placing one template in two
    # slots of a grid therefore produced one set of ids for both, and a
    # duplicate id means the backend substitutes only the first - the second
    # slot went out with none of its values, which on a dashboard tile reads as
    # an empty tile with only the layout's divider lines in it.

    def test_text_runs_are_captured_per_slot(self) -> None:
        self.assertIn("const textsInSlot = (documentNode, slotIndex) => {", self.devices)
        self.assertIn(
            'documentNode.querySelector(`[data-template-slot="${slotIndex}"]`)',
            self.devices,
        )
        # Both sides of the comparison have to be scoped, or the alignment
        # still runs against every run on the panel.
        self.assertIn("const currentTexts = textsInSlot(currentDocument, slotIndex);", self.devices)
        self.assertIn("const markedTexts = textsInSlot(markedDocument, slotIndex);", self.devices)
        for whole_document in (
            'const currentTexts = [...currentDocument.querySelectorAll("text")];',
            'const markedTexts = [...markedDocument.querySelectorAll("text")];',
        ):
            self.assertNotIn(whole_document, self.devices)

    def test_the_text_loop_knows_which_slot_it_is_in(self) -> None:
        # `for (const template of request.templates)` cannot tell two slots
        # holding the same template apart - it has no index to scope by.
        self.assertNotIn("for (const template of request.templates) {", self.devices)
        self.assertIn(
            "for (let slotIndex = 0; slotIndex < request.templates.length; slotIndex += 1) {",
            self.devices,
        )

    def test_text_binding_ids_stay_unique_across_slots(self) -> None:
        line = next(
            line for line in self.devices.splitlines()
            if "const bindingId = `template-" in line
        )
        # Everything after ${meta.key} is what separates one slot's id from
        # another's; without the slot in there the same template placed twice
        # repeats an id.
        tail = line.split("${meta.key}")[1]
        self.assertIn("slotIndex", tail, "the slot must be part of the binding id")
        self.assertTrue(
            line.strip().startswith("const bindingId = `template-"),
            "the id must keep its template- prefix for automation.py",
        )

    def test_the_backend_can_still_read_the_template_id_from_the_id(self) -> None:
        # automation.py's _is_split_or_multi_template_config splits on "-" and
        # reads parts[1] as the template id, so the prefix must stay
        # "template-<id>-".
        automation = (
            ROOT / "custom_components" / "dratek_eink" / "automation.py"
        ).read_text(encoding="utf-8")
        self.assertIn('b_id.startswith("template-")', automation)
        self.assertIn("binding.id = `template-${template.id}-", self.devices)


if __name__ == "__main__":
    unittest.main()
