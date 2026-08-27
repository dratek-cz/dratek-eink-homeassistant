"""INTERNAL feature - see PRIVATE-NOTES.md; delete with the rest of it.

The "Logo Drátek" tile is the one entry in the catalog that does not belong to
the display that happens to be open: it clears every known display's automatic
update and its waiting queue jobs, then prints the shop's logo across all of
them. That is destructive and irreversible, so the wiring that keeps it out of
the ordinary assignment path is pinned here rather than left to a reading of
the source.

These tests also stand as the removal checklist's tripwire: they fail loudly if
half the feature is taken out and half is left behind.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
TEMPLATE = PANEL / "templates" / "dratek_logo.js"
MIXIN = PANEL / "panel-brand-logo.mixin.js"


class BrandLogoTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.template = TEMPLATE.read_text(encoding="utf-8")
        self.index = (PANEL / "templates" / "index.js").read_text(encoding="utf-8")
        self.svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")

    def test_the_tile_is_flagged_as_a_broadcast(self) -> None:
        # The flag - not the id - is what the click handlers key on, so a
        # future second broadcast template needs no further wiring.
        self.assertIn("broadcast: true,", self.template)
        self.assertIn("internal: true,", self.template)

    def test_it_is_the_last_tile_in_the_catalog(self) -> None:
        entries = re.search(r"export const DISPLAY_TEMPLATES = \[(.*?)\n\];", self.index, re.S)
        self.assertIsNotNone(entries)
        names = [line.strip().rstrip(",") for line in entries.group(1).splitlines()]
        names = [name for name in names if name and not name.startswith("//")]
        self.assertEqual("dratekLogo", names[-1])

    def test_it_takes_the_whole_panel(self) -> None:
        self.assertIn("pixelPerfect: true", self.template)
        self.assertIn("rows[0]?.brandLogo", self.svg)

    def test_small_panels_get_the_wide_lockup_and_large_ones_the_tall_one(self) -> None:
        self.assertIn("const stacked = h > w || Math.min(w, h) >= 200;", self.template)

    def test_the_lockup_is_the_real_artwork_with_its_own_ordered_dither(self) -> None:
        # Redrawing the mark from type and rectangles printed sharply but was an
        # approximation of a logo, which is the one thing a logo may not be:
        # Arial letterforms and a stroked rectangle standing in for the Eink
        # screen. The integration's own files go through a logo-specific pass:
        # photographic error diffusion bleeds colour across hard boundaries.
        self.assertIn("_blockBrandLogo(row, box) {", self.svg)
        self.assertIn("if (row.brandLogo) return this._blockBrandLogo(row, box);", self.svg)
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("dratek-eink-logo.png", mixin)
        self.assertIn("dratek-eink-header.png", mixin)
        self.assertIn("_renderBrandLogoBitmapAtSize(", mixin)
        self.assertNotIn("_ditherImportedTemplateImageData(", mixin)

    def test_neutral_logo_areas_can_never_receive_red_error(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("Neutral parts of the module are strictly black/white", mixin)
        self.assertNotIn("7 / 16", mixin)
        self.assertNotIn("3 / 16", mixin)
        self.assertNotIn("5 / 16", mixin)

    def test_small_panels_use_the_finer_ordered_cell(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("Math.min(width, height) <= 160", mixin)
        self.assertIn("[0, 8, 2, 10]", mixin)

    def test_wordmark_and_eink_dot_have_semantic_colours(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("Turquoise DRATEK and +/- become black", mixin)
        self.assertIn("dot over the i in Eink", mixin)
        self.assertIn("pixels.data[offset] = 220", mixin)

    def test_letter_edges_are_hard_not_dithered_halos(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("if (alpha < 0.5)", mixin)
        self.assertIn("Math.max(...source) < 48", mixin)
        self.assertIn("context.clearRect(0, 0, width, height)", mixin)

    def test_eink_module_gets_a_target_pixel_outline(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("_outlineBrandLogoModule(pixels, width, height", mixin)
        self.assertIn("insideRoundedRect(x, y, 0)", mixin)
        self.assertIn("!insideRoundedRect(x, y, 1)", mixin)
        self.assertIn("One physical pixel", mixin)

    def test_the_dither_is_produced_for_the_panel_s_own_palette(self) -> None:
        # Handing a three-colour panel the four-colour bitmap prints the yellow
        # as a dirty grey, so the palette is part of the cache key, not an
        # afterthought.
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("this._displayPaletteKey?.(device)", mixin)
        self.assertIn("`${source}:${w}x${h}:${paletteKey}:logo-ordered-5`", mixin)

    def test_the_logo_is_letterboxed_and_never_cropped(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertNotIn('"cover"', mixin)
        self.assertIn('_drawCustomImageFitted(context, this._brandLogoPrepareSource(image), width, height, "contain")', mixin)

    def test_the_catalog_tile_is_not_cached_before_the_bitmap_lands(self) -> None:
        # The thumbnail cache keeps whatever the first pass drew, and the first
        # pass of an asynchronously dithered block is a blank panel - the same
        # trap the meteoradar map fell into, which froze its tile on the
        # placeholder for a whole session.
        self.assertIn('rows.some((row) => row?.brandLogo) && !this._brandLogoDitherEntry?.(', self.svg)

    def test_the_send_path_waits_for_the_bitmap(self) -> None:
        # A broadcast must not go out as a blank panel because the dither had
        # not finished yet.
        self.assertIn("await this._preloadBrandLogoDither?.(rows, slot.w, slot.h);", self.svg)


class BrandLogoBroadcastTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mixin = MIXIN.read_text(encoding="utf-8")
        self.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.panel = (COMPONENT / "frontend" / "dratek-eink-panel.js").read_text(encoding="utf-8")

    def test_the_mixin_is_actually_merged_into_the_panel(self) -> None:
        self.assertIn("panel-brand-logo.mixin.js", self.panel)
        self.assertIn("brandLogoMixin", self.panel)

    def test_a_broadcast_template_never_reaches_the_assignment_flow(self) -> None:
        # Both entry points: the tile's own click handler, and openDisplayTemplate
        # itself - which is also where a drag onto a layout slot lands.
        self.assertEqual(2, self.inspector.count("this._broadcastBrandLogoToAllDisplays?.();"))
        self.assertIn("if (template?.broadcast) {", self.inspector)

    def test_the_slot_conflict_dialog_is_skipped_for_it(self) -> None:
        # A template that occupies no slot cannot conflict with one, and the
        # dialog would ask an unanswerable question.
        broadcast = self.inspector.index('?.broadcast) {')
        conflict = self.inspector.index("if (hasTemplateSlotConflict(templateId)) {", broadcast)
        self.assertLess(broadcast, conflict)

    def test_it_asks_before_doing_anything(self) -> None:
        self.assertIn("if (!confirm(this._brandLogoConfirmationText(targets.length))) return;", self.mixin)
        self.assertIn("Tuto akci nelze vzít zpět.", self.mixin)

    def test_every_known_display_is_a_target_not_only_the_reachable_ones(self) -> None:
        # An unreachable display's transfer is queued and written when it next
        # reports in; nothing is silently skipped.
        self.assertIn("_brandLogoTargets() {", self.mixin)
        self.assertIn("this._result?.devices || []", self.mixin)

    def test_the_automation_and_the_queue_are_cleared_before_the_send(self) -> None:
        body = self.mixin[self.mixin.index("async _broadcastBrandLogoToAllDisplays()"):]
        delete = body.index("await this._brandLogoDeleteAutomation(device.address);")
        cancel = body.index("await this._brandLogoCancelQueuedJobs(device.address);")
        send = body.index("await this._brandLogoSendTo(device, template);")
        self.assertLess(delete, send)
        self.assertLess(cancel, send, "cancelling after the send would cancel our own job")

    def test_only_waiting_jobs_are_cancelled(self) -> None:
        # queue.py refuses to cancel a job that is already "writing": cutting a
        # BLE transfer mid-block leaves the display's controller in RECEIVE.
        self.assertIn('String(job?.status || "") === "queued"', self.mixin)

    def test_the_send_carries_no_automation_so_the_display_stops_refreshing(self) -> None:
        send = self.mixin[self.mixin.index("async _brandLogoSendTo("):]
        send = send[: send.index("\n  },")]
        self.assertNotIn("payload.automation =", send)

    def test_one_display_at_a_time(self) -> None:
        # The transfers share one radio; firing them together only produces
        # contention errors the queue then has to retry through.
        self.assertIn("for (const [index, device] of targets.entries()) {", self.mixin)
        self.assertNotIn("Promise.all(targets", self.mixin)

    def test_one_display_failing_does_not_abandon_the_rest(self) -> None:
        self.assertIn("failures.push(", self.mixin)
        self.assertIn("Logo odesláno na ${sent} z ${targets.length} displejů.", self.mixin)

    def test_each_display_is_rendered_at_its_own_size_and_palette(self) -> None:
        self.assertIn("this._renderingDeviceAddress = device?.address || null;", self.mixin)
        self.assertIn("_brandLogoSendGeometry(device)", self.mixin)


class BrandLogoRemovalNoteTests(unittest.TestCase):
    """Every file the feature touches must be findable from the checklist."""

    def test_the_checklist_exists_and_names_the_moving_parts(self) -> None:
        notes = (ROOT / "PRIVATE-NOTES.md").read_text(encoding="utf-8")
        for name in (
            "dratek_logo.js",
            "panel-brand-logo.mixin.js",
            "_blockBrandLogo",
            "test_brand_logo_broadcast.py",
        ):
            with self.subTest(mentions=name):
                self.assertIn(name, notes)

    def test_every_touched_source_file_points_back_at_the_checklist(self) -> None:
        for path in (
            TEMPLATE,
            MIXIN,
            PANEL / "panel-template-svg.mixin.js",
            PANEL / "panel-devices.mixin.js",
            PANEL / "panel-inspector.mixin.js",
            PANEL / "panel-render-ui.mixin.js",
            PANEL / "panel-i18n.mixin.js",
        ):
            with self.subTest(path=path.name):
                self.assertIn("PRIVATE-NOTES", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
