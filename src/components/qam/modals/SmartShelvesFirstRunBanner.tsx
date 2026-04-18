import { Focusable, DialogButton } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'

export function SmartShelvesFirstRunBanner({ controller, onAdd }: { controller: SettingsController; onAdd: () => void }) {
  const { t } = controller
  return (
    <div style={{ margin: '8px 16px', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t('smart_first_run_title')}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>{t('smart_first_run_desc')}</div>
      <Focusable style={{ display: 'flex', gap: 8 }}>
        <DialogButton
          onClick={onAdd}
          onOKButton={onAdd}
          onOKActionDescription={t('smart_add_shelf')}
          style={{ flex: 1, minWidth: 0 }}
        >{t('smart_add_shelf')}</DialogButton>
      </Focusable>
    </div>
  )
}
