import { useEffect, useState } from 'react'
import { Focusable, DialogButton } from '../../runtime/host/decky'
import type { SettingsController } from '../settings/controller'
import { listBackups, type BackupEntry } from '../../store/settingsStore'
import { openManagedModal } from '../../components/qam/common/openManagedModal'
import { RestoreSnapshotModal } from '../../components/qam/modals/RestoreSnapshotModal'
import { openSetupWizard } from './SetupWizardEntry'
import { WandIcon } from '../../components/icons'

export function FirstRunBanner({ controller }: { controller: SettingsController }) {
  const { t } = controller
  /* No shelves while snapshots exist means something cleared them (a reset, a
     profile, an import), not day one — a fresh install has none. Offer the
     snapshot picker then, whatever cleared them (a reset also clears the tour
     flag, so that flag cannot tell). */
  const [snaps, setSnaps] = useState<BackupEntry[] | null>(null)
  useEffect(() => {
    let alive = true
    listBackups().then((b) => { if (alive) setSnaps(b) }).catch(() => { if (alive) setSnaps([]) })
    return () => { alive = false }
  }, [])
  const openRecovery = () => openManagedModal((close) => <RestoreSnapshotModal closeModal={close} snapshots={snaps ?? []} />)
  const hasSnapshots = !!snaps?.length
  return (
    <div style={{ margin: '8px 16px', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t('first_run_title')}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
        {hasSnapshots ? t('first_run_desc_maybe_wiped' as any) : t('first_run_desc')}
      </div>
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hasSnapshots && (
          <DialogButton
            onClick={openRecovery}
            onOKButton={openRecovery}
            onOKActionDescription={t('snapshot_recovery_button')}
            style={{ width: '100%', padding: '10px 8px' }}
          >{t('snapshot_recovery_button')} ({snaps!.length})</DialogButton>
        )}
        <DialogButton
          onClick={() => openSetupWizard(controller)}
          onOKButton={() => openSetupWizard(controller)}
          onOKActionDescription={t('setup_wizard_open' as any)}
          style={{ width: '100%', padding: '10px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        ><WandIcon size={14} /> {t('setup_wizard_open' as any)}</DialogButton>
      </Focusable>
    </div>
  )
}
