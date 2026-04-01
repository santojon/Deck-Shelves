/**
 * Custom filter domain logic.
 *
 * This module defines how external filter representations (from any plugin)
 * are mapped to Deck Shelves' internal FilterItem / FilterGroup structures.
 * It has no dependency on any specific integration.
 */
import type { FilterGroup, FilterItem, FilterItemType } from '../types'

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
] as const

export type KnownFilterType = typeof KNOWN_FILTER_TYPES[number]

/** Maps a raw filter type string (from any source) to an internal FilterItemType. */
export function mapFilterTypeToInternal(raw: string): FilterItemType {
  const norm = String(raw || '').toLowerCase().replace(/[_\- ]/g, '')
  switch (norm) {
    case 'lastplayed': case 'playedwithin': case 'playedwithinndays': return 'playedWithinDays'
    case 'favorites': return 'favorites'
    case 'installed': case 'installation': return 'installed'
    case 'nonsteam': case 'platform': return 'nonSteam'
    case 'hidden': return 'hidden'
    case 'updatepending': return 'updatePending'
    case 'deckcompatibility': case 'deckverde': return 'deckCompatibility'
    case 'playtime': case 'playtimerange': return 'playtimeRange'
    case 'name': case 'nameincludes': return 'nameIncludes'
    case 'nameregex': return 'nameRegex'
    case 'friends': return 'friends'
    case 'storetag': case 'tag': return 'storeTag'
    case 'achievements': return 'achievements'
    case 'collection': return 'collection'
    case 'merge': return 'merge'
    default: return 'nameIncludes'
  }
}

/** Converts a single external filter object to a FilterItem. */
export function convertFilterToItem(filter: any): FilterItem {
  const typeRaw: string = filter?.type ?? filter?.filterType ?? 'name'
  const inverted = !!filter?.inverted
  const params = filter?.params ?? filter?.options ?? {}

  if (String(typeRaw).toLowerCase() === 'merge') {
    const children = (params.filters || []) as any[]
    const childItems = children.flatMap((c: any) => c ? [convertFilterToItem(c)] : [])
    return { type: 'merge', inverted, params: { mode: params.mode ?? 'and', items: childItems } }
  }

  const type = mapFilterTypeToInternal(typeRaw)
  const normalizedParams: any = { ...params }
  if (type === 'friends' && Array.isArray(params?.friends)) normalizedParams.friends = params.friends
  if (type === 'storeTag' && (params?.tag || params?.tags)) normalizedParams.tags = params.tag ? [params.tag] : params.tags
  if (type === 'achievements') normalizedParams.achievementFilter = params
  // TabMaster stores the collection ID as params.id; our internal format uses params.collectionId
  if (type === 'collection') normalizedParams.collectionId = params?.collectionId ?? params?.id ?? ''
  if (type === 'deckCompatibility' && params?.compat !== undefined) normalizedParams.levels = [params.compat]
  return { type, inverted, params: normalizedParams }
}

/** Converts an array of external filter objects to a FilterGroup. */
export function convertFiltersToGroup(filters: any[]): FilterGroup {
  const items = (filters || []).flatMap((f: any) => f ? [convertFilterToItem(f)] : [])
  return { mode: 'and', items }
}

/**
 * Converts a generic "container" object (any plugin's tab/collection representation)
 * to a ShelfSource. If the container has filters, produces a filter-based source;
 * otherwise produces a tab-id-based source.
 */
export function containerToShelfSource(container: any): { type: string; tab?: string; filter?: any } {
  if (!container) return { type: 'tab', tab: '' }
  if (!container.filters || container.filters.length === 0) {
    return { type: 'tab', tab: String(container.id ?? container.title ?? '') }
  }
  const group = convertFiltersToGroup(container.filters)
  return { type: 'filter', filter: { filterGroup: group } }
}
