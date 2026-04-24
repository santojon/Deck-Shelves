import { useState } from 'react'
import { DialogButton, DropdownItem, Focusable, TextField } from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import type { SettingsController } from '../../../../features/settings/controller'
import type { FilterGroup } from '../../../../types'
import { textFromDeckyChange } from '../modalUtils'
import { optionData } from './utils'

/**
 * Renders at the top of the Filters tab when the shelf source is a filter.
 * Lets the user apply a previously-saved filter group or save the current
 * one as a reusable `SavedFilter` (managed from the QAM panel).
 */
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
        <Focusable style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
          <DialogButton
            disabled={!name.trim()}
            onClick={async () => {
              const trimmed = name.trim()
              if (!trimmed) return
              await actions.saveFilter(trimmed, currentGroup)
              setSaving(false)
              setName('')
            }}
          >{t('saved_filter_save')}</DialogButton>
          <DialogButton onClick={() => { setSaving(false); setName('') }}>{t('cancel')}</DialogButton>
        </Focusable>
      ) : (
        <DialogButton style={{ marginTop: 8 }} onClick={() => setSaving(true)}>{t('saved_filter_save_current')}</DialogButton>
      )}
    </div>
  )
}
