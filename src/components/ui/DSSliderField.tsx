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
          // Matches the slider's 16px inner padding so the value lines up with the track.
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
