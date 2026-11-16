# Development Guide

## Prerequisites

- Node.js 26+ and pnpm 12+
- Python 3.9+ with `ruff` and `pytest` (`python3 -m pip install ruff pytest`)
- For testing on hardware: a Steam Deck (or another device running Steam in
  Gaming Mode) with [Decky Loader](https://decky.xyz), reachable over SSH

Development works on Windows, macOS, SteamOS and other Linux distributions; see
[CONTRIBUTING.md](../CONTRIBUTING.md#setup) for what runs where.
The `pnpm` scripts find Python on their own through `scripts/build/py.mjs`; the
raw `python3 …` examples below assume `python3` on PATH (on Windows use
`python` or `py -3`).

## Setup

```bash
pnpm install
cp .env.example .env          # set DECK_HOST and friends, see below
pnpm run deck:setup           # first time: creates the plugin folder on the Deck
```

`deck:setup` takes the host as an argument when `.env` doesn't set it
(`pnpm run deck:setup steamdeck`). `--hard` empties the plugin folder first.

## Environment variables (`.env`)

```
DECK_HOST=192.168.1.x      # Deck IP address or hostname, e.g. steamdeck
DECK_USER=deck             # SSH user
DECK_SUDO_PASS=            # only to fix plugin-folder ownership and restart the loader;
                           # leave empty and prefer SSH keys + passwordless sudo
DECK_CDP_HOST=             # debug endpoint host, defaults to DECK_HOST
DECK_CDP_PORT=8081         # 8081 for a Deck on the network, 8080 for local Steam
DECKY_PLUGINS_DIR=         # local Decky plugins folder for deploy:local (default ~/homebrew/plugins)
```

Every variable is optional: the scripts also take the host (and user) as
arguments, and an argument wins over `.env`. The debug endpoint is only needed
for device inspection; see [cdp.md](./cdp.md).

## Commands

### Build and package

| Command | What it does |
|---|---|
| `pnpm run build` | Production build (minified, `__DEV__=false`), plus the `py_modules/` and `defaults/` folders the store packer reads. The Decky store runs this |
| `pnpm run build:dev` | Development build: sourcemaps, `__DEV__=true`, debug logging, QA flags honoured |
| `pnpm run watch` | Development build on every file change, no deploy |
| `pnpm run package` | Packs the last `pnpm run build` into `deck-shelves-v<version>.zip` and checks it; refuses a development build |
| `pnpm run verify:package` | Checks an existing zip without rebuilding it |
| `pnpm run clean` | Removes build output |

### Deploy to a device

| Command | What it does |
|---|---|
| `pnpm run deploy:deck` | Development build, copied to the Deck over SSH |
| `pnpm run deploy:deck:hard` | The same, then restarts the plugin loader and Steam |
| `pnpm run deploy:deck:release` | Production build without the debug flag, then restarts: what users get |
| `pnpm run deploy:deck:win` / `:win:hard` | PowerShell version for Windows (OpenSSH, no rsync or bash) |
| `pnpm run watch:deck` / `:hard` | Redeploys on every file change |
| `pnpm run deploy:local` / `:hard` | Installs into this machine's Decky (no SSH; see below) |
| `pnpm run upload:deckzip` | Copies the packaged zip to the Deck's `~/Downloads`, for testing "Install from zip" |

`:hard` kills Steam without waiting, so give a change you just made in the UI
a moment to save before running it.

### Device helpers

| Command | What it does |
|---|---|
| `pnpm run deck:check` | Tests the SSH connection and shows the Decky folders |
| `pnpm run fix:deck:perms` | Gives the plugin folder back to `DECK_USER` (after a failed deploy) |
| `pnpm run restart:steam` | Restarts Steam on the Deck |
| `pnpm run logs:decky` | Follows the Decky Loader journal on the Deck |
| `pnpm run deck:debug` | Opens the device's DevTools page list in the browser |
| `pnpm run deck:perf` | Battery, CPU and sleep-inhibitor test; see [performance.md](./performance.md) |
| `pnpm run qa:*` | Deploys with a QA flag; see [qa-manual.md](./qa-manual.md#qa-harness-flags) |

## Run locally (Decky already installed)

To work directly on the machine that runs Steam (a Deck, a Linux box or
Windows) that already has Decky Loader:

```bash
pnpm run deploy:local        # build + copy into this machine's Decky plugins folder
pnpm run deploy:local:hard   # + restart the plugin loader and Steam (Linux)
```

It never installs Decky. The default location is `~/homebrew/plugins`; if
Decky lives elsewhere, set `DECKY_PLUGINS_DIR=/path/to/homebrew/plugins` (or
`DECKY_HOME=/path/to/homebrew`) in `.env` or the environment. `--no-build`
reuses the existing `dist/`. After a plain `deploy:local`, reload from Decky
(Developer → Reload) or restart Steam; `:hard` does that for you on Linux
(needs passwordless `sudo` or `DECK_SUDO_PASS`).

## The debug flag

Development deploys add Decky's `debug` flag to the copied `plugin.json`, so
the loader reloads the plugin on every deploy. The committed `plugin.json`
never carries it, because the Decky store rejects it; don't add it by hand.

## Checks

```bash
pnpm run dev:check         # typecheck + lint + unit tests, the quick loop
pnpm test                  # Vitest only
python3 -m pytest src/test # backend tests only
pnpm run validate:compat   # the 40 compatibility checks under checks/
pnpm run docs:check        # docs against code, see below
pnpm run validate:ci       # everything CI runs
```

`validate:ci` runs typecheck, lint (ESLint and ruff), the production build,
Vitest, pytest, packaging, the compatibility checks, the static build checks
(`scripts/build/validate.mjs`) and `docs:check`. It needs no device and no
`.env`, and it is the command CI runs.

The compatibility checks are bash scripts (Decky Loader 3.x and store rules,
SteamOS 3.5–3.10, CSS Loader themes, coexisting plugins, i18n, the Python
backend, the build output). On Windows they need Git Bash or WSL.

### Docs check

`pnpm run docs:check` fails when the docs drift from the code:

- **Coverage**: everything the editor offers is documented. Filter types
  (`ALL_FILTER_TYPES`), sort keys and built-in sources (`SORT_OPTIONS`,
  `V3_SOURCE_OPTIONS`) in [filters.md](./filters.md), smart-shelf modes
  (`SmartShelfModeSchema`) in [smart-shelves.md](./smart-shelves.md), templates
  (`templates.ts`) in [shelf-templates.md](./shelf-templates.md).
- **Diagrams**: no HTML entities in diagram labels, fences balanced.
- **Icons**: the logo and tab icon inlined as JSX match `assets/icon.svg` and
  `assets/tab-icon.svg`.
- **Shipped text**: the README, changelog, release notes, docs and code
  comments contain no internal process or tooling words.

When you expose a new filter, sort, source, smart mode or template, document it
in the same change. If an extractor reports `0 ids`, the source moved: update
the pattern in `scripts/ci/docs-check.mjs` instead of letting the check pass
empty.

### Dependency updates

| Command | What it does |
|---|---|
| `pnpm run update:check` | Lists outdated dependencies, changes nothing |
| `pnpm run update:safe` | Applies updates within the current major versions |
| `pnpm run update:major` | Applies the latest versions, majors included (asks first) |
| `pnpm run update:pnpm` | Upgrades pnpm itself and the `packageManager` pin |
| `pnpm run update:verify` | Typecheck, tests and build after an update |
| `pnpm run update` | All of the above in order, asking before pnpm and major updates |

`--yes` or `YES=1` skips the questions.

## i18n

Locales are split into area files, `i18n/<locale>/<area>.json`, where
`<area>` is `home`, `qam`, `about`, `settings`, `integrations`, `common` or
`setup`; first-party integrations add `integration-<name>.json`. The loader
(`src/i18n.ts`) merges a locale's files into one bundle: `en-US` loads with the
plugin, every other locale loads when it is the active language. A new locale
or area is a new JSON file; the loader needs no change.

- Base locale: `i18n/en-US/`.
- A key must exist in every locale and live in exactly one area file.
  `node scripts/build/validate.mjs` (part of `validate:ci`) fails otherwise.
- When a translation isn't ready, use the English text as the value; never
  leave a key out.
- Text that comes from Steam's own UI is not translated here: it is read from
  the Steam client's localization tokens at run time.
- Other plugins add their own strings at run time with
  `window.deckShelves.api.registerTranslations(locale, dict)`.

## Conventions

- 2 spaces, semicolons, double quotes; `camelCase` for variables and
  functions, `PascalCase` for components and types.
- Changelog and release-notes entries go under `## [Unreleased]`; never set a
  version by hand.
- PR titles start with a tag that sets the version bump; the list is in
  [CONTRIBUTING.md](../CONTRIBUTING.md#pull-requests).

### Diagrams in docs

Diagrams are written as Mermaid blocks in the Markdown, so they render on the
repository page with no build step. Keep them consistent:

- **Quote every label**: `id["Text"]`. Quoting lets a label hold `@`, `()`,
  `/` or `·`.
- **No HTML entities** (`&#64;`, `&amp;`). They show up literally wherever HTML
  labels are disabled. Write the real character inside quotes; `docs:check`
  fails on entities.
- `<br/>` for line breaks is fine; keep node text to two short lines.
- **Colour carries meaning**, and every class pairs a light fill with dark text
  so it stays legible in light and dark page themes:

  | Class | Meaning | Fill / stroke |
  |---|---|---|
  | `ds` | Deck Shelves' own code | `#dbeafe` / `#2563eb` |
  | `contract` | Published contracts (`api` / `host`) | `#e0e7ff` / `#4f46e5` |
  | `platform` | Steam / Decky host | `#ede9fe` / `#7c3aed` |
  | `data` | Local storage / caches | `#dcfce7` / `#16a34a` |
  | `ext` | Network or third-party | `#fef3c7` / `#d97706` |
  | `sensitive` | High-risk modules (thicker stroke) | `#fee2e2` / `#dc2626` |
  | `opt` | Optional / inert | `#f1f5f9` / `#94a3b8` |

- Say in the text what a colour means when it matters (as the
  [architecture](./architecture.md) module diagram does for the red group);
  colour alone is never the only signal.
