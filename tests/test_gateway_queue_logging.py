"""Gateway progress must be streamed into the shared write queue."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


class GatewayQueueLoggingTests(unittest.TestCase):
    def test_gateway_sender_forwards_each_log_line_to_the_queue(self):
        gateway = (COMPONENT / "gateway.py").read_text(encoding="utf-8")
        websocket = (COMPONENT / "ws_gateways.py").read_text(encoding="utf-8")
        automation = (COMPONENT / "automation.py").read_text(encoding="utf-8")

        self.assertIn("log_callback: Any = None", gateway)
        self.assertIn("if callable(log_callback):", gateway)
        self.assertIn("log_callback(line)", gateway)
        self.assertIn("msg.get(\"software_version\"),", websocket)
        self.assertIn("log_callback=add_log,", websocket)
        self.assertIn("orientation,", automation)
        self.assertIn("log_callback=add_log,", automation)


if __name__ == "__main__":
    unittest.main()
