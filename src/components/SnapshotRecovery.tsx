import { useEffect, useState } from 'react'
import { DialogButton } from '../runtime/host/decky'
import { listBackups, type BackupEntry } from '../store/settingsStore'
import { openManagedModal } from './qam/common/openManagedModal'
import { RestoreSnapshotModal } from './qam/modals/RestoreSnapshotModal'
import { qaForcedSnapshots } from '../qa/harness'
import i18n from '../i18n'

const tr = (k: string, fb: string) => { const v = i18n.t(k); return v && v !== k ? v : fb }

/* Recovery affordance rendered inside the settings ErrorBoundary: if the UI
   crashed but the user has settings snapshots, offer a one-tap "Restore a
   snapshot" → picker. Renders nothing when there are no snapshots. */
export function SnapshotRecovery() {
  const [snaps, setSnaps] = useState<BackupEntry[] | null>(null)
  useEffect(() => {
    const forced = qaForcedSnapshots()
    if (forced) { setSnaps(forced); return }
    let alive = true
    listBackups().then((b) => { if (alive) setSnaps(b) }).catch(() => { if (alive) setSnaps([]) })
    return () => { alive = false }
  }, [])
  if (!snaps || snaps.length === 0) return null
  const open = () => openManagedModal((close) => <RestoreSnapshotModal closeModal={close} snapshots={snaps} />)
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
        {tr('snapshot_recovery_hint', 'You have saved snapshots you can restore to recover.')}
      </div>
      <DialogButton onClick={open} onOKButton={open}>
        {tr('snapshot_recovery_button', 'Restore a snapshot')} ({snaps.length})
      </DialogButton>
    </div>
  )
}
