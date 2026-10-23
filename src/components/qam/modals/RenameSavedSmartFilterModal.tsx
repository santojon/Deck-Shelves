import type { SettingsController } from '../../../features/settings/controller'
import type { SavedSmartFilter } from '../../../types'
import { RenameModal } from './RenameModal'

export function RenameSavedSmartFilterModal({ closeModal, controller, savedSmartFilter }: { closeModal?: () => void; controller: SettingsController; savedSmartFilter: SavedSmartFilter }) {
  return (
    <RenameModal
      closeModal={closeModal}
      controller={controller}
      title={controller.t('saved_smart_filter_rename' as any)}
      currentName={savedSmartFilter.name}
      onRename={(name) => controller.actions.renameSavedSmartFilter(savedSmartFilter.id, name)}
    />
  )
}
