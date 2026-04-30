import React, { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '@decky/ui'
import { ModalShell } from '../../ui'
import { ActionButton } from './ActionButton'

export type ImportEntry = {
  id: string
  label: string
  icon: React.ReactNode
  /** Description used by the gamepad OK overlay and modal title. */
  okDescription: string
  onActivate: () => void
}

/**
 * Action-row button that lists multiple registered import types behind
 * a `[…]` overflow menu when more than one is available; renders the
 * single icon directly when only one is registered (mirrors the legacy
 * one-icon-per-import behavior).
 *
 * Used by both the regular shelves and smart shelves sections in the QAM.
 */
export function ImportMenuButton({
  entries,
  overflowDescription,
}: {
  entries: ImportEntry[]
  /** Label shown on the overflow `[…]` button when 2+ entries collapse. */
  overflowDescription: string
}) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  if (entries.length === 1) {
    const e = entries[0]
    return <ActionButton iconNode={e.icon} onClick={e.onActivate} okDescription={e.okDescription} />
  }

  return (
    <>
      <ActionButton
        iconNode={<MoreDotsIcon />}
        onClick={() => setOpen(true)}
        okDescription={overflowDescription}
      />
      {open && (
        <ModalShell>
          <ConfirmModal
            strTitle={overflowDescription}
            strOKButtonText=''
            onCancel={() => setOpen(false)}
            onEscKeypress={() => setOpen(false)}
          >
            <Focusable style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
              {entries.map((e) => (
                <DialogButton
                  key={e.id}
                  style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start', padding: '8px 12px' }}
                  onClick={() => { setOpen(false); e.onActivate() }}
                  onOKButton={() => { setOpen(false); e.onActivate() }}
                  onOKActionDescription={e.okDescription}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>{e.icon}</span>
                  <span>{e.label}</span>
                </DialogButton>
              ))}
            </Focusable>
          </ConfirmModal>
        </ModalShell>
      )}
    </>
  )
}

function MoreDotsIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
      <circle cx='5' cy='12' r='2' />
      <circle cx='12' cy='12' r='2' />
      <circle cx='19' cy='12' r='2' />
    </svg>
  )
}
