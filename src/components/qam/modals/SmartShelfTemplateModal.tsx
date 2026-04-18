import { ConfirmModal, DialogButton, Focusable } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelfMode } from '../../../types'
import { SMART_TPL_ICON } from './templateIcons'

type SmartTemplate = { mode: SmartShelfMode; titleKey: string }

// Ordered by probability of returning results: highest first
export const SMART_TEMPLATES: SmartTemplate[] = [
  { mode: "daily_pick",      titleKey: "smart_template_daily_pick" },
  { mode: "deck_picks",      titleKey: "smart_template_deck_picks" },
  { mode: "on_deck",         titleKey: "smart_template_on_deck" },
  { mode: "recently_played", titleKey: "smart_template_recently_played" },
  { mode: "long_session",    titleKey: "smart_template_long_session" },
  { mode: "random_pick",     titleKey: "smart_template_random_pick" },
  { mode: "not_started",     titleKey: "smart_template_not_started" },
  { mode: "best_unplayed",   titleKey: "smart_template_best_unplayed" },
  { mode: "quick_play",      titleKey: "smart_template_quick_play" },
  { mode: "interrupted",     titleKey: "smart_template_interrupted" },
  { mode: "non_steam",       titleKey: "smart_template_non_steam" },
  { mode: "spare_time",      titleKey: "smart_template_spare_time" },
  { mode: "time_of_day",     titleKey: "smart_template_time_of_day" },
  { mode: "rediscover",      titleKey: "smart_template_rediscover" },
  { mode: "forgotten",       titleKey: "smart_template_forgotten" },
]

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
  const handleTemplate = async (tpl: SmartTemplate) => {
    closeModal?.()
    await actions.addSmartShelf(tpl.mode, t(tpl.titleKey as any))
  }
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
        <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8 }}>
          {SMART_TEMPLATES.map((tpl) => (
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
      </ConfirmModal>
    </div>
  )
}
