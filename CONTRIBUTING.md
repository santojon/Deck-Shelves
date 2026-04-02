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


**Important:** The screenshot automation requires that you have at least **2 shelves** created in Deck Shelves before running the screenshot script. This ensures the screenshots (especially `home-shelves.png`) are aligned and representative. If fewer than 2 shelves are present, the script will error and not capture all screenshots.

If you change UI components or want to update the README screenshots, you can re-capture them using the automated CDP screenshot script. Recent changes make the script switch only the UI language (i18n) to English before capturing rather than performing DOM string replacements. The script also verifies the CEF/CDP endpoint is reachable and will defer deletion of existing screenshots until connectivity is confirmed.

This requires a Steam Deck connected via SSH with CEF remote debugging enabled.

### Prerequisites

1. Enable CEF Remote Debugging on the Deck: **Settings → Developer → Enable CEF Remote Debugging** → restart Steam
2. Open an SSH tunnel from your machine:

```bash
ssh -f -N -L 8081:localhost:8081 deck@steamdeck
```


### Capture

Before running the screenshot script, make sure you have at least **2 shelves** created in Deck Shelves. The script will not proceed if this requirement is not met.

```bash
python3 scripts/devtools/deck/screenshot.py              # all screenshots
python3 scripts/devtools/deck/screenshot.py --target home # Home only
python3 scripts/devtools/deck/screenshot.py --target qam  # QAM only
```

Screenshots are saved to `assets/screenshots/`. You can validate that all expected screenshots exist and are valid with:

```bash
node scripts/build/validate-screenshots.mjs
```

> **Note:** Screenshot capture is entirely optional. CI will only validate screenshots if files under `assets/screenshots/` are changed in the PR.

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

## Reporting Issues

Open an issue on GitHub with:

- A description of the problem or suggestion
- Steps to reproduce (if a bug)
- SteamOS version and Decky Loader version
- Other installed plugins in same environment
- Any relevant logs (`journalctl --user -f | grep -i decky` on the Deck)
