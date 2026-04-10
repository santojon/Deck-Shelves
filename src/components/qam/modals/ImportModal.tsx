import { useState } from 'react'
import { ConfirmModal, Focusable, DialogButton } from '@decky/ui'
import { toaster, openFilePicker } from '@decky/api'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import { importSettingsFromFile } from '../../../settingsStore'
import type { SettingsController } from '../../../features/settings/controller'

function textFromDeckyChange(value: unknown): string {
  if (typeof value === 'string') return value
  const maybe = (value as any)?.target?.value ?? (value as any)?.currentTarget?.value ?? (value as any)?.value ?? value
  return typeof maybe === 'string' ? maybe : ''
}

async function tryPickerCalls(calls: Array<() => Promise<unknown>>): Promise<string> {
  for (const fn of calls) {
    try {
      const maybe = await fn()
      if (typeof maybe === 'string') return maybe
      if (Array.isArray(maybe)) return maybe[0]
    } catch {}
  }
  return ''
}

async function pickJsonFile(startPath: string) {
  return await tryPickerCalls([
    async () => openFilePicker(0, startPath, true, true, undefined, ['json'], false, false),
    async () => openFilePicker(0, startPath),
  ])
}

export function ImportModal({ closeModal, controller, initialPath }: { closeModal?: () => void; controller: SettingsController; initialPath: string }) {
  const { t } = controller
  const [path, setPath] = useState(initialPath)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('import_settings')}
        strDescription={path}
        strOKButtonText={importBusy ? t('loading') : t('import_settings')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          closeModal?.();
          setImportBusy(true);
          (async () => {
            try {
              const next = await importSettingsFromFile(path);
              if (next.shelves[0]?.id) controller.actions.selectShelf(next.shelves[0].id);
              toaster.toast({ title: t('pluginName'), body: next ? `${t('toast_imported')}: ${path}` : t('toast_failed_save') });
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
            <div className='deck-shelves-extra-wide-field deck-shelves-filter-text-field'><input value={path} onChange={(e) => setPath(textFromDeckyChange((e as any).target?.value))} /></div>
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
    </div>
  )
}
