"""Regression tests for automatic Bluetooth queue recovery."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
PACKAGE = "dratek_queue_test"


def _load_queue_module():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package

    homeassistant = types.ModuleType("homeassistant")
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = object
    helpers = types.ModuleType("homeassistant.helpers")
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = object
    sys.modules.update(
        {
            "homeassistant": homeassistant,
            "homeassistant.core": core,
            "homeassistant.helpers": helpers,
            "homeassistant.helpers.storage": storage,
        }
    )

    const = types.ModuleType(f"{PACKAGE}.const")
    const.DOMAIN = "dratek_eink"
    sys.modules[const.__name__] = const

    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.queue", COMPONENT / "queue.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


queue_module = _load_queue_module()


class TransferQueueRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_automatic_update_retries_after_connection_slot_error(self):
        queue = queue_module.TransferQueue(object())
        queue_module.AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS = 0
        job = {"operation": "entity_update", "status": "writing"}
        attempts = 0
        log: list[str] = []

        async def runner(add_log):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError(
                    "No backend with an available connection slot that can reach address "
                    "FF:FF:92:81:46:32 was found"
                )
            add_log("Transfer completed.")
            return {"ok": True}

        result = await queue._run_with_automatic_bluetooth_retry(job, runner, log.append)

        self.assertTrue(result["ok"])
        self.assertEqual(attempts, 2)
        self.assertEqual(job["status"], "writing")
        self.assertTrue(any("temporarily unavailable" in line for line in log))

    async def test_manual_update_does_not_receive_automatic_retry(self):
        queue = queue_module.TransferQueue(object())
        job = {"operation": "design", "status": "writing"}
        attempts = 0

        async def runner(_add_log):
            nonlocal attempts
            attempts += 1
            raise RuntimeError("No backend with an available connection slot was found")

        with self.assertRaises(RuntimeError):
            await queue._run_with_automatic_bluetooth_retry(job, runner, lambda _line: None)

        self.assertEqual(attempts, 1)


if __name__ == "__main__":
    unittest.main()
