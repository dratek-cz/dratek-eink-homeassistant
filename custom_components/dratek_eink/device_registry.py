"""Home Assistant device-registry helpers for physical eInk displays."""

from __future__ import annotations

from typing import Any

from .const import DEVICE_SIZES, DOMAIN, SDK_MODELS

DISPLAY_STATE_DATA_KEY = "display_entity_states"


def display_update_signal(config_entry_id: str) -> str:
    """Return the dispatcher signal shared by a display's HA entities."""
    return f"{DOMAIN}_display_update_{config_entry_id}"


def display_states(hass: Any) -> dict[str, dict[str, Any]]:
    """Return the in-memory last-known telemetry for physical displays."""
    return hass.data.setdefault(DOMAIN, {}).setdefault(DISPLAY_STATE_DATA_KEY, {})


def display_state(hass: Any, address: str) -> dict[str, Any]:
    """Return one normalized display state without performing I/O."""
    return display_states(hass).get(str(address or "").strip().upper(), {})


def display_device_info(hass: Any, address: str) -> dict[str, Any]:
    """Build entity device_info matching the physical registry device."""
    normalized = str(address or "").strip().upper()
    state = display_state(hass, normalized)
    try:
        sdk_type = int(state.get("sdk_type") or 0)
    except (TypeError, ValueError):
        sdk_type = 0
    width = state.get("width")
    height = state.get("height")
    if (not width or not height) and sdk_type in DEVICE_SIZES:
        width, height = DEVICE_SIZES[sdk_type]
    model = str(state.get("model") or SDK_MODELS.get(sdk_type) or "DRATEK eInk Display")
    if width and height and f"{width}x{height}" not in model:
        model = f"{model} ({width}×{height})"
    return {
        "identifiers": {(DOMAIN, f"display:{normalized}")},
        "name": str(
            state.get("display_name")
            or state.get("name")
            or f"DRATEK eInk {normalized}"
        ),
        "manufacturer": "DRATEK.CZ",
        "model": model,
    }


def integration_entry_id(hass: Any) -> str | None:
    """Return the integration entry that owns physical DRATEK devices."""
    config_entries = getattr(hass, "config_entries", None)
    async_entries = getattr(config_entries, "async_entries", None)
    if callable(async_entries):
        entries = async_entries(DOMAIN)
        if entries:
            return entries[0].entry_id
    loaded = hass.data.get(DOMAIN, {}).get("entries", {})
    return next(iter(loaded), None) if isinstance(loaded, dict) else None


def register_display_device(
    hass: Any,
    config_entry_id: str,
    display: dict[str, Any],
    gateways: list[dict[str, Any]] | None = None,
) -> None:
    """Create or update one display as part of the DRATEK eInk integration."""
    from homeassistant.helpers import device_registry as dr

    address = str(
        display.get("address") or display.get("device_address") or ""
    ).strip().upper()
    if not address:
        return

    # Preserve the last real telemetry when a later project migration only
    # supplies static metadata. Every entity reads this one push-updated map,
    # so adding sensors never causes another BLE scan or drains the display.
    states = display_states(hass)
    current_state = states.setdefault(address, {"address": address})
    for key, value in display.items():
        if value is not None:
            current_state[key] = value
    current_state["address"] = address
    try:
        sdk_type = int(display.get("sdk_type") or 0)
    except (TypeError, ValueError):
        sdk_type = 0
    width = display.get("width")
    height = display.get("height")
    if (not width or not height) and sdk_type in DEVICE_SIZES:
        width, height = DEVICE_SIZES[sdk_type]
    model = str(display.get("model") or SDK_MODELS.get(sdk_type) or "DRATEK eInk Display")
    if width and height and f"{width}x{height}" not in model:
        model = f"{model} ({width}×{height})"

    via_device = None
    preferred = display.get("preferred_path")
    if isinstance(preferred, dict) and preferred.get("type") == "gateway":
        gateway_ref = str(preferred.get("id") or "")
        gateway = next(
            (
                item
                for item in gateways or []
                if str(item.get("id") or "") == gateway_ref
            ),
            None,
        )
        if gateway:
            status = gateway.get("status") if isinstance(gateway.get("status"), dict) else {}
            stable_id = str(
                gateway.get("gateway_id") or status.get("gateway_id") or ""
            ).strip()
            if stable_id:
                via_device = (DOMAIN, f"gateway:{stable_id}")

    physical_code = str(display.get("physical_code") or "").strip()
    name = str(
        display.get("display_name")
        or display.get("name")
        or (f"DRATEK eInk {physical_code}" if physical_code else f"DRATEK eInk {address}")
    ).strip()
    registry = dr.async_get(hass)
    registry.async_get_or_create(
        config_entry_id=config_entry_id,
        identifiers={(DOMAIN, f"display:{address}")},
        name=name,
        manufacturer="DRATEK.CZ",
        model=model,
        hw_version=str(display.get("hw") or "") or None,
        sw_version=str(display.get("sw") or "") or None,
        serial_number=physical_code or address,
        via_device=via_device,
    )
    try:
        from homeassistant.helpers.dispatcher import async_dispatcher_send

        async_dispatcher_send(hass, display_update_signal(config_entry_id), address)
    except (ImportError, RuntimeError):
        # Static test harnesses and early HA startup may not expose dispatcher.
        pass


async def async_register_gateway_displays(
    hass: Any, config_entry_id: str, gateways: list[dict[str, Any]]
) -> int:
    """Discover displays behind gateways without requiring the panel to open."""
    from .discovery import parse_dratek_manufacturer_data
    from .gateway import async_scan_gateway
    import time

    registered = 0
    for gateway in gateways:
        try:
            result = await async_scan_gateway(hass, str(gateway.get("id") or ""), 4)
        except Exception:
            continue
        if not result or not result.get("ok"):
            continue
        for remote in result.get("devices", []):
            if not isinstance(remote, dict) or not remote.get("dratek"):
                continue
            address = str(remote.get("address") or "").upper()
            try:
                manufacturer = bytes.fromhex(str(remote.get("manufacturer_data") or ""))
            except ValueError:
                continue
            if len(manufacturer) >= 2 and int.from_bytes(manufacturer[:2], "little") == 0x5053:
                manufacturer = manufacturer[2:]
            parsed = parse_dratek_manufacturer_data(
                address, remote.get("name"), remote.get("rssi"), manufacturer
            )
            if parsed is None:
                continue
            register_display_device(
                hass,
                config_entry_id,
                {
                    "address": parsed.address,
                    "name": parsed.name,
                    "physical_code": parsed.physical_code,
                    "sdk_type": parsed.sdk_type,
                    "model": parsed.model,
                    "hw": parsed.hw,
                    "sw": parsed.sw,
                    "battery": parsed.battery,
                    "battery_raw": parsed.battery,
                    "battery_voltage": parsed.battery_voltage,
                    "battery_percent": parsed.battery_percent,
                    "battery_estimated": True,
                    "rssi": parsed.rssi,
                    "last_seen_at": int(time.time()),
                    "temporarily_unseen": False,
                    "preferred_path": {"type": "gateway", "id": gateway.get("id")},
                },
                gateways,
            )
            registered += 1
    return registered
