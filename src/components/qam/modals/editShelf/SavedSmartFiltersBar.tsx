import type { SettingsController } from '../../../../features/settings/controller'
import type { SavedSmartFilter } from '../../../../types'
import { SavedPresetBar } from './SavedPresetBar'

export function SavedSmartFiltersBar({
  controller,
  currentPayload,
  filterMode,
  onApply,
}: {
  controller: SettingsController
  currentPayload: Omit<SavedSmartFilter, 'id' | 'name'>
  filterMode?: string
  onApply: (filter: SavedSmartFilter) => void
}) {
  const { t, settings, actions } = controller
  const all = settings?.savedSmartFilters ?? []
  const saved = filterMode ? all.filter((f) => f.mode === filterMode) : all
  return (
    <SavedPresetBar
      t={t}
      items={saved}
      labels={{ placeholder: t('saved_smart_filter_placeholder' as any), apply: t('saved_smart_filter_apply' as any), save: t('saved_smart_filter_save' as any), saveCurrent: t('saved_smart_filter_save_current' as any) }}
      onApply={(id) => { const found = saved.find((f) => f.id === id); if (found) onApply(found) }}
      onSave={(name) => actions.saveSmartFilter(name, currentPayload)}
    />
  )
}
