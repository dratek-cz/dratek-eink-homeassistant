from __future__ import annotations

import asyncio
from datetime import datetime
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, PANEL_VERSION
from .radio import async_radio_slot
from .routing import route_preference_key, route_rssi

_LOGGER = logging.getLogger(__name__)

QUEUE_STORE_KEY = "dratek_eink.transfer_queue"
QUEUE_STORE_VERSION = 1
QUEUE_DATA_KEY = "transfer_queue"
HISTORY_LIMIT = 100
# A checkpoint failure deliberately retries with a fully confirmed stream.
# Large 400x300 panels can need more than four minutes on slow BlueZ adapters,
# so the outer safety net must cover that reliable fallback as well.
TRANSFER_JOB_TIMEOUT_SECONDS = 600
AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS = 20
OFFLINE_BACKOFF_SECONDS = 60  # 60s backoff for unreachable/failed displays
# A gateway that just failed on its own account is deprioritised for this long
# when another gateway also hears the display. Longer than the display backoff
# because an out-of-heap ESP32 needs more than one cycle to recover.
GATEWAY_BACKOFF_SECONDS = 180
LEGACY_COMPLETION_TIMEOUT_MARKER = "waiting for the display to confirm the completed refresh"
RETRYABLE_BLUETOOTH_ERROR_MARKERS = (
    "available connection slot",
    "no backend with an available",
    "temporarily unavailable",
    "le-connection-abort",
)

TransferRunner = Callable[[Callable[[str], None]], Awaitable[dict[str, Any]]]
GatewayRunnerFactory = Callable[[dict[str, Any]], TransferRunner]
GATEWAY_FALLBACK_MIN_RSSI_DBM = -80.0


def gateway_resource(route: dict[str, Any]) -> str:
    """The queue resource one gateway route has to serialise on.

    Keyed by the endpoint the transfer is actually sent to, not by the id of the
    stored record naming it. Two records can point at one ESP32 - a gateway
    added by hand and the same box later found over mDNS, or one that took over
    another's address at a DHCP renewal - and keying by id gave each of them its
    own lock. The queue then ran two transfers at once against a single radio,
    which is exactly the "Connection reset by peer", exhausted-heap and failed
    BLE-connect pattern a queue log shows in that state.

    A module function rather than a method, because the pinned-gateway paths in
    ws_sending.py, ws_gateways.py and automation.py all have to derive the same
    key and none of them should be reaching into the queue to do it.

    Falls back to the id when a caller supplies no endpoint, so a route from
    somewhere that does not know the host still serialises against itself.
    """
    endpoint = str(route.get("endpoint") or route.get("host") or "").strip().lower()
    if endpoint:
        return f"gateway@{endpoint}"
    return f"gateway:{str(route.get('id') or '')}"


class TransferQueue:
    """Serialize transfers per Bluetooth transport and retain recent results."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = None
        self._jobs: list[dict[str, Any]] = []
        self._locks: dict[str, asyncio.Lock] = {}
        self._device_locks: dict[str, asyncio.Lock] = {}
        self._manual_pending: dict[str, int] = {}
        self._automatic_tasks: dict[str, tuple[str, asyncio.Task[Any]]] = {}
        self._background_tasks: set[asyncio.Task[Any]] = set()
        self._job_tasks: dict[str, asyncio.Task[Any]] = {}
        self._preempted_jobs: set[str] = set()
        self._last_finish_at: dict[str, float] = {}
        self._last_failure_at: dict[str, float] = {}
        # Keyed by resource ("gateway:<id>"), not by display: a gateway that
        # cannot start transfers is a property of that gateway, and every
        # display it serves would otherwise be punished for it individually.
        self._gateway_failure_at: dict[str, float] = {}
        self._load_lock = asyncio.Lock()

        self._save_lock = asyncio.Lock()
        self._loaded = False
        # Last finished job's outcome, surfaced by sensor.py's transfer device.
        self.last_transfer_diagnostic: dict[str, Any] | None = None

    def _history_store(self) -> Store:
        if self._store is None:
            self._store = Store(self.hass, QUEUE_STORE_VERSION, QUEUE_STORE_KEY)
        return self._store

    async def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        async with self._load_lock:
            if self._loaded:
                return
            data = await self._history_store().async_load()
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
        wait_for_completion: bool = True,
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
        if manual:
            self._last_failure_at.pop(normalized_address, None)
        else:
            skip_reason = self._automatic_skip_reason(
                normalized_address, transport_type=transport_type
            )
            if skip_reason:
                self._jobs.append(job)
                self._prune()
                return await self._skip_automatic_update(job, skip_reason)

        self._jobs.append(job)
        self._prune()
        if manual:
            self._manual_pending[normalized_address] = self._manual_pending.get(normalized_address, 0) + 1
            self._discard_automatic_updates(normalized_address)
        else:
            current_task = asyncio.current_task()
            if current_task is not None:
                self._automatic_tasks[normalized_address] = (job["id"], current_task)
        async def process_job() -> dict[str, Any]:
            try:
                return await self._run(job, runner)
            except asyncio.CancelledError:
                if not manual and job["id"] in self._preempted_jobs:
                    return await self._skip_automatic_update(
                        job,
                        "Automatic update cancelled because a manual upload took priority.",
                    )
                if job.get("status") == "queued":
                    # Nothing physical happened yet (_execute never ran), so a
                    # user-initiated cancel (async_cancel_job) can finish this
                    # job cleanly instead of leaving it stuck as "queued"
                    # forever. A job already "writing" never reaches here -
                    # async_cancel_job refuses those, matching the same rule
                    # _preempt_automatic_update follows for the same reason.
                    return await self._skip_automatic_update(
                        job,
                        "Transfer cancelled by user before it started.",
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

        if wait_for_completion:
            return await process_job()

        task = self.hass.async_create_task(
            process_job(),
            f"{DOMAIN} transfer {job['id']}",
        )
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        self._job_tasks[job["id"]] = task
        task.add_done_callback(lambda _task, job_id=job["id"]: self._job_tasks.pop(job_id, None))
        return {
            "ok": True,
            "queued": True,
            "address": normalized_address,
            "log": ["Transfer added to queue."],
            "queue_job_id": job["id"],
            "queue_status": "queued",
        }

    async def async_submit_gateway_routes(
        self,
        *,
        routes: list[dict[str, Any]],
        address: str,
        operation: str,
        runner_factory: GatewayRunnerFactory,
        wait_for_completion: bool = True,
    ) -> dict[str, Any]:
        """Choose a gateway atomically and submit one transfer through it.

        The strongest observed route is preferred.  If it already has a queued
        or writing job, the strongest free alternative is used only while its
        RSSI is still acceptable.  Otherwise the job deliberately queues on the
        strongest gateway instead of risking a weak, unreliable connection.

        There is no suspension point between choosing a route and appending its
        job in ``async_submit`` (``_ensure_loaded`` is already satisfied), so two
        concurrent websocket requests cannot both mistake the same gateway for
        free before either reservation becomes visible.
        """
        await self._ensure_loaded()
        route = self._select_gateway_route(routes)
        if route is None:
            return {
                "ok": False,
                "address": address.upper(),
                "error": "No gateway currently receives this display.",
                "log": [],
            }
        gateway_name = str(
            route.get("name") or route.get("host") or "DRATEK eInk gateway"
        )
        return await self.async_submit(
            resource=gateway_resource(route),
            transport_type="gateway",
            transport_name=gateway_name,
            address=address,
            operation=operation,
            runner=runner_factory(route),
            wait_for_completion=wait_for_completion,
        )

    def _select_gateway_route(
        self, routes: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        """Return strongest free acceptable route, or queue on the strongest."""
        ranked = sorted(
            (route for route in routes if str(route.get("id") or "")),
            # routing.route_preference_key is the single definition of this
            # order, shared with the scheduler and the connection map so all
            # three name the same gateway.
            key=route_preference_key,
            reverse=True,
        )
        if not ranked:
            return None
        # Two passes: a gateway that just failed on its own account is only
        # considered once every healthy alternative has been ruled out. Pure
        # ordering - a lone gateway in backoff is still used, because skipping
        # it entirely would strand a display that nothing else can hear.
        for allow_backed_off in (False, True):
            for route in ranked:
                if self._route_rssi(route) < GATEWAY_FALLBACK_MIN_RSSI_DBM:
                    continue
                resource = gateway_resource(route)
                if not allow_backed_off and self._is_gateway_backing_off(resource):
                    continue
                if not any(
                    job.get("resource") == resource and self._is_active_job(job)
                    for job in self._jobs
                ):
                    return route
        return ranked[0]

    def _is_gateway_backing_off(self, resource: str) -> bool:
        """True while a gateway is still recovering from its own failure."""
        failed_at = self._gateway_failure_at.get(resource)
        if failed_at is None:
            return False
        if time.monotonic() - failed_at < GATEWAY_BACKOFF_SECONDS:
            return True
        self._gateway_failure_at.pop(resource, None)
        return False

    @staticmethod
    def _route_rssi(route: dict[str, Any]) -> float:
        return route_rssi(route)

    def _preempt_automatic_update(self, address: str) -> None:
        active = self._automatic_tasks.get(address)
        if not active:
            return
        job_id, task = active
        if task.done():
            return
        self._preempted_jobs.add(job_id)
        job = next((j for j in self._jobs if j.get("id") == job_id), None)
        if job and job.get("status") == "writing":
            # An active physical BLE/gateway transfer is mid-flight.
            # Abrupt task cancellation cuts the connection mid-block, leaving
            # the e-ink display controller frozen in RECEIVE state.
            # Mark it so no new retry attempt starts, but let the active attempt
            # finish cleanly so the BLE slot is freed.
            return
        task.cancel()

    def _discard_automatic_updates(self, address: str) -> None:
        """Remove every pending automatic job when a manual upload takes priority."""
        for job in list(self._jobs):
            if (
                job.get("address") != address
                or job.get("operation") != "entity_update"
                or not self._is_active_job(job)
            ):
                continue
            job_id = str(job.get("id") or "")
            self._preempted_jobs.add(job_id)
            # Never tear down a physical transfer in the middle of a block. It
            # may finish, but the queued manual job owns the display next and
            # _manual_pending prevents any replacement automatic job.
            if job.get("status") == "writing":
                continue
            task = self._job_tasks.get(job_id)
            if task is not None and not task.done():
                task.cancel()
        # Covers a wait-for-completion automatic task, which is not registered
        # in _job_tasks.
        self._preempt_automatic_update(address)


    async def _run(self, job: dict[str, Any], runner: TransferRunner) -> dict[str, Any]:
        device_lock = self._device_locks.setdefault(job["address"], asyncio.Lock())
        async with device_lock:
            if self._should_skip_automatic_update(job):
                return await self._skip_automatic_update(job)
            return await self._execute(job, runner)

    async def _execute(self, job: dict[str, Any], runner: TransferRunner) -> dict[str, Any]:
        job["started_at"] = int(time.time())
        # Set only from a result that explicitly says the gateway - not the
        # display - is what failed. An exception escaping the runner is left
        # False: that is the local Bluetooth path, where the display is the
        # only thing that can have gone wrong.
        gateway_side_failure = False

        def add_log(message: str) -> None:
            job["log"].append(str(message))
            job["log"] = job["log"][-80:]
            _LOGGER.warning("[%s] %s", job["address"], message)

        resource_lock = self._locks.setdefault(job["resource"], asyncio.Lock())
        skipped: dict[str, Any] | None = None

        async def run_attempt(log_line: Callable[[str], None]) -> dict[str, Any]:
            """Hold the transport lock, then the radio, for one attempt only.

            An automatic retry waits out a Bluetooth cooldown between attempts. If
            that wait happened while the transport lock was held, every other
            other; see radio.py for why that matters even though the two paths
            are otherwise independent.
            """
            nonlocal skipped
            async with resource_lock:
                job["status"] = "writing"
                if self._should_skip_automatic_update(job):
                    skipped = await self._skip_automatic_update(job)
                    return skipped
                # Each ESP32 gateway owns its own BLE adapter and its resource
                # lock already guarantees one display per gateway.  Only the
                # local Home Assistant adapter needs the process-wide radio
                # slot; serialising independent gateways here prevented the
                # parallel transfers the gateway pool is meant to provide.
                if job.get("transport_type") == "gateway":
                    return await runner(log_line)
                async with async_radio_slot(self.hass):
                    return await runner(log_line)

        normalized_address = job["address"].upper()
        last_finish = self._last_finish_at.get(normalized_address)
        if last_finish is not None:
            cooldown = 15.0 if int(job.get("sdk_type") or 0) in {75, 264, 267, 270} or int(job.get("payload_size") or 0) >= 20000 else 6.0
            elapsed = time.monotonic() - last_finish
            wait_time = cooldown - elapsed
            if wait_time > 0:
                add_log(f"Waiting {wait_time:.1f}s for physical e-ink screen refresh to complete...")
                await asyncio.sleep(wait_time)

        try:
            async with asyncio.timeout(TRANSFER_JOB_TIMEOUT_SECONDS):
                result = await self._run_with_automatic_bluetooth_retry(job, run_attempt, add_log)
            if skipped is not None:
                # _skip_automatic_update already finalised the job and saved it.
                return skipped
            for line in result.get("log", []):
                if line not in job["log"]:
                    add_log(line)
            if result.get("ok") is False:
                job["status"] = "failed"
                job["error"] = str(result.get("error") or "Prenos selhal.")
                gateway_side_failure = bool(result.get("gateway_side"))
            else:
                job["status"] = "succeeded"
        except asyncio.CancelledError:
            # CancelledError derives from BaseException, not Exception, so it
            # used to sail straight past the handler below with the job still
            # marked "writing". _prune keeps every "queued"/"writing" job
            # forever, and _automatic_skip_reason treats any of them as an
            # active transfer for that display - so one cancelled job merged
            # away every automatic update for that address for the rest of the
            # session. That is what made automatic updates fire exactly once
            # and then go quiet: async_set_config cancels the refresh task on
            # every manual upload, which is the common way to hit this.
            #
            # Finalised synchronously and without awaiting the history write:
            # this task is already cancelled, and another await here can be
            # interrupted again before the status is corrected. The next job to
            # finish persists it, and what actually matters - that this display
            # no longer looks busy - is in memory immediately.
            add_log("Transfer cancelled.")
            job["status"] = "failed"
            job["error"] = "Transfer cancelled."
            job["finished_at"] = int(time.time())
            self._prune()
            raise
        except Exception as exc:  # BLE and network stacks expose platform errors
            if isinstance(exc, TimeoutError):
                last_step = next(
                    (line for line in reversed(job["log"]) if not line.startswith("Transfer failed:")),
                    "no transfer progress was recorded",
                )
                error = (
                    f"Transfer exceeded the {TRANSFER_JOB_TIMEOUT_SECONDS}s safety timeout. "
                    f"Last step: {last_step}"
                )
            else:
                error = str(exc).strip()
            if not error:
                error = (
                    f"{type(exc).__name__}: Bluetooth transfer failed without "
                    "a platform error message."
                )
            add_log(f"Transfer failed: {error}")
            job["status"] = "failed"
            job["error"] = error
            result = {"ok": False, "address": job["address"], "error": error, "log": list(job["log"])}
        finally:
            # The cooldown this stamps exists to wait out a physical e-ink
            # refresh ("Waiting Ns for physical e-ink screen refresh to
            # complete" above). A skipped job never wrote anything, so arming
            # it there made the next real transfer sit out six to fifteen
            # seconds for a refresh that never happened.
            if job.get("status") != "skipped":
                self._last_finish_at[normalized_address] = time.monotonic()
            if job.get("status") == "failed" and job.get("error") != "Transfer cancelled.":
                if gateway_side_failure:
                    # The gateway ran out of heap, restarted, or dropped the
                    # upload - the display was never contacted and is very
                    # probably fine. Marking it unreachable here armed the
                    # offline backoff, which then skipped the Home Assistant
                    # Bluetooth fallback that automation.py submits straight
                    # afterwards, so one sick gateway silently stopped every
                    # write to every display it served. Back off the gateway
                    # instead.
                    self._gateway_failure_at[str(job.get("resource") or "")] = time.monotonic()
                else:
                    self._last_failure_at[normalized_address] = time.monotonic()
            elif job.get("status") == "succeeded":
                self._last_failure_at.pop(normalized_address, None)
                self._gateway_failure_at.pop(str(job.get("resource") or ""), None)

        job["finished_at"] = int(time.time())
        result["queue_job_id"] = job["id"]
        result["queue_status"] = job["status"]
        self._prune()
        await self._save_history()
        # Live visibility into the transfer block specifically, separate from
        # the scheduler-side diagnostics in automation.py - lets "the schedule
        # fired but nothing reached the display" and "nothing ever got
        # scheduled at all" be told apart at a glance instead of only from a
        # queue-log export after the fact. Read by sensor.py's "Přenos do
        # zařízení" device.
        self.last_transfer_diagnostic = {
            "finished_at": datetime.fromtimestamp(job["finished_at"]).isoformat(),
            "address": job.get("address"),
            "status": job.get("status"),
            "operation": job.get("operation"),
            "transport_name": job.get("transport_name"),
            "error": job.get("error") or "",
        }
        return result


    async def _run_with_automatic_bluetooth_retry(
        self,
        job: dict[str, Any],
        runner: TransferRunner,
        add_log: Callable[[str], None],
    ) -> dict[str, Any]:
        """Give automatic BLE updates one cooldown retry before failing the job."""
        try:
            return await runner(add_log)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if not self._is_retryable_automatic_bluetooth_error(job, exc):
                raise

            add_log(
                "Bluetooth connection slot is temporarily unavailable. "
                f"Automatic update will retry in {AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS} seconds."
            )
            job["status"] = "queued"
            await asyncio.sleep(AUTOMATIC_BLUETOOTH_RETRY_DELAY_SECONDS)
            job["status"] = "writing"
            add_log("Retrying automatic update after the Bluetooth cooldown.")
            return await runner(add_log)

    @staticmethod
    def _is_retryable_automatic_bluetooth_error(job: dict[str, Any], exc: Exception) -> bool:
        error = str(exc).lower()
        return any(marker in error for marker in RETRYABLE_BLUETOOTH_ERROR_MARKERS)


    def _should_skip_automatic_update(self, job: dict[str, Any]) -> bool:
        return job.get("operation") == "entity_update" and bool(
            self._automatic_skip_reason(
                job["address"],
                exclude_job_id=job.get("id"),
                transport_type=job.get("transport_type"),
            )
        )

    @staticmethod
    def _is_active_job(job: dict[str, Any]) -> bool:
        """True while a job can still be doing something physical.

        A job whose task died without finalising it would otherwise stay
        "active" forever - _prune never drops active jobs - and quietly merge
        away every later automatic update for that display. _execute finalises
        a cancelled job itself now, so this is only the backstop for a runner
        that dies some other way; the job's own timeout is the yardstick, since
        nothing legitimate outlives it.
        """
        if job.get("status") not in {"queued", "writing"}:
            return False
        started = job.get("started_at") or job.get("created_at") or 0
        return time.time() - float(started) <= TRANSFER_JOB_TIMEOUT_SECONDS + 60

    def _is_local_device_in_range(self, address: str) -> bool:
        """Return True if HA's Bluetooth scanner has recently seen this address."""
        if not self.hass:
            return True
        try:
            from homeassistant.components import bluetooth

            ble_device = bluetooth.async_ble_device_from_address(
                self.hass, address, connectable=True
            )
            if ble_device is not None:
                return True
            ble_device = bluetooth.async_ble_device_from_address(
                self.hass, address, connectable=False
            )
            return ble_device is not None
        except Exception:
            return True

    def _automatic_skip_reason(
        self,
        address: str,
        exclude_job_id: str | None = None,
        transport_type: str | None = None,
    ) -> str:
        if self._manual_pending.get(address, 0) > 0:
            return "Automatic update skipped because a manual upload is pending."
        if any(
            job.get("id") != exclude_job_id
            and job.get("address") == address
            and self._is_active_job(job)
            for job in self._jobs
        ):
            return "Automatic update merged because this display already has an active transfer."

        last_failure = self._last_failure_at.get(address)
        if last_failure is not None:
            elapsed = time.monotonic() - last_failure
            if elapsed < OFFLINE_BACKOFF_SECONDS:
                remaining = int(OFFLINE_BACKOFF_SECONDS - elapsed)
                return (
                    f"Automatic update skipped: display is unreachable or failed recently "
                    f"({int(elapsed)}s ago; backing off for {remaining}s)."
                )

        if transport_type != "gateway" and not self._is_local_device_in_range(address):
            return (
                "Automatic update skipped: display is out of Bluetooth range or powered off "
                "(no BLE advertisements detected)."
            )

        return ""

    async def _skip_automatic_update(self, job: dict[str, Any], message: str | None = None) -> dict[str, Any]:
        now = int(time.time())
        message = message or self._automatic_skip_reason(
            job["address"],
            exclude_job_id=job.get("id"),
            transport_type=job.get("transport_type"),
        )
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
        # A job that outlived its own timeout without finalising is counted with
        # the completed ones here, so it ages out of history instead of being
        # kept forever as "active" (see _is_active_job).
        active = [job for job in self._jobs if self._is_active_job(job)]
        completed = [job for job in self._jobs if not self._is_active_job(job)]
        self._jobs = completed[-HISTORY_LIMIT:] + active
        # These dictionaries used to remember every display and gateway ever
        # seen, even after its final history entry had aged out. Keep state only
        # for resources that are still represented by the bounded queue.
        retained_addresses = {
            str(job.get("address") or "").upper() for job in self._jobs
        }
        retained_resources = {
            str(job.get("resource") or "") for job in self._jobs
        }
        self._device_locks = {
            key: lock for key, lock in self._device_locks.items()
            if key in retained_addresses or lock.locked()
        }
        self._locks = {
            key: lock for key, lock in self._locks.items()
            if key in retained_resources or lock.locked()
        }
        self._last_finish_at = {
            key: value for key, value in self._last_finish_at.items()
            if key in retained_addresses
        }
        self._last_failure_at = {
            key: value for key, value in self._last_failure_at.items()
            if key in retained_addresses
        }
        self._gateway_failure_at = {
            key: value for key, value in self._gateway_failure_at.items()
            if key in retained_resources
        }

    async def _save_history(self) -> None:
        async with self._save_lock:
            completed = [job for job in self._jobs if job.get("status") not in {"queued", "writing"}]
            await self._history_store().async_save(
                {"jobs": completed[-HISTORY_LIMIT:]}
            )

    def async_cancel_job(self, job_id: str) -> bool:
        """Cancel a job that has not started writing yet.

        Only "queued" jobs are eligible - the same rule _preempt_automatic_update
        follows: once _execute has flipped a job to "writing", a physical
        BLE/gateway transfer may be mid-block, and abruptly cancelling it would
        leave the display's controller frozen instead of just failing cleanly.
        Cancelling here just interrupts a job still waiting for its device/
        transport lock, which is always safe - nothing has been sent yet.
        """
        job = next((j for j in self._jobs if j.get("id") == job_id), None)
        if job is None or job.get("status") != "queued":
            return False
        task = self._job_tasks.get(job_id)
        if task is None or task.done():
            return False
        task.cancel()
        return True

    async def async_clear_completed(self) -> None:
        await self._ensure_loaded()
        self._jobs = [job for job in self._jobs if job.get("status") in {"queued", "writing"}]
        await self._save_history()

    async def async_snapshot(self) -> dict[str, Any]:
        await self._ensure_loaded()
        jobs = sorted(self._jobs, key=lambda job: job.get("created_at", 0), reverse=True)
        skipped_jobs = [job for job in jobs if job.get("status") == "skipped"]
        skipped_reasons = list({job["log"][0] for job in skipped_jobs if job.get("log")})
        skipped_devices = list({job.get("address", "") for job in skipped_jobs if job.get("address")})
        return {
            "backend_version": PANEL_VERSION,
            "jobs": jobs,
            "queued": sum(job.get("status") == "queued" for job in jobs),
            "writing": sum(job.get("status") == "writing" for job in jobs),
            "succeeded": sum(job.get("status") == "succeeded" for job in jobs),
            "failed": sum(job.get("status") == "failed" for job in jobs),
            "skipped": len(skipped_jobs),
            "skipped_reasons": skipped_reasons,
            "skipped_devices": skipped_devices,
        }


def get_transfer_queue(hass: HomeAssistant) -> TransferQueue:
    domain_data = hass.data.setdefault(DOMAIN, {})
    queue = domain_data.get(QUEUE_DATA_KEY)
    if queue is None:
        queue = TransferQueue(hass)
        domain_data[QUEUE_DATA_KEY] = queue
    return queue
