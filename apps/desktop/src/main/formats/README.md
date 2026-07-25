# Formats — per-format behavior

Everything the main process knows about a specific creative file format lives
here, keyed by the format ids declared in [`src/shared/formats.ts`](../../shared/formats.ts).

Nothing else in the app branches on a file extension: the watcher, capture,
media protocol, AI worker, telemetry, and renderer all read the registry.

## Adding a format

1. **Declare it** in `src/shared/formats.ts`: extensions, media type, preview
   strategy, viewer kind, placeholder icon, how a preview fills its frame, and
   `aiFormat` (`null` until the AI service can annotate it).
2. **Add its behavior** here — a metadata reader and/or a preview generator —
   and register both in [`index.ts`](index.ts).
3. **Cover it** in [`formats.test.ts`](formats.test.ts). The registry tests
   iterate every declared format, so a new entry is partly covered the moment
   it exists; add fixtures for its own header/structure to
   [`fixtures.ts`](fixtures.ts).
4. **When AI support lands** (POST-02), add the adapter and prompt sections in
   `services/ai/` and set `aiFormat`. Until then the format captures, previews,
   restores, and keyword-searches normally while its annotation jobs wait in
   the queue.

No step involves editing a list of extensions somewhere else.

## Rules every handler follows

- **Never throw.** Handlers run on arbitrary stored bytes. A corrupt, hostile,
  or simply unusual file must produce `null`, which the caller renders as the
  format's placeholder. Failing to parse is a normal outcome, not an error.
- **Never allocate from an unvalidated size.** A length read out of a file is
  untrusted input: bound it before allocating (see the thumbnail checks in
  [`blend.ts`](blend.ts) and [`photoshop.ts`](photoshop.ts)).
- **Never execute embedded code.** Creative formats can carry macros, Python,
  expressions, or plug-in payloads. Handlers parse structure only; no file's
  code is ever run, and no host application is invoked.
- **Stay bounded in time and memory.** Preview generation runs in the main
  process, so it must not stall IPC. Large inputs are read up to a cap and the
  result is a partial preview rather than a frozen UI (see [`obj.ts`](obj.ts)).
- **Follow no external references.** Compound formats point at fonts,
  textures, and linked media. Handlers read only the file they were given —
  never paths outside the content-addressed library.

## Layout

| File | Role |
|------|------|
| `index.ts` | Format id → handler registry; the only dispatch point |
| `io.ts` | Safe file access helpers and the two result shapes |
| `raster.ts` | PNG and JPEG dimensions from their headers |
| `svg.ts` | SVG size from `width`/`height`, falling back to `viewBox` |
| `photoshop.ts` | PSD/PSB dimensions + the embedded JPEG thumbnail |
| `obj.ts` | Wavefront OBJ geometry parsing |
| `blend.ts` | Blender header facts + the embedded `TEST` thumbnail |
| `mesh.ts` | Triangle mesh type and its SVG thumbnail rendering |
| `png-encode.ts` | Raw RGBA → PNG, for bitmaps recovered from a container |
| `preview-cache.ts` | Lazy, content-hash-addressed derived previews |
| `fixtures.ts` | Byte-level fixtures shared by the test suites |

## Previews

Formats Chromium cannot decode need a derived image. Previews are generated
**lazily**, the first time the renderer requests
`chronicle://preview/<format>/<hash>`, and cached under
`previews/<h2>/<hash>.<format>.<ext>` beside the library. That keeps capture a
pure hash-and-store operation, deduplicates conversion across every asset and
version sharing the same bytes, and makes the cache disposable — deleting it
only costs a regeneration.

Preview sources, by format:

- **PSD/PSB** — the JPEG thumbnail Photoshop embeds in the image-resources
  section. This works for PSB, which the JavaScript PSD libraries do not
  support, and needs no PSD renderer. A document saved without preview data
  simply has no thumbnail.
- **OBJ** — the parsed mesh, projected and flat-shaded into a small SVG. SVG
  rather than a bitmap because Chromium renders it natively, it stays a few
  kilobytes, and it needs neither a GPU in the main process nor a raster
  encoder.
- **BLEND** — the screenshot Blender stores in a `TEST` file-block. Its layout
  is not covered by public Blender documentation, so it is validated against
  the block length and a plausible size before use; an unrecognised layout
  yields no preview rather than a corrupt image.
- **STEP** — none. Tessellating STEP needs a CAD kernel, which runs in the
  renderer's 3D viewer instead (a heavy assembly must not block capture). Lists
  show the format placeholder; the details screen shows the real model.
