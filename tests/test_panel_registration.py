from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
INTEGRATION_INIT = ROOT / "custom_components" / "dratek_eink" / "__init__.py"


class PanelRegistrationTests(unittest.TestCase):
    def test_static_frontend_is_registered_before_existing_panel_shortcuts(self):
        source = INTEGRATION_INIT.read_text(encoding="utf-8")

        static_guard = source.index(
            'if not hass.data[DOMAIN].get("static_paths_registered"):'
        )
        static_registration = source.index(
            "await hass.http.async_register_static_paths(static_configs)"
        )
        panel_guard = source.index(
            'if hass.data[DOMAIN].get("panel_registered"):'
        )
        existing_panel_guard = source.index(
            'if PANEL_URL_PATH in hass.data.get("frontend_panels", {}):'
        )

        self.assertLess(static_guard, static_registration)
        self.assertLess(static_registration, panel_guard)
        self.assertLess(static_registration, existing_panel_guard)
        self.assertIn(
            'hass.data[DOMAIN]["static_paths_registered"] = True',
            source,
        )


if __name__ == "__main__":
    unittest.main()
