import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

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
    </DocSection>
  )
}
