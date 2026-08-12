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

from PIL import Image, ImageDraw


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
    luminance = (r * 38 + g * 75 + b * 15) >> 7
    if luminance >= 161:
        return "white"
    return "red" if r >= 161 else "black"


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
    def test_sdk_type_46_uses_vendor_two_bit_bwry_encoding(self):
        pixels = Image.new("RGB", (4, 1))
        pixels.putdata(
            [
                (0, 0, 0),
                (255, 255, 255),
                (255, 255, 0),
                (255, 0, 0),
            ]
        )
        # Vendor colour codes 0, 1, 2 and 3 occupy the byte from MSB to LSB.
        self.assertEqual(b"\x1b", render._pack_bwry_image(pixels))

        image = Image.new("RGB", (296, 128), "yellow")
        payload = render.pack_bwr_image(46, image)
        self.assertEqual(296 * 128 // 4, len(payload))
        self.assertEqual({0xAA}, set(payload))

    def test_all_bwry_models_use_the_vendor_two_bit_encoding(self):
        for sdk_type in (78, 142, 270, 302, 310, 318, 558, 654, 686, 2670, 2702):
            with self.subTest(sdk_type=sdk_type):
                width, height = render.display_size(sdk_type)
                image = Image.new("RGB", (width, height), "yellow")
                payload = render.pack_bwr_image(sdk_type, image)
                buffer_width, buffer_height = render.expected_buffer_size(sdk_type)
                self.assertEqual(buffer_width * buffer_height // 4, len(payload))
                expected_bytes = {0xAA, 0x55} if sdk_type in (2670, 2702) else {0xAA}
                self.assertEqual(expected_bytes, set(payload))

    def test_yellow_is_red_on_a_three_colour_display(self):
        image = Image.new("RGB", (296, 128), "yellow")
        payload = render.pack_bwr_image(43, image)
        plane_size = 296 * 128 // 8
        self.assertEqual(b"\x00" * plane_size, payload[:plane_size])
        self.assertEqual(b"\xff" * plane_size, payload[plane_size:])

    def test_automatic_bwry_refresh_can_preserve_yellow(self):
        image = Image.new("RGB", (4, 1), "yellow")
        self.assertEqual((255, 255, 255), render.quantize_bwr_preview(image).getpixel((0, 0)))
        self.assertEqual((244, 196, 0), render.quantize_bwr_preview(image, True).getpixel((0, 0)))

    def test_sdk_type_46_uses_the_vendor_clockwise_bitmap_mapping(self):
        image = Image.new("RGB", (296, 128), "white")
        image.putpixel((0, 0), (0, 0, 0))
        prepared = render.prepare_image_for_display(46, image)
        self.assertEqual((128, 296), prepared.size)
        # Pillow's -90 degrees maps the source top-left to output top-right.
        self.assertEqual((0, 0, 0), prepared.getpixel((127, 0)))

    def test_sdk_type_299_uses_inverted_first_plane_and_vertical_flip(self):
        image = Image.new("RGB", (800, 480), "white")
        ImageDraw.Draw(image).rectangle((0, 0, 799, 0), fill="black")
        payload = render.pack_bwr_image(299, image)
        plane_size = 800 * 480 // 8
        self.assertEqual(plane_size * 2, len(payload))
        # After the vendor's vertical flip the first row is white (active-low
        # first plane), while the original black top row is transmitted last.
        self.assertEqual(b"\x00" * 100, payload[:100])
        self.assertEqual(b"\xff" * 100, payload[plane_size - 100 : plane_size])
        self.assertEqual({0}, set(payload[plane_size:]))

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
        overlap = [
            w and r
            for w, r in zip(
                white.convert("L").tobytes(),
                red.convert("L").tobytes(),
                strict=True,
            )
        ]
        self.assertFalse(any(overlap))

    def test_antialiased_black_glyphs_on_red_keep_a_black_edge(self):
        # 0.1.167 classified a pixel as red whenever red dominated green and blue,
        # which is exactly what the antialiased edge of a black glyph over a red
        # area looks like. Every glyph on red came back with a red rim around it.
        for pixel in ((150, 20, 15), (110, 15, 10), (150, 90, 70), (160, 40, 30)):
            with self.subTest(pixel=pixel):
                self.assertEqual("black", reference_classify(*pixel))

        def dominance_rule(r: int, g: int, b: int) -> str:
            """The 0.1.167 rule this test exists to keep out."""
            if r >= 105 and (r - max(g, b)) >= 52 and g <= 145 and b <= 145:
                return "red"
            return "black" if (r * 299 + g * 587 + b * 114) / 1000 < 168 else "white"

        image = Image.new("RGB", (296, 128), (220, 20, 12))
        draw = ImageDraw.Draw(image)
        draw.text((10, 40), "Teplota 21,5", font=render.load_font(30, True), fill=(0, 0, 0))
        quantised = render.quantize_bwr_preview(image)
        colours = {quantised.getpixel((x, y)) for y in range(128) for x in range(296)}
        self.assertLessEqual(colours, {(220, 20, 12), (0, 0, 0), (255, 255, 255)})

        # Antialiased glyph edges are the only pixels the two rules disagree on,
        # and every one of them is a pixel that traces a letter. Under the shipped
        # rule they must be black; the dominance rule turned them all red, which
        # is the rim users reported.
        source = image.convert("RGB").load()
        edge_pixels = [
            source[x, y]
            for y in range(128)
            for x in range(296)
            if dominance_rule(*source[x, y]) == "red"
            and reference_classify(*source[x, y]) != "red"
        ]
        self.assertGreater(
            len(edge_pixels), 100, "the fixture stopped producing antialiased edges"
        )
        for pixel in edge_pixels[:50]:
            self.assertEqual("black", reference_classify(*pixel), pixel)

    def test_the_panel_and_the_backend_share_one_rule(self):
        # The panel quantises what it sends; the backend quantises automatic
        # updates. A drift between them puts different pixels on one display.
        source = (
            COMPONENT / "frontend" / "panel" / "panel-template-svg.mixin.js"
        ).read_text(encoding="utf-8")
        self.assertIn("const luminance = (red * 38 + green * 75 + blue * 15) >> 7;", source)
        self.assertIn("if (luminance >= 161) return [255, 255, 255];", source)
        self.assertIn("return red >= 161 ? [220, 20, 12] : [0, 0, 0];", source)
        self.assertEqual((38, 75, 15), render.BWR_LUMA_WEIGHTS)
        self.assertEqual(128, render.BWR_LUMA_SCALE)
        self.assertEqual(161, render.BWR_WHITE_THRESHOLD)
        self.assertEqual(161, render.BWR_RED_MIN)

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
