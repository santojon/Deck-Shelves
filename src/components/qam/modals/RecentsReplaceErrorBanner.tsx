import { Focusable, DialogButton } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { resetRecentsReplaceFailed } from '../../../runtime/recentsReplace'

export function RecentsReplaceErrorBanner({ controller, error, onDismiss }: { controller: SettingsController; error: string | null; onDismiss: () => void }) {
  const { t, actions } = controller
  const dismiss = () => { resetRecentsReplaceFailed(); onDismiss(); }
  const dismissAndDisable = async () => {
    try { await actions.setRecentsReplaceSource(false); } catch {}
    dismiss();
  }
  return (
    <div style={{ margin: '8px 16px', padding: '12px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--ds-danger, #f87171)' }}>{t('recents_replace_error_title')}</div>
      <div style={{ fontSize: 12, color: 'var(--ds-text-dim, rgba(255,255,255,0.75))', lineHeight: 1.4, marginBottom: 12 }}>{t('recents_replace_error_desc')}</div>
      {error ? <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12, wordBreak: 'break-word' }}>{error.substring(0, 140)}</div> : null}
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <DialogButton onClick={dismissAndDisable} onOKButton={dismissAndDisable} style={{ width: '100%', minWidth: 0, padding: '10px 8px' }}>{t('recents_replace_error_disable')}</DialogButton>
        <DialogButton onClick={dismiss} onOKButton={dismiss} style={{ width: '100%', minWidth: 0, padding: '10px 8px' }}>{t('recents_replace_error_retry')}</DialogButton>
      </Focusable>
    </div>
  )
}
