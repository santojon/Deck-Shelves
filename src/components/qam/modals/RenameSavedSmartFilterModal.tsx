import { useState } from 'react'
import { ConfirmModal, Field, TextField } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { SavedSmartFilter } from '../../../types'
import { ModalShell } from '../../ui'
import { textFromDeckyChange } from './modalUtils'

export function RenameSavedSmartFilterModal({ closeModal, controller, savedSmartFilter }: { closeModal?: () => void; controller: SettingsController; savedSmartFilter: SavedSmartFilter }) {
  const { t, actions } = controller
  const [name, setName] = useState(savedSmartFilter.name)

  const trimmed = name.trim()
  const handleOK = () => {
    if (!trimmed || trimmed === savedSmartFilter.name) { closeModal?.(); return }
    closeModal?.()
    ;(async () => { await actions.renameSavedSmartFilter(savedSmartFilter.id, trimmed) })()
  }

  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t('saved_smart_filter_rename' as any)}
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
