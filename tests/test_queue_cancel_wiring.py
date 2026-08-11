"""Wiring pins for the queue-tab cancel button.

The cancellation behaviour itself (which jobs may be cancelled, what happens
to them) is exercised directly against a live TransferQueue in
tests/test_transfer_queue_retry.py. This file guards the surrounding wiring
that can't run without a real Home Assistant websocket connection or a
browser: the new command is registered, and the panel actually renders and
wires up a button for it.
"""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PANEL = COMPONENT / "frontend" / "panel"


class BackendCancelWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ws_queue = (COMPONENT / "ws_queue.py").read_text(encoding="utf-8")
        self.websocket = (COMPONENT / "websocket.py").read_text(encoding="utf-8")
        self.queue = (COMPONENT / "queue.py").read_text(encoding="utf-8")

    def test_command_is_defined(self) -> None:
        self.assertIn('"type": "dratek_eink/queue/cancel"', self.ws_queue)
        self.assertIn("def websocket_cancel_queue_job(", self.ws_queue)
        self.assertIn("queue.async_cancel_job(msg[\"job_id\"])", self.ws_queue)

    def test_command_is_registered(self) -> None:
        self.assertIn("websocket_cancel_queue_job", self.websocket)
        # Imported alongside the other two queue commands...
        self.assertIn(
            "from .ws_queue import websocket_cancel_queue_job, websocket_clear_queue, websocket_transfer_queue",
            self.websocket,
        )
        # ...and listed in the COMMANDS tuple that async_setup registers.
        self.assertIn("websocket_cancel_queue_job,\n    websocket_render_meteoradar,", self.websocket)

    def test_queue_only_cancels_jobs_still_queued(self) -> None:
        self.assertIn("def async_cancel_job(self, job_id: str) -> bool:", self.queue)
        self.assertIn('if job is None or job.get("status") != "queued":', self.queue)
        self.assertIn("self._job_tasks: dict[str, asyncio.Task[Any]] = {}", self.queue)


class FrontendCancelWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.queue_mixin = (PANEL / "panel-queue.mixin.js").read_text(encoding="utf-8")
        self.inspector = (PANEL / "panel-inspector.mixin.js").read_text(encoding="utf-8")

    def test_button_is_rendered_only_for_queued_jobs(self) -> None:
        self.assertIn('status === "queued" ? `<button type="button" class="tile-icon-btn queue-cancel-btn"', self.queue_mixin)
        self.assertIn('data-cancel-queue-job="${this._escape(job.id || "")}"', self.queue_mixin)

    def test_click_handler_calls_the_cancel_command(self) -> None:
        self.assertIn('"[data-cancel-queue-job]"', self.inspector)
        self.assertIn('{ type: "dratek_eink/queue/cancel", job_id: button.dataset.cancelQueueJob }', self.inspector)
        self.assertIn("await this._loadQueue(true);", self.inspector)


if __name__ == "__main__":
    unittest.main()
