from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


def _load_component_module(name: str):
    package_name = "dratek_test_component"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__path__ = [str(COMPONENT)]
        sys.modules[package_name] = package
    module_name = f"{package_name}.{name}"
    spec = importlib.util.spec_from_file_location(module_name, COMPONENT / f"{name}.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nelze načíst modul {name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


render = _load_component_module("render")


class RenderWidgetTests(unittest.TestCase):
    def _render_objects(self, objects: list[dict]):
        binding = {
            "w": 296,
            "h": 128,
            "canvas_width": 296,
            "canvas_height": 128,
            "default_symbol": "layer",
            "layers": [{"id": "layer", "objects": objects}],
        }
        return render._render_bound_layer(binding, "layer")

    def test_all_dynamic_widget_types_render(self):
        objects = []
        for index, widget_type in enumerate(
            ("bar_gauge", "pie", "slider", "potentiometer", "gauge")
        ):
            objects.append(
                {
                    "id": widget_type,
                    "type": widget_type,
                    "x": index * 56,
                    "y": 12,
                    "w": 52,
                    "h": 82,
                    "min_value": 0,
                    "max_value": 100,
                    "sample_value": 65,
                    "unit": "%",
                    "color": "red",
                    "fill": "red",
                    "stroke": "black",
                    "show_value": True,
                }
            )
        image = self._render_objects(objects)
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (296, 128))
        self.assertIsNotNone(image.getbbox())

    def test_gauge_arc_modes_produce_different_outputs(self):
        digests = set()
        for arc_mode in ("180", "240", "360"):
            image = self._render_objects(
                [
                    {
                        "id": f"gauge-{arc_mode}",
                        "type": "gauge",
                        "x": 70,
                        "y": 4,
                        "w": 156,
                        "h": 116,
                        "min_value": 0,
                        "max_value": 100,
                        "sample_value": 62,
                        "unit": "%",
                        "color": "black",
                        "stroke_width": 6,
                        "arc_mode": arc_mode,
                        "show_arc": True,
                        "show_needle": True,
                        "show_value": True,
                    }
                ]
            )
            digests.add(hashlib.sha256(image.tobytes()).hexdigest())
        self.assertEqual(len(digests), 3)


if __name__ == "__main__":
    unittest.main()
