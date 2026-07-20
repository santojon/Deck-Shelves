// Initial editor state for the smart-shelf modal, extracted from
// EditSmartShelfModal to keep that file under the code-line cap and its
// component function readable. Pure derivation from the persisted shelf.
import type { FilterGroup, SmartShelf, SmartShelfMode } from '../../../../types'
import { SMART_PARAM_DEFAULTS, DEFAULT_SORT_FOR_MODE } from '../../../../steam/smartParams'
import { SPARE_TIME_WINDOWS } from '../../../../steam/smartShelves'

// Effective TTL when `refreshIntervalMinutes` is unset on a shelf — must
// match `DEFAULT_SMART_TTL_MS` in `src/steam/smartShelves.ts`. Used to
// pre-fill the edit field so users see the actual current cadence.
export const DEFAULT_REFRESH_MINUTES = 60

export type EditState = {
  title: string
  mode: SmartShelfMode
  compositeModes: SmartShelfMode[]
  compositeCombine: 'union' | 'intersection'
  limit: number
  sort: string | string[]
  sortReverse: boolean | boolean[]
  manualBaseSort: string
  manualBaseSortReverse: boolean
  manualOrder: number[]
  filterGroup: FilterGroup
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
  shelfTitlePosition: 'left' | 'center' | 'right'
  gameNamePosition: 'left' | 'center' | 'right'
  playtimePosition: 'left' | 'center' | 'right'
  descriptionHeight: number
  descriptionLogoGap: number
  fullPageShelf: boolean
  highlightedAppIds: number[]
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
  refreshIntervalMinutes: number
  smartParams: Record<string, number>
  visibleHoursEnabled: boolean
  defaultHours: Array<{ start: number; end: number }>
  dayOverrides: Record<string, Array<{ start: number; end: number }>>
  visibleDaysOfWeek: number[]
  allowDayOverrides: boolean
  visibility: any
  autoPin: any
  autoCollapse: any
  autoCollapseWhenEmpty: boolean
}

const POS3 = ['left', 'center', 'right'] as const
const ALIGN3 = ['top', 'center', 'bottom'] as const
function pickOr<T extends string>(v: any, allowed: readonly T[], def: T): T { return (allowed as readonly string[]).includes(v) ? v : def }
function numOr(v: any, min: number, max: number, def: number): number { return typeof v === 'number' ? Math.max(min, Math.min(max, v)) : def }

function initCoreA(shelf: SmartShelf): Partial<EditState> {
  const s = shelf as any
  return {
    title: shelf.title,
    mode: shelf.mode,
    compositeModes: Array.isArray(s.compositeModes) ? s.compositeModes : [],
    compositeCombine: s.compositeCombine === 'intersection' ? 'intersection' : 'union',
    limit: shelf.limit ?? 20,
    sort: s.sort ?? DEFAULT_SORT_FOR_MODE[shelf.mode] ?? 'alphabetical',
    sortReverse: s.sortReverse ?? false,
  }
}

function initCoreB(shelf: SmartShelf): Partial<EditState> {
  const s = shelf as any
  return {
    manualBaseSort: s.manualBaseSort ?? 'alphabetical',
    manualBaseSortReverse: s.manualBaseSortReverse ?? false,
    manualOrder: s.manualOrder ?? [],
    filterGroup: s.filterGroup ?? { mode: 'and', items: [] },
    refreshIntervalMinutes: s.refreshIntervalMinutes ?? DEFAULT_REFRESH_MINUTES,
    smartParams: { ...(SMART_PARAM_DEFAULTS[shelf.mode] ?? {}), ...(s.smartParams ?? {}) },
    visibility: s.visibility,
    autoPin: s.autoPin,
    autoCollapse: s.autoCollapse,
    autoCollapseWhenEmpty: s.autoCollapseWhenEmpty === true,
  } as Partial<EditState>
}

function initVisual(shelf: SmartShelf): Partial<EditState> {
  const s = shelf as any
  return {
    matchNativeSize: s.matchNativeSize ?? false,
    highlightFirst: s.highlightFirst ?? false,
    highlightAll: s.highlightAll ?? false,
    highlightRandom: s.highlightRandom ?? false,
    enableLogo: s.enableLogo === true,
    enableIcon: s.enableIcon === true,
    enableDescription: s.enableDescription === true,
    descriptionScale: typeof s.descriptionScale === 'number' ? s.descriptionScale : 100,
    descriptionBelowLogo: s.descriptionBelowLogo === true,
    logoPosition: pickOr(s.logoPosition, POS3, 'left'),
    descriptionPosition: pickOr(s.descriptionPosition, POS3, 'left'),
    logoSize: numOr(s.logoSize, 50, 200, 100),
    logoTopOffset: numOr(s.logoTopOffset, 0, 100, 20),
    iconVerticalAlign: pickOr(s.iconVerticalAlign, ALIGN3, 'top'),
    shelfTitlePosition: pickOr(s.shelfTitlePosition, POS3, 'left'),
    gameNamePosition: pickOr(s.gameNamePosition, POS3, 'left'),
    playtimePosition: pickOr(s.playtimePosition, POS3, 'left'),
    descriptionHeight: numOr(s.descriptionHeight, 1, 3, 2),
    descriptionLogoGap: numOr(s.descriptionLogoGap, -40, 80, 10),
    fullPageShelf: s.fullPageShelf === true,
    highlightedAppIds: s.highlightedAppIds ?? [],
  }
}

function initHideFlags(shelf: SmartShelf): Partial<EditState> {
  const s = shelf as any
  return {
    hideStatusLine: s.hideStatusLine ?? false,
    hideNewBadge: s.hideNewBadge ?? false,
    hideDiscountBadge: s.hideDiscountBadge ?? false,
    hideCompatIcons: s.hideCompatIcons ?? false,
    hideNonSteamBadge: s.hideNonSteamBadge ?? false,
    hideShelfTitle: s.hideShelfTitle ?? false,
    hideGameNames: s.hideGameNames ?? false,
    hideInstallIndicator: s.hideInstallIndicator ?? false,
    hideSeeMore: s.hideSeeMore ?? false,
  }
}

function initExtraFlags(shelf: SmartShelf): Partial<EditState> {
  const s = shelf as any
  return {
    hideRefreshCard: s.hideRefreshCard ?? false,
    heroEnabled: s.heroEnabled ?? false,
    gameInfoAbove: s.gameInfoAbove ?? false,
    friendsPlayingOverlay: s.friendsPlayingOverlay ?? false,
    friendsPlayingOverlayRecent: s.friendsPlayingOverlayRecent ?? false,
    dedupeByExactName: s.dedupeByExactName ?? false,
    hiddenAppIds: s.hiddenAppIds ?? [],
  }
}

function initSchedule(shelf: SmartShelf): Partial<EditState> {
  const s = shelf as any
  const visibleHoursEnabled = (() => {
    const v = s.visibleHours
    const has = Array.isArray(v) ? v.length > 0 : !!v
    if (!has && shelf.mode === 'spare_time') return true
    return has
  })()
  const defaultHours = (() => {
    const v = s.visibleHours
    if (Array.isArray(v) && v.length > 0) {
      const defaults = v.filter((r: any) => !Array.isArray(r.days) || r.days.length === 0).map((r: any) => ({ start: Number(r.start) || 0, end: Number(r.end) || 0 }))
      if (defaults.length > 0) return defaults
    }
    if (shelf.mode === 'spare_time') return SPARE_TIME_WINDOWS.map((r) => ({ ...r }))
    return [{ start: 9, end: 17 }]
  })()
  const dayOverrides = (() => {
    const v = s.visibleHours
    if (!Array.isArray(v)) return {}
    const out: Record<string, Array<{ start: number; end: number }>> = {}
    for (const r of v) {
      if (Array.isArray(r.days) && r.days.length > 0) {
        for (const day of r.days) {
          const k = String(day)
          if (!out[k]) out[k] = []
          out[k].push({ start: Number(r.start) || 0, end: Number(r.end) || 0 })
        }
      }
    }
    return out
  })()
  const visibleDaysOfWeek = Array.isArray(s.visibleDaysOfWeek) ? s.visibleDaysOfWeek.slice() : [0, 1, 2, 3, 4, 5, 6]
  const allowDayOverrides = Array.isArray(s.visibleHours) && s.visibleHours.some((r: any) => Array.isArray(r.days) && r.days.length > 0)
  return { visibleHoursEnabled, defaultHours, dayOverrides, visibleDaysOfWeek, allowDayOverrides } as Partial<EditState>
}

export function buildInitialSmartState(shelf: SmartShelf): EditState {
  return {
    ...initCoreA(shelf),
    ...initCoreB(shelf),
    ...initVisual(shelf),
    ...initHideFlags(shelf),
    ...initExtraFlags(shelf),
    ...initSchedule(shelf),
  } as EditState
}
