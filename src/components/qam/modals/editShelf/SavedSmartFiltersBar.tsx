import { useState } from 'react'
import { DialogButton, DropdownItem, Focusable, TextField, type SingleDropdownOption } from '../../../../runtime/host/decky'
import type { SettingsController } from '../../../../features/settings/controller'
import type { SavedSmartFilter } from '../../../../types'
import { textFromDeckyChange } from '../modalUtils'
import { icons } from '../../icons'
import { optionData } from './utils'

/**
 * Renders inside EditSmartShelfModal. Lets the user apply a previously
 * saved smart-shelf configuration (mode + smartParams + filterGroup + sort
 * + limit + visibleHours + visibleDaysOfWeek) or save the current shelf
 * config as a new entry.
 *
 * Mirrors the regular `SavedFiltersBar` shape so QAM and modal feel
 * consistent. The saved entries are stored at settings level
 * (`Settings.savedSmartFilters`) and exposed read-only to external
 * plugins via `__DECK_SHELVES_API__.getSavedSmartFilters()`.
 */
export function SavedSmartFiltersBar({
  controller,
  currentPayload,
  filterMode,
  onApply,
}: {
  controller: SettingsController
  currentPayload: Omit<SavedSmartFilter, 'id' | 'name'>
  /** When set, restrict the dropdown to saved entries for the same mode.
   *  Smart shelves don't change mode after creation; cross-mode apply
   *  would create field-mismatch confusion. */
  filterMode?: string
  onApply: (filter: SavedSmartFilter) => void
}) {
  const { t, settings, actions } = controller
  const all = settings?.savedSmartFilters ?? []
  const saved = filterMode ? all.filter((f) => f.mode === filterMode) : all
  const [picked, setPicked] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const options: SingleDropdownOption[] = [
    { data: '', label: t('saved_smart_filter_placeholder' as any) },
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
            if (found) onApply(found)
          }}
          label={t('saved_smart_filter_apply' as any)}
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
              await actions.saveSmartFilter(trimmed, currentPayload)
              setSaving(false)
              setName('')
            }}
            style={iconButtonStyle}
            onOKActionDescription={t('saved_smart_filter_save' as any)}
          >{icons.save}</DialogButton>
          <DialogButton
            onClick={() => { setSaving(false); setName('') }}
            style={iconButtonStyle}
            onOKActionDescription={t('cancel')}
          >{icons.close}</DialogButton>
        </Focusable>
      ) : (
        <DialogButton style={{ marginTop: 8, width: '100%' }} onClick={() => setSaving(true)}>{t('saved_smart_filter_save_current' as any)}</DialogButton>
      )}
    </div>
  )
}
