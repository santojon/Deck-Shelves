# Changelog — Deck Shelves Devkit

All notable technical changes to the devkit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **`diag_search_state.cjs`** — Quick Search state inspector. Reads the
  diagnostic globals SearchOverlay exposes: `__ds_search_mounted`,
  `__ds_search_enabled`, `__ds_shelf_registry_size`, `__ds_search_pool`,
  `__ds_search_last` (= `{ q, pool, hits }`), `__ds_search_active`
  (`{ isInput, activeTag, type, tabIndex, kb }`), `__ds_input_bp_view`.
  Use it to confirm "is the search subscribed", "did the pool populate",
  and "did the last query find anything".
- **`diag_search_pool.cjs`** — pool-content dump. Walks every
  `.ds-shelf[data-shelfid]` in the BP doc and emits each card's
  `{ shelf, appid, name }`. Optional first CLI arg filters by substring;
  emits `Matches: NONE — game is not in the rendered pool.` when the
  filter doesn't hit anything. Used to answer "search doesn't find X" —
  if X isn't in the dump, the owning shelf's `limit` cuts it off and no
  algorithm change will help.
- **`diag_sidenav_focus.cjs`** — Side Nav open + focus diagnostics.
  Reports `__ds_sidenav_open` (the shelfId / appid `tryOpen` inferred),
  `__ds_sidenav_focus` (per-retry: `targetId`, hit/miss against
  `rowRefs.current`, available `keys`), and the visible shelf list from
  the DOM sorted by visual `top`. When `hit: false` and `targetId` isn't
  in `keys`, the open-path is reading a shelfId the panel never renders.
- **`diag_keyboard_state.cjs`** — Steam Deck on-screen keyboard inspector.
  Reports `document.activeElement` in BP (Steam+X's gate), the pill
  input's attribute set (`type`, `tabIndex`, `inputmode`, `autocomplete`,
  `enterkeyhint`, etc.), `__ds_search_active` from the last focus retry,
  and the list of `Keyboard*` methods exposed by `SteamClient.Input`.
  Confirmed via this probe that there's no programmatic `Open` API —
  only `ModalKeyboardDismissed` / `StandaloneKeyboardDismissed`
  notifiers — so the synthetic touch-pointer sequence in SearchOverlay
  is the only working popup path.
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
