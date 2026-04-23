import { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable, showModal } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import { SHELF_TEMPLATES } from '../../../domain/templates'
import type { ShelfTemplateCategory } from '../../../domain/templates'
import { EditShelfModal } from './EditShelfModal'
import { logInfo } from '../../../runtime/logger'
import { SHELF_TPL_ICON } from './templateIcons'

const TPL_CATEGORY_ORDER: ShelfTemplateCategory[] = ["status", "time", "platform"]
const TPL_CATEGORY_KEY: Record<ShelfTemplateCategory, string> = {
  status: "template_category_status",
  time: "template_category_time",
  platform: "template_category_platform",
}

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
  const [openCat, setOpenCat] = useState<Record<ShelfTemplateCategory, boolean>>({
    status: true, time: true, platform: true,
  })
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
  const grouped = TPL_CATEGORY_ORDER
    .map((cat) => ({ cat, items: SHELF_TEMPLATES.filter((x) => x.category === cat) }))
    .filter((g) => g.items.length > 0)
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
        <Focusable style={{ padding: 8 }}>
          <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
            <DialogButton style={btnStyle} onClick={handleBlank} onOKButton={handleBlank} onOKActionDescription={t('template_blank')}>
              <span style={btnInner}>{SHELF_TPL_ICON['blank']}<span>{t('template_blank')}</span></span>
            </DialogButton>
          </Focusable>
          {grouped.map(({ cat, items }) => (
            <div key={cat} style={{ marginBottom: 6 }}>
              <Focusable
                onActivate={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
                onOKButton={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
                style={{ padding: '6px 4px', fontSize: 12, opacity: 0.8, cursor: 'pointer' }}
              >
                {openCat[cat] ? '▼' : '▶'} {t(TPL_CATEGORY_KEY[cat] as any)}
              </Focusable>
              {openCat[cat] && (
                <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0' }}>
                  {items.map((tpl) => (
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
              )}
            </div>
          ))}
        </Focusable>
      </ConfirmModal>
    </div>
  )
}
