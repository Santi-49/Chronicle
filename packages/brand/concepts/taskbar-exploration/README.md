# Temporary Chronicle taskbar icon exploration

These concepts are deliberately isolated from `packages/brand/assets`; none is
wired into the desktop build. Pick a letter before promoting one into the
production light/dark asset set.

All concepts use a 48 × 48 construction grid, transparent backgrounds, bold
filled silhouettes, rounded geometry, and no more than two metaphors. PNGs at
24 px are the primary review size because Windows 11 uses 24 px in the taskbar
at 100% scaling.

| ID | Concept | Metaphor | Palette |
|---|---|---|---|
| A | Snapshot Clock | overlapping versions + time | Azure monochrome (`#1d4ed8`, `#60a5fa`) |
| B | Rewind Frame | history loop + image frame | Teal monochrome (`#0f766e`, `#2dd4bf`) |
| C | Version Cascade | successive creative layers | Indigo–violet analogous (`#4338ca`, `#8b5cf6`, `#c4b5fd`) |
| D | Timeline Ribbon | continuous history + current point | Orange–amber analogous (`#c2410c`, `#f97316`, `#fbbf24`) |
| E | Before / After | two states + transition | Blue–cyan analogous (`#075985`, `#0284c7`, `#22d3ee`) |
| F | Temporal Aperture | creative aperture + time progression | Violet–magenta analogous (`#6d28d9`, `#a855f7`, `#ec4899`) |

Research basis: Microsoft recommends simple singular forms, at most two
metaphors, few shapes/corners, detail only on the most prominent layer, limited
color treatments, and a minimum 3:1 contrast for at least half of the icon on
light and dark contexts. It also recommends exact-size icon resources rather
than relying on Windows to scale a larger source.

Sources:

- https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design
- https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction

Regenerate PNGs and the comparison board with:

```powershell
powershell -ExecutionPolicy Bypass -File packages/brand/concepts/taskbar-exploration/export-concepts.ps1
```
