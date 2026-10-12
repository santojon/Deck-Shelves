import { useState } from 'react'
import { DialogButton, DropdownItem, Focusable, TextField, type SingleDropdownOption } from '../../../../runtime/host/decky'
import { textFromDeckyChange } from '../modalUtils'
import { icons } from '../../icons'
import { optionData } from './utils'

const iconButtonStyle = {
  height: 40,
  minWidth: 40,
  width: 40,
  display: 'flex' as const,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  padding: 0,
  flexShrink: 0,
}

/* "Apply a saved preset" dropdown + "save the current one" row, shared by the
   saved filters (regular shelves) and the saved smart filters. The caller
   supplies the list, the labels and the two actions. */
export function SavedPresetBar({ t, items, labels, onApply, onSave }: {
  t: (k: any) => string
  items: ReadonlyArray<{ id: string; name: string }>
  labels: { placeholder: string; apply: string; save: string; saveCurrent: string }
  onApply: (id: string) => void
  onSave: (name: string) => Promise<unknown>
}) {
  const [picked, setPicked] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const options: SingleDropdownOption[] = [
    { data: '', label: labels.placeholder },
    ...items.map((f) => ({ data: f.id, label: f.name })),
  ]

  return (
    <div style={{ marginBottom: 8 }}>
      {items.length > 0 && (
        <DropdownItem
          rgOptions={options}
          selectedOption={picked}
          onChange={(opt: unknown) => {
            const id = String(optionData(opt) ?? '')
            setPicked(id)
            if (id) onApply(id)
          }}
          label={labels.apply}
        />
      )}
      {saving ? (
        <Focusable style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
          </div>
          <DialogButton
            disabled={!name.trim()}
            onClick={async () => {
              const trimmed = name.trim()
              if (!trimmed) return
              await onSave(trimmed)
              setSaving(false)
              setName('')
            }}
            style={iconButtonStyle}
            onOKActionDescription={labels.save}
          >{icons.save}</DialogButton>
          <DialogButton
            onClick={() => { setSaving(false); setName('') }}
            style={iconButtonStyle}
            onOKActionDescription={t('cancel')}
          >{icons.close}</DialogButton>
        </Focusable>
      ) : (
        <DialogButton style={{ marginTop: 8, width: '100%' }} onClick={() => setSaving(true)}>{labels.saveCurrent}</DialogButton>
      )}
    </div>
  )
}
