import type { SettingsController } from '../../../features/settings/controller'
import type { SavedFilter } from '../../../types'
import { openManagedModal } from '../common/openManagedModal'
import { RenameSavedFilterModal } from '../modals/RenameSavedFilterModal'
import { SavedPresetRow } from './SavedPresetRow'

export function SavedFilterRow({ controller, savedFilter }: { controller: SettingsController; savedFilter: SavedFilter }) {
  const { t, actions } = controller
  return (
    <SavedPresetRow
      t={t}
      name={savedFilter.name}
      renameLabel={t('saved_filter_rename')}
      deleteLabel={t('saved_filter_delete')}
      onRename={() => openManagedModal((close) => <RenameSavedFilterModal closeModal={close} controller={controller} savedFilter={savedFilter} />)}
      onDelete={() => actions.deleteSavedFilter(savedFilter.id)}
    />
  )
}
