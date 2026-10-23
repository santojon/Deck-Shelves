import type { SettingsController } from '../../../features/settings/controller'
import type { SavedFilter } from '../../../types'
import { RenameModal } from './RenameModal'

export function RenameSavedFilterModal({ closeModal, controller, savedFilter }: { closeModal?: () => void; controller: SettingsController; savedFilter: SavedFilter }) {
  return (
    <RenameModal
      closeModal={closeModal}
      controller={controller}
      title={controller.t('saved_filter_rename')}
      currentName={savedFilter.name}
      onRename={(name) => controller.actions.renameSavedFilter(savedFilter.id, name)}
    />
  )
}
