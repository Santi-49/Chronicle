# Chronicle demo assets

A pack of creative files covering **every format Chronicle captures**, for
exercising the app end to end — capture, previews, 3D viewing, timeline,
restore, search, and (where it is implemented) the AI change summary — with
deliberately obvious diffs.

## Layout

```
demo-assets/
  sources/     ← COMMITTED version library. Never watched, never overwritten.
    <asset>/<asset>_v1..v3.<ext>
  workspace/   ← POINT CHRONICLE HERE. Files get replaced in place (git-ignored).
    brand/            chronicle-mark.svg
    marketing/        banner.jpg · hero.jpg
    marketing/print/  poster.psd · billboard.psb
    marketing/social/ ad-square.psd
    photography/      product.jpg
    3d/               logo-badge.obj
    cad/              mounting-bracket.step
    blender/          product-scene.blend
  .state.json  ← current workspace version per asset (git-ignored)
```

`sources/` is committed so everyone has the assets without installing Pillow.
`workspace/` and `.state.json` are git-ignored — they are mutable test state.

The nested tree is deliberate: it exercises recursive watching, and the
per-discipline folders make the project form's file-type toggles easy to demo.

## The version stories

Ten assets, three versions each. Every step changes one obvious thing.

| Asset | Format | v1 → v2 → v3 |
|---|---|---|
| `chronicle-mark.svg` | SVG | the real mark **mirrored left-to-right in amber** → **orientation corrected** → today's **official blue** |
| `banner.jpg` | JPG | "40% OFF" orange → **"50% OFF"** orange → 50% OFF **purple + "Limited time only"** |
| `hero.jpg` | JPG | warm dawn → **cool dusk** → dusk **+ headline** |
| `product.jpg` | JPG | grey bottle → **green** bottle → green bottle **+ red NEW badge** |
| `poster.psd` | PSD | navy "OPEN STUDIO" → teal **"STUDIO NIGHT"** → **`tagline` layer removed** |
| `ad-square.psd` | PSD | £49 on blue → **£39** → dark background **+ `badge` layer** |
| `billboard.psb` | PSB | dusk artwork → **dawn artwork + reworded headline** → **+ `logo-lockup` layer** |
| `logo-badge.obj` | OBJ | plain plate → **chamfer rail** → **+ raised emblem boss** |
| `mounting-bracket.step` | STEP | 8 mm wall → **12 mm wall** → **+ gusset** |
| `product-scene.blend` | BLEND | grey product preview → **green** product → green **+ NEW badge** |

The PSD/PSB stories add and remove **named layers**, which is what Chronicle's
PSD structure diff is built to describe ("the `tagline` layer was removed").

## What each format demonstrates

| Format | Preview in lists | Details screen | AI summary |
|---|---|---|---|
| JPG | the image itself | the image | ✅ implemented |
| PSD | embedded Photoshop thumbnail | that thumbnail | ✅ implemented |
| SVG | rendered natively, uncropped | the vector | ⏳ queued |
| PSB | embedded Photoshop thumbnail | that thumbnail | ⏳ queued |
| OBJ | flat-shaded SVG projection | **interactive 3D** | ⏳ queued |
| STEP | format placeholder (no still preview) | **interactive 3D** (OpenCascade) | ⏳ queued |
| BLEND | the preview Blender embeds | that preview | ⏳ queued |

⏳ = captured, versioned, restorable, and keyword-searchable today; the AI
annotation job stays queued until that format's adapter ships (POST-02).

**PNG has no asset in this pack.** JPG already covers the raster + AI path, and
the pack favours one strong asset per format over near-duplicates.

## Commands (from the repo root)

```bash
make demo-reset                     # copy v1 of each asset into workspace/ (no Pillow needed)
make demo-status                    # show the current workspace version of each asset
make demo-next                      # advance every asset to its next version (wraps)
make demo-next ASSET=poster         # advance one asset
make demo-next ASSET=psd            # advance every asset of one format
make demo-set ASSET=chronicle-mark V=3
make demo-assets                    # RE-RENDER sources/ from scratch (needs Pillow) + reset
make demo-clean                     # delete workspace/ + .state.json; preserve committed sources/
```

`ASSET=` accepts an asset id (`poster`), a format id (`psd`, `obj`, …), or `all`.

## Typical test loop

1. `make demo-reset`
2. In the app, add a project pointing at `demo-assets/workspace/`, with every
   file type enabled.
3. `make demo-next ASSET=poster` → Chronicle captures poster v2; the AI says the
   headline changed.
4. `make demo-next ASSET=poster` again → v3; the `tagline` layer is gone.
5. `make demo-set ASSET=chronicle-mark V=3` → the mark flips from the mirrored
   amber draft to the official blue.

> **Editing an existing project:** enabling a file type re-scans the folder, so
> files already sitting there are captured immediately. A project created before
> a format shipped keeps its old selection until you enable the new types.
>
> **Moving a file** (including into a new subfolder) starts a **new asset** at
> v1 — asset identity is the file path (spec F3.7). The old asset keeps its
> history and is marked "file no longer on disk".

## How the files are made

Everything is generated by [`scripts/demo_assets.py`](../scripts/demo_assets.py)
from the format specifications — see
[`scripts/demo_formats/`](../scripts/demo_formats/) for one writer per format
family. Regenerating produces byte-identical files (fixed timestamps, no
randomness), so `sources/` only changes when a story does.

The pack is verified against the app's *own* readers by
[`demo-pack.test.ts`](../apps/desktop/src/main/formats/demo-pack.test.ts): the
watcher accepts every file, metadata parses, previews are produced, the OBJ
yields geometry, and the STEP file is tessellated by the same CAD kernel the 3D
viewer uses.

> **One caveat — the `.blend` file.** Only Blender can author a real `.blend`
> (it is a dump of Blender's own structs plus a `DNA1` block). This one has a
> valid file header and a genuine rendered thumbnail — which is everything
> Chronicle reads from a `.blend`, since it never invokes Blender and never
> executes a file's embedded Python — but **Blender will not open it**. Drop in
> Blender-authored files if you have them; nothing else needs to change. See
> [`scripts/demo_formats/blend.py`](../scripts/demo_formats/blend.py).
