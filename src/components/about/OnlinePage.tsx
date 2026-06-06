import React from 'react'
import { Field } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocCallout } from './DocCallout'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

const sourceRows: [string, string][] = [
  ['source_wishlist', 'docs_online_source_wishlist_desc'],
  ['source_store',    'docs_online_source_store_desc'],
]

const templateRows: [string, string][] = [
  ['template_wishlist',         'docs_online_template_wishlist_desc'],
  ['template_wishlist_on_sale', 'docs_online_template_wishlist_on_sale_desc'],
  ['template_free_wishlist',    'docs_online_template_free_wishlist_desc'],
  ['template_free_now',         'docs_online_template_free_now_desc'],
]

const sortRows: [string, string][] = [
  ['sort_price_low',           'docs_online_sort_price_low_desc'],
  ['sort_discount_high',       'docs_online_sort_discount_high_desc'],
  ['sort_original_price_high', 'docs_online_sort_original_price_high_desc'],
]

export function OnlinePage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_online_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_online_body')}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_enable_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_online_enable_body')}</span>} />
      <DocCallout variant="note">{t('docs_online_privacy_note')}</DocCallout>

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_sources_title')}</span>} />
      {sourceRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_templates_title')}</span>} />
      {templateRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_sorts_title')}</span>} />
      {sortRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_exclude_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_online_exclude_body')}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_discount_badge_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_online_discount_badge_body')}</span>} />

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_online_refresh_title')}</span>} />
      <DocCallout variant="tip">{t('docs_online_refresh_tip')}</DocCallout>
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_online_refresh_body')}</span>} />
    </DocSection>
  )
}
