import type { FilterGroup, ShelfFilter, ShelfSource } from '../../../../types'
import type { SourceType } from './constants'
import type { DiscountBadgeMode } from '../../../shelf/discountBadge'

export type SourceOrder = { sort?: string | string[]; sortReverse?: boolean | boolean[]; limit?: number; manualOrder?: number[] }

export type EditableShelfState = {
  title: string
  sourceType: SourceType
  collectionId: string
  tab: string
  externalSourceId: string
  builtinSourceId: string
  smartMode: string
  filter: ShelfFilter
  filterGroup: FilterGroup
  sort: string | string[]
  sortReverse: boolean | boolean[]
  primaryOrder?: SourceOrder
  manualBaseSort: string | string[]
  manualBaseSortReverse: boolean | boolean[]
  limit: number
  matchNativeSize: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightRandom: boolean
  enableLogo: boolean
  enableIcon: boolean
  enableDescription: boolean
  descriptionScale: number
  descriptionBelowLogo: boolean
  logoPosition: 'left' | 'center' | 'right'
  descriptionPosition: 'left' | 'center' | 'right'
  logoSize: number
  logoTopOffset: number
  iconVerticalAlign: 'top' | 'center' | 'bottom'
  discountBadgeMode: DiscountBadgeMode
  discountBadgeFocusMode: DiscountBadgeMode | null
  shelfTitlePosition: 'left' | 'center' | 'right'
  gameNamePosition: 'left' | 'center' | 'right'
  playtimePosition: 'left' | 'center' | 'right'
  descriptionHeight: number
  descriptionLogoGap: number
  fullPageShelf: boolean
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
  gameInfoAbove: boolean
  friendsPlayingOverlay: boolean
  friendsPlayingOverlayRecent: boolean
  dedupeByExactName: boolean
  hiddenAppIds: number[]
  autoPin?: any
  autoCollapse?: any
  autoCollapseWhenEmpty?: boolean
  childFilterGroup: FilterGroup
  postFilterGroup: FilterGroup
  // Kept as saved: older multi-source shelves shared one filter among their online sources.
  legacyCompositeChildFilter?: FilterGroup
  excludeOwned: boolean
  excludeOwnedNonSteam: boolean
  hideOwnedNonSteamCloud: boolean
  compositeCombine: 'union' | 'intersection'
  additionalSources: ShelfSource[]
  syntheticCards: Array<{
    position: number
    image?: string
    text?: string
    link?: { type: 'app' | 'url'; value: string }
    size: 'normal' | 'featured'
    alpha?: number
    placeholder?: boolean
    heroImage?: string
    shadowMode?: 'never' | 'onFocus' | 'always'
  }>
}
