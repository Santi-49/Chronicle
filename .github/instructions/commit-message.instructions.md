# Chronicle commit-message instructions

Generate one Conventional Commit message from the staged changes. Chronicle uses these messages
as input to Release Please, so the message must also read well in a public changelog.

## Format

```text
type(scope): concise outcome

Optional body explaining important user impact or release context.

Optional footer.
```

## Rules

- Describe the completed behavior, not the files edited or the act of editing them.
- Make the subject specific enough to stand alone in a changelog. Avoid vague wording such as
  `update files`, `minor changes`, `improve app`, `fix bug`, or `miscellaneous fixes`.
- Use an imperative, lowercase subject without a trailing period. Keep it at 72 characters or
  fewer when practical.
- Choose the narrowest accurate scope. Prefer established scopes such as `desktop`, `updater`,
  `watcher`, `storage`, `timeline`, `search`, `ai`, `api`, `release`, `landing`, `docs`, or `ci`.
- Use `feat` for new user-visible behavior, `fix` for corrected behavior, and `deps` for a
  dependency change that should appear in a release. Use `refactor`, `perf`, `test`, `docs`,
  `build`, `ci`, or `chore` when those accurately describe a non-feature change.
- Never label documentation, tests, formatting, or internal maintenance as `feat` or `fix` merely
  to trigger a release.
- For a breaking change, add `!` after the type or scope and include a `BREAKING CHANGE:` footer
  that states what consumers must change.
- Add a short body when the subject alone cannot explain the user impact, compatibility concern,
  security consequence, migration requirement, or release behavior. Keep it useful to changelog
  readers; do not inventory filenames or routine test commands.
- When the staged diff contains several related effects, summarize the main outcome in the
  subject and use short body paragraphs or bullets for the important secondary effects.
- Do not include issue numbers, co-author lines, AI attribution, or `BEGIN_COMMIT_OVERRIDE`
  markers unless they are already required by the staged work.

## Examples

```text
feat(updater): add restart choices to the ready update card

- Let users postpone the prompt until next launch.
- Allow skipping only the currently offered version.
```

```text
fix(release): preserve desktop feature commits in generated changelogs
```

```text
docs(desktop): explain how to test Windows auto-update releases
```
