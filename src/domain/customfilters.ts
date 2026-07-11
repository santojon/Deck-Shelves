import type { FilterGroup, FilterItem, FilterItemType, ShelfSource } from '../types'

export const KNOWN_FILTER_TYPES = [
  'last played',
  'friends',
  'install folder',
  'achievements',
  'store tag',
  'merge',
  'name',
  'playtime',
  'installed',
  'non-steam',
  'hidden',
  'update pending',
  'deck compatibility',
  'system compatibility',
  'remote play',
  'price range',
  'recently active',
  'neglected',
] as const

export type KnownFilterType = typeof KNOWN_FILTER_TYPES[number]

// Normalised external filter-type aliases → our internal FilterItemType.
// Anything unrecognised falls back to `nameIncludes`.
const FILTER_TYPE_ALIASES: Record<string, FilterItemType> = {
  lastplayed: 'playedWithinDays', playedwithin: 'playedWithinDays', playedwithinndays: 'playedWithinDays',
  favorites: 'favorites',
  installed: 'installed', installation: 'installed',
  nonsteam: 'nonSteam', platform: 'nonSteam',
  hidden: 'hidden',
  updatepending: 'updatePending',
  deckcompatibility: 'deckCompatibility', deckverde: 'deckCompatibility',
  systemcompatibility: 'systemCompatibility', oscompatibility: 'systemCompatibility', systemcompat: 'systemCompatibility',
  remoteplay: 'remotePlayLocation', remoteplaylocation: 'remotePlayLocation', remoteinstall: 'remotePlayLocation',
  pricerange: 'priceRange', price: 'priceRange',
  playtime: 'playtimeRange', playtimerange: 'playtimeRange',
  recentlyactive: 'recentlyActive', recentplaytime: 'recentlyActive', currentrotation: 'recentlyActive',
  neglected: 'neglected', abandoned: 'neglected',
  name: 'nameIncludes', nameincludes: 'nameIncludes',
  nameregex: 'nameRegex',
  friends: 'friends',
  storetag: 'storeTag', tag: 'storeTag',
  achievements: 'achievements',
  collection: 'collection',
  developer: 'developer',
  publisher: 'publisher',
  appidlist: 'appIdList', whitelist: 'appIdList',
  cloudavailable: 'cloudAvailable', cloudsaves: 'cloudAvailable', cloudsave: 'cloudAvailable',
  controllersupport: 'controllerSupport', controller: 'controllerSupport',
  merge: 'merge',
}

export function mapFilterTypeToInternal(raw: string): FilterItemType {
  const norm = String(raw || '').toLowerCase().replace(/[_\- ]/g, '')
  return FILTER_TYPE_ALIASES[norm] ?? 'nameIncludes'
}

function readFilterFields(filter: any): { typeRaw: string; inverted: boolean; params: any } {
  const f = filter ?? {}
  return {
    typeRaw: f.type ?? f.filterType ?? 'name',
    inverted: !!f.inverted,
    params: f.params ?? f.options ?? {},
  }
}

// Type-specific param fix-ups when importing an external filter (e.g. TabMaster
// stores a collection ID as `params.id`; our format uses `params.collectionId`).
const PARAM_NORMALIZERS: Partial<Record<FilterItemType, (out: any, params: any) => void>> = {
  friends: (out, params) => { if (Array.isArray(params?.friends)) out.friends = params.friends },
  storeTag: (out, params) => { if (params?.tag || params?.tags) out.tags = params.tag ? [params.tag] : params.tags },
  achievements: (out, params) => { out.achievementFilter = params },
  collection: (out, params) => { out.collectionId = params?.collectionId ?? params?.id ?? '' },
  deckCompatibility: (out, params) => { if (params?.compat !== undefined) out.levels = [params.compat] },
}

function normalizeFilterParams(type: FilterItemType, params: any): any {
  const out: any = { ...params }
  PARAM_NORMALIZERS[type]?.(out, params)
  return out
}

export function convertFilterToItem(filter: any): FilterItem {
  const { typeRaw, inverted, params } = readFilterFields(filter)
  if (String(typeRaw).toLowerCase() === 'merge') {
    const children = (params.filters || []) as any[]
    const childItems = children.flatMap((c: any) => c ? [convertFilterToItem(c)] : [])
    return { type: 'merge', inverted, params: { mode: params.mode ?? 'and', items: childItems } }
  }
  const type = mapFilterTypeToInternal(typeRaw)
  return { type, inverted, params: normalizeFilterParams(type, params) }
}

export function convertFiltersToGroup(filters: any[]): FilterGroup {
  const items = (filters || []).flatMap((f: any) => f ? [convertFilterToItem(f)] : [])
  return { mode: 'and', items }
}

export function containerToShelfSource(container: any): ShelfSource {
  if (!container) return { type: 'tab', tab: '' }
  if (!container.filters || container.filters.length === 0) {
    return { type: 'tab', tab: String(container.id ?? container.title ?? '') }
  }
  const group = convertFiltersToGroup(container.filters)
  return { type: 'filter', filter: { filterGroup: group } }
}
