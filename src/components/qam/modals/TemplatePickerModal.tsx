import { ConfirmModal, Field, DialogButton } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import { SHELF_TEMPLATES } from '../../../domain/templates'

export function TemplatePickerModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller
  const handleTemplate = async (tpl: typeof SHELF_TEMPLATES[0]) => {
    closeModal?.()
    await actions.addShelfWith(t(tpl.titleKey as any), tpl.source)
  }
  const handleBlank = async () => {
    closeModal?.()
    await actions.addShelf()
  }
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('template_picker_title')}
        strDescription={t('template_picker_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <div style={{ padding: 8 }}>
          {SHELF_TEMPLATES.map((tpl) => (
            <Field key={tpl.id} label={t(tpl.titleKey as any)}>
              <DialogButton
                onClick={() => handleTemplate(tpl)}
                onOKButton={() => handleTemplate(tpl)}
                onOKActionDescription={t('addShelf')}
              >{t('addShelf')}</DialogButton>
            </Field>
          ))}
          <Field label={t('template_blank')}>
            <DialogButton
              onClick={handleBlank}
              onOKButton={handleBlank}
              onOKActionDescription={t('addShelf')}
            >{t('addShelf')}</DialogButton>
          </Field>
        </div>
      </ConfirmModal>
    </div>
  )
}
