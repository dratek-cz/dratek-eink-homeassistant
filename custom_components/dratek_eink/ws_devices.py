"""Websocket commands that act on a single eInk display."""

from __future__ import annotations

from typing import Any
import base64
import io
import time

from homeassistant.components import bluetooth, websocket_api
from homeassistant.core import HomeAssistant
import voluptuous as vol

from .automation import get_entity_auto_update_manager
from .const import (
    LOCAL_ROUTE_ID,
    PARTIAL_UPDATE_CONFIRMED_SDK_TYPES,
)
from .discovery import parse_dratek_advertisement, parse_dratek_manufacturer_data
from .gateway import (
    async_load_gateways,
    async_scan_gateway,
)
from .queue import get_transfer_queue
from .radio import async_try_radio_slot
from .routing import paths_allowed_by_gateway_lock
from .transfer import DratekTransfer
from .ws_shared import (
    DISCOVERY_CACHE_KEY,
    DISCOVERY_GRACE_SECONDS,
    _battery_payload,
    _load_project_data,
    _normalize_address,
    _project_store,
    _save_gateway_preferences,
)

# How long a discovery scan waits for an in-flight transfer to release the
# radio. Long enough to ride out the gap between two queued transfers, short
# enough that the panel never looks frozen; past it the scan returns what Home
# Assistant already knows rather than queueing behind a transfer that can
# legitimately run for minutes.
GATEWAY_SCAN_RADIO_WAIT_SECONDS = 5.0


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/set_rgb_led",
        "address": str,
        "mode": vol.All(int, vol.Range(min=0, max=2)),
        "flash_time": vol.All(int, vol.Range(min=0, max=255)),
        "red": vol.All(int, vol.Range(min=0, max=255)),
        "green": vol.All(int, vol.Range(min=0, max=255)),
        "blue": vol.All(int, vol.Range(min=0, max=255)),
    }
)
@websocket_api.async_response
async def websocket_set_rgb_led(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Control the RGB indicator LED over the display's local BLE connection."""
    address = msg["address"]

    async def run_transfer(add_log) -> dict[str, Any]:
        transfer = DratekTransfer(log=add_log, hass=hass)
        await transfer.set_rgb_led(
            address,
            msg["mode"],
            msg["flash_time"],
            msg["red"],
            msg["green"],
            msg["blue"],
        )
        return {"ok": True, "address": address, "log": []}

    try:
        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="rgb_led",
            runner=run_transfer,
        )
    except Exception as exc:  # BLE stack can raise platform-specific exceptions
        connection.send_result(
            msg["id"],
            {"ok": False, "address": address, "error": str(exc), "log": []},
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/flash_identify",
        "address": str,
    }
)
@websocket_api.async_response
async def websocket_flash_identify(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Blink the display's indicator once so it can be located ("find me")."""
    address = msg["address"]

    async def run_transfer(add_log) -> dict[str, Any]:
        transfer = DratekTransfer(log=add_log, hass=hass)
        await transfer.flash_identify(address)
        return {"ok": True, "address": address, "log": []}

    try:
        result = await get_transfer_queue(hass).async_submit(
            resource="local",
            transport_type="local",
            transport_name="Home Assistant Bluetooth",
            address=address,
            operation="flash_identify",
            runner=run_transfer,
        )
    except Exception as exc:  # BLE stack can raise platform-specific exceptions
        connection.send_result(
            msg["id"],
            {"ok": False, "address": address, "error": str(exc), "log": []},
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/render_preview",
        "address": str,
        "automation": dict,
    }
)
@websocket_api.async_response
async def websocket_render_preview(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the canonical image used by automatic display refreshes."""
    try:
        image = await get_entity_auto_update_manager(hass).async_render_preview(
            msg["address"],
            msg["automation"],
        )
        output = io.BytesIO()
        image.save(output, format="PNG")
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
    except Exception as exc:  # render failures must reach the designer
        connection.send_error(msg["id"], "preview_failed", str(exc))
        return
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "image": f"data:image/png;base64,{encoded}",
            "width": image.width,
            "height": image.height,
        },
    )


@websocket_api.websocket_command({"type": "dratek_eink/scan"})
@websocket_api.async_response
async def websocket_scan(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    now = int(time.time())
    local_scan_error = ""
    try:
        scanner_count = bluetooth.async_scanner_count(hass, connectable=True)
        service_infos = bluetooth.async_discovered_service_info(hass, connectable=True)
    except Exception as exc:  # BLE availability can differ by HA installation
        scanner_count = 0
        service_infos = []
        local_scan_error = str(exc)

    devices_by_address: dict[str, dict[str, Any]] = {}
    ble_devices = []
    debug = [
        f"Bluetooth scanners detected: {scanner_count}",
        f"BLE advertisements currently cached by Home Assistant: {len(service_infos)}",
    ]
    if local_scan_error:
        debug.append(f"Integrated Bluetooth scan failed: {local_scan_error}")

    for service_info in service_infos:
        address = getattr(service_info, "address", "")
        manufacturer_data = getattr(service_info, "manufacturer_data", {}) or {}
        service_uuids = getattr(service_info, "service_uuids", []) or []
        name = getattr(service_info, "name", "") or ""
        rssi = getattr(service_info, "rssi", None)

        ble_devices.append(
            {
                "address": address,
                "name": name,
                "rssi": rssi,
                "manufacturer_ids": [f"0x{int(key):04X}" for key in manufacturer_data],
                "service_uuids": list(service_uuids),
            }
        )

        device = parse_dratek_advertisement(service_info)
        if device is None:
            continue

        normalized_address = device.address.upper()
        devices_by_address[normalized_address] = {
                "address": device.address,
                "name": device.name,
                "physical_code": device.physical_code,
                "rssi": device.rssi,
                "raw_type": device.raw_type,
                "sdk_type": device.sdk_type,
                "profile": f"0x{device.profile:02X}",
                **_battery_payload(device),
                "sw": device.sw,
                "hw": device.hw,
                "model": device.model,
                "partial_update": True,
                "partial_update_confirmed": device.sdk_type in PARTIAL_UPDATE_CONFIRMED_SDK_TYPES,
                "paths": [{
                    "type": "local",
                    "id": "local",
                    "name": "Home Assistant Bluetooth",
                    "rssi": device.rssi,
                    "last_seen_at": now,
                }],
            }

    gateways = await async_load_gateways(hass)
    # Scanning every gateway at once looked like free concurrency - each request
    # goes to a different ESP32 over HTTP. Physically it made every gateway
    # transmit an active BLE scan into the same band at the same moment, on top
    # of whatever the local adapter was already doing. Sequential scanning under
    # the shared radio slot costs a few seconds of wall clock and stops
    # discovery from being the noisiest thing this integration does.
    scanned_gateways: list[dict[str, Any]] = []
    gateway_results: list[Any] = []
    async with async_try_radio_slot(hass, GATEWAY_SCAN_RADIO_WAIT_SECONDS) as radio_free:
        if gateways and not radio_free:
            debug.append(
                "Gateway BLE scan skipped: a display transfer is currently using "
                "the radio. Displays Home Assistant already knows are still listed."
            )
        elif gateways:
            for gateway in gateways:
                scanned_gateways.append(gateway)
                try:
                    gateway_results.append(await async_scan_gateway(hass, gateway["id"], 5))
                except Exception as exc:  # one unreachable gateway must not hide the rest
                    gateway_results.append(exc)

    for gateway, scan_result in zip(scanned_gateways, gateway_results, strict=False):
        gateway_name = gateway.get("name") or "DRATEK eInk gateway"
        if isinstance(scan_result, Exception):
            debug.append(f"Gateway {gateway_name}: scan failed: {scan_result}")
            continue
        if not scan_result or not scan_result.get("ok"):
            debug.append(f"Gateway {gateway_name}: scan failed: {(scan_result or {}).get('error', 'offline')}")
            continue
        remote_devices = scan_result.get("devices", [])
        debug.append(f"Gateway {gateway_name}: {len(remote_devices)} BLE advertisements")
        for remote in remote_devices:
            if not remote.get("dratek"):
                continue
            address = str(remote.get("address") or "").upper()
            if not address:
                continue
            parsed = None
            manufacturer_hex = str(remote.get("manufacturer_data") or "")
            try:
                manufacturer = bytes.fromhex(manufacturer_hex)
                if len(manufacturer) >= 2 and int.from_bytes(manufacturer[:2], "little") == 0x5053:
                    manufacturer = manufacturer[2:]
                parsed = parse_dratek_manufacturer_data(
                    address, remote.get("name"), remote.get("rssi"), manufacturer
                )
            except ValueError:
                debug.append(f"Gateway {gateway_name}: invalid manufacturer data for {address}")

            path = {
                "type": "gateway",
                "id": gateway["id"],
                "name": gateway_name,
                "host": gateway.get("host"),
                "rssi": remote.get("rssi"),
                "last_seen_at": now,
            }
            existing = devices_by_address.get(address)
            if existing:
                existing["paths"].append(path)
                continue
            if parsed is None:
                continue
            devices_by_address[address] = {
                "address": parsed.address.upper(),
                "name": parsed.name,
                "physical_code": parsed.physical_code,
                "rssi": parsed.rssi,
                "raw_type": parsed.raw_type,
                "sdk_type": parsed.sdk_type,
                "profile": f"0x{parsed.profile:02X}",
                **_battery_payload(parsed),
                "sw": parsed.sw,
                "hw": parsed.hw,
                "model": parsed.model,
                "partial_update": True,
                "partial_update_confirmed": parsed.sdk_type in PARTIAL_UPDATE_CONFIRMED_SDK_TYPES,
                "paths": [path],
            }

    discovery_cache = hass.data.setdefault(DISCOVERY_CACHE_KEY, {})
    for address, device in devices_by_address.items():
        # Cache paths independently. A display may be observed locally or by
        # gateway A while a short scan on gateway B misses one advertisement.
        # Replacing the whole device here used to erase the still-valid B path
        # immediately, making cards jump between gateways or disappear from the
        # connection map despite a strong previous RSSI.
        cached_device = discovery_cache.get(address)
        cached_paths = cached_device.get("paths", []) if isinstance(cached_device, dict) else []
        current_path_keys = {
            (str(path.get("type") or ""), str(path.get("id") or ""))
            for path in device.get("paths", [])
        }
        for cached_path in cached_paths if isinstance(cached_paths, list) else []:
            if not isinstance(cached_path, dict):
                continue
            path_key = (
                str(cached_path.get("type") or ""),
                str(cached_path.get("id") or ""),
            )
            if path_key in current_path_keys:
                continue
            path_seen_at = int(
                cached_path.get("last_seen_at")
                or cached_device.get("last_seen_at")
                or 0
            )
            if path_seen_at and now - path_seen_at <= DISCOVERY_GRACE_SECONDS:
                retained_path = dict(cached_path)
                retained_path["temporarily_unseen"] = True
                device.setdefault("paths", []).append(retained_path)
                current_path_keys.add(path_key)
        device["last_seen_at"] = now
        device["temporarily_unseen"] = False
        discovery_cache[address] = dict(device)
    for address, cached_device in list(discovery_cache.items()):
        if address in devices_by_address:
            continue
        last_seen_at = int(cached_device.get("last_seen_at") or 0)
        if last_seen_at and now - last_seen_at <= DISCOVERY_GRACE_SECONDS:
            retained = dict(cached_device)
            retained["temporarily_unseen"] = True
            retained["paths"] = [
                {**path, "temporarily_unseen": True}
                for path in retained.get("paths", [])
                if isinstance(path, dict)
            ]
            devices_by_address[address] = retained
        else:
            discovery_cache.pop(address, None)

    devices = list(devices_by_address.values())
    project_data = await _load_project_data(hass)
    device_names = project_data.get("device_names", {})
    gateway_preferences = project_data.get("device_gateway_preferences", {})
    for device in devices:
        device["paths"].sort(
            key=lambda path: (
                not bool(path.get("temporarily_unseen")),
                path.get("rssi") if isinstance(path.get("rssi"), (int, float)) else -999,
            ),
            reverse=True,
        )
        gateway_paths = [path for path in device["paths"] if path.get("type") == "gateway"]
        address = _normalize_address(device["address"])
        selected_gateway_id = str(gateway_preferences.get(address) or "")
        selected_gateway = next(
            (gateway for gateway in gateways if str(gateway.get("id") or "") == selected_gateway_id),
            None,
        )
        selected_path = next(
            (path for path in gateway_paths if str(path.get("id") or "") == selected_gateway_id),
            None,
        )
        if selected_gateway_id == LOCAL_ROUTE_ID:
            local_path = next(
                (path for path in device["paths"] if path.get("type") == "local"),
                None,
            )
            device["gateway_selection"] = "manual"
            device["selected_gateway_id"] = LOCAL_ROUTE_ID
            device["preferred_path"] = local_path or {
                "type": "local",
                "id": LOCAL_ROUTE_ID,
                "name": "Home Assistant Bluetooth",
                "rssi": None,
                "unavailable": True,
            }
            # A manual lock is exclusive.  Other gateway observations remain
            # useful in the raw discovery cache, but must not be exposed as
            # usable routes until the display is unlocked.
            device["paths"] = paths_allowed_by_gateway_lock(
                device["paths"], selected_gateway_id
            ) or [device["preferred_path"]]
        elif selected_gateway:
            device["gateway_selection"] = "manual"
            device["selected_gateway_id"] = selected_gateway_id
            device["preferred_path"] = selected_path or {
                "type": "gateway",
                "id": selected_gateway_id,
                "name": selected_gateway.get("name") or selected_gateway.get("host") or "DRATEK eInk gateway",
                "host": selected_gateway.get("host"),
                "rssi": None,
                "unavailable": True,
            }
            device["paths"] = paths_allowed_by_gateway_lock(
                device["paths"], selected_gateway_id
            ) or [device["preferred_path"]]
        else:
            device["gateway_selection"] = "auto"
            device["selected_gateway_id"] = ""
            active_paths = [p for p in device["paths"] if not p.get("temporarily_unseen")]
            if active_paths:
                active_gateways = [p for p in active_paths if p.get("type") == "gateway"]
                device["preferred_path"] = active_gateways[0] if active_gateways else active_paths[0]
            elif gateway_paths:
                device["preferred_path"] = gateway_paths[0]
            elif device["paths"]:
                device["preferred_path"] = device["paths"][0]
            else:
                # A device retained purely from a stale discovery_cache entry
                # (grace-period carry-forward, see the loop above) could reach
                # here with an empty "paths" list if that cached snapshot
                # never had one - device["paths"][0] used to raise IndexError
                # in that case, which crashed the whole scan (every device,
                # not just this one) instead of just marking this one
                # unavailable.
                device["preferred_path"] = {
                    "type": "local", "id": LOCAL_ROUTE_ID,
                    "name": "Home Assistant Bluetooth", "rssi": None, "unavailable": True,
                }
        device["rssi"] = device["preferred_path"].get("rssi")
        device["display_name"] = str(device_names.get(address, ""))

    devices.sort(key=lambda item: item["physical_code"])
    ble_devices.sort(key=lambda item: (item["name"] or "", item["address"]))

    if scanner_count == 0:
        debug.append("No active Bluetooth adapter or Bluetooth proxy was detected.")
    elif not devices:
        debug.append("Bluetooth works, but no DRATEK eInk advertisement was found.")
    else:
        debug.append(f"DRATEK eInk displays found: {len(devices)}")

    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "scanner_count": scanner_count,
            "ble_count": len(service_infos),
            "devices": devices,
            "ble_devices": ble_devices,
            "debug": debug,
        },
    )


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/devices/set_name",
        "address": str,
        "name": str,
    }
)
@websocket_api.async_response
async def websocket_set_device_name(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = _normalize_address(msg["address"])
    name = str(msg["name"] or "").strip()[:80]
    data = await _load_project_data(hass)
    if name:
        data["device_names"][address] = name
    else:
        data["device_names"].pop(address, None)
    await _project_store(hass).async_save(data)
    connection.send_result(msg["id"], {"address": address, "name": name})


@websocket_api.websocket_command(
    {
        "type": "dratek_eink/devices/set_gateway",
        "address": str,
        "gateway_id": str,
    }
)
@websocket_api.async_response
async def websocket_set_device_gateway(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    address = _normalize_address(msg["address"])
    gateway_id = str(msg.get("gateway_id") or "").strip()
    local_route = gateway_id == LOCAL_ROUTE_ID
    gateways = await async_load_gateways(hass)
    gateway = next(
        (item for item in gateways if str(item.get("id") or "") == gateway_id),
        None,
    )
    if gateway_id and not local_route and gateway is None:
        connection.send_error(msg["id"], "gateway_not_found", "Gateway was not found.")
        return

    data = await _load_project_data(hass)
    if gateway_id:
        data["device_gateway_preferences"][address] = gateway_id
    else:
        data["device_gateway_preferences"].pop(address, None)
    await _project_store(hass).async_save(data)
    await _save_gateway_preferences(hass, data["device_gateway_preferences"])

    transport_name = "Home Assistant Bluetooth" if local_route else str(
        (gateway or {}).get("name")
        or (gateway or {}).get("host")
        or ""
    )
    await get_entity_auto_update_manager(hass).async_set_gateway_preference(
        address,
        gateway_id,
        transport_name,
    )
    connection.send_result(
        msg["id"],
        {
            "address": address,
            "gateway_selection": "manual" if gateway_id else "auto",
            "gateway_id": gateway_id,
            "transport_name": transport_name,
        },
    )
