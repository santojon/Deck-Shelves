import { DialogButton } from '../../../runtime/host/decky'
import { BTN_COMPACT_STYLE } from '../../ui/buttonStyles'
import { confirmAction } from '../modals/ConfirmActionModal'
import { notify } from '../../notify'
import { resetCategoriesInSettings } from '../../../features/settings/settingsCategories'
import { saveSettings, getCurrentSettings } from '../../../settingsStore'
import { defaultSettings } from '../../../domain/defaults'

/* The global slider groups switch between "same on every shelf" (values set)
   and per shelf (all null). Turning a group on writes what its sliders show. */

type T = (k: string) => string
type Values = Record<string, number>

export const LOGO_SIZE_GROUP: Values = { globalLogoSize: 100, globalLogoTopOffset: 20 }
export const DESCRIPTION_SIZE_GROUP: Values = { globalDescriptionScale: 100, globalDescriptionHeight: 2, globalDescriptionLogoGap: 8 }

export function isGroupSet(settings: unknown, group: Values): boolean {
  return Object.keys(group).some((k) => typeof (settings as any)?.[k] === 'number')
}

export function groupPatch(settings: unknown, group: Values, on: boolean): Record<string, number | null> {
  const patch: Record<string, number | null> = {}
  for (const [k, fallback] of Object.entries(group)) {
    const cur = (settings as any)?.[k]
    patch[k] = on ? (typeof cur === 'number' ? cur : fallback) : null
  }
  return patch
}

// Back to defaults: every global toggle off and every global value per shelf.
export function confirmResetGlobalVisual(t: T): void {
  confirmAction({
    title: t('reset_global_visual'),
    body: t('reset_global_visual_body'),
    okText: t('reset_all_confirm_ok'),
    cancelText: t('cancel'),
    onConfirm: () => {
      const cur = getCurrentSettings()
      if (!cur) return
      void saveSettings(resetCategoriesInSettings(cur, ['visual_global'], defaultSettings())).then((ok) => {
        if (ok) notify('reset', { body: t('toast_settings_reset') })
      })
    },
  })
}

export function ResetGlobalVisualButton({ t }: { t: T }) {
  const onClick = () => confirmResetGlobalVisual(t)
  return (
    <div style={{ padding: '8px 16px' }}>
      <DialogButton onClick={onClick} onOKButton={onClick} style={{ ...BTN_COMPACT_STYLE, width: '100%' }}>
        {t('reset_global_visual')}
      </DialogButton>
    </div>
  )
}
