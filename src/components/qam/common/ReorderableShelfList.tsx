import type { ReactNode } from 'react'
import { ReorderableList, ReorderableEntry } from '@decky/ui'
import { ShelfListLabel } from './ShelfListLabel'

type EntryData = { id: string }

export function ReorderableShelfList<T extends { id: string; title: string; hidden?: boolean }>({
  items,
  emptyText,
  renderActions,
  onReorder,
}: {
  items: T[]
  emptyText: string
  renderActions: (item: T) => ReactNode
  onReorder: (ids: string[]) => void
}) {
  function Interactables({ entry }: { entry: ReorderableEntry<EntryData> }) {
    const item = items.find((s) => s.id === entry.data!.id)
    return item ? <>{renderActions(item)}</> : null
  }

  const entries: ReorderableEntry<EntryData>[] = items.map((item, idx) => ({
    label: <ShelfListLabel shelf={item} />,
    position: idx,
    data: { id: item.id },
  }))

  return (
    <div className='deck-shelves-shelf-list'>
      {entries.length ? (
        <ReorderableList<EntryData>
          entries={entries}
          interactables={Interactables}
          onSave={(next: ReorderableEntry<EntryData>[]) => onReorder(next.map((e) => e.data!.id))}
        />
      ) : (
        <div className='deck-shelves-empty'>{emptyText}</div>
      )}
    </div>
  )
}
