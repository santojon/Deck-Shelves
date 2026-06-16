// Devkit selector & runtime-key registry (JS mirror of selectors.py).
//
// Centralises every DOM selector / global var / route the devkit tools poke
// at so they can be swapped per-project via env vars without forking the
// devkit. Defaults match the Deck Shelves plugin.
//
//   DEVKIT_HOME_MOUNT_ID          # default: deck-shelves-home-root
//   DEVKIT_QAM_SCOPE_SEL          # default: .deck-shelves-qam-scope
//   DEVKIT_ROOT_SEL               # default: .deck-shelves-root
//   DEVKIT_SHELF_SEL              # default: .ds-shelf
//   DEVKIT_ROW_SEL                # default: .ds-row-scroll
//   DEVKIT_CARD_SEL               # default: .ds-card
//   DEVKIT_FOCUS_CLASS            # default: gpfocus
//   DEVKIT_VIEWPORT_SEL           # default: ._3PhGYbMWIcIaZCfllWN19N
//   DEVKIT_NEWS_SEL               # default: .cE1SaW6jrVUDxcqRtyMo1
//   DEVKIT_COLLAPSIBLE_HEADER_SEL # default: .ds-collapsible-header
//   DEVKIT_ABOUT_ROUTE            # default: /deck-shelves/about
//   DEVKIT_CLASS_MAP_GLOBAL       # default: __DS_CLASS_MAP
//   DEVKIT_CLASS_MAP_LS_KEY       # default: ds_class_map
//   DEVKIT_PROJECT_LABEL          # default: deck-shelves (used by console filter)
//   DEVKIT_SETTINGS_GLOBAL        # default: __DECK_SHELVES_SHARED_SETTINGS__
'use strict';

function envOr(name, fallback) {
  const v = process.env[name];
  return v && v.length ? v : fallback;
}

const SELECTORS = {
  HOME_MOUNT_ID:          envOr('DEVKIT_HOME_MOUNT_ID',          'deck-shelves-home-root'),
  QAM_SCOPE_SEL:          envOr('DEVKIT_QAM_SCOPE_SEL',          '.deck-shelves-qam-scope'),
  ROOT_SEL:               envOr('DEVKIT_ROOT_SEL',               '.deck-shelves-root'),
  SHELF_SEL:              envOr('DEVKIT_SHELF_SEL',              '.ds-shelf'),
  ROW_SEL:                envOr('DEVKIT_ROW_SEL',                '.ds-row-scroll'),
  CARD_SEL:               envOr('DEVKIT_CARD_SEL',               '.ds-card'),
  FOCUS_CLASS:            envOr('DEVKIT_FOCUS_CLASS',            'gpfocus'),
  VIEWPORT_SEL:           envOr('DEVKIT_VIEWPORT_SEL',           '._3PhGYbMWIcIaZCfllWN19N'),
  NEWS_SEL:               envOr('DEVKIT_NEWS_SEL',               '.cE1SaW6jrVUDxcqRtyMo1'),
  COLLAPSIBLE_HEADER_SEL: envOr('DEVKIT_COLLAPSIBLE_HEADER_SEL', '.ds-collapsible-header'),
  ABOUT_ROUTE:            envOr('DEVKIT_ABOUT_ROUTE',            '/deck-shelves/about'),
  CLASS_MAP_GLOBAL:       envOr('DEVKIT_CLASS_MAP_GLOBAL',       '__DS_CLASS_MAP'),
  CLASS_MAP_LS_KEY:       envOr('DEVKIT_CLASS_MAP_LS_KEY',       'ds_class_map'),
  PROJECT_LABEL:          envOr('DEVKIT_PROJECT_LABEL',          'deck-shelves'),
  SETTINGS_GLOBAL:        envOr('DEVKIT_SETTINGS_GLOBAL',        '__DECK_SHELVES_SHARED_SETTINGS__'),
};

// Substitute the canonical Deck Shelves strings baked into raw probe
// snippets with the env-driven values. Idempotent — runs are no-ops when
// the snippet already uses the configured values.
function applySelectors(expr) {
  if (typeof expr !== 'string') return expr;
  return expr
    .replace(/deck-shelves-home-root/g, SELECTORS.HOME_MOUNT_ID)
    .replace(/\.deck-shelves-qam-scope/g, SELECTORS.QAM_SCOPE_SEL)
    .replace(/\.deck-shelves-root/g, SELECTORS.ROOT_SEL)
    .replace(/\.ds-shelf/g, SELECTORS.SHELF_SEL)
    .replace(/\.ds-row-scroll/g, SELECTORS.ROW_SEL)
    .replace(/\.ds-card/g, SELECTORS.CARD_SEL)
    .replace(/gpfocus/g, SELECTORS.FOCUS_CLASS)
    .replace(/\._3PhGYbMWIcIaZCfllWN19N/g, SELECTORS.VIEWPORT_SEL)
    .replace(/\.cE1SaW6jrVUDxcqRtyMo1/g, SELECTORS.NEWS_SEL)
    .replace(/\.ds-collapsible-header/g, SELECTORS.COLLAPSIBLE_HEADER_SEL)
    .replace(/__DECK_SHELVES_SHARED_SETTINGS__/g, SELECTORS.SETTINGS_GLOBAL)
    .replace(/__DS_CLASS_MAP/g, SELECTORS.CLASS_MAP_GLOBAL);
}

module.exports = { ...SELECTORS, applySelectors };
