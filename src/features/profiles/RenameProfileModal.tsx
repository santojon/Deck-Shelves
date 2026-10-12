import type { SettingsController } from '../settings/controller'
import { RenameModal } from '../../components/qam/modals/RenameModal'

export function RenameProfileModal({ closeModal, controller, profileId, currentName }: { closeModal?: () => void; controller: SettingsController; profileId: string; currentName: string }) {
  return (
    <RenameModal
      closeModal={closeModal}
      controller={controller}
      title={controller.t('settings_profiles_rename' as any)}
      currentName={currentName}
      onRename={(name) => (controller.actions as any).renameProfile?.(profileId, name)}
    />
  )
}
