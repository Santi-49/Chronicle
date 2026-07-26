"""Blender `.blend` container writer.

**Read this before using these files for anything but Chronicle.** A real
`.blend` is a dump of Blender's own structs plus a `DNA1` block describing them;
only Blender can author one. These files carry a valid 12-byte file header, a
`REND` block, the `TEST` thumbnail block Blender writes for the operating
system's file browser, and the terminating `ENDB` — but no scene data, so
**Blender will not open them**.

That is enough to exercise every line of Chronicle's `.blend` support, because
Chronicle deliberately never invokes Blender and never executes a file's
embedded Python: it reads the header facts and the embedded thumbnail, and
nothing else (see `apps/desktop/src/main/formats/blend.ts`). The thumbnails here
are genuine rendered images, so previews, versions, and diffs behave exactly as
they would for a designer's own file.

Swap in Blender-authored files if you have them — nothing else needs to change.

Layout, per the header and file-block structure:
    'BLENDER' + pointer-size flag + endianness flag + 3-char version
    then blocks of: code(4) length(4) address(pointer) sdna(4) count(4) body
    TEST body: width(4) height(4) then width*height RGBA pixels, bottom row first
"""

from __future__ import annotations

import gzip
import struct

from PIL import Image

#: 8 = 64-bit pointers ('-'), which every current Blender build writes.
_POINTER_SIZE = 8


def _block(code: str, body: bytes) -> bytes:
    header = struct.pack("<4sI", code.encode("ascii"), len(body))
    header += b"\0" * _POINTER_SIZE  # original memory address
    header += struct.pack("<II", 0, 1)  # SDNA index, struct count
    return header + body


def _thumbnail_block(image: Image.Image) -> bytes:
    """A TEST block holding the preview, bottom row first as Blender stores it."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    rows = rgba.tobytes()
    stride = width * 4
    flipped = b"".join(
        rows[row * stride : (row + 1) * stride] for row in reversed(range(height))
    )
    return _block("TEST", struct.pack("<II", width, height) + flipped)


def write_blend(
    thumbnail: Image.Image,
    path,
    *,
    version: str = "403",
    compress: bool = False,
) -> None:
    """Write a `.blend` container carrying `thumbnail` as its preview.

    `compress=True` gzips the whole file, which is what Blender's "Compress"
    save option produces — Chronicle reads both forms.
    """
    header = b"BLENDER" + b"-" + b"v" + version.encode("ascii")[:3]
    payload = (
        header
        # A render-info block, as Blender writes before the thumbnail.
        + _block("REND", struct.pack("<iiI", 1, 250, 0) + b"Scene\0")
        + _thumbnail_block(thumbnail)
        + _block("ENDB", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(payload, mtime=0) if compress else payload)
