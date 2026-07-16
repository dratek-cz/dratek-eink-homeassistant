from __future__ import annotations

import asyncio
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

GATEWAY_STORE_KEY = "dratek_eink.gateways"
GATEWAY_STORE_VERSION = 1
DEFAULT_TIMEOUT = 8
DISCOVERY_SERVICE = "_dratek-eink-gateway._tcp.local."
FIRMWARE_DIR = Path(__file__).parent / "firmware"
FLASH_JOBS_KEY = "dratek_eink_flash_jobs"
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


def _normalize_host(host: str) -> str:
    host = str(host or "").strip()
    host = host.removeprefix("http://").removeprefix("https://").strip("/")
    return host


def _gateway_base_url(gateway: dict[str, Any]) -> str:
    host = _normalize_host(gateway.get("host", ""))
    return f"http://{host}"


async def async_add_gateway(hass: HomeAssistant, name: str, host: str) -> dict[str, Any]:
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
    gateways = await async_load_gateways(hass)
    next_gateways = [item for item in gateways if item.get("id") != gateway_id]
    await async_save_gateways(hass, next_gateways)
    return len(next_gateways) != len(gateways)


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
        "firmware": payload.get("firmware"),
        "ip": payload.get("ip"),
        "mac": payload.get("mac"),
        "wifi_rssi": payload.get("wifi_rssi"),
        "uptime_ms": payload.get("uptime_ms"),
        "free_heap": payload.get("free_heap"),
    }


async def async_refresh_gateway(hass: HomeAssistant, gateway_id: str) -> dict[str, Any] | None:
    gateways = await async_load_gateways(hass)
    for gateway in gateways:
        if gateway.get("id") != gateway_id:
            continue
        gateway["status"] = await async_gateway_status(hass, gateway)
        gateway["updated_at"] = int(time.time())
        await async_save_gateways(hass, gateways)
        return gateway
    return None


async def async_refresh_all_gateways(hass: HomeAssistant) -> list[dict[str, Any]]:
    gateways = await async_load_gateways(hass)
    for gateway in gateways:
        gateway["status"] = await async_gateway_status(hass, gateway)
        gateway["updated_at"] = int(time.time())
    await async_save_gateways(hass, gateways)
    return gateways


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


def _discover_gateways_sync(seconds: int) -> list[dict[str, Any]]:
    try:
        from zeroconf import ServiceBrowser, ServiceListener, Zeroconf
    except Exception as exc:
        raise RuntimeError(f"zeroconf library is not available: {exc}") from exc

    found: dict[str, dict[str, Any]] = {}

    class Listener(ServiceListener):
        def add_service(self, zc: Zeroconf, service_type: str, name: str) -> None:
            self.update_service(zc, service_type, name)

        def update_service(self, zc: Zeroconf, service_type: str, name: str) -> None:
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
                "server": info.server.rstrip("."),
            }

        def remove_service(self, zc: Zeroconf, service_type: str, name: str) -> None:
            return

    zc = Zeroconf()
    try:
        ServiceBrowser(zc, DISCOVERY_SERVICE, Listener())
        time.sleep(max(1, min(15, seconds)))
    finally:
        zc.close()
    return list(found.values())


async def async_discover_gateways(hass: HomeAssistant, seconds: int = 4) -> list[dict[str, Any]]:
    return await hass.async_add_executor_job(_discover_gateways_sync, seconds)


def _list_serial_ports_sync() -> list[dict[str, Any]]:
    try:
        from serial.tools import list_ports
    except Exception as exc:
        raise RuntimeError(f"pyserial is not available: {exc}") from exc
    return [
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
    ]


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
        "460800",
        "write_flash",
        "-z",
    ]
    for key in ("bootloader", "partitions", "app"):
        offset, path = files[key]
        esptool_cmd.extend([hex(offset), str(path)])
    add_log(f"Flashing {profile['label']} firmware...")
    try:
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
        import serial

        time.sleep(2)
        with serial.Serial(port, 115200, timeout=8) as ser:
            payload = json.dumps({"ssid": ssid, "password": password, "hostname": _safe_network_hostname(hostname)})
            ser.write((payload + "\n").encode())
            ser.flush()
            deadline = time.time() + 12
            while time.time() < deadline:
                line = ser.readline().decode(errors="ignore").strip()
                if line:
                    add_log(line)
                    if "wifi_config_saved" in line:
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

    if job is not None:
        job["status"] = "failed"
        job["ok"] = False
        job["error"] = "Wi-Fi provisioning acknowledgement timed out."
    return {"ok": False, "error": "Wi-Fi provisioning acknowledgement timed out.", "log": log}


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
) -> dict[str, Any]:
    log: list[str] = []
    try:
        import serial

        with serial.Serial(port, 115200, timeout=1) as ser:
            ser.reset_input_buffer()
            if command:
                ser.write((json.dumps(command) + "\n").encode())
                ser.flush()
            deadline = time.time() + max(1, min(20, read_seconds))
            while time.time() < deadline:
                line = ser.readline().decode(errors="ignore").strip()
                if line:
                    log.append(_safe_log_line(line, password))
                    payload = _extract_json_object(line)
                    if payload is not None:
                        return {"ok": bool(payload.get("ok", True)), "payload": payload, "log": log}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "log": log}
    return {"ok": False, "error": "No JSON response from ESP32 over serial.", "log": log}


async def async_serial_gateway_status(hass: HomeAssistant, port: str) -> dict[str, Any]:
    return await hass.async_add_executor_job(
        _serial_gateway_command_sync,
        port,
        {"cmd": "status"},
        "",
        8,
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
