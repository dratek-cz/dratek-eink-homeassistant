"""Regression tests for the categorized display-designer tool library."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = (
    ROOT
    / "custom_components"
    / "dratek_eink"
    / "frontend"
    / "dratek-eink-panel.js"
)


class FrontendToolLibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PANEL.read_text(encoding="utf-8")

    def test_library_exposes_all_categories_and_direct_widgets(self):
        for category in ("basic", "data", "status", "custom"):
            self.assertIn(f'data-tool-category="{category}"', self.source)
        for widget in ("chart", "bar_gauge", "pie", "slider", "gauge", "status"):
            self.assertIn(f'toolButton("{widget}"', self.source)

    def test_direct_widgets_participate_in_automatic_refresh(self):
        start = self.source.rindex("  _automaticTextBindings()")
        end = self.source.index("  _entityAutomationPayload()", start)
        automatic_filter = self.source[start:end]
        for widget in ("bar_gauge", "pie", "slider", "gauge", "potentiometer"):
            self.assertIn(f'"{widget}"', automatic_filter)
        self.assertIn('type: "layered"', self.source)

    def test_inspector_sections_are_collapsible(self):
        self.assertIn('<details class="inspector-section"', self.source)
        self.assertIn('class="inspector-chevron"', self.source)

    def test_delete_shortcut_covers_both_designers(self):
        self.assertIn('this._deleteSelected();', self.source)
        self.assertIn('this._deleteCustomLayerObject();', self.source)
        self.assertIn('this._activeTab === "custom"', self.source)
        self.assertIn('event.key === "Delete" || event.key === "Backspace"', self.source)


if __name__ == "__main__":
    unittest.main()
