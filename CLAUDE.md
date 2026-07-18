# Chronicle — Claude Guide

@docs/challenge/CHALLENGE.md
@docs/challenge/VISION.md
@docs/challenge/CONSTRAINTS.md
@docs/challenge/RESEARCH.md
@docs/contracts.md
@docs/spec.md

---

## How Documentation Works

```
docs/
  PROJECT_OVERVIEW.md  ← plain-language product/architecture/team workflow map
  spec.md              ← imported above — TEAM SPEC: stack, best practices, MVP functionality
  bob-log.md           ← IBM Bob usage log — every PR adds a line (judged artifact)
  challenge/           ← imported above — read before every session
    CHALLENGE.md       ← problem statement, rules, data, judging criteria
    VISION.md          ← solution concept, philosophy, key features, demo script
    CONSTRAINTS.md     ← scope, team, timeline, external services, design language
  architecture/        ← system design, service map, request flow
  backend/             ← API reference, auth, RBAC, database schema
  desktop/             ← desktop app: UI pages, layout, startup flow, feature coverage
  contracts.md         ← operation boundaries and implementation specifications
  index.md             ← docs entry point
PROJECT_STATUS.md      ← current stage, blockers, decisions, and milestones
TODO.md                ← scoped task board with file boundaries and acceptance checks
```

New team members start with `docs/PROJECT_OVERVIEW.md`, then read
`PROJECT_STATUS.md` and claim work from `TODO.md`.

---

## How to Work in This Repo

### Contract-First Development

Before a feature crosses a real component boundary, read `docs/contracts.md` and
define the operation's functionality plus input/output/error formats using the
native mechanism for that boundary. Generate OpenAPI-derived TypeScript types;
never hand-write them.

Contracts do not define prompts, algorithms, tools, orchestration, retries,
storage layout, provider choices, defaults, or internal classes. Prefer existing
library interfaces and schemas. Add custom abstractions only after research shows
they are required. Prompt assets live in `packages/prompts/` as Markdown with YAML
front matter and are loaded from there.

### Backend Is Pre-Built

Auth (JWT + Redis whitelist), RBAC (OPA), user CRUD, token refresh, logout — all done.
Full reference at `docs/backend/`. To extend:
- Challenge logic → `services/module/`
- New authorization rules → `infra/opa/policies/` (one Rego entry per resource)
- New routes → `services/api/app/api/v1/endpoints/` (auth dependencies are reusable via `Depends`)

### Monorepo Layout

```
apps/desktop/     Chronicle — Electron + React + TS (the product)
apps/landing/     Astro → Cloudflare Pages (optional marketing page)
services/ai/      Local Python AI service — FastAPI + LangChain, called by the
                  Electron main over 127.0.0.1; part of the desktop product,
                  NOT the control plane (planned 2026-07-19)
services/api/     FastAPI control plane — extend, don't rewrite
services/module/  Challenge logic (AI gateway) — reuses services/ai
packages/contracts/api/     OpenAPI + TypeScript types
packages/contracts/module/  Python Protocol
infra/            OPA, Postgres, Redis config
```

### Commands

```bash
make dev                       # start all services
make migrate                   # run migrations
make test                      # pytest with coverage (in Docker); make test-local runs it directly
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

**docker caveat:** always pass `service` explicitly — the default (`laravel_app_dev`) is wrong for this project. Valid names are in `docker-compose.yml`: `api`, `postgres`, `redis`, `opa` (there is no `module` container — the module is imported in-process by `api`).

---

## Skills — Load Contextually

Skills are in `.skills/` grouped by domain. Load only what the current task needs.
Do not import all skills at once — each group can be large.

### Animation — `apps/landing/` or the `apps/desktop/` renderer

Read these when adding GSAP animation (e.g. the version timeline):

| Task | File |
|------|------|
| Any GSAP animation | `.skills/animation/gsap-core/SKILL.md` |
| GSAP in React | `.skills/animation/gsap-react/SKILL.md` |
| Scroll animations, pinning, scrub | `.skills/animation/gsap-scrolltrigger/SKILL.md` |
| Sequenced / timeline animations | `.skills/animation/gsap-timeline/SKILL.md` |

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
- **Selling point:** the plain-English AI diff of binary creative files ("background navy → teal; tagline removed") + search by meaning — git-grade local version storage with zero designer friction. AI inference is API-based through LangChain; BYOK sends required inputs directly to the configured provider.
- **MVP:** folder watcher (debounced, temp-file-aware) → hash-based version detection → local Asset/Version storage (SQLite, dedup by hash) → AI change summary + tags per version → timeline UI → hybrid search. File types: **PNG/JPG** (design-industry formats like **CAD** are the future roadmap — Word/PDF versioning already exists). UI structure: `docs/desktop/overview.md`.
- **Scope:** new `apps/desktop/` (Electron) is the product — file watching, version storage, cached history, restore, and keyword search are on-device (React → SQLite → local file store). It must run with no Docker or Chronicle backend (startup offers "Continue local" or login). AI features are implemented **in Python** in a **local FastAPI AI service** (`services/ai/`, LangChain, loopback-only) called by the Electron main process — distinct from the control plane. AI summaries and semantic embeddings require provider connectivity; BYOK credentials are encrypted locally, while the optional gateway routes inference through our service. The FastAPI control plane remains lowest priority and non-essential. Module-contract flow applies to gateway/stats endpoints. `apps/landing/` is optional.
- **Key constraints:** IBM Bob is the mandatory dev tool and its usage is judged — document it as you go. AI layer in the local Python AI service via **LangChain, model-agnostic, default classes/methods only**. Code bar: minimal, clear, documented, well structured. AI calls are async, never block the UI; app works offline except AI calls.
- **Team:** all enrolled students (eligibility confirmed); roster/ownership TBD (open risk).
- **Deadline milestones:** boundary contracts + initial implementation specifications by Jul 18 · MVP complete Jul 27 · video + README + SkillsBuild by Jul 30 · submit Jul 31.

Full detail: `docs/challenge/CHALLENGE.md`, `VISION.md`, `CONSTRAINTS.md`, `RESEARCH.md`.
