from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
INTEGRATION_INIT = ROOT / "custom_components" / "dratek_eink" / "__init__.py"


class PanelRegistrationTests(unittest.TestCase):
    def test_current_version_static_frontend_is_registered_once(self):
        source = INTEGRATION_INIT.read_text(encoding="utf-8")

        static_guard = source.index(
            "if PANEL_STATIC_PATH not in registered_panel_paths:"
        )
        static_registration = source.index(
            "await hass.http.async_register_static_paths(static_configs)"
        )
        panel_guard = source.index(
            "if panel_exists and registered_version == PANEL_VERSION:"
        )

        self.assertLess(static_guard, static_registration)
        self.assertLess(static_registration, panel_guard)
        self.assertIn('"registered_panel_static_paths", set()', source)
        self.assertIn("registered_panel_paths.add(PANEL_STATIC_PATH)", source)
        self.assertIn(
            'hass.data[DOMAIN]["static_paths_registered"] = True',
            source,
        )

    def test_existing_panel_from_an_older_release_is_replaced(self):
        source = INTEGRATION_INIT.read_text(encoding="utf-8")

        remove = source.index(
            "frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)"
        )
        register = source.index("await panel_custom.async_register_panel(")
        version_marker = source.index(
            'hass.data[DOMAIN]["panel_registered_version"] = PANEL_VERSION'
        )

        self.assertLess(remove, register)
        self.assertLess(register, version_marker)


if __name__ == "__main__":
    unittest.main()
