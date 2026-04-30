import type { SmartShelfMode } from "../types";

/**
 * Per-mode default smart parameters and UI metadata.
 *
 * Smart shelves are heuristic — each mode has hardcoded thresholds (e.g.
 * `quick_play` uses `playtime < 120 min`, `rediscover` uses `last played
 * > 6 months ago`). This module exposes those thresholds as named
 * parameters that the user can override per-shelf via the EditSmartShelfModal
 * Source tab, while keeping the defaults in one place for the resolvers in
 * `smartShelves.ts` to fall back to.
 *
 * Adding a new param:
 *   1. Add it to `SMART_PARAM_DEFAULTS[mode]` with a sensible default.
 *   2. Add metadata to `SMART_PARAM_META` (i18n label key, min/max/step).
 *   3. Read it from inside the resolver via `getParam(params, "...", default)`.
 */

export type SmartParams = Record<string, number>;

/**
 * Default explicit sort per smart-shelf mode. These are the closest public
 * sort enums to each mode's natural ordering — used to seed the sort
 * dropdown when a shelf has no explicit `sort` set, so the UI never shows
 * an empty selection for an existing or freshly-created smart shelf.
 *
 * The resolver itself still applies the mode's internal sort when no
 * `sort` override is set; this map is purely for surfacing a sane
 * default to the user.
 */
export const DEFAULT_SORT_FOR_MODE: Record<SmartShelfMode, string> = {
  quick_play:      "recent",
  not_started:     "alphabetical",
  deck_picks:      "recent",
  rediscover:      "playtime",
  best_unplayed:   "alphabetical",
  interrupted:     "recent",
  time_of_day:     "recent",
  daily_pick:      "random",
  on_deck:         "recent",
  recently_played: "recent",
  long_session:    "playtime",
  non_steam:       "recent",
  random_pick:     "random",
  forgotten:       "added",
  spare_time:      "recent",
  custom:          "alphabetical",
};

export const SMART_PARAM_DEFAULTS: Record<SmartShelfMode, SmartParams> = {
  quick_play:      { maxPlaytimeMinutes: 120, minDeckLevel: 2 },
  not_started:     { minDeckLevel: 0 },
  deck_picks:      { minDeckLevel: 3 },
  rediscover:      { monthsAgo: 6, minPlaytimeMinutes: 60, minDeckLevel: 2 },
  best_unplayed:   { minDeckLevel: 0 },
  interrupted:     { minPlaytimeMinutes: 30, maxPlaytimeMinutes: 180, minDeckLevel: 0 },
  time_of_day:     {},
  daily_pick:      {},
  on_deck:         { minDeckLevel: 2 },
  recently_played: { daysAgo: 30 },
  long_session:    { minPlaytimeMinutes: 180, minDeckLevel: 0 },
  non_steam:       {},
  random_pick:     {},
  forgotten:       { yearsAgo: 3 },
  spare_time:      { maxPlaytimeMinutes: 120, minDeckLevel: 0 },
  custom:          {},
};

export type SmartParamKind = "slider" | "text" | "dropdown";

export type SmartParamOption = {
  value: number;
  /** i18n key for this option's label. */
  labelKey: string;
};

export type SmartParamMeta = {
  /** i18n key for the field label. */
  labelKey: string;
  min: number;
  max: number;
  step: number;
  /** i18n key for the unit suffix shown after the value (e.g. "min", "days"). */
  unitKey?: string;
  /** Render kind. Defaults to "slider" when omitted. */
  kind?: SmartParamKind;
  /** Discrete options when `kind === "dropdown"`. */
  options?: ReadonlyArray<SmartParamOption>;
};

/**
 * UI hints per param key. Same key may appear in multiple modes (e.g.
 * `maxPlaytimeMinutes`); the metadata is shared.
 */
export const SMART_PARAM_META: Record<string, SmartParamMeta> = {
  // Playtime knobs as numeric text fields — sliders are too coarse for free-form
  // minute values; users typically know the threshold they want.
  maxPlaytimeMinutes: { labelKey: "smart_param_max_playtime", min: 0,  max: 6000, step: 30, unitKey: "smart_unit_min", kind: "text" },
  minPlaytimeMinutes: { labelKey: "smart_param_min_playtime", min: 0,  max: 6000, step: 30, unitKey: "smart_unit_min", kind: "text" },
  // Lookback knobs stay as sliders — small, capped ranges fit a slider naturally.
  monthsAgo:          { labelKey: "smart_param_months_ago",   min: 1,  max: 60,   step: 1,  unitKey: "smart_unit_months" },
  yearsAgo:           { labelKey: "smart_param_years_ago",    min: 1,  max: 10,   step: 1,  unitKey: "smart_unit_years" },
  daysAgo:            { labelKey: "smart_param_days_ago",     min: 1,  max: 365,  step: 7,  unitKey: "smart_unit_days" },
  // Steam Deck compatibility threshold rendered as a dropdown with localized
  // option labels (numbers `0..3` mirror Steam's `deck_compatibility_category`).
  minDeckLevel: {
    labelKey: "smart_param_min_deck_level",
    min: 0, max: 3, step: 1,
    kind: "dropdown",
    options: [
      { value: 0, labelKey: "smart_deck_level_any" },
      { value: 1, labelKey: "smart_deck_level_unsupported" },
      { value: 2, labelKey: "smart_deck_level_playable" },
      { value: 3, labelKey: "smart_deck_level_verified" },
    ],
  },
};

/**
 * Returns the param keys a given mode supports, in stable order. Empty for
 * modes that have no tunable parameters (the EditSmartShelfModal will hide
 * the params section in that case).
 */
export function paramKeysForMode(mode: SmartShelfMode): string[] {
  return Object.keys(SMART_PARAM_DEFAULTS[mode] ?? {});
}

/**
 * Resolve the effective value for a param: user override → mode default → 0.
 */
export function getParam(
  mode: SmartShelfMode,
  params: SmartParams | undefined,
  key: string,
): number {
  const override = params?.[key];
  if (typeof override === "number" && Number.isFinite(override)) return override;
  const def = SMART_PARAM_DEFAULTS[mode]?.[key];
  return typeof def === "number" ? def : 0;
}
