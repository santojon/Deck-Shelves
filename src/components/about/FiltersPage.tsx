import React from 'react'
import { Field } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocCallout } from './DocCallout'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

const filterRows: [string, string][] = [
  ['filter_type_favorites',       'docs_filter_favorites_desc'],
  ['filter_type_installed',       'docs_filter_installed_desc'],
  ['filter_type_non_steam',        'docs_filter_nonsteam_desc'],
  ['filter_type_hidden',          'docs_filter_hidden_desc'],
  ['filter_type_update_pending',   'docs_filter_update_pending_desc'],
  ['filter_type_is_new',           'docs_filter_is_new_desc'],
  ['filter_type_deck_compatibility','docs_filter_compat_desc'],
  ['filter_type_name_includes',    'docs_filter_name_includes_desc'],
  ['filter_type_name_regex',       'docs_filter_name_regex_desc'],
  ['filter_type_played_within_days','docs_filter_played_within_desc'],
  ['filter_type_playtime_range',   'docs_filter_playtime_range_desc'],
  ['filter_type_developer',       'docs_filter_developer_desc'],
  ['filter_type_publisher',       'docs_filter_publisher_desc'],
  ['filter_type_app_id_list',       'docs_filter_appidlist_desc'],
  ['filter_type_collection',      'docs_filter_collection_desc'],
  ['filter_type_shortcut_type',    'docs_filter_shortcut_type_desc'],
  ['filter_type_app_status',       'docs_filter_app_status_desc'],
  ['filter_type_cloud_available',  'docs_filter_cloud_available_desc'],
  ['filter_type_controller_support','docs_filter_controller_support_desc'],
  ['filter_type_store_tag',        'docs_filter_store_tag_desc'],
  ['filter_type_friends',         'docs_filter_friends_desc'],
  ['filter_type_friends_playing_now', 'docs_filter_friends_playing_now_desc'],
  ['filter_type_friends_played_recently', 'docs_filter_friends_played_recently_desc'],
  ['filter_type_discount',        'docs_filter_discount_desc'],
  ['filter_type_achievements',    'docs_filter_achievements_desc'],
  ['filter_type_merge',           'docs_filter_merge_desc'],
]

export function FiltersPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_filters_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_filters_intro')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_filters_available_title')}</span>} />
      {filterRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}

      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_filters_groups_title')}</span>} />
      <DocCallout variant="tip">{t('docs_filters_and_or_tip')}</DocCallout>
      <DocCallout variant="tip">{t('docs_filters_invert_tip')}</DocCallout>
      <DocCallout variant="note">{t('docs_filters_pending_note')}</DocCallout>
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_filters_groups_desc')}</span>} />
    </DocSection>
  )
}
