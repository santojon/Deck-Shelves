# Contributing to Deck Shelves

Thank you for your interest in contributing! This guide covers the development setup, coding conventions, and how to submit changes.

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 10 or later
- **Python 3.9+** (for the backend, lint and devtools)
- A **Steam Deck** with [Decky Loader](https://decky.xyz) installed (for testing)
- SSH access to the Deck on your local network

## Supported platforms

The dev / build / validation flows run on **Linux, macOS, and Windows**.

| Workflow                                       | Linux | macOS | Windows |
|------------------------------------------------|:-----:|:-----:|:-------:|
| `pnpm install`                                 |  ✅  |  ✅   |   ✅    |
| `pnpm run build` / `build:release`             |  ✅  |  ✅   |   ✅    |
| `pnpm run typecheck`                           |  ✅  |  ✅   |   ✅    |
| `pnpm run test`                                |  ✅  |  ✅   |   ✅    |
| `pnpm run lint`                                |  ✅  |  ✅   |   ✅    |
| `pnpm run dev:check` (typecheck + lint + test) |  ✅  |  ✅   |   ✅    |
| `pnpm run package` / `verify:package`          |  ✅  |  ✅   |   ✅    |
| `pnpm run validate:compat`                     |  ✅  |  ✅   |   ⚠️    |
| `pnpm run deploy:deck*` (bash)                  |  ✅  |  ✅   |   ⚠️    |
| `pnpm run deploy:deck:win*` (PowerShell)        |  —   |  —    |   ✅    |
| `pnpm run devtools:*` (CDP)                    |  ✅  |  ✅   |   ✅    |
| `pnpm run qa` / `validate:full` / `validate:ci`|  ✅  |  ✅   |   ✅    |
| `pnpm run update` / `update:*`                 |  ✅  |  ✅   |   ✅    |

Everything a contributor needs to validate a change — build, typecheck,
lint, tests, **packaging + verify**, the full QA/validation harness
(`qa` / `validate:*`), the dependency-update flow (`update:*`), and the CDP
tooling — is Node or Python and runs natively on all three OSes (no bash, no
`zip`/`unzip` CLI; packaging uses Python's `zipfile`). Python is invoked through
a cross-OS launcher (`scripts/build/py.mjs`, which resolves `python3` /
`python` / `py -3`), so a bare `python3` on PATH is not required on Windows.

- ⚠️ `validate:compat` runs ~39 integration checks that are still bash
  (`checks/**/*.sh`). The wrapper (`scripts/build/validate-compat.mjs`)
  finds `bash` on PATH and routes through it, so on Windows it needs
  **Git for Windows** (Git Bash) or **WSL**. The OS-independent subset is
  covered by `pnpm run dev:check`.
- ⚠️ The bash deploy scripts (`deploy:deck` / `:hard`, SSH + rsync + sudo)
  need a POSIX shell; on Windows use **`pnpm run deploy:deck:win`** /
  **`deploy:deck:win:hard`** — a PowerShell variant
  ([`scripts/deploy/deploy-deck.ps1`](scripts/deploy/deploy-deck.ps1)) that
  uses the OpenSSH `ssh`/`scp` bundled with Windows 10+ (no rsync/bash).
  The other deck-operator scripts (watch, logs, perf-stress) remain
  bash — run them under WSL / Git Bash.

### Windows quickstart

1. Install [Node.js 20+](https://nodejs.org/), [Python 3.9+](https://www.python.org/),
   and (only for `validate:compat`) [Git for Windows](https://git-scm.com/download/win).
2. From PowerShell or Git Bash: `corepack enable && pnpm install`. If `corepack` isn't on PATH (some Node packagers don't link it), run `pnpm run upgrade` instead — the helper (`scripts/build/upgrade-pnpm.cjs`) finds Corepack from `node`'s bundled location and falls back to `npm install -g pnpm@latest`.
3. `pnpm run dev:check && pnpm run package` — the full local build + package flow runs natively.
4. `pnpm run validate:compat` only needs Git Bash / WSL for the bash integration checks.

## Getting Started

1. Fork and clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Set up the Deck for development (first time only):

```bash
pnpm run deck:setup <deck-hostname>
```

4. Build and deploy:

```bash
pnpm run build:plugin
pnpm run deploy:deck <deck-hostname>
```

5. Or use watch mode for automatic redeployment:

```bash
pnpm run watch:deck <deck-hostname>
```

### Developing on the machine that runs Steam

If you're working **directly on a Deck / Linux / Windows box that already has
Decky Loader installed**, skip the SSH flow and install into the local Decky
plugin dir:

```bash
pnpm run deploy:local        # build + install locally (no SSH)
pnpm run deploy:local:hard   # + reload plugin_loader + restart Steam (Linux)
```

It never installs Decky — set `DECKY_PLUGINS_DIR` if Decky isn't at
`~/homebrew/plugins`. See [docs/development.md](docs/development.md#run-locally-decky-already-installed).

## Project Structure

```
main.py                  Python backend entry — DEFAULT_SETTINGS, _SSL_CTX,
                         Plugin class (lifecycle + RPC). Re-exports the
                         helper modules below for back-compat imports.
paths.py                 _steam_install_candidates, _normalize_path —
                         path discovery + home-confined path validation.
storage.py               _settings_dir, _primary_file, _safe_read_json —
                         settings.json read helpers (Decky env-var aware).
sanitizer.py             _sanitize_settings — settings-shape normaliser
                         (mirrors the Zod schemas in src/types.ts).
src/index.tsx            Frontend entry point (Decky lifecycle)
src/types.ts             Zod schemas (Shelf, Settings, FilterGroup)
src/steam/               Steam API access (collections, tabs, filters, apps)
src/store/               Settings store (backend RPC + localStorage cache)
src/components/          React components
  shelf/                 Card components (GameCard, MoreCard, PlaceholderCard, HeroBackground)
  home/                  Home screen nav patches
  filter/                Filter type editors and utilities
  qam/                   QAM modals, shelf list, action buttons, icons
    common/              Shared QAM components (ActionButton, ShelfListLabel)
    list/                Shelf list panel and actions
    modals/              Delete, Edit, Export, Import, Template modals
  about/                 Documentation tabs (Overview, HowTo, Shelves, Filters, Support)
  styles/                Injected stylesheets
src/core/                Utilities (focus, scroll, assets, webpack compat, plugin API)
src/domain/              Pure domain logic (settings operations, defaults, templates)
src/runtime/             Platform integration (home patching, Steam host, logger)
src/features/            Feature controllers
  settings/
    controller.tsx       Hook entry (state + effects + compose action slices)
    controller/          Action slices spread into the public `actions`
      shelves.ts         Regular-shelf CRUD + import / export / reset
      smartShelves.ts    Smart-shelf CRUD + surprise-me + import / export
      savedFilters.ts    SavedFilter + SavedSmartFilter CRUD
      online.ts          Online-features toggles + acceptOnlinePrivacy
      globalVisual.ts    30 global visual setters (consolidated)
      profiles.ts        Usage profiles + unified/lightMode/featureToggle setters
src/integrations/        Third-party plugin integration (TabMaster, UnifiDeck)
src/shims/               React/Decky GamepadUI shims
src/test/                Vitest test suites
i18n/                    Locale files
docs/                    Architecture, API, filter, and development docs
scripts/                 Build, deploy, devtools, and screenshot automation
```

See [`docs/architecture.md`](docs/architecture.md) for a detailed breakdown.

## Code Style

- **Indentation**: 2 spaces
- **Semicolons**: always
- **Quotes**: double quotes for strings
- **Naming**: `camelCase` for variables and functions, `PascalCase` for components and types
- **TypeScript**: avoid `any` — use proper types or `unknown`
- **Imports**: group by external, then internal, then relative
- **Comments**: only where the logic is not self-evident — do not add JSDoc or inline comments to obvious code

## Build Modes

- `pnpm run build:plugin` — development build (sourcemaps, no minification, `__DEV__` = true)
- `pnpm run build:release` — production build (minified, no sourcemaps, `__DEV__` = false)

## Compatibility Checks

Before submitting, run the compatibility validation:

```bash
pnpm run validate:compat
```

All checks should pass. The individual check scripts live in the `checks/` subfolders.

## Internationalization

- Locales are **area-sliced**: `i18n/<locale>/{home,qam,about,settings,integrations,common}.json`. The loader (`src/i18n.ts`) merges the areas at runtime.
- Base locale: the `i18n/en-US/` directory
- Every locale must have the same merged key set as `en-US` (no cross-area key collisions)
- When adding a new i18n key, add it to the matching area file in **all** locale directories
- `pnpm run validate:compat` (and `pnpm run validate` for the build-time check) verifies per-locale key consistency automatically

## Tests

- Run unit tests (TypeScript + Python) locally with: `pnpm run test:all`
- The CI installs and runs `pytest` for Python tests in addition to Vitest for TypeScript tests. Ensure `pytest` is available locally (`pip install pytest`).
- **Local UI suite (optional, hardware needed):** `pnpm uitests` exercises higher-level user flows (home render, QAM panel, About route) against a real Deck or a SteamOS VM via CDP. Local-only — never on CI. Useful before submitting flow-affecting PRs. List individual tests with `pnpm uitests:list`; filter with `--only suite[,suite.test]`.
- **Performance bench (optional):** `pnpm perf:bench` reports `mount p_avg / p_min / p_max` for the home cold-mount path so `[PERF]` PRs can include a measured before/after delta. See [docs/performance.md](docs/performance.md).
- **QA harness flags** are documented in [docs/qa-manual.md §12](docs/qa-manual.md). Use `pnpm qa:<scenario>` scripts to deploy a build with a fixture pre-applied.

## Validation flows and reports

Three validation commands are available depending on context:

| Command | When to use | Device needed |
|---|---|---|
| `pnpm validate:ci` | Before a PR, in CI, or offline | No |
| `pnpm validate:full` | Final check before release, with Deck on the network | Yes (skips gracefully if unreachable) |
| `pnpm validate:full:stress` | After changes to rendering, shelves, or perf-sensitive paths | Yes |

All three produce an HTML report with per-step captured output, test result counts, and VS Code-clickable file links for errors. Reports are written to `reports/` (gitignored):

```
reports/
  index.html        ← top-level overview + link to dashboard
  dashboard.html    ← statistics dashboard with charts (see below)
  ci/               ← automated runs (validate:ci)
    index.html
    YYYY-MM-DD_HH-MM-SS.html + .json
  local/            ← manual runs with Deck (validate:full / :stress)
  release/          ← reserved for release-gate runs
```

Open the report index and dashboard after any run with:
```bash
pnpm reports        # opens reports/index.html (includes 📊 Dashboard link)
```

### Dashboard (`reports/dashboard.html`)

The dashboard aggregates statistics across **all runs and all scopes** automatically after each `validate:*` command. It shows:

- **KPI cards** — total runs, run pass rate, tests executed, test pass rate, last run result
- **Pass-rate trend** — line chart of pass % per run over time (green = all pass, red = failures)
- **Coverage by test suite** — stacked bars per suite (home, QAM shelves, QAM smart, QAM global, about, context menu, performance, crash protection, stress) showing cumulative pass/fail/skip distribution; populated automatically from UI tests logs and backfilled retroactively from HTML when JSON metadata predates the feature
- **Overall distribution** — donut chart of total pass/fail/skip
- **Results by scope** — stacked bars (local / CI / release) with totals
- **Context pills** — how many runs were with/without Deck and with/without stress fixture

The dashboard is a self-contained HTML file (inline SVG, no CDN, works offline).

### CI integration

`pnpm validate:ci` is designed to run in GitHub Actions (no device, no .env required):

```yaml
- name: Validate
  run: pnpm validate:ci
```

It exits with code 1 on any failure. Reports are local-only (`reports/ci/` is gitignored); add an artifact upload step to preserve them across CI runs if needed.

## Screenshots (optional)

> Screenshot capture and Devtools usage are documented in the main README and the Devtools readme under `scripts/devtools/README.md`.

See `README.md` for quick commands and `scripts/devtools/README.md` for detailed diagnostic and screenshot guidance.

### Screenshot capture workflow

Follow these steps to regenerate the canonical screenshots:

1. **Set the Steam Deck language to English** — open Settings → System → Language → English. This ensures all UI labels in the screenshots are in English.
2. **Import the screenshot configuration** — in the plugin QAM, click the import button and import `assets/import/screenshots-en.json`. This sets up the exact shelf configuration used for automation (3 standard shelves, 1 hidden shelf, 3 smart shelves).
3. **Adjust if needed** — if the implementation being captured adds new UI elements or changes behavior, verify that the import still reflects the current feature set. Edit the JSON if needed.
4. **Ensure QAM sections have data and are expanded** — open the QAM and navigate to the Deck Shelves plugin tab. All sections (Behavior, Shelves, Smart Shelves, Visual / Global, Saved Filters) must have data populated and must be manually expanded before running the script. Collapsed sections will not be captured correctly. The Saved Filters section only appears when at least one saved filter exists — create one if needed.
5. **Open the Steam main menu** — press the Steam button to open the main menu before running the script. This ensures Steam's UI state is initialized and the home screen will render without overlays after the script navigates away from the menu.
6. **Run the script**:
   ```bash
   pnpm run screenshots
   ```
   The script connects via CDP, validates at least 2 shelves and 1 game card are present, then captures all scenarios automatically.
7. **Verify output** — screenshots are saved to `assets/screenshots/`. Review each PNG before committing.

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes in focused, atomic commits
3. Add entries under `## [Unreleased]` in **both** `CHANGELOG.md` (technical detail) and `RELEASE_NOTES.md` (user-facing language). Use `### Added`, `### Fixed`, `### Changed`, `### Removed`, or `### Performance` as appropriate.
4. Run `pnpm run validate:compat` and ensure all checks pass
5. Build with `pnpm run build:plugin` and verify no errors
6. Run `pnpm run precommit` and verify no errors
7. Test on a real Steam Deck if possible
8. Open a Pull Request with a title starting with one of these tags:

| Tag | Bump | Example |
|---|---|---|
| `[FIX]` | patch (0.1.0 → 0.1.1) | `[FIX] Prevent shelf from disappearing on reboot` |
| `[ENHANCEMENT]` | patch (0.1.0 → 0.1.1) | `[ENHANCEMENT] Add tooltip to shelf card on hover` |
| `[PERF]` | patch (0.1.0 → 0.1.1) | `[PERF] Debounce shelf resolve on settings changes` |
| `[QA]` | patch (0.1.0 → 0.1.1) | `[QA] Add forced-error harness for shelf render path` |
| `[CLEANUP]` | minor (0.1.0 → 0.2.0) | `[CLEANUP] Remove deprecated filter helpers` |
| `[FEATURE]` | minor (0.1.0 → 0.2.0) | `[FEATURE] Add drag-and-drop shelf reordering` |
| `[REFACTOR]` | major (0.1.0 → 1.0.0) | `[REFACTOR] Simplify settings persistence layer` |

When a PR is merged to `main`, the version bump and tag creation happen automatically based on the title tag. The `release.yml` workflow extracts the user-facing release body from `RELEASE_NOTES.md` (and falls back to `CHANGELOG.md` if a section is missing) — release notes are **not** auto-generated from commit messages, so the entries you add are exactly what ships.

> **Important:** Do not manually edit version numbers in `package.json`. Do not add version headers to `CHANGELOG.md` / `RELEASE_NOTES.md` — only add entries under `## [Unreleased]`. The bump automation handles versioning.

### Pull Request Format

Your PR must follow the template. The `pr-checklist` GitHub Actions workflow validates the body on every push and **blocks merge** if any of the rules below fail; the `pr-autofill` workflow mirrors `## [Unreleased]` from `CHANGELOG.md` and `RELEASE_NOTES.md` into the PR body, so editing those files is enough to populate the corresponding sections.

**Required sections:**

- **Description** — What this PR does and why. Link related issues with `Closes #123`.
- **Changelog** — must be non-empty. Add entries under `## [Unreleased]` in `CHANGELOG.md` (technical level: file paths, internal mechanics, regressions covered).
- **Release Notes** — must be non-empty. Add entries under `## [Unreleased]` in `RELEASE_NOTES.md` (user-facing wording, no jargon — this is what ships in the GitHub release body and the Decky store description).

**Type of Change** — at least **one** of the first three rows must be checked:

- [ ] Refactor / restructure (`[REFACTOR]`)
- [ ] New feature / Code cleanup (`[FEATURE]`, `[CLEANUP]`)
- [ ] Bug fix / Enhancement / QA / Performance update (`[FIX]`, `[ENHANCEMENT]`, `[QA]`, `[PERF]`)

The remaining rows (Documentation update / i18n / Build / CI) are additive — check them in addition to one of the three above when applicable.

**Checklist** — every item must be checked. The "i18n keys" line is required only when the **i18n / localization** Type-of-Change row above is also checked; otherwise it can stay unchecked and the validator will skip it.

- [ ] My PR title starts with `[FIX]`, `[ENHANCEMENT]`, `[PERF]`, `[QA]`, `[REFACTOR]`, `[CLEANUP]`, or `[FEATURE]`
- [ ] I added my changes to `CHANGELOG.md` and `RELEASE_NOTES.md` under `## [Unreleased]`
- [ ] I have read [CONTRIBUTING.md](CONTRIBUTING.md)
- [ ] My code follows the project's code style (2 spaces, semicolons, double quotes)
- [ ] I ran `pnpm run build:plugin` with no errors
- [ ] I ran `pnpm run validate:compat` and all checks pass
- [ ] I tested on a Steam Deck (or explained why this isn't needed)
- [ ] **(only if i18n / localization is checked above)** New i18n keys added to **all** locale files

**Other sections** — Screenshots / Videos and Additional Notes are optional but encouraged for UI changes and non-obvious decisions.

> The `pr-checklist` validator runs on every PR push (including from forks) and is a required status check on `main` — the PR cannot merge with red. The repository owner can bypass via the `lock-main` ruleset's bypass-actor entry, but everyone else must satisfy the rules above.

## Reporting Issues

Open an issue on GitHub with:

- A description of the problem or suggestion
- Steps to reproduce (if a bug)
- SteamOS version and Decky Loader version
- Other installed plugins in same environment
- Any relevant logs (`journalctl --user -f | grep -i decky` on the Deck)
