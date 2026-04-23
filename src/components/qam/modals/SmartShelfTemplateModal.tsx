import { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelfMode } from '../../../types'
import { SMART_TPL_ICON } from './templateIcons'

type SmartTemplateCategory = "status" | "time" | "platform" | "compat" | "other"
type SmartTemplate = { mode: SmartShelfMode; titleKey: string; category: SmartTemplateCategory }

// Ordered by probability of returning results: highest first
export const SMART_TEMPLATES: SmartTemplate[] = [
  { mode: "daily_pick",      titleKey: "smart_template_daily_pick",      category: "time" },
  { mode: "deck_picks",      titleKey: "smart_template_deck_picks",      category: "compat" },
  { mode: "on_deck",         titleKey: "smart_template_on_deck",         category: "status" },
  { mode: "recently_played", titleKey: "smart_template_recently_played", category: "time" },
  { mode: "long_session",    titleKey: "smart_template_long_session",    category: "time" },
  { mode: "random_pick",     titleKey: "smart_template_random_pick",     category: "other" },
  { mode: "not_started",     titleKey: "smart_template_not_started",     category: "status" },
  { mode: "best_unplayed",   titleKey: "smart_template_best_unplayed",   category: "status" },
  { mode: "quick_play",      titleKey: "smart_template_quick_play",      category: "time" },
  { mode: "interrupted",     titleKey: "smart_template_interrupted",     category: "status" },
  { mode: "non_steam",       titleKey: "smart_template_non_steam",       category: "platform" },
  { mode: "spare_time",      titleKey: "smart_template_spare_time",      category: "time" },
  { mode: "time_of_day",     titleKey: "smart_template_time_of_day",     category: "time" },
  { mode: "rediscover",      titleKey: "smart_template_rediscover",      category: "time" },
  { mode: "forgotten",       titleKey: "smart_template_forgotten",       category: "time" },
]

const SMART_CATEGORY_ORDER: SmartTemplateCategory[] = ["time", "status", "compat", "platform", "other"]
const SMART_CATEGORY_KEY: Record<SmartTemplateCategory, string> = {
  time: "template_category_time",
  status: "template_category_status",
  compat: "template_category_compat",
  platform: "template_category_platform",
  other: "template_category_other",
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

export function SmartShelfTemplateModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller
  const [openCat, setOpenCat] = useState<Record<SmartTemplateCategory, boolean>>({
    time: true, status: true, compat: true, platform: true, other: true,
  })
  const handleTemplate = async (tpl: SmartTemplate) => {
    closeModal?.()
    await actions.addSmartShelf(tpl.mode, t(tpl.titleKey as any))
  }
  const grouped = SMART_CATEGORY_ORDER
    .map((cat) => ({ cat, items: SMART_TEMPLATES.filter((x) => x.category === cat) }))
    .filter((g) => g.items.length > 0)
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('smart_template_picker_title')}
        strDescription={t('smart_template_picker_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <Focusable style={{ padding: 8 }}>
          {grouped.map(({ cat, items }) => (
            <div key={cat} style={{ marginBottom: 6 }}>
              <Focusable
                onActivate={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
                onOKButton={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
                style={{ padding: '6px 4px', fontSize: 12, opacity: 0.8, cursor: 'pointer' }}
              >
                {openCat[cat] ? '▼' : '▶'} {t(SMART_CATEGORY_KEY[cat] as any)}
              </Focusable>
              {openCat[cat] && (
                <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0' }}>
                  {items.map((tpl) => (
                    <DialogButton
                      key={tpl.mode}
                      style={btnStyle}
                      onClick={() => handleTemplate(tpl)}
                      onOKButton={() => handleTemplate(tpl)}
                      onOKActionDescription={t(tpl.titleKey as any)}
                    >
                      <span style={btnInner}>{SMART_TPL_ICON[tpl.mode]}<span>{t(tpl.titleKey as any)}</span></span>
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
