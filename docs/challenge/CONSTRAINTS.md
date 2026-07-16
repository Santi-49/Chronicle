# Constraints & Team Context

## Apps in Scope

- [ ] `apps/landing/` — Landing page (Astro → Cloudflare Pages) — *optional, only if time allows for a marketing page*
- [ ] `apps/web/` — Web app (Vite + React + TypeScript) — **not in scope as a hosted SPA**
- [ ] `apps/mobile/` — Mobile app (Expo) — **out of scope**
- [x] `apps/desktop/` — **NEW: Electron + React desktop app — this is the product.**
- [x] `services/api/` + `services/module/` — **backend as control plane** (see below)

> **Architecture (clarified 2026-07-16):** Chronicle is a **local-first Electron app** — file watching, version storage, and search all happen on-device (Electron → React UI → SQLite → local file storage). The template's **FastAPI backend is used as a control plane**: login/auth (pre-built JWT stack), usage logs, stats, and — hybrid model — an optional **gateway for AI inference** (bring-your-own-key runs the AI call locally from the app; otherwise the call routes through our service). Files themselves never leave the machine; only auth, telemetry, and AI requests cross the wire. The module-contract flow applies to the AI-gateway and stats endpoints.

## 3D / Immersive Elements

- **Needed:** no
- **Where:** n/a (a subtle GSAP-animated timeline is the only "wow" visual candidate)
- **Approach:** n/a

## Performance Requirements

- Version capture must feel instant: debounce ~2s after last write, hash + store < 1s for typical files.
- AI summaries are generated async — the UI never blocks on the AI API.
- Core capture/timeline/search fully functional offline; AI summaries, embeddings, and control-plane sync (auth, logs, stats) queue and backfill when online.
- Handle files up to ~50 MB (PPTX/PDF) without freezing the UI (hashing/IO off the main process).

## Device & Platform Targets

- Desktop: Windows + macOS (Electron). Windows is the primary dev/demo target.

## Accessibility Requirements

- Keyboard-navigable timeline and search; sensible contrast. No formal WCAG target for the MVP.

## External Services

| Service | Purpose | Tier / Cost |
|---------|---------|-------------|
| IBM Bob | Mandatory development tool (judged on "effective use") | Trial — "40 Bobcoins for 30 days" |
| IBM SkillsBuild | Required learning activity for submission | Free |
| **LangChain (model-agnostic)** | AI layer for version comparison, summaries, tags, embeddings. Use LangChain's **default classes and methods** — no unnecessary custom wrappers. Provider is swappable (watsonx/Granite, Claude, etc. behind the same interface) | Library free; API cost per provider |
| Embeddings + keyword index | **Hybrid search** — keyword over AI summaries/tags + local vector index for meaning-based queries | Via LangChain defaults |
| IBM Docling (library, local) | Future: parse PDF/PPTX when those formats are added | Open source, free |

> **Code quality bar (team decision, 2026-07-16):** easy to maintain, minimal code, clear, documented, well structured. Prefer library defaults over new abstractions.

## Design Language

- **Style direction:** *Unknown — risk.* Working assumption: clean, dark-friendly "pro tool" aesthetic (Linear/Figma-like), timeline as hero element.
- **Primary colors:** TBD
- **Fonts:** TBD
- **Assets / inspiration:** TBD — run the design-skill search before UI work.

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
| Contract interfaces defined (DB schema, AI prompt contract, watcher rules) | July 18, 2026 |
| MVP feature-complete (watcher, versions, AI diff, timeline, search) | July 27, 2026 |
| Demo video + README + SkillsBuild activity done | July 30, 2026 |
| **Submission deadline** | **July 31, 2026, 11:59 PM ET** |
| Virtual Conference (winners showcase) | Sept 16, 2026 |
