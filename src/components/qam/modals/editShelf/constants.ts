export type SourceType = 'collection' | 'tab' | 'filter' | 'external'
export type EditTab = 'source' | 'filters' | 'childFilters' | 'visual' | 'display'

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
  { value: 'random', labelKey: 'sort_random' },
  { value: 'manual', labelKey: 'sort_manual' },
] as const

// Gamepad direction button codes used by the manual-sort grab mode to
// intercept FocusNavController.DispatchVirtualButtonClick while the user is
// holding a card.
export const DIR_LEFT = 11
export const DIR_RIGHT = 12
export const HOLD_MS = 300
