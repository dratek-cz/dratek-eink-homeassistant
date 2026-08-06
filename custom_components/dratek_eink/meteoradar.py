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

# Czech Republic border as (lon, lat) pairs, closed (first point repeats last).
# Sourced from the Czech Office for Surveying, Mapping and Cadastre (ČÚZK) via
# geoBoundaries (CC BY 4.0, https://www.geoboundaries.org, dataset CZE-ADM0),
# simplified from ~3000 to 221 points with Douglas-Peucker (epsilon 0.02 degrees)
# - enough detail to be genuinely recognisable at e-ink resolution instead of the
# rough polygon this used to be, without carrying a full-resolution shapefile in
# the integration.
CZECH_BORDER: tuple[tuple[float, float], ...] = (
    (16.8628, 50.1982), (16.8122, 50.191), (16.706, 50.0966), (16.6336, 50.1113),
    (16.5611, 50.1639), (16.5483, 50.2298), (16.4313, 50.3247), (16.3832, 50.3288),
    (16.3607, 50.3796), (16.2786, 50.3674), (16.2105, 50.4112), (16.205, 50.4487),
    (16.3115, 50.5061), (16.3604, 50.5012), (16.4449, 50.5796), (16.3431, 50.6615),
    (16.2348, 50.6716), (16.1842, 50.6272), (16.1037, 50.6634), (16.0248, 50.5986),
    (15.9864, 50.6135), (16.0218, 50.6302), (15.9909, 50.6834), (15.861, 50.6745),
    (15.8162, 50.7553), (15.7057, 50.7373), (15.4395, 50.8091), (15.3748, 50.7776),
    (15.3673, 50.838), (15.2771, 50.891), (15.2741, 50.9795), (15.1799, 50.983),
    (15.1718, 51.02), (15.129, 50.9901), (15.061, 51.0229), (14.9854, 51.0108),
    (14.9682, 50.99), (15.0217, 50.9671), (14.9895, 50.9216), (15.0019, 50.8688),
    (14.8296, 50.8728), (14.7966, 50.821), (14.7223, 50.8221), (14.6189, 50.8578),
    (14.6502, 50.9315), (14.5644, 50.9186), (14.5991, 50.9872), (14.4986, 51.0221),
    (14.5084, 51.0433), (14.4086, 51.0188), (14.3156, 51.0557), (14.2739, 51.0398),
    (14.2587, 50.9875), (14.3235, 50.9854), (14.3114, 50.954), (14.397, 50.9363),
    (14.388, 50.8992), (14.2674, 50.8953), (14.0785, 50.8125), (13.9008, 50.7934),
    (13.8988, 50.7451), (13.8549, 50.727), (13.5519, 50.7137), (13.5252, 50.7044),
    (13.5243, 50.639), (13.4649, 50.6018), (13.3711, 50.6508), (13.3232, 50.5811),
    (13.2484, 50.5921), (13.1953, 50.5032), (13.0317, 50.5098), (13.0199, 50.4466),
    (12.9481, 50.4043), (12.819, 50.4603), (12.8105, 50.4309), (12.7345, 50.4323),
    (12.7071, 50.3971), (12.512, 50.3973), (12.4895, 50.3498), (12.3984, 50.3214),
    (12.3592, 50.2421), (12.3313, 50.2424), (12.3344, 50.1716), (12.2894, 50.1769),
    (12.2939, 50.221), (12.2395, 50.2462), (12.2659, 50.2502), (12.2538, 50.271),
    (12.2013, 50.2728), (12.1846, 50.3222), (12.1047, 50.3217), (12.1401, 50.2778),
    (12.0906, 50.2524), (12.1972, 50.199), (12.1996, 50.1108), (12.2754, 50.0765),
    (12.261, 50.0584), (12.4672, 49.9928), (12.4996, 49.972), (12.4749, 49.9385),
    (12.5477, 49.9205), (12.4731, 49.8337), (12.4726, 49.7861), (12.4006, 49.7538),
    (12.4425, 49.7038), (12.522, 49.6864), (12.5281, 49.6181), (12.5607, 49.6196),
    (12.5885, 49.5385), (12.6442, 49.523), (12.6556, 49.4348), (12.7577, 49.3948),
    (12.7858, 49.3455), (12.9453, 49.3438), (13.0291, 49.3043), (13.034, 49.2639),
    (13.1709, 49.1736), (13.1828, 49.1345), (13.2892, 49.1186), (13.3974, 49.0507),
    (13.4262, 48.9725), (13.4978, 48.9413), (13.5071, 48.9691), (13.5801, 48.9707),
    (13.6714, 48.8801), (13.7379, 48.886), (13.8132, 48.774), (14.0601, 48.6733),
    (14.0106, 48.6397), (14.067, 48.5949), (14.3332, 48.5518), (14.4314, 48.5891),
    (14.4699, 48.6485), (14.5035, 48.6173), (14.6105, 48.6281), (14.6635, 48.582),
    (14.7061, 48.585), (14.727, 48.6871), (14.8081, 48.7339), (14.8087, 48.7788),
    (14.9795, 48.7723), (14.9533, 48.7898), (14.9929, 48.9037), (14.9762, 48.971),
    (15.0205, 49.0205), (15.1563, 48.9933), (15.1602, 48.9417), (15.2616, 48.9536),
    (15.2789, 48.9947), (15.4685, 48.9518), (15.6897, 48.8557), (15.8415, 48.8771),
    (16.1027, 48.7454), (16.378, 48.7285), (16.4604, 48.809), (16.5408, 48.8143),
    (16.6637, 48.781), (16.6826, 48.7278), (16.902, 48.718), (16.9402, 48.6165),
    (17.0433, 48.7643), (17.2002, 48.8776), (17.3613, 48.8135), (17.4532, 48.8467),
    (17.5285, 48.8122), (17.7033, 48.86), (17.7813, 48.9253), (17.8853, 48.9277),
    (17.9243, 49.02), (18.0571, 49.0285), (18.0955, 49.0592), (18.147, 49.2479),
    (18.184, 49.287), (18.3789, 49.3305), (18.4156, 49.3675), (18.4037, 49.3967),
    (18.4757, 49.4085), (18.5529, 49.5031), (18.7545, 49.4884), (18.8509, 49.5171),
    (18.8069, 49.6768), (18.6252, 49.7224), (18.5689, 49.8292), (18.6057, 49.8616),
    (18.5696, 49.8734), (18.5729, 49.9216), (18.5237, 49.8995), (18.333, 49.9494),
    (18.35, 49.9296), (18.3179, 49.9157), (18.2066, 49.9979), (18.117, 49.9942),
    (18.0336, 50.066), (18.0041, 50.039), (18.0444, 50.0366), (18.0455, 50.0051),
    (18.0046, 50.0184), (17.9186, 49.978), (17.7774, 50.0203), (17.7309, 50.0972),
    (17.6503, 50.1108), (17.5927, 50.16), (17.7585, 50.2066), (17.765, 50.2364),
    (17.725, 50.2568), (17.7521, 50.2995), (17.713, 50.3226), (17.6121, 50.266),
    (17.3503, 50.2638), (17.3487, 50.3284), (17.2821, 50.319), (17.2033, 50.3864),
    (16.9079, 50.4495), (16.8603, 50.4078), (16.911, 50.389), (16.9461, 50.3154),
    (17.0026, 50.3021), (17.0283, 50.23), (16.9985, 50.2159), (16.9759, 50.2448),
    (16.8628, 50.1982),
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
