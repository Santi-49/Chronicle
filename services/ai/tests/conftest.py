"""Shared pytest fixtures for the Chronicle AI test suite.

Generates real, structurally valid PNG and JPEG image files in a temporary
directory using only Python's standard library — no Pillow or other imaging
dependency required. The images are small (1×1 or 2×2 pixels) but are
accepted by every conformant parser, which means image_loader and any future
format-validation layer can exercise the real read path.
"""

import struct
import zlib
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Minimal PNG builder (stdlib only)
# ---------------------------------------------------------------------------
# A PNG file is: 8-byte signature + one or more chunks.
# Each chunk: 4-byte length | 4-byte type | data | 4-byte CRC.
# The minimum valid PNG needs IHDR + IDAT + IEND.


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    length = struct.pack(">I", len(data))
    crc = struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    return length + chunk_type + data + crc


def make_png(width: int = 2, height: int = 2) -> bytes:
    """Return the bytes of a minimal valid RGB PNG.

    Each pixel row is preceded by a filter byte (0 = None).
    Each pixel is 3 bytes: R, G, B.
    """
    signature = b"\x89PNG\r\n\x1a\n"

    # IHDR: width(4) height(4) bit-depth(1) colour-type(1=greyscale,2=rgb)
    #       compression(1) filter(1) interlace(1)
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr = _png_chunk(b"IHDR", ihdr_data)

    # Raw image: for each row: filter-byte(0x00) + width * 3 pixel bytes
    raw_rows = b""
    for _row in range(height):
        raw_rows += b"\x00"  # filter byte: None
        for _col in range(width):
            raw_rows += bytes([255, 0, 0])  # red pixel

    idat = _png_chunk(b"IDAT", zlib.compress(raw_rows))
    iend = _png_chunk(b"IEND", b"")

    return signature + ihdr + idat + iend


# ---------------------------------------------------------------------------
# Minimal JPEG builder (stdlib only)
# ---------------------------------------------------------------------------
# A structurally valid JPEG only needs SOI + APP0 (JFIF marker) + EOI.
# This is the smallest file accepted as image/jpeg by content-type checks;
# decoders that actually try to decode pixels will fail, but our pipeline
# only reads bytes and base64-encodes them — it never decodes.


def make_jpeg() -> bytes:
    """Return the bytes of a minimal JFIF JPEG (SOI + APP0 + EOI)."""
    soi = b"\xff\xd8"  # Start Of Image

    # APP0 / JFIF marker
    jfif_data = (
        b"JFIF\x00"  # identifier + null terminator
        b"\x01\x01"  # version 1.1
        b"\x00"  # aspect-ratio units: 0 = no units
        b"\x00\x01"  # X pixel density = 1
        b"\x00\x01"  # Y pixel density = 1
        b"\x00\x00"  # thumbnail width / height = 0
    )
    app0_length = struct.pack(">H", 2 + len(jfif_data))  # length includes itself
    app0 = b"\xff\xe0" + app0_length + jfif_data

    eoi = b"\xff\xd9"  # End Of Image

    return soi + app0 + eoi


# ---------------------------------------------------------------------------
# pytest fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def png_file(tmp_path: Path) -> Path:
    """A real 2×2 RGB PNG file on disk."""
    path = tmp_path / "sample.png"
    path.write_bytes(make_png())
    return path


@pytest.fixture()
def jpeg_file(tmp_path: Path) -> Path:
    """A real minimal JPEG file on disk (`.jpg` extension)."""
    path = tmp_path / "sample.jpg"
    path.write_bytes(make_jpeg())
    return path


@pytest.fixture()
def jpeg_file_alt_ext(tmp_path: Path) -> Path:
    """The same JPEG content but with the `.jpeg` extension."""
    path = tmp_path / "sample.jpeg"
    path.write_bytes(make_jpeg())
    return path


@pytest.fixture()
def png_pair(tmp_path: Path) -> tuple[Path, Path]:
    """Two different PNG files representing previous and current versions.

    Previous: 2×2 all-red pixels.
    Current:  2×2 all-blue pixels  (different content → different hash).
    """
    prev_path = tmp_path / "v1.png"
    curr_path = tmp_path / "v2.png"

    prev_path.write_bytes(make_png(width=2, height=2))

    # Build a blue-pixel variant for the current version
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    ihdr = _png_chunk(b"IHDR", ihdr_data)
    raw_rows = b""
    for _row in range(2):
        raw_rows += b"\x00"
        for _col in range(2):
            raw_rows += bytes([0, 0, 255])  # blue pixel
    idat = _png_chunk(b"IDAT", zlib.compress(raw_rows))
    iend = _png_chunk(b"IEND", b"")
    curr_path.write_bytes(signature + ihdr + idat + iend)

    return prev_path, curr_path
