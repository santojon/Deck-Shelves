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
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: '#f87171' }}>{t('recents_replace_error_title')}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, marginBottom: 6 }}>{t('recents_replace_error_desc')}</div>
      {error ? <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 6, wordBreak: 'break-word' }}>{error.substring(0, 140)}</div> : null}
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <DialogButton onClick={dismissAndDisable} onOKButton={dismissAndDisable} style={{ width: '100%', minWidth: 0 }}>{t('recents_replace_error_disable')}</DialogButton>
        <DialogButton onClick={dismiss} onOKButton={dismiss} style={{ width: '100%', minWidth: 0 }}>{t('recents_replace_error_retry')}</DialogButton>
      </Focusable>
    </div>
  )
}
