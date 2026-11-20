import type { FilterGroup } from '../../../../types'
import type { EditableShelfState } from './types'
import { confirmAction } from '../ConfirmActionModal'

const EMPTY_GROUP: FilterGroup = { mode: 'and', items: [] }

// The old shared filter only ever narrowed wishlist and store sources, joined to their own filter as the resolver does.
function keptChildFilter(prev: EditableShelfState): FilterGroup {
  const own = prev.childFilterGroup
  const shared = prev.legacyCompositeChildFilter?.items ?? []
  if (!shared.length || (prev.sourceType !== 'wishlist' && prev.sourceType !== 'store')) return own
  return { mode: own.items.length && own.mode === 'or' ? 'or' : 'and', items: [...own.items, ...shared] }
}

export function withoutSourceRow(prev: EditableShelfState, idx: number): EditableShelfState {
  const additionalSources = prev.additionalSources.filter((_, i) => i !== idx)
  if (additionalSources.length > 0) return { ...prev, additionalSources }
  return { ...prev, additionalSources, postFilterGroup: EMPTY_GROUP, childFilterGroup: keptChildFilter(prev), legacyCompositeChildFilter: undefined }
}

// With one source left nothing is combined, and the filter on the combined result goes with the row.
export function removeSourceRow(state: EditableShelfState, t: (key: any) => string, remove: () => void): void {
  if (state.additionalSources.length !== 1 || !state.postFilterGroup.items.length) {
    remove()
    return
  }
  confirmAction({
    title: t('composite_post_filter_drop_title'),
    body: t('composite_post_filter_drop_body'),
    okText: t('composite_remove_source'),
    cancelText: t('cancel'),
    onConfirm: () => remove(),
  })
}
