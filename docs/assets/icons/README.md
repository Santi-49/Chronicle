# Documentation icons

Small SVG glyphs used by the repository documentation (currently the root `README.md`
feature table).

These are [Google Material Symbols](https://github.com/google/material-design-icons)
outlined glyphs, licensed under the **Apache License 2.0** — the same set the desktop app
self-hosts through the `@material-symbols/svg-400` dependency. Only the glyphs actually used
are committed here, each recolored to Chronicle's `#4589ff` accent so it stays legible on both
light and dark documentation backgrounds.

| File | Material Symbols glyph |
|---|---|
| `capture.svg` | `photo_camera` |
| `ai-diff.svg` | `wand_stars` |
| `search.svg` | `search` |
| `restore.svg` | `settings_backup_restore` |
| `formats.svg` | `shapes` |
| `projects.svg` | `folder_open` |
| `local-first.svg` | `computer` |
| `byok.svg` | `key` |
| `activity.svg` | `monitoring` |
| `validated.svg` | `verified` |

To add one, copy the glyph from `apps/desktop/node_modules/@material-symbols/svg-400/outlined/`
and add `fill="#4589ff"` to its `<path>`.
