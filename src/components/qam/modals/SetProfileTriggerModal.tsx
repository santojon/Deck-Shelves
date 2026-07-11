import { useState } from 'react'
import { ConfirmModal, Field } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { ModalShell } from '../../ui'
import { VisibilityRulesEditor } from './editShelf/VisibilityRulesEditor'

/* Edits a profile's Visibility Rules v2 `trigger` predicate — the condition that
   auto-applies the profile (when the master toggle is on). Reuses the same
   VisibilityRulesEditor as shelf visibility. Opened from the settings Profiles
   list and the QAM profile actions menu. Clearing all rules removes the trigger. */
export function SetProfileTriggerModal({ closeModal, controller, profileId, currentTrigger }: {
  closeModal?: () => void
  controller: SettingsController
  profileId: string
  currentTrigger?: any
}) {
  const { t } = controller
  const [trigger, setTrigger] = useState<any>(currentTrigger)

  const handleOK = () => {
    closeModal?.()
    ;(async () => { await (controller.actions as any).setProfileTrigger?.(profileId, trigger) })()
  }

  return (
    <ModalShell>
      <ConfirmModal
        bAllowFullSize
        strTitle={t('profile_trigger_modal_title' as any)}
        strOKButtonText={t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={handleOK}
      >
        <Field description={t('profile_trigger_modal_desc' as any)} bottomSeparator="none" />
        <VisibilityRulesEditor value={trigger} onChange={setTrigger} t={t as any} />
      </ConfirmModal>
    </ModalShell>
  )
}
