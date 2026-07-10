from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from .const import DEVICE_SIZES


def display_size(sdk_type: int) -> tuple[int, int]:
    size = DEVICE_SIZES.get(int(sdk_type))
    if not size:
        raise ValueError(f"Unsupported DRATEK eInk SDK type: {sdk_type}")
    return size


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for font_name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        try:
            return ImageFont.truetype(font_name, int(size))
        except OSError:
            pass
    return ImageFont.load_default()


def render_text_image(
    sdk_type: int,
    text: str,
    font_size: int | None = None,
    color: str = "black",
) -> Image.Image:
    width, height = display_size(sdk_type)
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    size = font_size or max(18, min(width, height) // 5)
    font = load_font(size)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = max(0, (width - text_width) // 2)
    y = max(0, (height - text_height) // 2)

    fill = "red" if color == "red" else "black"
    draw.text((x - bbox[0], y - bbox[1]), text, fill=fill, font=font)
    return image


PE29_CODES = {40, 43, 46, 48, 51}


def _apply_pe29_transform(image: Image.Image, transform: str | None) -> Image.Image:
    mode = transform or "rotate_cw"
    if mode == "none":
        return image
    if mode == "rotate_cw":
        return image.rotate(90, expand=True)
    if mode == "rotate_ccw":
        return image.rotate(-90, expand=True)
    if mode == "rotate_180":
        return image.rotate(180, expand=True)
    if mode == "rotate_cw_flip_lr":
        return image.rotate(90, expand=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if mode == "rotate_cw_flip_tb":
        return image.rotate(90, expand=True).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if mode == "rotate_ccw_flip_lr":
        return image.rotate(-90, expand=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if mode == "rotate_ccw_flip_tb":
        return image.rotate(-90, expand=True).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if mode == "flip_lr":
        return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if mode == "flip_tb":
        return image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return image.rotate(90, expand=True)


def pack_bwr_image(sdk_type: int, image: Image.Image, transform: str | None = None) -> bytes:
    code = int(sdk_type)
    if code == 11:
        image = image.rotate(-90, expand=True)
    elif code in PE29_CODES:
        image = _apply_pe29_transform(image, transform)
    elif code in (264, 267, 270):
        image = image.rotate(90, expand=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    elif code == 75 and image.width == 300:
        image = image.rotate(90, expand=True)

    width, height = image.size
    pixel_count = width * height
    if pixel_count % 8 != 0:
        raise ValueError(f"Display pixel count is not byte aligned: {width}x{height}")

    pixels = image.convert("RGB").load()
    plane_size = pixel_count // 8
    black_white = bytearray(plane_size)
    red = bytearray(plane_size)
    bit = 0
    index = 0
    threshold = 160

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            luma = (38 * r + 75 * g + 15 * b) >> 7
            white_bit = 0x80 if luma > threshold else 0
            red_bit = 0x80 if r > threshold else 0
            if red_bit == 0x80 and white_bit == 0x80:
                red_bit = 0

            black_white[index] |= white_bit >> bit
            red[index] |= red_bit >> bit
            bit += 1
            if bit > 7:
                bit = 0
                index += 1

    return bytes(black_white + red)
