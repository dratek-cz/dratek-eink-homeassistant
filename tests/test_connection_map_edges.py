"""The connection map must show one readable route per display by default.

Every gateway that can merely *hear* a display used to get its own faded
line, always. With more than a couple of gateways that turns into a mesh of
grey lines across the whole map, and a perfectly healthy display reads as
half-connected - reported as "it catches it but doesn't connect".

Alternatives are still available (click a display, or the "show backup
routes" toggle), so these tests pin the parts that make the default view
legible: alternatives are opt-in, and hubs sharing displays are seated next
to each other so an alternative is a short hop rather than a chord across
the map.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"


class ConnectionMapEdgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gateway = (PANEL / "panel-gateway.mixin.js").read_text(encoding="utf-8")
        self.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")
        self.panel = (FRONTEND / "dratek-eink-panel.js").read_text(encoding="utf-8")
        self.styles = (PANEL / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_stale_alternative_routes_are_hidden_unless_asked_for(self) -> None:
        # Freshly observed links must remain visible even when they are not the
        # selected route. Only retained, temporarily unseen history is opt-in.
        self.assertIn(
            "if (!isActive && path.temporarily_unseen && !showAlternatives && !(focus && related)) return;",
            self.gateway,
        )
        self.assertIn(
            "const showAlternatives = this._gatewayMapShowAlternatives === true;",
            self.gateway,
        )

    def test_active_route_is_never_hidden(self) -> None:
        # Whatever the toggle says, the line to the gateway actually serving the
        # display has to stay on the map.
        guard = "if (!isActive && path.temporarily_unseen && !showAlternatives && !(focus && related)) return;"
        self.assertIn(guard, self.gateway)
        self.assertTrue(
            guard.startswith("if (!isActive"),
            "the guard must exempt the active route before anything else",
        )

    def test_toggle_defaults_to_off_and_is_persisted(self) -> None:
        self.assertIn(
            'this._loadUiPreference("gateway-map-show-alternatives", "0") === "1"',
            self.panel,
        )
        self.assertIn("data-map-show-alternatives", self.gateway)
        self.assertIn("data-map-show-alternatives", self.inspector)
        self.assertIn('this._saveUiPreference("gateway-map-show-alternatives"', self.inspector)

    def test_hubs_are_ordered_by_shared_displays(self) -> None:
        self.assertIn("_orderHubsBySharedDevices(hubGroups, devices)", self.gateway)
        self.assertIn("_orderHubsBySharedDevices(hubGroups, devices) {", self.gateway)
        # The circle must be laid out from the reordered list, not the raw one.
        self.assertIn("orderedHubGroups.forEach((group, index)", self.gateway)
        self.assertNotIn("hubGroups.forEach((group, index) => {", self.gateway)

    def test_hub_ordering_is_a_pure_reordering(self) -> None:
        """Every hub must still be placed - reordering may not drop any."""
        match = re.search(
            r"_orderHubsBySharedDevices\(hubGroups, devices\) \{(.*?)\n  \},", self.gateway, re.S
        )
        self.assertIsNotNone(match, "_orderHubsBySharedDevices not found")
        body = match.group(1)
        # Short lists are returned untouched, and the loop drains `remaining`
        # entirely via splice, so nothing can be silently lost.
        self.assertIn("if (hubGroups.length < 3) return hubGroups;", body)
        self.assertIn("while (remaining.length) {", body)
        self.assertIn("remaining.splice(best, 1)[0]", body)

    def test_legend_explains_both_line_kinds(self) -> None:
        self.assertIn("Právě obsluhuje", self.gateway)
        self.assertIn("Záložní trasa (jen slyší)", self.gateway)
        self.assertIn("Klikněte na displej a uvidíte všechny jeho trasy", self.gateway)

    def test_toggle_has_styling(self) -> None:
        self.assertIn(".gwmap-legend-toggle{", self.styles)


if __name__ == "__main__":
    unittest.main()
