"""Home Assistant device-registry helpers for physical eInk displays."""

from __future__ import annotations

from typing import Any

from .const import DEVICE_SIZES, DOMAIN, SDK_MODELS


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


async def async_register_gateway_displays(
    hass: Any, config_entry_id: str, gateways: list[dict[str, Any]]
) -> int:
    """Discover displays behind gateways without requiring the panel to open."""
    from .discovery import parse_dratek_manufacturer_data
    from .gateway import async_scan_gateway

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
                    "preferred_path": {"type": "gateway", "id": gateway.get("id")},
                },
                gateways,
            )
            registered += 1
    return registered
