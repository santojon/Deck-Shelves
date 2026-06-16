import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DialogButton,
  DropdownItem,
  Focusable,
  Tabs,
  ToggleField,
  type SingleDropdownOption,
} from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { normalizeFilter } from '../../../domain/settings'
import { consumePendingShelfModalTab } from '../../../core/shelfActions'
import { FilterPanel } from '../../FilterPanel'
import { FieldContainer, ModalShell , DSSliderField} from '../../ui'
import { logInfo } from '../../../runtime/logger'
import { invalidateRandomSortCache } from '../../../steam'
import { invalidateSmartShelfCache } from '../../../steam/smartShelves'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { BASE_SOURCE_TYPES, SORT_OPTIONS, type SourceType, type EditTab } from './editShelf/constants'
import type { EditableShelfState } from './editShelf/types'
import { optionData } from './editShelf/utils'
import { SavedFiltersBar } from './editShelf/SavedFiltersBar'
import { DecorationTab } from './editShelf/DecorationTab'
import { VisualTabContent } from './editShelf/VisualTabContent'
import { DisplayTabContent } from './editShelf/DisplayTabContent'
import { FunnelIcon, EyeIcon, SteamIcon, OnlineIcon } from '../../icons'
import { PreviewPanel } from './editShelf/PreviewPanel'
import { useModalCollections } from './editShelf/useModalCollections'
import { TabLabel } from './editShelf/TabLabel'
import { SortField } from './editShelf/SortField'
import { ModalHeader } from './editShelf/ModalHeader'
import {
  sanitizeSyntheticCard,
  buildSortPatchFields,
  buildPrimarySource as buildPrimarySourceShared,
  assembleFinalSource,
  shelfSortForPatch,
} from './editShelf/saveHelpers'
import { detectNativeTabKey, isUnsupportedTab } from './editShelf/tabUtils'
import { usePreviewResolution } from './editShelf/usePreviewResolution'
import {
  buildChildTypeOptions,
  buildCollectionValueOpts as buildCollectionValueOptsShared,
  buildTabValueOpts as buildTabValueOptsShared,
  pickNextAvailableSource,
} from './editShelf/compositeSourceUtils'
import { buildInitialShelfState } from './editShelf/buildInitialState'

// Native library tabs. If the controller's async `listLibraryTabs` resolved
// to an empty list (a host-window store throwing on enumeration has been
// seen in the wild, and the controller's `.catch` falls back to `[]`), we
// still surface these so the source dropdown is never blank. The localized
// labels later in `detectNativeKey` match against `id` slugs, so these IDs
// are guaranteed to render with the right translated names.
const NATIVE_FALLBACK_TABS: import('../../../runtime/platform').PlatformTab[] = [
  { id: 'all',        name: 'All Games' },
  { id: 'favorites',  name: 'Favorites' },
  { id: 'installed',  name: 'Installed' },
  { id: 'hidden',     name: 'Hidden' },
  { id: 'nonsteam',   name: 'Non-Steam' },
]

export function EditShelfModal({ closeModal, controller, shelf, mode = 'edit' }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf; mode?: 'create' | 'edit' }) {
  const { t, tabs: controllerTabs, collections: controllerCollections, actions } = controller
  // openManagedModal captures `controller` at click-time. If Steam's
  // collectionStore hadn't populated when the user opened the modal,
  // `controllerCollections` stays at the stale `[]` for the modal's
  // entire lifetime — even though the controller's hook updates the
  // outer state later (periodic refresh). Re-fetch inside the modal
  // so the picker fills as soon as Steam exposes the data.
  const collections = useModalCollections(controllerCollections)
  // Guard the dropdown against any failure mode in the controller's async
  // `listLibraryTabs`: empty array, undefined, or never-resolved. Native
  // defaults below are the same 5 IDs `listLibraryTabs` would have
  // returned, so localized labels via `detectNativeKey` still apply.
  const platformTabs = (Array.isArray(controllerTabs) && controllerTabs.length > 0)
    ? controllerTabs : NATIVE_FALLBACK_TABS
  const platform = usePlatform()
  const externalSources = useMemo(() => getExternalSources(), [])
  const [state, setState] = useState<EditableShelfState>(() =>
    buildInitialShelfState({ shelf, mode, collections, platformTabs, externalSources }),
  )
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [activeTab, setActiveTab] = useState<EditTab>(() => {
    // Pending-tab hint set by dispatchShelfModal({ initialTab }) — used
    // when the user picks "Decoração" from the card context menu so the
    // modal lands directly on that tab. Module-private state drains
    // itself, so each modal open consumes the value once.
    const t = consumePendingShelfModalTab()
    const valid = ['source', 'filters', 'childFilters', 'visual', 'display', 'decoration']
    if (t && valid.includes(t)) return t as EditTab
    return 'source'
  })
  // Index of the currently-focused card in the preview row. New
  // synthetic decorations land at this slot when the user clicks
  // "+ Add decoration"; falls back to the end of the row when nothing
  // is focused yet. Bumped by ShelfPreview via onFocusedIndexChange.
  const [previewFocusedIndex, setPreviewFocusedIndex] = useState<number>(0)
  // Bumped by the preview's RefreshCard to force a re-resolve in any tab.
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0)
  // Preview-isolated cache namespace so refreshing the modal doesn't poison
  // the home shelf cache with unsaved edits, and so invalidating only wipes
  // the preview's own entries.
  const previewShelfId = `${shelf.id}-preview`
  const refreshPreview = () => {
    invalidateSmartShelfCache(previewShelfId)
    invalidateRandomSortCache(previewShelfId)
    setPreviewRefreshNonce((n) => n + 1)
  }
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf.highlightedAppIds?.length ?? 0) > 0)
  const [hiddenPickerOpen, setHiddenPickerOpen] = useState(((shelf as any).hiddenAppIds?.length ?? 0) > 0)
  const [alternatingMode, setAlternatingMode] = useState<'odd' | 'even' | null>(null)
  const prePatternHighlightsRef = useRef<number[] | null>(null)
  const activeSort = state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort
  const isManualSort = activeSort === 'manual'
  // Synthetic cards are encoded as negative ids when interleaved with
  // the manual-sort row so the user can drag them alongside real games.
  // Encoding: `-(syntheticIndex + 1)`. The reorder handler splits them
  // back out before persisting (positive ids → manualOrder; negative
  // ids → syntheticCards[i].position = their new slot index).
  const SYNTH_SENTINEL = (i: number) => -(i + 1)
  const synthIndexOfSentinel = (id: number) => (id < 0 ? -id - 1 : -1)

  const previewSource = useMemo(() => {
    const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
    const primary = buildPrimarySourceShared({ state, childFilter })
    return assembleFinalSource(primary, state)
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort, state.filter.sortReverse, state.manualBaseSort, state.childFilterGroup, state.excludeOwned, state.excludeOwnedNonSteam, state.hideOwnedNonSteamCloud, state.compositeCombine, state.additionalSources])

  const { previewCount, resolvedIds, resolvedMeta } = usePreviewResolution({
    state, previewSource, previewShelfId, hiddenPickerOpen, previewRefreshNonce, platform,
  })

  const effectiveManualOrder = useMemo(() => {
    if (!isManualSort) return resolvedIds
    const idSet = new Set(resolvedIds)
    // Mirror applyManualOrder's split: in-source manual entries lead,
    // source items not drag-ordered follow, manual entries appended via
    // the library context menu (not in the source set) go at the very
    // END so they're always visible. Hidden cards STAY in the preview
    // (overlaid with the ✕ marker by ShelfPreview) so the user can see
    // which games are hidden in every tab. The home shelf still
    // filters them via `applyManualOrder`'s hiddenAppIds arg — preview
    // and home intentionally diverge on this point.
    const gameOrder: number[] = []
    const appendTail: number[] = []
    const seen = new Set<number>()
    for (const id of state.manualOrder) {
      if (id < 0) continue // legacy / unexpected sentinel — recomputed below
      if (seen.has(id)) continue
      seen.add(id)
      if (idSet.has(id)) gameOrder.push(id)
      else appendTail.push(id)
    }
    for (const id of resolvedIds) if (!seen.has(id)) gameOrder.push(id)
    gameOrder.push(...appendTail)
    if (!state.syntheticCards.length) return gameOrder
    // Interleave decoration sentinels at their persisted `position`.
    // Sorted asc so earlier slots splice before later ones (later splice
    // positions stay valid as the array grows).
    const synthEntries = state.syntheticCards
      .map((c, i) => ({ pos: Math.max(0, Number(c.position) || 0), sentinel: SYNTH_SENTINEL(i) }))
      .sort((a, b) => a.pos - b.pos)
    const out = gameOrder.slice()
    for (const { pos, sentinel } of synthEntries) {
      out.splice(Math.min(pos, out.length), 0, sentinel)
    }
    return out
  }, [isManualSort, resolvedIds, state.manualOrder, state.syntheticCards])

  const reorderManual = (nextOrder: number[]) => setState((prev) => {
    // Persist ONLY game appids in `manualOrder`. Synthetic positions
    // live in `syntheticCards[].position` (updated below) so adding /
    // removing decoration cards never needs to remap sentinels in
    // manualOrder. Result: manualOrder stays a clean appid list, and
    // dragging a decoration around the grid just shifts its `position`.
    const nextManualOrder: number[] = []
    const nextSynth = prev.syntheticCards.slice()
    for (let i = 0; i < nextOrder.length; i++) {
      const id = nextOrder[i]
      if (id >= 0) { nextManualOrder.push(id); continue }
      const synthIdx = synthIndexOfSentinel(id)
      if (synthIdx >= 0 && synthIdx < nextSynth.length) {
        nextSynth[synthIdx] = { ...nextSynth[synthIdx], position: i }
      }
    }
    return { ...prev, manualOrder: nextManualOrder, syntheticCards: nextSynth }
  })
  const { settings } = controller
  const allSourceTypes: SourceType[] = [
    ...BASE_SOURCE_TYPES,
    ...(externalSources.length > 0 ? ['external' as SourceType] : []),
    ...(settings?.onlineFeaturesEnabled ? ['wishlist' as SourceType, 'store' as SourceType] : []),
  ]
  const sourceTypeOptions: SingleDropdownOption[] = allSourceTypes.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') :
           value === 'tab' ? t('source_tab') :
           value === 'external' ? t('source_external') :
           value === 'wishlist' ? <span style={{ display:'inline-flex',alignItems:'center',gap:4 }}><OnlineIcon size={14} style={{ opacity:0.7 }} />{t('source_wishlist')}</span> as any :
           value === 'store' ? <span style={{ display:'inline-flex',alignItems:'center',gap:4 }}><OnlineIcon size={14} style={{ opacity:0.7 }} />{t('source_store')}</span> as any :
           t('source_filter'),
  }))
  // Native library tabs get a localized label + a small library-grid icon.
  // Detection by slugified ID OR slugified name OR slug-of-localized-name —
  // covers both `listLibraryTabs` defaults (lowercase ids "all"/"installed"/…)
  // AND TabMaster tabs whose IDs are UUIDs but whose display names match
  // "Installed" / "Favorites" / etc. (in English or any of the locales below).
  const tabOptions: SingleDropdownOption[] = platformTabs
    .filter((item) => !isUnsupportedTab(item))
    .map((item) => {
      const i18nKey = detectNativeTabKey(item)
      if (i18nKey) {
        return {
          data: item.id,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', opacity: 0.9 }}><SteamIcon size={14} /></span>
              <span>{t(i18nKey as any)}</span>
            </span>
          ),
        }
      }
      return { data: item.id, label: item.name }
    })
  // Plain-text labels so title auto-fill doesn't stringify JSX to "[object Object]".
  const tabTextLabels = new Map<string, string>(
    platformTabs
      .filter((item) => !isUnsupportedTab(item))
      .map((item) => {
        const i18nKey = detectNativeTabKey(item)
        return [item.id, i18nKey ? t(i18nKey as any) : item.name]
      })
  )
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
  const externalOptions: SingleDropdownOption[] = externalSources.map((src) => ({ data: src.id, label: src.displayName ?? (src as any).label ?? src.id }))
  // Placeholder injection: when the current value isn't present in the
  // option list (no items discovered yet OR orphan id), prepend a
  // "Selecione" entry so the dropdown never renders blank. The placeholder
  // has empty `data` and disappears on first real pick.
  const placeholderOption: SingleDropdownOption = { data: '', label: t('select_placeholder' as any) }
  const withPlaceholder = (opts: SingleDropdownOption[], current: string): SingleDropdownOption[] =>
    !current || opts.some((o) => String(o.data) === current) ? opts : [placeholderOption, ...opts]
  const collectionOptionsFinal = collectionOptions.length === 0 ? [placeholderOption] : withPlaceholder(collectionOptions, state.collectionId)
  const tabOptionsFinal = tabOptions.length === 0 ? [placeholderOption] : withPlaceholder(tabOptions, state.tab)
  const externalOptionsFinal = externalOptions.length === 0 ? [placeholderOption] : withPlaceholder(externalOptions, state.externalSourceId)
  const collectionSelected = collectionOptions.some((o) => String(o.data) === state.collectionId) ? state.collectionId : ''
  const tabSelected = tabOptions.some((o) => String(o.data) === state.tab) ? state.tab : ''
  const externalSelected = externalOptions.some((o) => String(o.data) === state.externalSourceId) ? state.externalSourceId : ''
  const sortLabel = (item: typeof SORT_OPTIONS[number]) => (
    (item as any).requiresOnline
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><OnlineIcon size={14} style={{ opacity: 0.7 }} />{t(item.labelKey)}</span>
      : t(item.labelKey)
  ) as any
  // Online-only sorts (price_low, discount_high, original_price_high) rely
  // on the price cache populated by online sources — hide them when the
  // current source can't populate it. Filter sources fall through to the
  // local library, where no price data exists, so they're treated as
  // non-online too.
  const isOnlineSourceType = state.sourceType === 'wishlist' || state.sourceType === 'store'
  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS
      .filter((item) => isOnlineSourceType || !(item as any).requiresOnline)
      .map((item) => ({ data: item.value, label: sortLabel(item) })),
    [t, isOnlineSourceType]
  )
  // `random` is excluded under a manual sort: re-shuffling the manual order
  // every render would defeat the user's explicit ordering. Persisted values
  // stay intact — only the option is hidden from this dropdown.
  const baseSortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS
      .filter((item) => item.value !== 'manual' && item.value !== 'random' && (isOnlineSourceType || !(item as any).requiresOnline))
      .map((item) => ({ data: item.value, label: sortLabel(item) })),
    [t, isOnlineSourceType]
  )

  const onlineLabel = (key: 'source_wishlist' | 'source_store') => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><OnlineIcon size={14} style={{ opacity: 0.7 }} />{t(key)}</span>
  ) as any
  const compositeOpts = {
    state,
    collectionOptions,
    tabOptions,
    onlineEnabled: !!settings?.onlineFeaturesEnabled,
    labels: {
      collection: t('source_collection'),
      tab: t('source_tab'),
      filter: t('source_filter'),
      wishlistLabel: onlineLabel('source_wishlist'),
      storeLabel: onlineLabel('source_store'),
    },
  }
  const buildChildTypeOptionsFn = (excludeRow: number) => buildChildTypeOptions(compositeOpts, excludeRow)
  const buildCollectionValueOpts = (excludeRow: number) => buildCollectionValueOptsShared(state, collectionOptions, excludeRow)
  const buildTabValueOpts = (excludeRow: number) => buildTabValueOptsShared(state, tabOptions, excludeRow)
  const pickNextAvailable = () => pickNextAvailableSource(compositeOpts)
  const canAddSource = buildChildTypeOptionsFn(-1).length > 0

  const changeSourceType = (type: SourceType) => {
    setState((prev) => {
      // Filter is mutually exclusive — drop any stacked additional sources
      // when the user switches into it. Composite combines aren't valid
      // alongside a filter primary, so the user is steered toward filter
      // merge for multi-criteria predicates.
      const wipeExtras = type === 'filter' ? { additionalSources: [] } : {}
      if (type === 'collection') {
        const first = collectionOptions[0]
        const nextTitle = String(first?.label ?? t('new_shelf'))
        return { ...prev, sourceType: type, title: nextTitle, collectionId: String(first?.data ?? ''), filter: normalizeFilter({ type: 'filter', filter: prev.filter }), ...wipeExtras }
      }
      if (type === 'tab') {
        const first = tabOptions[0]
        const nextTitle = first ? (tabTextLabels.get(String(first.data)) ?? t('new_shelf')) : t('new_shelf')
        return { ...prev, sourceType: type, title: nextTitle, tab: String(first?.data ?? 'all'), ...wipeExtras }
      }
      if (type === 'external') {
        const first = externalOptions[0]
        const nextTitle = String(first?.label ?? t('new_shelf'))
        return { ...prev, sourceType: type, title: nextTitle, externalSourceId: String(first?.data ?? ''), ...wipeExtras }
      }
      if (type === 'wishlist') {
        return { ...prev, sourceType: type, childFilterGroup: { mode: 'and', items: [] }, ...wipeExtras }
      }
      if (type === 'store') {
        return { ...prev, sourceType: type, ...wipeExtras }
      }
      return { ...prev, sourceType: type, filter: normalizeFilter({ type: 'filter', filter: prev.filter }), ...wipeExtras }
    })
    if (type !== 'filter' && activeTab === 'filters') setActiveTab('source')
    if (type !== 'collection' && type !== 'tab' && type !== 'wishlist' && type !== 'store' && activeTab === 'childFilters') setActiveTab('source')
  }

  const changeFilterGroup = (group: FilterGroup) => {
    setState((prev) => ({ ...prev, filterGroup: group }))
  }

  const setCollection = (value: string) => {
    const selected = collectionOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, collectionId: value, title: String(selected?.label ?? prev.title) }))
  }
  const setPlatformTab = (value: string) => {
    setState((prev) => ({ ...prev, tab: value, title: tabTextLabels.get(value) ?? prev.title }))
  }
  const handleSave = () => {
    closeModal?.();
    (async () => {
      const title = state.title.trim() || t('new_shelf');
      const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual'
      const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
      const { baseSort, baseReverse } = buildSortPatchFields(state, isManualSort)
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightRandom: state.highlightRandom, enableLogo: state.enableLogo, enableIcon: state.enableIcon, enableDescription: state.enableDescription, descriptionBelowLogo: state.descriptionBelowLogo, logoPosition: state.logoPosition, descriptionPosition: state.descriptionPosition, logoSize: state.logoSize, logoTopOffset: state.logoTopOffset, iconVerticalAlign: state.iconVerticalAlign, shelfTitlePosition: state.shelfTitlePosition, gameNamePosition: state.gameNamePosition, playtimePosition: state.playtimePosition, descriptionHeight: state.descriptionHeight, descriptionLogoGap: state.descriptionLogoGap, fullPageShelf: state.fullPageShelf || undefined, highlightedAppIds: (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined, manualOrder: (isManualSort && state.manualOrder.length) ? state.manualOrder : undefined, manualBaseSort: baseSort as any, sortReverse: state.sortReverse || undefined, manualBaseSortReverse: baseReverse as any, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideDiscountBadge: state.hideDiscountBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames, hideInstallIndicator: state.hideInstallIndicator, hideSeeMore: state.hideSeeMore, hideRefreshCard: state.hideRefreshCard, heroEnabled: state.heroEnabled };
      ;(patch as any).dedupeByExactName = state.dedupeByExactName || undefined
      ;(patch as any).hiddenAppIds = (hiddenPickerOpen && state.hiddenAppIds.length) ? state.hiddenAppIds : undefined
      const cleanedSynth = state.syntheticCards.map(sanitizeSyntheticCard)
      ;(patch as any).syntheticCards = cleanedSynth.length ? cleanedSynth : undefined
      const primarySource = buildPrimarySourceShared({ state, childFilter, platformTabs })
      patch.source = assembleFinalSource(primarySource, state) as any
      patch.sort = shelfSortForPatch(state)
      if (mode === 'create') {
        // Modal-driven create: nothing was persisted on open. Build the full
        // shelf locally and commit only on Save. Cancel/close discards.
        const draft: Shelf = { ...shelf, ...(patch as Partial<Shelf>) } as Shelf;
        const created = await actions.commitShelf(draft);
        logInfo("SETTINGS", "shelf created", { shelfId: created?.id });
      } else {
        const ok = await actions.patchShelf(shelf.id, patch);
        logInfo("SETTINGS", "shelf updated", { shelfId: shelf.id, success: ok });
      }
    })();
  }

  return (
    <ModalShell>
      <ConfirmModal
        bAllowFullSize
        onCancel={closeModal}
        onEscKeypress={closeModal}
        strTitle={`${t('editing')}: ${shelf.title}`}
        onOK={handleSave}
        strOKButtonText={t('save')}
      >
        <Focusable onMenuButton={handleSave} onMenuActionDescription={t('save')} style={{ paddingBottom: 8 }}>
          <ModalHeader
            t={t}
            title={state.title}
            onTitleChange={(next) => setState((prev) => ({ ...prev, title: next }))}
            previewCount={previewCount}
          />
          <div style={{ display: 'flex', flexDirection: 'column', height: 'min(calc(100vh - 130px), 540px)', minHeight: 400 }}>
          <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative', overflow: 'auto' }}>
          <Tabs
            activeTab={activeTab}
            onShowTab={(id: string) => setActiveTab(id as EditTab)}
            tabs={[
              {
                id: 'source',
                title: t('edit_tab_source'),
                content: (
                  <FieldContainer scrollable>
                    <DropdownItem label={t('source')} rgOptions={sourceTypeOptions} selectedOption={state.sourceType} onChange={(opt: unknown) => changeSourceType(String(optionData(opt)) as SourceType)} bottomSeparator='thick' />
                    {state.sourceType === 'collection' && (
                      <DropdownItem label={t('source_collection')} rgOptions={collectionOptionsFinal} selectedOption={collectionSelected} onChange={(opt: unknown) => setCollection(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'tab' && (
                      <DropdownItem label={t('source_tab')} rgOptions={tabOptionsFinal} selectedOption={tabSelected} onChange={(opt: unknown) => setPlatformTab(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'external' && externalOptions.length > 0 && (
                      <DropdownItem label={t('source_external')} rgOptions={externalOptionsFinal} selectedOption={externalSelected} onChange={(opt: unknown) => setState((prev) => ({ ...prev, externalSourceId: String(optionData(opt)) }))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'wishlist' && (
                      <div style={{ padding: '8px 2px 4px', fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
                        {t('source_wishlist_hint')}
                      </div>
                    )}
                    {state.sourceType === 'store' && (
                      <div style={{ padding: '8px 2px 4px', fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
                        {t('source_store_hint')}
                      </div>
                    )}
                    {/* Multi-source stacking: stack additional sources on top of
                        any primary (including filter — multi-filter is the
                        only thing forbidden, and the exhaustion logic in
                        buildChildTypeOptions takes filter out of the dropdown
                        as soon as one is in play). Saving collapses 2+
                        sources into a composite; single-source shelves keep
                        the flat shape. Combine operator only renders once
                        at least one extra is present. */}
                    {(state.additionalSources.length > 0 || canAddSource) && (
                      <>
                        {/* Combine dropdown placed BEFORE the source rows so
                            the user picks the relationship up-front (mirrors
                            the smart-shelf composite UI). Only rendered when
                            at least one extra source is added — for a single
                            source the combine operator is irrelevant. */}
                        {state.additionalSources.length > 0 && (
                          <DropdownItem
                            label={t('composite_combine_label')}
                            description={t('composite_combine_desc' as any)}
                            rgOptions={[
                              { data: 'union', label: t('composite_combine_union') },
                              { data: 'intersection', label: t('composite_combine_intersection') },
                            ]}
                            selectedOption={state.compositeCombine}
                            onChange={(opt: unknown) => setState((prev) => ({ ...prev, compositeCombine: (String(optionData(opt)) === 'intersection' ? 'intersection' : 'union') }))}
                            bottomSeparator='standard'
                          />
                        )}
                        {state.additionalSources.map((child: any, idx: number) => {
                          const rawType = child?.type;
                          const childType: 'collection' | 'tab' | 'wishlist' | 'store' | 'filter' =
                            rawType === 'collection' || rawType === 'wishlist' || rawType === 'store' || rawType === 'filter' ? rawType : 'tab';
                          const needsValuePicker = childType === 'collection' || childType === 'tab';
                          const childValue = childType === 'collection'
                            ? String(child?.collectionId ?? '')
                            : childType === 'tab'
                              ? String(child?.tab ?? 'all')
                              : '';
                          // Per-row value pickers exclude tabs/collections that
                          // are already in use elsewhere — the row keeps its
                          // OWN current pick available (excludeRow=idx).
                          const innerOpts = childType === 'collection' ? buildCollectionValueOpts(idx) : childType === 'tab' ? buildTabValueOpts(idx) : [];
                          const typeOpts = buildChildTypeOptionsFn(idx);
                          // Type options exclude exhausted sources for this
                          // row. The row's CURRENT type is always present
                          // (excludeRow=idx surfaces it) so the dropdown can
                          // show what's actually selected.
                          if (!typeOpts.some((o: SingleDropdownOption) => o.data === childType)) {
                            typeOpts.unshift({
                              data: childType,
                              label: childType === 'collection' ? t('source_collection')
                                : childType === 'tab' ? t('source_tab')
                                : childType === 'wishlist' ? t('source_wishlist')
                                : childType === 'filter' ? t('source_filter')
                                : t('source_store'),
                            });
                          }
                          const onTypeChange = (next: 'collection' | 'tab' | 'wishlist' | 'store' | 'filter') => {
                            setState((prev) => {
                              const updated = prev.additionalSources.slice();
                              if (next === 'collection') {
                                const avail = buildCollectionValueOpts(idx)[0];
                                updated[idx] = { type: 'collection', collectionId: String(avail?.data ?? '') } as any;
                              } else if (next === 'tab') {
                                const avail = buildTabValueOpts(idx)[0];
                                updated[idx] = { type: 'tab', tab: String(avail?.data ?? 'all') } as any;
                              } else if (next === 'wishlist') {
                                updated[idx] = { type: 'wishlist' } as any;
                              } else if (next === 'filter') {
                                updated[idx] = { type: 'filter', filter: { sort: 'alphabetical' } } as any;
                              } else {
                                updated[idx] = { type: 'store' } as any;
                              }
                              return { ...prev, additionalSources: updated };
                            });
                          };
                          const onValueChange = (val: string) => {
                            setState((prev) => {
                              const updated = prev.additionalSources.slice();
                              if (childType === 'collection') updated[idx] = { type: 'collection', collectionId: val } as any;
                              else if (childType === 'tab') updated[idx] = { type: 'tab', tab: val } as any;
                              return { ...prev, additionalSources: updated };
                            });
                          };
                          const onRemove = () => setState((prev) => ({ ...prev, additionalSources: prev.additionalSources.filter((_: any, i: number) => i !== idx) }));
                          const childTypeLabel =
                            childType === 'collection' ? t('source_collection')
                            : childType === 'tab' ? t('source_tab')
                            : childType === 'wishlist' ? t('source_wishlist')
                            : childType === 'filter' ? t('source_filter')
                            : t('source_store');
                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0', borderTop: idx === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                              {/* Focusable wrapper so Steam's gamepad nav
                                  treats the dropdown + × as horizontal
                                  siblings (DOM order = visual order =
                                  left-to-right). Without it the X button
                                  is reached via DOWN, which is awkward. */}
                              <Focusable style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <DropdownItem
                                    label={`${t('composite_source_label')} ${idx + 2}`}
                                    rgOptions={typeOpts}
                                    selectedOption={childType}
                                    onChange={(opt: unknown) => {
                                      const v = String(optionData(opt));
                                      onTypeChange(v === 'collection' || v === 'wishlist' || v === 'store' || v === 'filter' ? v : 'tab');
                                    }}
                                    bottomSeparator='none'
                                  />
                                </div>
                                <DialogButton onClick={onRemove} onOKButton={onRemove} style={{ minWidth: 40, width: 40, padding: 8 }} onOKActionDescription={t('composite_remove_source')}>×</DialogButton>
                              </Focusable>
                              {needsValuePicker && (
                                <DropdownItem
                                  label={childTypeLabel}
                                  rgOptions={innerOpts}
                                  selectedOption={childValue}
                                  onChange={(opt: unknown) => onValueChange(String(optionData(opt)))}
                                  bottomSeparator='none'
                                />
                              )}
                            </div>
                          );
                        })}
                        {canAddSource && (
                          <DialogButton
                            onClick={() => setState((prev) => {
                              const next = pickNextAvailable()
                              if (!next) return prev
                              return { ...prev, additionalSources: [...prev.additionalSources, next] }
                            })}
                            onOKActionDescription={t('composite_add_source')}
                            style={{ width: '100%', marginTop: 4 }}
                          >+ {t('composite_add_source')}</DialogButton>
                        )}
                      </>
                    )}
                    {(() => {
                      // Owned-exclusion toggles, one block per online source.
                      // Primary (when online) uses the editor's
                      // `state.excludeOwned/...` fields. Each additional
                      // online source stores its own values on its own
                      // entry (`state.additionalSources[i].excludeOwned/...`).
                      const primaryOnline = state.sourceType === 'wishlist' || state.sourceType === 'store'
                      const onlineAdditionalIdx: number[] = state.additionalSources
                        .map((s: any, i) => ((s?.type === 'wishlist' || s?.type === 'store') ? i : -1))
                        .filter((i) => i >= 0)
                      if (!primaryOnline && onlineAdditionalIdx.length === 0) return null
                      type Slot = {
                        key: string
                        label?: string
                        excludeOwned: boolean
                        excludeOwnedNonSteam: boolean
                        hideOwnedNonSteamCloud: boolean
                        setExcludeOwned: (v: boolean) => void
                        setExcludeOwnedNonSteam: (v: boolean) => void
                        setHideOwnedNonSteamCloud: (v: boolean) => void
                      }
                      const slots: Slot[] = []
                      if (primaryOnline) {
                        slots.push({
                          key: 'primary',
                          label: t(state.sourceType === 'wishlist' ? 'source_wishlist' : 'source_store'),
                          excludeOwned: state.excludeOwned,
                          excludeOwnedNonSteam: state.excludeOwnedNonSteam,
                          hideOwnedNonSteamCloud: state.hideOwnedNonSteamCloud,
                          setExcludeOwned: (v) => setState((prev) => ({ ...prev, excludeOwned: v, excludeOwnedNonSteam: v ? prev.excludeOwnedNonSteam : false, hideOwnedNonSteamCloud: v ? prev.hideOwnedNonSteamCloud : false })),
                          setExcludeOwnedNonSteam: (v) => setState((prev) => ({ ...prev, excludeOwnedNonSteam: v, hideOwnedNonSteamCloud: v ? prev.hideOwnedNonSteamCloud : false })),
                          setHideOwnedNonSteamCloud: (v) => setState((prev) => ({ ...prev, hideOwnedNonSteamCloud: v })),
                        })
                      }
                      for (const idx of onlineAdditionalIdx) {
                        const src: any = state.additionalSources[idx]
                        const eo = src?.excludeOwned === true
                        const eons = eo && src?.excludeOwnedNonSteam === true
                        const eocloud = eons && src?.hideOwnedNonSteamCloud === true
                        const patchSource = (next: any) => setState((prev) => {
                          const updated = prev.additionalSources.slice()
                          const cur: any = updated[idx]
                          updated[idx] = { ...cur, ...next }
                          // Strip cleared flags so persisted JSON stays minimal
                          for (const k of ['excludeOwned', 'excludeOwnedNonSteam', 'hideOwnedNonSteamCloud']) {
                            if ((updated[idx] as any)[k] !== true) delete (updated[idx] as any)[k]
                          }
                          return { ...prev, additionalSources: updated }
                        })
                        slots.push({
                          key: `add-${idx}`,
                          label: t(src?.type === 'wishlist' ? 'source_wishlist' : 'source_store'),
                          excludeOwned: eo,
                          excludeOwnedNonSteam: eons,
                          hideOwnedNonSteamCloud: eocloud,
                          setExcludeOwned: (v) => patchSource({ excludeOwned: v, excludeOwnedNonSteam: v ? src?.excludeOwnedNonSteam === true : false, hideOwnedNonSteamCloud: v ? src?.hideOwnedNonSteamCloud === true : false }),
                          setExcludeOwnedNonSteam: (v) => patchSource({ excludeOwnedNonSteam: v, hideOwnedNonSteamCloud: v ? src?.hideOwnedNonSteamCloud === true : false }),
                          setHideOwnedNonSteamCloud: (v) => patchSource({ hideOwnedNonSteamCloud: v }),
                        })
                      }
                      const multi = slots.length > 1
                      return (
                        <>
                          {slots.map((slot) => (
                            <div key={slot.key} style={multi ? { marginBottom: 6 } : undefined}>
                              {multi && slot.label && (
                                <div style={{ fontSize: 13, opacity: 0.85, padding: '4px 0', fontWeight: 600 }}>{slot.label}</div>
                              )}
                              <ToggleField
                                label={t('exclude_owned_label')}
                                checked={slot.excludeOwned}
                                onChange={slot.setExcludeOwned}
                              />
                              {slot.excludeOwned && (
                                <div style={{ paddingLeft: 16 }}>
                                  <ToggleField
                                    label={t('hide_owned_non_steam')}
                                    checked={slot.excludeOwnedNonSteam}
                                    onChange={slot.setExcludeOwnedNonSteam}
                                  />
                                  {slot.excludeOwnedNonSteam && (
                                    <div style={{ paddingLeft: 16 }}>
                                      <ToggleField
                                        label={t('hide_owned_non_steam_cloud')}
                                        checked={slot.hideOwnedNonSteamCloud}
                                        onChange={slot.setHideOwnedNonSteamCloud}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )
                    })()}
                    <SortField
                      label={t('filter_mode')}
                      options={sortOptions}
                      sort={state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort}
                      onSortChange={(next) => setState((prev) => prev.sourceType === 'filter'
                        ? { ...prev, filter: { ...prev.filter, sort: next as ShelfFilter['sort'] } }
                        : { ...prev, sort: next })}
                      reverse={state.sourceType === 'filter' ? (state.filter.sortReverse ?? false) : state.sortReverse}
                      onReverseChange={(next) => setState((prev) => prev.sourceType === 'filter'
                        ? { ...prev, filter: { ...prev.filter, sortReverse: next } }
                        : { ...prev, sortReverse: next })}
                      allowMultiKey
                    />
                    {isManualSort && (
                      <SortField
                        label={t('manual_base_sort')}
                        options={baseSortOptions}
                        sort={state.manualBaseSort}
                        onSortChange={(next) => setState((prev) => ({ ...prev, manualBaseSort: next }))}
                        reverse={state.manualBaseSortReverse}
                        onReverseChange={(next) => setState((prev) => ({ ...prev, manualBaseSortReverse: next }))}
                        allowMultiKey
                      />
                    )}
                    <DSSliderField
                      label={t('limit')}
                      value={state.limit}
                      min={1}
                      max={50}
                      step={1}
                      bottomSeparator='none'
                      onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))}
                    />
                  </FieldContainer>
                ),
              },
              ...((() => {
                // The filters tab is visible whenever there's exactly one
                // filter source on the shelf — either as the primary OR
                // stacked as a secondary (the editor's exhaustion logic
                // caps filter sources at 1 per shelf). When the filter
                // is secondary, this tab edits THAT row's filterGroup
                // instead of `state.filterGroup` so the user has a UI to
                // fill in the criteria of a stacked filter source.
                const secondaryFilterIdx = state.additionalSources.findIndex((s: any) => s?.type === 'filter')
                const isPrimaryFilter = state.sourceType === 'filter'
                const isSecondaryFilter = secondaryFilterIdx >= 0
                if (!isPrimaryFilter && !isSecondaryFilter) return []
                const editingGroup = isPrimaryFilter
                  ? state.filterGroup
                  : ((state.additionalSources[secondaryFilterIdx] as any)?.filter?.filterGroup ?? { mode: 'and', items: [] })
                const onChangeGroup = isPrimaryFilter
                  ? changeFilterGroup
                  : (next: any) => setState((prev) => {
                      const updated = prev.additionalSources.slice()
                      const cur: any = updated[secondaryFilterIdx] ?? { type: 'filter', filter: { sort: 'alphabetical' } }
                      const curFilter = cur.filter ?? { sort: 'alphabetical' }
                      updated[secondaryFilterIdx] = { ...cur, filter: { ...curFilter, filterGroup: next } }
                      return { ...prev, additionalSources: updated }
                    })
                return [{
                  id: 'filters',
                  // Tab.title typed `string` but renders any ReactNode.
                  title: (<TabLabel icon={<FunnelIcon />} text={t('edit_tab_filters')} />) as unknown as string,
                  content: (
                    <FieldContainer>
                      <SavedFiltersBar
                        controller={controller}
                        currentGroup={editingGroup}
                        onApply={onChangeGroup}
                      />
                      <FilterPanel group={editingGroup} onChange={onChangeGroup} controller={controller} allowOnlineFilters={false} />
                    </FieldContainer>
                  ),
                }]
              })()),
              ...((() => {
                // Filters tab visibility:
                //  - direct collection / tab → single regular childFilter block
                //  - direct wishlist / store → single online-filter block
                //  - composite with online children → ONE block PER online
                //    child (each child carries its own childFilter on its
                //    source entry; composite parent has none).
                //  - composite with only offline children → no tab.
                const isComposite = state.additionalSources.length > 0 && state.sourceType !== 'filter';
                const primaryOnline = state.sourceType === 'wishlist' || state.sourceType === 'store';
                const primaryOffline = state.sourceType === 'collection' || state.sourceType === 'tab';
                const onlineAdditionalIdx: number[] = state.additionalSources
                  .map((s: any, i) => ((s?.type === 'wishlist' || s?.type === 'store') ? i : -1))
                  .filter((i) => i >= 0)
                const compositeOnlineChild = isComposite && (primaryOnline || onlineAdditionalIdx.length > 0);
                const showTab = primaryOffline || primaryOnline || compositeOnlineChild;
                if (!showTab) return [];
                const allowOnline = primaryOnline || compositeOnlineChild;
                const tabLabelKey = allowOnline ? 'edit_tab_online_filters' : 'edit_tab_additional_filters';
                // Build the slot list. Slots[0] always exists when the tab
                // shows: it's the primary's filter when primary is online
                // OR offline; when primary is offline (collection/tab) the
                // panel is regular (no online predicates).
                type Slot = { key: string; label?: string; group: FilterGroup; onChange: (g: FilterGroup) => void; allowOnline: boolean }
                const slots: Slot[] = []
                if (primaryOffline || primaryOnline) {
                  slots.push({
                    key: 'primary',
                    label: primaryOnline
                      ? t(state.sourceType === 'wishlist' ? 'source_wishlist' : 'source_store')
                      : undefined,
                    group: state.childFilterGroup,
                    onChange: (group) => setState((prev) => ({ ...prev, childFilterGroup: group })),
                    allowOnline: primaryOnline,
                  })
                }
                for (const idx of onlineAdditionalIdx) {
                  const src: any = state.additionalSources[idx]
                  const group: FilterGroup = src?.childFilter ?? { mode: 'and', items: [] }
                  const slotLabel = t(src?.type === 'wishlist' ? 'source_wishlist' : 'source_store')
                  slots.push({
                    key: `add-${idx}`,
                    label: slotLabel,
                    group,
                    onChange: (next) => setState((prev) => {
                      const updated = prev.additionalSources.slice()
                      const cur: any = updated[idx]
                      updated[idx] = next.items.length > 0
                        ? { ...cur, childFilter: next }
                        : (() => { const { childFilter: _drop, ...rest } = cur; return rest as any })()
                      return { ...prev, additionalSources: updated }
                    }),
                    allowOnline: true,
                  })
                }
                // When primary is composite-but-offline (e.g. collection)
                // with online additionals, we don't surface a slot for the
                // primary — the online predicates only apply to the online
                // children.
                if (slots.length === 0) {
                  // composite with only offline children (shouldn't happen
                  // because showTab gates) — bail out safely.
                  return []
                }
                const multi = slots.length > 1
                return [{
                  id: 'childFilters',
                  title: (<TabLabel icon={<FunnelIcon />} text={t(tabLabelKey as any)} />) as unknown as string,
                  content: (
                    <FieldContainer>
                      {slots.map((slot) => (
                        <div key={slot.key} style={multi ? { marginBottom: 8 } : undefined}>
                          {multi && slot.label && (
                            <div style={{ fontSize: 13, opacity: 0.85, padding: '4px 0', fontWeight: 600 }}>{slot.label}</div>
                          )}
                          <SavedFiltersBar
                            controller={controller}
                            currentGroup={slot.group}
                            onApply={slot.onChange}
                          />
                          <FilterPanel group={slot.group} onChange={slot.onChange} controller={controller} allowOnlineFilters={slot.allowOnline} />
                        </div>
                      ))}
                    </FieldContainer>
                  ),
                }];
              })()),
              {
                id: 'visual',
                title: t('edit_tab_visual'),
                content: (
                  <VisualTabContent
                    t={t}
                    flags={{ matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightRandom: state.highlightRandom, enableLogo: state.enableLogo, enableIcon: state.enableIcon, enableDescription: state.enableDescription, descriptionBelowLogo: state.descriptionBelowLogo, logoPosition: state.logoPosition, descriptionPosition: state.descriptionPosition, logoSize: state.logoSize, logoTopOffset: state.logoTopOffset, iconVerticalAlign: state.iconVerticalAlign, shelfTitlePosition: state.shelfTitlePosition, gameNamePosition: state.gameNamePosition, playtimePosition: state.playtimePosition, descriptionHeight: state.descriptionHeight, descriptionLogoGap: state.descriptionLogoGap, fullPageShelf: state.fullPageShelf, heroEnabled: state.heroEnabled }}
                    setFlags={(patch) => setState((prev) => ({ ...prev, ...patch }))}
                    highlightedAppIds={state.highlightedAppIds}
                    setHighlightedAppIds={(next) => setState((prev) => ({ ...prev, highlightedAppIds: next }))}
                    highlightPickerOpen={highlightPickerOpen}
                    setHighlightPickerOpen={setHighlightPickerOpen}
                    alternatingMode={alternatingMode}
                    setAlternatingMode={setAlternatingMode}
                    prePatternHighlightsRef={prePatternHighlightsRef}
                    effectiveManualOrder={effectiveManualOrder}
                  />
                ),
              },
              {
                id: 'decoration',
                title: t('edit_tab_decoration'),
                content: (
                  <DecorationTab
                    t={t}
                    cards={state.syntheticCards}
                    setCards={(next: any) => setState((prev) => ({ ...prev, syntheticCards: next }))}
                    defaultPosition={previewFocusedIndex}
                    onFirstCardAdded={() => setState((prev) => {
                      // Auto-engage manual sort + seed manualOrder from
                      // the currently resolved row so the decoration
                      // can later be reordered alongside real games.
                      // Already-manual shelves keep their current
                      // manualOrder + manualBaseSort untouched — adding
                      // a decoration must NEVER reset the user's order.
                      // For filter sources the relevant sort lives in
                      // `prev.filter.sort`, not `prev.sort`; check both.
                      const isManualShelf = prev.sort === 'manual'
                      const isManualFilter = prev.sourceType === 'filter' && prev.filter?.sort === 'manual'
                      if (isManualShelf || isManualFilter) return prev
                      return {
                        ...prev,
                        sort: 'manual',
                        sortReverse: false,
                        manualBaseSort: typeof prev.sort === 'string' ? prev.sort : (Array.isArray(prev.sort) ? prev.sort[0] : 'alphabetical'),
                        manualOrder: resolvedIds.slice(),
                      }
                    })}
                  />
                ),
              },
              {
                id: 'display',
                title: (<TabLabel icon={<EyeIcon />} text={t('edit_tab_display')} />) as unknown as string,
                content: (
                  <DisplayTabContent
                    t={t}
                    display={{ hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideDiscountBadge: state.hideDiscountBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames === true, hideInstallIndicator: state.hideInstallIndicator === true, hideSeeMore: state.hideSeeMore === true, hideRefreshCard: state.hideRefreshCard === true }}
                    setDisplay={(patch) => setState((prev) => ({ ...prev, ...patch }))}
                    hasNonSteamBadges={hasNonSteamBadges}
                    dedupeByExactName={state.dedupeByExactName}
                    setDedupeByExactName={(v) => setState((prev) => ({ ...prev, dedupeByExactName: v }))}
                    setHiddenAppIds={(next) => setState((prev) => ({ ...prev, hiddenAppIds: next }))}
                    hiddenPickerOpen={hiddenPickerOpen}
                    setHiddenPickerOpen={setHiddenPickerOpen}
                  />
                ),
              },
            ]}
          />
          </div>
          <PreviewPanel
            t={t}
            title={state.title}
            hideShelfTitle={state.hideShelfTitle}
            activeTab={activeTab}
            resolvedIds={resolvedIds}
            effectiveManualOrder={effectiveManualOrder}
            resolvedMeta={(() => {
              // Merge resolvedMeta with synthetic-card sentinel entries
              // so the manual-sort row can render decoration cards as
              // mini-cards alongside game cards. Sentinel id =
              // -(syntheticIndex + 1) per the encoding in
              // effectiveManualOrder.
              if (!state.syntheticCards.length) return resolvedMeta
              const m = new Map(resolvedMeta)
              state.syntheticCards.forEach((c, i) => {
                m.set(SYNTH_SENTINEL(i), {
                  appid: SYNTH_SENTINEL(i),
                  name: c.text ? c.text : (c.image ? '🖼' : '◇'),
                  portraitUrl: c.image,
                } as any)
              })
              return m
            })()}
            isManualSort={isManualSort}
            onReorderManual={reorderManual}
            highlightFirst={state.highlightFirst}
            highlightAll={state.highlightAll}
            highlightedAppIds={state.highlightedAppIds}
            alternatingMode={alternatingMode}
            hiddenAppIds={state.hiddenAppIds}
            hideStatusLine={state.hideStatusLine}
            hideNewBadge={state.hideNewBadge}
            hideCompatIcons={state.hideCompatIcons}
            hideNonSteamBadge={state.hideNonSteamBadge}
            hideGameNames={state.hideGameNames === true}
            hideInstallIndicator={state.hideInstallIndicator === true}
            hideSeeMore={state.hideSeeMore === true}
            hideRefreshCard={state.hideRefreshCard === true}
            limit={state.limit}
            shelfSource={previewSource}
            shelfSort={state.sort}
            onRefresh={refreshPreview}
            onFocusedIndexChange={setPreviewFocusedIndex}
            syntheticCards={state.syntheticCards}
            selectionMode={
              activeTab === 'visual' && highlightPickerOpen ? 'highlight'
                : activeTab === 'display' && hiddenPickerOpen ? 'hidden'
                : undefined
            }
            selectionSet={
              activeTab === 'visual' && highlightPickerOpen ? new Set(state.highlightedAppIds)
                : activeTab === 'display' && hiddenPickerOpen ? new Set(state.hiddenAppIds)
                : undefined
            }
            onToggleSelection={
              activeTab === 'visual' && highlightPickerOpen
                ? (id: number) => setState((prev) => {
                    setAlternatingMode(null)
                    prePatternHighlightsRef.current = null
                    const has = prev.highlightedAppIds.includes(id)
                    return { ...prev, highlightedAppIds: has ? prev.highlightedAppIds.filter((x) => x !== id) : [...prev.highlightedAppIds, id] }
                  })
                : activeTab === 'display' && hiddenPickerOpen
                  ? (id: number) => setState((prev) => {
                      const has = prev.hiddenAppIds.includes(id)
                      return { ...prev, hiddenAppIds: has ? prev.hiddenAppIds.filter((x) => x !== id) : [...prev.hiddenAppIds, id] }
                    })
                  : undefined
            }
            removableSet={(() => {
              if (!state.manualOrder.length) return undefined
              const inSource = new Set(resolvedIds)
              const tail = state.manualOrder.filter((id) => !inSource.has(id))
              return tail.length ? new Set(tail) : undefined
            })()}
            onRemoveCard={(id) => setState((prev) => ({ ...prev, manualOrder: prev.manualOrder.filter((x) => x !== id) }))}
          />
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
