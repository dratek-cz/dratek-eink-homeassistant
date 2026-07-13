from __future__ import annotations

import time
import uuid
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

GATEWAY_STORE_KEY = "dratek_eink.gateways"
GATEWAY_STORE_VERSION = 1
DEFAULT_TIMEOUT = 8


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
