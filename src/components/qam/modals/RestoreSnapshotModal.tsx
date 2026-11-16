import { ConfirmModal, DialogButton } from '../../../runtime/host/decky'
import { ModalShell } from '../../ui'
import { listBackups, restoreBackup, type BackupEntry } from '../../../store/settingsStore'
import { notifyUser } from '../../../runtime/notify'
import { openManagedModal } from '../common/openManagedModal'
import i18n from '../../../i18n'

// Standalone t: this opens from the error boundary, which has no controller.
const tr = (k: string, fb: string) => { const v = i18n.t(k); return v && v !== k ? v : fb }

export type SnapshotOrigin = 'account-switch' | 'pre-profile' | 'pre-import' | 'manual' | 'import' | 'auto'

export function snapshotOrigin(name: string): SnapshotOrigin {
  for (const tag of ['account-switch', 'pre-profile', 'pre-import', 'manual', 'import'] as const) {
    if (name.includes(`-${tag}`)) return tag
  }
  return 'auto'
}

export function snapshotOriginLabel(name: string): string {
  const origin = snapshotOrigin(name)
  return tr(`snapshot_origin_${origin.replace('-', '_')}`, origin)
}

export function openSnapshotPicker(): void {
  void listBackups().then((snapshots) => {
    if (!snapshots.length) { notifyUser('Deck Shelves', tr('snapshot_none_yet', 'No snapshots yet.'), 'info'); return }
    openManagedModal((close) => <RestoreSnapshotModal closeModal={close} snapshots={snapshots} />)
  }).catch(() => {})
}

export function RestoreSnapshotModal({ closeModal, snapshots }: {
  closeModal?: () => void
  snapshots: BackupEntry[]
}) {
  const restore = (name: string) => {
    closeModal?.()
    void restoreBackup(name).then((next) => {
      if (next) notifyUser('Deck Shelves', tr('snapshot_recovery_restored', 'Snapshot restored — reopen settings'), 'success')
    })
  }
  return (
    <ModalShell>
      <ConfirmModal
        bAllowFullSize
        strTitle={tr('snapshot_recovery_modal_title', 'Restore a snapshot')}
        strOKButtonText={tr('close', 'Close')}
        onOK={closeModal}
        onCancel={closeModal}
        onEscKeypress={closeModal}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          {tr('snapshot_recovery_modal_desc', 'Pick a saved snapshot to restore. Your current settings are backed up first, so this is undoable.')}
        </div>
        {snapshots.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13 }}>{new Date(s.mtime * 1000).toLocaleString()}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>{snapshotOriginLabel(s.name)}</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                {s.summary.shelves} · {s.summary.smartShelves} · {s.summary.profiles} · {s.summary.filters}
              </span>
            </div>
            <DialogButton onClick={() => restore(s.name)} onOKButton={() => restore(s.name)} style={{ minWidth: 96 }}>
              {tr('snapshot_recovery_restore', 'Restore')}
            </DialogButton>
          </div>
        ))}
      </ConfirmModal>
    </ModalShell>
  )
}
