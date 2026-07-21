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
2. A merge to `main` runs `package-main.yml`: Windows builds the Gemini sidecar, type-safe Electron
   bundle, NSIS installer, health smoke, and SHA-256 checksum, then retains them as a 30-day
   workflow artifact.
3. The same merge runs `release.yml`. Release Please creates or updates a release PR from merged
   Conventional Commits.
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

Every `main` commit is buildable, but only a reviewed release PR produces a durable version tag.
The action attaches release files; POST-08 still owns `electron-updater`, `latest.yml`, update UI,
code signing, and macOS publication.

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
5. Check the **Actions** tab. `Package main` should upload an installable workflow artifact, while
   `Release desktop` creates or refreshes the Release Please PR.

## Creating a new public version

Do not edit `apps/desktop/package.json`, create a tag, or draft a GitHub Release manually during
the normal flow.

1. Review the automated `chore(main): release ...` PR. Confirm its proposed version and changelog.
2. Let the same three PR checks pass, approve it, and merge it into `main`.
3. Release Please creates `vX.Y.Z` and the GitHub Release. `Release desktop` then rebuilds the exact
   tag, verifies it matches `package.json`, and attaches the Windows installer and checksum.
4. Download the installer from the Release, verify the checksum, and complete the release smoke
   test before sharing the URL.

For an exceptional forced version, use Release Please's documented `Release-As: X.Y.Z` commit
footer and review the resulting release PR. Do not change the manifest and package version by hand.

## Packaged AI providers

The MVP Windows sidecar bundles **Google Gemini only**. The source service also supports LangChain
extras for OpenAI, Anthropic, and IBM watsonx in development, but those packages and PyInstaller
hooks are not in the installer. Amazon Bedrock appears in the UI catalog through LangChain's AWS
integration but likewise is not packaged. Adding a provider requires installing its Python extra,
adding its PyInstaller metadata/hidden imports, and running a real provider plus clean-machine
installer smoke test before the UI may promise installed support.

## Local release verification

```powershell
python -m pip install -e "services/ai[dev,google,bundle]"
npm ci --prefix apps/desktop
python scripts/check_versions.py
python scripts/mvp12_acceptance.py --package
```

On a polluted developer Python installation, set `CHRONICLE_SIDECAR_PYTHON` to a clean Python
3.12 environment containing `services/ai[google,bundle]`. CI uses a clean Python 3.12 runner.

The Windows installer is currently unsigned and may trigger SmartScreen. Do not describe a
workflow artifact as a signed or auto-updating production release.
