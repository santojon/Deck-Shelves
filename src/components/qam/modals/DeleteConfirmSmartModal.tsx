import { ConfirmModal } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'

export function DeleteConfirmSmartModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: SmartShelf }) {
  const { t, actions } = controller
  return (
    <ConfirmModal
      strTitle={t('deleteShelf')}
      strDescription={shelf.title}
      strOKButtonText={t('deleteShelf')}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={() => {
        closeModal?.()
        actions.removeSmartShelf(shelf.id)
      }}
    />
  )
}
