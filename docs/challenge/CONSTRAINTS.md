# Constraints & Team Context

## Apps in Scope

- [x] `apps/desktop/` — **Electron + React desktop app — this is the product.**
- [x] `services/api/` + `services/module/` — **backend as control plane** — *lowest priority, non-essential* (see below)
- [ ] `apps/landing/` — Landing page (Astro → Cloudflare Pages) — *kept in repo; build only if time allows for a marketing page*

> Removed 2026-07-16 to cut distractions (recoverable from git history): the template's
> `apps/web/` (Next.js SPA), the stale `apps/damm-mobile/` and `thought_process/` leftovers
> from a previous project, the **old unrelated** `TODO.md`, and the `.skills/3d/` +
> `.skills/mobile/` skill groups. A new Chronicle-specific root `TODO.md` was created on
> 2026-07-17 from the approved MVP specification and contracts.

> **Architecture (clarified 2026-07-17; AI layer revised 2026-07-19):** Chronicle is a **local-first storage Electron app** — file watching, version storage, and non-AI history operations happen on-device (Electron → React UI → SQLite → local file storage). AI features are implemented **in Python** in a **local AI service** (`services/ai/`: FastAPI + LangChain, loopback-only) that the Electron main process calls — distinct from the FastAPI control plane, which stays optional. AI inference is API-based through LangChain; no local model is planned for the MVP. BYOK keys are passed per-request to the local service, which forwards them only to the configured provider; the optional gateway routes the required AI inputs through our backend instead. Chronicle does not upload the version library as cloud storage, but image content used for inference leaves the device under the selected AI path. The module-contract flow applies to gateway/stats endpoints.
>
> **Priority (clarified 2026-07-17; sync exception 2026-07-21):** the control plane is **lowest priority — non-essential**. On startup the app offers Google sign-in or "Continue local" (default); the password routes remain API-only. Capture, cached history, restore, and keyword search work with no Docker or Chronicle API. Google auth is health-gated and opens the operating system's default external browser, never an embedded Electron webview. AI summaries and semantic embeddings require the configured external API through LangChain and queue while offline. Provider, model, and BYOK credentials are configured and encrypted locally. Keys stay local by default; a signed-in user may separately enable E2E-encrypted API-key sync, which sends only a passphrase-encrypted envelope the control plane cannot decrypt.
>
> **Usage statistics (revised 2026-07-24):** the optional/default-enabled control sends on startup
> and at most hourly after changes. It records app opens, project removals, hourly searches,
> provider/model AI outcomes and latency, current project/version counts, and sanitized unexpected
> Electron/Node errors. The Cloudflare Tunnel origin derives coarse country/region/city from edge
> headers and never stores raw IP. Creative content, names, paths, summaries/tags, search text,
> credentials, and exact file metadata remain prohibited. Turning reporting off attempts one final
> request, clears the local accumulator, and never retries.

## 3D / Immersive Elements

- **Needed:** no
- **Where:** n/a (a subtle GSAP-animated timeline is the only "wow" visual candidate)
- **Approach:** n/a

## Performance Requirements

- Version capture must feel instant: debounce ~2s after last write, hash + store < 1s for typical files.
- AI summaries are generated async — the UI never blocks on the AI API.
- Core capture/timeline/search fully functional offline; AI summaries, embeddings, and control-plane sync (auth, logs, stats) queue and backfill when online.
- Handle files up to ~50 MB without freezing the UI (hashing/IO off the main process) — headroom for future SVG, BLEND, OBJ, STEP/STP, PSD, and PSB files.

## Device & Platform Targets

- Desktop: Windows + macOS (Electron). Windows is the primary dev/demo target.

## Accessibility Requirements

- Keyboard-navigable timeline and search; sensible contrast. No formal WCAG target for the MVP.

## External Services

| Service | Purpose | Tier / Cost |
|---------|---------|-------------|
| IBM Bob | Mandatory development tool (judged on "effective use") | Trial — "40 Bobcoins for 30 days" |
| IBM SkillsBuild | Required learning activity for submission | Free |
| **LangChain (Python, model-agnostic)** | AI layer for version comparison, summaries, tags, embeddings — implemented in the local `services/ai/` FastAPI service the desktop app calls. Use LangChain's **default classes and methods** — no unnecessary custom wrappers. Provider is swappable (watsonx/Granite, Claude, etc. behind the same interface) | Library free; API cost per provider |
| Embeddings + keyword index | **Hybrid search** — keyword over AI summaries/tags + local vector index for meaning-based queries | Via LangChain defaults |
| Future-format extraction | Safely extract structure and comparable previews for SVG, BLEND, OBJ, STEP/STP, PSD, and PSB after the image MVP | TBD per format; prefer documented parsers and sandboxed Blender/conversion tooling |

> **Code quality bar (team decision, 2026-07-16):** easy to maintain, minimal code, clear, documented, well structured. Prefer library defaults over new abstractions.

## Design Language

- **Style direction:** clean, minimal professional tool; dark-first with a user-controlled light theme. The timeline remains the future hero element.
- **Primary colors:** neutral gray surfaces with IBM blue reserved for primary actions and focus states; semantic theme tokens pair dark and light values.
- **Fonts:** native system sans-serif for the MVP (fast, offline, platform-appropriate).
- **Assets / inspiration:** IBM Design Language and Carbon UI shell/motion guidance; locally bundled Google Material Symbols SVGs for interface icons; the standard-color Google “G” for the future sign-in control; restrained effects and accessible contrast.

## Team

> ⚠️ *Unknown — risk.* Team roster, roles, and monorepo ownership not yet provided.
> ✅ **Eligibility confirmed (2026-07-16):** all team members are enrolled higher-ed students, 18+.

| Name | Role | Owns |
|------|------|------|
| TBD | | |

## Timeline

| Milestone | Date / Time |
|-----------|-------------|
| Hackathon starts | July 1, 2026 (contest period opened) |
| Context defined (this doc) | July 16, 2026 |
| Boundary contracts + initial implementation specifications defined | July 18, 2026 |
| MVP feature-complete (watcher, versions, AI diff, timeline, search) | July 27, 2026 |
| Demo video + README + SkillsBuild activity done | July 30, 2026 |
| **Submission deadline** | **July 31, 2026, 11:59 PM ET** |
| Virtual Conference (winners showcase) | Sept 16, 2026 |
