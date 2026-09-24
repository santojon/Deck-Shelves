# CDP CLI

*[Leia em português](pt-BR/cdp.md)*

`deckprobe/cdp.py` is a small wrapper around Chrome DevTools Protocol that covers the day-to-day debugging loop against a live Steam client: pick a target, run a probe, inspect the result. It replaces the ad-hoc `cdp_eval.py` / `cdp_probe.py` pair under `tools/` for the common cases, and works the same way whether the target is a Steam Deck, a desktop Big Picture session, or a local dev client — on SteamOS, Linux, macOS, or Windows.

## Prerequisites

- CEF remote debugging enabled on the target Steam client (default port `8081`), and Big Picture / Game Mode open. How to enable it depends on the target's OS:
  - **SteamOS / Steam Deck** — enabled automatically once Decky Loader is installed; no manual step needed.
  - **Linux (desktop)** — `touch ~/.steam/steam/.cef-enable-remote-debugging`, then restart Steam.
  - **macOS** — `open -a Steam --args -cef-enable-remote-debugging`.
  - **Windows** — launch Steam with `steam.exe -cef-enable-remote-debugging`.
- `.env` at the repo root with `DECK_HOST` and `DECK_CDP_PORT` (`pnpm run deck:setup` writes a working `.env` for a Deck target on first run; for a local/desktop target set `DECK_HOST=127.0.0.1` and the port you enabled above).
- `pip install websocket-client` on the host running the CLI (only needed for `eval`, `screenshot`, `console` — `targets` works without it).

## Targets and aliases

The target Steam client exposes several CDP surfaces. Use the alias when scripting; the raw target ID is fine for one-offs.

| Alias       | Title fragment       | What it is                                                        |
|-------------|----------------------|-------------------------------------------------------------------|
| `bp`        | `Big Picture`        | The Steam UI shown in Big Picture / Game Mode — shelves, modals, native recents. |
| `qam`       | `QuickAccess`        | The right-side panel where the plugin's settings UI lives.        |
| `sjc`       | `SharedJSContext`    | React tree behind both BP and QAM — best for store/router probes. |
| `mainmenu`  | `MainMenu`           | Big Picture main-menu popup.                                      |

## Subcommands

### `targets`

```
python3 deckprobe/cdp.py targets
```

Lists every CDP target with its alias (if any) and ID. Run this first when an alias stops resolving — Steam build updates occasionally rename a surface.

### `eval`

Evaluate a JS expression in a target. The return value is JSON-serialised when it is an object or array, printed as-is otherwise. Promises are awaited.

```
python3 deckprobe/cdp.py eval bp 'document.title'

# Read expression from stdin (handy for multi-line probes):
echo 'JSON.stringify({n: document.querySelectorAll(".ds-card").length})' \
  | python3 deckprobe/cdp.py eval bp -
```

Errors and rejected promises are written to stderr and exit with code 1, so the CLI is safe to chain in shell pipelines.

### `screenshot`

```
python3 deckprobe/cdp.py screenshot bp /tmp/bp.png
```

Captures the target's viewport as a PNG. The output path is printed on success.

### `console`

Stream `console.{warn,error}` and uncaught exceptions until Ctrl-C. Pass `--all` to also include `log`/`info`. Pass `--duration N` to stop automatically after N seconds (useful in scripted runs).

```
python3 deckprobe/cdp.py console sjc
python3 deckprobe/cdp.py console qam --all --duration 30
```

## Common debug recipes

```
# How many shelves are mounted right now?
python3 deckprobe/cdp.py eval bp \
  'document.querySelectorAll("[data-ds-shelf]").length'

# What does the React store say about the active settings?
python3 deckprobe/cdp.py eval sjc \
  'JSON.stringify(window.__DECK_SHELVES__?.snapshot?.() ?? null)'

# Capture the QAM after toggling a setting:
python3 deckprobe/cdp.py screenshot qam /tmp/qam-after.png
```

## Troubleshooting

- **`alias 'bp' did not match any target`** — Steam is in a transitional state (mid-restart, splash screen). Wait a few seconds and re-run `targets`.
- **`websocket-client not installed`** — `pip install websocket-client` (or `python3 -m pip install --user websocket-client` on the target device itself).
- **Connection refused on the CDP port** — remote debugging isn't enabled on the target client, or Steam hasn't been restarted since enabling it. See the per-OS steps under Prerequisites above.
