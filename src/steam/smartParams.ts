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

export const SMART_PARAM_DEFAULTS: Record<SmartShelfMode, SmartParams> = {
  quick_play:      { maxPlaytimeMinutes: 120 },
  not_started:     {},
  deck_picks:      {},
  rediscover:      { monthsAgo: 6, minPlaytimeMinutes: 60 },
  best_unplayed:   {},
  interrupted:     { minPlaytimeMinutes: 30, maxPlaytimeMinutes: 180 },
  time_of_day:     {},
  daily_pick:      {},
  on_deck:         {},
  recently_played: { daysAgo: 30 },
  long_session:    { minPlaytimeMinutes: 180 },
  non_steam:       {},
  random_pick:     {},
  forgotten:       { yearsAgo: 3 },
  spare_time:      {},
};

export type SmartParamMeta = {
  /** i18n key for the slider label. */
  labelKey: string;
  min: number;
  max: number;
  step: number;
  /** i18n key for the unit suffix shown after the value (e.g. "min", "days"). */
  unitKey?: string;
};

/**
 * UI hints per param key. Same key may appear in multiple modes (e.g.
 * `maxPlaytimeMinutes`); the metadata is shared.
 */
export const SMART_PARAM_META: Record<string, SmartParamMeta> = {
  maxPlaytimeMinutes: { labelKey: "smart_param_max_playtime", min: 0,  max: 6000, step: 30, unitKey: "smart_unit_min" },
  minPlaytimeMinutes: { labelKey: "smart_param_min_playtime", min: 0,  max: 6000, step: 30, unitKey: "smart_unit_min" },
  monthsAgo:          { labelKey: "smart_param_months_ago",   min: 1,  max: 60,   step: 1,  unitKey: "smart_unit_months" },
  yearsAgo:           { labelKey: "smart_param_years_ago",    min: 1,  max: 10,   step: 1,  unitKey: "smart_unit_years" },
  daysAgo:            { labelKey: "smart_param_days_ago",     min: 1,  max: 365,  step: 7,  unitKey: "smart_unit_days" },
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
