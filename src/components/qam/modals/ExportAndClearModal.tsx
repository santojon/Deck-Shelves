import { useState } from 'react'
import { ConfirmModal, Focusable, DialogButton, TextField } from '@decky/ui'
import { toaster, openFilePicker } from '@decky/api'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import { exportSettingsToFile } from '../../../settingsStore'
import { resetMountFailed } from '../../../runtime/homePatch'
import { textFromDeckyChange, filenameWithJson, pickerPath } from './modalUtils'

async function pickFolder(startPath: string) {
  for (const fn of [
    async () => openFilePicker(1, startPath, false, true, undefined, undefined, false, false),
    async () => openFilePicker(1, startPath),
  ]) {
    try { const v = pickerPath(await fn()); if (v) return v } catch {}
  }
  return ''
}

export function ExportAndClearModal({ closeModal, controller, folderPath }: { closeModal?: () => void; controller: SettingsController; folderPath: string }) {
  const { t, actions } = controller
  const [name, setName] = useState('deck-shelves-backup')
  const [folder, setFolder] = useState(folderPath)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('mount_crash_export_and_reset')}
        strDescription={folder}
        strOKButtonText={saveBusy ? t('loading') : t('save')}
        strCancelButtonText={t('cancel')}
        bDestructiveWarning
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          setSaveBusy(true);
          (async () => {
            const target = `${folder}/${filenameWithJson(name)}`;
            try {
              const ok = await exportSettingsToFile(target);
              if (!ok) {
                toaster.toast({ title: t('pluginName'), body: t('toast_failed_export') });
                setSaveBusy(false);
                return;
              }
              toaster.toast({ title: t('pluginName'), body: t('toast_exported_file') });
              await actions.resetAll();
              resetMountFailed();
              closeModal?.();
            } catch (error) {
              toaster.toast({ title: t('pluginName'), body: String(error) });
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
    </div>
  )
}
