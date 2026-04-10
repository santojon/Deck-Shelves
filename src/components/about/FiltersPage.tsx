import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

export function FiltersPage() {
  const { t } = useTranslation()
  const heading = { fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }
  const subheading = { fontSize: 15, fontWeight: 700, color: '#dcdedf', marginBottom: 8, marginTop: 18 }
  const listStyle = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8, paddingLeft: 10 }
  return (
    <DocSection>
      <div style={heading}>{t('docs_filters_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }}>{t('docs_filters_intro')}</div>

      <div style={subheading}>{t('docs_filters_available_title')}</div>
      <div style={listStyle}>• <b>{t('filter_type_favorites')}</b> — {t('docs_filter_favorites_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_installed')}</b> — {t('docs_filter_installed_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_nonSteam')}</b> — {t('docs_filter_nonsteam_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_hidden')}</b> — {t('docs_filter_hidden_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_updatePending')}</b> — {t('docs_filter_update_pending_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_deckCompatibility')}</b> — {t('docs_filter_compat_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_nameIncludes')}</b> — {t('docs_filter_name_includes_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_nameRegex')}</b> — {t('docs_filter_name_regex_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_playedWithinDays')}</b> — {t('docs_filter_played_within_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_playtimeRange')}</b> — {t('docs_filter_playtime_range_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_collection')}</b> — {t('docs_filter_collection_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_storeTag')}</b> — {t('docs_filter_store_tag_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_friends')}</b> — {t('docs_filter_friends_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_achievements')}</b> — {t('docs_filter_achievements_desc')}</div>
      <div style={listStyle}>• <b>{t('filter_type_merge')}</b> — {t('docs_filter_merge_desc')}</div>

      <div style={subheading}>{t('docs_filters_groups_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }}>{t('docs_filters_groups_desc')}</div>

      <div style={subheading}>{t('docs_filters_sort_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }}>{t('docs_filters_sort_body')}</div>
      <div style={listStyle}>• <b>{t('sort_alpha')}</b> — {t('docs_sort_alpha_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_recent')}</b> — {t('docs_sort_recent_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_added')}</b> — {t('docs_sort_added_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_playtime')}</b> — {t('docs_sort_playtime_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_release_date')}</b> — {t('docs_sort_release_date_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_size_on_disk')}</b> — {t('docs_sort_size_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_metacritic')}</b> — {t('docs_sort_metacritic_desc')}</div>
      <div style={listStyle}>• <b>{t('sort_review_score')}</b> — {t('docs_sort_review_desc')}</div>
    </DocSection>
  )
}
