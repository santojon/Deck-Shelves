import type { SmartShelfMode } from '../../../types'

/* Shared smart-template list. The standalone picker modal was retired in favour
   of the unified CreateShelfModal (Standard + Smart tabs); this list is what its
   Smart tab renders. Kept in this module so the existing import path is stable. */
type SmartTemplateCategory = "status" | "time" | "platform" | "compat" | "other"
type SmartTemplate = { mode: SmartShelfMode; titleKey: string; category: SmartTemplateCategory }

// Ordered by probability of returning results: highest first
export const SMART_TEMPLATES: SmartTemplate[] = [
  { mode: "daily_pick",             titleKey: "smart_template_daily_pick",             category: "time" },
  { mode: "deck_picks",             titleKey: "smart_template_deck_picks",             category: "compat" },
  { mode: "on_deck",                titleKey: "smart_template_on_deck",                category: "status" },
  { mode: "recently_played",        titleKey: "smart_template_recently_played",        category: "time" },
  { mode: "long_session",           titleKey: "smart_template_long_session",           category: "time" },
  { mode: "long_session_night",     titleKey: "smart_template_long_session_night",     category: "time" },
  { mode: "random_pick",            titleKey: "smart_template_random_pick",            category: "other" },
  { mode: "not_started",            titleKey: "smart_template_not_started",            category: "status" },
  { mode: "best_unplayed",          titleKey: "smart_template_best_unplayed",          category: "status" },
  { mode: "quick_play",             titleKey: "smart_template_quick_play",             category: "time" },
  { mode: "short_battery",          titleKey: "smart_template_short_battery",          category: "time" },
  { mode: "interrupted",            titleKey: "smart_template_interrupted",            category: "status" },
  { mode: "non_steam",              titleKey: "smart_template_non_steam",              category: "platform" },
  { mode: "spare_time",             titleKey: "smart_template_spare_time",             category: "time" },
  { mode: "time_of_day",            titleKey: "smart_template_time_of_day",            category: "time" },
  { mode: "rediscover",             titleKey: "smart_template_rediscover",             category: "time" },
  { mode: "forgotten",              titleKey: "smart_template_forgotten",              category: "time" },
  // Heuristic templates — composable curated rows.
  { mode: "backlog_rescue",         titleKey: "smart_template_backlog_rescue",         category: "status" },
  { mode: "forgotten_gems",         titleKey: "smart_template_forgotten_gems",         category: "status" },
  { mode: "hidden_gems",            titleKey: "smart_template_hidden_gems",            category: "status" },
  { mode: "travel_mode",            titleKey: "smart_template_travel_mode",            category: "status" },
  { mode: "never_touched_classics", titleKey: "smart_template_never_touched_classics", category: "time" },
  { mode: "recent_hidden_installs", titleKey: "smart_template_recent_hidden_installs", category: "time" },
  { mode: "weekly_rotation",        titleKey: "smart_template_weekly_rotation",        category: "other" },
  { mode: "monthly_spotlight",      titleKey: "smart_template_monthly_spotlight",      category: "other" },
  { mode: "seasonal_rotation",      titleKey: "smart_template_seasonal_rotation",      category: "other" },
  /* Runtime-aware templates: depend on battery state (low_battery_mode) or
     SteamClient.Apps appDetails (almost_finished / couch_gaming / coop_ready
     / party_games). Best-effort — render empty when the runtime signal isn't
     accessible (older SteamOS, non-Deck environments). */
  { mode: "low_battery_mode",       titleKey: "smart_template_low_battery_mode",       category: "status" },
  { mode: "almost_finished",        titleKey: "smart_template_almost_finished",        category: "status" },
  { mode: "couch_gaming",           titleKey: "smart_template_couch_gaming",           category: "status" },
  { mode: "coop_ready",             titleKey: "smart_template_coop_ready",             category: "status" },
  { mode: "party_games",            titleKey: "smart_template_party_games",            category: "status" },
  // Online-gated template: hidden from the picker when onlineFeaturesEnabled
  // is off (mirrors the requiresOnline pattern in editShelf/constants.ts).
  { mode: "friends_playing",        titleKey: "smart_template_friends_playing",        category: "status" },
]
