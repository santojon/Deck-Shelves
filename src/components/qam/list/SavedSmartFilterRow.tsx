import type { SettingsController } from '../../../features/settings/controller'
import type { SavedSmartFilter } from '../../../types'
import { openManagedModal } from '../common/openManagedModal'
import { RenameSavedSmartFilterModal } from '../modals/RenameSavedSmartFilterModal'
import { SavedPresetRow } from './SavedPresetRow'

export function SavedSmartFilterRow({ controller, savedSmartFilter }: { controller: SettingsController; savedSmartFilter: SavedSmartFilter }) {
  const { t, actions } = controller
  return (
    <SavedPresetRow
      t={t}
      name={savedSmartFilter.name}
      renameLabel={t('saved_smart_filter_rename' as any)}
      deleteLabel={t('saved_smart_filter_delete' as any)}
      onRename={() => openManagedModal((close) => <RenameSavedSmartFilterModal closeModal={close} controller={controller} savedSmartFilter={savedSmartFilter} />)}
      onDelete={() => actions.deleteSavedSmartFilter(savedSmartFilter.id)}
    />
  )
}
