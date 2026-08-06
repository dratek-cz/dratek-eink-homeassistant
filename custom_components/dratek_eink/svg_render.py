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
