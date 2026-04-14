import { Focusable, DialogButton, showModal } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import { resetMountFailed } from '../../../runtime/homePatch'
import { ExportAndClearModal } from './ExportAndClearModal'

export function MountCrashBanner({ controller, error, onDismiss }: { controller: SettingsController; error: string | null; onDismiss: () => void }) {
  const { t } = controller
  const openExportAndClear = () => {
    let handle: any = null
    const close = () => {
      try {
        if (typeof handle === 'function') return handle()
        if (handle?.Close) return handle.Close()
        if (handle?.closeModal) return handle.closeModal()
      } catch {}
    }
    handle = showModal(<ExportAndClearModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} />)
  }
  return (
    <div style={{ margin: '8px 0', padding: '12px 16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#f87171' }}>{t('mount_crash_title')}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, marginBottom: 8 }}>{t('mount_crash_banner_desc')}</div>
      {error ? <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8, wordBreak: 'break-word' }}>{error.substring(0, 140)}</div> : null}
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <DialogButton
          onClick={() => { resetMountFailed(); onDismiss(); }}
          onOKButton={() => { resetMountFailed(); onDismiss(); }}
          style={{ width: '100%', minWidth: 0 }}
        >{t('mount_crash_reset')}</DialogButton>
        <DialogButton
          onClick={openExportAndClear}
          onOKButton={openExportAndClear}
          style={{ width: '100%', minWidth: 0 }}
        >{t('mount_crash_export_and_reset')}</DialogButton>
      </Focusable>
    </div>
  )
}
