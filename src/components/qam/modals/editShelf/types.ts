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
  manualBaseSort: string
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
}
