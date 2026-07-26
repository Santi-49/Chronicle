# POST-07 — Install and First-Run Onboarding

> Research and implementation source. Implemented on 2026-07-25 with native NSIS extension
> points and renderer-local tutorial state; no C1/C3/C5 contract changed.
>
> Research date: 2026-07-25 · Target: Windows x64 NSIS installer and the Electron first-run
> experience · Current desktop version while planning: 0.9.0

## Outcome

Use two deliberately separate layers:

1. A **branded native Windows installer** that establishes trust, presents the product license,
   installs Chronicle, and launches it. A separate installer license remains conditional.
2. A **short, contextual tutorial inside Chronicle** that uses the real project, timeline, and
   AI-settings screens.
3. A **versioned first-entry agreement** beside Continue local/sign-in that links the same hosted
   Terms and Privacy Policy used by Chronicle's live online service.

The installer should not try to teach Chronicle or configure an AI provider. NSIS is good at
installation choices and legal acceptance; the app is the accessible, theme-aware place for
interactive product education.

## Implementation status

Implemented:

- Native NSIS welcome/finish copy through `build/installer.nsh`; no HTML or replacement
  `installer.nsi`.
- Chronicle 24-bit header/sidebar BMPs with committed SVG source artwork.
- Current-user installation without the unnecessary install-scope/UAC choice.
- A three-step, non-blocking guided tour driven by real project creation, Timeline entry, and
  successful AI configuration/test state. Anchored coach marks spotlight and point to the actual
  controls as the user moves between screens.
- Versioned path/key-free renderer persistence, restart/resume, Skip, Back, optional AI deferral,
  and Settings replay.
- Focus-visible controls, polite live progress, Escape collapse, and reduced-motion-aware
  navigation to AI Settings.
- Versioned first-entry agreement links, device-local acceptance evidence, policy-change
  re-prompting that preserves tutorial state, and permanent Settings links.

Intentionally pending:

- A separate installer license. It is not currently required by product design: the native
  checkbox hook is dormant and `nsis.license` remains unset. Human legal review must explicitly
  confirm this choice.
- Human approval of the hosted Terms/Privacy controller identity, substantive text, repository
  license, and whether device-local evidence is sufficient or account/server evidence is needed.
- Clean-machine teammate acceptance remains required before closing POST-07.

Packaging verification:

- electron-builder 26.15.3 produced the native x64 assisted installer
  `dist/Chronicle-Setup-0.9.0.exe` on 2026-07-25.
- The installer was 154,923,861 bytes with SHA-256
  `AF219BBFEF264BAC1D3E413BDAB4E5F2A9B9958CF6394F2A3101E3FAC64A68F4`.
- The current full desktop suite passed with 231 tests passing and 1 skipped; typecheck and the production
  renderer/main build also passed.

## Baseline before implementation

`apps/desktop/package.json` already builds an electron-builder **assisted NSIS installer**:

- `oneClick: false` enables the multi-page wizard.
- The install directory can be changed.
- Desktop and Start menu shortcuts are created.
- Chronicle's `.ico` is already used for the installer and uninstaller.
- With the current `perMachine` default, NSIS presents its install-mode choice and defaults to
  the current user.
- There is no Chronicle header/sidebar artwork, welcome page, license/EULA page, or installer
  copy yet.

The application already has:

- a one-time Welcome screen with **Continue local** and optional Google sign-in;
- a real New Project flow with native folder selection and file scanning;
- live version capture, Project, Asset Timeline, and Version Details screens;
- provider/model/API-key configuration and task-specific connection tests in Settings;
- live AI-service, provider-readiness, and queued-job status;
- a single `chronicle-has-onboarded` local-storage flag that currently means only “entered the
  workspace,” not “learned the product.”

## Research conclusions

### Literal `.exe` installer customization is supported

Chronicle does not need a new installer technology. electron-builder's assisted NSIS target
supports:

| Surface | Supported approach | Chronicle recommendation |
|---|---|---|
| Executable/installer icon | `installerIcon` / `uninstallerIcon` | Already done; retain |
| Page header | `installerHeader`, 150×57 px BMP | Add a restrained mark/wordmark asset |
| Welcome/finish sidebar | `installerSidebar` / `uninstallerSidebar`, 164×314 px BMP | Add one quiet Chronicle illustration |
| Welcome copy | `build/installer.nsh` → `customWelcomePage` | Add one short product/value paragraph |
| Product license | `nsis.license` pointing to TXT, RTF, or HTML | Add only after human legal approval |
| Literal acceptance checkbox | NSIS `MUI_LICENSEPAGE_CHECKBOX` | Use if the approved license requires explicit clickwrap |
| Page order or extra native page | electron-builder include macros | Avoid unless an acceptance need cannot use built-ins |
| Completely bespoke installer UI | Replace the complete NSIS `script` | Do not pursue for POST-07 |

The header/sidebar files must be **24-bit RGB BMP without alpha**. This is a native Windows
wizard, not an HTML/CSS canvas; Chronicle can brand its artwork and copy, but should not expect
the visual freedom of the React app.

electron-builder recommends a small `installer.nsh` include for customization while retaining
its maintained installer script. Replacing the entire script transfers upgrade, uninstall,
shortcut, architecture, and future auto-update compatibility risk to Chronicle.

Sources:

- [electron-builder NSIS configuration and custom include macros](https://www.electron.build/docs/nsis/)
- [electron-builder Windows installer image sizes and formats](https://www.electron.build/docs/features/icons-and-images/#windows-nsis-installer-images)
- [NSIS Modern UI license checkbox and page-copy options](https://nsis.sourceforge.io/Docs/Modern%20UI/Readme.html)

### Terms belong at first entry; a separate installer EULA remains conditional

The installer's `license` option creates an enforceable gate: a user cannot continue until they
accept. NSIS normally uses an **I Agree** action; its Modern UI can instead render a required
checkbox, matching the requested pattern.

Chronicle now has a live control plane, downloadable installers, hosted Terms and Privacy pages,
and a public source repository. The product decision is to put agreement beside the actions that
enter the app, covering both local use and optional online services, rather than duplicate those
Terms inside the installer. The device-local record contains only document versions, timestamp,
and continuation method. It is evidence of the local action, not claimed account/server evidence.

Do not invent legal text during implementation. A human owner must still decide and approve:

- whether Chronicle needs an end-user license agreement, terms of use, or only the repository's
  software license/third-party notices;
- the legal entity/licensor name, permitted use, warranty/liability language, governing law, and
  version/effective date;
- whether the text applies to local-only use, the optional account/control plane, or both;
- whether localized licenses are needed (`license_en`, `license_es`, and so on);
- the stable Terms and Privacy URLs and how users can reopen them in Settings.
- whether device-local acceptance evidence is sufficient, how long it should be retained, and
  whether signed-in acceptance also needs a purpose-built server audit contract;
- the public repository license and third-party notice process.

The privacy policy is related but is not a substitute for the product license. Likewise, accepting
a broad EULA must not silently opt a user into optional telemetry or encrypted-key sync. Chronicle's
purpose-specific privacy controls remain in the app, and production distribution stays gated on
the existing human legal/controller review in `docs/privacy-policy.md`.

Recommended artifact ownership:

- `apps/desktop/build/eula.rtf` (or `.html`) — only if human review requires a separate,
  versioned installer license.
- `apps/desktop/build/installer.nsh` — presentation macros only.
- `docs/legal/` or the existing hosted legal pages — readable source/history and public links.
- Third-party license/notice generation — a separate compliance check; do not paste dependency
  licenses into the Chronicle EULA.

### Product education belongs in the running app

A full-screen slideshow would explain controls out of context and delay first value. Use small,
resumable **Getting started** coach-mark dialogs anchored to controls on the real screens. The UI/UX
research prioritizes progressive disclosure, visible Back/Skip controls, keyboard focus, and
reduced-motion support.

The product's “aha” sequence is:

```text
Enter locally
  → create a project from a real folder
  → open the first captured asset
  → see its timeline and understand future saves become versions
  → optionally configure an AI provider for summaries and meaning-based search
```

AI setup is optional and must never stand between installation and local capture.

## Proposed installer flow

Keep the native assisted wizard and customize only maintained extension points:

1. **Welcome to Chronicle**
   - Branded sidebar and small header mark.
   - Copy: Chronicle watches chosen creative folders, keeps version history on this device, and
     can optionally use a configured AI provider to explain changes.
   - Primary action remains native **Next**.
2. **License agreement** — conditional on approved legal text
   - Scrollable RTF/HTML.
   - Required “I have read and accept…” checkbox.
   - Link to the current privacy policy and identify its effective/version date if HTML is used.
   - Automatically skipped during in-place updates, following electron-builder's maintained flow.
3. **Install scope and location**
   - Prefer current-user installation to avoid unnecessary administrator friction.
   - During implementation, explicitly decide whether to keep the current user/all-users choice
     or force current-user mode with electron-builder's supported `customInstallMode` macro.
   - Keep the editable install location unless clean-machine testing shows it creates confusion.
4. **Install**
   - Standard native progress; no marketing carousel.
5. **Finish**
   - Keep **Run Chronicle** selected.
   - One sentence: “Create your first project in a minute.”

Do not add AI provider credentials, telemetry choices, account creation, release notes, or a
multi-step tutorial to the installer.

## Proposed in-app tutorial

### Structure

After **Continue local** or successful Google sign-in, first-time users land on Home with a compact
**Getting started · 0/3** card:

1. **Create your first project**
2. **See how versions work**
3. **Set up AI summaries** — visibly optional

The guided tour is dismissible, persists progress, and can be reopened through **Settings → Getting
started → Replay tutorial**. It uses the existing visual language and icons; it is not a separate
onboarding theme.

### Step 1 — Create the first project

- Primary tutorial action opens the existing New Project screen.
- A small callout explains that a project is simply a folder Chronicle watches; originals remain
  where they are.
- The user selects a real folder, reviews detected supported files, and creates the project using
  the existing form.
- Completion is based on a real tracked-folder result, not clicking “Next.”
- If the user already has a project, mark this step complete and offer **Open a project**.

### Step 2 — See versions

- Route to the created Project screen and point to its first asset.
- If the folder already contained a supported file, invite the user to open that asset and show
  the real Timeline.
- If it was empty, say: “Save a supported creative file in this folder. Chronicle will add its
  first version automatically.” Keep the panel waiting on live capture rather than showing a
  spinner.
- On the Timeline, one concise coach mark explains:
  “Each meaningful save becomes a new version. Open any version to inspect or restore it.”
- Mark complete only after the user reaches a real Timeline. Do not manufacture sample history in
  their project.

### Step 3 — Configure an AI provider (optional)

- Explain the boundary before requesting a key:
  local capture/history work without AI; summaries send the required comparison inputs directly
  to the selected provider on the BYOK path.
- Offer two equal-understood exits:
  **Set up AI** and **Maybe later**. “Maybe later” completes/dismisses onboarding without marking
  the provider configured.
- **Set up AI** routes to the existing Settings → AI summaries section and highlights, in order:
  provider, model, saved per-provider key, and **Test connection**.
- Completion derives from the real configured-provider/readiness state and a successful existing
  validation path. Do not duplicate credential fields in the tutorial or expose a stored key.
- End state: “You’re ready. Keep working in your folder—Chronicle handles the history.”

### Behavior and accessibility

- Store a versioned tutorial state such as `chronicle-getting-started-v1`, separate from the
  existing welcome-entry flag. Track `dismissed`, completed real-world steps, and the relevant
  first project ID only; never store paths or keys in renderer local storage.
- Resume at the next incomplete step after restart. If a referenced project was removed, fall back
  to the Projects navigation without an error.
- Every coach mark has **Back**, **Skip tour**, and a visible close action. Escape skips the tour
  without losing completed work.
- Never trap access to the rest of the app, dim the entire workspace into unusability, or depend
  on hover.
- Move keyboard focus into the callout, restore it to the triggering control on close, use a
  logical tab order, and announce real completion via a polite live region.
- Keep motion to a short opacity/transform transition (150–250 ms) and disable it under
  `prefers-reduced-motion`.
- Use actual UI state/events, not timers, to advance. A pending or unavailable AI service is an
  explained state, never a blocker.

## Planned file boundaries

Implementation should be split into two reviewable slices.

### Slice A — Installer trust and legal surface

Expected files:

- `.gitignore` — narrowly unignore the approved static installer resources; the repository's
  current global `build/` rule otherwise hides them while generated sidecar/build outputs must
  remain ignored.
- `apps/desktop/package.json` — declare header/sidebar/license/include paths.
- `apps/desktop/build/installer.nsh` — welcome copy, checkbox mode, and only the smallest required
  NSIS macros.
- `apps/desktop/build/installerHeader.bmp`
- `apps/desktop/build/installerSidebar.bmp`
- `apps/desktop/build/uninstallerSidebar.bmp` (may intentionally reuse the installer art)
- `apps/desktop/build/eula.rtf` or `.html` — only after legal approval.
- Packaging tests/scripts and `apps/desktop/README.md`.

Do not replace electron-builder's full `installer.nsi`.

### Slice B — Contextual first-run tutorial

Expected files:

- a small onboarding state/helper module under `apps/desktop/src/renderer/src/lib/`;
- an accessible `GettingStarted` coach-mark component under
  `apps/desktop/src/renderer/src/components/`;
- integration points in `App.tsx`, Home, New Project, Project/Timeline, and Settings;
- existing renderer style sheets using current semantic tokens;
- focused renderer tests;
- `docs/desktop/overview.md` and `apps/desktop/README.md`.

No C1, C3, or C5 contract change is expected. If implementation discovers that real completion
cannot be observed through existing C1 query/event state, stop and propose that contract change
separately rather than silently expanding POST-07.

## Acceptance plan

### Automated

- Current/stale/malformed legal-acceptance record tests.
- Tutorial state migration/default/dismiss/replay tests.
- Existing-project and no-project entry tests.
- Step completion comes from real folder/timeline/provider state, not button clicks.
- Removed-project recovery and restart/resume tests.
- AI-unavailable and no-key paths leave local capture usable.
- Keyboard focus, Escape, and accessible-name assertions for the coach mark.
- Reduced-motion CSS/behavior coverage where practical.
- Packaging smoke asserts the generated installer contains Chronicle artwork. Once legal text is
  approved, extend it to assert the configured license resource and checkbox gate.

### Clean Windows machine

Record the complete flow at 100% and at least 150% display scaling:

1. Installer shows the correct publisher/product copy and Chronicle artwork without clipping.
2. The license checkbox gates **Next**; decline/cancel does not install.
3. Current-user install does not request elevation; all-users behavior is tested if retained.
4. Custom install path, Start menu entry, desktop shortcut, launch-after-finish, upgrade, and
   uninstall all still work.
5. A new teammate can enter local mode, create a real project, open the first asset Timeline, and
   explain what will happen on the next save.
6. The teammate can configure and test an AI provider, or choose **Maybe later** and still capture
   versions.
7. With the bundled AI service stopped/unhealthy, the tutorial remains usable, capture succeeds,
   and versions clearly remain queued/pending.
8. Restart resumes the next incomplete step; dismiss and replay behave as labeled.

Usability target: a teammate unfamiliar with Chronicle completes project creation and reaches a
real Timeline without verbal help. Record friction, wrong turns, and elapsed time; fix observed
problems rather than optimizing for an arbitrary click count.

## Decisions required before implementation

1. **Legal owner (open):** who approves the EULA/terms, privacy link, entity name, effective date, and
   languages? No approval means ship branded installer work without a license page.
2. **Acceptance control (implemented pending terms):** the requested required checkbox is declared
   in the native include and activates when the approved license file is configured.
3. **Install scope (implemented):** current user, avoiding unnecessary UAC friction.
4. **Artwork (implemented):** restrained light header and dark sidebar derived from the current
   Chronicle mark.
5. **Tutorial entry (implemented):** automatic anchored coach-mark tour for new installations,
   real highlighted controls, optional AI, and Settings replay; no forced full-screen slideshow.

## Explicit non-goals

- A fully custom HTML/React `.exe` installer.
- Replacing NSIS, changing auto-update architecture, or adding code signing (POST-08 owns those).
- Account setup or AI credentials inside the installer.
- Making AI mandatory for first-run completion.
- New renderer/main/AI contracts.
- Sample projects silently copied into a user's library.
- Writing legal terms without human review.
