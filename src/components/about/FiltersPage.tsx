import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

export function FiltersPage() {
  const { t } = useTranslation()
  const filterRows: [string, string][] = [
    ['filter_type_favorites', 'docs_filter_favorites_desc'],
    ['filter_type_installed', 'docs_filter_installed_desc'],
    ['filter_type_nonSteam', 'docs_filter_nonsteam_desc'],
    ['filter_type_hidden', 'docs_filter_hidden_desc'],
    ['filter_type_updatePending', 'docs_filter_update_pending_desc'],
    ['filter_type_deckCompatibility', 'docs_filter_compat_desc'],
    ['filter_type_nameIncludes', 'docs_filter_name_includes_desc'],
    ['filter_type_nameRegex', 'docs_filter_name_regex_desc'],
    ['filter_type_playedWithinDays', 'docs_filter_played_within_desc'],
    ['filter_type_playtimeRange', 'docs_filter_playtime_range_desc'],
    ['filter_type_collection', 'docs_filter_collection_desc'],
    ['filter_type_storeTag', 'docs_filter_store_tag_desc'],
    ['filter_type_friends', 'docs_filter_friends_desc'],
    ['filter_type_achievements', 'docs_filter_achievements_desc'],
    ['filter_type_merge', 'docs_filter_merge_desc'],
  ]
  const sortRows: [string, string][] = [
    ['sort_alpha', 'docs_sort_alpha_desc'],
    ['sort_recent', 'docs_sort_recent_desc'],
    ['sort_added', 'docs_sort_added_desc'],
    ['sort_playtime', 'docs_sort_playtime_desc'],
    ['sort_release_date', 'docs_sort_release_date_desc'],
    ['sort_size_on_disk', 'docs_sort_size_desc'],
    ['sort_metacritic', 'docs_sort_metacritic_desc'],
    ['sort_review_score', 'docs_sort_review_desc'],
  ]
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('docs_filters_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_filters_intro')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_filters_available_title')}</span>} />
      {filterRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_filters_groups_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_filters_groups_desc')}</span>} />
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('docs_filters_sort_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('docs_filters_sort_body')}</span>} />
      {sortRows.map(([k, desc]) => (
        <Field key={k} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• <b>{t(k)}</b> — {t(desc)}</span>} />
      ))}
    </DocSection>
  )
}
