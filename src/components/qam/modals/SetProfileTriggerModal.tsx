import { useState } from 'react'
import { ConfirmModal, Field, Focusable } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { ModalShell } from '../../ui'
import { VisibilityRulesEditor } from './editShelf/VisibilityRulesEditor'

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
    void (async () => { await (controller.actions as any).setProfileTrigger?.(profileId, trigger) })()
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
        <Focusable onMenuButton={handleOK} onMenuActionDescription={t('save')} style={{ paddingBottom: 8 }}>
          <Field description={t('profile_trigger_modal_desc' as any)} bottomSeparator="none" />
          <VisibilityRulesEditor value={trigger} onChange={setTrigger} t={t as any} idPrefix="trig" />
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
