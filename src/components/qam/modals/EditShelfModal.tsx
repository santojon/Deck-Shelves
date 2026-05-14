import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DropdownItem,
  Focusable,
  SliderField,
  Tabs,
  ToggleField,
} from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../../../domain/settings'
import { FilterPanel } from '../../FilterPanel'
import { FieldContainer, ModalShell } from '../../ui'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds, invalidateRandomSortCache } from '../../../steam'
import { invalidateSmartShelfCache } from '../../../steam/smartShelves'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { BASE_SOURCE_TYPES, SORT_OPTIONS, type SourceType, type EditTab } from './editShelf/constants'
import type { EditableShelfState } from './editShelf/types'
import { optionData } from './editShelf/utils'
import { SavedFiltersBar } from './editShelf/SavedFiltersBar'
import { VisualTabContent } from './editShelf/VisualTabContent'
import { DisplayTabContent } from './editShelf/DisplayTabContent'
import { FunnelIcon, EyeIcon, SteamIcon, OnlineIcon } from '../../icons'
import type { PlatformAppMeta } from '../../../runtime/platform'
import { fetchGameNames } from '../../../core/onlineStore'
import { PreviewPanel } from './editShelf/PreviewPanel'
import { TabLabel } from './editShelf/TabLabel'
import { SortField } from './editShelf/SortField'
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
    excludeOwned: (shelf.source as any).excludeOwned ?? false,
    excludeOwnedNonSteam: (shelf.source as any).excludeOwnedNonSteam ?? false,
    childFilterGroup: (() => {
      if (shelf.source.type === 'collection' || shelf.source.type === 'tab' || shelf.source.type === 'wishlist' || shelf.source.type === 'store') {
        return (shelf.source as any).childFilter ?? { mode: 'and', items: [] }
      }
      return { mode: 'and', items: [] }
    })(),
  })
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditTab>('source')
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, PlatformAppMeta>>(new Map())
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
    if (state.sourceType === 'wishlist') return { type: 'wishlist' as const, ...(childFilter ? { childFilter } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}) } as any
    if (state.sourceType === 'store') { const cf = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined; return { type: 'store' as const, ...(cf ? { childFilter: cf } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}) } as any }
    // When manual sort is active, use the configured base sort for the
    // preview so the mini-card row reflects the actual order of non-manual
    // positions at runtime (matches what Shelf.tsx resolves on home).
    const previewSort = state.filter.sort === 'manual' ? state.manualBaseSort : state.filter.sort
    const effectiveFilter = filterGroupToFilter(state.filterGroup, previewSort as ShelfFilter['sort'])
    return { type: 'filter' as const, filter: effectiveFilter }
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort, state.manualBaseSort, state.childFilterGroup, state.excludeOwned, state.excludeOwnedNonSteam])

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
      resolveShelfAppIds(previewSource, state.limit, previewSort, previewShelfId, previewReverse, {
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
  }, [previewSource, state.limit, state.sourceType, state.sort, state.filter.sort, state.manualBaseSort, state.sortReverse, state.manualBaseSortReverse, state.dedupeByExactName, state.hiddenAppIds.join(','), hiddenPickerOpen, previewRefreshNonce])

  useEffect(() => {
    let cancelled = false
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return }
    const isOnlineSource = state.sourceType === 'wishlist' || state.sourceType === 'store'
    const filterNonSteam = isOnlineSource && state.excludeOwned && state.excludeOwnedNonSteam
    ;(async () => {
      // Pre-fetch non-Steam shortcut names before calling getAppMeta so the
      // name-based filter can be applied in one pass.
      let nonSteamNameSet: Set<string> | null = null
      if (filterNonSteam) {
        try {
          const { getAllAppOverviews } = await import('../../../steam')
          const all = await getAllAppOverviews()
          nonSteamNameSet = new Set<string>()
          for (const a of all) {
            const ns = !!(a as any)?.is_non_steam || (a as any)?.is_steam === false ||
              (a as any)?.m_eAppType === 1073741824 || (a as any)?.app_type === 1073741824
            if (!ns) continue
            const n = (a as any)?.display_name ?? (a as any)?.name
            if (typeof n === 'string' && n) nonSteamNameSet.add(n.trim().toLowerCase())
          }
        } catch {}
      }
      if (cancelled) return

      const rawResults = await Promise.all(resolvedIds.map(async (id): Promise<[number, PlatformAppMeta]> => {
        try { return [id, await platform.getAppMeta(id)] }
        catch { return [id, { appid: id, name: `App ${id}` }] }
      }))
      if (cancelled) return

      if (!isOnlineSource) {
        setResolvedMeta(new Map(rawResults))
        return
      }

      // Online shelves only show games NOT in local library (mirrors Shelf.tsx).
      // getAppMeta returns a fallback with name "App <id>" for non-library apps.
      // Games with a real name are already owned — the real shelf hides them.
      const NAME_CACHE_KEY = 'ds-game-name-cache-v1'
      const nameCache: Record<number, string> = (() => {
        try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}') } catch { return {} }
      })()
      const onlineIds = rawResults.filter(([, m]) => /^App \d+$/.test(m.name)).map(([id]) => id)
      const meta = new Map<number, PlatformAppMeta>()
      const toFetch: number[] = []
      for (const id of onlineIds) {
        const cachedName = nameCache[id]
        if (nonSteamNameSet && cachedName && nonSteamNameSet.has(cachedName.trim().toLowerCase())) continue
        const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`
        meta.set(id, { appid: id, name: cachedName ?? `#${id}`, portraitUrl })
        if (!cachedName) toFetch.push(id)
      }
      setResolvedMeta(meta)

      if (!toFetch.length) return
      const names = await fetchGameNames(toFetch)
      if (cancelled || !names.size) return
      try {
        const merged = { ...nameCache }
        names.forEach((v, k) => { merged[k] = v })
        localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(merged))
      } catch {}
      setResolvedMeta(prev => {
        const next = new Map(prev)
        names.forEach((name, id) => {
          if (nonSteamNameSet?.has(name.trim().toLowerCase())) { next.delete(id); return }
          const existing = next.get(id)
          if (existing) next.set(id, { ...existing, name })
        })
        return next
      })
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(','), state.sourceType, state.excludeOwned, state.excludeOwnedNonSteam])

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
  // Hide for now so users don't pick a tab that would resolve to nothing
  // meaningful.
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
      if (type === 'wishlist') {
        return { ...prev, sourceType: type, childFilterGroup: { mode: 'and', items: [] } }
      }
      if (type === 'store') {
        return { ...prev, sourceType: type }
      }
      return { ...prev, sourceType: type, filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
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
      else if (state.sourceType === 'wishlist') { patch.source = { type: 'wishlist', ...(childFilter ? { childFilter } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}) } as any; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else if (state.sourceType === 'store') { const cf = childFilter; patch.source = { type: 'store', ...(cf ? { childFilter: cf } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}) } as any; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
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
                    {(state.sourceType === 'wishlist' || state.sourceType === 'store') && (
                      <>
                        <ToggleField
                          label={t('exclude_owned_label')}
                          description={t('exclude_owned_desc')}
                          checked={state.excludeOwned}
                          onChange={(v: boolean) => setState((prev) => ({ ...prev, excludeOwned: v, excludeOwnedNonSteam: v ? prev.excludeOwnedNonSteam : false }))}
                        />
                        {state.excludeOwned && (
                          <div style={{ paddingLeft: 16 }}>
                            <ToggleField
                              label={t('hide_owned_non_steam')}
                              description={t('hide_owned_non_steam_desc')}
                              checked={state.excludeOwnedNonSteam}
                              onChange={(v: boolean) => setState((prev) => ({ ...prev, excludeOwnedNonSteam: v }))}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <SortField
                      label={t('filter_mode')}
                      options={sortOptions}
                      sort={state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort}
                      onSortChange={(next) => setState((prev) => prev.sourceType === 'filter'
                        ? { ...prev, filter: { ...prev.filter, sort: next as ShelfFilter['sort'] } }
                        : { ...prev, sort: next })}
                      reverse={state.sortReverse}
                      onReverseChange={(next) => setState((prev) => ({ ...prev, sortReverse: next }))}
                    />
                    {isManualSort && (
                      <SortField
                        label={t('manual_base_sort')}
                        options={baseSortOptions}
                        sort={state.manualBaseSort}
                        onSortChange={(next) => setState((prev) => ({ ...prev, manualBaseSort: next }))}
                        reverse={state.manualBaseSortReverse}
                        onReverseChange={(next) => setState((prev) => ({ ...prev, manualBaseSortReverse: next }))}
                      />
                    )}
                    <SliderField
                      label={`${t('limit')} (${state.limit})`}
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
                    <FilterPanel group={state.filterGroup} onChange={changeFilterGroup} controller={controller} allowOnlineFilters={false} />
                  </FieldContainer>
                ),
              }] : []),
              ...((state.sourceType === 'collection' || state.sourceType === 'tab' || state.sourceType === 'wishlist' || state.sourceType === 'store') ? [{
                id: 'childFilters',
                title: (<TabLabel icon={<FunnelIcon />} text={t('edit_tab_additional_filters')} />) as unknown as string,
                content: (
                  <FieldContainer>
                    <SavedFiltersBar
                      controller={controller}
                      currentGroup={state.childFilterGroup}
                      onApply={(group) => setState((prev) => ({ ...prev, childFilterGroup: group }))}
                    />
                    <FilterPanel group={state.childFilterGroup} onChange={(group) => setState((prev) => ({ ...prev, childFilterGroup: group }))} controller={controller} allowOnlineFilters={state.sourceType === 'wishlist' || state.sourceType === 'store'} />
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
          <PreviewPanel
            t={t}
            title={state.title}
            hideShelfTitle={state.hideShelfTitle}
            activeTab={activeTab}
            resolvedIds={resolvedIds}
            effectiveManualOrder={effectiveManualOrder}
            resolvedMeta={resolvedMeta}
            isManualSort={isManualSort}
            onReorderManual={reorderManual}
            highlightFirst={state.highlightFirst}
            highlightAll={state.highlightAll}
            highlightedAppIds={state.highlightedAppIds}
            highlightPickerOpen={highlightPickerOpen}
            setHighlightedAppIds={(next) => setState((prev) => ({ ...prev, highlightedAppIds: next }))}
            alternatingMode={alternatingMode}
            setAlternatingMode={setAlternatingMode}
            prePatternHighlightsRef={prePatternHighlightsRef}
            hiddenPickerOpen={hiddenPickerOpen}
            hiddenAppIds={state.hiddenAppIds}
            setHiddenAppIds={(next) => setState((prev) => ({ ...prev, hiddenAppIds: next }))}
            hiddenCandidateIds={effectiveHiddenCandidateIds}
            hiddenCandidateMeta={hiddenCandidateMeta}
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
          />
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
