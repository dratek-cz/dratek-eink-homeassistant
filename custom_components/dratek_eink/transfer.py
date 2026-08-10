from __future__ import annotations

import asyncio
import logging
import math
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from bleak import BleakClient
from PIL import Image

from .const import (
    CONTROL_CHARS,
    DRATEK_COMPANY_ID,
    PARTIAL_UPDATE_CONFIRMED_SDK_TYPES,
    WRITE_CHARS,
)
from .render import pack_bwr_image, pack_bwr_region

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)
WRITE_ACK_SDK_TYPES = {51}
FINAL_BLOCK_RESPONSE_TIMEOUT = 2
MTU_NEGOTIATION_TIMEOUT = 4
RGB_LED_COMMAND = 0x30
FLASH_IDENTIFY_COMMAND = 0x22
FULL_REFRESH_MODE = 0x01
BLOCK_REQUEST_TIMEOUT = 12
OPTIONAL_COMPLETION_TIMEOUT = 2
UNCONFIRMED_WRITE_DRAIN_TIMEOUT = 10
MAX_BLOCK_REQUEST_RETRIES = 5
GATT_OPERATION_TIMEOUT = 8
TEARDOWN_OPERATION_TIMEOUT = 5
STREAM_WRITE_DELAY = 0.04
MIN_RECONNECT_INTERVAL_SECONDS = 6.0


# Keyed by normalised address, shared across every DratekTransfer instance for
# the life of the process (a fresh instance is created per call, so per-address
# reconnect timing has nowhere else to live). See _connected_client.
_LAST_DISCONNECT_AT: dict[str, float] = {}


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

    @asynccontextmanager
    async def _connected_client(self, connection_target: Any, address: str) -> AsyncIterator[BleakClient]:
        """Connect and guarantee a disconnect even if this task is cancelled mid-transfer.

        A manual upload replaces a running automatic refresh's automation config
        (EntityAutoUpdateManager.async_set_config) or preempts it
        (TransferQueue._preempt_automatic_update), and Home Assistant itself
        cancels outstanding tasks on integration reload and shutdown. Any of these
        can land while this task is deep inside a block write, awaiting a GATT
        response.

        BleakClient's own async context manager already calls disconnect() from
        its __aexit__, but that disconnect is just another await point: a
        cancellation already pending on this task aborts it before the adapter
        ever receives the disconnect request. The BLE connection - and the
        adapter's limited connection slot - is left half-open. Repeated over
        enough manual uploads, that is what turns a 5-second transfer into one
        that eventually needs the 10-minute safety timeout: every slot is stuck
        waiting on a peer that was never told to let go.

        Shielding the disconnect from the outer cancellation gives it a real
        chance to complete before the CancelledError is allowed through.

        That shield alone isn't enough, though: write_gatt_char already has a
        bounded timeout (GATT_OPERATION_TIMEOUT), but disconnect() and the
        start_notify/stop_notify calls around it did not. On this same flaky
        stack, one of those can simply hang instead of erroring, and since
        every BLE op for one display is serialised behind TransferQueue's
        per-address lock, a hung teardown after transfer N blocks transfer
        N+1 for as long as it hangs - the "gets slower every few uploads"
        pattern, capped only by the 10-minute job safety net. Bounding every
        teardown call at TEARDOWN_OPERATION_TIMEOUT keeps that worst case a
        few seconds instead of minutes, so upload N+10 connects exactly like
        upload 1 regardless of how the previous session's teardown went.

        A cheap embedded BLE stack, like this display's, can still be tearing
        down its previous connection when a new one arrives right on top of it,
        and answers slowly or not at all - indistinguishable from here from a
        congested adapter, and exactly the "fine for the first few transfers,
        then stuck near the safety timeout" pattern a burst of manual sends can
        trigger. A short forced gap between one session's disconnect and the
        next connect *to the same address* gives the peripheral time to actually
        be ready, without slowing anything unrelated down - other addresses and
        gateway-routed transfers never wait on this.
        """
        normalized_address = address.upper()
        last_disconnect = _LAST_DISCONNECT_AT.get(normalized_address)
        if last_disconnect is not None:
            loop = asyncio.get_running_loop()
            wait_seconds = MIN_RECONNECT_INTERVAL_SECONDS - (loop.time() - last_disconnect)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
        client = BleakClient(connection_target, timeout=20.0)
        try:
            await client.connect()
            yield client
        finally:
            try:
                async with asyncio.timeout(TEARDOWN_OPERATION_TIMEOUT):
                    await asyncio.shield(client.disconnect())
            except Exception as exc:
                self.log(
                    f"Disconnect cleanup raised {exc}; the Bluetooth slot may take "
                    "longer than usual to free."
                )
            _LAST_DISCONNECT_AT[normalized_address] = asyncio.get_running_loop().time()

    async def _async_pack(
        self,
        sdk_type: int,
        image: Image.Image,
        transform: str | None,
        orientation: str | None,
    ) -> bytes:
        """Pack the bitmap off the event loop.

        Quantising and bit-packing a large panel is pure CPU work, so running it
        inline would stall every other Home Assistant task for the duration. The
        gateway path already offloads it; the local Bluetooth path must too.
        """
        if self._hass is not None:
            return await self._hass.async_add_executor_job(
                pack_bwr_image, sdk_type, image, transform, orientation
            )
        return await asyncio.to_thread(
            pack_bwr_image, sdk_type, image, transform, orientation
        )

    async def _async_pack_region(self, image: Image.Image) -> bytes:
        if self._hass is not None:
            return await self._hass.async_add_executor_job(pack_bwr_region, image)
        return await asyncio.to_thread(pack_bwr_region, image)

    async def send_image(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
        orientation: str | None = None,
        software_version: int | None = None,
    ) -> None:
        await self._send_with_retries(
            address,
            sdk_type,
            image,
            transform,
            partial=None,
            orientation=orientation,
            software_version=software_version,
        )

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
        software_version: int | None = None,
    ) -> None:
        if int(sdk_type) not in PARTIAL_UPDATE_CONFIRMED_SDK_TYPES:
            self.log(
                f"Partial update on SDK type {sdk_type} is untested - the vendor SDK does not "
                "restrict it by model, but only type(s) "
                f"{', '.join(str(item) for item in sorted(PARTIAL_UPDATE_CONFIRMED_SDK_TYPES))} "
                "have been confirmed on hardware. If the display ignores it or refreshes "
                "incorrectly, send the whole design instead."
            )
        if y % 8 != 0 or height % 8 != 0:
            raise ValueError("Partial update requires y and height to be divisible by 8.")
        if image.size != (width, height):
            raise ValueError(f"Partial image size {image.width}x{image.height} does not match area {width}x{height}.")
        partial = (int(x), int(y), int(width), int(height), int(clear_screen))
        await self._send_with_retries(
            address,
            sdk_type,
            image,
            transform,
            partial=partial,
            software_version=software_version,
        )

    async def set_rgb_led(
        self,
        address: str,
        mode: int,
        flash_time: int,
        red: int,
        green: int,
        blue: int,
    ) -> None:
        """Set the display's RGB indicator using the command defined by the vendor SDK."""
        values = {
            "mode": mode,
            "flash_time": flash_time,
            "red": red,
            "green": green,
            "blue": blue,
        }
        if int(mode) not in {0, 1, 2}:
            raise ValueError("RGB LED mode must be 0 (off), 1 (on), or 2 (flash).")
        for name, value in values.items():
            if not 0 <= int(value) <= 255:
                raise ValueError(f"RGB LED {name} must be between 0 and 255.")

        packet = bytes(
            [
                RGB_LED_COMMAND,
                int(mode),
                int(flash_time),
                int(red),
                int(green),
                int(blue),
            ]
        )
        last_error: Exception | None = None
        for attempt in range(1, 4):
            self.log(f"RGB LED attempt {attempt}/3.")
            try:
                await self._set_rgb_led_once(address, packet)
                self.log("RGB LED setting accepted by the display.")
                return
            except Exception as exc:  # BLE stack can raise platform-specific exceptions
                last_error = exc
                self.log(f"RGB LED attempt {attempt}/3 failed: {exc}")
                if attempt < 3:
                    await asyncio.sleep(attempt)
        raise last_error or RuntimeError("RGB LED setting failed.")

    async def _set_rgb_led_once(self, address: str, packet: bytes) -> None:
        responses: asyncio.Queue[bytes] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def notify_handler(_sender, data) -> None:
            response = bytes(data)
            self.log(f"Notification: {response.hex(' ').upper()}")
            loop.call_soon_threadsafe(responses.put_nowait, response)

        connection_target = self._connection_target(address)
        self.log(f"Connecting to {address} for RGB LED control...")
        async with self._connected_client(connection_target, address) as client:
            if not client.is_connected:
                raise RuntimeError("Could not connect to the display.")
            service_uuid, control_char, _write_char = self._find_transfer_chars(client)
            if not control_char:
                raise RuntimeError("DRATEK eInk control characteristic was not found.")
            self.log(f"Using service {service_uuid}")
            await self._start_notify(client, control_char, notify_handler)
            try:
                await asyncio.sleep(0.25)
                await self._write_char(client, control_char, packet, "RGB LED")
                await self._wait_for_response(
                    responses,
                    RGB_LED_COMMAND,
                    ok_values={0},
                    label="RGB LED setting",
                    timeout=5,
                )
            finally:
                await self._stop_notify(client, control_char)

    async def flash_identify(self, address: str) -> None:
        """Blink the display's indicator once so it can be located ("find me")."""
        packet = bytes([FLASH_IDENTIFY_COMMAND])
        last_error: Exception | None = None
        for attempt in range(1, 4):
            self.log(f"Find me attempt {attempt}/3.")
            try:
                await self._flash_identify_once(address, packet)
                self.log("Find me command accepted by the display.")
                return
            except Exception as exc:  # BLE stack can raise platform-specific exceptions
                last_error = exc
                self.log(f"Find me attempt {attempt}/3 failed: {exc}")
                if attempt < 3:
                    await asyncio.sleep(attempt)
        raise last_error or RuntimeError("Find me command failed.")

    async def _flash_identify_once(self, address: str, packet: bytes) -> None:
        responses: asyncio.Queue[bytes] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def notify_handler(_sender, data) -> None:
            response = bytes(data)
            self.log(f"Notification: {response.hex(' ').upper()}")
            loop.call_soon_threadsafe(responses.put_nowait, response)

        connection_target = self._connection_target(address)
        self.log(f"Connecting to {address} for find-me flash...")
        async with self._connected_client(connection_target, address) as client:
            if not client.is_connected:
                raise RuntimeError("Could not connect to the display.")
            service_uuid, control_char, _write_char = self._find_transfer_chars(client)
            if not control_char:
                raise RuntimeError("DRATEK eInk control characteristic was not found.")
            self.log(f"Using service {service_uuid}")
            await self._start_notify(client, control_char, notify_handler)
            try:
                await asyncio.sleep(0.25)
                await self._write_char(client, control_char, packet, "find me")
                await self._wait_for_response(
                    responses,
                    FLASH_IDENTIFY_COMMAND,
                    ok_values={0},
                    label="find me",
                    timeout=5,
                )
            finally:
                await self._stop_notify(client, control_char)


    async def _send_with_retries(
        self,
        address: str,
        sdk_type: int,
        image: Image.Image,
        transform: str | None = None,
        partial: tuple[int, int, int, int, int] | None = None,
        orientation: str | None = None,
        software_version: int | None = None,
    ) -> None:
        last_error: Exception | None = None
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            self.log(f"Transfer attempt {attempt}/{max_attempts}.")
            try:
                await self._send_once(
                    address,
                    sdk_type,
                    image,
                    transform,
                    partial,
                    orientation,
                    software_version,
                )
                self.log("Transfer completed.")
                return
            except Exception as exc:  # BLE stack can raise platform-specific exceptions
                last_error = exc
                self.log(f"Transfer attempt {attempt}/{max_attempts} failed: {exc}")
                transient = self._is_transient_connection_error(exc)
                if attempt >= max_attempts or (attempt >= 2 and not transient):
                    break
                delay = (2, 4)[attempt - 1]
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
        orientation: str | None = None,
        software_version: int | None = None,
    ) -> None:
        payload = (
            await self._async_pack_region(image)
            if partial is not None
            else await self._async_pack(sdk_type, image, transform, orientation)
        )
        software_version = self._resolve_software_version(address, software_version)
        responses: asyncio.Queue[bytes] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def notify_handler(_sender, data) -> None:
            packet = bytes(data)
            self.log(f"Notification: {packet.hex(' ').upper()}")
            loop.call_soon_threadsafe(responses.put_nowait, packet)

        connection_target = self._connection_target(address)
        self.log(f"Connecting to {address}...")
        async with self._connected_client(connection_target, address) as client:
            if not client.is_connected:
                raise RuntimeError("Could not connect to the display.")

            service_uuid, control_char, write_char = self._find_transfer_chars(client)
            if not control_char or not write_char:
                raise RuntimeError("DRATEK eInk transfer characteristics were not found.")

            self.log(f"Using service {service_uuid}")
            await self._negotiate_mtu(client)
            await self._start_notify(client, control_char, notify_handler)
            write_notify_enabled = False
            if "notify" in write_char.properties or "indicate" in write_char.properties:
                try:
                    await self._start_notify(client, write_char, notify_handler)
                    write_notify_enabled = True
                except Exception as exc:
                    self.log(f"Optional write characteristic notification setup skipped: {exc}")
            try:
                await asyncio.sleep(0.4)

                block_size = await self._request_block_size(client, control_char, responses)
                if block_size < 8:
                    raise RuntimeError(f"Invalid block size reported by display: {block_size}")

                total_blocks = math.ceil(len(payload) / (block_size - 4))
                self.log(f"Block size: {block_size}. Payload: {len(payload)} bytes, {total_blocks} blocks.")

                if partial is not None:
                    await self._write_partial_position(client, control_char, responses, partial)

                # Refresh mode 0 in the vendor API maps to command byte 1 and causes
                # a full-screen refresh. Partial refreshes use a separate 0x60 area
                # command before this packet.
                # Keep the six-byte packet used by the known-good integration.
                # These displays acknowledge it directly and SDK type 51 then
                # requires every image block to use an ATT write response.
                command = bytes([2]) + len(payload).to_bytes(4, "little") + bytes([FULL_REFRESH_MODE])
                await self._write_char(client, control_char, command, "prepare update")
                await self._wait_for_response(responses, 2, ok_values={0}, label="screen update prepare")

                self._clear_queue(responses)
                await self._write_char(client, control_char, bytes([3]), "start process")
                response = await self._wait_for_next_transfer_response(
                    responses,
                    timeout=BLOCK_REQUEST_TIMEOUT,
                )
                request_counts: dict[int, int] = {}
                sent_blocks: set[int] = set()
                confirmed_blocks: set[int] = set()
                if len(response) >= 6 and response[0] == 5 and response[1] == 0:
                    resume_block = int.from_bytes(response[2:6], "little")
                    sent_blocks.update(range(min(resume_block, total_blocks)))
                    confirmed_blocks.update(range(min(resume_block, total_blocks)))
                    if resume_block:
                        self.log(
                            f"Display is resuming the prepared transfer at block "
                            f"{resume_block + 1}/{total_blocks}."
                        )
                # Picksmart has two transfer implementations selected by bit 0x80
                # of the software-version byte in manufacturer data. New firmware
                # streams the remaining blocks after the first [05 00] request and
                # advances on each GATT write callback. Legacy firmware advances
                # after each control-point notification and ignores its block index
                # after the initial request.
                streaming_mode = bool(int(software_version or 0) & 0x80)
                if streaming_mode and "write" not in write_char.properties:
                    self.log("Display does not expose acknowledged block writes; using unconfirmed fallback stream.")
                require_gatt_response = (
                    "write" in write_char.properties
                    and (int(sdk_type) in WRITE_ACK_SDK_TYPES or streaming_mode)
                ) or ("write-without-response" not in write_char.properties)


                write_mode = (
                    "display-acknowledged GATT flow control"
                    if require_gatt_response
                    else "display-notification flow control"
                )
                self.log(
                    f"Transfer mode: {'streaming' if streaming_mode else 'notification-paced legacy'}, "
                    f"block writes: {write_mode} (software version {int(software_version or 0)})."
                )

                if len(response) < 6 or response[0] != 5 or response[1] != 0:
                    raise RuntimeError(f"Invalid first image-block request: {response.hex(' ').upper()}")
                next_block = int.from_bytes(response[2:6], "little")

                while True:
                    if next_block >= total_blocks:
                        raise RuntimeError(f"Display requested invalid block {next_block}/{total_blocks}")
                    request_counts[next_block] = request_counts.get(next_block, 0) + 1
                    if request_counts[next_block] > MAX_BLOCK_REQUEST_RETRIES:
                        raise RuntimeError(
                            f"Display requested block {next_block} more than "
                            f"{MAX_BLOCK_REQUEST_RETRIES} times."
                        )

                    end_block = total_blocks if streaming_mode else next_block + 1
                    for block_number in range(next_block, end_block):
                        block_requires_response = require_gatt_response
                        final_response_missing = False
                        try:
                            block_data = _next_block(payload, block_size, block_number)
                            await self._write_image_block(
                                client,
                                write_char,
                                block_data,
                                block_number,
                                require_response=block_requires_response,
                                operation_timeout=(
                                    FINAL_BLOCK_RESPONSE_TIMEOUT
                                    if streaming_mode and block_number == total_blocks - 1
                                    else GATT_OPERATION_TIMEOUT
                                ),
                            )
                        except TimeoutError:
                            confirmed_flow_complete = (
                                require_gatt_response
                                and len(confirmed_blocks) == total_blocks - 1
                            )
                            if (
                                not streaming_mode
                                or block_number != total_blocks - 1
                                or not confirmed_flow_complete
                            ):
                                raise
                            # Several Picksmart controllers consume the final block
                            # and start refreshing but fail to return the ATT response.
                            # Repeating it would append duplicate image bytes. Treat
                            # only this terminal ambiguity as delivered, then still
                            # wait below for the optional vendor completion packet.
                            final_response_missing = True
                            self.log(
                                "The display did not return the final GATT response, "
                                "but the complete payload was handed to the controller; "
                                "waiting for the optional refresh confirmation."
                            )
                        else:
                            if block_requires_response:
                                confirmed_blocks.add(block_number)
                        sent_blocks.add(block_number)
                        if block_number == 0 or block_number % 10 == 0 or len(sent_blocks) == total_blocks:
                            percent = int((len(sent_blocks) / total_blocks) * 100)
                            if final_response_missing:
                                delivery = "Final block handed off"
                            elif block_requires_response:
                                delivery = "Display acknowledged"
                            else:
                                delivery = "Bluetooth queued"
                            self.log(
                                f"{delivery} block {block_number + 1}/{total_blocks} "
                                f"({percent}%)."
                            )

                    if len(sent_blocks) == total_blocks:
                        try:
                            response = await self._wait_for_next_transfer_response(
                                responses,
                                timeout=(
                                    OPTIONAL_COMPLETION_TIMEOUT
                                    if require_gatt_response
                                    else UNCONFIRMED_WRITE_DRAIN_TIMEOUT
                                ),
                            )
                        except TimeoutError:
                            self.log(
                                "All image blocks were handed off and the Bluetooth connection "
                                "was kept open for the controller; no optional 05 08 "
                                "confirmation was sent."
                            )
                            break
                        if len(response) >= 2 and response[1] == 8:
                            self.log("Display confirmed that the complete image was received.")
                            break
                        # A late explicit request is a retransmission request. New
                        # firmware streams forward again, matching the vendor SDK.
                        next_block = int.from_bytes(response[2:6], "little")
                        sent_blocks = {b for b in sent_blocks if b < next_block}
                        confirmed_blocks = {b for b in confirmed_blocks if b < next_block}
                        self.log(
                            f"Display requested retransmission from block "
                            f"{next_block + 1}/{total_blocks}."
                        )
                        continue

                    response = await self._wait_for_next_transfer_response(
                        responses,
                        timeout=BLOCK_REQUEST_TIMEOUT,
                    )
                    if len(response) >= 2 and response[1] == 8:
                        raise RuntimeError(
                            f"Display ended transfer after only {len(sent_blocks)}/{total_blocks} blocks."
                        )
                    # The legacy vendor client uses the requested index only for
                    # the first block. Every later notification advances exactly
                    # one block, even when its payload repeats index zero.
                    next_block += 1

                if len(sent_blocks) != total_blocks:
                    raise RuntimeError(
                        f"Display ended transfer after only {len(sent_blocks)}/{total_blocks} blocks."
                    )
                self.log(
                    "Partial image transfer completed; releasing Bluetooth."
                    if partial is not None
                    else "Full-screen image transfer completed; releasing Bluetooth."
                )
            finally:
                if write_notify_enabled:
                    await self._stop_notify(client, write_char)
                await self._stop_notify(client, control_char)


    def _resolve_software_version(
        self,
        address: str,
        supplied_version: int | None,
    ) -> int:
        """Use the advertised SW byte even for service calls without a panel payload."""
        if supplied_version:
            return int(supplied_version)
        if self._hass is None:
            return int(supplied_version or 0)
        try:
            from homeassistant.components import bluetooth

            get_service_info = getattr(bluetooth, "async_last_service_info", None)
            if get_service_info is None:
                return int(supplied_version or 0)
            service_info = get_service_info(
                self._hass,
                address,
                connectable=True,
            )
            manufacturer_data = getattr(service_info, "manufacturer_data", {}) or {}
            data = manufacturer_data.get(DRATEK_COMPANY_ID)
            if data and len(data) > 2:
                return int(data[2])
        except Exception:  # HA Bluetooth compatibility varies by core version
            pass
        return int(supplied_version or 0)

    def _connection_target(self, address: str) -> Any:
        if self._hass is None:
            return address

        from homeassistant.components import bluetooth

        # 1. Try connectable=True first (preferred fast route)
        ble_device = bluetooth.async_ble_device_from_address(
            self._hass,
            address,
            connectable=True,
        )
        if ble_device is not None:
            return ble_device

        # 2. Try connectable=False if connectable flag hasn't been refreshed yet by HA scanner
        ble_device = bluetooth.async_ble_device_from_address(
            self._hass,
            address,
            connectable=False,
        )
        if ble_device is not None:
            return ble_device

        # 3. Fall back to returning raw address string so Bleak can attempt direct connection
        return address


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

    async def _negotiate_mtu(self, client) -> None:
        """Request the large MTU used by the official Picksmart client on BlueZ."""
        backend = getattr(client, "_backend", None)
        acquire_mtu = getattr(backend, "_acquire_mtu", None)
        if callable(acquire_mtu):
            try:
                async with asyncio.timeout(MTU_NEGOTIATION_TIMEOUT):
                    await acquire_mtu()
            except Exception as exc:  # private BlueZ hook differs by Bleak version
                self.log(
                    f"Explicit MTU negotiation was unavailable ({exc}); "
                    "continuing with the MTU selected by BlueZ."
                )

        mtu_size = int(getattr(client, "mtu_size", 0) or 0)
        self.log(f"Negotiated ATT MTU: {mtu_size or 'unknown'} bytes.")

    async def _start_notify(
        self,
        client,
        char,
        handler: Callable[[Any, Any], None],
        operation_timeout: float = GATT_OPERATION_TIMEOUT,
    ) -> None:
        async with asyncio.timeout(operation_timeout):
            await client.start_notify(char, handler)

    async def _stop_notify(
        self,
        client,
        char,
        operation_timeout: float = TEARDOWN_OPERATION_TIMEOUT,
    ) -> None:
        """Best-effort unsubscribe; a hang here must not outlast disconnect() itself."""
        try:
            async with asyncio.timeout(operation_timeout):
                await client.stop_notify(char)
        except Exception as exc:
            self.log(f"Notification cleanup for {char} raised {exc}; continuing.")

    async def _write_char(
        self,
        client,
        char,
        data: bytes,
        label: str,
        response: bool | None = None,
        operation_timeout: float = GATT_OPERATION_TIMEOUT,
    ) -> None:
        if response is None:
            response = "write" in char.properties
        # Per-block logging forces needless queue/history and frontend work in
        # the hottest transfer loop. Progress is reported every ten blocks.
        if not label.startswith("block "):
            self.log(f"Write {label}: {_format_bytes(data)}")
        try:
            async with asyncio.timeout(operation_timeout):
                await client.write_gatt_char(char, data, response=response)
        except TimeoutError as exc:
            raise TimeoutError(
                f"GATT write timed out during {label} "
                f"(response={'yes' if response else 'no'})."
            ) from exc

    async def _write_image_block(
        self,
        client,
        write_char,
        data: bytes,
        block_number: int,
        *,
        require_response: bool,
        operation_timeout: float = GATT_OPERATION_TIMEOUT,
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
                    operation_timeout=operation_timeout,
                )
                # A successful ATT response is already the flow-control gate;
                # adding another delay only slows large displays down.
                if not require_response:
                    await asyncio.sleep(STREAM_WRITE_DELAY)
                return
            except Exception as exc:  # BLE stacks expose platform-specific write errors
                # A timed-out ATT request may already have reached the display.
                # Repeating the same raw image block would shift/corrupt the
                # display buffer, so restart the whole prepared transfer instead.
                if isinstance(exc, TimeoutError):
                    raise
                if attempt >= max_attempts:
                    raise
                self.log(
                    f"Image block {block_number} was not acknowledged ({exc}); "
                    f"retrying {attempt + 1}/{max_attempts}."
                )
                await asyncio.sleep(0.1)

    async def _request_block_size(self, client, control_char, responses: asyncio.Queue[bytes]) -> int:
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
        responses: asyncio.Queue[bytes],
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

    async def _wait_for_block_size(self, responses: asyncio.Queue[bytes], timeout: int = 10) -> int:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            try:
                remaining = max(0, deadline - asyncio.get_running_loop().time())
                data = await asyncio.wait_for(responses.get(), remaining)
            except TimeoutError:
                break
            if len(data) >= 3 and data[0] == 1:
                return int.from_bytes(data[1:3], "little")
        raise TimeoutError("Timed out waiting for block size response.")

    async def _wait_for_response(
        self,
        responses: asyncio.Queue[bytes],
        prefix: int,
        ok_values: set[int] | None = None,
        label: str = "response",
        timeout: int = 10,
    ) -> bytes:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            try:
                remaining = max(0, deadline - asyncio.get_running_loop().time())
                data = await asyncio.wait_for(responses.get(), remaining)
            except TimeoutError:
                break
            if data and data[0] == prefix:
                if ok_values is None or (len(data) > 1 and data[1] in ok_values):
                    return data
                raise RuntimeError(f"Display rejected {label}: {data.hex(' ').upper()}")
        raise TimeoutError(f"Timed out waiting for {label}.")

    async def _wait_for_next_transfer_response(
        self,
        responses: asyncio.Queue[bytes],
        timeout: int = 20,
    ) -> bytes:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            try:
                remaining = max(0, deadline - asyncio.get_running_loop().time())
                data = await asyncio.wait_for(responses.get(), remaining)
            except TimeoutError:
                break
            if not data or data[0] != 5:
                continue
            if len(data) > 1 and data[1] == 8:
                return data
            if len(data) >= 6 and data[1] == 0:
                return data
        raise TimeoutError("Timed out waiting for transfer response.")

    @staticmethod
    def _clear_queue(responses: asyncio.Queue[bytes]) -> None:
        while not responses.empty():
            try:
                responses.get_nowait()
            except asyncio.QueueEmpty:
                break
