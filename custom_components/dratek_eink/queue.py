from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

QUEUE_STORE_KEY = "dratek_eink.transfer_queue"
QUEUE_STORE_VERSION = 1
QUEUE_DATA_KEY = "transfer_queue"
HISTORY_LIMIT = 20

TransferRunner = Callable[[Callable[[str], None]], Awaitable[dict[str, Any]]]


class TransferQueue:
    """Serialize transfers per Bluetooth transport and retain recent results."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._jobs: list[dict[str, Any]] = []
        self._locks: dict[str, asyncio.Lock] = {}
        self._load_lock = asyncio.Lock()
        self._save_lock = asyncio.Lock()
        self._loaded = False

    async def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        async with self._load_lock:
            if self._loaded:
                return
            data = await Store(self.hass, QUEUE_STORE_VERSION, QUEUE_STORE_KEY).async_load()
            jobs = data.get("jobs", []) if isinstance(data, dict) else []
            self._jobs = [job for job in jobs if isinstance(job, dict)][-HISTORY_LIMIT:]
            self._loaded = True

    async def async_submit(
        self,
        *,
        resource: str,
        transport_type: str,
        transport_name: str,
        address: str,
        operation: str,
        runner: TransferRunner,
    ) -> dict[str, Any]:
        await self._ensure_loaded()
        job = {
            "id": uuid.uuid4().hex[:12],
            "resource": resource,
            "transport_type": transport_type,
            "transport_name": transport_name,
            "address": address.upper(),
            "operation": operation,
            "status": "queued",
            "created_at": int(time.time()),
            "started_at": None,
            "finished_at": None,
            "error": "",
            "log": [],
        }
        self._jobs.append(job)
        self._prune()
        return await self._run(job, runner)

    async def _run(self, job: dict[str, Any], runner: TransferRunner) -> dict[str, Any]:
        lock = self._locks.setdefault(job["resource"], asyncio.Lock())
        async with lock:
            job["status"] = "writing"
            job["started_at"] = int(time.time())

            def add_log(message: str) -> None:
                job["log"].append(str(message))
                job["log"] = job["log"][-80:]

            try:
                result = await runner(add_log)
                for line in result.get("log", []):
                    if line not in job["log"]:
                        add_log(line)
                if result.get("ok") is False:
                    job["status"] = "failed"
                    job["error"] = str(result.get("error") or "Prenos selhal.")
                else:
                    job["status"] = "succeeded"
            except Exception as exc:  # noqa: BLE and network stacks expose platform errors
                add_log(f"Transfer failed: {exc}")
                job["status"] = "failed"
                job["error"] = str(exc)
                result = {"ok": False, "address": job["address"], "error": str(exc), "log": list(job["log"])}

            job["finished_at"] = int(time.time())
            result["queue_job_id"] = job["id"]
            result["queue_status"] = job["status"]
            self._prune()
            await self._save_history()
            return result

    def _prune(self) -> None:
        active = [job for job in self._jobs if job.get("status") in {"queued", "writing"}]
        completed = [job for job in self._jobs if job.get("status") not in {"queued", "writing"}]
        self._jobs = completed[-HISTORY_LIMIT:] + active

    async def _save_history(self) -> None:
        async with self._save_lock:
            completed = [job for job in self._jobs if job.get("status") not in {"queued", "writing"}]
            await Store(self.hass, QUEUE_STORE_VERSION, QUEUE_STORE_KEY).async_save(
                {"jobs": completed[-HISTORY_LIMIT:]}
            )

    async def async_snapshot(self) -> dict[str, Any]:
        await self._ensure_loaded()
        jobs = sorted(self._jobs, key=lambda job: job.get("created_at", 0), reverse=True)
        return {
            "jobs": jobs,
            "queued": sum(job.get("status") == "queued" for job in jobs),
            "writing": sum(job.get("status") == "writing" for job in jobs),
            "succeeded": sum(job.get("status") == "succeeded" for job in jobs),
            "failed": sum(job.get("status") == "failed" for job in jobs),
        }


def get_transfer_queue(hass: HomeAssistant) -> TransferQueue:
    domain_data = hass.data.setdefault(DOMAIN, {})
    queue = domain_data.get(QUEUE_DATA_KEY)
    if queue is None:
        queue = TransferQueue(hass)
        domain_data[QUEUE_DATA_KEY] = queue
    return queue
