import { FilterItem, FilterGroup, FilterItemType } from '../types'

// Minimal external "CustomFilters" integration helpers.
// This file provides mapping utilities from external plugin filter representation
// to Deck-Shelves' internal `FilterItem`/`FilterGroup` structures.

export const CustomFiltersKnownFilterTypes = [
  'last played',
  'friends',
  'install folder',
  'achievements',
  'store tag',
  'merge',
  'name',
  'playtime',
] as const

export type CustomFiltersFilterType = typeof CustomFiltersKnownFilterTypes[number]

export function convertCustomFiltersFilterToFilterItem(cfFilter: any): FilterItem {
  const typeRaw: string = cfFilter?.type ?? cfFilter?.filterType ?? 'name'
  const inverted = !!cfFilter?.inverted
  const params = cfFilter?.params ?? cfFilter?.options ?? {}

  if (String(typeRaw).toLowerCase() === 'merge') {
    const children = (params.filters || []) as any[]
    const childItems = children.flatMap((c) => (c ? [convertCustomFiltersFilterToFilterItem(c)] : []))
    return { type: 'merge', inverted, params: { mode: params.mode ?? 'and', items: childItems } }
  }

  const type = mapCustomFiltersTypeToInternal(typeRaw)
  const normalizedParams: any = { ...params }
  if (type === 'friends' && Array.isArray(params?.friends)) normalizedParams.friends = params.friends
  if (type === 'storeTag' && (params?.tag || params?.tags)) normalizedParams.tags = params.tag ? [params.tag] : params.tags
  if (type === 'achievements') normalizedParams.achievementFilter = params
  if (type === 'collection' && params?.collectionId) normalizedParams.collectionId = params.collectionId

  return { type, inverted, params: normalizedParams }
}

export function convertCustomFiltersToGroup(cfFilters: any[]): FilterGroup {
  const items = (cfFilters || []).flatMap((f: any) => {
    if (!f) return []
    return [convertCustomFiltersFilterToFilterItem(f)]
  })
  return { mode: 'and', items }
}

function mapCustomFiltersTypeToInternal(raw: string): FilterItemType {
  const norm = String(raw || '').toLowerCase()
  switch (norm) {
    case 'last played':
    case 'playedwithin':
    case 'playedwithinndays':
      return 'playedWithinDays'
    case 'favorites':
      return 'favorites'
    case 'installed':
      return 'installed'
    case 'non-steam':
    case 'nonsteam':
      return 'nonSteam'
    case 'hidden':
      return 'hidden'
    case 'updatepending':
    case 'update_pending':
      return 'updatePending'
    case 'deckcompatibility':
    case 'deck_compatibility':
      return 'deckCompatibility'
    case 'playtime':
    case 'playtime_range':
      return 'playtimeRange'
    case 'name':
    case 'name_includes':
      return 'nameIncludes'
    case 'name_regex':
    case 'nameregex':
      return 'nameRegex'
    case 'friends':
      return 'friends'
    case 'store tag':
    case 'storetag':
    case 'tag':
      return 'storeTag'
    case 'achievements':
      return 'achievements'
    case 'collection':
      return 'collection'
    case 'merge':
      return 'merge'
    default:
      return 'nameIncludes'
  }
}

export default {
  convertCustomFiltersFilterToFilterItem,
  convertCustomFiltersToGroup,
}

export function containerToShelfSource(container: any) {
  if (!container) return undefined
  if (!container.filters || container.filters.length === 0) {
    return { type: 'tab', tab: String(container.id ?? container.title ?? '') }
  }
  const group = convertCustomFiltersToGroup(container.filters)
  return { type: 'filter', filter: { filterGroup: group } }
}

export function extractFiltersFromCustomFiltersManager(manager: any) {
  try {
    const maybe = manager.getTabs ? manager.getTabs() : manager
    const visibleList = maybe?.visibleTabsList ?? maybe?.tabs ?? maybe?.list ?? []
    if (!Array.isArray(visibleList)) return []
    return visibleList.map((t: any) => ({
      id: String(t.id ?? t.title ?? ''),
      title: String(t.title ?? t.id ?? ''),
      source: containerToShelfSource(t),
    }))
  } catch (e) {
    return []
  }
}
