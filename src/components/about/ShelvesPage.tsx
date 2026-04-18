import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

const STANDARD_TEMPLATES = [
  { id: 'blank',           labelKey: 'template_blank',          descKey: 'docs_template_blank' },
  { id: 'favorites',       labelKey: 'template_favorites',      descKey: 'docs_template_favorites' },
  { id: 'recent',          labelKey: 'template_recent',         descKey: 'docs_template_recent' },
  { id: 'installed',       labelKey: 'template_installed',      descKey: 'docs_template_installed' },
  { id: 'most_played',     labelKey: 'template_most_played',    descKey: 'docs_template_most_played' },
  { id: 'recently_added',  labelKey: 'template_recently_added', descKey: 'docs_template_recently_added' },
  { id: 'awaiting_update', labelKey: 'template_awaiting_update', descKey: 'docs_template_awaiting_update' },
  { id: 'non_steam',       labelKey: 'template_non_steam',      descKey: 'docs_template_non_steam' },
  { id: 'long_session',    labelKey: 'template_long_session',   descKey: 'docs_template_long_session' },
] as const

const SMART_TEMPLATES = [
  'docs_smart_template_daily_pick',
  'docs_smart_template_deck_picks',
  'docs_smart_template_on_deck',
  'docs_smart_template_recently_played',
  'docs_smart_template_long_session',
  'docs_smart_template_random_pick',
  'docs_smart_template_not_started',
  'docs_smart_template_best_unplayed',
  'docs_smart_template_quick_play',
  'docs_smart_template_interrupted',
  'docs_smart_template_non_steam',
  'docs_smart_template_time_of_day',
  'docs_smart_template_rediscover',
  'docs_smart_template_forgotten',
  'docs_smart_template_spare_time',
] as const

const SMART_LABELS = [
  'smart_template_daily_pick',
  'smart_template_deck_picks',
  'smart_template_on_deck',
  'smart_template_recently_played',
  'smart_template_long_session',
  'smart_template_random_pick',
  'smart_template_not_started',
  'smart_template_best_unplayed',
  'smart_template_quick_play',
  'smart_template_interrupted',
  'smart_template_non_steam',
  'smart_template_time_of_day',
  'smart_template_rediscover',
  'smart_template_forgotten',
  'smart_template_spare_time',
] as const

export function ShelvesPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_shelves_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_shelves_intro')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_shelves_sources_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t('source_collection')}</b> — {t('docs_shelves_source_collection')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t('source_tab')}</b> — {t('docs_shelves_source_tab')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t('source_filter')}</b> — {t('docs_shelves_source_filter')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_shelves_manage_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_shelves_manage_body')}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_templates_title')}</span>} />
      {STANDARD_TEMPLATES.map((tpl) => (
        <Field key={tpl.id} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(tpl.labelKey as any)}</b> — {t(tpl.descKey as any)}</span>} />
      ))}

      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_smart_shelves_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_shelves_intro')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_shelves_enable')}</span>} />
      {SMART_TEMPLATES.map((descKey, i) => (
        <Field key={descKey} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(SMART_LABELS[i] as any)}</b> — {t(descKey as any)}</span>} />
      ))}
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_surprise_me')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_surprise_me')}</span>} />
    </DocSection>
  )
}
