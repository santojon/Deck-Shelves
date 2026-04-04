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
main.py              Python backend plugin
src/index.tsx        Frontend entry point
src/runtime/         Platform integration, Home patching
src/components/      React components (QAM settings, shelves)
src/domain/          Settings schema and defaults
src/core/            Steam asset utilities
src/shims/           React/Decky GamepadUI shims
src/features/        Feature-scoped controllers
i18n/                Locale files
checks/              Compatibility check scripts (steamos/, decky/, build/, project/)
scripts/             Build, deploy, and utility scripts (build/, deploy/, deck/, devtools/)
```

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

- Run all tests (TypeScript + Python) locally with: `pnpm run test:all`
- The CI now installs and runs `pytest` for Python tests in addition to Vitest for TypeScript tests. Ensure Python tests include `requirements-dev.txt` or that `pytest` is available in your environment when running locally.

## Screenshots (optional)


> Screenshot capture and Devtools usage are documented in the main README and the Devtools readme under `scripts/devtools/README.md`.

See `README.md` for quick commands and `scripts/devtools/README.md` for detailed diagnostic and screenshot guidance.

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes in focused, atomic commits
3. Add your changes to `CHANGELOG.md` under the `## [Unreleased]` section (use `### Added`, `### Fixed`, `### Changed`, or `### Removed` as appropriate)
4. Run `bash scripts/build/validate-compat.sh` and ensure all checks pass
5. Build with `pnpm run build:plugin` and verify no errors
6. Test on a real Steam Deck if possible
7. Open a Pull Request with a title starting with one of these tags:

| Tag | Bump | Example |
|---|---|---|
| `[FIX]` | patch (0.1.0 → 0.1.1) | `[FIX] Prevent shelf from disappearing on reboot` |
| `[REFACTOR]` | minor (0.1.0 → 0.2.0) | `[REFACTOR] Simplify settings persistence layer` |
| `[FEATURE]` | major (0.1.0 → 1.0.0) | `[FEATURE] Add drag-and-drop shelf reordering` |

When a PR is merged to `main`, the version bump and tag creation happen automatically based on the title tag.

> **Important:** Do not manually edit version numbers in `package.json`. Do not add version headers to `CHANGELOG.md` — only add entries under `## [Unreleased]`. The bump automation handles versioning.

### Pull Request Format

Your PR should follow the template provided. Each section:

- **Description** — What this PR does and why. Link related issues with `Closes #123`.
- **Changelog** — Add your changes under `## [Unreleased]` in `CHANGELOG.md`.
- **Type of Change** — Check the box that matches your change type.
- **Checklist** — Verify all items before requesting review:
  - PR title starts with `[FIX]`, `[REFACTOR]`, or `[FEATURE]`
  - Changes added to `CHANGELOG.md` under `## [Unreleased]`
  - Code follows project style (2 spaces, semicolons, double quotes)
  - `pnpm run build:plugin` passes with no errors
  - `bash scripts/build/validate-compat.sh` passes
  - Tested on Steam Deck (or explained why not needed)
  - New i18n keys added to **all** locale files
- **Screenshots / Videos** — If applicable, show the change on Steam Deck.
- **Additional Notes** — Anything else reviewers should know.

## Reporting Issues

Open an issue on GitHub with:

- A description of the problem or suggestion
- Steps to reproduce (if a bug)
- SteamOS version and Decky Loader version
- Other installed plugins in same environment
- Any relevant logs (`journalctl --user -f | grep -i decky` on the Deck)
