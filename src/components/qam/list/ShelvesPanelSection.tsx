import React from 'react'
import { PanelSection, ReorderableList, ReorderableEntry } from '@decky/ui'
import type { SettingsController } from '../../features/settings/controller'
import { ShelfListLabel } from '../common/ShelfListLabel'
import { ShelfActionsButton } from './ShelfActions'

type EntryData = { id: string }

export function ShelvesPanelSection({ controller }: { controller: SettingsController }) {
  const { shelves, actions, t } = controller
  function ShelfEntryInteractables({ entry }: { entry: ReorderableEntry<EntryData> }) {
    const shelf = shelves.find((item) => item.id === entry.data!.id)
    return shelf ? <ShelfActionsButton controller={controller} shelf={shelf} /> : null
  }
  const entries: ReorderableEntry<EntryData>[] = shelves.map((shelf, idx) => ({ label: <ShelfListLabel shelf={shelf} />, position: idx, data: { id: shelf.id } }))
  return (
    <PanelSection>
      <div className='deck-shelves-separator' />
      {entries.length ? (
        <ReorderableList<EntryData> entries={entries} interactables={ShelfEntryInteractables} onSave={(nextEntries: ReorderableEntry<EntryData>[]) => actions.reorderShelfIds(nextEntries.map((entry) => entry.data!.id))} />
      ) : (
        <div className='deck-shelves-empty'>{t('noShelves')}</div>
      )}
    </PanelSection>
  )
}
