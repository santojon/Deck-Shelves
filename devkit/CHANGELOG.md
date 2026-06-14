## [2026-06-14]

- Moved out of `scripts/devtools/deck/` into its own folder. Self-contained
  Python package layout (`__init__.py` at every level); imports rewritten
  from `scripts.devtools.deck.*` to `devkit.*`.
- Dropped versioning + release notes — devkit is support-only, no releases.
- Repositioned as generic Steam Deck plugin tooling (not Deck Shelves-specific).
  Project-specific scripts stay in the parent plugin repo; generic ones
  (CDP wrapper, parameterised probes, screenshot pipeline, perf bench)
  remain here for reuse by other Decky plugin developers.

## [2026-06-12]

- **`diag_search_state.cjs`** — Quick Search state inspector.
- **`diag_search_pool.cjs`** — pool-content dump (substring filter).
- **`diag_sidenav_focus.cjs`** — Side Nav open + focus diagnostics.
- **`diag_keyboard_state.cjs`** — Steam Deck on-screen keyboard inspector.
- **`probe_theme_vars.cjs`** — parameterised theme variable probe via
  `PROBE_TARGET` / `PROBE_SELECTORS` / `PROBE_VARS` env vars.
- **`probe_slider_field.cjs`** — parameterised slider probe via
  `PROBE_TARGET` / `PROBE_SCOPE` / `PROBE_MAX`.
