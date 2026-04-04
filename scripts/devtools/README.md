# Deck Devtools

Structured diagnostics and smoke-test tools for Steam Deck development.

## Goals

- Reuse CDP/SSH diagnostics in a consistent way.
- Enable automated runtime checks after deploy.
- Keep troubleshooting scripts versioned with the plugin.

## Tools

- `scripts/devtools/deck/cdp_probe.py`
  - CDP probe that runs on the Deck and returns JSON diagnostics.
  - Modes:
    - `mount`: validates mount + viewport order data.
    - `rows`: lists rendered rows and card counts.
    - `smoke`: assertion-based smoke test (non-zero exit on failure).

- `scripts/deck/deck-diag.sh`
  - Wrapper that copies probe to Deck and runs one mode.

- `scripts/deck/deck-smoke-test.sh`
  - Runs `mount`, `rows`, and `smoke` checks as one command.

## Usage

```bash
# Single diagnostics
bash scripts/deck/deck-diag.sh steamdeck mount
bash scripts/deck/deck-diag.sh steamdeck rows

# Automated smoke test
bash scripts/deck/deck-smoke-test.sh steamdeck
```

## Suggested CI-style local workflow

```bash
pnpm run build:plugin
pnpm run deploy:deck steamdeck
pnpm run test:deck:smoke steamdeck
```

## Notes

 - These tools use the environment variable `DECK_CDP_HOST` and `DECK_CDP_PORT` to locate the Deck DevTools endpoint.
 - The `scripts/devtools/deck/cli.py` automatically loads `.env` from the project root (if present) and will set `DECK_CDP_HOST` from `DECK_HOST` when `DECK_CDP_HOST` is not provided.
 - They are runtime checks, complementary to `pnpm run typecheck`.
