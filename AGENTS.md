# Chronicle — Agent Guide

This repo builds **Chronicle** on a production-grade monorepo hackathon starter. The backend
(auth, RBAC, JWT, DB) is fully implemented. The work is the desktop app, the challenge-specific
logic, and the control-plane endpoints.

---

## Research Protocol — Ongoing

Unlike Step 0 (which runs once and is deleted), this protocol is **iterative**.
Run it after Step 0 and revisit before any major design or architecture decision.
Document findings in `docs/challenge/RESEARCH.md`.

### Why This Matters

Judges are not neutral. They are employees or stakeholders of the organizing company.
Understanding their values, their existing products, and their blind spots is a competitive
advantage. A technically weaker solution pitched in the right language often beats a stronger
one that ignores the audience.

### Research Questions

#### About the Company

1. What is the company's core business and mission?
2. What products or services do they currently offer in this problem space?
3. What does their public tech stack look like? (job listings, GitHub, engineering blog)
4. What do they emphasize publicly — speed, privacy, sustainability, enterprise reliability?
5. Have they acquired, invested in, or partnered with anyone in this space?
6. What is their competitive position? Are they a challenger or an incumbent?
7. Are there any public controversies or sensitivities to be aware of?

#### About the Challenge Specifically

8. Why is this company running this hackathon — what's the business motivation?
9. What problem have they failed to solve internally, or want external ideas on?
10. What is their public framing of the challenge? What outcome language do they use?
11. Have they run hackathons before? What kinds of solutions won?
12. Who are the judges? What are their roles and backgrounds?
13. Are there any hints in the challenge brief about what they're hoping to find?

#### About the Problem Space

14. What existing solutions are on the market? Why are they insufficient?
15. What does the academic or industry state of the art look like?
16. What have teams tried before in this space and what failed?
17. Are there regulatory, ethical, or data privacy constraints specific to this domain?

### What to Do With the Findings

After researching, update `docs/challenge/RESEARCH.md` with:
- Concrete findings per section
- A **Recommendations** block: how to frame the solution, what to emphasize in the demo,
  what technical choices align with the company's preferences, and what to avoid
- A dated entry in the **Research Log** for each new finding

**When to re-run research:**
- Before finalizing the solution concept
- Before writing the demo script
- Before choosing a visual style or brand direction
- Whenever a team member says "I wonder what they actually care about"

---

## How Documentation Works

```
docs/
  spec.md              ← TEAM SPEC: tech stack, best practices, MVP functionality — read before building
  bob-log.md           ← IBM Bob usage log — every PR adds a line (judged artifact)
  challenge/           ← START HERE before touching any code
    CHALLENGE.md       ← problem statement, rules, data, judging criteria
    VISION.md          ← solution concept, philosophy, key features, demo script
    CONSTRAINTS.md     ← scope, team, timeline, external services, design language
  architecture/        ← system design, service map, request flow
  backend/             ← API reference, auth, RBAC, database schema
  desktop/             ← desktop app: UI pages, layout, startup flow, feature coverage
  contracts.md         ← module contract system (read before touching services/)
  index.md             ← docs entry point
```

The `docs/challenge/` folder is the source of truth for what is being built and why;
`docs/spec.md` is the source of truth for stack, working rules, and MVP feature scope.
Every other decision — architecture, features, UI — should trace back to them.

---

## How to Work in This Repo

### Contract-First Development

Before implementing a feature across a real component boundary:

1. Read `docs/contracts.md`.
2. Define the operation's functionality and input/output/error formats using the
   boundary's native mechanism: TypeScript for IPC, OpenAPI/Pydantic for HTTP,
   JSON Schema for portable structured data, or a Python `Protocol` only for an
   actual in-process module boundary.
3. Generate derived types where applicable (`make generate-types`).
4. Implement each side independently against the agreed behavior.

Contracts do not define prompts, algorithms, tools, orchestration, retries,
storage layout, provider choices, defaults, or internal classes. Prefer existing
library interfaces and schemas; add custom abstractions only after research shows
they are needed. All repository prompt assets live in `packages/prompts/` as
Markdown with YAML front matter and are loaded from there.

### The Backend Is Pre-Built — Don't Reimplement It

Auth (JWT + Redis whitelist), RBAC (OPA), user CRUD, token refresh, and logout are done.
See `docs/backend/` for full reference. Extend the system by:
- Adding challenge logic to `services/module/`
- Adding new OPA policies to `infra/opa/policies/` for new resources
- Adding new routes to `services/api/app/api/v1/endpoints/`

### Monorepo Layout

```
apps/
  desktop/      Chronicle — Electron + React + TS (the product)
  landing/      Astro → Cloudflare Pages (optional marketing page)
services/
  api/          FastAPI backend — fully implemented, extend via module contract
  module/       Challenge-specific logic — implement here
packages/
  contracts/
    api/        OpenAPI spec + generated TypeScript types
    module/     Python Protocol (backend ↔ module boundary)
infra/
  opa/policies/ Rego authorization rules
  postgres/     DB init SQL
  redis/        Redis config
```

### Common Commands

```bash
make dev                  # docker compose up --build (all services)
make stop                 # docker compose down
make migrate              # alembic upgrade head
make makemigration MSG="" # generate a new Alembic migration
make test                 # pytest with coverage (in Docker); make test-local runs it directly
make generate-types       # OpenAPI spec → TypeScript types
```

---

## MCP Servers

Five MCP servers are available in `.mcp.json`. Use them instead of shell commands wherever possible.

| Server | Use when |
|--------|----------|
| `postgres` | Inspecting the DB schema, running queries, checking migrations, exploring data |
| `fetch` | Hitting external URLs, reading API docs, lightweight web research |
| `markitdown` | Converting a local file (PDF, DOCX, HTML) or URL to readable markdown |
| `playwright` | Testing UI in a real browser, taking screenshots, scraping rendered pages |
| `docker` | Running commands inside a running Compose service container |

### postgres

Connects to `postgresql://hackathon:changeme@localhost:5432/hackathon`.
Use `list_schemas`, `list_objects`, `get_object_details` to explore structure before writing migrations.
Use `execute_sql` to verify data after seeding or migrations.
Use `analyze_query_indexes` / `explain_query` when diagnosing slow queries.

### fetch

Plain HTTP fetch with optional markdown extraction. Use for:
- Reading external API documentation
- Checking a live endpoint response
- Quick web research when `WebSearch` is too broad

### markitdown

Converts `file://` paths or `http(s)://` URLs to clean markdown.
Prefer this over `fetch` when the source is a binary file (PDF, DOCX) or a JS-heavy page.

### playwright

Full browser automation. Use for:
- Verifying UI after a frontend change (navigate → snapshot)
- Taking screenshots for the demo or docs
- Testing auth flows end-to-end in a real browser

### docker

Runs commands inside a running Docker Compose service.
**Always pass the `service` parameter** — the default (`laravel_app_dev`) does not exist in this project.
Valid service names come from `docker-compose.yml`: `api`, `postgres`, `redis`, `opa` (there is no `module` container — the module is imported in-process by `api`).

```
# example
mcp__docker__run_command(service="api", command="pytest tests/ -x")
```

---

## Skills — When to Use What

Skills live in `.skills/` organized by group. Read the relevant skill file before implementing
in that domain. Do not load all skills at once — load only what the current task needs.

### `.skills/animation/` — GSAP

| When | Skill |
|------|-------|
| Any GSAP animation | `animation/gsap-core/SKILL.md` |
| GSAP inside React components | `animation/gsap-react/SKILL.md` |
| Scroll-linked animation, pinning, scrub | `animation/gsap-scrolltrigger/SKILL.md` |
| Sequenced / timeline animations | `animation/gsap-timeline/SKILL.md` |

### `.skills/design/` — UI/UX

| When | Skill |
|------|-------|
| Color palette, typography, UX guidelines | `design/ui-ux-pro-max/SKILL.md` |
| Search the design database | `python .skills/design/ui-ux-pro-max/scripts/search.py "<query>" --design-system` |

---

## Challenge Context

- **Challenge:** AI Builders Challenge with IBM Bob (BeMyApp / IBM SkillsBuild) — July 2026 theme: *Reimagine Creative Industries with AI*. Submission due **July 31, 2026, 11:59 PM ET** (public GitHub repo + ≤3 min video + SkillsBuild learning activity).
- **Product:** **Chronicle** — a local-first Electron + React desktop app that watches folders, auto-versions creative files on save, and uses AI to explain what changed between versions, with a hybrid keyword + embeddings search over the history.
- **Selling point:** the plain-English AI diff of binary creative files ("background navy → teal; tagline removed") + search by meaning — git-grade local version storage with zero designer friction. AI inference is API-based through LangChain; BYOK sends required inputs directly to the configured provider.
- **MVP:** folder watcher (debounced, temp-file-aware) → hash-based version detection → local Asset/Version storage (SQLite, dedup by hash) → AI change summary + tags per version → timeline UI → hybrid search. File types: **PNG/JPG** (design-industry formats like **CAD** are the future roadmap — Word/PDF versioning already exists). UI structure: `docs/desktop/overview.md`.
- **Scope:** new `apps/desktop/` (Electron) is the product — file watching, version storage, cached history, restore, and keyword search are on-device (React → SQLite → local file store). It must run with no Docker or Chronicle backend (startup offers "Continue local" or login). AI summaries and semantic embeddings are API-based through LangChain and require provider connectivity; BYOK credentials are encrypted locally, while the optional gateway routes inference through our service. The FastAPI control plane remains lowest priority and non-essential. Module-contract flow applies to gateway/stats endpoints. `apps/landing/` is optional.
- **Key constraints:** IBM Bob is the mandatory dev tool and its usage is judged — document it as you go. AI layer via **LangChain, model-agnostic, default classes/methods only**. Code bar: minimal, clear, documented, well structured. AI calls are async, never block the UI; app works offline except AI calls.
- **Team:** all enrolled students (eligibility confirmed); roster/ownership TBD (open risk).
- **Deadline milestones:** boundary contracts + initial implementation specifications by Jul 18 · MVP complete Jul 27 · video + README + SkillsBuild by Jul 30 · submit Jul 31.

Full detail: `docs/challenge/CHALLENGE.md`, `VISION.md`, `CONSTRAINTS.md`, `RESEARCH.md`.
