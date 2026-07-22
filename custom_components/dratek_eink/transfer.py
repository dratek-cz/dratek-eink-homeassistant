from __future__ import annotations

import asyncio
import logging
import math
import queue
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from bleak import BleakClient
from PIL import Image

from .const import CONTROL_CHARS, PARTIAL_UPDATE_SDK_TYPES, WRITE_CHARS
from .render import pack_bwr_image

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)
FINAL_CONFIRMATION_TIMEOUT_SECONDS = 15
WRITE_ACK_SDK_TYPES = {51}


class TransferCompletionTimeout(TimeoutError):
    """The payload was sent but the display did not confirm its final refresh."""


def _next_block(data: bytes, block_size: int, block_number: int) -> bytes:
    chunk_size = block_size - 4
    start = block_number * chunk_size
    end = min(len(data), start + chunk_size)
    return int(block_number).to_bytes(4, "little") + data[start:end]


def _format_bytes(data: bytes, limit: int = 80) -> str:
    text = data[:limit].hex(" ").upper()
    if len(data) > limit:
        text += f" ... ({len(data)} bytes)"
    return text


class DratekTransfer:
    def __init__(
        self,
        log: Callable[[str], None] | None = None,
        hass: HomeAssistant | None = None,
    ) -> None:
        self._log = log or _LOGGER.info
        self._hass = hass

    def log(self, message: str) -> None:
        self._log(message)

    async def send_image(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
    ) -> None:
        await self._send_with_retries(address, sdk_type, image, transform, partial=None)

    async def send_partial_image(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        x: int,
        y: int,
        width: int,
        height: int,
        clear_screen: int = 0,
        transform: str | None = None,
    ) -> None:
        if int(sdk_type) not in PARTIAL_UPDATE_SDK_TYPES:
            supported = ", ".join(str(item) for item in sorted(PARTIAL_UPDATE_SDK_TYPES))
            raise RuntimeError(f"Partial update is supported by the SDK only for type(s): {supported}.")
        if y % 8 != 0 or height % 8 != 0:
            raise ValueError("Partial update requires y and height to be divisible by 8.")
        if image.size != (width, height):
            raise ValueError(f"Partial image size {image.width}x{image.height} does not match area {width}x{height}.")
        partial = (int(x), int(y), int(width), int(height), int(clear_screen))
        await self._send_with_retries(address, sdk_type, image, transform, partial=partial)

    async def _send_with_retries(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
        partial: tuple[int, int, int, int, int] | None = None,
    ) -> None:
        last_error: Exception | None = None
        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            self.log(f"Transfer attempt {attempt}/{max_attempts}.")
            try:
                await self._send_once(address, sdk_type, image, transform, partial)
                self.log("Transfer completed.")
                return
            except Exception as exc:  # noqa: BLE stack can raise platform-specific exceptions
                last_error = exc
                if isinstance(exc, TransferCompletionTimeout):
                    self.log(
                        "The complete payload was accepted; this display does not send the optional "
                        "final refresh confirmation. Treating the transfer as completed."
                    )
                    return
                self.log(f"Transfer attempt {attempt}/{max_attempts} failed: {exc}")
                transient = self._is_transient_connection_error(exc)
                if attempt >= max_attempts or (attempt >= 3 and not transient):
                    break
                delay = (2, 3, 5, 8)[attempt - 1]
                if transient:
                    self.log(f"Bluetooth connection is temporarily unavailable; retrying in {delay}s.")
                await asyncio.sleep(delay)
        raise last_error or RuntimeError("Transfer failed.")

    async def _send_once(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
        partial: tuple[int, int, int, int, int] | None = None,
    ) -> None:
        payload = pack_bwr_image(sdk_type, image, transform)
        responses: queue.Queue[bytes] = queue.Queue()

        def notify_handler(_sender, data) -> None:
            packet = bytes(data)
            self.log(f"Notification: {packet.hex(' ').upper()}")
            responses.put(packet)

        connection_target = self._connection_target(address)
        self.log(f"Connecting to {address}...")
        async with BleakClient(connection_target, timeout=20.0) as client:
            if not client.is_connected:
                raise RuntimeError("Could not connect to the display.")

            service_uuid, control_char, write_char = self._find_transfer_chars(client)
            if not control_char or not write_char:
                raise RuntimeError("DRATEK eInk transfer characteristics were not found.")

            self.log(f"Using service {service_uuid}")
            await client.start_notify(control_char, notify_handler)
            write_notify_enabled = False
            if "notify" in write_char.properties or "indicate" in write_char.properties:
                await client.start_notify(write_char, notify_handler)
                write_notify_enabled = True
            await asyncio.sleep(0.4)

            block_size = await self._request_block_size(client, control_char, responses)
            if block_size < 8:
                raise RuntimeError(f"Invalid block size reported by display: {block_size}")

            total_blocks = math.ceil(len(payload) / (block_size - 4))
            self.log(f"Block size: {block_size}. Payload: {len(payload)} bytes, {total_blocks} blocks.")

            if partial is not None:
                await self._write_partial_position(client, control_char, responses, partial)

            command = bytes([2]) + len(payload).to_bytes(4, "little") + bytes([1])
            await self._write_char(client, control_char, command, "prepare update")
            await self._wait_for_response(responses, 2, ok_values={0}, label="screen update prepare")

            await self._write_char(client, control_char, bytes([3]), "start process")
            response = await self._wait_for_next_transfer_response(responses, 0, total_blocks)
            if len(response) < 6 or response[0] != 5 or response[1] != 0:
                raise RuntimeError(f"Display did not request first block: {response.hex(' ').upper()}")

            first_block = int.from_bytes(response[2:6], "little")
            if first_block >= total_blocks:
                raise RuntimeError(f"Display requested invalid block {first_block}/{total_blocks}")

            require_block_ack = int(sdk_type) in WRITE_ACK_SDK_TYPES
            if require_block_ack:
                self.log(f"SDK type {sdk_type} requires a GATT acknowledgement for every image block.")
            for block_number in range(first_block, total_blocks):
                await self._write_image_block(
                    client,
                    write_char,
                    _next_block(payload, block_size, block_number),
                    block_number,
                    require_response=require_block_ack,
                )
                await asyncio.sleep(0.005 if require_block_ack else 0.02)
                if block_number == first_block or block_number % 10 == 0 or block_number == total_blocks - 1:
                    sent = block_number - first_block + 1
                    percent = int((sent / total_blocks) * 100)
                    verb = "Acknowledged" if require_block_ack else "Sent"
                    self.log(f"{verb} block {block_number + 1}/{total_blocks} ({percent}%).")

            while True:
                try:
                    response = await self._wait_for_next_transfer_response(
                        responses,
                        total_blocks,
                        total_blocks,
                        timeout=FINAL_CONFIRMATION_TIMEOUT_SECONDS,
                    )
                except TimeoutError as exc:
                    raise TransferCompletionTimeout(
                        f"Timed out after {FINAL_CONFIRMATION_TIMEOUT_SECONDS}s waiting for the display "
                        "to confirm the completed refresh."
                    ) from exc
                if not response or response[0] != 5:
                    continue
                if len(response) > 1 and response[1] == 8:
                    break
                if len(response) >= 6 and response[1] == 0:
                    continue
                raise RuntimeError(f"Display rejected image transfer: {response.hex(' ').upper()}")

            if write_notify_enabled:
                await client.stop_notify(write_char)
            await client.stop_notify(control_char)

    def _connection_target(self, address: str) -> Any:
        if self._hass is None:
            return address

        from homeassistant.components import bluetooth

        ble_device = bluetooth.async_ble_device_from_address(
            self._hass,
            address,
            connectable=True,
        )
        if ble_device is not None:
            return ble_device

        diagnostics = ""
        try:
            from homeassistant.components.bluetooth import BluetoothReachabilityIntent

            diagnostics = bluetooth.async_address_reachability_diagnostics(
                self._hass,
                address,
                BluetoothReachabilityIntent.CONNECTION,
            )
        except (AttributeError, ImportError):
            pass
        detail = f" {diagnostics}" if diagnostics else ""
        raise RuntimeError(
            "Bluetooth connection is temporarily unavailable; no connectable adapter "
            f"currently has a free slot for {address}.{detail}"
        )

    @staticmethod
    def _is_transient_connection_error(exc: Exception) -> bool:
        message = str(exc).lower()
        return any(
            marker in message
            for marker in (
                "available connection slot",
                "temporarily unavailable",
                "le-connection-abort",
                "device with address",
                "not connected",
                "could not connect",
            )
        )

    def _find_transfer_chars(self, client):
        fallback_control = None
        fallback_write = None
        for service in client.services:
            control_char = None
            write_char = None
            for char in service.characteristics:
                uuid = char.uuid.lower()
                if uuid in CONTROL_CHARS:
                    control_char = char
                    fallback_control = fallback_control or char
                elif uuid in WRITE_CHARS:
                    write_char = char
                    fallback_write = fallback_write or char
            if control_char and write_char:
                return service.uuid, control_char, write_char
        return "-", fallback_control, fallback_write

    async def _write_char(self, client, char, data: bytes, label: str, response: bool | None = None) -> None:
        if response is None:
            response = "write" in char.properties
        if label.startswith("block "):
            self.log(f"Write {label}: {len(data)} bytes")
        else:
            self.log(f"Write {label}: {_format_bytes(data)}")
        await client.write_gatt_char(char, data, response=response)

    async def _write_image_block(
        self,
        client,
        write_char,
        data: bytes,
        block_number: int,
        *,
        require_response: bool,
    ) -> None:
        max_attempts = 3 if require_response else 1
        for attempt in range(1, max_attempts + 1):
            try:
                await self._write_char(
                    client,
                    write_char,
                    data,
                    f"block {block_number}",
                    response=require_response,
                )
                return
            except Exception as exc:  # noqa: BLE stacks expose platform-specific write errors
                if attempt >= max_attempts:
                    raise
                self.log(
                    f"Image block {block_number} was not acknowledged ({exc}); "
                    f"retrying {attempt + 1}/{max_attempts}."
                )
                await asyncio.sleep(0.1)

    async def _request_block_size(self, client, control_char, responses: queue.Queue[bytes]) -> int:
        attempts: list[bool] = []
        if "write" in control_char.properties:
            attempts.append(True)
        if "write-without-response" in control_char.properties:
            attempts.append(False)
        attempts.extend([True, False])

        used: set[bool] = set()
        for response_mode in attempts:
            if response_mode in used:
                continue
            used.add(response_mode)
            self._clear_queue(responses)
            await self._write_char(client, control_char, bytes([1]), "block size request", response=response_mode)
            try:
                return await self._wait_for_block_size(responses, timeout=4)
            except TimeoutError:
                self.log("No block-size response; retrying...")
        raise TimeoutError("Timed out waiting for block size response.")

    async def _write_partial_position(
        self,
        client,
        control_char,
        responses: queue.Queue[bytes],
        partial: tuple[int, int, int, int, int],
    ) -> None:
        x, y, width, height, clear_screen = partial
        payload = (
            bytes([0x60])
            + x.to_bytes(4, "little", signed=False)
            + y.to_bytes(4, "little", signed=False)
            + width.to_bytes(4, "little", signed=False)
            + height.to_bytes(4, "little", signed=False)
            + clear_screen.to_bytes(4, "little", signed=False)
        )
        self._clear_queue(responses)
        self.log(f"Partial update area: x={x}, y={y}, width={width}, height={height}, clear={clear_screen}.")
        await self._write_char(client, control_char, payload, "partial update area")
        await self._wait_for_response(responses, 0x60, ok_values={0}, label="partial update area")

    async def _wait_for_block_size(self, responses: queue.Queue[bytes], timeout: int = 10) -> int:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            try:
                data = await asyncio.to_thread(responses.get, True, 1)
            except queue.Empty:
                continue
            if len(data) >= 3 and data[0] == 1:
                return int(data[1]) or int(data[2])
        raise TimeoutError("Timed out waiting for block size response.")

    async def _wait_for_response(
        self,
        responses: queue.Queue[bytes],
        prefix: int,
        ok_values: set[int] | None = None,
        label: str = "response",
        timeout: int = 10,
    ) -> bytes:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            try:
                data = await asyncio.to_thread(responses.get, True, 1)
            except queue.Empty:
                continue
            if data and data[0] == prefix:
                if ok_values is None or (len(data) > 1 and data[1] in ok_values):
                    return data
                raise RuntimeError(f"Display rejected {label}: {data.hex(' ').upper()}")
        raise TimeoutError(f"Timed out waiting for {label}.")

    async def _wait_for_next_transfer_response(
        self,
        responses: queue.Queue[bytes],
        after_block: int,
        total_blocks: int,
        timeout: int = 20,
    ) -> bytes:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            try:
                data = await asyncio.to_thread(responses.get, True, 1)
            except queue.Empty:
                continue
            if not data or data[0] != 5:
                continue
            if len(data) > 1 and data[1] == 8:
                return data
            if len(data) >= 6 and data[1] == 0:
                requested = int.from_bytes(data[2:6], "little")
                if requested >= after_block or requested >= total_blocks:
                    return data
        raise TimeoutError("Timed out waiting for transfer response.")

    @staticmethod
    def _clear_queue(responses: queue.Queue[bytes]) -> None:
        while not responses.empty():
            try:
                responses.get_nowait()
            except queue.Empty:
                break
