import { useState } from 'react'
import { ConfirmModal, Field, TextField } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { ModalShell } from '../../ui'
import { textFromDeckyChange } from './modalUtils'

export function RenameProfileModal({ closeModal, controller, profileId, currentName }: { closeModal?: () => void; controller: SettingsController; profileId: string; currentName: string }) {
  const { t } = controller
  const [name, setName] = useState(currentName)

  const trimmed = name.trim()
  const handleOK = () => {
    if (!trimmed || trimmed === currentName) { closeModal?.(); return }
    closeModal?.()
    ;(async () => { await (controller.actions as any).renameProfile?.(profileId, trimmed) })()
  }

  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t('settings_profiles_rename' as any)}
        strOKButtonText={t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={handleOK}
      >
        <Field label={t('title')}>
          <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
        </Field>
      </ConfirmModal>
    </ModalShell>
  )
}
