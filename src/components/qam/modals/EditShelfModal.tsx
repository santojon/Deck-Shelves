import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DialogButton,
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
import { resolveShelfAppIds, invalidateRandomSortCache, getAllAppOverviews, getLocalLibraryAppIds } from '../../../steam'
import { getCurrentSettings } from '../../../store/settingsStore'
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
  const [modalCollections, setModalCollections] = useState<typeof controllerCollections>(controllerCollections)
  const modalPlatform = usePlatform()
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      modalPlatform.listCollections().then((next) => {
        if (cancelled) return
        setModalCollections((current) => {
          const a = JSON.stringify(current.map((c) => ({ id: c.id, name: c.name })))
          const b = JSON.stringify(next.map((c) => ({ id: c.id, name: c.name })))
          return a === b ? current : next
        })
      }).catch(() => {})
    }
    refresh()
    // Short retry cadence while the picker is open: Steam's collectionStore
    // can take a few seconds after plugin boot to expose the map. The
    // controller-level 30 s refresh is still the long-term safety net.
    const t1 = window.setTimeout(refresh, 500)
    const t2 = window.setTimeout(refresh, 2000)
    const interval = window.setInterval(refresh, 10000)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearInterval(interval)
    }
  }, [modalPlatform])
  // Prefer the modal's own fresh fetch when it has data; fall back to the
  // controller's reference until the first refresh resolves.
  const collections = modalCollections.length > 0 ? modalCollections : controllerCollections
  // Guard the dropdown against any failure mode in the controller's async
  // `listLibraryTabs`: empty array, undefined, or never-resolved. Native
  // defaults below are the same 5 IDs `listLibraryTabs` would have
  // returned, so localized labels via `detectNativeKey` still apply.
  const platformTabs = (Array.isArray(controllerTabs) && controllerTabs.length > 0)
    ? controllerTabs : NATIVE_FALLBACK_TABS
  const platform = usePlatform()
  const externalSources = useMemo(() => getExternalSources(), [])
  // Composite shelves load by promoting `sources[0]` into the primary
  // source fields; the remaining children populate `additionalSources`.
  // This way the editor exposes a uniform "pick one source, optionally
  // add more" UX whether the saved shape is a single source or a
  // composite of N.
  const compositeChildren: any[] = shelf.source.type === 'composite' && Array.isArray((shelf.source as any).sources)
    ? (shelf.source as any).sources : []
  const primarySource: any = shelf.source.type === 'composite'
    ? (compositeChildren[0] ?? { type: 'tab', tab: 'all' })
    : shelf.source
  const initialSourceType = (primarySource?.type ?? 'tab') as SourceType
  const initialFilter = normalizeFilter(primarySource)
  const initialFilterGroup = getEffectiveFilterGroup(initialFilter)
  const [state, setState] = useState<EditableShelfState>({
    title: shelf.title,
    sourceType: initialSourceType,
    collectionId: primarySource?.type === 'collection' ? primarySource.collectionId : String(collections[0]?.id ?? ''),
    tab: primarySource?.type === 'tab' ? primarySource.tab : String(platformTabs[0]?.id ?? 'all'),
    externalSourceId: primarySource?.type === 'external' ? primarySource.sourceId : (externalSources[0]?.id ?? ''),
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
    hideDiscountBadge: (shelf as any).hideDiscountBadge ?? false,
    hideCompatIcons: shelf.hideCompatIcons ?? false,
    hideNonSteamBadge: shelf.hideNonSteamBadge ?? false,
    hideShelfTitle: (shelf as any).hideShelfTitle ?? false,
    hideGameNames: (shelf as any).hideGameNames ?? false,
    hideInstallIndicator: (shelf as any).hideInstallIndicator ?? false,
    hideSeeMore: (shelf as any).hideSeeMore ?? false,
    hideRefreshCard: (shelf as any).hideRefreshCard ?? false,
    heroEnabled: (shelf as any).heroEnabled ?? false,
    dedupeByExactName: (shelf as any).dedupeByExactName ?? false,
    hiddenAppIds: (shelf as any).hiddenAppIds ?? [],
    excludeOwned: (shelf.source as any).excludeOwned ?? false,
    excludeOwnedNonSteam: (shelf.source as any).excludeOwnedNonSteam ?? false,
    hideOwnedNonSteamCloud: (shelf.source as any).hideOwnedNonSteamCloud === true,
    childFilterGroup: (() => {
      if (shelf.source.type === 'collection' || shelf.source.type === 'tab' || shelf.source.type === 'wishlist' || shelf.source.type === 'store') {
        return (shelf.source as any).childFilter ?? { mode: 'and', items: [] }
      }
      return { mode: 'and', items: [] }
    })(),
    compositeCombine: (shelf.source.type === 'composite' && (shelf.source as any).combine === 'intersection') ? 'intersection' : 'union',
    additionalSources: compositeChildren.slice(1) as any[],
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
    const buildPrimary = (): any => {
      if (state.sourceType === 'collection') return { type: 'collection' as const, collectionId: state.collectionId, ...(childFilter ? { childFilter } : {}) }
      if (state.sourceType === 'tab') return { type: 'tab' as const, tab: state.tab, ...(childFilter ? { childFilter } : {}) }
      if (state.sourceType === 'external') return { type: 'external' as const, sourceId: state.externalSourceId }
      if (state.sourceType === 'wishlist') return { type: 'wishlist' as const, ...(childFilter ? { childFilter } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam && state.hideOwnedNonSteamCloud ? { hideOwnedNonSteamCloud: true } : {}) }
      if (state.sourceType === 'store') { const cf = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined; return { type: 'store' as const, ...(cf ? { childFilter: cf } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam && state.hideOwnedNonSteamCloud ? { hideOwnedNonSteamCloud: true } : {}) } }
      // When manual sort is active, use the configured base sort for the
      // preview so the mini-card row reflects the actual order of non-manual
      // positions at runtime (matches what Shelf.tsx resolves on home).
      const previewSort = state.filter.sort === 'manual' ? state.manualBaseSort : state.filter.sort
      const effectiveFilter = filterGroupToFilter(state.filterGroup, previewSort as ShelfFilter['sort'], state.filter.sortReverse)
      return { type: 'filter' as const, filter: effectiveFilter }
    }
    const primary = buildPrimary()
    // Multi-source shelves combine via composite. Filter is mutually
    // exclusive and never combines, so additionalSources is ignored
    // whenever the primary is a filter.
    if (state.sourceType !== 'filter' && state.additionalSources.length > 0) {
      return { type: 'composite' as const, combine: state.compositeCombine, sources: [primary, ...state.additionalSources] } as any
    }
    return primary
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort, state.filter.sortReverse, state.manualBaseSort, state.childFilterGroup, state.excludeOwned, state.excludeOwnedNonSteam, state.hideOwnedNonSteamCloud, state.compositeCombine, state.additionalSources])

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
      let previewSort: string | string[] | undefined
      if (state.sourceType === 'filter') {
        previewSort = undefined
      } else if (isManualSort) {
        previewSort = state.manualBaseSort || 'alphabetical'
      } else {
        previewSort = (state.sort && (Array.isArray(state.sort) ? state.sort.length : true))
          ? state.sort
          : (previewReverse ? 'alphabetical' : undefined)
      }
      // Resolve with a generous limit, then apply the same render-time
      // filters Shelf.tsx applies so the modal count matches the shelf.
      ;(async () => {
        try {
          const rawIds = await resolveShelfAppIds(previewSource, Math.max(state.limit, 500), previewSort, previewShelfId, previewReverse, {
            hiddenAppIds: hiddenPickerOpen && state.hiddenAppIds.length ? state.hiddenAppIds : undefined,
            dedupeByName: state.dedupeByExactName || undefined,
          })
          if (cancelled) return

          const isOnlineShelf = state.sourceType === 'wishlist' || state.sourceType === 'store'
          let filteredIds = rawIds
          if (isOnlineShelf) {
            const settings = getCurrentSettings()
            const globalHideOwned = settings?.onlineHideOwnedGames === true
            const globalHideNonSteam = settings?.onlineHideOwnedNonSteam === true
            const globalHideCloud = settings?.onlineHideOwnedNonSteamCloud === true
            const shouldHideOwned = globalHideOwned || state.excludeOwned
            const effectiveNonSteam = (globalHideOwned && globalHideNonSteam) || (state.excludeOwned && state.excludeOwnedNonSteam)
            // Per-shelf cloud override only kicks in when exclude+NS pair
            // is set (mirrors the source serialization).
            const perShelfCloud = (state.excludeOwned && state.excludeOwnedNonSteam) ? state.hideOwnedNonSteamCloud : undefined
            const effectiveCloud = effectiveNonSteam && (perShelfCloud === true || (perShelfCloud === undefined && globalHideCloud))

            if (shouldHideOwned) {
              const ownedAppIds = getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud)
              // Mirrors Shelf.tsx: name-based dedup uses a broader set
              // (always includes non-Steam + cloud) than the appid-based
              // dedup, so a wishlist entry whose name matches a non-Steam
              // local title is filtered even when the non-Steam sub-toggle
              // is off — keeps the modal "found X" count consistent with
              // what the home shelf renders.
              const ownedSetForNames = getLocalLibraryAppIds(true, true)
              const all = await getAllAppOverviews()
              const ownedNames = new Set<string>()
              const allById = new Map<number, any>()
              for (const a of all) {
                const id = Number((a as any)?.appid)
                if (Number.isFinite(id)) allById.set(id, a)
                if (!ownedSetForNames.has(id)) continue
                const n = (a as any)?.display_name ?? (a as any)?.name
                if (typeof n === 'string' && n) ownedNames.add(n.trim().toLowerCase())
              }
              const NAME_CACHE_KEY = 'ds-game-name-cache-v1'
              let nameCache: Record<number, string> = {}
              try { nameCache = JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}') } catch {}
              filteredIds = rawIds.filter((id) => {
                if (ownedAppIds.has(id)) return false
                const overview = allById.get(id)
                const localName = overview ? ((overview as any).display_name ?? (overview as any).name) : ''
                const cachedName = nameCache[id]
                const name = ((localName && !/^App \d+$/.test(localName) ? localName : cachedName) ?? '').trim().toLowerCase()
                if (name && ownedNames.has(name)) return false
                return true
              })
            }
          }
          if (cancelled) return
          setPreviewCount(filteredIds.length)
          setResolvedIds(filteredIds.slice(0, state.limit))
        } catch {
          if (cancelled) return
          setPreviewCount(0)
          setResolvedIds([])
        }
      })()
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [previewSource, state.limit, state.sourceType, state.sort, state.filter.sort, state.manualBaseSort, state.sortReverse, state.manualBaseSortReverse, state.dedupeByExactName, state.hiddenAppIds.join(','), hiddenPickerOpen, previewRefreshNonce, state.excludeOwned, state.excludeOwnedNonSteam, state.hideOwnedNonSteamCloud])

  useEffect(() => {
    let cancelled = false
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return }
    const isOnlineSource = state.sourceType === 'wishlist' || state.sourceType === 'store'
    ;(async () => {
      const rawResults = await Promise.all(resolvedIds.map(async (id): Promise<[number, PlatformAppMeta]> => {
        try { return [id, await platform.getAppMeta(id)] }
        catch { return [id, { appid: id, name: `App ${id}` }] }
      }))
      if (cancelled) return

      if (!isOnlineSource) {
        setResolvedMeta(new Map(rawResults))
        return
      }

      // Online shelves: resolvedIds is already filtered. Just enrich each
      // id with a real name (local overview → cache → fallback "#id").
      const NAME_CACHE_KEY = 'ds-game-name-cache-v1'
      const nameCache: Record<number, string> = (() => {
        try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}') } catch { return {} }
      })()
      const meta = new Map<number, PlatformAppMeta>()
      const toFetch: number[] = []
      for (const [id, m] of rawResults) {
        const overviewName = m?.name && !/^App \d+$/.test(m.name) ? m.name : undefined
        const cachedName = nameCache[id]
        const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`
        meta.set(id, { appid: id, name: overviewName ?? cachedName ?? `#${id}`, portraitUrl })
        if (!overviewName && !cachedName) toFetch.push(id)
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
          const existing = next.get(id)
          if (existing) next.set(id, { ...existing, name })
        })
        return next
      })
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(','), state.sourceType])

  // Fetch overshoot candidates for hidden-games picker: uses limit*3 without
  // hiddenAppIds applied, so the user sees all slots they can fill/hide.
  useEffect(() => {
    if (!hiddenPickerOpen) return
    let cancelled = false
    const timer = setTimeout(() => {
      const primarySortKey = Array.isArray(state.sort) ? state.sort[0] : state.sort
      const primaryFilterSort = Array.isArray(state.filter.sort) ? state.filter.sort[0] : state.filter.sort
      const isManualS = primarySortKey === 'manual' || primaryFilterSort === 'manual'
      const previewSort: string | string[] | undefined = state.sourceType === 'filter'
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

  // Exhaustion: each "single-instance" source type (filter/wishlist/store)
  // is capped at one across the primary + additional rows. Tabs and
  // collections cap at the total catalog size — once every tab/collection
  // is used, the type disappears from the picker. `excludeRow` lets a
  // row see itself as "free" when computing its own available options
  // (otherwise the row's current pick would appear exhausted).
  const computeUsage = (excludeRow?: number | 'primary') => {
    const filterCount = (state.sourceType === 'filter' && excludeRow !== 'primary' ? 1 : 0)
      + state.additionalSources.filter((s: any, i: number) => i !== excludeRow && s?.type === 'filter').length
    const storeCount = (state.sourceType === 'store' && excludeRow !== 'primary' ? 1 : 0)
      + state.additionalSources.filter((s: any, i: number) => i !== excludeRow && s?.type === 'store').length
    const wishlistCount = (state.sourceType === 'wishlist' && excludeRow !== 'primary' ? 1 : 0)
      + state.additionalSources.filter((s: any, i: number) => i !== excludeRow && s?.type === 'wishlist').length
    const usedTabs = new Set<string>()
    if (state.sourceType === 'tab' && excludeRow !== 'primary') usedTabs.add(state.tab)
    state.additionalSources.forEach((s: any, i: number) => {
      if (i !== excludeRow && s?.type === 'tab') usedTabs.add(String(s.tab))
    })
    const usedCollections = new Set<string>()
    if (state.sourceType === 'collection' && excludeRow !== 'primary') usedCollections.add(state.collectionId)
    state.additionalSources.forEach((s: any, i: number) => {
      if (i !== excludeRow && s?.type === 'collection') usedCollections.add(String(s.collectionId))
    })
    return { filterCount, storeCount, wishlistCount, usedTabs, usedCollections }
  }
  const onlineLabel = (key: 'source_wishlist' | 'source_store') => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><OnlineIcon size={14} style={{ opacity: 0.7 }} />{t(key)}</span>
  ) as any
  const buildChildTypeOptions = (excludeRow: number): SingleDropdownOption[] => {
    const u = computeUsage(excludeRow)
    const opts: SingleDropdownOption[] = []
    // Exhaustion: only hide collection/tab when the catalog is non-empty
    // AND every entry is already in use. With an empty catalog (no Steam
    // collections discovered yet, or `listCollections` raced the modal
    // open) we keep the type visible — the value picker falls back to
    // the placeholder, matching the primary source dropdown's behaviour.
    if (collectionOptions.length === 0 || u.usedCollections.size < collectionOptions.length) {
      opts.push({ data: 'collection', label: t('source_collection') })
    }
    if (tabOptions.length === 0 || u.usedTabs.size < tabOptions.length) {
      opts.push({ data: 'tab', label: t('source_tab') })
    }
    if (settings?.onlineFeaturesEnabled) {
      if (u.wishlistCount < 1) opts.push({ data: 'wishlist', label: onlineLabel('source_wishlist') })
      if (u.storeCount < 1) opts.push({ data: 'store', label: onlineLabel('source_store') })
    }
    if (u.filterCount < 1) opts.push({ data: 'filter', label: t('source_filter') })
    return opts
  }
  const buildCollectionValueOpts = (excludeRow: number): SingleDropdownOption[] => {
    const u = computeUsage(excludeRow)
    return collectionOptions.filter((o) => !u.usedCollections.has(String(o.data)))
  }
  const buildTabValueOpts = (excludeRow: number): SingleDropdownOption[] => {
    const u = computeUsage(excludeRow)
    return tabOptions.filter((o) => !u.usedTabs.has(String(o.data)))
  }
  // First-available descriptor used when the user clicks "+ Add source".
  // Falls back to undefined when every source type is exhausted (button
  // is disabled in that case).
  const pickNextAvailable = (): any => {
    const opts = buildChildTypeOptions(-1)
    const t0 = opts[0]?.data
    if (t0 === 'collection') {
      const c = buildCollectionValueOpts(-1)[0]
      return { type: 'collection', collectionId: String(c?.data ?? '') }
    }
    if (t0 === 'tab') {
      const tab = buildTabValueOpts(-1)[0]
      return { type: 'tab', tab: String(tab?.data ?? 'all') }
    }
    if (t0 === 'wishlist') return { type: 'wishlist' }
    if (t0 === 'store') return { type: 'store' }
    if (t0 === 'filter') return { type: 'filter', filter: { sort: 'alphabetical' } }
    return null
  }
  const canAddSource = buildChildTypeOptions(-1).length > 0

  const changeSourceType = (type: SourceType) => {
    setState((prev) => {
      // Filter is mutually exclusive — drop any stacked additional sources
      // when the user switches into it. Composite combines aren't valid
      // alongside a filter primary, so the user is steered toward filter
      // merge for multi-criteria predicates.
      const wipeExtras = type === 'filter' ? { additionalSources: [] } : {}
      if (type === 'collection') {
        const first = collectionOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, collectionId: String(first?.data ?? ''), filter: normalizeFilter({ type: 'filter', filter: prev.filter }), ...wipeExtras }
      }
      if (type === 'tab') {
        const first = tabOptions[0]
        const nextTitle = first ? (tabTextLabels.get(String(first.data)) ?? t('newShelf')) : t('newShelf')
        return { ...prev, sourceType: type, title: nextTitle, tab: String(first?.data ?? 'all'), ...wipeExtras }
      }
      if (type === 'external') {
        const first = externalOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
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
      const title = state.title.trim() || t('newShelf');
      const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual'
      const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightedAppIds: (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined, manualOrder: (isManualSort && state.manualOrder.length) ? state.manualOrder : undefined, manualBaseSort: (isManualSort && state.manualBaseSort !== 'alphabetical') ? state.manualBaseSort : undefined, sortReverse: state.sortReverse || undefined, manualBaseSortReverse: (isManualSort && state.manualBaseSortReverse) || undefined, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideDiscountBadge: state.hideDiscountBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames, hideInstallIndicator: state.hideInstallIndicator, hideSeeMore: state.hideSeeMore, hideRefreshCard: state.hideRefreshCard, heroEnabled: state.heroEnabled };
      ;(patch as any).dedupeByExactName = state.dedupeByExactName || undefined
      ;(patch as any).hiddenAppIds = (hiddenPickerOpen && state.hiddenAppIds.length) ? state.hiddenAppIds : undefined
      // Build the primary source from the per-type fields. Sort goes on
      // the shelf for non-filter primaries; for filter, sort lives inside
      // the filter object (filterGroupToFilter handles that).
      let primarySource: any
      if (state.sourceType === 'collection') primarySource = { type: 'collection', collectionId: state.collectionId, ...(childFilter ? { childFilter } : {}) }
      else if (state.sourceType === 'tab') {
        const selectedTab = platformTabs.find((pt) => pt.id === state.tab)
        const baseSource = selectedTab?.source ?? { type: 'tab', tab: state.tab }
        primarySource = childFilter ? { ...baseSource, childFilter } : baseSource
      }
      else if (state.sourceType === 'external') primarySource = { type: 'external', sourceId: state.externalSourceId }
      else if (state.sourceType === 'wishlist') primarySource = { type: 'wishlist', ...(childFilter ? { childFilter } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam && state.hideOwnedNonSteamCloud ? { hideOwnedNonSteamCloud: true } : {}) }
      else if (state.sourceType === 'store') { const cf = childFilter; primarySource = { type: 'store', ...(cf ? { childFilter: cf } : {}), ...(state.excludeOwned ? { excludeOwned: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}), ...(state.excludeOwned && state.excludeOwnedNonSteam && state.hideOwnedNonSteamCloud ? { hideOwnedNonSteamCloud: true } : {}) } }
      else primarySource = { type: 'filter', filter: filterGroupToFilter(state.filterGroup, state.filter.sort, state.filter.sortReverse) }
      // Stack extras into a composite. Single-source shelves keep the
      // flat shape for back-compat with older readers.
      if (state.sourceType !== 'filter' && state.additionalSources.length > 0) {
        patch.source = { type: 'composite', combine: state.compositeCombine, sources: [primarySource, ...state.additionalSources] } as any
      } else {
        patch.source = primarySource
      }
      if (state.sourceType !== 'filter') {
        patch.sort = (Array.isArray(state.sort) ? state.sort.length > 0 : state.sort !== 'alphabetical') ? state.sort : undefined
      }
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
                          const typeOpts = buildChildTypeOptions(idx);
                          // Type options exclude exhausted sources for this
                          // row. The row's CURRENT type is always present
                          // (excludeRow=idx surfaces it) so the dropdown can
                          // show what's actually selected.
                          if (!typeOpts.some((o) => o.data === childType)) {
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
                        {state.additionalSources.length > 0 && (
                          <DropdownItem
                            label={t('composite_combine_label')}
                            rgOptions={[
                              { data: 'union', label: t('composite_combine_union') },
                              { data: 'intersection', label: t('composite_combine_intersection') },
                            ]}
                            selectedOption={state.compositeCombine}
                            onChange={(opt: unknown) => setState((prev) => ({ ...prev, compositeCombine: (String(optionData(opt)) === 'intersection' ? 'intersection' : 'union') }))}
                            bottomSeparator='thick'
                          />
                        )}
                        {canAddSource && (
                          <DialogButton
                            onClick={() => setState((prev) => {
                              const next = pickNextAvailable()
                              if (!next) return prev
                              return { ...prev, additionalSources: [...prev.additionalSources, next] }
                            })}
                            onOKActionDescription={t('composite_add_source')}
                            style={{ width: '100%' }}
                          >+ {t('composite_add_source')}</DialogButton>
                        )}
                      </>
                    )}
                    {(state.sourceType === 'wishlist' || state.sourceType === 'store') && (
                      <>
                        <ToggleField
                          label={t('exclude_owned_label')}
                          checked={state.excludeOwned}
                          onChange={(v: boolean) => setState((prev) => ({ ...prev, excludeOwned: v, excludeOwnedNonSteam: v ? prev.excludeOwnedNonSteam : false }))}
                        />
                        {state.excludeOwned && (
                          <div style={{ paddingLeft: 16 }}>
                            <ToggleField
                              label={t('hide_owned_non_steam')}
                              checked={state.excludeOwnedNonSteam}
                              onChange={(v: boolean) => setState((prev) => ({ ...prev, excludeOwnedNonSteam: v }))}
                            />
                            {state.excludeOwnedNonSteam && (
                              <div style={{ paddingLeft: 16 }}>
                                <ToggleField
                                  label={t('hide_owned_non_steam_cloud')}
                                  checked={state.hideOwnedNonSteamCloud}
                                  onChange={(v: boolean) => setState((prev) => ({ ...prev, hideOwnedNonSteamCloud: v }))}
                                />
                              </div>
                            )}
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
                        onSortChange={(next) => setState((prev) => ({ ...prev, manualBaseSort: typeof next === 'string' ? next : (next[0] ?? 'alphabetical') }))}
                        reverse={state.manualBaseSortReverse}
                        onReverseChange={(next) => setState((prev) => ({ ...prev, manualBaseSortReverse: typeof next === 'boolean' ? next : !!next[0] }))}
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
                    flags={{ matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, heroEnabled: state.heroEnabled }}
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
