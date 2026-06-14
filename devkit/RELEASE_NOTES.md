# Release Notes — Deck Shelves Devkit

## [Unreleased]

- Two new reusable CDP probes — `probe_theme_vars.cjs` and
  `probe_slider_field.cjs`. Both are parameterised via env vars so the
  same script can answer different questions without code edits.
- Top-level `devkit/` scaffold added in preparation for the imminent
  split into a standalone repository (the scripts still live under
  `scripts/devtools/deck/` for now; the split moves them under this
  folder).
