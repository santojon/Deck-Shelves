import { useState } from 'react'
import { DialogButton, DropdownItem, Focusable, TextField, type SingleDropdownOption } from '../../../../runtime/host/decky'
import type { SettingsController } from '../../../../features/settings/controller'
import type { FilterGroup } from '../../../../types'
import { textFromDeckyChange } from '../modalUtils'
import { icons } from '../../icons'
import { optionData } from './utils'

export function SavedFiltersBar({ controller, currentGroup, onApply }: { controller: SettingsController; currentGroup: FilterGroup; onApply: (g: FilterGroup) => void }) {
  const { t, settings, actions } = controller
  const saved = settings?.savedFilters ?? []
  const [picked, setPicked] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const options: SingleDropdownOption[] = [
    { data: '', label: t('saved_filter_placeholder') },
    ...saved.map((f) => ({ data: f.id, label: f.name })),
  ]

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

  return (
    <div style={{ marginBottom: 8 }}>
      {saved.length > 0 && (
        <DropdownItem
          rgOptions={options}
          selectedOption={picked}
          onChange={(opt: unknown) => {
            const id = String(optionData(opt) ?? '')
            setPicked(id)
            if (!id) return
            const found = saved.find((f) => f.id === id)
            if (found) onApply(found.group)
          }}
          label={t('saved_filter_apply')}
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
              await actions.saveFilter(trimmed, currentGroup)
              setSaving(false)
              setName('')
            }}
            style={iconButtonStyle}
            onOKActionDescription={t('saved_filter_save')}
          >{icons.save}</DialogButton>
          <DialogButton
            onClick={() => { setSaving(false); setName('') }}
            style={iconButtonStyle}
            onOKActionDescription={t('cancel')}
          >{icons.close}</DialogButton>
        </Focusable>
      ) : (
        <DialogButton style={{ marginTop: 8, width: '100%' }} onClick={() => setSaving(true)}>{t('saved_filter_save_current')}</DialogButton>
      )}
    </div>
  )
}
