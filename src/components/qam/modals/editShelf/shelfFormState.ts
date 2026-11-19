import type { Shelf } from '../../../../types'
import { normalizeFilter } from '../../../../domain/settings'
import { BASE_SOURCE_TYPES, V3_SOURCE_OPTIONS, type SourceType } from './constants'
import type { EditableShelfState } from './types'

function firstOptParts(options: any[], fallbackTitle: string): { title: string; data: string } {
  const first = options[0]
  return { title: String(first?.title ?? first?.label ?? fallbackTitle), data: String(first?.data ?? '') }
}

function tabFirstParts(tabOptions: any[], tabTextLabels: Map<string, string>, t: (k: string) => string): { title: string; tab: string } {
  const first = tabOptions[0]
  const title = first ? (tabTextLabels.get(String(first.data)) ?? t('new_shelf')) : t('new_shelf')
  return { title, tab: String(first?.data ?? 'all') }
}

export function computeSourceTypeState(
  prev: EditableShelfState,
  type: SourceType,
  deps: { collectionOptions: any[]; tabOptions: any[]; tabTextLabels: Map<string, string>; externalOptions: any[]; t: (k: string) => string },
): EditableShelfState {
  const { collectionOptions, tabOptions, tabTextLabels, externalOptions, t } = deps
  const wipeExtras = {}
  if (type === 'collection') {
    const o = firstOptParts(collectionOptions, t('new_shelf'))
    return { ...prev, sourceType: type, title: o.title, collectionId: o.data, filter: normalizeFilter({ type: 'filter', filter: prev.filter }), ...wipeExtras } as EditableShelfState
  }
  if (type === 'tab') {
    const o = tabFirstParts(tabOptions, tabTextLabels, t)
    return { ...prev, sourceType: type, title: o.title, tab: o.tab, ...wipeExtras } as EditableShelfState
  }
  if (type === 'external') {
    const o = firstOptParts(externalOptions, t('new_shelf'))
    return { ...prev, sourceType: type, title: o.title, externalSourceId: o.data, ...wipeExtras } as EditableShelfState
  }
  if (type === 'wishlist') {
    return { ...prev, sourceType: type, childFilterGroup: { mode: 'and', items: [] }, ...wipeExtras } as EditableShelfState
  }
  if (type === 'store') {
    return { ...prev, sourceType: type, ...wipeExtras } as EditableShelfState
  }
  if (type === 'builtin') {
    const first = V3_SOURCE_OPTIONS[0]?.value ?? ''
    return { ...prev, sourceType: type, builtinSourceId: prev.builtinSourceId || first, ...wipeExtras } as EditableShelfState
  }
  return { ...prev, sourceType: type, filter: normalizeFilter({ type: 'filter', filter: prev.filter }), ...wipeExtras } as EditableShelfState
}

export function hasAny(arr: unknown): boolean {
  return ((arr as any[] | undefined)?.length ?? 0) > 0
}

export function primarySortValue(state: EditableShelfState): Shelf['sort'] {
  return state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort
}

export function isOnlineSourceType(sourceType: SourceType): boolean {
  return sourceType === 'wishlist' || sourceType === 'store'
}

export function onlineFeaturesEnabled(settings: unknown): boolean {
  return (settings as { onlineFeaturesEnabled?: boolean } | null | undefined)?.onlineFeaturesEnabled === true
}

export function buildAllSourceTypes(externalSources: unknown[], onlineEnabled: boolean): SourceType[] {
  return [
    ...BASE_SOURCE_TYPES,
    ...(externalSources.length > 0 ? ['external' as SourceType] : []),
    'builtin' as SourceType,
    ...(onlineEnabled ? ['wishlist' as SourceType, 'store' as SourceType] : []),
  ]
}
