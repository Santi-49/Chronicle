#!/usr/bin/env python3
"""Chronicle demo asset generator.

Produces a pack of creative files covering **every format Chronicle captures**,
to exercise the app end to end: a watched *workspace* tree you point Chronicle
at, plus an untouched *sources* library holding three versions of each file.
Swapping a source version into the workspace overwrites the tracked file exactly
like a designer re-saving — Chronicle then captures a new version, previews it,
and (for the formats with AI support) describes what changed.

Layout under demo-assets/ (sources/ is committed; workspace/ + state are ignored):

    demo-assets/
      sources/<asset>/<asset>_v<N>.<ext>   <- COMMITTED version library
      workspace/                           <- POINT CHRONICLE HERE
        brand/            chronicle-mark.svg
        marketing/        banner.jpg · hero.jpg
        marketing/print/  poster.psd · billboard.psb
        marketing/social/ ad-square.psd
        photography/      product.jpg
        3d/               logo-badge.obj
        cad/              mounting-bracket.step
        blender/          product-scene.blend
      .state.json                          <- current workspace version per asset

The nested tree is deliberate: it exercises recursive watching, and the
per-discipline subfolders make the project form's file-type toggles easy to demo.

Only ``generate`` needs Pillow (it re-renders the committed sources). The
everyday commands — reset/set/next/status/clean — only copy files, so a fresh
clone can drive the workspace straight from the committed sources.

Commands (usually driven by the Makefile):

    generate                 (re)build sources/ and reset the workspace to v1
    reset                    copy every asset's v1 into workspace/
    set   <asset|format> <n> put a specific version into the workspace
    next  [asset|format]     advance one asset, one format, or everything
    status [format]          print the current workspace version of each asset
    clean                    delete workspace/ and .state.json; keep sources/

`<asset|format>` accepts an asset id (``logo``), a format id (``psd`` — every
PSD at once), or ``all``.

Every version changes one obvious thing, so the diff has a story to tell. The
full table lives in demo-assets/README.md; the highlight is the Chronicle mark,
whose first version is the real mark mirrored left-to-right in an amber palette
and whose third is today's blue mark.
"""

from __future__ import annotations

import json
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

# Pillow is only needed to (re)render the source library. The everyday file-copy
# commands work without it, so a fresh clone can drive the committed sources.
try:
    from PIL import Image
except ModuleNotFoundError:  # pragma: no cover - guidance only
    Image = None  # type: ignore[assignment]

sys.path.insert(0, str(Path(__file__).resolve().parent))

# --- Paths -----------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
ROOT = REPO_ROOT / "demo-assets"
SOURCES = ROOT / "sources"
WORKSPACE = ROOT / "workspace"
STATE_FILE = ROOT / ".state.json"

#: Fixed timestamp so regenerating the pack produces byte-identical files.
TIMESTAMP = "2026-07-25T00:00:00"


# --- Catalogue -------------------------------------------------------------
@dataclass(frozen=True)
class Asset:
    """One tracked file: where it lives, and how each version is produced."""

    #: Unique id; also the sources/ subdirectory name.
    id: str
    #: Workspace-relative directory, e.g. "brand/icons".
    directory: str
    #: Format id, matching apps/desktop/src/shared/formats.ts.
    format: str
    #: File extension without the dot (".stp" and ".step" are both STEP).
    ext: str
    #: One-line story, for the README and `status` output.
    story: str
    #: build(version) -> str | bytes | PIL.Image | Document | _Blend
    build: Callable[[int], object] = field(repr=False, default=None)  # type: ignore[assignment]
    versions: int = 3

    @property
    def filename(self) -> str:
        return f"{self.id}.{self.ext}"


@dataclass
class _Blend:
    """A `.blend` payload, written when the asset is saved."""

    thumbnail: object
    compress: bool


def _catalogue() -> list[Asset]:
    """Build the asset list.

    The format writers are imported here rather than at module scope so the
    copy-only commands keep working without Pillow installed.
    """
    from demo_formats import mesh, raster, step, vector
    from demo_formats.photoshop import Document, Layer

    def layered(
        version: int,
        size: tuple[int, int],
        large: bool,
        artwork: dict[str, Image.Image],
        anchors: dict[str, tuple[float, float]],
    ) -> Document:
        """Place layer artwork on the canvas and flatten it into the composite.

        `anchors` positions each layer as a fraction of the free space, so one
        renderer works at any canvas size.
        """
        composite = Image.new("RGB", size, raster.PAPER)
        layers: list[Layer] = []
        for name, art in artwork.items():
            x_ratio, y_ratio = anchors.get(name, (0.5, 0.5))
            layers.append(
                Layer(
                    name,
                    art,
                    left=int((size[0] - art.width) * x_ratio),
                    top=int((size[1] - art.height) * y_ratio),
                )
            )
        for layer in layers:
            composite.paste(layer.image, (layer.left, layer.top), layer.image)
        return Document(
            width=size[0], height=size[1], composite=composite, layers=layers, large=large
        )

    return [
        # --- JPG ---------------------------------------------------------
        Asset("banner", "marketing", "jpg", "jpg",
              "40% OFF orange → 50% OFF orange → purple + urgency line",
              lambda v: raster.banner(v, (1200, 400))),
        Asset("hero", "marketing", "jpg", "jpg",
              "warm dawn → cool dusk → dusk + headline",
              lambda v: raster.hero(v, (1600, 900))),
        Asset("product", "photography", "jpg", "jpg",
              "grey bottle → green bottle → green bottle + NEW badge",
              lambda v: raster.product(v, (1000, 1000))),
        # --- SVG ---------------------------------------------------------
        Asset("chronicle-mark", "brand", "svg", "svg",
              "mirrored amber draft → orientation corrected → official blue",
              vector.chronicle_mark),
        # --- PSD ---------------------------------------------------------
        Asset("poster", "marketing/print", "psd", "psd",
              "navy OPEN STUDIO → teal STUDIO NIGHT → tagline layer removed",
              lambda v: layered(v, (900, 1200), False, raster.poster_layers(v, (900, 1200)),
                                {"backdrop": (0, 0), "headline": (0.5, 0.22),
                                 "tagline": (0.5, 0.62)})),
        Asset("ad-square", "marketing/social", "psd", "psd",
              "£49 on blue → £39 on blue → dark background + SALE badge layer",
              lambda v: layered(v, (1080, 1080), False, raster.ad_layers(v, (1080, 1080)),
                                {"backdrop": (0, 0), "product": (0.5, 0.28),
                                 "price": (0.5, 0.74), "badge": (0.88, 0.08)})),
        # --- PSB ---------------------------------------------------------
        Asset("billboard", "marketing/print", "psb", "psb",
              "dusk artwork → dawn artwork + reworded headline → logo lockup added",
              lambda v: layered(v, (2400, 800), True, raster.billboard_layers(v, (2400, 800)),
                                {"artwork": (0, 0), "headline": (0.5, 0.3),
                                 "logo-lockup": (0.94, 0.78)})),
        # --- OBJ ---------------------------------------------------------
        Asset("logo-badge", "3d", "obj", "obj",
              "plain plate → chamfer rail added → raised emblem boss",
              mesh.logo_badge),
        # --- STEP --------------------------------------------------------
        Asset("mounting-bracket", "cad", "step", "step",
              "8 mm wall → 12 mm wall → gusset added",
              lambda v: step.mounting_bracket(v, TIMESTAMP)),
        # --- BLEND -------------------------------------------------------
        # The embedded preview is what Chronicle reads from a .blend; see the
        # caveat in demo_formats/blend.py about these containers.
        Asset("product-scene", "blender", "blend", "blend",
              "grey product preview → green product → green + NEW badge",
              lambda v: _Blend(raster.product(v, (256, 256)), compress=True)),
    ]


def _assets() -> dict[str, Asset]:
    return {asset.id: asset for asset in _catalogue()}


# --- State -----------------------------------------------------------------
def _load_state() -> dict[str, int]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def _save_state(state: dict[str, int]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def _source_path(asset: Asset, version: int) -> Path:
    return SOURCES / asset.id / f"{asset.id}_v{version}.{asset.ext}"


def _workspace_path(asset: Asset) -> Path:
    return WORKSPACE / asset.directory / asset.filename


# --- Writing ---------------------------------------------------------------
def _write(asset: Asset, version: int, path: Path) -> None:
    """Render one version of one asset to `path`."""
    from demo_formats.blend import write_blend
    from demo_formats.photoshop import Document, write_document

    payload = asset.build(version)
    path.parent.mkdir(parents=True, exist_ok=True)

    if isinstance(payload, str):
        path.write_text(payload, encoding="utf-8", newline="\n")
    elif isinstance(payload, bytes):
        path.write_bytes(payload)
    elif isinstance(payload, Document):
        write_document(payload, path)
    elif isinstance(payload, _Blend):
        write_blend(payload.thumbnail, path, compress=payload.compress)
    elif asset.ext in ("jpg", "jpeg"):
        payload.convert("RGB").save(path, "JPEG", quality=90)
    else:
        payload.save(path, "PNG")


# --- Commands --------------------------------------------------------------
def cmd_generate() -> None:
    """Build every source version, then reset the workspace to v1."""
    if Image is None:
        sys.exit(
            "Pillow is required to (re)generate the source assets.\n"
            "Install it with:  python -m pip install pillow\n"
            "(A fresh clone already ships the committed sources — you can run\n"
            " `make demo-reset` / `demo-set` / `demo-next` without Pillow.)"
        )
    assets = _assets()
    per_format: dict[str, int] = {}
    for asset in assets.values():
        for version in range(1, asset.versions + 1):
            _write(asset, version, _source_path(asset, version))
        per_format[asset.format] = per_format.get(asset.format, 0) + 1
        print(f"  sources/{asset.id}: {asset.versions} versions ({asset.format})")
    summary = " · ".join(f"{count}x {fmt}" for fmt, count in sorted(per_format.items()))
    print(f"Sources written to {SOURCES}\n  {summary}")
    cmd_reset()


def _place(asset: Asset, version: int, state: dict[str, int]) -> None:
    source = _source_path(asset, version)
    if not source.exists():
        sys.exit(f"Missing source {source}. Run: make demo-assets")
    destination = _workspace_path(asset)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    state[asset.id] = version


def cmd_reset() -> None:
    assets = _assets()
    state = _load_state()
    for asset in assets.values():
        _place(asset, 1, state)
    _save_state(state)
    print(f"Workspace reset to v1 at {WORKSPACE} ({len(assets)} assets)")


def _resolve(assets: dict[str, Asset], selector: str) -> list[Asset]:
    """Resolve an asset id, a format id (every asset of that format), or 'all'."""
    if selector in ("all", ""):
        return list(assets.values())
    if selector in assets:
        return [assets[selector]]
    matching = [asset for asset in assets.values() if asset.format == selector]
    if matching:
        return matching
    formats = sorted({asset.format for asset in assets.values()})
    sys.exit(
        f"Unknown asset or format '{selector}'.\n"
        f"  assets:  {', '.join(assets)}\n"
        f"  formats: {', '.join(formats)}"
    )


def cmd_set(selector: str, version: int) -> None:
    assets = _assets()
    state = _load_state()
    for asset in _resolve(assets, selector):
        if not 1 <= version <= asset.versions:
            sys.exit(f"{asset.id} has versions 1..{asset.versions}")
        _place(asset, version, state)
        print(f"{asset.id} -> v{version}")
    _save_state(state)


def cmd_next(selector: str | None) -> None:
    assets = _assets()
    state = _load_state()
    for asset in _resolve(assets, selector or "all"):
        current = state.get(asset.id, 1)
        following = current + 1
        if following > asset.versions:
            following = 1  # wrap around for repeatable demos
        _place(asset, following, state)
        print(f"{asset.id}: v{current} -> v{following}")
    _save_state(state)


def cmd_status(selector: str | None = None) -> None:
    assets = _assets()
    if not WORKSPACE.exists():
        print("Workspace not generated yet. Run: make demo-reset")
        return
    state = _load_state()
    selected = _resolve(assets, selector or "all")
    width = max(len(asset.id) for asset in selected)
    print(f"Workspace versions ({len(selected)} assets under {WORKSPACE}):")
    for asset in selected:
        current = state.get(asset.id, "?")
        location = f"{asset.directory}/{asset.filename}"
        print(f"  {asset.format:<5} {asset.id:<{width}} v{current}/{asset.versions}  {location}")


def cmd_clean() -> None:
    removed: list[Path] = []
    if WORKSPACE.exists():
        shutil.rmtree(WORKSPACE)
        removed.append(WORKSPACE)
    if STATE_FILE.exists():
        STATE_FILE.unlink()
        removed.append(STATE_FILE)

    if removed:
        for path in removed:
            print(f"Removed {path}")
        print(f"Preserved source versions at {SOURCES}")
    else:
        print("Nothing to clean; source versions were preserved.")


# --- Entry point -----------------------------------------------------------
def main(argv: list[str]) -> None:
    if not argv:
        print(__doc__)
        return
    command, *rest = argv
    if command == "generate":
        cmd_generate()
    elif command == "reset":
        cmd_reset()
    elif command == "set":
        if len(rest) != 2:
            sys.exit("Usage: demo_assets.py set <asset|format> <version>")
        cmd_set(rest[0], int(rest[1]))
    elif command == "next":
        cmd_next(rest[0] if rest else None)
    elif command == "status":
        cmd_status(rest[0] if rest else None)
    elif command == "clean":
        cmd_clean()
    else:
        sys.exit(f"Unknown command '{command}'.\n{__doc__}")


if __name__ == "__main__":
    main(sys.argv[1:])
