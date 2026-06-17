# DeckProbe

Toolkit for developing Steam Deck plugins against a live device — CDP
probes, screenshot pipeline, perf bench. The scaffold is generic and can
be dropped into any Decky plugin repo as a reference or a git submodule.

> Support repo, not a published library. No releases, no semver. Changes
> are logged by date in `CHANGELOG.md` for traceability.

## What's in the box

- **`cli.py`** — single entry point for probes, screenshots, and diag
  scripts. Reads `.env` at the parent repo root so deck connection
  settings live in one place.
- **`tools/cdp_probe.py`** — DOM / state probes via Chrome DevTools
  Protocol. Every selector is overridable through env vars (see
  `lib/selectors.py`).
- **`tools/inject_classmap.py`** — push a runtime class-map snapshot to
  the deck so probes and overlays adapt when Steam bumps its CSS-Modules
  hashes.
- **`lib/selectors.py`** + **`lib/selectors.cjs`** — central selector
  registry. Defaults match the originating project; override per-plugin
  via `DEVKIT_*` env vars without forking the toolkit.
- **`diag/`** — library of `.cjs` probes that pipe through `cdp.cjs`
  and pick up env-driven selector substitution automatically. Some are
  template-style and clearly named; the rest are generic.
- **`screenshots/`** — localised screenshot pipeline scaffold. Honours
  `DEVKIT_QAM_SCOPE_SEL`, `DEVKIT_COLLAPSIBLE_HEADER_SEL`, and
  `DEVKIT_ABOUT_ROUTE`.
- **`perf-bench.py`** — frame-time + memory snapshot harness.
- **`uitests/`** — playwright-style UI walkthrough scaffold.

## Quick start

```bash
# 1. From the parent repo root, create a .env with deck connection info
cat >> .env <<EOF
DECK_HOST=192.168.1.42
DECK_USER=deck
DECK_SUDO_PASS=...
DECK_CDP_PORT=8081
EOF

# 2. List diag probes (your project's + this repo's)
python3 devkit/cli.py diag list

# 3. Run a probe (target is auto-resolved from a substring of the title)
python3 devkit/cli.py diag run diag_layout

# 4. Smoke probe of the home (`mount`, `rows`, `smoke` modes)
python3 devkit/cli.py probe --mode smoke
```

See [`docs/`](docs/) for end-to-end usage examples + how to retarget the
toolkit against a different plugin.

## Retargeting to another plugin

Every default selector lives in `lib/selectors.py` (mirrored in
`lib/selectors.cjs`). Override any of them via environment variables:

```bash
DEVKIT_HOME_MOUNT_ID=my-plugin-root \
DEVKIT_CARD_SEL=.tile \
DEVKIT_QAM_SCOPE_SEL=.my-plugin-qam \
python3 devkit/cli.py probe --mode rows
```

The cdp helper (`diag/_lib/cdp.cjs`) automatically substitutes every
default-project string in the probe source before sending it over CDP,
so most `.cjs` probes don't need per-project edits.

## Project-specific extras

`scripts/devkit-ext/` (in the parent repo) is the conventional location
for project-specific probes and overrides. The CLI looks for diag
scripts there in addition to the built-in `diag/` folder; set
`DEVKIT_DIAG_DIRS=...` to point elsewhere.

## Using as a submodule

```bash
git submodule add https://github.com/<your-org>/<this-repo> devkit
git config -f .gitmodules submodule.devkit.shallow true
git submodule update --init --recursive --depth 1
```

The `cli.py` + `cdp.py` + generic probes work out of the box once
`DECK_HOST` / `DECK_USER` are set. Template-style `diag_*` scripts are
starting points — copy, rename, swap selectors and globals for your
plugin.

## Requirements

- Python 3.10+
- Steam Deck reachable over SSH
- Steam started with CDP enabled (default port `DECK_CDP_PORT=8081`)
- For probes that issue privileged ops: `DECK_SUDO_PASS` in `.env`

## License

MIT. See [LICENSE](LICENSE).
