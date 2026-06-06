import { useState } from 'react'
import { ConfirmModal, Focusable, DialogButton, TextField, toaster, openFilePicker } from '../../../runtime/host/decky'
import { ModalShell } from '../../ui'
import { importSettingsFromFile } from '../../../settingsStore'
import type { SettingsController } from '../../../features/settings/controller'
import { textFromDeckyChange, tryPickerCalls } from './modalUtils'

export type ImportScope = 'all' | 'shelves' | 'smart'

async function pickJsonFile(startPath: string) {
  return await tryPickerCalls([
    async () => openFilePicker(0, startPath, true, true, undefined, ['json'], false, false),
    async () => openFilePicker(0, startPath),
  ])
}

function titleKeyFor(scope: ImportScope): string {
  if (scope === 'shelves') return 'import_shelves'
  if (scope === 'smart') return 'import_smart_shelves'
  return 'import_settings'
}

export function ImportModal({ closeModal, controller, initialPath, scope = 'all' }: { closeModal?: () => void; controller: SettingsController; initialPath: string; scope?: ImportScope }) {
  const { t, actions } = controller
  const [path, setPath] = useState(initialPath)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const title = t(titleKeyFor(scope) as any)
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={title}
        strDescription={path}
        strOKButtonText={importBusy ? t('loading') : title}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          closeModal?.();
          setImportBusy(true);
          (async () => {
            try {
              let ok = false
              if (scope === 'shelves') ok = await actions.importShelves(path)
              else if (scope === 'smart') ok = await actions.importSmartShelves(path)
              else {
                const next = await importSettingsFromFile(path);
                ok = !!next
                if (ok && next.shelves[0]?.id) controller.actions.selectShelf(next.shelves[0].id);
              }
              toaster.toast({ title: t('pluginName'), body: ok ? `${t('toast_imported')}: ${path}` : t('toast_failed_save') });
            } catch (error) {
              toaster.toast({ title: t('pluginName'), body: String(error) });
            } finally {
              setImportBusy(false);
            }
          })();
        }}
      >
        <Focusable>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <div style={{ paddingBottom: '6px' }}>{t('file_name')}</div>
            <TextField value={path} onChange={(value: unknown) => setPath(textFromDeckyChange(value))} />
            <div style={{ paddingTop: '10px' }}>
              <DialogButton
                onClick={async () => {
                  setBrowseBusy(true)
                  try {
                    const picked = await pickJsonFile(initialPath)
                    if (picked) setPath(picked)
                  } catch (error) {
                    toaster.toast({ title: t('pluginName'), body: String(error) })
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
