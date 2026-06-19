import { ConfirmModal, toaster } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { resetMountFailed } from '../../../runtime/homePatch'
import { getCurrentSettings, saveSettings } from '../../../settingsStore'
import { resetCategoriesInSettings } from '../../../features/settings/settingsCategories'
import { categoryIdsForScope } from '../../../features/settings/categoryScope'
import { defaultSettings } from '../../../domain/defaults'

export type ResetScope = 'all' | 'shelves' | 'smart'

function titleKey(scope: ResetScope): string {
  if (scope === 'shelves') return 'reset_shelves_confirm_title'
  if (scope === 'smart') return 'reset_smart_shelves_confirm_title'
  return 'reset_all_confirm_title'
}
function descKey(scope: ResetScope): string {
  if (scope === 'shelves') return 'reset_shelves_confirm_desc'
  if (scope === 'smart') return 'reset_smart_shelves_confirm_desc'
  return 'reset_all_confirm_desc'
}
function okKey(scope: ResetScope): string {
  if (scope === 'shelves') return 'reset_shelves_confirm_ok'
  if (scope === 'smart') return 'reset_smart_shelves_confirm_ok'
  return 'reset_all_confirm_ok'
}

export function ResetAllModal({ closeModal, controller, scope = 'all' }: { closeModal?: () => void; controller: SettingsController; scope?: ResetScope }) {
  const { t } = controller

  return (
    <ConfirmModal
      strTitle={t(titleKey(scope) as any)}
      strDescription={t(descKey(scope) as any)}
      strOKButtonText={t(okKey(scope) as any)}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={() => {
        closeModal?.();
        (async () => {
          const cur = getCurrentSettings();
          if (!cur) return;
          const next = resetCategoriesInSettings(cur, categoryIdsForScope(scope), defaultSettings());
          const ok = await saveSettings(next);
          if (ok) {
            if (scope === 'all') {
              try { resetMountFailed(); } catch {}
            }
            const toastKey = scope === 'shelves' ? 'toast_shelves_reset'
              : scope === 'smart' ? 'toast_smart_shelves_reset'
              : 'toast_settings_reset';
            toaster.toast({ title: t('plugin_name'), body: t(toastKey as any) });
          }
        })();
      }}
    />
  )
}
