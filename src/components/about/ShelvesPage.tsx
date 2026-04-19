import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocAccordion } from './DocAccordion'
import { DocCallout } from './DocCallout'

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

type SmartEntry = { labelKey: string; descKey: string }

const SMART_GROUPS: { label: string; items: SmartEntry[] }[] = [
  {
    label: 'Daily',
    items: [
      { labelKey: 'smart_template_daily_pick',      descKey: 'docs_smart_template_daily_pick' },
      { labelKey: 'smart_template_recently_played', descKey: 'docs_smart_template_recently_played' },
      { labelKey: 'smart_template_time_of_day',     descKey: 'docs_smart_template_time_of_day' },
      { labelKey: 'smart_template_spare_time',      descKey: 'docs_smart_template_spare_time' },
    ],
  },
  {
    label: 'Deck Ready',
    items: [
      { labelKey: 'smart_template_deck_picks',  descKey: 'docs_smart_template_deck_picks' },
      { labelKey: 'smart_template_on_deck',     descKey: 'docs_smart_template_on_deck' },
      { labelKey: 'smart_template_quick_play',  descKey: 'docs_smart_template_quick_play' },
    ],
  },
  {
    label: 'Discovery',
    items: [
      { labelKey: 'smart_template_not_started',   descKey: 'docs_smart_template_not_started' },
      { labelKey: 'smart_template_best_unplayed', descKey: 'docs_smart_template_best_unplayed' },
      { labelKey: 'smart_template_interrupted',   descKey: 'docs_smart_template_interrupted' },
      { labelKey: 'smart_template_rediscover',    descKey: 'docs_smart_template_rediscover' },
      { labelKey: 'smart_template_forgotten',     descKey: 'docs_smart_template_forgotten' },
    ],
  },
  {
    label: 'Anything Goes',
    items: [
      { labelKey: 'smart_template_random_pick', descKey: 'docs_smart_template_random_pick' },
      { labelKey: 'smart_template_non_steam',   descKey: 'docs_smart_template_non_steam' },
      { labelKey: 'smart_template_long_session', descKey: 'docs_smart_template_long_session' },
    ],
  },
]

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
      <DocCallout variant="tip">
        {t('docs_shelves_template_tip') || 'All templates produce fully editable shelves — source, sort, limit, and display options can all be changed after creation.'}
      </DocCallout>
      {STANDARD_TEMPLATES.map((tpl) => (
        <Field key={tpl.id} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(tpl.labelKey as any)}</b> — {t(tpl.descKey as any)}</span>} />
      ))}

      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_smart_shelves_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_shelves_intro')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_shelves_enable')}</span>} />
      <DocCallout variant="tip">
        {t('docs_smart_shelves_hide_tip') || 'If a shelf rarely matches your library, prefer hiding it over deleting — it can be re-enabled later without losing its position.'}
      </DocCallout>
      {SMART_GROUPS.map((group) => (
        <DocAccordion key={group.label} label={group.label}>
          {group.items.map(({ labelKey, descKey }) => (
            <Field key={labelKey} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(labelKey as any)}</b> — {t(descKey as any)}</span>} />
          ))}
        </DocAccordion>
      ))}
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('smart_surprise_me')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_smart_surprise_me')}</span>} />
    </DocSection>
  )
}
