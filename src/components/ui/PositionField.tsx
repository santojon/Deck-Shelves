import { Dropdown, Field } from '../../runtime/host/decky'

export type HorizontalPosition = 'left' | 'center' | 'right'

export function PositionField({
  labelKey,
  value,
  onChange,
  t,
  disabled,
}: {
  labelKey: string
  value: HorizontalPosition
  onChange: (next: HorizontalPosition) => void
  t: (k: string) => string
  disabled?: boolean
}) {
  return (
    <Field label={t(labelKey)} childrenContainerWidth='min'>
      <Dropdown
        rgOptions={[
          { data: 'left', label: t('logo_position_left') },
          { data: 'center', label: t('logo_position_center') },
          { data: 'right', label: t('logo_position_right') },
        ]}
        selectedOption={value}
        disabled={disabled}
        onChange={(opt: any) => onChange(((opt?.data ?? 'left') as HorizontalPosition))}
      />
    </Field>
  )
}
