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
