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
  'steamos compatibility',
  'remote play',
  'price range',
  'review score',
  'release date',
  'coming soon',
  'demo',
  'size on disk',
  'regex',
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
  // Divergent data: TabMaster's "system compatibility" (legacy platform
  // availability) and "steamos compatibility" (SteamOS rating tier) are
  // different concepts — keep them mapped distinctly, not merged.
  systemcompatibility: 'systemCompatibility', oscompatibility: 'systemCompatibility', systemcompat: 'systemCompatibility',
  steamoscompatibility: 'steamosCompatibility', steamos: 'steamosCompatibility',
  remoteplay: 'remotePlayLocation', remoteplaylocation: 'remotePlayLocation', remoteinstall: 'remotePlayLocation',
  streamable: 'remotePlayLocation',
  pricerange: 'priceRange', price: 'priceRange',
  reviewscore: 'reviewScore', metacritic: 'reviewScore',
  releasedate: 'releaseDate',
  comingsoon: 'comingSoon',
  demo: 'demo',
  playtime: 'playtimeRange', playtimerange: 'playtimeRange', timeplayed: 'playtimeRange',
  sizeondisk: 'installedSizeRange', installedsize: 'installedSizeRange',
  microsdcard: 'storageDevice', installfolder: 'storageDevice', installlocation: 'storageDevice',
  recentlyactive: 'recentlyActive', recentplaytime: 'recentlyActive', currentrotation: 'recentlyActive',
  neglected: 'neglected', abandoned: 'neglected',
  name: 'nameIncludes', nameincludes: 'nameIncludes',
  nameregex: 'nameRegex', regex: 'nameRegex',
  friends: 'friends',
  storetag: 'storeTag', tag: 'storeTag', tags: 'storeTag',
  steamfeatures: 'categories',
  achievements: 'achievements',
  collection: 'collection',
  developer: 'developer',
  publisher: 'publisher',
  // "blacklist" excludes the listed apps → appIdList inverted (see convertFilterToItem).
  appidlist: 'appIdList', whitelist: 'appIdList', blacklist: 'appIdList',
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
// TabMaster category number → our level string (identical 0..3 scale).
const COMPAT_CAT_TO_LEVEL: Record<number, string> = { 3: 'verified', 2: 'playable', 1: 'unsupported', 0: 'unknown' }
function catToLevels(params: any): string[] | undefined {
  const c = params?.category ?? params?.compat
  if (c === undefined || c === null) return undefined
  const lvl = COMPAT_CAT_TO_LEVEL[Number(c)]
  return lvl ? [lvl] : undefined
}

const PARAM_NORMALIZERS: Partial<Record<FilterItemType, (out: any, params: any) => void>> = {
  friends: (out, params) => { if (Array.isArray(params?.friends)) out.friends = params.friends },
  storeTag: (out, params) => { if (params?.tag || params?.tags) out.tags = params.tag ? [params.tag] : params.tags },
  achievements: (out, params) => { out.achievementFilter = params },
  collection: (out, params) => { out.collectionId = params?.collectionId ?? params?.id ?? '' },
  // TabMaster deck/steamos compat store a single { category:N }; ours use a
  // levels[] array. Fall back to the existing `compat` key too.
  deckCompatibility: (out, params) => { const l = catToLevels(params); if (l) out.levels = l },
  steamosCompatibility: (out, params) => { const l = catToLevels(params); if (l) out.levels = l },
  nameRegex: (out, params) => { if (params?.regex) out.pattern = String(params.regex) },
  // { scoreThreshold, condition:'above'|'below', type:'metacritic'|'steam' }
  reviewScore: (out, params) => {
    if (params?.scoreThreshold !== undefined) out.value = Number(params.scoreThreshold)
    out.op = params?.condition === 'below' ? '<=' : '>='
    out.source = params?.type === 'steam' ? 'steam' : 'metacritic'
  },
  // { date, condition:'above'|'below' } — date is a seconds timestamp.
  releaseDate: (out, params) => {
    if (params?.date !== undefined && params?.date !== null) out.ts = Number(params.date)
    out.op = params?.condition === 'below' ? 'before' : 'after'
  },
  // { timeThreshold, condition, units:'minutes'|'hours' } → min/maxHours.
  playtimeRange: (out, params) => {
    if (params?.timeThreshold === undefined) return
    const hours = params?.units === 'hours' ? Number(params.timeThreshold) : Number(params.timeThreshold) / 60
    if (params?.condition === 'below') out.maxHours = hours; else out.minHours = hours
  },
  // { gbThreshold, condition } → min/maxMB.
  installedSizeRange: (out, params) => {
    if (params?.gbThreshold === undefined) return
    const mb = Number(params.gbThreshold) * 1024
    if (params?.condition === 'below') out.maxMB = mb; else out.minMB = mb
  },
  // TabMaster microsd/install-folder → our storageDevice ('sd' vs 'ssd').
  storageDevice: (out, params) => { out.device = params?.micoSDCard || params?.microSDCard || params?.card ? 'sd' : 'ssd' },
  // Streamable → remote-play availability.
  remotePlayLocation: (out, params) => { if (!params?.mode) out.mode = 'remote' },
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
  const normRaw = String(typeRaw || '').toLowerCase().replace(/[_\- ]/g, '')
  let inv = inverted
  // "blacklist" excludes its apps → our appIdList (include) inverted.
  if (normRaw === 'blacklist') inv = !inv
  // TabMaster "coming soon" carries { isComingSoon }; false = "not coming soon".
  if (type === 'comingSoon' && params?.isComingSoon === false) inv = !inv
  return { type, inverted: inv, params: normalizeFilterParams(type, params) }
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
