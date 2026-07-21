# Chronicle demo assets

A small pack of creative files for exercising Chronicle end to end — capture,
AI change summaries, timeline, and search — with deliberately obvious diffs.

## Layout

```
demo-assets/
  sources/     ← COMMITTED version library. Never watched, never overwritten.
    logo/      logo_v1.png  logo_v2.png  logo_v3.png
    banner/    banner_v1.jpg banner_v2.jpg banner_v3.jpg
    product/   product_v1.jpg product_v2.jpg product_v3.jpg
  workspace/   ← POINT CHRONICLE HERE. Files get replaced in place (git-ignored).
    logo.png · banner.jpg · product.jpg
  .state.json  ← current workspace version per asset (git-ignored)
```

`sources/` is committed so everyone has the assets without installing Pillow.
`workspace/` and `.state.json` are git-ignored — they are mutable test state.

## The version stories (what the AI diff should say)

| Asset   | v1 → v2 → v3 |
|---------|--------------|
| logo    | navy + tagline → **teal** + tagline → teal, **tagline removed** |
| banner  | "40% OFF" orange → **"50% OFF"** orange → 50% OFF **purple + "Limited time only"** |
| product | grey bottle → **green** bottle → green bottle **+ red NEW badge** |

## Commands (from the repo root)

```bash
make demo-reset               # copy v1 of each asset into workspace/ (no Pillow needed)
make demo-status              # show the current workspace version of each asset
make demo-next ASSET=logo     # swap in the next version (omit ASSET = advance all; wraps)
make demo-set ASSET=logo V=3  # jump the workspace to a specific version
make demo-assets              # RE-RENDER sources/ from scratch (needs Pillow) + reset
make demo-clean               # delete workspace/ + .state.json; preserve committed sources/
```

## Typical test loop

1. `make demo-reset`
2. In the app, add a project pointing at `demo-assets/workspace/`.
3. `make demo-next ASSET=logo` → Chronicle captures logo v2; AI: "background navy → teal".
4. `make demo-next ASSET=logo` again → v3; AI: "tagline removed".

The generator lives at [`scripts/demo_assets.py`](../scripts/demo_assets.py).
