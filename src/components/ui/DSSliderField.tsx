import { SliderField } from '../../runtime/host/decky'

/**
 * Standardised slider row used across QAM, sidecar, and modals.
 *
 * Renders a label-on-top / value-on-the-right header above an unlabeled
 * Decky `SliderField`. No extra `Field` wrapping — the SliderField is
 * the only Focusable in the row, which avoids the nested-focus-ring
 * artefact (`Focusable` inside `Focusable`) that the previous custom
 * `Field` wrapper introduced.
 *
 * Drop-in replacement for `SliderField` props. Optional `unit` suffix
 * and `valueLabel` override for non-numeric mappings (e.g. line counts
 * → "1 linha"). `bottomSeparator` is forwarded to the SliderField.
 */
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
