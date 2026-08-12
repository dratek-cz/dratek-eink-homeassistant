"""Pin the vendor stream framing to what `qlz_decompress` accepts.

The reference decoder below follows QuickLZ 1.5.0's own reading of a block -
header length from bit 1, stored body when bit 0 is clear - so a payload that
survives it round trip is a payload the display can read back.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _load_component_module(name: str):
    package_name = "dratek_test_component"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__path__ = [str(COMPONENT)]
        sys.modules[package_name] = package
    module_name = f"{package_name}.{name}"
    spec = importlib.util.spec_from_file_location(module_name, COMPONENT / f"{name}.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nelze načíst modul {name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


quicklz = _load_component_module("quicklz")
discovery = _load_component_module("discovery")


def reference_decode_plane(stream: bytes, offset: int, plane_size: int) -> tuple[bytes, int]:
    """Read one plane back the way the display's decompressor would."""
    out = bytearray()
    while len(out) < plane_size:
        flags = stream[offset]
        if flags & 0x01:
            raise AssertionError("Blok je označený jako komprimovaný")
        if flags >> 2 & 0x03 != 1:
            raise AssertionError("Blok neohlašuje kompresní úroveň 1")
        if flags >> 4 & 0x03 != 3:
            raise AssertionError("Blok neohlašuje 64bajtový streamovací buffer")
        header = 9 if flags & 0x02 else 3
        if header == 3:
            block_size, raw_size = stream[offset + 1], stream[offset + 2]
        else:
            block_size = int.from_bytes(stream[offset + 1 : offset + 5], "little")
            raw_size = int.from_bytes(stream[offset + 5 : offset + 9], "little")
        body = stream[offset + header : offset + block_size]
        if len(body) != raw_size:
            raise AssertionError("Uložený blok nemá ohlášenou délku")
        out += body
        offset += block_size
    return bytes(out), offset


class QuickLzFramingTests(unittest.TestCase):
    def test_raw_data_flag_decides_whether_framing_is_needed(self):
        self.assertTrue(quicklz.needs_vendor_framing(299))
        self.assertFalse(quicklz.needs_vendor_framing(299 | 0x4000))
        # The two labels that have always worked here advertise the flag.
        self.assertFalse(quicklz.needs_vendor_framing(16651))
        self.assertFalse(quicklz.needs_vendor_framing(16459))

    def test_mirror_bit_selects_the_two_plane_framing(self):
        self.assertTrue(quicklz.uses_split_planes(299))  # 800x480 BWR
        self.assertTrue(quicklz.uses_split_planes(315))
        self.assertFalse(quicklz.uses_split_planes(296))  # 800x480 BW

    def test_two_plane_payload_round_trips(self):
        black = bytes(range(256)) * 8
        red = bytes((0xFF - value) & 0xFF for value in range(256)) * 8
        framed = quicklz.frame_payload(black + red, 299)

        self.assertEqual(int.from_bytes(framed[:4], "little"), len(black))
        first, offset = reference_decode_plane(framed, 4, len(black))
        second, offset = reference_decode_plane(framed, offset, len(red))
        self.assertEqual(first, black)
        self.assertEqual(second, red)
        self.assertEqual(offset, len(framed))

    def test_single_plane_payload_round_trips(self):
        plane = bytes(range(256)) * 4
        framed = quicklz.frame_payload(plane, 296)

        self.assertEqual(int.from_bytes(framed[:4], "little"), len(plane))
        decoded, offset = reference_decode_plane(framed, 4, len(plane))
        self.assertEqual(decoded, plane)
        self.assertEqual(offset, len(framed))

    def test_trailing_chunk_shorter_than_the_stream_buffer(self):
        plane = bytes(100)  # 64 + 36, so the last block is a partial one
        framed = quicklz.frame_payload(plane, 296)
        decoded, offset = reference_decode_plane(framed, 4, len(plane))
        self.assertEqual(decoded, plane)
        self.assertEqual(offset, len(framed))

    def test_framed_size_matches_the_stream_it_describes(self):
        payload = bytes(96000)
        self.assertEqual(
            quicklz.framed_size(len(payload), 299),
            len(quicklz.frame_payload(payload, 299)),
        )
        # 800x480 BWR: 4 + 2 * (48000 + 750 * 3)
        self.assertEqual(quicklz.framed_size(96000, 299), 100504)

    def test_odd_length_two_plane_payload_is_rejected(self):
        with self.assertRaises(ValueError):
            quicklz.frame_payload(bytes(97), 299)


class AdvertisedFramingTests(unittest.TestCase):
    """Real advertisements, byte for byte, as the gateway reported them.

    The flag is the whole reason an 800x480 panel took a full image and stayed
    blank while every other label in the same room refreshed, so both sides of
    the split are pinned here.
    """

    def test_800x480_panel_asks_for_the_vendor_stream(self):
        # NEMR99804152: type 0x2B, battery, software 129, hardware 1, profile 0x01
        parsed = discovery.parse_dratek_manufacturer_data(
            address="FF:FF:99:80:41:52",
            name="NEMR99804152",
            rssi=-48,
            data=bytes.fromhex("2B1D810101"),
        )
        self.assertEqual(parsed.raw_type, 299)
        self.assertEqual(parsed.sdk_type, 299)
        self.assertEqual(discovery.raw_type_for("ff:ff:99:80:41:52"), 299)
        self.assertTrue(quicklz.needs_vendor_framing(parsed.raw_type))

    def test_labels_with_the_raw_data_flag_are_left_alone(self):
        for address, advertisement, sdk_type, raw_type in (
            ("FF:FF:94:20:10:78", "4B1E810140", 75, 16459),
            ("FF:FF:92:81:46:32", "331D810140", 51, 16435),
        ):
            with self.subTest(address=address):
                parsed = discovery.parse_dratek_manufacturer_data(
                    address=address,
                    name=None,
                    rssi=-60,
                    data=bytes.fromhex(advertisement),
                )
                self.assertEqual(parsed.raw_type, raw_type)
                self.assertEqual(parsed.sdk_type, sdk_type)
                self.assertFalse(quicklz.needs_vendor_framing(parsed.raw_type))

    def test_an_unseen_address_reports_no_advertised_type(self):
        self.assertIsNone(discovery.raw_type_for("FF:FF:00:00:00:01"))
        self.assertFalse(quicklz.needs_vendor_framing(None))


if __name__ == "__main__":
    unittest.main()
