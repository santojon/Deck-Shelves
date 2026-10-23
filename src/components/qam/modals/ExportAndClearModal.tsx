import { useState } from 'react'
import { ConfirmModal } from '../../../runtime/host/decky'
import { notify } from "../../notify";
import { ModalShell } from '../../ui'
import type { SettingsController } from '../../../features/settings/controller'
import { exportSettingsToFile } from '../../../settingsStore'
import { resetMountFailed } from '../../../runtime/homePatch'
import { filenameWithJson } from './modalUtils'
import { ExportFileFields } from './ExportFileFields'

export function ExportAndClearModal({ closeModal, controller, folderPath }: { closeModal?: () => void; controller: SettingsController; folderPath: string }) {
  const { t, actions } = controller
  const [name, setName] = useState('deck-shelves-backup')
  const [folder, setFolder] = useState(folderPath)
  const [saveBusy, setSaveBusy] = useState(false)
  return (
    <ModalShell>
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
          void (async () => {
            const target = `${folder}/${filenameWithJson(name)}`;
            try {
              const ok = await exportSettingsToFile(target);
              if (!ok) {
                notify("error", { body: t('toast_failed_export') });
                setSaveBusy(false);
                return;
              }
              notify("export", { body: t('toast_exported_file') });
              await actions.resetAll();
              resetMountFailed();
              closeModal?.();
            } catch (error) {
              notify("error", { body: String(error) });
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
