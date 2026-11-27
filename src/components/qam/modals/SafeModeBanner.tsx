import { useEffect, useState } from 'react'
import { DialogButton } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { leaveSafeMode, isSafeModeActive, subscribeSafeMode } from '../../../runtime/safeMode'

export function SafeModeSlot({ controller }: { controller: SettingsController }) {
  const [active, setActive] = useState(() => isSafeModeActive())
  useEffect(() => subscribeSafeMode(() => setActive(isSafeModeActive())), [])
  return active ? <SafeModeBanner controller={controller} /> : null
}

function SafeModeBanner({ controller }: { controller: SettingsController }) {
  const { t } = controller
  return (
    <div style={{ margin: '8px 16px', padding: '12px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--ds-warning, #fbbf24)' }}>{t('safe_mode_title')}</div>
      <div style={{ fontSize: 12, color: 'var(--ds-text-dim, rgba(255,255,255,0.75))', lineHeight: 1.4, marginBottom: 12 }}>{t('safe_mode_desc')}</div>
      <DialogButton style={{ width: '100%', minWidth: 0, padding: '10px 8px' }} onClick={() => leaveSafeMode()} onOKButton={() => leaveSafeMode()}>
        {t('safe_mode_leave')}
      </DialogButton>
    </div>
  )
}
