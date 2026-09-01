"""The price tag's barcode has to be a barcode, not a picture of one.

Every other block on a display is judged by eye: if the bars look like bars, the
block works. This one is not - a symbol with a wrong check digit, a missing quiet
zone or a fractional module width looks completely right on screen and then
either refuses to scan or, far worse, scans as a different product. None of that
is visible in a screenshot, so it is pinned here instead.

The encoder lives in panel-template-svg.mixin.js and is run through Node, the
same way tests/test_template_block_palette.py runs the block palette: it is an ES
module written against a live panel, and there is no Python port of it (the
backend never redraws this block - see the module comment in svg_blocks.py for
which rows it does redraw).
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
SVG = PANEL / "panel-template-svg.mixin.js"


def _run_node(script: str) -> dict:
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("Node.js is not available")
    result = subprocess.run(
        [node, "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


def _encode(values: list[str]) -> dict:
    svg_url = json.dumps(SVG.as_uri())
    payload = json.dumps(values)
    script = f"""
      import {{ templateSvgMixin }} from {svg_url};
      const panel = Object.assign({{}}, templateSvgMixin, {{
        _escape: (value) => String(value ?? ""),
      }});
      const report = {{}};
      for (const value of {payload}) {{
        const encoded = panel._barcodeModules(value);
        report[value] = encoded
          ? {{ bits: encoded.bits, text: encoded.text, kind: encoded.kind, guards: encoded.guards }}
          : null;
      }}
      console.log(JSON.stringify(report));
    """
    return _run_node(script)


# The three symbologies, decoded back out of the module string by tables written
# out independently of the encoder's own. A round trip through a second copy of
# the standard is the only check that actually says "a scanner would read this".
EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011",
         "0110001", "0101111", "0111011", "0110111", "0001011"]
EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101",
         "0111001", "0000101", "0010001", "0001001", "0010111"]
EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100",
         "1001110", "1010000", "1000100", "1001000", "1110100"]
EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
              "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]


def _decode_ean13(bits: str) -> str:
    assert len(bits) == 95, f"EAN-13 is 95 modules, got {len(bits)}"
    assert bits[:3] == "101" and bits[45:50] == "01010" and bits[92:] == "101"
    parity = ""
    left = ""
    for index in range(6):
        segment = bits[3 + index * 7:10 + index * 7]
        if segment in EAN_L:
            parity += "L"
            left += str(EAN_L.index(segment))
        else:
            parity += "G"
            left += str(EAN_G.index(segment))
    right = "".join(str(EAN_R.index(bits[50 + i * 7:57 + i * 7])) for i in range(6))
    return f"{EAN_PARITY.index(parity)}{left}{right}"


def _decode_ean8(bits: str) -> str:
    assert len(bits) == 67, f"EAN-8 is 67 modules, got {len(bits)}"
    assert bits[:3] == "101" and bits[31:36] == "01010" and bits[64:] == "101"
    left = "".join(str(EAN_L.index(bits[3 + i * 7:10 + i * 7])) for i in range(4))
    right = "".join(str(EAN_R.index(bits[36 + i * 7:43 + i * 7])) for i in range(4))
    return left + right


class BarcodeEncoderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.encoded = _encode([
            # A real, published EAN-13 whose check digit is already correct.
            "4006381333931",
            # The panel's own sample, and the twelve-digit body it comes from:
            # both must produce the same symbol.
            "8594001234561",
            "859400123456",
            # The sample as it was written before this test existed - a wrong
            # check digit, which the encoder recomputes rather than printing.
            "8594001234567",
            # A published EAN-8.
            "96385074",
            # An internal SKU: letters, so Code 128-B.
            "SKU-A17",
            "",
        ])

    def test_a_valid_ean13_survives_a_round_trip(self) -> None:
        entry = self.encoded["4006381333931"]
        self.assertEqual("ean13", entry["kind"])
        self.assertEqual("4006381333931", entry["text"])
        self.assertEqual("4006381333931", _decode_ean13(entry["bits"]))

    def test_a_wrong_check_digit_is_recomputed_not_printed(self) -> None:
        """A bad last digit scans as a product that does not exist.

        That is a worse outcome than a tag with no code at all, so the encoder
        derives the check digit from the twelve-digit body either way - and the
        AKCE dialog says so, which is what _priceSaleCodeNote is for.
        """
        corrected = self.encoded["8594001234567"]
        self.assertEqual("8594001234561", corrected["text"])
        self.assertEqual("8594001234561", _decode_ean13(corrected["bits"]))
        # Twelve digits, thirteen digits and thirteen wrong digits all agree.
        self.assertEqual(corrected["bits"], self.encoded["8594001234561"]["bits"])
        self.assertEqual(corrected["bits"], self.encoded["859400123456"]["bits"])

    def test_eight_digits_become_an_ean8(self) -> None:
        entry = self.encoded["96385074"]
        self.assertEqual("ean8", entry["kind"])
        self.assertEqual("96385074", entry["text"])
        self.assertEqual("96385074", _decode_ean8(entry["bits"]))

    def test_guard_bars_are_where_the_digits_are_not(self) -> None:
        """The caller runs the guards past the baseline of the digits.

        Spans in the wrong place would drop a bar through the number row, or
        leave the symbol looking like a bar chart.
        """
        self.assertEqual([[0, 3], [45, 50], [92, 95]], self.encoded["4006381333931"]["guards"])
        self.assertEqual([[0, 3], [31, 36], [64, 67]], self.encoded["96385074"]["guards"])

    def test_letters_fall_back_to_code_128(self) -> None:
        entry = self.encoded["SKU-A17"]
        self.assertEqual("code128", entry["kind"])
        self.assertEqual("SKU-A17", entry["text"])
        # Start Code B, then one 11-module pattern per character, the modulo-103
        # checksum and the 13-module stop.
        self.assertEqual(11 * (1 + len("SKU-A17") + 1) + 13, len(entry["bits"]))
        self.assertTrue(entry["bits"].startswith("11010010000"), "not Start Code B")
        self.assertTrue(entry["bits"].endswith("1100011101011"), "not the Code 128 stop pattern")

    def test_an_empty_code_encodes_to_nothing(self) -> None:
        # _blockBarcode draws nothing at all rather than an empty frame, and
        # price.js drops the row entirely - see its `if (!code)` branch.
        self.assertIsNone(self.encoded[""])

    def test_modules_land_on_whole_pixels(self) -> None:
        """A bar on a half pixel comes out grey, and grey does not scan.

        The three-colour quantiser pushes it to whichever of black or white it
        is nearer, so a fractional module width silently eats the bar-to-space
        ratio the scanner measures.
        """
        source = SVG.read_text(encoding="utf-8")
        block = source[source.index("_blockBarcode(row, box) {"):source.index("// ---", source.index("_blockBarcode(row, box) {"))]
        self.assertIn("Math.max(1, Math.floor(box.w / total))", block)
        self.assertIn('shape-rendering="crispEdges"', block)
        # The bars are black, never the red accent: a scanner's red LED reads
        # red ink as paper.
        self.assertNotIn("RED", block)


if __name__ == "__main__":
    unittest.main()
