import { useState } from 'react'
import { ConfirmModal, Focusable, DialogButton, TextField, openFilePicker } from '../../../runtime/host/decky'
import { notify } from "../../notify";
import { ModalShell } from '../../ui'
import { getCurrentSettings, writeJsonFile } from '../../../settingsStore'
import { pickCategoriesFromSettings } from '../../../features/settings/settingsCategories'
import { categoryIdsForScope } from '../../../features/settings/categoryScope'
import type { SettingsController } from '../../../features/settings/controller'
import { textFromDeckyChange, filenameWithJson, tryPickerCalls } from './modalUtils'

export type ExportScope = 'all' | 'shelves' | 'smart'

async function pickFolder(startPath: string) {
  return await tryPickerCalls([
    async () => openFilePicker(1, startPath, false, true, undefined, undefined, false, false),
    async () => openFilePicker(1, startPath),
  ])
}

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

export function ExportModal({ closeModal, controller, folderPath, scope = 'all' }: { closeModal?: () => void; controller: SettingsController; folderPath: string; scope?: ExportScope }) {
  const { t } = controller
  const [name, setName] = useState(defaultNameFor(scope))
  const [folder, setFolder] = useState(folderPath)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t(titleKeyFor(scope) as any)}
        strDescription={folder}
        strOKButtonText={saveBusy ? t('loading') : t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          setSaveBusy(true);
          (async () => {
            const target = `${folder}/${filenameWithJson(name)}`;
            try {
              let ok = false
              const s = getCurrentSettings();
              if (s) {
                const payload = pickCategoriesFromSettings(s, categoryIdsForScope(scope));
                ok = await writeJsonFile(target, JSON.stringify({ state: payload }, null, 2));
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
        <Focusable>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <div style={{ paddingBottom: '6px' }}>{t('file_name')}</div>
            <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
            <div style={{ paddingTop: '10px' }}>
              <DialogButton
                onClick={async () => {
                  setBrowseBusy(true)
                  try {
                    const picked = await pickFolder(folder)
                    if (picked) setFolder(picked)
                  } catch (error) {
                    notify("error", { body: String(error) })
                  } finally {
                    setBrowseBusy(false)
                  }
                }}
              >{browseBusy ? t('loading') : t('browse')}</DialogButton>
            </div>
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
