import { useState } from 'react'
import { ConfirmModal, Focusable, DialogButton, TextField, openFilePicker } from '../../../runtime/host/decky'
import { notify } from "../../notify";
import { ModalShell } from '../../ui'
import { createPreImportSnapshot, getCurrentSettings, readJsonFile, saveSettings } from '../../../settingsStore'
import { mergeCategoriesIntoSettings } from '../../../features/settings/settingsCategories'
import { categoryIdsForScope } from '../../../features/settings/categoryScope'
import { findAlternativeImport, readImportFile, type ImportScope } from '../../../features/settings/importFile'
import type { SettingsController } from '../../../features/settings/controller'
import { confirmAction } from './ConfirmActionModal'
import { textFromDeckyChange, tryPickerCalls, splitPath, joinPath } from './modalUtils'
import { ImportFileStatus, useImportRead } from './ImportFileStatus'

export type { ImportScope }

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

// Merges the file's part for this scope, after a safety snapshot of the current settings.
async function applyImport(controller: SettingsController, payload: Record<string, unknown>, scope: ImportScope): Promise<boolean> {
  const cur = getCurrentSettings()
  if (!cur) return false
  await createPreImportSnapshot()
  const next = mergeCategoriesIntoSettings(cur, payload, categoryIdsForScope(scope))
  const ok = await saveSettings(next)
  if (ok && next.shelves?.[0]?.id) controller.actions.selectShelf(next.shelves[0].id)
  return ok
}

const SCOPE_SUFFIX: Record<ImportScope, string> = { shelves: 'shelves', smart: 'smart', all: 'all' }
const fileOf = (path: string) => splitPath(path).base

async function importFrom(controller: SettingsController, path: string, scope: ImportScope): Promise<void> {
  const { t } = controller
  const read = await readImportFile(path, scope, readJsonFile)
  if (read.kind === 'ok') {
    const ok = await applyImport(controller, read.payload, scope)
    notify(ok ? 'import' : 'error', { body: ok ? `${t('toast_imported')}: ${path}` : t('toast_failed_save') })
    return
  }
  const alternative = read.kind === 'not_found' ? await findAlternativeImport(path, scope, readJsonFile) : null
  if (alternative) { offerAlternative(controller, path, alternative, scope); return }
  const key = read.kind === 'empty' ? `import_error_empty_${SCOPE_SUFFIX[scope]}` : `import_error_${read.kind}`
  notify('error', { body: (t as any)(key, { path }) })
}

// The file the user named is not there, but another export in that folder holds what they wanted.
function offerAlternative(controller: SettingsController, missing: string, found: string, scope: ImportScope): void {
  const { t } = controller
  confirmAction({
    title: t(titleKeyFor(scope) as any),
    body: (t as any)(`import_offer_alternative_${SCOPE_SUFFIX[scope]}`, { missing: fileOf(missing), found: fileOf(found) }),
    okText: t(titleKeyFor(scope) as any),
    cancelText: t('cancel'),
    onConfirm: () => { void importFrom(controller, found, scope).catch((error) => notify('error', { body: String(error) })) },
  })
}

async function performImport(controller: SettingsController, path: string, scope: ImportScope, handlerId?: string): Promise<void> {
  if (!handlerId) return importFrom(controller, path, scope)
  const ok = await controller.actions.importViaHandler(handlerId, path, 'merge')
  notify(ok ? 'import' : 'error', { body: ok ? `${controller.t('toast_imported')}: ${path}` : (controller.t as any)('import_error_failed', { path }) })
}

export function ImportModal({ closeModal, controller, initialPath, scope = 'all', handlerId, handlerLabel }: { closeModal?: () => void; controller: SettingsController; initialPath: string; scope?: ImportScope; handlerId?: string; handlerLabel?: string }) {
  const { t } = controller
  const init = splitPath(initialPath)
  const [folder, setFolder] = useState(init.dir)
  const [name, setName] = useState(init.base)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const title = handlerId ? (handlerLabel ?? t('import_settings' as any)) : t(titleKeyFor(scope) as any)
  const read = useImportRead(joinPath(folder, name), scope)
  const browse = async () => {
    setBrowseBusy(true)
    try {
      const picked = await pickJsonFile(joinPath(folder, name))
      if (picked) { const s = splitPath(picked); setFolder(s.dir); setName(s.base) }
    } catch (error) {
      notify("error", { body: String(error) })
    } finally {
      setBrowseBusy(false)
    }
  }
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={title}
        strDescription={folder}
        strOKButtonText={importBusy ? t('loading') : title}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          closeModal?.();
          setImportBusy(true);
          void (async () => {
            const path = joinPath(folder, name);
            try {
              await performImport(controller, path, scope, handlerId);
            } catch (error) {
              notify("error", { body: String(error) });
            } finally {
              setImportBusy(false);
            }
          })();
        }}
      >
        <Focusable>
          <div style={{ padding: '4px 16px 1px', display: 'flex', flexDirection: 'column', gap: 10 }} className='name-field'>
            {/* Picking the file comes first: the name below is only a suggestion. */}
            <DialogButton autoFocus onClick={browse} onOKButton={browse}>{browseBusy ? t('loading') : t('import_choose_file' as any)}</DialogButton>
            <div>
              <div style={{ paddingBottom: '6px' }}>{t('file_name')}</div>
              <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
            </div>
            {handlerId ? null : <ImportFileStatus path={joinPath(folder, name)} read={read} t={t as any} />}
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
