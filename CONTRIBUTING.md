# Contributing to Deck Shelves

Thank you for your interest in contributing! This guide covers the development setup, coding conventions, and how to submit changes.

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 10 or later
- **Python 3** (for the backend)
- A **Steam Deck** with [Decky Loader](https://decky.xyz) installed (for testing)
- SSH access to the Deck on your local network

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

## Project Structure

```
main.py                  Python backend (settings persistence)
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
src/features/            Feature controllers (settings)
src/integrations/        Third-party plugin integration (TabMaster, UnifiDeck)
src/shims/               React/Decky GamepadUI shims
src/test/                Vitest test suites
i18n/                    17 locale files
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
bash scripts/build/validate-compat.sh
```

All checks should pass. The individual check scripts live in the `checks/` subfolders.

## Internationalization

- Base locale: `i18n/en-US.json`
- All locales must have the same set of keys as `en-US.json`
- When adding a new i18n key, add it to **all** locale files
- The `validate-compat.sh` script checks i18n key consistency automatically

## Tests

- Run unit tests (TypeScript + Python) locally with: `pnpm run test:all`
- The CI installs and runs `pytest` for Python tests in addition to Vitest for TypeScript tests. Ensure `pytest` is available locally (`pip install pytest`).
- **Local UI suite (optional, hardware needed):** `pnpm uitests` exercises higher-level user flows (home render, QAM panel, About route) against a real Deck or a SteamOS VM via CDP. Local-only — never on CI. Useful before submitting flow-affecting PRs. List individual tests with `pnpm uitests:list`; filter with `--only suite[,suite.test]`.
- **Performance bench (optional):** `pnpm perf:bench` reports `mount p_avg / p_min / p_max` for the home cold-mount path so `[PERF]` PRs can include a measured before/after delta. See [docs/performance.md](docs/performance.md).
- **QA harness flags** are documented in [docs/qa-manual.md §12](docs/qa-manual.md). Use `pnpm qa:<scenario>` scripts to deploy a build with a fixture pre-applied.

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
4. Run `bash scripts/build/validate-compat.sh` and ensure all checks pass
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
- [ ] I ran `bash scripts/build/validate-compat.sh` and all checks pass
- [ ] I tested on a Steam Deck (or explained why this isn't needed)
- [ ] **(only if i18n / localization is checked above)** New i18n keys added to **all** 16 locale files

**Other sections** — Screenshots / Videos and Additional Notes are optional but encouraged for UI changes and non-obvious decisions.

> The `pr-checklist` validator runs on every PR push (including from forks) and is a required status check on `main` — the PR cannot merge with red. The repository owner can bypass via the `lock-main` ruleset's bypass-actor entry, but everyone else must satisfy the rules above.

## Reporting Issues

Open an issue on GitHub with:

- A description of the problem or suggestion
- Steps to reproduce (if a bug)
- SteamOS version and Decky Loader version
- Other installed plugins in same environment
- Any relevant logs (`journalctl --user -f | grep -i decky` on the Deck)
