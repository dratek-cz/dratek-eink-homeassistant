from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageMath

from . import svg_render
from .const import DEVICE_SIZES
from .meteoradar import fit_to_size
from .svg_text import svg_text as build_text_element

# The single black/white/red rule, shared verbatim with the panel's
# _quantizeEinkPixel in panel-template-svg.mixin.js. Preview and payload have to
# classify a pixel identically; when the two rules drifted apart they disagreed on
# 16.6 % of the RGB cube, which is why a preview could never match the panel.
#
# A pixel is red only when the red channel is bright AND the pixel is too dark to
# be white. That second half is what keeps glyph edges black: antialiasing between
# a black glyph and a red area lands on dark warm pixels like rgb(150, 20, 15),
# and those stay black because their red channel never clears the threshold.
#
# 0.1.167 briefly replaced this with a "red is dominant over green and blue" test,
# which reclassified 2.5 % of the RGB cube as red and drew a red rim around every
# black glyph sitting on red. The dominance test is not usable here: it accepts
# any dark warm pixel, and antialiasing produces those by the thousand.
BWR_LUMA_WEIGHTS = (38, 75, 15)  # summing to 128, so the divisor below is a shift
BWR_LUMA_SCALE = 128
BWR_WHITE_THRESHOLD = 161  # ">= 161" is the old "> 160"
BWR_RED_MIN = 161  # ">= 161" is the old "> 160"
BWR_WHITE = (255, 255, 255)
BWR_RED = (220, 20, 12)
BWR_BLACK = (0, 0, 0)


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


def _extract_item_value(item: dict[str, Any], value: Any, min_val: float, max_val: float, default_pct: float) -> float:
    target_attr = item.get("entity_attribute") or item.get("entityAttribute") or item.get("target_attribute")
    item_entity_id = str(item.get("entity_id") or item.get("entityId") or "")
    target_val = value
    if isinstance(value, dict):
        if item_entity_id and item_entity_id in value:
            ent_data = value[item_entity_id]
            if isinstance(ent_data, dict):
                target_val = ent_data.get(target_attr) if target_attr else ent_data.get("state")
            else:
                target_val = ent_data
        elif target_attr and target_attr in value:
            target_val = value.get(target_attr)
        elif "state" in value:
            target_val = value.get("state")
    if (target_val is None or str(target_val).strip() == "") and item.get("sample_value") is not None:
        target_val = item.get("sample_value")
    try:
        return float(target_val)
    except (ValueError, TypeError):
        return (min_val + max_val) * default_pct


def _decode_data_image(image_data: str) -> Image.Image:
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(image_data))).convert("RGB")


def _luma_plane(red: Image.Image, green: Image.Image, blue: Image.Image) -> Image.Image:
    """Compute (299*R + 587*G + 114*B) // 1000 for a whole band at C speed."""
    weight_r, weight_g, weight_b = BWR_LUMA_WEIGHTS
    scale = BWR_LUMA_SCALE
    # Pillow 10.3 renamed the safe evaluator; the manifest still allows 10.0.
    # ImageMath has no floor-divide operator, so truncate the quotient instead.
    # Both operands are non-negative, which makes truncation the same as floor.
    lambda_eval = getattr(ImageMath, "lambda_eval", None)
    if lambda_eval is not None:
        return lambda_eval(
            lambda args: args["int"](
                (
                    weight_r * args["r"]
                    + weight_g * args["g"]
                    + weight_b * args["b"]
                )
                / scale
            ),
            r=red,
            g=green,
            b=blue,
        )
    return ImageMath.eval(
        f"int(({weight_r} * r + {weight_g} * g + {weight_b} * b) / {scale})",
        r=red,
        g=green,
        b=blue,
    )


def bwr_masks(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Return the bilevel (white, red) masks shared by preview and packing.

    Mirrors _quantizeEinkPixel in panel-template-svg.mixin.js exactly: a bright
    pixel is white, and among the remaining dark pixels the ones with a bright red
    channel are red. White wins over red, so the masks never overlap.

    Doing this with whole-image operations instead of a Python pixel loop keeps the
    result identical while running roughly an order of magnitude faster, which
    matters because an 800x480 panel is 384000 pixels.
    """
    rgb = image.convert("RGB")
    red_band, green_band, blue_band = rgb.split()
    luma = _luma_plane(red_band, green_band, blue_band).convert("L")
    bright = luma.point(lambda v: 255 if v >= BWR_WHITE_THRESHOLD else 0, mode="1")
    # White wins the overlap, exactly as the old per-pixel loop did by clearing
    # red_bit whenever white_bit was already set.
    red = ImageChops.logical_and(
        red_band.point(lambda v: 255 if v >= BWR_RED_MIN else 0, mode="1"),
        ImageChops.invert(bright),
    )
    return bright, red


def quantize_bwr_preview(image: Image.Image) -> Image.Image:
    """Convert RGB pixels to the exact black/white/red classes used by packing."""
    white, red = bwr_masks(image)
    output = Image.new("RGB", image.size, BWR_BLACK)
    output.paste(BWR_WHITE, mask=white)
    output.paste(BWR_RED, mask=red)
    return output


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
    if not auto_fit:
        font_size = max(minimum_size, requested_size)
        font = load_font(font_size, bold)
        return font, font_size, max(1, round(font_size * 1.08))

    lower = max(1, minimum_size)
    upper = max(lower, min(1024, max(width, height) * 2))
    best_size = lower
    while lower <= upper:
        font_size = (lower + upper) // 2
        font = load_font(font_size, bold)
        boxes = [draw.textbbox((0, 0), line or " ", font=font) for line in lines]
        max_width = max((box[2] - box[0] for box in boxes), default=0)
        line_height = max(1, round(font_size * 1.08))
        if max_width <= width and line_height * len(lines) <= height:
            best_size = font_size
            lower = font_size + 1
        else:
            upper = font_size - 1
    best_size = max(minimum_size, best_size)
    font = load_font(best_size, bold)
    return font, best_size, max(1, round(best_size * 1.08))


def _draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: float,
    center_y: float,
    max_width: int,
    max_height: int,
    requested_size: int,
    *,
    bold: bool = True,
    fill: tuple[int, int, int, int] = (0, 0, 0, 255),
    minimum_size: int = 6,
) -> int:
    """Draw one readable line inside a strict box without covering nearby graphics."""
    font_size = max(minimum_size, int(requested_size))
    while font_size > minimum_size:
        font = load_font(font_size, bold)
        box = draw.textbbox((0, 0), text or " ", font=font)
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            break
        font_size -= 1
    font = load_font(font_size, bold)
    box = draw.textbbox((0, 0), text or " ", font=font)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    draw.text(
        (round(center_x - text_width / 2 - box[0]), round(center_y - text_height / 2 - box[1])),
        text,
        fill=fill,
        font=font,
    )
    return font_size


def _render_bound_text(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    backgrounds = {
        "black": (0, 0, 0, 255),
        "red": (220, 20, 12, 255),
        "white": (255, 255, 255, 255),
        "transparent": (0, 0, 0, 0),
    }
    background = (
        backgrounds["transparent"]
        if force_transparent
        else backgrounds.get(
            str(binding.get("backgroundColor") or "transparent"),
            backgrounds["transparent"],
        )
    )
    layer = Image.new("RGBA", (width, height), background)
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


def _render_bound_chart(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    width = max(24, round(float(binding.get("w", 24))))
    height = max(24, round(float(binding.get("h", 24))))
    palette = {
        "black": (0, 0, 0, 255),
        "red": (220, 20, 12, 255),
        "white": (255, 255, 255, 255),
    }
    background = (
        (0, 0, 0, 0)
        if force_transparent
        else palette.get(str(binding.get("backgroundColor") or "white"), palette["white"])
    )
    layer = Image.new("RGBA", (width, height), background)
    draw = ImageDraw.Draw(layer)
    values = _chart_values(value, int(binding.get("maxPoints", 48)))
    title = str(binding.get("chartTitle") or "")
    legend_size = max(6, min(14, int(binding.get("legendFontSize", 8))))
    show_axes = binding.get("showAxes") is not False
    show_grid = binding.get("showGrid") is not False
    show_values = bool(binding.get("showValues"))
    x_label = str(binding.get("xLabel") or "")
    y_label = str(binding.get("yLabel") or "")
    top = max(13, legend_size + 5) if title else 3
    right = 4
    bottom = max(12, legend_size + 5) if show_axes else 3
    if show_axes and x_label and height >= 64:
        bottom += legend_size + 2
    left = max(19, round(legend_size * 3.0)) if show_axes else 3
    if show_axes and y_label and width >= 100:
        left = max(44, left + legend_size * 2 + 2)
    left = min(left, max(3, round(width * 0.3)))
    plot_width = max(4, width - left - right)
    plot_height = max(4, height - top - bottom)
    if plot_width < 22 or plot_height < 18:
        show_axes = False
        show_grid = False
        x_label = ""
        y_label = ""
        left, right, bottom = 3, 3, 3
        top = max(12, legend_size + 4) if title else 3
        plot_width = max(4, width - left - right)
        plot_height = max(4, height - top - bottom)
    if title:
        _draw_centered_text(
            draw,
            title,
            width / 2,
            top / 2,
            max(8, width - 6),
            max(7, top - 2),
            min(legend_size + 2, 14),
        )
    if not values:
        _draw_centered_text(
            draw,
            "Bez dat",
            left + plot_width / 2,
            top + plot_height / 2,
            max(8, plot_width - 4),
            max(7, plot_height - 4),
            min(legend_size + 1, 12),
        )
        return layer

    def optional_number(name: str) -> float | None:
        raw = binding.get(name)
        if raw is None or str(raw).strip() == "":
            return None
        try:
            number = float(raw)
            return number if number == number else None
        except (TypeError, ValueError):
            return None

    explicit_min = optional_number("chartMin")
    explicit_max = optional_number("chartMax")
    minimum = explicit_min if explicit_min is not None else min(values)
    maximum = explicit_max if explicit_max is not None else max(values)
    if minimum == maximum:
        minimum -= 1
        maximum += 1
    if minimum > maximum:
        minimum, maximum = maximum, minimum
    if explicit_min is None or explicit_max is None:
        padding = max(0.01, (maximum - minimum) * 0.06)
        if explicit_min is None:
            minimum -= padding
        if explicit_max is None:
            maximum += padding
    span = max(1e-9, maximum - minimum)
    chart_type = str(binding.get("chartType") or "line")

    def x_for(index: int) -> float:
        if chart_type == "bar":
            return left + ((index + 0.5) / max(1, len(values))) * plot_width
        return left + (plot_width / 2 if len(values) == 1 else (index / (len(values) - 1)) * plot_width)

    def y_for(item: float) -> float:
        return top + plot_height - ((item - minimum) / span) * plot_height

    points = [(x_for(index), y_for(item)) for index, item in enumerate(values)]
    graph_color = palette.get(str(binding.get("graphColor") or "black"), palette["black"])
    color = palette.get(str(binding.get("color") or "black"), palette["black"])

    if show_grid:
        for step in range(4):
            grid_y = round(top + plot_height * step / 3)
            for grid_x in range(left, left + plot_width + 1, 4):
                draw.point((grid_x, grid_y), fill=graph_color)
        vertical_count = min(6, max(2, len(values) - 1))
        for step in range(vertical_count + 1):
            grid_x = round(left + plot_width * step / vertical_count)
            for grid_y in range(top, top + plot_height + 1, 4):
                draw.point((grid_x, grid_y), fill=graph_color)

    baseline_value = 0 if minimum <= 0 <= maximum else minimum
    baseline_y = y_for(baseline_value)
    if chart_type == "bar":
        slot = plot_width / max(1, len(values))
        bar_width = max(1, round(slot * 0.62))
        for x_pos, y_pos in points:
            x0 = round(x_pos - bar_width / 2)
            y0 = round(min(y_pos, baseline_y))
            y1 = round(max(y_pos, baseline_y))
            draw.rectangle((x0, y0, x0 + bar_width - 1, max(y0, y1)), fill=color)
    else:
        if chart_type == "area":
            polygon = [(points[0][0], baseline_y), *points, (points[-1][0], baseline_y)]
            draw.polygon(polygon, fill=color)
        if len(points) > 1:
            draw.line(points, fill=color, width=max(1, int(binding.get("strokeWidth", 2))))
        for x_pos, y_pos in points:
            draw.ellipse(
                (round(x_pos) - 1, round(y_pos) - 1, round(x_pos) + 1, round(y_pos) + 1),
                fill=color,
            )

    if show_axes:
        draw.line(
            (left, top, left, top + plot_height, left + plot_width, top + plot_height),
            fill=graph_color,
            width=1,
        )
        value_font = load_font(legend_size, False)
        max_text = f"{maximum:.2f}".rstrip("0").rstrip(".")
        min_text = f"{minimum:.2f}".rstrip("0").rstrip(".")
        for text, text_y in ((max_text, top), (min_text, top + plot_height)):
            box = draw.textbbox((0, 0), text, font=value_font)
            draw.text(
                (left - 3 - (box[2] - box[0]) - box[0], round(text_y - (box[3] - box[1]) / 2 - box[1])),
                text,
                fill=graph_color,
                font=value_font,
            )
        labels = [
            item.strip()
            for item in str(binding.get("chartLabels") or "").replace(";", ",").split(",")
            if item.strip()
        ][-len(values) :]
        indexes = [0, len(values) - 1]
        if len(values) > 2 and plot_width > 120:
            indexes.insert(1, (len(values) - 1) // 2)
        for index in sorted(set(indexes)):
            label = labels[index] if index < len(labels) else str(index + 1)
            _draw_centered_text(
                draw,
                label,
                x_for(index),
                top + plot_height + legend_size / 2 + 3,
                max(12, min(38, round(plot_width / max(2, len(indexes))))),
                max(7, legend_size + 2),
                legend_size,
                bold=False,
            )
        if x_label and height >= 64:
            _draw_centered_text(
                draw,
                x_label,
                left + plot_width / 2,
                height - legend_size / 2 - 1,
                plot_width,
                max(7, legend_size + 2),
                min(legend_size + 1, 14),
            )
        if y_label and width >= 100:
            label_layer = Image.new("RGBA", (plot_height, legend_size + 4), (255, 255, 255, 0))
            label_draw = ImageDraw.Draw(label_layer)
            _draw_centered_text(
                label_draw,
                y_label,
                plot_height / 2,
                (legend_size + 4) / 2,
                plot_height,
                legend_size + 4,
                min(legend_size + 1, 14),
            )
            label_layer = label_layer.rotate(90, expand=True, resample=Image.Resampling.NEAREST)
            layer.alpha_composite(label_layer, (1, top + max(0, (plot_height - label_layer.height) // 2)))

    if show_values:
        every = 1 if len(values) <= 10 else max(1, (len(values) + 7) // 8)
        for index, (x_pos, y_pos) in enumerate(points):
            if index % every and index != len(values) - 1:
                continue
            text = f"{values[index]:.2f}".rstrip("0").rstrip(".")
            font = load_font(legend_size, True)
            box = draw.textbbox((0, 0), text, font=font)
            text_width = box[2] - box[0]
            text_height = box[3] - box[1]
            label_y = max(top + text_height / 2 + 1, y_pos - text_height / 2 - 2)
            draw.rectangle(
                (
                    round(x_pos - text_width / 2 - 1),
                    round(label_y - text_height / 2 - 1),
                    round(x_pos + text_width / 2 + 1),
                    round(label_y + text_height / 2 + 1),
                ),
                fill=palette["white"],
            )
            _draw_centered_text(
                draw,
                text,
                x_pos,
                label_y,
                max(6, text_width + 2),
                max(7, text_height + 2),
                legend_size,
            )
    return layer


def _render_bound_layer(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """Render the graphical layer selected by a Home Assistant condition."""
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    source_width = max(1, int(binding.get("canvas_width", 296)))
    source_height = max(1, int(binding.get("canvas_height", 128)))
    scale_x = width / source_width
    scale_y = height / source_height
    # The outer canvas guesses white when composited over an unknown backdrop
    # (base_image/flat-color tiers); over a real clean_background capture there
    # is no need to guess, so it stays transparent and the real art shows
    # through everywhere except the widget's own drawn shapes (track, needle,
    # slice...) below. Those inner shapes keep their own opaque "plate" fills
    # (bar_gauge, pie) - that's deliberate legibility, not a background guess.
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0) if force_transparent else (255, 255, 255, 255))
    layers = binding.get("layers") if isinstance(binding.get("layers"), list) else []
    render_value: Any = value
    if isinstance(value, str) and value.lstrip().startswith("{"):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                render_value = parsed
        except json.JSONDecodeError:
            pass
    selection_value: Any = render_value
    if isinstance(render_value, dict):
        if "__selection__" in render_value:
            selection_value = render_value.get("__selection__")
        else:
            selector_entity_id = str(binding.get("entity_id") or "")
            selector_data = render_value.get(selector_entity_id)
            if isinstance(selector_data, dict):
                selector_attribute = str(binding.get("entity_attribute") or "")
                selection_value = (
                    selector_data.get(selector_attribute)
                    if selector_attribute
                    else selector_data.get("state")
                )
    selected = next((item for item in layers if isinstance(item, dict) and str(item.get("id")) == str(selection_value)), None)
    if selected is None:
        selected = next(
            (item for item in layers if isinstance(item, dict) and str(item.get("id")) == str(binding.get("default_symbol", ""))),
            layers[0] if layers else None,
        )
    if not isinstance(selected, dict):
        return output
    draw = ImageDraw.Draw(output)
    colors = {
        "black": (0, 0, 0, 255),
        "red": (220, 20, 12, 255),
        "white": (255, 255, 255, 255),
    }
    for item in selected.get("objects", []):
        if not isinstance(item, dict):
            continue
        x = round(float(item.get("x", 0)) * scale_x)
        y = round(float(item.get("y", 0)) * scale_y)
        item_width = max(1, round(float(item.get("w", 1)) * scale_x))
        item_height = max(1, round(float(item.get("h", 1)) * scale_y))
        item_type = item.get("type", "text")
        if item_type == "rect":
            fill_name = str(item.get("fill") or "none")
            stroke_name = str(item.get("stroke") or "none")
            if fill_name != "none":
                draw.rectangle((x, y, x + item_width, y + item_height), fill=colors.get(fill_name, colors["black"]))
            if stroke_name != "none":
                draw.rectangle(
                    (x, y, x + item_width, y + item_height),
                    outline=colors.get(stroke_name, colors["black"]),
                    width=max(1, round(float(item.get("stroke_width", 2)) * min(scale_x, scale_y))),
                )
        elif item_type == "image" and item.get("image"):
            try:
                icon = _decode_data_image(str(item["image"])).convert("RGBA")
                icon.thumbnail((item_width, item_height), Image.Resampling.LANCZOS)
                tint = str(item.get("tint") or "original")
                if tint in colors:
                    alpha = icon.getchannel("A")
                    icon = Image.new("RGBA", icon.size, colors[tint])
                    icon.putalpha(alpha)
                icon_x = x + (item_width - icon.width) // 2
                icon_y = y + (item_height - icon.height) // 2
                output.alpha_composite(icon, (icon_x, icon_y))
            except (ValueError, TypeError, OSError):
                continue
        elif item_type == "bar_gauge":
            min_val = float(item.get("min_value", 0))
            max_val = float(item.get("max_value", 100))
            unit = str(item.get("unit") or "%")
            numeric_val = _extract_item_value(item, render_value, min_val, max_val, 0.6)
            pct = max(0.0, min(1.0, (numeric_val - min_val) / max(0.0001, max_val - min_val)))
            color = colors.get(item.get("fill") or item.get("color") or "black", colors["black"])
            stroke = colors.get(item.get("stroke") or "black", colors["black"])
            show_value = item.get("show_value") is not False
            value_band = (
                min(max(13, round(item_height * 0.42)), max(13, item_height - 8))
                if show_value
                else 0
            )
            track_x = x + 1
            track_y = y + value_band + 1
            track_w = max(3, item_width - 2)
            track_h = max(4, item_height - value_band - 2)
            draw.rectangle((x, y, x + item_width - 1, y + item_height - 1), fill=colors["white"])
            draw.rectangle(
                (track_x, track_y, track_x + track_w - 1, track_y + track_h - 1),
                outline=stroke,
                width=max(1, min(3, int(item.get("stroke_width", 1)))),
            )
            if item.get("orientation") == "vertical":
                bar_h = round(max(0, track_h - 2) * pct)
                if bar_h > 0:
                    draw.rectangle(
                        (
                            track_x + 1,
                            track_y + track_h - 1 - bar_h,
                            track_x + track_w - 2,
                            track_y + track_h - 2,
                        ),
                        fill=color,
                    )
            else:
                bar_w = round(max(0, track_w - 2) * pct)
                if bar_w > 0:
                    draw.rectangle(
                        (track_x + 1, track_y + 1, track_x + bar_w, track_y + track_h - 2),
                        fill=color,
                    )
            if show_value:
                text_str = f"{round(numeric_val, 1)} {unit}".strip()
                _draw_centered_text(
                    draw,
                    text_str,
                    x + item_width / 2,
                    y + value_band / 2,
                    max(4, item_width - 4),
                    max(7, value_band - 2),
                    max(9, min(18, value_band - 3)),
                )

        elif item_type == "pie":
            min_val = float(item.get("min_value", 0))
            max_val = float(item.get("max_value", 100))
            unit = str(item.get("unit") or "%")
            numeric_val = _extract_item_value(item, render_value, min_val, max_val, 0.7)
            pct = max(0.0, min(1.0, (numeric_val - min_val) / max(0.0001, max_val - min_val)))
            color = colors.get(item.get("color") or "black", colors["black"])
            show_value = item.get("show_value") is not False
            hole_pct = max(0.0, min(0.8, float(item.get("hole_percent", 45)) / 100.0))
            separate_value = show_value and hole_pct < 0.32
            value_band = min(16, max(11, round(item_height * 0.2))) if separate_value else 0
            cx = x + item_width // 2
            cy = y + (item_height - value_band) // 2
            r = max(4, min(item_width, item_height - value_band) // 2 - 2)
            draw.rectangle((x, y, x + item_width - 1, y + item_height - 1), fill=colors["white"])
            draw.ellipse(
                (cx - r, cy - r, cx + r, cy + r),
                fill=colors["white"],
                outline=colors["black"],
                width=1,
            )
            if pct > 0:
                draw.pieslice((cx - r, cy - r, cx + r, cy + r), 270, 270 + pct * 360, fill=color)
            if hole_pct > 0:
                hr = round(r * hole_pct)
                draw.ellipse((cx - hr, cy - hr, cx + hr, cy + hr), fill=colors["white"], outline=colors["black"], width=1)
            if show_value:
                text_str = f"{round(numeric_val, 1)}{unit}"
                text_y = y + item_height - value_band / 2 if separate_value else cy
                max_text_width = (
                    max(8, item_width - 4)
                    if separate_value
                    else max(8, round(r * hole_pct * 1.72))
                )
                requested_size = (
                    max(8, min(14, value_band - 2))
                    if separate_value
                    else max(7, min(16, round(r * max(0.25, hole_pct) * 0.72)))
                )
                _draw_centered_text(
                    draw,
                    text_str,
                    cx,
                    text_y,
                    max_text_width,
                    max(7, value_band - 2) if separate_value else max(7, round(r * hole_pct * 1.4)),
                    requested_size,
                )

        elif item_type == "slider":
            min_val = float(item.get("min_value", 0))
            max_val = float(item.get("max_value", 100))
            unit = str(item.get("unit") or "°C")
            numeric_val = _extract_item_value(item, render_value, min_val, max_val, 0.5)
            pct = max(0.0, min(1.0, (numeric_val - min_val) / max(0.0001, max_val - min_val)))
            color = colors.get(item.get("color") or "black", colors["black"])
            margin = 10
            show_value = item.get("show_value") is not False
            value_band = min(16, max(11, round(item_height * 0.34))) if show_value else 2
            label_band = min(10, max(7, round(item_height * 0.2)))
            track_y = y + value_band + max(4, round((item_height - value_band - label_band) * 0.45))
            track_w = max(10, item_width - margin * 2)
            draw.line([(x + margin, track_y), (x + margin + track_w, track_y)], fill=colors["black"], width=2)
            fill_w = round(track_w * pct)
            if fill_w > 0:
                draw.line([(x + margin, track_y), (x + margin + fill_w, track_y)], fill=color, width=5)
            thumb_x = x + margin + fill_w
            draw.ellipse((thumb_x - 6, track_y - 6, thumb_x + 6, track_y + 6), fill=color, outline=colors["white"], width=2)
            label_font = load_font(max(7, min(9, label_band)), False)
            min_text = str(min_val)
            max_text = str(max_val)
            min_box = draw.textbbox((0, 0), min_text, font=label_font)
            max_box = draw.textbbox((0, 0), max_text, font=label_font)
            label_y = y + item_height - max(min_box[3] - min_box[1], max_box[3] - max_box[1])
            draw.text((x + margin - min_box[0], label_y - min_box[1]), min_text, fill=colors["black"], font=label_font)
            draw.text((x + margin + track_w - (max_box[2] - max_box[0]) - max_box[0], label_y - max_box[1]), max_text, fill=colors["black"], font=label_font)
            if show_value:
                text_str = f"{round(numeric_val, 1)} {unit}".strip()
                _draw_centered_text(
                    draw,
                    text_str,
                    x + item_width / 2,
                    y + value_band / 2,
                    max(4, item_width - 4),
                    max(7, value_band - 2),
                    max(8, min(14, value_band - 2)),
                )

        elif item_type in ("potentiometer", "gauge"):
            import math

            min_val = float(item.get("min_value", 0))
            max_val = float(item.get("max_value", 100))
            unit = str(item.get("unit") or "°C")
            numeric_val = _extract_item_value(item, render_value, min_val, max_val, 0.72)
            pct = max(0.0, min(1.0, (numeric_val - min_val) / max(0.0001, max_val - min_val)))
            color = colors.get(item.get("color") or "black", colors["black"])
            stroke_w = max(2, int(item.get("stroke_width", 6)))
            arc_mode = str(item.get("arc_mode") or "240")
            if arc_mode == "180":
                start_deg, end_deg = 180, 360
                cy = y + round(item_height * 0.8)
                radius_height = item_height * 0.75
            elif arc_mode == "360":
                start_deg, end_deg = -90, 270
                cy = y + round(item_height * 0.52)
                radius_height = item_height * 0.44
            else:
                start_deg, end_deg = 150, 390
                cy = y + round(item_height * 0.52)
                radius_height = item_height * 0.44
            cx = x + item_width // 2
            r = max(6, round(min(item_width, radius_height) - 6))
            draw.arc(
                (cx - r, cy - r, cx + r, cy + r),
                start_deg,
                end_deg,
                fill=colors["black"],
                width=max(1, min(2, stroke_w)),
            )
            curr_deg = start_deg + pct * (end_deg - start_deg)
            if item.get("show_arc") is not False and pct > 0:
                draw.arc((cx - r, cy - r, cx + r, cy + r), start_deg, curr_deg, fill=color, width=stroke_w)
            if item.get("show_needle") is not False:
                rad = math.radians(curr_deg)
                needle_r = r * 0.8
                nx = cx + math.cos(rad) * needle_r
                ny = cy + math.sin(rad) * needle_r
                draw.line([(cx, cy), (nx, ny)], fill=color, width=max(2, stroke_w // 2))
                draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=color)
            if item.get("show_value") is not False:
                text_str = f"{round(numeric_val, 1)} {unit}".strip()
                font_size = max(8, min(16, round(r * 0.34)))
                text_y = cy if arc_mode == "360" else min(
                    y + item_height - font_size / 2 - 1,
                    cy + r * 0.58,
                )
                font = load_font(font_size, True)
                bbox = draw.textbbox((0, 0), text_str, font=font)
                text_width = min(item_width - 4, bbox[2] - bbox[0] + 6)
                draw.rectangle(
                    (
                        round(cx - text_width / 2),
                        round(text_y - font_size * 0.58),
                        round(cx + text_width / 2),
                        round(text_y + font_size * 0.58),
                    ),
                    fill=colors["white"],
                )
                _draw_centered_text(
                    draw,
                    text_str,
                    cx,
                    text_y,
                    max(4, item_width - 6),
                    max(7, round(font_size * 1.1)),
                    font_size,
                )

        else:
            text = str(item.get("text") or "Text")
            font_size = max(8, round(float(item.get("font_size", 24)) * min(scale_x, scale_y)))
            font = load_font(font_size, bool(item.get("bold")))
            lines = text.split("\n")
            line_height = max(1, round(font_size * 1.08))
            start_y = y + max(0, (item_height - line_height * len(lines)) // 2)
            align = str(item.get("align") or "left")
            fill = colors["red"] if item.get("color") == "red" else colors["black"]
            for index, line in enumerate(lines):
                box = draw.textbbox((0, 0), line or " ", font=font)
                text_width = box[2] - box[0]
                text_x = x if align == "left" else x + item_width - text_width if align == "right" else x + (item_width - text_width) // 2
                draw.text((text_x - box[0], start_y + index * line_height - box[1]), line, fill=fill, font=font)
    if binding.get("flipH"):
        output = output.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    rotation = int(binding.get("rotation", 0)) % 360
    if rotation:
        output = output.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
    return output


def _render_bound_weather(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    w = max(1, round(float(binding.get("w", 100))))
    h = max(1, round(float(binding.get("h", 60))))
    output = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(output)
    colors = {"black": (0, 0, 0, 255), "red": (220, 20, 12, 255), "white": (255, 255, 255, 255)}
    if not force_transparent:
        draw.rectangle((0, 0, w - 1, h - 1), fill=colors["white"], outline=colors["black"])
    condition = str(value or binding.get("sample_value") or "sunny").lower()
    icon_symbol = "SUN"
    if "rain" in condition: icon_symbol = "RAIN"
    elif "cloud" in condition: icon_symbol = "CLOUD"
    elif "snow" in condition: icon_symbol = "SNOW"
    elif "thunder" in condition: icon_symbol = "STORM"
    temp_text = f"{binding.get('sample_temp', '21.5')} C"
    # _draw_centered_text loads its own font from the size it is given, so the
    # font that used to be built here was thrown away on every call.
    _draw_centered_text(draw, f"[{icon_symbol}] {temp_text}", w // 2, h // 2, w - 4, h - 4, max(10, round(h * 0.25)))
    return output


def _render_bound_ratio(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """A ratio() dial/ring/bar-list, redrawn from automation.py's live percent+text.

    Standing in for a template's own SVG dial/ring/meters art (panel-template-
    svg.mixin.js's _blockDial/_blockRing/_blockMeters) - close in shape, not a
    pixel match, the same tradeoff the freeform "layered" gauge widgets below
    already make on this PIL tier.
    """
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0) if force_transparent else (255, 255, 255, 255))
    draw = ImageDraw.Draw(output)
    colors = {"black": (0, 0, 0, 255), "red": (220, 20, 12, 255), "white": (255, 255, 255, 255)}
    try:
        meters = json.loads(str(value))
        if not isinstance(meters, list):
            meters = []
    except (TypeError, ValueError, json.JSONDecodeError):
        meters = []
    visual = str(binding.get("visual") or "bars")
    if visual in ("dial", "ring") and meters:
        meter = meters[0] if isinstance(meters[0], dict) else {}
        percent = max(0.0, min(100.0, float(meter.get("percent") or 0)))
        color = colors.get(str(meter.get("color") or "black"), colors["black"])
        value_text = str(meter.get("text") or "")
        caption = str(binding.get("caption") or "")
        cx = width / 2
        if visual == "dial":
            cy = height * 0.78
            r = max(6, min(width, height * 1.3) / 2 - 4)
            draw.arc((cx - r, cy - r, cx + r, cy + r), 150, 390, fill=colors["black"], width=2)
            if percent > 0:
                draw.arc((cx - r, cy - r, cx + r, cy + r), 150, 150 + percent / 100 * 240, fill=color, width=max(3, round(r * 0.16)))
            _draw_centered_text(draw, value_text, cx, cy - r * 0.35, r * 1.4, r * 0.5, max(9, round(r * 0.42)))
            if caption:
                _draw_centered_text(draw, caption, cx, cy + r * 0.15, r * 1.2, r * 0.28, max(7, round(r * 0.2)), bold=False)
            min_text, max_text = str(binding.get("min") or ""), str(binding.get("max") or "")
            if min_text:
                _draw_centered_text(draw, min_text, cx - r * 0.92, cy + r * 0.12, r * 0.5, r * 0.24, max(6, round(r * 0.16)), bold=False)
            if max_text:
                _draw_centered_text(draw, max_text, cx + r * 0.92, cy + r * 0.12, r * 0.5, r * 0.24, max(6, round(r * 0.16)), bold=False)
        else:
            cy = height / 2
            outer = max(6, min(width, height) * 0.46)
            inner = outer * 0.68
            hole_fill = (0, 0, 0, 0) if force_transparent else colors["white"]
            if percent > 0:
                draw.pieslice((cx - outer, cy - outer, cx + outer, cy + outer), -90, -90 + percent / 100 * 360, fill=color)
            draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), outline=colors["black"], width=1)
            draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=hole_fill, outline=colors["black"], width=1)
            _draw_centered_text(draw, value_text, cx, cy - (inner * 0.2 if caption else 0), inner * 1.6, inner * 0.7, max(9, round(inner * 0.5)))
            if caption:
                _draw_centered_text(draw, caption, cx, cy + inner * 0.5, inner * 1.4, inner * 0.32, max(7, round(inner * 0.26)), bold=False)
        return output
    line_height = height / max(1, len(meters))
    for index, meter in enumerate(meters):
        if not isinstance(meter, dict):
            continue
        top = line_height * index
        label_size = max(7, min(line_height * 0.42, width * 0.1))
        bar_height = max(2, line_height * 0.28)
        bar_y = top + line_height * 0.55
        percent = max(0.0, min(100.0, float(meter.get("percent") or 0))) / 100
        color = colors.get(str(meter.get("color") or "black"), colors["black"])
        label_font = load_font(round(label_size), False)
        value_font = load_font(round(label_size), True)
        draw.text((2, top + line_height * 0.06), str(meter.get("label") or ""), fill=colors["black"], font=label_font)
        value_text = str(meter.get("text") or "")
        value_box = draw.textbbox((0, 0), value_text or " ", font=value_font)
        draw.text((width - (value_box[2] - value_box[0]) - 2, top + line_height * 0.06), value_text, fill=color, font=value_font)
        draw.rectangle((0, bar_y, width - 1, bar_y + bar_height), outline=colors["black"], width=1)
        if percent > 0:
            draw.rectangle((1, bar_y + 1, max(1, round((width - 2) * percent)), bar_y + bar_height - 1), fill=color)
    return output


_FORECAST_CONDITION_ABBR = {
    "sunny": "JASNO", "clear-night": "JASNO", "partlycloudy": "OBLAČNO", "cloudy": "ZATAŽENO",
    "rainy": "DÉŠŤ", "pouring": "DÉŠŤ", "lightning": "BOUŘKA", "lightning-rainy": "BOUŘKA",
    "snowy": "SNÍH", "snowy-rainy": "SNÍH", "fog": "MLHA", "windy": "VÍTR", "windy-variant": "VÍTR",
    "hail": "KROUPY", "exceptional": "!",
}


def _render_bound_forecast(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """A day()-driven forecast strip, redrawn from automation.py's live weather.get_forecasts read."""
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0) if force_transparent else (255, 255, 255, 255))
    draw = ImageDraw.Draw(output)
    black = (0, 0, 0, 255)
    try:
        days = json.loads(str(value))
        if not isinstance(days, list):
            days = []
    except (TypeError, ValueError, json.JSONDecodeError):
        days = []
    if not days:
        return output
    cell_width = width / len(days)
    for index, day in enumerate(days):
        if not isinstance(day, dict):
            continue
        cx = cell_width * (index + 0.5)
        condition = _FORECAST_CONDITION_ABBR.get(str(day.get("condition") or "").lower(), "")
        _draw_centered_text(draw, str(day.get("label") or ""), cx, height * 0.14, cell_width * 0.92, height * 0.2, max(7, round(height * 0.14)))
        if condition:
            _draw_centered_text(draw, condition, cx, height * 0.5, cell_width * 0.92, height * 0.22, max(6, round(height * 0.12)), bold=False)
        _draw_centered_text(draw, str(day.get("value") or ""), cx, height * 0.82, cell_width * 0.92, height * 0.26, max(8, round(height * 0.2)))
        if index > 0:
            x = round(cell_width * index)
            draw.line([(x, round(height * 0.1)), (x, round(height * 0.9))], fill=black, width=1)
    return output


def _render_bound_calendar(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """An event()-driven calendar entry, redrawn from automation.py's live calendar.get_events read."""
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0) if force_transparent else (255, 255, 255, 255))
    draw = ImageDraw.Draw(output)
    black = (0, 0, 0, 255)
    color = (220, 20, 12, 255) if binding.get("color") == "red" else black
    try:
        entry = json.loads(str(value))
        if not isinstance(entry, dict):
            entry = {}
    except (TypeError, ValueError, json.JSONDecodeError):
        entry = {}
    box_w = min(height * 0.62, width * 0.26)
    draw.rectangle((0, 0, box_w, height - 1), outline=color, width=2)
    _draw_centered_text(draw, str(entry.get("day") or ""), box_w / 2, height * 0.4, box_w * 0.86, height * 0.5, max(10, round(height * 0.42)), fill=color)
    _draw_centered_text(draw, str(entry.get("month") or ""), box_w / 2, height * 0.8, box_w * 0.86, height * 0.28, max(7, round(height * 0.18)), fill=color, bold=False)
    text_x = box_w + max(4, width * 0.04)
    title_font = load_font(max(8, round(height * 0.24)), True)
    title_box = draw.textbbox((0, 0), str(entry.get("title") or "") or " ", font=title_font)
    draw.text((text_x, height * 0.22 - (title_box[3] - title_box[1]) / 2 - title_box[1]), str(entry.get("title") or ""), fill=black, font=title_font)
    detail_font = load_font(max(7, round(height * 0.18)), False)
    detail_box = draw.textbbox((0, 0), str(entry.get("detail") or "") or " ", font=detail_font)
    draw.text((text_x, height * 0.6 - (detail_box[3] - detail_box[1]) / 2 - detail_box[1]), str(entry.get("detail") or ""), fill=black, font=detail_font)
    return output


def _is_text_binding(binding: dict[str, Any]) -> bool:
    """A binding drawn as a single run of text (the default when no type is set)."""
    return binding.get("type") in (None, "", "text")


def _render_binding_layer(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """Rasterise one binding to its own RGBA layer."""
    if binding.get("type") == "chart":
        return _render_bound_chart(binding, value, force_transparent)
    if binding.get("type") == "series":
        return _render_bound_chart(binding, value, force_transparent)
    if binding.get("type") == "ratio":
        return _render_bound_ratio(binding, value, force_transparent)
    if binding.get("type") == "forecast":
        return _render_bound_forecast(binding, value, force_transparent)
    if binding.get("type") == "calendar":
        return _render_bound_calendar(binding, value, force_transparent)
    if binding.get("type") == "layered":
        return _render_bound_layer(binding, value, force_transparent)
    if binding.get("type") == "weather":
        return _render_bound_weather(binding, value, force_transparent)
    return _render_bound_text(binding, value, force_transparent)


def _composite_binding(image: Image.Image, binding: dict[str, Any], layer: Image.Image) -> None:
    """Alpha-composite a rendered layer, keeping it centred on the binding box."""
    x = round(float(binding.get("x", 0)))
    y = round(float(binding.get("y", 0)))
    x -= (layer.width - max(1, round(float(binding.get("w", 1))))) // 2
    y -= (layer.height - max(1, round(float(binding.get("h", 1))))) // 2
    image.alpha_composite(layer, (x, y))


def render_entity_bound_image(
    base_image: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
) -> Image.Image:
    """Compose current Home Assistant entity values over a designer background."""
    image = _decode_data_image(base_image).convert("RGBA")
    for binding in bindings:
        value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
        _composite_binding(image, binding, _render_binding_layer(binding, value))
    return quantize_bwr_preview(image)


def _svg_text_slot(binding: dict[str, Any], value: str) -> str:
    """Rebuild one dynamic text slot as an SVG rect + <text>, matching the panel.

    The panel captured the slot geometry as hex colours and an anchor point in
    svg.* (panel-devices.mixin.js). The rect repaints the background so the stale
    value baked into the base image is covered - the same job _render_bound_text's
    background fill does in the PIL path.
    """
    svg = binding.get("svg") or {}
    parts: list[str] = []
    background = str(svg.get("bg") or "none")
    if background and background != "none":
        parts.append(
            f'<rect x="{float(svg.get("x", 0)):.2f}" y="{float(svg.get("y", 0)):.2f}"'
            f' width="{float(svg.get("w", 1)):.2f}" height="{float(svg.get("h", 1)):.2f}"'
            f' fill="{background}"/>'
        )
    parts.append(
        build_text_element(
            value,
            float(svg.get("cx", 0)),
            float(svg.get("cy", 0)),
            float(svg.get("size", 12)),
            bold=bool(svg.get("bold")),
            anchor=str(svg.get("anchor") or "middle"),
            color=str(svg.get("color") or "#000000"),
            max_width=float(svg.get("maxWidth", 0) or 0),
        )
    )
    return "".join(parts)


def render_entity_bound_svg_image(
    base_image: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
) -> Image.Image:
    """Like render_entity_bound_image, but dynamic text is rasterised through resvg.

    Text slots that carry svg geometry are drawn by an SVG engine with the bundled
    Arimo - the same font and layout the panel used for the manual send - so an
    automatic refresh matches it. Charts and gauges keep the PIL path. If the SVG
    rasteriser is unavailable or fails, every text slot falls back to PIL, so the
    image is always complete.
    """
    image = _decode_data_image(base_image).convert("RGBA")
    svg_text_bindings: list[dict[str, Any]] = []
    for binding in bindings:
        value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
        if _is_text_binding(binding) and binding.get("svg"):
            svg_text_bindings.append(binding)
            continue
        _composite_binding(image, binding, _render_binding_layer(binding, value))

    layer = None
    if svg_text_bindings:
        slots = "".join(
            _svg_text_slot(
                binding,
                values.get(str(binding.get("id")), str(binding.get("fallback", ""))),
            )
            for binding in svg_text_bindings
        )
        width, height = image.size
        document = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"'
            f' viewBox="0 0 {width} {height}">{slots}</svg>'
        )
        layer = svg_render.rasterize_svg(document, width, height)

    if layer is not None:
        image.alpha_composite(layer)
    else:
        # No rasteriser (or it failed): draw the very same slots through PIL so the
        # refresh is never left with missing values. Force the captured font size
        # instead of PIL's autoFit, which would grow the text to fill the box and
        # produce the oversized, off-size look this whole path exists to avoid.
        for binding in svg_text_bindings:
            value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
            fixed = {**binding, "autoFit": False}
            _composite_binding(image, fixed, _render_bound_text(fixed, value))

    return quantize_bwr_preview(image)


_SVG_ROOT_SIZE = re.compile(r'<svg\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"')


def _svg_template_size(svg_template: str) -> tuple[int, int] | None:
    match = _SVG_ROOT_SIZE.search(svg_template)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _replace_svg_element_by_id(document: str, element_id: str, replacement: str) -> str:
    """Swap one `<text id="...">...</text>` run for a freshly built element.

    A plain string search-and-replace, not an XML parse: the document was
    serialised by the browser and only ever needs one element located by the id
    the panel stamped on it when it captured this template, so a regex spares a
    dependency without giving up correctness.
    """
    pattern = re.compile(
        r"<text\b[^>]*\bid=\"" + re.escape(element_id) + r"\"[^>]*>.*?</text>",
        re.DOTALL,
    )
    return pattern.sub(lambda _match: replacement, document, count=1)


def _replace_svg_image_href_by_id(document: str, element_id: str, data_url: str) -> str:
    """Swap the `href` of one `<image id="...">` element for a fresh data: URL.

    Only the attribute changes - the element's position and size, set when the
    panel captured the template, stay exactly as designed.
    """
    pattern = re.compile(
        r'(<image\b[^>]*\bid="' + re.escape(element_id) + r'"[^>]*\bhref=")[^"]*(")'
    )
    return pattern.sub(lambda match: match.group(1) + data_url + match.group(2), document, count=1)


async def async_render_camera_binding_data_url(
    hass: Any, entity_id: str, width: int, height: int, country: str = "cz"
) -> str | None:
    """Fetch a camera entity's current snapshot, fit and quantise it for the panel.

    Shared by the Meteoradar preview command (ws_meteoradar.py) and automatic
    refreshes (automation.py): both need the exact same "current camera frame,
    ready for the three-colour panel" image.

    If the camera entity does not exist (or fails to fetch), it falls back to
    rendering the live RainViewer precipitation map directly (async_render_meteoradar).
    """
    from homeassistant.components.camera import async_get_image
    from .meteoradar import async_render_meteoradar

    camera_image = None
    try:
        camera_image = await async_get_image(hass, entity_id)
    except Exception:
        camera_image = None

    if camera_image is not None and getattr(camera_image, "content", None):
        def _prepare_camera() -> bytes | None:
            try:
                source = Image.open(io.BytesIO(camera_image.content)).convert("RGB")
            except Exception:
                return None
            fitted = fit_to_size(source, width, height)
            quantized = quantize_bwr_preview(fitted)
            buffer = io.BytesIO()
            quantized.save(buffer, format="PNG")
            return buffer.getvalue()

        png_bytes = await hass.async_add_executor_job(_prepare_camera)
        if png_bytes is not None:
            return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")

    # Fallback: render directly via RainViewer for camera.meteoradar or missing camera entity
    try:
        radar_img = await async_render_meteoradar(hass, country=country)
        if radar_img is not None:
            def _prepare_radar() -> bytes:
                fitted = fit_to_size(radar_img, width, height)
                quantized = quantize_bwr_preview(fitted)
                buffer = io.BytesIO()
                quantized.save(buffer, format="PNG")
                return buffer.getvalue()

            png_bytes = await hass.async_add_executor_job(_prepare_radar)
            return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
    except Exception:
        pass

    return None



def render_entity_bound_template_image(
    svg_template: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
) -> Image.Image | None:
    """Rebuild the exact template the panel would draw, with live entity values.

    A manual send always redraws the whole template from its designer state, so
    whatever sits behind a bound value - an icon, a gradient band, a background
    photo - is simply part of the picture. Patching a coloured rectangle over an
    isolated text slot (render_entity_bound_svg_image) cannot know what that
    background really was and has to guess, which is exactly why an automatic
    refresh could come out looking nothing like the manual send whenever a slot
    sat on anything but a plain matching rect.

    Here the panel instead hands over the complete SVG it built for the template
    - the same one behind the manual send - with every bound run tagged by id.
    Substituting fresh values into that document and rasterising the whole thing
    reproduces the manual send exactly, backgrounds included. Bindings without an
    id in the document (charts, gauges, signals - drawn on the canvas overlay,
    never part of the SVG) are composited on top afterwards exactly as before.

    Returns None - never partially applied - when the rasteriser is unavailable
    or the template can't be parsed, so the caller falls back to the
    base_image-compositing path instead of shipping a half-built image.
    """
    if not svg_render.render_available():
        return None
    size = _svg_template_size(svg_template)
    if size is None:
        return None
    width, height = size

    document = svg_template
    remaining: list[dict[str, Any]] = []
    for binding in bindings:
        element_id = str(binding.get("id") or "")
        if binding.get("type") == "camera" and element_id:
            # The fresh snapshot (a data: URL) was already fetched and quantised
            # asynchronously by the caller - camera.async_get_image needs the
            # event loop, which this synchronous compositor does not have.
            data_url = values.get(element_id)
            if data_url and f'id="{element_id}"' in document:
                document = _replace_svg_image_href_by_id(document, element_id, str(data_url))
            # No fresh snapshot: leave the <image> exactly as captured rather
            # than dropping it, so a transient fetch failure still ships the
            # last-known map instead of a blank slot.
            continue
        if not (_is_text_binding(binding) and binding.get("svg") and element_id):
            remaining.append(binding)
            continue
        if f'id="{element_id}"' not in document:
            # The panel could not tag this run when the template was captured
            # (an id collision, or the value has since gone empty). Composite it
            # like every other widget instead of leaving the stale text in place.
            remaining.append(binding)
            continue
        value = values.get(element_id, str(binding.get("fallback", "")))
        svg = binding["svg"]
        replacement = build_text_element(
            value,
            float(svg.get("cx", 0)),
            float(svg.get("cy", 0)),
            float(svg.get("size", 12)),
            bold=bool(svg.get("bold")),
            anchor=str(svg.get("anchor") or "middle"),
            color=str(svg.get("color") or "#000000"),
            max_width=float(svg.get("maxWidth", 0) or 0),
            element_id=element_id,
        )
        document = _replace_svg_element_by_id(document, element_id, replacement)

    image = svg_render.rasterize_svg(document, width, height, background="#ffffff")
    if image is None:
        return None
    image = image.convert("RGBA")
    for binding in remaining:
        value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
        _composite_binding(image, binding, _render_binding_layer(binding, value))
    return quantize_bwr_preview(image)


def render_entity_bound_clean_background_image(
    clean_background: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
) -> Image.Image | None:
    """Composite fresh values over a true, value-free background capture.

    clean_background is rendered by the panel itself - a real browser SVG/canvas,
    the same one a manual send uses, with every dynamic binding blanked out
    (text removed, camera image hidden, chart/gauge/signal/slider overlay
    widgets never drawn). No guessed flat rectangle ever has to stand in for
    art the backend cannot see, so this tier matches a manual send for every
    binding type - not just text - and needs no SVG rasteriser (resvg_py),
    so it works the same on every Home Assistant platform.

    Returns None - never partially applied - when clean_background cannot be
    decoded, so the caller falls back to the older, resvg-dependent tiers.
    """
    try:
        image = _decode_data_image(clean_background).convert("RGBA")
    except Exception:
        return None
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        element_id = str(binding.get("id") or "")
        value = values.get(element_id, str(binding.get("fallback", "")))
        if binding.get("type") == "camera":
            # A fresh snapshot was already fetched and quantised asynchronously
            # by the caller (async_render_camera_binding_data_url needs the
            # event loop, which this synchronous compositor does not have) -
            # composited directly rather than through _render_binding_layer,
            # which has no camera case (that dispatch only ever serves the
            # SVG-substitution tier, where a camera value swaps an <image>
            # href instead of being pasted as its own layer).
            if not value:
                continue
            try:
                camera_layer = _decode_data_image(value).convert("RGBA")
            except Exception:
                continue
            _composite_binding(image, binding, camera_layer)
            continue
        _composite_binding(
            image, binding, _render_binding_layer(binding, value, force_transparent=True)
        )
    return quantize_bwr_preview(image)


def render_automatic_refresh_image(
    base_image: str,
    svg_template: str,
    clean_background: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
) -> Image.Image:
    """Pick the closest-to-manual rendering path an automatic refresh can use.

    Preferred: composite fresh values over a real, value-free background the
    panel captured at manual-send time (render_entity_bound_clean_background_image)
    - this matches a manual send exactly, for every binding type, on any
    platform, because nothing about it is guessed. Falls back - for designs
    saved before this existed - to rebuilding the captured template SVG with
    fresh values (render_entity_bound_template_image), then to patching
    individual text slots over the stored base_image (render_entity_bound_svg_image,
    correct font/size but blind to whatever the slot's real background was),
    and finally to plain PIL compositing, so a refresh always produces a
    complete image rather than erroring out.
    """
    if clean_background:
        image = render_entity_bound_clean_background_image(clean_background, bindings, values)
        if image is not None:
            return image
    if svg_template:
        image = render_entity_bound_template_image(svg_template, bindings, values)
        if image is not None:
            return image
    if svg_render.render_available() and any(
        isinstance(binding, dict) and binding.get("svg") for binding in bindings
    ):
        return render_entity_bound_svg_image(base_image, bindings, values)
    return render_entity_bound_image(base_image, bindings, values)


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


def expected_buffer_size(sdk_type: int) -> tuple[int, int]:
    """Get the physical hardware pixel buffer dimensions (width, height) expected by display IC."""
    code = int(sdk_type)
    native_w, native_h = display_size(sdk_type)
    if code in PE29_CODES:
        return (128, 296)
    if code in (264, 267, 270):
        return (128, 250)
    if code == 11:
        return (104, 212)
    return (native_w, native_h)


def prepare_image_for_display(
    sdk_type: int,
    image: Image.Image,
    transform: str | None = None,
    orientation: str | None = None,
) -> Image.Image:
    """Map canvas image (landscape or portrait) to exact hardware display buffer dimensions."""
    code = int(sdk_type)
    target_w, target_h = expected_buffer_size(sdk_type)
    native_w, native_h = display_size(sdk_type)

    if image.mode != "RGB":
        image = image.convert("RGB")

    is_portrait = (
        orientation == "portrait"
        or image.width < image.height
    )

    if code in PE29_CODES:
        # PE29 hardware buffer is 128 wide x 296 high
        if is_portrait:
            # Design is 128x296 portrait layout -> ALREADY 128x296
            if transform == "rotate_180":
                image = image.rotate(180, expand=True)
            elif transform == "flip_lr":
                image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            elif transform == "flip_tb":
                image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            elif transform == "rotate_ccw":
                image = image.rotate(180, expand=True)
        else:
            # Design is 296x128 landscape layout -> rotate 90 deg into 128x296 buffer
            if transform in ("none", "rotate_cw"):
                image = image.rotate(90, expand=True)
            elif transform == "rotate_ccw":
                image = image.rotate(-90, expand=True)
            elif transform == "rotate_180":
                image = image.rotate(-90, expand=True)
            elif transform == "flip_lr":
                image = image.rotate(90, expand=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            elif transform == "flip_tb":
                image = image.rotate(90, expand=True).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            else:
                image = image.rotate(90, expand=True)
    elif code in (264, 267, 270):
        if is_portrait:
            if transform == "rotate_180":
                image = image.rotate(180, expand=True)
        else:
            image = image.rotate(90, expand=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    elif code == 11:
        if not is_portrait:
            image = image.rotate(-90, expand=True)
    elif code == 75 and image.width == 300:
        image = image.rotate(90, expand=True)
    else:
        # General ePaper panels (native_w x native_h)
        if native_w >= native_h:
            if is_portrait:
                if transform in ("rotate_ccw", "rotate_ccw_flip_lr"):
                    image = image.rotate(90, expand=True)
                else:
                    image = image.rotate(-90, expand=True)
            else:
                if transform == "rotate_180":
                    image = image.rotate(180, expand=True)
                elif transform == "flip_lr":
                    image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                elif transform == "flip_tb":
                    image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        else:
            if not is_portrait:
                image = image.rotate(90, expand=True)

    # Fail-safe dimension check: Guarantee image matches exact target buffer size
    if image.size != (target_w, target_h):
        if (image.height, image.width) == (target_w, target_h):
            image = image.rotate(-90, expand=True)
        if image.size != (target_w, target_h):
            image = image.resize((target_w, target_h), Image.Resampling.LANCZOS)

    return image


# Flat masks only ever hold 0x00 or 0xff, so any non-zero byte maps to bit "1".
_FLAT_MASK_TO_BITS = bytes(ord("0") if value == 0 else ord("1") for value in range(256))


def _pack_planes_unaligned(
    white: Image.Image, red: Image.Image, pixel_count: int
) -> bytes:
    """Pack bit planes continuously for displays whose width is not a multiple of 8."""
    plane_size = pixel_count // 8
    planes = bytearray()
    for mask in (white, red):
        # "L" gives one byte per pixel with no row padding, so the bit string below
        # follows the same left-to-right, top-to-bottom order the display expects.
        digits = mask.convert("L").tobytes().translate(_FLAT_MASK_TO_BITS)
        planes += int(digits, 2).to_bytes(plane_size, "big")
    return bytes(planes)


def pack_bwr_image(
    sdk_type: int,
    image: Image.Image,
    transform: str | None = None,
    orientation: str | None = None,
) -> bytes:
    image = prepare_image_for_display(sdk_type, image, transform, orientation)
    width, height = image.size
    pixel_count = width * height
    if pixel_count % 8 != 0:
        raise ValueError(f"Display pixel count is not byte aligned: {width}x{height}")

    white, red = bwr_masks(image)
    if width % 8 == 0:
        # Mode "1" already stores 8 pixels per byte, most significant bit first,
        # padding every row up to a byte boundary. A byte-aligned width leaves no
        # padding, so the raw buffer is exactly the continuous bit plane wanted.
        return white.tobytes() + red.tobytes()

    # Widths like 212, 250, 196 and 210 are not byte aligned, so the row padding
    # above would shift the stream. Pack those from the flat masks instead.
    return _pack_planes_unaligned(white, red, pixel_count)


def pack_bwr_region(image: Image.Image) -> bytes:
    """Pack a partial-update crop without resizing it to the full panel."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixel_count = width * height
    if pixel_count % 8 != 0:
        raise ValueError(
            f"Partial display region is not byte aligned: {width}x{height}"
        )
    white, red = bwr_masks(rgb)
    if width % 8 == 0:
        return white.tobytes() + red.tobytes()
    return _pack_planes_unaligned(white, red, pixel_count)
