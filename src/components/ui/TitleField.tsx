import { TextField } from '../../runtime/host/decky'
import { textFromDeckyChange } from '../qam/modals/modalUtils'

export function TitleField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className='deck-shelves-title-input'>
      <TextField label={label} value={value} onChange={(change: unknown) => onChange(textFromDeckyChange(change))} />
    </div>
  )
}
