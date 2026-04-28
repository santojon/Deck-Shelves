import { ConfirmModal } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'

export function DeleteConfirmModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
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
        closeModal?.();
        void actions.removeShelf(shelf.id);
      }}
    />
  )
}
