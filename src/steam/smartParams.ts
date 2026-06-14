import type { SmartShelfMode } from "../types";

export type SmartParams = Record<string, number>;

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
  soundtracks:     "alphabetical",
  videos:          "alphabetical",
  demos:           "recent",
  cloud_games:     "recent",
  // Heuristic templates — internal ordering takes precedence,
  // so the sort field is the post-resolve fallback applied after the
  // heuristic ranks the candidate pool.
  backlog_rescue:        "recent",
  forgotten_gems:        "review_score",
  weekly_rotation:       "alphabetical",
  // Second-wave heuristic templates.
  short_battery:         "recent",
  long_session_night:    "playtime",
  travel_mode:           "size_on_disk",
  hidden_gems:           "review_score",
  never_touched_classics:"added",
  recent_hidden_installs:"added",
  monthly_spotlight:     "alphabetical",
  seasonal_rotation:     "alphabetical",
  // Runtime-aware templates (battery / achievements / store categories).
  low_battery_mode:      "recent",
  almost_finished:       "review_score",
  couch_gaming:          "recent",
  coop_ready:            "recent",
  party_games:           "recent",
  friends_playing:       "recent",
  custom:                "alphabetical",
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
  // Media + cloud-only templates take no tuning knobs — the filter is
  // entirely defined by their app_type / collection match.
  soundtracks:     {},
  videos:          {},
  demos:           {},
  cloud_games:     {},
  // heuristic templates. Defaults chosen so the resolver
  // surfaces a reasonable shelf on a fresh install without forcing the
  // user into the smart-params editor.
  backlog_rescue:         { minPlaytimeMinutes: 60, stalenessDays: 30, cooldownDays: 14, minDeckLevel: 0 },
  forgotten_gems:         { minMetacritic: 80, minReviewScore: 85, minDeckLevel: 0 },
  weekly_rotation:        { rotateEveryDays: 7, minDeckLevel: 0 },
  // Second-wave heuristic templates.
  short_battery:          { maxPlaytimeMinutes: 120, maxSizeMb: 4096, minDeckLevel: 2 },
  long_session_night:     { minPlaytimeMinutes: 180, minDeckLevel: 0 },
  travel_mode:            { maxSizeMb: 5120, minDeckLevel: 2 },
  hidden_gems:            { minReviewScore: 85, minDeckLevel: 0 },
  never_touched_classics: { yearsAgo: 3, minDeckLevel: 0 },
  recent_hidden_installs: { daysAgo: 30, minDeckLevel: 0 },
  monthly_spotlight:      { rotateEveryDays: 30, minDeckLevel: 0 },
  seasonal_rotation:      { rotateEveryDays: 90, minDeckLevel: 0 },
  // Runtime-aware templates.
  low_battery_mode:       { batteryThresholdPct: 30, maxPlaytimeMinutes: 120, maxSizeMb: 4096, minDeckLevel: 2 },
  almost_finished:        { minAchievementPct: 70, minDeckLevel: 0 },
  couch_gaming:           { minDeckLevel: 0 },
  coop_ready:             { minDeckLevel: 0 },
  party_games:            { minDeckLevel: 0 },
  // includeRecentlyPlayed: 0 = only currently in-game RIGHT NOW; 1 = also
  // include apps any friend was seen playing in the last ~14 days. Default
  // 1 because "no friends in-game right this second" is the common case
  // even with a healthy friends list; the recently-played fallback keeps
  // the shelf populated.
  friends_playing:        { minDeckLevel: 0, includeRecentlyPlayed: 1 },
  custom:                 {},
};

export type SmartParamKind = "slider" | "text" | "dropdown";

export type SmartParamOption = {
  value: number;
  labelKey: string;
};

export type SmartParamMeta = {
  labelKey: string;
  min: number;
  max: number;
  step: number;
  unitKey?: string;
  kind?: SmartParamKind;
  options?: ReadonlyArray<SmartParamOption>;
};

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
  // Heuristic-template knobs.
  stalenessDays:    { labelKey: "smart_param_staleness_days",   min: 7,  max: 365, step: 7, unitKey: "smart_unit_days" },
  cooldownDays:     { labelKey: "smart_param_cooldown_days",    min: 0,  max: 60,  step: 1, unitKey: "smart_unit_days" },
  minMetacritic:    { labelKey: "smart_param_min_metacritic",   min: 0,  max: 100, step: 5 },
  minReviewScore:   { labelKey: "smart_param_min_review_score", min: 0,  max: 100, step: 5 },
  rotateEveryDays:  { labelKey: "smart_param_rotate_every_days", min: 1, max: 120, step: 1, unitKey: "smart_unit_days" },
  // Second-wave heuristic-template knobs.
  maxSizeMb:        { labelKey: "smart_param_max_size_mb",       min: 256, max: 51200, step: 256, unitKey: "smart_unit_mb", kind: "text" },
  // Runtime-aware template knobs.
  batteryThresholdPct: { labelKey: "smart_param_battery_threshold", min: 5, max: 100, step: 5, unitKey: "smart_unit_pct" },
  minAchievementPct:   { labelKey: "smart_param_min_achievement",   min: 0, max: 99, step: 5, unitKey: "smart_unit_pct" },
  includeRecentlyPlayed: {
    labelKey: "smart_param_include_recently_played",
    min: 0, max: 1, step: 1,
    kind: "dropdown",
    options: [
      { value: 0, labelKey: "smart_param_recently_played_no" },
      { value: 1, labelKey: "smart_param_recently_played_yes" },
    ],
  },
};

export function paramKeysForMode(mode: SmartShelfMode): string[] {
  return Object.keys(SMART_PARAM_DEFAULTS[mode] ?? {});
}

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
