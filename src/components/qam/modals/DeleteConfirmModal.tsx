import { ConfirmModal } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'

export function DeleteConfirmModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  const { t, actions } = controller

  return (
    <ConfirmModal
      strTitle={t('delete_shelf')}
      strDescription={shelf.title}
      strOKButtonText={t('delete_shelf')}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={() => {
        closeModal?.();
        void actions.removeShelf(shelf.id);
      }}
    />
  )
}
