import type { SingleDropdownOption } from '../../../../runtime/host/decky'
import i18n from '../../../../i18n'
import { SORT_OPTIONS } from './constants'
import { SortField } from './SortField'
import type { SourceOrder } from './types'

const PRICE_SORTS: ReadonlySet<string> = new Set(['price_low', 'discount_high', 'original_price_high'])

// Price sorts read the store's prices, so only the wishlist and the store offer them.
export function sourceSortOptions(sourceType: string, onlineEnabled: boolean): SingleDropdownOption[] {
  const online = sourceType === 'wishlist' || sourceType === 'store'
  return SORT_OPTIONS
    .filter((o) => o.value !== 'manual')
    .filter((o) => (PRICE_SORTS.has(o.value) ? online : onlineEnabled || !(o as { requiresOnline?: boolean }).requiresOnline))
    .map((o) => ({ data: o.value, label: i18n.t(o.labelKey as any) }))
}

export function SourceSortField({ sourceType, onlineEnabled, order, onChange }: {
  sourceType: string
  onlineEnabled: boolean
  order: SourceOrder | undefined
  onChange: (next: SourceOrder) => void
}) {
  const sort = order?.sort ?? 'source_order'
  return (
    <SortField
      label={i18n.t('composite_source_sort' as any)}
      options={sourceSortOptions(sourceType, onlineEnabled)}
      sort={sort}
      onSortChange={(next) => onChange({ ...order, sort: next === 'source_order' ? undefined : next })}
      reverse={order?.sortReverse ?? false}
      onReverseChange={(next) => onChange({ ...order, sortReverse: next })}
      bottomSeparator='none'
      allowMultiKey
    />
  )
}
