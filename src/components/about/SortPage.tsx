import React from 'react'
import { Field } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocCallout } from './DocCallout'

const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--ds-text-dim, #b8bcbf)', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--ds-text, #fff)' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--ds-text, #dcdedf)' }

const sortRows: [string, string][] = [
  ['sort_alpha',        'docs_sort_alpha_desc'],
  ['sort_recent',       'docs_sort_recent_desc'],
  ['sort_added',        'docs_sort_added_desc'],
  ['sort_playtime',     'docs_sort_playtime_desc'],
  ['sort_release_date', 'docs_sort_release_date_desc'],
  ['sort_size_on_disk', 'docs_sort_size_desc'],
  ['sort_metacritic',   'docs_sort_metacritic_desc'],
  ['sort_review_score', 'docs_sort_review_desc'],
]

export function SortPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_sort_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_filters_sort_body')}</span>} />
      {sortRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}
      <DocCallout variant="note">{t('docs_filters_sort_tab_note')}</DocCallout>
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_sort_direction_title')}</span>} />
      <DocCallout variant="tip">{t('docs_sort_direction_tip')}</DocCallout>
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_sort_direction_body')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_sort_multikey_title')}</span>} />
      <DocCallout variant="tip">{t('docs_sort_multikey_tip')}</DocCallout>
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_sort_multikey_body')}</span>} />
    </DocSection>
  )
}
