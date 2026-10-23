import type { SettingsController } from '../../../../features/settings/controller'
import type { FilterGroup } from '../../../../types'
import { SavedPresetBar } from './SavedPresetBar'

export function SavedFiltersBar({ controller, currentGroup, onApply }: { controller: SettingsController; currentGroup: FilterGroup; onApply: (g: FilterGroup) => void }) {
  const { t, settings, actions } = controller
  const saved = settings?.savedFilters ?? []
  return (
    <SavedPresetBar
      t={t}
      items={saved}
      labels={{ placeholder: t('saved_filter_placeholder'), apply: t('saved_filter_apply'), save: t('saved_filter_save'), saveCurrent: t('saved_filter_save_current') }}
      onApply={(id) => { const found = saved.find((f) => f.id === id); if (found) onApply(found.group) }}
      onSave={(name) => actions.saveFilter(name, currentGroup)}
    />
  )
}
