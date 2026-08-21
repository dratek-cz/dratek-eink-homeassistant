"""Send one image to a label through a gateway, raw or in the vendor framing.

A display states in its advertisement whether it takes the packed planes as they
are: bit 0x4000 of the advertised type. Without it the label expects the vendor's
QuickLZ stream, and fed raw planes it accepts every block, acknowledges the
transfer and then refreshes nothing - which is impossible to tell apart from
success in a transfer log. This script makes the difference visible on the panel.

    python tools/dratek-eink-probe.py --gateway 192.168.1.130 --scan
    python tools/dratek-eink-probe.py --gateway 192.168.1.130 --address FF:FF:99:80:41:52
    python tools/dratek-eink-probe.py --gateway 192.168.1.130 --address ... --mode raw

Needs `requests` and Pillow. It talks to the gateway's HTTP API directly, so
Home Assistant does not have to be running and the PC needs no Bluetooth.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
import time
import types
import uuid
from pathlib import Path

import requests
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "dratek_eink"
COMPANY_ID = 0x5053


def _load_component_module(name: str):
    package_name = "dratek_probe_component"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__path__ = [str(COMPONENT)]
        sys.modules[package_name] = package
    spec = importlib.util.spec_from_file_location(
        f"{package_name}.{name}", COMPONENT / f"{name}.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nelze nacist modul {name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[f"{package_name}.{name}"] = module
    spec.loader.exec_module(module)
    return module


render = _load_component_module("render")
quicklz = _load_component_module("quicklz")
discovery = _load_component_module("discovery")


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')}  {message}", flush=True)


def scan(gateway: str, seconds: int) -> dict[str, dict]:
    """List the labels the gateway can hear, with the framing each one asks for."""
    log(f"Sken pres gateway {gateway} ({seconds} s)...")
    result = requests.get(
        f"http://{gateway}/api/scan", params={"seconds": seconds}, timeout=seconds + 30
    ).json()

    found: dict[str, dict] = {}
    for device in result.get("devices", []):
        if not device.get("dratek"):
            continue
        raw = bytes.fromhex(str(device.get("manufacturer_data") or ""))
        if len(raw) >= 2 and int.from_bytes(raw[:2], "little") == COMPANY_ID:
            raw = raw[2:]
        parsed = discovery.parse_dratek_manufacturer_data(
            address=str(device.get("address") or "").upper(),
            name=device.get("name"),
            rssi=device.get("rssi"),
            data=raw,
        )
        if parsed is None:
            continue
        framing = "QuickLZ" if quicklz.needs_vendor_framing(parsed.raw_type) else "syrova data"
        log(
            f"  {parsed.address}  {parsed.model}  raw_type={parsed.raw_type} "
            f"(0x{parsed.raw_type:04X})  sw={parsed.sw}  rssi={parsed.rssi}  -> {framing}"
        )
        found[parsed.address] = {
            "sdk_type": parsed.sdk_type,
            "raw_type": parsed.raw_type,
            "software": parsed.sw,
        }
    if not found:
        log("  Gateway nenasla zadny displej.")
    return found


def test_pattern(width: int, height: int, caption: str) -> Image.Image:
    """A picture whose success or failure is obvious across the room."""
    image = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width - 1, height - 1), outline=(0, 0, 0), width=8)
    draw.rectangle((40, 60, width // 2 - 20, height - 60), fill=(0, 0, 0))
    draw.rectangle((width // 2 + 20, 60, width - 40, height - 60), fill=(220, 20, 12))
    draw.text((56, 24), caption, fill=(0, 0, 0))
    return image


def send(
    gateway: str,
    address: str,
    payload: bytes,
    software: int,
    timeout: float,
    partial: tuple[int, int, int, int] | None = None,
) -> bool:
    job_id = uuid.uuid4().hex[:16]
    params = {
        "address": address,
        "id": job_id,
        "software_version": software,
        "size": len(payload),
    }
    if partial is not None:
        x, y, width, height = partial
        params.update({"partial": 1, "x": x, "y": y, "width": width, "height": height})
    upload_deadline = time.monotonic() + timeout
    while True:
        response = requests.post(
            f"http://{gateway}/api/transfer/upload",
            params=params,
            files={"payload": ("display.bin", payload, "application/octet-stream")},
            timeout=180,
        )
        if response.status_code != 409 or time.monotonic() >= upload_deadline:
            break
        time.sleep(0.25)
    if response.status_code >= 300:
        log(f"Gateway odmitla upload: {response.status_code} {response.text[:200]}")
        return False
    log(f"Uloha {job_id} prijata, {len(payload)} B.")

    seen = 0
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        time.sleep(3)
        try:
            status = requests.get(
                f"http://{gateway}/api/transfer/status",
                params={"id": job_id},
                timeout=15,
            ).json()
        except Exception as exc:
            log(f"  stav nedostupny: {exc}")
            continue
        lines = status.get("log") or []
        for line in lines[seen:]:
            log(f"  {line}")
        seen = len(lines)
        state = status.get("status")
        if state == "succeeded":
            return True
        if state == "failed":
            log(f"Prenos selhal: {status.get('error')}")
            return False
    log("Vyprsel cas cekani na dokonceni prenosu.")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway", required=True, help="IP adresa gatewaye")
    parser.add_argument("--address", help="MAC adresa displeje")
    parser.add_argument("--scan", action="store_true", help="jen vypsat displeje")
    parser.add_argument(
        "--partial-test",
        action="store_true",
        help="otestovat prikaz 0x60 malym vyrezem 31x32 v levem hornim rohu",
    )
    parser.add_argument("--scan-seconds", type=int, default=10)
    parser.add_argument("--sdk-type", type=int, help="jinak podle inzerce")
    parser.add_argument("--software-version", type=int, help="preskoci scan pri partial testu")
    parser.add_argument(
        "--mode",
        choices=("auto", "raw", "framed"),
        default="auto",
        help="auto se ridi bitem 0x4000, raw a framed formu vynuti",
    )
    parser.add_argument("--image", type=Path, help="obrazek (jinak testovaci vzor)")
    parser.add_argument("--timeout", type=float, default=300.0)
    args = parser.parse_args()

    direct_partial = bool(
        args.partial_test
        and args.address
        and args.sdk_type
        and args.software_version is not None
    )
    devices = {} if direct_partial else scan(args.gateway, args.scan_seconds)
    if args.scan:
        return 0
    if not args.address:
        parser.error("--address je povinna, pokud nejde jen o --scan")

    address = args.address.upper()
    advertised = devices.get(address)
    if direct_partial:
        advertised = {
            "sdk_type": args.sdk_type,
            "raw_type": 0,
            "software": args.software_version,
        }
    if advertised is None:
        log(f"{address} neni v dosahu gatewaye.")
        return 1

    sdk_type = args.sdk_type or advertised["sdk_type"]
    if args.partial_test:
        width, height = 31, 32
        image = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, width - 1, height - 1), outline="black", width=4)
        draw.rectangle((10, 10, 20, 21), fill="black")
        payload = render.pack_bwr_region(image)
        log(
            f"Partial probe 0x60: oblast 0,0 {width}x{height}, payload {len(payload)} B."
        )
        ok = send(
            args.gateway,
            address,
            payload,
            advertised["software"],
            args.timeout,
            partial=(0, 0, width, height),
        )
        log("Partial probe dokoncen." if ok else "Partial probe byl odmitnut.")
        return 0 if ok else 1

    width, height = render.display_size(sdk_type)
    if args.image:
        image = Image.open(args.image).convert("RGB").resize((width, height), Image.LANCZOS)
    else:
        image = test_pattern(width, height, f"{args.mode} {time.strftime('%H:%M:%S')}")

    payload = render.pack_bwr_image(sdk_type, image)
    log(f"Zabaleno {len(payload)} B pro SDK typ {sdk_type}.")

    framed = args.mode == "framed" or (
        args.mode == "auto" and quicklz.needs_vendor_framing(advertised["raw_type"])
    )
    if framed:
        payload = quicklz.frame_payload(payload, sdk_type)
        log(f"QuickLZ ramec: {len(payload)} B, hlavicka {payload[:7].hex(' ')}.")

    ok = send(args.gateway, address, payload, advertised["software"], args.timeout)
    log("Hotovo - podivejte se na displej." if ok else "Prenos nedobehl.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
