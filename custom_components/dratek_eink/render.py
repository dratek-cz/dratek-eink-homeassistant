from __future__ import annotations

import base64
import io
import json
import math
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageMath

from . import svg_blocks, svg_render
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
    # Default and clamp mirror _drawChart's own (panel-draw-charts.mixin.js) -
    # a captured legendFontSize now always arrives (see the frontend capture
    # site), but the range still has to agree or a custom size near either
    # edge would clamp differently on refresh than it did on the manual send.
    legend_size = max(10, min(24, int(binding.get("legendFontSize", 12))))
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


def _render_bound_series(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """A series()-driven template row, redrawn from automation.py's live series read.

    Mirrors _blockBars/_blockSpark (panel-template-svg.mixin.js) - a plain bar
    row or sparkline with no axes, grid or legend - not the free-form chart
    widget's axis/grid/legend chart (_render_bound_chart, used by "chart"
    bindings). A "series" binding used to be routed through that chart
    renderer too, which drew a completely different, decorated chart style
    for what a manual send draws as a bare row.
    """
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0) if force_transparent else (255, 255, 255, 255))
    draw = ImageDraw.Draw(output)
    black = (0, 0, 0, 255)
    red = (220, 20, 12, 255)
    values = _chart_values(value, int(binding.get("maxPoints", 96)))
    if str(binding.get("chartType") or "line") == "bar":
        if not values:
            return output
        labels = [str(label) for label in (binding.get("labels") or [])]
        has_labels = any(labels)
        label_height = min(height * 0.28, 13) if has_labels else 0
        chart_height = max(1, height - label_height)
        top_value = max(values)
        bottom_value = min(min(values), 0)
        span = (top_value - bottom_value) or 1
        step = width / len(values)
        bar_width = max(1, step * 0.68)
        try:
            highlight_index = int(binding.get("highlight"))
        except (TypeError, ValueError):
            highlight_index = -1
        draw.line([(0, chart_height), (width, chart_height)], fill=black, width=1)
        for index, item in enumerate(values):
            bar_height = max(1, ((item - bottom_value) / span) * (chart_height - 1))
            x0 = index * step + (step - bar_width) / 2
            color = red if index == highlight_index else black
            draw.rectangle((x0, chart_height - bar_height, x0 + bar_width, chart_height), fill=color)
        if has_labels:
            label_size = max(7, round(label_height * 0.7))
            for index, label in enumerate(labels[: len(values)]):
                if not label:
                    continue
                label_width = min(width, max(step * 0.95, step * 3.5))
                raw_x = step * (index + 0.5)
                label_x = max(label_width / 2, min(width - label_width / 2, raw_x))
                _draw_centered_text(
                    draw, label, label_x, chart_height + label_height * 0.58,
                    round(label_width), round(label_height), label_size, bold=False,
                )
        return output
    if len(values) < 2:
        return output
    top_value = max(values)
    bottom_value = min(values)
    span = (top_value - bottom_value) or 1
    step = width / (len(values) - 1)
    points = [(index * step, height - ((item - bottom_value) / span) * height) for index, item in enumerate(values)]
    draw.line([(0, height), (width, height)], fill=black, width=1)
    draw.line(points, fill=black, width=max(1, round(height * 0.05)), joint="curve")
    last_x, last_y = points[-1]
    dot_radius = max(1.5, height * 0.08)
    draw.ellipse((last_x - dot_radius, last_y - dot_radius, last_x + dot_radius, last_y + dot_radius), fill=red)
    caption = str(binding.get("caption") or "")
    if caption:
        caption_size = max(5, round(height * 0.18))
        font = load_font(caption_size, False)
        box = draw.textbbox((0, 0), caption, font=font)
        draw.text((-box[0], round(height * 0.14 - (box[3] - box[1]) / 2 - box[1])), caption, fill=black, font=font)
    return output


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
            margin = 12
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
            draw.ellipse((thumb_x - 9, track_y - 9, thumb_x + 9, track_y + 9), fill=color, outline=colors["white"], width=2)
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
                needle_r = r * 0.82
                nx = cx + math.cos(rad) * needle_r
                ny = cy + math.sin(rad) * needle_r
                draw.line([(cx, cy), (nx, ny)], fill=color, width=max(2, round(stroke_w * 0.6)))
                hub_r = max(3, round(stroke_w * 0.7))
                draw.ellipse((cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r), fill=color)
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
            # Radius, centre and the 180deg-360deg sweep all mirror _blockDial
            # (panel-template-svg.mixin.js) - a flat half-dial open at the top,
            # not the wider ~240deg speedometer arc this used to draw at an
            # independently-computed radius.
            outer = max(6, min(width * 0.46, height * 0.82))
            inner = outer * 0.7
            cy = height * 0.5 + outer * 0.4
            band_r = (outer + inner) / 2
            band_width = max(2, round(outer - inner))
            draw.arc((cx - band_r, cy - band_r, cx + band_r, cy + band_r), 180, 360, fill=colors["black"], width=1)
            if percent > 0:
                draw.arc((cx - band_r, cy - band_r, cx + band_r, cy + band_r), 180, 180 + percent / 100 * 180, fill=color, width=band_width)
            _draw_centered_text(draw, value_text, cx, cy - outer * 0.28, inner * 1.8, outer * 0.6, max(9, round(outer * 0.42)))
            if caption:
                _draw_centered_text(draw, caption, cx, cy + outer * 0.16, inner * 1.9, outer * 0.32, max(7, round(outer * 0.24)), bold=False)
            min_text, max_text = str(binding.get("min") or ""), str(binding.get("max") or "")
            if min_text:
                _draw_centered_text(draw, min_text, cx - outer, cy + outer * 0.22, outer * 0.7, outer * 0.28, max(6, round(outer * 0.2)), bold=False)
            if max_text:
                _draw_centered_text(draw, max_text, cx + outer, cy + outer * 0.22, outer * 0.7, outer * 0.28, max(6, round(outer * 0.2)), bold=False)
        else:
            cy = height / 2
            outer = max(6, min(width, height) * 0.46)
            inner = outer * 0.68
            hole_fill = (0, 0, 0, 0) if force_transparent else colors["white"]
            if percent > 0:
                draw.pieslice((cx - outer, cy - outer, cx + outer, cy + outer), -90, -90 + percent / 100 * 360, fill=color)
            draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), outline=colors["black"], width=1)
            draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=hole_fill, outline=colors["black"], width=1)
            # Text scale mirrors _blockRing (inner*0.62/inner*0.34) - the
            # previous inner*0.5/inner*0.26 rendered ~20-25% smaller than a
            # manual send for every ring gauge template (living.js, server.js...).
            _draw_centered_text(draw, value_text, cx, cy - (inner * 0.2 if caption else 0), inner * 1.7, inner * 0.7, max(9, round(inner * 0.62)))
            if caption:
                _draw_centered_text(draw, caption, cx, cy + inner * 0.46, inner * 1.7, inner * 0.32, max(7, round(inner * 0.34)), bold=False)
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

# Same condition->icon map as _weatherConditionIcon in panel-devices.mixin.js.
_WEATHER_CONDITION_ICON_NAMES = {
    "clear-night": "weather-night", "cloudy": "weather-cloudy", "exceptional": "alert-circle-outline",
    "fog": "weather-fog", "hail": "weather-hail", "lightning": "weather-lightning",
    "lightning-rainy": "weather-lightning-rainy", "partlycloudy": "weather-partly-cloudy",
    "pouring": "weather-pouring", "rainy": "weather-rainy", "snowy": "weather-snowy",
    "snowy-rainy": "weather-snowy-rainy", "sunny": "weather-sunny", "windy": "weather-windy",
    "windy-variant": "weather-windy",
}

# The panel resolves an MDI glyph at runtime by letting Home Assistant's own
# ha-icon render it (_resolveMdiIcon in panel-template-svg.mixin.js) - nothing
# this backend can reach headlessly. These are the same 14 glyphs' path data
# from @mdi/js 7.4.47 (Apache-2.0, pictogrammers.com) instead, rasterised
# through the same resvg backend the text-substitution tier already depends
# on, so a forecast day shows a real weather icon rather than a text
# abbreviation standing in for one.
_MDI_WEATHER_ICON_PATHS = {
    "alert-circle-outline": "M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z",
    "weather-cloudy": "M6,19A5,5 0 0,1 1,14A5,5 0 0,1 6,9C7,6.65 9.3,5 12,5C15.43,5 18.24,7.66 18.5,11.03L19,11A4,4 0 0,1 23,15A4,4 0 0,1 19,19H6M19,13H17V12A5,5 0 0,0 12,7C9.5,7 7.45,8.82 7.06,11.19C6.73,11.07 6.37,11 6,11A3,3 0 0,0 3,14A3,3 0 0,0 6,17H19A2,2 0 0,0 21,15A2,2 0 0,0 19,13Z",
    "weather-fog": "M3,15H13A1,1 0 0,1 14,16A1,1 0 0,1 13,17H3A1,1 0 0,1 2,16A1,1 0 0,1 3,15M16,15H21A1,1 0 0,1 22,16A1,1 0 0,1 21,17H16A1,1 0 0,1 15,16A1,1 0 0,1 16,15M1,12A5,5 0 0,1 6,7C7,4.65 9.3,3 12,3C15.43,3 18.24,5.66 18.5,9.03L19,9C21.19,9 22.97,10.76 23,13H21A2,2 0 0,0 19,11H17V10A5,5 0 0,0 12,5C9.5,5 7.45,6.82 7.06,9.19C6.73,9.07 6.37,9 6,9A3,3 0 0,0 3,12C3,12.35 3.06,12.69 3.17,13H1.1L1,12M3,19H5A1,1 0 0,1 6,20A1,1 0 0,1 5,21H3A1,1 0 0,1 2,20A1,1 0 0,1 3,19M8,19H21A1,1 0 0,1 22,20A1,1 0 0,1 21,21H8A1,1 0 0,1 7,20A1,1 0 0,1 8,19Z",
    "weather-hail": "M6,14A1,1 0 0,1 7,15A1,1 0 0,1 6,16A5,5 0 0,1 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16H18A1,1 0 0,1 17,15A1,1 0 0,1 18,14H19A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11A3,3 0 0,0 6,14M10,18A2,2 0 0,1 12,20A2,2 0 0,1 10,22A2,2 0 0,1 8,20A2,2 0 0,1 10,18M14.5,16A1.5,1.5 0 0,1 16,17.5A1.5,1.5 0 0,1 14.5,19A1.5,1.5 0 0,1 13,17.5A1.5,1.5 0 0,1 14.5,16M10.5,12A1.5,1.5 0 0,1 12,13.5A1.5,1.5 0 0,1 10.5,15A1.5,1.5 0 0,1 9,13.5A1.5,1.5 0 0,1 10.5,12Z",
    "weather-lightning": "M6,16A5,5 0 0,1 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16H18A1,1 0 0,1 17,15A1,1 0 0,1 18,14H19A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11A3,3 0 0,0 6,14H7A1,1 0 0,1 8,15A1,1 0 0,1 7,16H6M12,11H15L13,15H15L11.25,22L12,17H9.5L12,11Z",
    "weather-lightning-rainy": "M4.5,13.59C5,13.87 5.14,14.5 4.87,14.96C4.59,15.44 4,15.6 3.5,15.33V15.33C2,14.47 1,12.85 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16A1,1 0 0,1 18,15A1,1 0 0,1 19,14A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11C3,12.11 3.6,13.08 4.5,13.6V13.59M9.5,11H12.5L10.5,15H12.5L8.75,22L9.5,17H7L9.5,11M17.5,18.67C17.5,19.96 16.5,21 15.25,21C14,21 13,19.96 13,18.67C13,17.12 15.25,14.5 15.25,14.5C15.25,14.5 17.5,17.12 17.5,18.67Z",
    "weather-night": "M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z",
    "weather-partly-cloudy": "M12.74,5.47C15.1,6.5 16.35,9.03 15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27C5,12.45 4.6,10.24 5.5,8.26C6.72,5.5 9.97,4.24 12.74,5.47M11.93,7.3C10.16,6.5 8.09,7.31 7.31,9.07C6.85,10.09 6.93,11.22 7.41,12.13C8.5,10.83 10.16,10 12,10C12.7,10 13.38,10.12 14,10.34C13.94,9.06 13.18,7.86 11.93,7.3M13.55,3.64C13,3.4 12.45,3.23 11.88,3.12L14.37,1.82L15.27,4.71C14.76,4.29 14.19,3.93 13.55,3.64M6.09,4.44C5.6,4.79 5.17,5.19 4.8,5.63L4.91,2.82L7.87,3.5C7.25,3.71 6.65,4.03 6.09,4.44M18,9.71C17.91,9.12 17.78,8.55 17.59,8L19.97,9.5L17.92,11.73C18.03,11.08 18.05,10.4 18,9.71M3.04,11.3C3.11,11.9 3.24,12.47 3.43,13L1.06,11.5L3.1,9.28C3,9.93 2.97,10.61 3.04,11.3M19,18H16V16A4,4 0 0,0 12,12A4,4 0 0,0 8,16H6A2,2 0 0,0 4,18A2,2 0 0,0 6,20H19A1,1 0 0,0 20,19A1,1 0 0,0 19,18Z",
    "weather-pouring": "M9,12C9.53,12.14 9.85,12.69 9.71,13.22L8.41,18.05C8.27,18.59 7.72,18.9 7.19,18.76C6.65,18.62 6.34,18.07 6.5,17.54L7.78,12.71C7.92,12.17 8.47,11.86 9,12M13,12C13.53,12.14 13.85,12.69 13.71,13.22L11.64,20.95C11.5,21.5 10.95,21.8 10.41,21.66C9.88,21.5 9.56,20.97 9.7,20.43L11.78,12.71C11.92,12.17 12.47,11.86 13,12M17,12C17.53,12.14 17.85,12.69 17.71,13.22L16.41,18.05C16.27,18.59 15.72,18.9 15.19,18.76C14.65,18.62 14.34,18.07 14.5,17.54L15.78,12.71C15.92,12.17 16.47,11.86 17,12M17,10V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11C3,12.11 3.6,13.08 4.5,13.6V13.59C5,13.87 5.14,14.5 4.87,14.96C4.59,15.43 4,15.6 3.5,15.32V15.33C2,14.47 1,12.85 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12C23,13.5 22.2,14.77 21,15.46V15.46C20.5,15.73 19.91,15.57 19.63,15.09C19.36,14.61 19.5,14 20,13.72V13.73C20.6,13.39 21,12.74 21,12A2,2 0 0,0 19,10H17Z",
    "weather-rainy": "M6,14.03A1,1 0 0,1 7,15.03C7,15.58 6.55,16.03 6,16.03C3.24,16.03 1,13.79 1,11.03C1,8.27 3.24,6.03 6,6.03C7,3.68 9.3,2.03 12,2.03C15.43,2.03 18.24,4.69 18.5,8.06L19,8.03A4,4 0 0,1 23,12.03C23,14.23 21.21,16.03 19,16.03H18C17.45,16.03 17,15.58 17,15.03C17,14.47 17.45,14.03 18,14.03H19A2,2 0 0,0 21,12.03A2,2 0 0,0 19,10.03H17V9.03C17,6.27 14.76,4.03 12,4.03C9.5,4.03 7.45,5.84 7.06,8.21C6.73,8.09 6.37,8.03 6,8.03A3,3 0 0,0 3,11.03A3,3 0 0,0 6,14.03M12,14.15C12.18,14.39 12.37,14.66 12.56,14.94C13,15.56 14,17.03 14,18C14,19.11 13.1,20 12,20A2,2 0 0,1 10,18C10,17.03 11,15.56 11.44,14.94C11.63,14.66 11.82,14.4 12,14.15M12,11.03L11.5,11.59C11.5,11.59 10.65,12.55 9.79,13.81C8.93,15.06 8,16.56 8,18A4,4 0 0,0 12,22A4,4 0 0,0 16,18C16,16.56 15.07,15.06 14.21,13.81C13.35,12.55 12.5,11.59 12.5,11.59",
    "weather-snowy": "M6,14A1,1 0 0,1 7,15A1,1 0 0,1 6,16A5,5 0 0,1 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16H18A1,1 0 0,1 17,15A1,1 0 0,1 18,14H19A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11A3,3 0 0,0 6,14M7.88,18.07L10.07,17.5L8.46,15.88C8.07,15.5 8.07,14.86 8.46,14.46C8.85,14.07 9.5,14.07 9.88,14.46L11.5,16.07L12.07,13.88C12.21,13.34 12.76,13.03 13.29,13.17C13.83,13.31 14.14,13.86 14,14.4L13.41,16.59L15.6,16C16.14,15.86 16.69,16.17 16.83,16.71C16.97,17.24 16.66,17.79 16.12,17.93L13.93,18.5L15.54,20.12C15.93,20.5 15.93,21.15 15.54,21.54C15.15,21.93 14.5,21.93 14.12,21.54L12.5,19.93L11.93,22.12C11.79,22.66 11.24,22.97 10.71,22.83C10.17,22.69 9.86,22.14 10,21.6L10.59,19.41L8.4,20C7.86,20.14 7.31,19.83 7.17,19.29C7.03,18.76 7.34,18.21 7.88,18.07Z",
    "weather-snowy-rainy": "M18.5,18.67C18.5,19.96 17.5,21 16.25,21C15,21 14,19.96 14,18.67C14,17.12 16.25,14.5 16.25,14.5C16.25,14.5 18.5,17.12 18.5,18.67M4,17.36C3.86,16.82 4.18,16.25 4.73,16.11L7,15.5L5.33,13.86C4.93,13.46 4.93,12.81 5.33,12.4C5.73,12 6.4,12 6.79,12.4L8.45,14.05L9.04,11.8C9.18,11.24 9.75,10.92 10.29,11.07C10.85,11.21 11.17,11.78 11,12.33L10.42,14.58L12.67,14C13.22,13.83 13.79,14.15 13.93,14.71C14.08,15.25 13.76,15.82 13.2,15.96L10.95,16.55L12.6,18.21C13,18.6 13,19.27 12.6,19.67C12.2,20.07 11.54,20.07 11.15,19.67L9.5,18L8.89,20.27C8.75,20.83 8.18,21.14 7.64,21C7.08,20.86 6.77,20.29 6.91,19.74L7.5,17.5L5.26,18.09C4.71,18.23 4.14,17.92 4,17.36M1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16A1,1 0 0,1 18,15A1,1 0 0,1 19,14A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11C3,11.85 3.35,12.61 3.91,13.16C4.27,13.55 4.26,14.16 3.88,14.54C3.5,14.93 2.85,14.93 2.47,14.54C1.56,13.63 1,12.38 1,11Z",
    "weather-sunny": "M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z",
    "weather-windy": "M4,10A1,1 0 0,1 3,9A1,1 0 0,1 4,8H12A2,2 0 0,0 14,6A2,2 0 0,0 12,4C11.45,4 10.95,4.22 10.59,4.59C10.2,5 9.56,5 9.17,4.59C8.78,4.2 8.78,3.56 9.17,3.17C9.9,2.45 10.9,2 12,2A4,4 0 0,1 16,6A4,4 0 0,1 12,10H4M19,12A1,1 0 0,0 20,11A1,1 0 0,0 19,10C18.72,10 18.47,10.11 18.29,10.29C17.9,10.68 17.27,10.68 16.88,10.29C16.5,9.9 16.5,9.27 16.88,8.88C17.42,8.34 18.17,8 19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14H5A1,1 0 0,1 4,13A1,1 0 0,1 5,12H19M18,18H4A1,1 0 0,1 3,17A1,1 0 0,1 4,16H18A3,3 0 0,1 21,19A3,3 0 0,1 18,22C17.17,22 16.42,21.66 15.88,21.12C15.5,20.73 15.5,20.1 15.88,19.71C16.27,19.32 16.9,19.32 17.29,19.71C17.47,19.89 17.72,20 18,20A1,1 0 0,0 19,19A1,1 0 0,0 18,18Z",
}


def _weather_condition_icon_image(condition: str, size: int) -> Image.Image | None:
    """A real MDI glyph for a forecast day, matching what a manual send draws.

    Rasterised through the same resvg backend the text-substitution tier
    already depends on. Returns None - never a placeholder - when resvg is
    unavailable or the condition has no icon mapped, so the caller falls
    back to its existing text abbreviation instead of drawing nothing.
    """
    icon_name = _WEATHER_CONDITION_ICON_NAMES.get(str(condition or "").lower())
    path = _MDI_WEATHER_ICON_PATHS.get(icon_name) if icon_name else None
    if not path or size < 8:
        return None
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="{path}" fill="#000000"/></svg>'
    return svg_render.rasterize_svg(svg, size, size)


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
    # _async_forecast_days already slices to `binding["days"]` (4), but this
    # is the last line of defence before drawing: an integration answering
    # weather.get_forecasts with hourly data instead of daily (ignoring the
    # "type": "daily" request) would otherwise hand this dozens of entries,
    # each cell shrinking until every day's three lines of text collapse into
    # unreadable, overlapping noise across the whole strip.
    days = [day for day in days if isinstance(day, dict)][: max(1, int(binding.get("days") or 4))]
    if not days:
        return output
    cell_width = width / len(days)
    if cell_width < 18:
        return output
    # Font/icon sizes mirror _blockStrip (panel-template-svg.mixin.js) with
    # iconed=true (a forecast day always carries an icon) - both dimensions
    # (row height and cell width) bound the size, not row height alone, so a
    # narrow strip (many days, or a small panel) shrinks text the same way
    # the manual send does instead of running larger than the cell allows.
    label_size = max(7, round(min(height * 0.23, cell_width * 0.3)))
    value_size = max(8, round(min(height * 0.3, cell_width * 0.34)))
    icon_size = max(1, round(min(height * 0.34, cell_width * 0.5)))
    label_y = height * 0.16
    value_y = height * 0.85
    for index, day in enumerate(days):
        if not isinstance(day, dict):
            continue
        cx = cell_width * (index + 0.5)
        _draw_centered_text(draw, str(day.get("label") or ""), cx, label_y, cell_width * 0.9, height * 0.2, label_size)
        icon_image = _weather_condition_icon_image(day.get("condition"), icon_size)
        if icon_image is not None:
            output.alpha_composite(
                icon_image,
                (round(cx - icon_size / 2), round(height * 0.5 - icon_size / 2)),
            )
        else:
            condition = _FORECAST_CONDITION_ABBR.get(str(day.get("condition") or "").lower(), "")
            if condition:
                _draw_centered_text(draw, condition, cx, height * 0.5, cell_width * 0.92, height * 0.22, max(6, round(height * 0.12)), bold=False)
        _draw_centered_text(draw, str(day.get("value") or ""), cx, value_y, cell_width * 0.9, height * 0.26, value_size)
        if index > 0:
            x = round(cell_width * index)
            draw.line([(x, round(height * 0.12)), (x, round(height * 0.88))], fill=black, width=1)
    return output


def _render_bound_calendar(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """An event()-driven calendar entry, redrawn from automation.py's live calendar.get_events read.

    Mirrors _blockDatebox (panel-template-svg.mixin.js): a square date box
    vertically centred in the row (not a box spanning the full row height),
    a coloured header band with the month, a black day number, and up to two
    lines of event text beside it sized off the row's own line height.
    """
    width = max(1, round(float(binding.get("w", 1))))
    height = max(1, round(float(binding.get("h", 1))))
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0) if force_transparent else (255, 255, 255, 255))
    draw = ImageDraw.Draw(output)
    black = (0, 0, 0, 255)
    white = (255, 255, 255, 255)
    ink = (220, 20, 12, 255) if binding.get("color") == "red" else black
    try:
        entry = json.loads(str(value))
        if not isinstance(entry, dict):
            entry = {}
    except (TypeError, ValueError, json.JSONDecodeError):
        entry = {}
    side = min(height * 0.92, width * 0.3)
    top = (height - side) / 2
    draw.rectangle((0, top, side, top + side), outline=black, width=1)
    band_height = side * 0.28
    draw.rectangle((0, top, side, top + band_height), fill=ink)
    _draw_centered_text(draw, str(entry.get("month") or ""), side / 2, top + side * 0.15, side * 0.92, side, max(5, round(side * 0.17)), fill=white, bold=True)
    _draw_centered_text(draw, str(entry.get("day") or ""), side / 2, top + side * 0.64, side * 0.86, side, max(8, round(side * 0.46)), fill=black)
    text_x = side + max(3, side * 0.16)
    lines = [line for line in (str(entry.get("title") or ""), str(entry.get("detail") or "")) if line]
    line_height = height / max(1, len(lines))
    for index, line in enumerate(lines):
        size = max(6, round(line_height * (0.56 if index == 0 else 0.42)))
        font = load_font(size, index == 0)
        box = draw.textbbox((0, 0), line, font=font)
        center_y = line_height * (index + 0.5)
        draw.text(
            (text_x - box[0], round(center_y - (box[3] - box[1]) / 2 - box[1])),
            line, fill=(ink if index == 0 else black), font=font,
        )
    return output


def _is_text_binding(binding: dict[str, Any]) -> bool:
    """A binding drawn as a single run of text (the default when no type is set)."""
    return binding.get("type") in (None, "", "text")


def _render_binding_layer(binding: dict[str, Any], value: str, force_transparent: bool = False) -> Image.Image:
    """Rasterise one binding to its own RGBA layer."""
    if binding.get("type") == "chart":
        return _render_bound_chart(binding, value, force_transparent)
    if binding.get("type") == "series":
        return _render_bound_series(binding, value, force_transparent)
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


def _svg_text_slot(
    binding: dict[str, Any],
    value: str,
    cover_background: bool = True,
) -> str:
    """Rebuild one dynamic text slot as an SVG rect + <text>, matching the panel.

    The panel captured the slot geometry as hex colours and an anchor point in
    svg.* (panel-devices.mixin.js). The rect repaints the background so the stale
    value baked into the base image is covered - the same job _render_bound_text's
    background fill does in the PIL path.

    `cover_background` is what the clean_background tier turns off: there the
    background it draws onto is a real, value-free capture of the template, so
    there is no stale value to hide and painting a flat rectangle over it would
    destroy whatever art (an icon, a gradient band, a photo) the slot sits on -
    exactly the guessing that tier exists to avoid.
    """
    svg = binding.get("svg") or {}
    parts: list[str] = []
    background = str(svg.get("bg") or "none")
    if cover_background and background and background != "none":
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


def _binding_box(binding: dict[str, Any]) -> dict[str, float]:
    """The row box the panel laid this binding's block out in."""
    return {
        "x": float(binding.get("x", 0)),
        "y": float(binding.get("y", 0)),
        "w": max(1.0, float(binding.get("w", 1))),
        "h": max(1.0, float(binding.get("h", 1))),
    }


def _decoded_binding_value(value: str, default: Any) -> Any:
    """A graphic binding's value travels as JSON built by automation.py."""
    try:
        decoded = json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default
    return decoded if isinstance(decoded, type(default)) else default


def _svg_graphic_slot(binding: dict[str, Any], value: str) -> str:
    """Rebuild one live template row as the panel's own block markup.

    series()/ratio()/day()/event() rows are drawn by `_blockBars`/`_blockSpark`,
    `_blockDial`/`_blockRing`/`_blockMeters`, `_blockStrip` and `_blockDatebox`
    respectively; svg_blocks.py is a port of all seven, so the markup here is
    what the browser would have written for the same data.
    """
    box = _binding_box(binding)
    binding_type = binding.get("type")

    if binding_type == "series":
        values = _decoded_binding_value(value, [])
        if not values:
            return ""
        if str(binding.get("chartType") or "line") == "bar":
            highlight = binding.get("highlight")
            return svg_blocks.block_bars(
                {
                    "values": values,
                    "labels": binding.get("labels") or [],
                    # -1 is the panel's "no interval is current" marker; passing
                    # it through would still compare equal to nothing, but None
                    # says so outright.
                    "highlight": highlight if isinstance(highlight, int) and highlight >= 0 else None,
                },
                box,
            )
        return svg_blocks.block_spark(
            {"values": values, "caption": binding.get("caption") or None}, box
        )

    if binding_type == "ratio":
        meters = _decoded_binding_value(value, [])
        meters = [meter for meter in meters if isinstance(meter, dict)]
        if not meters:
            return ""
        visual = str(binding.get("visual") or "bars")
        if visual in ("dial", "ring"):
            first = meters[0]
            # automation.py resolves a fill as a 0-100 percentage; the panel's
            # own ratio() helper hands the block a 0-1 fraction.
            source = {
                "percent": _number_or_zero(first.get("percent")) / 100,
                "color": first.get("color"),
                "value": first.get("text") or None,
                "caption": binding.get("caption") or None,
            }
            if visual == "ring":
                return svg_blocks.block_ring(source, box)
            return svg_blocks.block_dial(
                {**source, "min": binding.get("min"), "max": binding.get("max")}, box
            )
        return svg_blocks.block_meters(
            [
                {
                    "label": meter.get("label"),
                    "value": meter.get("text"),
                    "percent": _number_or_zero(meter.get("percent")) / 100,
                    "color": meter.get("color"),
                }
                for meter in meters
            ],
            box,
        )

    if binding_type == "forecast":
        days = _decoded_binding_value(value, [])
        cells = [
            {
                "label": day.get("label"),
                "value": day.get("value"),
                "icon": _MDI_WEATHER_ICON_PATHS.get(
                    _WEATHER_CONDITION_ICON_NAMES.get(str(day.get("condition") or "").lower(), ""),
                    "",
                ),
            }
            for day in days
            if isinstance(day, dict)
        ][: max(1, int(binding.get("days") or 4))]
        return svg_blocks.block_strip(cells, box) if cells else ""

    if binding_type == "calendar":
        entry = _decoded_binding_value(value, {})
        if not entry:
            return ""
        return svg_blocks.block_datebox(
            {
                "day": entry.get("day"),
                "month": entry.get("month"),
                "color": binding.get("color"),
                "lines": [entry.get("title"), entry.get("detail")],
            },
            box,
        )

    return ""


def _number_or_zero(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def _svg_graphic_binding(binding: dict[str, Any]) -> bool:
    """A live template row svg_blocks.py can redraw exactly."""
    return binding.get("type") in ("series", "ratio", "forecast", "calendar")


def _svg_text_binding(binding: dict[str, Any]) -> bool:
    """A text slot the panel captured enough SVG geometry to redraw exactly.

    Template runs carry `svg` (cx/cy/size/anchor/colour); the free-form
    designer's own signal widget is typed "text" but has no such capture and
    stays on the PIL box renderer, which is the model it was drawn with.
    """
    return _is_text_binding(binding) and bool(binding.get("svg"))


def _svg_overlay(
    bindings: list[dict[str, Any]],
    values: dict[str, str],
    width: int,
    height: int,
    cover_background: bool,
) -> Image.Image | None:
    """Rasterise every captured slot the way the manual send drew it.

    One document for all slots rather than one per slot: resvg is invoked once,
    the slots land on the same pixel grid they did when the browser drew them
    together, and they keep the z-order the panel captured them in. Returns None
    only when the rasteriser is unavailable or fails, so every caller keeps its
    PIL fallback - a set of slots that legitimately draws nothing (an empty
    value, a forecast that came back empty) still returns a layer, since a
    manual send would have drawn nothing there either.
    """
    if not bindings:
        return Image.new("RGBA", (width, height), (0, 0, 0, 0))
    if not svg_render.render_available():
        return None
    slots = "".join(
        _svg_graphic_slot(binding, values.get(str(binding.get("id")), str(binding.get("fallback", ""))))
        if _svg_graphic_binding(binding)
        else _svg_text_slot(
            binding,
            values.get(str(binding.get("id")), str(binding.get("fallback", ""))),
            cover_background,
        )
        for binding in bindings
    )
    document = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"'
        f' viewBox="0 0 {width} {height}">{slots}</svg>'
    )
    return svg_render.rasterize_svg(document, width, height)


def _composite_text_bindings_with_pil(
    image: Image.Image,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
    force_transparent: bool = False,
) -> None:
    """Draw captured text slots through PIL when the rasteriser is unavailable.

    Forces the captured font size instead of PIL's autoFit, which would grow the
    text to fill its box and produce the oversized look the SVG path exists to
    avoid.
    """
    for binding in bindings:
        value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
        fixed = {**binding, "autoFit": False}
        _composite_binding(
            image, fixed, _render_bound_text(fixed, value, force_transparent)
        )


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
        if _svg_text_binding(binding):
            svg_text_bindings.append(binding)
            continue
        _composite_binding(image, binding, _render_binding_layer(binding, value))

    width, height = image.size
    # Text only: this tier patches over a stale base_image, where the graphic
    # rows' old pixels are still baked in. Their PIL renderers paint an opaque
    # box that covers them; fresh SVG markup drawn on top would leave the stale
    # shape showing through around it.
    layer = _svg_overlay(svg_text_bindings, values, width, height, True)
    if layer is not None:
        image.alpha_composite(layer)
    else:
        # No rasteriser (or it failed): draw the very same slots through PIL so
        # the refresh is never left with missing values.
        _composite_text_bindings_with_pil(image, svg_text_bindings, values)

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
    hass: Any,
    entity_id: str,
    width: int,
    height: int,
    country: str = "cz",
    show_precipitation: bool = True,
    dotted_light: bool = True,
    show_wind: bool = False,
) -> str | None:
    """Fetch a camera entity's current snapshot, fit and quantise it for the panel."""
    from homeassistant.components.camera import async_get_image
    from .meteoradar import async_render_meteoradar

    # Meteoradar has render-time options (country, rain texture and wind).  Its
    # HA camera entity always exposes the default Czech map, so reading that
    # snapshot here would silently discard those options.  Render it directly;
    # ordinary user camera bindings keep the standard camera path below.
    camera_image = None
    if entity_id != "camera.meteoradar":
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
        radar_img = await async_render_meteoradar(
            hass,
            country=country,
            show_precipitation=show_precipitation,
            dotted_light=dotted_light,
            show_wind=show_wind,
        )
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

    Everything the template itself drew is put back the way the panel drew it:
    text runs as the very same `<text>` elements, and series()/ratio()/day()/
    event() rows as the very same block markup (svg_text.py and svg_blocks.py
    are ports of the panel's own builders), rasterised through resvg. Redrawing
    those with PIL instead could only approximate them - a text box the font is
    grown to fill and centred on the glyphs' ink extents rather than the font's
    central baseline, a gauge arc and bar spacing recomputed by hand - which is
    the one thing about this tier that was still a resemblance to a manual send
    rather than a reproduction of it. PIL stays the fallback for platforms the
    rasteriser has no wheel for, and remains the right model for the free-form
    designer's own widgets, which were drawn as boxes in the first place.

    Returns None - never partially applied - when clean_background cannot be
    decoded, so the caller falls back to the older, resvg-dependent tiers.
    """
    try:
        image = _decode_data_image(clean_background).convert("RGBA")
    except Exception:
        return None

    def redrawn_by_svg(binding: Any) -> bool:
        return isinstance(binding, dict) and (
            _svg_text_binding(binding) or _svg_graphic_binding(binding)
        )

    svg_bindings = [binding for binding in bindings if redrawn_by_svg(binding)]
    width, height = image.size
    # Composited before the remaining bindings, which keeps the z-order the
    # panel captured: the template's own rows are pushed ahead of the radar
    # image and the designer's overlay widgets in the binding list, and a manual
    # send paints those overlay widgets on top of the template SVG too.
    layer = _svg_overlay(svg_bindings, values, width, height, False)
    if layer is not None:
        image.alpha_composite(layer)
    else:
        for binding in svg_bindings:
            value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
            # A text slot forces the captured font size rather than PIL's
            # autoFit, which would grow the text to fill its box.
            drawn = {**binding, "autoFit": False} if _svg_text_binding(binding) else binding
            _composite_binding(
                image, drawn, _render_binding_layer(drawn, value, force_transparent=True)
            )
    for binding in bindings:
        if redrawn_by_svg(binding) or not isinstance(binding, dict):
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
BWRY_296X128_CODE = 46
BWR_800X480_CODES = {299, 315}


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
            # Picksmart's four-colour 296x128 encoder uses -90 degrees.  The
            # other PE29 variants use the older +90-degree byte layout.
            default_angle = -90 if code == BWRY_296X128_CODE else 90
            if transform in ("none", "rotate_cw"):
                image = image.rotate(default_angle, expand=True)
            elif transform == "rotate_ccw":
                image = image.rotate(-default_angle, expand=True)
            elif transform == "rotate_180":
                image = image.rotate(-default_angle, expand=True)
            elif transform == "flip_lr":
                image = image.rotate(default_angle, expand=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            elif transform == "flip_tb":
                image = image.rotate(default_angle, expand=True).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            else:
                image = image.rotate(default_angle, expand=True)
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
    code = int(sdk_type)

    if code == BWRY_296X128_CODE:
        return _pack_bwry_image(image)

    # Picksmart's 800x480 BWR implementation mirrors the bitmap vertically
    # before extracting its planes.  Its first plane is active-high for dark
    # pixels, unlike the white-plane representation used by the other labels.
    invert_first_plane = code in BWR_800X480_CODES
    if invert_first_plane:
        image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    width, height = image.size
    pixel_count = width * height
    if pixel_count % 8 != 0:
        raise ValueError(f"Display pixel count is not byte aligned: {width}x{height}")

    white, red = bwr_masks(image)
    if width % 8 == 0:
        # Mode "1" already stores 8 pixels per byte, most significant bit first,
        # padding every row up to a byte boundary. A byte-aligned width leaves no
        # padding, so the raw buffer is exactly the continuous bit plane wanted.
        first_plane = white.tobytes()
        if invert_first_plane:
            first_plane = bytes(value ^ 0xFF for value in first_plane)
        return first_plane + red.tobytes()

    # Widths like 212, 250, 196 and 210 are not byte aligned, so the row padding
    # above would shift the stream. Pack those from the flat masks instead.
    return _pack_planes_unaligned(white, red, pixel_count)


def _pack_bwry_image(image: Image.Image) -> bytes:
    """Pack Picksmart BWRY pixels as four two-bit values per byte.

    The vendor protocol does not use two independent bit planes for BWRY:
    black=0, white=1, yellow=2 and red=3, ordered most-significant pixel first.
    """
    source = image.convert("RGB").tobytes()
    pixel_count = image.width * image.height
    if pixel_count % 4 != 0:
        raise ValueError(
            f"BWRY display pixel count is not four-pixel aligned: {image.width}x{image.height}"
        )

    packed = bytearray(pixel_count // 4)
    output_index = 0
    packed_byte = 0
    pixel_in_byte = 0
    for offset in range(0, len(source), 3):
        red, green, blue = source[offset : offset + 3]
        luminance = (38 * red + 75 * green + 15 * blue) >> 7
        is_white = luminance > 128
        is_red = red > 128
        is_yellow = green > 128
        if is_red and is_yellow and blue > 128:
            is_yellow = False
        if is_red and is_white:
            is_red = False

        colour = 2 if is_yellow else 3 if is_red else 1 if is_white else 0
        packed_byte |= colour << (6 - pixel_in_byte * 2)
        pixel_in_byte += 1
        if pixel_in_byte == 4:
            packed[output_index] = packed_byte
            output_index += 1
            packed_byte = 0
            pixel_in_byte = 0
    return bytes(packed)


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
