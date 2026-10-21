"""Opening a catalog template must not carry the previous template's elements.

Reported from a customer's display: open "Vlastní šablona" (label, clock, gauge)
and then the "Vlastní obrázek" tile, and the picture came out with the custom
template's elements painted on top of it - in the preview and in what was sent
to the display.

_applyTemplate only knows the legacy designer templates. For every other
catalog tile (the picture template among them) it returned before touching the
editor state, so the elements of the template that had just been open stayed
loaded, were drawn over the new one and were then stored under its id.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "custom_components" / "dratek_eink" / "frontend" / "panel"

_NODE_SCRIPT = """
import { templatesMixin } from %(templates)s;
import { devicesMixin } from %(devices)s;
const label = { id: "el-1", type: "text", text: "Popisek" };
const panel = {
  ...templatesMixin,
  _restoreTemplateEditorState: devicesMixin._restoreTemplateEditorState,
  _rememberActiveTemplateEditorState: devicesMixin._rememberActiveTemplateEditorState,
  _normalizeTemplateEditorElement: (item) => item,
  _templateDefinitions: () => [{ id: "weather", title: "Pocasi", objects: [] }],
  _templateEditorStates: {},
  _templateEditorElements: [label],
  _templateElementAdjustments: { "el-1": { x: 3 } },
  _selectedDisplayTemplateId: "custom_image",
  _objects: [],
  _render() {}, _paint() {}, _scheduleDraftSave() { this.saved = true; },
};
panel._applyTemplate("custom_image", true);
const afterPicture = [panel._templateEditorElements.length, Object.keys(panel._templateElementAdjustments).length];
panel._templateEditorStates.custom_image = { editor_elements: [{ id: "own", type: "text" }] };
panel._applyTemplate("custom_image", true);
console.log(JSON.stringify({
  afterPicture,
  restoredOwn: panel._templateEditorElements.map((item) => item.id),
  saved: panel.saved === true,
}));
"""


@unittest.skipUnless(shutil.which("node"), "node is required")
class TemplateSwitchKeepsElementsApartTests(unittest.TestCase):
    def test_catalog_template_drops_the_previous_templates_elements(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "run.mjs"
            script.write_text(
                _NODE_SCRIPT % {
                    "templates": json.dumps((PANEL / "panel-templates.mixin.js").as_uri()),
                    "devices": json.dumps((PANEL / "panel-devices.mixin.js").as_uri()),
                },
                encoding="utf-8",
            )
            out = subprocess.run(
                ["node", str(script)], capture_output=True, text=True, check=True, timeout=30
            ).stdout
        result = json.loads(out.strip().splitlines()[-1])
        self.assertEqual([0, 0], result["afterPicture"])
        # A template's own saved elements still come back when it is reopened.
        self.assertEqual(["own"], result["restoredOwn"])
        self.assertTrue(result["saved"])


if __name__ == "__main__":
    unittest.main()
