import { ConfirmModal } from '../../../runtime/host/decky'
import { openManagedModal } from '../common/openManagedModal'

/* Generic, parametrized confirmation dialog. Wraps Decky's ConfirmModal so
   any flow that needs a "do X? it'll also do Y" gate can reuse one component
   instead of hand-rolling a modal each time (coupled toggles, mutually
   exclusive modes, …). `onConfirm` fires only on OK. */
export function ConfirmActionModal({
  closeModal,
  title,
  body,
  okText,
  cancelText,
  onConfirm,
  onCancel,
}: {
  closeModal?: () => void;
  title: string;
  body: string;
  okText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <ConfirmModal
      strTitle={title}
      strOKButtonText={okText}
      strCancelButtonText={cancelText}
      onOK={() => { closeModal?.(); onConfirm(); }}
      onCancel={() => { closeModal?.(); onCancel?.(); }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{body}</div>
    </ConfirmModal>
  )
}

export interface ConfirmActionOptions {
  title: string;
  body: string;
  okText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

/** Show the generic confirmation dialog. */
export function confirmAction(opts: ConfirmActionOptions): void {
  openManagedModal((close) => <ConfirmActionModal closeModal={close} {...opts} />)
}
