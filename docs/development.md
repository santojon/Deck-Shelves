# Development Guide

## Prerequisites

- Node.js 26+, pnpm 12+, Python 3
- Steam Deck with [Decky Loader](https://decky.xyz) and SSH access
- CEF Remote Debugging enabled on the Deck

> Dev works on **Windows, macOS, SteamOS, and other Linux** (see
> [CONTRIBUTING.md § Supported platforms](../CONTRIBUTING.md#supported-platforms)).
> The `pnpm` scripts invoke Python cross-OS via `scripts/build/py.mjs`; the raw
> `python3 …` examples below assume `python3` on PATH — on Windows use
> `python` / `py -3`.

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

> **Caution — `--hard` right after a live save:** `killall steam` can land mid-round-trip of a `saveSettings` call the user just made in the UI. The write itself already landed on disk (confirmed via a reproduction: the backend's pre-save backup snapshot had it), but the frontend's `lastSaveSucceeded` flag can be left `false` if the ack never arrives — and `refreshSettings`'s boot-time "retry unsynced save" then re-pushes whatever `localStorage` cache was current *when the save call started*, which can be older than what's now on disk. If you're deploying `--hard` shortly after the user (or you, live-testing) added/edited something, verify the settings file on disk afterward before assuming it's still there.

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

## Docs Check

```bash
pnpm run docs:check              # coverage + index + badges
pnpm run docs:check --no-badges  # skip the test-count collectors
```

Runs in CI and fails the build when the docs drift from the code:

- **Coverage** — every entry the UI exposes is documented: filter types
  (`ALL_FILTER_TYPES` → [`filters.md`](./filters.md)), sort keys and built-in
  sources (`SORT_OPTIONS` / `V3_SOURCE_OPTIONS` → `filters.md`), smart-shelf
  modes (`SmartShelfModeSchema` → [`smart-shelves.md`](./smart-shelves.md)) and
  shelf templates (`templates.ts` → [`shelf-templates.md`](./shelf-templates.md)).
- **Diagrams** — no HTML entities in diagram labels, fences balanced.
- **Icon** — the `DeckShelvesLogo` mark inlined in `icons.tsx` matches
  `assets/icon.svg` (same rects + fit transform), so the two never drift.

So when you expose a new filter, sort, source, smart mode or template, add it to
the matching doc in the same change. If an extractor ever reports `0 ids`, the
source moved — update the regex in `scripts/ci/docs-check.mjs` rather than
letting the check pass hollow.

## Debug Flag

> **Note:** the `debug` flag makes Decky reload the plugin automatically on each deploy — it must be absent from the final `plugin.json` submitted to the store. The deploy script handles this injection automatically; do not add the flag manually to the committed file.

The `plugin.json` ships without the `debug` flag (required for Decky Store). During development, `deploy-deck.sh` automatically injects the flag into the staged copy so Decky reloads the plugin on deploy.

## Validation

```bash
pnpm validate:ci    # typecheck, lint, build, tests, package, compat
```

It needs no device or `.env`, and it is what CI runs.

## i18n

Locales are sliced into per-area files: `i18n/<locale>/<area>.json`, where
`<area>` is one of `home`, `qam`, `about`, `settings`, `integrations`,
`common`, `setup`. The loader (`src/i18n.ts`) merges every area file per locale into a
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

### Diagrams in docs

Diagrams are written inline in the Markdown so they render on the repository
page with no build step. Keep them consistent:

- **Quote every label** — `id["Text"]`. Quoting is what lets a label hold `@`,
  `()`, `/` or `·` safely.
- **Never use HTML entities** (`&#64;`, `&amp;`). They render literally wherever
  HTML labels are disabled, which is how the label ends up showing
  `&#64;deck-shelves/api`. Write the real character inside quotes instead.
  `docs:check` fails on this.
- `<br/>` for line breaks is fine; keep node text to two short lines.
- **Colour carries meaning**, and every class pairs a light fill with dark text
  so it stays legible in both light and dark page themes:

  | Class | Meaning | Fill / stroke |
  |---|---|---|
  | `ds` | Deck Shelves' own code | `#dbeafe` / `#2563eb` |
  | `contract` | Published contracts (`api` / `host`) | `#e0e7ff` / `#4f46e5` |
  | `platform` | Steam / Decky host | `#ede9fe` / `#7c3aed` |
  | `data` | Local storage / caches | `#dcfce7` / `#16a34a` |
  | `ext` | Network or third-party | `#fef3c7` / `#d97706` |
  | `sensitive` | High-risk modules (thicker stroke) | `#fee2e2` / `#dc2626` |
  | `opt` | Optional / inert | `#f1f5f9` / `#94a3b8` |

- Say what a colour means in prose when it is load-bearing (as the
  [architecture](./architecture.md) module diagram does for the red group) —
  colour alone should never be the only signal.
