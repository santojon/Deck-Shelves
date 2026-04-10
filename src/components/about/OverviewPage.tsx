import React from 'react'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }
const subheading: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf', marginBottom: 8, marginTop: 18 }
const body: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }
const listStyle: React.CSSProperties = { ...body, paddingLeft: 10, marginBottom: 4 }

export function OverviewPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <div style={heading}>{t('docs_overview_title')}</div>
      <div style={body}>{t('about_description')}</div>
      <div style={subheading}>{t('about_features_title')}</div>
      {[
        t('about_feature_shelves'),
        t('about_feature_sources'),
        t('about_feature_filters'),
        t('about_feature_advanced_groups'),
        t('about_feature_new_filters'),
        t('about_feature_new_sorts'),
        t('about_feature_api'),
        t('about_feature_unifideck'),
        t('about_feature_first_run'),
        t('about_feature_templates'),
        t('about_feature_refresh'),
        t('about_feature_suspend_resume'),
        t('about_feature_ci_tests'),
        t('about_feature_screenshot_automation'),
        t('about_feature_atomic_settings'),
        t('about_feature_sort'),
        t('about_feature_reorder'),
        t('about_feature_visibility'),
        t('about_feature_import_export'),
        t('about_feature_external_imports'),
        t('about_feature_duplicate'),
        t('about_feature_compat'),
        t('about_feature_playtime'),
        t('about_feature_hide_recents'),
        t('about_feature_dynamic_sizing'),
        t('about_feature_highlight_first'),
        t('about_feature_developer_filter'),
        t('about_feature_mouse_hover'),
        t('about_feature_global_toggles'),
      ].map((f, i) => (
        <div key={i} style={listStyle}>• {f}</div>
      ))}
    </DocSection>
  )
}
