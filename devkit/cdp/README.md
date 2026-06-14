# `devkit/cdp` — CDP wrapper + probes

## Layout (target — after the imminent split)

```
cdp/
├── cdp.py        # main CDP CLI (targets, eval, screenshot, console)
├── cli.py        # devkit umbrella CLI (delegates to cdp.py / probes / screenshots)
├── lib/          # shared Python helpers (target discovery, eval, etc.)
└── probes/       # JS / CJS probes (one self-contained file each)
```

Until the split, the actual files live at `scripts/devtools/deck/`:

- `scripts/devtools/deck/cdp.py` — CDP CLI
- `scripts/devtools/deck/cli.py` — umbrella CLI
- `scripts/devtools/deck/lib/` — Python helpers
- `scripts/devtools/deck/diag/` — JS / CJS probes (`diag_*.cjs`, `_probe_*.cjs`)
- `scripts/devtools/deck/diag/_lib/cdp.cjs` — Node-side CDP helper used
  by every CJS probe

## Probe convention

A reusable probe (the new style) **takes its inputs via env vars** and
**emits JSON to stdout**. No hardcoded selectors, no hardcoded host /
target, no hardcoded result keys. Two examples already in the repo:

### `probe_theme_vars.cjs`

Inputs:

- `PROBE_TARGET` — CDP target id (default `bp`)
- `PROBE_SELECTORS` — comma-separated CSS selectors to probe (defaults to
  `documentElement,body`)
- `PROBE_VARS` — comma-separated CSS variable names to read off each
  selector (e.g. `--main-editor-bg-color,--basicui-header-bg-color`)

Output (JSON):

```json
{
  "target": "bp",
  "values": {
    "documentElement": { "--main-editor-bg-color": "" }
  }
}
```

### `probe_slider_field.cjs`

Inputs:

- `PROBE_TARGET` — CDP target id (default `bp`)
- `PROBE_SCOPE` — CSS selector that scopes the search (e.g.
  `.deck-shelves-qam`)
- `PROBE_MAX` — cap on number of sliders to report

Output (JSON):

```json
{
  "target": "bp",
  "sliders": [
    { "track_inner_width_px": 380, "value": 42, "min": 0, "max": 100 }
  ]
}
```

## Adding a new probe

1. Drop a new `probe_<name>.cjs` next to the existing ones
   (`scripts/devtools/deck/diag/` for now, will move under
   `devkit/cdp/probes/` after the split).
2. Read inputs from `process.env`. Do not hardcode targets or selectors.
3. Print exactly one JSON object to stdout. Errors go to stderr +
   non-zero exit code.
4. Document the env vars in the file header so callers don't have to
   read the implementation.
