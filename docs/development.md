# Development Guide

## Prerequisites

- Node.js 20+, pnpm 10+, Python 3
- Steam Deck with [Decky Loader](https://decky.xyz) and SSH access
- CEF Remote Debugging enabled on the Deck

> Dev works on **Windows, macOS, SteamOS, and other Linux** (see
> [CONTRIBUTING.md § Supported platforms](../CONTRIBUTING.md#supported-platforms)).
> The `pnpm` scripts invoke Python cross-OS via `scripts/build/py.mjs`; the raw
> `python3 …` examples below assume `python3` on PATH — on Windows use
> `python` / `py -3` or the equivalent `pnpm` / `pnpm --filter deckprobe …` flows.

## Setup

```bash
pnpm install
cp .env.example .env   # Edit with your Deck's IP
pnpm run deck:setup    # First-time Deck configuration
```

## Run locally (Decky already installed)

To develop **directly on the machine that runs Steam** — a Steam Deck, a Linux
box, or Windows — that **already has Decky Loader installed**, deploy into the
local Decky plugin dir instead of over SSH:

```bash
pnpm run deploy:local        # build + install into THIS machine's Decky plugin dir
pnpm run deploy:local:hard   # + reload plugin_loader and restart Steam (Linux)
```

- It does **not** install Decky — it only copies the plugin into an existing
  install. Default location is `~/homebrew/plugins`; if Decky lives elsewhere,
  set `DECKY_PLUGINS_DIR=/path/to/homebrew/plugins` (or `DECKY_HOME=/path/to/homebrew`)
  in `.env` or the environment.
- After a plain `deploy:local`, reload from Decky (Developer → Reload
  deck-shelves) or restart Steam. `:hard` tries to do that for you on Linux
  (needs passwordless `sudo` or `DECK_SUDO_PASS`).
- **CDP against local Steam:** `deckprobe` defaults to the Deck's LAN port
  (`8081`). To point it at the local Steam instead, set `DECK_CDP_HOST=127.0.0.1`
  and `DECK_CDP_PORT=8080` in `.env` — Steam's CEF listens on `8080` on the same
  machine. This is opt-in via `.env`; the shipped default stays `8081`, so
  existing Deck/CI flows are unaffected.

## Environment Variables (`.env`)

```
DECK_HOST=192.168.1.x     # Steam Deck IP address (or hostname, e.g. steamdeck)
DECK_USER=deck             # SSH username
DECK_SUDO_PASS=...        # sudo password for plugin dir ownership
DECK_CDP_PORT=8081         # CEF Remote Debugging port
DECK_CDP_HOST=127.0.0.1    # optional: CDP host (defaults to DECK_HOST; use 127.0.0.1 for local Steam / over an SSH tunnel)
DECKY_PLUGINS_DIR=         # optional: local Decky plugins dir for `deploy:local` (default ~/homebrew/plugins)
```

> Local Steam: set `DECK_CDP_HOST=127.0.0.1` + `DECK_CDP_PORT=8080` (Steam's CEF
> is on `8080` on the same machine; `8081` is the Deck's LAN port).

All variables are optional — each script also accepts command-line arguments
(e.g. `pnpm run deploy:deck steamdeck`). When both are provided, the CLI
argument takes precedence.

## Build Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Development build (sourcemaps, `__DEV__=true`) |
| `pnpm run build:release` | Production build (minified, `__DEV__=false`) |

> **Caution:** always use `build:release` when creating a package for distribution or submission to the Decky Store. The `build` command includes sourcemaps and enables debug logging — it is for local development only.
| `pnpm run deploy:deck` | Build + deploy to Deck via SSH |
| `pnpm run deploy:deck:hard` | Deploy + restart Steam |
| `pnpm run deploy:local` | Build + install into the **local** Decky (no SSH; Decky must already be installed) |
| `pnpm run deploy:local:hard` | Local install + reload plugin_loader + restart Steam (Linux) |
| `pnpm run watch:deck` | Auto-deploy on file changes |
| `pnpm run package` | Create distributable `.zip` |
| `pnpm run upload:deckzip` | Upload the zip to the Deck Downloads folder |

## Testing

```bash
pnpm test              # Vitest (TypeScript)
pnpm run test:all      # Vitest + pytest (Python)
pnpm run typecheck     # TypeScript type checking
```

## Compatibility Checks

```bash
pnpm run validate:compat
```

Validates against 23 compatibility targets: Decky Loader versions, SteamOS versions, CSS Loader themes, and coexisting plugins.

## Debug Flag

> **Note:** the `debug` flag makes Decky reload the plugin automatically on each deploy — it must be absent from the final `plugin.json` submitted to the store. The deploy script handles this injection automatically; do not add the flag manually to the committed file.

The `plugin.json` ships without the `debug` flag (required for Decky Store). During development, `deploy-deck.sh` automatically injects the flag into the staged copy so Decky reloads the plugin on deploy.

## Screenshots

The CDP tooling lives in the `deckprobe/` package (host/port come from
`.env`: `DECK_HOST`, `DECK_CDP_PORT`). Deploy the plugin first (requires at
least 2 shelves with 1+ game each; `smart-shelf-edit.png` needs Smart Shelves
enabled with one entry).

```bash
# Capture all screenshots via CDP automation
pnpm run devtools:screenshots

# Validate captured screenshots (required files present, PNG magic header,
# >= 60 KB — catches blank popup frames)
pnpm run screenshots:validate
```

Captures land in `assets/screenshots/`. The gallery is rendered in
[`showcase.md`](./showcase.md).

Capture is driven by the **modular runner** (`pnpm run devtools:screenshots`
calls `deckprobe/cli.py screenshot`, which runs it):

```bash
# All captures (via the CLI — reads scenarios + out dir from deckprobe.config.json)
python3 deckprobe/cli.py screenshot

# Or invoke the runner directly (as a module, from the repo root):
python3 -m deckprobe.screenshots.run --scenarios-dir scripts/deckprobe-ext/screenshots/scenarios
python3 deckprobe/cli.py screenshot --only home,qam,about_overview   # subset
python3 -m deckprobe.screenshots.run --list                          # list scenarios
```

Project scenarios live in `scripts/deckprobe-ext/screenshots/scenarios/*.py`
(wired via `screenshots_scenarios_dir` in `deckprobe.config.json`). Each file
groups related captures; add one by writing a function decorated with
`@register("name")` that receives the SharedJS session, host, port and output
dir and returns a `{filename: Path}` map. The runner is split into `lib/cdp.py`
(minimal CDP `Session`), `lib/nav.py` (navigation primitives), `lib/capture.py`
(`capture_bigpicture` / `capture_qam` with blank-frame fallback) and `run.py`
(orchestrator over `ALL_SCENARIOS`).

### Screenshot set

| File | Captures |
|------|----------|
| `home.png` | Home with the Deck Shelves portal mounted after native recents |
| `home-shelves.png` | Home scrolled to show the second DS shelf in full |
| `game-menu.png` | Context menu opened on a shelf card (MENU button) |
| `qam.png` | QAM with the Deck Shelves plugin tab active |
| `shelf-create.png` | Template picker modal (grouped by category) |
| `shelf-actions.png` | Per-shelf action menu (Edit / Duplicate / Hide / Delete / reorder) |
| `shelf-edit.png` | Edit shelf modal — Source tab (sort, source type, limit) |
| `shelf-edit-filters.png` | Edit shelf modal — Filters tab (FilterPanel + SavedFiltersBar) |
| `shelf-edit-visual.png` | Edit shelf modal — Visual tab (highlight toggles + picker + Odd/Even) |
| `shelf-hidden.png` | QAM showing a shelf toggled to hidden (eye-slash icon) |
| `shelf-delete.png` | Delete shelf confirmation dialog |
| `shelf-import.png` / `shelf-export.png` | Import / export modals |
| `reset-all.png` | Reset-all destructive confirmation |
| `about-page.png` | About & Filter Documentation page |
| `smart-shelves-qam.png` | QAM scrolled to the Smart Shelves section |
| `smart-shelf-modal.png` | Smart Shelf template picker (category accordions) |
| `smart-shelf-edit.png` | Edit Smart Shelf modal (sort override + filters + visual) |
| `saved-filters-qam.png` | **Optional** — Saved Filters section in QAM; captured only when a filter has been saved |
| `global-toggles.png` | Apply Globally section in QAM |

## Local UI test suite

```bash
pnpm uitests             # run every registered suite against the Deck
pnpm uitests:list        # list every suite + test name
pnpm uitests --only home,qam_shelves   # subset
```

Suites live in `scripts/deckprobe-ext/uitests/suites/` and reuse the screenshot
pipeline's `lib/` (CDP session, navigation, capture). Local-only — runs against
a real Deck or a SteamOS VM via CDP, never on CI. Use it as the optional pre-PR
check for flows the unit tests can't reach.

## Validation flows (with HTML reports)

Three commands orchestrate all checks end-to-end and write an HTML report to
`reports/`:

```bash
pnpm validate:ci             # offline: typecheck, build, tests, package, compat
pnpm validate:full           # with Deck: above + deploy + UI tests + perf bench
pnpm validate:full:stress    # with Deck + stress fixture (16 shelves, 50 cards each)
```

`validate:ci` is designed for CI/CD — no device or `.env` required.
`validate:full` skips device steps gracefully when the Deck is unreachable.
Reports land in `reports/` (gitignored) organised in three scopes (`ci/`,
`local/`, `release/`) plus a top-level `index.html` and a statistics
`dashboard.html`. Open them with `pnpm reports`.

## Performance bench

```bash
pnpm perf:bench          # 3 runs, prints mount p_avg / p_min / p_max
pnpm perf:bench --runs 10
```

Drops `performance.mark` / `performance.measure` calls into Big Picture,
navigates to the home, reads the durations back. Pair with the `[PERF]` PR tag
and before/after numbers — see [`performance.md`](./performance.md).

## CDP Diagnostics

`deckprobe/cdp.py` covers the common debug loop (find target → run probe →
check result). See [`cdp.md`](./cdp.md) for the full reference.

```bash
# List CDP targets with aliases (bp / qam / sjc / mainmenu)
python3 deckprobe/cdp.py targets

# Evaluate a JS expression in a target
python3 deckprobe/cdp.py eval bp 'document.title'

# Capture a screenshot of the QAM
python3 deckprobe/cdp.py screenshot qam /tmp/qam.png

# Stream console warnings/errors
python3 deckprobe/cdp.py console sjc

# Inject a classmap for testing
python3 deckprobe/tools/inject_classmap.py
```

## i18n

Locales are sliced into per-area files: `i18n/<locale>/<area>.json`, where
`<area>` is one of `home`, `qam`, `about`, `settings`, `integrations`,
`common`. The loader (`src/i18n.ts`) merges every area file per locale into a
single bundle via `import.meta.glob` — `en-US` ships eagerly (first-paint
labels), every other locale loads its area chunks lazily for the detected
language. Adding a locale or a new sub-area is just a new JSON file; no loader
edit. First-party integrations add `i18n/<locale>/integration-<name>.json`.

> **Caution:** every new key must exist in all locales with no cross-area
> collisions — `node scripts/build/validate.mjs` fails if any locale's merged
> key set differs from `en-US` or a key appears in two area files. Use the
> English string as the value when a translation isn't ready; never leave a
> key undefined (the runtime falls back silently and logs a warning).

- Base locale: `i18n/en-US/` (area files)
- A key must exist in every locale and live in exactly one area file
- External plugins register their own strings at runtime via
  `window.deckShelves.api.registerTranslations(locale, dict)` instead of a PR

## Project Conventions

- 2 spaces indentation, semicolons, double quotes
- `camelCase` for variables, `PascalCase` for components/types
- Changelog entries go under `## [Unreleased]` (never manually version)
- PR titles must start with `[FIX]`, `[ENHANCEMENT]`, `[REFACTOR]`, `[CLEANUP]`, or `[FEATURE]`
