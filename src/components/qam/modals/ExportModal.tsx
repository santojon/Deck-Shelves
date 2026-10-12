import { useState } from 'react'
import { ConfirmModal } from '../../../runtime/host/decky'
import { notify } from "../../notify";
import { ModalShell } from '../../ui'
import { getCurrentSettings, writeJsonFile } from '../../../settingsStore'
import { pickCategoriesFromSettings } from '../../../features/settings/settingsCategories'
import { categoryIdsForScope } from '../../../features/settings/categoryScope'
import type { SettingsController } from '../../../features/settings/controller'
import { filenameWithJson } from './modalUtils'
import { ExportFileFields } from './ExportFileFields'

export type ExportScope = 'all' | 'shelves' | 'smart'

function titleKeyFor(scope: ExportScope): string {
  if (scope === 'shelves') return 'export_shelves'
  if (scope === 'smart') return 'export_smart_shelves'
  return 'export_settings'
}

function defaultNameFor(scope: ExportScope): string {
  if (scope === 'shelves') return 'deck-shelves-shelves'
  if (scope === 'smart') return 'deck-shelves-smart-shelves'
  return 'deck-shelves'
}

export function ExportModal({ closeModal, controller, folderPath, scope = 'all', handlerId, handlerLabel, fileExt }: { closeModal?: () => void; controller: SettingsController; folderPath: string; scope?: ExportScope; handlerId?: string; handlerLabel?: string; fileExt?: string }) {
  const { t } = controller
  const [name, setName] = useState(handlerId ? 'deck-shelves' : defaultNameFor(scope))
  const [folder, setFolder] = useState(folderPath)
  const [saveBusy, setSaveBusy] = useState(false)
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={handlerId ? (handlerLabel ?? t('export_settings' as any)) : t(titleKeyFor(scope) as any)}
        strDescription={folder}
        strOKButtonText={saveBusy ? t('loading') : t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          setSaveBusy(true);
          void (async () => {
            const target = handlerId ? `${folder}/${name}.${fileExt || 'json'}` : `${folder}/${filenameWithJson(name)}`;
            try {
              let ok = false
              if (handlerId) {
                ok = await controller.actions.exportViaHandler(handlerId, target);
              } else {
                const s = getCurrentSettings();
                if (s) {
                  const payload = pickCategoriesFromSettings(s, categoryIdsForScope(scope));
                  ok = await writeJsonFile(target, JSON.stringify({ state: payload }, null, 2));
                }
              }
              if (!ok) {
                notify("error", { body: t('toast_failed_export') });
                return;
              }
              notify("export", { body: t('toast_exported_file') });
              closeModal?.();
            } catch (error) {
              notify("error", { body: String(error) });
            } finally {
              setSaveBusy(false);
            }
          })();
        }}
      >
        <ExportFileFields t={t} name={name} setName={setName} folder={folder} setFolder={setFolder} />
      </ConfirmModal>
    </ModalShell>
  )
}
