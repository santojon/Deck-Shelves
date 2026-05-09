import { Dropdown, Field, Focusable } from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import { SortDirectionButton } from './SortDirectionButton'
import { optionData } from './utils'

/**
 * Inline sort field: `Field` row containing a sort `Dropdown` and a
 * `SortDirectionButton` for asc/desc inversion. Shared by both edit
 * modals to render the primary sort control AND the manual-base sort
 * sub-field (the secondary selector that appears under manual sort).
 *
 * The label is provided by the caller because the same widget renders as
 * "Filter mode" / "Sort override" / "Manual base sort" depending on the
 * context. `bottomSeparator` defaults to `'thick'` to match the existing
 * inline rows.
 */
export function SortField({
  label,
  options,
  sort,
  onSortChange,
  reverse,
  onReverseChange,
  bottomSeparator = 'thick',
}: {
  label: string
  options: SingleDropdownOption[]
  sort: string
  onSortChange: (next: string) => void
  reverse: boolean
  onReverseChange: (next: boolean) => void
  bottomSeparator?: 'thick' | 'standard' | 'none'
}) {
  return (
    <Field
      label={label}
      childrenLayout="inline"
      childrenContainerWidth="min"
      inlineWrap="keep-inline"
      bottomSeparator={bottomSeparator}
    >
      <Focusable style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Focusable style={{ minWidth: 200 }}>
          <Dropdown rgOptions={options} selectedOption={sort} onChange={(opt: unknown) => onSortChange(String(optionData(opt) ?? ''))} focusable />
        </Focusable>
        <SortDirectionButton sort={sort} reverse={reverse} onChange={onReverseChange} />
      </Focusable>
    </Field>
  )
}
