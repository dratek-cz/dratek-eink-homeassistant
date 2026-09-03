from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .const import DEVICE_SIZES, DRATEK_COMPANY_ID, SDK_MODELS


# CR2450 voltage is nearly flat through most of its life, so voltage can only
# provide an estimate. Anchors follow the typical loaded discharge curves from
# Panasonic and Energizer CR2450 datasheets, with a conservative end-of-life knee.
CR2450_VOLTAGE_PERCENT_CURVE = (
    (3.20, 100),
    (3.10, 96),
    (3.00, 85),
    (2.90, 55),
    (2.80, 20),
    (2.70, 8),
    (2.60, 4),
    (2.50, 2),
    (2.00, 0),
)


def cr2450_voltage_from_power_level(power_level: int | float | None) -> float | None:
    """Convert the SDK power level to volts without discarding precision."""
    if power_level is None:
        return None
    try:
        value = float(power_level)
    except (TypeError, ValueError):
        return None
    if not 0 < value < 255:
        return None
    # Current advertisements use decivolts (30 = 3.0 V). Accept volts too so a
    # future scanner can provide a more precise value such as 3.07 V.
    return value / 10.0 if value > 5 else value


def cr2450_percent_from_voltage(voltage: int | float | None) -> int | None:
    """Estimate remaining CR2450 capacity using piecewise interpolation."""
    if voltage is None:
        return None
    try:
        value = float(voltage)
    except (TypeError, ValueError):
        return None
    if value >= CR2450_VOLTAGE_PERCENT_CURVE[0][0]:
        return 100
    if value <= CR2450_VOLTAGE_PERCENT_CURVE[-1][0]:
        return 0
    for (high_v, high_percent), (low_v, low_percent) in zip(
        CR2450_VOLTAGE_PERCENT_CURVE,
        CR2450_VOLTAGE_PERCENT_CURVE[1:],
        strict=False,
    ):
        if low_v <= value <= high_v:
            ratio = (value - low_v) / (high_v - low_v)
            return round(low_percent + ratio * (high_percent - low_percent))
    return 0


@dataclass(slots=True)
class DratekAdvertisement:
    address: str
    name: str
    physical_code: str
    rssi: int | None
    raw_type: int
    sdk_type: int
    profile: int
    battery: int
    sw: int
    hw: int
    model: str

    @property
    def title(self) -> str:
        rssi = f", RSSI {self.rssi}" if self.rssi is not None else ""
        return f"{self.physical_code} - {self.model} ({self.address}{rssi})"

    @property
    def battery_voltage(self) -> float | None:
        return cr2450_voltage_from_power_level(self.battery)

    @property
    def battery_percent(self) -> int | None:
        return cr2450_percent_from_voltage(self.battery_voltage)


SDK_TYPE_BY_NAME = {
    "PE29R_V4_BLE": 43,
    "PE29R": 43,
}

MODEL_BY_SDK_TYPE = SDK_MODELS


# Bit 0x4000 of the advertised type is the display's own statement that it takes
# the packed planes verbatim; without it the vendor SDK frames them as a QuickLZ
# stream. The bit lives only in the advertisement - every send carries the masked
# SDK type - so remember what each address last advertised. Populated from both
# the Home Assistant scan and the gateway scan, since they share the parser below.
_ADVERTISED_RAW_TYPES: dict[str, int] = {}


def remember_raw_type(address: str, raw_type: int) -> None:
    if address:
        _ADVERTISED_RAW_TYPES[address.upper()] = int(raw_type)


def raw_type_for(address: str) -> int | None:
    """The last advertised type for an address, or None if never seen."""
    return _ADVERTISED_RAW_TYPES.get((address or "").upper())


def resolve_raw_type(hass: Any, address: str) -> int | None:
    """The advertised type, from our own scans or Home Assistant's own cache.

    The map above only fills once something scans, and a restart empties it. An
    automatic update that fires before the panel has been opened would then find
    no advertised type at all - which is exactly when the wrong payload framing
    is least recoverable, because the display accepts the transfer and refreshes
    nothing. Home Assistant keeps its own record of what its adapter has heard,
    so ask that before giving up.
    """
    remembered = raw_type_for(address)
    if remembered is not None:
        return remembered
    if hass is None:
        return None
    try:
        from homeassistant.components import bluetooth
    except ImportError:
        return None
    target = (address or "").upper()
    for service_info in bluetooth.async_discovered_service_info(hass, connectable=False):
        if str(getattr(service_info, "address", "")).upper() != target:
            continue
        # Parsing also feeds the map above, so the next send skips this walk.
        parsed = parse_dratek_advertisement(service_info)
        if parsed is not None:
            return parsed.raw_type
    return None


def sdk_type_from_raw(raw_type: int) -> int:
    if raw_type in MODEL_BY_SDK_TYPE:
        return raw_type
    masked_type = raw_type & 0x3FFF
    if masked_type in MODEL_BY_SDK_TYPE:
        return masked_type
    low_byte = raw_type & 0xFF
    if low_byte in MODEL_BY_SDK_TYPE:
        return low_byte
    return raw_type


def physical_code_from_address(address: str) -> str:
    parts = address.split(":")
    if len(parts) >= 4:
        return ".".join(part.upper() for part in parts[-4:])
    return address


def parse_dratek_advertisement(service_info: Any) -> DratekAdvertisement | None:
    manufacturer_data = getattr(service_info, "manufacturer_data", {}) or {}
    data = manufacturer_data.get(DRATEK_COMPANY_ID)
    if not data or len(data) < 5:
        return None

    return parse_dratek_manufacturer_data(
        address=getattr(service_info, "address", ""),
        name=getattr(service_info, "name", None) or getattr(service_info, "device", None),
        rssi=getattr(service_info, "rssi", None),
        data=data,
    )


def parse_dratek_manufacturer_data(
    address: str,
    name: Any,
    rssi: int | None,
    data: bytes | bytearray,
) -> DratekAdvertisement | None:
    """Parse the Picksmart payload as exposed by HA or a DRATEK gateway."""
    if len(data) < 5:
        return None
    if not isinstance(name, str) or not name:
        name = physical_code_from_address(address)
    raw_type = (data[4] << 8) | data[0]
    remember_raw_type(address, raw_type)
    sdk_type = sdk_type_from_raw(raw_type)
    upper_name = name.upper()
    for pattern, named_sdk_type in SDK_TYPE_BY_NAME.items():
        if pattern in upper_name:
            sdk_type = named_sdk_type
            break
    model = MODEL_BY_SDK_TYPE.get(sdk_type, f"Unknown DRATEK eInk type {sdk_type}")

    return DratekAdvertisement(
        address=address,
        name=name,
        physical_code=physical_code_from_address(address),
        rssi=rssi,
        raw_type=raw_type,
        sdk_type=sdk_type,
        profile=data[4],
        battery=data[1],
        sw=data[2],
        hw=data[3],
        model=model,
    )
