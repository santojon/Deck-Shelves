import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
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
  { id: 'steam_cloud',     labelKey: 'template_steam_cloud',    descKey: 'docs_template_steam_cloud' },
  { id: 'deck_verified',   labelKey: 'template_deck_verified',  descKey: 'docs_template_deck_verified' },
  { id: 'top_reviewed',    labelKey: 'template_top_reviewed',   descKey: 'docs_template_top_reviewed' },
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
      <DocCallout variant="tip">{t('docs_shelves_child_filter_tip' as any)}</DocCallout>
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_shelves_display_options_title' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_shelves_display_options_body' as any)}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_shelves_manage_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_shelves_manage_body')}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_templates_title')}</span>} />
      <DocCallout variant="tip">{t('docs_shelves_template_tip')}</DocCallout>
      {STANDARD_TEMPLATES.map((tpl) => (
        <Field key={tpl.id} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(tpl.labelKey as any)}</b> — {t(tpl.descKey as any)}</span>} />
      ))}
    </DocSection>
  )
}
