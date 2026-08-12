"""Wiring checks for the central automatic-write management page."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
FRONTEND = COMPONENT / "frontend"


class AutomationManagementUiTests(unittest.TestCase):
    def test_main_navigation_places_automations_fourth(self) -> None:
        source = (FRONTEND / "panel" / "panel-render-ui.mixin.js").read_text(
            encoding="utf-8"
        )
        positions = [
            source.index('data-tab="devices"'),
            source.index('data-tab="topology"'),
            source.index('data-tab="queue"'),
            source.index('data-tab="automations"'),
            source.index('data-tab="gateways"'),
        ]
        self.assertEqual(positions, sorted(positions))

    def test_frontend_calls_list_update_and_delete_commands(self) -> None:
        source = (FRONTEND / "panel" / "panel-automations.mixin.js").read_text(
            encoding="utf-8"
        )
        for command in (
            "dratek_eink/automations/list",
            "dratek_eink/automations/update_interval",
            "dratek_eink/automations/delete",
        ):
            with self.subTest(command=command):
                self.assertIn(f'"{command}"', source)

    def test_overview_does_not_expose_render_payload_fields(self) -> None:
        source = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        method = source[source.index("    async def async_list_configs("):]
        method = method[:method.index("    async def async_set_refresh_trigger_mode(")]
        self.assertNotIn('"base_image":', method)
        self.assertNotIn('"svg_template":', method)


if __name__ == "__main__":
    unittest.main()
