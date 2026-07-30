# Chronicle brand assets

Shared source files for the desktop app, landing page, installers, and future
marketing exports. Do not redraw the mark inside an application.

## Variants

- `chronicle-mark-light.*` is for light surfaces.
- `chronicle-mark-dark.*` is for dark surfaces.
- `chronicle-app-icon-*` adds a high-contrast tile for operating-system and
  launcher contexts where the surrounding surface is unknown.
- `chronicle-app-icon.ico` is the multi-resolution Windows executable/taskbar
  icon, generated from the dark app-icon variant because its tile stays clear
  against both light and dark Windows taskbars.

SVG files are the source of truth. PNG exports live in `assets/png/` at 32,
64, 128, 256, and 512 px. Regenerate them with:

```powershell
powershell -ExecutionPolicy Bypass -File packages/brand/scripts/export-assets.ps1
```

## Banner

`assets/chronicle-banner-1920x600.png` is the wide banner for the challenge
submission page and social/OG cards. Its source is
`scripts/banner-1920x600.html`, a fixed 1920x600 composition. The featured
design is original poster art drawn inline as three SVG symbols, one per
version, so the large preview and its thumbnail share a single definition. It is
banner art rather than a screenshot, but each summary states a change the art
actually makes: amber to teal, then tagline removed and badge added. Keep that
property when editing, since the whole point of the product is that the words
match the pixels. Edit the HTML, then re-render:

```bash
node packages/brand/scripts/render-banner.mjs
```

Rendering uses the `playwright` Chromium already owned by `apps/landing`, and
the viewport is the artboard, so the output is exactly 1920x600 with no
resampling.
