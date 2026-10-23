import { useState } from 'react'
import { ConfirmModal, Field, TextField, Focusable } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { ModalShell } from '../../ui'
import { textFromDeckyChange } from './modalUtils'
import { customTagsFor, setCustomTags } from '../../../runtime/gameLists'

/* Free tags on one game, comma-separated, read by the Custom tags filter.
   Save on OK / Menu; an empty field clears the game's tags. */
export function EditTagsModal({ closeModal, controller, appid, gameName }: {
  closeModal?: () => void
  controller: SettingsController
  appid: number
  gameName: string
}) {
  const { t } = controller
  const [text, setText] = useState(() => customTagsFor(appid).join(', '))

  const handleOK = () => {
    closeModal?.()
    setCustomTags(appid, text.split(','))
  }

  return (
    <ModalShell>
      <ConfirmModal
        strTitle={gameName ? `${t('filter_type_custom_tags')} · ${gameName}` : t('filter_type_custom_tags')}
        strOKButtonText={t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={handleOK}
      >
        <Focusable onMenuButton={handleOK} onMenuActionDescription={t('save')}>
          <Field label={t('filter_type_custom_tags')} description={t('filter_comma_hint')}>
            <TextField value={text} onChange={(value: unknown) => setText(textFromDeckyChange(value))} />
          </Field>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
