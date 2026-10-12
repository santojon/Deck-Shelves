import { useState } from 'react'
import { ConfirmModal, Field, TextField, Focusable } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { ModalShell } from '../../ui'
import { textFromDeckyChange } from './modalUtils'

/* One rename dialog for every renameable entity (saved filter, saved smart
   filter, profile): a title field, Save on OK / Menu, no-op when the name is
   empty or unchanged. `onRename` receives the trimmed new name. */
export function RenameModal({ closeModal, controller, title, currentName, onRename }: {
  closeModal?: () => void
  controller: SettingsController
  title: string
  currentName: string
  onRename: (name: string) => Promise<unknown> | unknown
}) {
  const { t } = controller
  const [name, setName] = useState(currentName)

  const trimmed = name.trim()
  const handleOK = () => {
    if (!trimmed || trimmed === currentName) { closeModal?.(); return }
    closeModal?.()
    void (async () => { await onRename(trimmed) })()
  }

  return (
    <ModalShell>
      <ConfirmModal
        strTitle={title}
        strOKButtonText={t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={handleOK}
      >
        <Focusable onMenuButton={handleOK} onMenuActionDescription={t('save')}>
          <Field label={t('title')}>
            <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
          </Field>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
