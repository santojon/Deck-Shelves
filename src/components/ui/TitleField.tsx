import { TextField } from '../../runtime/host/decky'
import { textFromDeckyChange } from '../qam/modals/modalUtils'

// A name at the top of a dialog. The client's text field draws its own label.
export function TitleField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className='deck-shelves-title-input'>
      <TextField label={label} value={value} onChange={(change: unknown) => onChange(textFromDeckyChange(change))} />
    </div>
  )
}
