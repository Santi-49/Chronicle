# Desktop App Overview — UI Pages, Layout, Startup Flow

> Conceptual — defines **what screens exist and what belongs on each**, not how they look
> (design language TBD, see [CONSTRAINTS.md](../challenge/CONSTRAINTS.md)) or how they're
> implemented. Feature IDs (F1–F10) refer to [spec.md §4](../spec.md).
> Parent: [System Overview](../architecture/overview.md) · Code: `apps/desktop/`

---

## Hard Rule: Local-First, Backend-Optional

The desktop app **must run with no Docker setup and no API connection**. Everything a user
(or a judge cloning the repo) needs works with `npm run dev` alone: capture, timeline,
restore, search, and AI summaries (with their own API key). The control plane only *adds*
accounts, telemetry, and (stretch) hosted inference — it is the **lowest-priority** part of
the build and nothing in the UI may depend on it.

---

## Startup Flow

```
Launch
  │
  ├─ First run ──→ Welcome screen:  [ Continue local ]   ← default, no account, no network
  │                                 [ Log in / Register ] ← optional (control plane, F1)
  │
  └─ Later runs ─→ straight to Assets (restores previous session state,
                    signed-in or local — never blocks on the network)
```

- **Continue local** is the primary path: fully functional forever, no account required.
- An account can be linked later from **Settings → Account**; logging in never gates a
  local feature — it only enables telemetry (F8) and the gateway option (F9).
- If AI isn't configured yet (no key), the app still captures versions; summaries show as
  *pending — configure AI in Settings* instead of failing.

---

## Window Layout

One window, three persistent regions:

```
┌────────┬──────────────────────────────────────────────┐
│        │                                              │
│  Side  │              Content area                    │
│  bar   │   (one page at a time, see below)            │
│        │                                              │
├────────┴──────────────────────────────────────────────┤
│ Status bar: ● watching 3 folders · 2 AI jobs pending  │
│             · offline (queued) · local mode / user    │
└───────────────────────────────────────────────────────┘
```

- **Sidebar** — navigation: **Assets · Search · Settings** (+ **Admin**, stretch, visible
  only to the `admin` role). Small and fixed; the product is the content area.
- **Content area** — exactly one page at a time; pages below.
- **Status bar** — always-visible truth about the invisible work: watcher state, AI queue
  depth, connectivity (offline = "queued", never an error), account state (local / email).

---

## Pages

### 1. Assets (home) — F2, F3, F5

The landing page. A gallery of every tracked asset: thumbnail, file name, version count,
last-change summary (one line), and a *file no longer on disk* badge when applicable.

- Click an asset → its Timeline.
- **Empty state** (first run): one message, one button — "Add a folder to start tracking"
  → Settings → Tracked folders. This doubles as the onboarding.
- New versions appear here live (a save in Photoshop pops the asset to the top).

### 2. Asset Timeline — F3, F5

One asset's history, newest first. Each row: thumbnail, version number, date, one-line AI
summary, and an **AI status chip** — *pending · done · failed (retry)*.

- Click a version → Version details.
- Keyboard: ↑/↓ moves through versions, Enter opens details.
- This is the demo's hero screen (v1 → v8 "the whole design story at a glance") and the
  candidate for the GSAP animation polish.

### 3. Version Details — F4, F5, F6

Everything about one version: large preview, the full AI output (summary, changes list,
tags), metadata (version number, date, size, dimensions, content hash), and actions:

- **Restore this version** — writes the bytes back to the original path; history is never
  rewritten (a new version "Restored from version N" appears — F6). If the original folder
  is gone, the button becomes **Save a copy…**
- **Retry AI** — visible when the summary failed.

### 4. Search — F7

One search box over all assets' history; results are a single ranked list of **versions**
(thumbnail, asset name, version number, matched summary/tags snippet). Keyword and semantic
engines run together behind the same box — the user never chooses a "mode".

- Click a result → Version details.
- Offline: keyword results always work; a subtle note appears if semantic indexing is
  still pending for recent versions.

### 5. Settings — F1, F2, F4/F9 config

Three sections, in priority order:

| Section | Contents |
|---|---|
| **Tracked folders** (F2) | Add/remove folders; per-folder path + date added; note on watched formats: "PNG/JPG today — design-industry formats (e.g. CAD) coming" |
| **AI** (F4) | **Provider** (Anthropic · watsonx/Granite · OpenAI · …), **model** name, **API key** — stored encrypted on-device (Electron `safeStorage`), **never sent to our backend**. *(Stretch, F9: a "Use Chronicle service" switch that routes inference through the gateway instead of a local key.)* |
| **Account** (F1 — lowest priority) | Log in / register / log out; telemetry opt-in (F8). The whole section is optional — everything above works signed-out. |

### 6. Admin `Stretch` — F10

Aggregated usage stats from the control plane, visible only to the `admin` role (RBAC is
pre-built). Until this exists, admins read stats via the API's Swagger UI — the desktop
app has **no** MVP admin surface.

---

## Feature → Page Coverage

| Feature (spec §4) | Where it lives |
|---|---|
| F1 Accounts (low) | Welcome screen · Settings → Account |
| F2 Tracked folders | Settings → Tracked folders · Assets empty state |
| F3 Version capture | Background (main process); surfaces on Assets, Timeline, status bar |
| F4 AI summary | Timeline (status chip) · Version details · Settings → AI |
| F5 Timeline & details | Assets → Timeline → Version details |
| F6 Restore | Version details |
| F7 Hybrid search | Search |
| F8 Telemetry (low) | No UI beyond the Settings opt-in; runs only when signed in |
| F9 Gateway (stretch) | Settings → AI ("Use Chronicle service") |
| F10 Admin (stretch) | Admin page (role-gated) |

Every MVP feature is reachable within two clicks of launch; nothing requires an account,
a network connection, or Docker.

---

## Cross-Cutting UX Rules

- **Never block on AI or network** — versions appear instantly; AI text fills in later
  (spec rule §6.5). Offline is a status, not an error.
- **Keyboard-navigable** throughout (timeline and search first — CONSTRAINTS requirement).
- **Toasts, not dialogs**, for background events: "new version captured", "file over 50 MB
  skipped". Dialogs only for destructive confirmation (restore over unsaved changes).
- **Design language**: TBD — dark "pro tool" working assumption (Linear/Figma-like); run
  the design-skill search before the first UI PR (spec §7).
