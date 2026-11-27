import type { ReactNode } from 'react'
import { ConfirmModal, Focusable } from '../../../../runtime/host/decky'
import { ModalShell } from '../../../ui'
import { ModalHeader } from './ModalHeader'

export function EditShelfFrame({ t, heading, title, onTitleChange, previewCount, onSave, onClose, tabs, preview }: {
  t: (...args: any[]) => any
  heading: string
  title: string
  onTitleChange: (next: string) => void
  previewCount: number | null
  onSave: () => void
  onClose?: () => void
  tabs: ReactNode
  preview: ReactNode
}) {
  const saveText = t('save')
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={heading}
        strOKButtonText={saveText}
        onOK={onSave}
        onCancel={onClose}
        onEscKeypress={onClose}
        bAllowFullSize
      >
        <Focusable style={{ paddingBottom: 8 }} onMenuButton={onSave} onMenuActionDescription={saveText}>
          <ModalHeader t={t} title={title} onTitleChange={onTitleChange} previewCount={previewCount} />
          {tabs}
          {preview}
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
