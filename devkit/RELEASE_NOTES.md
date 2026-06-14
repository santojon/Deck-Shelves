# Release Notes — Deck Shelves Devkit

## [Unreleased]

- Four new CDP diagnostic probes for the Quick Search + Side Nav surface
  — `diag_search_state.cjs` (summary of subscriber + last query),
  `diag_search_pool.cjs` (game-by-game pool dump with optional name
  filter), `diag_sidenav_focus.cjs` (open / focus inference), and
  `diag_keyboard_state.cjs` (Steam Deck on-screen keyboard internals).
  Use them in order when answering "search doesn't find X" or "Side Nav
  lands on the wrong shelf".
- Two new reusable CDP probes — `probe_theme_vars.cjs` and
  `probe_slider_field.cjs`. Both are parameterised via env vars so the
  same script can answer different questions without code edits.
- Top-level `devkit/` scaffold added in preparation for the imminent
  split into a standalone repository (the scripts still live under
  `scripts/devtools/deck/` for now; the split moves them under this
  folder).
