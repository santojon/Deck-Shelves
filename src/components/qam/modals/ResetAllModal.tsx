import { ConfirmModal } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { resetMountFailed } from '../../../runtime/homePatch'

export type ResetScope = 'all' | 'shelves' | 'smart'

function titleKey(scope: ResetScope): string {
  if (scope === 'shelves') return 'reset_shelves_confirm_title'
  if (scope === 'smart') return 'reset_smart_shelves_confirm_title'
  return 'reset_all_confirm_title'
}
function descKey(scope: ResetScope): string {
  if (scope === 'shelves') return 'reset_shelves_confirm_desc'
  if (scope === 'smart') return 'reset_smart_shelves_confirm_desc'
  return 'reset_all_confirm_desc'
}
function okKey(scope: ResetScope): string {
  if (scope === 'shelves') return 'reset_shelves_confirm_ok'
  if (scope === 'smart') return 'reset_smart_shelves_confirm_ok'
  return 'reset_all_confirm_ok'
}

export function ResetAllModal({ closeModal, controller, scope = 'all' }: { closeModal?: () => void; controller: SettingsController; scope?: ResetScope }) {
  const { t, actions } = controller

  return (
    <ConfirmModal
      strTitle={t(titleKey(scope) as any)}
      strDescription={t(descKey(scope) as any)}
      strOKButtonText={t(okKey(scope) as any)}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={() => {
        closeModal?.();
        (async () => {
          if (scope === 'shelves') {
            await actions.resetShelves();
          } else if (scope === 'smart') {
            await actions.resetSmartShelves();
          } else {
            await actions.resetAll();
            resetMountFailed();
          }
        })();
      }}
    />
  )
}
