"""A live precipitation map of the whole Czech Republic for the Meteoradar template.

The "radar" template used to draw a text placeholder - "[ Celoplošná srážková mapa
Met.no / RainViewer ]" - instead of an actual map, and asked the user to configure a
`camera.meteoradar` entity themselves to supply one. No such entity or setup step
exists any more: this module fetches RainViewer's public radar tiles directly on the
backend, projects the Czech Republic's border into the same Web Mercator space the
tiles use, and composes a display-ready image - a black country outline, filled
white, with red wherever the clipped precipitation data says it is raining inside
that outline. Nothing outside the country is drawn.

The two stages are split on purpose:
- `compose_country_radar_image` is pure and network-free (it takes already-decoded
  tile images), so the projection and compositing math is unit-testable without a
  live connection.
- `async_render_meteoradar` does the network fetch, with a cache keyed to
  RainViewer's own frame timestamp: their radar data only refreshes every ten
  minutes, so re-fetching more often than that would just hammer their free API for
  a frame that has not changed.
"""

from __future__ import annotations

import asyncio
import functools
import io
import math
import time
from typing import TYPE_CHECKING

from PIL import Image, ImageChops, ImageDraw

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

RAINVIEWER_INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json"
TILE_SIZE = 512
ZOOM = 6
COLOR_SCHEME = 2
SMOOTH = 1
SNOW = 1
# RainViewer's "smooth" option blends alpha down toward zero at the edge of a
# precipitation cell for anti-aliasing, so low-alpha pixels are a faint trace halo
# rather than real rain. Requiring roughly half the max alpha keeps that halo out of
# the red mask without needing to know the exact colour-to-dBZ mapping of whichever
# scheme is requested.
PRECIPITATION_ALPHA_THRESHOLD = 128
PRECIPITATION_COLOR = (220, 20, 12)
BORDER_COLOR = (0, 0, 0)
INDEX_RECHECK_INTERVAL_SECONDS = 60
HTTP_TIMEOUT_SECONDS = 15

# Simplified Czech Republic border as (lon, lat) pairs, closed (first point repeats
# last). Derived from Natural Earth's public-domain admin-0 boundaries; detailed
# enough to be recognisable at e-ink resolution without carrying a full-resolution
# shapefile in the integration.
CZECH_BORDER: tuple[tuple[float, float], ...] = (
    (16.960288, 48.596982), (16.499283, 48.785808), (16.029647, 48.733899), (15.253416, 49.039074),
    (14.901447, 48.964402), (14.338898, 48.555305), (13.595946, 48.877172), (13.031329, 49.307068),
    (12.521024, 49.547415), (12.415191, 49.969121), (12.240111, 50.266338), (12.966837, 50.484076),
    (13.338132, 50.733234), (14.056228, 50.926918), (14.307013, 51.117268), (14.570718, 51.002339),
    (15.016996, 51.106674), (15.490972, 50.78473), (16.238627, 50.697733), (16.176253, 50.422607),
    (16.719476, 50.215747), (16.868769, 50.473974), (17.554567, 50.362146), (17.649445, 50.049038),
    (18.392914, 49.988629), (18.853144, 49.49623), (18.554971, 49.495015), (18.399994, 49.315001),
    (18.170498, 49.271515), (18.104973, 49.043983), (17.913512, 48.996493), (17.886485, 48.903475),
    (17.545007, 48.800019), (17.101985, 48.816969), (16.960288, 48.596982),
)


def mercator_pixel(lat: float, lon: float, zoom: int, tile_size: int) -> tuple[float, float]:
    """Project (lat, lon) to a pixel in the world-wide Web Mercator raster at `zoom`.

    Standard XYZ slippy-map projection (EPSG:3857), the same one every {z}/{x}/{y}
    tile server - including RainViewer's - is built on. Latitude is clamped to the
    ±85.0511° Mercator limit so a stray coordinate can't blow up the log/tan.
    """
    world_size = tile_size * (2**zoom)
    x = (lon + 180.0) / 360.0 * world_size
    clamped_lat = max(-85.0511, min(85.0511, lat))
    lat_rad = math.radians(clamped_lat)
    y = (0.5 - math.log(math.tan(math.pi / 4 + lat_rad / 2)) / (2 * math.pi)) * world_size
    return x, y


def tile_bounds(
    border: tuple[tuple[float, float], ...], zoom: int, tile_size: int
) -> tuple[int, int, int, int]:
    """Return the inclusive (x_min, y_min, x_max, y_max) tile range covering `border`."""
    xs: list[float] = []
    ys: list[float] = []
    for lon, lat in border:
        x, y = mercator_pixel(lat, lon, zoom, tile_size)
        xs.append(x / tile_size)
        ys.append(y / tile_size)
    return (
        int(math.floor(min(xs))),
        int(math.floor(min(ys))),
        int(math.floor(max(xs))),
        int(math.floor(max(ys))),
    )


def compose_country_radar_image(
    tiles: dict[tuple[int, int], Image.Image],
    *,
    zoom: int,
    tile_size: int,
    x_min: int,
    y_min: int,
    x_max: int,
    y_max: int,
    border: tuple[tuple[float, float], ...] = CZECH_BORDER,
    alpha_threshold: int = PRECIPITATION_ALPHA_THRESHOLD,
    border_width: int = 3,
    margin: int = 12,
) -> Image.Image:
    """Stitch fetched tiles and draw the black-outlined, red/white precipitation map.

    Pure and network-free: `tiles` are already-decoded images the caller fetched,
    keyed by (tile_x, tile_y). A missing tile is left transparent rather than
    failing the whole render, so a partial fetch still produces a usable map.
    """
    grid_width = (x_max - x_min + 1) * tile_size
    grid_height = (y_max - y_min + 1) * tile_size
    composite = Image.new("RGBA", (grid_width, grid_height), (0, 0, 0, 0))
    for (tile_x, tile_y), tile in tiles.items():
        composite.paste(tile, ((tile_x - x_min) * tile_size, (tile_y - y_min) * tile_size))

    origin_x = x_min * tile_size
    origin_y = y_min * tile_size
    polygon = [
        (px - origin_x, py - origin_y)
        for px, py in (mercator_pixel(lat, lon, zoom, tile_size) for lon, lat in border)
    ]

    alpha = composite.getchannel("A")
    precipitation_mask = alpha.point(lambda value: 255 if value >= alpha_threshold else 0).convert("1")

    country_mask = Image.new("L", composite.size, 0)
    ImageDraw.Draw(country_mask).polygon(polygon, fill=255)
    country_mask = country_mask.convert("1")

    output = Image.new("RGB", composite.size, "white")
    output.paste(
        Image.new("RGB", composite.size, PRECIPITATION_COLOR),
        mask=ImageChops.logical_and(country_mask, precipitation_mask),
    )
    ImageDraw.Draw(output).polygon(polygon, outline=BORDER_COLOR, width=border_width)

    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    crop_box = (
        max(0, int(min(xs)) - margin),
        max(0, int(min(ys)) - margin),
        min(output.width, int(max(xs)) + margin),
        min(output.height, int(max(ys)) + margin),
    )
    return output.crop(crop_box)


def fit_to_size(image: Image.Image, width: int, height: int) -> Image.Image:
    """Letterbox `image` onto a white canvas of exactly (width, height)."""
    width = max(1, int(width))
    height = max(1, int(height))
    canvas = Image.new("RGB", (width, height), "white")
    scale = min(width / image.width, height / image.height)
    scaled_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    scaled = image.resize(scaled_size, Image.Resampling.LANCZOS)
    canvas.paste(scaled, ((width - scaled.width) // 2, (height - scaled.height) // 2))
    return canvas


_cache: dict[str, object] = {"frame_key": None, "composed": None, "checked_at": 0.0}


async def _async_fetch_json(hass: "HomeAssistant", url: str) -> dict:
    from homeassistant.helpers.aiohttp_client import async_get_clientsession

    session = async_get_clientsession(hass)
    async with session.get(url, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return await response.json(content_type=None)


async def _async_fetch_tile(hass: "HomeAssistant", url: str) -> Image.Image | None:
    from homeassistant.helpers.aiohttp_client import async_get_clientsession

    session = async_get_clientsession(hass)
    try:
        async with session.get(url, timeout=HTTP_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return None
            raw = await response.read()
    except Exception:  # network hiccups must not break the caller
        return None
    try:
        return Image.open(io.BytesIO(raw)).convert("RGBA")
    except Exception:
        return None


async def _async_composed_base_image(hass: "HomeAssistant") -> Image.Image | None:
    """Return the current country map at native resolution, refetching only when
    RainViewer's own frame timestamp has actually moved on.
    """
    now = time.monotonic()
    if _cache["composed"] is not None and now - float(_cache["checked_at"]) < INDEX_RECHECK_INTERVAL_SECONDS:
        return _cache["composed"]  # type: ignore[return-value]

    try:
        index = await _async_fetch_json(hass, RAINVIEWER_INDEX_URL)
        frames = (index.get("radar") or {}).get("past") or []
        if not frames:
            return _cache["composed"]  # type: ignore[return-value]
        host = str(index.get("host") or "")
        path = str(frames[-1].get("path") or "")
    except Exception:
        return _cache["composed"]  # type: ignore[return-value]

    _cache["checked_at"] = now
    frame_key = f"{host}{path}"
    if not host or not path:
        return _cache["composed"]  # type: ignore[return-value]
    if frame_key == _cache["frame_key"] and _cache["composed"] is not None:
        return _cache["composed"]  # type: ignore[return-value]

    x_min, y_min, x_max, y_max = tile_bounds(CZECH_BORDER, ZOOM, TILE_SIZE)
    tile_urls = {
        (tile_x, tile_y): (
            f"{host}{path}/{TILE_SIZE}/{ZOOM}/{tile_x}/{tile_y}/{COLOR_SCHEME}/{SMOOTH}_{SNOW}.png"
        )
        for tile_x in range(x_min, x_max + 1)
        for tile_y in range(y_min, y_max + 1)
    }
    fetched = await asyncio.gather(
        *(_async_fetch_tile(hass, url) for url in tile_urls.values())
    )
    tiles = {key: image for key, image in zip(tile_urls.keys(), fetched) if image is not None}
    if not tiles:
        return _cache["composed"]  # type: ignore[return-value]

    composed = await hass.async_add_executor_job(
        functools.partial(
            compose_country_radar_image,
            tiles,
            zoom=ZOOM,
            tile_size=TILE_SIZE,
            x_min=x_min,
            y_min=y_min,
            x_max=x_max,
            y_max=y_max,
        )
    )
    _cache["composed"] = composed
    _cache["frame_key"] = frame_key
    return composed


MAX_NATIVE_DIMENSION = 800


async def async_render_meteoradar(hass: "HomeAssistant") -> Image.Image | None:
    """Return the live Czech Republic precipitation map at its own cropped aspect.

    This is what DratekMeteoradarCamera (camera.py) hands back as its snapshot, the
    same way any other camera entity returns whatever it has - undistorted, without
    forcing it into a caller's box. Whoever composites it into a template slot fits
    it there the same way any other image binding already does (fit_to_size, or an
    equivalent keep-aspect resize).

    Returns None only when RainViewer could not be reached at all and no previous
    render is cached yet - callers should show a placeholder in that case, not fail
    outright, since the next attempt (or the cached frame) will usually work.
    """
    base = await _async_composed_base_image(hass)
    if base is None:
        return None
    if base.width <= MAX_NATIVE_DIMENSION and base.height <= MAX_NATIVE_DIMENSION:
        return base
    scale = MAX_NATIVE_DIMENSION / max(base.width, base.height)
    size = (max(1, round(base.width * scale)), max(1, round(base.height * scale)))
    return await hass.async_add_executor_job(base.resize, size, Image.Resampling.LANCZOS)
