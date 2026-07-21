# Solution Vision

## Core Concept

**Chronicle** — a local desktop app for tracking the evolution of creative work across the
formats used throughout the creative industry—from raster and vector design to documents,
3D/CAD, audio, video, and project files. It starts with PNG/JPG in the MVP, then expands through
format-aware extraction and previews. AI explains *what changed* between versions, replacing
`final_v8` chaos with a searchable, AI-annotated version timeline.

## Philosophy & Selling Point

Git solved version history for code because code is text and diffs are readable. Creative files are binary — designers get no history, no diff, no "why". They fake it with filename suffixes (`_final`, `_final2`, `_FINAL_approved`).

Chronicle's insight: **AI can make the evolution of creative files understandable the way git
makes source-code history understandable.** Different formats need different safe extraction,
preview, and comparison strategies, but the user should get one consistent history. A model can
compare two versions of a logo, a layout, a 3D render, an edit timeline, or a CAD design and
produce the human-readable diff conventional file history cannot: *"tagline removed, background
changed from navy to teal."* Individual tools may offer their own history, but the creative
industry has no unified, tool-independent version story across formats and disciplines. That's
the gap.

The unfair advantages:
- **Zero-friction capture** — no commits, no uploads. Watch a folder; every save becomes a version automatically.
- **Semantic search over history** — "the version with the blue background", "the pricing slide" — search by meaning, not filename.
- **Local-first storage** — versions remain on-device; Chronicle never uploads the library to its backend. The app runs without an account and works with any tool the designer already uses. AI inference is API-based through LangChain: BYOK sends the required inputs directly to the configured provider, or the user may optionally route inference through Chronicle's gateway.

## Target Users

- **Primary user:** Creative professionals and teams across graphic design, product/industrial
  design, architecture, photography, audio, video, and marketing who iterate across many tools
  and file formats.
- **Main pain point:** No usable version history for binary creative files — versions are lost, changes are unexplained, finding "that older version" is manual archaeology.
- **How this solves it:** Automatic capture of every saved version + AI-generated change summaries + semantic search across the entire history.

## Key Features — MVP

1. **Folder watcher** — user selects folders; file saves are detected (debounced, temp files ignored) and hashed; a changed hash creates a new version. MVP file types: **PNG/JPG**. Selected future formats: **SVG, BLEND, OBJ, STEP/STP, PSD, and PSB**.
2. **Version storage** — Asset → Versions model; original file, metadata, timestamps, version number stored locally; identical content deduplicated by hash.
3. **AI version comparison** — for each new version, generate: what changed vs. the previous version, a short summary, and searchable tags. Built on **LangChain, model-agnostic** (default classes/methods — no unnecessary custom abstractions).
4. **Timeline UI** — assets list → per-asset version timeline → version details with AI summary.
5. **Hybrid semantic search** — keyword search over AI summaries/tags plus a local embeddings index for meaning-based queries ("remove logo", "blue background"), not just filenames.

## Full Vision

The full vision is a format-extensible Chronicle for the creative industry. After PNG/JPG,
support expands in researched stages: vector and layered design formats; 3D and CAD formats;
documents and layout packages; then audio, video, and tool-specific project files. Each format
uses safe structure extraction plus a normalized preview or domain-appropriate comparison—never
a claim that one vision-model path understands every file. Initial roadmap formats are **SVG,
BLEND, OBJ, STEP/STP, PSD, and PSB**.

On top of that shared history, Chronicle adds visual-similarity search ("versions that look like
this"); a history assistant that answers questions like "when did we drop the tagline?"; links
feedback to versions to explain *why* a file changed; impact analysis; identity across
renames/moves; side-by-side and format-native diffs; personal activity and AI-cost insights;
multilingual UI; team collaboration; cloud sync; and branching for creative exploration.

## Main User Journey

1. User installs Chronicle and points it at their working folders (e.g. `~/Designs`). Nothing else to configure.
2. They keep working exactly as before — editing in Photoshop/Illustrator/their usual tool and hitting save.
3. Chronicle silently captures each save (PNG/JPG in the MVP) as a new version and, moments later, attaches an AI summary of what changed and searchable tags.
4. Days later they need "the logo before we dropped the tagline" — they search that phrase, land on the exact version, view it (and restore it), with the full evolution of the asset visible on a timeline.

## Demo Script

1. Open Chronicle: show an Assets screen already populated (a logo, a social banner, product shots) with version history — establishes the `_final_v8` problem in one sentence.
2. Live capture: open the logo in an editor, change the background color and delete the tagline, save. Chronicle pops a new version on the timeline within seconds.
3. AI diff: click the new version — AI summary reads *"Background changed from navy to teal; tagline text removed."* Point out judges are seeing a **binary file diffed in plain English**.
4. Timeline: scroll the asset's full evolution v1 → v8, each with a one-line AI summary — the whole design story at a glance.
5. Hybrid search: type "version with the tagline" → jumps straight to the right version. Then "blue background" → finds matching versions across all assets by meaning.
6. Close: built with IBM Bob end-to-end (show the README/Bob workflow), local-first, model-agnostic via LangChain, works with any creative tool.
