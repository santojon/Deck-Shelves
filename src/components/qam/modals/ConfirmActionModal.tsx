import { useState } from 'react'
import { ConfirmModal, ToggleField, Focusable } from '../../../runtime/host/decky'
import { openManagedModal } from '../common/openManagedModal'

/* Generic, parametrized confirmation dialog. Wraps Decky's ConfirmModal so
   any flow that needs a "do X? it'll also do Y" gate can reuse one component
   instead of hand-rolling a modal each time. An optional toggle (e.g. "also
   reset shelves") is surfaced below the body and its value is passed to
   `onConfirm`. `onConfirm` fires only on OK. */
export function ConfirmActionModal({
  closeModal,
  title,
  body,
  okText,
  cancelText,
  onConfirm,
  onCancel,
  toggleLabel,
  toggleDesc,
  toggleDefault = false,
}: {
  closeModal?: () => void;
  title: string;
  body: string;
  okText: string;
  cancelText: string;
  onConfirm: (toggleValue: boolean) => void;
  onCancel?: () => void;
  toggleLabel?: string;
  toggleDesc?: string;
  toggleDefault?: boolean;
}) {
  const [toggle, setToggle] = useState(toggleDefault);
  const confirm = () => { closeModal?.(); onConfirm(toggle); };
  return (
    <ConfirmModal
      strTitle={title}
      strOKButtonText={okText}
      strCancelButtonText={cancelText}
      onOK={confirm}
      onCancel={() => { closeModal?.(); onCancel?.(); }}
    >
      <Focusable onMenuButton={confirm} onMenuActionDescription={okText}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{body}</div>
        {toggleLabel ? (
          <div style={{ marginTop: 10 }}>
            <ToggleField label={toggleLabel} checked={toggle} onChange={(v: boolean) => setToggle(v)} />
            {toggleDesc ? (
              <div style={{ paddingLeft: 16, paddingRight: 8, paddingTop: 2, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{toggleDesc}</div>
            ) : null}
          </div>
        ) : null}
      </Focusable>
    </ConfirmModal>
  )
}

export interface ConfirmActionOptions {
  title: string;
  body: string;
  okText: string;
  cancelText: string;
  onConfirm: (toggleValue: boolean) => void;
  onCancel?: () => void;
  toggleLabel?: string;
  toggleDesc?: string;
  toggleDefault?: boolean;
}

/** Show the generic confirmation dialog. */
export function confirmAction(opts: ConfirmActionOptions): void {
  openManagedModal((close) => <ConfirmActionModal closeModal={close} {...opts} />)
}
