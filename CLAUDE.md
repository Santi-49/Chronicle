# Hackathon Template — Claude Guide

@docs/challenge/CHALLENGE.md
@docs/challenge/VISION.md
@docs/challenge/CONSTRAINTS.md
@docs/challenge/RESEARCH.md
@docs/contracts.md

---

## How Documentation Works

```
docs/
  challenge/           ← imported above — read before every session
    CHALLENGE.md       ← problem statement, rules, data, judging criteria
    VISION.md          ← solution concept, philosophy, key features, demo script
    CONSTRAINTS.md     ← scope, team, timeline, external services, design language
  architecture/        ← system design, service map, request flow
  backend/             ← API reference, auth, RBAC, database schema
  contracts.md         ← module contract system (imported above)
  index.md             ← docs entry point
```

---

## How to Work in This Repo

### Contract-First Development

Before any feature that crosses a service boundary:

1. Read `docs/contracts.md` (imported above)
2. Define the Python Protocol in `packages/contracts/module/interface.py`
3. Update OpenAPI types in `packages/contracts/api/`
4. Run `make generate-types` → TypeScript types land in `packages/contracts/api/`
5. Implement in `services/module/app/implementation.py`
6. Build the frontend against the generated types — never hand-write API types

This is the pattern that allows frontend and backend to work in parallel.
Break it only if you are prototyping something that will never cross a service boundary.

### Backend Is Pre-Built

Auth (JWT + Redis whitelist), RBAC (OPA), user CRUD, token refresh, logout — all done.
Full reference at `docs/backend/`. To extend:
- Challenge logic → `services/module/`
- New authorization rules → `infra/opa/policies/` (one Rego entry per resource)
- New routes → `services/api/app/routes/` (auth middleware is automatic)

### Monorepo Layout

```
apps/landing/     Astro → Cloudflare Pages
apps/web/         Vite + React + TypeScript
apps/mobile/      Expo (React Native)
services/api/     FastAPI — extend, don't rewrite
services/module/  Challenge logic — implement here
packages/contracts/api/     OpenAPI + TypeScript types
packages/contracts/module/  Python Protocol
infra/            OPA, Postgres, Redis config
```

### Commands

```bash
make dev                       # start all services
make migrate                   # run migrations
make test                      # pytest, no Docker
make generate-types            # OpenAPI → TypeScript
make makemigration MSG="..."   # new Alembic migration
```

---

## MCP Servers

Five servers are available via `.mcp.json`. Prefer them over shell commands.

| Server | Use when |
|--------|----------|
| `postgres` | Query/inspect the DB — schema, data, slow queries, post-migration checks |
| `fetch` | Hit a URL or read external API docs |
| `markitdown` | Convert a local file (`file://`) or URL to markdown (handles PDF, DOCX, HTML) |
| `playwright` | Test UI in a real browser, take screenshots, scrape rendered pages |
| `docker` | Run a command inside a running Compose service |

**docker caveat:** always pass `service` explicitly — the default (`laravel_app_dev`) is wrong for this project. Valid names are in `docker-compose.yml` (e.g. `api`, `module`, `postgres`, `redis`).

---

## Skills — Load Contextually

Skills are in `.skills/` grouped by domain. Load only what the current task needs.
Do not import all skills at once — each group can be large.

### Working on `apps/landing/` or `apps/web/` — Animation

Read these when adding GSAP animation:

| Task | File |
|------|------|
| Any GSAP animation | `.skills/animation/gsap-core/SKILL.md` |
| GSAP in React | `.skills/animation/gsap-react/SKILL.md` |
| Scroll animations, pinning, scrub | `.skills/animation/gsap-scrolltrigger/SKILL.md` |
| Sequenced / timeline animations | `.skills/animation/gsap-timeline/SKILL.md` |

### Working on 3D (any app)

Always read `.skills/3d/3d-web-experience/SKILL.md` first — it covers stack selection
(Spline vs R3F vs vanilla Three.js) before you commit to an approach.

| Task | File |
|------|------|
| Stack decision | `.skills/3d/3d-web-experience/SKILL.md` ← read first |
| Scene / camera / renderer | `.skills/3d/threejs-fundamentals/SKILL.md` |
| Animating 3D objects | `.skills/3d/threejs-animation/SKILL.md` |
| Geometry | `.skills/3d/threejs-geometry/SKILL.md` |
| Interactions (click, hover, raycast) | `.skills/3d/threejs-interaction/SKILL.md` |
| Lighting and shadows | `.skills/3d/threejs-lighting/SKILL.md` |
| Loading GLB / GLTF | `.skills/3d/threejs-loaders/SKILL.md` |
| PBR materials | `.skills/3d/threejs-materials/SKILL.md` |
| Post-processing (bloom, etc.) | `.skills/3d/threejs-postprocessing/SKILL.md` |
| Custom GLSL shaders | `.skills/3d/threejs-shaders/SKILL.md` |
| Textures and UV | `.skills/3d/threejs-textures/SKILL.md` |

For 3D on mobile specifically: read `.skills/mobile/use-dom/SKILL.md` — this is the
bridge that lets Three.js / R3F run inside Expo via DOM components without full native builds.
Also check `.skills/mobile/building-native-ui/references/webgpu-three.md`.

### Working on `apps/mobile/`

| Task | File |
|------|------|
| Navigation, tabs, native UI | `.skills/mobile/building-native-ui/SKILL.md` |
| Data fetching, caching, offline | `.skills/mobile/native-data-fetching/SKILL.md` |
| Three.js / web libs in Expo | `.skills/mobile/use-dom/SKILL.md` |
| expo-gl, native modules, custom builds | `.skills/mobile/expo-dev-client/SKILL.md` |

### Design decisions (any app)

Read `.skills/design/ui-ux-pro-max/SKILL.md` when making visual decisions.
To search the design database:

```bash
python .skills/design/ui-ux-pro-max/scripts/search.py "<query>" --design-system
python .skills/design/ui-ux-pro-max/scripts/search.py "<query>" --domain color
python .skills/design/ui-ux-pro-max/scripts/search.py "<query>" --domain typography
```

---

## Challenge Context

- **Challenge:** AI Builders Challenge with IBM Bob (BeMyApp / IBM SkillsBuild) — July 2026 theme: *Reimagine Creative Industries with AI*. Submission due **July 31, 2026, 11:59 PM ET** (public GitHub repo + ≤3 min video + SkillsBuild learning activity).
- **Product:** **Chronicle** — a local-first Electron + React desktop app that watches folders, auto-versions creative files on save, and uses AI to explain what changed between versions, with a hybrid keyword + embeddings search over the history.
- **Selling point:** the plain-English AI diff of binary creative files ("background navy → teal; tagline removed") + search by meaning — git-grade history with zero designer friction, files never leave the machine.
- **MVP:** folder watcher (debounced, temp-file-aware) → hash-based version detection → local Asset/Version storage (SQLite, dedup by hash) → AI change summary + tags per version → timeline UI → hybrid search. File types: **PNG/JPG** (PDF/PPTX are future).
- **Scope:** new `apps/desktop/` (Electron) is the product — file watching, version storage, and search are all on-device (React → SQLite → local file store). The template's **FastAPI backend serves as the control plane**: login/auth (pre-built JWT stack), logs, stats, and an optional **AI-inference gateway** (hybrid: bring-your-own-key locally, or route through our service). Module-contract flow applies to gateway/stats endpoints. `apps/landing/` optional if time allows; `apps/web/` and `apps/mobile/` out of scope.
- **Key constraints:** IBM Bob is the mandatory dev tool and its usage is judged — document it as you go. AI layer via **LangChain, model-agnostic, default classes/methods only**. Code bar: minimal, clear, documented, well structured. AI calls are async, never block the UI; app works offline except AI calls.
- **Team:** all enrolled students (eligibility confirmed); roster/ownership TBD (open risk).
- **Deadline milestones:** interfaces (DB schema, AI prompt contract, watcher rules) by Jul 18 · MVP complete Jul 27 · video + README + SkillsBuild by Jul 30 · submit Jul 31.

Full detail: `docs/challenge/CHALLENGE.md`, `VISION.md`, `CONSTRAINTS.md`, `RESEARCH.md`.
