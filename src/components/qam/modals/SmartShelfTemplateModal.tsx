import { ConfirmModal, Field, DialogButton } from '@decky/ui'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelfMode } from '../../../types'

type SmartTemplate = { mode: SmartShelfMode; titleKey: string }

export const SMART_TEMPLATES: SmartTemplate[] = [
  { mode: "quick_play",    titleKey: "smart_template_quick_play" },
  { mode: "not_started",   titleKey: "smart_template_not_started" },
  { mode: "deck_picks",    titleKey: "smart_template_deck_picks" },
  { mode: "rediscover",    titleKey: "smart_template_rediscover" },
  { mode: "best_unplayed", titleKey: "smart_template_best_unplayed" },
  { mode: "interrupted",   titleKey: "smart_template_interrupted" },
  { mode: "time_of_day",   titleKey: "smart_template_time_of_day" },
  { mode: "daily_pick",    titleKey: "smart_template_daily_pick" },
]

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
        <div style={{ padding: 8 }}>
          {SMART_TEMPLATES.map((tpl) => (
            <Field key={tpl.mode} label={t(tpl.titleKey as any)}>
              <DialogButton
                onClick={() => handleTemplate(tpl)}
                onOKButton={() => handleTemplate(tpl)}
                onOKActionDescription={t('smart_add_shelf')}
              >{t('smart_add_shelf')}</DialogButton>
            </Field>
          ))}
        </div>
      </ConfirmModal>
    </div>
  )
}
