"""Regression tests for HACS and Home Assistant brand packaging."""

from __future__ import annotations

import json
from pathlib import Path
import struct
import unittest


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_BRAND = ROOT / "brand"
INTEGRATION_BRAND = ROOT / "custom_components" / "dratek_eink" / "brand"


def _png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise AssertionError(f"{path} is not a valid PNG")
    return struct.unpack(">II", data[16:24])


class HacsBrandAssetTests(unittest.TestCase):
    def test_hacs_uses_the_release_zip(self):
        config = json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))
        self.assertTrue(config["zip_release"])
        self.assertEqual(config["filename"], "dratek_eink.zip")

    def test_repository_and_installed_integration_have_matching_icons(self):
        expected_sizes = {
            "icon.png": (512, 512),
            "icon@2x.png": (1024, 1024),
            "dark_icon.png": (512, 512),
            "dark_icon@2x.png": (1024, 1024),
        }
        for name, size in expected_sizes.items():
            repository_icon = REPOSITORY_BRAND / name
            integration_icon = INTEGRATION_BRAND / name
            self.assertEqual(_png_size(repository_icon), size)
            self.assertEqual(_png_size(integration_icon), size)
            self.assertEqual(repository_icon.read_bytes(), integration_icon.read_bytes())

    def test_release_zip_excludes_developer_bytecode(self):
        # __pycache__ was previously copied wholesale into the release, shipping
        # ~270 KB of compiled bytecode for interpreter versions the user may not
        # even run.
        release_script = (ROOT / "tools" / "push-with-token.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("__pycache__", release_script)
        self.assertIn(".pyc", release_script)
        # Get-ChildItem ignores -Include when it is handed -LiteralPath, so that
        # combination matched every file in the staged package and the prune
        # deleted all of it. v0.1.167 shipped a 22-byte zip once because of it.
        self.assertNotRegex(release_script, r"-LiteralPath[^\r\n]*-Include")

    def test_bundled_firmware_has_no_duplicate_images(self):
        # gateway.py resolves every image through its board-suffixed name, so an
        # unsuffixed copy is dead weight duplicated byte for byte in the download.
        firmware_dir = ROOT / "custom_components" / "dratek_eink" / "firmware"
        digests: dict[bytes, list[str]] = {}
        for image in sorted(firmware_dir.glob("*.bin")):
            digests.setdefault(image.read_bytes(), []).append(image.name)
        duplicates = [names for names in digests.values() if len(names) > 1]
        self.assertEqual(duplicates, [], f"Duplicate firmware images: {duplicates}")

    def test_release_zip_uses_portable_paths(self):
        release_script = (ROOT / "tools" / "push-with-token.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn('.Replace("\\", "/")', release_script)
        self.assertIn("$tempDir = (Get-Item -LiteralPath $tempDir).FullName", release_script)
        self.assertIn("Substring($targetFolder.Length)", release_script)
        self.assertIn("Add-Type -AssemblyName System.IO.Compression", release_script)
        self.assertIn("CreateEntryFromFile", release_script)


if __name__ == "__main__":
    unittest.main()
