from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from .const import DEVICE_SIZES


def display_size(sdk_type: int) -> tuple[int, int]:
    size = DEVICE_SIZES.get(int(sdk_type))
    if not size:
        raise ValueError(f"Unsupported DRATEK eInk SDK type: {sdk_type}")
    return size


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    bundled_font = Path(__file__).parent / "frontend" / "fonts" / "Arimo-wght.ttf"
    try:
        font = ImageFont.truetype(str(bundled_font), int(size))
        if hasattr(font, "set_variation_by_axes"):
            font.set_variation_by_axes([700 if bold else 600])
        return font
    except (OSError, TypeError, ValueError):
        pass

    regular_fonts = (
        "LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    bold_fonts = (
        "LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    )
    for font_name in bold_fonts if bold else regular_fonts:
        try:
            return ImageFont.truetype(font_name, int(size))
        except OSError:
            pass
    return ImageFont.load_default()


def _decode_data_image(image_data: str) -> Image.Image:
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(image_data))).convert("RGB")


def _fit_text_font(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    requested_size: int,
    minimum_size: int,
    width: int,
    height: int,
    bold: bool,
    auto_fit: bool,
) -> tuple[ImageFont.FreeTypeFont | ImageFont.ImageFont, int, int]:
    font_size = max(minimum_size, requested_size)
    while True:
        font = load_font(font_size, bold)
        boxes = [draw.textbbox((0, 0), line or " ", font=font) for line in lines]
        max_width = max((box[2] - box[0] for box in boxes), default=0)
        line_height = max(1, round(font_size * 1.08))
        if not auto_fit or (max_width <= width and line_height * len(lines) <= height) or font_size <= minimum_size:
            return font, font_size, line_height
        font_size -= 1


def _render_bound_text(binding: dict[str, Any], value: str) -> Image.Image:
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    padding = max(0, round(float(binding.get("padding", 0))))
    available_width = max(1, width - padding * 2)
    available_height = max(1, height - padding * 2)
    lines = str(value).split("\n")
    font, _font_size, line_height = _fit_text_font(
        draw,
        lines,
        round(float(binding.get("fontSize", 16))),
        max(10, round(float(binding.get("minFontSize", 10)))),
        available_width,
        available_height,
        bool(binding.get("bold")),
        binding.get("autoFit") is not False,
    )
    total_height = line_height * len(lines)
    vertical = binding.get("verticalAlign", "middle")
    start_y = padding
    if vertical == "middle":
        start_y += max(0, (available_height - total_height) // 2)
    elif vertical == "bottom":
        start_y += max(0, available_height - total_height)
    align = binding.get("textAlign", "left")
    color = {"red": (220, 20, 12, 255), "white": (255, 255, 255, 255)}.get(
        binding.get("color"), (0, 0, 0, 255)
    )
    for index, line in enumerate(lines):
        box = draw.textbbox((0, 0), line or " ", font=font)
        text_width = box[2] - box[0]
        x = padding
        if align == "center":
            x = padding + (available_width - text_width) / 2
        elif align == "right":
            x = padding + available_width - text_width
        draw.text((x - box[0], start_y + index * line_height - box[1]), line, fill=color, font=font)
    if binding.get("flipH"):
        layer = layer.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    rotation = int(binding.get("rotation", 0)) % 360
    if rotation:
        layer = layer.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
    return layer


def _chart_values(value: str, maximum: int = 48) -> list[float]:
    values: list[float] = []
    try:
        parsed = json.loads(str(value))
        if isinstance(parsed, list):
            values = [float(item) for item in parsed if isinstance(item, (int, float, str))]
    except (ValueError, TypeError, json.JSONDecodeError):
        pass
    if not values:
        separator = ";" if ";" in str(value) else ","
        for item in str(value).replace("\n", separator).split(separator):
            try:
                values.append(float(item.strip().replace(",", ".")))
            except ValueError:
                continue
    return values[-max(2, min(96, maximum)) :]


def _render_bound_chart(binding: dict[str, Any], value: str) -> Image.Image:
    width = max(24, round(float(binding.get("w", 24))))
    height = max(24, round(float(binding.get("h", 24))))
    layer = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(layer)
    values = _chart_values(value, int(binding.get("maxPoints", 48)))
    title = str(binding.get("chartTitle") or "")
    top = 16 if title else 5
    left, right, bottom = 22, 5, 14
    plot_width = max(4, width - left - right)
    plot_height = max(4, height - top - bottom)
    if title:
        draw.text((width / 2, 2), title, fill=(0, 0, 0, 255), font=load_font(9, True), anchor="ma")
    draw.line((left, top, left, top + plot_height, left + plot_width, top + plot_height), fill=(0, 0, 0, 255), width=1)
    if not values:
        return layer
    minimum, maximum = min(values), max(values)
    span = max(1e-9, maximum - minimum)
    points = [
        (
            left + (index / max(1, len(values) - 1)) * plot_width,
            top + plot_height - ((item - minimum) / span) * plot_height,
        )
        for index, item in enumerate(values)
    ]
    color = (220, 20, 12, 255) if binding.get("color") == "red" else (0, 0, 0, 255)
    if binding.get("chartType") == "bar":
        bar_width = max(1, plot_width // max(1, len(values)) - 1)
        for x, y in points:
            draw.rectangle((round(x - bar_width / 2), round(y), round(x + bar_width / 2), top + plot_height), fill=color)
    else:
        if binding.get("chartType") == "area":
            polygon = [(left, top + plot_height), *points, (left + plot_width, top + plot_height)]
            draw.polygon(polygon, fill=(220, 20, 12, 255) if binding.get("color") == "red" else (210, 210, 210, 255))
        if len(points) > 1:
            draw.line(points, fill=color, width=max(1, int(binding.get("strokeWidth", 2))))
    return layer


def render_entity_bound_image(
    base_image: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
) -> Image.Image:
    """Compose current Home Assistant entity values over a designer background."""
    image = _decode_data_image(base_image).convert("RGBA")
    for binding in bindings:
        value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
        layer = _render_bound_chart(binding, value) if binding.get("type") == "chart" else _render_bound_text(binding, value)
        x = round(float(binding.get("x", 0)))
        y = round(float(binding.get("y", 0)))
        x -= (layer.width - max(1, round(float(binding.get("w", 1))))) // 2
        y -= (layer.height - max(1, round(float(binding.get("h", 1))))) // 2
        image.alpha_composite(layer, (x, y))
    return image.convert("RGB")


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
