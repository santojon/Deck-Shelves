export type SourceType = 'collection' | 'tab' | 'filter' | 'external' | 'wishlist' | 'store' | 'builtin'

// Built-in Shelf Source v3 options — resolvers in steam/v3Extensions.ts. Each
// is parameter-less; the picker stores `{ type: 'builtin', sourceId: value }`.
// The launcher ones use their proper-noun name directly (no translation).
export const V3_SOURCE_OPTIONS: { value: string; labelKey?: string; label?: string }[] = [
  { value: 'dynamic_collections', labelKey: 'source_v3_dynamic_collections' },
  { value: 'followed_games', labelKey: 'source_v3_followed_games' },
  { value: 'ignored_games', labelKey: 'source_v3_ignored_games' },
  { value: 'dlc_source', labelKey: 'source_v3_dlc' },
  { value: 'soundtrack_source', labelKey: 'source_v3_soundtracks' },
  { value: 'pinned_games', labelKey: 'source_v3_pinned' },
  { value: 'history_source', labelKey: 'source_v3_history' },
  { value: 'session_queue_source', labelKey: 'source_v3_session_queue' },
  { value: 'temporary_queue_source', labelKey: 'source_v3_temporary_queue' },
  { value: 'recently_updated', labelKey: 'source_v3_recently_updated' },
  { value: 'with_events', labelKey: 'source_v3_with_events' },
  { value: 'with_workshop_updates', labelKey: 'source_v3_with_workshop_updates' },
  { value: 'controller_specific_source', labelKey: 'source_v3_controller_specific' },
  { value: 'emudeck_collections', label: 'EmuDeck' },
  { value: 'retrodeck_collections', label: 'RetroDECK' },
  { value: 'heroic_library', label: 'Heroic' },
  { value: 'lutris_library', label: 'Lutris' },
  { value: 'moonlight_sessions', label: 'Moonlight' },
  { value: 'chiaki_sessions', label: 'Chiaki' },
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
  // Sort v3 — comparators in steam/v3Extensions.ts (reverse via the sortReverse toggle).
  { value: 'most_launched', labelKey: 'sort_most_launched' },
  { value: 'least_launched', labelKey: 'sort_least_launched' },
  { value: 'longest_session', labelKey: 'sort_longest_session' },
  { value: 'shortest_session', labelKey: 'sort_shortest_session' },
  { value: 'most_ignored', labelKey: 'sort_most_ignored' },
  { value: 'rediscovered_recently', labelKey: 'sort_rediscovered_recently' },
  { value: 'completion_percent', labelKey: 'sort_completion_percent' },
  { value: 'closest_to_completion', labelKey: 'sort_closest_to_completion' },
  { value: 'rarest_achievements', labelKey: 'sort_rarest_achievements' },
  { value: 'newest_installed', labelKey: 'sort_newest_installed' },
  { value: 'oldest_installed', labelKey: 'sort_oldest_installed' },
  { value: 'oldest_unplayed', labelKey: 'sort_oldest_unplayed' },
  { value: 'newest_purchased', labelKey: 'sort_newest_purchased' },
  { value: 'largest_install', labelKey: 'sort_largest_install' },
  { value: 'smallest_install', labelKey: 'sort_smallest_install' },
  { value: 'ssd_priority', labelKey: 'sort_ssd_priority' },
  { value: 'sd_priority', labelKey: 'sort_sd_priority' },
  { value: 'friends_playing_now', labelKey: 'sort_friends_playing_now', requiresOnline: true },
  { value: 'most_friends_owning', labelKey: 'sort_most_friends_owning', requiresOnline: true },
  { value: 'trending_among_friends', labelKey: 'sort_trending_among_friends', requiresOnline: true },
  { value: 'manual', labelKey: 'sort_manual' },
] as const

// Gamepad direction button codes used by the manual-sort grab mode to
// intercept FocusNavController.DispatchVirtualButtonClick while the user is
// holding a card.
export const DIR_LEFT = 11
export const DIR_RIGHT = 12
export const HOLD_MS = 300
