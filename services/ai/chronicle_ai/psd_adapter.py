"""Safe, token-bounded PSD extraction for version annotation.

PSD bytes are parsed locally. The configured AI provider receives only a compact
JSON description of the extracted structure and, when useful, one derived JPEG
preview. Opaque PSD bytes never leave the local service.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
import json
from typing import Any

from PIL import Image, ImageChops, ImageDraw
from psd_tools import PSDImage

from .schemas import ImageInput


MAX_ALLOC_BYTES = 64 * 1024 * 1024
MAX_PSD_BYTES = 50 * 1024 * 1024
MAX_PREVIEW_EDGE = 1024
MAX_LAYER_RECORDS = 40
MAX_DIFF_CHANGES = 24
MAX_TEXT_LENGTH = 240
MAX_EVIDENCE_CHARS = 7_000
CONTACT_SHEET_SIZE = (1024, 512)


class PsdExtractionError(ValueError):
    """The supplied PSD cannot be safely extracted."""


@dataclass(frozen=True)
class PsdDocument:
    metadata: dict[str, Any]
    layers: tuple[dict[str, Any], ...]
    preview: Image.Image | None
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class PreparedPsdAnnotation:
    context: str
    images: tuple[ImageInput, ...]
    confidence_limit: float | None


def _short(value: object, limit: int = MAX_TEXT_LENGTH) -> str:
    text = str(value).replace("\x00", "").strip()
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


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


def _layer_records(document: PSDImage) -> tuple[tuple[dict[str, Any], ...], tuple[str, ...]]:
    records: list[dict[str, Any]] = []
    warnings: set[str] = set()
    path_counts: dict[str, int] = {}

    def visit(group: Any, parents: tuple[str, ...] = ()) -> None:
        for index, layer in enumerate(group):
            if len(records) >= MAX_LAYER_RECORDS:
                warnings.add(f"Layer inventory truncated at {MAX_LAYER_RECORDS} entries.")
                return
            name = _short(layer.name, 120) or f"unnamed-{index + 1}"
            layer_path = "/".join((*parents, name))
            path_counts[layer_path] = path_counts.get(layer_path, 0) + 1
            fallback_key = (
                layer_path
                if path_counts[layer_path] == 1
                else f"{layer_path}#{path_counts[layer_path]}"
            )
            record: dict[str, Any] = {
                "key": f"id:{layer.layer_id}" if layer.layer_id >= 0 else fallback_key,
                "path": layer_path,
                "kind": layer.kind,
                "visible": bool(layer.visible),
                "opacity": round(layer.opacity / 255, 3),
                "bbox": list(layer.bbox),
            }
            if layer.kind == "type":
                try:
                    record["text"] = _short(layer.text)
                except Exception:
                    warnings.add(f'Text content could not be read for layer "{layer_path}".')
                warnings.add("Photoshop fonts are not reproduced exactly in the local preview.")
            elif layer.kind == "smartobject":
                warnings.add("Smart Object internals were not inspected.")
            elif layer.kind == "adjustment":
                warnings.add("Some adjustment-layer rendering may be partial.")
            records.append(record)
            if layer.is_group():
                visit(layer, (*parents, name))

    visit(document)
    return tuple(records), tuple(sorted(warnings))


def extract_psd(source: ImageInput) -> PsdDocument:
    """Parse one PSD under bounded allocation and return local derived evidence."""

    if len(source.base64) > ((MAX_PSD_BYTES + 2) // 3) * 4:
        raise PsdExtractionError("The PSD exceeds Chronicle's 50 MB safety limit.")
    try:
        raw = base64.b64decode(source.base64, validate=True)
        if len(raw) > MAX_PSD_BYTES:
            raise PsdExtractionError("The PSD exceeds Chronicle's 50 MB safety limit.")
        document = PSDImage.open(BytesIO(raw), max_alloc_bytes=MAX_ALLOC_BYTES)
    except PsdExtractionError:
        raise
    except Exception as error:
        raise PsdExtractionError("The PSD file is corrupt or unsupported.") from error

    if document.version != 1:
        raise PsdExtractionError("The file is PSB; this increment supports PSD only.")

    layers, layer_warnings = _layer_records(document)
    warnings = set(layer_warnings)
    preview: Image.Image | None = None
    try:
        rendered = document.composite(force=False, color=1.0, alpha=1.0)
        if rendered is not None:
            preview = _normalise_preview(rendered)
        else:
            warnings.add("No composite preview was available.")
    except Exception:
        warnings.add("The composite preview could not be rendered safely.")

    metadata = {
        "width": document.width,
        "height": document.height,
        "colorMode": document.color_mode.name.lower(),
        "depth": document.depth,
        "layerCount": len(tuple(document.descendants())),
    }
    return PsdDocument(metadata, layers, preview, tuple(sorted(warnings)))


def _jpeg_input(image: Image.Image) -> ImageInput:
    output = BytesIO()
    image.save(output, format="JPEG", quality=82, optimize=True)
    return ImageInput.model_validate(
        {
            "base64": base64.b64encode(output.getvalue()).decode("ascii"),
            "mediaType": "image/jpeg",
            "format": "jpeg",
        }
    )


def _fit_panel(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    panel = image.copy()
    panel.thumbnail(size, Image.Resampling.LANCZOS)
    return panel


def _comparison_sheet(previous: Image.Image, current: Image.Image) -> Image.Image | None:
    """Return one before/after JPEG canvas, cropped when a local change is small."""

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

    sheet = Image.new("RGB", CONTACT_SHEET_SIZE, "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), "BEFORE", fill="black")
    draw.text((528, 12), "AFTER", fill="black")
    for image, left in ((previous, 16), (current, 528)):
        panel = _fit_panel(image, (480, 464))
        x = left + (480 - panel.width) // 2
        y = 40 + (456 - panel.height) // 2
        sheet.paste(panel, (x, y))
    return sheet


def _structure_diff(previous: PsdDocument, current: PsdDocument) -> dict[str, Any]:
    changes: list[dict[str, Any]] = []
    for field in ("width", "height", "colorMode", "depth", "layerCount"):
        before = previous.metadata[field]
        after = current.metadata[field]
        if before != after:
            changes.append({"scope": "document", "field": field, "before": before, "after": after})

    previous_by_key = {layer["key"]: layer for layer in previous.layers}
    current_by_key = {layer["key"]: layer for layer in current.layers}
    for key in sorted(previous_by_key.keys() - current_by_key.keys()):
        changes.append({"scope": "layer", "change": "removed", "layer": previous_by_key[key]["path"]})
    for key in sorted(current_by_key.keys() - previous_by_key.keys()):
        changes.append({"scope": "layer", "change": "added", "layer": current_by_key[key]["path"]})
    for key in sorted(previous_by_key.keys() & current_by_key.keys()):
        before_layer = previous_by_key[key]
        after_layer = current_by_key[key]
        fields: dict[str, list[Any]] = {}
        for field in ("path", "kind", "visible", "opacity", "bbox", "text"):
            before = before_layer.get(field)
            after = after_layer.get(field)
            if before != after:
                fields[field] = [before, after]
        if fields:
            changes.append({"scope": "layer", "layer": after_layer["path"], "fields": fields})

    truncated = len(changes) > MAX_DIFF_CHANGES
    return {
        "document": {"before": previous.metadata, "after": current.metadata},
        "changes": changes[:MAX_DIFF_CHANGES],
        "truncated": truncated,
    }


def _bounded_json(evidence: dict[str, Any]) -> tuple[str, bool]:
    """Keep provider text context valid JSON and within a deterministic budget."""

    bounded = dict(evidence)
    collection_name = "layers" if "layers" in bounded else "changes"
    bounded[collection_name] = list(bounded.get(collection_name, []))
    truncated = False
    while True:
        encoded = json.dumps(bounded, ensure_ascii=False, separators=(",", ":"))
        if len(encoded) <= MAX_EVIDENCE_CHARS or not bounded[collection_name]:
            return encoded, truncated
        bounded[collection_name].pop()
        bounded["contextTruncated"] = True
        truncated = True


def prepare_psd_annotation(
    previous_input: ImageInput | None,
    current_input: ImageInput,
) -> PreparedPsdAnnotation:
    """Build compact deterministic context and at most one provider image."""

    current = extract_psd(current_input)
    warnings = set(current.warnings)
    images: tuple[ImageInput, ...] = ()
    if previous_input is None:
        evidence: dict[str, Any] = {
            "mode": "first-version",
            "document": current.metadata,
            "layers": list(current.layers),
            "warnings": list(current.warnings),
        }
        if current.preview is not None:
            images = (_jpeg_input(current.preview),)
            visual_note = "One locally derived PSD composite preview follows."
        else:
            visual_note = "No reliable visual preview is available; use structure only."
    else:
        previous = extract_psd(previous_input)
        warnings.update(previous.warnings)
        evidence = {
            "mode": "version-diff",
            **_structure_diff(previous, current),
            "warnings": sorted(warnings),
        }
        if previous.preview is not None and current.preview is not None:
            sheet = _comparison_sheet(previous.preview, current.preview)
            if sheet is not None:
                images = (_jpeg_input(sheet),)
                visual_note = "One comparison sheet follows: BEFORE is left and AFTER is right."
            else:
                visual_note = "The normalized composites are pixel-identical; use structure only."
        else:
            visual_note = "A complete visual comparison was unavailable; use structure only."

    encoded_evidence, context_truncated = _bounded_json(evidence)
    if context_truncated:
        warnings.add("Provider evidence was truncated to the context budget.")
    context = (
        "Deterministic local PSD evidence follows. Treat it as factual, do not infer intent. "
        f"{visual_note} Report coverage limitations through confidence.\n"
        + encoded_evidence
    )
    return PreparedPsdAnnotation(
        context=context,
        images=images,
        confidence_limit=0.75 if warnings else None,
    )
