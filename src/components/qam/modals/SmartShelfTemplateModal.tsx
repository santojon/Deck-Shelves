import { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '../../../runtime/host/decky'
import { ModalShell } from '../../ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelfMode } from '../../../types'
import { SMART_TPL_ICON } from './templateIcons'
import { EditSmartShelfModal } from './EditSmartShelfModal'
import { openManagedModal } from '../common/openManagedModal'

type SmartTemplateCategory = "status" | "time" | "platform" | "compat" | "other"
type SmartTemplate = { mode: SmartShelfMode; titleKey: string; category: SmartTemplateCategory }

// Ordered by probability of returning results: highest first
export const SMART_TEMPLATES: SmartTemplate[] = [
  { mode: "daily_pick",             titleKey: "smart_template_daily_pick",             category: "time" },
  { mode: "deck_picks",             titleKey: "smart_template_deck_picks",             category: "compat" },
  { mode: "on_deck",                titleKey: "smart_template_on_deck",                category: "status" },
  { mode: "recently_played",        titleKey: "smart_template_recently_played",        category: "time" },
  { mode: "long_session",           titleKey: "smart_template_long_session",           category: "time" },
  { mode: "long_session_night",     titleKey: "smart_template_long_session_night",     category: "time" },
  { mode: "random_pick",            titleKey: "smart_template_random_pick",            category: "other" },
  { mode: "not_started",            titleKey: "smart_template_not_started",            category: "status" },
  { mode: "best_unplayed",          titleKey: "smart_template_best_unplayed",          category: "status" },
  { mode: "quick_play",             titleKey: "smart_template_quick_play",             category: "time" },
  { mode: "short_battery",          titleKey: "smart_template_short_battery",          category: "time" },
  { mode: "interrupted",            titleKey: "smart_template_interrupted",            category: "status" },
  { mode: "non_steam",              titleKey: "smart_template_non_steam",              category: "platform" },
  { mode: "spare_time",             titleKey: "smart_template_spare_time",             category: "time" },
  { mode: "time_of_day",            titleKey: "smart_template_time_of_day",            category: "time" },
  { mode: "rediscover",             titleKey: "smart_template_rediscover",             category: "time" },
  { mode: "forgotten",              titleKey: "smart_template_forgotten",              category: "time" },
  // Heuristic templates — composable curated rows.
  { mode: "backlog_rescue",         titleKey: "smart_template_backlog_rescue",         category: "status" },
  { mode: "forgotten_gems",         titleKey: "smart_template_forgotten_gems",         category: "status" },
  { mode: "hidden_gems",            titleKey: "smart_template_hidden_gems",            category: "status" },
  { mode: "travel_mode",            titleKey: "smart_template_travel_mode",            category: "status" },
  { mode: "never_touched_classics", titleKey: "smart_template_never_touched_classics", category: "time" },
  { mode: "recent_hidden_installs", titleKey: "smart_template_recent_hidden_installs", category: "time" },
  { mode: "weekly_rotation",        titleKey: "smart_template_weekly_rotation",        category: "other" },
  { mode: "monthly_spotlight",      titleKey: "smart_template_monthly_spotlight",      category: "other" },
  { mode: "seasonal_rotation",      titleKey: "smart_template_seasonal_rotation",      category: "other" },
  /* Runtime-aware templates: depend on battery state (low_battery_mode) or
     SteamClient.Apps appDetails (almost_finished / couch_gaming / coop_ready
     / party_games). Best-effort — render empty when the runtime signal isn't
     accessible (older SteamOS, non-Deck environments). */
  { mode: "low_battery_mode",       titleKey: "smart_template_low_battery_mode",       category: "status" },
  { mode: "almost_finished",        titleKey: "smart_template_almost_finished",        category: "status" },
  { mode: "couch_gaming",           titleKey: "smart_template_couch_gaming",           category: "status" },
  { mode: "coop_ready",             titleKey: "smart_template_coop_ready",             category: "status" },
  { mode: "party_games",            titleKey: "smart_template_party_games",            category: "status" },
  // Online-gated template: hidden from the picker when onlineFeaturesEnabled
  // is off (mirrors the requiresOnline pattern in editShelf/constants.ts).
  { mode: "friends_playing",        titleKey: "smart_template_friends_playing",        category: "status" },
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
  const handleTemplate = (tpl: SmartTemplate) => {
    closeModal?.()
    // Modal-driven create: pre-populate the draft from the template, open
    // the editor, persist only on Save. Cancel/close discards the draft.
    const draft = actions.createDraftSmartShelf(tpl.mode, t(tpl.titleKey as any))
    openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={draft} mode='create' />)
  }
  const handleCustom = () => {
    closeModal?.()
    const draft = actions.createDraftSmartShelf("custom" as SmartShelfMode, t('smart_template_custom' as any))
    openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={draft} mode='create' />)
  }
  /* Hide online-gated templates from the picker when onlineFeaturesEnabled
     is off (mirrors the requiresOnline pattern for sort options). The
     resolver also returns empty when offline; this just keeps the picker
     focused on what will actually produce a useful shelf. */
  const onlineEnabled = controller.settings?.onlineFeaturesEnabled === true
  const ONLINE_GATED_MODES: ReadonlySet<string> = new Set(['friends_playing'])
  const visibleTemplates = onlineEnabled
    ? SMART_TEMPLATES
    : SMART_TEMPLATES.filter((tpl) => !ONLINE_GATED_MODES.has(tpl.mode))
  const grouped = SMART_CATEGORY_ORDER
    .map((cat) => ({ cat, items: visibleTemplates.filter((x) => x.category === cat) }))
    .filter((g) => g.items.length > 0)
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t('smart_template_picker_title')}
        strDescription={t('smart_template_picker_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <Focusable style={{ padding: 8 }}>
          <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <DialogButton
              style={btnStyle}
              onClick={handleCustom}
              onOKButton={handleCustom}
              onOKActionDescription={t('smart_template_custom' as any)}
            >
              <span style={btnInner}><span>{t('smart_template_custom' as any)}</span></span>
            </DialogButton>
          </div>
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
    </ModalShell>
  )
}
