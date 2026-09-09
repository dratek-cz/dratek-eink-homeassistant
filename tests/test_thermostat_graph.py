"""The heating template reads its thermostat, and draws where it has been.

Three things were wrong with it, in increasing order of reach:

1. The dial was `percent: 0.5` with the scale ends written out as "15°"/"28°" -
   a drawing of a gauge, half full whatever the room was doing, over a range no
   thermostat had been asked about.
2. There was no graph at all. A climate.* entity publishes one number for right
   now and keeps no array in its attributes, so `series()` - which every other
   charting template uses - can never find anything on it; the past has to come
   out of the recorder.
3. The `automation` block that tells the backend how to redraw a gauge or a
   chart is declared on the template module, beside `catalog`, but what reaches
   the binding code is a catalog *card* which carries no such field. Every
   ratio and chart binding in the catalog therefore resolved to null, and no
   gauge or chart was ever redrawn by an automatic refresh - each one stayed
   frozen at whatever the manual send drew.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"
TEMPLATE = PANEL / "templates" / "thermostat.js"
DEVICES = PANEL / "panel-devices.mixin.js"
TEMPLATE_SVG = PANEL / "panel-template-svg.mixin.js"
RENDER = COMPONENT / "render.py"
AUTOMATION = COMPONENT / "automation.py"


class AutomationDeclarationsReachTheBindingTests(unittest.TestCase):
    """The regression that froze every gauge and chart in the catalog."""

    def setUp(self) -> None:
        self.devices = DEVICES.read_text(encoding="utf-8")

    def test_the_declaration_is_looked_up_by_id_not_read_off_the_card(self) -> None:
        self.assertIn("DISPLAY_TEMPLATES_BY_ID", self.devices.splitlines()[1])
        self.assertIn("_templateAutomationDeclarations(template) {", self.devices)
        self.assertIn(
            'return DISPLAY_TEMPLATES_BY_ID[id]?.automation || template?.automation || null;',
            self.devices,
        )

    def test_no_branch_still_reads_it_off_the_passed_object(self) -> None:
        # A single survivor is a gauge that silently stops refreshing again.
        self.assertNotIn("template?.automation?.ratio", self.devices)
        self.assertNotIn("template?.automation?.series", self.devices)
        self.assertNotIn("template?.automation?.history", self.devices)

    def test_the_catalog_card_really_does_lack_the_field(self) -> None:
        # This is why the lookup is needed - if the card ever carries it, the
        # comment above the lookup stops being true.
        index = (PANEL / "templates" / "index.js").read_text(encoding="utf-8")
        self.assertIn(
            "export const DISPLAY_TEMPLATE_CATALOG = DISPLAY_TEMPLATES.map((entry) => entry.catalog);",
            index,
        )
        thermostat = TEMPLATE.read_text(encoding="utf-8")
        catalog = thermostat[thermostat.index("catalog: {"): thermostat.index("prepared: true")]
        self.assertNotIn("automation:", catalog)


class LiveDialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.template = TEMPLATE.read_text(encoding="utf-8")
        self.devices = DEVICES.read_text(encoding="utf-8")

    def test_the_fill_is_not_a_constant_any_more(self) -> None:
        design = self.template[self.template.index("design:") :]
        self.assertNotIn("percent: 0.5", design)
        self.assertIn("percent: room.percent", self.template)

    def test_the_scale_is_the_thermostats_own_range(self) -> None:
        # "15°"/"28°" was a guess printed over every thermostat, whatever range
        # it could actually be set to.
        self.assertIn("min: room.minLabel", self.template)
        self.assertIn("max: room.maxLabel", self.template)
        self.assertIn("const min = number(attributes.min_temp) ?? 10;", self.devices)
        self.assertIn("const max = number(attributes.max_temp) ?? 30;", self.devices)

    def test_the_reading_comes_from_the_attribute_not_the_state(self) -> None:
        # A climate entity's state is "heat"/"off" - never a temperature.
        self.assertIn(
            "const current = climate ? number(attributes.current_temperature) : number(state?.state);",
            self.devices,
        )

    def test_the_backend_scales_it_the_same_way(self) -> None:
        automation = AUTOMATION.read_text(encoding="utf-8")
        self.assertIn('def _ratio_percent(state: Any, divisor: float, source: str = "") -> float:', automation)
        self.assertIn('if source == "thermostat":', automation)
        self.assertIn("(current - low) / (high - low) * 100.0", automation)
        # And the declaration travels with the binding, or the backend has no
        # way to know this gauge is not an ordinary numeric one.
        self.assertIn('source: entry.source === "thermostat" ? "thermostat" : "",', self.devices)
        self.assertIn('str(meter.get("source") or "")', automation)

    def test_a_thermostat_dial_matches_by_hand(self) -> None:
        def percent(current, low, high):
            if high - low <= 0:
                return 0.0
            return max(0.0, min(1.0, (current - low) / (high - low)))

        # The numbers a Danfoss head reports: 7-35 range, room at 21.5.
        self.assertAlmostEqual(0.5179, percent(21.5, 7, 35), places=4)
        # A tighter thermostat moves the needle much further for the same room.
        self.assertAlmostEqual(0.65, percent(21.5, 15, 25), places=4)
        # Out of range clamps rather than running off the arc.
        self.assertEqual(1.0, percent(40, 7, 35))
        self.assertEqual(0.0, percent(2, 7, 35))


def _resample(numbers: list[float], points: int) -> list[float]:
    """The bucketing both sides implement, transcribed once here."""
    if len(numbers) <= points:
        return numbers
    out: list[float] = []
    for index in range(points):
        start = (index * len(numbers)) // points
        end = max(start + 1, ((index + 1) * len(numbers)) // points)
        chunk = numbers[start:end]
        out.append(sum(chunk) / len(chunk))
    return out


class HistoryCurveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.template = TEMPLATE.read_text(encoding="utf-8")
        self.devices = DEVICES.read_text(encoding="utf-8")
        self.automation = AUTOMATION.read_text(encoding="utf-8")

    def test_the_template_declares_a_history_chart(self) -> None:
        self.assertIn("history: { variableIndex: 0, hours: 12, points: 24 }", self.template)
        self.assertIn('group: "chart"', self.template)
        self.assertIn("spark: { values: curve", self.template)

    def test_the_panel_asks_the_recorder(self) -> None:
        self.assertIn('type: "history/history_during_period"', self.devices)
        # A climate entity keeps the temperature in an attribute, so the
        # minimal response would come back as a list of "heat".
        self.assertIn("minimal_response: !climate,", self.devices)
        self.assertIn("no_attributes: !climate,", self.devices)

    def test_the_backend_asks_the_same_question(self) -> None:
        self.assertIn("async def _async_history_series(", self.automation)
        self.assertIn("from homeassistant.components.recorder import get_instance, history", self.automation)
        self.assertIn("no_attributes=not climate,", self.automation)
        self.assertIn('binding_type == "history"', self.automation)

    def test_a_missing_recorder_keeps_the_last_curve(self) -> None:
        # An entity excluded from history says nothing; flattening the row to
        # an empty rectangle would be worse than leaving what was drawn.
        self.assertIn(
            'str(binding.get("fallback") or "[]")\n                    if series is None',
            self.automation,
        )

    def test_the_row_is_cleared_and_redrawn_rather_than_left_painted(self) -> None:
        self.assertIn(
            '["text", "ratio", "series", "history", "forecast", "calendar", "transit", "todo"]',
            self.devices,
        )
        self.assertIn(
            'return binding.get("type") in ("series", "ratio", "history", "forecast", "calendar", "transit", "todo")',
            RENDER.read_text(encoding="utf-8"),
        )

    def test_both_sides_bucket_the_recorder_rows_identically(self) -> None:
        """Two copies of one decision, checked against every shape a real
        recorder answer takes - a thermostat that reported twice a minute and
        one that reported twice an hour must give the same shaped curve."""
        import importlib.util
        import sys
        import types

        package = "dratek_thermostat_test"
        if package not in sys.modules:
            module = types.ModuleType(package)
            module.__path__ = [str(COMPONENT)]
            sys.modules[package] = module
        body = re.search(
            r"\ndef _resample_series\(.*?\n    return out\n", self.automation, re.S
        )
        assert body, "automation.py no longer defines _resample_series"
        namespace: dict[str, object] = {}
        exec(compile(body.group(0), "<automation._resample_series>", "exec"), namespace)
        backend = namespace["_resample_series"]

        for count in (2, 5, 23, 24, 25, 47, 96, 720, 1441):
            for points in (8, 24, 48):
                numbers = [float(n % 37) / 3 for n in range(count)]
                with self.subTest(count=count, points=points):
                    self.assertEqual(_resample(numbers, points), backend(list(numbers), points))

    def test_bucketing_never_invents_or_drops_the_range(self) -> None:
        numbers = [float(n) for n in range(1000)]
        out = _resample(numbers, 24)
        self.assertEqual(24, len(out))
        # Every bucket is a mean of real samples, so the curve stays inside the
        # data it came from.
        self.assertGreaterEqual(min(out), min(numbers))
        self.assertLessEqual(max(out), max(numbers))
        # And it keeps its direction: a rising room must not come out flat.
        self.assertEqual(out, sorted(out))

    def test_a_short_series_is_left_alone(self) -> None:
        numbers = [20.1, 20.4, 20.2]
        self.assertEqual(numbers, _resample(numbers, 24))


if __name__ == "__main__":
    unittest.main()
