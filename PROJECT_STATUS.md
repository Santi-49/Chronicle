# Chronicle Project Status

> Team dashboard · Updated 2026-07-30 · **Submitted** · Deadline was 2026-07-31, 11:59 PM ET

Chronicle **1.0.0** is publicly released and the challenge submission is filed. This file is now
a record of what shipped rather than a work board. [TODO.md](TODO.md) keeps the task history and
the post-MVP roadmap; [Project Overview](docs/PROJECT_OVERVIEW.md) orients anyone new.

## Current stage

**Submitted.** The public repository, README, demo video, and every member's IBM SkillsBuild
activity are complete, and signed-off installers exist for Windows and macOS.

```text
Research       Documentation       Contracts        MVP build         Demo/submission
   ✓                 ✓                 ✓                 ✓                    ✓
```

Chronicle runs as a released desktop product: it watches folders, captures every save as a
deduplicated version, explains what changed in plain language through a local Python AI service,
indexes that history for hybrid keyword and semantic search, and restores any version without
rewriting history. It works with no Docker and no account. Eight creative formats are captured,
previewed, restored, searched, and AI-summarized.

## What shipped

| Area | Status | What this means |
|---|---|---|
| Challenge research and product vision | Complete | Problem, audience, judging criteria, scope, competitive landscape, and demo story are documented in `docs/challenge/` and `docs/challenge-fit.md`. |
| MVP specification | Complete | Required behavior and acceptance examples are in `docs/spec.md`; every F1 to F8 feature shipped. F9 (gateway) and part of F10 stayed stretch and were not built. |
| Boundary contracts | Implemented | C1 to C6 are implemented and generated where generated types apply. C7 (gateway module) remains a stretch stub. |
| Version capture | Complete (MVP-02 to MVP-04) | Chokidar watching with the 2 s settle and C4 ignore rules, streamed SHA-256 hashing off the UI path, content-addressed dedup, append-only versions, and a 50 MB skip. |
| Secure IPC bridge | Complete (MVP-05) | Every C1 method, the native folder picker, the `chronicle://` media protocol, encrypted per-provider BYOK storage, typed events, and input validation. The renderer reaches no Node API, path, or secret. |
| File formats | Complete (POST-01, POST-02) | One registry (`apps/desktop/src/shared/formats.ts`) declares PNG, JPG/JPEG, SVG, PSD, PSB, OBJ, STEP/STP, and BLEND; the watcher, capture, media protocol, previews, AI worker, telemetry, and renderer all derive from it. Derived previews are lazy and content-hash cached; OBJ and STEP get an interactive 3D view via lazily loaded three.js and OpenCascade WASM. |
| AI summaries | Complete and live-verified | `services/ai/` (FastAPI + LangChain, loopback-only) annotates all eight formats through an adapter registry, publishing `GET /capabilities` so the app discovers rather than assumes. Electron owns the queue, client, and lifecycle. Live provider acceptance is closed: real BYOK annotation works end to end. |
| Hybrid search | Complete (MVP-10, MVP-11) | FTS5 keyword plus provider/model-scoped cosine semantic search in one ranked version-level list, degrading to keyword-only when AI is unavailable. Changing an embedding selection queues deduplicated reindex jobs without repeating vision analysis. |
| Restore | Complete (MVP-07) | Append-only: restoring v2 from v5 writes v2's bytes and appends a provenance-marked v6 with no AI call. A missing original folder switches to a native Save a copy dialog. |
| Assets, Timeline, Version Details | Complete (MVP-08) | Live C1 queries and events, real thumbnails, keyboard traversal, explicit pending/failed/deferred states, retry, missing-source badges, and a typed-safeguard history reset. |
| Project browsing and retention | Complete | Breadcrumb browsing over captured assets with a remembered gallery/list toggle, and a Removed files section with a 30-day retention sweep plus individual and bulk permanent deletion. |
| Background capture and tray | Complete (POST-10) | Capture survives a closed window behind a single-instance lock, with a latched quitting flag so Quit and the updater's restart are never swallowed, and OS-authoritative packaged-only start-at-login. |
| Packaging and releases | Complete (MVP-12) | Unsigned Windows NSIS and macOS Apple Silicon DMG installers with a self-contained, health-smoked Gemini/OpenAI/Anthropic PyInstaller sidecar, so installed users need no Python. Release Please drives versioning from Conventional Commits, with protected-branch CI and guarded auto-merge. |
| Updates | Complete (POST-08A) | Windows performs in-place GitHub-fed updates with SHA-512 verification and an explicit user restart. macOS is detect-only: it reads the public release metadata and opens the matching DMG, because an unsigned bundle cannot be installed in place. |
| Activity and cost | Complete (POST-09) | Live Models.dev price catalog with offline caching, immutable per-call rate and hash records, exact provider tokenizer counts for embeddings, and a local activity dashboard. Amounts are labelled estimates; provider invoices remain authoritative. |
| Control plane | Complete and optional | Google sign-in over the system browser with PKCE, installation registration, portable settings, opaque encrypted-secret sync, content-free usage statistics, and admin analytics (POST-03 to POST-06). It never gates local use. |
| Privacy and GDPR | Complete (POST-06, POST-06A) | Documented lawful bases, notice-versioned preference audit, configured retention, JSON export, installation erasure, and transactional self-service account deletion that leaves local history and provider keys untouched. |
| Landing page and help center | Complete (LAND-01, LAND-02) | Astro site on Cloudflare Pages with the scroll-driven product story, plus a static searchable help center covering setup, per-provider key guides, costs, privacy, and troubleshooting. |
| Demo and submission | Complete (DEMO-01, SUBMIT-01) | Three approved generated image histories in `demo-assets/`, the demo video, README evidence, and the IBM SkillsBuild activity for all four members. |

## Current contract baseline

A contract says what an operation does and what data goes in and comes out. It does not decide
the prompt, algorithm, provider, storage layout, tools, or internal classes.

| Boundary | Source of truth | Change rule |
|---|---|---|
| React renderer ↔ Electron main process | `apps/desktop/src/shared/ipc.ts`, with the format vocabulary in `apps/desktop/src/shared/formats.ts` | Released. Propose contract changes separately before changing handlers or UI assumptions. |
| App ↔ AI functionality | Local AI service OpenAPI + `packages/contracts/ai/output.schema.json`, with generated TypeScript client types | Keep annotation, embedding, capability discovery, and validation behavior stable; prompts and adapters remain implementation-owned. Regenerate `generated.ts` whenever the enum changes. |
| Filesystem candidate ↔ watcher | `apps/desktop/src/main/watcher/rules.ts`, deriving its extension set from the format registry | Preserve supported formats, size cap, settle guarantee, inputs, outputs, and rejection reasons. |
| Shared settings | `apps/desktop/src/shared/settings.ts` | Never expose API keys or auth tokens through renderer-readable settings. |
| App ↔ control-plane API | `packages/contracts/api/openapi.json` → `packages/contracts/api/generated/index.ts` (guarantees in `PLANNED.md`) | Regenerate types with `make generate-types` after any schema change. |
| Backend ↔ optional gateway module | `packages/contracts/module/interface.py` | Stretch only, and not built. Do not expand it before gateway research starts. |

The SQLite DDL in `apps/desktop/src/main/db/schema.sql` is an implementation specification, not a
public contract. It is now released, so change it only through migrations.

## Known limitations carried into 1.0.0

These are deliberate and documented in the README and help center rather than defects.

- **Installers are unsigned and unnotarized.** Windows SmartScreen and macOS Gatekeeper warn on
  first run, and the help center documents the recovery path for each. Hash verification is not
  publisher identity. Code signing is the real fix.
- **Asset identity is the file path.** Renaming or moving a tracked file starts a new asset, and
  content-hash identity across renames is future work.
- **macOS updates are detect-only.** In-place macOS updating needs Developer ID signing and
  notarization.
- **The AI-inference gateway (F9) was not built.** BYOK is the only inference path, so AI features
  require the user's own provider key and connectivity. Capture, history, restore, and keyword
  search stay fully offline.
- **The frozen sidecar is rebuilt at packaging time.** A stale sidecar reports fewer annotatable
  formats than the app captures. Capability negotiation makes that honest rather than broken (the
  affected versions report `deferred`), but `make package` must run before any release.

## Open decisions

| Decision | Owner | Current state |
|---|---|---|
| Team roster in the repository | Team lead | Deliberately left `TBD` in `docs/challenge/CONSTRAINTS.md`. Team details are carried on the BeMyApp submission page instead. |
| Moving `gemini-flash-latest` alias vs. a pinned Flash ID | Unassigned | Still the moving alias. VALIDATE-01 flagged that Google hot-swaps it with two weeks' notice, so a rehearsed demo could change under us. Shipped as configuration, not code. |
| Windows and macOS code signing | Unassigned | Not done. Blocks in-place macOS updates, POST-08B signed update policy, and removal of the first-run trust warnings. |
| Mandatory security updates (POST-08B, POST-08C) | Unassigned | Researched and scoped only. Depends on signing plus independently authenticated policy metadata. |

## Milestones

| Date | Target | Status |
|---|---|---|
| July 18 | Documentation, boundary contracts, implementation plan | Complete |
| July 20 | Demo assets, provider and design decisions | Complete, except the roster, which was intentionally left out of the repository |
| July 27 | MVP feature complete | Complete |
| July 30 | Video, README evidence, SkillsBuild, rehearsal | Complete |
| July 31 | Public repository and final submission | Complete, submitted 2026-07-30 |
| September 16 | Virtual Conference (winners showcase) | Upcoming |

## How to update this file

- Update it when a task is merged into `dev`, not merely when code exists on a feature branch.
- Link evidence such as tests, screenshots, or the relevant PR in the status note when possible.
- Do not report percentages without measurable acceptance criteria.
- Move completed implementation details out of this dashboard and into the relevant technical docs.
