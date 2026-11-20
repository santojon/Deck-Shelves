import { DialogButton, type SingleDropdownOption } from '../../../../runtime/host/decky'
import i18n from '../../../../i18n'
import { SHELF_LIMIT_MAX } from '../../../../domain/shelfLimits'
import { DSSliderField } from '../../../ui'
import { getThirdPartySortOptions } from '../../../../core/pluginApi'
import { descriptorName } from '../../../../core/descriptorName'
import { FOLLOW_SHELF_SORT, SORT_OPTIONS } from './constants'
import { SortField } from './SortField'
import type { SourceOrder } from './types'

// A source with no sort keeps its own order under "Source order" and follows the shelf under any other.
export function nextSourceSort(next: string | string[], followsShelf: boolean): string | string[] | undefined {
  return next === (followsShelf ? FOLLOW_SHELF_SORT : 'source_order') ? undefined : next
}

const PRICE_SORTS: ReadonlySet<string> = new Set(['price_low', 'discount_high', 'original_price_high'])

export function pluginSortChoices(): SingleDropdownOption[] {
  return getThirdPartySortOptions().map((d) => ({ data: d.id, label: descriptorName((k) => String(i18n.t(k)), d) }))
}

export function sourceSortOptions(sourceType: string, onlineEnabled: boolean): SingleDropdownOption[] {
  const online = sourceType === 'wishlist' || sourceType === 'store'
  return [
    ...SORT_OPTIONS
      .filter((o) => (PRICE_SORTS.has(o.value) ? online : onlineEnabled || !(o as { requiresOnline?: boolean }).requiresOnline))
      .map((o) => ({ data: o.value, label: i18n.t(o.labelKey as any) })),
    ...pluginSortChoices(),
  ]
}

export function SourceSortField({ sourceType, onlineEnabled, order, onChange, followsShelf = false }: {
  sourceType: string
  onlineEnabled: boolean
  order: SourceOrder | undefined
  onChange: (next: SourceOrder) => void
  followsShelf?: boolean
}) {
  const base = sourceSortOptions(sourceType, onlineEnabled)
  const options = followsShelf ? [{ data: FOLLOW_SHELF_SORT, label: i18n.t('composite_source_sort_shelf' as any) }, ...base] : base
  const sort = order?.sort ?? (followsShelf ? FOLLOW_SHELF_SORT : 'source_order')
  return (
    <SortField
      label={i18n.t('composite_source_sort' as any)}
      options={options}
      sort={sort}
      onSortChange={(next) => onChange({ sort: nextSourceSort(next, followsShelf) })}
      reverse={order?.sortReverse ?? false}
      onReverseChange={(next) => onChange({ sortReverse: next })}
      bottomSeparator='none'
      allowMultiKey
    />
  )
}

// 0 keeps every game the source has; the shelf's own limit still cuts the whole list.
export function SourceLimitField({ order, onChange }: {
  order: SourceOrder | undefined
  onChange: (next: SourceOrder) => void
}) {
  const limit = order?.limit ?? 0
  return (
    <DSSliderField
      label={i18n.t('composite_source_limit' as any)}
      value={limit}
      valueLabel={limit > 0 ? undefined : i18n.t('composite_source_limit_all' as any)}
      min={0}
      max={SHELF_LIMIT_MAX}
      step={1}
      bottomSeparator='none'
      onChange={(next: number) => onChange({ limit: next > 0 ? next : undefined })}
    />
  )
}

export const isManualSourceOrder = (order: SourceOrder | undefined): boolean =>
  (Array.isArray(order?.sort) ? order?.sort[0] : order?.sort) === 'manual'

// A source sorted by hand gets a button that shows its games alone in the preview, to put them in order.
export function SourceOrderFields({ sourceType, onlineEnabled, order, onChange, followsShelf, ordering, onToggleOrdering }: {
  sourceType: string
  onlineEnabled: boolean
  order: SourceOrder | undefined
  onChange: (next: SourceOrder) => void
  followsShelf: boolean
  ordering: boolean
  onToggleOrdering: () => void
}) {
  const label = i18n.t((ordering ? 'composite_source_order_done' : 'composite_source_order_games') as any)
  return (
    <>
      <SourceSortField sourceType={sourceType} onlineEnabled={onlineEnabled} order={order} onChange={onChange} followsShelf={followsShelf} />
      <SourceLimitField order={order} onChange={onChange} />
      {isManualSourceOrder(order) && (
        <DialogButton onClick={onToggleOrdering} onOKActionDescription={label} style={{ width: '100%', marginTop: 4 }}>{label}</DialogButton>
      )}
    </>
  )
}
