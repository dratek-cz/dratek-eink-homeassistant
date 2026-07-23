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
TRANSFER_JOB_TIMEOUT_SECONDS = 240
LEGACY_COMPLETION_TIMEOUT_MARKER = "waiting for the display to confirm the completed refresh"

TransferRunner = Callable[[Callable[[str], None]], Awaitable[dict[str, Any]]]


class TransferQueue:
    """Serialize transfers per Bluetooth transport and retain recent results."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._jobs: list[dict[str, Any]] = []
        self._locks: dict[str, asyncio.Lock] = {}
        self._device_locks: dict[str, asyncio.Lock] = {}
        self._manual_pending: dict[str, int] = {}
        self._automatic_tasks: dict[str, tuple[str, asyncio.Task[Any]]] = {}
        self._preempted_jobs: set[str] = set()
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
            repaired_history = False
            self._jobs = []
            for stored_job in jobs:
                if not isinstance(stored_job, dict):
                    continue
                job = dict(stored_job)
                if (
                    job.get("status") == "failed"
                    and LEGACY_COMPLETION_TIMEOUT_MARKER in str(job.get("error") or "").lower()
                ):
                    job["status"] = "succeeded"
                    job["error"] = ""
                    job["log"] = [
                        *list(job.get("log") or []),
                        "The complete payload was sent; missing final confirmation was treated as accepted.",
                    ][-80:]
                    repaired_history = True
                self._jobs.append(job)
            self._jobs = self._jobs[-HISTORY_LIMIT:]
            self._loaded = True
            if repaired_history:
                await self._save_history()

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
        normalized_address = address.upper()
        job = {
            "id": uuid.uuid4().hex[:12],
            "resource": resource,
            "transport_type": transport_type,
            "transport_name": transport_name,
            "address": normalized_address,
            "operation": operation,
            "status": "queued",
            "created_at": int(time.time()),
            "started_at": None,
            "finished_at": None,
            "error": "",
            "log": [],
        }
        manual = operation != "entity_update"
        if not manual:
            skip_reason = self._automatic_skip_reason(normalized_address)
            if skip_reason:
                self._jobs.append(job)
                self._prune()
                return await self._skip_automatic_update(job, skip_reason)

        self._jobs.append(job)
        self._prune()
        if manual:
            self._manual_pending[normalized_address] = self._manual_pending.get(normalized_address, 0) + 1
            self._preempt_automatic_update(normalized_address)
        else:
            current_task = asyncio.current_task()
            if current_task is not None:
                self._automatic_tasks[normalized_address] = (job["id"], current_task)
        try:
            return await self._run(job, runner)
        except asyncio.CancelledError:
            if not manual and job["id"] in self._preempted_jobs:
                return await self._skip_automatic_update(
                    job,
                    "Automatic update cancelled because a manual upload took priority.",
                )
            raise
        finally:
            if manual:
                pending = self._manual_pending.get(normalized_address, 1) - 1
                if pending > 0:
                    self._manual_pending[normalized_address] = pending
                else:
                    self._manual_pending.pop(normalized_address, None)
            else:
                active = self._automatic_tasks.get(normalized_address)
                if active and active[0] == job["id"]:
                    self._automatic_tasks.pop(normalized_address, None)
                self._preempted_jobs.discard(job["id"])

    def _preempt_automatic_update(self, address: str) -> None:
        active = self._automatic_tasks.get(address)
        if not active:
            return
        job_id, task = active
        if task.done():
            return
        self._preempted_jobs.add(job_id)
        task.cancel()

    async def _run(self, job: dict[str, Any], runner: TransferRunner) -> dict[str, Any]:
        resource_lock = self._locks.setdefault(job["resource"], asyncio.Lock())
        device_lock = self._device_locks.setdefault(job["address"], asyncio.Lock())
        async with device_lock:
            if self._should_skip_automatic_update(job):
                return await self._skip_automatic_update(job)
            async with resource_lock:
                if self._should_skip_automatic_update(job):
                    return await self._skip_automatic_update(job)
                return await self._execute(job, runner)

    async def _execute(self, job: dict[str, Any], runner: TransferRunner) -> dict[str, Any]:
        job["status"] = "writing"
        job["started_at"] = int(time.time())

        def add_log(message: str) -> None:
            job["log"].append(str(message))
            job["log"] = job["log"][-80:]

        try:
            async with asyncio.timeout(TRANSFER_JOB_TIMEOUT_SECONDS):
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
            error = str(exc) or f"Transfer exceeded the {TRANSFER_JOB_TIMEOUT_SECONDS}s safety timeout."
            add_log(f"Transfer failed: {error}")
            job["status"] = "failed"
            job["error"] = error
            result = {"ok": False, "address": job["address"], "error": error, "log": list(job["log"])}

        job["finished_at"] = int(time.time())
        result["queue_job_id"] = job["id"]
        result["queue_status"] = job["status"]
        self._prune()
        await self._save_history()
        return result

    def _should_skip_automatic_update(self, job: dict[str, Any]) -> bool:
        return job.get("operation") == "entity_update" and bool(
            self._automatic_skip_reason(job["address"], exclude_job_id=job.get("id"))
        )

    def _automatic_skip_reason(self, address: str, exclude_job_id: str | None = None) -> str:
        if self._manual_pending.get(address, 0) > 0:
            return "Automatic update skipped because a manual upload is pending."
        if any(
            job.get("id") != exclude_job_id
            and job.get("address") == address
            and job.get("status") in {"queued", "writing"}
            for job in self._jobs
        ):
            return "Automatic update merged because this display already has an active transfer."
        return ""

    async def _skip_automatic_update(self, job: dict[str, Any], message: str | None = None) -> dict[str, Any]:
        now = int(time.time())
        message = message or self._automatic_skip_reason(job["address"], exclude_job_id=job.get("id"))
        message = message or "Automatic update skipped because a newer transfer takes priority."
        job["status"] = "skipped"
        job["started_at"] = now
        job["finished_at"] = now
        job["log"] = [message]
        result = {
            "ok": True,
            "skipped": True,
            "address": job["address"],
            "log": list(job["log"]),
            "queue_job_id": job["id"],
            "queue_status": job["status"],
        }
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
            "skipped": sum(job.get("status") == "skipped" for job in jobs),
        }


def get_transfer_queue(hass: HomeAssistant) -> TransferQueue:
    domain_data = hass.data.setdefault(DOMAIN, {})
    queue = domain_data.get(QUEUE_DATA_KEY)
    if queue is None:
        queue = TransferQueue(hass)
        domain_data[QUEUE_DATA_KEY] = queue
    return queue
