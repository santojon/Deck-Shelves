# Development Guide

## Prerequisites

- Node.js 20+, pnpm 10+, Python 3
- Steam Deck with [Decky Loader](https://decky.xyz) and SSH access
- CEF Remote Debugging enabled on the Deck

## Setup

```bash
pnpm install
cp .env.example .env   # Edit with your Deck's IP
pnpm run deck:setup    # First-time Deck configuration
```

## Environment Variables (`.env`)

```
DECK_HOST=192.168.1.x     # Steam Deck IP address
DECK_USER=deck             # SSH username
DECK_SUDO_PASS=...        # sudo password for plugin dir ownership
DECK_CDP_PORT=8081         # CEF Remote Debugging port
```

## Build Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Development build (sourcemaps, `__DEV__=true`) |
| `pnpm run build:release` | Production build (minified, `__DEV__=false`) |

> **Caution:** always use `build:release` when creating a package for distribution or submission to the Decky Store. The `build` command includes sourcemaps and enables debug logging — it is for local development only.
| `pnpm run deploy:deck` | Build + deploy to Deck via SSH |
| `pnpm run deploy:deck:hard` | Deploy + restart Steam |
| `pnpm run watch:deck` | Auto-deploy on file changes |
| `pnpm run package` | Create distributable `.zip` |

## Testing

```bash
pnpm test              # Vitest (TypeScript)
pnpm run test:all      # Vitest + pytest (Python)
pnpm run typecheck     # TypeScript type checking
```

## Compatibility Checks

```bash
bash scripts/build/validate-compat.sh
```

Validates against 23 compatibility targets: Decky Loader versions, SteamOS versions, CSS Loader themes, and coexisting plugins.

## Debug Flag

> **Note:** the `debug` flag makes Decky reload the plugin automatically on each deploy — it must be absent from the final `plugin.json` submitted to the store. The deploy script handles this injection automatically; do not add the flag manually to the committed file.

The `plugin.json` ships without the `debug` flag (required for Decky Store). During development, `deploy-deck.sh` automatically injects the flag into the staged copy so Decky reloads the plugin on deploy.

## Screenshots

```bash
# Capture all screenshots via CDP automation
pnpm run devtools:screenshots

# Or directly with host/port
python3 scripts/devtools/deck/screenshots/screenshot.py --host $DECK_HOST --port $DECK_CDP_PORT

# Validate captured screenshots
pnpm run screenshots:validate
```

## CDP Diagnostics

The unified `cdp.py` covers the common debug loop (find target → run probe → check result). See [`cdp.md`](./cdp.md) for the full reference.

```bash
# List CDP targets with aliases (bp / qam / sjc / mainmenu)
python3 scripts/devtools/deck/cdp.py targets

# Evaluate a JS expression in a target
python3 scripts/devtools/deck/cdp.py eval bp 'document.title'

# Capture a screenshot of the QAM
python3 scripts/devtools/deck/cdp.py screenshot qam /tmp/qam.png

# Stream console warnings/errors
python3 scripts/devtools/deck/cdp.py console sjc

# Inject a classmap for testing
python3 scripts/devtools/deck/tools/inject_classmap.py
```

## i18n

> **Caution:** every new i18n key must be added to all 18 locale files simultaneously — `validate-compat.sh` will fail CI if any file is missing a key. Use the English string as the value in non-English locales when a translation is not yet available; do not leave the key undefined or the runtime will fall back silently and log a warning.

- Base locale: `i18n/en-US.json` (19 locales total)
- New keys must be added to ALL locale files
- `validate-compat.sh` checks key consistency

## Project Conventions

- 2 spaces indentation, semicolons, double quotes
- `camelCase` for variables, `PascalCase` for components/types
- Changelog entries go under `## [Unreleased]` (never manually version)
- PR titles must start with `[FIX]`, `[ENHANCEMENT]`, `[REFACTOR]`, `[CLEANUP]`, or `[FEATURE]`
