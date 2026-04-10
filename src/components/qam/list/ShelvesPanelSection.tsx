import { ReorderableList, ReorderableEntry } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'
import { ShelfListLabel } from '../common/ShelfListLabel'
import { ShelfActionsButton } from './ShelfActions'

type EntryData = { id: string }

export function ShelvesPanelSection({ controller }: { controller: SettingsController }) {
  const { shelves, actions, t } = controller
  function ShelfEntryInteractables({ entry }: { entry: ReorderableEntry<EntryData> }) {
    const shelf = shelves.find((item: Shelf) => item.id === entry.data!.id)
    return shelf ? <ShelfActionsButton controller={controller} shelf={shelf} /> : null
  }
  const entries: ReorderableEntry<EntryData>[] = shelves.map((shelf: Shelf, idx: number) => ({ label: <ShelfListLabel shelf={shelf} />, position: idx, data: { id: shelf.id } }))
  return (
    <div className='deck-shelves-shelf-list'>
      {entries.length ? (
        <ReorderableList<EntryData> entries={entries} interactables={ShelfEntryInteractables} onSave={(nextEntries: ReorderableEntry<EntryData>[]) => actions.reorderShelfIds(nextEntries.map((entry) => entry.data!.id))} />
      ) : (
        <div className='deck-shelves-empty'>{t('noShelves')}</div>
      )}
    </div>
  )
}
