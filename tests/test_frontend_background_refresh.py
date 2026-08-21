"""Regression checks for non-destructive frontend background polling."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "dratek_eink" / "frontend"


class FrontendBackgroundRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.panel = (FRONTEND / "dratek-eink-panel.js").read_text(encoding="utf-8")
        cls.devices = (FRONTEND / "panel" / "panel-devices.mixin.js").read_text(encoding="utf-8")
        cls.queue = (FRONTEND / "panel" / "panel-queue.mixin.js").read_text(encoding="utf-8")
        cls.gateway = (FRONTEND / "panel" / "panel-gateway.mixin.js").read_text(encoding="utf-8")
        cls.render = (FRONTEND / "panel" / "panel-render-ui.mixin.js").read_text(encoding="utf-8")

    def test_queue_poll_renders_only_when_visible_data_changed(self) -> None:
        self.assertIn("_queueRenderSignature(queue = this._queue)", self.queue)
        self.assertIn("async _loadQueue(render = true, onlyWhenChanged = false)", self.queue)
        self.assertIn("this._loadQueue(visible, true)", self.queue)
        self.assertIn("!onlyWhenChanged || queueChanged", self.queue)

    def test_queue_log_progress_updates_only_live_nodes(self) -> None:
        structural_signature = self.queue[
            self.queue.index("  _queueRenderSignature") : self.queue.index("  _queueLogSignature")
        ]
        self.assertNotIn("log: job.log", structural_signature)
        self.assertIn("_updateQueueLiveDom()", self.queue)
        self.assertIn("data-queue-live-summary", self.queue)
        self.assertIn("data-queue-log-lines", self.queue)

    def test_device_scan_has_only_initial_and_final_render_points(self) -> None:
        scan = self.devices[
            self.devices.index("  async _scan(") : self.devices.index("  _scheduleDeviceStatusPoll(")
        ]
        self.assertEqual(scan.count("this._renderKeepingSearchFocus();"), 2)
        self.assertIn("if (changed) await this._loadDevicePreviewDrafts", scan)
        self.assertIn("this._pendingDeviceBackgroundRender", scan)

    def test_gateway_poll_never_rebuilds_an_unrelated_page(self) -> None:
        self.assertIn('["gateways", "topology"].includes(this._activeTab)', self.gateway)
        self.assertIn("_pendingGatewayBackgroundRender", self.gateway)
        self.assertIn("last_seen|last_check|checked_at|updated_at|timestamp", self.gateway)

    def test_open_interaction_blocks_background_dom_replacement(self) -> None:
        self.assertIn("_backgroundUiCanRender()", self.render)
        for selector in (".modal-backdrop", "[role='dialog']", "details[open]", "[aria-expanded='true']"):
            self.assertIn(selector, self.render)
        self.assertIn("_pendingLiveDataBackgroundRender", self.panel)


if __name__ == "__main__":
    unittest.main()
