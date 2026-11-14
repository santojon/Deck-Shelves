import type { FilterGroup, FilterItem, FilterItemType, ShelfSource } from '../types'

/* Normalised external filter-type aliases → our internal FilterItemType. A type
   without an alias keeps its own name: the condition is unavailable until the
   user picks a type the plugin evaluates, instead of matching everything. */
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
  demo: 'shortcutType',
  friends: 'friends',
  storetag: 'storeTag', tag: 'storeTag', tags: 'storeTag',
  achievements: 'achievements',
  familysharing: 'familySharing',
  purchasedate: 'purchaseDate',
  // Both read the library a game is installed in; the card itself cannot be told apart here.
  sdcard: 'libraryLocation', installfolder: 'libraryLocation',
  playtime: 'playtimeRange', playtimerange: 'playtimeRange', timeplayed: 'playtimeRange',
  sizeondisk: 'installedSizeRange', installedsize: 'installedSizeRange',
  recentlyactive: 'recentlyActive', recentplaytime: 'recentlyActive', currentrotation: 'recentlyActive',
  neglected: 'neglected', abandoned: 'neglected',
  name: 'nameIncludes', nameincludes: 'nameIncludes',
  nameregex: 'nameRegex', regex: 'nameRegex',
  steamfeatures: 'storeCategory',
  collection: 'collection',
  developer: 'developer',
  publisher: 'publisher',
  // "blacklist" excludes the listed apps → appIdList inverted (see convertFilterToItem).
  appidlist: 'appIdList', whitelist: 'appIdList', blacklist: 'appIdList',
  cloudavailable: 'cloudAvailable', cloudsaves: 'cloudAvailable', cloudsave: 'cloudAvailable',
  controllersupport: 'controllerSupport', controller: 'controllerSupport',
  merge: 'merge',
}

export function mapFilterTypeToInternal(raw: string): string {
  const norm = String(raw || '').toLowerCase().replace(/[_\- ]/g, '')
  return FILTER_TYPE_ALIASES[norm] ?? norm
}

// Types whose equivalent here depends on the options: a count or a percentage, played since or not since.
const RETYPE_BY_PARAMS: Record<string, (params: any) => FilterItemType> = {
  achievements: (p) => (p?.thresholdType === 'percent' ? 'achievementPercentRange' : 'achievements'),
  lastplayed: (p) => (p?.condition === 'below' ? 'neglected' : 'playedWithinDays'),
}

const DAY = 86400

// TabMaster's date: a {day?, month?, year} object, a seconds timestamp in older exports, or days ago.
function dateToTs(date: { day?: number; month?: number; year: number }, endOfPeriod: boolean): number {
  const { day, month, year } = date
  if (!endOfPeriod) return Math.floor(new Date(year, (month ?? 1) - 1, day ?? 1).getTime() / 1000)
  const next = day !== undefined ? new Date(year, (month ?? 1) - 1, day + 1) : month !== undefined ? new Date(year, month, 1) : new Date(year + 1, 0, 1)
  return Math.floor(next.getTime() / 1000) - 1
}

function importedTs(p: any, before: boolean): number | undefined {
  if (p?.date && typeof p.date === 'object') return dateToTs(p.date, before)
  if (typeof p?.date === 'number') return p.date
  if (typeof p?.daysAgo === 'number') return Math.floor(Date.now() / 1000) - p.daysAgo * DAY
  return undefined
}

function importedDate(p: any): { op?: string; ts?: number } {
  if (p?.isUnknown) return { op: 'unknown' }
  const before = p?.condition === 'below'
  const ts = importedTs(p, before)
  return ts === undefined ? {} : { op: before ? 'before' : 'after', ts }
}

// "Last played" as a number of days: days ago as given, or the days since the date.
function importedDays(p: any): number | undefined {
  if (typeof p?.daysAgo === 'number') return Math.max(1, Math.round(p.daysAgo))
  if (p?.date && typeof p.date === 'object') return Math.max(1, Math.ceil((Date.now() / 1000 - dateToTs(p.date, false)) / DAY))
  return undefined
}

const anyAll = (mode: unknown) => (mode === 'and' ? 'all' : 'any')

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
  releaseDate: (out, params) => Object.assign(out, importedDate(params)),
  purchaseDate: (out, params) => Object.assign(out, importedDate(params)),
  playedWithinDays: (out, params) => { const days = importedDays(params); if (days !== undefined) out.days = days },
  neglected: (out, params) => { const days = importedDays(params); if (days !== undefined) out.days = days },
  appIdList: (out, params) => { if (Array.isArray(params?.games)) out.appIds = params.games.map(Number) },
  // { threshold, thresholdType:'count'|'percent', condition } → a count range or a percentage range.
  achievements: (out, params) => {
    if (typeof params?.threshold !== 'number') return
    if (params.condition === 'below') { out.min = 0; out.max = params.threshold } else out.min = params.threshold
  },
  achievementPercentRange: (out, params) => {
    if (typeof params?.threshold !== 'number') return
    if (params.condition === 'below') { out.min = 0; out.max = params.threshold } else { out.min = params.threshold; out.max = 100 }
  },
  // { features: number[], mode } → the same category ids, any or all of them.
  storeCategory: (out, params) => {
    if (Array.isArray(params?.features)) out.ids = params.features.map(Number)
    if (params?.mode) out.mode = anyAll(params.mode)
  },
  /* A card or an install folder: the library's category by its path. An SD card is an
     external library; a folder under /run/media is too, anything else is internal. */
  libraryLocation: (out, params) => {
    if (params?.driveName !== undefined) out.category = String(params.driveName).startsWith('/run/media') ? 'external' : 'internal'
    else if (params?.card !== undefined || !Array.isArray(out.libraryIds)) out.category = out.category ?? 'external'
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
  // TabMaster "demo" → the demo kind of our shortcut-type condition.
  shortcutType: (out) => { if (!Array.isArray(out.kinds)) out.kinds = ['demo'] },
  storeTag: (out, params) => {
    if (params?.tag || Array.isArray(params?.tags)) out.tags = params.tag ? [String(params.tag)] : params.tags.map(String)
    if (params?.mode) out.mode = anyAll(params.mode)
  },
  // TabMaster lists the friends whose libraries count, all or any of them; ours counts them.
  friends: (out, params) => {
    if (Array.isArray(params?.friends)) out.friends = params.friends.map(Number)
    out.min = params?.mode === 'and' && Array.isArray(params?.friends) ? Math.max(1, params.friends.length) : 1
  },
  // Streamable → remote-play availability.
  remotePlayLocation: (out, params) => { if (!params?.mode) out.mode = 'remote' },
}

function normalizeFilterParams(type: string, params: any): any {
  const out: any = { ...params }
  PARAM_NORMALIZERS[type as FilterItemType]?.(out, params)
  return out
}

// The flag value that turns a TabMaster filter into the opposite of ours.
const NEGATED_WHEN: Record<string, [string, unknown]> = {
  comingsoon: ['isComingSoon', false],
  demo: ['isDemo', false],
  installed: ['installed', false],
  streamable: ['isStreamable', false],
  familysharing: ['isFamilyShared', false],
  platform: ['platform', 'steam'],
}

// Whether the imported filter means the opposite of ours: "blacklist" excludes its apps.
function importedAsNegated(normRaw: string, params: any): boolean {
  if (normRaw === 'blacklist') return true
  const flag = NEGATED_WHEN[normRaw]
  return !!flag && params?.[flag[0]] === flag[1]
}

export function convertFilterToItem(filter: any): FilterItem {
  const { typeRaw, inverted, params } = readFilterFields(filter)
  const normRaw = String(typeRaw || '').toLowerCase().replace(/[_\- ]/g, '')
  if (normRaw === 'merge') {
    const children = (params.filters || []) as any[]
    const childItems = children.flatMap((c: any) => c ? [convertFilterToItem(c)] : [])
    return { type: 'merge', inverted, params: { mode: params.mode ?? 'and', items: childItems } }
  }
  const type = RETYPE_BY_PARAMS[normRaw]?.(params) ?? mapFilterTypeToInternal(typeRaw)
  const inv = importedAsNegated(normRaw, params) ? !inverted : inverted
  return { type, inverted: inv, params: normalizeFilterParams(type, params) }
}

// A tab's filters under the tab's own and/or mode.
export function convertFiltersToGroup(filters: any[], filtersMode?: unknown): FilterGroup {
  const items = (filters || []).flatMap((f: any) => f ? [convertFilterToItem(f)] : [])
  return { mode: filtersMode === 'or' ? 'or' : 'and', items }
}

export function containerToShelfSource(container: any): ShelfSource {
  if (!container) return { type: 'tab', tab: '' }
  if (!container.filters || container.filters.length === 0) {
    return { type: 'tab', tab: String(container.id ?? container.title ?? '') }
  }
  const group = convertFiltersToGroup(container.filters, container.filtersMode)
  return { type: 'filter', filter: { filterGroup: group } }
}
