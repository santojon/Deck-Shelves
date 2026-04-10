import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

export function ShelvesPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{t('docs_shelves_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }}>{t('docs_shelves_intro')}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#dcdedf', marginBottom: 8, marginTop: 18 }}>{t('docs_shelves_sources_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 4, paddingLeft: 10 }}>• <b>{t('source_collection')}</b> — {t('docs_shelves_source_collection')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 4, paddingLeft: 10 }}>• <b>{t('source_tab')}</b> — {t('docs_shelves_source_tab')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 4, paddingLeft: 10 }}>• <b>{t('source_filter')}</b> — {t('docs_shelves_source_filter')}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#dcdedf', marginBottom: 8, marginTop: 18 }}>{t('docs_shelves_manage_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }}>{t('docs_shelves_manage_body')}</div>
    </DocSection>
  )
}
