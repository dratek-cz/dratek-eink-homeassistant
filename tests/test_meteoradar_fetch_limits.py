"""The radar only talks to RainViewer, and only reads a bounded answer.

The tile URL is built from a field inside RainViewer's own index document
(`host`), which used to be interpolated into the request verbatim. That made a
remote answer - not a person, and not this integration - the thing that decided
which address Home Assistant connected to, from inside the user's network. It is
the same hole `gateway.py` closes with `_validated_host`, and it was open here
only because the value arrives from an API rather than from a form.

Neither body had a size ceiling either: `response.read()` allocates whatever the
far end sends, and a few hundred kilobytes of PNG decodes to hundreds of
megabytes of bitmap.
"""

from __future__ import annotations

import asyncio
import importlib.util
import io
import sys
import types
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "custom_components" / "dratek_eink" / "meteoradar.py"


def _load_meteoradar() -> types.ModuleType:
    """Import meteoradar.py alone - it only needs PIL at module scope."""
    package = "dratek_eink_meteoradar_test"
    if package in sys.modules:
        return sys.modules[package]
    spec = importlib.util.spec_from_file_location(package, MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[package] = module
    spec.loader.exec_module(module)
    return module


meteoradar = _load_meteoradar()


class _FakeContent:
    """Just enough of aiohttp's StreamReader for _read_bounded."""

    def __init__(self, payload: bytes, chunk: int = 7) -> None:
        self._payload = payload
        self._chunk = chunk

    async def iter_chunked(self, _size: int):
        for start in range(0, len(self._payload), self._chunk):
            yield self._payload[start:start + self._chunk]


class _FakeResponse:
    def __init__(self, payload: bytes) -> None:
        self.content = _FakeContent(payload)
        self.status = 200


class ValidatedTileBaseTests(unittest.TestCase):
    def test_the_real_index_shape_is_accepted(self) -> None:
        self.assertEqual(
            ("https://tilecache.rainviewer.com", "/v2/radar/1727712000"),
            meteoradar._validated_tile_base(
                "https://tilecache.rainviewer.com", "/v2/radar/1727712000"
            ),
        )

    def test_a_trailing_slash_on_the_host_is_tolerated(self) -> None:
        self.assertEqual(
            ("https://tilecache.rainviewer.com", "/v2/radar/1"),
            meteoradar._validated_tile_base("https://tilecache.rainviewer.com/", "/v2/radar/1"),
        )

    def test_another_host_is_refused(self) -> None:
        """The whole point: the answer does not get to pick the address."""
        for host in (
            "http://192.168.1.1",
            "https://192.168.1.1",
            "https://rainviewer.com.evil.test",
            "https://evil.test",
            "https://tilecache.rainviewer.com.evil.test",
            "http://tilecache.rainviewer.com",  # plaintext, so also not ours
            "https://tilecache.rainviewer.com/../..",
            "https://user@tilecache.rainviewer.com",
            "",
            None,
        ):
            with self.subTest(host=host):
                self.assertIsNone(meteoradar._validated_tile_base(host, "/v2/radar/1"))

    def test_a_path_that_is_not_a_frame_is_refused(self) -> None:
        for path in (
            "/v2/radar/../../etc/passwd",
            "/v2/radar/1?x=1",
            "/v2/radar/1#f",
            "v2/radar/1",          # must be rooted
            "//evil.test/x",       # protocol-relative
            "",
            None,
        ):
            with self.subTest(path=path):
                self.assertIsNone(
                    meteoradar._validated_tile_base("https://tilecache.rainviewer.com", path)
                )


class ReadBoundedTests(unittest.TestCase):
    def test_a_short_body_comes_back_whole(self) -> None:
        """Chunked reads must not truncate.

        The first attempt at this cap used `content.read(limit + 1)`, but
        aiohttp's reader returns *up to* the requested count - so a single read
        can stop early on a perfectly good response and hand back a PNG with its
        tail missing.
        """
        payload = bytes(range(256)) * 40
        got = asyncio.run(meteoradar._read_bounded(_FakeResponse(payload), 1_000_000))
        self.assertEqual(payload, got)

    def test_a_body_past_the_limit_is_dropped(self) -> None:
        payload = b"x" * 5000
        self.assertIsNone(asyncio.run(meteoradar._read_bounded(_FakeResponse(payload), 4096)))

    def test_the_limit_itself_still_fits(self) -> None:
        payload = b"x" * 4096
        self.assertEqual(
            payload, asyncio.run(meteoradar._read_bounded(_FakeResponse(payload), 4096))
        )


class TileDimensionTests(unittest.TestCase):
    def test_the_ceiling_leaves_real_tiles_alone(self) -> None:
        self.assertGreaterEqual(meteoradar.MAX_TILE_DIMENSION, meteoradar.TILE_SIZE)

    def test_an_oversized_tile_is_refused_before_it_is_decoded(self) -> None:
        """A byte cap does not imply a pixel cap.

        A single-colour PNG compresses to almost nothing, so a tile well inside
        MAX_TILE_BYTES can still decode to a bitmap hundreds of megabytes wide.
        Image.open only reads the header, so the size is known while walking
        away is still free.
        """
        oversized = Image.new("RGBA", (meteoradar.MAX_TILE_DIMENSION + 8, 16), (0, 0, 0, 0))
        buffer = io.BytesIO()
        oversized.save(buffer, format="PNG")
        self.assertLess(buffer.tell(), meteoradar.MAX_TILE_BYTES, "sample is not a decompression bomb")
        header_only = Image.open(io.BytesIO(buffer.getvalue()))
        self.assertGreater(max(header_only.size), meteoradar.MAX_TILE_DIMENSION)


class ComposeRefusesAForeignHostTests(unittest.TestCase):
    """The end-to-end shape of the bug: an index naming another host.

    The other tests pin the validator; this one pins the call site, which is
    where the value was actually used. Before the fix this composed happily and
    fetched every tile from whatever address the index named.
    """

    def setUp(self) -> None:
        meteoradar._cache.clear()
        # This pins the real fetch path, so the demo build's short circuit must
        # be out of the way - with it on there is no fetch to validate at all.
        self._demo = meteoradar.DEMO_PRECIPITATION
        meteoradar.DEMO_PRECIPITATION = False
        self._fetch_json = meteoradar._async_fetch_json
        self._fetch_tile = meteoradar._async_fetch_tile
        self.requested: list[str] = []

        async def fake_tile(_hass, url):
            self.requested.append(url)
            return None

        meteoradar._async_fetch_tile = fake_tile

    def tearDown(self) -> None:
        meteoradar.DEMO_PRECIPITATION = self._demo
        meteoradar._async_fetch_json = self._fetch_json
        meteoradar._async_fetch_tile = self._fetch_tile
        meteoradar._cache.clear()

    def _compose_with_host(self, host: str, path: str = "/v2/radar/1727712000"):
        async def fake_index(_hass, _url):
            return {"host": host, "radar": {"past": [{"path": path}]}}

        meteoradar._async_fetch_json = fake_index
        return asyncio.run(
            meteoradar._async_composed_base_image_uncached(object(), country="cz")
        )

    def test_a_foreign_host_fetches_nothing(self) -> None:
        self.assertIsNone(self._compose_with_host("http://192.168.1.1"))
        self.assertEqual([], self.requested, "a tile was requested from an unvetted host")

    def test_a_traversal_path_fetches_nothing(self) -> None:
        self.assertIsNone(
            self._compose_with_host("https://tilecache.rainviewer.com", "/v2/../../x")
        )
        self.assertEqual([], self.requested)

    def test_rainviewers_own_host_is_used(self) -> None:
        """The vetted case still reaches the tiles (which this fake declines)."""
        self.assertIsNone(self._compose_with_host("https://tilecache.rainviewer.com"))
        self.assertTrue(self.requested, "the legitimate host was refused too")
        for url in self.requested:
            self.assertTrue(url.startswith("https://tilecache.rainviewer.com/v2/radar/"), url)


if __name__ == "__main__":
    unittest.main()
