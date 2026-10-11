import { useEffect, useState } from 'react'
import { DialogButton } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { leaveSafeMode, isSafeModeActive, subscribeSafeMode } from '../../../runtime/safeMode'

// Self-subscribing slot: renders the banner only while Safe Mode is active.
export function SafeModeSlot({ controller }: { controller: SettingsController }) {
  const [active, setActive] = useState(() => isSafeModeActive())
  useEffect(() => subscribeSafeMode(() => setActive(isSafeModeActive())), [])
  return active ? <SafeModeBanner controller={controller} /> : null
}

/* Shown while automatic Safe Mode is active (Home patches skipped this session
   after repeated incomplete boots). Leaving clears the record; the patches come
   back on the next Steam restart — the banner says so instead of pretending
   it can re-inject live. Same visual frame as the crash banner. */
export function SafeModeBanner({ controller }: { controller: SettingsController }) {
  const { t } = controller
  return (
    <div style={{ margin: '8px 16px', padding: '12px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: 'var(--ds-warning, #fbbf24)' }}>{t('safe_mode_title')}</div>
      <div style={{ fontSize: 12, color: 'var(--ds-text-dim, rgba(255,255,255,0.75))', lineHeight: 1.4, marginBottom: 8 }}>{t('safe_mode_desc')}</div>
      <DialogButton style={{ minWidth: 0, padding: '6px 12px', fontSize: 12 }} onClick={() => leaveSafeMode()} onOKButton={() => leaveSafeMode()}>
        {t('safe_mode_leave')}
      </DialogButton>
    </div>
  )
}
