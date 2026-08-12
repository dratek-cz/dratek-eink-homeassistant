"""Regression checks for the persistent last-written display snapshot."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


class DisplayPreviewPersistenceTests(unittest.TestCase):
    def test_snapshot_has_its_own_home_assistant_store(self):
        source = (COMPONENT / "display_preview.py").read_text(encoding="utf-8")
        self.assertIn('PREVIEW_STORE_KEY = "dratek_eink.display_previews"', source)
        self.assertIn('"preview_image": data_url', source)
        self.assertIn('"preview_updated_at": int(time.time() * 1000)', source)
        self.assertIn("async with lock:", source)
        self.assertIn('preview["sent_template_ids"]', source)
        self.assertIn('previous.get("sent_template_ids")', source)
        self.assertIn("template_ids[:6]", source)

    def test_draft_reads_include_the_persistent_snapshot(self):
        source = (COMPONENT / "ws_projects.py").read_text(encoding="utf-8")
        self.assertIn("preview = await async_display_preview", source)
        self.assertIn("previews = await async_load_display_previews", source)
        self.assertIn("drafts.setdefault(address, {}).update(preview)", source)
        self.assertIn('{"draft": {**draft, **(preview or {})}}', source)

    def test_successful_full_writes_record_the_snapshot(self):
        sending = (COMPONENT / "ws_sending.py").read_text(encoding="utf-8")
        gateways = (COMPONENT / "ws_gateways.py").read_text(encoding="utf-8")
        automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        self.assertGreaterEqual(sending.count("await async_save_display_preview("), 3)
        self.assertIn("await async_save_display_preview(", gateways)
        self.assertGreaterEqual(automation.count("await async_save_display_preview("), 2)
        for source in (sending, automation):
            self.assertIn("preview could not be saved", source.lower())
        self.assertIn("nahled se nepodarilo ulozit", gateways.lower())
        self.assertIn('vol.Optional("template_ids"): [str]', sending)
        self.assertIn('vol.Optional("template_ids"): [str]', gateways)
        self.assertIn('list(msg.get("template_ids") or [])', sending)
        self.assertIn('list(msg.get("template_ids") or [])', gateways)


if __name__ == "__main__":
    unittest.main()
