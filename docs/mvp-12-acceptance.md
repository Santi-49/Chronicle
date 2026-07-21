# MVP-12 Windows acceptance record

Use this record on the clean Windows demo machine after the automated gate passes. Repeat the
journey three consecutive times without clearing Chronicle data between restart checks.

## Automated gate

```powershell
python -m pip install -e "services/ai[dev,google,bundle]"
python -m pip install -e "services/api[dev]"
npm ci --prefix apps/desktop
python scripts/mvp12_acceptance.py --package
```

## Manual journey — repeat three times

| Check | Pass 1 | Pass 2 | Pass 3 |
|---|---|---|---|
| Install the generated NSIS package on a machine without repository Python | ☐ | ☐ | ☐ |
| Start with Docker/control plane stopped; Continue local remains available | ☐ | ☐ | ☐ |
| Reset `demo-assets/workspace`, add it as a project, and capture three distinct saves | ☐ | ☐ | ☐ |
| AI first-version and diff summaries finish with the approved demo provider | ☐ | ☐ | ☐ |
| Timeline and keyboard navigation open all three versions | ☐ | ☐ | ☐ |
| Keyword and meaning-based searches find the expected demo version | ☐ | ☐ | ☐ |
| Restore v2; working bytes change and a provenance-marked new version appears | ☐ | ☐ | ☐ |
| Restart Chronicle; projects, history, search, settings, and queued jobs persist | ☐ | ☐ | ☐ |
| Disconnect network, save, observe pending AI, reconnect, and observe queue drain | ☐ | ☐ | ☐ |
| Force one provider failure, observe failed state, correct it, and Retry AI | ☐ | ☐ | ☐ |
| A file over 50 MB is skipped with visible status and no captured version | ☐ | ☐ | ☐ |
| Delete a tracked source; stored versions remain and Save a copy works | ☐ | ☐ | ☐ |
| No critical Electron console errors or unexpected visible Python window | ☐ | ☐ | ☐ |

Record the installer filename, commit, Windows version, editor used, provider/model, and any
known limitation below. Do not mark MVP-12 complete until every cell passes.

## Evidence

- Commit:
- Installer:
- Windows version:
- Demo editor:
- Provider/model:
- Pass dates/times:
- Known limitations:
