# Desktop App Overview — UI Pages, Layout, Startup Flow

> **Source of truth for the desktop UI**: which screens exist, what belongs on each, and
> how they connect. Any renderer PR that adds, removes, or restructures a screen must
> update this file in the same PR. Feature IDs (F1–F10) refer to [spec.md §4](../spec.md).
> Parent: [System Overview](../architecture/overview.md) · Code: `apps/desktop/src/renderer/`
>
> **Last synced with the implemented UI: 2026-07-21.** On the MVP-12 branch, the
> renderer is wired to live C1 IPC queries/events and SQLite-backed data. Restore and the
> hybrid-search engine are built; Windows packaging is self-contained and the remaining work is
> the three-pass clean-machine/manual acceptance record.
> Anything else not yet built is explicitly marked *planned*.

---

## Hard Rule: Local-First, Backend-Optional

The desktop app **must run with no Docker setup and no Chronicle API connection**.
`npm run dev` alone provides capture, cached timeline, restore, and keyword search.
AI summaries and semantic embeddings are API-based through LangChain and require the
configured provider to be reachable. The control plane only adds accounts, telemetry,
and stretch hosted inference; no core local-storage workflow depends on it.

---

## Terminology: a "Project" is a tracked folder

The UI presents each tracked folder (F2) as a **project** with a user-chosen display
name, optional description, icon, and color. "Project" is presentation language only — the underlying entity
is still the tracked folder; there is no extra grouping layer between folders and assets.

> ✅ Contract alignment resolved (MVP-06): the C1 `TrackedFolder` shape (`src/shared/ipc.ts`)
> includes `{ id, path, addedAt, displayName, description, icon, color }` and the main process now
> persists those fields. `addFolder(path, meta?)` and `updateFolder(id, patch)` set them, and
> `pickFolder()` opens the native directory picker without side effects. An asset belongs to
> the tracked folder whose path is the longest prefix of the asset's path.

---

## Startup Flow

```
Launch
  │
  ├─ First entry ─→ Welcome screen:  [ Continue local ]          ← primary, no account/backend
  │                                  [ Continue with Google ]    ← API health → system-browser PKCE (F1)
  │
  └─ After continuing ─→ workspace shell, landing on Home
                          (never blocks on the network)
```

- **Continue local** is the primary path: fully functional forever, no account required.
- Sign-in is Google-branded (standard-color "G", approved wording — see RESEARCH.md),
  uses the operating system's default external browser (not an Electron child window) with PKCE,
  and exchanges the verified Google identity for the existing Chronicle JWT session; accounts
  stay optional control-plane scope. The app first performs a short control-plane health check.
  An unavailable API leaves the sign-in action in a retryable unavailable state without opening
  Google; timeout/cancellation errors are concise inline copy rather than raw IPC exceptions.
- If AI isn't configured yet (no key), the app still captures versions; summaries show as
  pending instead of failing.
- In development, Electron starts the Python 3.12 service from `services/ai`. In an installed
  Windows build it starts the bundled Gemini-capable sidecar from app resources; no system Python
  is required. Either path is loopback-only, health-checked, and never gates local capture.

---

## Window Layout

One window; regions as implemented:

```
┌────────────────────────────────────────────────────────┐
│ ⛭ Chronicle           (empty center)   native controls │  ← 48 px custom title bar
├──────────┬─────────────────────────────────────────────┤
│  Home    │                                             │
│  Projects│              Content area                   │
│  Search  │      (one page at a time, see below)        │
│          │                                             │
│  ────────│                                             │
│  Settings│                                             │
│  v0.1    │                                             │
├──────────┴─────────────────────────────────────────────┤
│ Status bar: ● watched folders · AI state · pending jobs │
└────────────────────────────────────────────────────────┘
```

- **Title bar** — 48 px draggable region with the Chronicle mark; hidden default title bar
  with native Window Controls Overlay on Windows/Linux and traffic lights on macOS. The
  center intentionally stays empty until a real global search/command field earns it.
- **Sidebar** — primary navigation **Home · Projects · Search**, with **Settings** pinned
  in the footer next to the exact `package.json` app version. Includes a skip-to-content link; the active item
  is marked with `aria-current="page"`.
- **Content area** — exactly one page at a time; a short reduced-motion-aware transition
  plays on route change and focus moves to the main content region.
- **Status bar** — live watched-folder count, connectivity, AI readiness, and pending
  annotation/embedding count from C1 `AppStatus`. Clicking a non-zero job count opens the
  live FIFO pending-jobs screen; offline work remains queued rather than becoming a UI error.
- **Theme** — dark / light / system (default), persisted; toggle available pre-workspace
  and in Settings → Appearance.
- **Global shortcut** — `Ctrl/Cmd+K` opens Search from anywhere in the workspace.

---

## Pages

### 1. Welcome — F1

Brand panel (stacked version-cards illustration) plus an access card: **Continue local**
(primary) and **Continue with Google**. A privacy note states local mode works without an
account and that a random installation ID is registered when the control plane is reachable.
Google sign-in is enabled only after the API health preflight succeeds. The unavailable state
offers a connection retry; an expired browser handoff says that sign-in took too long and can be
retried, without exposing Electron/IPC implementation text.

### 2. Home (landing) — F2, F3, F5

The workspace landing page: **Recent projects** (project cards: icon/color, name,
optional description, path,
asset + version counts, last-updated) and **Recent changes** across active tracked projects (latest
versions with thumbnail, version number, summary). Header action: **Add project**.

- Click a project → Project page. Click a change → Version details.
- Live C1 events refresh captures/annotations without a reload. With no projects, the empty
  state doubles as onboarding ("Add a folder to start tracking").

### 3. Projects — F2

Grid of all projects (tracked folders) with the same card treatment. Header action:
**Add project** → New project.

### 4. New Project — F2

Creates a tracked folder: display name, optional description, native **folder picker**,
icon picker (bundled Material Symbols + custom glyph), and color picker (palette + custom).
After selection, C1 `scanFolder()` supplies a recursive file tree. The user can select all,
exclude individual PNG/JPG/JPEG files, and enable/disable supported file types while a live
count shows how many files will be tracked. Those rules persist and apply to initial capture
and future saves. **SVG, BLEND, OBJ, STEP/STP, PSD, and PSB** are marked "Coming soon".
Breadcrumb back to Projects.

### 5. Project — F2, F5

One project's assets: thumbnail, file name, version count, last-change summary.
Breadcrumbs Projects → project. Click an asset → its Timeline.

- **Edit project** opens a dedicated screen that reuses the New Project form. It changes the
  display name, optional description, icon, color, enabled file types, and ignored files. The
  existing folder is rescanned for the file tree, while its selector remains locked. A separated
  **Danger zone** offers two confirmed removal paths: stop tracking while retaining history, or
  permanently delete the project and all associated local history. The two choices are presented
  as peer delete actions, with the history-deleting choice visually stronger; original working
  files are never deleted.

- A missing source file is marked on its asset card and Timeline header while every stored
  version remains available (F3.7).

### 6. Asset Timeline — F3, F5

One asset's history, newest first, on a vertical rail. Each row: version number, date
(+ "Latest" on the newest), one-line AI summary, size, and an **AI status chip** —
*Summary ready · pending · failed*. Breadcrumbs Projects → project → asset.

- Click a version → Version details.
- Timeline rows support ↑/↓ and Home/End focus traversal plus Enter to open. Failed rows
  explain the recovery path; retry is available on Version Details.
- A discreet **Reset history…** action sits below the Timeline. It expands to explain the
  irreversible scope and requires typing `RESET`; the latest snapshot becomes a fresh v1 and
  a new initial-version annotation is queued.
- This is the demo's hero screen and the candidate for GSAP animation polish.

### 7. Version Details — F4, F5, F6

Everything about one version: large preview, the full AI output (summary, changes list,
tags), metadata, and actions:

- **Newer / older arrows** — move directly through the asset's version history in the
  same newest-first order as the Timeline; each end disables its unavailable direction.
- **Restore this version** (F6) — writes the bytes back to the
  original path; history is never rewritten (a new version "Restored from version N"
  appears and no AI job is queued). If the original folder is gone, the button becomes
  **Save a copy…** and opens the native save dialog.
- **Retry AI** — visible when the summary failed.

### 8. Search — F7

One search box over all assets' history (opened from the sidebar or `Ctrl/Cmd+K`);
results are a single ranked list of **versions** (thumbnail, asset name, version number,
matched summary/tags snippet). Keyword and semantic engines run together behind the same
box — the user never chooses a "mode". Click a result → Version details.

- A live status notice appears while recent versions still need semantic indexing. It distinguishes
  active indexing, work paused offline, and missing AI setup; in every state it confirms that
  keyword search remains available while meaning-based matches catch up.

### 9. Settings — F1, F2, F4/F9 config

Four sections, in current order:

| Section | Contents |
|---|---|
| **Appearance** | Theme: System (default) · Dark · Light |
| **Tracked folders** (F2) | Live project list (icon + name + path) with two confirmed **Remove** choices (C1 `removeFolder`): delete the project while keeping history, or delete the project and all associated local history. Original working files remain untouched. **Add a project** → New project. Notes PNG/JPG scope. |
| **Account** (F1/F8) | Live Google sign-in/sign-out; the pre-built password flow remains API-only and local history remains account-independent. The Google action is health-gated and uses the default external browser. Usage reporting and portable preference sync are checked by default, including a one-time migration from their unreleased pre-POST-03 false placeholders; choices made after migration are preserved. Portable preferences sync automatically after each saved change, with no manual sync action. The usage control includes an explicit local-data warning and immediate off switch. Encrypted API-key sync remains an independent, signed-in-only, off-by-default checkbox. Enabling key sync reveals a compact passphrase row with explicit **Save encrypted copy** and **Restore to this device** actions; disabling it removes the cloud envelope but keeps local keys. The passphrase is cleared after an action, cannot be recovered, and is never sent to Chronicle. Operation status/errors sit beside the related control. |
| **AI summaries** (F4) | Two task configs — **change summaries (vision)** and **semantic search (embeddings)** — each a **provider** + curated **model** picker. Packaged providers: **Google Gemini · Anthropic Claude · OpenAI**, each with a short quality/price shortlist (Anthropic offers no embeddings). A **Developer mode** toggle permits free-text LangChain provider/model pairs for development environments that install them separately. **API keys** are encrypted per provider with Electron `safeStorage`, never readable by the renderer, and never sent to Chronicle's backend. Both selectors show a missing-key error and disable Save until their selected provider has a key. Changed selections are probed through the loopback AI service before persistence; rejection restores the prior values with friendly feedback. Changing the embedding provider/model queues annotation text for reindexing. *(Stretch, F9: gateway switch.)* |

The footer **status bar** (all workspace pages) shows live C1 `AppStatus`: watched-folder count,
online/offline, AI-ready state, and pending AI/embedding job count — refreshed from `statusChanged`.
When work is queued, the pending-job count is a button that opens a live FIFO queue screen with
the job type, asset/version, queued time, retry count, and loading/error/empty states.

### 10. Admin `Stretch` — F10

Aggregated usage stats from the control plane, visible only to the `admin` role. Until
this exists, admins read stats via the API's Swagger UI — the desktop app has **no** MVP
admin surface.

---

## Feature → Page Coverage

| Feature (spec §4) | Where it lives |
|---|---|
| F1 Accounts (low) | Welcome · Settings → Account (Google sign-in, persistent Chronicle session; password endpoints remain API-only) |
| F2 Tracked folders | New Project · Projects · Home · Settings → Tracked folders |
| F3 Version capture | Background (main process); surfaces on Home, Project, Timeline, and the live status bar |
| F4 AI summary | Timeline (status chip) · Version details · Settings → AI summaries |
| F5 Timeline & details | Home / Project → Timeline → Version details |
| F6 Restore | Version details (append-only restore + native save-copy fallback) |
| F7 Hybrid search | Search (`Ctrl/Cmd+K`) |
| F8 Telemetry (low) | Settings preference and disclosure implemented; event delivery planned in POST-04 |
| F9 Gateway (stretch) | Settings → AI ("Use Chronicle service") |
| F10 Admin (stretch) | Admin page (role-gated) |

Every MVP feature is reachable within two clicks of launch; nothing requires an account,
a network connection, or Docker.

---

## Cross-Cutting UX Rules

- **Never block on AI or network** — versions appear instantly; AI text fills in later
  (spec rule §6.5). Offline is a status, not an error.
- **Keyboard-navigable** throughout (timeline and search first — CONSTRAINTS requirement);
  skip link, focus-on-route-change, and `aria-current` are already in place.
- **Toasts, not dialogs** *(planned)*, for background events: "new version captured",
  "file over 50 MB skipped". Dialogs only for destructive confirmation.
- **Design language** (implemented): minimal dark-first pro tool with light + system
  themes, neutral gray surfaces, IBM blue for primary actions/focus, semantic theme
  tokens (`src/renderer/src/styles/tokens.css`), bundled Material Symbols SVGs — see
  CONSTRAINTS.md and the RESEARCH.md log entries of 2026-07-17.
