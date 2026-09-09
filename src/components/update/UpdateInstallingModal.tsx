import { ConfirmModal, Spinner } from '../../runtime/host/decky'
import { ModalShell } from '../ui'
import i18n from '../../i18n'

/* Blocking progress modal shown while a self-install host (ShelvesHub) downloads
   and swaps the update. Self-install ends by RELOADING the renderer, so without a
   clear indicator the UI just froze on a toast and then restarted abruptly. The
   reload closes this modal; "Close" lets the user dismiss it early (the install
   keeps running regardless). */
export function UpdateInstallingModal({ version, closeModal }: { version?: string; closeModal?: () => void }) {
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={i18n.t('update_installing_title')}
        strOKButtonText={i18n.t('close')}
        onOK={closeModal}
        onCancel={closeModal}
        onEscKeypress={closeModal}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px' }}>
          <Spinner style={{ width: 28, height: 28, flex: '0 0 auto' }} />
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>
            <div>{i18n.t('update_installing', { version: version ?? '' })}</div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{i18n.t('update_will_reload')}</div>
          </div>
        </div>
      </ConfirmModal>
    </ModalShell>
  )
}
