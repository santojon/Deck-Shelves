# Changelog — Deck Shelves Devkit

All notable technical changes to the devkit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **`probe_theme_vars.cjs`** — parameterised theme variable probe driven
  by `PROBE_TARGET` / `PROBE_SELECTORS` / `PROBE_VARS` env vars. Used to
  confirm whether Steam exposes specific CSS theme variables (e.g.
  `--main-editor-bg-color`) on the target document.
- **`probe_slider_field.cjs`** — parameterised slider-field probe driven
  by `PROBE_TARGET` / `PROBE_SCOPE` / `PROBE_MAX`. Reports the live
  inner track widths of Decky `SliderField` instances so layout work
  can size against real runtime numbers.
- **Devkit folder scaffold** — top-level `devkit/` directory containing
  `README.md`, this `CHANGELOG.md`, `RELEASE_NOTES.md`, `LICENSE`, and
  `package.json` placeholder. Prepares for the imminent split into a
  standalone repository.
- **`cdp/probes/README.md`** — documents the convention for reusable
  parameterised probes: env-var-driven inputs, JSON outputs, no
  hardcoded targets.

### Notes

- Scripts physically live at `scripts/devtools/deck/...` in this repo
  while the split is staged. The CLI entry points (`cli.py`, `cdp.py`)
  still operate there.
