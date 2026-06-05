import React from 'react'
import { Field } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocAccordion } from './DocAccordion'
import { DocCallout } from './DocCallout'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

type SmartEntry = { labelKey: string; descKey: string; sortKey: string }

const SMART_GROUPS: { labelKey: string; items: SmartEntry[] }[] = [
  {
    labelKey: 'docs_smart_group_daily',
    items: [
      { labelKey: 'smart_template_daily_pick',      descKey: 'docs_smart_template_daily_pick',      sortKey: 'docs_smart_sort_daily_pick' },
      { labelKey: 'smart_template_recently_played', descKey: 'docs_smart_template_recently_played', sortKey: 'docs_smart_sort_recently_played' },
      { labelKey: 'smart_template_time_of_day',     descKey: 'docs_smart_template_time_of_day',     sortKey: 'docs_smart_sort_time_of_day' },
      { labelKey: 'smart_template_spare_time',      descKey: 'docs_smart_template_spare_time',      sortKey: 'docs_smart_sort_spare_time' },
    ],
  },
  {
    labelKey: 'docs_smart_group_deck_ready',
    items: [
      { labelKey: 'smart_template_deck_picks',  descKey: 'docs_smart_template_deck_picks',  sortKey: 'docs_smart_sort_deck_picks' },
      { labelKey: 'smart_template_on_deck',     descKey: 'docs_smart_template_on_deck',     sortKey: 'docs_smart_sort_on_deck' },
      { labelKey: 'smart_template_quick_play',  descKey: 'docs_smart_template_quick_play',  sortKey: 'docs_smart_sort_quick_play' },
    ],
  },
  {
    labelKey: 'docs_smart_group_discovery',
    items: [
      { labelKey: 'smart_template_not_started',   descKey: 'docs_smart_template_not_started',   sortKey: 'docs_smart_sort_not_started' },
      { labelKey: 'smart_template_best_unplayed', descKey: 'docs_smart_template_best_unplayed', sortKey: 'docs_smart_sort_best_unplayed' },
      { labelKey: 'smart_template_interrupted',   descKey: 'docs_smart_template_interrupted',   sortKey: 'docs_smart_sort_interrupted' },
      { labelKey: 'smart_template_rediscover',    descKey: 'docs_smart_template_rediscover',    sortKey: 'docs_smart_sort_rediscover' },
      { labelKey: 'smart_template_forgotten',     descKey: 'docs_smart_template_forgotten',     sortKey: 'docs_smart_sort_forgotten' },
    ],
  },
  {
    labelKey: 'docs_smart_group_anything_goes',
    items: [
      { labelKey: 'smart_template_random_pick',  descKey: 'docs_smart_template_random_pick',  sortKey: 'docs_smart_sort_random_pick' },
      { labelKey: 'smart_template_non_steam',    descKey: 'docs_smart_template_non_steam',    sortKey: 'docs_smart_sort_non_steam' },
      { labelKey: 'smart_template_long_session', descKey: 'docs_smart_template_long_session', sortKey: 'docs_smart_sort_long_session' },
      { labelKey: 'smart_template_long_session_night', descKey: 'docs_smart_template_long_session_night', sortKey: 'docs_smart_sort_long_session_night' },
      { labelKey: 'smart_template_short_battery',      descKey: 'docs_smart_template_short_battery',      sortKey: 'docs_smart_sort_short_battery' },
      { labelKey: 'smart_template_travel_mode',        descKey: 'docs_smart_template_travel_mode',        sortKey: 'docs_smart_sort_travel_mode' },
      { labelKey: 'smart_template_low_battery_mode',   descKey: 'docs_smart_template_low_battery_mode',   sortKey: 'docs_smart_sort_low_battery_mode' },
      { labelKey: 'smart_template_custom',       descKey: 'smart_template_custom_desc',       sortKey: 'docs_smart_sort_custom' },
    ],
  },
  {
    labelKey: 'docs_smart_group_heuristic',
    items: [
      { labelKey: 'smart_template_backlog_rescue',         descKey: 'docs_smart_template_backlog_rescue',         sortKey: 'docs_smart_sort_backlog_rescue' },
      { labelKey: 'smart_template_forgotten_gems',         descKey: 'docs_smart_template_forgotten_gems',         sortKey: 'docs_smart_sort_forgotten_gems' },
      { labelKey: 'smart_template_hidden_gems',            descKey: 'docs_smart_template_hidden_gems',            sortKey: 'docs_smart_sort_hidden_gems' },
      { labelKey: 'smart_template_never_touched_classics', descKey: 'docs_smart_template_never_touched_classics', sortKey: 'docs_smart_sort_never_touched_classics' },
      { labelKey: 'smart_template_recent_hidden_installs', descKey: 'docs_smart_template_recent_hidden_installs', sortKey: 'docs_smart_sort_recent_hidden_installs' },
      { labelKey: 'smart_template_almost_finished',        descKey: 'docs_smart_template_almost_finished',        sortKey: 'docs_smart_sort_almost_finished' },
    ],
  },
  {
    labelKey: 'docs_smart_group_social',
    items: [
      { labelKey: 'smart_template_couch_gaming',    descKey: 'docs_smart_template_couch_gaming',    sortKey: 'docs_smart_sort_couch_gaming' },
      { labelKey: 'smart_template_coop_ready',      descKey: 'docs_smart_template_coop_ready',      sortKey: 'docs_smart_sort_coop_ready' },
      { labelKey: 'smart_template_party_games',     descKey: 'docs_smart_template_party_games',     sortKey: 'docs_smart_sort_party_games' },
      { labelKey: 'smart_template_friends_playing', descKey: 'docs_smart_template_friends_playing', sortKey: 'docs_smart_sort_friends_playing' },
    ],
  },
  {
    labelKey: 'docs_smart_group_rotation',
    items: [
      { labelKey: 'smart_template_weekly_rotation',   descKey: 'docs_smart_template_weekly_rotation',   sortKey: 'docs_smart_sort_weekly_rotation' },
      { labelKey: 'smart_template_monthly_spotlight', descKey: 'docs_smart_template_monthly_spotlight', sortKey: 'docs_smart_sort_monthly_spotlight' },
      { labelKey: 'smart_template_seasonal_rotation', descKey: 'docs_smart_template_seasonal_rotation', sortKey: 'docs_smart_sort_seasonal_rotation' },
    ],
  },
]

export function SmartShelvesPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_smart_shelves_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_shelves_intro')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_shelves_enable')}</span>} />
      <DocCallout variant="tip">{t('docs_smart_shelves_hide_tip')}</DocCallout>
      {SMART_GROUPS.map((group) => (
        <DocAccordion key={group.labelKey} label={t(group.labelKey as any)}>
          {group.items.map(({ labelKey, descKey, sortKey }) => (
            <Field key={labelKey} focusable={true} bottomSeparator="none" label={
              <span style={labelStyle}>
                • <b>{t(labelKey as any)}</b> — {t(descKey as any)}
                <span style={{ color: '#8b949e', fontSize: 11 }}> {t(sortKey as any)}</span>
              </span>
            } />
          ))}
        </DocAccordion>
      ))}
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_surprise_me')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_surprise_me')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('edit_tab_smart_filters' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_filters_overview' as any)}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_template_custom' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('smart_template_custom_desc' as any)}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_smart_params_title' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_params_overview' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" label={
        <span style={labelStyle}>• <b>{t('smart_param_min_deck_level' as any)}</b> — {t('docs_smart_param_min_deck_level' as any)}</span>
      } />
      <Field focusable={true} bottomSeparator="none" label={
        <span style={labelStyle}>• <b>{t('smart_param_max_playtime' as any)}</b> / <b>{t('smart_param_min_playtime' as any)}</b> — {t('docs_smart_param_playtime' as any)}</span>
      } />
      <Field focusable={true} bottomSeparator="none" label={
        <span style={labelStyle}>• <b>{t('smart_param_days_ago' as any)}</b> / <b>{t('smart_param_months_ago' as any)}</b> / <b>{t('smart_param_years_ago' as any)}</b> — {t('docs_smart_param_lookback' as any)}</span>
      } />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_refresh_interval' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_refresh_interval' as any)}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_visible_hours_label' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_visibility_window' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_visibility_per_day' as any)}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_visible_days_label' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_visibility_days' as any)}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_allow_day_overrides' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_day_overrides' as any)}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_smart_time_of_day_rotation_title' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_time_of_day_rotation' as any)}</span>} />
    </DocSection>
  )
}
