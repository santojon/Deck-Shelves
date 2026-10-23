import { ConfirmModal, Focusable } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'

/* Destructive confirm shared by the regular and smart shelf delete dialogs:
   the shelf title as the body, Delete on OK / Menu. */
export function DeleteShelfConfirm({ closeModal, controller, title, onConfirm }: { closeModal?: () => void; controller: SettingsController; title: string; onConfirm: () => unknown }) {
  const { t } = controller
  const confirm = () => { closeModal?.(); void onConfirm() }

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
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{title}</div>
      </Focusable>
    </ConfirmModal>
  )
}

export function DeleteConfirmModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  return <DeleteShelfConfirm closeModal={closeModal} controller={controller} title={shelf.title} onConfirm={() => controller.actions.removeShelf(shelf.id)} />
}
