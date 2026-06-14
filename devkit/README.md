# Deck Shelves Devkit

CDP probes, screenshot pipeline, and perf bench used to develop the
Deck Shelves Decky plugin against a real Steam Deck running Decky
Loader. The scripts target Chrome DevTools Protocol over SSH and a
small Python CLI on top.

> **Note.** While this folder lives inside the plugin repo, it is
> structured to extract cleanly into a standalone repository. The
> sub-folders (`cdp/`, `screenshots/`) mirror the package layout the
> extracted repo will use. The actual scripts still live at
> `scripts/devtools/deck/` in this repo for now — the imminent split
> will physically move them under this folder.

## Contents

- `cdp/` — Chrome DevTools Protocol wrapper + a library of single-purpose
  probes that read live Steam DOM / state.
- `screenshots/` — Localised screenshot pipeline (drives the QAM to take
  shots per locale).

## CLI entry point (current location)

```bash
# CDP probes
python3 scripts/devtools/deck/cli.py diag --list
python3 scripts/devtools/deck/cli.py diag run <name>

# CDP eval
python3 scripts/devtools/deck/cdp.py eval bp 'document.title'

# Screenshots
pnpm screenshots

# Perf bench
pnpm perf:bench
```

These will move to `devkit/cdp/cli.py` + `devkit/cdp/cdp.py` +
`devkit/screenshots/pipeline.py` when the split happens.

## Requirements

- Python 3.10+
- A Steam Deck reachable over SSH (`DECK_HOST`, `DECK_USER` env vars)
- Steam started with CDP enabled (`-cef-enable-debugging`, default port
  `DECK_CDP_PORT=8081`)
- For probes that issue privileged ops: `DECK_SUDO_PASS` in `.env`
  (gitignored)

See `cdp/probes/README.md` for the convention used by reusable probes.
