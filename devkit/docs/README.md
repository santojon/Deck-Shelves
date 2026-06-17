# DeckProbe — usage docs

End-to-end examples for using the toolkit against a live Steam Deck.

## Table of contents

- [Connection setup](#connection-setup)
- [Running CDP probes](#running-cdp-probes)
- [Writing a custom probe](#writing-a-custom-probe)
- [Retargeting to your plugin](#retargeting-to-your-plugin)
- [Screenshot pipeline](#screenshot-pipeline)
- [Perf bench](#perf-bench)
- [Class-map injection](#class-map-injection)
- [CDP target conventions](#cdp-target-conventions)
- [Common pitfalls](#common-pitfalls)

## Connection setup

DeckProbe expects an `.env` file at the parent repo root (the repo that
contains the `devkit/` folder). The CLI auto-loads it before invoking
any subcommand, so individual scripts never need to know about it.

Minimum `.env`:

```bash
DECK_HOST=192.168.1.42       # IP or hostname of the deck
DECK_USER=deck               # SSH user (almost always `deck`)
DECK_SUDO_PASS=...           # SteamOS password, used for `sudo -S`
DECK_CDP_PORT=8081           # default CDP port
# DECK_CDP_HOST=...          # only if you tunnel CDP; defaults to DECK_HOST
```

Make sure Steam is launched with CDP enabled. On SteamOS that's the
default when Decky is installed; otherwise add `--cef-enable-debugging`
to the Steam launch flags.

Verify connectivity:

```bash
curl -s http://$DECK_HOST:$DECK_CDP_PORT/json | python3 -m json.tool
```

You should see a list of CDP targets — at minimum SharedJSContext and
Steam — Big Picture.

## Running CDP probes

```bash
# List every diag script available (built-in + your project's)
python3 devkit/cli.py diag list

# Run a probe (target auto-resolved from a substring of its title)
python3 devkit/cli.py diag run diag_layout

# Smoke probe of the home: ensures mount + rows + cards are present
python3 devkit/cli.py probe --mode smoke

# Inspect every row's title + card count + cards in the home mount
python3 devkit/cli.py probe --mode rows
```

The `cli.py` script forwards arguments straight to the chosen probe and
inherits the `.env`-loaded environment.

## Writing a custom probe

The simplest probe is a `.cjs` file that imports `runAndPrint` from the
shared CDP helper, builds a JS expression as a string, and pipes the
result to stdout:

```js
// devkit/diag/diag_card_count.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp');

const expr = `(function(){
  const mount = document.getElementById('deck-shelves-home-root');
  if (!mount) return { error: 'no mount' };
  return {
    cards: mount.querySelectorAll('.ds-card').length,
    rows:  mount.querySelectorAll('.ds-row-scroll').length,
  };
})()`;

runAndPrint('bp', expr);
```

Run it:

```bash
node devkit/diag/diag_card_count.cjs
```

When this exact expression runs against a plugin OTHER than the default
project, `_lib/cdp.cjs` automatically swaps every default selector for
the configured one (`DEVKIT_HOME_MOUNT_ID`, `DEVKIT_CARD_SEL`, …). No
edits required — write the probe once, run it everywhere.

## Retargeting to your plugin

DeckProbe ships with selector defaults that match the Deck Shelves home
mount. To target a different plugin's DOM:

```bash
DEVKIT_HOME_MOUNT_ID=my-plugin-home-root \
DEVKIT_CARD_SEL='.card-grid > .card' \
DEVKIT_ROW_SEL='.card-grid' \
DEVKIT_QAM_SCOPE_SEL='.my-plugin-qam' \
DEVKIT_ABOUT_ROUTE='/my-plugin/about' \
python3 devkit/cli.py probe --mode smoke
```

The full list lives in `devkit/lib/selectors.py` (Python) and
`devkit/lib/selectors.cjs` (Node). Both files document every env var.

For project-specific diag scripts that don't fit the generic pattern,
drop them in `scripts/devkit-ext/` at the parent repo root and the CLI
will pick them up automatically:

```
my-plugin/
├── devkit/                    # this toolkit (submodule or copy)
├── scripts/
│   └── devkit-ext/
│       └── diag/
│           └── my_custom_probe.cjs
└── .env
```

You can also point `DEVKIT_DIAG_DIRS=...` at any folder hierarchy you
prefer (colon-separated, like `PATH`).

## Screenshot pipeline

```bash
# Take screenshots in every supported locale
python3 devkit/cli.py screenshot

# Single locale only
python3 devkit/cli.py screenshot --locale en-US

# Keep previous output instead of wiping `screenshots/out/`
python3 devkit/cli.py screenshot --keep-existing
```

The pipeline navigates the deck through canonical states (home, QAM,
about, settings detail panels), captures each, and writes localised
results to `screenshots/out/<locale>/`. Point
`DEVKIT_SCREENSHOT_SCRIPT=...` at a project-specific entry point if you
need to customise the navigation flow.

## Perf bench

```bash
pnpm --filter @steamdeck/devkit perf:bench
# or
python3 devkit/perf-bench.py
```

Captures frame-time + memory snapshots over a configurable window. The
output goes to `perf-output/` as JSON. Use as a regression gate when
changing the home rendering path.

## Class-map injection

Steam re-randomises its CSS-Modules class hashes on every minor update.
DeckProbe ships a class-map injector so probes / overlays survive those
updates without code changes.

```bash
CLASS_MAP='{"viewport":"_3PhG...","row":"ds-row-scroll","card":"ds-card"}' \
DEVKIT_CLASS_MAP_GLOBAL=__MY_PLUGIN_CLASS_MAP \
DEVKIT_CLASS_MAP_LS_KEY=my_plugin_class_map \
python3 devkit/tools/inject_classmap.py
```

The injector writes the map to both `window[...GLOBAL]` (live) and
`localStorage[...LS_KEY]` (persistent across reloads).

## CDP target conventions

Probes accept a short target alias resolved by `_lib/cdp.cjs` /
`lib/cdp.py`:

| Alias       | Resolves to (title substring) |
| ----------- | ----------------------------- |
| `bp`        | Big Picture                   |
| `qam`       | QuickAccess                   |
| `shared`    | SharedJSContext               |
| `mainmenu`  | MainMenu                      |
| `<prefix>`  | Any CDP target id prefix      |

You can also pass the full 32-char target id directly.

## Common pitfalls

- **Probe runs but returns `{}`** — most often the wrong target. The
  home mount lives in `bp`, the QAM scope in `qam`, plugin-module state
  in `shared`. Try `--target` or use the alias table above.
- **CDP returns the wrong target** — Steam reuses target ids across
  reloads. Pass the full id if a prefix matches more than one target.
- **`offsetHeight === 0`** — Steam often renders hidden containers as
  zero-height shells. Use `getBoundingClientRect()` AND check for
  visible focusable descendants instead of trusting `offsetHeight`.
- **Promise hangs forever** — wrap any backend RPC in a timeout. Decky
  RPCs occasionally stall and the CDP probe never returns.
- **Stale classes** — re-run `inject_classmap.py` after a Steam update,
  or your selectors will miss everything Steam now hashes differently.
