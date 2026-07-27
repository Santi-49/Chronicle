# Getting Started

> Everything needed to run, develop, test, and package Chronicle.
>
> New to the project? Read [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) first for a
> plain-language map, then come back here for commands.

---

## The one thing to understand first

**Chronicle is the desktop app.** Everything else in this repository is optional.

```text
apps/desktop/     Electron + React + TypeScript — the product
services/ai/      Local FastAPI + LangChain sidecar — needed only for AI features
services/api/     Optional FastAPI control plane — needed only for accounts/telemetry
apps/landing/     Astro marketing, help center, and legal site — optional
services/module/  Optional inference-gateway logic — stretch scope, not built
```

Capture, version history, previews, restore, and keyword search require **no Docker, no
account, and no network.** If you only want to work on the product, you only need the first
path.

---

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| **Node.js** | 20+ (22 recommended) | The desktop app |
| **Python** | 3.12 | The local AI service, and building its packaged sidecar |
| **GNU Make** | any | The command surface below |
| **Git** | any | Obviously |
| **Docker Desktop** | any | *Only* the optional control plane and its tests |

**On Windows, run `make` from Git Bash or WSL** — not PowerShell or `cmd`.

Native modules: `better-sqlite3` is compiled for Electron during setup. If Windows lacks
build tools, see [`apps/desktop/README.md`](../apps/desktop/README.md).

---

## Path 1 — Run the app (start here)

```bash
make setup      # install desktop dependencies + prepare demo-assets/workspace/
make run        # open Electron with hot reload
```

That's it. A real desktop window opens with hot reload and Chrome DevTools. Choose
**Continue local** at the welcome screen, add a folder, and save an image into it.

If Electron's downloaded binary needs repair:

```bash
make ensure-electron && make run
```

<details>
<summary>Without Make</summary>

```bash
npm --prefix apps/desktop ci
npm --prefix apps/desktop run ensure-electron
npm --prefix apps/desktop run dev
```

</details>

### Where the app stores things

| What | Where |
|---|---|
| SQLite database | Electron user-data directory (`chronicle-desktop` in dev, `Chronicle` when packaged) |
| Version library | A content-addressed folder beside the database |
| Derived previews | Cached per content hash beside the library — disposable |
| Provider keys | Encrypted via Electron `safeStorage`, one per provider |

Useful reset commands during development:

```bash
make app-show               # print resolved app data locations
make app-reset-onboarding   # replay the first-run tutorial
make app-reset-session      # clear the signed-in session
make app-clear-ai-costs     # clear local Activity & Cost records
```

---

## Path 2 — Enable AI summaries and semantic search

Without this, Chronicle still captures versions — summaries just show as *pending*.

```bash
make setup-ai   # install the loopback AI service and its default Gemini provider
```

Then in the app: **Settings → AI summaries**. Configure the two tasks independently
(change summaries, and semantic search), save a provider key for each selected provider, and
save. Electron starts and health-checks the sidecar automatically — you do not run it yourself.

Notes that will save you time:

- **Save is disabled until the selected provider has a key.** That is intentional.
- **A changed provider/model is live-probed before it persists.** A rejected configuration
  rolls back to the previous working values. The probe is a real provider call and may cost a
  fraction of a cent.
- **Changing the embedding provider/model re-queues existing text for reindexing** — vision
  annotation is *not* rerun.
- Google Gemini is the validated default. Anthropic offers no embeddings API, so it appears
  only under change summaries.

Diagnose provider configuration without launching the UI:

```bash
make probe-ai                          # probe the saved selections
make probe-ai-model PROVIDER=... MODEL=...
make probe-ai-provider PROVIDER=...
make probe-ai-all                      # the whole curated catalog
make smoke-ai                          # bundled-sidecar health/import smoke
make run-ai                            # run the sidecar standalone (rarely needed)
```

---

## Path 3 — Run the demo history

The repository ships three deterministic, original image stories so capture and AI can be
tested against the same files every time.

1. Add `demo-assets/workspace/` as a Chronicle project.
2. Advance a story:

```bash
make demo-reset               # back to v1 for every asset
make demo-next ASSET=logo     # navy → teal
make demo-next ASSET=logo     # tagline removed
make demo-status              # what state each asset is in
make demo-set ASSET=logo STEP=2
```

Available assets and the full command list are in
[`demo-assets/README.md`](../demo-assets/README.md).

---

## Path 4 — The optional control plane

Only needed for Google sign-in, portable settings, encrypted key backup, usage statistics, and
admin analytics. **Nothing in the local creative workflow depends on it.**

```bash
make setup-env            # create .env from the example
```

Then edit `.env`:

| Variable | Notes |
|---|---|
| `JWT_SECRET_KEY` | Any string ≥ 32 characters |
| `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` | Seeds the first admin account |
| `CHRONICLE_CONTROL_PLANE_URL` | Normally `http://localhost:8000` — the **origin only**, no `/api/v1` |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | For desktop Google sign-in |

```bash
make control-plane-up       # start Postgres, Redis, OPA, and the API; run migrations
make control-plane-health   # → {"status":"ok","service":"chronicle-control-plane",...}
make control-plane-down
```

Browse the API interactively at <http://localhost:8000/docs>.

Compose project name is `chronicle`; services are `api`, `postgres`, `redis`, and `opa`. Only
`api` publishes a host port. **There is no `module` container** — the module is imported
in-process by `api`.

Admin and migration helpers:

```bash
make migrate
make makemigration MSG="add pairings table"
make seed
make admin-list
make admin-promote EMAIL=someone@example.com
make stats-clear
```

Packaged releases embed the public control-plane URL and OAuth client ID at build time from
GitHub Actions repository variables, so an installed app needs no `.env`.

---

## Build, test, and package

```bash
make typecheck        # TypeScript renderer + main-process checks
make test-desktop     # Vitest desktop suite (runs under Electron's Node)
make test-ai          # provider-mocked Python AI tests
make test             # control-plane pytest in Docker  (make test-local runs it directly)
make lint             # Ruff
make check            # typecheck + test-desktop + test + lint
```

```bash
make build            # production desktop build
make package          # Windows NSIS installer      → apps/desktop/dist/
make package-macos    # macOS DMG (run on macOS)    → apps/desktop/dist/
make package-unpacked # faster, unpacked build for driving the real app
```

Packaging builds a self-contained PyInstaller AI sidecar, so installed users need no Python.
Build it from a **clean, declared Python environment** — a polluted global interpreter has been
measured making dependency analysis take more than ten minutes.

Current installers are **unsigned**: Windows SmartScreen and macOS Gatekeeper may warn. See
[releasing.md](releasing.md).

---

## How we work

### Branches

`main` is stable and releasable. `dev` is shared integration. Work happens on
`feat/…`, `fix/…`, or `docs/…` branches cut from `dev` and merged back by reviewed PR.
**Nobody pushes directly to `dev` or `main`.**

```bash
git checkout dev && git pull
git checkout -b feat/short-name
# ... work, test, document ...
git commit -m "feat(scope): what changed"
git push -u origin feat/short-name
```

Commit messages follow Conventional Commits — Release Please derives versions and changelogs
from them.

### Definition of done

A PR is done when:

- [ ] `make typecheck` and the relevant test suites pass
- [ ] Generated types are regenerated if a contract changed (`make generate-types`, `make generate-ai-types`)
- [ ] Documentation is updated if behavior changed
- [ ] One line is added to [bob-log.md](bob-log.md) describing how IBM Bob was used

Keep PRs focused — one task slice, ideally under ~300 lines.

### Contracts — the rule that keeps this repo parallelizable

A **contract** states what an operation does and the format of its inputs, outputs, and errors.
It does **not** choose the algorithm, prompt, model, provider, storage layout, retry policy, or
internal classes. Each boundary uses its native mechanism rather than an invented wrapper.

| Boundary | Source of truth | Rule |
|---|---|---|
| Renderer ↔ Electron main | `apps/desktop/src/shared/ipc.ts` | Treat as stable; propose changes separately |
| Main ↔ local AI service | AI service OpenAPI + `packages/contracts/ai/output.schema.json` | Regenerate the TS client; never hand-write |
| Filesystem ↔ watcher | `apps/desktop/src/main/watcher/rules.ts` | Preserve formats, size cap, and settle guarantee |
| Settings | `apps/desktop/src/shared/settings.ts` | Secrets must never enter renderer-readable settings |
| App ↔ control plane | `packages/contracts/api/openapi.json` | Generated types only |
| Backend ↔ module | `packages/contracts/module/interface.py` | Stretch scope |

```bash
make generate-types      # control-plane OpenAPI → packages/contracts/api/generated/index.ts
make generate-ai-types   # AI service OpenAPI → generated TS client
```

Full rules and rationale: [contracts.md](contracts.md).

### Adding a control-plane resource (the whole loop)

1. Pydantic schema in `services/api/app/schemas/`
2. Service function in `services/api/app/services/`
3. Route in `services/api/app/api/v1/endpoints/`
4. One `(resource, action)` entry in `infra/opa/policies/roles.rego`
5. Matching permissions in the next Alembic migration seed
6. `make makemigration MSG="..."` then `make migrate`
7. `make generate-types` so the desktop app gets updated types

### Adding a creative format

Two **independent** changes, by design:

1. **Capture and display** — one entry in `apps/desktop/src/shared/formats.ts` plus its handler
   in `apps/desktop/src/main/formats/`. The watcher, capture, media protocol, previews,
   telemetry buckets, and UI all derive from the registry.
2. **AI annotation** — later, separately: one `FormatAdapter` in
   `services/ai/chronicle_ai/formats.py` plus its prompt sections in
   `packages/prompts/version-annotation.md`.

Until step 2 exists, that format's versions capture, preview, restore, and keyword-search
normally while their annotation jobs stay honestly *queued*.

### Prompts

Prompt content lives **only** in `packages/prompts/*.md` with YAML front matter — never inlined
in Python or TypeScript. A prompt revision is an implementation experiment, free to change as
long as C3's output schema still validates.

---

## AI tooling for contributors

The repository is configured for AI coding agents. Point yours at the required reading listed at
the top of [TODO.md](../TODO.md) — those files are the source of truth for scope, contracts, and
hard rules, and code contradicting them gets rejected in review even if it works.

**MCP servers** (`.mcp.json`): `postgres`, `playwright`, `docker`, `fetch`, `markitdown`. Verify
with `/mcp` in Claude Code. Setup for other agents: [mcp-servers.md](mcp-servers.md).

> **`docker` caveat:** always pass `service` explicitly. Valid names are `api`, `postgres`,
> `redis`, `opa`.

**Skills** (`.skills/`) cover GSAP animation and UI/UX design decisions, loaded contextually.
To steer a design decision explicitly:

```bash
python .skills/design/ui-ux-pro-max/scripts/search.py "dark mode dashboard" --design-system
```

---

## Where to go next

| You're working on | Read |
|---|---|
| Anything — read this first | [spec.md](spec.md) — stack, rules, MVP scope F1–F10 |
| Understanding the whole project | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| The renderer or any screen | [desktop/overview.md](desktop/overview.md) |
| AI annotation, embeddings, or providers | [ai-approach.md](ai-approach.md) |
| Contract boundaries | [contracts.md](contracts.md) |
| System and service architecture | [architecture/overview.md](architecture/overview.md) |
| Backend routes, auth, RBAC, database | [backend/overview.md](backend/overview.md) |
| Versioning, CI, and releases | [releasing.md](releasing.md) |
| Privacy, lawful basis, retention | [privacy-policy.md](privacy-policy.md) |
| The judging case | [challenge-fit.md](challenge-fit.md) |
| Claiming a task | [TODO.md](../TODO.md) · [PROJECT_STATUS.md](../PROJECT_STATUS.md) |
