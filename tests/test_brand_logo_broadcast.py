"""Regression coverage for the built-in Logo Drátek broadcast template.

The "Logo Drátek" tile does not belong to
the display that happens to be open: it clears every known display's automatic
update and its waiting queue jobs, then prints the shop's logo across all of
them. That is destructive and irreversible, so the wiring that keeps it out of
the ordinary assignment path is pinned here rather than left to a reading of
the source.

These tests keep the confirmation and destructive-action ordering explicit.
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
        self.assertNotIn("internal: true,", self.template)

    def test_it_is_registered_and_its_tile_is_switchable(self) -> None:
        # Whether the tile is offered is a build decision now: the stable build
        # ships without it, the pre-release with it. What must not vary is that
        # the template is registered at all - a display already carrying it
        # resolves its design through DISPLAY_TEMPLATES, and so does the
        # broadcast itself. See tests/test_brand_logo_tile_visibility.py.
        self.assertIn("  dratekLogo,", self.index)
        self.assertIn("export const BRAND_LOGO_TEMPLATE_VISIBLE = ", self.index)
        self.assertIn(").map((entry) => entry.catalog);", self.index)

    def test_it_takes_the_whole_panel(self) -> None:
        self.assertIn("pixelPerfect: true", self.template)
        self.assertIn("rows[0]?.brandLogo", self.svg)

    def test_small_panels_get_the_wordmark_and_large_ones_the_whole_lockup(self) -> None:
        # A small tag has no room for the module beside the type; a large or
        # portrait panel does, and there the product picture is the point.
        self.assertIn("const stacked = h > w || Math.min(w, h) >= 200;", self.template)
        self.assertIn('brandLogo: { stacked, band: "yellow" }', self.template)

    def test_four_colour_panels_get_the_yellow_bar(self) -> None:
        # Where every other template closes its page with a red footer. Three
        # colour panels have no yellow pigment and get no bar at all.
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("_brandLogoBandHeight(row, height, device = this._device?.()) {", mixin)
        self.assertIn('if (row?.brandLogo?.band !== "yellow") return 0;', mixin)
        self.assertIn('!== "bwry") return 0;', mixin)

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

    def test_every_panel_size_dithers_the_module(self) -> None:
        """The same logo has to look like the same logo across a shelf.

        There used to be a module height below which the lockup was not
        dithered at all: the screen printed as plain white inside its black
        outline, so a 296x128 tag showed an empty frame while a 800x480 panel
        showed the shading. That switch was the wrong answer to a real problem.
        The small tags did print the screen as a coarse mesh - but because they
        were dithered with a 4x4 cell, not because they were dithered at all.

        The module's grey is RGB 210,210,208, a light tone wanting roughly one
        pixel in six. A 4x4 cell can only place that as one dot per sixteen on a
        hard four-pixel pitch, which is a visible grid; the 8x8 cell spreads
        about eleven dots through sixty-four and reads as a tint at any size.
        Compared side by side at 3x in the panel harness before this changed.
        """
        mixin = MIXIN.read_text(encoding="utf-8")
        # No size threshold, and no way back to a flat half-way decision.
        self.assertNotIn("BRAND_LOGO_MIN_TONAL_MODULE_HEIGHT", mixin)
        self.assertNotIn("_brandLogoModuleIsTonal", mixin)
        self.assertNotIn(": 0.5;", mixin)
        self.assertIn(
            "const thresholdAt = (x, y) => (matrix[y % matrixSize][x % matrixSize] + 0.5) / levels;",
            mixin,
        )
        self.assertIn("this._ditherBrandLogoImageData(pixels, width, height);", mixin)
        # And still not the 4x4 cell, which is the one that actually meshed.
        self.assertNotIn("[0, 8, 2, 10]", mixin)
        self.assertIn("[0, 32, 8, 40, 2, 34, 10, 42]", mixin)

    def test_the_cache_key_changed_with_the_artwork(self) -> None:
        """A cached bitmap outlives the code that produced it.

        _brandLogoDitherCache and the preview both key on this string, so a
        change to how the lockup is drawn that leaves the key alone keeps
        serving the previous rendering until the panel is reloaded.
        """
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertNotIn("logo-flat-6", mixin)
        self.assertNotIn("logo-tonal-7", mixin)
        self.assertNotIn("logo-wordmark-8", mixin)
        self.assertNotIn("logo-ground-9", mixin)
        self.assertIn("logo-solid-10", mixin)

    def test_the_outline_reads_the_module_rectangle(self) -> None:
        """One definition of where the module is.

        The outline is the only reader now that the size threshold is gone; it
        must still derive the rectangle rather than restate the bounds, or the
        black edge drifts off the screen it is supposed to frame.
        """
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("_brandLogoModuleRect(width, height, sourceWidth, sourceHeight) {", mixin)
        self.assertEqual(1, mixin.count("this._brandLogoModuleRect("))

    def test_a_small_tag_prints_the_wordmark_without_the_eink_module(self) -> None:
        """A tag in the customer's hand must not show a picture of a tag.

        Both shipped lockups pair the wordmark with a drawing of the product.
        The wide file - the one a small landscape panel gets - sets the two
        side by side, so the wordmark comes out of the real artwork by a crop
        rather than by redrawing it, which is the rule the whole block keeps.
        """
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("_brandLogoWordmarkCrop(sourceWidth, sourceHeight) {", mixin)
        # The square lockup stacks its module under the wordmark, with no
        # rectangle between them, and a tall panel has room for both.
        self.assertIn("if (sourceWidth === sourceHeight) return null;", mixin)
        self.assertIn("const crop = this._brandLogoWordmarkCrop(sourceWidth, sourceHeight);", mixin)
        # Nothing left to frame once the module is cropped away, and the
        # rectangle would land on the type instead.
        self.assertIn(
            "if (!crop) this._outlineBrandLogoModule(pixels, width, height, sourceWidth, sourceHeight);",
            mixin,
        )

    def test_the_crop_box_matches_the_shipped_wide_artwork(self) -> None:
        """The box is measured in pixels of one specific file.

        Re-exporting dratek-eink-header.png at another size, or moving the
        wordmark inside it, silently crops the logo to the wrong thing - so
        the artwork itself is what this asserts, not the constant.
        """
        from PIL import Image

        mixin = MIXIN.read_text(encoding="utf-8")
        box = re.search(
            r"const box = \{ x: (\d+), y: (\d+), right: (\d+), bottom: (\d+) \};", mixin
        )
        self.assertIsNotNone(box)
        left, top, right, bottom = (int(value) for value in box.groups())
        artwork = Image.open(COMPONENT / "frontend" / "dratek-eink-header.png").convert("RGBA")
        self.assertEqual((1700, 500), artwork.size)
        # The crop keeps every pixel of the wordmark, with the artwork's own
        # 26px optical margin left standing on all four sides.
        wordmark = artwork.crop((left, top, right, bottom))
        self.assertEqual((26, 26, 953, 252), wordmark.getbbox())
        self.assertEqual((26, 26), (right - 953, bottom - top - 252))
        # ...and none of the module, whose own ink starts well to the right.
        self.assertLess(right, 1005)

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
        self.assertIn("`${source}:${w}x${h}:${paletteKey}:", mixin)

    def test_the_logo_is_letterboxed_and_never_cropped(self) -> None:
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertNotIn('"cover"', mixin)
        self.assertIn('_drawCustomImageFitted(context, this._brandLogoPrepareSource(image, crop), width, height, "contain")', mixin)

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
        targets = self.mixin[
            self.mixin.index("_brandLogoTargets() {") : self.mixin.index("_brandLogoSendGeometry(")
        ]
        self.assertNotIn(".slice(", targets)

    def test_the_automation_and_the_queue_are_cleared_before_the_send(self) -> None:
        body = self.mixin[self.mixin.index("async _broadcastBrandLogoToAllDisplays()"):]
        delete = body.index("await this._brandLogoDeleteAutomation(device.address);")
        cancel = body.index("await this._brandLogoCancelAllQueuedJobs(targets);")
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

    def test_every_display_gets_its_queue_entry_before_any_of_them_is_written(self) -> None:
        # The broadcast submits, it does not write. Awaiting each transfer left
        # a hundred-display shelf with only as many queue entries as there are
        # radios - the rest lived in this loop and died with the panel - and it
        # switched off both the queue's hold-for-an-unreachable-display path and
        # the gateway routing that the same flag guards in ws_sending.py.
        send = self.mixin[self.mixin.index("async _brandLogoSendTo("):]
        send = send[: send.index("\n  },")]
        self.assertIn("wait_for_completion: false", send)
        self.assertIn("await this._sendLocalDisplayDesignChunked(payload)", send)
        self.assertNotIn("dratek_eink/gateways/send_design", send)

    def test_the_displays_are_submitted_in_list_order(self) -> None:
        # Serialised, not fanned out: the render is gated anyway, and submitting
        # in order is what makes the queue read in order.
        body = self.mixin[self.mixin.index("async _broadcastBrandLogoToAllDisplays()"):]
        self.assertIn("for (const [index, device] of targets.entries()) {", body)
        self.assertNotIn("Promise.all(", body)
        self.assertNotIn("_brandLogoParallelTransfers", self.mixin)

    def test_one_display_failing_does_not_abandon_the_rest(self) -> None:
        self.assertIn("failures.push(", self.mixin)
        self.assertIn("Logo zařazeno pro ${sent} z ${total} displejů.", self.mixin)

    def test_the_progress_repaint_cannot_end_the_broadcast(self) -> None:
        # It used to sit above the try, so a throw while *drawing* - not while
        # sending - stopped the walk where it stood and the displays after it
        # were never attempted.
        body = self.mixin[self.mixin.index("for (const [index, device] of targets.entries()) {"):]
        body = body[: body.index("reachedEveryDisplay = true;")]
        self.assertLess(body.index("try {"), body.index("this._renderBroadcastProgress();"))
        self.assertLess(body.index("this._renderBroadcastProgress();"), body.index("} catch (error) {"))

    def test_the_broadcast_does_not_walk_the_user_through_the_shelf(self) -> None:
        # _device() answers with _renderingDeviceAddress when one is pushed, so
        # any repaint landing inside _withRenderingDevice draws the whole panel
        # as the display being rasterised. The queue poll and the device poll
        # are both on timers, so during a broadcast they marched the view
        # through a hundred displays.
        mixin = MIXIN.read_text(encoding="utf-8")
        self.assertIn("if (this._renderingDeviceAddress) return;", mixin)
        self.assertIn("_brandLogoProgressAt", mixin)
        ui = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")
        self.assertIn("if (this._brandLogoBroadcasting) return false;", ui)

    def test_the_shelf_is_rescanned_before_the_targets_are_taken(self) -> None:
        # The panel builds its device list from live advertisements, so a
        # freshly opened one knows almost nothing - which is why the first click
        # reached one display and the fourth reached the shelf.
        body = self.mixin[self.mixin.index("async _broadcastBrandLogoToAllDisplays()"):]
        scan = body.index("await this._scan({ background: true })")
        targets = body.index("const targets = this._brandLogoTargets();")
        self.assertLess(scan, targets)
        # And a scan already in flight is waited out, not skipped: _scan returns
        # immediately when one is running, which would leave the same stale list.
        self.assertIn("this._scanInProgress", body[:scan])

    def test_a_broadcast_that_stopped_early_says_so(self) -> None:
        # The old finally block saw an empty failure list and reported success:
        # a run that died at display 47 of 100 read as "queued for all 47".
        self.assertIn("let reachedEveryDisplay = false;", self.mixin)
        outcome = self.mixin[self.mixin.index("_brandLogoBroadcastOutcome(sent, total, failures, reachedEveryDisplay) {"):]
        outcome = outcome[: outcome.index("\n  },")]
        self.assertIn("if (!reachedEveryDisplay) {", outcome)
        self.assertIn("Hromadné odeslání se zastavilo po ${sent} z ${total} displejů.", outcome)
        self.assertIn("ok: false", outcome)

    def test_every_failure_reaches_the_console_and_the_summary_groups_them(self) -> None:
        # Fifty identical errors joined by semicolons is readable by nobody, and
        # the per-display detail a bug report needs has to survive somewhere.
        self.assertIn("console.error(", self.mixin)
        self.assertIn("_brandLogoFailureSummary(failures) {", self.mixin)
        self.assertIn("byReason", self.mixin)

    def test_the_queue_poll_backs_off_while_the_broadcast_runs(self) -> None:
        # A hundred queued jobs with eighty log lines each, pulled and redrawn
        # every second, competes with the broadcast for the same main thread.
        queue_mixin = (PANEL / "panel-queue.mixin.js").read_text(encoding="utf-8")
        self.assertIn("this._brandLogoBroadcasting ? 5000 : 1000", queue_mixin)

    def test_each_display_is_rendered_at_its_own_size_and_palette(self) -> None:
        # A broadcast renders every display in turn, so these scopes overlap.
        # Save-and-restore could not survive that (see _pushRenderingDevice):
        # the scope has to be pushed and popped by identity, or one display's
        # address stays pinned after the broadcast and every later palette
        # lookup - and every draft save - answers for the wrong display.
        # A broadcast renders every display in turn, and the device list
        # renders all of their cards at once, so these scopes both nest and
        # overlap. The ambient rendering device only survives that if the
        # async renders are serialised - see _withRenderingDevice and
        # test_rendering_device_scope.py.
        self.assertIn("this._withRenderingDevice(device?.address", self.mixin)
        self.assertNotIn("this._pushRenderingDevice(", self.mixin)
        self.assertNotIn("this._renderingDeviceAddress =", self.mixin)
        self.assertIn("_brandLogoSendGeometry(device)", self.mixin)


if __name__ == "__main__":
    unittest.main()
