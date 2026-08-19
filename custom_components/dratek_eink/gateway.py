from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid
from typing import Any
from urllib.parse import quote

from aiohttp import FormData
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from PIL import Image

from . import quicklz
from .const import DOMAIN
from .discovery import resolve_raw_type
from .render import pack_bwr_image, pack_bwr_region

GATEWAY_STORE_KEY = "dratek_eink.gateways"
GATEWAY_STORE_VERSION = 1
DEFAULT_TIMEOUT = 8
DISCOVERY_SERVICE = "_dratek-eink-gateway._tcp.local."
FIRMWARE_DIR = Path(__file__).parent / "firmware"
FLASH_JOBS_KEY = "dratek_eink_flash_jobs"
OTA_JOBS_KEY = "dratek_eink_ota_jobs"
ESPTOOL_FLASH_BAUD = "115200"
FLASH_PROFILES = {
    "esp32": {
        "label": "ESP32 / ESP32-WROOM",
        "chip": "esp32",
        "files": {
            "bootloader": (0x1000, FIRMWARE_DIR / "dratek-eink-gateway-esp32-bootloader.bin"),
            "partitions": (0x8000, FIRMWARE_DIR / "dratek-eink-gateway-esp32-partitions.bin"),
            "app": (0x10000, FIRMWARE_DIR / "dratek-eink-gateway-esp32.bin"),
        },
    },
    "esp32s3": {
        "label": "ESP32-S3",
        "chip": "esp32s3",
        "files": {
            "bootloader": (0x0, FIRMWARE_DIR / "dratek-eink-gateway-esp32s3-bootloader.bin"),
            "partitions": (0x8000, FIRMWARE_DIR / "dratek-eink-gateway-esp32s3-partitions.bin"),
            "app": (0x10000, FIRMWARE_DIR / "dratek-eink-gateway-esp32s3.bin"),
        },
    },
}


def _gateway_store(hass: HomeAssistant) -> Store:
    return Store(hass, GATEWAY_STORE_VERSION, GATEWAY_STORE_KEY)


async def async_load_gateways(hass: HomeAssistant) -> list[dict[str, Any]]:
    data = await _gateway_store(hass).async_load()
    if not isinstance(data, dict):
        return []
    gateways = data.get("gateways", [])
    return gateways if isinstance(gateways, list) else []


async def async_save_gateways(hass: HomeAssistant, gateways: list[dict[str, Any]]) -> None:
    await _gateway_store(hass).async_save({"gateways": gateways})


def _gateway_store_lock(hass: HomeAssistant) -> asyncio.Lock:
    return hass.data.setdefault(DOMAIN, {}).setdefault(
        "gateway_refresh_lock", asyncio.Lock()
    )


def _normalize_host(host: str) -> str:
    host = str(host or "").strip()
    return host.removeprefix("http://").removeprefix("https://").strip("/")


def _gateway_base_url(gateway: dict[str, Any]) -> str:
    host = _normalize_host(gateway.get("host", ""))
    return f"http://{host}"


def _looks_like_ip(host: str) -> bool:
    try:
        socket.inet_aton(host)
    except OSError:
        return False
    return host.count(".") == 3


def _gateway_send_base_url(gateway: dict[str, Any]) -> str:
    status = gateway.get("status") if isinstance(gateway.get("status"), dict) else {}
    status_ip = _normalize_host(str(status.get("ip") or ""))
    if status.get("ok") and _looks_like_ip(status_ip):
        return f"http://{status_ip}"
    return _gateway_base_url(gateway)


async def async_add_gateway(hass: HomeAssistant, name: str, host: str) -> dict[str, Any]:
    async with _gateway_store_lock(hass):
        gateways = await async_load_gateways(hass)
        normalized_host = _normalize_host(host)
        gateway_id = str(uuid.uuid4())
        now = int(time.time())
        gateway = {
            "id": gateway_id,
            "name": str(name or "DRATEK eInk gateway").strip(),
            "host": normalized_host,
            "created_at": now,
            "updated_at": now,
            "status": {"ok": None, "message": "Zatim neovereno."},
        }
        gateways = [item for item in gateways if item.get("host") != normalized_host]
        gateways.append(gateway)
        await async_save_gateways(hass, gateways)
        return gateway


async def async_delete_gateway(hass: HomeAssistant, gateway_id: str) -> bool:
    async with _gateway_store_lock(hass):
        gateways = await async_load_gateways(hass)
        next_gateways = [item for item in gateways if item.get("id") != gateway_id]
        await async_save_gateways(hass, next_gateways)
        return len(next_gateways) != len(gateways)


async def async_rename_gateway(hass: HomeAssistant, gateway_id: str, name: str) -> dict[str, Any] | None:
    normalized_name = str(name or "").strip()
    if not normalized_name:
        raise ValueError("Gateway name cannot be empty.")
    async with _gateway_store_lock(hass):
        gateways = await async_load_gateways(hass)
        for gateway in gateways:
            if gateway.get("id") != gateway_id:
                continue
            gateway["name"] = normalized_name
            gateway["updated_at"] = int(time.time())
            await async_save_gateways(hass, gateways)
            return gateway
        return None


async def async_gateway_status(hass: HomeAssistant, gateway: dict[str, Any]) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    url = f"{_gateway_base_url(gateway)}/api/status"
    try:
        async with session.get(url, timeout=DEFAULT_TIMEOUT) as response:
            payload = await response.json(content_type=None)
            if response.status >= 400:
                raise RuntimeError(f"HTTP {response.status}")
    except Exception as exc:
        return {
            "ok": False,
            "message": str(exc),
            "checked_at": int(time.time()),
        }

    return {
        "ok": True,
        "message": "Online",
        "checked_at": int(time.time()),
        "gateway_id": payload.get("gateway_id"),
        "hostname": payload.get("hostname"),
        "firmware": payload.get("firmware"),
        "chip": payload.get("chip"),
        "ip": payload.get("ip"),
        "mac": payload.get("mac"),
        "wifi_rssi": payload.get("wifi_rssi"),
        "uptime_ms": payload.get("uptime_ms"),
        "free_heap": payload.get("free_heap"),
        "minimum_free_heap": payload.get("minimum_free_heap"),
        "largest_free_block": payload.get("largest_free_block"),
        "reset_reason": payload.get("reset_reason"),
        "mdns_started": payload.get("mdns_started"),
        "ble_initialized": payload.get("ble_initialized"),
        "transfer_status": payload.get("transfer_status"),
        "transfer_job_id": payload.get("transfer_job_id"),
        "ota_supported": payload.get("ota_supported"),
        "ota_status": payload.get("ota_status"),
        "ota_error": payload.get("ota_error"),
        "ota_bytes_written": payload.get("ota_bytes_written"),
        "ota_expected_size": payload.get("ota_expected_size"),
        "partial_update": bool(payload.get("partial_update")),
        "firmware_size": payload.get("firmware_size"),
        "flash_size": payload.get("flash_size"),
        "running_partition_size": payload.get("running_partition_size"),
        "update_partition_size": payload.get("update_partition_size"),
    }


def _remember_gateway_status(gateway: dict[str, Any], status: dict[str, Any]) -> bool:
    """Apply a probe without forgetting the gateway after a transient failure."""
    previous = gateway.get("status") if isinstance(gateway.get("status"), dict) else {}
    if status.get("ok"):
        gateway["status"] = status
        gateway["last_seen_at"] = int(status.get("checked_at") or time.time())
        stable_id = str(status.get("gateway_id") or gateway.get("gateway_id") or "").strip()
        if stable_id:
            gateway["gateway_id"] = stable_id
        return True

    # Keep the last successful identity, IP and firmware data. Only availability
    # fields are replaced, so one lost HTTP response cannot make a configured
    # gateway disappear from routing or prevent mDNS from matching it again.
    gateway["status"] = {
        **previous,
        "ok": False,
        "message": status.get("message") or "Gateway is temporarily unavailable.",
        "checked_at": int(status.get("checked_at") or time.time()),
    }
    return False


def _gateway_matches_discovery(
    gateway: dict[str, Any], discovered: dict[str, Any]
) -> bool:
    status = gateway.get("status") if isinstance(gateway.get("status"), dict) else {}
    stored_id = str(gateway.get("gateway_id") or status.get("gateway_id") or "").strip()
    discovered_id = str(discovered.get("gateway_id") or "").strip()
    if stored_id and discovered_id:
        return stored_id == discovered_id

    stored_hosts = {
        _normalize_host(value).lower()
        for value in (gateway.get("host"), status.get("ip"), status.get("hostname"))
        if _normalize_host(value)
    }
    discovered_hosts = {
        _normalize_host(value).lower()
        for value in (discovered.get("host"), discovered.get("server"))
        if _normalize_host(value)
    }
    return bool(stored_hosts & discovered_hosts)


async def _async_refresh_gateway_set(
    hass: HomeAssistant, gateways: list[dict[str, Any]]
) -> None:
    if not gateways:
        return
    statuses = await asyncio.gather(
        *(async_gateway_status(hass, gateway) for gateway in gateways),
        return_exceptions=True,
    )
    unavailable: list[dict[str, Any]] = []
    for gateway, result in zip(gateways, statuses, strict=False):
        status = (
            result
            if isinstance(result, dict)
            else {"ok": False, "message": str(result), "checked_at": int(time.time())}
        )
        if not _remember_gateway_status(gateway, status):
            unavailable.append(gateway)
        gateway["updated_at"] = int(time.time())

    if not unavailable:
        return
    try:
        discovered = await async_discover_gateways(hass, seconds=4)
    except Exception:
        return

    recovered: list[dict[str, Any]] = []
    for gateway in unavailable:
        match = next(
            (item for item in discovered if _gateway_matches_discovery(gateway, item)),
            None,
        )
        if not match:
            continue
        host = _normalize_host(match.get("host") or match.get("server") or "")
        if host:
            gateway["host"] = host
        stable_id = str(match.get("gateway_id") or "").strip()
        if stable_id:
            gateway["gateway_id"] = stable_id
        recovered.append(gateway)

    if recovered:
        retry_statuses = await asyncio.gather(
            *(async_gateway_status(hass, gateway) for gateway in recovered),
            return_exceptions=True,
        )
        for gateway, result in zip(recovered, retry_statuses, strict=False):
            status = (
                result
                if isinstance(result, dict)
                else {"ok": False, "message": str(result), "checked_at": int(time.time())}
            )
            _remember_gateway_status(gateway, status)
            gateway["updated_at"] = int(time.time())


async def async_refresh_gateway(hass: HomeAssistant, gateway_id: str) -> dict[str, Any] | None:
    async with _gateway_store_lock(hass):
        gateways = await async_load_gateways(hass)
        gateway = next((item for item in gateways if item.get("id") == gateway_id), None)
        if not gateway:
            return None
        await _async_refresh_gateway_set(hass, [gateway])
        await async_save_gateways(hass, gateways)
    return gateway


async def async_refresh_all_gateways(hass: HomeAssistant) -> list[dict[str, Any]]:
    async with _gateway_store_lock(hass):
        gateways = await async_load_gateways(hass)
        await _async_refresh_gateway_set(hass, gateways)
        await async_save_gateways(hass, gateways)
        return gateways


async def async_start_gateway_ota(
    hass: HomeAssistant,
    gateway_id: str,
    expected_version: str,
) -> dict[str, Any] | None:
    gateways = await async_load_gateways(hass)
    gateway = next((item for item in gateways if item.get("id") == gateway_id), None)
    if not gateway:
        return None

    jobs = hass.data.setdefault(OTA_JOBS_KEY, {})
    job_id = uuid.uuid4().hex
    job: dict[str, Any] = {
        "job_id": job_id,
        "gateway_id": gateway_id,
        "status": "queued",
        "progress": 0,
        "ok": None,
        "error": "",
        "log": ["OTA update queued."],
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
    }
    jobs[job_id] = job

    def update(status: str, progress: int, message: str = "") -> None:
        job["status"] = status
        job["progress"] = progress
        job["updated_at"] = int(time.time())
        if message:
            job["log"].append(message)

    async def runner() -> None:
        try:
            update("preparing", 5, "Reading gateway status and selecting the correct firmware image.")
            status = await async_gateway_status(hass, gateway)
            if not status.get("ok"):
                raise RuntimeError(status.get("message") or "Gateway is offline.")
            if not status.get("ota_supported"):
                raise RuntimeError("Gateway firmware does not support OTA yet. Flash version 0.1.38 once over USB.")

            chip = str(status.get("chip") or "")
            profile = FLASH_PROFILES.get(chip)
            if not profile:
                raise RuntimeError(f"Unsupported or unknown gateway chip: {chip or 'unknown'}")
            firmware_path = profile["files"]["app"][1]
            if not firmware_path.exists():
                raise RuntimeError(f"Bundled OTA image is missing: {firmware_path.name}")

            firmware = await hass.async_add_executor_job(firmware_path.read_bytes)
            firmware_md5 = hashlib.md5(firmware, usedforsecurity=False).hexdigest()
            partition_size = int(status.get("update_partition_size") or 0)
            if partition_size and len(firmware) > partition_size:
                raise RuntimeError(
                    f"Firmware has {len(firmware)} bytes but the OTA partition has only {partition_size} bytes."
                )
            job["chip"] = chip
            job["firmware_size"] = len(firmware)
            job["target_version"] = expected_version
            update(
                "uploading",
                20,
                f"Uploading {firmware_path.name} ({len(firmware)} bytes, MD5 {firmware_md5}).",
            )

            gateway_with_status = dict(gateway)
            gateway_with_status["status"] = status
            base_url = _gateway_send_base_url(gateway_with_status)
            poll_gateway = dict(gateway)
            if status.get("ip"):
                poll_gateway["host"] = status["ip"]
            session = async_get_clientsession(hass)
            form = FormData()
            form.add_field(
                "firmware",
                firmware,
                filename=firmware_path.name,
                content_type="application/octet-stream",
            )
            upload_url = f"{base_url}/api/ota/upload?size={len(firmware)}&md5={firmware_md5}"
            async with session.post(upload_url, data=form, timeout=120) as response:
                result = await response.json(content_type=None)
                if response.status >= 400 or not result.get("ok"):
                    raise RuntimeError(result.get("error") or f"Gateway returned HTTP {response.status}.")

            update("restarting", 80, "Firmware verified by gateway. Waiting for restart and version check.")
            await asyncio.sleep(3)
            deadline = time.monotonic() + 75
            last_error = ""
            while time.monotonic() < deadline:
                await asyncio.sleep(2)
                refreshed = await async_gateway_status(hass, poll_gateway)
                if refreshed.get("ok"):
                    reported_version = str(refreshed.get("firmware") or "")
                    if reported_version == expected_version:
                        async with _gateway_store_lock(hass):
                            current_gateways = await async_load_gateways(hass)
                            current_gateway = next(
                                (
                                    item
                                    for item in current_gateways
                                    if item.get("id") == gateway_id
                                ),
                                None,
                            )
                            if current_gateway:
                                _remember_gateway_status(current_gateway, refreshed)
                                current_gateway["updated_at"] = int(time.time())
                                await async_save_gateways(hass, current_gateways)
                        job["reported_version"] = reported_version
                        job["ok"] = True
                        job["completed_at"] = int(time.time())
                        update("done", 100, f"Gateway is online with firmware {reported_version}.")
                        return
                    last_error = f"Gateway came back with unexpected firmware {reported_version or 'unknown'}."
                else:
                    last_error = str(refreshed.get("message") or "Gateway is restarting.")

            raise RuntimeError(last_error or "Gateway did not return after OTA update.")
        except Exception as exc:
            job["ok"] = False
            job["error"] = str(exc)
            update("failed", int(job.get("progress") or 0), f"OTA update failed: {exc}")

    hass.async_create_task(runner())
    return job


def async_get_gateway_ota_job(hass: HomeAssistant, job_id: str) -> dict[str, Any] | None:
    return hass.data.setdefault(OTA_JOBS_KEY, {}).get(job_id)


async def async_scan_gateway(hass: HomeAssistant, gateway_id: str, seconds: int = 8) -> dict[str, Any] | None:
    gateways = await async_load_gateways(hass)
    gateway = next((item for item in gateways if item.get("id") == gateway_id), None)
    if not gateway:
        return None

    session = async_get_clientsession(hass)
    url = f"{_gateway_base_url(gateway)}/api/scan?seconds={max(1, min(30, int(seconds)))}"
    try:
        async with session.get(url, timeout=max(DEFAULT_TIMEOUT, seconds + 5)) as response:
            payload = await response.json(content_type=None)
            if response.status >= 400:
                raise RuntimeError(f"HTTP {response.status}")
    except Exception as exc:
        return {"ok": False, "error": str(exc), "devices": []}

    return {
        "ok": True,
        "gateway_id": gateway_id,
        "devices": payload.get("devices", []),
        "raw": payload,
    }


async def async_send_gateway_payload(
    hass: HomeAssistant,
    gateway_id: str,
    address: str,
    sdk_type: int,
    image: Image.Image,
    transform: str | None = None,
    orientation: str | None = None,
    software_version: int | None = None,
    log_callback: Any = None,
    partial: tuple[int, int, int, int] | None = None,
) -> dict[str, Any] | None:
    gateways = await async_load_gateways(hass)
    gateway = next((item for item in gateways if item.get("id") == gateway_id), None)
    if not gateway:
        return None

    log: list[str] = []

    def add_log(message: str) -> None:
        line = str(message)
        log.append(line)
        if callable(log_callback):
            log_callback(line)

    try:
        add_log(f"Packing image {image.width}x{image.height} for SDK type {sdk_type}.")
        payload = await hass.async_add_executor_job(
            pack_bwr_region if partial else pack_bwr_image,
            *([image] if partial else [sdk_type, image, transform, orientation]),
        )
        raw_type = resolve_raw_type(hass, address)
        if raw_type is None:
            add_log(
                "Display has not been seen advertising, so its payload framing is "
                "unknown; sending the packed planes unframed."
            )
        elif quicklz.needs_vendor_framing(raw_type):
            # Without the 0x4000 raw-data flag the display expects the vendor's
            # QuickLZ stream. Fed the planes raw it acknowledges every block and
            # then refreshes nothing.
            framed = quicklz.frame_payload(payload, sdk_type)
            add_log(
                f"Advertised type {raw_type} does not set the 0x4000 raw-data flag; "
                f"framing {len(payload)} bytes as the vendor stream ({len(framed)} bytes)."
            )
            payload = framed
        add_log(f"Payload size: {len(payload)} bytes.")
        session = async_get_clientsession(hass)
        base_url = _gateway_send_base_url(gateway)
        request_id = uuid.uuid4().hex[:16]
        start_url = (
            f"{base_url}/api/transfer/upload?address={quote(address, safe='')}"
            f"&id={request_id}"
            f"&software_version={int(software_version or 0)}"
            f"&size={len(payload)}"
        )
        if partial:
            x, y, width, height = partial
            start_url += f"&partial=1&x={x}&y={y}&width={width}&height={height}"
        add_log(f"Streaming binary transfer job to gateway {base_url.removeprefix('http://')}.")
        data: dict[str, Any] = {}
        upload_error = ""
        for attempt in range(1, 3):
            try:
                form = FormData()
                form.add_field(
                    "payload",
                    payload,
                    filename="display.bin",
                    content_type="application/octet-stream",
                )
                async with session.post(
                    start_url,
                    data=form,
                    timeout=30,
                ) as response:
                    data = await response.json(content_type=None)
                    if response.status == 404:
                        return {
                            "ok": False,
                            "error": "gateway_firmware_update_required",
                            "log": log
                            + ["Gateway firmware 0.1.33 or newer is required. Reflash the ESP32 gateway."],
                            "raw": data,
                        }
                    if response.status >= 400 or not data.get("job_id"):
                        error = data.get("error") or f"HTTP {response.status}"
                        return {"ok": False, "error": error, "log": log, "raw": data}
                upload_error = ""
                break
            except Exception as exc:
                upload_error = str(exc)
                add_log(f"Gateway upload attempt {attempt}/2 failed: {exc}")
                if attempt < 2:
                    await asyncio.sleep(2)
                    try:
                        async with session.get(f"{base_url}/api/status", timeout=8) as status_response:
                            status_data = await status_response.json(content_type=None)
                        add_log(
                            "Gateway status after disconnect: "
                            f"reset={status_data.get('reset_reason', '?')}, "
                            f"uptime={status_data.get('uptime_ms', '?')} ms, "
                            f"heap={status_data.get('free_heap', '?')}, "
                            f"BLE={status_data.get('ble_initialized', '?')}."
                        )
                    except Exception as status_exc:
                        add_log(f"Gateway status after disconnect is unavailable: {status_exc}")
                    add_log("Retrying the same idempotent transfer job.")
        if upload_error:
            return {"ok": False, "error": upload_error, "log": log}

        job_id = str(data["job_id"])
        add_log(
            f"Gateway accepted transfer job {job_id}; "
            f"free heap {data.get('free_heap', '?')} bytes."
        )
        status_url = f"{base_url}/api/transfer/status?id={quote(job_id, safe='')}"
        deadline = time.monotonic() + 180
        seen_log_lines = 0
        poll_errors = 0
        final_data: dict[str, Any] = {}

        while time.monotonic() < deadline:
            await asyncio.sleep(1)
            try:
                async with session.get(status_url, timeout=10) as response:
                    final_data = await response.json(content_type=None)
                    if response.status == 404:
                        add_log("Gateway lost the transfer job, most likely because it restarted.")
                        return {
                            "ok": False,
                            "error": "gateway_transfer_lost_after_restart",
                            "log": log,
                            "raw": final_data,
                        }
                    if response.status >= 400:
                        raise RuntimeError(final_data.get("error") or f"HTTP {response.status}")
                poll_errors = 0
            except Exception as exc:
                poll_errors += 1
                if poll_errors == 1 or poll_errors % 5 == 0:
                    add_log(f"Gateway status temporarily unavailable ({poll_errors}): {exc}")
                continue

            remote_log = final_data.get("log", []) or []
            for line in remote_log[seen_log_lines:]:
                add_log(str(line))
            seen_log_lines = len(remote_log)
            status = final_data.get("status")
            if status == "succeeded":
                add_log("Gateway transfer job completed successfully.")
                break
            if status == "failed":
                error = final_data.get("error") or "ble_transfer_failed"
                return {"ok": False, "error": error, "log": log, "raw": final_data}
        else:
            add_log("Timed out waiting for the gateway transfer job.")
            return {"ok": False, "error": "gateway_transfer_timeout", "log": log, "raw": final_data}
    except Exception as exc:
        add_log(f"Gateway send failed: {exc}")
        return {"ok": False, "error": str(exc), "log": log}

    add_log("Gateway transfer finished.")
    return {"ok": True, "gateway_id": gateway_id, "address": address, "log": log}


async def async_discover_gateways(hass: HomeAssistant, seconds: int = 10) -> list[dict[str, Any]]:
    try:
        from homeassistant.components.zeroconf import async_get_instance
        from zeroconf import ServiceBrowser, ServiceListener
    except Exception as exc:
        raise RuntimeError(f"zeroconf library is not available: {exc}") from exc

    found: dict[str, dict[str, Any]] = {}

    class Listener(ServiceListener):
        def add_service(self, zc: Any, service_type: str, name: str) -> None:
            self.update_service(zc, service_type, name)

        def update_service(self, zc: Any, service_type: str, name: str) -> None:
            info = zc.get_service_info(service_type, name, timeout=3000)
            if not info or not info.addresses:
                return
            host = socket.inet_ntoa(info.addresses[0])
            properties = {
                key.decode(errors="ignore"): value.decode(errors="ignore")
                for key, value in (info.properties or {}).items()
            }
            found[name] = {
                "name": name.removesuffix("." + DISCOVERY_SERVICE),
                "host": host,
                "port": info.port,
                "gateway_id": properties.get("id", ""),
                "firmware": properties.get("fw", ""),
                "chip": properties.get("chip", ""),
                "ota_supported": properties.get("ota", "") == "1",
                "server": info.server.rstrip("."),
            }

        def remove_service(self, zc: Any, service_type: str, name: str) -> None:
            return

    aiozc = await async_get_instance(hass)
    zc = getattr(aiozc, "zeroconf", aiozc)
    browser = ServiceBrowser(zc, DISCOVERY_SERVICE, Listener())
    try:
        await asyncio.sleep(max(1, min(15, seconds)))
    finally:
        browser.cancel()
    return list(found.values())


def _is_flashable_serial_device(device: str, vid: int | None = None, pid: int | None = None) -> bool:
    """Exclude built-in Linux UARTs which cannot be an attached USB ESP board."""
    normalized = str(device or "").strip().lower().replace("\\", "/")
    if not normalized:
        return False
    if normalized.startswith("com") and normalized[3:].isdigit():
        return True
    if vid is not None or pid is not None:
        return True
    return normalized.startswith(
        (
            "/dev/ttyusb",
            "/dev/ttyacm",
            "/dev/serial/by-id/",
            "/dev/cu.usb",
            "/dev/cu.wchusb",
            "/dev/cu.slab_usb",
        )
    )


def _list_serial_ports_sync() -> list[dict[str, Any]]:
    try:
        from serial.tools import list_ports
    except Exception as exc:
        raise RuntimeError(f"pyserial is not available: {exc}") from exc
    ports = [
        {
            "device": port.device,
            "name": port.name,
            "description": port.description,
            "hwid": port.hwid,
            "manufacturer": port.manufacturer,
            "vid": port.vid,
            "pid": port.pid,
        }
        for port in list_ports.comports()
        if _is_flashable_serial_device(port.device, port.vid, port.pid)
    ]
    return sorted(
        ports,
        key=lambda port: (
            port.get("vid") is None and port.get("pid") is None,
            str(port.get("device") or ""),
        ),
    )


async def async_list_serial_ports(hass: HomeAssistant) -> list[dict[str, Any]]:
    return await hass.async_add_executor_job(_list_serial_ports_sync)


def _safe_log_line(line: str, password: str) -> str:
    return line.replace(password, "********") if password else line


def _extract_json_object(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    while start >= 0:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : index + 1]
                    try:
                        payload = json.loads(candidate)
                    except json.JSONDecodeError:
                        break
                    return payload if isinstance(payload, dict) else None
        start = text.find("{", start + 1)
    return None


def _safe_network_hostname(hostname: str) -> str:
    value = str(hostname or "").strip().lower().replace("_", "-")
    safe = []
    previous_dash = False
    for char in value:
        valid = char.isalnum() or char == "-"
        next_char = char if valid else "-"
        if next_char == "-":
            if previous_dash:
                continue
            previous_dash = True
        else:
            previous_dash = False
        safe.append(next_char)
    normalized = "".join(safe).strip("-")
    return (normalized or "dratek-eink-gateway")[:63].strip("-") or "dratek-eink-gateway"


def _open_serial_without_reset(serial_module: Any, port: str, timeout: float = 0.5) -> Any:
    """Open a gateway serial port without deliberately toggling its reset lines."""
    ser = serial_module.Serial()
    ser.port = port
    ser.baudrate = 115200
    ser.timeout = timeout
    ser.write_timeout = 3
    ser.dsrdtr = False
    ser.rtscts = False
    ser.dtr = False
    ser.rts = False
    ser.open()
    return ser


def _pulse_esp_reset_into_app(ser: Any) -> None:
    """Ensure ESP32 boots into user application mode by toggling RTS/DTR lines."""
    try:
        ser.dtr = False  # IO0 = High (Normal execution, not bootloader)
        ser.rts = True   # EN = Low (Reset)
        time.sleep(0.12)
        ser.rts = False  # EN = High (Run)
        time.sleep(0.35)
    except Exception:
        pass


def _provision_wifi_over_serial(
    port: str,
    ssid: str,
    password: str,
    hostname: str,
    add_log: Any,
    timeout_seconds: int = 35,
) -> bool:
    """Wait for the freshly flashed firmware and retry provisioning until acknowledged."""
    import serial

    payload = json.dumps(
        {
            "cmd": "wifi",
            "ssid": ssid,
            "password": password,
            "hostname": _safe_network_hostname(hostname),
        }
    )
    # esptool just released this port (its own reset sequence can still be
    # settling on the OS/driver side, especially on Windows), so the very
    # first reopen attempt can transiently fail even though the flash itself
    # succeeded. Retry the open for a few seconds instead of giving up on one
    # shot - previously a single failed open here silently skipped Wi-Fi
    # provisioning entirely, forcing a manual "Wi-Fi only" resend afterward.
    open_deadline = time.monotonic() + 5
    ser = None
    last_open_error: Exception | None = None
    while ser is None and time.monotonic() < open_deadline:
        try:
            ser = _open_serial_without_reset(serial, port)
        except Exception as exc:  # port not released by esptool/OS yet
            last_open_error = exc
            time.sleep(0.3)
    if ser is None:
        add_log(f"Could not reopen the serial port for Wi-Fi provisioning: {last_open_error}")
        return False

    deadline = time.monotonic() + timeout_seconds
    attempts = 0
    next_send_at = time.monotonic() + 1.2
    with ser:
        _pulse_esp_reset_into_app(ser)
        while time.monotonic() < deadline:
            now = time.monotonic()
            if now >= next_send_at:
                attempts += 1
                if attempts == 4:
                    _pulse_esp_reset_into_app(ser)
                add_log(f"Sending Wi-Fi configuration (attempt {attempts}).")
                ser.write((payload + "\n").encode())
                ser.flush()
                next_send_at = now + 2.5

            line = ser.readline().decode(errors="ignore").strip()
            if not line:
                continue
            add_log(line)
            response = _extract_json_object(line)
            if "wifi_config_saved" in line or (
                response is not None
                and response.get("ok")
                and response.get("message") == "wifi_config_saved"
            ):
                return True
    return False


def _flash_gateway_sync(
    port: str,
    ssid: str,
    password: str,
    hostname: str,
    chip: str,
    job: dict[str, Any] | None = None,
) -> dict[str, Any]:
    log: list[str] = [] if job is None else job["log"]

    def add_log(line: str) -> None:
        log.append(_safe_log_line(line, password))
        if job is not None:
            job["updated_at"] = int(time.time())

    if job is not None:
        job["status"] = "running"
        job["ok"] = None
    profile = FLASH_PROFILES.get(chip) or FLASH_PROFILES["esp32"]
    if not _is_flashable_serial_device(port):
        error = (
            f"Port {port or '(none)'} is not a USB serial device suitable for flashing. "
            "Connect the ESP directly to the Home Assistant machine and select "
            "/dev/ttyACM*, /dev/ttyUSB*, or a USB device path."
        )
        add_log(error)
        if job is not None:
            job["status"] = "failed"
            job["ok"] = False
            job["error"] = error
        return {"ok": False, "error": error, "log": log}
    files = profile["files"]
    missing = [str(path.name) for _offset, path in files.values() if not path.exists()]
    if missing:
        if job is not None:
            job["status"] = "failed"
            job["ok"] = False
            job["error"] = "missing_firmware_binary"
        return {
            "ok": False,
            "error": "missing_firmware_binary",
            "log": [
                "Firmware binary is not bundled in this installation yet.",
                "Missing: " + ", ".join(missing),
                "Build firmware/dratek-eink-gateway and place binaries into custom_components/dratek_eink/firmware.",
            ],
        }

    esptool_cmd = [
        sys.executable,
        "-m",
        "esptool",
        "--chip",
        profile["chip"],
        "--port",
        port,
        "--baud",
        ESPTOOL_FLASH_BAUD,
        "--after",
        "hard_reset",
        "write-flash",
        "-z",
    ]
    for key in ("bootloader", "partitions", "app"):
        offset, path = files[key]
        esptool_cmd.extend([hex(offset), str(path)])
    add_log(f"Flashing {profile['label']} firmware...")
    try:
        erase_cmd = [
            sys.executable,
            "-m",
            "esptool",
            "--chip",
            profile["chip"],
            "--port",
            port,
            "--baud",
            ESPTOOL_FLASH_BAUD,
            "erase-region",
            "0x9000",
            "0x7000",
        ]
        add_log("Resetting NVS partition and OTA boot metadata for clean initialization.")
        erase_proc = subprocess.run(
            erase_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=45,
            check=False,
        )
        for line in erase_proc.stdout.splitlines():
            if line.strip():
                add_log(line.strip())
        if erase_proc.returncode != 0:
            erase_output = erase_proc.stdout.lower()
            if "failed to connect" in erase_output or "no serial data received" in erase_output:
                raise RuntimeError(
                    f"{profile['label']} did not respond on {port}. Verify the USB port and cable. "
                    "If the board has no automatic boot circuit, hold BOOT, press and release RESET, "
                    "then release BOOT and start flashing again."
                )
            raise RuntimeError(f"OTA metadata erase failed with exit code {erase_proc.returncode}")

        proc = subprocess.Popen(
            esptool_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        started = time.time()
        assert proc.stdout is not None
        while True:
            line = proc.stdout.readline()
            if line:
                add_log(line.strip())
            if proc.poll() is not None:
                break
            if time.time() - started > 180:
                proc.kill()
                raise TimeoutError("esptool timed out")
        for line in proc.stdout.read().splitlines():
            if line.strip():
                add_log(line.strip())
    except Exception as exc:
        if job is not None:
            job["status"] = "failed"
            job["ok"] = False
            job["error"] = str(exc)
        return {"ok": False, "error": str(exc), "log": log}

    if proc.returncode != 0:
        if job is not None:
            job["status"] = "failed"
            job["ok"] = False
            job["error"] = f"esptool exited with {proc.returncode}"
        return {"ok": False, "error": f"esptool exited with {proc.returncode}", "log": log}

    add_log("Firmware flashed. Sending Wi-Fi configuration over serial...")
    try:
        if _provision_wifi_over_serial(port, ssid, password, hostname, add_log):
            if job is not None:
                job["status"] = "done"
                job["ok"] = True
                job["completed_at"] = int(time.time())
            return {"ok": True, "log": log}
    except Exception as exc:
        if job is not None:
            job["status"] = "failed"
            job["ok"] = False
            job["error"] = f"Wi-Fi provisioning failed: {exc}"
        return {"ok": False, "error": f"Wi-Fi provisioning failed: {exc}", "log": log}

    error = (
        "Firmware was flashed successfully, but the ESP32 did not acknowledge "
        "the Wi-Fi configuration over serial."
    )
    if job is not None:
        job["status"] = "failed"
        job["ok"] = False
        job["error"] = error
    return {"ok": False, "error": error, "log": log}


async def async_flash_gateway(
    hass: HomeAssistant,
    port: str,
    ssid: str,
    password: str,
    hostname: str,
    chip: str = "esp32",
) -> dict[str, Any]:
    return await hass.async_add_executor_job(_flash_gateway_sync, port, ssid, password, hostname, chip)


async def async_start_flash_gateway(
    hass: HomeAssistant,
    port: str,
    ssid: str,
    password: str,
    hostname: str,
    chip: str = "esp32",
) -> dict[str, Any]:
    jobs = hass.data.setdefault(FLASH_JOBS_KEY, {})
    job_id = str(uuid.uuid4())
    job = {
        "job_id": job_id,
        "status": "queued",
        "ok": None,
        "error": "",
        "log": ["Flash job queued."],
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
    }
    jobs[job_id] = job

    async def runner() -> None:
        await hass.async_add_executor_job(_flash_gateway_sync, port, ssid, password, hostname, chip, job)

    hass.async_create_task(runner())
    return job


def async_get_flash_job(hass: HomeAssistant, job_id: str) -> dict[str, Any] | None:
    return hass.data.setdefault(FLASH_JOBS_KEY, {}).get(job_id)


def _serial_gateway_command_sync(
    port: str,
    command: dict[str, Any],
    password: str = "",
    read_seconds: int = 8,
    continue_after_json: bool = False,
) -> dict[str, Any]:
    log: list[str] = []
    result_payload: dict[str, Any] | None = None
    try:
        import serial

        with _open_serial_without_reset(serial, port) as ser:
            serialized_command = json.dumps(command) + "\n" if command else ""
            deadline = time.time() + max(1, min(20, read_seconds))
            next_send_at = time.time() + (1.0 if command else read_seconds + 1)
            while time.time() < deadline:
                now = time.time()
                if serialized_command and now >= next_send_at:
                    ser.write(serialized_command.encode())
                    ser.flush()
                    next_send_at = now + 2
                line = ser.readline().decode(errors="ignore").strip()
                if line:
                    log.append(_safe_log_line(line, password))
                    payload = _extract_json_object(line)
                    if payload is not None:
                        result_payload = payload
                        if not continue_after_json:
                            return {"ok": bool(payload.get("ok", True)), "payload": payload, "log": log}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "log": log}
    if result_payload is not None:
        return {"ok": bool(result_payload.get("ok", True)), "payload": result_payload, "log": log}
    return {"ok": False, "error": "No JSON response from ESP32 over serial.", "log": log}


async def async_serial_gateway_status(hass: HomeAssistant, port: str) -> dict[str, Any]:
    return await hass.async_add_executor_job(
        _serial_gateway_command_sync,
        port,
        {"cmd": "status"},
        "",
        12,
        True,
    )


async def async_serial_gateway_wifi(
    hass: HomeAssistant,
    port: str,
    ssid: str,
    password: str,
    hostname: str,
) -> dict[str, Any]:
    return await hass.async_add_executor_job(
        _serial_gateway_command_sync,
        port,
        {"cmd": "wifi", "ssid": ssid, "password": password, "hostname": _safe_network_hostname(hostname)},
        password,
        12,
    )
