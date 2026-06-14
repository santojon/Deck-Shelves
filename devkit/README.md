# Devkit — Steam Deck plugin tooling

CDP probes, screenshot pipeline, and perf bench used to develop Decky
plugins against a real Steam Deck. Built originally for Deck Shelves;
the structure is generic so other plugin developers can reuse it as a
reference or a git submodule.

> Support repo, not a published library. No releases, no semver, no
> `RELEASE_NOTES`. Changes are logged by date in `CHANGELOG.md` for
> traceability.

## Scope

- **Generic** (reusable against any Decky plugin):
  - `cli.py`, `cdp.py`, `perf-bench.py` — top-level CLI + CDP eval + perf bench.
  - `lib/cdp.py` — CDP session, env loading, target discovery.
  - `probes/_base.py` + parameterised probes driven by env vars
    (`PROBE_TARGET`, `PROBE_SELECTORS`, …).
  - `screenshots/` — localised screenshot pipeline scaffold.
  - `diag/probe_*.cjs` — parameterised probes (e.g. `probe_theme_vars`,
    `probe_slider_field`, `probe_focus_ring`).
- **Project-coupled** (still useful as templates):
  - `diag/diag_*.cjs` and a few `probes/*.py` read globals (`__ds_*`)
    or CSS selectors (`.ds-shelf`, `.deck-shelves-root`) specific to
    the Deck Shelves runtime. They run as-is only against a Deck
    Shelves install; clone + adapt for other plugins.

## Requirements

- Python 3.10+
- A Steam Deck reachable over SSH (`DECK_HOST`, `DECK_USER` env vars)
- Steam started with CDP enabled (`-cef-enable-debugging`, default port
  `DECK_CDP_PORT=8081`)
- For probes that issue privileged ops: `DECK_SUDO_PASS` in `.env`
  (gitignored)

## CLI entry points

```bash
# CDP probes / diag
python3 devkit/cli.py diag list
python3 devkit/cli.py diag run <name>

# CDP eval
python3 devkit/cdp.py eval bp 'document.title'

# Screenshots
pnpm screenshots

# Perf bench
pnpm perf:bench
```

## Using as a submodule in another plugin project

```bash
git submodule add https://github.com/<your>/Deck-Shelves devkit
git config -f .gitmodules submodule.devkit.shallow true
git submodule update --init --recursive --depth 1
```

The `cli.py` + `cdp.py` + generic probes work out of the box once
`DECK_HOST` / `DECK_USER` are set. Project-coupled `diag_*` scripts are
templates — copy, rename, swap the selectors / globals for your own.
