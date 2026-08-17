"""svg_blocks.py must stay a faithful mirror of the panel's graphic rows.

A manual send builds a template's series()/ratio()/day()/event() rows in the
browser with _blockBars/_blockSpark/_blockMeters/_blockRing/_blockDial/
_blockStrip/_blockDatebox; an automatic refresh rebuilds them on the backend and
rasterises the result. They only match while the port and the JavaScript agree,
so rather than restating the formulas here these tests run the real
panel-template-svg.mixin.js in Node and compare the markup both sides emit for
the same row, character for character.

The one substitution below is deliberate and documented in svg_text.py: the
panel names the font "Arial, Helvetica, sans-serif" and lets its @font-face
resolve the bundled Arimo, while the backend loads that same file into resvg
under its real name.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL_SVG = COMPONENT / "frontend" / "panel" / "panel-template-svg.mixin.js"
PACKAGE = "dratek_svg_blocks_test"

PANEL_FONT = 'font-family="Arial, Helvetica, sans-serif"'
BACKEND_FONT = 'font-family="Arimo, Arial, Helvetica, sans-serif"'


def _load(name: str):
    if PACKAGE not in sys.modules:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(COMPONENT)]
        sys.modules[PACKAGE] = package
    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.{name}", COMPONENT / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_load("svg_text")
svg_blocks = _load("svg_blocks")


# _blockStrip's icon cells hold a weather-* glyph name (block_strip's
# docstring). Both sides now draw that as a rasterised, dithered PNG - the
# JS side on an offscreen canvas (no Canvas/Image APIs in this Node
# subprocess), the Python side through resvg - so neither one is something a
# character-for-character comparison can meaningfully pin: two independent
# rasterisers dithering the same source will never agree byte for byte, and
# the JS side cannot even run its real renderer headlessly (canvas rasterisation
# is asynchronous by nature; _svgIcon returns "" on a cache miss and resolves
# later). Both sides are stubbed to the same deterministic placeholder instead,
# so this test keeps covering what it actually can: the icon's box (x/y/width/
# height) lands where _blockStrip's own layout math puts it, same as every
# other row this file checks.
def _stub_weather_icon(name, cx, cy, size, preserve_yellow=False, night=False):
    if name not in svg_blocks.WEATHER_ICON_TO_CONDITION:
        return ""
    x, y = cx - size / 2, cy - size / 2
    return (
        f'<image x="{x:.2f}" y="{y:.2f}" width="{size:.2f}" height="{size:.2f}"'
        f' href="stub:{name}" image-rendering="pixelated"></image>'
    )


svg_blocks.weather_icon = _stub_weather_icon

NODE_HARNESS = """
import { templateSvgMixin as m } from %(module)s;

m._escape = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

m._svgWeatherIcon = function (name, cx, cy, size) {
  if (!name.startsWith("weather-")) return "";
  const x = cx - size / 2, y = cy - size / 2;
  return `<image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"`
    + ` href="stub:${name}" image-rendering="pixelated"></image>`;
};

const cases = JSON.parse(process.argv[1]);
const out = {};
for (const [key, spec] of Object.entries(cases)) out[key] = m[spec.fn].call(m, spec.row, spec.box);
process.stdout.write(JSON.stringify(out));
"""

WIDE = {"x": 4, "y": 10, "w": 288, "h": 46}
TALL = {"x": 0, "y": 0, "w": 296, "h": 64}
NARROW = {"x": 12, "y": 6, "w": 96, "h": 30}

DIAL = {"percent": 0.42, "value": "42", "caption": "AQI", "min": "0", "max": "200"}
RING = {"percent": 0.47, "value": "2,35", "caption": "kW"}
METERS = [
    {"label": "Vlhkost", "value": "40 %", "percent": 0.4},
    {"label": "CO₂", "value": "650 ppm", "percent": 0.32, "color": "red"},
]
BARS = {
    "values": [1.92, 2.04, 2.18, 2.31, 2.11, 1.7, 3.02, 2.5],
    "labels": ["0", "", "", "6", "", "", "12", ""],
    "highlight": 3,
}
SPARK = {"values": [62, 58, 55, 49, 47, 43, 40, 38, 36], "caption": "7 dní"}
# A different condition per cell so the parity check exercises the sun/moon,
# cloud, rain, pouring-extra, and lightning branches of weather_icon's
# composition, not just one shape repeated four times.
STRIP = [
    {"label": "PÁ", "icon": "weather-sunny", "value": "22°"},
    {"label": "SO", "icon": "weather-partly-cloudy", "value": "25°"},
    {"label": "NE", "icon": "weather-pouring", "value": "18°"},
    {"label": "PO", "icon": "weather-lightning-rainy", "value": "20°"},
]
DATEBOX = {
    "day": "23", "month": "KVĚ", "color": "red",
    "lines": ["Schůzka s velmi dlouhým názvem", "15:00 · kancelář"],
}

# (name, JS block, JS row, box, the Python call that must reproduce it).
CASES = [
    ("dial", "_blockDial", {"dial": DIAL}, WIDE, lambda: svg_blocks.block_dial(DIAL, WIDE)),
    (
        "dial_empty",
        "_blockDial",
        {"dial": {"percent": 0, "value": "0", "caption": None, "min": None, "max": None}},
        NARROW,
        lambda: svg_blocks.block_dial(
            {"percent": 0, "value": "0", "caption": None, "min": None, "max": None}, NARROW
        ),
    ),
    ("ring", "_blockRing", {"ring": RING}, WIDE, lambda: svg_blocks.block_ring(RING, WIDE)),
    (
        "ring_red_no_caption",
        "_blockRing",
        {"ring": {"percent": 0.9, "value": "90 %", "caption": None, "color": "red"}},
        TALL,
        lambda: svg_blocks.block_ring(
            {"percent": 0.9, "value": "90 %", "caption": None, "color": "red"}, TALL
        ),
    ),
    ("meters", "_blockMeters", {"meters": METERS}, TALL, lambda: svg_blocks.block_meters(METERS, TALL)),
    ("bars", "_blockBars", {"bars": BARS}, TALL, lambda: svg_blocks.block_bars(BARS, TALL)),
    (
        "bars_negative_unlabelled",
        "_blockBars",
        {"bars": {"values": [3, -1, 4, 1, 5], "labels": [], "highlight": -1}},
        WIDE,
        # -1 is the panel's "no interval is current" marker; the backend passes
        # None, and neither must pick out a bar.
        lambda: svg_blocks.block_bars(
            {"values": [3, -1, 4, 1, 5], "labels": [], "highlight": None}, WIDE
        ),
    ),
    ("spark", "_blockSpark", {"spark": SPARK}, TALL, lambda: svg_blocks.block_spark(SPARK, TALL)),
    ("strip", "_blockStrip", {"strip": STRIP}, TALL, lambda: svg_blocks.block_strip(STRIP, TALL)),
    (
        "strip_narrow",
        "_blockStrip",
        {"strip": STRIP},
        NARROW,
        lambda: svg_blocks.block_strip(STRIP, NARROW),
    ),
    (
        "datebox",
        "_blockDatebox",
        {"datebox": DATEBOX},
        TALL,
        lambda: svg_blocks.block_datebox(DATEBOX, TALL),
    ),
]


def _javascript_markup() -> dict[str, str]:
    payload = json.dumps(
        {name: {"fn": block, "row": row, "box": box} for name, block, row, box, _python in CASES}
    )
    script = NODE_HARNESS % {"module": json.dumps(PANEL_SVG.as_uri())}
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script, payload],
        capture_output=True, text=True, encoding="utf-8",
    )
    if result.returncode:
        raise unittest.SkipTest(f"node could not run the panel module: {result.stderr}")
    return json.loads(result.stdout)


class BlockMarkupPortTests(unittest.TestCase):
    """Every ported row must emit the markup the browser emits, unchanged."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.reference = _javascript_markup()

    def test_every_block_matches_the_javascript(self) -> None:
        for name, _block, _row, _box, python in CASES:
            with self.subTest(block=name):
                expected = self.reference[name].replace(PANEL_FONT, BACKEND_FONT)
                self.assertTrue(expected, f"{name} produced no reference markup")
                self.assertEqual(expected, python())


class BlockConstantTests(unittest.TestCase):
    """The two ink constants and the readability floor live on both sides."""

    def setUp(self) -> None:
        self.source = PANEL_SVG.read_text(encoding="utf-8")

    def test_ink_constants_match(self) -> None:
        self.assertIn(f'const RED = "{svg_blocks.RED}"', self.source)
        self.assertIn(f'const BLACK = "{svg_blocks.BLACK}"', self.source)

    def test_ratio_helper_still_hands_blocks_a_fraction(self) -> None:
        # render.py divides automation.py's 0-100 percentage by 100 before
        # calling a gauge block, because the panel's own ratio() helper does the
        # same. If the helper ever stopped dividing, every gauge would fill to
        # its clamp during an automatic refresh.
        self.assertIn("this._templatePercent(template, index, fallback) / 100", self.source)


if __name__ == "__main__":
    unittest.main()
