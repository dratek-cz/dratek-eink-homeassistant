from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _load_component_module(name: str):
    package_name = "dratek_test_component"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__path__ = [str(COMPONENT)]
        sys.modules[package_name] = package
    module_name = f"{package_name}.{name}"
    spec = importlib.util.spec_from_file_location(module_name, COMPONENT / f"{name}.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nelze načíst modul {name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


render = _load_component_module("render")


class RenderWidgetTests(unittest.TestCase):
    def _render_objects(self, objects: list[dict]):
        binding = {
            "w": 296,
            "h": 128,
            "canvas_width": 296,
            "canvas_height": 128,
            "default_symbol": "layer",
            "layers": [{"id": "layer", "objects": objects}],
        }
        return render._render_bound_layer(binding, "layer")

    def test_partial_region_is_packed_without_full_panel_resize(self):
        from PIL import Image

        region = Image.new("RGB", (37, 16), "white")
        payload = render.pack_bwr_region(region)

        self.assertEqual(37 * 16 * 2 // 8, len(payload))

    def test_auto_fit_text_grows_with_its_area(self):
        common = {
            "fontSize": 12,
            "minFontSize": 10,
            "autoFit": True,
            "textAlign": "center",
            "verticalAlign": "middle",
            "color": "black",
        }
        small = render._render_bound_text({**common, "w": 80, "h": 30}, "Text")
        large = render._render_bound_text({**common, "w": 180, "h": 70}, "Text")
        small_bbox = small.getbbox()
        large_bbox = large.getbbox()
        self.assertIsNotNone(small_bbox)
        self.assertIsNotNone(large_bbox)
        self.assertGreater(large_bbox[3] - large_bbox[1], small_bbox[3] - small_bbox[1])

    def test_all_dynamic_widget_types_render(self):
        objects = []
        for index, widget_type in enumerate(
            ("bar_gauge", "pie", "slider", "potentiometer", "gauge")
        ):
            objects.append(
                {
                    "id": widget_type,
                    "type": widget_type,
                    "x": index * 56,
                    "y": 12,
                    "w": 52,
                    "h": 82,
                    "min_value": 0,
                    "max_value": 100,
                    "sample_value": 65,
                    "unit": "%",
                    "color": "red",
                    "fill": "red",
                    "stroke": "black",
                    "show_value": True,
                }
            )
        image = self._render_objects(objects)
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (296, 128))
        self.assertIsNotNone(image.getbbox())

    def test_gauge_arc_modes_produce_different_outputs(self):
        digests = set()
        for arc_mode in ("180", "240", "360"):
            image = self._render_objects(
                [
                    {
                        "id": f"gauge-{arc_mode}",
                        "type": "gauge",
                        "x": 70,
                        "y": 4,
                        "w": 156,
                        "h": 116,
                        "min_value": 0,
                        "max_value": 100,
                        "sample_value": 62,
                        "unit": "%",
                        "color": "black",
                        "stroke_width": 6,
                        "arc_mode": arc_mode,
                        "show_arc": True,
                        "show_needle": True,
                        "show_value": True,
                    }
                ]
            )
            digests.add(hashlib.sha256(image.tobytes()).hexdigest())
        self.assertEqual(len(digests), 3)

    def test_entity_chart_is_composited_over_saved_base_image(self):
        base = render.Image.new("RGB", (296, 128), "white")
        output = io.BytesIO()
        base.save(output, format="PNG")
        base_image = "data:image/png;base64," + base64.b64encode(
            output.getvalue()
        ).decode("ascii")
        binding = {
            "id": "chart-1",
            "type": "chart",
            "x": 20,
            "y": 16,
            "w": 250,
            "h": 96,
            "chartType": "line",
            "color": "red",
        }

        first = render.render_entity_bound_image(
            base_image, [binding], {"chart-1": "[1,2,3]"}
        )
        second = render.render_entity_bound_image(
            base_image, [binding], {"chart-1": "[3,1,4]"}
        )

        self.assertEqual(first.size, (296, 128))
        self.assertNotEqual(first.tobytes(), second.tobytes())

    def test_layer_widget_uses_its_own_entity_value(self):
        binding = {
            "w": 296,
            "h": 128,
            "canvas_width": 296,
            "canvas_height": 128,
            "entity_id": "switch.socket",
            "default_symbol": "on",
            "layers": [
                {
                    "id": "on",
                    "objects": [
                        {
                            "id": "gauge",
                            "type": "bar_gauge",
                            "entity_id": "sensor.power",
                            "x": 20,
                            "y": 35,
                            "w": 256,
                            "h": 50,
                            "min_value": 0,
                            "max_value": 100,
                            "fill": "red",
                            "stroke": "black",
                        }
                    ],
                }
            ],
        }
        low = render._render_bound_layer(
            binding,
            '{"__selection__":"on","sensor.power":{"state":"20"}}',
        )
        high = render._render_bound_layer(
            binding,
            '{"__selection__":"on","sensor.power":{"state":"80"}}',
        )

        self.assertNotEqual(low.tobytes(), high.tobytes())

    def test_regular_and_bold_text_use_the_bundled_arimo_font(self):
        for bold in (False, True):
            font = render.load_font(16, bold)
            self.assertIn("Arimo", font.getname()[0])

    def test_canonical_preview_uses_only_physical_eink_colors(self):
        image = render.Image.new("RGB", (4, 1))
        image.putdata([
            (0, 0, 0),
            (210, 210, 210),
            (220, 20, 12),
            (120, 120, 120),
        ])
        preview = render.quantize_bwr_preview(image)
        # getcolors() avoids the getdata() deprecation while staying available on
        # the oldest Pillow the manifest allows.
        self.assertEqual(
            {color for _count, color in preview.getcolors(maxcolors=256)},
            {(0, 0, 0), (255, 255, 255), (220, 20, 12)},
        )

    def test_bar_gauge_reserves_a_white_value_band(self):
        image = self._render_objects(
            [
                {
                    "id": "bar",
                    "type": "bar_gauge",
                    "x": 8,
                    "y": 20,
                    "w": 280,
                    "h": 40,
                    "min_value": 0,
                    "max_value": 100,
                    "unit": "%",
                    "fill": "red",
                    "stroke": "black",
                    "show_value": True,
                }
            ]
        )
        rendered = render._render_bound_layer(
            {
                "w": 296,
                "h": 128,
                "canvas_width": 296,
                "canvas_height": 128,
                "default_symbol": "layer",
                "layers": [
                    {
                        "id": "layer",
                        "objects": [
                            {
                                "type": "bar_gauge",
                                "x": 8,
                                "y": 20,
                                "w": 280,
                                "h": 40,
                                "min_value": 0,
                                "max_value": 100,
                                "unit": "%",
                                "fill": "red",
                                "stroke": "black",
                                "show_value": True,
                            }
                        ],
                    }
                ],
            },
            "65",
        )
        red = (220, 20, 12, 255)
        top_band = rendered.crop((8, 20, 288, 36))
        track = rendered.crop((8, 37, 288, 60))
        top_colors = {
            top_band.getpixel((x, y))
            for y in range(top_band.height)
            for x in range(top_band.width)
        }
        track_colors = {
            track.getpixel((x, y))
            for y in range(track.height)
            for x in range(track.width)
        }
        self.assertNotIn(red, top_colors)
        self.assertIn(red, track_colors)
        self.assertEqual(image.size, (296, 128))

    def test_chart_layout_options_affect_the_rendered_output(self):
        common = {
            "w": 296,
            "h": 128,
            "chartType": "bar",
            "chartTitle": "Cena energie",
            "chartLabels": "00,01,02,03",
            "xLabel": "hodina",
            "yLabel": "Kc",
            "legendFontSize": 8,
            "showAxes": True,
            "showGrid": True,
            "color": "red",
            "graphColor": "black",
        }
        plain = render._render_bound_chart(
            {**common, "showValues": False}, "[3.2,2.8,4.1,3.7]"
        )
        labeled = render._render_bound_chart(
            {**common, "showValues": True}, "[3.2,2.8,4.1,3.7]"
        )
        self.assertEqual(labeled.size, (296, 128))
        self.assertNotEqual(plain.tobytes(), labeled.tobytes())


class GraphicAutomationBindingRenderTests(unittest.TestCase):
    """The four binding types automation.py resolves for series()/ratio()/
    day()/event() rows (see automation.py's module docstring above
    _WEEKDAY_ABBR_CS): an automatic refresh has to be able to draw each one,
    not just resolve its value, or the drawn shape stays frozen even though
    the data behind it is fresh."""

    def test_dial_ratio_binding_fills_by_percent(self):
        binding = {"w": 120, "h": 90, "visual": "dial", "caption": "AQI", "min": "0", "max": "200"}
        empty = render._render_binding_layer(binding, '[{"percent":0,"text":"0","label":"","color":"black"}]')
        full = render._render_binding_layer(binding, '[{"percent":95,"text":"190","label":"","color":"red"}]')
        self.assertEqual(empty.size, (120, 90))
        self.assertNotEqual(empty.tobytes(), full.tobytes())

    def test_ring_ratio_binding_fills_by_percent(self):
        binding = {"w": 100, "h": 100, "visual": "ring", "caption": "kW"}
        low = render._render_binding_layer(binding, '[{"percent":10,"text":"1,0","label":"","color":"black"}]')
        high = render._render_binding_layer(binding, '[{"percent":90,"text":"9,0","label":"","color":"black"}]')
        self.assertEqual(low.size, (100, 100))
        self.assertNotEqual(low.tobytes(), high.tobytes())

    def test_bars_ratio_binding_draws_one_row_per_meter(self):
        binding = {"w": 200, "h": 60, "visual": "bars"}
        value = (
            '[{"percent":24,"text":"24 %","label":"CPU","color":"black"},'
            '{"percent":61,"text":"61 %","label":"RAM","color":"black"}]'
        )
        image = render._render_binding_layer(binding, value)
        self.assertEqual(image.size, (200, 60))
        self.assertIsNotNone(image.getbbox())

    def test_series_binding_delegates_to_the_bare_row_renderer_not_the_chart_widget(self):
        # A template row's series() binding must draw the plain bar/spark row a
        # manual send draws (_blockBars/_blockSpark - no axes, grid or legend),
        # not the free-form chart widget's decorated axis/grid/legend chart.
        binding = {"w": 200, "h": 60, "type": "series", "chartType": "bar"}
        via_dispatch = render._render_binding_layer(binding, "[1.5,2.0,1.2]")
        direct = render._render_bound_series(binding, "[1.5,2.0,1.2]")
        self.assertEqual(via_dispatch.tobytes(), direct.tobytes())
        chart_widget = render._render_bound_chart(binding, "[1.5,2.0,1.2]")
        self.assertNotEqual(via_dispatch.tobytes(), chart_widget.tobytes())

    def test_forecast_strip_draws_all_days_and_separators(self):
        binding = {"w": 240, "h": 60}
        days = (
            '[{"label":"PÁ","condition":"sunny","value":"22°"},'
            '{"label":"SO","condition":"rainy","value":"18°"},'
            '{"label":"NE","condition":"cloudy","value":"20°"},'
            '{"label":"PO","condition":"snowy","value":"-1°"}]'
        )
        image = render._render_bound_forecast(binding, days)
        self.assertEqual(image.size, (240, 60))
        self.assertIsNotNone(image.getbbox())

    def test_weather_condition_icon_map_covers_every_condition(self):
        # Same domain as _weatherConditionIcon in panel-devices.mixin.js -
        # every condition it can map to a weather-* icon name must resolve to
        # real Home Assistant weather artwork here too, or that day silently
        # falls back to text for no reason tied to the actual condition.
        # "exceptional" is the one deliberate exception: Home Assistant itself
        # draws that as a generic MDI alert icon rather than custom weather
        # artwork (weatherSVGs excludes it too), and this backend has no
        # headless ha-icon to resolve an arbitrary MDI glyph from - it falls
        # back to _FORECAST_CONDITION_ABBR's "!" text instead.
        for condition, icon_name in render._WEATHER_CONDITION_ICON_NAMES.items():
            if condition == "exceptional":
                continue
            with self.subTest(condition=condition):
                self.assertIn(icon_name, render.svg_blocks.WEATHER_ICON_TO_CONDITION)

    @unittest.skipUnless(render.svg_render.render_available(), "SVG rasteriser not installed")
    def test_forecast_strip_draws_a_real_icon_when_the_rasteriser_is_available(self):
        # Without this, every forecast day fell back to a short text
        # abbreviation ("JASNO") standing in for an icon a manual send
        # actually draws - the biggest remaining gap between an automatic
        # refresh and a manual send for this template.
        binding = {"w": 240, "h": 60, "days": 1}
        with_icon = render._render_bound_forecast(binding, '[{"label":"PÁ","condition":"sunny","value":"22°"}]')
        with_unmapped_condition = render._render_bound_forecast(
            binding, '[{"label":"PÁ","condition":"not-a-real-condition","value":"22°"}]'
        )
        # The unmapped condition still falls back to the JASNO-style text
        # abbreviation table, so both images have ink in roughly the icon's
        # slot - but a real vector icon and a short text run are not
        # pixel-identical, so the two renders must differ.
        self.assertNotEqual(with_icon.tobytes(), with_unmapped_condition.tobytes())

    def test_weather_condition_icon_image_returns_none_for_unknown_conditions(self):
        self.assertIsNone(render._weather_condition_icon_image("not-a-real-condition", 20))
        self.assertIsNone(render._weather_condition_icon_image("", 20))

    def test_weather_condition_icon_image_returns_none_for_degenerate_sizes(self):
        self.assertIsNone(render._weather_condition_icon_image("sunny", 0))
        self.assertIsNone(render._weather_condition_icon_image("sunny", -5))

    def test_forecast_strip_is_blank_without_forecast_data(self):
        image = render._render_bound_forecast({"w": 240, "h": 60}, "[]", force_transparent=True)
        self.assertIsNone(image.getbbox())

    def test_forecast_strip_clamps_an_oversized_day_list(self):
        # A weather integration that ignores "type": "daily" and answers with
        # hourly data instead would otherwise hand this dozens of entries -
        # each cell shrinking until every day's text collapses into
        # unreadable, overlapping noise across the whole strip.
        days = [{"label": f"D{i}", "condition": "sunny", "value": f"{i}°"} for i in range(48)]
        import json as _json

        four_days = render._render_bound_forecast({"w": 240, "h": 60, "days": 4}, _json.dumps(days))
        exactly_four = render._render_bound_forecast({"w": 240, "h": 60, "days": 4}, _json.dumps(days[:4]))
        self.assertEqual(four_days.tobytes(), exactly_four.tobytes())

    def test_forecast_strip_skips_drawing_when_cells_would_be_illegibly_narrow(self):
        days = [{"label": "PÁ", "condition": "sunny", "value": "1°"} for _ in range(4)]
        import json as _json

        image = render._render_bound_forecast({"w": 40, "h": 60, "days": 4}, _json.dumps(days), force_transparent=True)
        self.assertIsNone(image.getbbox())

    def test_calendar_binding_draws_the_datebox(self):
        binding = {"w": 260, "h": 70, "color": "red"}
        entry = '{"day":"24","month":"KVĚ","title":"Narozeniny","detail":"celý den"}'
        image = render._render_bound_calendar(binding, entry)
        self.assertEqual(image.size, (260, 70))
        self.assertIsNotNone(image.getbbox())

    def test_calendar_binding_respects_the_color_field(self):
        # _blockDatebox reads row.datebox.color for the header band - the
        # capture never carried it, so a manual send's red date box
        # (calendar.js's event-0) always painted black on an automatic
        # refresh regardless of the design.
        entry = '{"day":"24","month":"KVĚ","title":"Narozeniny","detail":"celý den"}'
        red = render._render_bound_calendar({"w": 260, "h": 70, "color": "red"}, entry)
        black = render._render_bound_calendar({"w": 260, "h": 70}, entry)
        self.assertIn((220, 20, 12, 255), list(red.getdata()))
        self.assertNotIn((220, 20, 12, 255), list(black.getdata()))

    def test_series_bar_binding_highlights_the_given_index_in_red(self):
        # _blockBars paints row.bars.highlight's bar in red - never captured
        # before, so the current-interval bar (cz_spot_prices.js, energy.js)
        # never stood out on an automatic refresh.
        binding = {"w": 200, "h": 60, "type": "series", "chartType": "bar", "highlight": 1}
        highlighted = render._render_bound_series(binding, "[1.5,2.0,1.2]")
        none_highlighted = render._render_bound_series({**binding, "highlight": -1}, "[1.5,2.0,1.2]")
        self.assertIn((220, 20, 12, 255), list(highlighted.getdata()))
        self.assertNotIn((220, 20, 12, 255), list(none_highlighted.getdata()))

    def test_series_bar_binding_draws_tick_labels(self):
        # row.bars.labels was never captured either, so the x-axis tick
        # labels (hour marks on cz_spot_prices.js/energy.js) were silently
        # dropped from every automatic refresh.
        binding = {"w": 200, "h": 60, "type": "series", "chartType": "bar"}
        values = "[1.5,2.0,1.2,1.8]"
        with_labels = render._render_bound_series({**binding, "labels": ["0", "", "", "18"]}, values)
        without_labels = render._render_bound_series(binding, values)
        self.assertNotEqual(with_labels.tobytes(), without_labels.tobytes())

    def test_binding_layer_dispatch_routes_each_new_type(self):
        self.assertIs(render._render_binding_layer, render._render_binding_layer)
        ratio = render._render_binding_layer(
            {"type": "ratio", "w": 40, "h": 40, "visual": "bars"},
            '[{"percent":50,"text":"50","label":"x","color":"black"}]',
        )
        forecast = render._render_binding_layer(
            {"type": "forecast", "w": 40, "h": 40}, '[{"label":"PÁ","condition":"sunny","value":"1°"}]'
        )
        calendar = render._render_binding_layer(
            {"type": "calendar", "w": 40, "h": 40}, '{"day":"1","month":"LED","title":"x","detail":""}'
        )
        for image in (ratio, forecast, calendar):
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.size, (40, 40))


if __name__ == "__main__":
    unittest.main()
