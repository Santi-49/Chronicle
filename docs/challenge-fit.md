# Challenge Fit — The Case for Chronicle

> Why Chronicle answers the **AI Builders Challenge with IBM Bob**, July 2026 theme
> *Reimagine Creative Industries with AI*, criterion by criterion — with links to the
> evidence in this repository.
>
> Companion reading: [Vision](challenge/VISION.md) · [Challenge rules](challenge/CHALLENGE.md) ·
> [Research](challenge/RESEARCH.md) · [AI approach](ai-approach.md)

---

## 1. The problem, stated precisely

Every creative professional has a folder like this:

```text
campaign-final.png
campaign.png
campaign_V2_ok.png
campaign-final-final.png
campaign_V2.png
```

Five files. No clear final. This is not a joke about naming discipline — it is the visible
symptom of a real gap:

1. **Binary files have no readable diff.** Git made source history usable because a text diff
   answers *what changed*. Open two versions of a logo and you get two images and no answer.
2. **So there is no reliable history.** Without a diff, people improvise versioning through
   filenames, which loses ordering, intent, and the reason a change was made.
3. **And therefore no way to search it.** "The version before we dropped the tagline" is a
   question about *meaning*. Filenames cannot answer it, so finding old work becomes manual
   archaeology through folders and dates.

The cost is unpaid time — repeatedly, across every creative discipline. That is the pain
Chronicle removes.

### Why this is not a solved problem

Existing tools each solve a slice and leave the gap open. This matters for judging: Chronicle's
claim is *not* that creative tools have no history — many do. The claim is that those histories
are **fragmented, tool-specific, usually recovery-oriented, and almost never explained or
searchable across tools.**

Two failures repeat across every one of them: each covers **a single tool or a single family of
formats**, and **none of them explain the change**. A creative professional who works across
Photoshop, Illustrator, Blender, and a CAD tool therefore needs four partial histories, none of
which can tell them what actually changed.

| Existing solution | Formats covered | AI summary or real diff? | Why the gap remains |
|---|---|---|---|
| Filename versioning (`_final_v8`) | Anything, badly | **No** | No history, no diff, no search — the pain being demonstrated |
| Git / Git LFS | Any file, but creative ones are opaque blobs | **No** | Binary files get no readable diff; the commit workflow alienates designers; no semantic search |
| Figma version history | Figma files only | **No** | Only inside Figma. No local files, no cross-tool history, weak search |
| Photoshop cloud documents | Photoshop **cloud** documents only | **No** | Local `.psd` files get only temporary History snapshots |
| Adobe Creative Cloud versions | Adobe formats only | **No** | Adobe-only, no explanation, no cross-asset search |
| Dropbox / Google Drive | Any file, as an opaque snapshot | **No** | Never says what changed; retention limits; cloud-only |
| Creative tools' own autosaves | One tool each — Blender *Save Incremental*, Maya *Increment & Save*, After Effects *Increment and Save*, Premiere autosaves | **No** | Numbered **recovery backups**: no message, no milestone, no search. Proof the numbered-file workflow is real, not anecdotal |
| Abstract / Plant (design VCS) | Sketch only | **No** | Tool-locked, largely defunct |
| SolidWorks PDM / Fusion | Their own CAD formats | **No** | Enterprise-managed CAD only; leaves freelancers and local-file workflows uncovered |

Sources for the autosave and vendor-history claims are documented with primary references in
[RESEARCH.md](challenge/RESEARCH.md#creative-file-formats-and-the-version-sprawl-opportunity-2026-07-18).

**Chronicle's gap — one tool for all formats, and the only one that explains the change.**
Eight formats spanning raster, vector, layered design, 3D, and CAD live in a single local
history; every change is written down in plain language; and the whole history is searchable by
meaning. There is no comparable product: nothing on that list writes a plain-language change
summary for a creative file, and nothing on it works across the formats a real creative workflow
actually uses.

---

## 2. The solution

Point Chronicle at the folders you already work in. Keep saving normally. Every meaningful save
becomes a version, and AI writes the commit message you never had:

> Background changed from navy to teal; the tagline was removed.

Then search that history the way you actually remember it — *"the version with the tagline"* —
and restore any version without destroying what came after.

Three properties make it work as a product rather than a trick:

- **Zero-friction capture.** No commits, no uploads, no new workflow. A watched folder plus a
  settle window plus a content hash.
- **Explanation, not just storage.** The AI diff is the feature. Storage without explanation is
  what already exists and already fails.
- **Local-first ownership.** The library never leaves the device. AI is optional, uses the
  user's own key, and the app is fully functional offline without it.

---

## 3. Criterion-by-criterion evidence

The Official Rules score four equally weighted criteria; the challenge hub additionally lists
Real-World Impact. All five are addressed below.

### Technical Execution — 25%

> *"Effective use of IBM Bob and additional technologies, with a functional and well-structured
> solution."*

**IBM Bob across the whole lifecycle, not just code generation.** Bob was used to understand the
problem, plan contract-first, build across TypeScript and Python, diagnose real integration
failures, and document the result — the five-stage model IBM SkillsBuild itself teaches. Every
pull request records concrete usage in [bob-log.md](bob-log.md), including diagnoses a
code generator would not produce on its own: a packaged Google token exchange failing on an
omitted client secret, a Cloudflare per-deployment canonical URL breaking search identity,
orphaned AI sidecars locking the packaging output, refresh-token rotation racing React
StrictMode, and an Electron `net.fetch` timeout that never actually aborted.

**Well-structured, verifiably.**

| Evidence | Where |
|---|---|
| Contract-first boundaries (C1–C7) with generated, never hand-written types | [contracts.md](contracts.md) |
| One format registry driving fourteen previously hardcoded code paths | `apps/desktop/src/shared/formats.ts` |
| 326 desktop (Vitest), 74 AI-service, and 69 control-plane (pytest) tests | `make check` |
| Protected-branch CI required on every PR into `main` | `.github/workflows/ci.yml` |
| Context-isolated renderer behind a typed, validated IPC bridge | `apps/desktop/src/shared/ipc.ts` |
| Released cross-platform installers with verified update metadata | [releasing.md](releasing.md) |

**Additional technologies used meaningfully:** Electron 43, React 19, TypeScript 5.9,
better-sqlite3 with FTS5, chokidar, three.js plus OpenCascade WASM for CAD tessellation,
FastAPI, LangChain, PyInstaller, electron-builder, PostgreSQL, Redis, OPA, Astro, Cloudflare,
and GSAP.

### Innovation — 25%

> *"Creativity, originality, and unique application of AI."*

**The core insight: AI commit messages already exist — but only for code.** IDEs generate them,
GitHub Copilot generates them, IBM Bob generates them. Not one of those tools can write a commit
message for an image, let alone for a layered design document, a 3D scene, or a CAD assembly.
Chronicle takes the one AI feature developers now take for granted and gives it to the people
whose files are not text.

Three things follow that nothing comparable offers:

1. **A plain-language diff of a binary creative file.** The AI is not captioning an image — it is
   comparing two states of the same asset and reporting the difference as a change list. That is
   the readable diff binary formats have never had.
2. **Semantic search over version history.** Each version's summary and tags are embedded, so
   the history answers questions about meaning: *"remove logo"* finds *"deleted the brand mark."*
3. **One history across every format.** Raster, vector, layered design, 3D, and CAD versions sit
   in the same timeline and the same search index. Every alternative is locked to one tool or one
   format family, so a multi-tool creative workflow otherwise has no single history at all.

Three design decisions make the AI application original rather than decorative:

- **Local extraction before inference.** Proprietary container bytes never reach a provider. A
  PSD, SVG, OBJ, STEP, or BLEND file is parsed on-device into a bounded structure diff plus at
  most one derived preview image, so the model receives the smallest useful evidence — not an
  opaque blob it would have to guess at. Nothing inside a creative file is ever executed.
- **Format-specific evidence, not one universal trick.** Each format gets its own safe extractor:
  Photoshop layer inventories, SVG vector structure, OBJ mesh inventories with a derived preview,
  STEP entity inventories and bounds, and the thumbnail Blender itself embeds. Chronicle never
  claims one vision-model path understands every file.
- **Honest confidence and coverage.** When an extractor can only see part of a file, that becomes
  a coverage warning that caps the reported confidence — 0.85 for SVG down to 0.65 for BLEND —
  instead of a fluent guess.
- **Capability discovery instead of assumption.** The AI service publishes which formats it can
  annotate; the app asks rather than assuming, so work an older sidecar cannot handle waits in
  the queue instead of failing. That mechanism is what let all eight formats ship to users —
  captured, previewed, restorable, searchable — *before* their AI adapters existed.

### Challenge Fit — 25%

> *"Relevance to the challenge and ability to address real-world problems."*

The July brief asks for solutions that **help creators work smarter**. Chronicle's fit is
specific, not thematic: it applies a proven AI capability to the file types the creative
industries actually work in.

**The gap it closes.** AI-written commit messages are now a normal part of software development —
IDEs, GitHub Copilot, and IBM Bob all generate them. Every one of those tools reads *text*. Point
any of them at a logo, a layered poster, a Blender scene, or a CAD assembly and there is nothing
to describe, because a diff of binary bytes is meaningless. So the single most useful AI feature
in modern version control has never reached the creative industries at all. Chronicle is that
feature, built for their formats.

- **It works on creative files, not text.** Change summaries are produced for all eight supported
  formats through format-specific local extraction — raster images, vector art, layered Photoshop
  documents, 3D meshes, CAD models, and Blender scenes.
- **It serves the audience the theme names.** Format support was chosen from documented
  professional workflows rather than guesses: graphic design and photography (PNG/JPG/PSD/PSB),
  brand and vector (SVG), 3D and game art (BLEND/OBJ), architecture and product design (STEP/STP).
- **It requires no behavior change.** No commits, no uploads, no new tool. The creative
  professional keeps saving exactly as before.
- **It is immediately demonstrable.** The pain shows in one screenshot of a folder; the fix shows
  in one save.

### Implementation & Feasibility — 25%

> *"Practicality, scalability, and potential for real-world use."*

This is where being a *released product* rather than a prototype does the work.

| Dimension | Chronicle's position |
|---|---|
| **Installable today** | Branded Windows NSIS installer and macOS DMG published from tagged CI, with verified metadata and checksums |
| **Stays current** | Windows auto-update detects, downloads, and restarts; macOS detects and hands off the DMG rather than promising an install it cannot perform |
| **Runs like real software** | Tray-resident background capture, single-instance lock, optional OS-authoritative start-at-login |
| **Works without us** | No Docker, no account, no control plane, no network required for capture, history, previews, restore, or keyword search |
| **Sustainable cost model** | Bring-your-own-key: the user supplies their own provider credential and pays that provider directly, while a live pricing catalog and the Activity & Cost dashboard make spend visible instead of a surprise |
| **Vendor-independent** | Model-agnostic through LangChain — swap to watsonx/Granite or any supported provider without code changes |
| **Legally operable** | Hosted versioned Privacy Policy and Terms, in-app acceptance with re-prompting, documented lawful basis, retention schedule, JSON export, and self-service erasure |
| **Supportable** | A public static searchable help center written for non-technical creatives, plus a developer diagnostics panel |
| **Maintainable** | Conventional commits → Release Please → protected CI → tagged release, with the scope of every release derived from what actually ships |
| **Scales in the right direction** | Content-addressed dedupe, lazily derived previews cached per hash, batched embeddings, and a format architecture where adding a format is one registry entry plus one adapter |

Known limitations are documented rather than hidden — unsigned installers, non-image formats
summarized from extracted evidence rather than a full render, path-based asset identity,
Windows-only in-place update, and no hosted inference gateway. See the README's
*Current limitations*.

### Real-World Impact — listed on the challenge hub

> *"Ability to create meaningful value and address real-world needs."*

**`final_v8` is the whole case.**

Everyone who has ever worked with creative files recognizes this folder instantly:

```text
campaign-final.png
campaign.png
campaign_V2_ok.png
campaign-final-final.png
campaign_V2.png
```

That is not a niche annoyance or a discipline problem. It is what people do when a tool gives them
no history, and it happens in every creative discipline, on every project, at every level of
seniority — from a student's first poster to an agency's client deliverable.

The impact is concrete because the cost is concrete:

- **It is universal.** There is no creative professional who has *not* opened the wrong file,
  duplicated a file "just in case," or been unable to answer *"which one did the client approve?"*
  The problem needs no explaining to an audience — they have lived it.
- **The cost is unpaid time, repeatedly.** Not one dramatic failure, but minutes lost every week
  to reopening files, comparing them by eye, and reconstructing which change came first. Work that
  produces nothing and that nobody bills for.
- **And sometimes the cost is the work itself.** An overwritten file with no history is gone. A
  version nobody can find may as well be.
- **Nobody will adopt a process to fix it.** This is why the problem has survived: every existing
  answer asks the creative professional to commit, upload, migrate, or learn Git. Chronicle asks
  for nothing — choose a folder once, then keep saving. That is what makes the impact reachable
  rather than theoretical.
- **The fix is felt immediately.** The first plain-language summary on a real file is the moment
  the folder above stops being necessary.
- **And ownership stays with the user.** The creative library stays on the device by default; the
  two exceptions — configured AI inference and optional account features — are named explicitly
  rather than buried.

---

## 4. What we deliberately did not claim

Credibility is part of the case. Chronicle's documentation avoids four tempting overstatements:

1. **"Creative tools have no version history."** Many do. The accurate claim is that those
   histories are fragmented, tool-specific, recovery-oriented, and lack automatic natural-language
   explanation and cross-tool semantic search.
2. **"Everything stays local."** The creative library does. Configured AI inference sends the
   required inputs to the user's chosen provider, and optional account features reach the control
   plane. Both are stated wherever the promise appears.
3. **"Zero data retention" or a guaranteed AI cost.** Provider retention depends on the
   provider and tier; costs are labelled *estimated* against a dated price catalog, with the
   provider invoice named as the authority.
4. **"The installer is safe because it is hash-verified."** SHA-512 over HTTPS detects
   corruption; it is not publisher identity. The installers are unsigned and the help center says
   so, along with the safe recovery path.

---

## 5. Submission requirement checklist

| Requirement | Status |
|---|---|
| Public GitHub repository with a functioning prototype | This repository, with published installers |
| README documenting the problem statement | [README — Why Chronicle](../README.md#why-chronicle) |
| README documenting the solution | [README — How it works](../README.md#how-it-works) and Key features |
| README documenting the AI approach | [README — AI approach](../README.md#ai-approach) · [ai-approach.md](ai-approach.md) |
| README documenting the challenge theme | [README — Built for this challenge](../README.md#built-for-this-challenge) · this document |
| README documenting how IBM Bob was used | [README — Built with IBM Bob](../README.md#built-with-ibm-bob) · [bob-log.md](bob-log.md) |
| Video, maximum three minutes | Scripted from [VISION.md](challenge/VISION.md#demo-script) — **team action** |
| IBM SkillsBuild learning activity, **per member** | **Team action — required for a valid submission** |
