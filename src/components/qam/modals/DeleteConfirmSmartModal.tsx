import { ConfirmModal, Focusable } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'

export function DeleteConfirmSmartModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: SmartShelf }) {
  const { t, actions } = controller
  const confirm = () => { closeModal?.(); actions.removeSmartShelf(shelf.id) }
  return (
    <ConfirmModal
      strTitle={t('delete_shelf')}
      strOKButtonText={t('delete_shelf')}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={confirm}
    >
      <Focusable onMenuButton={confirm} onMenuActionDescription={t('delete_shelf')}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{shelf.title}</div>
      </Focusable>
    </ConfirmModal>
  )
}
