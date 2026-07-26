# POST-08 — Windows publishing and auto-update plan

> Planned 2026-07-26 · revised 2026-07-26 for security enforcement · Windows x64 only ·
> GitHub Releases · unsigned bootstrap

## Outcome

Chronicle's public Windows NSIS installer will check the public GitHub Releases feed without
blocking startup, download a newer release in the background, show progress in the app, and apply
the downloaded update only when the user chooses **Restart to update**.

The existing pipeline already publishes versioned Windows and macOS installers. POST-08 adds the
missing Windows update metadata, installed-client behavior, and two-release acceptance evidence.
It does not add a new server.

## Current baseline and gaps

- `apps/desktop/package.json` is already the authored desktop version source.
- Release Please already creates public `vX.Y.Z` releases from reviewed `main`.
- `.github/workflows/release.yml` already builds the exact tag and uploads
  `Chronicle-Setup-X.Y.Z.exe` plus a SHA-256 checksum.
- The latest public release inspected on 2026-07-26 was `v0.9.0`. It contained the Windows
  installer, macOS DMG, and checksum files, but no `latest.yml` or updater blockmap.
- `electron-updater` is not installed and there is no update check, state model, IPC surface, or
  renderer affordance.
- Builds through `v0.9.0` cannot discover an update retroactively. The first updater-capable
  release is a one-time manual-install bootstrap; the next higher release proves auto-update.

## Decisions and non-goals

1. **Use the existing public GitHub repository as the feed.** Configure electron-builder's GitHub
   publisher explicitly for `Santi-49/Chronicle`; do not rely on the redirected local Git remote or
   a token on the installed machine.
2. **Windows x64, stable channel, NSIS only.** Run the updater only when
   `process.platform === "win32"` and `app.isPackaged`. Development, unpacked builds, macOS, and
   Linux return an `unsupported` state and make no update request.
3. **Download automatically; install explicitly.** A discovered release may download in the
   background, but set `autoInstallOnAppQuit = false`. Apply it only from a visible
   **Restart to update** action using `quitAndInstall`. This avoids surprising installation during
   an ordinary quit or an operating-system shutdown.
4. **Stay unsigned only for the bootstrap updater, not for mandatory security enforcement.**
   HTTPS plus the SHA-512 value in `latest.yml` detects corruption, but it is not an independent
   publisher identity. SmartScreen warnings and repository/token compromise remain risks.
   POST-08 may ship optional/recommended updates unsigned, but production `required` or `revoked`
   enforcement must remain disabled until Windows artifacts are Authenticode-signed and the
   security policy has an independently verifiable signature. macOS auto-update stays disabled
   until signing/notarization.
5. **No content or account data in update requests.** The app sends no Chronicle project, path,
   file, key, account, or telemetry payload. GitHub/CDN still receives ordinary connection
   metadata such as IP address and user agent, which documentation should describe accurately.
6. **No downgrade rollback.** `allowDowngrade` remains false. If a published release is bad, ship a
   higher patch version; deleting or replacing a release is not a safe rollback for clients that
   already installed it.
7. **Never hold local creative history hostage.** A security restriction may disable the affected
   network, AI, import, capture, or mutation capability, but the user must retain read-only access,
   export, backup, and restore of existing local data. Only a demonstrated local data-integrity
   vulnerability may place the library in read-only safe mode.

## Mandatory security-update policy

`electron-updater` discovers and installs newer releases; it does not provide Chronicle with a
trusted “minimum supported app version” or mandatory-update policy. `minimumSystemVersion` is the
minimum operating-system kernel version, not the minimum Chronicle version. Chronicle therefore
needs a small security policy evaluated separately from `latest.yml`.

### Enforcement levels

| Level | Intended use | Client behavior |
|---|---|---|
| `optional` | Normal feature release | Current dismissible banner and explicit restart |
| `recommended` | Important reliability or low-risk security fix | Persistent reminder; app remains usable |
| `required` | Known vulnerability with a remediation deadline | Countdown before the deadline; afterward enter capability-scoped restricted mode |
| `revoked` | Actively exploited or compromised release/range | Enter capability-scoped restricted mode immediately after verifying fresh policy |

The policy identifies vulnerable version ranges rather than marking one release with a boolean.
At minimum it contains a schema version, monotonically increasing policy version, affected
platform/architecture, vulnerable semver range, minimum safe version, enforcement level,
effective/deadline time, affected capability codes, reason/advisory URL, issued/expiry times, and
signature/key identifier. It must not contain arbitrary HTML, executable commands, feed
credentials, or installer paths.

### Trust and recovery rules

- Verify policy before use against a public key embedded in an earlier trusted client. Reject
  invalid, expired, unsupported-schema, or lower-version policy to prevent tampering, freeze, and
  rollback behavior. Keep only the last verified policy in device-local storage.
- Keep policy signing independent from the GitHub release credential. A stolen release token must
  not be sufficient to both publish a malicious installer and order clients to install it.
- Authenticode-sign and timestamp every Windows installer with a stable publisher identity, keep
  electron-updater's Windows signature verification enabled, and verify the expected publisher.
- Store policy signing material outside CI's ordinary release token; document rotation and
  emergency revocation. Prefer a maintained signed-metadata implementation over inventing a
  cryptographic format. Evaluate TUF-compatible metadata before activation; if that is too heavy,
  use a reviewed detached-signature format with equivalent version/expiry/rollback tests.
- Recover from a bad or vulnerable release only by publishing a higher safe version and a newer
  signed policy. Never replace an existing release in place and never require a downgrade.

### Offline and local-first behavior

- A fresh verified `required`/`revoked` policy can be enforced from cache while offline. If the app
  has never received a verified policy, or the cached policy has expired, it must not invent a
  hard block. Show that security status cannot be refreshed and preserve local read/export/restore.
- The control plane independently rejects vulnerable clients from affected online endpoints using
  its own minimum-version rule and returns a typed “client update required” response. This protects
  Chronicle-operated services even when a client has not received the policy; it does not affect
  local mode.
- Restricted mode is capability-scoped. Examples: disable gateway/BYOK AI calls for an
  input-exfiltration issue, disable archive import for a parser issue, or make the library
  read-only for a proven storage-corruption issue. Do not use a blanket launch lock by default.
- The prompt names the affected capability, minimum safe version, reason, and remediation. It
  offers **Update now**, **Retry**, and local **Export/backup** where relevant. A required update
  cannot be dismissed after its deadline, but update failure must not strand local data.

### Activation gate

Mandatory enforcement is split from the unsigned updater bootstrap:

1. **POST-08A — updater baseline:** publish metadata, optional/recommended UX, and the genuine
   installed vA → vB path. No hard restriction can be remotely activated.
2. **POST-08B — trust foundation:** choose and provision the Windows signing identity; sign and
   timestamp installers; verify publisher signatures; introduce signed, versioned, expiring
   security-policy metadata and key-rotation/runbook controls.
3. **POST-08C — enforcement:** implement the pure policy evaluator, capability restrictions,
   cached/offline behavior, control-plane minimum-version responses, accessibility, and emergency
   drills. Activate `required`/`revoked` only after two signed upgrade releases pass acceptance.

The existing app-version distribution metric and adoption chart show whether installations move
to the safe release using already-collected telemetry. This plan adds no update event, mandatory
prompt, or per-device telemetry.

## Contract gate

The present task says both “do not edit C1” and “show update progress/restart in the renderer.”
Those requirements cannot both hold while context isolation remains intact. Before implementation,
approve one narrow TypeScript contract change in `apps/desktop/src/shared/ipc.ts`:

```ts
type UpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"

interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  availableVersion: string | null
  percent: number | null
  checkedAt: string | null
}

getUpdateState(): Promise<UpdateState>
checkForUpdates(): Promise<UpdateState>
restartToUpdate(): Promise<void>
updateStateChanged: UpdateState
```

The contract exposes no feed URL, token, downloaded path, raw updater error, or arbitrary IPC
channel. Automatic offline failures return to `idle` and are recorded locally; an explicit
**Check now** action may show a short sanitized “could not check” result without making normal app
status look offline. If the team insists that C1 stay byte-for-byte fixed, define the same shapes
in a separate `src/shared/updates.ts` bridge; never expose `ipcRenderer` directly.

## Implementation sequence

### 1. Make release artifacts update-capable

Files:

- `apps/desktop/package.json`
- `apps/desktop/package-lock.json`
- `.github/workflows/release.yml`
- optionally `scripts/check_windows_update_assets.py`

Work:

- Add the current stable `electron-updater` as a production dependency.
- Add canonical repository metadata and explicit electron-builder `publish` configuration for the
  public GitHub repository.
- Keep the normal local `package:windows` command non-publishing.
- Add a release-only command using `electron-builder --publish always`; provide `GH_TOKEN` only in
  the tagged Windows release job.
- Let electron-builder publish the installer, `latest.yml`, and every generated updater artifact
  from the same build. Keep the human-friendly SHA-256 checksum upload.
- Remove the duplicate manual upload of any asset electron-builder now owns.
- Fail the release job unless:
  - exactly one Windows installer and one `latest.yml` exist;
  - `latest.yml.version` equals `package.json` and the Git tag;
  - every file named by `latest.yml` exists as a release asset;
  - the metadata's SHA-512 matches the uploaded installer;
  - the GitHub release is public, non-prerelease, and marked latest after uploads complete.
- Keep snapshot packaging non-publishing. It may archive `latest.yml` for inspection, but it must
  never move the public stable feed.

Release Please currently publishes the GitHub release before platform assets finish. That creates
a short window where the latest release has no update metadata. It is acceptable for the first
iteration because checks fail softly and the asset assertion makes a broken release visible. A
later hardening task may create a draft, verify every platform asset, then publish atomically; do
not mix that workflow redesign into the updater MVP.

### 2. Implement a main-process update controller

Files:

- `apps/desktop/src/main/updater/controller.ts`
- `apps/desktop/src/main/updater/controller.test.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/ipc/register.ts` and the approved typed contract/channel files

Work:

- Wrap the library-native updater in a small controller with injected clock/updater dependencies
  so lifecycle behavior is unit-testable without a network or installer.
- Use the library-generated `app-update.yml`; do not call `setFeedURL`.
- Register listeners before checking: `checking-for-update`, `update-available`,
  `update-not-available`, `download-progress`, `update-downloaded`, and `error`.
- Start one non-awaited check after the main window is ready. Debounce concurrent checks and offer
  a renderer-triggered **Check now**. A modest periodic recheck (for example every four hours while
  open) is optional but should use the same single-flight path.
- Set `autoDownload = true`, `autoInstallOnAppQuit = false`, `allowDowngrade = false`, and do not
  enable prereleases.
- Reduce progress event frequency before sending it to React.
- Sanitize/log failures locally without feed URLs, tokens, paths, or stack dumps in the normal UI.
  Network/DNS/404 failures from the automatic check must not surface globally or affect capture,
  timeline, restore, search, AI jobs, or account state.
- Permit `restartToUpdate` only in `ready`; make repeated calls idempotent. Ensure the regular
  watcher/sidecar shutdown path is not treated as a crash when `quitAndInstall` closes the app.

### 3. Add accessible, non-blocking update UX

Files:

- `apps/desktop/src/renderer/src/lib/useUpdates.ts`
- `apps/desktop/src/renderer/src/components/UpdateBanner.tsx` and focused tests
- `apps/desktop/src/renderer/src/App.tsx` or `components/AppShell.tsx`
- `apps/desktop/src/renderer/src/screens/SettingsScreen.tsx`
- `apps/desktop/src/renderer/src/assets/main.css`

Work:

- Mount one global update affordance inside the normal shell:
  - `available`: “Chronicle X.Y.Z is available”;
  - `downloading`: progress with accessible text, not color alone;
  - `ready`: **Restart to update** and **Later**;
  - automatic check failures: no banner.
- Keep the banner dismissible for the session without cancelling the download.
- Add **Settings → About** with current version, last-check time, state, and **Check now**.
  Explicit failures may appear inline with Retry.
- Restore focus sensibly if the banner disappears, honor reduced motion, and use a polite live
  region. Never interrupt onboarding or cover native window controls.

### 4. Verify packaging and the real upgrade path

Automated checks:

- controller transitions, single-flight checking, unsupported/dev behavior, throttled progress,
  silent automatic errors, explicit error feedback, and guarded restart;
- contract/channel coverage and trusted-sender enforcement;
- renderer states and keyboard/screen-reader labels;
- desktop suite, typecheck, production build, sidecar smoke, and existing MVP-12 acceptance;
- packaged resource inspection for `resources/app-update.yml`;
- release validation for `latest.yml`, installer, referenced artifacts, version, and hashes.

Windows clean-profile matrix:

1. Publish updater-capable baseline `vA`; download and install it manually. Record the expected
   SmartScreen warning, assisted/current-user install, custom directory, shortcuts, sidecar health,
   local capture, and `vA` in Settings.
2. With `vA` running, publish higher stable `vB` through the normal Release Please path.
3. Confirm `vA` detects `vB`, continues capturing while downloading, shows progress, and reaches
   `ready`.
4. Choose **Later**; confirm the app remains usable and an ordinary quit does not install.
5. Relaunch, choose **Restart to update**, and confirm the same install location, shortcuts,
   projects, database, version library, encrypted provider configuration, and onboarding/legal
   state survive.
6. Confirm Settings and `app.getVersion()` report `vB`, the app captures a new version, and no
   second update is offered.
7. Repeat with the network blocked at launch, during download, and after reconnect. Local
   capture/timeline/restore must remain normal and a later check must recover.
8. Verify the GitHub installer and `latest.yml` against release hashes. Record release URLs,
   versions, Windows version, and results in the acceptance evidence.

Mandatory-update acceptance is additional and cannot be satisfied by the unsigned vA → vB test:

9. With signed test releases, prove valid `recommended`, future-dated `required`, expired-policy,
   rollback-policy, invalid-signature, and immediate `revoked` fixtures.
10. Confirm only the named capability is restricted, local read/export/restore survives, policy
    cache behavior is deterministic offline, and an unavailable feed offers retry without a
    dead-end screen.
11. Compromise-drill the GitHub release credential: an installer with the wrong publisher and an
    unsigned/incorrectly signed enforcement policy must both be rejected.
12. Confirm the control plane rejects only affected online operations from vulnerable versions,
    while a safe version succeeds and local-only use never depends on that service.

## Documentation and handoff

Update:

- `apps/desktop/README.md`: user behavior, Check now, release command, `GH_TOKEN` scope, generated
  assets, offline behavior, bootstrap install, and unsigned limitations.
- `docs/releasing.md`: tagged publishing flow, asset assertion, two-release acceptance,
  higher-version hotfix rollback, and future certificate migration.
- `docs/desktop/overview.md`: global banner and Settings → About behavior.
- `PROJECT_STATUS.md` and `TODO.md`: only after the real vA → vB acceptance passes.
- `docs/bob-log.md`: one concrete IBM Bob usage line in the implementation PR.

## Done when

- A tagged stable release contains the installer, `latest.yml`, and all metadata-referenced assets
  produced together from that tag.
- An older updater-capable installed Windows build detects, downloads, and applies a higher release
  through **Restart to update**.
- Local data, install choices, and core workflows survive the update.
- Launch and core use remain normal with no network.
- Bootstrap limitations, ordinary GitHub connection metadata, SmartScreen, unsigned-update trust,
  hotfix rollback, Windows signing migration, mandatory-enforcement activation gates, restricted
  mode/local-data guarantees, and disabled macOS auto-update are documented.
- Tests, package/resource checks, and the clean-profile matrix are attached to the PR or release
  evidence.
