import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocAccordion } from './DocAccordion'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }

const GROUPS: { labelKey: string; keys: string[] }[] = [
  {
    labelKey: 'about_group_shelves_filters',
    keys: [
      'about_feature_shelves', 'about_feature_sources', 'about_feature_filters',
      'about_feature_advanced_groups', 'about_feature_smart_shelves', 'about_feature_hide_recents',
    ],
  },
  {
    labelKey: 'about_group_library_options',
    keys: [
      'about_feature_sort', 'about_feature_new_sorts', 'about_feature_new_filters',
      'about_feature_developer_filter', 'about_feature_playtime',
    ],
  },
  {
    labelKey: 'about_group_appearance',
    keys: [
      'about_feature_dynamic_sizing', 'about_feature_highlight_first',
      'about_feature_global_toggles', 'about_feature_mouse_hover',
    ],
  },
  {
    labelKey: 'about_group_management',
    keys: [
      'about_feature_first_run', 'about_feature_templates', 'about_feature_reorder',
      'about_feature_visibility', 'about_feature_import_export', 'about_feature_external_imports',
      'about_feature_duplicate', 'about_feature_compat', 'about_feature_refresh',
      'about_feature_suspend_resume', 'about_feature_atomic_settings', 'about_feature_api',
      'about_feature_unifideck', 'about_feature_ci_tests', 'about_feature_screenshot_automation',
    ],
  },
]

export function OverviewPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_overview_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('about_description')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={labelStyle}>{t('about_features_title')}</span>} />
      {GROUPS.map((group, i) => (
        <DocAccordion key={group.labelKey} label={t(group.labelKey as any)} defaultOpen={i === 0}>
          {group.keys.map((k) => (
            <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• {t(k)}</span>} />
          ))}
        </DocAccordion>
      ))}
    </DocSection>
  )
}
