"""Backend SVG rasteriser used to make automatic refreshes match a manual send.

A manual send rasterises the template SVG in the browser. Automatic refreshes run
headless, so the backend has to rasterise the same SVG itself. resvg renders SVG
to the spec with a font we control, which - together with the byte-identical
`<text>` elements built in svg_text.py and the bundled Arimo loaded on both sides
- reproduces the panel's output far more faithfully than PIL's hand layout ever
could.

resvg ships as a self-contained wheel (no system libraries), but not for every
platform Home Assistant runs on (32-bit ARM, musl). Every entry point here fails
soft: when the wheel is missing or a render throws, the caller falls back to the
existing PIL renderer so an install is never blocked and a refresh never crashes.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

from PIL import Image

_LOGGER = logging.getLogger(__name__)

# The same file the panel embeds through @font-face and svg_text.FONT names first.
FONT_PATH = Path(__file__).parent / "frontend" / "fonts" / "Arimo-wght.ttf"
FONT_FAMILY = "Arimo"

_backend_checked = False
_backend = None


def _load_backend():
    """Import resvg_py once, tolerating its absence on unsupported platforms."""
    global _backend_checked, _backend
    if _backend_checked:
        return _backend
    _backend_checked = True
    try:
        import resvg_py  # type: ignore

        _backend = resvg_py
    except Exception as exc:  # ImportError, or a wheel that fails to load
        _LOGGER.info(
            "SVG rasteriser unavailable, automatic updates use the PIL renderer: %s",
            exc,
        )
        _backend = None
    return _backend


def render_available() -> bool:
    """True when automatic refreshes can rasterise SVG exactly like a manual send."""
    return _load_backend() is not None


def rasterize_svg(
    svg: str,
    width: int,
    height: int,
    background: str | None = None,
) -> Image.Image | None:
    """Rasterise an SVG string at the exact panel resolution.

    With ``background`` set the result is an opaque RGB image; with it left as
    None the result is a transparent RGBA layer, which is what compositing a few
    text slots over an existing base image needs.

    Returns None whenever the backend is missing or fails, so callers treat SVG
    rendering as best-effort and fall back to PIL.
    """
    backend = _load_backend()
    if backend is None:
        return None

    has_font = FONT_PATH.exists()
    try:
        png_bytes = backend.svg_to_bytes(
            svg_string=svg,
            width=int(width),
            height=int(height),
            background=background,
            # Deterministic only when we supply the font; without the bundled file
            # let resvg reach for a system font so text still renders somewhere.
            skip_system_fonts=has_font,
            font_files=[str(FONT_PATH)] if has_font else None,
            font_family=FONT_FAMILY,
            sans_serif_family=FONT_FAMILY,
        )
        image = Image.open(io.BytesIO(bytes(png_bytes)))
        return image.convert("RGB") if background is not None else image.convert("RGBA")
    except Exception as exc:  # a malformed SVG or a resvg panic must never crash a refresh
        _LOGGER.warning("SVG rasterisation failed, falling back to PIL: %s", exc)
        return None


# Mirrors render.py's own BWR_BLACK/BWR_WHITE/BWR_RED/BWR_YELLOW. Duplicated
# rather than imported so this module keeps its one-way dependency (render.py
# and svg_blocks.py both import svg_render; svg_render imports neither of
# them) - the four values are display constants, not something that drifts.
BWR_BLACK = (0, 0, 0)
BWR_WHITE = (255, 255, 255)
BWR_RED = (220, 20, 12)
BWR_YELLOW = (244, 196, 0)


def quantize_bwr_dithered(image: Image.Image, preserve_yellow: bool = False) -> Image.Image:
    """Error-diffusion (Floyd-Steinberg) reduction to the e-ink palette, for
    the achromatic parts only - the sun/moon/lightning-bolt tint fills solid.

    render.py's quantize_bwr_preview rounds every pixel to its nearest
    palette colour independently - fine for a photo, but a flat fill close
    to white (a pale grey cloud in Home Assistant's own weather icon artwork)
    rounds straight to solid white and disappears rather than reading as a
    lighter shade. Floyd-Steinberg instead carries each pixel's rounding
    error into its neighbours, so that same flat pale fill comes out as a
    visible dot pattern - the same "mix pixels to fake a shade" idea a
    halftone photo print uses, done automatically instead of by hand. Meant
    for content that is itself pixel art meant to be dithered (the weather
    icons svg_blocks.weather_icon_image produces); the panel's own
    flat-coloured SVG shapes (bars, text, rules) stay on quantize_bwr_
    preview's plain threshold so their edges stay crisp.

    The sun/moon/lightning-bolt fill is the one part of a weather icon that
    is supposed to read as a single, bold, solid colour rather than a
    shaded tone - the moon being a paler yellow than the sun in Home
    Assistant's own artwork is a *difference between two icons*, not
    something that needs representing as a lighter shade of the same icon
    the way the cloud's two grey tones do - so it skips the halftone
    treatment entirely and fills flat ink, no dither pattern, no error
    diffusion.

    Hand-rolled rather than PIL's own Image.quantize(palette=..., dither=...):
    that path was measured introducing stray red pixels into a perfectly flat
    grey square with no red anywhere near it (Pillow evidently does not treat
    a `palette=` reference image's colour table as the exact, fixed target
    set the way this needs), so it cannot be trusted for a small, exact
    palette like this one. This mirrors ditherToEinkPalette in
    panel-template-svg.mixin.js pixel-for-pixel (find nearest palette colour,
    diffuse the rounding error 7/3/5/1 across the four forward neighbours) -
    not byte-identical to the JS canvas output, but the same algorithm.

    Which treatment a pixel gets is decided by its own saturation (computed
    before any error is added, so drifting error can never itself flip a
    pixel from one family to the other): plain Euclidean RGB distance puts a
    *mid*-grey numerically closer to red (220,20,12) than to either black or
    white (red's high red channel and low green/blue land it nearer the
    midpoint than either extreme does), so an unrestricted nearest-colour
    search would dither a flat grey fill into stray red flecks with no red
    anywhere in the source - gating on saturation avoids that the same way
    it lets the warm fill skip dithering altogether.

    Alpha below 128 is treated as fully transparent output (outside the
    icon's silhouette); everything else comes out fully opaque - matching
    the same threshold-not-blend choice svg_blocks.weather_icon_image relied
    on this function's caller to apply separately before, now folded in here
    since every pixel already needs a decision either way.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    ink = BWR_YELLOW if preserve_yellow else BWR_RED
    # A flat grey/black source pixel always has r==g==b (saturation 0); the
    # sun/moon/lightning fills are a clearly saturated yellow. 40 sits well
    # clear of both, so ordinary antialiasing never crosses it by accident.
    SATURATION_THRESHOLD = 40

    def nearest_grey(r: float, g: float, b: float) -> tuple[int, int, int]:
        best = BWR_BLACK
        best_distance = float("inf")
        for candidate in (BWR_BLACK, BWR_WHITE):
            dr, dg, db = r - candidate[0], g - candidate[1], b - candidate[2]
            distance = dr * dr + dg * dg + db * db
            if distance < best_distance:
                best_distance = distance
                best = candidate
        return best

    # Per-row error buffers rather than mutating pixels[] with fractional
    # values (which the "P"-less RGBA storage cannot hold) - diffusion only
    # ever reaches the current and next row, so nothing older needs keeping.
    # Only the achromatic pass ever writes into these; a warm pixel neither
    # reads nor contributes error, since it is not being rounded at all.
    zero_row = [(0.0, 0.0, 0.0)] * width
    current_row_error = list(zero_row)
    next_row_error = list(zero_row)

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 128:
                pixels[x, y] = (255, 255, 255, 0)
                continue
            if max(r, g, b) - min(r, g, b) > SATURATION_THRESHOLD:
                pixels[x, y] = (*ink, 255)
                continue
            er, eg, eb = current_row_error[x]
            r = min(255.0, max(0.0, r + er))
            g = min(255.0, max(0.0, g + eg))
            b = min(255.0, max(0.0, b + eb))
            new_r, new_g, new_b = nearest_grey(r, g, b)
            pixels[x, y] = (new_r, new_g, new_b, 255)
            diff_r, diff_g, diff_b = r - new_r, g - new_g, b - new_b
            if x + 1 < width:
                pr, pg, pb = current_row_error[x + 1]
                current_row_error[x + 1] = (pr + diff_r * 7 / 16, pg + diff_g * 7 / 16, pb + diff_b * 7 / 16)
            if x > 0:
                pr, pg, pb = next_row_error[x - 1]
                next_row_error[x - 1] = (pr + diff_r * 3 / 16, pg + diff_g * 3 / 16, pb + diff_b * 3 / 16)
            pr, pg, pb = next_row_error[x]
            next_row_error[x] = (pr + diff_r * 5 / 16, pg + diff_g * 5 / 16, pb + diff_b * 5 / 16)
            if x + 1 < width:
                pr, pg, pb = next_row_error[x + 1]
                next_row_error[x + 1] = (pr + diff_r * 1 / 16, pg + diff_g * 1 / 16, pb + diff_b * 1 / 16)
        current_row_error = next_row_error
        next_row_error = list(zero_row)
    return rgba
