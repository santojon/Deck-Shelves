import { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable, showModal } from '@decky/ui'
import { ModalShell } from '../../ui'
import type { SettingsController } from '../../../features/settings/controller'
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES, type ShelfTemplateCategory } from '../../../domain/templates'
import { EditShelfModal } from './EditShelfModal'
import { logInfo } from '../../../runtime/logger'
import { SHELF_TPL_ICON } from './templateIcons'

const TPL_CATEGORY_ORDER: ShelfTemplateCategory[] = ["status", "time", "platform", "online"]
const TPL_CATEGORY_KEY: Record<ShelfTemplateCategory, string> = {
  status: "template_category_status",
  time: "template_category_time",
  platform: "template_category_platform",
  online: "template_category_online",
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
  const { settings } = controller
  const allTemplates = [
    ...SHELF_TEMPLATES,
    ...(settings?.onlineFeaturesEnabled ? ONLINE_SHELF_TEMPLATES : []),
  ]
  const [openCat, setOpenCat] = useState<Record<ShelfTemplateCategory, boolean>>({
    status: true, time: true, platform: true, online: true,
  })
  const handleTemplate = (tpl: typeof SHELF_TEMPLATES[0]) => {
    closeModal?.()
    // Modal-driven create: build a draft pre-populated with the template's
    // source and title, open the editor, persist only on Save. Cancel/close
    // discards the draft.
    const draft = { ...actions.createDraftShelf(), title: t(tpl.titleKey as any), source: tpl.source, ...(tpl.defaultSort ? { sort: tpl.defaultSort } : {}) }
    openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={draft} mode='create' />)
  }
  const handleBlank = () => {
    closeModal?.()
    const draft = actions.createDraftShelf()
    openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={draft} mode='create' />)
  }
  const grouped = TPL_CATEGORY_ORDER
    .map((cat) => ({ cat, items: allTemplates.filter((x) => x.category === cat) }))
    .filter((g) => g.items.length > 0)
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t('template_picker_title')}
        strDescription={t('template_picker_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <Focusable style={{ padding: 8 }}>
          {/* Blank shelf button — visually mirrors the "Custom / Blank"
              button in SmartShelfTemplateModal: full-width row separated
              from the categorised template grid by a thin border. Same
              btnStyle + btnInner so the typography matches; no icon to
              match the smart-side label which is text-only. */}
          <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <DialogButton
              style={btnStyle}
              onClick={handleBlank}
              onOKButton={handleBlank}
              onOKActionDescription={t('template_blank')}
            >
              <span style={btnInner}><span>{t('template_blank')}</span></span>
            </DialogButton>
          </div>
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
    </ModalShell>
  )
}
