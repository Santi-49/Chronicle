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
