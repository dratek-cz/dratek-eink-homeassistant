from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .const import DEVICE_SIZES, DRATEK_COMPANY_ID


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


SDK_TYPE_BY_NAME = {
    "PE29R_V4_BLE": 43,
    "PE29R": 43,
}

MODEL_BY_SDK_TYPE = {
    11: "EPA LCD 212x104 BWR",
    40: "EPA LCD 296x128 BW",
    43: "EPA LCD 296x128 BWR / PE29R_V4_BLE",
    46: "EPA LCD 296x128 BWRY",
    48: "EPA LCD 296x128 BW 1",
    51: "EPA LCD 296x128 1 BWR",
    75: "EPA LCD 400x300 BWR",
    296: "DRATEK eInk PE29R 296x128 BWR",
    264: "EPA LCD 250x122 BWR",
    267: "EPA LCD 250x122 BWR",
    270: "EPA LCD 250x122 BWR",
}


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

    address = getattr(service_info, "address", "")
    name = getattr(service_info, "name", None) or getattr(service_info, "device", None)
    if not isinstance(name, str) or not name:
        name = physical_code_from_address(address)
    raw_type = (data[4] << 8) | data[0]
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
        rssi=getattr(service_info, "rssi", None),
        raw_type=raw_type,
        sdk_type=sdk_type,
        profile=data[4],
        battery=data[1],
        sw=data[2],
        hw=data[3],
        model=model,
    )


def is_supported_sdk_type(sdk_type: int) -> bool:
    return sdk_type in DEVICE_SIZES
