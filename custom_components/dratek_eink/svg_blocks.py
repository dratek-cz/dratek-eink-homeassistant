"""Verbatim Python port of the panel's graphic template rows.

A template is a stack of rows, and each row is drawn by one small pure function
in frontend/panel/panel-template-svg.mixin.js that returns SVG markup for a box:
`_blockBars`, `_blockSpark`, `_blockMeters`, `_blockRing`, `_blockDial`,
`_blockStrip` and `_blockDatebox`. Four of those rows carry live data - a
sparkline or bar chart (series), a gauge (ratio), a weather strip (day) and a
calendar entry (event) - so an automatic refresh has to redraw them.

Redrawing them with PIL, as render.py did, can only ever approximate the shapes
the browser drew: the arcs, the bar spacing, the text sizes and the ten-pixel
readability floor every `_svgText` call applies are all decided inside these
functions. Porting them instead - the same approach svg_text.py already takes
for the text builder, and for the same reason - lets the backend hand resvg the
very markup the panel produced, so an automatic refresh reproduces a manual send
rather than resembling it. The PIL renderers stay as the fallback for platforms
the rasteriser has no wheel for.

Keep every constant and branch below identical to the JavaScript. When one side
changes, change the other in the same commit; tests/test_svg_blocks_port.py pins
the two together.
"""

from __future__ import annotations

import math
from typing import Any

from .svg_text import svg_text

# The panel's own two ink constants (panel-template-svg.mixin.js). Both survive
# quantize_bwr_preview as the panel's red and black, so the markup this module
# emits carries the same colours the browser wrote rather than the backend's own
# post-quantisation values.
BLACK = "#000000"
RED = "#e31b1b"


def ink(color: Any) -> str:
    """Port of `_templateInk`."""
    return RED if color == "red" else BLACK


def hairline(x: float, y: float, w: float, h: float, color: str = BLACK) -> str:
    """Port of `_svgHairline`."""
    return (
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{max(1, w):.2f}"'
        f' height="{max(1, h):.2f}" fill="{color}"></rect>'
    )


def arc_path(
    cx: float, cy: float, outer: float, inner: float, start_angle: float, end_angle: float
) -> str:
    """An annular sector shared by the donut and the half-dial. Port of `_svgArcPath`."""
    stop = min(end_angle, start_angle + 359.9)

    def point(radius: float, angle: float) -> tuple[float, float]:
        rad = angle * math.pi / 180
        return cx + radius * math.cos(rad), cy + radius * math.sin(rad)

    large = 1 if stop - start_angle > 180 else 0
    x1, y1 = point(outer, start_angle)
    x2, y2 = point(outer, stop)
    x3, y3 = point(inner, stop)
    x4, y4 = point(inner, start_angle)
    return (
        f"M{x1:.2f} {y1:.2f} A{outer:.2f} {outer:.2f} 0 {large} 1 {x2:.2f} {y2:.2f}"
        f" L{x3:.2f} {y3:.2f} A{inner:.2f} {inner:.2f} 0 {large} 0 {x4:.2f} {y4:.2f} Z"
    )


def icon(path: str, cx: float, cy: float, size: float, color: str = BLACK) -> str:
    """Port of `_svgIcon` for an MDI glyph.

    The panel looks the glyph up in ICON_GEOMETRY, filled at runtime by letting
    Home Assistant's own ha-icon render it; every entry it can produce is an
    `<svg viewBox="0 0 24 24">` wrapping one `<path>`, which is what the caller
    passes in here as raw path data. Returns "" for an unknown glyph, exactly as
    the JavaScript does for a name it never resolved.
    """
    if not path:
        return ""
    x = cx - size / 2
    y = cy - size / 2
    return (
        f'<svg x="{x:.2f}" y="{y:.2f}" width="{size:.2f}" height="{size:.2f}"'
        f' viewBox="0 0 24 24" fill="{color}" color="{color}">'
        f'<path d="{path}" fill="currentColor"></path></svg>'
    )


def _finite_numbers(values: Any) -> list[float]:
    numbers: list[float] = []
    for item in values or []:
        try:
            number = float(item)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            numbers.append(number)
    return numbers


def block_bars(bars: dict[str, Any], box: dict[str, float]) -> str:
    """Port of `_blockBars`."""
    values = _finite_numbers(bars.get("values"))
    if not values:
        return ""
    labels = bars.get("labels") or []
    label_height = min(box["h"] * 0.28, 13) if labels else 0
    chart_height = max(1, box["h"] - label_height)
    top = max(values)
    bottom = min([*values, 0])
    span = (top - bottom) or 1
    step = box["w"] / len(values)
    bar_width = max(1, step * 0.68)
    highlight = bars.get("highlight")
    parts = [
        f'<rect x="{box["x"]:.2f}" y="{box["y"]:.2f}" width="{box["w"]:.2f}"'
        f' height="{box["h"]:.2f}" fill="#ffffff" fill-opacity="0" pointer-events="all"></rect>',
        hairline(box["x"], box["y"] + chart_height, box["w"], 1),
    ]
    for index, value in enumerate(values):
        bar_height = max(1, ((value - bottom) / span) * (chart_height - 1))
        parts.append(
            f'<rect x="{box["x"] + step * index + (step - bar_width) / 2:.2f}"'
            f' y="{box["y"] + chart_height - bar_height:.2f}"'
            f' width="{bar_width:.2f}" height="{bar_height:.2f}"'
            f' fill="{RED if highlight == index else BLACK}"></rect>'
        )
    for index, label in enumerate(labels):
        if label is None or label == "":
            continue
        # Only selected ticks carry a label (typically 0, 6, 12 and 18). They may
        # use the empty neighbouring intervals instead of being squeezed into the
        # width of one narrow bar.
        label_width = min(box["w"], max(step * 0.95, step * 3.5))
        raw_x = box["x"] + step * (index + 0.5)
        label_x = max(
            box["x"] + label_width / 2,
            min(box["x"] + box["w"] - label_width / 2, raw_x),
        )
        parts.append(
            svg_text(
                label,
                label_x,
                box["y"] + chart_height + label_height * 0.58,
                max(7, label_height * 0.7),
                max_width=label_width,
            )
        )
    return "".join(parts)


def block_spark(spark: dict[str, Any], box: dict[str, float]) -> str:
    """Port of `_blockSpark`."""
    values = _finite_numbers(spark.get("values"))
    if len(values) < 2:
        return ""
    top = max(values)
    bottom = min(values)
    span = (top - bottom) or 1
    step = box["w"] / (len(values) - 1)
    points = [
        (box["x"] + step * index, box["y"] + box["h"] - ((value - bottom) / span) * box["h"])
        for index, value in enumerate(values)
    ]
    drawn = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    parts = [
        hairline(box["x"], box["y"] + box["h"], box["w"], 1),
        f'<polyline points="{drawn}" fill="none" stroke="{ink(spark.get("color"))}"'
        f' stroke-width="{max(1, box["h"] * 0.05):.2f}" stroke-linejoin="round"'
        f' stroke-linecap="round"></polyline>',
    ]
    last_x, last_y = points[-1]
    parts.append(
        f'<circle cx="{last_x:.2f}" cy="{last_y:.2f}"'
        f' r="{max(1.5, box["h"] * 0.08):.2f}" fill="{RED}"></circle>'
    )
    caption = spark.get("caption")
    if caption is not None:
        parts.append(
            svg_text(
                caption,
                box["x"],
                box["y"] + box["h"] * 0.14,
                max(8.5, box["h"] * 0.22),
                anchor="start",
                max_width=box["w"] * 0.6,
            )
        )
    return "".join(parts)


def block_meters(meters: list[dict[str, Any]], box: dict[str, float]) -> str:
    """Port of `_blockMeters`."""
    line_height = box["h"] / (len(meters) or 1)
    parts: list[str] = []
    for index, meter in enumerate(meters):
        top = box["y"] + line_height * index
        label_size = max(7, min(line_height * 0.42, box["w"] * 0.1))
        bar_height = max(2, line_height * 0.28)
        bar_y = top + line_height * 0.55
        percent = max(0.0, min(1.0, _number(meter.get("percent"))))
        parts.append(
            svg_text(
                meter.get("label"),
                box["x"],
                top + line_height * 0.26,
                label_size,
                anchor="start",
                max_width=box["w"] * 0.58,
            )
        )
        parts.append(
            svg_text(
                meter.get("value"),
                box["x"] + box["w"],
                top + line_height * 0.26,
                label_size,
                anchor="end",
                bold=True,
                color=ink(meter.get("color")),
                max_width=box["w"] * 0.4,
            )
        )
        parts.append(
            f'<rect x="{box["x"]:.2f}" y="{bar_y:.2f}" width="{box["w"]:.2f}"'
            f' height="{bar_height:.2f}" fill="none" stroke="{BLACK}" stroke-width="1"></rect>'
        )
        if percent > 0:
            parts.append(
                f'<rect x="{box["x"]:.2f}" y="{bar_y:.2f}"'
                f' width="{box["w"] * percent:.2f}" height="{bar_height:.2f}"'
                f' fill="{ink(meter.get("color"))}"></rect>'
            )
    return "".join(parts)


def block_ring(ring: dict[str, Any], box: dict[str, float]) -> str:
    """Port of `_blockRing`."""
    cx = box["x"] + box["w"] / 2
    cy = box["y"] + box["h"] / 2
    outer = min(box["w"], box["h"]) * 0.46
    inner = outer * 0.68
    percent = max(0.0, min(1.0, _number(ring.get("percent"))))
    parts = [
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{outer:.2f}" fill="none"'
        f' stroke="{BLACK}" stroke-width="1"></circle>',
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{inner:.2f}" fill="none"'
        f' stroke="{BLACK}" stroke-width="1"></circle>',
    ]
    if percent > 0:
        parts.append(
            f'<path d="{arc_path(cx, cy, outer, inner, -90, -90 + percent * 360)}"'
            f' fill="{ink(ring.get("color"))}"></path>'
        )
    caption = ring.get("caption")
    if ring.get("value") is not None:
        parts.append(
            svg_text(
                ring.get("value"),
                cx,
                cy - (inner * 0.2 if caption is not None else 0),
                inner * 0.62,
                bold=True,
                max_width=inner * 1.7,
            )
        )
    if caption is not None:
        parts.append(
            svg_text(caption, cx, cy + inner * 0.46, inner * 0.34, max_width=inner * 1.7)
        )
    return "".join(parts)


def block_dial(dial: dict[str, Any], box: dict[str, float]) -> str:
    """Port of `_blockDial` - a half dial, open at the bottom."""
    cx = box["x"] + box["w"] / 2
    outer = min(box["w"] * 0.46, box["h"] * 0.82)
    inner = outer * 0.7
    cy = box["y"] + box["h"] * 0.5 + outer * 0.4
    percent = max(0.0, min(1.0, _number(dial.get("percent"))))
    parts = [
        f'<path d="{arc_path(cx, cy, outer, inner, 180, 360)}" fill="none"'
        f' stroke="{BLACK}" stroke-width="1"></path>'
    ]
    if percent > 0:
        parts.append(
            f'<path d="{arc_path(cx, cy, outer, inner, 180, 180 + percent * 180)}"'
            f' fill="{ink(dial.get("color"))}"></path>'
        )
    if dial.get("value") is not None:
        parts.append(
            svg_text(
                dial.get("value"), cx, cy - outer * 0.28, outer * 0.42,
                bold=True, max_width=inner * 1.8,
            )
        )
    if dial.get("caption") is not None:
        parts.append(
            svg_text(dial.get("caption"), cx, cy + outer * 0.16, outer * 0.24, max_width=inner * 1.9)
        )
    if dial.get("min") is not None:
        parts.append(
            svg_text(dial.get("min"), cx - outer, cy + outer * 0.22, outer * 0.2, max_width=outer * 0.7)
        )
    if dial.get("max") is not None:
        parts.append(
            svg_text(dial.get("max"), cx + outer, cy + outer * 0.22, outer * 0.2, max_width=outer * 0.7)
        )
    return "".join(parts)


def block_strip(cells: list[dict[str, Any]], box: dict[str, float]) -> str:
    """Port of `_blockStrip`.

    Each cell's `icon` is raw MDI path data rather than the panel's glyph name;
    the caller resolves it, since the backend has no ha-icon to ask.
    """
    cell_width = box["w"] / (len(cells) or 1)
    # Without icons there is no middle row to sit around, so label and value close
    # up instead of leaving a gap where the icon would have been.
    iconed = any(cell.get("icon") for cell in cells)
    label_y = box["y"] + box["h"] * (0.16 if iconed else 0.3)
    value_y = box["y"] + box["h"] * (0.85 if iconed else 0.72)
    parts: list[str] = []
    for index, cell in enumerate(cells):
        cx = box["x"] + cell_width * (index + 0.5)
        if index > 0:
            parts.append(
                hairline(box["x"] + cell_width * index, box["y"] + box["h"] * 0.12, 1, box["h"] * 0.76)
            )
        parts.append(
            svg_text(
                cell.get("label"), cx, label_y,
                max(8.5, min(box["h"] * 0.25, cell_width * 0.32)),
                bold=True, max_width=cell_width * 0.9,
            )
        )
        if cell.get("icon"):
            parts.append(
                icon(
                    str(cell.get("icon")), cx, box["y"] + box["h"] * 0.5,
                    min(box["h"] * 0.34, cell_width * 0.5), ink(cell.get("color")),
                )
            )
        parts.append(
            svg_text(
                cell.get("value"), cx, value_y,
                max(10, min(box["h"] * 0.32, cell_width * 0.36)),
                bold=True, color=ink(cell.get("color")), max_width=cell_width * 0.9,
            )
        )
    return "".join(parts)


def block_datebox(date: dict[str, Any], box: dict[str, float]) -> str:
    """Port of `_blockDatebox` - a boxed date beside its entries."""
    side = min(box["h"] * 0.92, box["w"] * 0.3)
    left = box["x"]
    top = box["y"] + (box["h"] - side) / 2
    parts = [
        f'<rect x="{left:.2f}" y="{top:.2f}" width="{side:.2f}" height="{side:.2f}"'
        f' fill="none" stroke="{BLACK}" stroke-width="1"></rect>',
        f'<rect x="{left:.2f}" y="{top:.2f}" width="{side:.2f}"'
        f' height="{side * 0.28:.2f}" fill="{ink(date.get("color"))}"></rect>',
        svg_text(
            date.get("month"), left + side / 2, top + side * 0.15, max(8.5, side * 0.22),
            color="#ffffff", bold=True, max_width=side * 0.92,
        ),
        svg_text(
            date.get("day"), left + side / 2, top + side * 0.64, max(11, side * 0.5),
            bold=True, max_width=side * 0.86,
        ),
    ]
    text_x = left + side + max(3, side * 0.16)
    right = box["x"] + box["w"]
    lines = [line for line in (date.get("lines") or []) if line is not None and line != ""]
    line_height = box["h"] / max(1, len(lines))
    for index, line in enumerate(lines):
        size = line_height * (0.56 if index == 0 else 0.42)
        parts.append(
            svg_text(
                line, text_x, box["y"] + line_height * (index + 0.5), max(8.5, size),
                anchor="start", bold=index == 0,
                color=ink(date.get("color")) if index == 0 else BLACK,
                max_width=right - text_x,
            )
        )
    return "".join(parts)


def _number(value: Any) -> float:
    """`Number(value) || 0` - a non-numeric percent reads as zero, as in the JS."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0
