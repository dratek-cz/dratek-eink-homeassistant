from __future__ import annotations

import base64
import io
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageMath

from . import svg_blocks, svg_render
from .const import DEVICE_SIZES, SDK_MODELS
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
BWR_YELLOW = (244, 196, 0)
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


def quantize_bwr_preview(image: Image.Image, preserve_yellow: bool = False) -> Image.Image:
    """Convert RGB pixels to the target-safe master palette.

    Automatic refreshes for BWRY panels opt into preserving yellow. Ordinary
    BWR callers keep the long-standing three-colour result.
    """
    white, red = bwr_masks(image)
    output = Image.new("RGB", image.size, BWR_BLACK)
    output.paste(BWR_WHITE, mask=white)
    output.paste(BWR_RED, mask=red)
    if preserve_yellow:
        yellow = yellow_mask(image.convert("RGB"))
        output.paste(BWR_YELLOW, mask=yellow)
    return output


def yellow_mask(rgb: Image.Image) -> Image.Image:
    """The pixels a four-colour panel prints with yellow pigment.

    A channel test rather than a nearest-colour search: yellow is "red and
    green both well up, blue well down", and the thresholds are the ones the
    panel's own quantiser uses. Shared by the BWR preview and the BWRY-to-BWR
    fallback, which carried identical copies of it.
    """
    red_band, green_band, blue_band = rgb.split()
    return ImageChops.logical_and(
        ImageChops.logical_and(
            red_band.point(lambda value: 255 if value >= 161 else 0, mode="1"),
            green_band.point(lambda value: 255 if value >= 128 else 0, mode="1"),
        ),
        blue_band.point(lambda value: 255 if value < 96 else 0, mode="1"),
    )


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
            draw.line(points, fill=color, width=max(1, int(binding.get("strokeWidth", 3))))
        for x_pos, y_pos in points:
            draw.ellipse(
                (round(x_pos) - 3, round(y_pos) - 3, round(x_pos) + 3, round(y_pos) + 3),
                fill=palette["white"],
                outline=color,
                width=2,
            )

    if show_axes:
        draw.line(
            (left, top, left, top + plot_height, left + plot_width, top + plot_height),
            fill=graph_color,
            width=2,
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
                width=max(2, min(4, int(item.get("stroke_width", 2)))),
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
                width=2,
            )
            if pct > 0:
                draw.pieslice((cx - r, cy - r, cx + r, cy + r), 270, 270 + pct * 360, fill=color)
            if hole_pct > 0:
                hr = round(r * hole_pct)
                draw.ellipse((cx - hr, cy - hr, cx + hr, cy + hr), fill=colors["white"], outline=colors["black"], width=2)
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
            draw.line([(x + margin, track_y), (x + margin + track_w, track_y)], fill=colors["black"], width=3)
            fill_w = round(track_w * pct)
            if fill_w > 0:
                draw.line([(x + margin, track_y), (x + margin + fill_w, track_y)], fill=color, width=7)
            thumb_x = x + margin + fill_w
            draw.ellipse((thumb_x - 10, track_y - 10, thumb_x + 10, track_y + 10), fill=color, outline=colors["white"], width=3)
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
            stroke_w = max(3, int(item.get("stroke_width", 8)))
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
                width=max(2, min(3, stroke_w)),
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

def _weather_condition_icon_image(
    condition: str, size: int, preserve_yellow: bool = False, night: bool = False
) -> Image.Image | None:
    """Home Assistant's own weather glyph for a forecast day, matching what a
    manual send draws.

    svg_blocks.weather_icon_image rasterises Home Assistant's real
    weather-icon artwork (not an MDI stand-in) and dithers it to the e-ink
    palette (Floyd-Steinberg, via svg_render.quantize_bwr_dithered) - the
    same "convert it like an image" path a camera snapshot goes through
    (async_render_camera_binding_data_url), rather than the flat threshold
    quantize_bwr_preview uses elsewhere, since several of these fills (the
    cloud body, the moon) are close enough to white that a flat threshold
    would erase them outright. Returns None - never a placeholder - when
    resvg is unavailable or the condition has no icon mapped, so the caller
    falls back to its existing text abbreviation instead of drawing nothing.
    `preserve_yellow` picks the sun/moon/lightning ink the same way it
    already picks it everywhere else in this module.
    """
    icon_name = _WEATHER_CONDITION_ICON_NAMES.get(str(condition or "").lower())
    if not icon_name or size < 8:
        return None
    # `night` only changes "partlycloudy": Home Assistant has no
    # partlycloudy-night state, so without it a cloudy 2am drew the sun behind
    # the cloud. Every other condition either carries its own night variant in
    # the state itself ("clear-night") or has no night artwork at all.
    return svg_blocks.weather_icon_image(icon_name, size, preserve_yellow, night)


def _render_bound_forecast(
    binding: dict[str, Any], value: str, force_transparent: bool = False, preserve_yellow: bool = False
) -> Image.Image:
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
        icon_image = _weather_condition_icon_image(day.get("condition"), icon_size, preserve_yellow)
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


def _render_binding_layer(
    binding: dict[str, Any], value: str, force_transparent: bool = False, preserve_yellow: bool = False
) -> Image.Image:
    """Rasterise one binding to its own RGBA layer."""
    if binding.get("type") == "chart":
        return _render_bound_chart(binding, value, force_transparent)
    if binding.get("type") == "series":
        return _render_bound_series(binding, value, force_transparent)
    if binding.get("type") == "ratio":
        return _render_bound_ratio(binding, value, force_transparent)
    if binding.get("type") == "forecast":
        return _render_bound_forecast(binding, value, force_transparent, preserve_yellow)
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
    preserve_yellow: bool = False,
) -> Image.Image:
    """Compose current Home Assistant entity values over a designer background."""
    image = _decode_data_image(base_image).convert("RGBA")
    for binding in bindings:
        value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
        _composite_binding(image, binding, _render_binding_layer(binding, value, preserve_yellow=preserve_yellow))
    return quantize_bwr_preview(image, preserve_yellow)


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


def _svg_graphic_slot(binding: dict[str, Any], value: str, preserve_yellow: bool = False) -> str:
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
        # Whether the panel decided this row may take the four-colour accent.
        # It is captured at send time rather than recomputed here because the
        # decision depends on which template the row came from - the protected
        # ones (cz_spot_prices among them) never take it.
        accent = binding.get("accent") or ""
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
                    "accent": accent,
                },
                box,
                preserve_yellow,
            )
        return svg_blocks.block_spark(
            {"values": values, "caption": binding.get("caption") or None, "accent": accent},
            box,
            preserve_yellow,
        )

    if binding_type == "history":
        # Already a plain list of numbers by the time it gets here: the recorder
        # rows were resampled where they were fetched, so the panel and the
        # refresh draw the same hours at the same resolution.
        numbers = [
            float(number) for number in _decoded_binding_value(value, [])
            if isinstance(number, (int, float)) and math.isfinite(float(number))
        ]
        if len(numbers) < 2:
            return ""
        return svg_blocks.block_spark(
            {
                "values": numbers,
                "caption": binding.get("caption") or "",
                "accent": binding.get("accent") or "",
            },
            box,
            preserve_yellow,
        )

    if binding_type == "ratio":
        meters = _decoded_binding_value(value, [])
        meters = [meter for meter in meters if isinstance(meter, dict)]
        if not meters:
            return ""
        visual = str(binding.get("visual") or "bars")
        accent = binding.get("accent") or ""
        if visual in ("dial", "ring"):
            first = meters[0]
            # automation.py resolves a fill as a 0-100 percentage; the panel's
            # own ratio() helper hands the block a 0-1 fraction.
            source = {
                "percent": _number_or_zero(first.get("percent")) / 100,
                "color": first.get("color"),
                "value": first.get("text") or None,
                "caption": binding.get("caption") or None,
                "accent": accent,
            }
            if visual == "ring":
                return svg_blocks.block_ring(source, box, preserve_yellow)
            return svg_blocks.block_dial(
                {**source, "min": binding.get("min"), "max": binding.get("max")},
                box,
                preserve_yellow,
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
            preserve_yellow,
            accent,
        )

    if binding_type == "forecast":
        days = _decoded_binding_value(value, [])
        cells = [
            {
                "label": day.get("label"),
                "value": day.get("value"),
                "icon": _WEATHER_CONDITION_ICON_NAMES.get(str(day.get("condition") or "").lower(), ""),
            }
            for day in days
            if isinstance(day, dict)
        ][: max(1, int(binding.get("days") or 4))]
        return svg_blocks.block_strip(cells, box, preserve_yellow) if cells else ""

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

    if binding_type == "transit":
        departures = _decoded_binding_value(value, [])
        # The panel resolves an MDI glyph name through ha-icon and records the
        # path data for every vehicle kind on the binding, because there is no
        # ha-icon here to ask and a refresh can bring back kinds the capture
        # never showed. A kind with no recorded path simply draws no glyph,
        # exactly as the panel does for a name it never resolved.
        icons = binding.get("icons") if isinstance(binding.get("icons"), dict) else {}
        rows = [
            {
                "badge": item.get("line") or "–",
                "label": item.get("destination") or "Spoj",
                "value": item.get("time") or "",
                "clock": item.get("departure") or "",
                "icon": str(icons.get(str(item.get("kind") or "other")) or icons.get("other") or ""),
                "color": "red" if index == 0 else "black",
            }
            for index, item in enumerate(departures)
            if isinstance(item, dict)
        ][: max(1, int(binding.get("limit") or 4))]
        if not rows:
            return ""
        if binding.get("two_line"):
            return svg_blocks.block_board_two_line(
                rows, box, filled=True, preserve_yellow=preserve_yellow
            )
        return svg_blocks.block_board(
            rows,
            box,
            filled=True,
            compact=bool(binding.get("compact")),
            preserve_yellow=preserve_yellow,
        )

    if binding_type == "todo":
        items = _decoded_binding_value(value, [])
        limit = max(1, int(binding.get("limit") or 1))
        # Unchecked first, exactly as _templateShoppingList orders them for a
        # manual send - the backend gets the raw todo.get_items response, not
        # the panel's already-sorted list, so it has to make the same decision
        # rather than print the list in whatever order the integration stores.
        entries = [
            {
                "label": str(item.get("summary") or "").strip(),
                "done": str(item.get("status") or "").lower() == "completed",
            }
            for item in items
            if isinstance(item, dict) and str(item.get("summary") or "").strip()
        ]
        ordered = [item for item in entries if not item["done"]] + [item for item in entries if item["done"]]
        rows = ordered[:limit]
        if not rows:
            return ""
        if binding.get("highlight_first") and not rows[0]["done"]:
            rows[0] = {**rows[0], "color": "red"}
        columns = max(1, int(binding.get("columns") or 1))
        rows = _column_major(rows, max(1, int(binding.get("lines") or 1)), columns)
        return svg_blocks.block_checklist(
            rows,
            box,
            columns=columns,
            marker="dot" if binding.get("marker") == "dot" else "box",
            strike=bool(binding.get("strike")),
            compact=bool(binding.get("compact")),
        )

    return ""


def _column_major(items: list[dict[str, Any]], lines: int, columns: int) -> list[dict[str, Any]]:
    """Port of shopping.js's `columnMajor`.

    svg_blocks.block_checklist fills its grid row by row, so a three-column list
    would come out reading across the top rather than down each column. The
    panel transposes the items before handing them to the block, and an
    automatic refresh has to make the same move or it prints the same list in a
    different order than the manual send did.
    """
    if columns <= 1:
        return items
    slices: list[list[dict[str, Any]]] = []
    cursor = 0
    for column in range(columns):
        size = min(lines, math.ceil((len(items) - cursor) / (columns - column)))
        slices.append(items[cursor:cursor + size])
        cursor += size
    ordered: list[dict[str, Any]] = []
    for line in range(lines):
        for column in range(columns):
            if line < len(slices[column]):
                ordered.append(slices[column][line])
    return ordered


def _number_or_zero(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def _svg_graphic_binding(binding: dict[str, Any]) -> bool:
    """A live template row svg_blocks.py can redraw exactly."""
    return binding.get("type") in ("series", "ratio", "history", "forecast", "calendar", "transit", "todo")


# Generation of the panel's graphic-row capture. Mirrors
# GRAPHIC_BINDING_CAPTURE_VERSION in panel-devices.mixin.js; see that constant
# for what each generation means. A binding with no stamp at all is generation 1.
GRAPHIC_BINDING_CAPTURE_VERSION = 2


def _stale_graphic_capture(binding: Any) -> bool:
    """True for a graphic row whose recorded box predates the layout fix.

    Up to 0.1.345 the panel measured these rows in a layout three pixels
    narrower on each side than the one it drew them in, so the box travelling
    with the binding is not where the row is. The clean-background tier trusts
    that box completely - it whitens it and redraws into it - which on a
    departures board left a frame of the old rows standing and printed the new
    ones a few pixels above them.
    """
    return (
        isinstance(binding, dict)
        and _svg_graphic_binding(binding)
        and int(binding.get("capture") or 0) < GRAPHIC_BINDING_CAPTURE_VERSION
    )


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
    preserve_yellow: bool = False,
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
        _svg_graphic_slot(binding, values.get(str(binding.get("id")), str(binding.get("fallback", ""))), preserve_yellow)
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
    preserve_yellow: bool = False,
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
        _composite_binding(image, binding, _render_binding_layer(binding, value, preserve_yellow=preserve_yellow))

    width, height = image.size
    # Text only: this tier patches over a stale base_image, where the graphic
    # rows' old pixels are still baked in. Their PIL renderers paint an opaque
    # box that covers them; fresh SVG markup drawn on top would leave the stale
    # shape showing through around it.
    layer = _svg_overlay(svg_text_bindings, values, width, height, True, preserve_yellow)
    if layer is not None:
        image.alpha_composite(layer)
    else:
        # No rasteriser (or it failed): draw the very same slots through PIL so
        # the refresh is never left with missing values.
        _composite_text_bindings_with_pil(image, svg_text_bindings, values)

    return quantize_bwr_preview(image, preserve_yellow)


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

    The element's own end is located explicitly rather than with a lazy
    `.*?</text>`: a slot whose value rendered empty is serialised as a
    self-closing `<text ... />` with no `</text>` of its own, and the lazy match
    then ran on to the *next* slot's closing tag - replacing both and deleting
    that neighbouring value from the refreshed image entirely.
    """
    opening = re.search(
        r'<text\b[^>]*\bid="' + re.escape(element_id) + r'"[^>]*>', document
    )
    if opening is None:
        return document
    if opening.group(0).endswith("/>"):
        return document[: opening.start()] + replacement + document[opening.end():]
    closing = document.find("</text>", opening.end())
    if closing == -1:
        return document
    return document[: opening.start()] + replacement + document[closing + len("</text>"):]


def _replace_svg_group_by_id(document: str, element_id: str, replacement: str) -> str:
    """Replace one tagged SVG group, including any groups nested inside it.

    A self-closing `<g/>` opens and closes in the same tag and must not move
    the nesting depth. Counting one as an opener (which is what a plain
    `<g\b[^>]*>` match does) desynchronised the depth for the rest of the
    scan, so the group was closed at some *outer* `</g>` instead of its own -
    splicing out every sibling in between and leaving the document unbalanced.
    On a design that happened to contain an empty group that silently deleted
    a large part of the template from an automatic refresh, while a manual
    send of the very same design was fine.
    """
    opening = re.search(
        r'<g\b[^>]*\bid="' + re.escape(element_id) + r'"[^>]*>', document
    )
    if opening is None:
        return document
    # The tagged group is itself empty (`<g id="..."/>`): it has no separate
    # closing tag, so the whole element is exactly the matched span.
    if opening.group(0).endswith("/>"):
        return document[:opening.start()] + replacement + document[opening.end():]
    depth = 0
    for tag in re.finditer(r"<g\b[^>]*>|</g\s*>", document[opening.start():]):
        token = tag.group(0)
        if token.startswith("</"):
            depth -= 1
            if depth == 0:
                end = opening.start() + tag.end()
                return document[:opening.start()] + replacement + document[end:]
        elif not token.endswith("/>"):
            depth += 1
    return document


def _replace_svg_image_href_by_id(document: str, element_id: str, data_url: str) -> str:
    """Swap the `href` of one `<image id="...">` element for a fresh data: URL.

    Only the attribute changes - the element's position and size, set when the
    panel captured the template, stay exactly as designed.

    The id is located independently of where it sits among the tag's other
    attributes. This used to require the id to appear *before* href, which
    never actually happens in a captured template: the panel emits the
    `<image>` without an id and adds it with `setAttribute` afterwards, and DOM
    serialisation appends a newly set attribute at the end of the tag - so the
    id always trailed href, the pattern never matched, and the swap silently
    did nothing. Every camera binding (the Meteoradar map) therefore stayed
    frozen on whatever frame happened to be captured during the last manual
    send, no matter how often the automatic refresh ran.
    """
    tag_pattern = re.compile(r'<image\b[^>]*\bid="' + re.escape(element_id) + r'"[^>]*>')

    def _swap(match: "re.Match[str]") -> str:
        element = match.group(0)
        for attribute in ("href", "xlink:href"):
            attribute_pattern = re.compile(r'(\b' + re.escape(attribute) + r'=")[^"]*(")')
            # A lambda, not a replacement string: a data: URL is arbitrary text
            # and a backslash in it would otherwise be read as a group escape.
            replaced, count = attribute_pattern.subn(
                lambda inner: inner.group(1) + data_url + inner.group(2), element, count=1
            )
            if count:
                return replaced
        # The element carries no href at all (a background whose href the panel
        # stripped). Add one instead of leaving the slot blank.
        closing = "/>" if element.endswith("/>") else ">"
        return element[: -len(closing)].rstrip() + f' href="{data_url}"{closing}'

    return tag_pattern.sub(_swap, document, count=1)


_RADAR_SIDEBAR_MIN = 88
_RADAR_SIDEBAR_MAX = 200
_RADAR_SIDEBAR_FRACTION = 0.24


_RADAR_FORECAST_MAX_HOURS = 12


def _sun_below_horizon_window(hass: Any) -> tuple[int, int] | None:
    """Sunset and sunrise as local minutes-of-day, from Home Assistant's own sun.

    Returns (sunset, sunrise). Home Assistant only publishes the *next* rising
    and setting, but both move by minutes a day, so their time of day is a good
    reading of "is it dark then" across the twelve-hour horizon the radar
    sidebar forecasts. None when sun.sun is missing or unreadable - the caller
    then treats every hour as daylight, which is what this module did before.
    """
    try:
        state = hass.states.get("sun.sun")
        rising = datetime.fromisoformat(str(state.attributes["next_rising"]).replace("Z", "+00:00"))
        setting = datetime.fromisoformat(str(state.attributes["next_setting"]).replace("Z", "+00:00"))
    except Exception:
        return None
    to_minutes = lambda moment: moment.astimezone().hour * 60 + moment.astimezone().minute
    return to_minutes(setting), to_minutes(rising)


def _is_night_at(moment: datetime, window: tuple[int, int] | None) -> bool:
    """Whether the sun is down at `moment`, given a (sunset, sunrise) window."""
    if window is None:
        return False
    sunset, sunrise = window
    minutes = moment.astimezone().hour * 60 + moment.astimezone().minute
    if sunset > sunrise:  # the ordinary case: dark from the evening until dawn
        return minutes >= sunset or minutes < sunrise
    return sunset <= minutes < sunrise


async def _async_radar_forecast_summary(hass: Any) -> dict[str, Any] | None:
    """Hourly forecast steps starting at +1 h, plus the entity's current
    temperature - the same weather.* entity and get_forecasts service the
    Weather template's own forecast strip reads (automation.py's
    _async_forecast_days), so the radar sidebar does not invent a second data
    source for the same kind of value.

    Never raises: no configured weather.* entity, hourly forecasts being
    unsupported by whatever integration is configured (falls back to the
    nearest daily entry), or a caller whose `hass` double lacks
    .states/.services (as in the existing camera-binding unit tests) all just
    mean the sidebar skips this section - the same "live weather must never
    break rendering" rule the rest of this module already follows for wind.
    """
    try:
        entity_id = next((state.entity_id for state in hass.states.async_all("weather")), None)
        if not entity_id:
            return None
        state = hass.states.get(entity_id)
        try:
            temperature = f"{round(float(state.attributes.get('temperature')))}°C"
        except (TypeError, ValueError, AttributeError):
            temperature = ""

        forecast = None
        hourly = False
        for forecast_type in ("hourly", "daily"):
            try:
                response = await hass.services.async_call(
                    "weather", "get_forecasts", {"type": forecast_type},
                    target={"entity_id": entity_id}, blocking=True, return_response=True,
                )
                candidate = (response or {}).get(entity_id, {}).get("forecast")
            except Exception:
                candidate = None
            if isinstance(candidate, list) and candidate:
                forecast = candidate
                hourly = forecast_type == "hourly"
                break
        if not forecast:
            return {"temperature": temperature, "hourly": False, "entries": []}

        def _parsed(entry: dict[str, Any]) -> datetime | None:
            try:
                parsed = datetime.fromisoformat(str(entry.get("datetime")).replace("Z", "+00:00"))
            except (TypeError, ValueError):
                return None
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

        def _temperature(entry: dict[str, Any]) -> str:
            # °C rather than a bare ° on the forecast cells too: the panel showed the unit only on the main reading, which read as an inconsistency rather than a convention. Both renderers have to change together - the backend redraws these same cells on an automatic refresh, and a difference here is exactly the manual/automatic drift svg_blocks.py exists to prevent.
            try:
                return f"{round(float(entry.get('temperature')))}°C"
            except (TypeError, ValueError):
                return ""

        dated = [
            (parsed, entry)
            for entry in forecast if isinstance(entry, dict) and (parsed := _parsed(entry)) is not None
        ]
        now = datetime.now(timezone.utc)
        night_window = _sun_below_horizon_window(hass)
        entries: list[dict[str, Any]] = []
        if hourly and dated:
            for offset in range(1, _RADAR_FORECAST_MAX_HOURS + 1):
                target = now + timedelta(hours=offset)
                parsed, entry = min(dated, key=lambda pair: abs((pair[0] - target).total_seconds()))
                if abs((parsed - target).total_seconds()) > 3600:
                    break
                entries.append({
                    "label": "",
                    "time": parsed.astimezone().strftime("%H:%M"),
                    "condition": str(entry.get("condition") or ""),
                    "temperature": _temperature(entry),
                    "night": _is_night_at(parsed, night_window),
                })
        elif dated:
            parsed, entry = min(dated, key=lambda pair: abs((pair[0] - now).total_seconds()))
            entries.append({
                "label": parsed.astimezone().strftime("%a"),
                "time": parsed.astimezone().strftime("%H:%M"),
                "condition": str(entry.get("condition") or ""),
                "temperature": _temperature(entry),
                "night": _is_night_at(parsed, night_window),
            })
        return {"temperature": temperature, "hourly": hourly, "entries": entries}
    except Exception:
        return None


def radar_sidebar_width(total_width: int) -> int:
    """The left-panel width a radar template's own layout reserves for the
    sidebar, given the full block's width - shared by both the sidebar and
    the map so the two are always sized to fit together edge to edge, with
    nothing left over to letterbox or stretch. Mirrors
    _radarSidebarWidth in panel-template-svg.mixin.js; both sides must move
    together (see that function's own comment for why).
    """
    sidebar_w = max(_RADAR_SIDEBAR_MIN, min(_RADAR_SIDEBAR_MAX, round(total_width * _RADAR_SIDEBAR_FRACTION)))
    return min(sidebar_w, max(1, total_width - 60))


def _radar_forecast_rows(available_h: int, row_h: int, count: int) -> int:
    """Return the number of complete hourly rows that fit in the sidebar."""
    if available_h <= 0 or row_h <= 0 or count <= 0:
        return 0
    return max(0, min(count, available_h // row_h))


def _draw_radar_sidebar(
    width: int, height: int, forecast: dict[str, Any] | None, preserve_yellow: bool
) -> Image.Image:
    """Draw the hourly forecast beside a landscape map or below a portrait map.

    A separate image from the map itself (see radar_sidebar_width) - the two
    are placed side by side as two independent blocks, each fetched and
    rasterised at its own box's exact pixel size, rather than one bitmap
    letterboxed to fit into two differently-shaped boxes. Still the one
    shared function both the browser preview and an automatic refresh fetch
    through, so the forecast can never drift out of sync between the browser
    preview and the image sent to the display.
    """
    if width > height * 1.4:
        return _draw_radar_footer(width, height, forecast, preserve_yellow)

    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)

    pad = max(3, round(min(width, height) * 0.07))
    x0, x1 = pad, width - pad
    inner_w = max(1, x1 - x0)
    y = pad

    if not forecast:
        return canvas

    if forecast.get("temperature"):
        temp_h = max(14, min(round(height * 0.11), round(inner_w * 0.55)))
        _draw_centered_text(
            draw, forecast["temperature"], x0 + inner_w / 2, y + temp_h / 2,
            inner_w, temp_h, round(temp_h * 0.85),
        )
        y += temp_h + max(2, round(height * 0.012))

    entries = forecast.get("entries") or []
    if not entries:
        return canvas

    available_h = max(0, (height - pad) - y)
    row_h = max(22, min(64, round(inner_w * 0.55)))
    # On small portrait displays the forecast block is narrow and the width-
    # based row height can leave room for only one otherwise valid entry.
    # Prefer two compact, complete rows when the block can still keep the
    # minimum readable row height.
    preferred_rows = min(2, len(entries))
    if preferred_rows > 1 and available_h >= preferred_rows * 22:
        row_h = min(row_h, available_h // preferred_rows)
    visible = _radar_forecast_rows(available_h, row_h, len(entries))
    for entry in entries[:visible]:
        icon_size = max(12, round(row_h * 0.82))
        icon = _weather_condition_icon_image(
            entry.get("condition", ""), icon_size, preserve_yellow, bool(entry.get("night"))
        )
        text_x = x0
        text_w = inner_w
        if icon is not None:
            canvas.paste(icon, (x0, y + round((row_h - icon.height) / 2)), icon)
            text_x = x0 + icon.width + max(2, round(inner_w * 0.04))
            text_w = max(1, x1 - text_x)
        label = entry.get("label") or ""
        if entry.get("time"):
            label = f"{label} · {entry['time']}" if label else entry["time"]
        line_h = max(7, round(row_h * 0.46))
        _draw_centered_text(
            draw, label, text_x + text_w / 2, y + row_h * 0.28,
            text_w, line_h, round(line_h * 0.82), bold=False,
        )
        if entry.get("temperature"):
            _draw_centered_text(
                draw, entry["temperature"], text_x + text_w / 2, y + row_h * 0.72,
                text_w, line_h, round(line_h * 0.95),
            )
        y += row_h

    return canvas


def _draw_radar_footer(
    width: int, height: int, forecast: dict[str, Any] | None, preserve_yellow: bool
) -> Image.Image:
    """Draw a compact horizontal forecast strip for portrait radar slots.

    One column per hour - condition icon, the hour, its temperature - with the
    current temperature in a cell of its own on the left.

    The three bands are measured and then centred as a single block. They used
    to be pinned to fixed fractions of the strip instead: the icon flush to the
    top padding, the hour at 0.62 and the temperature at 0.84, while the current
    temperature was centred at 0.5. Nothing lined up with anything - the icons
    floated above an empty band, the two text rows were squashed against the
    bottom edge, and the big current temperature sat in the gap between them
    rather than beside the columns it belongs to.
    """
    canvas = Image.new("RGB", (width, height), "white")
    if not forecast:
        return canvas
    draw = ImageDraw.Draw(canvas)
    pad = max(3, round(min(width, height) * 0.06))
    inner_h = max(1, height - 2 * pad)

    temperature = str(forecast.get("temperature") or "")
    entries = forecast.get("entries") or []

    # The left cell only earns its width when there is a reading to put in it,
    # and its own padding only when there are columns to be separated from.
    temp_w = min(round(width * 0.24), max(58, round(height * 0.9))) if temperature else 0
    entries_x = pad + temp_w + (pad if temp_w else 0)
    available_w = max(1, width - entries_x - pad)
    # What a column has to hold is "10:00" over "-12°C" at the band's own text
    # size - a width, not a height. This used to scale with the strip's height,
    # so a taller strip fitted fewer hours across than a short one: the
    # opposite of what the extra room should buy.
    min_slot_w = 44
    visible = min(len(entries), max(1, available_w // min_slot_w)) if entries else 0

    if visible <= 0:
        # No usable forecast, but a current temperature is still worth the
        # strip: give it the whole width rather than leaving the panel blank.
        if temperature:
            _draw_centered_text(
                draw, temperature, width / 2, height / 2,
                max(1, width - 2 * pad), inner_h,
                max(12, round(min(inner_h * 0.7, (width - 2 * pad) * 0.34))),
            )
        return canvas

    slot_w = available_w / visible
    line_h = max(8, min(round(inner_h * 0.30), 20))
    gap = max(1, round(inner_h * 0.05))
    icon_size = max(
        10,
        min(round(slot_w * 0.55), inner_h - 2 * line_h - 2 * gap),
    )
    stack_h = icon_size + gap + line_h + gap + line_h
    top = pad + max(0, (inner_h - stack_h) / 2)
    icon_y = round(top)
    label_cy = top + icon_size + gap + line_h / 2
    value_cy = label_cy + line_h / 2 + gap + line_h / 2

    if temperature:
        _draw_centered_text(
            draw, temperature, pad + temp_w / 2, top + stack_h / 2,
            temp_w, stack_h, max(12, round(min(stack_h * 0.5, temp_w * 0.34))),
        )
        # A hairline the height of the stack, so the left cell reads as its own
        # column rather than as a first hour that lost its icon.
        rule_x = round(pad + temp_w + pad / 2)
        draw.rectangle((rule_x, round(top), rule_x, round(top + stack_h)), fill=(0, 0, 0))

    text_w = max(1, round(slot_w - 4))
    for index, entry in enumerate(entries[:visible]):
        cx = entries_x + slot_w * (index + 0.5)
        icon = _weather_condition_icon_image(
            entry.get("condition", ""), icon_size, preserve_yellow, bool(entry.get("night"))
        )
        if icon is not None:
            canvas.paste(icon, (round(cx - icon.width / 2), icon_y), icon)
        label = entry.get("time") or entry.get("label") or ""
        _draw_centered_text(
            draw, label, cx, label_cy, text_w, line_h,
            max(8, round(line_h * 0.78)), bold=False,
        )
        if entry.get("temperature"):
            _draw_centered_text(
                draw, entry["temperature"], cx, value_cy, text_w, line_h,
                max(9, round(line_h * 0.88)),
            )
    return canvas


async def async_render_camera_binding_data_url(
    hass: Any,
    entity_id: str,
    width: int,
    height: int,
    country: str = "cz",
    show_precipitation: bool = True,
    dotted_light: bool = True,
    show_wind: bool = False,
    preserve_yellow: bool = False,
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
            quantized = quantize_bwr_preview(fitted, preserve_yellow)
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
            # The map renderer needs the physical palette up front so it can
            # dither the original radar raster directly into BWR or BWRY.
            preserve_yellow=preserve_yellow,
            target_width=width,
            target_height=height,
        )
        if radar_img is not None:
            def _prepare_radar() -> bytes:
                fitted = fit_to_size(radar_img, width, height)
                return _encode_radar_png(fitted, preserve_yellow)

            png_bytes = await hass.async_add_executor_job(_prepare_radar)
            return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
    except Exception:
        pass

    return None


def _encode_radar_png(image: Image.Image, preserve_yellow: bool) -> bytes:
    """Quantise a radar-template image (map or sidebar) to the panel's palette
    and encode it as PNG bytes - shared so the map and the sidebar, rendered
    and fetched separately, still end up looking like one consistent panel.
    """
    if not preserve_yellow:
        rgb = image.convert("RGB")
        red_band, green_band, blue_band = rgb.split()
        yellow_mask = ImageChops.logical_and(
            ImageChops.logical_and(
                red_band.point(lambda value: 255 if value >= 161 else 0, mode="1"),
                green_band.point(lambda value: 255 if value >= 128 else 0, mode="1"),
            ),
            blue_band.point(lambda value: 255 if value < 96 else 0, mode="1"),
        )
        rgb.paste(BWR_RED, mask=yellow_mask)
        image = rgb
    quantized = quantize_bwr_preview(image, preserve_yellow)
    buffer = io.BytesIO()
    quantized.save(buffer, format="PNG")
    return buffer.getvalue()


async def async_render_meteoradar_sidebar_data_url(
    hass: Any, width: int, height: int, preserve_yellow: bool = False
) -> str | None:
    """Render the Meteoradar template's hourly forecast sidebar as its own
    image, sized to exactly (width, height). Never raises: a display should
    still get its map if the weather-entity lookup fails.
    """
    try:
        forecast_summary = await _async_radar_forecast_summary(hass)
    except Exception:
        forecast_summary = None

    def _prepare_sidebar() -> bytes:
        canvas = _draw_radar_sidebar(width, height, forecast_summary, preserve_yellow)
        return _encode_radar_png(canvas, preserve_yellow)

    try:
        png_bytes = await hass.async_add_executor_job(_prepare_sidebar)
    except Exception:
        return None
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def render_entity_bound_template_image(
    svg_template: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
    preserve_yellow: bool = False,
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
        if _svg_graphic_binding(binding) and element_id and f'id="{element_id}"' in document:
            # The captured SVG already contains the graph from the last manual
            # send. Replace that whole tagged group with live geometry; drawing
            # a new transparent graph over the old one leaves stale bars behind
            # and can look as if the graph never refreshed.
            value = values.get(element_id, str(binding.get("fallback", "")))
            document = _replace_svg_group_by_id(
                document, element_id, _svg_graphic_slot(binding, value, preserve_yellow)
            )
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
        _composite_binding(image, binding, _render_binding_layer(binding, value, preserve_yellow=preserve_yellow))
    return quantize_bwr_preview(image, preserve_yellow)


def render_entity_bound_clean_background_image(
    clean_background: str,
    bindings: list[dict[str, Any]],
    values: dict[str, str],
    preserve_yellow: bool = False,
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
    # Transit boards saved before 0.1.345 were accidentally left painted into
    # clean_background: the panel's blanking list omitted the `transit` type.
    # Clear their complete white board area before drawing the current rows so
    # existing automations are repaired immediately, without making the user
    # open and save every template again.
    stale_transit = [binding for binding in svg_bindings if binding.get("type") == "transit"]
    if stale_transit:
        draw = ImageDraw.Draw(image)
        for binding in stale_transit:
            # One pixel wider than the row on every side. A board's badge plate
            # is stroked, and a 1px stroke sits centred on the edge, so half of
            # it lands outside the box; the same is true of the antialiasing
            # under text anchored flush to either margin. Clearing the box
            # exactly therefore left a hairline of the old board down the edge.
            x = max(0, math.floor(float(binding.get("x") or 0)) - 1)
            y = max(0, math.floor(float(binding.get("y") or 0)) - 1)
            right = min(width, math.ceil(float(binding.get("x") or 0) + float(binding.get("w") or 0)) + 1)
            bottom = min(height, math.ceil(float(binding.get("y") or 0) + float(binding.get("h") or 0)) + 1)
            if right > x and bottom > y:
                draw.rectangle((x, y, right - 1, bottom - 1), fill=(255, 255, 255, 255))
    # Composited before the remaining bindings, which keeps the z-order the
    # panel captured: the template's own rows are pushed ahead of the radar
    # image and the designer's overlay widgets in the binding list, and a manual
    # send paints those overlay widgets on top of the template SVG too.
    layer = _svg_overlay(svg_bindings, values, width, height, False, preserve_yellow)
    if layer is not None:
        image.alpha_composite(layer)
    else:
        for binding in svg_bindings:
            value = values.get(str(binding.get("id")), str(binding.get("fallback", "")))
            # A text slot forces the captured font size rather than PIL's
            # autoFit, which would grow the text to fill its box.
            drawn = {**binding, "autoFit": False} if _svg_text_binding(binding) else binding
            _composite_binding(
                image, drawn, _render_binding_layer(drawn, value, force_transparent=True, preserve_yellow=preserve_yellow)
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
            image, binding, _render_binding_layer(binding, value, force_transparent=True, preserve_yellow=preserve_yellow)
        )
    return quantize_bwr_preview(image, preserve_yellow)


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
    # A camera used to send the whole display down the SVG-substitution tier,
    # because back then the clean-background tier had no camera case at all and
    # pasting a frame over it would have covered Meteoradar's legend. That tier
    # has since grown one, and the panel sends the x/y/w/h it needs to place
    # the frame exactly where the <image> sat - so the exception now costs far
    # more than it buys: a display pairing Meteoradar with any second template
    # dropped *both* to the weaker tier, and the second one came back with its
    # static icon and footer but every bound value and icon missing.
    #
    # Only a capture too old to carry that geometry still needs the old route.
    camera_without_geometry = any(
        isinstance(binding, dict)
        and binding.get("type") == "camera"
        and not (binding.get("w") and binding.get("h"))
        for binding in bindings
    )
    # The same reasoning for a graphic row captured before its box was measured
    # in the layout it is drawn in. The SVG-substitution tier replaces the whole
    # tagged group rather than clearing a rectangle and drawing into it, so it
    # cannot leave the old row standing however wrong the recorded box is. As
    # soon as the user saves that automation again the stamp is current and the
    # preferred tier takes over on its own.
    stale_graphic_capture = any(_stale_graphic_capture(binding) for binding in bindings)
    if clean_background and not ((camera_without_geometry or stale_graphic_capture) and svg_template):
        image = render_entity_bound_clean_background_image(clean_background, bindings, values, True)
        if image is not None:
            return image
    if svg_template:
        image = render_entity_bound_template_image(svg_template, bindings, values, True)
        if image is not None:
            return image
    if clean_background:
        image = render_entity_bound_clean_background_image(clean_background, bindings, values, True)
        if image is not None:
            return image
    if svg_render.render_available() and any(
        isinstance(binding, dict) and binding.get("svg") for binding in bindings
    ):
        return render_entity_bound_svg_image(base_image, bindings, values, True)
    return render_entity_bound_image(base_image, bindings, values, True)


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
BWRY_CODES = {46, 78, 142, 270, 302, 310, 318, 558, 654, 686, 2670, 2702}
BWR_800X480_CODES = {299, 302, 310, 315, 318}


def packing_description(sdk_type: int) -> str:
    """Which packer `pack_bwr_image` will use, in words, for the transfer log.

    A display fed the wrong packing does not fail: it accepts the payload and
    prints it, and two bits per pixel read one bit at a time is white/red/black
    grain across the whole panel. Nothing in the log said which packer had run,
    so the only way to tell that from a display fault was to own two of them.

    Note that BWRY_CODES is tested first and returns, so a code in both sets -
    302, 310 and 318, each named "800x480 BWR" in SDK_MODELS - never reaches
    the three-colour branch at all. That is what this line makes visible.
    """
    code = int(sdk_type)
    width, height = display_size(code)
    if code in BWRY_CODES:
        kind = "four-colour, 2 bits/pixel"
        if code in BWR_800X480_CODES:
            kind += " (also listed as an 800x480 three-colour type)"
    elif code in BWR_800X480_CODES:
        kind = "three-colour, vertical flip and inverted first plane"
    else:
        kind = "three-colour, two bit planes"
    return f"SDK type {code} ({SDK_MODELS.get(code, 'unknown model')}), {width}x{height}, packed {kind}"


def _finalize_bwry_orientation(image: Image.Image) -> Image.Image:
    """Rotate the completed four-colour hardware framebuffer into panel orientation."""
    return image.rotate(180, expand=False)


def expected_buffer_size(sdk_type: int) -> tuple[int, int]:
    """Get the physical hardware pixel buffer dimensions (width, height) expected by display IC."""
    code = int(sdk_type)
    native_w, native_h = display_size(sdk_type)
    if code == 654:
        return (768, 528)
    if code in (2670, 2702):
        return (800, 272)
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

    if code in BWRY_CODES:
        # BWRY controllers use one packed two-bit framebuffer and a handful of
        # models expose a logical canvas that differs from that framebuffer.
        # First normalise to the advertised canvas, then apply the vendor's
        # physical orientation/padding. This keeps templates WYSIWYG while the
        # byte stream has the exact dimensions expected by the controller.
        if image.size == (native_h, native_w) and native_w != native_h:
            image = image.rotate(-90, expand=True)
        if image.size != (native_w, native_h):
            image = image.resize((native_w, native_h), Image.Resampling.LANCZOS)

        # The 296x128 controller first needs its vendor-specific quarter turn.
        # The common BWRY mounting correction is applied to the completed
        # framebuffer below, just like it is for every other four-colour model.
        if code == BWRY_296X128_CODE:
            angle = 90 if transform in ("rotate_ccw", "rotate_180") else -90
            image = image.rotate(angle, expand=True)
            if transform == "flip_lr":
                image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            elif transform == "flip_tb":
                image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            if image.size != (target_w, target_h):
                image = image.resize((target_w, target_h), Image.Resampling.LANCZOS)
            return _finalize_bwry_orientation(image)

        if transform == "rotate_180":
            image = image.rotate(180, expand=True)
        elif transform == "flip_lr":
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        elif transform == "flip_tb":
            image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

        if code == 270:
            image = image.rotate(-90, expand=True)
        elif code == 558:
            image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        elif code == 654:
            image = image.rotate(90, expand=True)
        elif code == 686:
            image = image.rotate(-90, expand=True)
        elif code == 2670:
            padded = Image.new("RGB", (800, 272), BWR_WHITE)
            padded.paste(image, (4, 0))
            image = padded
        elif code == 2702:
            padded = Image.new("RGB", (272, 800), BWR_WHITE)
            padded.paste(image, (0, 4))
            image = padded.rotate(90, expand=True)

        if image.size != (target_w, target_h):
            image = image.resize((target_w, target_h), Image.Resampling.LANCZOS)
        return _finalize_bwry_orientation(image)

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

    if code in BWRY_CODES:
        return _pack_bwry_image(image)

    # A saved four-colour design may be reused on a three-colour display. The
    # requested fallback is explicit: yellow pigment becomes red rather than
    # disappearing into the white plane.
    rgb = image.convert("RGB")
    yellow = yellow_mask(rgb)
    if yellow.getbbox():
        image = rgb.copy()
        image.paste(BWR_RED, mask=yellow)

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
