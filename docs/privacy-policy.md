# Chronicle privacy and GDPR implementation record

> Effective: 2026-07-25 · Public notice:
> [chronicle.quick2query.com/privacy](https://chronicle.quick2query.com/privacy/)

This document records the processing decisions implemented in Chronicle. It is an engineering
and accountability record, not legal advice. A qualified reviewer must approve the controller
identity, contact details, international-transfer arrangements, processor agreements, and the
legitimate-interests assessments before production launch.

## Data-flow inventory and lawful bases

| Operation | Data and destination | Lawful basis selected | User control |
|---|---|---|---|
| Local capture/history/search | Creative files, paths, versions, annotations, and indexes remain on the device | Outside Chronicle control-plane processing; performed at the user's request | Delete project/history separately in Projects |
| Minimal installation registration | Random UUID, app version, OS family, first/last seen; Chronicle control plane | GDPR Art. 6(1)(f), legitimate interests in operating, securing, and measuring installations | Export/erase from Settings; anonymous IDs expire after 400 inactive days |
| Usage reporting | Content-free counts, provider/model outcomes, sanitized failures, and coarse edge-derived location; Chronicle control plane | GDPR Art. 6(1)(f), legitimate interests, subject to the LIA below | Default-enabled reporting is disclosed honestly; one-click objection/withdrawal stops delivery, clears the queue, and enables installation erasure |
| Account and Google identity | Email, name, stable Google subject, Chronicle sessions | GDPR Art. 6(1)(b), requested account/authentication service | Optional sign-in; export and permanent self-service erasure |
| Portable settings sync | Appearance, AI choices, sync/reporting preferences | GDPR Art. 6(1)(b), requested sync service | Independent signed-in switch |
| Encrypted-key sync | Opaque passphrase-encrypted envelope only | GDPR Art. 6(1)(b), requested sync service | Off by default; independent enable/save/restore/delete; passphrase and plaintext keys never reach Chronicle |
| BYOK AI inference | Task-required image/text inputs go directly from the local AI service to the selected provider | GDPR Art. 6(1)(b), user-requested AI operation; provider terms and transfer basis also apply | AI is optional; remove the local key or leave jobs queued |
| Service security logs | Minimum request/operational data held by infrastructure | GDPR Art. 6(1)(f), service security and abuse prevention | Access/objection request; production infrastructure must follow the same retention schedule |

No special-category data is intentionally collected. Creative data can nevertheless contain
personal or sensitive information, which is why Chronicle never uploads the version library and
sends task inputs to an AI provider only when the user configures and invokes AI.

## Legitimate-interests assessment

Purpose: operate and secure the optional service, distinguish installations from accounts, find
reliability problems, and understand content-free product adoption.

Necessity: the random installation ID is required to make retry-safe registration and aggregate
usage records. Chronicle excludes hardware IDs, raw IP, names, paths, content, summaries, tags,
embeddings, search text, credentials, and exact file metadata. Less intrusive aggregate-only
analytics cannot support retry-safe opt-out erasure or installation-level reliability analysis.

Balance: users may reasonably expect disclosed operational measurement, but persistent IDs and
coarse location remain pseudonymous personal data. Chronicle mitigates this with plain-language
notice, separate controls, no advertising/profiling, strict field allowlists, short raw retention,
export and erasure, and immediate objection through the reporting toggle. This assessment must be
revisited if fields, purposes, recipients, defaults, or audiences change. If legal review rejects
legitimate interests, reporting must become affirmative opt-in before production; a default-on
toggle cannot be relabeled as consent.

## Retention implemented by the API

Retention cleanup runs during telemetry ingestion and installation registration. Environment
settings may shorten these periods:

| Data | Default maximum |
|---|---:|
| Raw sessions, project-removal records, sanitized errors | 90 days |
| Hourly usage/AI rollups used for aggregate reporting | 400 days |
| Current installation/project inventory snapshots | 30 days |
| Anonymous preference-audit records | 400 days |
| Anonymous installation registration after last activity | 400 days |
| Account, identity, settings, linked installations, and current encrypted envelope | Active account lifetime; immediate self-service erasure |
| Chronicle JWT access/refresh sessions | 30 minutes / 7 days; revoked on logout or account erasure |
| Local creative history | Until the user separately deletes project/history or app data |

There is no separately persisted all-time aggregate table. Admin aggregates are calculated from
the retained pseudonymous records above.

## Access, portability, objection, withdrawal, and erasure

Settings provides:

- a usage-reporting toggle and exact disclosure;
- independent preference-sync and encrypted-key-sync controls;
- JSON export of linked account data or an anonymous installation's cloud data;
- anonymous installation-data erasure, which also disables reporting locally;
- permanent signed-in account/cloud-data erasure.

Account erasure runs in one database transaction across account settings, external identities,
encrypted secrets, linked installations, preference audits, every usage-statistics table, role
links, and the user row. It then removes all Chronicle access/refresh whitelist entries. The
desktop clears its encrypted session and returns to local mode with account-backed sync disabled.
Local provider keys, watched folders, originals, SQLite history, and version-library bytes are
intentionally preserved because they require a separate explicit on-device deletion choice.

## Required production review

Before launch, a human owner must replace the project-team placeholder with the legal controller
name/address, verify the support email, execute processor and transfer arrangements, validate the
LIA for the intended audience (especially any minors), and confirm deployment logs/backups obey
the stated retention and erasure behavior.
