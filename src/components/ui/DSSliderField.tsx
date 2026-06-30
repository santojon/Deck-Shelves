import { SliderField } from '../../runtime/host/decky'

export function DSSliderField({
  label,
  value,
  unit,
  valueLabel,
  bottomSeparator,
  ...rest
}: {
  label: string
  value: number
  unit?: string
  valueLabel?: string
  bottomSeparator?: 'standard' | 'thick' | 'none'
  min: number
  max: number
  step?: number
  notchCount?: number
  notchLabels?: { notchIndex: number; label: string; value: number }[]
  onChange: (next: number) => void
  disabled?: boolean
  resetValue?: number
} & Record<string, unknown>) {
  const display = valueLabel ?? `${value}${unit ?? ''}`
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          // Match the SliderField's own inner padding (16 px each side)
          // so the value column's right edge lines up with the right end
          // of the slider track immediately below.
          padding: '6px 16px 0',
        }}
      >
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span
          style={{
            opacity: 0.78,
            fontVariantNumeric: 'tabular-nums',
            fontSize: '0.92em',
          }}
        >
          {display}
        </span>
      </div>
      <SliderField label='' value={value} bottomSeparator={bottomSeparator} {...rest} />
    </div>
  )
}
