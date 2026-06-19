import React from 'react'
import { Field } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocAccordion } from './DocAccordion'

const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--ds-text-dim, #b8bcbf)', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--ds-text, #fff)' }

const GROUPS: { labelKey: string; keys: string[] }[] = [
  {
    labelKey: 'about_group_v25_new',
    keys: [
      'about_feature_settings_page',
      'about_feature_profiles',
      'about_feature_button_bindings',
      'about_feature_grip_buttons',
      'about_feature_composite_shelves',
      'about_feature_unified_list',
      'about_feature_drag_reorder',
      'about_feature_light_mode',
      'about_feature_external_launchers',
      'about_feature_integrations_toggle',
      'about_feature_built_in_chip',
      'about_feature_filter_v3',
      'about_feature_sort_v3',
      'about_feature_source_v3',
      'about_feature_asset_refresh',
    ],
  },
  {
    labelKey: 'about_group_shelves_filters',
    keys: [
      'about_feature_shelves', 'about_feature_sources', 'about_feature_filters',
      'about_feature_advanced_groups', 'about_feature_smart_shelves',
      'about_feature_edit_smart', 'about_feature_saved_filters',
      'about_feature_hide_recents',
      'about_feature_online_shelves', 'about_feature_online_cloud_play',
    ],
  },
  {
    labelKey: 'about_group_library_options',
    keys: [
      'about_feature_sort', 'about_feature_new_sorts', 'about_feature_manual_base_sort',
      'about_feature_new_filters',
      'about_feature_developer_filter', 'about_feature_playtime',
    ],
  },
  {
    labelKey: 'about_group_appearance',
    keys: [
      'about_feature_dynamic_sizing', 'about_feature_highlight_first',
      'about_feature_global_toggles', 'about_feature_mouse_hover',
      'about_feature_hero_per_shelf', 'about_feature_hero_global',
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
      {/* Footer block — gives the user something below the last accordion to
          scroll into focus when the Management & System group is expanded.
          Avoids duplicating the Support tab's GitHub / issues / Ko-fi block. */}
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_overview_footer_explore')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_overview_footer_support_hint')}</span>} />
    </DocSection>
  )
}
