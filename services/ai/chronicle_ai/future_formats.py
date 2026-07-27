"""Safe local extractors for SVG, OBJ, STEP, and BLEND annotations.

Pure-Python parsing of the stored bytes: text metadata, structural inventories,
and a small normalized 2D preview where one can be derived locally. Nothing here
launches an authoring application or evaluates code carried inside a file.
"""

from __future__ import annotations

import base64
import json
import re
import zlib
from collections import Counter
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Callable
from xml.etree import ElementTree as ET

from PIL import Image, ImageChops, ImageDraw

from .formats import ExtractionError
from .schemas import ImageInput


MAX_INPUT_BYTES = 50 * 1024 * 1024
MAX_PREVIEW_EDGE = 1024
MAX_RECORDS = 40
MAX_DIFF_CHANGES = 24
MAX_TEXT_LENGTH = 240
MAX_EVIDENCE_CHARS = 7_000
OBJ_CANVAS = (1024, 1024)
BLEND_HEADER_PREFIX = b"BLENDER"
GZIP_MAGIC = b"\x1f\x8b"
ZSTANDARD_MAGIC = b"\x28\xb5\x2f\xfd"
#: A .blend header and its thumbnail block sit at the start of the file, so a
#: compressed save only needs its leading bytes decompressed.
BLEND_SCAN_BYTES = 12 * 1024 * 1024
BLEND_MAX_BLOCKS = 64
BLEND_MAX_THUMBNAIL_EDGE = 2_048


class SvgExtractionError(ExtractionError):
    """The supplied SVG cannot be safely extracted."""


class ObjExtractionError(ExtractionError):
    """The supplied OBJ cannot be safely extracted."""


class StepExtractionError(ExtractionError):
    """The supplied STEP file cannot be safely extracted."""


class BlendExtractionError(ExtractionError):
    """The supplied BLEND file cannot be safely extracted."""


@dataclass(frozen=True)
class StructuredEvidence:
    metadata: dict[str, Any]
    records: tuple[dict[str, Any], ...]
    preview: Image.Image | None
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class PreparedStructuredAnnotation:
    context: str
    images: tuple[ImageInput, ...]
    confidence_limit: float | None


def _short(value: object, limit: int = MAX_TEXT_LENGTH) -> str:
    text = str(value).replace("\x00", "").strip()
    return text if len(text) <= limit else f"{text[: limit - 3]}..."


def _decode_payload(source: ImageInput) -> bytes:
    if len(source.base64) > ((MAX_INPUT_BYTES + 2) // 3) * 4:
        raise ExtractionError("The file exceeds Chronicle's 50 MB safety limit.")
    try:
        raw = base64.b64decode(source.base64, validate=True)
    except Exception as error:
        raise ExtractionError("The file is corrupt or unsupported.") from error
    if len(raw) > MAX_INPUT_BYTES:
        raise ExtractionError("The file exceeds Chronicle's 50 MB safety limit.")
    return raw


def _image_input(image: Image.Image, media_type: str, format_name: str) -> ImageInput:
    output = BytesIO()
    if format_name == "jpeg":
        image.save(output, format="JPEG", quality=84, optimize=True)
    else:
        image.save(output, format="PNG")
    return ImageInput.model_validate(
        {
            "base64": base64.b64encode(output.getvalue()).decode("ascii"),
            "mediaType": media_type,
            "format": format_name,
        }
    )


def _normalise_preview(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, "white")
        background.alpha_composite(rgba)
        image = background.convert("RGB")
    else:
        image = image.convert("RGB")
    image.thumbnail((MAX_PREVIEW_EDGE, MAX_PREVIEW_EDGE), Image.Resampling.LANCZOS)
    return image


def _comparison_sheet(previous: Image.Image, current: Image.Image) -> Image.Image | None:
    if previous.size == current.size:
        difference = ImageChops.difference(previous, current)
        bbox = difference.getbbox()
        if bbox is None:
            return None
        changed_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        total_area = previous.width * previous.height
        if total_area and changed_area / total_area < 0.4:
            padding = max(8, round(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.1))
            crop = (
                max(0, bbox[0] - padding),
                max(0, bbox[1] - padding),
                min(previous.width, bbox[2] + padding),
                min(previous.height, bbox[3] + padding),
            )
            previous = previous.crop(crop)
            current = current.crop(crop)

    sheet = Image.new("RGB", (1024, 512), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), "BEFORE", fill="black")
    draw.text((528, 12), "AFTER", fill="black")
    for image, left in ((previous, 16), (current, 528)):
        panel = image.copy()
        panel.thumbnail((480, 464), Image.Resampling.LANCZOS)
        x = left + (480 - panel.width) // 2
        y = 40 + (456 - panel.height) // 2
        sheet.paste(panel, (x, y))
    return sheet


def _bounded_json(evidence: dict[str, Any]) -> tuple[str, bool]:
    bounded = dict(evidence)
    collection_name = "records" if "records" in bounded else "changes"
    bounded[collection_name] = list(bounded.get(collection_name, []))
    truncated = False
    while True:
        encoded = json.dumps(bounded, ensure_ascii=False, separators=(",", ":"))
        if len(encoded) <= MAX_EVIDENCE_CHARS or not bounded[collection_name]:
            return encoded, truncated
        bounded[collection_name].pop()
        bounded["contextTruncated"] = True
        truncated = True


def _structure_diff(previous: StructuredEvidence, current: StructuredEvidence) -> dict[str, Any]:
    changes: list[dict[str, Any]] = []
    for field in sorted(previous.metadata.keys() | current.metadata.keys()):
        before = previous.metadata.get(field)
        after = current.metadata.get(field)
        if before != after:
            changes.append({"scope": "document", "field": field, "before": before, "after": after})

    previous_by_key = {record["key"]: record for record in previous.records}
    current_by_key = {record["key"]: record for record in current.records}
    for key in sorted(previous_by_key.keys() - current_by_key.keys()):
        changes.append({"scope": "record", "change": "removed", "record": previous_by_key[key]})
    for key in sorted(current_by_key.keys() - previous_by_key.keys()):
        changes.append({"scope": "record", "change": "added", "record": current_by_key[key]})
    for key in sorted(previous_by_key.keys() & current_by_key.keys()):
        before_record = previous_by_key[key]
        after_record = current_by_key[key]
        fields: dict[str, list[Any]] = {}
        for field in sorted(before_record.keys() | after_record.keys()):
            if field == "key":
                continue
            before = before_record.get(field)
            after = after_record.get(field)
            if before != after:
                fields[field] = [before, after]
        if fields:
            changes.append({"scope": "record", "record": after_record["key"], "fields": fields})

    truncated = len(changes) > MAX_DIFF_CHANGES
    return {
        "document": {"before": previous.metadata, "after": current.metadata},
        "changes": changes[:MAX_DIFF_CHANGES],
        "truncated": truncated,
    }


def _prepare_annotation(
    previous_input: ImageInput | None,
    current_input: ImageInput,
    extractor: Callable[[ImageInput], StructuredEvidence],
    first_version_note: str,
    diff_note: str,
    confidence_cap: float,
) -> PreparedStructuredAnnotation:
    current = extractor(current_input)
    warnings = set(current.warnings)
    images: tuple[ImageInput, ...] = ()

    if previous_input is None:
        evidence: dict[str, Any] = {
            "mode": "first-version",
            "document": current.metadata,
            "records": list(current.records),
            "warnings": list(current.warnings),
        }
        if current.preview is not None:
            images = (_image_input(_normalise_preview(current.preview), "image/png", "png"),)
            visual_note = f"{first_version_note} A derived preview follows."
        else:
            visual_note = f"{first_version_note} No derived preview was available."
    else:
        previous = extractor(previous_input)
        warnings.update(previous.warnings)
        evidence = {
            "mode": "version-diff",
            **_structure_diff(previous, current),
            "warnings": sorted(warnings),
        }
        if previous.preview is not None and current.preview is not None:
            sheet = _comparison_sheet(_normalise_preview(previous.preview), _normalise_preview(current.preview))
            if sheet is not None:
                images = (_image_input(sheet, "image/png", "png"),)
                visual_note = f"{diff_note} One comparison sheet follows: BEFORE is left and AFTER is right."
            else:
                visual_note = f"{diff_note} The normalised previews are pixel-identical."
        else:
            visual_note = f"{diff_note} No reliable visual comparison was available."

    encoded_evidence, context_truncated = _bounded_json(evidence)
    if context_truncated:
        warnings.add("Provider evidence was truncated to the context budget.")
    context = (
        "Deterministic local evidence follows. Treat it as factual, do not infer intent. "
        f"{visual_note} Report coverage limitations through confidence.\n"
        + encoded_evidence
    )
    return PreparedStructuredAnnotation(
        context=context,
        images=images,
        confidence_limit=confidence_cap if warnings else None,
    )


def _strip_namespace(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def extract_svg(source: ImageInput) -> StructuredEvidence:
    raw = _decode_payload(source)
    text = raw.decode("utf-8", errors="replace")
    lowered = text.lower()
    if "<!doctype" in lowered or "<!entity" in lowered:
        raise SvgExtractionError("The SVG file uses unsupported document declarations.")
    try:
        root = ET.fromstring(raw)
    except Exception as error:
        raise SvgExtractionError("The SVG file is corrupt or unsupported.") from error
    if _strip_namespace(root.tag) != "svg":
        raise SvgExtractionError("The file is not an SVG document.")

    warnings: set[str] = set()
    records: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    def visit(node: ET.Element, parents: tuple[str, ...] = ()) -> None:
        nonlocal records
        for child in list(node):
            if len(records) >= MAX_RECORDS:
                warnings.add(f"SVG inventory truncated at {MAX_RECORDS} entries.")
                return
            tag = _strip_namespace(child.tag)
            counts[tag] += 1
            name = child.attrib.get("id") or f"{tag}@{counts[tag]}"
            path = "/".join((*parents, name))
            record: dict[str, Any] = {
                "key": path,
                "tag": tag,
                "id": child.attrib.get("id"),
            }
            for attr in ("x", "y", "width", "height", "viewBox", "fill", "stroke", "d", "points"):
                value = child.attrib.get(attr)
                if value is not None:
                    record[attr] = _short(value)
            text_content = " ".join(part.strip() for part in child.itertext() if part.strip())
            if text_content:
                record["text"] = _short(text_content)
            records.append(record)
            visit(child, (*parents, name))

    visit(root)
    metadata = {
        "width": root.attrib.get("width"),
        "height": root.attrib.get("height"),
        "viewBox": root.attrib.get("viewBox"),
        "elementCount": len(records),
    }
    return StructuredEvidence(metadata, tuple(records), None, tuple(sorted(warnings)))


def prepare_svg_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    return _prepare_annotation(
        previous_input,
        current_input,
        extract_svg,
        "SVG is text-based, so use the extracted vector structure.",
        "Explain the SVG change using the extracted vector structure.",
        0.85,
    )


def extract_obj(source: ImageInput) -> StructuredEvidence:
    raw = _decode_payload(source)
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    warnings: set[str] = set()
    vertices: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    object_names: list[str] = []
    group_names: list[str] = []
    materials: list[str] = []

    for line in lines:
        if line.startswith("v "):
            parts = line.split()
            if len(parts) >= 4:
                try:
                    vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
                except ValueError:
                    warnings.add("Some OBJ vertex coordinates could not be parsed.")
        elif line.startswith("f "):
            tokens = line.split()[1:]
            face: list[int] = []
            for token in tokens:
                match = re.match(r"(-?\d+)", token)
                if not match:
                    continue
                index = int(match.group(1))
                if index < 0:
                    index = len(vertices) + index + 1
                face.append(index)
            if len(face) >= 3:
                faces.append(face)
        elif line.startswith("o "):
            name = _short(line[2:])
            if name and name not in object_names:
                object_names.append(name)
        elif line.startswith("g "):
            name = _short(line[2:])
            if name and name not in group_names:
                group_names.append(name)
        elif line.startswith("usemtl "):
            name = _short(line[7:])
            if name and name not in materials:
                materials.append(name)

    if not vertices:
        warnings.add("No OBJ vertex list was available.")
    if not faces:
        warnings.add("No OBJ faces were available for a flat preview.")

    preview: Image.Image | None = None
    if vertices and faces:
        xs = [vertex[0] for vertex in vertices]
        ys = [vertex[1] for vertex in vertices]
        zs = [vertex[2] for vertex in vertices]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        min_z, max_z = min(zs), max(zs)
        span_x = max(max_x - min_x, 1e-9)
        span_y = max(max_y - min_y, 1e-9)
        scale = min((OBJ_CANVAS[0] - 80) / span_x, (OBJ_CANVAS[1] - 80) / span_y)
        preview = Image.new("RGB", OBJ_CANVAS, "white")
        draw = ImageDraw.Draw(preview)

        def project(index: int) -> tuple[float, float]:
            vertex = vertices[index - 1]
            x = 40 + (vertex[0] - min_x) * scale
            y = OBJ_CANVAS[1] - 40 - (vertex[1] - min_y) * scale
            return x, y

        shaded_faces: list[tuple[float, list[tuple[float, float]]]] = []
        for face in faces:
            points = [project(index) for index in face if 0 < index <= len(vertices)]
            if len(points) < 3:
                continue
            average_z = sum(vertices[index - 1][2] for index in face if 0 < index <= len(vertices)) / len(points)
            shade = 220 if max_z == min_z else int(70 + 150 * (average_z - min_z) / (max_z - min_z))
            shaded_faces.append((average_z, points, shade))

        for _depth, points, shade in sorted(shaded_faces, key=lambda item: item[0]):
            draw.polygon(points, fill=(shade, shade, shade), outline=(40, 40, 40))
        draw.text(
            (16, 14),
            f"OBJ {len(vertices)} v / {len(faces)} f",
            fill="black",
        )

    metadata = {
        "vertexCount": len(vertices),
        "faceCount": len(faces),
        "objectCount": len(object_names),
        "groupCount": len(group_names),
        "materialCount": len(materials),
    }
    if vertices:
        metadata["bounds"] = {
            "min": [round(min(vertex[i] for vertex in vertices), 6) for i in range(3)],
            "max": [round(max(vertex[i] for vertex in vertices), 6) for i in range(3)],
        }

    records: list[dict[str, Any]] = [
        {"key": "geometry", **metadata},
    ]
    for index, name in enumerate(object_names[: MAX_RECORDS - len(records)]):
        records.append({"key": f"object:{index}", "name": name})
    for index, name in enumerate(group_names[: MAX_RECORDS - len(records)]):
        records.append({"key": f"group:{index}", "name": name})
    for index, name in enumerate(materials[: MAX_RECORDS - len(records)]):
        records.append({"key": f"material:{index}", "name": name})

    return StructuredEvidence(metadata, tuple(records), preview, tuple(sorted(warnings)))


def prepare_obj_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    return _prepare_annotation(
        previous_input,
        current_input,
        extract_obj,
        "Use the extracted OBJ inventory and any derived preview.",
        "Explain the OBJ change using the extracted mesh inventory and any derived preview.",
        0.8,
    )


def extract_step(source: ImageInput) -> StructuredEvidence:
    raw = _decode_payload(source)
    text = raw.decode("utf-8", errors="replace")
    lowered = text.lower()
    warnings: set[str] = set()
    if "iso-10303-21" not in lowered:
        raise StepExtractionError("The STEP file is corrupt or unsupported.")

    schema_match = re.search(r"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)", text, re.IGNORECASE)
    schema = schema_match.group(1) if schema_match else None
    entity_types = Counter(re.findall(r"#\d+\s*=\s*([A-Z0-9_]+)\s*\(", text, re.IGNORECASE))
    point_matches = list(
        re.finditer(r"CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(([^)]*)\)\s*\)", text, re.IGNORECASE)
    )
    points: list[tuple[float, float, float]] = []
    for match in point_matches:
        numbers = [float(value) for value in re.findall(r"[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?", match.group(1))]
        if len(numbers) >= 3:
            points.append((numbers[0], numbers[1], numbers[2]))
    if not entity_types:
        warnings.add("No STEP entity declarations were available.")
    if not points:
        warnings.add("No STEP coordinates were available for a geometric bounds check.")

    records: list[dict[str, Any]] = [
        {"key": "schema", "value": schema},
    ]
    for entity_name, count in entity_types.most_common(MAX_RECORDS - len(records)):
        records.append({"key": f"entity:{entity_name}", "count": count})
    bounds_record: dict[str, Any] | None = None
    if points:
        bounds_record = {
            "key": "bounds",
            "min": [round(min(point[i] for point in points), 6) for i in range(3)],
            "max": [round(max(point[i] for point in points), 6) for i in range(3)],
        }
        records.append(bounds_record)

    metadata = {
        "schema": schema,
        "entityCount": sum(entity_types.values()),
        "pointCount": len(points),
    }
    if bounds_record is not None:
        metadata["bounds"] = {"min": bounds_record["min"], "max": bounds_record["max"]}
    return StructuredEvidence(metadata, tuple(records), None, tuple(sorted(warnings)))


def prepare_step_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    return _prepare_annotation(
        previous_input,
        current_input,
        extract_step,
        "Use the extracted STEP entity inventory and geometric bounds.",
        "Explain the STEP change using the extracted entity inventory and any bounds delta.",
        0.7,
    )


def _inflate_blend(raw: bytes) -> tuple[bytes, str]:
    """Uncompressed bytes of a .blend plus how it was stored.

    Blender's *Compress* option writes the whole file as one gzip (older) or
    Zstandard (3.0+) stream, so a saved file often does not start with the
    ``BLENDER`` magic at all. Only the leading bytes are needed — the header and
    the thumbnail block sit at the start — so decompression is bounded and a
    truncated tail is expected rather than an error.
    """

    if raw.startswith(BLEND_HEADER_PREFIX):
        return raw, "none"

    if raw[:2] == GZIP_MAGIC:
        decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
        try:
            head = decompressor.decompress(raw, BLEND_SCAN_BYTES)
        except zlib.error as error:
            raise BlendExtractionError("The BLEND file is corrupt or unsupported.") from error
        return head, "gzip"

    if raw[:4] == ZSTANDARD_MAGIC:
        try:
            import zstandard
        except ImportError as error:  # pragma: no cover - dependency is declared
            raise BlendExtractionError(
                "This .blend is Zstandard-compressed and this build cannot read that format."
            ) from error
        try:
            reader = zstandard.ZstdDecompressor().stream_reader(BytesIO(raw))
            head = reader.read(BLEND_SCAN_BYTES)
        except Exception as error:
            raise BlendExtractionError("The BLEND file is corrupt or unsupported.") from error
        return head, "zstandard"

    raise BlendExtractionError("The BLEND file is corrupt or unsupported.")


@dataclass(frozen=True)
class BlendHeader:
    version: str
    pointer_size: int
    little_endian: bool


def _blend_header(raw: bytes) -> BlendHeader:
    if len(raw) < 12 or not raw.startswith(BLEND_HEADER_PREFIX):
        raise BlendExtractionError("The BLEND file is corrupt or unsupported.")
    pointer_flag = chr(raw[7])
    endian_flag = chr(raw[8])
    if pointer_flag not in {"_", "-"} or endian_flag not in {"v", "V"}:
        raise BlendExtractionError("The BLEND file is corrupt or unsupported.")
    return BlendHeader(
        version=raw[9:12].decode("latin-1", errors="replace"),
        pointer_size=8 if pointer_flag == "-" else 4,
        little_endian=endian_flag == "v",
    )


def _blend_thumbnail(raw: bytes, header: BlendHeader) -> tuple[Image.Image | None, str | None]:
    """The screenshot Blender embeds for the OS file browser, or None.

    Blender writes it into a ``TEST`` file-block as raw RGBA with the bottom row
    first. That body layout is not covered by public Blender documentation, so
    the declared width and height are validated against the block length before
    anything is allocated: an unrecognised layout yields no thumbnail rather than
    a corrupt image. Blender is never invoked and no embedded Python is read.
    """

    order = "little" if header.little_endian else "big"
    cursor = 12
    for _ in range(BLEND_MAX_BLOCKS):
        body_start = cursor + 16 + header.pointer_size
        if body_start > len(raw):
            return None, None
        code = raw[cursor : cursor + 4]
        body_length = int.from_bytes(raw[cursor + 4 : cursor + 8], order)
        if code == b"ENDB":
            return None, None
        if code == b"TEST":
            body = raw[body_start : body_start + body_length]
            if len(body) < 8:
                return None, "The embedded thumbnail block is truncated."
            width = int.from_bytes(body[0:4], order)
            height = int.from_bytes(body[4:8], order)
            pixels = width * height * 4
            if (
                width <= 0
                or height <= 0
                or width > BLEND_MAX_THUMBNAIL_EDGE
                or height > BLEND_MAX_THUMBNAIL_EDGE
                or len(body) < 8 + pixels
            ):
                return None, "The embedded thumbnail could not be decoded safely."
            image = Image.frombuffer(
                "RGBA", (width, height), body[8 : 8 + pixels], "raw", "RGBA", 0, 1
            )
            return image.transpose(Image.Transpose.FLIP_TOP_BOTTOM), None
        cursor = body_start + body_length
    return None, None


def extract_blend(source: ImageInput) -> StructuredEvidence:
    raw = _decode_payload(source)
    inflated, compression = _inflate_blend(raw)
    header = _blend_header(inflated)

    warnings: set[str] = set()
    preview, thumbnail_warning = _blend_thumbnail(inflated, header)
    if thumbnail_warning is not None:
        warnings.add(thumbnail_warning)
    elif preview is None:
        warnings.add("The file carries no embedded thumbnail, so no visual evidence is available.")
    if compression != "none" and len(inflated) >= BLEND_SCAN_BYTES:
        warnings.add("Only the leading portion of this compressed file was inspected.")
    # Not reading the scene is a permanent property of this adapter rather than
    # degraded evidence, so it belongs in the prompt note (see
    # prepare_blend_annotation) and must not cap confidence on every file.

    records: list[dict[str, Any]] = [
        {
            "key": "header",
            "blenderVersion": header.version,
            "pointerSize": header.pointer_size,
            "littleEndian": header.little_endian,
        },
        {
            "key": "thumbnail",
            "present": preview is not None,
            **({"width": preview.width, "height": preview.height} if preview else {}),
        },
    ]

    metadata = {
        "blenderVersion": header.version,
        "compression": compression,
        "fileSize": len(raw),
        "hasThumbnail": preview is not None,
    }
    return StructuredEvidence(metadata, tuple(records), preview, tuple(sorted(warnings)))


def prepare_blend_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    scope = (
        "Evidence is the file header and the thumbnail Blender embeds when saving; the scene "
        "itself is never opened, so describe only what those show."
    )
    return _prepare_annotation(
        previous_input,
        current_input,
        extract_blend,
        f"Use the extracted BLEND header and any embedded thumbnail. {scope}",
        f"Explain the BLEND change using the extracted header and any embedded thumbnail. {scope}",
        0.65,
    )
