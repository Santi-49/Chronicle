# Chronicle versions, CI, and releases

## Independent versions

Chronicle does not force unrelated deployables into one version number.

| Component | Source of truth | Compatibility meaning |
|---|---|---|
| Desktop product/installer | `apps/desktop/package.json` | User-visible application release |
| Local AI service | `services/ai/pyproject.toml` | Internal sidecar implementation release |
| Control plane | `services/api/pyproject.toml` | Independently deployed backend release |
| HTTP `/api/v1` prefix | `services/api/app/api/v1/router.py` | API compatibility generation, changed only for an intentional breaking HTTP contract |
| Settings, envelope, notice, and database schema versions | Their native schemas/migrations | Data compatibility; never synchronized with product SemVer |

Python runtime versions come from installed distribution metadata, with the adjacent
`pyproject.toml` as the source-tree fallback. Generated OpenAPI documents carry their service's
version. `python scripts/check_versions.py` rejects manifest/lock/contract drift.

FastAPI and Pydantic are exact-pinned in both Python services because their patch/minor releases
can change generated OpenAPI even when Chronicle's own schemas do not change. Upgrade that pair in
one reviewed PR, regenerate both contracts, inspect the semantic diff, and run both service and
desktop test suites before merging.

## Desktop SemVer policy

Before `1.0.0`:

- `fix:` increments patch (`0.1.0` → `0.1.1`).
- `feat:` increments minor (`0.1.1` → `0.2.0`).
- `feat!`, `fix!`, or a `BREAKING CHANGE:` footer increments minor while the product remains
  pre-1.0 (`0.2.0` → `0.3.0`).
- `docs:`, `test:`, `ci:`, `chore:`, and `refactor:` do not release unless they contain an
  explicit breaking footer or are manually included in the release PR.

After `1.0.0`, a breaking change increments major. The team deliberately chooses the first
stable `1.0.0`; automation must not infer product maturity.

Release Please reads Conventional Commit history and maintains the version/changelog PR. Its
`bump-minor-pre-major` setting implements the pre-1.0 breaking policy. The release PR is reviewed
like any other `main` PR; no workflow writes a version directly onto `main`.

## GitHub Actions flow

1. `.github/workflows/ci.yml` runs **only** for pull requests whose base is `main`. Configure its
   three jobs as required branch-protection checks. PRs to `dev` do not run required CI.
2. A merge to `main` runs `release.yml`. Release Please creates or updates a release PR from merged
   Conventional Commits.
3. Release Please PRs carrying its `autorelease: pending` label retain the required
   `Desktop (Windows)` check, but run only the version consistency guard. The AI and control-plane
   jobs are skipped successfully because the bot PR changes release metadata rather than
   implementation or contracts. Ordinary PRs still run all three complete jobs; a lookalike branch
   without the Release Please label also receives the full suite.
4. `auto-merge-main.yml` enables squash auto-merge for the exact same-repository `dev → main`
   promotion and for the labeled Release Please PR. GitHub merges each only after protected-main
   requirements pass. The release branch is then deleted; the persistent `dev` branch is never a
   cleanup target.
5. Merging the release PR creates `vX.Y.Z`. Parallel Windows x64 and macOS Apple Silicon jobs
   check that the tag equals the desktop `package.json` version, rebuild that exact tagged commit,
   health-check each native sidecar, and attach the NSIS/DMG installers plus checksums to the
   GitHub Release.

Repository setup:

- Protect `main` and require the three **Main PR CI** jobs. For the zero-touch solo flow, use zero
  required approvals; teams that require human approval keep that manual gate.
- Add repository Actions variable `CHRONICLE_CONTROL_PLANE_URL` with the deployed API origin
  (for example, `https://chronicle-api.quick2query.com`) and repository Actions variable
  `GOOGLE_OAUTH_CLIENT_ID` with the public Google Desktop OAuth client ID. Release builds embed
  both values and fail before packaging if either is absent. Do not add the client secret.
- Add a fine-grained `RELEASE_PLEASE_TOKEN` secret with Contents and Pull requests write access.
  A PAT is necessary because resources created with the built-in `GITHUB_TOKEN` do not trigger the
  required PR workflow.
- Allow GitHub Actions to create pull requests.
- Keep direct pushes to `main` disabled.

Every ordinary `main` PR proves that the application builds, but the expensive native installers
are built only once for a durable version tag. `package-main.yml` remains available through
**Actions → Package desktop snapshot → Run workflow** when intermediate Windows x64 and macOS
Apple Silicon installers are genuinely needed. POST-08 still owns `electron-updater`, update
metadata/UI, code signing, Apple notarization, and macOS auto-update.

## One-time GitHub setup (repository administrator)

1. Push this branch so GitHub can discover the workflows and their check names.
2. In **Settings → Secrets and variables → Actions**, create the repository secret
   `RELEASE_PLEASE_TOKEN`. Use a fine-grained PAT limited to this repository with Contents,
   Pull requests, and Issues read/write permissions. The token owner must be allowed to create
   pull requests in the repository.
3. In **Settings → Actions → General → Workflow permissions**, select **Read and write
   permissions** and enable **Allow GitHub Actions to create and approve pull requests**.
4. In **Settings → General → Pull Requests**, enable **Allow squash merging** and
   **Allow auto-merge**. Do not enable global automatic head-branch deletion: Chronicle deletes
   only Release Please branches, avoiding any chance of deleting persistent `dev`.
5. In **Settings → Rules → Rulesets**, create an active branch ruleset named `Protect main` whose
   target is the exact branch `main`.
6. Enable **Require a pull request before merging**, set required approvals to **0** for the
   zero-touch solo workflow, block force pushes and deletions, and do not grant routine bypass
   access. With one required approval, automation will safely wait for a human approval instead.
7. Enable **Require status checks to pass** and select these checks after they have run once:
   `Desktop (Windows)`, `AI service and C3 contract`, and `Control plane and C6 contract`.
8. Do not select checks from `Package desktop snapshot`, `Release desktop`, or
   `Auto-merge main promotion`: they coordinate after/beside the protected checks and must not gate
   themselves. Workflows that merge use the existing `RELEASE_PLEASE_TOKEN`, ensuring their pushes
   can trigger the next release workflow. Do not enable GitHub's merge queue unless the workflows
   also gain a `merge_group` trigger.

The ruleset applies only to `main`. There is intentionally no required CI ruleset for `dev`.

## Merging development into main

The normal promotion flow is:

1. Merge feature branches into `dev` after review.
2. Open one PR with base `main` and compare `dev`. Its title must start with `feat:` or `fix:`
   (optionally scoped or breaking), because the workflow squash-merges that title and Release Please
   uses it to determine the next version.
3. `Auto-merge main promotion` enables auto-merge. All three **Main PR CI** jobs must pass; a
   failure leaves the PR open. Fix failures on `dev`, never directly on `main`.
4. After the checks pass, GitHub merges the promotion, Release Please opens its metadata PR, the
   lightweight guard passes, and GitHub merges that PR automatically.
5. `Release desktop` creates the version/tag/release, attaches both installers/checksums, and the
   cleanup job removes the temporary release branch. No second PR action is required.

## Creating a new public version

Do not edit `apps/desktop/package.json`, create a tag, or draft a GitHub Release manually during
the normal flow.

1. Release Please creates `chore(main): release ...` after the development promotion lands.
2. The lightweight `Desktop (Windows)` version guard runs while the implementation jobs appear as
   successful skips. Auto-merge waits if any protected requirement is not satisfied.
3. After automatic merge, Release Please creates `vX.Y.Z` and the GitHub Release. `Release desktop`
   then rebuilds the exact tag, verifies it matches `package.json`, and attaches the Windows x64
   NSIS and macOS Apple Silicon DMG with platform-specific checksum files.
4. Download the installer for each supported platform, verify its checksum, and complete the
   release smoke test before sharing the URL.

For an exceptional forced version, use Release Please's documented `Release-As: X.Y.Z` commit
footer and review the resulting release PR. Do not change the manifest and package version by hand.

## Packaged AI providers

Both native sidecars bundle **Google Gemini, OpenAI, and Anthropic Claude**. Their packaging smoke
test imports every shipped integration from the frozen executable before probing `/health`.
Anthropic remains annotation-only because it does not expose an embeddings API. Amazon Bedrock was
removed from the catalog because Chronicle's per-provider secret currently stores one API key,
while AWS authentication requires a credential set and region. IBM watsonx remains a development
extra rather than an installed provider.

## Local release verification

```powershell
python -m pip install -e "services/ai[dev,providers,bundle]"
npm ci --prefix apps/desktop
python scripts/check_versions.py
python scripts/mvp12_acceptance.py --package
```

The build script creates and reuses an isolated environment under
`apps/desktop/build/sidecar-venv/`. To override it, set `CHRONICLE_SIDECAR_PYTHON` to a clean
Python 3.12+ environment containing `services/ai[providers,bundle]`. CI uses Python 3.12.

For local iteration, `make package-unpacked` builds a runnable `dist/win-unpacked/` tree without
compressing an NSIS installer. `make package` remains the release-equivalent check. A clean measured
warm multi-provider build spent 6.5 seconds freezing the cached sidecar and about 7 seconds in Vite;
most of its 255.7-second total was Electron staging and NSIS creation, not collection of global
Python packages. The unpacked target took 177.7 seconds. electron-builder's native rebuild is
disabled because `npm ci` already runs the pinned Electron rebuild in `postinstall`.

Both installers are currently unsigned. Windows may trigger SmartScreen; macOS Gatekeeper may
block normal launch until the user explicitly overrides it. Do not describe a workflow artifact
as signed, notarized, or auto-updating.
