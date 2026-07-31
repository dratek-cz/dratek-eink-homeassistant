"""Regression coverage for reliable manual uploads to large displays."""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
FRONTEND = COMPONENT / "frontend" / "panel" / "panel-devices.mixin.js"


class LargeDisplayUploadTests(unittest.TestCase):
    def test_sdk_type_296_uses_its_real_800x480_buffer(self) -> None:
        tree = ast.parse((COMPONENT / "const.py").read_text(encoding="utf-8"))
        device_sizes = next(
            node.value
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "DEVICE_SIZES"
                for target in node.targets
            )
        )
        sizes = ast.literal_eval(device_sizes)

        self.assertEqual((800, 480), sizes[296])

    def test_template_upload_uses_the_selected_gateway(self) -> None:
        source = FRONTEND.read_text(encoding="utf-8")
        start = source.index("  async _sendDisplayTemplatePreview()")
        end = source.index("  _rememberSentDisplayPreview(", start)
        upload = source[start:end]

        self.assertIn('const gatewayId = String(this._selectedGatewayId || "");', upload)
        self.assertIn(
            'type: gatewayId ? "dratek_eink/gateways/send_design" : "dratek_eink/send_design"',
            upload,
        )
        self.assertIn("...(gatewayId ? { gateway_id: gatewayId } : {})", upload)
        self.assertIn("software_version: Number(device.sw || 0)", upload)

    def test_manual_design_endpoints_return_after_the_job_is_queued(self) -> None:
        tree = ast.parse((COMPONENT / "websocket.py").read_text(encoding="utf-8"))
        handlers = {
            node.name: node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name in {"websocket_send_design", "websocket_send_gateway_design"}
        }

        self.assertEqual(
            {"websocket_send_design", "websocket_send_gateway_design"},
            set(handlers),
        )
        for name, handler in handlers.items():
            submit_calls = [
                node
                for node in ast.walk(handler)
                if isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "async_submit"
            ]
            self.assertEqual(1, len(submit_calls), name)
            wait_keywords = [
                keyword
                for keyword in submit_calls[0].keywords
                if keyword.arg == "wait_for_completion"
            ]
            self.assertEqual(1, len(wait_keywords), name)
            self.assertIsInstance(wait_keywords[0].value, ast.Constant)
            self.assertIs(wait_keywords[0].value.value, False)


if __name__ == "__main__":
    unittest.main()
