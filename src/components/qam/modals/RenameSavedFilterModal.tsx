import { useState } from 'react'
import { ConfirmModal, Field, TextField } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { SavedFilter } from '../../../types'
import { ModalShell } from '../../ui'
import { textFromDeckyChange } from './modalUtils'

export function RenameSavedFilterModal({ closeModal, controller, savedFilter }: { closeModal?: () => void; controller: SettingsController; savedFilter: SavedFilter }) {
  const { t, actions } = controller
  const [name, setName] = useState(savedFilter.name)

  const trimmed = name.trim()
  const handleOK = () => {
    if (!trimmed || trimmed === savedFilter.name) { closeModal?.(); return }
    closeModal?.()
    ;(async () => { await actions.renameSavedFilter(savedFilter.id, trimmed) })()
  }

  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t('saved_filter_rename')}
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
