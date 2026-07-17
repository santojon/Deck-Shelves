/* Save-patch builder for the smart-shelf modal, extracted from
   EditSmartShelfModal to keep that file's component function under the
   complexity cap. Pure derivation from the editor state — the inverse of
   buildInitialSmartState. Grouped sub-builders keep each under the cap. */
import type { SmartShelf } from '../../../../types'
import type { SettingsController } from '../../../../features/settings/controller'
import { SMART_PARAM_DEFAULTS } from '../../../../steam/smartParams'
import { logInfo } from '../../../../runtime/logger'
import { notify } from '../../../notify'
import i18next from 'i18next'
import { DEFAULT_REFRESH_MINUTES, type EditState } from './buildSmartInitialState'

export type SaveArgs = {
  state: EditState
  shelf: SmartShelf
  mode: 'create' | 'edit'
  isManual: boolean
  highlightPickerOpen: boolean
  hiddenPickerOpen: boolean
  paramKeys: string[]
  actions: SettingsController['actions']
}

type Patch = Record<string, unknown>

function patchCore(state: EditState, shelf: SmartShelf): Patch {
  return {
    title: state.title.trim() || shelf.title,
    limit: state.limit,
    sort: state.sort || undefined,
    sortReverse: state.sortReverse || undefined,
    filterGroup: state.filterGroup.items.length > 0 ? state.filterGroup : undefined,
  }
}

function patchManual(state: EditState, isManual: boolean): Patch {
  return {
    manualBaseSort: (isManual && state.manualBaseSort !== 'alphabetical') ? state.manualBaseSort : undefined,
    manualBaseSortReverse: (isManual && state.manualBaseSortReverse) || undefined,
    manualOrder: (isManual && state.manualOrder.length) ? state.manualOrder : undefined,
  }
}

function patchVisual(state: EditState): Patch {
  return {
    matchNativeSize: state.matchNativeSize,
    highlightFirst: state.highlightFirst,
    highlightAll: state.highlightAll,
    highlightRandom: state.highlightRandom,
    enableLogo: state.enableLogo,
    enableIcon: state.enableIcon,
    enableDescription: state.enableDescription,
    descriptionScale: state.descriptionScale !== 100 ? state.descriptionScale : undefined,
    descriptionBelowLogo: state.descriptionBelowLogo,
    logoPosition: state.logoPosition,
    descriptionPosition: state.descriptionPosition,
    logoSize: state.logoSize,
    logoTopOffset: state.logoTopOffset,
    iconVerticalAlign: state.iconVerticalAlign,
    shelfTitlePosition: state.shelfTitlePosition,
    gameNamePosition: state.gameNamePosition,
    playtimePosition: state.playtimePosition,
    descriptionHeight: state.descriptionHeight,
    descriptionLogoGap: state.descriptionLogoGap,
    fullPageShelf: state.fullPageShelf || undefined,
  }
}

function patchHideFlags(state: EditState): Patch {
  return {
    hideStatusLine: state.hideStatusLine,
    hideNewBadge: state.hideNewBadge,
    hideDiscountBadge: state.hideDiscountBadge,
    hideCompatIcons: state.hideCompatIcons,
    hideNonSteamBadge: state.hideNonSteamBadge,
    hideShelfTitle: state.hideShelfTitle,
    hideGameNames: state.hideGameNames,
    hideInstallIndicator: state.hideInstallIndicator,
    hideSeeMore: state.hideSeeMore,
    hideRefreshCard: state.hideRefreshCard,
  }
}

function patchExtras(state: EditState): Patch {
  return {
    heroEnabled: state.heroEnabled || undefined,
    gameInfoAbove: state.gameInfoAbove || undefined,
    friendsPlayingOverlay: state.friendsPlayingOverlay || undefined,
    friendsPlayingOverlayRecent: state.friendsPlayingOverlayRecent || undefined,
    dedupeByExactName: state.dedupeByExactName || undefined,
  }
}

function patchPickers(state: EditState, highlightPickerOpen: boolean, hiddenPickerOpen: boolean): Patch {
  return {
    highlightedAppIds: (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined,
    hiddenAppIds: (hiddenPickerOpen && state.hiddenAppIds.length) ? state.hiddenAppIds : undefined,
  }
}

function patchSmart(state: EditState, paramKeys: string[]): Patch {
  // Only persist when the user diverged from the default cadence; otherwise
  // omit so the shelf inherits whatever the resolver default ends up being.
  const refreshIntervalMinutes = (state.refreshIntervalMinutes > 0 && state.refreshIntervalMinutes !== DEFAULT_REFRESH_MINUTES)
    ? state.refreshIntervalMinutes
    : undefined
  // Only persist params that diverge from the mode's defaults — keeps the
  // settings JSON minimal and lets future default tweaks reach existing shelves.
  const defaults = SMART_PARAM_DEFAULTS[state.mode] ?? {}
  const overrides: Record<string, number> = {}
  for (const k of paramKeys) {
    if (state.smartParams[k] !== defaults[k]) overrides[k] = state.smartParams[k]
  }
  return {
    refreshIntervalMinutes,
    mode: state.mode,
    compositeModes: state.compositeModes.length > 0 ? state.compositeModes : undefined,
    compositeCombine: state.compositeModes.length > 0 ? state.compositeCombine : undefined,
    smartParams: Object.keys(overrides).length ? overrides : undefined,
  }
}

function patchSchedule(state: EditState): Patch {
  const allRanges = [
    ...state.defaultHours,
    ...Object.entries(state.dayOverrides).flatMap(([dayStr, ranges]) =>
      ranges.map((r) => ({ ...r, days: [Number(dayStr)] }))
    ),
  ]
  return {
    visibleHours: (state.visibleHoursEnabled && allRanges.length > 0) ? allRanges : undefined,
    // Days: drop the field entirely when all 7 are selected (no restriction);
    // otherwise persist the (possibly empty) array. Empty array = never
    // visible, distinct from undefined = always visible.
    visibleDaysOfWeek: state.visibleDaysOfWeek.length === 7 ? undefined : state.visibleDaysOfWeek.slice().sort(),
  }
}

function patchVisibility(state: EditState): Patch {
  const s = state as any
  return {
    // Visibility Rules v2 — an empty/undefined tree persists as no restriction.
    visibility: (state.visibility && Array.isArray(state.visibility.rules) && state.visibility.rules.length > 0) ? state.visibility : undefined,
    autoCollapseWhenEmpty: s.autoCollapseWhenEmpty ? true : undefined,
  }
}

function patchAutoRules(state: EditState): Patch {
  const s = state as any
  return {
    // Auto-pin predicate — same shape; empty = never pinned.
    autoPin: (s.autoPin && Array.isArray(s.autoPin.rules) && s.autoPin.rules.length > 0) ? s.autoPin : undefined,
    // Auto-collapse predicate.
    autoCollapse: (s.autoCollapse && Array.isArray(s.autoCollapse.rules) && s.autoCollapse.rules.length > 0) ? s.autoCollapse : undefined,
  }
}

export function buildSmartSavePatch(args: SaveArgs): Partial<SmartShelf> {
  const { state, shelf, isManual, highlightPickerOpen, hiddenPickerOpen, paramKeys } = args
  return {
    ...patchCore(state, shelf),
    ...patchManual(state, isManual),
    ...patchVisual(state),
    ...patchHideFlags(state),
    ...patchExtras(state),
    ...patchPickers(state, highlightPickerOpen, hiddenPickerOpen),
    ...patchSmart(state, paramKeys),
    ...patchSchedule(state),
    ...patchVisibility(state),
    ...patchAutoRules(state),
  } as Partial<SmartShelf>
}

export async function persistSmartShelf(args: SaveArgs): Promise<void> {
  const patch = buildSmartSavePatch(args)
  if (args.mode === 'create') {
    const draft: SmartShelf = { ...args.shelf, ...patch } as SmartShelf
    const created = await args.actions.commitSmartShelf(draft)
    logInfo('SETTINGS', 'smart shelf created', { shelfId: created?.id })
  } else {
    const ok = await args.actions.patchSmartShelf(args.shelf.id, patch)
    logInfo('SETTINGS', 'smart shelf updated', { shelfId: args.shelf.id, success: ok })
    notify('success', { body: i18next.t('toast_shelf_saved'), area: 'shelves' })
  }
}
