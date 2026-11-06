import { useState } from 'react'
import { Focusable, DialogButton, openFilePicker } from '../../../runtime/host/decky'
import { notify } from '../../notify'
import { TitleField } from '../../ui'
import { tryPickerCalls } from './modalUtils'

export async function pickExportFolder(startPath: string): Promise<string> {
  return await tryPickerCalls([
    async () => openFilePicker(1, startPath, false, true, undefined, undefined, false, false),
    async () => openFilePicker(1, startPath),
  ])
}

/* File name + "Browse…" (folder picker) — the body shared by the export
   dialogs. The folder lives in the caller's state so the dialog can show it
   as its description. */
export function ExportFileFields({ t, name, setName, folder, setFolder }: {
  t: (k: any) => string
  name: string
  setName: (v: string) => void
  folder: string
  setFolder: (v: string) => void
}) {
  const [browseBusy, setBrowseBusy] = useState(false)
  return (
    <Focusable>
      <TitleField label={t('file_name')} value={name} onChange={setName} />
      <div style={{ paddingTop: '10px' }}>
        <DialogButton
          onClick={async () => {
            setBrowseBusy(true)
            try {
              const picked = await pickExportFolder(folder)
              if (picked) setFolder(picked)
            } catch (error) {
              notify("error", { body: String(error) })
            } finally {
              setBrowseBusy(false)
            }
          }}
        >{browseBusy ? t('loading') : t('browse')}</DialogButton>
      </div>
    </Focusable>
  )
}
