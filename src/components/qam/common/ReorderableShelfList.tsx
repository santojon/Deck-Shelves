import { useRef, type ReactNode } from 'react'
import { ReorderableList, type ReorderableEntry } from '../../ui/ReorderableList'
import { ShelfListLabel } from './ShelfListLabel'
import { useContainerDragReorder } from '../../../core/reorder'

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
  const listRef = useRef<HTMLDivElement>(null)
  // Pointer-hold drag reorder coexisting with up/down buttons.
  const { grabbedId } = useContainerDragReorder<string>({
    containerRef: listRef,
    itemSelector: '[data-ds-shelf-row]',
    getItemId: (el) => el.getAttribute('data-ds-shelf-row'),
    getOrder: () => items.map((s) => s.id),
    onReorder,
    axis: 'vertical',
    allowedPointerTypes: ['mouse', 'touch'],
  })

  function Interactables({ entry }: { entry: ReorderableEntry<EntryData> }) {
    const item = items.find((s) => s.id === entry.data!.id)
    return item ? <>{renderActions(item)}</> : null
  }

  const entries: ReorderableEntry<EntryData>[] = items.map((item, idx) => ({
    label: (
      <div
        data-ds-shelf-row={item.id}
        style={grabbedId === item.id ? { outline: '2px solid #ffd54f', boxShadow: '0 0 0 3px rgba(255,213,79,0.35)' } : undefined}
      >
        <ShelfListLabel shelf={item} />
      </div>
    ),
    position: idx,
    data: { id: item.id },
  }))

  return (
    <div ref={listRef} className='deck-shelves-shelf-list'>
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
