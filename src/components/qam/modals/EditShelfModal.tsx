import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  Dropdown,
  DropdownItem,
  Field,
  Focusable,
  SliderField,
  Tabs,
} from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../../../domain/settings'
import { FilterPanel } from '../../FilterPanel'
import { FieldContainer, ModalShell } from '../../ui'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds } from '../../../steam'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { BASE_SOURCE_TYPES, SORT_OPTIONS, type SourceType, type EditTab } from './editShelf/constants'
import type { EditableShelfState } from './editShelf/types'
import { optionData } from './editShelf/utils'
import { ManualSortRow } from './editShelf/ManualSortRow'
import { SortDirectionButton } from './editShelf/SortDirectionButton'
import { SavedFiltersBar } from './editShelf/SavedFiltersBar'
import { VisualTabContent } from './editShelf/VisualTabContent'
import { DisplayTabContent } from './editShelf/DisplayTabContent'
import { HighlightRow } from './editShelf/HighlightRow'
import { HighlightMiniCard } from './editShelf/HighlightMiniCard'
import { FunnelIcon, EyeIcon, SteamIcon } from '../../icons'

// Tab title with optional leading icon — uses inline-flex so the icon
// aligns vertically with the label text. Applied selectively (not every
// tab) so the strip stays uncluttered.
function TabLabel({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {text}
    </span>
  )
}
import { ModalHeader } from './editShelf/ModalHeader'


export function EditShelfModal({ closeModal, controller, shelf, mode = 'edit' }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf; mode?: 'create' | 'edit' }) {
  const { t, tabs: platformTabs, collections, actions } = controller
  const platform = usePlatform()
  const externalSources = useMemo(() => getExternalSources(), [])
  const initialSourceType = shelf.source.type as SourceType
  const initialFilter = normalizeFilter(shelf.source)
  const initialFilterGroup = getEffectiveFilterGroup(initialFilter)
  const [state, setState] = useState<EditableShelfState>({
    title: shelf.title,
    sourceType: initialSourceType,
    collectionId: shelf.source.type === 'collection' ? shelf.source.collectionId : String(collections[0]?.id ?? ''),
    tab: shelf.source.type === 'tab' ? shelf.source.tab : String(platformTabs[0]?.id ?? 'all'),
    externalSourceId: shelf.source.type === 'external' ? shelf.source.sourceId : (externalSources[0]?.id ?? ''),
    filter: initialFilter,
    filterGroup: initialFilterGroup,
    sort: (shelf as any).sort ?? 'alphabetical',
    sortReverse: (shelf as any).sortReverse ?? false,
    manualBaseSort: (shelf as any).manualBaseSort ?? 'alphabetical',
    manualBaseSortReverse: (shelf as any).manualBaseSortReverse ?? false,
    limit: shelf.limit,
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    highlightAll: shelf.highlightAll ?? false,
    highlightedAppIds: shelf.highlightedAppIds ?? [],
    manualOrder: (shelf as any).manualOrder ?? [],
    hideStatusLine: shelf.hideStatusLine ?? false,
    hideNewBadge: shelf.hideNewBadge ?? false,
    hideCompatIcons: shelf.hideCompatIcons ?? false,
    hideNonSteamBadge: shelf.hideNonSteamBadge ?? false,
    hideShelfTitle: (shelf as any).hideShelfTitle ?? false,
    hideGameNames: (shelf as any).hideGameNames ?? false,
    hideInstallIndicator: (shelf as any).hideInstallIndicator ?? false,
    hideSeeMore: (shelf as any).hideSeeMore ?? false,
    hideRefreshCard: (shelf as any).hideRefreshCard ?? false,
    dedupeByExactName: (shelf as any).dedupeByExactName ?? false,
    hiddenAppIds: (shelf as any).hiddenAppIds ?? [],
    childFilterGroup: (() => {
      if (shelf.source.type === 'collection' || shelf.source.type === 'tab') {
        return (shelf.source as any).childFilter ?? { mode: 'and', items: [] }
      }
      return { mode: 'and', items: [] }
    })(),
  })
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditTab>('source')
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>>(new Map())
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf.highlightedAppIds?.length ?? 0) > 0)
  const [hiddenPickerOpen, setHiddenPickerOpen] = useState(((shelf as any).hiddenAppIds?.length ?? 0) > 0)
  const [hiddenCandidateIds, setHiddenCandidateIds] = useState<number[]>([])
  const [hiddenCandidateMeta, setHiddenCandidateMeta] = useState<Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>>(new Map())
  const [alternatingMode, setAlternatingMode] = useState<'odd' | 'even' | null>(null)
  const prePatternHighlightsRef = useRef<number[] | null>(null)
  const activeSort = state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort
  const isManualSort = activeSort === 'manual'
  const effectiveManualOrder = useMemo(() => {
    if (!isManualSort) return resolvedIds
    const idSet = new Set(resolvedIds)
    const out: number[] = []
    for (const id of state.manualOrder) if (idSet.has(id) && !out.includes(id)) out.push(id)
    for (const id of resolvedIds) if (!out.includes(id)) out.push(id)
    return out
  }, [isManualSort, resolvedIds, state.manualOrder])
  const reorderManual = (nextOrder: number[]) => setState((prev) => ({ ...prev, manualOrder: nextOrder }))
  const effectiveHiddenCandidateIds = useMemo(() => {
    if (!isManualSort || !hiddenCandidateIds.length) return hiddenCandidateIds
    const idSet = new Set(hiddenCandidateIds)
    const out: number[] = []
    for (const id of state.manualOrder) if (idSet.has(id) && !out.includes(id)) out.push(id)
    for (const id of hiddenCandidateIds) if (!out.includes(id)) out.push(id)
    return out
  }, [isManualSort, hiddenCandidateIds, state.manualOrder])

  const previewSource = useMemo(() => {
    const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
    if (state.sourceType === 'collection') return { type: 'collection' as const, collectionId: state.collectionId, ...(childFilter ? { childFilter } : {}) }
    if (state.sourceType === 'tab') return { type: 'tab' as const, tab: state.tab, ...(childFilter ? { childFilter } : {}) }
    if (state.sourceType === 'external') return { type: 'external' as const, sourceId: state.externalSourceId }
    // When manual sort is active, use the configured base sort for the
    // preview so the mini-card row reflects the actual order of non-manual
    // positions at runtime (matches what Shelf.tsx resolves on home).
    const previewSort = state.filter.sort === 'manual' ? state.manualBaseSort : state.filter.sort
    const effectiveFilter = filterGroupToFilter(state.filterGroup, previewSort as ShelfFilter['sort'])
    return { type: 'filter' as const, filter: effectiveFilter }
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort, state.manualBaseSort, state.childFilterGroup])

  useEffect(() => {
    let cancelled = false
    setPreviewCount(null)
    const timer = setTimeout(() => {
      // Mirror the resolver wiring used by Shelf.tsx so the preview reflects
      // sort + asc/desc inversion the user is configuring. Filter sources
      // carry their sort inside `state.filter.sort` (already embedded in
      // `previewSource` via `filterGroupToFilter`), so no third-arg sort is
      // needed for that branch — `previewSort` falls back to undefined.
      // Other source types pass `state.sort` plus the alphabetical fallback
      // when reverse is on but no explicit sort is set.
      const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual'
      const previewReverse = isManualSort
        ? !!state.manualBaseSortReverse
        : !!state.sortReverse
      let previewSort: string | undefined
      if (state.sourceType === 'filter') {
        previewSort = undefined
      } else if (isManualSort) {
        previewSort = state.manualBaseSort || 'alphabetical'
      } else {
        previewSort = state.sort || (previewReverse ? 'alphabetical' : undefined)
      }
      resolveShelfAppIds(previewSource, state.limit, previewSort, undefined, previewReverse, {
        hiddenAppIds: hiddenPickerOpen && state.hiddenAppIds.length ? state.hiddenAppIds : undefined,
        dedupeByName: state.dedupeByExactName || undefined,
      })
        .then((ids) => {
          if (cancelled) return
          setPreviewCount(ids.length)
          setResolvedIds(ids)
        })
        .catch(() => {
          if (cancelled) return
          setPreviewCount(0)
          setResolvedIds([])
        })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [previewSource, state.limit, state.sourceType, state.sort, state.filter.sort, state.manualBaseSort, state.sortReverse, state.manualBaseSortReverse, state.dedupeByExactName, state.hiddenAppIds.join(','), hiddenPickerOpen])

  useEffect(() => {
    let cancelled = false
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return }
    ;(async () => {
      const next = new Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>()
      for (const id of resolvedIds) {
        try {
          const meta = await platform.getAppMeta(id)
          next.set(id, { name: meta?.name || `App ${id}`, portraitUrl: meta?.portraitUrl, heroUrl: meta?.heroUrl })
        } catch { next.set(id, { name: `App ${id}` }) }
      }
      if (!cancelled) setResolvedMeta(next)
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(',')])

  // Fetch overshoot candidates for hidden-games picker: uses limit*3 without
  // hiddenAppIds applied, so the user sees all slots they can fill/hide.
  useEffect(() => {
    if (!hiddenPickerOpen) return
    let cancelled = false
    const timer = setTimeout(() => {
      const isManualS = state.sort === 'manual' || state.filter.sort === 'manual'
      const previewSort = state.sourceType === 'filter'
        ? undefined
        : (isManualS ? (state.manualBaseSort || 'alphabetical') : (state.sort || undefined))
      resolveShelfAppIds(previewSource, Math.min(state.limit * 3, 100), previewSort, undefined, state.sortReverse)
        .then(async (ids) => {
          if (cancelled) return
          setHiddenCandidateIds(ids)
          const next = new Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>()
          for (const id of ids) {
            try { const m = await platform.getAppMeta(id); next.set(id, { name: m?.name || `App ${id}`, portraitUrl: m?.portraitUrl, heroUrl: m?.heroUrl }) }
            catch { next.set(id, { name: `App ${id}` }) }
          }
          if (!cancelled) setHiddenCandidateMeta(next)
        })
        .catch(() => { if (!cancelled) setHiddenCandidateIds([]) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [hiddenPickerOpen, previewSource, state.limit, state.sort, state.filter.sort, state.manualBaseSort, state.sortReverse, state.hiddenAppIds.join(',')])

  const allSourceTypes: SourceType[] = externalSources.length > 0 ? [...BASE_SOURCE_TYPES, 'external'] : BASE_SOURCE_TYPES
  const sourceTypeOptions: SingleDropdownOption[] = allSourceTypes.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') : value === 'tab' ? t('source_tab') : value === 'external' ? t('source_external') : t('source_filter'),
  }))
  // Native library tabs get a localized label + a small library-grid icon.
  // Detection by slugified ID OR slugified name OR slug-of-localized-name —
  // covers both `listLibraryTabs` defaults (lowercase ids "all"/"installed"/…)
  // AND TabMaster tabs whose IDs are UUIDs but whose display names match
  // "Installed" / "Favorites" / etc. (in English or any of the locales below).
  const slug = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  // Per-native-id allowlist of display-name slugs across locales we ship.
  // English form is always included (TabMaster's stock tabs ship in English
  // even on non-English systems).
  const NATIVE_TAB_NAME_SLUGS: Record<string, ReadonlySet<string>> = {
    all: new Set(['all', 'all_games', 'todos_os_jogos', 'todos_los_juegos', 'tous_les_jeux', 'alle_spiele', 'tutti_i_giochi', 'alle_games', 'wszystkie_gry', 'vse_igry', 'usi_igri', 'tum_oyunlar', 'subete_no_geemu', 'modeun_geim', 'suoyou_youxi']),
    favorites: new Set(['favorites', 'favoritos', 'favoris', 'favoriten', 'preferiti', 'favorieten', 'ulubione', 'izbrannoe', 'obrane', 'favoriler', 'okiniiri', 'jeulgyeochajgi', 'shoucangjia']),
    installed: new Set(['installed', 'instalados', 'instalado', 'installes', 'installiert', 'installati', 'geinstalleerd', 'zainstalowane', 'ustanovlennye', 'vstanovleni', 'yuklu', 'insutoorudumi', 'seolchidoem', 'yianzhuang']),
    hidden: new Set(['hidden', 'ocultos', 'oculto', 'masques', 'ausgeblendet', 'nascosti', 'verborgen', 'ukryte', 'skrytye', 'prikhovani', 'gizli', 'hihyouji', 'sumgim', 'yincang']),
    nonsteam: new Set(['nonsteam', 'non_steam', 'nao_steam', 'no_steam', 'nicht_steam', 'niet_steam', 'spoza_steam', 'ne_iz_steam', 'ne_zi_steam', 'steam_disi', 'steam_iwai', 'steam_oe', 'feisteam']),
  }
  const NATIVE_TAB_I18N_KEY: Record<string, string> = {
    all: 'tab_all',
    favorites: 'tab_favorites',
    installed: 'tab_installed',
    hidden: 'tab_hidden',
    nonsteam: 'tab_nonsteam',
  }
  const detectNativeKey = (item: { id: string; name: string }): string | null => {
    const idSlug = slug(item.id)
    const nameSlug = slug(item.name)
    for (const native of Object.keys(NATIVE_TAB_I18N_KEY)) {
      if (idSlug === native) return NATIVE_TAB_I18N_KEY[native]
      const slugSet = NATIVE_TAB_NAME_SLUGS[native]
      if (slugSet.has(idSlug) || slugSet.has(nameSlug)) return NATIVE_TAB_I18N_KEY[native]
    }
    return null
  }
  // Drop tabs that the plugin doesn't currently support as a shelf source.
  // "Collections" is a native Steam library tab that exposes a flat list of
  // collection groups — not an app set we can render as a row of cards.
  // Reserved for the future stacks-by-collection feature (one stack per
  // collection, see roadmap). Hide for now so users don't pick a tab that
  // would resolve to nothing meaningful.
  const UNSUPPORTED_TAB_SLUGS: ReadonlySet<string> = new Set([
    'collections', 'collection', 'colecoes', 'colecao', 'colecciones', 'coleccion',
    'collezioni', 'sammlungen', 'kolekcje', 'kollektsii', 'kolektsiyi', 'koleksiyonlar',
    'korekushon', 'kolleksyeon', 'shoucang', 'shoucangji',
  ])
  const isUnsupportedTab = (item: { id: string; name: string }): boolean => {
    return UNSUPPORTED_TAB_SLUGS.has(slug(item.id)) || UNSUPPORTED_TAB_SLUGS.has(slug(item.name))
  }
  const tabOptions: SingleDropdownOption[] = platformTabs
    .filter((item) => !isUnsupportedTab(item))
    .map((item) => {
      const i18nKey = detectNativeKey(item)
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
  // Separate plain-text labels for tab options so that title auto-fill never
  // stringifies a JSX element to "[object Object]".
  const tabTextLabels = new Map<string, string>(
    platformTabs
      .filter((item) => !isUnsupportedTab(item))
      .map((item) => {
        const i18nKey = detectNativeKey(item)
        return [item.id, i18nKey ? t(i18nKey as any) : item.name]
      })
  )
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
  const externalOptions: SingleDropdownOption[] = externalSources.map((src) => ({ data: src.id, label: src.displayName }))
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
  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.map((item) => ({ data: item.value, label: t(item.labelKey) })),
    [t]
  )
  // `random` is excluded under a manual sort: re-shuffling the manual order
  // every render would defeat the user's explicit ordering. Persisted values
  // stay intact — only the option is hidden from this dropdown.
  const baseSortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.filter((item) => item.value !== 'manual' && item.value !== 'random').map((item) => ({ data: item.value, label: t(item.labelKey) })),
    [t]
  )

  const changeSourceType = (type: SourceType) => {
    setState((prev) => {
      if (type === 'collection') {
        const first = collectionOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, collectionId: String(first?.data ?? ''), filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
      }
      if (type === 'tab') {
        const first = tabOptions[0]
        const nextTitle = first ? (tabTextLabels.get(String(first.data)) ?? t('newShelf')) : t('newShelf')
        return { ...prev, sourceType: type, title: nextTitle, tab: String(first?.data ?? 'all') }
      }
      if (type === 'external') {
        const first = externalOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, externalSourceId: String(first?.data ?? '') }
      }
      return { ...prev, sourceType: type, filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
    })
    if (type !== 'filter' && activeTab === 'filters') setActiveTab('source')
    if (type !== 'collection' && type !== 'tab' && activeTab === 'childFilters') setActiveTab('source')
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
      const title = state.title.trim() || t('newShelf');
      const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual'
      const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightedAppIds: (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined, manualOrder: (isManualSort && state.manualOrder.length) ? state.manualOrder : undefined, manualBaseSort: (isManualSort && state.manualBaseSort !== 'alphabetical') ? state.manualBaseSort : undefined, sortReverse: state.sortReverse || undefined, manualBaseSortReverse: (isManualSort && state.manualBaseSortReverse) || undefined, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames, hideInstallIndicator: state.hideInstallIndicator, hideSeeMore: state.hideSeeMore, hideRefreshCard: state.hideRefreshCard };
      ;(patch as any).dedupeByExactName = state.dedupeByExactName || undefined
      ;(patch as any).hiddenAppIds = (hiddenPickerOpen && state.hiddenAppIds.length) ? state.hiddenAppIds : undefined
      if (state.sourceType === 'collection') { patch.source = { type: 'collection', collectionId: state.collectionId, ...(childFilter ? { childFilter } : {}) } as any; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else if (state.sourceType === 'tab') {
        const selectedTab = platformTabs.find((pt) => pt.id === state.tab)
        const baseSource = selectedTab?.source ?? { type: 'tab', tab: state.tab }
        patch.source = (childFilter ? { ...baseSource, childFilter } : baseSource) as any;
        patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined;
      }
      else if (state.sourceType === 'external') { patch.source = { type: 'external', sourceId: state.externalSourceId }; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else patch.source = { type: 'filter', filter: filterGroupToFilter(state.filterGroup, state.filter.sort) };
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
          <div style={{ display: 'flex', flexDirection: 'column', height: 'min(calc(100vh - 220px), 720px)', minHeight: 360 }}>
          <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
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
                    <Field
                      label={t('filter_mode')}
                      childrenLayout="inline"
                      childrenContainerWidth="min"
                      inlineWrap="keep-inline"
                      bottomSeparator='thick'
                    >
                      <Focusable style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Focusable style={{ minWidth: 200 }}>
                          {state.sourceType === 'filter'
                            ? <Dropdown rgOptions={sortOptions} selectedOption={state.filter.sort ?? 'alphabetical'} onChange={(opt: unknown) => setState((prev) => ({ ...prev, filter: { ...prev.filter, sort: String(optionData(opt)) as ShelfFilter['sort'] } }))} focusable />
                            : <Dropdown rgOptions={sortOptions} selectedOption={state.sort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, sort: String(optionData(opt)) }))} focusable />
                          }
                        </Focusable>
                        <SortDirectionButton
                          sort={state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort}
                          reverse={state.sortReverse}
                          onChange={(next) => setState((prev) => ({ ...prev, sortReverse: next }))}
                        />
                      </Focusable>
                    </Field>
                    {isManualSort && (
                      <Field
                        label={t('manual_base_sort')}
                        childrenLayout="inline"
                        childrenContainerWidth="min"
                        inlineWrap="keep-inline"
                        bottomSeparator='thick'
                      >
                        <Focusable style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Focusable style={{ minWidth: 200 }}>
                            <Dropdown rgOptions={baseSortOptions} selectedOption={state.manualBaseSort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, manualBaseSort: String(optionData(opt)) }))} focusable />
                          </Focusable>
                          <SortDirectionButton
                            sort={state.manualBaseSort}
                            reverse={state.manualBaseSortReverse}
                            onChange={(next) => setState((prev) => ({ ...prev, manualBaseSortReverse: next }))}
                          />
                        </Focusable>
                      </Field>
                    )}
                    <SliderField
                      label={`${t('limit')} (${state.limit})`}
                      value={state.limit}
                      min={1}
                      max={50}
                      step={1}
                      bottomSeparator='thick'
                      onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))}
                    />
                  </FieldContainer>
                ),
              },
              ...(state.sourceType === 'filter' ? [{
                id: 'filters',
                // Decky's Tab.title is typed `string` but Steam's underlying
                // Tabs component renders any ReactNode — cast lets us inline
                // a leading icon next to the label text.
                title: (<TabLabel icon={<FunnelIcon />} text={t('edit_tab_filters')} />) as unknown as string,
                content: (
                  <FieldContainer>
                    <SavedFiltersBar
                      controller={controller}
                      currentGroup={state.filterGroup}
                      onApply={changeFilterGroup}
                    />
                    <FilterPanel group={state.filterGroup} onChange={changeFilterGroup} controller={controller} />
                  </FieldContainer>
                ),
              }] : []),
              ...((state.sourceType === 'collection' || state.sourceType === 'tab') ? [{
                id: 'childFilters',
                title: (<TabLabel icon={<FunnelIcon />} text={t('edit_tab_additional_filters')} />) as unknown as string,
                content: (
                  <FieldContainer>
                    <SavedFiltersBar
                      controller={controller}
                      currentGroup={state.childFilterGroup}
                      onApply={(group) => setState((prev) => ({ ...prev, childFilterGroup: group }))}
                    />
                    <FilterPanel group={state.childFilterGroup} onChange={(group) => setState((prev) => ({ ...prev, childFilterGroup: group }))} controller={controller} />
                  </FieldContainer>
                ),
              }] : []),
              {
                id: 'visual',
                title: t('edit_tab_visual'),
                content: (
                  <VisualTabContent
                    t={t}
                    flags={{ matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll }}
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
                id: 'display',
                title: (<TabLabel icon={<EyeIcon />} text={t('edit_tab_display')} />) as unknown as string,
                content: (
                  <DisplayTabContent
                    t={t}
                    display={{ hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames === true, hideInstallIndicator: state.hideInstallIndicator === true, hideSeeMore: state.hideSeeMore === true, hideRefreshCard: state.hideRefreshCard === true }}
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
          <div style={{ flexShrink: 0, padding: '0 24px' }}>
            {(activeTab === 'display' && hiddenPickerOpen) ? (
              effectiveHiddenCandidateIds.length === 0 ? (
                <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
              ) : (
                <HighlightRow>
                  {effectiveHiddenCandidateIds.map((id, idx) => {
                    const isHidden = state.hiddenAppIds.includes(id)
                    const inHighlighted = state.highlightedAppIds.includes(id)
                    const featured = state.highlightAll || (state.highlightFirst && idx === 0) || inHighlighted
                    const meta = hiddenCandidateMeta.get(id)
                    return (
                      <HighlightMiniCard
                        key={id}
                        appid={id}
                        name={meta?.name ?? `App ${id}`}
                        portraitUrl={meta?.portraitUrl}
                        heroUrl={meta?.heroUrl}
                        featured={featured}
                        selected={false}
                        hiddenMark={isHidden}
                        width={featured ? 210 : 68}
                        height={100}
                        onToggle={() => setState((prev) => ({
                          ...prev,
                          hiddenAppIds: isHidden
                            ? prev.hiddenAppIds.filter((x) => x !== id)
                            : [...prev.hiddenAppIds, id],
                        }))}
                      />
                    )
                  })}
                </HighlightRow>
              )
            ) : resolvedIds.length === 0 ? (
              <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
            ) : (isManualSort && activeTab === 'source') ? (
              <ManualSortRow
                order={effectiveManualOrder}
                meta={resolvedMeta}
                onReorder={reorderManual}
                t={t}
                highlightFirst={state.highlightFirst}
                highlightAll={state.highlightAll}
                highlightedAppIds={state.highlightedAppIds}
                highlightPickerOpen={highlightPickerOpen}
              />
            ) : (
              <HighlightRow>
                {effectiveManualOrder.map((id, idx) => {
                  const inHighlighted = state.highlightedAppIds.includes(id)
                  const selected = highlightPickerOpen && inHighlighted
                  const featured = state.highlightAll || (state.highlightFirst && idx === 0) || inHighlighted
                  const meta = resolvedMeta.get(id)
                  const toggle = (activeTab === 'visual' && highlightPickerOpen) ? () => {
                    setAlternatingMode(null)
                    prePatternHighlightsRef.current = null
                    setState((prev) => ({
                      ...prev,
                      highlightedAppIds: prev.highlightedAppIds.includes(id)
                        ? prev.highlightedAppIds.filter((x) => x !== id)
                        : [...prev.highlightedAppIds, id],
                    }))
                  } : null
                  return (
                    <HighlightMiniCard
                      key={id}
                      appid={id}
                      name={meta?.name ?? `App ${id}`}
                      portraitUrl={meta?.portraitUrl}
                      heroUrl={meta?.heroUrl}
                      featured={featured}
                      selected={selected}
                      width={featured ? 210 : 68}
                      height={100}
                      onToggle={toggle}
                    />
                  )
                })}
              </HighlightRow>
            )}
          </div>
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
