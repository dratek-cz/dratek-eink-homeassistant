"""The three diagnostic blocks must stay wired to the state they report.

sensor.py exists so a stalled automatic write can be placed in one of three
stages (rozhraní / automatické zápisy / přenos) without exporting a queue
log. That is only true while each block's sensors actually read the live
bookkeeping the other modules keep - these tests pin the contract between
them, since a real HA instance is not available here to instantiate entities.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"


class DiagnosticBlockWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.sensor_source = (COMPONENT / "sensor.py").read_text(encoding="utf-8")
        self.automation_source = (COMPONENT / "automation.py").read_text(encoding="utf-8")
        self.queue_source = (COMPONENT / "queue.py").read_text(encoding="utf-8")

    def test_sensor_platform_is_registered(self) -> None:
        init_source = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        self.assertIn("Platform.SENSOR", init_source)

    def test_three_distinct_blocks_become_three_devices(self) -> None:
        # One device per block is the whole point: the integration page has to
        # list them separately, which only happens with distinct identifiers.
        self.assertIn('BLOCK_UI = "ui"', self.sensor_source)
        self.assertIn('BLOCK_SCHEDULER = "scheduler"', self.sensor_source)
        self.assertIn('BLOCK_TRANSFER = "transfer"', self.sensor_source)
        self.assertIn('f"{entry_id}_{self.block}"', self.sensor_source)

    def test_every_sensor_belongs_to_a_known_block(self) -> None:
        tree = ast.parse(self.sensor_source)
        known = {"BLOCK_UI", "BLOCK_SCHEDULER", "BLOCK_TRANSFER"}
        sensor_classes = [
            node for node in tree.body
            if isinstance(node, ast.ClassDef) and node.name.endswith("Sensor")
            and not node.name.startswith("_")
        ]
        self.assertGreaterEqual(len(sensor_classes), 6)
        for klass in sensor_classes:
            blocks = [
                statement.value.id
                for statement in klass.body
                if isinstance(statement, ast.Assign)
                and any(getattr(t, "id", "") == "block" for t in statement.targets)
                and isinstance(statement.value, ast.Name)
            ]
            self.assertEqual(len(blocks), 1, f"{klass.name} must declare exactly one block")
            self.assertIn(blocks[0], known, f"{klass.name} declares an unknown block")

    def test_scheduler_records_every_stage_the_sensors_read(self) -> None:
        # Each key the scheduler sensors look up must actually be written by
        # automation.py, or that sensor silently reports "zatím neproběhlo"
        # forever - which would look exactly like the stall it exists to find.
        recorded = set()
        for node in ast.walk(ast.parse(self.automation_source)):
            if (
                isinstance(node, ast.Call)
                and getattr(node.func, "attr", "") == "_publish_diagnostic_state"
                and node.args
                and isinstance(node.args[0], ast.Constant)
            ):
                recorded.add(node.args[0].value)

        for key in ("heartbeat", "last_schedule", "last_refresh"):
            self.assertIn(key, recorded, f"automation.py never records the '{key}' stage")
            self.assertIn(f'"{key}"', self.sensor_source, f"no sensor reads the '{key}' stage")

    def test_scheduler_exposes_its_overview_to_the_sensors(self) -> None:
        self.assertIn("def scheduler_overview(", self.automation_source)
        self.assertIn("def diagnostics(", self.automation_source)
        self.assertIn("scheduler_overview()", self.sensor_source)
        self.assertIn("diagnostics", self.sensor_source)

    def test_queue_records_the_last_transfer_for_its_block(self) -> None:
        self.assertIn("self.last_transfer_diagnostic = {", self.queue_source)
        self.assertIn("last_transfer_diagnostic", self.sensor_source)

    def test_diagnostics_never_break_the_caller(self) -> None:
        # A diagnostic must never be able to take down the very refresh it is
        # reporting on, so the recorder stays free of anything that can raise
        # on a half-built manager (tests build one via __new__).
        self.assertIn('self.__dict__.setdefault("_diagnostics", {})', self.automation_source)


if __name__ == "__main__":
    unittest.main()
