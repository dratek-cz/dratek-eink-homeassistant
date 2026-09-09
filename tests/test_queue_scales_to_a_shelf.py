"""What a hundred displays in one queue costs, and what it must not cost.

Measured against a real export from a 101-display run: 2811 log lines across
the jobs, up to 70 on a single one, about 140 kB of JSON for one snapshot.

Two things were paying that repeatedly rather than once.

The panel polls the queue every second from whichever tab it is on, and the
snapshot carried every log line of every job - to tabs that cannot draw a log.
And every job that finished rewrote the entire history file, which is that same
140 kB, so one shelf-wide send meant a hundred full serialise-and-write cycles,
each larger than the one before it.

Neither is a correctness bug, which is exactly why neither showed up in any
other test. They are what "badly optimised for a hundred displays" is made of.
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_gateway_failure_isolation import queue_module, _job, _make_queue  # noqa: E402


SHELF = 100
# The busiest job in the reference export carried 70 lines; the queue caps at 80.
LOG_LINES = 70


def _shelf_queue():
    queue = _make_queue()
    for index in range(SHELF):
        job = _job(f"job{index:03}", "gateway@192.168.1.159", "gateway")
        job["status"] = "succeeded"
        job["log"] = [f"Display accepted block {n}/40 ({n * 2}%)." for n in range(LOG_LINES)]
        queue._jobs.append(job)
    return queue


class SnapshotWeightTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_background_poll_does_not_carry_every_log_line(self):
        queue = _shelf_queue()

        full = await queue.async_snapshot()
        lean = await queue.async_snapshot(include_logs=False)

        full_bytes = len(json.dumps(full))
        lean_bytes = len(json.dumps(lean))
        self.assertGreater(full_bytes, 100_000, "the reference payload should be ~140 kB")
        # The whole point: a poll from a tab that cannot draw a log is an order
        # of magnitude cheaper. Anything less than 5x and this is not worth the
        # extra parameter.
        self.assertLess(lean_bytes * 5, full_bytes)

    async def test_the_lean_snapshot_still_says_a_log_exists(self):
        # The queue tab has to be able to show that a job has something to open
        # without the text of it being shipped to every other tab.
        queue = _shelf_queue()

        lean = await queue.async_snapshot(include_logs=False)

        self.assertEqual(lean["jobs"][0]["log"], [])
        self.assertEqual(lean["jobs"][0]["log_lines"], LOG_LINES)

    async def test_stripping_logs_does_not_strip_the_counts_or_skip_reasons(self):
        queue = _shelf_queue()
        skipped = _job("skipped1", "local", "local")
        skipped["status"] = "skipped"
        skipped["log"] = ["Automatic update skipped: display is unreachable."]
        queue._jobs.append(skipped)

        lean = await queue.async_snapshot(include_logs=False)

        self.assertEqual(lean["succeeded"], SHELF)
        self.assertEqual(lean["skipped"], 1)
        # Read off the job's own first log line, so it has to come from the
        # untouched list rather than from the stripped copy.
        self.assertEqual(
            lean["skipped_reasons"],
            ["Automatic update skipped: display is unreachable."],
        )

    async def test_the_snapshot_does_not_hand_out_the_live_job_objects(self):
        # The lean path rebuilds each job; the full path must not start
        # returning copies that a caller could mutate into the real queue.
        queue = _shelf_queue()

        lean = await queue.async_snapshot(include_logs=False)
        lean["jobs"][0]["log"].append("tampered")

        self.assertEqual(len(queue._jobs[-1]["log"]), LOG_LINES)


class HistoryWriteTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_hundred_finished_jobs_do_not_mean_a_hundred_writes(self):
        queue = _shelf_queue()
        writes = 0

        async def counting_save():
            nonlocal writes
            writes += 1

        queue._save_history = counting_save
        # Stand in for a shelf-wide send finishing job after job.
        original = queue_module.HISTORY_SAVE_DEBOUNCE_SECONDS
        queue_module.HISTORY_SAVE_DEBOUNCE_SECONDS = 0.05
        try:
            for _ in range(SHELF):
                queue._save_history_soon()
            await asyncio.sleep(0.2)
        finally:
            queue_module.HISTORY_SAVE_DEBOUNCE_SECONDS = original

        self.assertEqual(
            writes, 1, "a hundred finishing jobs must coalesce into one write"
        )

    async def test_the_next_batch_still_gets_its_own_write(self):
        # Coalescing must not mean the store stops being written at all.
        queue = _shelf_queue()
        writes = 0

        async def counting_save():
            nonlocal writes
            writes += 1

        queue._save_history = counting_save
        original = queue_module.HISTORY_SAVE_DEBOUNCE_SECONDS
        queue_module.HISTORY_SAVE_DEBOUNCE_SECONDS = 0.05
        try:
            queue._save_history_soon()
            await asyncio.sleep(0.2)
            queue._save_history_soon()
            await asyncio.sleep(0.2)
        finally:
            queue_module.HISTORY_SAVE_DEBOUNCE_SECONDS = original

        self.assertEqual(writes, 2)


if __name__ == "__main__":
    unittest.main()
