from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from scripts.build_release import build_release


class ReleaseArchiveTests(unittest.TestCase):
    def test_archive_uses_linux_compatible_member_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "dratek_eink.zip"
            build_release(archive_path)

            with ZipFile(archive_path) as archive:
                names = archive.namelist()

            self.assertIn("frontend/dratek-eink-panel.js", names)
            self.assertIn("frontend/panel/panel-devices.mixin.js", names)
            self.assertFalse(any("\\" in name for name in names))
            self.assertFalse(any("__pycache__" in name for name in names))
            self.assertFalse(any(name.endswith((".pyc", ".pyo")) for name in names))


if __name__ == "__main__":
    unittest.main()
