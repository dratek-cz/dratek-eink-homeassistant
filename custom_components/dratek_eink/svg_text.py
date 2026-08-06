"""Verbatim Python port of the panel's SVG text layout.

The panel builds every template `<text>` element in
frontend/panel/panel-template-svg.mixin.js: it estimates a string's width from a
per-character advance table (`glyphWidth`), shrinks the font to fit its box
(`_svgFitFontSize`), clips with an ellipsis when it still overflows
(`_svgReadableText`) and finally serialises the element (`_svgText`).

Automatic entity refreshes have to reproduce that element *byte for byte* so the
backend-rasterised image matches the panel-rasterised manual send. Because the
width estimate is a fixed table rather than a real font metric, the layout is
fully deterministic and portable: as long as this module stays a faithful mirror
of the JavaScript, both sides pick the same font size, the same clip and the same
anchor for any value.

Keep every constant and branch below identical to the JavaScript. When one side
changes, change the other in the same commit; tests/test_svg_text_port.py pins
the two together.
"""

from __future__ import annotations

import re

# Mirror of the module-scope constants in panel-template-svg.mixin.js. FONT lists
# Arimo first: the panel embeds the bundled Arimo-wght.ttf through an @font-face
# and the backend loads the very same file into resvg, so both resolve "Arimo"
# and only fall back to the metric-compatible Arial when the embed is unavailable.
FONT = "Arimo, Arial, Helvetica, sans-serif"
BLACK = "#000000"
MIN_READABLE_FONT_SIZE = 10

_GLYPH_MW = re.compile(r"[mwMW]")
_GLYPH_NARROW_CAP = re.compile(r"[IJLT]")
_GLYPH_NARROW = re.compile(r"[fijlrt]")
_GLYPH_DIGIT = re.compile(r"[0-9]")
_GLYPH_PUNCT = re.compile(r"[\s.,:;'`|!]")
_GLYPH_DASH = re.compile(r"[-–·/()\[\]]")
_GLYPH_WIDE = re.compile(r"[—%@]")


def glyph_width(character: str, bold: bool) -> float:
    """Advance width of one glyph as a fraction of the font size.

    Direct port of `glyphWidth` in panel-template-svg.mixin.js, measured off the
    Arial/Helvetica stack (which Arimo is metric-compatible with).
    """
    if _GLYPH_MW.search(character):
        return 0.87 if bold else 0.83
    if _GLYPH_NARROW_CAP.search(character):
        return 0.52 if bold else 0.49
    if _GLYPH_NARROW.search(character):
        return 0.32 if bold else 0.27
    if _GLYPH_DIGIT.search(character):
        return 0.56
    if _GLYPH_PUNCT.search(character):
        return 0.28
    if _GLYPH_DASH.search(character):
        return 0.36
    if _GLYPH_WIDE.search(character):
        return 0.95
    # Uppercase is detected by case-folding rather than a character range so Czech
    # diacritics - Á, Č, Ř, Ž - are not mistaken for lowercase, exactly as the JS.
    if character != character.lower():
        return 0.72 if bold else 0.70
    return 0.58 if bold else 0.53


def svg_text_width(value: object, size: float, bold: bool) -> float:
    """Advance width of a string at a given size. Port of `_svgTextWidth`."""
    text = "" if value is None else str(value)
    ems = 0.0
    for character in text:
        ems += glyph_width(character, bold)
    return ems * size


def svg_fit_font_size(
    value: object,
    size: float,
    max_width: float,
    bold: bool,
    min_size: float = MIN_READABLE_FONT_SIZE,
) -> float:
    """Shrink the font just enough to fit the box. Port of `_svgFitFontSize`."""
    text = "" if value is None else str(value)
    try:
        requested = max(min_size, float(size))
    except (TypeError, ValueError):
        requested = min_size
    if not max_width or not text:
        return requested
    estimated = svg_text_width(text, requested, bold)
    if estimated > max_width:
        return max(min_size, requested * (max_width / estimated))
    return requested


def svg_readable_text(
    value: object,
    size: float,
    max_width: float,
    bold: bool,
    min_size: float = MIN_READABLE_FONT_SIZE,
) -> tuple[str, float]:
    """Fit then ellipsis-clip a string. Port of `_svgReadableText`.

    Returns (text, font_size) just like the JavaScript object {text, fontSize}.
    """
    original = "" if value is None else str(value)
    font_size = svg_fit_font_size(original, size, max_width, bold, min_size)
    if not max_width or svg_text_width(original, font_size, bold) <= max_width:
        return original, font_size
    ellipsis = "…"
    clipped = original
    while (
        len(clipped) > 1
        and svg_text_width(f"{clipped}{ellipsis}", font_size, bold) > max_width
    ):
        clipped = clipped[:-1]
    if len(clipped) < len(original):
        return f"{clipped.rstrip()}{ellipsis}", font_size
    return original, font_size


def escape_xml(value: object) -> str:
    """Port of the panel's `_escape` (panel-render-ui.mixin.js)."""
    text = str(value)
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def svg_text(
    value: object,
    x: float,
    y: float,
    size: float,
    *,
    bold: bool = False,
    anchor: str = "middle",
    color: str = BLACK,
    max_width: float = 0,
    min_size: float = MIN_READABLE_FONT_SIZE,
) -> str:
    """Serialise one `<text>` element. Port of `_svgText`.

    `y` is the vertical centre because every element is drawn with
    dominant-baseline="central", matching the panel exactly. Returns "" for an
    empty string, again matching the JavaScript so the placeholder stays absent
    rather than becoming an empty element.
    """
    text = "" if value is None else str(value)
    if not text:
        return ""
    fitted_text, font_size = svg_readable_text(text, size, max_width, bold, min_size)
    return (
        f'<text x="{x:.2f}" y="{y:.2f}" font-family="{FONT}" font-size="{font_size:.2f}"'
        f' font-weight="{700 if bold else 400}" fill="{color}" text-anchor="{anchor}"'
        f' dominant-baseline="central" xml:space="preserve">{escape_xml(fitted_text)}</text>'
    )
