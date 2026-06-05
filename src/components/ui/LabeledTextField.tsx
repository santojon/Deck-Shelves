import { Field, TextField } from '../../runtime/host/decky'
import { textFromDeckyChange } from '../qam/modals/modalUtils'

/**
 * Field + TextField pair with label rendered above the input. Normalizes
 * Decky's `onChange` arg (can be `string` or an event-shaped object) via
 * `textFromDeckyChange` so callers only deal with plain strings.
 *
 * Mirrors the pattern used inside every edit modal's title input and the
 * import/export modals' filename / path inputs.
 */
export function LabeledTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field
      description={
        <>
          <div style={{ paddingBottom: '6px' }}>{label}</div>
          <TextField value={value} onChange={(v: unknown) => onChange(textFromDeckyChange(v))} />
        </>
      }
    />
  )
}
