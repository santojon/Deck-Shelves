import type { SettingsController } from '../../../features/settings/controller'
import { SavedFilterRow } from './SavedFilterRow'
import { SavedSmartFilterRow } from './SavedSmartFilterRow'

export function SavedFiltersList({ controller }: { controller: SettingsController }) {
  const { t, settings } = controller
  const saved = settings?.savedFilters ?? []
  if (saved.length === 0) {
    return <div style={{ padding: '4px 16px', opacity: 0.7 }}>{t('saved_filter_empty')}</div>
  }
  return (
    <div className='deck-shelves-shelf-list'>
      {saved.map((f) => <SavedFilterRow key={f.id} controller={controller} savedFilter={f} />)}
    </div>
  )
}

export function SavedSmartFiltersList({ controller }: { controller: SettingsController }) {
  const { t, settings } = controller
  const saved = settings?.savedSmartFilters ?? []
  if (saved.length === 0) {
    return <div style={{ padding: '4px 16px', opacity: 0.7 }}>{t('saved_smart_filter_empty' as any)}</div>
  }
  return (
    <div className='deck-shelves-shelf-list'>
      {saved.map((f) => <SavedSmartFilterRow key={f.id} controller={controller} savedSmartFilter={f} />)}
    </div>
  )
}
