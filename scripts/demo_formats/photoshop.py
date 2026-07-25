"""Layered Photoshop PSD/PSB writer.

Produces genuine documents per Adobe's file-format specification: a header, an
image-resources section carrying the JPEG thumbnail Photoshop embeds (which is
what Chronicle reads for previews), a layer section with named raster layers,
and the flattened composite.

Named layers matter for the demo: Chronicle's PSD annotation path extracts a
layer inventory and diffs it, so "the `tagline` layer was removed" is a story
only a layered file can tell.

PSD and PSB differ in three places, all parameterised by `large`:
the header version, the width of the layer-section length fields, and the width
of the RLE row-count entries.

Reference: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from io import BytesIO

from PIL import Image

# --- PackBits --------------------------------------------------------------


def _packbits(data: bytes) -> bytes:
    """PackBits (RLE) encode one scanline, as PSD compression mode 1 expects.

    Flat artwork compresses enormously here, which is what keeps the committed
    demo pack small enough to clone comfortably.
    """
    out = bytearray()
    index = 0
    length = len(data)
    while index < length:
        # A run: the same byte three or more times in a row.
        run_end = index
        while run_end + 1 < length and data[run_end + 1] == data[index] and run_end - index < 127:
            run_end += 1
        if run_end > index + 1:
            out.append(256 - (run_end - index))  # negative count = repeat
            out.append(data[index])
            index = run_end + 1
            continue
        # A literal block: bytes up to the next run of three.
        literal_start = index
        while index < length and index - literal_start < 128:
            if (
                index + 2 < length
                and data[index] == data[index + 1] == data[index + 2]
            ):
                break
            index += 1
        out.append(index - literal_start - 1)
        out += data[literal_start:index]
    return bytes(out)


def _packbits_rows(pixels: bytes, width: int, height: int) -> list[bytes]:
    return [_packbits(pixels[row * width : (row + 1) * width]) for row in range(height)]


def _count_table(rows: list[bytes], large: bool) -> bytes:
    """Row byte counts — two bytes each in a PSD, four in a PSB."""
    return b"".join(struct.pack(">I" if large else ">H", len(row)) for row in rows)


def _rle_channel(pixels: bytes, width: int, height: int, large: bool) -> bytes:
    """One layer channel plane: its own row-count table, then its rows."""
    rows = _packbits_rows(pixels, width, height)
    return _count_table(rows, large) + b"".join(rows)


# --- Document model --------------------------------------------------------


@dataclass
class Layer:
    """One named raster layer, positioned anywhere on the canvas."""

    name: str
    image: Image.Image
    left: int = 0
    top: int = 0
    opacity: int = 255
    visible: bool = True


@dataclass
class Document:
    width: int
    height: int
    composite: Image.Image
    layers: list[Layer] = field(default_factory=list)
    #: True writes a PSB (format version 2) instead of a PSD.
    large: bool = False


# --- Section writers -------------------------------------------------------


def _header(document: Document) -> bytes:
    return struct.pack(
        ">4sH6sHIIHH",
        b"8BPS",
        2 if document.large else 1,
        b"\0" * 6,
        3,  # channels: RGB
        document.height,
        document.width,
        8,  # bits per channel
        3,  # colour mode: RGB
    )


def _resource_block(resource_id: int, data: bytes) -> bytes:
    # '8BIM', id, empty Pascal name (padded to even), size, data (padded to even).
    block = struct.pack(">4sH", b"8BIM", resource_id) + b"\0\0"
    block += struct.pack(">I", len(data)) + data
    return block + (b"\0" if len(data) % 2 else b"")


def _thumbnail_resource(composite: Image.Image) -> bytes:
    """Image resource 1036: a 28-byte descriptor followed by JFIF bytes.

    Chronicle's desktop preview reads exactly this, for both PSD and PSB, so
    every generated document carries one.
    """
    preview = composite.convert("RGB")
    preview.thumbnail((256, 256), Image.LANCZOS)
    buffer = BytesIO()
    preview.save(buffer, "JPEG", quality=85)
    jpeg = buffer.getvalue()

    width, height = preview.size
    row_bytes = (width * 24 + 31) // 32 * 4
    descriptor = struct.pack(
        ">IIIIIIHH",
        1,  # format: kJpegRGB
        width,
        height,
        row_bytes,
        row_bytes * height,
        len(jpeg),
        24,  # bits per pixel
        1,  # planes
    )
    return _resource_block(1036, descriptor + jpeg)


def _resources(document: Document) -> bytes:
    body = _thumbnail_resource(document.composite)
    # 1005: resolution info — 72 dpi, fixed-point 16.16.
    body += _resource_block(
        1005, struct.pack(">IHHHHIHHHH", 72 << 16, 1, 1, 1, 2, 72 << 16, 1, 1, 1, 2)
    )
    return struct.pack(">I", len(body)) + body


def _layer_channels(layer: Layer, large: bool) -> tuple[bytes, list[int]]:
    """RLE channel planes for one layer, plus each plane's byte length."""
    image = layer.image.convert("RGBA")
    width, height = image.size
    planes: list[bytes] = []
    # Alpha first (channel id -1), then R, G, B — the order Photoshop writes.
    bands = image.split()
    for band in (bands[3], bands[0], bands[1], bands[2]):
        data = _rle_channel(band.tobytes(), width, height, large)
        planes.append(struct.pack(">H", 1) + data)  # 1 = RLE
    return b"".join(planes), [len(plane) for plane in planes]


def _pascal_padded(text: str, multiple: int) -> bytes:
    raw = text.encode("ascii", "replace")[:255]
    out = bytes([len(raw)]) + raw
    padding = (-len(out)) % multiple
    return out + b"\0" * padding


def _unicode_name(text: str) -> bytes:
    """Additional layer info 'luni' — the name Photoshop actually displays."""
    encoded = text.encode("utf-16-be")
    data = struct.pack(">I", len(text)) + encoded
    data += b"\0" * ((-len(data)) % 2)
    return struct.pack(">4s4sI", b"8BIM", b"luni", len(data)) + data


def _layer_records(document: Document) -> bytes:
    length_format = ">Q" if document.large else ">I"
    records = bytearray()
    channel_data = bytearray()

    for layer in document.layers:
        planes, lengths = _layer_channels(layer, document.large)
        width, height = layer.image.size
        records += struct.pack(
            ">iiii",
            layer.top,
            layer.left,
            layer.top + height,
            layer.left + width,
        )
        records += struct.pack(">H", 4)  # channel count: A, R, G, B
        for channel_id, size in zip((-1, 0, 1, 2), lengths):
            records += struct.pack(">h", channel_id) + struct.pack(length_format, size)
        records += struct.pack(
            ">4s4sBBBB",
            b"8BIM",
            b"norm",
            layer.opacity,
            0,  # clipping: base
            0 if layer.visible else 2,  # flags: bit 1 = hidden
            0,  # filler
        )

        extra = _pascal_padded(layer.name, 4)
        extra += _unicode_name(layer.name)
        # Extra data length, then mask (0) and blending ranges (0) before the name.
        records += struct.pack(">I", len(extra) + 8)
        records += struct.pack(">I", 0) + struct.pack(">I", 0)
        records += extra
        channel_data += planes

    info = struct.pack(">h", len(document.layers)) + bytes(records) + bytes(channel_data)
    info += b"\0" * (len(info) % 2)  # layer info is padded to an even length
    return struct.pack(length_format, len(info)) + info


def _layer_and_mask(document: Document) -> bytes:
    length_format = ">Q" if document.large else ">I"
    if not document.layers:
        return struct.pack(length_format, 0)
    body = _layer_records(document)
    body += struct.pack(">I", 0)  # global layer mask info: absent
    return struct.pack(length_format, len(body)) + body


def _image_data(document: Document) -> bytes:
    """The flattened composite, RLE-encoded.

    Unlike a layer's channels, the merged image section stores **one** row-count
    table covering every scanline of every channel, followed by all the
    compressed rows. Emitting per-channel tables here instead produces a file
    that opens but shows garbled colour.
    """
    image = document.composite.convert("RGB")
    width, height = image.size
    rows: list[bytes] = []
    for band in image.split():
        rows += _packbits_rows(band.tobytes(), width, height)
    return (
        struct.pack(">H", 1)
        + _count_table(rows, document.large)
        + b"".join(rows)
    )


def write_document(document: Document, path) -> None:
    """Write a complete PSD/PSB file."""
    payload = (
        _header(document)
        + struct.pack(">I", 0)  # colour mode data: none for RGB
        + _resources(document)
        + _layer_and_mask(document)
        + _image_data(document)
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
