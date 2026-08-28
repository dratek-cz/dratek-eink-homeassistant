"""Wiring pins for the 1:1 automatic-update path.

The behaviour of the DOM-driven binding extraction can't run without a browser,
so these guard the source: every template variable still yields a slot (the
dropped-value fix), the panel hands the backend the geometry it needs to rebuild
the text, and the backend actually chooses the SVG renderer.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import unittest


ROOT = Path(__file__).resolve().parents[1]


def _node() -> str:
    """Path to the Node.js binary, or skip - these pins execute panel modules.

    A missing binary used to surface as a bare FileNotFoundError from
    subprocess, i.e. an error rather than a skip, which is what kept the suite
    red on machines without Node. Matches the guard the other frontend tests
    already use.
    """
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("Node.js is not available")
    return node
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


class FrontendCaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_slot_is_kept_when_the_marker_is_reformatted_away(self) -> None:
        # The fix: a slot belongs to the variable when overriding it changed the
        # rendered text, not only when the raw marker survives verbatim. The old
        # includes()-only test dropped number/ellipsis/empty slots.
        self.assertIn("const drivenByVariable", self.devices)
        self.assertIn("markedText !== String(currentText?.textContent", self.devices)

    def test_binding_carries_svg_geometry_for_the_backend(self) -> None:
        self.assertIn("svg: {", self.devices)
        for field in ("cx:", "cy:", "maxWidth:", "anchor,", "color: colorHex", "bg: backgroundHex"):
            with self.subTest(field=field):
                self.assertIn(field, self.devices)

    def test_max_width_never_shrinks_the_current_value(self) -> None:
        # svgMaxWidth is at least this run's own text width, so re-rendering the
        # shown value is a no-op fit and stays identical to the manual send.
        self.assertIn("const svgMaxWidth = Math.max(maxWidth", self.devices)


class BackendWiringTests(unittest.TestCase):
    def test_render_exposes_the_svg_path_with_a_covering_rect(self) -> None:
        render = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.assertIn("def render_entity_bound_svg_image(", render)
        self.assertIn("def _svg_text_slot(", render)
        # The slot repaints its background so stale pixels are covered.
        self.assertIn('<rect', render)
        # Fallback forces the captured size instead of PIL autoFit.
        self.assertIn('"autoFit": False', render)

    def test_render_exposes_the_full_template_path(self) -> None:
        # The primary path: substitute fresh values into the captured whole
        # template SVG and rasterise it - no covering rect needed, since the
        # real background (icons, gradients, photos) is simply still there.
        render = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.assertIn("def render_entity_bound_template_image(", render)
        self.assertIn("def _replace_svg_element_by_id(", render)
        self.assertIn("def render_automatic_refresh_image(", render)
        self.assertIn("element_id=element_id,", render)

    def test_automation_delegates_the_render_choice_to_render_py(self) -> None:
        automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        self.assertIn("render_automatic_refresh_image", automation)
        self.assertIn('config.get("svg_template")', automation)

    def test_manifest_requires_the_rasteriser(self) -> None:
        manifest = (COMPONENT / "manifest.json").read_text(encoding="utf-8")
        self.assertIn("resvg-py", manifest)


class CleanBackgroundWiringTests(unittest.TestCase):
    """The value-free background capture: no guessing, no resvg_py dependency."""

    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.template_svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.render = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")

    def test_clean_pass_omits_paintoverlay(self) -> None:
        # paintOverlay is what draws the free-form chart/gauge/signal/slider
        # widgets - never invoking it for this pass is what keeps them (and
        # their stale values) out of the captured background.
        self.assertIn(
            "return await this._rasterizeSvgStringToPng(clone.documentElement.outerHTML, width, height);",
            self.devices,
        )

    def test_blanking_removes_tagged_text_and_camera_nodes(self) -> None:
        self.assertIn("clone.getElementById(elementId)", self.devices)
        self.assertIn('node.removeAttribute("href")', self.devices)
        self.assertIn("node.remove()", self.devices)

    def test_clean_background_is_not_gated_on_text_bindings(self) -> None:
        # svgTemplate is `bindings.length ? ... : ""` (text/camera bindings
        # only) - clean_background must not share that gate, or a chart/gauge-
        # only design (no text bindings at all) would get no clean background.
        self.assertIn(
            "const cleanBackground = await this._blankedDisplayTemplateBackground("
            "currentDocument, bindings, width, height);",
            self.devices,
        )

    def test_rasterise_helper_is_reusable_without_rebuilding_the_svg(self) -> None:
        self.assertIn("async _rasterizeSvgStringToPng(svg, width, height, paintOverlay = null) {", self.template_svg)

    def test_render_exposes_the_clean_background_path(self) -> None:
        self.assertIn("def render_entity_bound_clean_background_image(", self.render)
        self.assertIn("force_transparent", self.render)

    def test_automatic_refresh_prefers_clean_background_first(self) -> None:
        self.assertIn("clean_background: str", self.render)
        self.assertIn("if clean_background:", self.render)

    def test_automation_passes_clean_background_through(self) -> None:
        self.assertIn('config.get("clean_background")', self.automation)


class GraphicRowCaptureTests(unittest.TestCase):
    """series()/ratio()/day()/event() rows (a chart, a gauge, a forecast
    strip, a calendar entry) never produce a <text> node whose content is
    the bound value, so they were invisible to the marker-diffing capture
    above and stayed frozen at whatever a manual send last drew. This is the
    fix: each such row is tagged with a stable `group`, resolved into its
    own binding, and torn out of clean_background the same way text is."""

    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.template_svg = (PANEL / "panel-template-svg.mixin.js").read_text(encoding="utf-8")
        self.render = (COMPONENT / "render.py").read_text(encoding="utf-8")
        self.automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")

    def test_graphic_rows_are_boxed_by_their_group_tag(self) -> None:
        self.assertIn("_templateGraphicRowBoxes(template, width, height) {", self.template_svg)
        self.assertIn("if (!row.group) return;", self.template_svg)

    def test_graphic_row_boxes_measure_the_rows_that_are_actually_drawn(self) -> None:
        # _templateGraphicRowBoxes must lay out the very rows
        # _buildDisplayTemplateSvg draws, which means going through
        # _templateSvgRows. Rows straight out of _templateSvgSpecs carry
        # neither `compact` nor `modern`, and the layout reads both: a compact
        # landscape template is padded by 3 px, a plain one by
        # round(min(w, h) * 0.045) - 6 px on a 296x128 tag. Measuring the wrong
        # one recorded every graphic binding's box three pixels in from where
        # the row was really drawn, so an automatic refresh cleared the wrong
        # rectangle and put the new row slightly off the old one. A departures
        # board showed both at once.
        body = self.template_svg.split("_templateGraphicRowBoxes(template, width, height) {", 1)[1]
        body = body.split("\n  },", 1)[0]
        self.assertIn("this._templateSvgRows(template, width, height)", body)
        self.assertNotIn("_templateSvgSpecs(", body)

    def test_each_graphic_binding_kind_is_resolved(self) -> None:
        self.assertIn("_templateAutomationGraphicBinding(template, group, row, geometry) {", self.devices)
        for marker in (
            'if (group === "forecast")',
            'group.match(/^event-(\\d+)$/)',
            'if (group === "ratio")',
            'if (group === "chart")',
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, self.devices)

    def test_clean_background_tears_out_graphic_bindings_too(self) -> None:
        # Every binding type an automatic refresh redraws has to be torn out of
        # the clean background first, or the old markup stays painted underneath
        # and the new rows are laid on top of it. `transit` was missing, which
        # is exactly how a departures board ended up printed twice, the second
        # copy a few pixels higher than the first.
        self.assertIn(
            '["text", "ratio", "series", "history", "forecast", "calendar", "transit", "todo"].includes(binding.type)',
            self.devices,
        )

    def test_calendar_binding_captures_the_datebox_color(self) -> None:
        # _blockDatebox reads row.datebox.color for its header band and first
        # detail line - without capturing it, an automatic refresh always
        # painted a manual send's coloured date box (calendar.js's event-0)
        # black, since render.py's binding.get("color") had nothing to read.
        self.assertIn('color: row.datebox?.color === "red" ? "red" : "black"', self.devices)

    def test_series_binding_captures_labels_and_highlight(self) -> None:
        # _blockBars reads row.bars.labels/highlight for its tick labels and
        # the current-interval bar (cz_spot_prices.js, energy.js) - neither
        # was captured, so an automatic refresh drew every bar unlabelled
        # and with no bar picked out in red.
        self.assertIn("row.bars?.labels", self.devices)
        self.assertIn("row.bars?.highlight", self.devices)

    def test_representative_templates_declare_their_automation_source(self) -> None:
        # See air.js's comment: by the time a row exists, ratio()/series()
        # have already collapsed to a plain number - there is no trace left
        # of which variable or entity produced it, so each template that
        # uses them declares it explicitly next to design().
        weather = (PANEL / "templates" / "weather.js").read_text(encoding="utf-8")
        self.assertIn('group: "forecast"', weather)
        cz_spot_prices = (PANEL / "templates" / "cz_spot_prices.js").read_text(encoding="utf-8")
        self.assertIn("automation: { series: [{ variableIndex: 1 }] }", cz_spot_prices)
        calendar = (PANEL / "templates" / "calendar.js").read_text(encoding="utf-8")
        # The smallest (price-tag) tier shows a single fixed event and
        # declares it with a literal marker; the larger tiers loop over a
        # variable number of events, so their marker is a template literal
        # computed per index instead of a fixed string.
        self.assertIn('group: "event-0"', calendar)
        self.assertIn('group: `event-${', calendar)
        air = (PANEL / "templates" / "air.js").read_text(encoding="utf-8")
        self.assertIn("automation: { ratio: [{ variableIndex: 0, divisor: 2 }] }", air)

    def test_ratio_claimed_indices_are_excluded_from_the_plain_text_capture(self) -> None:
        # A ratio()-driven row (air.js's dial, living.js's meters, ...) is
        # fully redrawn by its own "ratio" binding, value text included - if
        # the plain v()-marker loop also captured that same <text> node, the
        # number would be painted twice (once precisely, once again as part
        # of the whole row), which is worse than the original stale-value
        # bug this feature was meant to fix.
        self.assertIn("const ratioClaimedIndices = new Set(", self.devices)
        self.assertIn("if (ratioClaimedIndices.has(index)) continue;", self.devices)

    def test_backend_resolves_and_renders_every_new_binding_type(self) -> None:
        for symbol in ("_ratio_value", "_series_value", "_async_forecast_days", "_async_calendar_entry"):
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.automation)
        for symbol in ("_render_bound_ratio", "_render_bound_forecast", "_render_bound_calendar"):
            with self.subTest(symbol=symbol):
                self.assertIn(f"def {symbol}(", self.render)

    def test_text_bindings_carry_their_kind_for_word_translation(self) -> None:
        # A manual send reads "sunny"/"not_home"/"on" as Czech words via
        # _templateStateWords, keyed on the same `kind` the panel already
        # resolves for this slot. Without it riding along on the binding, the
        # backend has no way to tell a word-translated slot from a plain
        # numeric one during an automatic refresh.
        self.assertIn("kind,", self.devices)
        self.assertIn("_state_words(", self.automation)
        self.assertIn('binding.get("type") in (None, "", "text")', self.automation)


class EmptyValueRunAlignmentTests(unittest.TestCase):
    """A value that is empty right now renders no <text> element at all, so
    injecting a marker for it *adds* a run to the document. The capture loop
    used to walk the marked and the current runs by position, so from that
    point on every run compared unequal and was credited to the variable being
    probed - with the geometry of whichever run had shifted into its index. On
    the weather template one unavailable entity handed eleven runs to a single
    entity, eight of them cells of the forecast strip, and an automatic refresh
    then painted that entity's value on top of the days and temperatures the
    strip itself draws. These pin the alignment that replaced the index walk.
    """

    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_source_aligns_runs_instead_of_indexing_them(self) -> None:
        self.assertIn("_alignTemplateTextRuns(markedTexts, currentTexts) {", self.devices)
        self.assertIn(
            "for (const { marked: markedNode, current: currentText } of "
            "this._alignTemplateTextRuns(markedTexts, currentTexts)) {",
            self.devices,
        )
        # The reformatting-slot detection this replaced must still be in force.
        self.assertIn("const drivenByVariable", self.devices)
        self.assertIn("markedText !== String(currentText?.textContent", self.devices)

    def test_source_skips_runs_belonging_to_a_graphic_row(self) -> None:
        # The general form of the ratioClaimedIndices guard: a run inside a
        # series()/ratio()/day()/event() row is redrawn by that row's own
        # binding, so capturing it again paints the value twice.
        self.assertIn('if (currentText.closest?.("[data-template-block]")) continue;', self.devices)

    def test_node_runs_the_real_alignment(self) -> None:
        import subprocess

        script = r"""
        import { devicesMixin as m } from "%s";
        const node = (text) => ({ textContent: text });
        const align = (marked, current) =>
          m._alignTemplateTextRuns.call(m, marked.map(node), current.map(node))
            .map((pair) => [pair.marked?.textContent ?? null, pair.current?.textContent ?? null]);

        const failures = [];
        const check = (label, actual, expected) => {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(`${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
          }
        };

        // The regression: "Stav počasí" is empty, so the marked document has one
        // run the current one does not. Every forecast cell after it must still
        // pair with itself, and the inserted run must pair with nothing.
        check("empty slot must not shift the forecast cells",
          align(["23", "QZ1X", "PÁ", "22°", "SO", "25°"], ["23", "PÁ", "22°", "SO", "25°"]),
          [["23","23"], ["QZ1X",null], ["PÁ","PÁ"], ["22°","22°"], ["SO","SO"], ["25°","25°"]]);

        // The ordinary case still has to pair the changed run with its own node,
        // or a slot that reformats the marker away would stop auto-updating.
        check("a changed run pairs with the run it replaced",
          align(["23", "QZ1X", "PÁ"], ["23", "Polojasno", "PÁ"]),
          [["23","23"], ["QZ1X","Polojasno"], ["PÁ","PÁ"]]);

        check("identical documents pair straight through",
          align(["a", "b"], ["a", "b"]),
          [["a","a"], ["b","b"]]);

        if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
        console.log("ok");
        """ % (COMPONENT / "frontend" / "panel" / "panel-devices.mixin.js").as_uri()
        result = subprocess.run(
            [_node(), "--input-type=module", "-e", script],
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(0, result.returncode, result.stderr)


class AutomaticSlotWordBoundaryTests(unittest.TestCase):
    """weather.js's "Stav počasí" variable was permanently stuck reading its
    own static design-time fallback text - never bindable to an entity, in a
    manual send as much as an automatic refresh - because the "internal
    field" detection in _templateVariableMeta tested a bare substring:
    "čas" also matches inside "poČASí". Node actually runs the fixed
    expression here rather than just asserting it appears in the source, so
    a future edit that reintroduces the substring bug fails this test even
    if the literal text still looks similar.
    """

    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_source_pads_the_label_before_matching(self) -> None:
        self.assertIn('const paddedLabel = ` ${normalized} `;', self.devices)
        self.assertIn("paddedLabel.includes(` ${part} `)", self.devices)

    def test_node_classifies_labels_correctly(self) -> None:
        import subprocess

        script = r"""
        const keywords = ["čas", "datum", "aktualizace", "cenový interval"];
        const automatic = (label) => {
          const normalized = label.toLocaleLowerCase("cs");
          const paddedLabel = ` ${normalized} `;
          return keywords.some((part) => paddedLabel.includes(` ${part} `));
        };
        const cases = {
          "Stav počasí": false,
          "Čas": true,
          "Datum": true,
          "Aktualizace": true,
          "Cenový interval": true,
          "Teplota": false,
        };
        let failures = [];
        for (const [label, expected] of Object.entries(cases)) {
          const actual = automatic(label);
          if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
        }
        if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
        console.log("ok");
        """
        result = subprocess.run([_node(), "-e", script], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)


class TextBindingBoxWidthTests(unittest.TestCase):
    """A right-aligned value near the panel's right edge (a list row's
    number, after its label) used to get maxWidth = centerX - the distance
    back to the panel's *left* edge, hundreds of pixels for a value that
    might only need forty. The backend's PIL tier treats that box as an
    autoFit target it grows text to fill, not just a limit it shrinks to
    avoid - so a short value like "650 ppm" got blown up ~3x during an
    automatic refresh while looking correct on a manual send. Node actually
    runs the fixed formula here, not just source-matches it.
    """

    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")

    def test_source_bounds_maxwidth_by_the_runs_own_text(self) -> None:
        self.assertIn("const currentTextWidth = this._svgTextWidth(currentText, fontSize, bold);", self.devices)
        self.assertIn(
            "const maxWidth = Math.min(geometricMaxWidth, currentTextWidth + Math.max(6, fontSize * 0.3));",
            self.devices,
        )

    def test_node_confirms_a_short_right_anchored_value_gets_a_tight_box(self) -> None:
        import subprocess

        script = r"""
        // Mirrors the fixed formula in _templateAutomationTextBinding
        // (panel-devices.mixin.js) - _svgTextWidth itself needs no DOM (pure
        // glyph-width table), so a fixed stand-in per character is enough to
        // exercise the bounding logic this test actually cares about.
        const svgTextWidth = (text, size) => text.length * size * 0.55;
        const boxWidthFor = (currentText, fontSize, centerX, width) => {
          const geometricMaxWidth = Math.max(1, centerX);
          const currentTextWidth = svgTextWidth(currentText, fontSize);
          const maxWidth = Math.min(geometricMaxWidth, currentTextWidth + Math.max(6, fontSize * 0.3));
          return Math.max(8, Math.min(maxWidth, fontSize * 13));
        };
        // "650 ppm" right-aligned near x=280 on a 296px-wide panel: distance
        // back to the panel origin is ~270px - the old bug's box width.
        const listWidth = boxWidthFor("650 ppm", 11, 280, 296);
        const oldBuggyListWidth = Math.min(280, 11 * 13);
        if (!(listWidth < oldBuggyListWidth * 0.45)) {
          console.error(`list value: expected a much tighter box than the old ${oldBuggyListWidth}px, got ${listWidth}px`);
          process.exit(1);
        }
        if (!(listWidth >= 20 && listWidth <= 60)) {
          console.error(`list value box ${listWidth}px is outside the sane range for "650 ppm" at 11px`);
          process.exit(1);
        }
        // A stat block's own big headline number ("47", two digits at a large
        // captured font) is the case a *multiplicative* margin broke: the
        // margin scales with the already-large font size, so autoFit still
        // had room to grow the number well past what a manual send drew.
        // Two adjacent short lines in the same row (a band's label above its
        // value) sit close enough that even that modest growth was enough to
        // visibly collide with the line above.
        const headlineWidth = boxWidthFor("47", 35, 80, 296);
        const exactWidth = 35 * 2 * 0.55;
        if (!(headlineWidth < exactWidth * 1.35)) {
          console.error(`headline value: expected the box to stay close to the exact text width (${exactWidth}px), got ${headlineWidth}px`);
          process.exit(1);
        }
        console.log("ok", listWidth, headlineWidth);
        """
        result = subprocess.run([_node(), "-e", script], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)


class TemplateLiteralPrefixSuffixTests(unittest.TestCase):
    """security.js writes `Dveře · ${v(1, "Zamčeno")}` - a static prefix and
    a bound value sharing one <text> run. The capture loop used to keep only
    the whole run's *current* text as a fallback and substitute the raw
    resolved value for it wholesale during an automatic refresh, silently
    dropping "Dveře · " - a manual send showed the label, an automatic
    refresh didn't.
    """

    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")

    def test_source_extracts_prefix_and_suffix_around_the_marker(self) -> None:
        self.assertIn("valuePrefix = markedText.slice(0, markerIndex);", self.devices)
        self.assertIn("valueSuffix = markedText.slice(markerIndex + marker.length);", self.devices)
        self.assertIn("value_prefix: valuePrefix,", self.devices)

    def test_node_confirms_the_split_recovers_the_static_label(self) -> None:
        import subprocess

        script = r"""
        const marker = "QZ1X";
        const markedText = "Dveře · " + marker;
        const markerIndex = markedText.indexOf(marker);
        const valuePrefix = markedText.slice(0, markerIndex);
        const valueSuffix = markedText.slice(markerIndex + marker.length);
        if (valuePrefix !== "Dveře · ") { console.error("prefix", valuePrefix); process.exit(1); }
        if (valueSuffix !== "") { console.error("suffix", valueSuffix); process.exit(1); }
        console.log("ok");
        """
        result = subprocess.run([_node(), "-e", script], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_backend_applies_prefix_and_suffix_around_a_word_translated_value(self) -> None:
        # The fix has to cover _state_words' return too, not just the plain
        # formatted-number tail - binary_sensor.dvere resolves through word
        # translation ("off" -> "Zavřeno"), which used to return early and
        # skip prefix/suffix entirely.
        self.assertIn('return f"{prefix}{words}{suffix}"', self.automation)


if __name__ == "__main__":
    unittest.main()
