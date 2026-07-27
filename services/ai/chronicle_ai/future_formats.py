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

from PIL import Image, ImageChops, ImageColor, ImageDraw

from .formats import ExtractionError
from .schemas import ImageInput


MAX_INPUT_BYTES = 50 * 1024 * 1024
MAX_PREVIEW_EDGE = 1024
MAX_RECORDS = 40
MAX_DIFF_CHANGES = 24
MAX_TEXT_LENGTH = 240
# Structured evidence is supporting context, not a dump of the file format.
# Keeping it compact saves provider input tokens and makes the visible change
# more salient than low-level inventory data.
MAX_EVIDENCE_CHARS = 3_500
OBJ_CANVAS = (1024, 1024)
SVG_CANVAS = (1024, 1024)
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


def _svg_number(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    match = re.match(r"\s*([-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?)", value)
    return float(match.group(1)) if match else default


def _svg_style(node: ET.Element, inherited: dict[str, str]) -> dict[str, str]:
    style = dict(inherited)
    inline = node.attrib.get("style", "")
    for declaration in inline.split(";"):
        if ":" in declaration:
            name, value = declaration.split(":", 1)
            style[name.strip()] = value.strip()
    for name in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"):
        if name in node.attrib:
            style[name] = node.attrib[name]
    return style


def _svg_color(value: str | None, opacity: float) -> tuple[int, int, int, int] | None:
    if value is None or value.strip().lower() in {"none", "transparent", "url"}:
        return None
    if value.strip().lower().startswith("url("):
        return None
    try:
        red, green, blue = ImageColor.getrgb(value.strip())[:3]
    except ValueError:
        return None
    return red, green, blue, max(0, min(255, round(opacity * 255)))


SvgMatrix = tuple[float, float, float, float, float, float]
IDENTITY_MATRIX: SvgMatrix = (1, 0, 0, 1, 0, 0)


def _svg_matrix_multiply(left: SvgMatrix, right: SvgMatrix) -> SvgMatrix:
    a1, b1, c1, d1, e1, f1 = left
    a2, b2, c2, d2, e2, f2 = right
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def _svg_transform(value: str | None) -> tuple[SvgMatrix, bool]:
    matrix = IDENTITY_MATRIX
    unsupported = False
    for name, arguments in re.findall(r"([a-zA-Z]+)\s*\(([^)]*)\)", value or ""):
        numbers = [
            float(number)
            for number in re.findall(r"[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?", arguments)
        ]
        if name == "translate" and numbers:
            operation: SvgMatrix = (
                1,
                0,
                0,
                1,
                numbers[0],
                numbers[1] if len(numbers) > 1 else 0,
            )
        elif name == "scale" and numbers:
            operation = (
                numbers[0],
                0,
                0,
                numbers[1] if len(numbers) > 1 else numbers[0],
                0,
                0,
            )
        elif name == "matrix" and len(numbers) == 6:
            operation = tuple(numbers)  # type: ignore[assignment]
        else:
            unsupported = True
            continue
        matrix = _svg_matrix_multiply(matrix, operation)
    return matrix, unsupported


def _svg_apply(matrix: SvgMatrix, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = matrix
    return a * x + c * y + e, b * x + d * y + f


def _svg_path_subpaths(data: str) -> tuple[list[list[tuple[float, float]]], bool]:
    """Flatten common SVG path commands into bounded polylines."""

    tokens = re.findall(
        r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?",
        data,
    )
    paths: list[list[tuple[float, float]]] = []
    current_path: list[tuple[float, float]] = []
    current = (0.0, 0.0)
    start = current
    command = ""
    previous_control: tuple[float, float] | None = None
    previous_curve = ""
    index = 0
    approximated = False

    def numbers(count: int) -> list[float] | None:
        nonlocal index
        if index + count > len(tokens) or any(
            re.fullmatch(r"[A-Za-z]", token) for token in tokens[index : index + count]
        ):
            return None
        values = [float(token) for token in tokens[index : index + count]]
        index += count
        return values

    def absolute(x: float, y: float, relative: bool) -> tuple[float, float]:
        return (current[0] + x, current[1] + y) if relative else (x, y)

    def append(point: tuple[float, float]) -> None:
        nonlocal current
        if len(current_path) < 512:
            current_path.append(point)
        current = point

    while index < len(tokens):
        if re.fullmatch(r"[A-Za-z]", tokens[index]):
            command = tokens[index]
            index += 1
        if not command:
            approximated = True
            break
        relative = command.islower()
        operation = command.upper()

        if operation == "Z":
            if current_path:
                append(start)
                paths.append(current_path)
                current_path = []
            current = start
            previous_control = None
            previous_curve = ""
            command = ""
            continue

        required = {
            "M": 2, "L": 2, "H": 1, "V": 1, "C": 6,
            "S": 4, "Q": 4, "T": 2, "A": 7,
        }.get(operation)
        if required is None:
            approximated = True
            command = ""
            continue
        values = numbers(required)
        if values is None:
            approximated = True
            command = ""
            continue

        if operation == "M":
            destination = absolute(values[0], values[1], relative)
            if current_path:
                paths.append(current_path)
            current_path = [destination]
            current = destination
            start = destination
            command = "l" if relative else "L"
            previous_control = None
            previous_curve = ""
        elif operation == "L":
            append(absolute(values[0], values[1], relative))
            previous_control = None
            previous_curve = ""
        elif operation == "H":
            append((current[0] + values[0], current[1]) if relative else (values[0], current[1]))
            previous_control = None
            previous_curve = ""
        elif operation == "V":
            append((current[0], current[1] + values[0]) if relative else (current[0], values[0]))
            previous_control = None
            previous_curve = ""
        elif operation in {"C", "S"}:
            origin = current
            if operation == "C":
                control1 = absolute(values[0], values[1], relative)
                control2 = absolute(values[2], values[3], relative)
                destination = absolute(values[4], values[5], relative)
            else:
                control1 = (
                    (2 * origin[0] - previous_control[0], 2 * origin[1] - previous_control[1])
                    if previous_curve in {"C", "S"} and previous_control is not None
                    else origin
                )
                control2 = absolute(values[0], values[1], relative)
                destination = absolute(values[2], values[3], relative)
            for step in range(1, 13):
                t = step / 12
                inverse = 1 - t
                append(
                    (
                        inverse**3 * origin[0]
                        + 3 * inverse**2 * t * control1[0]
                        + 3 * inverse * t**2 * control2[0]
                        + t**3 * destination[0],
                        inverse**3 * origin[1]
                        + 3 * inverse**2 * t * control1[1]
                        + 3 * inverse * t**2 * control2[1]
                        + t**3 * destination[1],
                    )
                )
            previous_control = control2
            previous_curve = operation
        elif operation in {"Q", "T"}:
            origin = current
            if operation == "Q":
                control = absolute(values[0], values[1], relative)
                destination = absolute(values[2], values[3], relative)
            else:
                control = (
                    (2 * origin[0] - previous_control[0], 2 * origin[1] - previous_control[1])
                    if previous_curve in {"Q", "T"} and previous_control is not None
                    else origin
                )
                destination = absolute(values[0], values[1], relative)
            for step in range(1, 13):
                t = step / 12
                inverse = 1 - t
                append(
                    (
                        inverse**2 * origin[0] + 2 * inverse * t * control[0] + t**2 * destination[0],
                        inverse**2 * origin[1] + 2 * inverse * t * control[1] + t**2 * destination[1],
                    )
                )
            previous_control = control
            previous_curve = operation
        elif operation == "A":
            # Elliptical arcs need substantially more machinery. Preserve the
            # endpoint so the silhouette stays bounded and disclose the approximation.
            append(absolute(values[5], values[6], relative))
            approximated = True
            previous_control = None
            previous_curve = ""

    if current_path:
        paths.append(current_path)
    return paths[:32], approximated


def _svg_preview(root: ET.Element, warnings: set[str]) -> Image.Image | None:
    view_box = [
        float(value)
        for value in re.findall(
            r"[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?", root.attrib.get("viewBox", "")
        )
    ]
    if len(view_box) == 4 and view_box[2] > 0 and view_box[3] > 0:
        origin_x, origin_y, width, height = view_box
    else:
        origin_x = origin_y = 0.0
        width = _svg_number(root.attrib.get("width"), 512)
        height = _svg_number(root.attrib.get("height"), 512)
    if width <= 0 or height <= 0:
        warnings.add("SVG dimensions could not be resolved for a preview.")
        return None

    scale = min((SVG_CANVAS[0] - 64) / width, (SVG_CANVAS[1] - 64) / height)
    offset_x = (SVG_CANVAS[0] - width * scale) / 2
    offset_y = (SVG_CANVAS[1] - height * scale) / 2

    def canvas(point: tuple[float, float]) -> tuple[float, float]:
        return (
            offset_x + (point[0] - origin_x) * scale,
            offset_y + (point[1] - origin_y) * scale,
        )

    image = Image.new("RGBA", SVG_CANVAS, "white")
    draw = ImageDraw.Draw(image, "RGBA")
    rendered = 0

    def visit(
        node: ET.Element,
        inherited_style: dict[str, str],
        inherited_matrix: SvgMatrix,
    ) -> None:
        nonlocal rendered
        tag = _strip_namespace(node.tag)
        style = _svg_style(node, inherited_style)
        if node.attrib.get("class"):
            warnings.add("SVG class-based CSS was not applied to the derived preview.")
        if any(style.get(name, "").strip().lower().startswith("url(") for name in ("fill", "stroke")):
            warnings.add("SVG paint-server fills or strokes were not rendered in the safe preview.")
        local_matrix, unsupported_transform = _svg_transform(node.attrib.get("transform"))
        matrix = _svg_matrix_multiply(inherited_matrix, local_matrix)
        if unsupported_transform:
            warnings.add("Some SVG transforms were omitted from the derived preview.")
        opacity = _svg_number(style.get("opacity"), 1)
        fill = _svg_color(
            style.get("fill", "black"),
            opacity * _svg_number(style.get("fill-opacity"), 1),
        )
        stroke = _svg_color(
            style.get("stroke"),
            opacity * _svg_number(style.get("stroke-opacity"), 1),
        )
        stroke_width = max(1, round(_svg_number(style.get("stroke-width"), 1) * scale))

        def point(x: float, y: float) -> tuple[float, float]:
            return canvas(_svg_apply(matrix, x, y))

        if tag == "rect":
            x = _svg_number(node.attrib.get("x"))
            y = _svg_number(node.attrib.get("y"))
            opposite = point(
                x + _svg_number(node.attrib.get("width")),
                y + _svg_number(node.attrib.get("height")),
            )
            draw.rectangle([point(x, y), opposite], fill=fill, outline=stroke, width=stroke_width)
            rendered += 1
        elif tag in {"circle", "ellipse"}:
            cx = _svg_number(node.attrib.get("cx"))
            cy = _svg_number(node.attrib.get("cy"))
            rx = _svg_number(node.attrib.get("r") or node.attrib.get("rx"))
            ry = _svg_number(node.attrib.get("r") or node.attrib.get("ry"))
            draw.ellipse(
                [point(cx - rx, cy - ry), point(cx + rx, cy + ry)],
                fill=fill,
                outline=stroke,
                width=stroke_width,
            )
            rendered += 1
        elif tag == "line":
            draw.line(
                [
                    point(_svg_number(node.attrib.get("x1")), _svg_number(node.attrib.get("y1"))),
                    point(_svg_number(node.attrib.get("x2")), _svg_number(node.attrib.get("y2"))),
                ],
                fill=stroke or fill or (0, 0, 0, 255),
                width=stroke_width,
            )
            rendered += 1
        elif tag in {"polygon", "polyline"}:
            numbers = [
                float(value)
                for value in re.findall(
                    r"[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?", node.attrib.get("points", "")
                )
            ]
            points = [point(numbers[index], numbers[index + 1]) for index in range(0, len(numbers) - 1, 2)]
            if len(points) >= 2:
                if tag == "polygon":
                    draw.polygon(points, fill=fill, outline=stroke)
                else:
                    draw.line(points, fill=stroke or fill or (0, 0, 0, 255), width=stroke_width)
                rendered += 1
        elif tag in {"text", "tspan"}:
            text = " ".join(part.strip() for part in node.itertext() if part.strip())
            if text:
                draw.text(
                    point(_svg_number(node.attrib.get("x")), _svg_number(node.attrib.get("y"))),
                    _short(text, 80),
                    fill=fill or (0, 0, 0, 255),
                )
                rendered += 1
        elif tag == "path":
            subpaths, approximated = _svg_path_subpaths(node.attrib.get("d", ""))
            for subpath in subpaths:
                points = [canvas(_svg_apply(matrix, x, y)) for x, y in subpath]
                if len(points) >= 3 and fill is not None:
                    draw.polygon(points, fill=fill)
                if len(points) >= 2 and stroke is not None:
                    draw.line(points, fill=stroke, width=stroke_width, joint="curve")
            if subpaths:
                rendered += 1
            if approximated:
                warnings.add("Some SVG path geometry was approximated in the derived preview.")
        elif tag in {
            "image", "use", "filter", "mask", "style", "linearGradient",
            "radialGradient", "clipPath",
        }:
            warnings.add(f"SVG {tag} content was not rendered in the safe local preview.")

        for child in list(node):
            visit(child, style, matrix)

    visit(root, {}, IDENTITY_MATRIX)
    if rendered == 0:
        warnings.add("No safely renderable SVG elements were available for a preview.")
        return None
    return image.convert("RGB")


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
            for attr in (
                "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
                "width", "height", "viewBox", "fill", "stroke", "stroke-width",
                "opacity", "transform", "style", "class", "d", "points",
            ):
                value = child.attrib.get(attr)
                if value is not None:
                    record[attr] = _short(value)
            text_content = (
                " ".join(part.strip() for part in child.itertext() if part.strip())
                if tag in {"text", "tspan"}
                else ""
            )
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
    preview = _svg_preview(root, warnings)
    return StructuredEvidence(metadata, tuple(records), preview, tuple(sorted(warnings)))


def prepare_svg_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    return _prepare_annotation(
        previous_input,
        current_input,
        extract_svg,
        "Use the extracted vector structure and safe local preview.",
        "Explain the SVG change using the compact vector diff and comparison preview.",
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

    # Metadata already carries the geometry totals. Repeating it as a record
    # made diffs spend tokens saying the same thing twice.
    records: list[dict[str, Any]] = []
    for index, name in enumerate(object_names[: MAX_RECORDS - len(records)]):
        records.append({"key": f"object:{index}", "name": name})
    for index, name in enumerate(group_names[: MAX_RECORDS - len(records)]):
        records.append({"key": f"group:{index}", "name": name})
    for index, name in enumerate(materials[: MAX_RECORDS - len(records)]):
        records.append({"key": f"material:{index}", "name": name})

    return StructuredEvidence(metadata, tuple(records), preview, tuple(sorted(warnings)))


def _point_key(point: tuple[float, float, float]) -> tuple[float, float, float]:
    return tuple(round(value, 6) for value in point)


def _spatial_bounds(
    points: list[tuple[float, float, float]],
) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    if not points:
        return None
    return (
        tuple(min(point[axis] for point in points) for axis in range(3)),
        tuple(max(point[axis] for point in points) for axis in range(3)),
    )


def _shape_hint(points: list[tuple[float, float, float]]) -> str:
    bounds = _spatial_bounds(points)
    if bounds is None:
        return "geometry"
    spans = [bounds[1][axis] - bounds[0][axis] for axis in range(3)]
    non_zero = sorted(span for span in spans if span > 1e-6)
    if len(non_zero) <= 1:
        return "linear element"
    if len(non_zero) == 2:
        return "flat rectangular form" if len(points) >= 4 else "flat form"
    if non_zero[-1] >= non_zero[0] * 3:
        return "elongated rectangular form"
    if len(points) >= 8:
        return "box-like form"
    return "solid form"


def _relative_position(
    points: list[tuple[float, float, float]],
    reference: list[tuple[float, float, float]],
) -> str:
    """Describe placement conservatively in the Y-up OBJ viewer convention."""

    changed = _spatial_bounds(points)
    original = _spatial_bounds(reference)
    if changed is None or original is None:
        return "unknown"
    center = tuple((changed[0][axis] + changed[1][axis]) / 2 for axis in range(3))
    spans = tuple(max(original[1][axis] - original[0][axis], 1e-6) for axis in range(3))
    tolerance_y = spans[1] * 0.05
    if changed[0][1] >= original[1][1] - tolerance_y:
        vertical = "above the main form"
    elif center[1] >= original[0][1] + spans[1] * 0.67:
        vertical = "in the upper area"
    elif center[1] <= original[0][1] + spans[1] * 0.33:
        vertical = "in the lower area"
    else:
        vertical = "around the middle"

    if center[0] <= original[0][0] + spans[0] * 0.25:
        horizontal = "toward the left"
    elif center[0] >= original[0][0] + spans[0] * 0.75:
        horizontal = "toward the right"
    else:
        horizontal = "near the center"
    return f"{vertical}, {horizontal}"


def _relative_scale(
    points: list[tuple[float, float, float]],
    whole: list[tuple[float, float, float]],
) -> str:
    changed = _spatial_bounds(points)
    current = _spatial_bounds(whole)
    if changed is None or current is None:
        return "unknown"
    changed_span = max(changed[1][axis] - changed[0][axis] for axis in range(3))
    whole_span = max(current[1][axis] - current[0][axis] for axis in range(3))
    ratio = changed_span / max(whole_span, 1e-6)
    if ratio < 0.25:
        return "small"
    if ratio < 0.65:
        return "medium"
    return "large"


def _obj_artist_hints(previous: ImageInput, current: ImageInput) -> dict[str, Any]:
    previous_vertices, _ = _obj_mesh(previous)
    current_vertices, _ = _obj_mesh(current)
    previous_keys = {_point_key(point) for point in previous_vertices}
    current_keys = {_point_key(point) for point in current_vertices}
    added = [point for point in current_vertices if _point_key(point) not in previous_keys]
    removed = [point for point in previous_vertices if _point_key(point) not in current_keys]

    hints: dict[str, Any] = {}
    if added:
        hints["addedGeometry"] = {
            "shapeHint": _shape_hint(added),
            "relativePosition": _relative_position(added, previous_vertices),
            "relativeScale": _relative_scale(added, current_vertices),
        }
    if removed:
        hints["removedGeometry"] = {
            "shapeHint": _shape_hint(removed),
            "previousPosition": _relative_position(removed, current_vertices),
            "relativeScale": _relative_scale(removed, previous_vertices),
        }
    return hints


def _obj_mesh(
    source: ImageInput,
) -> tuple[list[tuple[float, float, float]], list[list[int]]]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for line in _decode_payload(source).decode("utf-8", errors="replace").splitlines():
        if line.startswith("v "):
            parts = line.split()
            if len(parts) >= 4:
                try:
                    vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
                except ValueError:
                    continue
        elif line.startswith("f "):
            face: list[int] = []
            for token in line.split()[1:]:
                match = re.match(r"(-?\d+)", token)
                if not match:
                    continue
                index = int(match.group(1))
                if index < 0:
                    index = len(vertices) + index + 1
                if 0 < index <= len(vertices):
                    face.append(index)
            if len(face) >= 3:
                faces.append(face)
    return vertices, faces


def _render_obj_preview(
    vertices: list[tuple[float, float, float]],
    faces: list[list[int]],
    framing_vertices: list[tuple[float, float, float]],
    label: str,
) -> Image.Image | None:
    """Render one neutral isometric view using shared before/after framing."""

    if not vertices or not faces or not framing_vertices:
        return None

    def projected(vertex: tuple[float, float, float]) -> tuple[float, float]:
        x, y, z = vertex
        return x - z * 0.65, y + (x + z) * 0.25

    framing = [projected(vertex) for vertex in framing_vertices]
    min_x = min(point[0] for point in framing)
    max_x = max(point[0] for point in framing)
    min_y = min(point[1] for point in framing)
    max_y = max(point[1] for point in framing)
    span_x = max(max_x - min_x, 1e-9)
    span_y = max(max_y - min_y, 1e-9)
    scale = min((OBJ_CANVAS[0] - 100) / span_x, (OBJ_CANVAS[1] - 100) / span_y)

    def canvas_point(index: int) -> tuple[float, float]:
        px, py = projected(vertices[index - 1])
        return 50 + (px - min_x) * scale, OBJ_CANVAS[1] - 50 - (py - min_y) * scale

    image = Image.new("RGB", OBJ_CANVAS, "white")
    draw = ImageDraw.Draw(image)
    shaded_faces: list[tuple[float, list[tuple[float, float]]]] = []
    depths: list[float] = []
    for face in faces:
        points = [canvas_point(index) for index in face]
        depth = sum(
            vertices[index - 1][0] + vertices[index - 1][1] + vertices[index - 1][2]
            for index in face
        ) / len(face)
        depths.append(depth)
        shaded_faces.append((depth, points))
    min_depth = min(depths)
    depth_span = max(max(depths) - min_depth, 1e-9)
    for depth, points in sorted(shaded_faces, key=lambda item: item[0]):
        shade = int(90 + 120 * (depth - min_depth) / depth_span)
        draw.polygon(points, fill=(shade, shade, shade), outline=(45, 45, 45))
    draw.text((16, 14), label, fill="black")
    return image


def prepare_obj_annotation(previous_input: ImageInput | None, current_input: ImageInput) -> PreparedStructuredAnnotation:
    prepared = _prepare_annotation(
        previous_input,
        current_input,
        extract_obj,
        "Use the extracted OBJ inventory and any derived preview.",
        "Explain the OBJ change using the extracted mesh inventory and any derived preview.",
        0.8,
    )
    if previous_input is None:
        return prepared
    previous_vertices, previous_faces = _obj_mesh(previous_input)
    current_vertices, current_faces = _obj_mesh(current_input)
    shared_frame = previous_vertices + current_vertices
    before = _render_obj_preview(
        previous_vertices, previous_faces, shared_frame, "BEFORE · shared camera"
    )
    after = _render_obj_preview(
        current_vertices, current_faces, shared_frame, "AFTER · shared camera"
    )
    images = prepared.images
    if before is not None and after is not None:
        comparison = _comparison_sheet(before, after)
        images = (
            (_image_input(comparison, "image/png", "png"),)
            if comparison is not None
            else ()
        )
    hints = _obj_artist_hints(previous_input, current_input)
    if not hints:
        return PreparedStructuredAnnotation(
            context=prepared.context,
            images=images,
            confidence_limit=prepared.confidence_limit,
        )
    compact_hints = json.dumps(hints, ensure_ascii=False, separators=(",", ":"))
    return PreparedStructuredAnnotation(
        context=(
            f"{prepared.context}\nArtist-facing spatial hints (local, approximate): "
            f"{compact_hints}"
        ),
        images=images,
        confidence_limit=prepared.confidence_limit,
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
