"""Safe local extractors for SVG, OBJ, STEP, and BLEND annotations.

Pure-Python parsing of the stored bytes: text metadata, structural inventories,
and a small normalized 2D preview where one can be derived locally. Nothing here
launches an authoring application or evaluates code carried inside a file.
"""

from __future__ import annotations

import base64
import json
import re
from collections import Counter
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Callable
from xml.etree import ElementTree as ET

from PIL import Image, ImageChops, ImageDraw

from .schemas import ImageInput


MAX_INPUT_BYTES = 50 * 1024 * 1024
MAX_PREVIEW_EDGE = 1024
MAX_RECORDS = 40
MAX_DIFF_CHANGES = 24
MAX_TEXT_LENGTH = 240
MAX_EVIDENCE_CHARS = 7_000
OBJ_CANVAS = (1024, 1024)
BLEND_HEADER_PREFIX = b"BLENDER"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SOI = b"\xff\xd8"
JPEG_EOI = b"\xff\xd9"


class SvgExtractionError(ValueError):
    """The supplied SVG cannot be safely extracted."""


class ObjExtractionError(ValueError):
    """The supplied OBJ cannot be safely extracted."""


class StepExtractionError(ValueError):
    """The supplied STEP file cannot be safely extracted."""


class BlendExtractionError(ValueError):
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
        raise ValueError("The file exceeds Chronicle's 50 MB safety limit.")
    try:
        raw = base64.b64decode(source.base64, validate=True)
    except Exception as error:
        raise ValueError("The file is corrupt or unsupported.") from error
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("The file exceeds Chronicle's 50 MB safety limit.")
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


def _extract_png_blob(raw: bytes) -> bytes | None:
    start = raw.find(PNG_SIGNATURE)
    if start < 0:
        return None
    cursor = start + len(PNG_SIGNATURE)
    while cursor + 8 <= len(raw):
        length = int.from_bytes(raw[cursor : cursor + 4], "big")
        if length > MAX_INPUT_BYTES:
            return None
        chunk_type = raw[cursor + 4 : cursor + 8]
        cursor += 8
        if cursor + length + 4 > len(raw):
            return None
        cursor += length
        cursor += 4
        if chunk_type == b"IEND":
            return raw[start:cursor]
    return None


def _extract_jpeg_blob(raw: bytes) -> bytes | None:
    start = raw.find(JPEG_SOI)
    if start < 0:
        return None
    end = raw.find(JPEG_EOI, start + 2)
    if end < 0:
        return None
    return raw[start : end + 2]


def _preview_from_blob(blob: bytes, media_type: str, format_name: str) -> ImageInput | None:
    try:
        image = Image.open(BytesIO(blob))
        image.load()
    except Exception:
        return None
    return ImageInput.model_validate(
        {
            "base64": base64.b64encode(blob).decode("ascii"),
            "mediaType": media_type,
            "format": format_name,
        }
    )


def extract_blend(source: ImageInput) -> StructuredEvidence:
    raw = _decode_payload(source)
    if not raw.startswith(BLEND_HEADER_PREFIX):
        raise BlendExtractionError("The BLEND file is corrupt or unsupported.")

    header = raw[:12].decode("latin-1", errors="replace")
    preview_kind = None
    preview_input = None
    png_blob = _extract_png_blob(raw)
    if png_blob is not None:
        preview_kind = "png"
        preview_input = _preview_from_blob(png_blob, "image/png", "png")
    else:
        jpeg_blob = _extract_jpeg_blob(raw)
        if jpeg_blob is not None:
            preview_kind = "jpeg"
            preview_input = _preview_from_blob(jpeg_blob, "image/jpeg", "jpeg")

    warnings: set[str] = set()
    if preview_kind is None:
        warnings.add("No embedded thumbnail could be isolated safely.")
    elif preview_input is None:
        warnings.add("The embedded thumbnail could not be decoded safely.")

    records = [
        {
            "key": "header",
            "signature": header[:7],
            "flags": header[7:9],
            "version": header[9:12],
            "fileSize": len(raw),
        },
    ]
    if preview_kind is not None:
        records.append({"key": "thumbnail", "kind": preview_kind, "present": True})

    metadata = {
        "header": header,
        "fileSize": len(raw),
        "previewKind": preview_kind,
    }
    preview = None
    if preview_input is not None:
        preview = Image.open(BytesIO(base64.b64decode(preview_input.base64)))
        preview.load()
    return StructuredEvidence(metadata, tuple(records), preview, tuple(sorted(warnings)))


def prepare_blend_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    return _prepare_annotation(
        previous_input,
        current_input,
        extract_blend,
        "Use the extracted BLEND header and any embedded thumbnail.",
        "Explain the BLEND change using the extracted header and any embedded thumbnail.",
        0.65,
    )
