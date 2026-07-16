# Hackathon Template — Agent Guide

This is a production-grade monorepo hackathon starter. The backend (auth, RBAC, JWT, DB) is
fully implemented. Your job is to build the challenge-specific logic and the frontend apps.

---

## Step 0 — Before Writing Any Code

> **Self-removing:** Once `docs/challenge/` has no `TODO` banners and `## Challenge Context`
> at the bottom of this file is filled in, delete this entire Step 0 section from both
> `AGENTS.md` and `CLAUDE.md`. It has served its purpose.

Read `docs/challenge/` completely. If any file still contains a `TODO` banner, the team has not
fully defined the challenge context. **Do not start building until this is resolved.**

Run the **Context Clarification Protocol** below, then update the docs and the
`## Challenge Context` section at the bottom of this file and of `CLAUDE.md`.

### Context Clarification Protocol

Work through every question. Do not skip. If the user cannot answer one, mark it as unknown and
proceed — but flag it as a risk.

#### 1 — Challenge

1. What is the hackathon name and organizer?
2. What is the exact problem statement from the challenge brief?
3. What domain or industry does the challenge address? (healthcare, sustainability, fintech, etc.)
4. What are the judging criteria and their relative weights?
5. Are there mandatory technologies or APIs every team must use?
6. What data, datasets, or APIs are provided to participants?
7. What is forbidden or restricted?
8. What is the submission format and hard deadline?

#### 2 — Solution Vision

9. What is your solution in one sentence?
10. What is the core insight or philosophy — the reason your approach is better than the obvious one?
11. What is the "wow factor"? What will make judges say they hadn't thought of this?
12. Who is the primary user and what is their specific pain point?
13. What are the 3–5 features that must work for the demo?
14. What is the absolute minimum viable demo — the smallest thing that proves the concept?
15. What would the full product look like with 3 more months?
16. Walk through the main user journey from first contact to delivered value.
17. What is the demo script? What will you show judges, step by step?

#### 3 — Technical

18. Which apps are in scope? (landing page, web app, mobile app — which ones?)
19. Are there 3D or immersive elements? If so, where and what approach? (Spline / R3F / Three.js)
20. Are there real-time features? (WebSockets, live data, collaborative)
21. What external APIs or services are needed beyond the base stack?
22. What are the performance requirements? (load time, FPS targets, offline support)
23. Are there accessibility requirements?
24. Mobile: iOS only, Android only, or both?
25. Is there a design language, color scheme, or brand direction already decided?

#### 4 — Team & Timeline

26. Who is on the team and what is each person's primary focus?
27. Which person owns which part of the monorepo?
28. When is the demo or presentation?
29. What are the key milestones leading up to the demo?

After running the protocol:
1. Update `docs/challenge/CHALLENGE.md`, `VISION.md`, and `CONSTRAINTS.md`
2. Replace the `## Challenge Context` section at the bottom of this file with a summary
3. Do the same in `CLAUDE.md`

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
  challenge/           ← START HERE before touching any code
    CHALLENGE.md       ← problem statement, rules, data, judging criteria
    VISION.md          ← solution concept, philosophy, key features, demo script
    CONSTRAINTS.md     ← scope, team, timeline, external services, design language
  architecture/        ← system design, service map, request flow
  backend/             ← API reference, auth, RBAC, database schema
  contracts.md         ← module contract system (read before touching services/)
  index.md             ← docs entry point
```

The `docs/challenge/` folder is the source of truth for what is being built and why.
Every other decision — architecture, features, UI — should trace back to it.

---

## How to Work in This Repo

### Contract-First Development

This is the most important rule. Before implementing any feature that crosses a service boundary:

1. Read `docs/contracts.md`
2. Define or update the Python Protocol in `packages/contracts/module/interface.py`
3. Add the corresponding OpenAPI types to `packages/contracts/api/`
4. Run `make generate-types` to export TypeScript types for the frontend
5. Only then implement in `services/module/app/implementation.py`
6. Only then build the frontend against the generated types

This lets backend and frontend work in parallel from the moment the interface is agreed.
Never implement a cross-service feature without a contract first.

### The Backend Is Pre-Built — Don't Reimplement It

Auth (JWT + Redis whitelist), RBAC (OPA), user CRUD, token refresh, and logout are done.
See `docs/backend/` for full reference. Extend the system by:
- Adding challenge logic to `services/module/`
- Adding new OPA policies to `infra/opa/policies/` for new resources
- Adding new routes to `services/api/app/routes/`

### Monorepo Layout

```
apps/
  landing/      Astro → Cloudflare Pages (marketing, demo landing)
  web/          Vite + React + TypeScript (main SPA)
  mobile/       Expo (React Native)
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
make test                 # pytest — no Docker needed
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
Valid service names come from `docker-compose.yml` (e.g. `api`, `module`, `postgres`, `redis`).

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

### `.skills/3d/` — Three.js & WebGL

| When | Skill |
|------|-------|
| Choosing stack (Spline / R3F / vanilla) | `3d/3d-web-experience/SKILL.md` — read first |
| Scene, camera, renderer setup | `3d/threejs-fundamentals/SKILL.md` |
| Animating 3D objects | `3d/threejs-animation/SKILL.md` |
| Geometry and shapes | `3d/threejs-geometry/SKILL.md` |
| Click / hover / raycast interactions | `3d/threejs-interaction/SKILL.md` |
| Lights and shadows | `3d/threejs-lighting/SKILL.md` |
| Loading GLB / GLTF models | `3d/threejs-loaders/SKILL.md` |
| PBR materials | `3d/threejs-materials/SKILL.md` |
| Bloom and post-processing | `3d/threejs-postprocessing/SKILL.md` |
| Custom GLSL shaders | `3d/threejs-shaders/SKILL.md` |
| Textures and UV mapping | `3d/threejs-textures/SKILL.md` |

### `.skills/mobile/` — Expo / React Native

| When | Skill |
|------|-------|
| Navigation, tabs, native UI patterns | `mobile/building-native-ui/SKILL.md` |
| API calls, caching, offline support | `mobile/native-data-fetching/SKILL.md` |
| Running Three.js / web libs in Expo | `mobile/use-dom/SKILL.md` — key for 3D on mobile |
| Custom dev builds, expo-gl, native modules | `mobile/expo-dev-client/SKILL.md` |

### `.skills/design/` — UI/UX

| When | Skill |
|------|-------|
| Color palette, typography, UX guidelines | `design/ui-ux-pro-max/SKILL.md` |
| Search the design database | `python .skills/design/ui-ux-pro-max/scripts/search.py "<query>" --design-system` |

---

## Challenge Context

> **TODO** — Run the Context Clarification Protocol and replace this section.
>
> Include: challenge name, core concept, selling point, MVP features, scope (which apps),
> key constraints, team ownership, and demo deadline.
