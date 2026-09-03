"""Two displays cannot be "the rendering device" at the same time.

`_device()` answers "whose palette and size is this drawing pass using" from a
single ambient field, `_renderingDeviceAddress`. That works only while one
render is in flight. The device list starts every card's preview at once
(`_paintDisplayTemplateDitheredPreviews` fires them without awaiting), so
several async renders were routinely inside their own scope together: each
pushed its display, awaited an SVG build, and resumed to find the ambient field
pointing at whichever render pushed last.

Measured in the panel harness with six displays, before the fix: all six
renders resolved `_device()` to one address - the last one pushed - so every
card was drawn with that display's size and assignments, and because that
display was a four-colour SDK 46, the three-colour panels were previewed with a
four-colour palette. A later repaint that happened to run alone corrected them,
which is why the cards visibly flipped back after a moment.

The stack in `_pushRenderingDevice` fixes unwinding, not interleaving. What
makes the ambient field safe is serialising the async renders, so the invariant
it assumes - one rendering device at a time - actually holds.
"""

from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"
DEVICES = PANEL / "panel-devices.mixin.js"
BRAND_LOGO = PANEL / "panel-brand-logo.mixin.js"


def _method_body(source: str, signature: str) -> str:
    start = source.index(signature)
    end = source.index("\n  },", start)
    return source[start:end]


class RenderingDeviceGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.devices = DEVICES.read_text(encoding="utf-8")
        self.brand_logo = BRAND_LOGO.read_text(encoding="utf-8")

    def test_the_gate_serialises_rather_than_merely_scoping(self) -> None:
        body = _method_body(self.devices, "async _withRenderingDevice(address, run) {")
        # A promise chain: each caller waits on the previous one's release
        # before it pushes, so no two scopes are ever open together.
        self.assertIn("this._renderingDeviceGate", body)
        self.assertIn("await previous", body)
        self.assertIn("this._pushRenderingDevice(address)", body)
        # The release must be unconditional, or one throwing render wedges
        # every later one.
        tail = body.split("finally")[1]
        self.assertIn("this._popRenderingDevice(scope)", tail)
        self.assertIn("release()", tail)

    def test_a_failed_render_still_releases_the_gate(self) -> None:
        body = _method_body(self.devices, "async _withRenderingDevice(address, run) {")
        # `previous` is awaited with its rejection swallowed; without that a
        # single failure would leave every later caller waiting on a rejected
        # promise.
        self.assertRegex(body, r"await previous\.catch\(")

    def test_every_async_render_scope_goes_through_the_gate(self) -> None:
        for name, source in (("devices", self.devices), ("brand-logo", self.brand_logo)):
            with self.subTest(module=name):
                # Bare push/pop is for the synchronous scope only. An async one
                # using it directly is the bug this module exists to prevent.
                bare = re.findall(r"_pushRenderingDevice\(", source)
                gated = re.findall(r"_withRenderingDevice\(", source)
                if name == "brand-logo":
                    self.assertEqual(bare, [], "brand logo must use the gate")
                    self.assertTrue(gated)
                else:
                    # panel-devices holds the definition plus the synchronous
                    # preview scope, and the gate's own push.
                    self.assertLessEqual(
                        len(bare), 3, "an async scope is pushing without the gate"
                    )

    def test_the_three_async_renders_are_the_gated_ones(self) -> None:
        for signature in (
            "async _renderCurrentDisplayTemplateImage(",
            "async _preparedTemplateEntityBindings(",
        ):
            with self.subTest(method=signature):
                body = _method_body(self.devices, signature)
                self.assertIn("this._withRenderingDevice(device?.address", body)
        self.assertIn("this._withRenderingDevice(device?.address", self.brand_logo)

    def test_the_synchronous_preview_scope_keeps_the_plain_stack(self) -> None:
        # It has no await to be interleaved at, and it runs inside the render
        # pass itself - taking an async gate there would mean awaiting during
        # markup construction, which the renderer cannot do.
        body = _method_body(
            self.devices,
            "_renderTemplatePhysicalDevicePreview(device, templates, orientation, layout, autoFit = false) {",
        )
        self.assertIn("this._pushRenderingDevice(address)", body)
        self.assertIn("this._popRenderingDevice(renderingScope)", body)

    def test_nothing_gated_calls_another_gated_function(self) -> None:
        # The gate is not re-entrant; a nested take would deadlock.
        gated = (
            "_renderCurrentDisplayTemplateImage",
            "_preparedTemplateEntityBindings",
            "_brandLogoRenderFor",
        )
        bodies = {
            "_renderCurrentDisplayTemplateImage": _method_body(
                self.devices, "async _renderCurrentDisplayTemplateImage("
            ),
            "_preparedTemplateEntityBindings": _method_body(
                self.devices, "async _preparedTemplateEntityBindings("
            ),
            "_brandLogoRenderFor": _method_body(
                self.brand_logo, "async _brandLogoRenderFor("
            ),
        }
        for owner, body in bodies.items():
            for other in gated:
                if other == owner:
                    continue
                self.assertNotIn(
                    f"this.{other}(",
                    body,
                    f"{owner} takes the gate and then calls {other}, which takes it again",
                )


if __name__ == "__main__":
    unittest.main()
