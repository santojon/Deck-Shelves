import type { Shelf } from '../../../../types'
import type { SettingsController } from '../../../../features/settings/controller'
import type { PlatformTab } from '../../../../runtime/platform'
import { logInfo } from '../../../../runtime/logger'
import { notify } from '../../../notify'
import type { EditableShelfState } from './types'
import {
  sanitizeSyntheticCard,
  buildSortPatchFields,
  buildPrimarySource as buildPrimarySourceShared,
  assembleFinalSource,
  discountBadgePatch,
  shelfSortForPatch,
  isStateManualSort,
} from './saveHelpers'

function gatedArray<T>(on: boolean, arr: T[]): T[] | undefined {
  return on && arr.length ? arr : undefined
}

function buildSavePatch(
  state: EditableShelfState,
  ctx: { isManualSort: boolean; highlightPickerOpen: boolean; hiddenPickerOpen: boolean; title: string },
): Partial<Shelf> {
  const { baseSort, baseReverse } = buildSortPatchFields(state, ctx.isManualSort)
  const cleanedSynth = state.syntheticCards.map(sanitizeSyntheticCard)
  return {
    title: ctx.title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightRandom: state.highlightRandom, enableLogo: state.enableLogo, enableIcon: state.enableIcon, enableDescription: state.enableDescription, descriptionBelowLogo: state.descriptionBelowLogo, logoPosition: state.logoPosition, descriptionPosition: state.descriptionPosition, logoSize: state.logoSize, logoTopOffset: state.logoTopOffset, iconVerticalAlign: state.iconVerticalAlign, ...discountBadgePatch(state), shelfTitlePosition: state.shelfTitlePosition, gameNamePosition: state.gameNamePosition, playtimePosition: state.playtimePosition, descriptionHeight: state.descriptionHeight, descriptionLogoGap: state.descriptionLogoGap, descriptionScale: state.descriptionScale !== 100 ? state.descriptionScale : undefined, fullPageShelf: state.fullPageShelf || undefined, highlightedAppIds: gatedArray(ctx.highlightPickerOpen, state.highlightedAppIds), manualOrder: gatedArray(ctx.isManualSort, state.manualOrder), manualBaseSort: baseSort as any, sortReverse: state.sortReverse || undefined, manualBaseSortReverse: baseReverse as any, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideDiscountBadge: state.hideDiscountBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames, hideInstallIndicator: state.hideInstallIndicator, hideSeeMore: state.hideSeeMore, hideRefreshCard: state.hideRefreshCard, heroEnabled: state.heroEnabled, gameInfoAbove: state.gameInfoAbove || undefined, friendsPlayingOverlay: state.friendsPlayingOverlay || undefined, friendsPlayingOverlayRecent: state.friendsPlayingOverlayRecent || undefined, dedupeByExactName: state.dedupeByExactName || undefined, hiddenAppIds: gatedArray(ctx.hiddenPickerOpen, state.hiddenAppIds), syntheticCards: cleanedSynth.length ? cleanedSynth : undefined,
    ...behaviourPatch(state),
  } as any
}

function behaviourPatch(state: EditableShelfState): Partial<Shelf> {
  const hasRules = (v: any) => !!v && Array.isArray(v.rules) && v.rules.length > 0
  return {
    autoPin: hasRules(state.autoPin) ? state.autoPin : undefined,
    autoCollapse: hasRules(state.autoCollapse) ? state.autoCollapse : undefined,
    autoCollapseWhenEmpty: state.autoCollapseWhenEmpty ? true : undefined,
  } as any
}

export async function persistShelf({ state, shelf, mode, highlightPickerOpen, hiddenPickerOpen, platformTabs, actions, t }: {
  state: EditableShelfState
  shelf: Shelf
  mode: 'create' | 'edit'
  highlightPickerOpen: boolean
  hiddenPickerOpen: boolean
  platformTabs: PlatformTab[]
  actions: SettingsController['actions']
  t: SettingsController['t']
}): Promise<void> {
  const title = state.title.trim() || t('new_shelf');
  const isManualSort = isStateManualSort(state)
  const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
  const patch = buildSavePatch(state, { isManualSort, highlightPickerOpen, hiddenPickerOpen, title })
  const primarySource = buildPrimarySourceShared({ state, childFilter, platformTabs })
  patch.source = assembleFinalSource(primarySource, state) as any
  patch.sort = shelfSortForPatch(state)
  if (mode === 'create') {
    const draft: Shelf = { ...shelf, ...(patch as Partial<Shelf>) } as Shelf;
    const created = await actions.commitShelf(draft);
    logInfo("SETTINGS", "shelf created", { shelfId: created?.id });
  } else {
    const ok = await actions.patchShelf(shelf.id, patch);
    logInfo("SETTINGS", "shelf updated", { shelfId: shelf.id, success: ok });
    notify("success", { body: t("toast_shelf_saved"), area: "shelves" });
  }
}
