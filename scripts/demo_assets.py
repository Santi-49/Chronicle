#!/usr/bin/env python3
"""Chronicle demo asset generator.

Produces a small, git-ignored pack of creative assets to exercise the app end
to end: a tracked *workspace* folder you point Chronicle at, plus an untouched
*sources* library holding several distinct versions of each file. Swapping a
source version into the workspace overwrites the tracked file exactly like a
designer re-saving in Photoshop — Chronicle then captures a new version and the
AI describes the change (colour swap, price edit, removed tagline, ...).

Layout under demo-assets/ (sources/ is committed; workspace/ + state are git-ignored):

    demo-assets/
      sources/                 <- COMMITTED untouched version library (never watched)
        logo/    logo_v1.png  logo_v2.png  logo_v3.png
        banner/  banner_v1.jpg ...
        product/ product_v1.jpg ...
      workspace/               <- POINT CHRONICLE HERE (files get replaced; git-ignored)
        logo.png
        banner.jpg
        product.jpg
      .state.json              <- which source version each workspace file holds (git-ignored)

Only ``generate`` needs Pillow (it re-renders the committed sources). The everyday
commands — reset/set/next/status/clean — only copy files, so a fresh clone can drive
the workspace straight from the committed sources with no extra dependency.

Commands (usually driven by the Makefile):

    generate            (re)build sources/ and reset workspace to v1
    reset               copy every asset's v1 into workspace/
    set   <asset> <n>   put a specific version into the workspace
    next  [asset]       advance one asset (or all) to its next version, wrapping
    status              print the current workspace version of each asset
    clean               delete the whole demo-assets/ folder

The changes between versions are intentionally obvious so the AI diff has an
easy, demo-friendly story to tell:

    logo     navy w/ tagline  ->  teal w/ tagline  ->  teal, tagline removed
    banner   40% OFF / orange ->  50% OFF / orange ->  50% OFF / purple + urgency
    product  grey bottle      ->  green bottle     ->  green bottle + NEW badge
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

# Pillow is only needed to (re)render the source library. The everyday file-copy
# commands work without it, so a fresh clone can drive the committed sources.
try:
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError:  # pragma: no cover - guidance only
    Image = ImageDraw = ImageFont = None  # type: ignore[assignment]

# --- Paths -----------------------------------------------------------------
# demo-assets/ lives at the repo root (this file is scripts/demo_assets.py).
REPO_ROOT = Path(__file__).resolve().parent.parent
ROOT = REPO_ROOT / "demo-assets"
SOURCES = ROOT / "sources"
WORKSPACE = ROOT / "workspace"
STATE_FILE = ROOT / ".state.json"

# --- Asset catalogue -------------------------------------------------------
# Each asset renders to `versions` distinct source files; the workspace holds
# one at a time under a stable name (so Chronicle treats it as one asset).
ASSETS: dict[str, dict] = {
    "logo": {"ext": "png", "size": (1000, 1000), "versions": 3},
    "banner": {"ext": "jpg", "size": (1200, 400), "versions": 3},
    "product": {"ext": "jpg", "size": (1000, 1000), "versions": 3},
}

# --- Palette ---------------------------------------------------------------
NAVY = (18, 28, 71)
TEAL = (13, 115, 119)
ORANGE = (222, 106, 30)
PURPLE = (91, 46, 138)
INK = (24, 24, 27)
PAPER = (247, 247, 248)
CLOUD = (228, 230, 235)
GREY = (120, 124, 132)
GREEN = (46, 139, 87)
RED = (200, 52, 52)
WHITE = (250, 250, 250)


# --- Font helper -----------------------------------------------------------
def _font(size: int) -> ImageFont.FreeTypeFont:
    """A scalable font at the requested size, falling back to Pillow's default.

    Pillow bundles a scalable default font (``load_default(size=...)`` since
    v10.1), so this needs no system fonts and stays deterministic across
    machines.
    """
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow: bitmap default, size ignored
        return ImageFont.load_default()


def _center_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill,
    *,
    weight: int = 1,
) -> None:
    """Draw horizontally-centred text at (cx, top). `weight` fakes bold by
    overdrawing with small offsets (the bundled font has no bold variant)."""
    cx, top = xy
    left, t, right, b = draw.textbbox((0, 0), text, font=font)
    w = right - left
    x = cx - w // 2
    for dx in range(weight):
        draw.text((x + dx, top), text, font=font, fill=fill)


# --- Renderers -------------------------------------------------------------
def render_logo(version: int, size: tuple[int, int]) -> Image.Image:
    w, h = size
    bg = NAVY if version == 1 else TEAL
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)

    # Emblem: a ring (version "orbit") above the wordmark.
    cx, cy, r = w // 2, int(h * 0.34), int(h * 0.12)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=WHITE, width=int(h * 0.02))
    d.ellipse((cx - 8, cy - r - 8, cx + 8, cy - r + 8), fill=WHITE)

    _center_text(d, (cx, int(h * 0.52)), "Chronicle", _font(int(h * 0.12)), WHITE, weight=2)

    if version in (1, 2):
        _center_text(
            d,
            (cx, int(h * 0.68)),
            "version control for creatives",
            _font(int(h * 0.045)),
            CLOUD,
        )
    return img


def render_banner(version: int, size: tuple[int, int]) -> Image.Image:
    w, h = size
    bg = PURPLE if version == 3 else ORANGE
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)

    pad = int(h * 0.18)
    d.text((pad, int(h * 0.16)), "SUMMER SALE", font=_font(int(h * 0.22)), fill=WHITE)

    discount = "40% OFF" if version == 1 else "50% OFF"
    d.text((pad, int(h * 0.44)), discount, font=_font(int(h * 0.34)), fill=WHITE)

    if version == 3:
        d.text(
            (pad, int(h * 0.83)),
            "Limited time only",
            font=_font(int(h * 0.11)),
            fill=CLOUD,
        )
    return img


def render_product(version: int, size: tuple[int, int]) -> Image.Image:
    w, h = size
    bg = CLOUD if version == 3 else PAPER
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)

    body = GREY if version == 1 else GREEN
    # A stylised bottle: shoulders + body + cap.
    bx0, bx1 = int(w * 0.36), int(w * 0.64)
    by0, by1 = int(h * 0.34), int(h * 0.82)
    d.rounded_rectangle((bx0, by0, bx1, by1), radius=int(w * 0.06), fill=body)
    # neck + cap
    nx0, nx1 = int(w * 0.44), int(w * 0.56)
    d.rectangle((nx0, int(h * 0.26), nx1, by0 + 10), fill=body)
    d.rounded_rectangle(
        (nx0 - 6, int(h * 0.22), nx1 + 6, int(h * 0.27)), radius=8, fill=INK
    )
    # label band
    d.rectangle((bx0, int(h * 0.5), bx1, int(h * 0.62)), fill=WHITE)

    if version == 3:
        # "NEW" badge, top-right.
        r = int(w * 0.1)
        ccx, ccy = int(w * 0.76), int(h * 0.24)
        d.ellipse((ccx - r, ccy - r, ccx + r, ccy + r), fill=RED)
        _center_text(d, (ccx, ccy - int(r * 0.35)), "NEW", _font(int(r * 0.55)), WHITE, weight=2)
    return img


RENDERERS = {"logo": render_logo, "banner": render_banner, "product": render_product}


# --- State -----------------------------------------------------------------
def _load_state() -> dict[str, int]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def _save_state(state: dict[str, int]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def _source_path(asset: str, version: int) -> Path:
    ext = ASSETS[asset]["ext"]
    return SOURCES / asset / f"{asset}_v{version}.{ext}"


def _workspace_path(asset: str) -> Path:
    ext = ASSETS[asset]["ext"]
    return WORKSPACE / f"{asset}.{ext}"


def _save_image(img: Image.Image, path: Path, ext: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if ext in ("jpg", "jpeg"):
        img.save(path, "JPEG", quality=90)
    else:
        img.save(path, "PNG")


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
    for asset, spec in ASSETS.items():
        for v in range(1, spec["versions"] + 1):
            img = RENDERERS[asset](v, spec["size"])
            _save_image(img, _source_path(asset, v), spec["ext"])
        print(f"  sources/{asset}: {spec['versions']} versions")
    print(f"Sources written to {SOURCES}")
    cmd_reset()


def _place(asset: str, version: int, state: dict[str, int]) -> None:
    src = _source_path(asset, version)
    if not src.exists():
        sys.exit(f"Missing source {src}. Run: make demo-assets")
    dst = _workspace_path(asset)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    state[asset] = version


def cmd_reset() -> None:
    state = _load_state()
    for asset in ASSETS:
        _place(asset, 1, state)
    _save_state(state)
    print(f"Workspace reset to v1 at {WORKSPACE}")
    cmd_status()


def cmd_set(asset: str, version: int) -> None:
    if asset not in ASSETS:
        sys.exit(f"Unknown asset '{asset}'. Choices: {', '.join(ASSETS)}")
    if not (1 <= version <= ASSETS[asset]["versions"]):
        sys.exit(f"{asset} has versions 1..{ASSETS[asset]['versions']}")
    state = _load_state()
    _place(asset, version, state)
    _save_state(state)
    print(f"{asset} -> v{version}")


def cmd_next(asset: str | None) -> None:
    state = _load_state()
    targets = [asset] if asset else list(ASSETS)
    for a in targets:
        if a not in ASSETS:
            sys.exit(f"Unknown asset '{a}'. Choices: {', '.join(ASSETS)}")
        current = state.get(a, 1)
        nxt = current + 1
        if nxt > ASSETS[a]["versions"]:
            nxt = 1  # wrap around for repeatable demos
        _place(a, nxt, state)
        print(f"{a}: v{current} -> v{nxt}")
    _save_state(state)


def cmd_status() -> None:
    state = _load_state()
    if not WORKSPACE.exists():
        print("Workspace not generated yet. Run: make demo-assets")
        return
    print("Workspace versions:")
    for asset, spec in ASSETS.items():
        cur = state.get(asset, "?")
        print(f"  {asset:<8} v{cur}/{spec['versions']}  ({_workspace_path(asset).name})")


def cmd_clean() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)
        print(f"Removed {ROOT}")
    else:
        print("Nothing to clean.")


# --- Entry point -----------------------------------------------------------
def main(argv: list[str]) -> None:
    if not argv:
        print(__doc__)
        return
    cmd, *rest = argv
    if cmd == "generate":
        cmd_generate()
    elif cmd == "reset":
        cmd_reset()
    elif cmd == "set":
        if len(rest) != 2:
            sys.exit("Usage: demo_assets.py set <asset> <version>")
        cmd_set(rest[0], int(rest[1]))
    elif cmd == "next":
        cmd_next(rest[0] if rest else None)
    elif cmd == "status":
        cmd_status()
    elif cmd == "clean":
        cmd_clean()
    else:
        sys.exit(f"Unknown command '{cmd}'.\n{__doc__}")


if __name__ == "__main__":
    main(sys.argv[1:])
