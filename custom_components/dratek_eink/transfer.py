from __future__ import annotations

import asyncio
import logging
import math
import queue
from collections.abc import Callable

from bleak import BleakClient
from PIL import Image

from .const import CONTROL_CHARS, WRITE_CHARS
from .render import pack_bwr_image

_LOGGER = logging.getLogger(__name__)


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
    def __init__(self, log: Callable[[str], None] | None = None) -> None:
        self._log = log or _LOGGER.info

    def log(self, message: str) -> None:
        self._log(message)

    async def send_image(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
    ) -> None:
        last_error: Exception | None = None
        for attempt in range(1, 4):
            self.log(f"Transfer attempt {attempt}/3.")
            try:
                await self._send_once(address, sdk_type, image, transform)
                self.log("Transfer completed.")
                return
            except Exception as exc:  # noqa: BLE stack can raise platform-specific exceptions
                last_error = exc
                self.log(f"Transfer attempt {attempt}/3 failed: {exc}")
                if attempt < 3:
                    await asyncio.sleep(2)
        raise last_error or RuntimeError("Transfer failed.")

    async def _send_once(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
    ) -> None:
        payload = pack_bwr_image(sdk_type, image, transform)
        responses: queue.Queue[bytes] = queue.Queue()

        def notify_handler(_sender, data) -> None:
            packet = bytes(data)
            self.log(f"Notification: {packet.hex(' ').upper()}")
            responses.put(packet)

        self.log(f"Connecting to {address}...")
        async with BleakClient(address, timeout=20.0) as client:
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

            for block_number in range(first_block, total_blocks):
                await self._write_char(
                    client,
                    write_char,
                    _next_block(payload, block_size, block_number),
                    f"block {block_number}",
                    response=False,
                )
                await asyncio.sleep(0.02)
                if block_number == first_block or block_number % 10 == 0 or block_number == total_blocks - 1:
                    sent = block_number - first_block + 1
                    percent = int((sent / total_blocks) * 100)
                    self.log(f"Sent block {block_number + 1}/{total_blocks} ({percent}%).")

            while True:
                response = await self._wait_for_next_transfer_response(responses, total_blocks, total_blocks, timeout=30)
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
