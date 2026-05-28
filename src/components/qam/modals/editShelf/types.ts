import type { FilterGroup, ShelfFilter, ShelfSource } from '../../../../types'
import type { SourceType } from './constants'

export type EditableShelfState = {
  title: string
  sourceType: SourceType
  collectionId: string
  tab: string
  externalSourceId: string
  filter: ShelfFilter
  filterGroup: FilterGroup
  // Multi-key sort: single-key shelves keep `string`, multi-key shelves
  // hold an array of sort keys + per-key reverse flags (aligned indices).
  sort: string | string[]
  sortReverse: boolean | boolean[]
  manualBaseSort: string
  manualBaseSortReverse: boolean
  limit: number
  matchNativeSize: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightedAppIds: number[]
  manualOrder: number[]
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideDiscountBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  hideShelfTitle: boolean
  hideGameNames: boolean
  hideInstallIndicator: boolean
  hideSeeMore: boolean
  hideRefreshCard: boolean
  heroEnabled: boolean
  dedupeByExactName: boolean
  hiddenAppIds: number[]
  childFilterGroup: FilterGroup
  excludeOwned: boolean
  excludeOwnedNonSteam: boolean
  hideOwnedNonSteamCloud: boolean
  // Extra sources stacked on top of the primary. When non-empty, the
  // shelf saves as `{ type: 'composite', combine, sources: [primary, ...additionalSources] }`.
  // Empty means the shelf is single-source (saves as the primary type
  // directly — back-compat with older clients). Forced empty when the
  // primary is `filter` (filter is exclusive — use filter merge instead).
  compositeCombine: 'union' | 'intersection'
  additionalSources: ShelfSource[]
}
