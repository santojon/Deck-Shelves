# Contributing to Deck Shelves

Thanks for taking the time. Commands are in
[docs/development.md](docs/development.md) and the code layout is in
[docs/architecture.md](docs/architecture.md).

## Setup

You need Node.js 26+, pnpm 12+ and Python 3.9+ with `ruff` and `pytest`
(`python3 -m pip install ruff pytest`). To test on hardware, a Steam Deck (or
another device in Gaming Mode) with [Decky Loader](https://decky.xyz),
reachable over SSH.

```bash
pnpm install
cp .env.example .env                 # at least DECK_HOST
pnpm run deck:setup <deck-hostname>  # first time only
pnpm run deploy:deck                 # development build, copied over SSH
```

On a machine that already runs Steam with Decky, `pnpm run deploy:local`
installs into the local plugins folder instead.

On Windows, build, lint and tests work natively; the compatibility checks need
Git Bash or WSL, and `pnpm run deploy:deck:win` is the PowerShell deploy.

## Code

- ESLint and TypeScript enforce the style (complexity at most 10, files at most
  1000 lines). New lint suppressions are not accepted; split the code instead.
- Comments only where the code can't say it.
- The Home runs inside Steam's UI on a handheld: no polling where an event
  exists, every effect cleans up, stable props on cards and rows. See
  [docs/performance.md](docs/performance.md).
- New UI text goes into `i18n/<locale>/<area>.json` for **every** locale (use
  the English text where you have no translation). Text that Steam itself shows
  is read from the Steam client, not added there.

## Pull requests

1. Branch from `main`.
2. Add an entry under `## [Unreleased]` in `RELEASE_NOTES.md`, in words a user
   understands, without issue numbers. When the change fixes an issue or has
   technical detail worth keeping (migrations, settings or API changes, renamed
   CSS classes), also add it to `CHANGELOG.md`, citing the issue as `(#123)`.
3. Run `pnpm run validate:ci`; it is the same check CI runs.
4. Test on a device when the change touches the Home, the Quick Access panel or
   input ([docs/qa-manual.md](docs/qa-manual.md)), or say in the PR why it isn't
   needed.
5. Start the PR title with a tag; it decides the version bump:

| Tag | Bump |
|---|---|
| `[FIX]`, `[ENHANCEMENT]`, `[PERF]`, `[QA]` | patch |
| `[FEATURE]`, `[CLEANUP]` | minor |
| `[REFACTOR]` | major |

After the merge, the version is bumped from the tag, the `[Unreleased]` entries
move under it, and the release is built. Its text comes from `RELEASE_NOTES.md`,
and issues cited in the release's entries get a comment. Don't edit the version
in `package.json` or add version headers yourself.

## Reporting issues

Use the issue templates. For a bug, include the plugin version, the SteamOS (or
OS), Steam client and Decky Loader versions, the other plugins and CSS Loader
themes you use, and logs if you can (Settings → Advanced tools).

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Maintainer scripts

- `bash scripts/dev/ensure-repo-settings.sh` checks and fixes the repository's
  merge settings (squash only, delete branch on merge); needs the `gh` CLI. A
  weekly workflow does the same.
