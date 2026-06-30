import { Field, TextField } from '../../runtime/host/decky'
import { textFromDeckyChange } from '../qam/modals/modalUtils'

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
