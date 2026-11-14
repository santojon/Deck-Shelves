import type { SmartShelfMode } from '../../../../types'

export type SourceType = 'collection' | 'tab' | 'filter' | 'external' | 'wishlist' | 'store' | 'builtin'

// Built-in sources: the client's dynamic collections together, and the per-device game
// lists (resolvers in steam/v3Extensions.ts). The picker stores `{ type: 'builtin', sourceId: value }`.
export const V3_SOURCE_OPTIONS: { value: string; labelKey?: string; label?: string }[] = [
  { value: 'dynamic_collections', labelKey: 'source_v3_dynamic_collections' },
  { value: 'pinned_games', labelKey: 'source_v3_pinned' },
  { value: 'history_source', labelKey: 'source_v3_history' },
  { value: 'session_queue_source', labelKey: 'source_v3_session_queue' },
  { value: 'temporary_queue_source', labelKey: 'source_v3_temporary_queue' },
]
/* Every live smart-shelf mode, highest-result-probability first (the order of
   `smartTemplates.ts`). `custom` is left out: it is the filter-only mode. */
export const SMART_MODE_OPTIONS: SmartShelfMode[] = [
  'daily_pick', 'deck_picks', 'on_deck', 'recently_played',
  'long_session', 'random_pick', 'not_started',
  'best_unplayed', 'quick_play', 'short_battery', 'low_battery_mode',
  'interrupted', 'non_steam', 'spare_time', 'time_of_day',
  'rediscover', 'forgotten',
  'backlog_rescue', 'forgotten_gems', 'hidden_gems', 'almost_finished',
  'couch_gaming', 'coop_ready', 'party_games', 'friends_playing',
  'travel_mode', 'recent_hidden_installs', 'weekly_rotation',
]
export type EditTab = 'source' | 'filters' | 'childFilters' | 'visual' | 'display' | 'decoration'

// `composite` is implicit: the user picks a primary source then adds
// extra ones inline via `+ Add source`. Two or more sources collapse to
// a composite on save. `filter` is mutually exclusive and never combines.
export const BASE_SOURCE_TYPES: SourceType[] = ['collection', 'tab', 'filter']

export const SORT_OPTIONS = [
  { value: 'alphabetical', labelKey: 'sort_alpha' },
  { value: 'recent', labelKey: 'sort_recent' },
  { value: 'playtime', labelKey: 'sort_playtime' },
  { value: 'release_date', labelKey: 'sort_release_date' },
  { value: 'size_on_disk', labelKey: 'sort_size_on_disk' },
  { value: 'metacritic', labelKey: 'sort_metacritic' },
  { value: 'review_score', labelKey: 'sort_review_score' },
  { value: 'added', labelKey: 'sort_added' },
  { value: 'app_status', labelKey: 'sort_app_status' },
  { value: 'deck_compat', labelKey: 'sort_deck_compat' },
  { value: 'controller_support', labelKey: 'sort_controller_support' },
  { value: 'price_low', labelKey: 'sort_price_low', requiresOnline: true },
  { value: 'discount_high', labelKey: 'sort_discount_high', requiresOnline: true },
  { value: 'original_price_high', labelKey: 'sort_original_price_high', requiresOnline: true },
  { value: 'random', labelKey: 'sort_random' },
  // Reads Steam's local friend list, so it is valid on any source.
  { value: 'friends_playing_now', labelKey: 'sort_friends_playing_now' },
  { value: 'owned_games', labelKey: 'sort_owned_games' },
  { value: 'completion_percent', labelKey: 'sort_completion_percent' },
  { value: 'closest_to_completion', labelKey: 'sort_closest_to_completion' },
  { value: 'family_shared_games', labelKey: 'sort_family_shared_games' },
  // The friends' libraries are fetched from Steam, so these follow the online toggle.
  { value: 'most_friends_owning', labelKey: 'sort_most_friends_owning', requiresOnline: true },
  { value: 'trending_among_friends', labelKey: 'sort_trending_among_friends', requiresOnline: true },
  // The order the source gives; in a composite, each source with its own sort.
  { value: 'source_order', labelKey: 'sort_source_order' },
  { value: 'manual', labelKey: 'sort_manual' },
] as const

// Gamepad direction button codes used by the manual-sort grab mode to
// intercept FocusNavController.DispatchVirtualButtonClick while the user is
// holding a card.
export const DIR_LEFT = 11
export const DIR_RIGHT = 12
export const HOLD_MS = 300
