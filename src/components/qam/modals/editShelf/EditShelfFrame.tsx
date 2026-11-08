import type { ReactNode } from 'react'
import { ConfirmModal, Focusable } from '../../../../runtime/host/decky'
import { ModalShell } from '../../../ui'
import { ModalHeader } from './ModalHeader'

/* The frame both shelf editors share: the confirm modal saving on OK and on the
   Menu button, the title field with the live count, and a fixed-height body with
   the tab strip above the preview panel. */
export function EditShelfFrame({ t, heading, title, onTitleChange, previewCount, onSave, onClose, tabsOverflow, tabs, preview }: {
  t: (...args: any[]) => any
  heading: string
  title: string
  onTitleChange: (next: string) => void
  previewCount: number | null
  onSave: () => void
  onClose?: () => void
  tabsOverflow: 'auto' | 'hidden'
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
          <div style={{ display: 'flex', flexDirection: 'column', height: 'min(calc(100vh - 130px), 540px)', minHeight: 400 }}>
            <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative', overflow: tabsOverflow }}>
              {tabs}
            </div>
            {preview}
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
