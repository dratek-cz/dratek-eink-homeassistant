"""One missed scan window must not be reported as a display going inactive.

A display advertises intermittently to save battery, and an on-demand gateway
scan is a window of a few seconds. Missing one pass therefore says almost
nothing about whether the display is reachable - the router has always known
this and reuses still-fresh observations (see the "BLE advertisements are
intentionally intermittent" fallback in automation.py). The UI did not: the
first miss set `temporarily_unseen` and the card flipped to "Čekám na signál"
(and the overview card to "Dočasně mimo dosah") for a display that was still
accepting writes.

`temporarily_unseen` keeps its meaning - not heard in this pass, so routing
de-prioritises the route - and a separate `out_of_range`, measured against
DISCOVERY_UNSEEN_GRACE_SECONDS, is what the user is shown.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


def _int_constant(source: str, name: str) -> int:
    tree = ast.parse(source)
    expression = next(
        node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == name for t in node.targets)
    )
    return int(eval(ast.unparse(expression)))  # noqa: S307 - a literal arithmetic expression


class UnseenSettleWindowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.const = (COMPONENT / "const.py").read_text(encoding="utf-8")
        self.ws_devices = (COMPONENT / "ws_devices.py").read_text(encoding="utf-8")

    def test_the_settle_window_is_longer_than_a_scan_but_shorter_than_retention(self) -> None:
        settle = _int_constant(self.const, "DISCOVERY_UNSEEN_GRACE_SECONDS")
        grace = _int_constant(self.const, "DISCOVERY_GRACE_SECONDS")
        # Long enough to cover several advertising intervals and a couple of
        # scan windows...
        self.assertGreaterEqual(settle, 60)
        # ...and well short of the window the record is kept for at all, or the
        # display would drop off the list before it was ever called unreachable.
        self.assertLess(settle, grace)

    def test_a_retained_display_reports_how_long_it_has_been_silent(self) -> None:
        self.assertIn('retained["unseen_for"] = unseen_for', self.ws_devices)
        self.assertIn('retained["out_of_range"] = out_of_range', self.ws_devices)
        self.assertIn(
            "out_of_range = unseen_for > DISCOVERY_UNSEEN_GRACE_SECONDS",
            self.ws_devices,
        )

    def test_a_display_seen_in_this_scan_is_never_flagged(self) -> None:
        self.assertIn('device["temporarily_unseen"] = False', self.ws_devices)
        self.assertIn('device["out_of_range"] = False', self.ws_devices)
        self.assertIn('device["unseen_for"] = 0', self.ws_devices)

    def test_routing_still_de_prioritises_a_route_it_did_not_just_hear(self) -> None:
        # The point of the change is that the *user* is not told a display is
        # gone. Route ranking must keep preferring a route that answered now.
        self.assertIn('retained_path["temporarily_unseen"] = True', self.ws_devices)
        self.assertIn('not bool(path.get("temporarily_unseen"))', self.ws_devices)

    def test_the_scan_the_user_waits_for_is_the_longer_one(self) -> None:
        automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        background = _int_constant(automation, "GATEWAY_ROUTE_SCAN_SECONDS")
        interactive = int(
            self.ws_devices.split("async_scan_gateway(hass, gateway[\"id\"], ")[1]
            .split(")")[0]
        )
        self.assertGreater(
            interactive,
            background,
            "the on-demand scan behind Obnovit should listen longer than the "
            "unattended route scan, which has the discovery cache to fall back on",
        )
        # The gateway clamps to 30 s and the HTTP timeout is derived from this,
        # so it must stay modest - it is paid once per gateway, sequentially.
        self.assertLessEqual(interactive, 10)


class UnseenSettleFrontendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = (PANEL / "panel-devices.mixin.js").read_text(encoding="utf-8")
        self.overview = (
            COMPONENT / "frontend" / "dratek-eink-overview-card.js"
        ).read_text(encoding="utf-8")
        self.const = (COMPONENT / "const.py").read_text(encoding="utf-8")

    def test_the_tile_asks_out_of_range_not_temporarily_unseen(self) -> None:
        self.assertIn(
            "const temporarilyUnseen = this._displayIsOutOfRange(device);",
            self.devices,
        )
        self.assertIn("_displayIsOutOfRange(device) {", self.devices)
        self.assertIn('typeof device?.out_of_range === "boolean"', self.devices)

    def test_the_overview_card_uses_the_same_rule(self) -> None:
        self.assertIn('typeof device?.out_of_range === "boolean"', self.overview)
        self.assertIn("OVERVIEW_UNSEEN_GRACE_SECONDS", self.overview)

    def test_the_mirrored_fallbacks_match_the_backend(self) -> None:
        settle = _int_constant(self.const, "DISCOVERY_UNSEEN_GRACE_SECONDS")
        for name, source in (
            ("DISPLAY_UNSEEN_GRACE_SECONDS", self.devices),
            ("OVERVIEW_UNSEEN_GRACE_SECONDS", self.overview),
        ):
            line = source[source.index(f"const {name} = "):].split(";")[0]
            value = eval(line.split(" = ")[1])  # noqa: S307 - literal arithmetic
            self.assertEqual(value, settle, f"{name} drifted from the backend")

    def test_the_tooltip_says_how_long_and_is_translated(self) -> None:
        self.assertIn("_formatUnseenFor(seconds) {", self.devices)
        self.assertIn("_displayReachabilityTitle(device) {", self.devices)
        i18n = (PANEL / "panel-i18n.mixin.js").read_text(encoding="utf-8")
        # Interpolated strings never match the whole-string table, so both need
        # a pattern - see EN_PATTERNS.
        self.assertIn("Displej se neohlásil (.+)$/", i18n)
        self.assertIn("naposledy se ohlásil před (.+)$/", i18n)


if __name__ == "__main__":
    unittest.main()
