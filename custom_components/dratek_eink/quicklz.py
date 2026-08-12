"""Vendor stream framing for displays that do not advertise the raw-data flag.

Picksmart's `BluetoothTransferReader` never puts the packed bit planes on the
wire as they come out of the bitmap converter. It picks one of three framings
from the advertised device type:

* ``type & 0x4000``          - the planes are sent verbatim,
* mirror bit clear (BW)      - ``compress(buffer)``,
* mirror bit set (BWR/BWRY)  - ``compress2(first half, second half)``.

``compress`` and ``compress2`` are native functions in ``libble_jni.so`` built
around QuickLZ 1.5.0. ``qlz_get_setting`` in that library reports compression
level 1 and, decisively, ``QLZ_STREAMING_BUFFER = 64``: the JNI wrapper walks
the plane in 64-byte chunks and emits one QuickLZ block per chunk, which is how
a label with a few kilobytes of RAM can take a 96 kB image. Both wrappers
prefix the result with the raw length of a single plane as a little-endian
uint32.

Every block carries QuickLZ's own three-byte header (a chunk is far below the
216-byte long-header threshold): flags, total block length, decompressed
length. The flag byte is ``0x74`` plus bit 0 when the body is compressed -
level 1 in bits 2-3, the streaming-buffer code 3 in bits 4-5, and bit 6 which
QuickLZ always sets.

Bit 0 is the part that matters here: QuickLZ stores a block verbatim whenever
compressing it would not pay off, and `qlz_decompress` handles that case on
both sides of its streaming branch. Emitting only stored blocks therefore
produces a stream the display decodes byte for byte, without this integration
having to reimplement the compressor. The cost is 3 bytes per 64, so a 96 kB
BWR image travels as 100 504 bytes instead of 96 000.
"""

from __future__ import annotations

# QLZ_STREAMING_BUFFER as compiled into the vendor library. The chunk size is
# not a free parameter: the decompressor keeps a buffer of exactly this size and
# its state machine advances in step with the encoder's.
STREAM_BLOCK_SIZE = 64

# 0x74 = level 1 << 2 | streaming-buffer code 3 << 4 | bit 6. Bit 0 stays clear
# because every block below is stored rather than compressed.
STORED_BLOCK_FLAGS = 0x74

# Bit 14 of the advertised type. Displays that set it take the packed planes
# unframed, which is why they have always worked here.
RAW_DATA_FLAG = 0x4000


def needs_vendor_framing(raw_type: int | None) -> bool:
    """Whether the display expects the QuickLZ stream instead of raw planes."""
    if raw_type is None:
        return False
    return not int(raw_type) & RAW_DATA_FLAG


def uses_split_planes(sdk_type: int) -> bool:
    """Whether the type is DoubleMirror, i.e. framed as two separate planes.

    ``BluetoothLcdParameter`` reads the mirror as bit 0 of the type, and that is
    what selects ``compress2`` over ``compress``. Every three- and four-colour
    label has it set; the black-and-white ones do not.
    """
    return bool(int(sdk_type) & 1)


def _stored_blocks(plane: bytes) -> bytes:
    """Frame one plane as a chain of stored QuickLZ blocks."""
    out = bytearray()
    for offset in range(0, len(plane), STREAM_BLOCK_SIZE):
        chunk = plane[offset : offset + STREAM_BLOCK_SIZE]
        # Header: flags, whole block length, decompressed length. Both lengths
        # are single bytes here because a chunk never reaches QuickLZ's 216-byte
        # long-header threshold.
        out += bytes((STORED_BLOCK_FLAGS, len(chunk) + 3, len(chunk)))
        out += chunk
    return bytes(out)


def frame_payload(payload: bytes, sdk_type: int) -> bytes:
    """Wrap packed planes the way the vendor SDK puts them on the wire.

    The leading uint32 is the raw length of a single plane, matching both
    wrappers: ``compress`` writes the length of its only input, ``compress2``
    the length of its second half.
    """
    if uses_split_planes(sdk_type):
        if len(payload) % 2 != 0:
            raise ValueError(
                f"Two-plane payload has an odd length: {len(payload)} bytes"
            )
        half = len(payload) // 2
        planes = (payload[:half], payload[half:])
    else:
        half = len(payload)
        planes = (payload,)

    framed = bytearray(half.to_bytes(4, "little"))
    for plane in planes:
        framed += _stored_blocks(plane)
    return bytes(framed)


def framed_size(payload_size: int, sdk_type: int) -> int:
    """Size ``frame_payload`` produces, without building the stream."""
    planes = 2 if uses_split_planes(sdk_type) else 1
    plane_size = payload_size // planes
    blocks = -(-plane_size // STREAM_BLOCK_SIZE)
    return 4 + planes * (plane_size + blocks * 3)
