"""Regression coverage for reliable manual uploads to large displays."""

from __future__ import annotations

import ast
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from websocket_sources import find_top_level_function, websocket_source


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
        self.assertIn('type: "dratek_eink/gateways/send_design"', upload)
        self.assertIn("await this._sendLocalDisplayDesignChunked(payload)", upload)
        self.assertIn("software_version: Number(device.sw || 0)", upload)

    def test_local_design_image_is_split_into_bounded_websocket_messages(self) -> None:
        source = FRONTEND.read_text(encoding="utf-8")
        self.assertIn("const chunkSize = 64 * 1024", source)
        self.assertIn('type: "dratek_eink/upload_design_chunk"', source)
        self.assertIn('type: "dratek_eink/commit_design_upload"', source)

        # The backend side is spread across the ws_*.py modules now, so read the
        # websocket layer as a whole instead of pinning a single file.
        backend = websocket_source()
        self.assertIn("DESIGN_UPLOAD_CHUNK_BYTES = 64 * 1024", backend)
        self.assertIn("websocket_upload_design_chunk", backend)
        self.assertIn("websocket_commit_design_upload", backend)
        self.assertIn("base64.b64decode(image_data, validate=True)", backend)

    def test_manual_design_endpoints_return_after_the_job_is_queued(self) -> None:
        # The handlers live in separate ws_*.py modules; look them up by name so
        # this stays a check on behaviour rather than on which file they sit in.
        handlers = {
            name: find_top_level_function(name)
            for name in ("websocket_send_design", "websocket_send_gateway_design")
        }
        for name, handler in handlers.items():
            submit_calls = [
                node
                for node in ast.walk(handler)
                if isinstance(node, ast.Call)
                and (
                    isinstance(node.func, ast.Attribute)
                    and node.func.attr in {"async_submit", "async_submit_gateway_routes"}
                )
            ]
            self.assertGreaterEqual(len(submit_calls), 1, name)
            for submit_call in submit_calls:
                wait_keywords = [
                    keyword
                    for keyword in submit_call.keywords
                    if keyword.arg == "wait_for_completion"
                ]
                self.assertEqual(1, len(wait_keywords), name)
                self.assertIsInstance(wait_keywords[0].value, ast.Constant)
                self.assertIs(wait_keywords[0].value.value, False)


if __name__ == "__main__":
    unittest.main()
