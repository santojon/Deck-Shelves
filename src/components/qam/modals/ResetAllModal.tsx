import { ConfirmModal } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import { resetMountFailed } from '../../../runtime/homePatch'

export function ResetAllModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller

  return (
    <ConfirmModal
      strTitle={t('reset_all_confirm_title')}
      strDescription={t('reset_all_confirm_desc')}
      strOKButtonText={t('reset_all_confirm_ok')}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={() => {
        closeModal?.();
        (async () => {
          await actions.resetAll();
          resetMountFailed();
        })();
      }}
    />
  )
}
