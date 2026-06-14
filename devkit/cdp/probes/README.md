# Reusable CDP probes

This folder will host the reusable, parameterised CDP probes after the
imminent split. Until then, see `scripts/devtools/deck/diag/` in the
parent repo for the actual files.

The two recent additions establish the pattern:

- `probe_theme_vars.cjs` — read CSS custom-property values off arbitrary
  selectors. Driven by `PROBE_TARGET` / `PROBE_SELECTORS` / `PROBE_VARS`.
- `probe_slider_field.cjs` — measure the live inner track width of
  Decky `SliderField` instances under a chosen scope. Driven by
  `PROBE_TARGET` / `PROBE_SCOPE` / `PROBE_MAX`.

See `../README.md` for the convention.
