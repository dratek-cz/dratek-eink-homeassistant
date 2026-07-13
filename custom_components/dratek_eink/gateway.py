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
FLASH_FILES = {
    "bootloader": FIRMWARE_DIR / "dratek-eink-gateway-bootloader.bin",
    "partitions": FIRMWARE_DIR / "dratek-eink-gateway-partitions.bin",
    "app": FIRMWARE_DIR / "dratek-eink-gateway.bin",
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


def _flash_gateway_sync(port: str, ssid: str, password: str, hostname: str) -> dict[str, Any]:
    log: list[str] = []
    missing = [str(path.name) for path in FLASH_FILES.values() if not path.exists()]
    if missing:
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
        "esp32",
        "--port",
        port,
        "--baud",
        "460800",
        "write_flash",
        "-z",
        "0x1000",
        str(FLASH_FILES["bootloader"]),
        "0x8000",
        str(FLASH_FILES["partitions"]),
        "0x10000",
        str(FLASH_FILES["app"]),
    ]
    log.append("Flashing ESP32 firmware...")
    try:
        proc = subprocess.run(esptool_cmd, capture_output=True, text=True, timeout=180, check=False)
    except Exception as exc:
        return {"ok": False, "error": str(exc), "log": log}

    log.extend(line for line in (proc.stdout + "\n" + proc.stderr).splitlines() if line.strip())
    if proc.returncode != 0:
        return {"ok": False, "error": f"esptool exited with {proc.returncode}", "log": log}

    log.append("Firmware flashed. Sending Wi-Fi configuration over serial...")
    try:
        import serial

        time.sleep(2)
        with serial.Serial(port, 115200, timeout=8) as ser:
            payload = json.dumps({"ssid": ssid, "password": password, "hostname": hostname or "dratek-eink-gateway"})
            ser.write((payload + "\n").encode())
            ser.flush()
            deadline = time.time() + 12
            while time.time() < deadline:
                line = ser.readline().decode(errors="ignore").strip()
                if line:
                    safe_line = line.replace(password, "********") if password else line
                    log.append(safe_line)
                    if "wifi_config_saved" in line:
                        return {"ok": True, "log": log}
    except Exception as exc:
        return {"ok": False, "error": f"Wi-Fi provisioning failed: {exc}", "log": log}

    return {"ok": False, "error": "Wi-Fi provisioning acknowledgement timed out.", "log": log}


async def async_flash_gateway(
    hass: HomeAssistant,
    port: str,
    ssid: str,
    password: str,
    hostname: str,
) -> dict[str, Any]:
    return await hass.async_add_executor_job(_flash_gateway_sync, port, ssid, password, hostname)
