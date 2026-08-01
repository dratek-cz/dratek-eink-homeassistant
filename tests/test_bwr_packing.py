"""Regression tests pinning the three-colour classification to one shared rule.

The panel rasterises the image it sends, while the backend renders automatic
updates itself. When the two used different thresholds they disagreed on 16.6 % of
the RGB cube, so a preview could not match the panel no matter how the artwork was
drawn. Both sides now follow _quantizeEinkPixel from panel-template-svg.mixin.js,
transcribed below as the executable specification.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import random
import sys
import types
import unittest

from PIL import Image


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


def reference_classify(r: int, g: int, b: int) -> str:
    """Literal transcription of _quantizeEinkPixel in panel-template-svg.mixin.js.

    This is the specification: the panel rasterises what it sends using exactly
    this rule, so the backend has to agree pixel for pixel. Keeping the JS logic
    transcribed here means a change on either side shows up as a failure.
    """
    red_dominance = r - max(g, b)
    if r >= 105 and red_dominance >= 52 and g <= 145 and b <= 145:
        return "red"
    luminance = (r * 299 + g * 587 + b * 114) / 1000
    return "black" if luminance < 168 else "white"


def reference_quantize(image: Image.Image) -> Image.Image:
    """Per-pixel preview quantiser built on the shared rule."""
    colours = {"white": (255, 255, 255), "red": (220, 20, 12), "black": (0, 0, 0)}
    output = image.convert("RGB")
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            pixels[x, y] = colours[reference_classify(*pixels[x, y])]
    return output


def reference_pack(image: Image.Image) -> bytes:
    """Per-pixel bit-plane packer built on the shared rule."""
    width, height = image.size
    pixels = image.convert("RGB").load()
    plane_size = (width * height) // 8
    black_white = bytearray(plane_size)
    red = bytearray(plane_size)
    bit = 0
    index = 0
    for y in range(height):
        for x in range(width):
            klass = reference_classify(*pixels[x, y])
            black_white[index] |= (0x80 if klass == "white" else 0) >> bit
            red[index] |= (0x80 if klass == "red" else 0) >> bit
            bit += 1
            if bit > 7:
                bit = 0
                index += 1
    return bytes(black_white + red)


def _pack_via_masks(image: Image.Image) -> bytes:
    """Exercise the production masks without the resize/rotate preprocessing."""
    width, height = image.size
    white, red = render.bwr_masks(image)
    if width % 8 == 0:
        return white.tobytes() + red.tobytes()
    return render._pack_planes_unaligned(white, red, width * height)


def _image(width: int, height: int, kind: str, seed: int) -> Image.Image:
    rng = random.Random(seed)
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            if kind == "random":
                pixels[x, y] = (rng.randrange(256), rng.randrange(256), rng.randrange(256))
            elif kind == "boundary":
                # Values sitting right on the luma and red thresholds, where any
                # rounding difference between the two implementations would show.
                choices = (158, 159, 160, 161, 162, 0, 255)
                pixels[x, y] = (rng.choice(choices), rng.choice(choices), rng.choice(choices))
            else:
                pixels[x, y] = ((x * 7) % 256, (y * 13) % 256, (x * y) % 256)
    return image


# Byte-aligned widths take the fast tobytes() path; 212, 250, 196 and 210 do not
# and must go through the continuous packer instead.
SIZES = ((296, 128), (400, 300), (212, 104), (250, 132), (196, 96), (210, 480))
KINDS = ("random", "boundary", "gradient")


class BwrClassificationTests(unittest.TestCase):
    def test_preview_matches_the_reference_pixel_loop(self):
        for width, height in SIZES:
            for kind in KINDS:
                with self.subTest(size=f"{width}x{height}", pixels=kind):
                    image = _image(width, height, kind, seed=hash((width, kind)) & 0xFFFF)
                    self.assertEqual(
                        render.quantize_bwr_preview(image).tobytes(),
                        reference_quantize(image).tobytes(),
                    )

    def test_packed_planes_match_the_reference_pixel_loop(self):
        for width, height in SIZES:
            for kind in KINDS:
                with self.subTest(size=f"{width}x{height}", pixels=kind):
                    image = _image(width, height, kind, seed=hash((height, kind)) & 0xFFFF)
                    self.assertEqual(_pack_via_masks(image), reference_pack(image))

    def test_a_pixel_is_never_both_white_and_red(self):
        image = _image(296, 128, "boundary", seed=5)
        white, red = render.bwr_masks(image)
        overlap = [w and r for w, r in zip(white.convert("L").tobytes(), red.convert("L").tobytes())]
        self.assertFalse(any(overlap))

    def test_unaligned_widths_do_not_take_the_row_padded_path(self):
        # 212 is not a multiple of 8, so mode "1" row padding would corrupt the
        # stream. Guard the branch so a future refactor cannot quietly drop it.
        image = _image(212, 104, "random", seed=3)
        white, red = render.bwr_masks(image)
        row_padded = white.tobytes() + red.tobytes()
        self.assertNotEqual(row_padded, reference_pack(image))
        self.assertEqual(_pack_via_masks(image), reference_pack(image))


if __name__ == "__main__":
    unittest.main()
