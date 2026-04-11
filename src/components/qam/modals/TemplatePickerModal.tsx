import { ConfirmModal, Field, DialogButton, showModal } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import { SHELF_TEMPLATES } from '../../../domain/templates'
import { EditShelfModal } from './EditShelfModal'
import { logInfo } from '../../../runtime/logger'

function openManagedModal(render: (close: () => void) => React.ReactElement) {
  let handle: any = null
  const close = () => {
    try {
      if (typeof handle === 'function') return handle()
      if (handle?.Close) return handle.Close()
      if (handle?.closeModal) return handle.closeModal()
      if (handle?.props?.closeModal) return handle.props.closeModal()
    } catch (e) { logInfo("SETTINGS", "modal close failed", String(e)) }
  }
  handle = showModal(render(close))
  return close
}

export function TemplatePickerModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller
  const handleTemplate = async (tpl: typeof SHELF_TEMPLATES[0]) => {
    closeModal?.()
    await actions.addShelfWith(t(tpl.titleKey as any), tpl.source)
  }
  const handleBlank = async () => {
    closeModal?.()
    const shelf = await actions.addShelf()
    if (shelf) {
      // Open edit modal for the newly created shelf
      openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={shelf} />)
    }
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
