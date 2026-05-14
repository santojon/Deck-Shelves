import type { FilterGroup, ShelfFilter } from '../../../../types'
import type { SourceType } from './constants'

export type EditableShelfState = {
  title: string
  sourceType: SourceType
  collectionId: string
  tab: string
  externalSourceId: string
  filter: ShelfFilter
  filterGroup: FilterGroup
  sort: string
  sortReverse: boolean
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
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  hideShelfTitle: boolean
  hideGameNames: boolean
  hideInstallIndicator: boolean
  hideSeeMore: boolean
  hideRefreshCard: boolean
  dedupeByExactName: boolean
  hiddenAppIds: number[]
  childFilterGroup: FilterGroup
  excludeOwned: boolean
  excludeOwnedNonSteam: boolean
}
