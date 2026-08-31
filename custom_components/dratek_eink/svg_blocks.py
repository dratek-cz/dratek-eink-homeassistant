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

import base64
import io
import math
from typing import Any

from PIL import Image

from . import svg_render
from .svg_text import svg_fit_font_size, svg_text, svg_text_width

# The panel's own two ink constants (panel-template-svg.mixin.js). Both survive
# quantize_bwr_preview as the panel's red and black, so the markup this module
# emits carries the same colours the browser wrote rather than the backend's own
# post-quantisation values.
BLACK = "#000000"
RED = "#e31b1b"
YELLOW = "#f4c400"


def ink(color: Any) -> str:
    """Port of `_templateInk`."""
    return RED if color == "red" else BLACK


def fill_fraction(value: Any) -> float:
    """Port of `_fillFraction`.

    A proportion is a 0-1 fraction here, but a template that wrote a plain
    percentage used to clamp to 1 and fill the shape completely, so anything
    above 1 is read as the percentage it obviously is.
    """
    number = _number(value)
    if number <= 0:
        return 0.0
    return min(1.0, number / 100 if number > 1 else number)


def accent_ink(accent: Any, color: Any, preserve_yellow: bool) -> tuple[str, bool]:
    """The fill for a proportional shape, and whether it needs a black edge.

    Port of the `accent` decision `_blockDial`/`_blockRing`/`_blockMeters`/
    `_blockBars` make. The panel decides at capture time whether the row may
    take the four-colour accent (protected templates never do) and records it
    on the binding; `preserve_yellow` is the render-time truth about whether
    the panel this is being drawn for can print yellow at all. Yellow on white
    is almost no contrast once the panel thresholds every pixel, so a yellow
    fill is always bounded by a black outline.
    """
    if accent == "yellow" and color != "red" and preserve_yellow:
        return YELLOW, True
    return ink(color), False


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


# Home Assistant's own weather glyphs (frontend `src/data/weather.ts`,
# `getWeatherStateSVG` + `weatherSVGStyles`), copied verbatim - same paths,
# same 17x17 viewBox, same fill colours. `weather_icon` below never draws
# this vector markup directly on the panel; it rasterises it and runs it
# through svg_render.quantize_bwr_dithered (Floyd-Steinberg), the same
# "treat it as an image and convert it like one" path a camera snapshot goes
# through (render.async_render_camera_binding_data_url). A flat threshold
# would erase the paler fills here (#f9f9f9 cloud-front, #fcf497 moon)
# outright; error diffusion turns them into a visible dot pattern instead.
WEATHER_SUN_COLOR = "#fdd93c"
WEATHER_MOON_COLOR = "#fcf497"
WEATHER_CLOUD_BACK_COLOR = "#d4d4d4"
WEATHER_CLOUD_FRONT_COLOR = "#f9f9f9"
WEATHER_SNOW_FILL = "#f9f9f9"

_WEATHER_SUN_D = (
    "m 14.39303,8.4033507 c 0,3.3114723 -2.684145,5.9956173 -5.9956169,5.9956173 "
    "-3.3114716,0 -5.9956168,-2.684145 -5.9956168,-5.9956173 0,-3.311471 2.6841452,"
    "-5.995617 5.9956168,-5.995617 3.3114719,0 5.9956169,2.684146 5.9956169,5.995617"
)
_WEATHER_MOON_D = (
    "m 13.502891,11.382935 c -1.011285,1.859223 -2.976664,3.121381 -5.2405751,3.121381 "
    "-3.289929,0 -5.953329,-2.663833 -5.953329,-5.9537625 0,-2.263911 1.261724,-4.228856 "
    "3.120948,-5.240575 -0.452782,0.842738 -0.712753,1.806363 -0.712753,2.832381 0,3.289928 "
    "2.663833,5.9533275 5.9533291,5.9533275 1.026017,0 1.989641,-0.259969 2.83238,-0.712752"
)
_WEATHER_PARTLY_DISC_D = (
    "m14.981 4.2112c0 1.9244-1.56 3.4844-3.484 3.4844-1.9244 0-3.4844-1.56-3.4844-3.4844"
    "s1.56-3.484 3.4844-3.484c1.924 0 3.484 1.5596 3.484 3.484"
)
_WEATHER_CLOUD_BACK_D = (
    "m3.8863 5.035c-0.54892 0.16898-1.04 0.46637-1.4372 0.8636-0.63077 0.63041-1.0206 "
    "1.4933-1.0206 2.455 0 1.9251 1.5589 3.4682 3.4837 3.4682h6.9688c1.9251 0 3.484"
    "-1.5981 3.484-3.5232 0-1.9251-1.5589-3.5232-3.484-3.5232h-1.0834c-0.25294-1.6916"
    "-1.6986-2.9083-3.4463-2.9083-1.7995 0-3.2805 1.4153-3.465 3.1679"
)
_WEATHER_CLOUD_FRONT_D = (
    "m4.1996 7.6995c-0.33902 0.10407-0.64276 0.28787-0.88794 0.5334-0.39017 0.38982"
    "-0.63147 0.92322-0.63147 1.5176 0 1.1896 0.96414 2.1431 2.1537 2.1431h4.3071c1.1896 "
    "0 2.153-0.98742 2.153-2.1777 0-1.1896-0.96344-2.1777-2.153-2.1777h-0.66992c-0.15593"
    "-1.0449-1.0499-1.7974-2.1297-1.7974-1.112 0-2.0274 0.87524-2.1417 1.9586"
)
_WEATHER_RAIN_D = (
    "m5.2852 14.734c-0.22401 0.24765-0.57115 0.2988-0.77505 0.11395-0.20391-0.1845"
    "-0.18732-0.53481 0.036689-0.78281 0.14817-0.16298 0.59126-0.32914 0.87559-0.42369 "
    "0.12453-0.04092 0.22684 0.05186 0.19791 0.17956-0.065617 0.2921-0.18732 0.74965"
    "-0.33514 0.91299",
    "m11.257 14.163c-0.22437 0.24765-0.57115 0.2988-0.77505 0.11395-0.2039-0.1845"
    "-0.18768-0.53481 0.03669-0.78281 0.14817-0.16298 0.59126-0.32914 0.8756-0.42369 "
    "0.12453-0.04092 0.22684 0.05186 0.19791 0.17956-0.06562 0.2921-0.18732 0.74965"
    "-0.33514 0.91299",
    "m8.432 15.878c-0.15452 0.17039-0.3937 0.20567-0.53446 0.07867-0.14041-0.12735"
    "-0.12876-0.36865 0.025753-0.53975 0.10195-0.11218 0.40711-0.22684 0.60325-0.29175 "
    "0.085725-0.02858 0.15628 0.03563 0.13652 0.12382-0.045508 0.20108-0.12912 0.51647"
    "-0.23107 0.629",
    "m7.9991 14.118c-0.19226 0.21237-0.49001 0.25612-0.66499 0.09737-0.17462-0.15804"
    "-0.16051-0.45861 0.03175-0.67098 0.12665-0.14005 0.50729-0.28293 0.75071-0.36336 "
    "0.10689-0.03563 0.19473 0.0441 0.17004 0.15346-0.056092 0.25082-0.16051 0.64347"
    "-0.28751 0.78352",
)
_WEATHER_POURING_EXTRA_D = (
    "m10.648 16.448c-0.19226 0.21449-0.49001 0.25894-0.66499 0.09878-0.17498-0.16016"
    "-0.16087-0.4639 0.03175-0.67874 0.12665-0.14146 0.50694-0.2854 0.75071-0.36724 "
    "0.10689-0.03563 0.19473 0.0448 0.17004 0.15558-0.05645 0.25365-0.16051 0.65017"
    "-0.28751 0.79163",
    "m5.9383 16.658c-0.22437 0.25012-0.5715 0.30162-0.77505 0.11501-0.20391-0.18627"
    "-0.18768-0.54046 0.036689-0.79093 0.14817-0.1651 0.59126-0.33267 0.87559-0.42827 "
    "0.12418-0.04127 0.22648 0.05221 0.19791 0.18168-0.065617 0.29528-0.18732 0.75741"
    "-0.33514 0.92251",
)
_WEATHER_WIND_D = (
    "m 13.59616,15.30968 c 0,0 -0.09137,-0.0071 -0.250472,-0.0187 -0.158045,-0.01235 "
    "-0.381353,-0.02893 -0.64382,-0.05715 -0.262466,-0.02716 -0.564444,-0.06385 "
    "-0.877358,-0.124531 -0.156986,-0.03034 -0.315383,-0.06844 -0.473781,-0.111478 "
    "-0.157691,-0.04551 -0.313266,-0.09842 -0.463902,-0.161219 l -0.267406,-0.0949 c "
    "-0.09984,-0.02646 -0.205669,-0.04904 -0.305153,-0.06738 -0.193322,-0.02716 "
    "-0.3838218,-0.03316 -0.5640912,-0.02011 -0.3626556,0.02611 -0.6847417,0.119239 "
    "-0.94615,0.226483 -0.2617611,0.108656 -0.4642556,0.230364 -0.600075,0.324203 "
    "-0.1358195,0.09419 -0.2049639,0.160514 -0.2049639,0.160514 0,0 0.089958,-0.01623 "
    "0.24765,-0.04445 0.1559278,-0.02575 0.3764139,-0.06174 0.6367639,-0.08714 "
    "0.2596444,-0.02646 0.5591527,-0.0441 0.8678333,-0.02328 0.076905,0.0035 "
    "0.1538111,0.01658 0.2321278,0.02293 0.077611,0.01058 0.1534581,0.02893 "
    "0.2314221,0.04022 0.07267,0.01834 0.1397,0.03986 0.213078,0.05644 l 0.238125,"
    "0.08925 c 0.09207,0.03281 0.183444,0.07055 0.275872,0.09878 0.09243,0.0261 "
    "0.185208,0.05327 0.277636,0.07161 0.184856,0.0388 0.367947,0.06174 0.543983,"
    "0.0702 0.353131,0.01905 0.678745,-0.01341 0.951442,-0.06456 0.27305,-0.05292 "
    "0.494595,-0.123119 0.646642,-0.181681 0.152047,-0.05785 0.234597,-0.104069 "
    "0.234597,-0.104069",
    "m 4.7519154,13.905801 c 0,0 0.091369,-0.0032 0.2511778,-0.0092 0.1580444,-0.0064 "
    "0.3820583,-0.01446 0.6455833,-0.03281 0.2631722,-0.01729 0.5662083,-0.04269 "
    "0.8812389,-0.09137 0.1576916,-0.02434 0.3175,-0.05609 0.4776611,-0.09384 "
    "0.1591027,-0.03951 0.3167944,-0.08643 0.4699,-0.14358 l 0.2702277,-0.08467 c "
    "0.1008945,-0.02222 0.2074334,-0.04127 0.3072695,-0.05574 0.1943805,-0.01976 "
    "0.3848805,-0.0187 0.5651499,0.0014 0.3608917,0.03951 0.67945,0.144639 0.936625,"
    "0.261761 0.2575278,0.118534 0.4554364,0.247297 0.5873754,0.346781 0.132291,"
    "0.09913 0.198966,0.168275 0.198966,0.168275 0,0 -0.08925,-0.01976 -0.245886,"
    "-0.05397 C 9.9423347,14.087088 9.7232597,14.042988 9.4639681,14.00736 9.2057347,"
    "13.97173 8.9072848,13.94245 8.5978986,13.95162 c -0.077258,7.06e-4 -0.1541638,"
    "0.01058 -0.2328333,0.01411 -0.077964,0.0078 -0.1545166,0.02328 -0.2331861,"
    "0.03175 -0.073025,0.01588 -0.1404055,0.03422 -0.2141361,0.04798 l -0.2420055,"
    "0.08008 c -0.093486,0.02963 -0.1859139,0.06421 -0.2794,0.0889 C 7.3028516,"
    "14.23666 7.2093653,14.2603 7.116232,14.27512 6.9303181,14.30722 6.7465209,"
    "14.3231 6.5697792,14.32486 6.2166487,14.33046 5.8924459,14.28605 5.6218654,"
    "14.224318 5.3505793,14.161565 5.1318571,14.082895 4.9822793,14.01869 4.8327015,"
    "13.95519 4.7519154,13.905801 4.7519154,13.905801",
)
_WEATHER_SNOW_D = (
    "m 8.4319893,15.348341 c 0,0.257881 -0.209197,0.467079 -0.467078,0.467079 "
    "-0.258586,0 -0.46743,-0.209198 -0.46743,-0.467079 0,-0.258233 0.208844,"
    "-0.467431 0.46743,-0.467431 0.257881,0 0.467078,0.209198 0.467078,0.467431",
    "m 11.263878,14.358553 c 0,0.364067 -0.295275,0.659694 -0.659695,0.659694 "
    "-0.364419,0 -0.6596937,-0.295627 -0.6596937,-0.659694 0,-0.364419 0.2952747,"
    "-0.659694 0.6596937,-0.659694 0.36442,0 0.659695,0.295275 0.659695,0.659694",
    "m 5.3252173,13.69847 c 0,0.364419 -0.295275,0.660047 -0.659695,0.660047 "
    "-0.364067,0 -0.659694,-0.295628 -0.659694,-0.660047 0,-0.364067 0.295627,"
    "-0.659694 0.659694,-0.659694 0.36442,0 0.659695,0.295627 0.659695,0.659694",
)
_WEATHER_LIGHTNING_D = (
    "m 9.9252695,10.935875 -1.6483986,2.341014 1.1170184,0.05929 -1.2169864,2.02141 "
    "3.0450261,-2.616159 H 9.8864918 L 10.97937,11.294651 10.700323,10.79794 h "
    "-0.508706 l -0.2663475,0.137936"
)

# Condition-name sets, copied from `cloudyStates`/`rainStates`/`windyStates`/
# `snowyStates`/`lightningStates` in weather.ts - these are Home Assistant's
# own internal `weather.*` condition strings, not the panel's `weather-*`
# glyph names (WEATHER_ICON_TO_CONDITION below bridges the two).
_WEATHER_CLOUDY_STATES = frozenset({
    "partlycloudy", "cloudy", "fog", "windy", "windy-variant", "hail", "rainy",
    "snowy", "snowy-rainy", "pouring", "lightning", "lightning-rainy",
})
_WEATHER_RAIN_STATES = frozenset({"hail", "rainy", "pouring", "lightning-rainy"})
_WEATHER_WINDY_STATES = frozenset({"windy", "windy-variant"})
_WEATHER_SNOWY_STATES = frozenset({"snowy", "snowy-rainy"})
_WEATHER_LIGHTNING_STATES = frozenset({"lightning", "lightning-rainy"})

# The panel's `weather-*` icon glyph name for each condition (see
# `_weatherConditionIcon` in panel-devices.mixin.js / `_WEATHER_CONDITION_ICON_NAMES`
# in render.py), inverted so `weather_icon` can take the glyph name every other
# icon call already uses and still know which HA condition to compose.
WEATHER_ICON_TO_CONDITION = {
    "weather-night": "clear-night",
    "weather-cloudy": "cloudy",
    "weather-fog": "fog",
    "weather-hail": "hail",
    "weather-lightning": "lightning",
    "weather-lightning-rainy": "lightning-rainy",
    "weather-partly-cloudy": "partlycloudy",
    "weather-pouring": "pouring",
    "weather-rainy": "rainy",
    "weather-snowy": "snowy",
    "weather-snowy-rainy": "snowy-rainy",
    "weather-sunny": "sunny",
    "weather-windy": "windy",
}


def _weather_condition_parts(condition: str, night: bool = False) -> list[tuple[str, str, float]]:
    """Port of `getWeatherStateSVG`'s condition branches, in the same draw order.

    Every part now also carries a stroke width: Home Assistant's own fills
    lean on antialiasing and a coloured card background to read as shapes,
    but at forecast-strip size (order of 20-40px) a dithered fill alone -
    especially the paler ones - comes out as scattered noise with no
    silhouette at all. A solid black outline around every shape gives the
    dithering something to sit inside instead of having to carry the whole
    icon's legibility on its own; see weather_icon_image's docstring. Widths
    are chosen per shape family rather than one constant: the big shapes
    (cloud, sun, moon) can carry a properly bold line without the outline
    itself swallowing the shape, while the small accent marks (rain, snow,
    wind, the lightning bolt) stay thinner so the stroke does not overwhelm
    a mark only a couple of pixels across at forecast-strip size.
    """
    parts: list[tuple[str, str, float]] = []
    if condition == "sunny":
        parts.append((_WEATHER_SUN_D, WEATHER_SUN_COLOR, 1.5))
    elif condition == "clear-night":
        parts.append((_WEATHER_MOON_D, WEATHER_MOON_COLOR, 1.5))
    elif condition == "partlycloudy":
        parts.append((_WEATHER_PARTLY_DISC_D, WEATHER_MOON_COLOR if night else WEATHER_SUN_COLOR, 1.5))
    if condition in _WEATHER_CLOUDY_STATES:
        parts.append((_WEATHER_CLOUD_BACK_D, WEATHER_CLOUD_BACK_COLOR, 1.5))
        parts.append((_WEATHER_CLOUD_FRONT_D, WEATHER_CLOUD_FRONT_COLOR, 1.1))
    # Drawn in black, not Home Assistant's own #30b3ff blue: quantize_bwr_
    # dithered's nearest-colour search only ever considers black/white for
    # an achromatic source pixel or ink/white for a warm one (see its
    # docstring for why an unrestricted search can't be trusted) - blue
    # belongs to neither family, and the rain drops are small, already
    # legible marks with nothing that needs shading anyway.
    if condition in _WEATHER_RAIN_STATES:
        parts.extend((d, BLACK, 0.85) for d in _WEATHER_RAIN_D)
    if condition == "pouring":
        parts.extend((d, BLACK, 0.85) for d in _WEATHER_POURING_EXTRA_D)
    if condition in _WEATHER_WINDY_STATES:
        parts.extend((d, WEATHER_CLOUD_BACK_COLOR, 0.85) for d in _WEATHER_WIND_D)
    if condition in _WEATHER_SNOWY_STATES:
        parts.extend((d, WEATHER_SNOW_FILL, 0.85) for d in _WEATHER_SNOW_D)
    if condition in _WEATHER_LIGHTNING_STATES:
        parts.append((_WEATHER_LIGHTNING_D, WEATHER_SUN_COLOR, 0.85))
    return parts


def _weather_icon_svg_source(condition: str, night: bool, size: float) -> str | None:
    """The plain, real-colour vector SVG for one condition - `weather_icon`
    below rasterises this and dithers it; it is never sent to the panel as
    vector markup itself."""
    parts = _weather_condition_parts(condition, night)
    if not parts:
        return None
    shapes = "".join(
        f'<path d="{d}" fill="{fill}" stroke="{BLACK}" stroke-width="{stroke_width}"'
        f' paint-order="stroke"></path>'
        for d, fill, stroke_width in parts
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size:.0f}" height="{size:.0f}"'
        f' viewBox="0 0 17 17">{shapes}</svg>'
    )


def weather_icon_image(
    name: str, size: float, preserve_yellow: bool = False, night: bool = False
) -> Image.Image | None:
    """Rasterise Home Assistant's real weather artwork and dither it to the
    e-ink palette, returning a PIL Image (or None when the SVG rasteriser is
    unavailable or the glyph name is not a weather condition).

    This is the same "treat it as an image and convert it like one" path a
    camera snapshot goes through: render the real, full-colour source at
    pixel size, then reduce it with error diffusion (svg_render.
    quantize_bwr_dithered) instead of a flat per-pixel threshold, so a fill
    close to white (the cloud-front, the moon) comes out as a visible dot
    pattern rather than rounding away to nothing. `weather_icon` below wraps
    the result as an `<image>` for embedding in generated markup;
    render.py's `_weather_condition_icon_image` calls this directly for its
    PIL-compositing path, since it already wants a PIL Image, not a string.
    """
    condition = WEATHER_ICON_TO_CONDITION.get(name)
    if condition is None or size < 1:
        return None
    svg = _weather_icon_svg_source(condition, night, size)
    if svg is None:
        return None
    # No `background`: rasterize_svg keeps this transparent outside the drawn
    # shapes, and quantize_bwr_dithered thresholds that alpha itself (fully
    # opaque or fully transparent, no in-between) rather than leaving a
    # smoothly antialiased edge next to flat palette colours - that mismatch
    # used to round a boundary pixel to a different palette colour depending
    # on which compositor blended it (resvg drawing straight onto an opaque
    # background vs. PIL's alpha_composite layering this over one afterwards).
    rendered = svg_render.rasterize_svg(svg, round(size), round(size))
    if rendered is None:
        return None
    return svg_render.quantize_bwr_dithered(rendered, preserve_yellow)


def weather_icon(
    name: str, cx: float, cy: float, size: float, preserve_yellow: bool = False, night: bool = False
) -> str:
    """Port of `_svgWeatherIcon`: Home Assistant's own weather glyph, dithered for e-ink.

    `name` is the panel's `weather-*` glyph name (`_blockStrip`'s only caller
    hands every cell a condition icon, per its docstring). Unlike `icon()`,
    there is no `color` parameter - a weather glyph's own tones are fixed
    (Home Assistant's `weatherSVGStyles`), not the row's ink colour.

    See `weather_icon_image` for how the dithering itself works. Returns ""
    - never a half-built `<image>` - when the rasteriser is unavailable, so
    `block_strip` simply draws no icon for that cell rather than a broken one.
    """
    image = weather_icon_image(name, size, preserve_yellow, night)
    if image is None:
        return ""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    x = cx - size / 2
    y = cy - size / 2
    return (
        f'<image x="{x:.2f}" y="{y:.2f}" width="{size:.2f}" height="{size:.2f}"'
        f' href="{data_url}" image-rendering="pixelated"></image>'
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


def block_bars(
    bars: dict[str, Any], box: dict[str, float], preserve_yellow: bool = False
) -> str:
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
    # On a four-colour panel the columns are yellow with a black edge: the shape
    # still reads as a solid bar, but a chart stops being a block of black. The
    # highlighted column keeps red so it still stands out, and a three-colour
    # panel keeps the plain black bars it always had.
    columns = preserve_yellow and bars.get("accent") == "yellow"
    for index, value in enumerate(values):
        bar_height = max(1, ((value - bottom) / span) * (chart_height - 1))
        picked = highlight == index
        fill = RED if picked else YELLOW if columns else BLACK
        edge = f' stroke="{BLACK}" stroke-width="1"' if columns and not picked else ""
        parts.append(
            f'<rect x="{box["x"] + step * index + (step - bar_width) / 2:.2f}"'
            f' y="{box["y"] + chart_height - bar_height:.2f}"'
            f' width="{bar_width:.2f}" height="{bar_height:.2f}"'
            f' fill="{fill}"{edge}></rect>'
        )
    # Only selected ticks carry a label (typically 0, 6, 12 and 18). They may
    # use the empty neighbouring intervals instead of being squeezed into the
    # width of one narrow bar - but only the intervals that really are empty.
    # Borrowing a flat 3.5 steps whatever the spacing meant that on a fully
    # labelled axis the clamp which keeps a wide label inside the box pinned the
    # first two labels to one x and the last two to another: on a seven-bar
    # week, "Po" printed on top of "Út" and "So" on top of "Ne".
    labelled_indexes = [
        index for index, label in enumerate(labels) if label is not None and label != ""
    ]
    label_spacing = (
        min(right - left for left, right in zip(labelled_indexes, labelled_indexes[1:]))
        if len(labelled_indexes) > 1
        else len(values)
    )
    label_width = min(box["w"], max(step * 0.95, step * min(3.5, label_spacing * 0.95)))
    for index, label in enumerate(labels):
        if label is None or label == "":
            continue
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


def block_spark(
    spark: dict[str, Any], box: dict[str, float], preserve_yellow: bool = False
) -> str:
    """Port of `_blockSpark`."""
    values = _finite_numbers(spark.get("values"))
    if len(values) < 2:
        return ""
    top = max(values)
    bottom = min(values)
    span = (top - bottom) or 1
    step = box["w"] / (len(values) - 1)
    # The caption gets a band of the row and the chart is plotted underneath
    # it. It used to be printed at 14 % down the plot itself, which is where
    # the curve is whenever the series peaks early.
    caption = spark.get("caption")
    caption_size = (
        max(8.5, min(box["h"] * 0.16, box["w"] * 0.04)) if caption is not None else 0.0
    )
    caption_band = caption_size * 1.4 if caption is not None else 0.0
    chart_y = box["y"] + caption_band
    chart_h = max(1.0, box["h"] - caption_band)
    points = [
        (box["x"] + step * index, chart_y + chart_h - ((value - bottom) / span) * chart_h)
        for index, value in enumerate(values)
    ]
    drawn = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    parts: list[str] = []
    # Yellow belongs under the curve, not in it: an area is what the colour
    # needs to read at all, and it says "how much" the way a line alone cannot.
    if preserve_yellow and spark.get("accent") == "yellow":
        parts.append(
            f'<polygon points="{box["x"]:.2f},{chart_y + chart_h:.2f} {drawn}'
            f' {box["x"] + box["w"]:.2f},{chart_y + chart_h:.2f}"'
            f' fill="{YELLOW}"></polygon>'
        )
    parts += [
        hairline(box["x"], chart_y + chart_h, box["w"], 1),
        f'<polyline points="{drawn}" fill="none" stroke="{ink(spark.get("color"))}"'
        f' stroke-width="{max(1.5, chart_h * 0.045):.2f}" stroke-linejoin="round"'
        f' stroke-linecap="round"></polyline>',
    ]
    last_x, last_y = points[-1]
    parts.append(
        f'<circle cx="{last_x:.2f}" cy="{last_y:.2f}"'
        f' r="{max(1.5, chart_h * 0.08):.2f}" fill="{RED}"></circle>'
    )
    if caption is not None:
        parts.append(
            svg_text(
                caption,
                box["x"],
                box["y"] + caption_band * 0.5,
                caption_size,
                anchor="start",
                max_width=box["w"] * 0.6,
            )
        )
    return "".join(parts)


def block_meters(
    meters: list[dict[str, Any]],
    box: dict[str, float],
    preserve_yellow: bool = False,
    accent: Any = "",
) -> str:
    """Port of `_blockMeters`."""
    line_height = box["h"] / (len(meters) or 1)
    parts: list[str] = []
    for index, meter in enumerate(meters):
        top = box["y"] + line_height * index
        bar_height = max(6, min(line_height * 0.32, 10))
        gap = max(2, line_height * 0.08)
        text_band = max(9, line_height - bar_height - gap)
        label_size = max(9.5, min(text_band * 0.8, box["w"] * 0.13))
        value_size = max(label_size, min(text_band * 0.95, box["w"] * 0.18))
        text_y = top + text_band / 2
        bar_y = top + text_band + gap / 2
        percent = fill_fraction(meter.get("percent"))
        parts.append(
            svg_text(
                meter.get("label"),
                box["x"],
                text_y,
                label_size,
                anchor="start",
                max_width=box["w"] * 0.58,
            )
        )
        parts.append(
            svg_text(
                meter.get("value"),
                box["x"] + box["w"],
                text_y,
                value_size,
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
            # The filled part of a meter is the other honest place for yellow:
            # it is an area, it is never type, and the track outline above is
            # what bounds it against white.
            fill, _edged = accent_ink(accent, meter.get("color"), preserve_yellow)
            parts.append(
                f'<rect x="{box["x"]:.2f}" y="{bar_y:.2f}"'
                f' width="{box["w"] * percent:.2f}" height="{bar_height:.2f}"'
                f' fill="{fill}"></rect>'
            )
    return "".join(parts)


def block_ring(
    ring: dict[str, Any], box: dict[str, float], preserve_yellow: bool = False
) -> str:
    """Port of `_blockRing`."""
    cx = box["x"] + box["w"] / 2
    cy = box["y"] + box["h"] / 2
    outer = min(box["w"], box["h"]) * 0.46
    inner = outer * 0.68
    percent = fill_fraction(ring.get("percent"))
    parts = [
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{outer:.2f}" fill="none"'
        f' stroke="{BLACK}" stroke-width="1"></circle>',
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{inner:.2f}" fill="none"'
        f' stroke="{BLACK}" stroke-width="1"></circle>',
    ]
    if percent > 0:
        fill, edged = accent_ink(ring.get("accent"), ring.get("color"), preserve_yellow)
        edge = f' stroke="{BLACK}" stroke-width="1"' if edged else ""
        parts.append(
            f'<path d="{arc_path(cx, cy, outer, inner, -90, -90 + percent * 360)}"'
            f' fill="{fill}"{edge}></path>'
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


def block_dial(
    dial: dict[str, Any], box: dict[str, float], preserve_yellow: bool = False
) -> str:
    """Port of `_blockDial` - a half dial, open at the bottom.

    The row is divided before anything is drawn into it: a band at the foot
    for the scale ends, the caption up in the arc's mouth beside the reading,
    and the arc sized into what is left. Placing the scale and the caption
    from the arc's own baseline is what used to push both of them past the
    bottom edge and across the following row.
    """
    cx = box["x"] + box["w"] / 2
    scaled = dial.get("min") is not None or dial.get("max") is not None
    scale_size = max(7.5, min(box["h"] * 0.15, box["w"] * 0.055)) if scaled else 0.0
    scale_band = scale_size * 1.5 if scaled else 0.0
    arc_band = max(4.0, box["h"] - scale_band)
    outer = max(3.0, min(box["w"] * 0.46, arc_band))
    inner = outer * 0.7
    cy = box["y"] + (arc_band + outer) / 2
    percent = fill_fraction(dial.get("percent"))
    captioned = dial.get("caption") is not None
    parts = [
        f'<path d="{arc_path(cx, cy, outer, inner, 180, 360)}" fill="none"'
        f' stroke="{BLACK}" stroke-width="1"></path>'
    ]
    if percent > 0:
        fill, edged = accent_ink(dial.get("accent"), dial.get("color"), preserve_yellow)
        edge = f' stroke="{BLACK}" stroke-width="1"' if edged else ""
        parts.append(
            f'<path d="{arc_path(cx, cy, outer, inner, 180, 180 + percent * 180)}"'
            f' fill="{fill}"{edge}></path>'
        )
    if dial.get("value") is not None:
        parts.append(
            svg_text(
                dial.get("value"),
                cx,
                cy - outer * (0.40 if captioned else 0.28),
                outer * (0.40 if captioned else 0.44),
                # The chord of the arc's mouth at the reading's own height,
                # not the full inner diameter it has at the centre line.
                bold=True, max_width=inner * (1.34 if captioned else 1.6),
            )
        )
    if captioned:
        parts.append(
            svg_text(dial.get("caption"), cx, cy - outer * 0.09, outer * 0.20, max_width=inner * 1.9)
        )
    # Anchored to the arc's own ends and reading inwards, so a worded scale
    # cannot hang half out of the page the way a centred one did.
    scale_y = cy + scale_size * 0.85
    if dial.get("min") is not None:
        parts.append(
            svg_text(dial.get("min"), cx - outer, scale_y, scale_size, anchor="start", max_width=outer * 0.85)
        )
    if dial.get("max") is not None:
        parts.append(
            svg_text(dial.get("max"), cx + outer, scale_y, scale_size, anchor="end", max_width=outer * 0.85)
        )
    return "".join(parts)


def block_strip(cells: list[dict[str, Any]], box: dict[str, float], preserve_yellow: bool = False) -> str:
    """Port of `_blockStrip`'s classic label/icon/value stack only.

    Each cell's `icon` is the panel's `weather-*` glyph name (e.g.
    "weather-rainy"), same as every other icon call - unlike plain `icon()`,
    `weather_icon` needs to know which condition it is drawing, not just a
    path, so there is nothing here for the backend to pre-resolve. Drawn
    through `weather_icon` rather than plain `icon` - every cell this function
    ever receives is a weather condition (see below), which is exactly what
    `weather_icon` composes Home Assistant's real weather artwork for.

    `_blockStrip` also has an opt-in `valueIcon` layout (icon beside the number
    instead of stacked above it) that this port intentionally does not mirror:
    render.py only ever calls this function for the "forecast" binding (the
    live weather strip in weather.js), which never sets that flag, so there is
    nothing on this side for it to stay in sync with. A template that binds a
    `valueIcon` strip to a live automation would need this port extended first.
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
                weather_icon(
                    str(cell.get("icon")), cx, box["y"] + box["h"] * 0.5,
                    min(box["h"] * 0.50, cell_width * 0.62), preserve_yellow,
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


def block_board_two_line(
    items: list[dict[str, Any]],
    box: dict[str, float],
    *,
    filled: bool = True,
    preserve_yellow: bool = False,
) -> str:
    """Port of the panel's `_blockBoardTwoLine` - the portrait departures board.

    One difference from the JavaScript, and only one: the panel names its glyph
    ("bus") and looks the geometry up in ICON_GEOMETRY at draw time, while this
    side is handed the resolved `<path d>` in `item["icon"]`, because the backend
    has no ha-icon to ask. Same asymmetry `icon()` already carries.
    """
    if not items:
        return ""
    line_height = box["h"] / len(items)
    badge_width = min(box["w"] * 0.26, line_height * 0.95)
    badge_height = line_height * 0.36
    right = box["x"] + box["w"]
    text_x = box["x"] + badge_width + max(3, badge_width * 0.18)

    def fit(size: float, values: list[Any], max_width: float, bold: bool) -> float:
        # One size per column: see the JavaScript for why per-row shrink-to-fit
        # is wrong here.
        smallest = size
        for value in values:
            smallest = min(smallest, svg_fit_font_size(value, size, max_width, bold, 8.5))
        return smallest

    title_size = fit(
        max(10.0, min(line_height * 0.30, box["w"] * 0.13)),
        [item.get("label") for item in items], right - text_x, True,
    )
    # The clock and the countdown share one size: see the JavaScript for why
    # sizing them one after the other clipped the clock on a narrow tag.
    base_time = max(10.0, min(line_height * 0.26, box["w"] * 0.11))
    times_width = max(1.0, right - text_x)
    time_size = base_time
    for item in items:
        unit = (
            svg_text_width(item.get("clock"), 1, True)
            + svg_text_width(item.get("value"), 1, False) + 0.6
        )
        if unit > 0:
            time_size = min(time_size, times_width / unit)
    clock_size = max(8.5, time_size)
    value_size = clock_size
    value_width = max(
        [svg_text_width(item.get("value"), value_size, False) for item in items] or [0.0]
    )

    parts: list[str] = []
    for index, item in enumerate(items):
        top = box["y"] + line_height * index
        title_cy = top + line_height * 0.31
        times_cy = top + line_height * 0.73
        chip = ink(item.get("color"))
        accent = filled and item.get("color") != "red" and preserve_yellow
        plate = "none" if not filled else YELLOW if accent else chip
        digit = chip if not filled else BLACK if accent else "#ffffff"
        if index > 0:
            parts.append(hairline(box["x"], top, box["w"], 1))
        parts.append(
            f'<rect x="{box["x"]:.2f}" y="{title_cy - badge_height / 2:.2f}" width="{badge_width:.2f}"'
            f' height="{badge_height:.2f}" rx="2" fill="{plate}" stroke="{BLACK if accent else chip}" stroke-width="1"></rect>'
        )
        parts.append(svg_text(
            item.get("badge"), box["x"] + badge_width / 2, title_cy,
            max(10.0, badge_height * 0.72),
            color=digit, bold=True, max_width=badge_width * 0.88,
        ))
        if item.get("icon"):
            parts.append(icon(
                str(item["icon"]), box["x"] + badge_width / 2, times_cy,
                min(line_height * 0.40, badge_width * 0.92), chip,
            ))
        parts.append(svg_text(
            item.get("label"), text_x, title_cy, title_size,
            anchor="start", bold=True, max_width=right - text_x,
        ))
        parts.append(svg_text(
            item.get("clock"), text_x, times_cy, clock_size,
            anchor="start", bold=True,
            max_width=max(1.0, times_width - value_width - clock_size * 0.5),
        ))
        parts.append(svg_text(
            item.get("value"), right, times_cy, value_size,
            anchor="end", color=chip, max_width=box["w"] * 0.46,
        ))
    return "".join(parts)


def block_board(
    items: list[dict[str, Any]],
    box: dict[str, float],
    *,
    filled: bool = True,
    compact: bool = False,
    preserve_yellow: bool = False,
) -> str:
    """Port of the panel's `_blockBoard` for live transit departures."""
    if not items:
        return ""
    line_height = box["h"] / len(items)
    # A line plate 1.5 rows wide is right when the row holds nothing else; on a
    # tall landscape tag it left no space for the icon and the clock. Narrower
    # only where those exist, so a board without them keeps its plate as it was.
    has_extras = any(item.get("icon") or item.get("clock") for item in items)
    badge_width = min(box["w"] * (0.16 if has_extras else 0.22), line_height * 1.5)
    badge_height = line_height * 0.68
    right = box["x"] + box["w"]
    # The single-line board used to throw away the vehicle icon and the
    # scheduled time, so a wide tag carried less than a narrow one. Both are
    # optional, and both give way - clock first - when the destination would be
    # left under a third of the row.
    gap = max(3.0, badge_width * 0.2)
    # See _blockBoard for both: 10 is svg_text's own floor, and the countdown
    # column is reserved from its own content rather than a flat fraction.
    value_size = max(11.0 if compact else 10.0, min(line_height * 0.56, box["w"] * 0.13))
    value_demand = max(
        [svg_text_width(item.get("value"), value_size, not compact) for item in items] or [0.0]
    )
    value_width = max(box["w"] * 0.26, min(value_demand + 2, box["w"] * 0.4))
    label_floor = box["w"] * 0.3
    # See _blockBoard: sized to the row, not tucked in beside it.
    icon_size = min(line_height * 0.78, box["w"] * 0.12) if any(item.get("icon") for item in items) else 0.0
    # 10, not 9 - see _blockBoard: the strip is measured at this size and
    # svg_text will not draw under its own 10px floor.
    clock_size = max(10.0, min(line_height * 0.42, box["w"] * 0.085))
    clock_width = max(
        [svg_text_width(item.get("clock"), clock_size, False) if item.get("clock") else 0.0 for item in items]
        or [0.0]
    )

    def label_room() -> float:
        return (
            right
            - (box["x"] + badge_width + gap + (icon_size + gap * 0.6 if icon_size else 0.0))
            - value_width
            - (clock_width + gap if clock_width else 0.0)
        )

    if clock_width and label_room() < label_floor:
        clock_width = 0.0
    if icon_size and label_room() < label_floor:
        icon_size = 0.0

    parts: list[str] = []
    for index, item in enumerate(items):
        cy = box["y"] + line_height * (index + 0.5)
        chip = ink(item.get("color"))
        accent = filled and item.get("color") != "red" and preserve_yellow
        plate = "none" if not filled else YELLOW if accent else chip
        digit = chip if not filled else BLACK if accent else "#ffffff"
        parts.append(
            f'<rect x="{box["x"]:.2f}" y="{cy - badge_height / 2:.2f}" width="{badge_width:.2f}"'
            f' height="{badge_height:.2f}" rx="2" fill="{plate}" stroke="{BLACK if accent else chip}" stroke-width="1"></rect>'
        )
        parts.append(svg_text(
            item.get("badge"), box["x"] + badge_width / 2, cy,
            max(10 if compact else 8.5, badge_height * 0.65),
            color=digit, bold=True, max_width=badge_width * 0.88,
        ))
        icon_x = box["x"] + badge_width + gap
        if icon_size and item.get("icon"):
            parts.append(icon(str(item.get("icon")), icon_x + icon_size / 2, cy, icon_size, chip))
        text_x = icon_x + (icon_size + gap * 0.6 if icon_size else 0.0)
        if clock_width and item.get("clock"):
            parts.append(svg_text(
                item.get("clock"), right - value_width - gap, cy, clock_size,
                anchor="end", max_width=clock_width,
            ))
        parts.append(svg_text(
            item.get("label"), text_x, cy,
            max(10 if compact else 8.5, min(line_height * 0.52, box["w"] * 0.12)),
            anchor="start",
            max_width=right - text_x - value_width - (clock_width + gap if clock_width else 0.0),
        ))
        parts.append(svg_text(
            item.get("value"), right, cy, value_size,
            anchor="end", bold=not compact, color=chip, max_width=value_width,
        ))
    return "".join(parts)


def _checkbox(
    left: float, cy: float, mark: float, done: bool, color: Any, boxed: bool
) -> list[str]:
    """The marker and its tick - shared by both branches of `block_checklist`."""
    parts = [
        f'<rect x="{left:.2f}" y="{cy - mark / 2:.2f}" width="{mark:.2f}"'
        f' height="{mark:.2f}" fill="{ink(color) if done else "#ffffff"}"'
        + (f' stroke="{BLACK}" stroke-width="1"' if boxed else "")
        + "></rect>"
    ]
    if done and boxed:
        parts.append(
            f'<path d="M{left + mark * 0.22:.2f} {cy:.2f} L{left + mark * 0.44:.2f}'
            f' {cy + mark * 0.24:.2f} L{left + mark * 0.8:.2f} {cy - mark * 0.26:.2f}"'
            f' fill="none" stroke="#ffffff" stroke-width="{max(1, mark * 0.13):.2f}"></path>'
        )
    return parts


def block_checklist(
    items: list[dict[str, Any]],
    box: dict[str, float],
    *,
    columns: int = 1,
    marker: str = "box",
    strike: bool = True,
    compact: bool = False,
) -> str:
    """Port of the panel's `_blockChecklist` - shopping.js's live list rows.

    The panel's version can take the four-colour accent through `_markerInk`;
    shopping.js never asks for it (its only colour is the red first outstanding
    item, which `_markerInk` passes straight through to `_templateInk`), so this
    port resolves the marker fill with `ink` alone.
    """
    if not items:
        return ""
    columns = max(1, int(columns or 1))
    if columns > 1:
        lines = max(1, math.ceil(len(items) / columns))
        cell_width = box["w"] / columns
        line_height = box["h"] / lines
        # A checkbox has to hold a 1px outline, a gap and a tick. Under about
        # seven pixels there is no room for all three and the whole thing
        # thresholds into a solid dot, so below that the box is dropped and the
        # state is carried by a filled square alone.
        mark = max(6.0, min(line_height * 0.42, cell_width * 0.12))
        boxed = mark >= 7
        parts: list[str] = []
        for index, item in enumerate(items):
            column = index % columns
            line = index // columns
            left = box["x"] + column * cell_width
            cy = box["y"] + line_height * (line + 0.5)
            if column > 0:
                parts.append(hairline(left, box["y"] + box["h"] * 0.08, 1, box["h"] * 0.84))
            parts.extend(_checkbox(left + 3, cy, mark, bool(item.get("done")), item.get("color"), boxed))
            text_x = left + mark + 7
            right = left + cell_width - 3
            font_size = max(10.0, min(line_height * 0.42, cell_width * 0.14))
            parts.append(svg_text(
                item.get("label"), text_x, cy, font_size,
                anchor="start", min_size=9, color=ink(item.get("color")),
                max_width=right - text_x,
            ))
            if item.get("done") and strike:
                width = min(svg_text_width(item.get("label"), font_size, False), right - text_x)
                parts.append(hairline(text_x, cy, width, 1))
        return "".join(parts)

    line_height = box["h"] / (len(items) or 1)
    # Same floor as the multi-column branch above, for the same reason.
    mark = max(6.0, min(line_height * 0.5, box["w"] * 0.11))
    boxed = mark >= 7
    font_size = max(10.0 if compact else 8.5, min(line_height * 0.6, box["w"] * 0.12))
    parts = []
    for index, item in enumerate(items):
        cy = box["y"] + line_height * (index + 0.5)
        left = box["x"]
        done = bool(item.get("done"))
        if marker == "dot":
            parts.append(
                f'<circle cx="{left + mark / 2:.2f}" cy="{cy:.2f}" r="{mark / 2:.2f}"'
                f' fill="{ink(item.get("color")) if done else "#ffffff"}"'
                f' stroke="{BLACK}" stroke-width="1"></circle>'
            )
        else:
            parts.append(
                f'<rect x="{left:.2f}" y="{cy - mark / 2:.2f}" width="{mark:.2f}"'
                f' height="{mark:.2f}" fill="{ink(item.get("color")) if done else "#ffffff"}"'
                + (f' stroke="{BLACK}" stroke-width="1"' if boxed else "")
                + "></rect>"
            )
            if done:
                # The single-column branch draws the tick whenever the item is
                # done, box or no box - unlike the multi-column one above, and
                # with a marginally heavier stroke. Both quirks are the panel's.
                parts.append(
                    f'<path d="M{left + mark * 0.22:.2f} {cy:.2f} L{left + mark * 0.44:.2f}'
                    f' {cy + mark * 0.24:.2f} L{left + mark * 0.8:.2f} {cy - mark * 0.26:.2f}"'
                    f' fill="none" stroke="#ffffff" stroke-width="{max(1, mark * 0.14):.2f}"></path>'
                )
        text_x = left + mark + max(2.0, mark * 0.4)
        right = box["x"] + box["w"]
        # `minSize: row.compact ? 8.5 : undefined` on the panel side - undefined
        # means the builder's own readability floor, so the argument is only
        # passed at all when the row asked to go below it.
        floor = {"min_size": 8.5} if compact else {}
        parts.append(svg_text(
            item.get("label"), text_x, cy, font_size,
            anchor="start", bold=bool(item.get("bold")),
            color=ink(item.get("color")), max_width=right - text_x,
            **floor,
        ))
        # A struck-through line says "already handled" without spending a column
        # on a second state word next to every item.
        if done and strike:
            width = min(svg_text_width(item.get("label"), font_size, bool(item.get("bold"))), right - text_x)
            parts.append(hairline(text_x, cy, width, 1))
    return "".join(parts)


def block_split(halves: list[dict[str, Any]], box: dict[str, float], banner: bool = False, color: str = "white") -> str:
    """Port of `_blockSplit` - two or three readings of equal standing divided down the middle."""
    cell_width = box["w"] / (len(halves) or 1)
    parts: list[str] = []
    if banner:
        fill = RED if color == "red" else "#ffffff"
        stroke = "none" if color == "red" else BLACK
        parts.append(f'<rect x="{box["x"]:.2f}" y="{box["y"]:.2f}" width="{box["w"]:.2f}" height="{box["h"]:.2f}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.2"></rect>')
    for index, half in enumerate(halves):
        cx = box["x"] + cell_width * (index + 0.5)
        if index > 0:
            div_color = "#ffffff" if (banner and color == "red") else BLACK
            parts.append(hairline(box["x"] + cell_width * index, box["y"] + box["h"] * 0.12, 1, box["h"] * 0.76, div_color))
        has_icon = bool(half.get("icon"))
        # Three bands that do not touch: the iconed variant used to draw its
        # glyph through the reading underneath it.
        label_y = box["y"] + box["h"] * (0.20 if has_icon else 0.28)
        val_y = box["y"] + box["h"] * (0.77 if has_icon else 0.72)
        label_size = max(9.0, min(box["h"] * (0.20 if has_icon else 0.22), cell_width * 0.22))
        val_size = max(12.0, min(box["h"] * (0.40 if has_icon else 0.44), cell_width * 0.42))

        is_red_banner = banner and color == "red"
        default_text_color = "#ffffff" if is_red_banner else BLACK
        label_color = "#ffcccc" if is_red_banner and half.get("color") == "red" else "#e0e0e0" if is_red_banner else BLACK
        val_color = ink(half.get("color")) if half.get("color") else default_text_color

        if half.get("label"):
            parts.append(
                svg_text(
                    half.get("label"), cx, label_y, label_size,
                    bold=True, color=label_color, max_width=cell_width * 0.92,
                )
            )
        if half.get("icon"):
            parts.append(
                icon(
                    str(half.get("icon")), cx, box["y"] + box["h"] * 0.44,
                    min(box["h"] * 0.19, cell_width * 0.26), val_color,
                )
            )
        if half.get("value"):
            parts.append(
                svg_text(
                    half.get("value"), cx, val_y, val_size,
                    bold=True, color=val_color, max_width=cell_width * 0.92,
                )
            )
    return "".join(parts)


def block_split_dates(dates: list[dict[str, Any]], box: dict[str, float]) -> str:
    """Port of `_blockSplitDates` - multiple dateboxes side by side in one row."""
    cell_width = box["w"] / max(1, len(dates))
    parts: list[str] = []
    for index, item in enumerate(dates):
        cell_box = {"x": box["x"] + cell_width * index, "y": box["y"], "w": cell_width, "h": box["h"]}
        if index > 0:
            parts.append(hairline(box["x"] + cell_width * index, box["y"] + box["h"] * 0.08, 1, box["h"] * 0.84))
        if item and item.get("datebox"):
            parts.append(block_datebox(item["datebox"], cell_box))
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
