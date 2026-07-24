from __future__ import annotations

import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _match_version(path: Path, pattern: str) -> str:
    match = re.search(pattern, path.read_text(encoding="utf-8"))
    if not match:
        raise AssertionError(f"Verze nebyla nalezena v {path}")
    return match.group(1)


class VersionConsistencyTests(unittest.TestCase):
    def test_all_frontend_and_backend_versions_match(self):
        manifest_version = json.loads(
            (COMPONENT / "manifest.json").read_text(encoding="utf-8")
        )["version"]
        versions = {
            "manifest": manifest_version,
            "const": _match_version(
                COMPONENT / "const.py", r'PANEL_VERSION\s*=\s*"([^"]+)"'
            ),
            "panel": _match_version(
                COMPONENT / "frontend" / "dratek-eink-panel.js",
                r'DRATEK_EINK_VERSION\s*=\s*"([^"]+)"',
            ),
            "overview": _match_version(
                COMPONENT / "frontend" / "dratek-eink-overview-card.js",
                r'DRATEK_EINK_OVERVIEW_VERSION\s*=\s*"([^"]+)"',
            ),
        }
        self.assertEqual(set(versions.values()), {manifest_version}, versions)


if __name__ == "__main__":
    unittest.main()
