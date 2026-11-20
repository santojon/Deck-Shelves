import type { SettingsController } from '../../../../features/settings/controller'
import type { FilterGroup } from '../../../../types'
import { SavedPresetBar } from './SavedPresetBar'

export function SavedFiltersBar({ controller, currentGroup, onApply, accepts }: { controller: SettingsController; currentGroup: FilterGroup; onApply: (g: FilterGroup) => void; accepts?: (g: FilterGroup) => boolean }) {
  const { t, settings, actions } = controller
  const all = settings?.savedFilters ?? []
  const saved = accepts ? all.filter((f) => accepts(f.group)) : all
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
