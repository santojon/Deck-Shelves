import { ConfirmModal, DialogButton, Focusable, showModal } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import { SHELF_TEMPLATES } from '../../../domain/templates'
import { EditShelfModal } from './EditShelfModal'
import { logInfo } from '../../../runtime/logger'
import { SHELF_TPL_ICON } from './templateIcons'

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

const btnStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  fontSize: 13,
  padding: '8px 6px',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: '18px',
}

const btnInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  flexWrap: 'wrap',
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
        <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8 }}>
          <DialogButton style={btnStyle} onClick={handleBlank} onOKButton={handleBlank} onOKActionDescription={t('template_blank')}>
            <span style={btnInner}>{SHELF_TPL_ICON['blank']}<span>{t('template_blank')}</span></span>
          </DialogButton>
          {SHELF_TEMPLATES.map((tpl) => (
            <DialogButton
              key={tpl.id}
              style={btnStyle}
              onClick={() => handleTemplate(tpl)}
              onOKButton={() => handleTemplate(tpl)}
              onOKActionDescription={t(tpl.titleKey as any)}
            >
              <span style={btnInner}>{SHELF_TPL_ICON[tpl.id]}<span>{t(tpl.titleKey as any)}</span></span>
            </DialogButton>
          ))}
        </Focusable>
      </ConfirmModal>
    </div>
  )
}
