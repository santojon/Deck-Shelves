import { Dropdown, Field } from '../../runtime/host/decky'

export type HorizontalPosition = 'left' | 'center' | 'right'

const PER_SHELF = 'per_shelf'

export function PositionField({
  labelKey,
  value,
  onChange,
  t,
  disabled,
  perShelfLabel,
  onPerShelf,
}: {
  labelKey: string
  value: HorizontalPosition | null
  onChange: (next: HorizontalPosition) => void
  t: (k: string) => string
  disabled?: boolean
  // Global controls only: an extra first choice that hands the value back to each shelf.
  perShelfLabel?: string
  onPerShelf?: () => void
}) {
  const options = [
    { data: 'left', label: t('logo_position_left') },
    { data: 'center', label: t('logo_position_center') },
    { data: 'right', label: t('logo_position_right') },
  ]
  return (
    <Field label={t(labelKey)} childrenContainerWidth='min'>
      <Dropdown
        rgOptions={perShelfLabel ? [{ data: PER_SHELF, label: perShelfLabel }, ...options] : options}
        selectedOption={value ?? (perShelfLabel ? PER_SHELF : 'left')}
        disabled={disabled}
        onChange={(opt: any) => {
          if (opt?.data === PER_SHELF) onPerShelf?.()
          else onChange((opt?.data ?? 'left') as HorizontalPosition)
        }}
      />
    </Field>
  )
}
