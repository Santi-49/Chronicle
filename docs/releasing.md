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
4. Merging the release PR creates `vX.Y.Z`. The workflow checks the tag equals the desktop
   `package.json` version, rebuilds that exact tagged commit, health-checks the sidecar, and attaches
   the installer/checksum to the GitHub Release.

Repository setup:

- Protect `main`; require review and the three **Main PR CI** jobs.
- Add a fine-grained `RELEASE_PLEASE_TOKEN` secret with Contents and Pull requests write access.
  A PAT is necessary because resources created with the built-in `GITHUB_TOKEN` do not trigger the
  required PR workflow.
- Allow GitHub Actions to create pull requests.
- Keep direct pushes to `main` disabled.

Every ordinary `main` PR proves that the application builds, but the expensive Windows installer is
built only once for a durable version tag. `package-main.yml` remains available through
**Actions → Package Windows snapshot → Run workflow** when an intermediate installer is genuinely
needed. The release action attaches release files; POST-08 still owns `electron-updater`,
`latest.yml`, update UI, code signing, and macOS publication.

## One-time GitHub setup (repository administrator)

1. Push this branch so GitHub can discover the workflows and their check names.
2. In **Settings → Secrets and variables → Actions**, create the repository secret
   `RELEASE_PLEASE_TOKEN`. Use a fine-grained PAT limited to this repository with Contents,
   Pull requests, and Issues read/write permissions. The token owner must be allowed to create
   pull requests in the repository.
3. In **Settings → Actions → General → Workflow permissions**, select **Read and write
   permissions** and enable **Allow GitHub Actions to create and approve pull requests**.
4. In **Settings → Rules → Rulesets**, create an active branch ruleset named `Protect main` whose
   target is the exact branch `main`.
5. Enable **Require a pull request before merging**, require at least one approval, block force
   pushes and deletions, and do not grant routine bypass access.
6. Enable **Require status checks to pass** and select these checks after they have run once:
   `Desktop (Windows)`, `AI service and C3 contract`, and `Control plane and C6 contract`.
7. Do not select checks from `Package main` or `Release desktop`: those run after merge and cannot
   gate the PR. Do not enable GitHub's merge queue unless the workflow also gains a `merge_group`
   trigger.

The ruleset applies only to `main`. There is intentionally no required CI ruleset for `dev`.

## Merging development into main

The normal promotion flow is:

1. Merge feature branches into `dev` after review.
2. Open one PR with base `main` and compare `dev`. For the initial MVP-12 rollout, the current
   feature branch may be used as the compare branch because it is based on `dev` and therefore
   promotes the same accumulated development history.
3. Wait for all three **Main PR CI** jobs and the human review. Resolve failures on the compare
   branch; never push a fix directly to `main`.
4. Squash-merge or merge the PR. Preserve a Conventional Commit title such as `feat: ...` or
   `fix: ...`, because Release Please determines the next desktop version from commits on `main`.
5. Check the **Actions** tab. `Release desktop` should create or refresh the Release Please PR.
   Do not run the manual snapshot packager unless someone needs to test an intermediate installer.

## Creating a new public version

Do not edit `apps/desktop/package.json`, create a tag, or draft a GitHub Release manually during
the normal flow.

1. Review the automated `chore(main): release ...` PR. Confirm its proposed version and changelog.
2. Wait for the lightweight `Desktop (Windows)` version guard; the implementation jobs appear as
   successful skips. Approve and merge the release PR into `main`.
3. Release Please creates `vX.Y.Z` and the GitHub Release. `Release desktop` then rebuilds the exact
   tag, verifies it matches `package.json`, and attaches the Windows installer and checksum.
4. Download the installer from the Release, verify the checksum, and complete the release smoke
   test before sharing the URL.

For an exceptional forced version, use Release Please's documented `Release-As: X.Y.Z` commit
footer and review the resulting release PR. Do not change the manifest and package version by hand.

## Packaged AI providers

The Windows sidecar bundles **Google Gemini, OpenAI, and Anthropic Claude**. Its packaging smoke
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

The Windows installer is currently unsigned and may trigger SmartScreen. Do not describe a
workflow artifact as a signed or auto-updating production release.
